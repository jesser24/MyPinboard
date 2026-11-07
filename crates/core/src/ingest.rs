//! Turns raw clipboard / drop data into stored items. Pure of any OS API so it is fully testable.
use crate::capture::classify_text;
use crate::db::Db;
use crate::hashing::sha256_hex;
use crate::model::*;
use crate::settings::Settings;
use crate::Result;
use std::path::Path;

pub const MAX_TEXT_BYTES: usize = 2_000_000;
pub const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
pub const IMAGE_PREFIX: &str = "pbimg:";

pub enum ClipData { Text(String), Files(Vec<String>), Png(Vec<u8>) }

pub fn ingest(db: &mut Db, images_dir: &Path, data: ClipData, source_app: Option<&str>, s: &Settings, manual: bool, now: i64) -> Result<Option<CaptureOutcome>> {
    let src = source_app.map(str::to_string);
    let cap = match data {
        ClipData::Text(t) => {
            if t.trim().is_empty() || t.len() > MAX_TEXT_BYTES { return Ok(None); }
            NewCapture { kind: classify_text(&t), size_bytes: Some(t.len() as i64), content: t, source_app: src, collection_id: None, title: None }
        }
        ClipData::Files(paths) => {
            let paths: Vec<String> = paths.into_iter().map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect();
            if paths.is_empty() { return Ok(None); }
            let metas: Vec<Option<std::fs::Metadata>> = paths.iter().map(|p| std::fs::metadata(p).ok()).collect();
            if paths.len() == 1 {
                let dir = metas[0].as_ref().map(|m| m.is_dir()).unwrap_or(false);
                NewCapture { kind: if dir { Kind::Folder } else { Kind::File }, size_bytes: metas[0].as_ref().filter(|m| m.is_file()).map(|m| m.len() as i64), content: paths[0].clone(), source_app: src, collection_id: None, title: None }
            } else {
                let total: i64 = metas.iter().flatten().filter(|m| m.is_file()).map(|m| m.len() as i64).sum();
                NewCapture { kind: Kind::Group, content: paths.join("\n"), size_bytes: Some(total), source_app: src, collection_id: None, title: None }
            }
        }
        ClipData::Png(bytes) => {
            if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES { return Ok(None); }
            if !crate::capture::allowed(Kind::Image, s, source_app, manual) { return Ok(None); }
            let name = format!("{}.png", sha256_hex(&bytes));
            std::fs::create_dir_all(images_dir)?;
            let target = images_dir.join(&name);
            if !target.exists() { let tmp = images_dir.join(format!("{name}.tmp")); std::fs::write(&tmp, &bytes)?; std::fs::rename(&tmp, &target)?; }
            NewCapture { kind: Kind::Image, content: format!("{IMAGE_PREFIX}{name}"), size_bytes: Some(bytes.len() as i64), source_app: src, collection_id: None, title: None }
        }
    };
    db.capture(&cap, s, manual, now)
}

