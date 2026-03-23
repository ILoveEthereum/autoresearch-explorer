pub mod agent;
pub mod canvas;
pub mod commands;
pub mod llm;
pub mod memory;
pub mod storage;
pub mod telegram;
pub mod template;
pub mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::session::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::template::list_templates,
            commands::template::parse_template,
            commands::session::create_session,
            commands::session::pause_session,
            commands::session::resume_session,
            commands::session::stop_session,
            commands::session::load_session,
            commands::session::get_loop_ops,
            commands::session::get_loop_detail,
            commands::session::list_sessions,
            commands::session::resume_saved_session,
            commands::session::list_checkpoints,
            commands::session::branch_from_checkpoint,
            commands::session::list_canvases,
            commands::session::get_canvas_state,
            commands::chat::send_chat,
            commands::chat::send_signal,
            commands::chat::save_chat,
            commands::chat::load_chat,
            commands::export::export_file,
            commands::config::fetch_models,
            commands::memory::search_memory,
            commands::memory::list_available_tools,
            commands::memory::list_skill_docs,
            commands::telegram::save_telegram_config,
            commands::telegram::load_telegram_config,
            commands::telegram::test_telegram_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
