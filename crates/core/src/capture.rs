use crate::model::Kind;
use crate::settings::Settings;

pub fn classify_text(text: &str) -> Kind {
    let t = text.trim();
    let l = t.to_ascii_lowercase();
    // Same rule as the UI regex ^(https?://|www\.)[^\s]+$ : something must follow the prefix, no whitespace anywhere.
    let rest = l.strip_prefix("https://").or_else(|| l.strip_prefix("http://")).or_else(|| l.strip_prefix("www."));
    match rest { Some(r) if !r.is_empty() && !t.chars().any(char::is_whitespace) => Kind::Url, _ => Kind::Text }
}

pub fn title_for(kind: Kind, content: &str) -> String {
    let t = content.trim();
    match kind {
        Kind::Url => {
            let rest = t.split_once("://").map(|(_, r)| r).unwrap_or(t);
            let host = rest.split(['/', '?', '#']).next().unwrap_or(rest);
            let host = host.strip_prefix("www.").unwrap_or(host);
            if host.is_empty() { t.chars().take(60).collect() } else { host.to_string() }
        }
        Kind::File | Kind::Folder => t.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().filter(|s| !s.is_empty()).unwrap_or(t).to_string(),
        Kind::Group => format!("{} files", t.split('\n').count()),
        Kind::Image => "Image".into(),
        Kind::Text => {
            let l = t.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
            let s: String = l.chars().take(60).collect();
            if s.is_empty() { "Text".into() } else { s }
        }
    }
}

/// Whether a capture of `kind` from `source_app` is permitted by the user's settings. `manual` bypasses the pause switch only.
pub fn allowed(kind: Kind, s: &Settings, source_app: Option<&str>, manual: bool) -> bool {
    let c = &s.capture;
    if !c.enabled && !manual { return false; }
    if let Some(app) = source_app { if s.is_excluded(app) { return false; } }
    if manual { return true; }
    match kind { Kind::Text => c.text, Kind::Url => c.urls, Kind::Image => c.images, Kind::Folder => c.folders, Kind::File | Kind::Group => c.files }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn urls() {
        assert_eq!(classify_text("https://example.com/a?b=1"), Kind::Url);
        assert_eq!(classify_text("www.example.com"), Kind::Url);
        assert_eq!(classify_text("see https://example.com"), Kind::Text);
        assert_eq!(classify_text("http://"), Kind::Text);
        assert_eq!(classify_text("www."), Kind::Text);
        assert_eq!(classify_text("HTTPS://X.IO"), Kind::Url);
    }
    #[test] fn titles() {
        assert_eq!(title_for(Kind::Url, "https://www.example.com/x"), "example.com");
        assert_eq!(title_for(Kind::File, "C:\\Docs\\Report.pdf"), "Report.pdf");
        assert_eq!(title_for(Kind::Folder, "C:\\Docs\\Projects\\"), "Projects");
        assert_eq!(title_for(Kind::Text, "\n\n  hello world\nmore"), "hello world");
        assert_eq!(title_for(Kind::Group, "a\nb\nc"), "3 files");
    }
    #[test] fn rules() {
        let mut s = Settings::default();
        assert!(allowed(Kind::Text, &s, None, false));
        assert!(!allowed(Kind::Text, &s, Some("keepass.exe"), false));
        s.capture.images = false;
        assert!(!allowed(Kind::Image, &s, None, false));
        assert!(allowed(Kind::Image, &s, None, true), "manual capture bypasses type toggles");
        s.capture.enabled = false;
        assert!(!allowed(Kind::Text, &s, None, false));
        assert!(allowed(Kind::Text, &s, None, true), "manual capture works while paused");
        assert!(!allowed(Kind::Text, &s, Some("KeePass.exe"), true), "excluded apps are never captured, even manually");
    }
}
