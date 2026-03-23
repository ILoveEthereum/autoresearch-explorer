use crate::telegram::bot::{self, TelegramConfig};

#[tauri::command]
pub fn save_telegram_config(
    token: String,
    chat_id: i64,
    notify_every: u32,
    notify_stuck: bool,
    notify_complete: bool,
) -> Result<(), String> {
    let config = TelegramConfig {
        bot_token: token,
        chat_id,
        notify_every_n_loops: notify_every,
        notify_on_stuck: notify_stuck,
        notify_on_complete: notify_complete,
    };
    bot::save_config(&config)
}

#[tauri::command]
pub fn load_telegram_config() -> Result<Option<TelegramConfig>, String> {
    Ok(bot::load_config())
}

#[tauri::command]
pub async fn test_telegram_connection(token: String, chat_id: i64) -> Result<String, String> {
    let config = TelegramConfig {
        bot_token: token,
        chat_id,
        notify_every_n_loops: 10,
        notify_on_stuck: true,
        notify_on_complete: true,
    };
    let bot = bot::TelegramBot::new(config);
    bot.send_message("\u{2705} Autoresearch connected successfully!")
        .await?;
    Ok("Test message sent!".to_string())
}
