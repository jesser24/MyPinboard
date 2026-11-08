//! Commands exposed to the UI. All run off the main thread (`async`); anything touching files or the clipboard is validated here, never in JS.
use crate::state::{self, st, LockExt};
use crate::{clipboard, shell};
use pinboard_core::ingest::{self, ClipData};
use pinboard_core::model::*;
use pinboard_core::settings::Settings;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

type S<'a> = State<'a, std::sync::Arc<state::AppState>>;
type R<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String { x.to_string() }

/// Files that run code when opened. MyPinboard never launches these; the user can still reveal them in Explorer.
const BLOCKED: &[&str] = &["exe", "dll", "bat", "cmd", "com", "msi", "msp", "scr", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "lnk", "reg", "jar", "cpl", "pif", "sys", "appx", "msix", "application", "gadget", "inf"];
pub fn is_blocked_extension(path: &str) -> bool {
    Path::new(path.trim()).extension().and_then(|x| x.to_str()).map(|x| BLOCKED.contains(&x.to_ascii_lowercase().as_str())).unwrap_or(false)
}
fn first_path(item: &Item) -> Option<String> { item.content.lines().map(str::trim).find(|l| !l.is_empty()).map(str::to_string) }

#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub struct NativeInfo { data_dir: String, images_dir: String, logs_dir: String, backdrop: String, portable: bool, version: &'static str }
#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub struct StorageInfo { data_dir: String, db_bytes: u64, images_bytes: u64, image_count: u64, item_count: i64, portable: bool }

fn dir_size(p: &Path) -> (u64, u64) { let mut t = (0, 0); if let Ok(rd) = std::fs::read_dir(p) { for f in rd.flatten() { if let Ok(m) = f.metadata() { if m.is_file() { t.0 += m.len(); t.1 += 1; } } } } t }

#[tauri::command(async)] pub fn get_settings(app: AppHandle) -> Settings { state::settings(&app) }
#[tauri::command(async)] pub fn get_snapshot(s: S) -> R<Snapshot> { s.db.guard().snapshot().map_err(e) }
#[tauri::command(async)] pub fn upsert_item(s: S, item: Item) -> R<()> { s.db.guard().upsert_item(&item).map_err(e) }
#[tauri::command(async)]
pub fn remove_items(s: S, ids: Vec<String>) -> R<()> {
    let orphans = s.db.guard().remove_items(&ids).map_err(e)?;
    ingest::delete_image_refs(&s.paths.images_dir, &orphans); Ok(())
}
#[tauri::command(async)] pub fn save_collections(s: S, collections: Vec<Collection>) -> R<()> { s.db.guard().save_collections(&collections).map_err(e) }
/// Open (or focus) the separate settings window, optionally at a section.
#[tauri::command] pub fn open_settings(app: AppHandle, section: Option<String>) { shell::show_settings(&app, section); }
#[tauri::command(async)] pub fn save_settings(app: AppHandle, settings: Settings) -> R<Vec<String>> { Ok(state::apply_settings(&app, settings)) }

#[tauri::command(async)]
pub fn restore_snapshot(app: AppHandle, s: S, snapshot: Snapshot) -> R<()> {
    let keep: std::collections::HashSet<&str> = snapshot.items.iter().filter(|i| i.kind == Kind::Image).map(|i| i.content.as_str()).collect();
    let old = s.db.guard().restore(&snapshot).map_err(e)?;
    let orphans: Vec<String> = old.into_iter().filter(|o| !keep.contains(o.as_str())).collect();
    ingest::delete_image_refs(&s.paths.images_dir, &orphans);
    state::apply_settings(&app, snapshot.settings.clone());
    Ok(())
}

pub fn capture_clipboard_now_impl(app: &AppHandle) -> R<Option<CaptureOutcome>> {
    let snap = clipboard::read_now();
    if snap.excluded_by_source { return Err("The source application marked this content as private, so it was not saved.".into()); }
    match snap.data { Some(d) => Ok(state::ingest_and_emit(app, d, snap.source_app, true, "manual")), None => Err("Nothing capturable on the clipboard".into()) }
}
#[tauri::command(async)] pub fn capture_clipboard_now(app: AppHandle) -> R<Option<CaptureOutcome>> { capture_clipboard_now_impl(&app) }

pub fn capture_paths_impl(app: &AppHandle, paths: Vec<String>) -> Option<CaptureOutcome> { state::ingest_and_emit(app, ClipData::Files(paths), None, true, "drop") }
#[tauri::command(async)] pub fn capture_paths(app: AppHandle, paths: Vec<String>) -> R<Option<CaptureOutcome>> { Ok(capture_paths_impl(&app, paths)) }

#[tauri::command(async)] pub fn copy_item(s: S, item: Item) -> R<()> { clipboard::write_item(&item, &s.paths.images_dir) }

