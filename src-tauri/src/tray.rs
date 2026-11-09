use crate::{shell, state};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

fn make_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let s = state::settings(app);
    let open = MenuItem::with_id(app, "open", "Open board", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let paused = CheckMenuItem::with_id(app, "pause", "Pause capture", true, !s.capture.enabled, None::<&str>)?;
    let auto = CheckMenuItem::with_id(app, "autostart", "Start with Windows", !state::st(app).paths.portable, s.start_with_windows, None::<&str>)?;
    let data = MenuItem::with_id(app, "data", "Open data folder", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit MyPinboard", true, None::<&str>)?;
    Menu::with_items(app, &[&open, &settings, &paused, &auto, &PredefinedMenuItem::separator(app)?, &data, &PredefinedMenuItem::separator(app)?, &quit])
}

fn tooltip(app: &AppHandle) -> String { if state::settings(app).capture.enabled { "MyPinboard — capturing".into() } else { "MyPinboard — capture paused".into() } }

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let menu = make_menu(app)?;
    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .tooltip(tooltip(app))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id.as_ref() {
            "open" => shell::show_board(app, true),
            // Event handlers run on the main thread: creating a window here deadlocks on Windows, so hand it to a worker thread.
            "settings" => { let app = app.clone(); std::thread::spawn(move || shell::show_settings(&app, None)); }
            "pause" => { let on = state::settings(app).capture.enabled; state::set_capture_enabled(app, !on); }
            "autostart" => { let mut s = state::settings(app); s.start_with_windows = !s.start_with_windows; let w = state::apply_settings(app, s); if let Some(m) = w.first() { state::notify(app, m); } }
            "data" => { let _ = crate::commands::open_data_dir_impl(app); }
            "quit" => state::shutdown(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev { shell::toggle_board(tray.app_handle()); }
        })
        .build(app)?;
    Ok(())
}

/// Re-sync check marks and tooltip after settings changed.
pub fn refresh(app: &AppHandle) {
    if let Some(t) = app.tray_by_id("main") {
        if let Ok(m) = make_menu(app) { let _ = t.set_menu(Some(m)); }
        let _ = t.set_tooltip(Some(tooltip(app)));
    }
}
