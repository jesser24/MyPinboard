use crate::settings::Settings;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind { Text, Url, Image, File, Folder, Group }

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self { Kind::Text => "text", Kind::Url => "url", Kind::Image => "image", Kind::File => "file", Kind::Folder => "folder", Kind::Group => "group" }
    }
    pub fn parse(s: &str) -> Kind {
        match s { "url" => Kind::Url, "image" => Kind::Image, "file" => Kind::File, "folder" => Kind::Folder, "group" => Kind::Group, _ => Kind::Text }
    }
    pub fn is_path_kind(self) -> bool { matches!(self, Kind::File | Kind::Folder | Kind::Group) }
}

/// JSON shape is identical to the TypeScript `PinItem`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub kind: Kind,
    pub title: String,
    pub content: String,
    pub collection_id: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub favorite: bool,
    pub captured_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_app: Option<String>,
    #[serde(default)]
    pub hash: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Collection { pub id: String, pub name: String, pub color: String }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Snapshot { pub items: Vec<Item>, pub collections: Vec<Collection>, pub settings: Settings }

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NewCapture {
    pub kind: Kind,
    pub content: String,
    #[serde(default)]
    pub size_bytes: Option<i64>,
    #[serde(default)]
    pub source_app: Option<String>,
    #[serde(default)]
    pub collection_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CaptureOutcome {
    pub item: Item,
    pub duplicate: bool,
    /// Image files no longer referenced after eviction; the caller deletes them from disk.
    pub orphaned_images: Vec<String>,
}

pub fn default_collections() -> Vec<Collection> {
    [("personal", "Personal", "#8b6cf7"), ("studies", "Studies", "#38bdf8"), ("development", "Development", "#34d399"),
     ("work", "Work", "#f59e0b"), ("temporary", "Temporary", "#94a3b8")]
        .iter().map(|(i, n, c)| Collection { id: (*i).into(), name: (*n).into(), color: (*c).into() }).collect()
}
