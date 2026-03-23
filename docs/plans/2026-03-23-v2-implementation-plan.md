# Autoresearch v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Autoresearch from a single-canvas research viewer into a self-healing, multi-canvas agent system with cross-session memory, tool-building, and Telegram integration.

**Architecture:** The system evolves from one SessionRunner to a tree of runners (main + sub-agents), with a watchdog metacognition layer, OpenRouter for LLM access, SQLite FTS5 for memory, and a Telegram bot for remote control. The working directory becomes the session root with `.autoresearch/` for internal state.

**Tech Stack:** Rust (Tauri backend), React 19 + TypeScript (frontend), Zustand (state), SQLite + rusqlite (memory), teloxide (Telegram), OpenRouter API (LLM), DuckDuckGo (search), arXiv API (papers)

---

## Phase 1: Foundation (Tasks 1-4)

These must be done first — everything else builds on them.

---

### Task 1: OpenRouter Migration

**Files:**
- Modify: `src-tauri/src/llm/client.rs` (full rewrite of URL + headers)
- Modify: `src-tauri/src/llm/types.rs` (add model list types)
- Create: `src-tauri/src/commands/config.rs` (new config commands)
- Modify: `src-tauri/src/lib.rs` (register new commands)
- Modify: `src/panels/TemplateSelector.tsx` (model picker UI)
- Modify: `src-tauri/Cargo.toml` (no new deps needed)

**Step 1: Update LLM client base URL and headers**

In `src-tauri/src/llm/client.rs`, change:
- URL from `https://api.deepinfra.com/v1/openai/chat/completions` to `https://openrouter.ai/api/v1/chat/completions`
- Add headers: `HTTP-Referer: https://autoresearch.app`, `X-Title: Autoresearch`
- Default model from `Qwen/Qwen2.5-72B-Instruct` to `qwen/qwen-2.5-72b-instruct` (OpenRouter naming)

```rust
// In LlmClient::call() and call_raw(), update the request builder:
let response = self.client.post("https://openrouter.ai/api/v1/chat/completions")
    .header("Authorization", format!("Bearer {}", self.api_key))
    .header("HTTP-Referer", "https://autoresearch.app")
    .header("X-Title", "Autoresearch")
    .json(&request)
    .send()
    .await
    .map_err(|e| format!("HTTP request failed: {}", e))?;
```

**Step 2: Add model list fetching command**

Create `src-tauri/src/commands/config.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterModel {
    pub id: String,
    pub name: String,
    pub context_length: Option<u64>,
    pub pricing: Option<ModelPricing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub prompt: Option<String>,
    pub completion: Option<String>,
}

#[tauri::command]
pub async fn fetch_models(api_key: String) -> Result<Vec<OpenRouterModel>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models: {}", e))?;

    let models = body["data"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|m| OpenRouterModel {
            id: m["id"].as_str().unwrap_or("").to_string(),
            name: m["name"].as_str().unwrap_or("").to_string(),
            context_length: m["context_length"].as_u64(),
            pricing: Some(ModelPricing {
                prompt: m["pricing"]["prompt"].as_str().map(String::from),
                completion: m["pricing"]["completion"].as_str().map(String::from),
            }),
        })
        .collect();

    Ok(models)
}
```

**Step 3: Register new command in lib.rs**

Add `commands::config::fetch_models` to the invoke_handler.

**Step 4: Update TemplateSelector with searchable model dropdown**

Replace the text input model field with a searchable dropdown that:
- Fetches models on API key entry (debounced 500ms)
- Shows: model name, context length, price
- Filters as user types
- Saves selected model ID to localStorage as `openrouter_model`

**Step 5: Rename localStorage keys**

- `deepinfra_api_key` -> `openrouter_api_key`
- `deepinfra_model` -> `openrouter_model`

**Step 6: Verify compilation and test**

Run: `cd src-tauri && cargo check`
Run: `npx tsc --noEmit`
Expected: Both pass with no errors

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: migrate from DeepInfra to OpenRouter with searchable model picker"
```

---

### Task 2: Data Layout — Working Dir = Session

**Files:**
- Modify: `src-tauri/src/storage/session_dir.rs` (rewrite session creation)
- Create: `src-tauri/src/storage/global_index.rs` (session index at ~/.autoresearch/)
- Modify: `src-tauri/src/commands/session.rs` (update create/list/load)
- Modify: `src/panels/TemplateSelector.tsx` (working dir now required)
- Modify: `src/panels/HomeScreen.tsx` (read from global index)
- Modify: `src-tauri/src/agent/runtime.rs` (write to .autoresearch/ not research/)

**Step 1: Create global index module**

Create `src-tauri/src/storage/global_index.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEntry {
    pub id: String,
    pub name: String,
    pub path: String, // working dir path
    pub last_modified: String,
    pub status: String,
    pub llm_model: String,
}