/// Delete image files for orphaned references. Refuses anything that is not exactly `pbimg:<64 hex>.png`.
pub fn delete_image_refs(images_dir: &Path, refs: &[String]) -> usize {
    let mut n = 0;
    for r in refs {
        let Some(name) = r.strip_prefix(IMAGE_PREFIX) else { continue };
        let ok = name.len() == 68 && name.ends_with(".png") && name[..64].chars().all(|c| c.is_ascii_hexdigit());
        if ok && std::fs::remove_file(images_dir.join(name)).is_ok() { n += 1; }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> (tempfile::TempDir, Db, Settings) { let d = tempfile::tempdir().unwrap(); (d, Db::open_memory().unwrap(), Settings::default()) }
    #[test] fn text_and_url() {
        let (d, mut db, s) = setup();
        let t = ingest(&mut db, d.path(), ClipData::Text("hello world".into()), Some("notepad.exe"), &s, false, 1).unwrap().unwrap();
        assert_eq!(t.item.kind, Kind::Text); assert_eq!(t.item.source_app.as_deref(), Some("notepad.exe")); assert_eq!(t.item.size_bytes, Some(11));
        let u = ingest(&mut db, d.path(), ClipData::Text("https://react.dev/learn".into()), None, &s, false, 2).unwrap().unwrap(); assert_eq!(u.item.kind, Kind::Url); assert_eq!(u.item.title, "react.dev");
        assert!(ingest(&mut db, d.path(), ClipData::Text("   \n ".into()), None, &s, false, 3).unwrap().is_none());
        assert!(ingest(&mut db, d.path(), ClipData::Text("x".repeat(MAX_TEXT_BYTES + 1)), None, &s, false, 3).unwrap().is_none());
    }
    #[test] fn single_file_folder_and_multiple_files() {
        let (d, mut db, s) = setup(); let f1 = d.path().join("a.pdf"); let f2 = d.path().join("b.txt"); let sub = d.path().join("proj"); std::fs::create_dir(&sub).unwrap();
        std::fs::write(&f1, vec![0u8; 2048]).unwrap(); std::fs::write(&f2, b"hello").unwrap();
        let one = ingest(&mut db, d.path(), ClipData::Files(vec![f1.display().to_string()]), None, &s, false, 1).unwrap().unwrap(); assert_eq!(one.item.kind, Kind::File); assert_eq!(one.item.size_bytes, Some(2048)); assert_eq!(one.item.title, "a.pdf");
        let dir = ingest(&mut db, d.path(), ClipData::Files(vec![sub.display().to_string()]), None, &s, false, 2).unwrap().unwrap(); assert_eq!(dir.item.kind, Kind::Folder); assert_eq!(dir.item.size_bytes, None);
        let many = ingest(&mut db, d.path(), ClipData::Files(vec![f1.display().to_string(), f2.display().to_string(), sub.display().to_string()]), None, &s, false, 3).unwrap().unwrap();
        assert_eq!(many.item.kind, Kind::Group); assert_eq!(many.item.size_bytes, Some(2053)); assert_eq!(many.item.title, "3 files");
        assert!(ingest(&mut db, d.path(), ClipData::Files(vec![]), None, &s, false, 4).unwrap().is_none());
    }
    #[test] fn missing_path_is_still_referenced_gracefully() {
        let (d, mut db, s) = setup();
        let r = ingest(&mut db, d.path(), ClipData::Files(vec!["Z:\\gone\\ghost.docx".into()]), None, &s, false, 1).unwrap().unwrap(); assert_eq!(r.item.kind, Kind::File); assert_eq!(r.item.size_bytes, None);
    }
    #[test] fn folder_toggle_respected() {
        let (d, mut db, mut s) = setup(); let sub = d.path().join("p"); std::fs::create_dir(&sub).unwrap(); s.capture.folders = false;
        assert!(ingest(&mut db, d.path(), ClipData::Files(vec![sub.display().to_string()]), None, &s, false, 1).unwrap().is_none());
    }
    #[test] fn images_are_stored_once_by_content_and_cleaned_up() {
        let (d, mut db, s) = setup(); let imgs = d.path().join("images"); let png = vec![0x89, b'P', b'N', b'G', 1, 2, 3, 4];
        let a = ingest(&mut db, &imgs, ClipData::Png(png.clone()), Some("SnippingTool.exe"), &s, false, 1).unwrap().unwrap();
        assert_eq!(a.item.kind, Kind::Image); assert!(a.item.content.starts_with(IMAGE_PREFIX));
        let file = imgs.join(a.item.content.trim_start_matches(IMAGE_PREFIX)); assert_eq!(std::fs::read(&file).unwrap(), png);
        let b = ingest(&mut db, &imgs, ClipData::Png(png), None, &s, false, 2).unwrap().unwrap(); assert!(b.duplicate); assert_eq!(db.item_count().unwrap(), 1);
        let orphans = db.remove_items(&[a.item.id]).unwrap(); assert_eq!(delete_image_refs(&imgs, &orphans), 1); assert!(!file.exists());
    }
    #[test] fn disabled_image_capture_writes_nothing() {
        let (d, mut db, mut s) = setup(); s.capture.images = false; let imgs = d.path().join("images");
        assert!(ingest(&mut db, &imgs, ClipData::Png(vec![1, 2, 3]), None, &s, false, 1).unwrap().is_none()); assert!(!imgs.exists());
    }
    #[test] fn delete_refuses_path_traversal() {
        let d = tempfile::tempdir().unwrap(); let victim = d.path().join("victim.png"); std::fs::write(&victim, b"x").unwrap();
        let sub = d.path().join("images"); std::fs::create_dir(&sub).unwrap();
        assert_eq!(delete_image_refs(&sub, &["pbimg:../victim.png".into(), "pbimg:victim.png".into(), "../x".into()]), 0); assert!(victim.exists());
    }
}
