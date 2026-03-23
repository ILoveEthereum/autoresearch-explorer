use crate::llm::client::LlmClient;
use std::path::Path;

/// Update the overview.md file after each loop.
///
/// `canvas_dir` — where loops live (e.g. `autoresearch/canvases/main/`)
/// `overview_path` — where to write the overview (e.g. `{working_dir}/overview.md`)
pub async fn update_overview(
    canvas_dir: &Path,
    overview_path: &Path,
    loop_index: u32,
    session_name: &str,
    llm_client: &LlmClient,
) -> Result<(), String> {
    // Read current overview
    let current_overview = std::fs::read_to_string(overview_path).unwrap_or_default();

    // Read the latest loop's files
    let loop_dir = canvas_dir.join("loops").join(format!("{:03}", loop_index));
    let process = std::fs::read_to_string(loop_dir.join("process.md")).unwrap_or_default();
    let explanation = std::fs::read_to_string(loop_dir.join("explanation.md")).unwrap_or_default();

    let system_prompt = "You are a research documentation assistant. You maintain a living overview document for an ongoing research session. Write concise, clear Markdown. Do NOT wrap your response in code fences or JSON — just output the Markdown directly.";

    let user_message = format!(
        r#"Update this research overview based on the latest loop.

SESSION: {}
LOOP: {}

CURRENT OVERVIEW:
{}

LATEST LOOP PLAN:
{}

LATEST LOOP REASONING:
{}

Write the full updated overview with these sections:
- Current State (1-2 sentences)
- Key Findings (numbered list)
- Active Branches (what's being explored)
- Statistics (total loops so far: {})"#,
        session_name,
        loop_index,
        if current_overview.len() > 100 { &current_overview } else { "New session, no overview yet." },
        process,
        explanation,
        loop_index
    );

    match llm_client.call_raw(&system_prompt, &user_message).await {
        Ok(content) => {
            let overview = format!(
                "# {} — Research Overview\n\n**Last Updated:** {} | **Loop:** {}\n\n---\n\n{}",
                session_name,
                chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
                loop_index,
                content.trim()
            );
            std::fs::write(&overview_path, overview)
                .map_err(|e| format!("Failed to write overview.md: {}", e))?;
        }
        Err(e) => {
            tracing::warn!("Failed to update overview: {}", e);
            // Write a simple fallback
            let fallback = format!(
                "# {} — Research Overview\n\n**Loop:** {} | **Last Updated:** {}\n\n*Overview generation pending.*\n",
                session_name,
                loop_index,
                chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
            );
            let _ = std::fs::write(&overview_path, fallback);
        }
    }

    Ok(())
}
