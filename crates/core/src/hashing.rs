use crate::model::Kind;
use sha2::{Digest, Sha256};

/// Canonical duplicate key. Must stay in sync with `dedupeKey` in src/lib/dedupe.ts.
pub fn dedupe_key(kind: Kind, content: &str) -> String {
    let c = content.replace("\r\n", "\n");
    let c = c.trim();
    let body = if kind.is_path_kind() {
        let mut parts: Vec<String> = c.split('\n').map(|p| p.trim().replace('/', "\\").to_lowercase()).collect();
        parts.sort();
        parts.join("\n")
    } else { c.to_string() };
    format!("{}:{}", kind.as_str(), body)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let d = Sha256::digest(bytes);
    d.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn hash_key(key: &str) -> String { sha256_hex(key.as_bytes()) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn text_ignores_crlf_and_padding() { assert_eq!(dedupe_key(Kind::Text, " a\r\nb "), dedupe_key(Kind::Text, "a\nb")); }
    #[test] fn paths_ignore_case_slash_order() {
        assert_eq!(dedupe_key(Kind::Group, "C:/A/x.txt\nC:/B/y.txt"), dedupe_key(Kind::Group, "c:\\b\\y.txt\nc:\\a\\X.TXT"));
    }
    #[test] fn kinds_are_distinct() { assert_ne!(dedupe_key(Kind::Text, "http://a"), dedupe_key(Kind::Url, "http://a")); }
    #[test] fn sha256_known_vector() { assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); }
}
