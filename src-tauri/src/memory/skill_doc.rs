use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;

/// Generate a skill document and summary for a completed session.
/// Returns (skill_doc_content, summary).
pub async fn generate_skill_doc(
    llm_client: &LlmClient,
    session_name: &str,
    question: &str,
    canvas_state: &CanvasState,
) -> Result<(String, String), String> {
    let node_summaries: Vec<String> = canvas_state
        .nodes
        .iter()
        .take(30) // Limit to keep context manageable
        .map(|n| format!("- [{}] {}: {}", n.node_type, n.title, n.summary))
        .collect();

    let prompt = format!(
        r#"A research session just completed. Generate a skill document.

Session: "{}"
Question: "{}"

Nodes created during research:
{}

Generate a skill document in this exact format:

# What Worked
- (bullet points of successful strategies, tools, and approaches)

# What Failed
- (bullet points of things that didn't work and why)

# Key Sources
- (important sources found, with URLs if available)

# Recommended Approach
1. (numbered steps for someone doing similar research)

Also generate a 1-2 sentence SUMMARY of the entire session.

Reply with JSON:
{{"skill_doc": "the full markdown skill document", "summary": "1-2 sentence summary"}}"#,
        session_name,
        question,
        node_summaries.join("\n"),
    );

    let response = llm_client.call_raw_with_max_tokens(&prompt, 1000).await?;

    parse_skill_response(&response)
}

fn parse_skill_response(text: &str) -> Result<(String, String), String> {
    // Try to extract JSON from the response
    let json_str = extract_json_block(text).unwrap_or_else(|| text.to_string());

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
        let skill_doc = parsed
            .get("skill_doc")
            .and_then(|v| v.as_str())
            .unwrap_or(text)
            .to_string();
        let summary = parsed
            .get("summary")
            .and_then(|v| v.as_str())
            .unwrap_or("Session completed.")
            .to_string();
        return Ok((skill_doc, summary));
    }

    // Fallback: use raw text as skill doc
    Ok((text.to_string(), "Session completed.".to_string()))
}

/// Try to extract a JSON object from text that might contain markdown code blocks.
fn extract_json_block(text: &str) -> Option<String> {
    // Try ```json ... ```
    if let Some(start) = text.find("```json") {
        let after = &text[start + 7..];
        if let Some(end) = after.find("```") {
            return Some(after[..end].trim().to_string());
        }
    }
    // Try ``` ... ```
    if let Some(start) = text.find("```") {
        let after = &text[start + 3..];
        if let Some(end) = after.find("```") {
            let inner = after[..end].trim();
            if inner.starts_with('{') {
                return Some(inner.to_string());
            }
        }
    }
    // Try to find outermost { ... }
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
