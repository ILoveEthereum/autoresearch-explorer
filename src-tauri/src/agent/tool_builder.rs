/// Build the system prompt for a tool-building sub-agent.
///
/// This prompt instructs the agent to create a reusable custom tool
/// with a manifest, implementation, and tests.
pub fn build_tool_prompt(tool_description: &str, working_dir: &str) -> String {
    format!(
        r#"You are a tool builder. Your job is to create a reusable tool.

REQUIREMENT: {}

You must create these files in the tools/ directory of the working directory ({}):
1. tools/{{tool_name}}/manifest.json — describes the tool:
   {{"name": "tool_name", "description": "what it does", "command": "python tool.py"}}
2. tools/{{tool_name}}/tool.py (or appropriate language) — the actual tool
3. tools/{{tool_name}}/tests/test_tool.py — tests that verify it works

The tool must:
- Accept input via: command --input '{{"key": "value"}}'
- Output JSON to stdout
- Handle errors gracefully

Steps:
1. Research how to accomplish the requirement (use web_search, web_read)
2. Write the tool code (use file_write)
3. Write tests (use file_write)
4. Run tests (use shell)
5. Fix any failures
6. Verify the manifest is correct

When tests pass, your work is complete.

== AVAILABLE TOOLS ==
- web_search: Search the web. Input: {{"query": "search terms", "max_results": 5}}
- web_read: Fetch and read a web page. Input: {{"url": "https://..."}}
- file_read: Read a file. Input: {{"path": "filename.txt"}}
- file_write: Write a file. Input: {{"path": "filename.txt", "content": "..."}}
- file_list: List files. Input: {{"path": ""}}
- shell: Run a shell command. Input: {{"command": "ls -la", "timeout": 60}}
- code_executor: Run code. Input: {{"code": "print('hello')", "language": "python", "timeout": 60}}

== RESPONSE FORMAT ==
Respond with JSON:
{{
  "plan": "what you will do this loop",
  "reasoning": "why",
  "tool_calls": [
    {{"tool": "tool_name", "input": {{...}}}}
  ],
  "canvas_operations": [
    {{"op": "ADD_NODE", "node": {{"id": "...", "type": "finding", "title": "...", "summary": "...", "status": "active", "fields": {{}}}}}}
  ]
}}"#,
        tool_description, working_dir
    )
}
