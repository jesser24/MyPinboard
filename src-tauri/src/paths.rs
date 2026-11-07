//! Where MyPinboard keeps its data. Documented in docs/ARCHITECTURE.md and the user guide.
//! installed : %APPDATA%\MyPinboard\{mypinboard.db, images\, logs\}   WebView2 profile: %LOCALAPPDATA%\MyPinboard\WebView2
//! portable  : <folder of the exe>\data\...  (enabled by a `portable.flag` file next to the exe) — nothing is written outside that folder.
//! override  : environment variable MYPINBOARD_DATA_DIR (used by CI and tests)
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct DataPaths { pub data_dir: PathBuf, pub db_path: PathBuf, pub images_dir: PathBuf, pub logs_dir: PathBuf, pub webview_dir: PathBuf, pub portable: bool }

pub fn from_root(root: PathBuf, webview: PathBuf, portable: bool) -> DataPaths {
    DataPaths { db_path: root.join("mypinboard.db"), images_dir: root.join("images"), logs_dir: root.join("logs"), webview_dir: webview, data_dir: root, portable }
}

pub fn resolve_with(env_dir: Option<PathBuf>, exe_dir: Option<PathBuf>, appdata: Option<PathBuf>, local_appdata: Option<PathBuf>) -> DataPaths {
    if let Some(d) = env_dir.filter(|d| !d.as_os_str().is_empty()) { return from_root(d.clone(), d.join("WebView2"), true); }
    if let Some(exe) = exe_dir.as_ref().filter(|e| e.join("portable.flag").exists()) { let root = exe.join("data"); return from_root(root.clone(), root.join("WebView2"), true); }
    let base = appdata.unwrap_or_else(|| std::env::temp_dir()).join("MyPinboard");
    let web = local_appdata.map(|l| l.join("MyPinboard").join("WebView2")).unwrap_or_else(|| base.join("WebView2"));
    from_root(base, web, false)
}

pub fn resolve() -> DataPaths {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from).or_else(|| std::env::var_os("XDG_DATA_HOME").map(PathBuf::from)).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")));
    resolve_with(std::env::var_os("MYPINBOARD_DATA_DIR").map(PathBuf::from), exe_dir, appdata, std::env::var_os("LOCALAPPDATA").map(PathBuf::from))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn installed_layout() {
        let p = resolve_with(None, Some("C:\\NoSuchDir\\App".into()), Some("C:\\Users\\u\\AppData\\Roaming".into()), Some("C:\\Users\\u\\AppData\\Local".into()));
        assert!(!p.portable); assert!(p.data_dir.ends_with("MyPinboard")); assert!(p.db_path.ends_with("mypinboard.db")); assert!(p.webview_dir.starts_with("C:\\Users\\u\\AppData\\Local"));
    }
    #[test] fn portable_flag_keeps_everything_beside_the_exe() {
        let d = std::env::temp_dir().join(format!("pb-portable-{}", std::process::id())); std::fs::create_dir_all(&d).unwrap(); std::fs::write(d.join("portable.flag"), b"").unwrap();
        let p = resolve_with(None, Some(d.clone()), Some("X".into()), Some("Y".into()));
        assert!(p.portable); assert!(p.data_dir.starts_with(&d)); assert!(p.webview_dir.starts_with(&d)); assert!(p.images_dir.starts_with(&d)); std::fs::remove_dir_all(&d).ok();
    }
    #[test] fn env_override_wins() {
        let p = resolve_with(Some("D:\\ci-data".into()), None, Some("A".into()), None); assert_eq!(p.data_dir, PathBuf::from("D:\\ci-data")); assert!(p.portable);
    }
}