fn index_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".autoresearch").join("sessions.json")
}

pub fn read_index() -> Vec<SessionEntry> {
    let path = index_path();
    if !path.exists() {
        return vec![];
    }
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

pub fn add_to_index(entry: SessionEntry) -> Result<(), String> {
    let mut entries = read_index();
    entries.retain(|e| e.id != entry.id); // remove old entry if exists
    entries.insert(0, entry); // newest first
    let path = index_path();
    std::fs::create_dir_all(path.parent().unwrap())
        .map_err(|e| format!("Failed to create ~/.autoresearch: {}", e))?;
    let json = serde_json::to_string_pretty(&entries)
        .map_err(|e| format!("Failed to serialize index: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write index: {}", e))?;
    Ok(())
}
```

Add `dirs` crate: `cargo add dirs`

**Step 2: Rewrite session_dir.rs**

- `create_session_dir()` now takes a required `working_dir: &str`
- Creates `.autoresearch/` inside the working dir (not `research/` in cwd)
- Structure: `.autoresearch/meta.json`, `.autoresearch/canvases/main/loops/`, `.autoresearch/canvases/main/state.json`, `.autoresearch/chat.json`
- Creates `overview.md` in the working dir root (visible to user)
- Adds entry to global index

**Step 3: Update session commands**

- `create_session`: working_dir is now required (not Optional)
- `list_sessions`: reads from global index instead of scanning `research/`
- `load_session`: reads `.autoresearch/canvases/main/state.json` from the working dir
- `resume_saved_session`: same but restarts loop

**Step 4: Update runtime.rs paths**

- Loop files write to `.autoresearch/canvases/main/loops/{N}/`
- State writes to `.autoresearch/canvases/main/state.json`
- Overview writes to `{working_dir}/overview.md`

**Step 5: Update TemplateSelector**

- Working directory is now required (remove "optional" label)
- Validation: cannot start without a working dir

**Step 6: Update HomeScreen**

- Read sessions from `invoke('list_sessions')` which now uses global index
- Show working dir path in session cards
- Grey out sessions whose working dir no longer exists

**Step 7: Verify and commit**

Run: `cargo check && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat: working directory is the session, .autoresearch/ for internal state"
```

---

### Task 3: Core Tool Set Expansion

**Files:**
- Modify: `src-tauri/src/tools/registry.rs` (add new tools)
- Create: `src-tauri/src/tools/shell.rs` (general shell tool)
- Create: `src-tauri/src/tools/git.rs` (git operations)
- Create: `src-tauri/src/tools/package_manager.rs` (pip/npm/cargo)
- Create: `src-tauri/src/tools/arxiv.rs` (arXiv API search)
- Create: `src-tauri/src/tools/pdf_reader.rs` (PDF text extraction)
- Create: `src-tauri/src/tools/custom_tool.rs` (run manifest-based tools)
- Modify: `src-tauri/src/tools/mod.rs` (register modules)
- Remove: `src-tauri/src/tools/docker.rs` (move to tier 2, not built-in)

**Step 1: Create shell.rs**

Replaces code_executor. Runs any shell command natively:

```rust
pub async fn execute_shell(command: &str, working_dir: &Path, timeout_secs: u64) -> ToolResult {
    let output = tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(working_dir)
            .output()
    ).await;
    // Return stdout + stderr, success based on exit code
}
```

**Step 2: Create git.rs**

Wraps git CLI commands. Input: `{"action": "clone|commit|diff|log|branch|status", "args": "..."}`. Runs in working dir.

**Step 3: Create package_manager.rs**

Auto-detects package manager from working dir contents:
- `requirements.txt` or `setup.py` -> pip
- `package.json` -> npm
- `Cargo.toml` -> cargo

Input: `{"action": "install", "packages": ["torch", "numpy"]}`

**Step 4: Create arxiv.rs**

Calls arXiv API (`http://export.arxiv.org/api/query`), parses Atom XML, returns structured JSON with title, authors, abstract, URL, date.

**Step 5: Create pdf_reader.rs**

Uses `pdf-extract` crate (`cargo add pdf-extract`) to extract text from PDF files in the working dir.

