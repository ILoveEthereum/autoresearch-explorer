use std::sync::Arc;
use tokio::sync::watch;

use crate::agent::runtime::LoopControl;
use crate::agent::signals::{HumanSignal, SignalQueue};

/// Configuration for the Telegram bot integration.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TelegramConfig {
    pub bot_token: String,
    pub chat_id: i64,
    pub notify_every_n_loops: u32,
    pub notify_on_stuck: bool,
    pub notify_on_complete: bool,
}

/// A lightweight Telegram bot that uses the Bot API via reqwest.
pub struct TelegramBot {
    config: TelegramConfig,
    client: reqwest::Client,
}

impl TelegramBot {
    pub fn new(config: TelegramConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    pub fn config(&self) -> &TelegramConfig {
        &self.config
    }

    /// Send a text message to the configured chat.
    pub async fn send_message(&self, text: &str) -> Result<(), String> {
        let url = format!(
            "https://api.telegram.org/bot{}/sendMessage",
            self.config.bot_token
        );
        self.client
            .post(&url)
            .json(&serde_json::json!({
                "chat_id": self.config.chat_id,
                "text": text,
                "parse_mode": "Markdown"
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Send a progress summary after N loops.
    pub async fn send_progress(&self, session_name: &str, loop_index: u32, summary: &str) {
        let msg = format!(
            "\u{1f52c} *{}* \u{2014} Loop {} Update\n\n{}",
            escape_markdown(session_name),
            loop_index,
            escape_markdown(summary)
        );
        let _ = self.send_message(&msg).await;
    }

    /// Send a notification when the watchdog says the agent is stuck / needs input.
    pub async fn send_stuck(&self, session_name: &str, question: &str) {
        let msg = format!(
            "\u{1f52c} *{}* \u{2014} Needs Input\n\n{}\n\nReply with instructions or \"skip\" to move on.",
            escape_markdown(session_name),
            escape_markdown(question)
        );
        let _ = self.send_message(&msg).await;
    }

    /// Send a completion notification.
    pub async fn send_completion(&self, session_name: &str, reason: &str) {
        let msg = format!(
            "\u{2705} *{}* \u{2014} Research Complete\n\n{}",
            escape_markdown(session_name),
            escape_markdown(reason)
        );
        let _ = self.send_message(&msg).await;
    }

    /// Start long-polling for incoming Telegram messages.
    /// Runs until the shutdown signal is received.
    pub async fn start_polling(
        &self,
        signal_queue: Arc<SignalQueue>,
        control_tx: watch::Sender<LoopControl>,
        shutdown: watch::Receiver<bool>,
    ) {
        let mut offset: i64 = 0;

        loop {
            // Check shutdown
            if *shutdown.borrow() {
                break;
            }

            let url = format!(
                "https://api.telegram.org/bot{}/getUpdates?offset={}&timeout=5",
                self.config.bot_token, offset
            );

            match self.client.get(&url).send().await {
                Ok(resp) => {
                    if let Ok(body) = resp.json::<serde_json::Value>().await {
                        if let Some(updates) = body["result"].as_array() {
                            for update in updates {
                                if let Some(msg) = update["message"]["text"].as_str() {
                                    offset =
                                        update["update_id"].as_i64().unwrap_or(offset) + 1;
                                    self.handle_command(msg, &signal_queue, &control_tx)
                                        .await;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Telegram polling error: {}", e);
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }
    }

    async fn handle_command(
        &self,
        text: &str,
        signal_queue: &SignalQueue,
        control_tx: &watch::Sender<LoopControl>,
    ) {
        let cmd = text.trim().to_lowercase();
        match cmd.as_str() {
            "stop" | "/stop" => {
                let _ = control_tx.send(LoopControl::Stop);
                let _ = self.send_message("\u{23f9} Session stopped.").await;
            }
            "resume" | "/resume" => {
                let _ = control_tx.send(LoopControl::Run);
                let _ = self.send_message("\u{25b6}\u{fe0f} Session resumed.").await;
            }
            "pause" | "/pause" => {
                let _ = control_tx.send(LoopControl::Pause);
                let _ = self.send_message("\u{23f8}\u{fe0f} Session paused.").await;
            }
            "status" | "/status" => {
                let _ = self
                    .send_message("\u{1f4ca} Use the app for detailed status.")
                    .await;
            }
            "skip" | "/skip" => {
                signal_queue.push(HumanSignal::Chat {
                    text: "Skip this sub-question and move on to something else.".to_string(),
                    referenced_nodes: vec![],
                });
                let _ = self
                    .send_message("\u{23ed} Skipping current sub-question.")
                    .await;
            }
            _ => {
                // Treat as a chat message / instruction
                signal_queue.push(HumanSignal::Chat {
                    text: text.to_string(),
                    referenced_nodes: vec![],
                });
                let _ = self
                    .send_message(&format!(
                        "\u{1f4dd} Instruction received: {}",
                        text
                    ))
                    .await;
            }
        }
    }
}

/// Load telegram config from the app data directory config.json
pub fn load_config() -> Option<TelegramConfig> {
    let config_path = crate::storage::app_data_dir().join("config.json");
    let data = std::fs::read_to_string(config_path).ok()?;
    let val: serde_json::Value = serde_json::from_str(&data).ok()?;

    let bot_token = val.get("telegram_bot_token")?.as_str()?.to_string();
    if bot_token.is_empty() {
        return None;
    }
    let chat_id = val.get("telegram_chat_id")?.as_i64()?;
    let notify_every = val
        .get("notify_every_n_loops")
        .and_then(|v| v.as_u64())
        .unwrap_or(10) as u32;
    let notify_stuck = val
        .get("notify_on_stuck")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let notify_complete = val
        .get("notify_on_complete")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    Some(TelegramConfig {
        bot_token,
        chat_id,
        notify_every_n_loops: notify_every,
        notify_on_stuck: notify_stuck,
        notify_on_complete: notify_complete,
    })
}

/// Save telegram config to the app data directory config.json
pub fn save_config(config: &TelegramConfig) -> Result<(), String> {
    let config_dir = crate::storage::app_data_dir();
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    // Read existing config to preserve other fields
    let mut existing: serde_json::Value = if config_path.exists() {
        let data = std::fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let obj = existing.as_object_mut().ok_or("Config is not a JSON object")?;
    obj.insert(
        "telegram_bot_token".to_string(),
        serde_json::Value::String(config.bot_token.clone()),
    );
    obj.insert(
        "telegram_chat_id".to_string(),
        serde_json::json!(config.chat_id),
    );
    obj.insert(
        "notify_every_n_loops".to_string(),
        serde_json::json!(config.notify_every_n_loops),
    );
    obj.insert(
        "notify_on_stuck".to_string(),
        serde_json::json!(config.notify_on_stuck),
    );
    obj.insert(
        "notify_on_complete".to_string(),
        serde_json::json!(config.notify_on_complete),
    );

    let json_str =
        serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json_str).map_err(|e| e.to_string())?;
    Ok(())
}

/// Escape characters that break Markdown v1 formatting in Telegram.
fn escape_markdown(text: &str) -> String {
    text.replace('_', "\\_")
        .replace('*', "\\*")
        .replace('[', "\\[")
        .replace('`', "\\`")
}
