//! Windows clipboard integration.
//! * Event-driven: `Monitor` owns a message-only window subscribed with AddClipboardFormatListener; the thread sleeps in GetMessage (0% CPU when idle).
//! * Read-only during capture; our own writes are recognised by clipboard sequence number and never re-captured.
//! * Honours the Windows "do not record" markers set by password managers.
use pinboard_core::ingest::ClipData;
use pinboard_core::model::{Item, Kind};
use std::path::Path;

pub struct Snapshot { pub data: Option<ClipData>, pub source_app: Option<String>, pub excluded_by_source: bool }

#[cfg(windows)]
mod imp {
    use super::*;
    use clipboard_win::{formats, get_clipboard, is_format_avail, register_format, seq_num, Clipboard, Monitor, Setter};
    use std::io::Cursor;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{mpsc, OnceLock};
    use std::thread::JoinHandle;

    /// Clipboard sequence number right after *our* last write.
    static SELF_SEQ: AtomicU32 = AtomicU32::new(0);
    pub fn current_seq() -> u32 { seq_num().map(|n| n.get()).unwrap_or(0) }
    pub fn is_self_write() -> bool { let s = SELF_SEQ.load(Ordering::SeqCst); s != 0 && current_seq() == s }

    fn fmt(name: &'static str, cell: &'static OnceLock<Option<u32>>) -> Option<u32> { *cell.get_or_init(|| register_format(name).map(|n| n.get())) }
    fn png_fmt() -> Option<u32> { static C: OnceLock<Option<u32>> = OnceLock::new(); fmt("PNG", &C) }
    fn exclude_fmt() -> Option<u32> { static C: OnceLock<Option<u32>> = OnceLock::new(); fmt("ExcludeClipboardContentFromMonitorProcessing", &C) }
    fn history_fmt() -> Option<u32> { static C: OnceLock<Option<u32>> = OnceLock::new(); fmt("CanIncludeInClipboardHistory", &C) }

    /// True if the source app asked not to be recorded (password managers do).
    fn marked_private() -> bool {
        if exclude_fmt().map(is_format_avail).unwrap_or(false) { return true; }
        if let Some(id) = history_fmt() {
            if is_format_avail(id) { if let Ok(v) = get_clipboard::<Vec<u8>, _>(formats::RawData(id)) { return v.len() >= 4 && v[..4] == [0, 0, 0, 0]; } }
        }
        false
    }