**Step 6: Create custom_tool.rs**

Loads tools from `~/.autoresearch/tools/` and `{working_dir}/tools/`. Reads `manifest.json`, runs the command with `--input '<json>'`, captures stdout.

```rust
pub async fn execute_custom_tool(
    tool_name: &str,
    input: &serde_json::Value,
    global_tools_dir: &Path,
    project_tools_dir: &Path,
) -> ToolResult {
    // Find manifest.json in either dir
    // Run: sh -c "{manifest.command} --input '{input_json}'"
    // Return stdout as output
}
```

**Step 7: Update registry.rs**

- Add all new tools to the match statement
- Add `shell` with description for LLM
- Keep `code_executor` as alias for backward compat (calls shell internally)
- Add custom tool fallback: if tool name not matched, check custom_tool registry

**Step 8: Update tool_descriptions()**

Add descriptions for all new tools so the LLM knows they exist.

**Step 9: Verify and commit**

```bash
cargo check
git add -A
git commit -m "feat: expand core tool set - shell, git, package_manager, arxiv, pdf, custom tools"
```

---

### Task 4: Session Wizard (6-step flow)

**Files:**
- Rewrite: `src/panels/TemplateSelector.tsx` (multi-step wizard)
- Create: `src/panels/wizard/StepQuestion.tsx`
- Create: `src/panels/wizard/StepSuccess.tsx`
- Create: `src/panels/wizard/StepTemplate.tsx`
- Create: `src/panels/wizard/StepWorkingDir.tsx`
- Create: `src/panels/wizard/StepModel.tsx`
- Create: `src/panels/wizard/StepExperience.tsx`
- Modify: `src-tauri/src/commands/session.rs` (accept success_criteria)
- Modify: `src-tauri/src/storage/session_dir.rs` (store success_criteria in meta)

**Step 1: Create wizard step components**

Each step is a React component with `value`, `onChange`, `onNext`, `onBack` props.

- StepQuestion: textarea for research question
- StepSuccess: textarea for success criteria + clickable suggestion chips
- StepTemplate: radio buttons for research approach (general, literature, ML, build)
- StepWorkingDir: folder picker (required)
- StepModel: OpenRouter API key + searchable model dropdown
- StepExperience: checkboxes for relevant past skills + available tools (reads from memory DB and tools/)

**Step 2: Rewrite TemplateSelector as Wizard**

Multi-step modal with progress dots, Back/Next buttons, step validation.

**Step 3: Update backend to store success_criteria**

Add `success_criteria: String` to SessionMeta. Pass from wizard through create_session.

**Step 4: Verify and commit**

```bash
npx tsc --noEmit && cargo check
git add -A
git commit -m "feat: 6-step session wizard with success criteria and experience loading"
```

---

## Phase 2: Metacognition (Tasks 5-6)

---

### Task 5: Watchdog + Completion Detection

**Files:**
- Create: `src-tauri/src/agent/watchdog.rs` (watchdog evaluator)
- Modify: `src-tauri/src/agent/runtime.rs` (call watchdog every 3 loops)
- Modify: `src-tauri/src/agent/mod.rs` (register module)
- Modify: `src-tauri/src/llm/types.rs` (add WatchdogVerdict type)
- Modify: `src/hooks/useTauriEvents.ts` (listen for completion event)
- Modify: `src/panels/SessionControls.tsx` (completion banner)

**Step 1: Create watchdog.rs**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WatchdogVerdict {
    Progressing,
    StuckNoInfo { description: String },
    StuckCodeError { error: String },
    StuckLooping { repeated_action: String },
    PhaseComplete { reason: String },
    NeedsHuman { question: String },
}

