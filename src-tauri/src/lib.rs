pub mod commands;
pub mod template;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::template::list_templates,
            commands::template::parse_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
