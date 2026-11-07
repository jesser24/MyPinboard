//! Global shortcuts via RegisterHotKey (tauri-plugin-global-shortcut). Registration failures (key already taken by another app) are reported, never silent.
use crate::state::{self, st, LockExt};
use crate::{commands, shell};
use pinboard_core::settings::Settings;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// "Win+Alt+S" (UI notation) → "Super+Alt+S" (accelerator notation). Pure and tested.
pub fn to_accelerator(keys: &str) -> String {
    keys.split('+').map(|p| p.trim()).filter(|p| !p.is_empty()).map(|p| match p.to_ascii_lowercase().as_str() {
        "win" | "windows" | "meta" | "super" => "Super".to_string(), "ctrl" | "control" => "Control".to_string(), "alt" | "option" => "Alt".to_string(), "shift" => "Shift".to_string(),
        other => if other.len() == 1 { other.to_ascii_uppercase() } else { p.to_string() },
    }).collect::<Vec<_>>().join("+")
}

fn label(action: &str) -> &str { match action { "toggle" => "Toggle board", "pause" => "Pause capture", "capture" => "Manual capture", other => other } }

/// Only actions that must work while another app has focus are registered globally. Ctrl+F (search) stays in-app: a global Ctrl+F would hijack every program.
pub fn register_all(app: &AppHandle, s: &Settings) -> Vec<String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let state = st(app);
    state.hotkeys.guard().clear();
    let mut warnings = vec![];
    for b in &s.shortcuts {
        if !matches!(b.action.as_str(), "toggle" | "pause" | "capture") { continue; }
        match to_accelerator(&b.keys).parse::<Shortcut>() {
            Ok(sc) => match gs.register(sc) {
                Ok(()) => { state.hotkeys.guard().insert(sc.id(), b.action.clone()); }
                Err(e) => warnings.push(format!("{} ({}) could not be registered — another app may use it ({e})", label(&b.action), b.keys)),
            },
            Err(e) => warnings.push(format!("Invalid shortcut for {}: {} ({e})", label(&b.action), b.keys)),
        }
    }
    warnings
}

pub fn dispatch(app: &AppHandle, shortcut_id: u32) {
    let Some(action) = st(app).hotkeys.guard().get(&shortcut_id).cloned() else { return };
    match action.as_str() {
        "toggle" => shell::toggle_board(app),
        "pause" => { let on = state::settings(app).capture.enabled; state::set_capture_enabled(app, !on); }
        "capture" => { let app = app.clone(); std::thread::spawn(move || { let _ = commands::capture_clipboard_now_impl(&app); }); }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn accelerator_translation() {
        assert_eq!(to_accelerator("Win+Alt+S"), "Super+Alt+S");
        assert_eq!(to_accelerator("ctrl + shift + p"), "Control+Shift+P");
        assert_eq!(to_accelerator("Win+Alt+F5"), "Super+Alt+F5");
    }
}
