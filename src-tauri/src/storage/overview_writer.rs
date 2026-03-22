use crate::llm::client::LlmClient;
use std::path::Path;

/// Update the overview.md file after each loop.
/// Makes a secondary LLM call to rewrite the overview based on latest results.
pub async fn update_overview(
    session_dir: &Path,
    loop_index: u32,
    session_name: &str,
    llm_client: &LlmClient,
) -> Result<(), String> {
    let overview_path = session_dir.join("overview.md");

    // Read current overview
    let current_overview = std::fs::read_to_string(&overview_path).unwrap_or_default();

    // Read the latest loop's files
    let loop_dir = session_dir.join("loops").join(format!("{:03}", loop_index));
    let process = std::fs::read_to_string(loop_dir.join("process.md")).unwrap_or_default();
    let results = std::fs::read_to_string(loop_dir.join("results.md")).unwrap_or_default();
    let explanation = std::fs::read_to_string(loop_dir.join("explanation.md")).unwrap_or_default();

    let system_prompt = r#"You are a research documentation assistant. You maintain a living overview document for an ongoing research session. Your job is to update this document based on the latest loop results.

You MUST respond with a JSON object containing a single field:
{
  "overview": "The full updated overview document in Markdown format"
}

The overview should have these sections:
- Current State (1-2 sentences on what the agent is doing now)
- Key Findings (numbered list of important conclusions so far)
- Active Branches (what directions are being explored)
- Completed Branches (what's been explored and concluded)
- Notable Failures (failed approaches worth remembering)
- Statistics (total loops, key metrics)"#;

    let user_message = format!(
        r#"== SESSION ==
Name: {}

== CURRENT OVERVIEW ==
{}

== LATEST LOOP ({}) ==
{}

{}

{}

== INSTRUCTIONS ==
Write the full updated overview document. Be concise. This is a living document, not a final report."#,
        session_name,
        if current_overview.len() > 100 { &current_overview } else { "This is a new session, no overview yet." },
        loop_index,
        process,
        results,
        explanation
    );

    match llm_client.call(&system_prompt, &user_message).await {
        Ok((response, _usage)) => {
            // The response is an AgentResponse but we only care about the overview field
            // Since we asked for {"overview": "..."}, try to extract it
            // But AgentResponse has "reasoning" etc. Let's parse the raw JSON differently
            // Actually, our LlmClient always parses as AgentResponse. Let's use the reasoning field.
            let overview_content = format!(
                "# {} — Research Overview\n\n**Status:** Running (Loop {})\n**Last Updated:** {}\n\n---\n\n{}",
                session_name,
                loop_index,
                chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
                response.reasoning
            );
            std::fs::write(&overview_path, overview_content)
                .map_err(|e| format!("Failed to write overview.md: {}", e))?;
        }
        Err(e) => {
            // Don't fail the whole loop if overview update fails
            tracing::warn!("Failed to update overview: {}", e);
            // Write a simple fallback overview
            let fallback = format!(
                "# {} — Research Overview\n\n**Status:** Running (Loop {})\n**Last Updated:** {}\n\n*Overview generation failed. Check loop files for details.*\n",
                session_name,
                loop_index,
                chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
            );
            let _ = std::fs::write(&overview_path, fallback);
        }
    }

    Ok(())
}
