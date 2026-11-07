//! MyPinboard core. No Windows or Tauri dependency: everything here runs and is tested on any OS.
pub mod capture;
pub mod db;
pub mod geometry;
pub mod hashing;
pub mod ingest;
pub mod model;
pub mod settings;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Msg(String),
}
pub type Result<T> = std::result::Result<T, Error>;
