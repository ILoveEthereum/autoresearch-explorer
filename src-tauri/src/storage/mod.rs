pub mod global_index;
pub mod session_dir;
pub mod loop_writer;
pub mod state_writer;
pub mod overview_writer;

use std::path::PathBuf;

/// Returns the app data directory for Autoresearch.
/// Tries the standard macOS Application Support location first,
/// falls back to ./data/ for development.
pub fn app_data_dir() -> PathBuf {
    let home = dirs_next::home_dir().unwrap_or_default();
    let dir = home.join("Library/Application Support/com.autoresearch.app");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}
