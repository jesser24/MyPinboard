//! SQLite persistence. WAL + synchronous=FULL: every committed capture survives process crash, power loss and reboot.
use crate::capture::{allowed, classify_text, title_for};
use crate::hashing::{dedupe_key, hash_key};
use crate::model::*;
use crate::settings::Settings;
use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::path::{Path, PathBuf};

pub struct Db { conn: Connection }
#[derive(Debug, Default)]
pub struct OpenReport { /// Set when an unreadable database was moved aside and a fresh one created.
    pub recovered_from: Option<PathBuf> }

const SCHEMA_V1: &str = "
CREATE TABLE IF NOT EXISTS items(
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, collection_id TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]', pinned INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0,
  captured_at INTEGER NOT NULL, size_bytes INTEGER, source_app TEXT, hash TEXT NOT NULL, dkey TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS items_captured ON items(captured_at DESC);
CREATE INDEX IF NOT EXISTS items_hash ON items(hash);
CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
";

fn row_item(r: &Row) -> rusqlite::Result<Item> {
    let tags: String = r.get("tags")?;
    Ok(Item {
        id: r.get("id")?, kind: Kind::parse(&r.get::<_, String>("kind")?), title: r.get("title")?, content: r.get("content")?,
        collection_id: r.get("collection_id")?, tags: serde_json::from_str(&tags).unwrap_or_default(),
        pinned: r.get::<_, i64>("pinned")? != 0, favorite: r.get::<_, i64>("favorite")? != 0, captured_at: r.get("captured_at")?,
        size_bytes: r.get("size_bytes")?, source_app: r.get("source_app")?, hash: r.get("hash")?,
    })
}

