use crate::canvas::operations::CanvasOp;
use crate::llm::types::AgentResponse;
use std::path::Path;

/// Write all files for a completed loop iteration.
pub fn write_loop(
    session_dir: &Path,
    loop_index: u32,
    response: &AgentResponse,
    _tool_results: &[String], // placeholder for future tool results
) -> Result<(), String> {
    let loop_dir = session_dir.join("loops").join(format!("{:03}", loop_index));
    std::fs::create_dir_all(&loop_dir)
        .map_err(|e| format!("Failed to create loop directory: {}", e))?;

    // process.md — what the agent planned
    let process = format!(
        "# Loop {} — Plan\n\n**Plan:** {}\n\n## Reasoning\n\n{}\n",
        loop_index,
        response.plan,
        response.reasoning
    );
    std::fs::write(loop_dir.join("process.md"), process)
        .map_err(|e| format!("Failed to write process.md: {}", e))?;

    // results.md — tool outputs and findings
    let results = if response.tool_calls.is_empty() {
        format!(
            "# Loop {} — Results\n\nNo tools were called this loop.\n",
            loop_index
        )
    } else {
        let mut r = format!("# Loop {} — Results\n\n## Tool Calls\n\n", loop_index);
        for tc in &response.tool_calls {
            r.push_str(&format!(
                "### {}\n\n**Input:**\n```json\n{}\n```\n\n",
                tc.tool,
                serde_json::to_string_pretty(&tc.input).unwrap_or_default()
            ));
        }
        r
    };
    std::fs::write(loop_dir.join("results.md"), results)
        .map_err(|e| format!("Failed to write results.md: {}", e))?;

    // explanation.md — reasoning and canvas update summary
    let mut explanation = format!(
        "# Loop {} — Reasoning\n\n## Analysis\n\n{}\n\n## Canvas Updates\n\n",
        loop_index, response.reasoning
    );
    for op in &response.canvas_operations {
        match op {
            CanvasOp::ADD_NODE { node } => {
                explanation.push_str(&format!(
                    "- Added node `{}` ({}): \"{}\"\n",
                    node.id, node.node_type, node.title
                ));
            }
            CanvasOp::ADD_EDGE { edge } => {
                explanation.push_str(&format!(
                    "- Added edge: {} → {} ({})\n",
                    edge.from, edge.to, edge.edge_type
                ));
            }
            CanvasOp::UPDATE_NODE { id, status, .. } => {
                explanation.push_str(&format!(
                    "- Updated node `{}`{}\n",
                    id,
                    status
                        .as_ref()
                        .map(|s| format!(" → status: {}", s))
                        .unwrap_or_default()
                ));
            }
            CanvasOp::SET_FOCUS { node_id } => {
                explanation.push_str(&format!("- Set focus to `{}`\n", node_id));
            }
            _ => {}
        }
    }
    if let Some(msg) = &response.chat_message {
        explanation.push_str(&format!("\n## Agent Message\n\n{}\n", msg));
    }
    std::fs::write(loop_dir.join("explanation.md"), explanation)
        .map_err(|e| format!("Failed to write explanation.md: {}", e))?;

    // canvas-ops.json — raw operations
    let ops_json = serde_json::to_string_pretty(&response.canvas_operations)
        .map_err(|e| format!("Failed to serialize canvas ops: {}", e))?;
    std::fs::write(loop_dir.join("canvas-ops.json"), ops_json)
        .map_err(|e| format!("Failed to write canvas-ops.json: {}", e))?;

    Ok(())
}
