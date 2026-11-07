//! Real Windows integration tests: they touch the actual clipboard and monitor APIs. They are compiled only on Windows and are run by CI
//! (`cargo test --workspace -- --test-threads=1`). A failure here means the native layer does not work on that machine — nothing is skipped silently.
#![cfg(windows)]

use clipboard_win::{formats, register_format, set_clipboard_string, Clipboard, Setter};
use mypinboard_lib::{clipboard, platform};
use pinboard_core::db::Db;
use pinboard_core::ingest::{self, ClipData};
use pinboard_core::model::Kind;
use pinboard_core::settings::Settings;
use std::sync::{mpsc, Mutex};
use std::time::Duration;

/// The clipboard is a single global resource: serialise every test that uses it.
static CLIP: Mutex<()> = Mutex::new(());
fn lock() -> std::sync::MutexGuard<'static, ()> { CLIP.lock().unwrap_or_else(|e| e.into_inner()) }
fn unique(tag: &str) -> String { format!("mypinboard-{tag}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()) }
fn settle() { std::thread::sleep(Duration::from_millis(150)); }

#[test]
fn monitors_are_enumerated_with_work_area_and_dpi() {
    let m = platform::monitors();
    assert!(!m.is_empty(), "no monitor reported");
    assert!(m.iter().any(|x| x.primary), "no primary monitor");
    for x in &m { assert!(x.w > 0 && x.h > 0, "{x:?}"); assert!(x.scale >= 1.0 && x.scale <= 5.0, "{x:?}"); assert!(!x.id.is_empty(), "{x:?}"); }
    eprintln!("monitors: {m:#?}");
}

#[test]
fn text_is_read_from_the_real_clipboard() {
    let _g = lock(); let t = unique("text");
    set_clipboard_string(&t).expect("set clipboard"); settle();
    match clipboard::read_now().data { Some(ClipData::Text(got)) => assert_eq!(got, t), _ => panic!("expected text") }
}

#[test]
fn copied_files_arrive_as_a_hdrop_list() {
    let _g = lock(); let dir = std::env::temp_dir().join(unique("files")); std::fs::create_dir_all(&dir).unwrap();
    let (a, b) = (dir.join("a.pdf"), dir.join("b.txt")); std::fs::write(&a, b"x").unwrap(); std::fs::write(&b, b"y").unwrap();
    let paths = [a.display().to_string(), b.display().to_string()];
    { let _c = Clipboard::new_attempts(10).expect("open"); clipboard_win::empty().unwrap(); formats::FileList.write_clipboard(&paths[..]).expect("write CF_HDROP"); }
    settle();
    match clipboard::read_now().data { Some(ClipData::Files(got)) => { assert_eq!(got.len(), 2); assert!(got.iter().any(|p| p.ends_with("a.pdf"))); assert!(got.iter().any(|p| p.ends_with("b.txt"))); } _ => panic!("expected files") }
    std::fs::remove_dir_all(&dir).ok();
}

fn tiny_png() -> Vec<u8> {
    let img = image::RgbaImage::from_fn(4, 4, |x, y| image::Rgba([(x * 60) as u8, (y * 60) as u8, 200, 255]));
    let mut out = Vec::new(); img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png).unwrap(); out
}

#[test]
fn image_survives_write_then_capture_and_is_not_recaptured_as_ours() {
    let _g = lock(); let imgs = std::env::temp_dir().join(unique("imgs"));
    let mut db = Db::open_memory().unwrap(); let s = Settings::default();
    let stored = ingest::ingest(&mut db, &imgs, ClipData::Png(tiny_png()), None, &s, false, 1).unwrap().expect("stored").item;
    assert_eq!(stored.kind, Kind::Image);
    clipboard::write_item(&stored, &imgs).expect("write image to clipboard"); settle();
    assert!(clipboard::is_self_write(), "our own write must be recognised so it is never re-captured");
    assert!(clipboard_win::is_format_avail(formats::CF_DIB), "image write must publish a standard CF_DIB fallback");
    let dib = clipboard_win::get_clipboard::<Vec<u8>, _>(formats::RawData(formats::CF_DIB)).expect("read CF_DIB fallback");
    assert!(dib.len() > 40, "CF_DIB must contain a BITMAPINFOHEADER and pixel data");
    assert_eq!(u32::from_le_bytes(dib[..4].try_into().unwrap()), 40, "generated CF_DIB should use a 40-byte BITMAPINFOHEADER");
    match clipboard::read_now().data { Some(ClipData::Png(bytes)) => { let img = image::load_from_memory(&bytes).expect("decodes"); assert_eq!((img.width(), img.height()), (4, 4)); } _ => panic!("expected image") }
    set_clipboard_string(&unique("other")).unwrap(); settle();
    assert!(!clipboard::is_self_write(), "a copy made by another program is not ours");
    std::fs::remove_dir_all(&imgs).ok();
}

#[test]
fn text_round_trip_through_write_item() {
    let _g = lock(); let t = unique("rt");
    let mut db = Db::open_memory().unwrap(); let s = Settings::default();
    let item = ingest::ingest(&mut db, &std::env::temp_dir(), ClipData::Text(t.clone()), None, &s, false, 1).unwrap().unwrap().item;
    clipboard::write_item(&item, &std::env::temp_dir()).unwrap(); settle();
    assert!(clipboard::is_self_write());
    assert_eq!(clipboard_win::get_clipboard_string().unwrap(), t);
}

#[test]
fn password_manager_marker_prevents_capture() {
    let _g = lock();
    let id = register_format("ExcludeClipboardContentFromMonitorProcessing").expect("register format").get();
    { let _c = Clipboard::new_attempts(10).unwrap(); clipboard_win::empty().unwrap();
      formats::Unicode.write_clipboard(&"top-secret").unwrap(); formats::RawData(id).write_clipboard(&[1u8, 0, 0, 0]).unwrap(); }
    settle();
    let snap = clipboard::read_now(); assert!(snap.excluded_by_source, "content flagged private must be skipped"); assert!(snap.data.is_none());
}

#[test]
fn listener_wakes_on_clipboard_change_without_polling_and_stops_cleanly() {
    let _g = lock();
    let (tx, rx) = mpsc::channel::<()>();
    let mut l = clipboard::start(move || { let _ = tx.send(()); }).expect("AddClipboardFormatListener");
    std::thread::sleep(Duration::from_millis(300));
    set_clipboard_string(&unique("event")).unwrap();
    rx.recv_timeout(Duration::from_secs(5)).expect("WM_CLIPBOARDUPDATE was not delivered within 5s");
    l.stop(); // must return: joins the thread
}

#[test]
fn full_pipeline_clipboard_to_sqlite_survives_reopen() {
    let _g = lock(); let dir = std::env::temp_dir().join(unique("pipe")); std::fs::create_dir_all(&dir).unwrap(); let dbp = dir.join("pb.db");
    let t = unique("pipeline"); set_clipboard_string(&t).unwrap(); settle();
    {
        let (mut db, _) = Db::open(&dbp).unwrap(); let snap = clipboard::read_now();
        let out = ingest::ingest(&mut db, &dir.join("images"), snap.data.expect("text"), snap.source_app.as_deref(), &Settings::default(), false, 42).unwrap().expect("captured");
        assert!(!out.duplicate); assert_eq!(out.item.content, t);
    }
    let (db, _) = Db::open(&dbp).unwrap(); assert!(db.items().unwrap().iter().any(|i| i.content == t), "item must still be there after reopening the database");
    std::fs::remove_dir_all(&dir).ok();
}
