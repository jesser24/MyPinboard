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

    /// Reads the current clipboard. Priority: files (CF_HDROP) > text (CF_UNICODETEXT) > image (registered "PNG", else CF_BITMAP).
    pub fn read_now() -> Snapshot {
        let source = crate::platform::clipboard_owner_app();
        if marked_private() { return Snapshot { data: None, source_app: source, excluded_by_source: true }; }
        let data = if is_format_avail(formats::CF_HDROP) {
            get_clipboard::<Vec<String>, _>(formats::FileList).ok().filter(|v| !v.is_empty()).map(ClipData::Files)
        } else if is_format_avail(formats::CF_UNICODETEXT) {
            get_clipboard::<String, _>(formats::Unicode).ok().map(ClipData::Text)
        } else if let Some(id) = png_fmt().filter(|id| is_format_avail(*id)) {
            get_clipboard::<Vec<u8>, _>(formats::RawData(id)).ok().map(ClipData::Png)
        } else if is_format_avail(formats::CF_BITMAP) || is_format_avail(formats::CF_DIB) || is_format_avail(formats::CF_DIBV5) {
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
                    if let (Some(id), Some(p)) = (png_fmt(), &png_bytes) { formats::RawData(id).write_clipboard(p).map_err(|e| e.to_string())?; }
                    if let Some(b) = &bmp { formats::Bitmap.write_clipboard(b).map_err(|e| e.to_string())?; }
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
