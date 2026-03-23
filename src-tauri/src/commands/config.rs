use serde::Serialize;

const OPENROUTER_MODELS_URL: &str = "https://openrouter.ai/api/v1/models";

#[derive(Debug, Serialize)]
pub struct ModelPricing {
    pub prompt: String,
    pub completion: String,
}

#[derive(Debug, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: u64,
    pub pricing: ModelPricing,
}

#[tauri::command]
pub async fn fetch_models(api_key: String) -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(OPENROUTER_MODELS_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("HTTP-Referer", "https://autoresearch.app")
        .header("X-Title", "Autoresearch")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenRouter API error ({}): {}", status, body));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    let data = body
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or("Invalid models response: missing data array")?;

    let mut models: Vec<ModelInfo> = data
        .iter()
        .filter_map(|m| {
            let id = m.get("id")?.as_str()?.to_string();
            let name = m.get("name")?.as_str()?.to_string();
            let context_length = m.get("context_length")?.as_u64().unwrap_or(0);
            let pricing_obj = m.get("pricing")?;
            let prompt = pricing_obj
                .get("prompt")
                .and_then(|p| p.as_str())
                .unwrap_or("0")
                .to_string();
            let completion = pricing_obj
                .get("completion")
                .and_then(|p| p.as_str())
                .unwrap_or("0")
                .to_string();

            Some(ModelInfo {
                id,
                name,
                context_length,
                pricing: ModelPricing { prompt, completion },
            })
        })
        .collect();

    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(models)
}
