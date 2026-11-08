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
            theme: "system".into(), accent: "violet".into(), transparency: 0.75, blur: 22.0, anim_speed: 1.0,
            edge: Edge::Right, offset: 0.5, capture: CaptureSettings::default(), max_items: 500,
            excluded_apps: vec!["KeePass.exe".into(), "Bitwarden.exe".into(), "1Password.exe".into()],
            start_with_windows: false, notifications: true,
            shortcuts: vec![b("toggle", "Win+Alt+S"), b("pause", "Win+Alt+P"), b("capture", "Win+Alt+C"), b("search", "Ctrl+F")],
            extra: Map::new(),
        }
    }
}

impl Settings {
    /// Floating-panel size in dip, chosen in the settings window. Lives in `extra`, so databases from before the redesign need no migration:
    /// when absent it is the default 380 × 540. Always clamped to 320–480 × 380–700.
    pub fn panel_size(&self) -> (f64, f64) {
        let g = |k: &str, d: f64| self.extra.get(k).and_then(|v| v.as_f64()).filter(|v| v.is_finite()).unwrap_or(d);
        (g("panelWidth", 380.0).clamp(320.0, 480.0), g("panelHeight", 540.0).clamp(380.0, 700.0))
    }
    /// Native backdrop the user asked for: "auto" (Mica, else Acrylic), "acrylic", "mica" or "glass" (no native material).
    pub fn material(&self) -> &str { match self.extra.get("material").and_then(|v| v.as_str()) { Some(m @ ("acrylic" | "mica" | "glass")) => m, _ => "auto" } }
    pub fn is_excluded(&self, app: &str) -> bool { self.excluded_apps.iter().any(|e| e.eq_ignore_ascii_case(app)) }
    pub fn clamped(mut self) -> Self {
        self.max_items = self.max_items.clamp(20, 5000);
        self.offset = if self.offset.is_finite() { self.offset.clamp(0.1, 0.9) } else { 0.5 };
        self.transparency = self.transparency.clamp(0.35, 1.0);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn with(extra: Value) -> Settings { let mut s = Settings::default(); if let Value::Object(m) = extra { s.extra = m; } s }

    #[test] fn defaults_are_75_percent_surface_and_380x540_panel() {
        let s = Settings::default();
        assert_eq!(s.transparency, 0.75);
        assert_eq!(s.panel_size(), (380.0, 540.0));
        assert_eq!(s.material(), "auto");
    }
    #[test] fn databases_from_before_the_redesign_load_with_defaults() {
        // an old settings document has none of the new keys
        let old: Settings = serde_json::from_value(json!({ "theme": "dark", "accent": "azure", "transparency": 0.5, "maxItems": 100 })).unwrap();
        assert_eq!(old.panel_size(), (380.0, 540.0)); assert_eq!(old.material(), "auto");
        assert_eq!(old.transparency, 0.5, "existing choices are never overwritten");
    }
    #[test] fn panel_size_is_clamped_to_the_specified_limits() {
        assert_eq!(with(json!({ "panelWidth": 9999, "panelHeight": 1 })).panel_size(), (480.0, 380.0));
        assert_eq!(with(json!({ "panelWidth": 100, "panelHeight": 9999 })).panel_size(), (320.0, 700.0));
        assert_eq!(with(json!({ "panelWidth": "wide", "panelHeight": null })).panel_size(), (380.0, 540.0));
        assert_eq!(with(json!({ "panelWidth": 410, "panelHeight": 600 })).panel_size(), (410.0, 600.0));
    }
    #[test] fn material_accepts_only_known_values() {
        for m in ["acrylic", "mica", "glass"] { assert_eq!(with(json!({ "material": m })).material(), m); }
        assert_eq!(with(json!({ "material": "plasma" })).material(), "auto");
        assert_eq!(with(json!({ "material": 3 })).material(), "auto");
    }
}
