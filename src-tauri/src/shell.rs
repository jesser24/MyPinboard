//! The native windows: the permanent edge `handle`, the on-demand floating panel (`board`) and the separate `settings` window.
//! The board webview is created lazily and destroyed after a period of inactivity so the app stays light in the background.
use crate::state::{self, st, LockExt};
use crate::{commands, platform};
use pinboard_core::geometry::*;
use serde_json::json;
use std::sync::atomic::Ordering::SeqCst;
use std::time::Duration;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub const HANDLE: &str = "handle";
pub const BOARD: &str = "board";
pub const SETTINGS: &str = "settings";
const IDLE_DESTROY: Duration = Duration::from_secs(90);

fn set_rect(w: &WebviewWindow, r: PRect) {
    let _ = w.set_position(Position::Physical(PhysicalPosition::new(r.x, r.y)));
    let _ = w.set_size(Size::Physical(PhysicalSize::new(r.w.max(1) as u32, r.h.max(1) as u32)));
}
/// Place `w` at `r`. With `fit` (the board, which has invisible shadow borders) the window is positioned with `SetWindowPos` so that its *visible*
/// frame is exactly `r`; `set_rect` is only the fallback, because Tauri's setters are asynchronous and would overwrite the corrected position.
fn set_rect_fit(w: &WebviewWindow, r: PRect, fit: bool) {
    if fit && platform::fit_visible_rect(w, r.x, r.y, r.w, r.h) { return; }
    set_rect(w, r);
}
/// Moving a window across monitors with different DPI makes Windows propose its own size; re-assert ours once the move settled.
fn set_rect_settled(w: &WebviewWindow, r: PRect, fit: bool) {
    set_rect_fit(w, r, fit);
    let w2 = w.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(70)); set_rect_fit(&w2, r, fit);
        if fit { std::thread::sleep(Duration::from_millis(230)); let _ = platform::fit_visible_rect(&w2, r.x, r.y, r.w, r.h); }
    });
}

pub fn current_placement(app: &AppHandle) -> (Placement, Vec<MonitorInfo>) {
    let saved = st(app).placement.guard().clone();
    let mons = platform::monitors();
    (resolve_placement(&saved, &mons), mons)
}

fn placement_from_cursor(c: (i32, i32), mons: &[MonitorInfo]) -> Option<Placement> {
    let m = monitor_for_point(c.0, c.1, mons)?;
    let edge = nearest_edge(c.0, c.1, m);
    Some(Placement { monitor: m.id.clone(), edge, offset: offset_for(edge, c.0, c.1, m) })
}

pub fn emit_placement(app: &AppHandle, p: &Placement) { let _ = app.emit("placement", json!({ "edge": p.edge, "offset": p.offset })); }

/// (Re)position the handle on its monitor. Safe to call any time (startup, display change, after a drag).
pub fn place_handle(app: &AppHandle) {
    let Some(w) = app.get_webview_window(HANDLE) else { return };
    let (p, mons) = current_placement(app);
    if let Some(m) = mons.iter().find(|m| m.id == p.monitor) { set_rect_settled(&w, handle_window_rect(&p, m), false); emit_placement(app, &p); }
}

pub fn ensure_handle(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(HANDLE) { return Ok(w); }
    let paths = &st(app).paths;
    let w = WebviewWindowBuilder::new(app, HANDLE, WebviewUrl::App("index.html?w=handle".into()))
        .title("MyPinboard handle").decorations(false).transparent(true).always_on_top(true).skip_taskbar(true).resizable(false)
        .shadow(false).focused(false).visible(false).inner_size(16.0, 72.0).data_directory(paths.webview_dir.clone())
        .build().map_err(|e| e.to_string())?;
    platform::make_non_activating(&w);
    let app2 = app.clone();
    w.on_window_event(move |ev| { if let WindowEvent::DragDrop(d) = ev { on_drag(&app2, HANDLE, d); } });
    let app3 = app.clone();
    platform::watch_display_changes(&w, Box::new(move || schedule_display_refresh(&app3)));
    place_handle(app);
    let _ = w.show();
    Ok(w)
}

