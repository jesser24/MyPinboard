use crate::{hotkeys, paths::DataPaths, shell, tray};
use pinboard_core::db::Db;
use pinboard_core::geometry::Placement;
use pinboard_core::ingest::{self, ClipData};
use pinboard_core::model::CaptureOutcome;
use pinboard_core::settings::Settings;
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_notification::NotificationExt as _;

pub struct AppState {
    pub paths: DataPaths,
    pub db: Mutex<Db>,
    pub settings: RwLock<Settings>,
    pub placement: Mutex<Placement>,
    pub backdrop: Mutex<String>,
    pub hotkeys: Mutex<HashMap<u32, String>>,
    pub clipboard: Mutex<Option<crate::clipboard::Listener>>,
    pub board_open: AtomicBool,
    pub board_pending: AtomicBool,
    pub pending_focus: AtomicBool,
    pub dragging_handle: AtomicBool,
    pub dragging_board: AtomicBool,
    pub files_dragging: AtomicBool,
    pub drag_gen: AtomicU64,
    pub idle_gen: AtomicU64,
    pub close_gen: AtomicU64,
    pub display_gen: AtomicU64,
}

pub trait LockExt<T> { fn guard(&self) -> MutexGuard<'_, T>; }
impl<T> LockExt<T> for Mutex<T> { fn guard(&self) -> MutexGuard<'_, T> { self.lock().unwrap_or_else(|e| e.into_inner()) } }

pub fn st(app: &AppHandle) -> Arc<AppState> { app.state::<Arc<AppState>>().inner().clone() }
pub fn now_ms() -> i64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0) }
pub fn settings(app: &AppHandle) -> Settings { st(app).settings.read().unwrap_or_else(|e| e.into_inner()).clone() }

pub fn notify(app: &AppHandle, body: &str) {
    if settings(app).notifications { let _ = app.notification().builder().title("MyPinboard").body(body).show(); }
}

/// Run a capture through the core, clean up orphaned images and tell the UI. Returns the outcome if something was stored/bumped.
pub fn ingest_and_emit(app: &AppHandle, data: ClipData, source: Option<String>, manual: bool, origin: &str) -> Option<CaptureOutcome> {
    let state = st(app);
    let s = settings(app);
    let res = { let mut db = state.db.guard(); ingest::ingest(&mut db, &state.paths.images_dir, data, source.as_deref(), &s, manual, now_ms()) };
    match res {
        Ok(Some(o)) => {
            if !o.orphaned_images.is_empty() { ingest::delete_image_refs(&state.paths.images_dir, &o.orphaned_images); }
            let _ = app.emit("items-changed", json!({ "id": o.item.id, "duplicate": o.duplicate, "origin": origin }));
            Some(o)
        }
        Ok(None) => None,
        Err(e) => { log::error!("capture failed: {e}"); None }
    }
}

pub fn load_placement(db: &Db, s: &Settings) -> Placement {
    db.kv_get("placement").ok().flatten().and_then(|j| serde_json::from_str::<Placement>(&j).ok())
        .unwrap_or_else(|| Placement { monitor: String::new(), edge: s.edge, offset: s.offset })
}

pub fn save_placement(app: &AppHandle, p: &Placement) {
    let state = st(app);
    *state.placement.guard() = p.clone();
    let mut s = settings(app); s.edge = p.edge; s.offset = p.offset;
    { let mut db = state.db.guard(); let _ = db.kv_set("placement", &serde_json::to_string(p).unwrap_or_default()); if let Ok(saved) = db.save_settings(&s) { *state.settings.write().unwrap_or_else(|e| e.into_inner()) = saved; } }
    let _ = app.emit("settings-changed", settings(app));
}

pub fn set_capture_enabled(app: &AppHandle, enabled: bool) {
    let mut s = settings(app); s.capture.enabled = enabled;
    apply_settings(app, s);
    notify(app, if enabled { "Clipboard capture resumed" } else { "Clipboard capture paused" });
}

pub fn sync_autostart(app: &AppHandle, s: &Settings) -> Option<String> {
    if st(app).paths.portable { return if s.start_with_windows { Some("Start with Windows is not available in portable mode".into()) } else { None }; }
    let m = app.autolaunch();
    let current = m.is_enabled().unwrap_or(false);
    if current == s.start_with_windows { return None; }
    let r = if s.start_with_windows { m.enable() } else { m.disable() };
    r.err().map(|e| format!("Could not change startup setting: {e}"))
}

/// Persist + apply new settings everywhere. Returns human-readable warnings (e.g. a shortcut that is taken by another app).
pub fn apply_settings(app: &AppHandle, new: Settings) -> Vec<String> {
    let state = st(app);
    let saved = match state.db.guard().save_settings(&new) { Ok(s) => s, Err(e) => { log::error!("save settings: {e}"); return vec![format!("Could not save settings: {e}")]; } };
    let old = std::mem::replace(&mut *state.settings.write().unwrap_or_else(|e| e.into_inner()), saved.clone());
    let mut warnings = vec![];
    if saved.shortcuts != old.shortcuts { warnings.extend(hotkeys::register_all(app, &saved)); }
    if saved.start_with_windows != old.start_with_windows { warnings.extend(sync_autostart(app, &saved)); }
    if saved.theme != old.theme || saved.material() != old.material() { shell::refresh_backdrop(app); }
    // Toggle position chosen in the settings window: adopt it as the placement (a drag saves through `save_placement`, which does not come through here).
    if saved.edge != old.edge || (saved.offset - old.offset).abs() > 1e-9 {
        let (mut p, _) = shell::current_placement(app); p.edge = saved.edge; p.offset = saved.offset;
        save_placement(app, &p);
        shell::refresh_layout(app);
    } else if saved.panel_size() != old.panel_size() { shell::refresh_layout(app); }
    tray::refresh(app);
    let _ = app.emit("settings-changed", &saved);
    warnings
}

/// Graceful shutdown: stop the clipboard thread, fold the WAL into the database, exit.
pub fn shutdown(app: &AppHandle) {
    let state = st(app);
    if let Some(mut l) = state.clipboard.guard().take() { l.stop(); }
    let _ = state.db.guard().checkpoint();
    app.exit(0);
}
