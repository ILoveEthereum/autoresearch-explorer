use crate::agent::signals::HumanSignal;
use crate::canvas::state::CanvasState;
use crate::storage::state_writer::AgentState;
use crate::template::types::ParsedTemplate;
use std::path::Path;

/// Build the system prompt from the parsed template.
pub fn build_system_prompt(template: &ParsedTemplate, working_dir: Option<&Path>) -> String {
    let mut prompt = String::new();

    prompt.push_str("You are an autonomous research agent. You are executing the research process defined below.\n\n");

    if let Some(wd) = working_dir {
        prompt.push_str(&format!("== WORKING DIRECTORY ==\nYour working directory is: {}\nAll file operations (file_read, file_write, file_list) and code execution (code_executor) operate in this directory.\nYou can read existing files, write new files, and run code here.\n\n", wd.display()));
    }

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

    // Tools — placed BEFORE output format so the LLM sees them as primary
    if !template.process.tools.is_empty() {
        prompt.push_str("\n== AVAILABLE TOOLS ==\n");
        prompt.push_str(&crate::tools::registry::ToolRegistry::tool_descriptions(&template.process.tools));
    }

    // Output format
    prompt.push_str("\n== OUTPUT FORMAT ==\n");
    prompt.push_str(
        r#"You MUST respond with a JSON object containing these fields:
{
  "reasoning": "Your internal thinking about what to do this loop",
  "plan": "A one-sentence summary of this loop iteration's action",
  "tool_calls": [
    {"tool": "web_search", "input": {"query": "your search query", "max_results": 5}},
    {"tool": "web_read", "input": {"url": "https://example.com/article"}}
  ],
  "canvas_operations": [
    {"op": "ADD_NODE", "node": {"id": "unique-id", "type": "node_type_from_schema", "title": "...", "summary": "...", "status": "active|completed|queued", "fields": {...}}},
    {"op": "ADD_EDGE", "edge": {"id": "edge-id", "from": "node-id", "to": "node-id", "type": "edge_type_from_schema", "label": "optional"}},
    {"op": "UPDATE_NODE", "id": "node-id", "status": "completed", "summary": "updated text"},
    {"op": "SET_FOCUS", "nodeId": "node-id"}
  ],
  "chat_message": "optional message to the human, or null"
}

CRITICAL RULES:
1. You MUST include at least one tool_call in EVERY response. NEVER return an empty tool_calls array. If you need information, use web_search. If you need to write code, use file_write or code_executor. If you want to check what files exist, use file_list.
2. On your FIRST loop, use web_search to find real sources about the topic.
3. After getting search results, use web_read to read the most relevant URLs.
4. NEVER create "source" nodes with made-up URLs or summaries. Only create source nodes AFTER you have actually read the source using web_read.
5. NEVER report experiment results or metrics unless you ran actual code using code_executor.
6. To write code to the working directory, use file_write with the filename and content. Then use code_executor to run it.
7. Every node MUST have a unique id (use descriptive ids like "q-main", "src-001", "f-001").
8. Node type MUST match one of the types defined in the canvas schema.
9. Use SET_FOCUS to highlight what you're currently working on.
10. When building a project, follow this pattern: (a) web_search for implementation details, (b) web_read the best results, (c) file_write to create the code files, (d) code_executor to test them.
11. ALWAYS use file_write to create files. Do NOT just describe what code should look like — actually write it using the file_write tool.
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
    build_user_message_with_signals(canvas, agent, question, &[])
}

/// Build the user message with human signals included.
pub fn build_user_message_with_signals(
    canvas: &CanvasState,
    agent: &AgentState,
    question: &str,
    signals: &[HumanSignal],
) -> String {
    let mut msg = String::new();

    // Research question
    msg.push_str(&format!("== RESEARCH QUESTION ==\n{}\n\n", question));

    // Human signals
    if !signals.is_empty() {
        msg.push_str("== HUMAN SIGNALS (respond to these) ==\n");
        for signal in signals {
            match signal {
                HumanSignal::Chat { text, referenced_nodes } => {
                    msg.push_str(&format!("CHAT: \"{}\"\n", text));
                    if !referenced_nodes.is_empty() {
                        msg.push_str(&format!("  Referenced nodes: {}\n", referenced_nodes.join(", ")));
                    }
                }
                HumanSignal::Prioritize { node_id } => {
                    msg.push_str(&format!("PRIORITIZE: Focus more on node \"{}\"\n", node_id));
                }
                HumanSignal::Deprioritize { node_id } => {
                    msg.push_str(&format!("DEPRIORITIZE: Stop exploring node \"{}\"\n", node_id));
                }
                HumanSignal::Challenge { node_id } => {
                    msg.push_str(&format!("CHALLENGE: Re-examine node \"{}\" — the human thinks it may be wrong\n", node_id));
                }
                HumanSignal::Annotate { text, near_node_id } => {
                    msg.push_str(&format!("ANNOTATE near \"{}\": \"{}\"\n", near_node_id, text));
                }
                HumanSignal::Investigate { from_id, to_id } => {
                    msg.push_str(&format!("INVESTIGATE: Look into the relationship between \"{}\" and \"{}\"\n", from_id, to_id));
                }
            }
        }
        msg.push('\n');
    }

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
