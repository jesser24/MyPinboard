//! MyPinboard native shell (Tauri 2). Platform-independent logic lives in `pinboard-core`.
pub mod clipboard;
pub mod commands;
pub mod hotkeys;
pub mod paths;
pub mod platform;
pub mod shell;
pub mod state;
pub mod tray;

use pinboard_core::db::Db;
use state::{st, AppState, LockExt};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::ShortcutState;

static LAST_SEQ: AtomicU32 = AtomicU32::new(0);

/// Runs on the clipboard-listener thread for each WM_CLIPBOARDUPDATE.
fn on_clipboard_changed(app: &AppHandle) {
    std::thread::sleep(std::time::Duration::from_millis(40)); // let multi-format writers finish
    let seq = clipboard::current_seq();
    if seq != 0 && LAST_SEQ.swap(seq, Ordering::SeqCst) == seq { return; }
    if clipboard::is_self_write() { return; }
    if !state::settings(app).capture.enabled { return; }
    let snap = clipboard::read_now();
    if snap.excluded_by_source { return; }
    if let Some(d) = snap.data { state::ingest_and_emit(app, d, snap.source_app, false, "clipboard"); }
}

/// `mypinboard.exe --print-stats <file>`: headless check used by CI to read the real database without a UI.
fn cli_print_stats(paths: &paths::DataPaths, out: Option<&String>) {
    let json = match Db::open(&paths.db_path) {
        Ok((db, _)) => {
            let items = db.items().unwrap_or_default();
            serde_json::json!({ "items": items.len(), "kinds": items.iter().map(|i| i.kind.as_str()).collect::<Vec<_>>(), "titles": items.iter().map(|i| i.title.clone()).collect::<Vec<_>>(), "sources": items.iter().filter_map(|i| i.source_app.clone()).collect::<Vec<_>>() })
        }
        Err(e) => serde_json::json!({ "error": e.to_string() }),
    };
    match out { Some(f) => { let _ = std::fs::write(f, json.to_string()); } None => println!("{json}") }
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let paths = paths::resolve();
    if let Some(i) = args.iter().position(|a| a == "--print-stats") { cli_print_stats(&paths, args.get(i + 1)); return; }
    let _ = std::fs::create_dir_all(&paths.data_dir);
    let _ = std::fs::create_dir_all(&paths.images_dir);
    let (db, report) = match Db::open(&paths.db_path) { Ok(x) => x, Err(e) => { eprintln!("cannot open database {}: {e}", paths.db_path.display()); std::process::exit(2); } };
    let settings = db.settings().unwrap_or_default();
    let placement = state::load_placement(&db, &settings);
    let logs_dir = paths.logs_dir.clone();
    let state = Arc::new(AppState {
        paths, db: Mutex::new(db), settings: RwLock::new(settings), placement: Mutex::new(placement), backdrop: Mutex::new("none".into()), hotkeys: Mutex::new(HashMap::new()),
        clipboard: Mutex::new(None), board_open: AtomicBool::new(false), board_pending: AtomicBool::new(false), pending_focus: AtomicBool::new(false),
        dragging_handle: AtomicBool::new(false), dragging_board: AtomicBool::new(false), files_dragging: AtomicBool::new(false),
        drag_gen: AtomicU64::new(0), idle_gen: AtomicU64::new(0), close_gen: AtomicU64::new(0), display_gen: AtomicU64::new(0),
    });
    let recovered = report.recovered_from;

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| shell::show_board(app, true)))
        .plugin(tauri_plugin_log::Builder::new()
            .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder { path: logs_dir, file_name: Some("mypinboard".into()) }))
            .level(log::LevelFilter::Info).max_file_size(1_000_000).rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne).build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--background"])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| { if event.state() == ShortcutState::Pressed { hotkeys::dispatch(app, shortcut.id()); } }).build())
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot, commands::get_settings, commands::upsert_item, commands::remove_items, commands::save_collections, commands::save_settings, commands::restore_snapshot,
            commands::capture_clipboard_now, commands::capture_paths, commands::copy_item, commands::open_item, commands::reveal_item, commands::native_info,
            commands::storage_info, commands::open_data_dir, commands::board_ready, commands::hide_board, commands::toggle_board, commands::begin_handle_drag,
            commands::begin_board_drag, commands::current_edge, commands::quit_app, commands::open_settings
        ])
        .setup(move |app| {
            let h = app.handle().clone();
            let s = st(&h);
            let _ = app.asset_protocol_scope().allow_directory(&s.paths.images_dir, true);
            shell::ensure_handle(&h)?;
            tray::build(&h)?;
            let cfg = state::settings(&h);
            for w in hotkeys::register_all(&h, &cfg) { log::warn!("{w}"); state::notify(&h, &w); }
            if let Some(w) = state::sync_autostart(&h, &cfg) { log::warn!("{w}"); }
            match clipboard::start({ let h2 = h.clone(); move || on_clipboard_changed(&h2) }) {
                Ok(l) => *s.clipboard.guard() = Some(l),
                Err(e) => { log::error!("clipboard listener: {e}"); state::notify(&h, "Clipboard capture could not start. Restart MyPinboard or check the log."); }
            }
            if let Some(p) = &recovered { log::warn!("database was unreadable, moved to {}", p.display()); state::notify(&h, "Your database was damaged and has been set aside; a new one was created."); }
            log::info!("MyPinboard {} started (portable={})", env!("CARGO_PKG_VERSION"), s.paths.portable);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MyPinboard");

    app.run(|app, event| match event {
        // Closing every window must not quit: the app lives in the tray and the handle window.
        RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(),
        RunEvent::Exit => { let s = st(app); let _ = s.db.guard().checkpoint(); }
        _ => {}
    });
}
