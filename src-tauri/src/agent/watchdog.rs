use serde::{Deserialize, Serialize};

use crate::canvas::state::CanvasState;
use crate::llm::client::LlmClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "verdict")]
pub enum WatchdogVerdict {
    #[serde(rename = "progressing")]
    Progressing,
    #[serde(rename = "stuck_no_info")]
    StuckNoInfo { description: String },
    #[serde(rename = "stuck_code_error")]
    StuckCodeError { error: String },
    #[serde(rename = "stuck_looping")]
    StuckLooping { repeated_action: String },
    #[serde(rename = "phase_complete")]
    PhaseComplete { reason: String },
    #[serde(rename = "needs_human")]
    NeedsHuman { question: String },
}

pub struct LoopSnapshot {
    pub loop_index: u32,
    pub plan: String,
    pub tools_called: Vec<String>,
    pub canvas_ops_count: u32,
}

pub async fn evaluate(
    llm_client: &LlmClient,
    canvas_state: &CanvasState,
    recent_loops: &[LoopSnapshot],
    success_criteria: &str,
    loop_count: u32,
) -> Result<WatchdogVerdict, String> {
    let criteria_display = if success_criteria.is_empty() {
        "No explicit success criteria set. Use your judgement on whether research is thorough."
            .to_string()
    } else {
        success_criteria.to_string()
    };

    let prompt = format!(
        r#"You are evaluating whether a research session is making progress.

SUCCESS CRITERIA:
"{}"

CURRENT STATE:
- Total loops completed: {}
- Total nodes: {}
- Total edges: {}

LAST {} LOOPS:
{}

Evaluate:
1. Is the agent making meaningful progress toward the success criteria?
2. Is it repeating the same actions without results?
3. Are the success criteria met?

Reply with ONLY valid JSON (no markdown):
{{"verdict": "progressing"}}
OR {{"verdict": "stuck_looping", "repeated_action": "what it keeps doing"}}
OR {{"verdict": "stuck_no_info", "description": "what info it can't find"}}
OR {{"verdict": "stuck_code_error", "error": "what error keeps happening"}}
OR {{"verdict": "phase_complete", "reason": "why research is done"}}
OR {{"verdict": "needs_human", "question": "what to ask the user"}}"#,
        criteria_display,
        loop_count,
        canvas_state.nodes.len(),
        canvas_state.edges.len(),
        recent_loops.len(),
        format_loop_snapshots(recent_loops),
    );

    match llm_client
        .call_raw_with_max_tokens(&prompt, 200)
        .await
    {
        Ok(text) => parse_verdict(&text),
        Err(e) => {
            tracing::warn!("Watchdog evaluation failed: {}", e);
            Ok(WatchdogVerdict::Progressing)
        }
    }
}

fn format_loop_snapshots(loops: &[LoopSnapshot]) -> String {
    loops
        .iter()
        .map(|l| {
            format!(
                "Loop {}: plan=\"{}\", tools=[{}], canvas_ops={}",
                l.loop_index,
                l.plan,
                l.tools_called.join(", "),
                l.canvas_ops_count,
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_verdict(text: &str) -> Result<WatchdogVerdict, String> {
    let trimmed = text.trim();

    // Try direct parse
    if let Ok(v) = serde_json::from_str::<WatchdogVerdict>(trimmed) {
        return Ok(v);
    }

    // Try extracting JSON from markdown code blocks
    let json_str = extract_json_block(trimmed);
    if let Some(json) = json_str {
        if let Ok(v) = serde_json::from_str::<WatchdogVerdict>(&json) {
            return Ok(v);
        }
    }

    // Try finding { ... } in the text
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            let candidate = &trimmed[start..=end];
            if let Ok(v) = serde_json::from_str::<WatchdogVerdict>(candidate) {
                return Ok(v);
            }
        }
    }

    tracing::warn!(
        "Could not parse watchdog verdict, defaulting to Progressing. Raw: {}",
        &trimmed[..trimmed.len().min(300)]
    );
    Ok(WatchdogVerdict::Progressing)
}

fn extract_json_block(text: &str) -> Option<String> {
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
            if inner.starts_with('{') {
                return Some(inner.to_string());
            }
        }
    }
    None
}
