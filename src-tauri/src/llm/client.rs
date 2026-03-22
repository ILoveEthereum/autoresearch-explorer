use super::types::*;

const DEEPINFRA_URL: &str = "https://api.deepinfra.com/v1/openai/chat/completions";
const DEFAULT_MODEL: &str = "Qwen/Qwen2.5-72B-Instruct";

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
    pub async fn call(
        &self,
        system_prompt: &str,
        user_message: &str,
    ) -> Result<(AgentResponse, Option<Usage>), String> {
        let request = ChatCompletionRequest {
            model: self.model.clone(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: user_message.to_string(),
                },
            ],
            temperature: 0.7,
            max_tokens: 4096,
            response_format: ResponseFormat {
                format_type: "json_object".to_string(),
            },
        };

        let response = self
            .http
            .post(DEEPINFRA_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
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

        let content = completion
            .choices
            .first()
            .and_then(|c| c.message.content.as_ref())
            .ok_or("No content in LLM response")?;

        let agent_response: AgentResponse = serde_json::from_str(content)
            .map_err(|e| format!("Failed to parse agent response JSON: {}.\nRaw content: {}", e, content))?;

        Ok((agent_response, completion.usage))
    }
}