pub async fn evaluate(
    llm_client: &LlmClient,
    canvas_state: &CanvasState,
    recent_loops: &[LoopSummary],
    success_criteria: &str,
) -> Result<WatchdogVerdict, String> {
    // Build a focused prompt with:
    // - Success criteria
    // - Canvas node/edge counts
    // - Last 3 loop summaries
    // - Ask: is progress being made? Is research complete?
    // Parse JSON response with max_tokens=200
}
```

**Step 2: Integrate watchdog into runtime.rs**

After every 3rd loop:
1. Call `watchdog::evaluate()`
2. Match on verdict:
   - `Progressing` -> continue
   - `PhaseComplete` -> run completion check (2 consecutive required), emit `session-completed` event
   - `StuckLooping` -> inject replan prompt into next loop's context
   - `StuckNoInfo` / `StuckCodeError` -> (handled in Task 7 with sub-agents)
   - `NeedsHuman` -> (handled in Task 9 with Telegram)

**Step 3: Add completion banner to frontend**

Listen for `session-completed` event. Show banner: "Research complete: {reason}" with "Resume anyway" button.

**Step 4: Verify and commit**

```bash
cargo check && npx tsc --noEmit
git add -A
git commit -m "feat: watchdog metacognition layer with completion detection"
```

---

### Task 6: Checkpointing

**Files:**
- Create: `src-tauri/src/agent/checkpoint.rs`
- Modify: `src-tauri/src/agent/runtime.rs` (save checkpoints)
- Modify: `src-tauri/src/canvas/state.rs` (serialize full state)
- Modify: `src-tauri/src/commands/session.rs` (add branch_from_checkpoint command)
- Modify: `src/panels/HistorySlider.tsx` (show checkpoint markers)

**Step 1: Create checkpoint.rs**

```rust
pub fn save_checkpoint(
    canvas_dir: &Path,  // .autoresearch/canvases/main/
    loop_index: u32,
    canvas_state: &CanvasState,
    agent_state: &AgentState,
    verdict: &WatchdogVerdict,
) -> Result<PathBuf, String> {
    let checkpoint_dir = canvas_dir.join("checkpoints");
    std::fs::create_dir_all(&checkpoint_dir)?;
    let path = checkpoint_dir.join(format!("loop-{:06}.json", loop_index));
    // Serialize full state + verdict
    Ok(path)
}

pub fn list_checkpoints(canvas_dir: &Path) -> Vec<CheckpointInfo> { ... }
pub fn load_checkpoint(path: &Path) -> Result<(CanvasState, AgentState), String> { ... }
```

**Step 2: Integrate into runtime**

Before watchdog takes corrective action, save checkpoint. Add checkpoint node to canvas.

**Step 3: Add branch_from_checkpoint command**

Creates a new canvas dir (e.g., `canvases/main-branch-1/`) from a checkpoint, starts a new SessionRunner from that state.

**Step 4: Show checkpoints on timeline**

HistorySlider shows diamond markers at checkpoint positions. Click to view, right-click to branch.

**Step 5: Verify and commit**

```bash
cargo check && npx tsc --noEmit
git add -A
git commit -m "feat: checkpointing with canvas branching"
```

---

## Phase 3: Self-Healing (Tasks 7-8)

---

### Task 7: Multi-Canvas + Tool-Builder Sub-Agent

**Files:**
- Create: `src-tauri/src/agent/sub_agent.rs` (sub-agent spawning)
- Create: `src-tauri/src/agent/tool_builder.rs` (tool-building prompt + flow)
- Modify: `src-tauri/src/agent/runtime.rs` (handle stuck verdicts)
- Modify: `src-tauri/src/commands/session.rs` (add canvas switching commands)
- Create: `src/panels/ProjectTree.tsx` (left sidebar project tree)
- Create: `src/stores/projectStore.ts` (multi-canvas state)
- Modify: `src/App.tsx` (add project tree sidebar)
- Modify: `src/hooks/useTauriEvents.ts` (handle multi-canvas events)

**Step 1: Create projectStore.ts**

```typescript
interface CanvasEntry {
  id: string;        // "main" or "tool-arxiv-scraper"
  label: string;
  type: "main" | "tool";
  status: "active" | "building" | "ready" | "failed";
  testCount?: number;
  testsPassing?: number;
}

interface ProjectState {
  canvases: CanvasEntry[];
  activeCanvasId: string;
  addCanvas: (entry: CanvasEntry) => void;
  setActiveCanvas: (id: string) => void;
  updateCanvas: (id: string, updates: Partial<CanvasEntry>) => void;
}
```

**Step 2: Create ProjectTree.tsx**

Left sidebar showing canvas tree. Clicking switches the active canvas. Status dots (green/yellow/red). Test counts for tool canvases.

**Step 3: Create sub_agent.rs**

```rust
pub struct SubAgent {
    pub id: String,
    pub canvas_dir: PathBuf,
    pub runner: SessionRunner,
    pub control_tx: watch::Sender<LoopControl>,
}

