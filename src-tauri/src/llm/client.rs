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

        // Check if response was truncated (finish_reason == "length")
        let was_truncated = completion.choices.first()
            .and_then(|c| c.finish_reason.as_deref())
            .map(|r| r == "length")
            .unwrap_or(false);

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

        // If the response was truncated, try to recover partial JSON
        if was_truncated {
            tracing::warn!("Response was truncated (finish_reason=length), attempting JSON recovery...");
            if let Some(recovered) = recover_truncated_json(content) {
                if let Ok(agent_response) = serde_json::from_str::<AgentResponse>(&recovered) {
                    tracing::info!("Successfully recovered truncated JSON response");
                    return Ok((agent_response, completion.usage));
                }
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

    /// Call the LLM with a single user prompt and configurable max_tokens.
    /// Used for lightweight evaluation tasks like the watchdog.
    pub async fn call_raw_with_max_tokens(
        &self,
        prompt: &str,
        max_tokens: u32,
    ) -> Result<String, String> {
        let request = serde_json::json!({
            "model": self.model,
            "messages": [
                { "role": "user", "content": prompt }
            ],
            "temperature": 0.3,
            "max_tokens": max_tokens
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

/// Attempt to recover a valid AgentResponse JSON from truncated output.
/// The model often gets cut off mid-response due to max_tokens. We try multiple strategies:
/// 1. Truncate to last complete `}` and close unclosed braces/brackets
/// 2. Build a minimal response from whatever fields we can extract
fn recover_truncated_json(text: &str) -> Option<String> {
    // First, find the start of the JSON object
    let json_start = text.find('{')?;
    let json_text = &text[json_start..];

    // Strategy 1: Find the last complete `}` and try to close remaining braces
    if let Some(result) = try_close_braces(json_text) {
        if serde_json::from_str::<serde_json::Value>(&result).is_ok() {
            return Some(result);
        }
    }

    // Strategy 2: Extract individual fields and rebuild
    let reasoning = extract_json_string_field(json_text, "reasoning").unwrap_or_default();
    let plan = extract_json_string_field(json_text, "plan").unwrap_or_default();

    if reasoning.is_empty() && plan.is_empty() {
        return None;
    }

    // Try to extract complete tool_calls array
    let tool_calls = extract_json_array_field(json_text, "tool_calls").unwrap_or_else(|| "[]".to_string());
    let canvas_ops = extract_json_array_field(json_text, "canvas_operations").unwrap_or_else(|| "[]".to_string());
    let chat_message = extract_json_string_field(json_text, "chat_message");

    let chat_msg_json = match chat_message {
        Some(msg) => format!("\"{}\"", escape_json_string(&msg)),
        None => "null".to_string(),
    };

    Some(format!(
        r#"{{"reasoning":"{}","plan":"{}","tool_calls":{},"canvas_operations":{},"chat_message":{}}}"#,
        escape_json_string(&reasoning),
        escape_json_string(&plan),
        tool_calls,
        canvas_ops,
        chat_msg_json
    ))
}

/// Try to close unclosed braces/brackets in truncated JSON.
fn try_close_braces(text: &str) -> Option<String> {
    let mut in_string = false;
    let mut escape_next = false;
    let mut stack: Vec<char> = Vec::new();
    let mut last_complete_pos = 0;

    for (i, ch) in text.char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape_next = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        match ch {
            '{' => stack.push('}'),
            '[' => stack.push(']'),
            '}' | ']' => {
                if stack.last() == Some(&ch) {
                    stack.pop();
                    if stack.is_empty() {
                        last_complete_pos = i;
                    }
                }
            }
            _ => {}
        }
    }

    if stack.is_empty() && last_complete_pos > 0 {
        // Already complete up to last_complete_pos
        return Some(text[..=last_complete_pos].to_string());
    }

    // If we're inside a string, close it first, then try to trim back to
    // a clean position before closing braces
    let mut result = text.to_string();

    if in_string {
        // We're inside a string value that was cut off. Truncate to the last
        // unescaped quote boundary or just close the string.
        result.push('"');
    }

    // Close all unclosed brackets/braces in reverse order
    for closer in stack.iter().rev() {
        result.push(*closer);
    }

    Some(result)
}

/// Extract a string field value from partial JSON like `"field": "value"`.
fn extract_json_string_field(json: &str, field: &str) -> Option<String> {
    let pattern = format!("\"{}\"", field);
    let field_start = json.find(&pattern)?;
    let after_key = &json[field_start + pattern.len()..];

    // Skip whitespace and colon
    let after_colon = after_key.trim_start();
    let after_colon = after_colon.strip_prefix(':')?;
    let after_colon = after_colon.trim_start();

    if !after_colon.starts_with('"') {
        return None;
    }

    // Parse the string value (handling escapes)
    let mut chars = after_colon[1..].chars();
    let mut value = String::new();
    let mut escape = false;
    for ch in chars.by_ref() {
        if escape {
            value.push(ch);
            escape = false;
        } else if ch == '\\' {
            value.push(ch);
            escape = true;
        } else if ch == '"' {
            return Some(unescape_json_string(&value));
        } else {
            value.push(ch);
        }
    }

    // String was truncated — return what we have
    Some(unescape_json_string(&value))
}

/// Extract an array field from partial JSON. Only returns if the array is complete.
fn extract_json_array_field(json: &str, field: &str) -> Option<String> {
    let pattern = format!("\"{}\"", field);
    let field_start = json.find(&pattern)?;
    let after_key = &json[field_start + pattern.len()..];

    let after_colon = after_key.trim_start();
    let after_colon = after_colon.strip_prefix(':')?;
    let after_colon = after_colon.trim_start();

    if !after_colon.starts_with('[') {
        return None;
    }

    // Find matching bracket
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape_next = false;

    for (i, ch) in after_colon.char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape_next = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    let array_str = &after_colon[..=i];
                    // Validate it's parseable
                    if serde_json::from_str::<serde_json::Value>(array_str).is_ok() {
                        return Some(array_str.to_string());
                    }
                    return None;
                }
            }
            _ => {}
        }
    }

    None
}

fn escape_json_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn unescape_json_string(s: &str) -> String {
    s.replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
        .replace("\\\"", "\"")
        .replace("\\\\", "\\")
}