    fn bmp_to_png(bmp: &[u8]) -> Option<Vec<u8>> {
        let img = image::load_from_memory_with_format(bmp, image::ImageFormat::Bmp).ok()?;
        let mut out = Vec::new(); img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png).ok()?; Some(out)
    }

    /// Wraps a CF_DIB/CF_DIBV5 payload in the 14-byte BMP file header expected by
    /// the `image` decoder. A DIB starts at BITMAPINFOHEADER and has no file header.
    fn dib_to_bmp(dib: &[u8]) -> Option<Vec<u8>> {
        if dib.len() < 40 { return None; }
        let u16_at = |offset: usize| -> Option<u16> {
            Some(u16::from_le_bytes(dib.get(offset..offset + 2)?.try_into().ok()?))
        };
        let u32_at = |offset: usize| -> Option<u32> {
            Some(u32::from_le_bytes(dib.get(offset..offset + 4)?.try_into().ok()?))
        };
        let header_size = u32_at(0)? as usize;
        if header_size < 40 || header_size > dib.len() { return None; }
        let bit_count = u16_at(14)?;
        let compression = u32_at(16)?;
        let colors_used = u32_at(32)? as usize;
        // BITMAPINFOHEADER stores BI_BITFIELDS masks after its 40-byte header.
        // V4/V5 headers include those masks in the header itself.
        let masks_size = if header_size == 40 {
            match compression { 3 => 12, 6 => 16, _ => 0 }
        } else { 0 };
        let palette_entries = if bit_count <= 8 {
            if colors_used != 0 { colors_used } else { 1usize << bit_count }
        } else { 0 };
        let pixel_offset = 14usize
            .checked_add(header_size)?
            .checked_add(masks_size)?
            .checked_add(palette_entries.checked_mul(4)?)?;
        if pixel_offset > 14usize.checked_add(dib.len())? { return None; }
        let file_size = 14usize.checked_add(dib.len())?;
        let file_size = u32::try_from(file_size).ok()?;
        let pixel_offset = u32::try_from(pixel_offset).ok()?;
        let mut bmp = Vec::with_capacity(file_size as usize);
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&file_size.to_le_bytes());
        bmp.extend_from_slice(&[0; 4]);
        bmp.extend_from_slice(&pixel_offset.to_le_bytes());
        bmp.extend_from_slice(dib);
        Some(bmp)
    }

    fn dib_to_png(dib: &[u8]) -> Option<Vec<u8>> {
        bmp_to_png(&dib_to_bmp(dib)?)
    }

    /// Reads the current clipboard. Priority: files > text > registered PNG > DIB/DIBV5 > CF_BITMAP.
    pub fn read_now() -> Snapshot {
        let source = crate::platform::clipboard_owner_app();
        if marked_private() { return Snapshot { data: None, source_app: source, excluded_by_source: true }; }
        let data = if is_format_avail(formats::CF_HDROP) {
            get_clipboard::<Vec<String>, _>(formats::FileList).ok().filter(|v| !v.is_empty()).map(ClipData::Files)
        } else if is_format_avail(formats::CF_UNICODETEXT) {
            get_clipboard::<String, _>(formats::Unicode).ok().map(ClipData::Text)
        // Prefer the standard Windows DIB formats over the registered "PNG"
        // clipboard format. Some clipboard providers advertise a registered PNG
        // format but do not expose its payload through GetClipboardData in the
        // same way as ordinary global-memory formats. Falling through to DIB
        // keeps image capture interoperable with native Windows applications.
        } else if is_format_avail(formats::CF_DIBV5) {
            get_clipboard::<Vec<u8>, _>(formats::RawData(formats::CF_DIBV5)).ok().and_then(|b| dib_to_png(&b)).map(ClipData::Png)
        } else if is_format_avail(formats::CF_DIB) {
            get_clipboard::<Vec<u8>, _>(formats::RawData(formats::CF_DIB)).ok().and_then(|b| dib_to_png(&b)).map(ClipData::Png)
        } else if let Some(id) = png_fmt().filter(|id| is_format_avail(*id)) {
            get_clipboard::<Vec<u8>, _>(formats::RawData(id)).ok().map(ClipData::Png)
        } else if is_format_avail(formats::CF_BITMAP) {
            get_clipboard::<Vec<u8>, _>(formats::Bitmap).ok().and_then(|b| bmp_to_png(&b)).map(ClipData::Png)
        } else { None };
        Snapshot { data, source_app: source, excluded_by_source: false }
    }

    /// Puts an item back on the clipboard (user clicked a card). Marks the write so the listener ignores it.
    pub fn write_item(item: &Item, images_dir: &Path) -> Result<(), String> {
        let png_bytes: Option<Vec<u8>> = if item.kind == Kind::Image {
            let name = item.content.strip_prefix(pinboard_core::ingest::IMAGE_PREFIX).ok_or("bad image reference")?;
            if name.contains(['/', '\\']) { return Err("bad image reference".into()); }
            Some(std::fs::read(images_dir.join(name)).map_err(|e| format!("image file missing: {e}"))?)
        } else { None };
        let bmp: Option<Vec<u8>> = match &png_bytes {
            Some(p) => { let img = image::load_from_memory_with_format(p, image::ImageFormat::Png).map_err(|e| e.to_string())?; let mut o = Vec::new();
                img.write_to(&mut Cursor::new(&mut o), image::ImageFormat::Bmp).map_err(|e| e.to_string())?; Some(o) }
            None => None,
        };
        {
            let _guard = Clipboard::new_attempts(10).map_err(|e| format!("clipboard busy: {e}"))?;
            clipboard_win::empty().map_err(|e| e.to_string())?;
            match item.kind {
                Kind::Text | Kind::Url => formats::Unicode.write_clipboard(&item.content).map_err(|e| e.to_string())?,
                Kind::File | Kind::Folder | Kind::Group => { let paths: Vec<&str> = item.content.lines().map(str::trim).filter(|l| !l.is_empty()).collect(); formats::FileList.write_clipboard(&paths[..]).map_err(|e| e.to_string())?; }
                Kind::Image => {
                    if let (Some(id), Some(p)) = (png_fmt(), &png_bytes) {
                        formats::RawData(id).write_clipboard(p).map_err(|e| format!("write PNG clipboard format: {e}"))?;
                    }
                    // Publish the interoperable CF_DIB representation. `formats::Bitmap`
                    // uses CF_BITMAP/HBITMAP and delegates to GDI's CreateDIBitmap; that
                    // path can fail with ERROR_SUCCESS on some Windows runners. CF_DIB is
                    // a movable memory block containing BITMAPINFOHEADER + pixel bytes.
                    if let Some(b) = &bmp {
                        let dib = b.get(14..).ok_or("generated BMP is missing its file header")?;
                        formats::RawData(formats::CF_DIB)
                            .write_clipboard(&dib)
                            .map_err(|e| format!("write CF_DIB clipboard format: {e}"))?;
                    }
                }
            }
        }
        SELF_SEQ.store(current_seq(), Ordering::SeqCst);
        Ok(())
    }

    pub struct Listener { shutdown: Option<clipboard_win::monitor::Shutdown>, join: Option<JoinHandle<()>> }
    impl Listener {
        /// Stops the listener thread and waits for it (graceful shutdown).
        pub fn stop(&mut self) { drop(self.shutdown.take()); if let Some(j) = self.join.take() { let _ = j.join(); } }
    }
    /// Starts the listener thread. `on_change` runs on that thread once per WM_CLIPBOARDUPDATE.
    pub fn start(on_change: impl Fn() + Send + 'static) -> Result<Listener, String> {
        let (tx, rx) = mpsc::channel::<Result<clipboard_win::monitor::Shutdown, String>>();
        let join = std::thread::Builder::new().name("clipboard-listener".into()).spawn(move || {
            let mut mon = match Monitor::new() { Ok(m) => m, Err(e) => { let _ = tx.send(Err(format!("AddClipboardFormatListener failed: {e}"))); return; } };
            let _ = tx.send(Ok(mon.shutdown_channel()));
            loop {
                match mon.recv() { Ok(true) => on_change(), Ok(false) => break, Err(e) => { log::error!("clipboard monitor error: {e}"); break; } }
            }
        }).map_err(|e| e.to_string())?;
        let shutdown = rx.recv().map_err(|e| e.to_string())??;
        Ok(Listener { shutdown: Some(shutdown), join: Some(join) })
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn current_seq() -> u32 { 0 }
    pub fn is_self_write() -> bool { false }
    pub fn read_now() -> Snapshot { Snapshot { data: None, source_app: None, excluded_by_source: false } }
    pub fn write_item(_: &Item, _: &Path) -> Result<(), String> { Err("clipboard access is only implemented on Windows".into()) }
    pub struct Listener;
    impl Listener { pub fn stop(&mut self) {} }
    pub fn start(_: impl Fn() + Send + 'static) -> Result<Listener, String> { Ok(Listener) }
}
pub use imp::*;