pub async fn spawn_sub_agent(
    parent_working_dir: &Path,
    sub_agent_id: &str,
    prompt: &str,
    llm_client: LlmClient,
    app: &AppHandle,
) -> Result<SubAgent, String> {
    // Create .autoresearch/canvases/{sub_agent_id}/
    // Build a SessionRunner with the tool-building template
    // Spawn in tokio task
    // Emit "sub-agent-spawned" event to frontend
}
```

**Step 4: Create tool_builder.rs**

Contains the tool-building prompt template and the flow:
1. Build tool-builder system prompt (what to build, manifest format, test requirements)
2. Run sub-agent loop (max 20 iterations)
3. On completion: validate manifest.json, run tests, copy to `~/.autoresearch/tools/`
4. Register in parent agent's ToolRegistry
5. Emit "tool-ready" event

**Step 5: Wire watchdog verdicts to sub-agent spawning**

In runtime.rs, when watchdog returns `StuckNoInfo` or `StuckCodeError`:
1. Save checkpoint
2. Add "Building tool" node to main canvas
3. Call `spawn_sub_agent()` with appropriate prompt
4. Main agent continues (doesn't wait for sub-agent)
5. When sub-agent finishes, main agent picks up the new tool on next loop

**Step 6: Add canvas switching commands**

- `switch_canvas(canvas_id)` — loads a different canvas's state, emits ops to frontend
- `list_canvases()` — returns all canvases for current session

**Step 7: Update App.tsx**

Add ProjectTree sidebar (collapsible, left side). When active canvas changes, swap canvas state in canvasStore.

**Step 8: Verify and commit**

```bash
cargo check && npx tsc --noEmit
git add -A
git commit -m "feat: multi-canvas architecture with tool-builder sub-agents"
```

---

### Task 8: Self-Improvement — Skills + Memory

**Files:**
- Create: `src-tauri/src/memory/mod.rs`
- Create: `src-tauri/src/memory/skill_doc.rs` (skill document generation)
- Create: `src-tauri/src/memory/database.rs` (SQLite FTS5 memory)
- Modify: `src-tauri/src/agent/runtime.rs` (generate skill doc on session end)
- Modify: `src-tauri/src/llm/context.rs` (inject past experience into prompt)
- Modify: `src-tauri/src/commands/session.rs` (add memory query commands)
- Modify: `src/panels/wizard/StepExperience.tsx` (show past experience)
- Modify: `src-tauri/Cargo.toml` (add rusqlite)

**Step 1: Add rusqlite dependency**

```bash
cd src-tauri && cargo add rusqlite --features bundled
```

**Step 2: Create database.rs**

```rust
pub struct MemoryDb {
    conn: rusqlite::Connection,
}

impl MemoryDb {
    pub fn open() -> Result<Self, String> {
        let path = dirs::home_dir().unwrap().join(".autoresearch").join("memory.db");
        std::fs::create_dir_all(path.parent().unwrap())?;
        let conn = rusqlite::Connection::open(&path)?;
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT,
                question TEXT,
                success_criteria TEXT,
                status TEXT,
                created_at TEXT,
                summary TEXT,
                skill_doc_path TEXT
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
                name, question, summary, content=sessions, content_rowid=rowid
            );
        ")?;
        Ok(Self { conn })
    }

    pub fn add_session(&self, ...) -> Result<(), String> { ... }
    pub fn search(&self, query: &str, limit: usize) -> Vec<SessionEntry> { ... }
}
```

**Step 3: Create skill_doc.rs**

```rust
pub async fn generate_skill_doc(
    llm_client: &LlmClient,
    session_name: &str,
    question: &str,
    canvas_state: &CanvasState,
    loop_summaries: &[LoopSummary],
) -> Result<String, String> {
    // LLM call to summarize: what worked, what failed, key sources, recommended approach
    // Save to ~/.autoresearch/skills/{slug}.md
}
```

**Step 4: Generate skill doc on session stop**

In runtime.rs, when the session stops (completion or manual), call `generate_skill_doc()` and `memory_db.add_session()`.

**Step 5: Inject past experience into context**

In context.rs `build_system_prompt()`, if past experience was selected in the wizard, append a "RELEVANT PAST EXPERIENCE" section with skill doc excerpts.

**Step 6: StepExperience wizard component**

Calls `invoke('search_memory', { query })` to find relevant past sessions. Shows checkboxes for skill docs and available tools.

**Step 7: Verify and commit**

```bash
cargo check && npx tsc --noEmit
git add -A
git commit -m "feat: self-improvement with skill documents and SQLite FTS5 memory"
```

---

## Phase 4: Communication + Polish (Tasks 9-10)

---

### Task 9: Telegram Bot

**Files:**
- Create: `src-tauri/src/telegram/mod.rs`
- Create: `src-tauri/src/telegram/bot.rs` (bot runner)
- Create: `src-tauri/src/telegram/handlers.rs` (command handlers)
- Modify: `src-tauri/src/agent/runtime.rs` (send notifications)
- Modify: `src-tauri/src/agent/watchdog.rs` (send stuck alerts)
- Modify: `src-tauri/src/commands/session.rs` (add telegram config commands)
- Create: `src/panels/Settings.tsx` (telegram config UI)
- Modify: `src-tauri/Cargo.toml` (add teloxide)

**Step 1: Add teloxide dependency**

```bash
cd src-tauri && cargo add teloxide --features macros
```

**Step 2: Create bot.rs**

```rust
pub struct TelegramBot {
    token: String,
    chat_id: i64,
    signal_queue: Arc<SignalQueue>,
    control_tx: watch::Sender<LoopControl>,
}

