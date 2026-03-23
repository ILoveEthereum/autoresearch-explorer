use super::types::*;

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL: &str = "qwen/qwen-2.5-72b-instruct";

pub struct LlmClient {
    http: reqwest::Client,
    api_key: String,
    model: String,
}

impl LlmClient {
    pub fn new(api_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            api_key,
            model: DEFAULT_MODEL.to_string(),
        }
    }

    pub fn with_model(mut self, model: String) -> Self {
        self.model = model;
        self
    }

    /// Call the LLM and parse the response as an AgentResponse.
    /// First tries with response_format: json_object. If the model doesn't
    /// support it (empty response), retries without it and extracts JSON.
    pub async fn call(
        &self,
        system_prompt: &str,
        user_message: &str,
    ) -> Result<(AgentResponse, Option<Usage>), String> {
        // Attempt 1: Try with json_object response format
        match self.call_with_format(system_prompt, user_message, true).await {
            Ok(result) => return Ok(result),
            Err(e) => {
                tracing::warn!("JSON mode failed ({}), retrying without response_format...", e);
            }
        }

        // Attempt 2-3: Try without response_format (works with all models)
        let max_retries = 2;
        let mut last_error = String::new();

        for attempt in 1..=max_retries {
            match self.call_with_format(system_prompt, user_message, false).await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    last_error = e.clone();
                    tracing::warn!("LLM call attempt {}/{} (no format) failed: {}", attempt, max_retries, e);
                    if attempt < max_retries {
                        tokio::time::sleep(std::time::Duration::from_secs(attempt as u64)).await;
                    }
                }
            }
        }

        Err(format!("LLM call failed after all attempts. Last error: {}", last_error))
    }

    async fn call_with_format(
        &self,
        system_prompt: &str,
        user_message: &str,
        use_json_format: bool,
    ) -> Result<(AgentResponse, Option<Usage>), String> {
        let response_format = if use_json_format {
            Some(ResponseFormat {
                format_type: "json_object".to_string(),
            })
        } else {
            None
        };

        // Rough token estimate (~4 chars per token) and truncate if too large
        let total_chars = system_prompt.len() + user_message.len();
        let estimated_tokens = total_chars / 4;
        tracing::info!("LLM call: model={}, ~{} input tokens, {} chars (system={}, user={})",
            self.model, estimated_tokens, total_chars, system_prompt.len(), user_message.len());

        // Truncate user message if it's extremely large (keep last part which has current state)
        let user_msg = if user_message.len() > 60_000 {
            tracing::warn!("User message too large ({}), truncating to last 60000 chars", user_message.len());
            let truncated = &user_message[user_message.len() - 60_000..];
            format!("[... earlier context truncated ...]\n{}", truncated)
        } else {
            user_message.to_string()
        };

        let request = ChatCompletionRequest {
            model: self.model.clone(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: user_msg,
                },
            ],
            temperature: 0.7,
            max_tokens: 4096,
            response_format,
        };

        let response = self
            .http
            .post(OPENROUTER_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("HTTP-Referer", "https://autoresearch.app")
            .header("X-Title", "Autoresearch")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("LLM API error ({}): {}", status, body));
        }

        let body_text = response.text().await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        if body_text.trim().is_empty() {
            return Err("LLM returned empty response body".to_string());
        }

        let completion: ChatCompletionResponse = serde_json::from_str(&body_text)
            .map_err(|e| format!("Failed to parse LLM API response: {}. Body: {}", e, &body_text[..body_text.len().min(500)]))?;

        let content = completion
            .choices
            .first()
            .and_then(|c| c.message.content.as_ref())
            .ok_or("No content in LLM response (empty choices)")?;

        let content = content.trim();
        if content.is_empty() {
            let finish_reason = completion.choices.first()
                .map(|c| c.finish_reason.clone().unwrap_or_default())
                .unwrap_or_default();
            let usage_info = completion.usage.as_ref()
                .map(|u| format!("prompt_tokens={}, completion_tokens={}", u.prompt_tokens.unwrap_or(0), u.completion_tokens.unwrap_or(0)))
                .unwrap_or_else(|| "no usage data".to_string());
            return Err(format!(
                "LLM returned empty content. finish_reason={}, {}. Model may not support this prompt size or format.",
                finish_reason, usage_info
            ));
        }

        // Try direct JSON parse first
        if let Ok(agent_response) = serde_json::from_str::<AgentResponse>(content) {
            return Ok((agent_response, completion.usage));
        }

        // If direct parse fails, try to extract JSON from the text
        // (model might wrap JSON in markdown code blocks or add explanation text)
        if let Some(json_str) = extract_json(content) {
            if let Ok(agent_response) = serde_json::from_str::<AgentResponse>(&json_str) {
                return Ok((agent_response, completion.usage));
            }
        }

        Err(format!(
            "Failed to parse agent response JSON from content.\nRaw content (first 800 chars): {}",
            &content[..content.len().min(800)]
        ))
    }

    /// Call the LLM and return the raw text response (no JSON parsing).
    /// Used for overview generation and other freeform text tasks.
    pub async fn call_raw(
        &self,
        system_prompt: &str,
        user_message: &str,
    ) -> Result<String, String> {
        let request = serde_json::json!({
            "model": self.model,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_message }
            ],
            "temperature": 0.7,
            "max_tokens": 2048
        });

        let response = self
            .http
            .post(OPENROUTER_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("HTTP-Referer", "https://autoresearch.app")
            .header("X-Title", "Autoresearch")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("LLM API error ({}): {}", status, body));
        }

        let completion: ChatCompletionResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

        completion
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .ok_or_else(|| "No content in LLM response".to_string())
    }
}

/// Try to extract a JSON object from text that might contain markdown
/// code blocks, explanatory text, or other wrapping.
fn extract_json(text: &str) -> Option<String> {
    // Try to find JSON inside ```json ... ``` or ``` ... ```
    if let Some(start) = text.find("```json") {
        let after = &text[start + 7..];
        if let Some(end) = after.find("```") {
            return Some(after[..end].trim().to_string());
        }
    }
    if let Some(start) = text.find("```") {
        let after = &text[start + 3..];
        if let Some(end) = after.find("```") {
            let inner = after[..end].trim();
            // Make sure it looks like JSON
            if inner.starts_with('{') {
                return Some(inner.to_string());
            }
        }
    }

    // Try to find the outermost { ... } by matching braces
    let mut depth = 0i32;
    let mut start_idx = None;
    for (i, ch) in text.char_indices() {
        match ch {
            '{' => {
                if depth == 0 {
                    start_idx = Some(i);
                }
                depth += 1;
            }
            '}' => {
                depth -= 1;
                if depth == 0 {
                    if let Some(si) = start_idx {
                        return Some(text[si..=i].to_string());
                    }
                }
            }
            _ => {}
        }
    }

    None
}