/// Debounced reaction to monitor/DPI changes: re-home the handle (and the board if it is open).
pub fn schedule_display_refresh(app: &AppHandle) {
    let g = st(app).display_gen.fetch_add(1, SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        if st(&app).display_gen.load(SeqCst) != g { return; }
        place_handle(&app);
        if st(&app).board_open.load(SeqCst) { if let Some(w) = app.get_webview_window(BOARD) { place_board(&app, &w); } }
    });
}

fn place_board(app: &AppHandle, w: &WebviewWindow) {
    let (p, mons) = current_placement(app);
    if let Some(m) = mons.iter().find(|m| m.id == p.monitor) { set_rect_settled(w, board_rect_sized(&p, m, Some(state::settings(app).panel_size())), true); }
}
/// Re-fit the board's visible frame without moving it first (the frame can only be measured reliably once the window is shown).
fn fit_board(app: &AppHandle, w: &WebviewWindow) {
    let (p, mons) = current_placement(app);
    if let Some(m) = mons.iter().find(|m| m.id == p.monitor) { let r = board_rect_sized(&p, m, Some(state::settings(app).panel_size())); let _ = platform::fit_visible_rect(w, r.x, r.y, r.w, r.h); }
}
/// Give the board the real OS keyboard focus (needed for Escape and typing), even when another app is in the foreground.
fn focus_board(w: &WebviewWindow) { let _ = w.set_focus(); platform::focus_window(w); }

pub fn refresh_backdrop(app: &AppHandle) { if let Some(w) = app.get_webview_window(BOARD) { apply_backdrop(app, &w); } }

#[cfg(windows)]
fn apply_backdrop(app: &AppHandle, w: &WebviewWindow) {
    use window_vibrancy::{apply_acrylic, apply_mica, clear_acrylic, clear_mica};
    let s = state::settings(app);
    let dark = match s.theme.as_str() { "dark" => true, "light" => false, _ => w.theme().map(|t| t == tauri::Theme::Dark).unwrap_or(true) };
    // Start clean so switching material in settings really switches (errors just mean "was not applied").
    let _ = clear_mica(w); let _ = clear_acrylic(w);
    let acrylic = |w: &WebviewWindow| apply_acrylic(w, Some(if dark { (16, 11, 38, 140) } else { (246, 246, 255, 140) })).is_ok();
    let mode = match s.material() {
        "glass" => "none",
        "acrylic" => if acrylic(w) { "acrylic" } else if apply_mica(w, Some(dark)).is_ok() { "mica" } else { "none" },
        "mica" => if apply_mica(w, Some(dark)).is_ok() { "mica" } else if acrylic(w) { "acrylic" } else { "none" },
        _ => if apply_mica(w, Some(dark)).is_ok() { "mica" } else if acrylic(w) { "acrylic" } else { "none" },
    };
    *st(app).backdrop.guard() = mode.into();
    let _ = app.emit("native-info-changed", mode);
}
#[cfg(not(windows))]
fn apply_backdrop(app: &AppHandle, _w: &WebviewWindow) { *st(app).backdrop.guard() = "none".into(); }

/// Settings changed the panel size or the toggle's edge/position: re-place the handle and, if it is open, the panel.
pub fn refresh_layout(app: &AppHandle) {
    place_handle(app);
    if st(app).board_open.load(SeqCst) { if let Some(w) = app.get_webview_window(BOARD) { place_board(app, &w); } }
}

/// The separate MyPinboard window (settings + library). Created on demand; `section` picks the page ("appearance", "toggle", "library", ...).
pub fn show_settings(app: &AppHandle, section: Option<String>) {
    let section = section.filter(|s| !s.is_empty() && s.len() <= 16 && s.chars().all(|c| c.is_ascii_lowercase()));
    let w = match app.get_webview_window(SETTINGS) {
        Some(w) => w,
        None => {
            let url = match &section { Some(s) => format!("index.html?w=settings&section={s}"), None => "index.html?w=settings".into() };
            let built = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App(url.into()))
                .title("MyPinboard").inner_size(1040.0, 700.0).min_inner_size(760.0, 520.0).center().resizable(true)
                .data_directory(st(app).paths.webview_dir.clone()).build();
            match built { Ok(w) => w, Err(e) => { log::error!("settings window: {e}"); return; } }
        }
    };
    if let Some(s) = &section { let _ = app.emit_to(SETTINGS, "settings-section", s); }
    let _ = w.unminimize(); let _ = w.show(); platform::focus_window(&w); let _ = w.set_focus();
}

