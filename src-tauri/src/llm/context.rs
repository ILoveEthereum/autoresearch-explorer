use crate::canvas::state::CanvasState;
use crate::storage::state_writer::AgentState;
use crate::template::types::ParsedTemplate;

/// Build the system prompt from the parsed template.
pub fn build_system_prompt(template: &ParsedTemplate) -> String {
    let mut prompt = String::new();

    prompt.push_str("You are an autonomous research agent. You are executing the research process defined below.\n\n");

    // Process definition
    prompt.push_str("== PROCESS ==\n");
    prompt.push_str(&template.process.description);
    prompt.push_str("\n\nSteps in each loop iteration:\n");
    for step in &template.process.r#loop {
        prompt.push_str(&format!("- {}: {}\n", step.step, step.description));
    }

    // Canvas schema
    prompt.push_str("\n== CANVAS SCHEMA ==\n");
    prompt.push_str("You MUST emit canvas operations using ONLY these types.\n\n");
    prompt.push_str("Node types:\n");
    for (name, def) in &template.canvas.node_types {
        prompt.push_str(&format!(
            "- {}: shape={}, fields={:?}",
            name, def.shape, def.fields
        ));
        if let Some(desc) = &def.description {
            prompt.push_str(&format!(" — {}", desc));
        }
        prompt.push('\n');
    }
    prompt.push_str("\nEdge types:\n");
    for (name, def) in &template.canvas.edge_types {
        prompt.push_str(&format!(
            "- {}: {} (style: {})\n",
            name, def.description, def.style
        ));
    }

    // Output format
    prompt.push_str("\n== OUTPUT FORMAT ==\n");
    prompt.push_str(
        r#"You MUST respond with a JSON object containing these fields:
{
  "reasoning": "Your internal thinking about what to do this loop",
  "plan": "A one-sentence summary of this loop iteration's action",
  "tool_calls": [],
  "canvas_operations": [
    {"op": "ADD_NODE", "node": {"id": "unique-id", "type": "node_type_from_schema", "title": "...", "summary": "...", "status": "active|completed|queued", "fields": {...}}},
    {"op": "ADD_EDGE", "edge": {"id": "edge-id", "from": "node-id", "to": "node-id", "type": "edge_type_from_schema", "label": "optional"}},
    {"op": "UPDATE_NODE", "id": "node-id", "status": "completed", "summary": "updated text"},
    {"op": "SET_FOCUS", "nodeId": "node-id"}
  ],
  "chat_message": "optional message to the human, or null"
}

IMPORTANT:
- Every node MUST have a unique id (use descriptive ids like "q-main", "src-001", "f-001")
- Node type MUST match one of the types defined in the canvas schema
- Edge type MUST match one of the edge types defined in the canvas schema
- Use ADD_NODE to create new nodes, UPDATE_NODE to modify existing ones
- Use SET_FOCUS to highlight what you're currently working on
"#,
    );

    // Agent instructions
    prompt.push_str("\n== AGENT INSTRUCTIONS ==\n");
    prompt.push_str(&template.instructions);

    prompt
}

/// Build the user message containing current state and context.
pub fn build_user_message(
    canvas: &CanvasState,
    agent: &AgentState,
    question: &str,
) -> String {
    let mut msg = String::new();

    // Research question
    msg.push_str(&format!("== RESEARCH QUESTION ==\n{}\n\n", question));

    // Current canvas state
    msg.push_str("== CURRENT CANVAS STATE ==\n");
    if canvas.nodes.is_empty() {
        msg.push_str("The canvas is empty. This is the first loop — start by creating initial nodes.\n");
    } else {
        msg.push_str("Nodes:\n");
        for node in &canvas.nodes {
            msg.push_str(&format!(
                "- {} (type={}, status={}): \"{}\"\n",
                node.id, node.node_type, node.status, node.title
            ));
            if !node.summary.is_empty() {
                msg.push_str(&format!("  Summary: {}\n", node.summary));
            }
        }
        msg.push_str("\nEdges:\n");
        for edge in &canvas.edges {
            msg.push_str(&format!(
                "- {} → {} (type={})\n",
                edge.from, edge.to, edge.edge_type
            ));
        }
    }

    // Recent history
    if !agent.recent_history.is_empty() {
        msg.push_str("\n== RECENT HISTORY ==\n");
        for h in &agent.recent_history {
            msg.push_str(&format!(
                "Loop {}: {} — {}\n",
                h.loop_index, h.plan, h.outcome
            ));
        }
    }

    // Older history summary
    if !agent.history_summary.is_empty() {
        msg.push_str(&format!(
            "\n== OLDER HISTORY SUMMARY ==\n{}\n",
            agent.history_summary
        ));
    }

    msg.push_str(&format!(
        "\n== CURRENT LOOP ==\nThis is loop {}. Execute the next step of the research process.\n",
        agent.current_loop + 1
    ));

    msg
}