#[tauri::command(async)]
pub fn open_item(app: AppHandle, s: S, item: Item) -> R<bool> {
    let o = app.opener();
    match item.kind {
        Kind::Url => {
            let u = item.content.trim(); let u = if u.to_ascii_lowercase().starts_with("www.") { format!("https://{u}") } else { u.to_string() };
            if !(u.starts_with("http://") || u.starts_with("https://")) { return Err("Only http(s) links can be opened".into()); }
            o.open_url(u, None::<&str>).map_err(e)?; Ok(true)
        }
        Kind::File | Kind::Folder | Kind::Group => {
            let p = first_path(&item).ok_or("empty reference")?;
            if !Path::new(&p).exists() { return Err(format!("Not found: {p} (moved, deleted or drive disconnected)")); }
            if item.kind == Kind::Group { o.reveal_item_in_dir(&p).map_err(e)?; return Ok(true); }
            if item.kind == Kind::File && is_blocked_extension(&p) { return Err("Executable and script files are never opened from MyPinboard. Use “Show in folder”.".into()); }
            o.open_path(p, None::<&str>).map_err(e)?; Ok(true)
        }
        Kind::Image => {
            let name = item.content.strip_prefix(ingest::IMAGE_PREFIX).filter(|n| !n.contains(['/', '\\'])).ok_or("bad image reference")?;
            o.open_path(s.paths.images_dir.join(name).display().to_string(), None::<&str>).map_err(e)?; Ok(true)
        }
        Kind::Text => Ok(false),
    }
}
#[tauri::command(async)]
pub fn reveal_item(app: AppHandle, item: Item) -> R<bool> {
    if !matches!(item.kind, Kind::File | Kind::Folder | Kind::Group) { return Ok(false); }
    let p = first_path(&item).ok_or("empty reference")?;
    if !Path::new(&p).exists() { return Err(format!("Not found: {p}")); }
    app.opener().reveal_item_in_dir(&p).map_err(e)?; Ok(true)
}

#[tauri::command(async)]
pub fn native_info(s: S) -> NativeInfo {
    NativeInfo { data_dir: s.paths.data_dir.display().to_string(), images_dir: s.paths.images_dir.display().to_string(), logs_dir: s.paths.logs_dir.display().to_string(),
        backdrop: s.backdrop.guard().clone(), portable: s.paths.portable, version: env!("CARGO_PKG_VERSION") }
}
#[tauri::command(async)]
pub fn storage_info(s: S) -> R<StorageInfo> {
    let db_bytes: u64 = ["", "-wal", "-shm"].iter().filter_map(|x| std::fs::metadata(format!("{}{x}", s.paths.db_path.display())).ok()).map(|m| m.len()).sum();
    let (images_bytes, image_count) = dir_size(&s.paths.images_dir);
    Ok(StorageInfo { data_dir: s.paths.data_dir.display().to_string(), db_bytes, images_bytes, image_count, item_count: s.db.guard().item_count().map_err(e)?, portable: s.paths.portable })
}
pub fn open_data_dir_impl(app: &AppHandle) -> R<()> { let d = st(app).paths.data_dir.display().to_string(); std::fs::create_dir_all(&d).map_err(e)?; app.opener().open_path(d, None::<&str>).map_err(e) }
#[tauri::command(async)] pub fn open_data_dir(app: AppHandle) -> R<()> { open_data_dir_impl(&app) }

#[tauri::command(async)] pub fn board_ready(app: AppHandle) { shell::board_ready(&app); }
#[tauri::command(async)] pub fn hide_board(app: AppHandle) { shell::hide_board(&app); }
#[tauri::command(async)] pub fn toggle_board(app: AppHandle) { shell::toggle_board(&app); }
#[tauri::command(async)] pub fn begin_handle_drag(app: AppHandle) { shell::begin_handle_drag(&app); }
#[tauri::command(async)] pub fn begin_board_drag(app: AppHandle) { shell::begin_board_drag(&app); }
#[tauri::command(async)] pub fn current_edge(app: AppHandle) -> pinboard_core::geometry::Edge { shell::current_placement(&app).0.edge }
#[tauri::command(async)] pub fn quit_app(app: AppHandle) { state::shutdown(&app); }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn executables_and_scripts_are_blocked() {
        for p in ["C:\\x\\setup.EXE", "a.dll", "run.bat", "do.ps1", "x.vbs", "evil.lnk", "page.hta", "a.msi", "c:\\t\\s.JS"] { assert!(is_blocked_extension(p), "{p}"); }
        for p in ["report.pdf", "notes.md", "archive.zip", "photo.jpg", "noext", "C:\\dir.exe\\file.txt"] { assert!(!is_blocked_extension(p), "{p}"); }
    }
}