fn create_board(app: &AppHandle) -> Result<WebviewWindow, String> {
    let paths = &st(app).paths;
    let w = WebviewWindowBuilder::new(app, BOARD, WebviewUrl::App("index.html?w=board".into()))
        .title("MyPinboard").decorations(false).transparent(true).always_on_top(true).skip_taskbar(true).resizable(false)
        .shadow(true).focused(false).visible(false).inner_size(state::settings(app).panel_size().0, state::settings(app).panel_size().1).data_directory(paths.webview_dir.clone())
        .build().map_err(|e| e.to_string())?;
    platform::round_corners(&w);
    apply_backdrop(app, &w);
    let app2 = app.clone();
    w.on_window_event(move |ev| match ev {
        WindowEvent::Focused(false) => {
            let s = st(&app2);
            if s.board_open.load(SeqCst) && !s.dragging_board.load(SeqCst) && !s.files_dragging.load(SeqCst) { let _ = app2.emit_to(BOARD, "board-blur", ()); }
        }
        WindowEvent::CloseRequested { api, .. } => { api.prevent_close(); request_close(&app2); }
        WindowEvent::DragDrop(d) => on_drag(&app2, BOARD, d),
        _ => {}
    });
    Ok(w)
}

fn place_and_show(app: &AppHandle, w: &WebviewWindow, focus: bool) {
    place_board(app, w);
    let _ = w.show();
    fit_board(app, w);
    if focus { focus_board(w); }
    st(app).board_open.store(true, SeqCst);
    let _ = app.emit("board-visibility", true);
    let _ = app.emit_to(BOARD, "board-show", ());
}

pub fn show_board(app: &AppHandle, focus: bool) {
    let s = st(app);
    s.idle_gen.fetch_add(1, SeqCst);
    s.close_gen.fetch_add(1, SeqCst);
    match app.get_webview_window(BOARD) {
        Some(w) => {
            if s.board_open.load(SeqCst) { if focus { focus_board(&w); } return; }
            place_and_show(app, &w, focus);
        }
        None => {
            s.pending_focus.store(focus, SeqCst);
            s.board_pending.store(true, SeqCst);
            if let Err(e) = create_board(app) { log::error!("cannot create board window: {e}"); s.board_pending.store(false, SeqCst); }
        }
    }
}

/// The freshly created board page finished loading and registered its listeners: show it now (no blank flash).
pub fn board_ready(app: &AppHandle) {
    let s = st(app);
    if s.board_pending.swap(false, SeqCst) { if let Some(w) = app.get_webview_window(BOARD) { place_and_show(app, &w, s.pending_focus.load(SeqCst)); } }
}

/// Ask the board UI to play its closing animation; it calls `hide_board` afterwards. A watchdog hides it anyway if the UI does not answer.
pub fn request_close(app: &AppHandle) {
    let s = st(app);
    if !s.board_open.load(SeqCst) { return; }
    let _ = app.emit_to(BOARD, "board-close", ());
    let g = s.close_gen.fetch_add(1, SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(900)); if st(&app).close_gen.load(SeqCst) == g { hide_board(&app); } });
}

pub fn hide_board(app: &AppHandle) {
    let s = st(app);
    s.board_open.store(false, SeqCst);
    s.close_gen.fetch_add(1, SeqCst);
    if let Some(w) = app.get_webview_window(BOARD) { let _ = w.hide(); }
    let _ = app.emit("board-visibility", false);
    // Free the WebView2 renderer if the board stays unused.
    let g = s.idle_gen.fetch_add(1, SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(IDLE_DESTROY);
        let s = st(&app);
        if s.idle_gen.load(SeqCst) == g && !s.board_open.load(SeqCst) { if let Some(w) = app.get_webview_window(BOARD) { let _ = w.destroy(); log::info!("board webview released after idle"); } }
    });
}

pub fn toggle_board(app: &AppHandle) {
    if st(app).board_open.load(SeqCst) { request_close(app); } else { show_board(app, true); }
}

