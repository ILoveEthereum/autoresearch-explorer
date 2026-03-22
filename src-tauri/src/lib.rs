pub mod agent;
pub mod canvas;
pub mod commands;
pub mod llm;
pub mod storage;
pub mod template;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(commands::session::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::template::list_templates,
            commands::template::parse_template,
            commands::session::create_session,
            commands::session::pause_session,
            commands::session::resume_session,
            commands::session::stop_session,
            commands::session::list_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