impl Db {
    fn init(conn: &Connection) -> Result<()> {
        let _mode: String = conn.query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0))?;
        conn.execute_batch("PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA temp_store=MEMORY;")?;
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if v < 1 { conn.execute_batch(SCHEMA_V1)?; conn.execute_batch("PRAGMA user_version=1")?; }
        Ok(())
    }
    fn healthy(conn: &Connection) -> bool { conn.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0)).map(|s| s == "ok").unwrap_or(false) }

    pub fn open_memory() -> Result<Db> { let c = Connection::open_in_memory()?; Self::init(&c)?; let mut d = Db { conn: c }; d.seed()?; Ok(d) }

    /// Opens (creating if needed). A corrupt/unreadable file is renamed `*.corrupt-<ts>` and replaced, never silently deleted.
    pub fn open(path: &Path) -> Result<(Db, OpenReport)> {
        if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
        let attempt = || -> Result<Connection> { let c = Connection::open(path)?; Self::init(&c)?; if !Self::healthy(&c) { return Err(Error::Msg("integrity check failed".into())); } Ok(c) };
        match attempt() {
            Ok(c) => { let mut d = Db { conn: c }; d.seed()?; Ok((d, OpenReport::default())) }
            Err(_) if path.exists() => {
                let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                let aside = PathBuf::from(format!("{}.corrupt-{ts}", path.display()));
                std::fs::rename(path, &aside)?;
                for ext in ["-wal", "-shm"] { let p = PathBuf::from(format!("{}{ext}", path.display())); if p.exists() { let _ = std::fs::remove_file(p); } }
                let c = Connection::open(path)?; Self::init(&c)?;
                let mut d = Db { conn: c }; d.seed()?;
                Ok((d, OpenReport { recovered_from: Some(aside) }))
            }
            Err(e) => Err(e),
        }
    }

    fn seed(&mut self) -> Result<()> {
        let seeded: Option<String> = self.conn.query_row("SELECT value FROM kv WHERE key='seeded'", [], |r| r.get(0)).optional()?;
        if seeded.is_none() {
            let tx = self.conn.transaction()?;
            for (i, c) in default_collections().iter().enumerate() { tx.execute("INSERT OR IGNORE INTO collections VALUES(?1,?2,?3,?4)", params![c.id, c.name, c.color, i as i64])?; }
            tx.execute("INSERT OR REPLACE INTO kv VALUES('seeded','1')", [])?;
            tx.commit()?;
        }
        Ok(())
    }

    pub fn items(&self) -> Result<Vec<Item>> {
        let mut s = self.conn.prepare("SELECT * FROM items ORDER BY captured_at DESC")?;
        let v = s.query_map([], row_item)?.collect::<rusqlite::Result<Vec<_>>>()?; Ok(v)
    }
    pub fn collections(&self) -> Result<Vec<Collection>> {
        let mut s = self.conn.prepare("SELECT id,name,color FROM collections ORDER BY position")?;
        let v = s.query_map([], |r| Ok(Collection { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? }))?.collect::<rusqlite::Result<Vec<_>>>()?; Ok(v)
    }
    pub fn settings(&self) -> Result<Settings> {
        let raw: Option<String> = self.conn.query_row("SELECT value FROM kv WHERE key='settings'", [], |r| r.get(0)).optional()?;
        Ok(raw.and_then(|s| serde_json::from_str::<Settings>(&s).ok()).unwrap_or_default().clamped())
    }
    pub fn save_settings(&mut self, s: &Settings) -> Result<Settings> {
        let s = s.clone().clamped();
        self.conn.execute("INSERT OR REPLACE INTO kv VALUES('settings',?1)", params![serde_json::to_string(&s)?])?; Ok(s)
    }
    pub fn kv_get(&self, key: &str) -> Result<Option<String>> { Ok(self.conn.query_row("SELECT value FROM kv WHERE key=?1", params![key], |r| r.get(0)).optional()?) }
    pub fn kv_set(&mut self, key: &str, value: &str) -> Result<()> { self.conn.execute("INSERT OR REPLACE INTO kv VALUES(?1,?2)", params![key, value])?; Ok(()) }
    pub fn snapshot(&self) -> Result<Snapshot> { Ok(Snapshot { items: self.items()?, collections: self.collections()?, settings: self.settings()? }) }

    pub fn save_collections(&mut self, cols: &[Collection]) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM collections", [])?;
        for (i, c) in cols.iter().enumerate() { tx.execute("INSERT INTO collections VALUES(?1,?2,?3,?4)", params![c.id, c.name, c.color, i as i64])?; }
        tx.commit()?; Ok(())
    }

    /// The core recomputes `dkey`/`hash` itself; whatever hash the UI sends is ignored.
    pub fn upsert_item(&mut self, it: &Item) -> Result<()> {
        let key = dedupe_key(it.kind, &it.content);
        self.conn.execute(
            "INSERT INTO items(id,kind,title,content,collection_id,tags,pinned,favorite,captured_at,size_bytes,source_app,hash,dkey) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
             ON CONFLICT(id) DO UPDATE SET kind=?2,title=?3,content=?4,collection_id=?5,tags=?6,pinned=?7,favorite=?8,captured_at=?9,size_bytes=?10,source_app=?11,hash=?12,dkey=?13",
            params![it.id, it.kind.as_str(), it.title, it.content, it.collection_id, serde_json::to_string(&it.tags)?, it.pinned as i64, it.favorite as i64,
                    it.captured_at, it.size_bytes, it.source_app, hash_key(&key), key])?;
        Ok(())
    }

    /// Deletes items; returns the image file references that are now orphaned.
    pub fn remove_items(&mut self, ids: &[String]) -> Result<Vec<String>> {
        let tx = self.conn.transaction()?; let mut orphans = vec![];
        for id in ids {
            let img: Option<String> = tx.query_row("SELECT content FROM items WHERE id=?1 AND kind='image'", params![id], |r| r.get(0)).optional()?;
            if let Some(c) = img { orphans.push(c); }
            tx.execute("DELETE FROM items WHERE id=?1", params![id])?;
        }
        tx.commit()?; Ok(orphans)
    }

    pub fn clear_history(&mut self) -> Result<(usize, Vec<String>)> {
        let ids: Vec<String> = { let mut s = self.conn.prepare("SELECT id FROM items WHERE pinned=0 AND favorite=0")?; let v = s.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?; v };
        let o = self.remove_items(&ids)?; Ok((ids.len(), o))
    }

    pub fn restore(&mut self, snap: &Snapshot) -> Result<Vec<String>> {
        let orphans: Vec<String> = { let mut s = self.conn.prepare("SELECT content FROM items WHERE kind='image'")?; let v = s.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?; v };
        { let tx = self.conn.transaction()?; tx.execute("DELETE FROM items", [])?; tx.commit()?; }
        for it in &snap.items { self.upsert_item(it)?; }
        self.save_collections(&snap.collections)?; self.save_settings(&snap.settings)?;
        Ok(orphans)
    }

    pub fn item_count(&self) -> Result<i64> { Ok(self.conn.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))?) }

    /// Insert a capture, or bump an identical existing item to the top. `None` when settings forbid it.
    pub fn capture(&mut self, c: &NewCapture, s: &Settings, manual: bool, now: i64) -> Result<Option<CaptureOutcome>> {
        if !allowed(c.kind, s, c.source_app.as_deref(), manual) { return Ok(None); }
        let kind = c.kind;
        let key = dedupe_key(kind, &c.content); let hash = hash_key(&key);
        let tx = self.conn.transaction()?;
        let existing: Option<Item> = tx.query_row("SELECT * FROM items WHERE hash=?1 AND dkey=?2 LIMIT 1", params![hash, key], row_item).optional()?;
        if let Some(mut it) = existing {
            tx.execute("UPDATE items SET captured_at=?1 WHERE id=?2", params![now, it.id])?; tx.commit()?;
            it.captured_at = now; return Ok(Some(CaptureOutcome { item: it, duplicate: true, orphaned_images: vec![] }));
        }
        let collection: String = match &c.collection_id { Some(x) => x.clone(), None => tx.query_row("SELECT id FROM collections ORDER BY position LIMIT 1", [], |r| r.get(0)).optional()?.unwrap_or_else(|| "personal".into()) };
        let item = Item { id: uuid::Uuid::new_v4().to_string(), kind, title: c.title.clone().unwrap_or_else(|| title_for(kind, &c.content)), content: c.content.clone(), collection_id: collection,
            tags: vec![], pinned: false, favorite: false, captured_at: now, size_bytes: c.size_bytes, source_app: c.source_app.clone(), hash: hash.clone() };
        tx.execute("INSERT INTO items(id,kind,title,content,collection_id,tags,pinned,favorite,captured_at,size_bytes,source_app,hash,dkey) VALUES(?1,?2,?3,?4,?5,'[]',0,0,?6,?7,?8,?9,?10)",
            params![item.id, kind.as_str(), item.title, item.content, item.collection_id, now, item.size_bytes, item.source_app, hash, key])?;
        // Evict the oldest unpinned, non-favourite items beyond the limit.
        let total: i64 = tx.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))?;
        let mut orphans = vec![];
        let over = total - s.max_items as i64;
        if over > 0 {
            let victims: Vec<(String, String, String)> = { let mut st = tx.prepare("SELECT id,kind,content FROM items WHERE pinned=0 AND favorite=0 AND id<>?1 ORDER BY captured_at ASC LIMIT ?2")?;
                let v = st.query_map(params![item.id, over], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<Vec<_>>>()?; v };
            for (id, k, content) in victims { tx.execute("DELETE FROM items WHERE id=?1", params![id])?; if k == "image" { orphans.push(content); } }
        }
        tx.commit()?;
        Ok(Some(CaptureOutcome { item, duplicate: false, orphaned_images: orphans }))
    }

    /// Fold the WAL into the main file (call on graceful shutdown).
    pub fn checkpoint(&self) -> Result<()> { let _: (i64, i64, i64) = self.conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?; Ok(()) }
    pub fn classify(text: &str) -> Kind { classify_text(text) }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn nc(kind: Kind, content: &str) -> NewCapture { NewCapture { kind, content: content.into(), size_bytes: None, source_app: None, collection_id: None, title: None } }

    #[test] fn survives_restart_and_reopen() {
        let dir = tempfile::tempdir().unwrap(); let p = dir.path().join("pb.db"); let s = Settings::default();
        { let (mut d, r) = Db::open(&p).unwrap(); assert!(r.recovered_from.is_none());
          d.capture(&nc(Kind::Text, "persist me"), &s, false, 10).unwrap().unwrap(); d.save_settings(&Settings { accent: "mint".into(), ..Settings::default() }).unwrap(); }
        let (d, _) = Db::open(&p).unwrap(); let snap = d.snapshot().unwrap();
        assert_eq!(snap.items.len(), 1); assert_eq!(snap.items[0].content, "persist me"); assert_eq!(snap.settings.accent, "mint"); assert_eq!(snap.collections.len(), 5);
    }
    #[test] fn committed_data_survives_unclean_exit() {
        // Simulate a crash: copy db+wal while the connection is still open and never checkpointed.
        let dir = tempfile::tempdir().unwrap(); let p = dir.path().join("pb.db"); let s = Settings::default();
        let (mut d, _) = Db::open(&p).unwrap(); d.capture(&nc(Kind::Text, "before crash"), &s, false, 1).unwrap();
        let crash = dir.path().join("crash"); std::fs::create_dir(&crash).unwrap();
        for f in ["pb.db", "pb.db-wal", "pb.db-shm"] { let src = dir.path().join(f); if src.exists() { std::fs::copy(&src, crash.join(f)).unwrap(); } }
        let (d2, _) = Db::open(&crash.join("pb.db")).unwrap(); assert_eq!(d2.items().unwrap()[0].content, "before crash"); drop(d);
    }
    #[test] fn corrupt_database_is_moved_aside_not_deleted() {
        let dir = tempfile::tempdir().unwrap(); let p = dir.path().join("pb.db");
        std::fs::write(&p, b"this is definitely not a sqlite database, just garbage bytes ......................").unwrap();
        let (d, r) = Db::open(&p).unwrap(); let aside = r.recovered_from.expect("recovered");
        assert!(aside.exists()); assert_eq!(d.items().unwrap().len(), 0); assert_eq!(d.collections().unwrap().len(), 5);
    }
    #[test] fn duplicates_bump_instead_of_inserting() {
        let mut d = Db::open_memory().unwrap(); let s = Settings::default();
        let a = d.capture(&nc(Kind::Text, "hello"), &s, false, 1).unwrap().unwrap(); assert!(!a.duplicate);
        let b = d.capture(&nc(Kind::Text, " hello\r\n"), &s, false, 99).unwrap().unwrap();
        assert!(b.duplicate); assert_eq!(b.item.id, a.item.id); assert_eq!(d.item_count().unwrap(), 1); assert_eq!(d.items().unwrap()[0].captured_at, 99);
        assert!(!d.capture(&nc(Kind::Url, "hello"), &s, false, 100).unwrap().unwrap().duplicate, "different kind is a different item");
    }
    #[test] fn file_groups_dedupe_regardless_of_order_and_case() {
        let mut d = Db::open_memory().unwrap(); let s = Settings::default();
        d.capture(&nc(Kind::Group, "C:\\A\\x.txt\nC:\\B\\y.txt"), &s, false, 1).unwrap();
        assert!(d.capture(&nc(Kind::Group, "c:/b/Y.TXT\nc:/a/x.txt"), &s, false, 2).unwrap().unwrap().duplicate);
    }
    #[test] fn eviction_spares_pinned_and_favourites_and_reports_images() {
        let mut d = Db::open_memory().unwrap(); let mut s = Settings::default(); s.max_items = 20;
        let first = d.capture(&nc(Kind::Image, "pbimg:old.png"), &s, false, 1).unwrap().unwrap().item;
        let mut keep = first.clone(); keep.pinned = false; // evictable image
        let pinned = d.capture(&nc(Kind::Text, "pinned"), &s, false, 2).unwrap().unwrap().item; let mut p = pinned; p.pinned = true; d.upsert_item(&p).unwrap();
        let mut orphaned = vec![];
        for i in 0..25 { let r = d.capture(&nc(Kind::Text, &format!("t{i}")), &s, false, 10 + i).unwrap().unwrap(); orphaned.extend(r.orphaned_images); }
        assert_eq!(d.item_count().unwrap(), 20); assert!(d.items().unwrap().iter().any(|i| i.content == "pinned"));
        assert_eq!(orphaned, vec!["pbimg:old.png".to_string()]); let _ = keep;
    }
    #[test] fn respects_pause_exclusions_and_manual() {
        let mut d = Db::open_memory().unwrap(); let mut s = Settings::default(); s.capture.enabled = false;
        assert!(d.capture(&nc(Kind::Text, "x"), &s, false, 1).unwrap().is_none());
        assert!(d.capture(&nc(Kind::Text, "x"), &s, true, 1).unwrap().is_some());
        let mut n = nc(Kind::Text, "secret"); n.source_app = Some("KeePass.exe".into()); assert!(d.capture(&n, &Settings::default(), false, 2).unwrap().is_none());
    }
    #[test] fn upsert_edit_remove_clear_and_collections() {
        let mut d = Db::open_memory().unwrap(); let s = Settings::default();
        let mut a = d.capture(&nc(Kind::Text, "a"), &s, false, 1).unwrap().unwrap().item; let b = d.capture(&nc(Kind::Text, "b"), &s, false, 2).unwrap().unwrap().item;
        a.title = "Renamed".into(); a.tags = vec!["x".into()]; a.favorite = true; a.content = "a edited".into(); d.upsert_item(&a).unwrap();
        let got = d.items().unwrap().into_iter().find(|i| i.id == a.id).unwrap(); assert_eq!(got.title, "Renamed"); assert_eq!(got.tags, vec!["x"]);
        assert!(d.capture(&nc(Kind::Text, "a edited"), &s, false, 5).unwrap().unwrap().duplicate, "edited content is deduped under its new key");
        let (n, _) = d.clear_history().unwrap(); assert_eq!(n, 1); assert_eq!(d.item_count().unwrap(), 1); assert!(d.items().unwrap()[0].favorite);
        let _ = b; d.save_collections(&[Collection { id: "c".into(), name: "C".into(), color: "#fff".into() }]).unwrap(); assert_eq!(d.collections().unwrap().len(), 1);
    }
    #[test] fn restore_replaces_everything() {
        let mut d = Db::open_memory().unwrap(); let s = Settings::default(); d.capture(&nc(Kind::Text, "old"), &s, false, 1).unwrap();
        let mut other = Db::open_memory().unwrap(); other.capture(&nc(Kind::Text, "new"), &s, false, 2).unwrap();
        d.restore(&other.snapshot().unwrap()).unwrap(); let items = d.items().unwrap(); assert_eq!(items.len(), 1); assert_eq!(items[0].content, "new");
    }
    #[test] fn settings_roundtrip_keeps_unknown_fields_and_clamps() {
        let mut d = Db::open_memory().unwrap();
        let raw = r#"{"theme":"dark","accent":"azure","maxItems":3,"offset":9,"futureThing":{"a":1}}"#;
        let s: Settings = serde_json::from_str(raw).unwrap(); let saved = d.save_settings(&s).unwrap();
        assert_eq!(saved.max_items, 20); assert_eq!(saved.offset, 0.9); assert!(d.settings().unwrap().extra.contains_key("futureThing")); assert_eq!(d.settings().unwrap().theme, "dark");
    }
    #[test] fn item_json_matches_typescript_shape() {
        let it = Item { id: "1".into(), kind: Kind::Url, title: "t".into(), content: "c".into(), collection_id: "personal".into(), tags: vec![], pinned: false, favorite: true, captured_at: 5, size_bytes: None, source_app: None, hash: "h".into() };
        let v = serde_json::to_value(&it).unwrap(); assert_eq!(v["collectionId"], "personal"); assert_eq!(v["capturedAt"], 5); assert!(v.get("sizeBytes").is_none());
        let back: Item = serde_json::from_str(r#"{"id":"1","kind":"group","title":"","content":"","collectionId":"p","tags":[],"pinned":false,"favorite":false,"capturedAt":1700000000000,"hash":""}"#).unwrap(); assert_eq!(back.kind, Kind::Group);
    }
}