/// Handle pressed: follow the cursor (across edges and monitors) until the button is released. A press without movement is a click.
pub fn begin_handle_drag(app: &AppHandle) {
    let s = st(app);
    if s.dragging_handle.swap(true, SeqCst) { return; }
    let app = app.clone();
    std::thread::spawn(move || {
        let start = platform::cursor_pos();
        let (mut moved, mut last): (bool, Option<Placement>) = (false, None);
        while platform::left_button_down() {
            if let (Some(a), Some(c)) = (start, platform::cursor_pos()) {
                if !moved && (((c.0 - a.0).pow(2) + (c.1 - a.1).pow(2)) as f64).sqrt() >= 4.0 { moved = true; }
                if moved {
                    let mons = platform::monitors();
                    if let (Some(p), Some(w)) = (placement_from_cursor(c, &mons), app.get_webview_window(HANDLE)) {
                        if last.as_ref() != Some(&p) {
                            if let Some(m) = mons.iter().find(|m| m.id == p.monitor) { set_rect(&w, handle_window_rect(&p, m)); }
                            if last.as_ref().map(|l| l.edge) != Some(p.edge) { emit_placement(&app, &p); }
                            last = Some(p);
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(8));
        }
        st(&app).dragging_handle.store(false, SeqCst);
        if moved {
            if let Some(p) = last { state::save_placement(&app, &p); place_handle(&app); if st(&app).board_open.load(SeqCst) { if let Some(w) = app.get_webview_window(BOARD) { place_board(&app, &w); } } }
        } else { toggle_board(&app); }
    });
}

/// Board grip pressed: the board follows the cursor; on release it docks to the nearest edge of the monitor under it.
pub fn begin_board_drag(app: &AppHandle) {
    let s = st(app);
    let Some(w) = app.get_webview_window(BOARD) else { return };
    if s.dragging_board.swap(true, SeqCst) { return; }
    let (Some(cur), Ok(pos)) = (platform::cursor_pos(), w.outer_position()) else { s.dragging_board.store(false, SeqCst); return };
    let (dx, dy) = (cur.0 - pos.x, cur.1 - pos.y);
    let app = app.clone();
    std::thread::spawn(move || {
        while platform::left_button_down() {
            if let Some(c) = platform::cursor_pos() { let _ = w.set_position(Position::Physical(PhysicalPosition::new(c.0 - dx, c.1 - dy))); }
            std::thread::sleep(Duration::from_millis(8));
        }
        if let (Ok(p), Ok(sz)) = (w.outer_position(), w.outer_size()) {
            let center = (p.x + sz.width as i32 / 2, p.y + sz.height as i32 / 2);
            if let Some(np) = placement_from_cursor(center, &platform::monitors()) { state::save_placement(&app, &np); place_handle(&app); place_board(&app, &w); }
        }
        st(&app).dragging_board.store(false, SeqCst);
        let _ = w.set_focus();
    });
}

/// Files dragged from Explorer: the handle opens the board without stealing focus; dropping captures them as references.
fn on_drag(app: &AppHandle, label: &str, ev: &DragDropEvent) {
    let s = st(app);
    match ev {
        DragDropEvent::Enter { .. } => {
            s.files_dragging.store(true, SeqCst); s.drag_gen.fetch_add(1, SeqCst);
            if label == HANDLE && !s.board_open.load(SeqCst) { show_board(app, false); }
            let _ = app.emit_to(BOARD, "drop-state", true);
        }
        DragDropEvent::Drop { paths, .. } => {
            s.files_dragging.store(false, SeqCst);
            let _ = app.emit_to(BOARD, "drop-state", false);
            let list: Vec<String> = paths.iter().map(|p| p.display().to_string()).collect();
            let app2 = app.clone();
            std::thread::spawn(move || { commands::capture_paths_impl(&app2, list); show_board(&app2, true); });
        }
        DragDropEvent::Leave => {
            s.files_dragging.store(false, SeqCst);
            let _ = app.emit_to(BOARD, "drop-state", false);
            let g = s.drag_gen.fetch_add(1, SeqCst) + 1;
            let app2 = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(1500));
                let s = st(&app2);
                let focused = app2.get_webview_window(BOARD).and_then(|w| w.is_focused().ok()).unwrap_or(false);
                if s.drag_gen.load(SeqCst) == g && !s.files_dragging.load(SeqCst) && !focused && s.board_open.load(SeqCst) { request_close(&app2); }
            });
        }
        _ => {}
    }
}