impl TelegramBot {
    pub async fn run(&self) {
        // Long polling loop
        // Parse incoming messages:
        //   "stop" -> control_tx.send(Stop)
        //   "resume" -> control_tx.send(Run)
        //   "status" -> send current status
        //   "skip" -> signal_queue.push(Skip)
        //   anything else -> signal_queue.push(Chat(text))
    }

    pub async fn send_progress(&self, summary: &str) { ... }
    pub async fn send_stuck_alert(&self, question: &str) { ... }
    pub async fn send_completion(&self, reason: &str) { ... }
}
```

**Step 3: Integrate with runtime**

- Every N loops (configurable), call `bot.send_progress()`
- On watchdog `NeedsHuman` verdict, call `bot.send_stuck_alert()`
- On session completion, call `bot.send_completion()`

**Step 4: Create Settings panel**

Simple form: Telegram bot token, test connection button. Saved to `~/.autoresearch/config.json`.

**Step 5: Verify and commit**

```bash
cargo check && npx tsc --noEmit
git add -A
git commit -m "feat: Telegram bot for progress updates and remote control"
```

---

### Task 10: Node Detail Panel + Polish

**Files:**
- Rewrite: `src/panels/DetailPanel.tsx` (type-specific rendering)
- Create: `src/panels/detail/SourceDetail.tsx`
- Create: `src/panels/detail/FindingDetail.tsx`
- Create: `src/panels/detail/ExperimentDetail.tsx`
- Create: `src/panels/detail/QuestionDetail.tsx`
- Create: `src/panels/detail/ToolBuildingDetail.tsx`
- Create: `src/panels/detail/LoopContext.tsx` (expandable accordion)
- Modify: `src-tauri/src/commands/session.rs` (add get_loop_detail command)

**Step 1: Create type-specific detail components**

Each component renders the appropriate fields for its node type:

- **SourceDetail:** title, clickable URL, summary, relevance bar, connections list
- **FindingDetail:** claim text, confidence bar, supporting sources (clickable), connected nodes
- **ExperimentDetail:** hypothesis, code snippet (syntax highlighted), before/after metrics with delta
- **QuestionDetail:** status badge, sub-questions with checkmarks, connected findings
- **ToolBuildingDetail:** status, test count/status, "View canvas" button to switch to sub-canvas

**Step 2: Create LoopContext accordion**

Expandable section at the bottom of every detail panel:
- Agent reasoning text from that loop
- Tool calls with inputs and outputs (collapsible)
- Other nodes created/updated in the same loop

Fetches data via `invoke('get_loop_detail', { loopIndex })`.

**Step 3: Rewrite DetailPanel.tsx**

Dispatch to the correct sub-component based on `node.type`. Common header (title, type badge, status, created timestamp). Common footer (connections list, loop context).

**Step 4: Verify and commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "feat: type-specific node detail panels with loop context"
```

---

## Execution Order & Dependencies

```
Phase 1 (Foundation):
  Task 1: OpenRouter ─────────┐
  Task 2: Data Layout ────────┤── all parallel
  Task 3: Core Tools ─────────┤
  Task 4: Session Wizard ─────┘ (depends on Task 1 for model picker)

Phase 2 (Metacognition):
  Task 5: Watchdog ────────────┐── sequential
  Task 6: Checkpointing ──────┘

Phase 3 (Self-Healing):
  Task 7: Multi-Canvas + Tools ─── depends on Tasks 5, 6
  Task 8: Skills + Memory ─────── depends on Task 2

Phase 4 (Communication):
  Task 9: Telegram ────────────┐── parallel
  Task 10: Detail Panel ───────┘
```

**Estimated total: ~3-4 weeks with focused development.**
