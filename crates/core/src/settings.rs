use crate::geometry::Edge;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct CaptureSettings { pub enabled: bool, pub text: bool, pub urls: bool, pub images: bool, pub files: bool, pub folders: bool }
impl Default for CaptureSettings {
    fn default() -> Self { Self { enabled: true, text: true, urls: true, images: true, files: true, folders: true } }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Binding { pub action: String, pub keys: String }

/// Mirrors the TypeScript `Settings`. Unknown fields survive a round trip (`extra`), so UI and core can evolve independently.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub accent: String,
    pub transparency: f64,
    pub blur: f64,
    pub anim_speed: f64,
    pub edge: Edge,
    pub offset: f64,
    pub capture: CaptureSettings,
    pub max_items: u32,
    pub excluded_apps: Vec<String>,
    pub start_with_windows: bool,
    pub notifications: bool,
    pub shortcuts: Vec<Binding>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        let b = |a: &str, k: &str| Binding { action: a.into(), keys: k.into() };
        Self {
            theme: "system".into(), accent: "violet".into(), transparency: 0.72, blur: 22.0, anim_speed: 1.0,
            edge: Edge::Right, offset: 0.5, capture: CaptureSettings::default(), max_items: 500,
            excluded_apps: vec!["KeePass.exe".into(), "Bitwarden.exe".into(), "1Password.exe".into()],
            start_with_windows: false, notifications: true,
            shortcuts: vec![b("toggle", "Win+Alt+S"), b("pause", "Win+Alt+P"), b("capture", "Win+Alt+C"), b("search", "Ctrl+F")],
            extra: Map::new(),
        }
    }
}

impl Settings {
    pub fn is_excluded(&self, app: &str) -> bool { self.excluded_apps.iter().any(|e| e.eq_ignore_ascii_case(app)) }
    pub fn clamped(mut self) -> Self {
        self.max_items = self.max_items.clamp(20, 5000);
        self.offset = if self.offset.is_finite() { self.offset.clamp(0.1, 0.9) } else { 0.5 };
        self.transparency = self.transparency.clamp(0.35, 1.0);
        self
    }
}
