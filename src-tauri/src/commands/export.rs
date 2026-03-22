use std::path::PathBuf;

/// Write export content directly to the user's Desktop.
#[tauri::command]
pub fn export_file(filename: String, content: String) -> Result<String, String> {
    let desktop = dirs_next::desktop_dir()
        .or_else(|| dirs_next::home_dir().map(|h| h.join("Desktop")))
        .unwrap_or_else(|| PathBuf::from("."));

    let path = desktop.join(&filename);
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write export: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}
