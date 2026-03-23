# Autoresearch v2 — Self-Healing Agent Design

**Author:** Mekyle Naidoo
**Date:** March 23, 2026
**Status:** Approved

---

## Problem

The Autoresearch agent has three failure modes:
1. **Can't find information** — searches the web but can't find what it needs
2. **Can't debug code** — writes code that fails, gets into retry loops
3. **Doesn't know what to do next** — loops aimlessly, repeating the same actions

Additionally:
- No memory across sessions — every session starts from scratch
- Limited tool set — 5 built-in tools, no way to extend
- No self-improvement — never learns from past successes or failures
- No remote monitoring — must watch the app to know what's happening
- DeepInfra lock-in — switch to OpenRouter for model flexibility and cost

---

## Solution Overview

Six interlocking systems:

1. **Multi-Canvas Architecture** — a project is a tree of canvases, not one canvas
2. **Watchdog + Checkpointing** — metacognition layer that detects stuck states
3. **Tool-Builder Sub-Agent** — when stuck, the agent builds its own tools
4. **Core Tool Set** — 13 built-in tools covering research + development
5. **Self-Improvement** — skill documents + SQLite FTS5 memory
6. **Telegram Integration** — progress updates, stuck escalation, remote commands

---

## 1. Multi-Canvas Architecture

A project is a tree of canvases. The main research canvas is the root. When the agent spawns a sub-agent (to build a tool, debug code, etc.), it gets its own canvas visible in a left sidebar project tree.

### UI: Project Tree (Left Sidebar)

```
+---------------------+
| BitNet TTS          |
| +-- Main Research   |  <- bold = active view
| +-- arxiv_scraper   |  <- green dot = ready
| |   3 tests pass    |
| +-- mps_debugger    |  <- yellow = building
| |   1 test pending  |
+---------------------+
```

Clicking a sub-canvas swaps the main canvas view. Each canvas has its own nodes, edges, history, and timeline slider.

### On the Main Canvas

The stuck node shows a special "building tool" indicator:

```
+------------------------------+
| Building: arxiv_scraper      |
| Status: in progress          |
| Loop: 4/20                   |
| [Click to view]              |
+------------------------------+
```

### On Disk

```
/Users/you/Projects/BitNetTTS/
+-- autoresearch/
|   +-- meta.json
|   +-- canvases/
|   |   +-- main/
|   |   |   +-- state.json
|   |   |   +-- checkpoints/
|   |   |   +-- loops/
|   |   +-- tool-arxiv-scraper/
|   |   |   +-- state.json
|   |   |   +-- loops/
|   |   +-- tool-mps-debugger/
|   |       +-- state.json
|   |       +-- loops/
|   +-- sessions.json
+-- tools/
|   +-- arxiv_scraper/
|   |   +-- manifest.json
|   |   +-- arxiv_scraper.py
|   |   +-- requirements.txt
|   |   +-- README.md
|   |   +-- tests/
|   +-- mps_debugger/
+-- overview.md
+-- train.py
+-- model.py
```

---

## 2. Watchdog + Checkpointing

### Watchdog

A separate LLM evaluation after every 3 loops. Cheap call (~100 tokens output).

Checks:
- **PROGRESS** — did the last 3 loops produce new nodes/files/findings?
- **REPETITION** — are the same tool calls being repeated?
- **ERRORS** — is code failing with the same error repeatedly?
- **COMPLETION** — do the success criteria appear met?

### Verdicts and Actions

| Verdict | Action |
|---|---|
| `progressing` | Continue normally |
| `stuck_no_info` | Spawn tool-builder sub-agent |
| `stuck_code_error` | Spawn debugger sub-agent |
| `stuck_looping` | Force replan — rewrite the agent's next-step plan |
| `phase_complete` | Check success criteria, stop or prompt for next phase |
| `needs_human` | Send Telegram message asking for help |

### Checkpointing

Before any corrective action, the watchdog creates a checkpoint node on the canvas:

```
+------------------------------+
| Checkpoint @ Loop 23         |
| Status: stuck_code_error     |
| Action: spawned debugger     |
| [Branch from here]           |
+------------------------------+
```

Full canvas state saved to `autoresearch/canvases/main/checkpoints/loop-023.json`. User or agent can branch from any checkpoint to try a different approach.

### Completion Detection

After each watchdog evaluation, if verdict is `phase_complete`:
1. Run a focused LLM call against the user's success criteria
2. Requires 2 consecutive "complete" verdicts before stopping
3. On stop: write final overview.md, emit completion event
4. Frontend shows completion banner with "Resume anyway" button
5. Telegram notification sent

---

## 3. Tool-Builder Sub-Agent

### Trigger

Watchdog verdict `stuck_no_info` or `stuck_code_error`.

### Process

1. Watchdog identifies what's needed
2. New sub-agent canvas created (visible in project tree)
3. Sub-agent runs its own research loop with this goal:
   - Write a Python script implementing the tool
   - Write a manifest.json (name, description, input/output schema)
   - Write unit tests for correctness
   - Write integration tests for real-world usefulness
   - Write a README.md
   - Iterate until all tests pass

### manifest.json Format

```json
{
  "name": "arxiv_scraper",
  "description": "Search arXiv for papers and return structured metadata",
  "version": 1,
  "input_schema": {
    "query": "string",
    "max_results": "number"
  },
  "output_schema": {
    "papers": [{"title": "string", "authors": "string[]", "abstract": "string", "url": "string", "year": "number"}]
  },
  "command": "python arxiv_scraper.py",
  "created_by_session": "bitnet-tts-51a97e43",
  "test_status": "passing",
  "last_tested": "2026-03-23T10:00:00Z"
}
```

### How Tools Are Used

The ToolRegistry scans `~/.autoresearch/tools/` and the project's `tools/` folder on startup. Any tool with a valid manifest and `test_status: passing` is available. The agent calls it like any built-in tool. The registry executes: `python <tool_path>/<script> --input '<json>'` and returns stdout.

### Tool Improvement

When the watchdog notices a custom tool failing (error rate > 30%), it spawns a sub-agent to fix it. The sub-agent reads existing code + tests, diagnoses the issue, fixes the code, runs regression tests, bumps the version.

### Global Storage

Tools built in any session are saved to `~/.autoresearch/tools/` and available to all future sessions. Project-local tools go in `<working_dir>/tools/`.

---

## 4. Core Tool Set

### Tier 1 — Built-in (ship with the app)

| Tool | Description |
|---|---|
| `web_search` | Search the web (DuckDuckGo API, free) |
| `web_read` | Fetch and parse a URL to markdown |
| `shell` | Run any shell command natively (full GPU/MPS access) |
| `file_read` | Read a file |
| `file_write` | Write/create a file |
| `file_list` | List directory contents |
| `git` | Git operations (clone, commit, diff, log, branch) |
| `package_manager` | pip install, npm install, cargo add — auto-detection |
| `pdf_reader` | Extract text from PDFs |
| `arxiv_search` | Search arXiv API, return paper metadata + abstracts |

### Tier 2 — Auto-installed on first use

| Tool | Description |
|---|---|
| `youtube_transcript` | Fetch YouTube video transcripts |
| `docker` | Build/run Docker containers |
| `screenshot` | Take a screenshot of a running app |

### Key Change

`shell` replaces `code_executor`. The agent runs `python train.py` or `swift build` directly instead of writing temp files. Simpler, more powerful, matches human workflow.

---

## 5. Self-Improvement

### Skill Documents

Generated automatically when a session ends or a major phase completes.

```
~/.autoresearch/skills/
+-- building-bitnet-models.md
+-- training-on-apple-mps.md
+-- literature-review-ml.md
```

Skill doc structure:
- **What Worked** — successful approaches
- **What Failed** — dead ends and why
- **Key Sources** — important references found
- **Recommended Approach** — step-by-step best practice
- **Tools Built** — tools created during the session

When a skill doc is loaded into a new session and the agent discovers new information, the skill doc is updated at session end. `times_used` counter increments. Frequently-used skills get refined over time.

### Cross-Session Memory (SQLite FTS5)

```
~/.autoresearch/memory.db

Table: sessions
  id, name, question, success_criteria, status,
  created_at, summary, skill_doc_path

Table: sessions_fts (FTS5 virtual table)
  indexed on: name, question, summary
```

When a new session starts:
1. Search `sessions_fts` for relevant past sessions
2. Load matching skill docs
3. Inject into agent's system prompt as "past experience"

Cost: ~$0.01 per session for the summary LLM call. SQLite is free, local.

### Wizard Integration (Step 6)

New sessions show relevant past experience and available tools. User can check/uncheck what to include:
- Past skill docs (checked = injected into system prompt)
- Past tools (checked = registered in ToolRegistry)

If no past experience exists, this step is skipped.

---

## 6. Telegram Integration

### Setup

User enters a Telegram bot token in app settings (created via @BotFather, free).

### Three Modes

**Progress summaries** — automatic, every N loops or on major events:
- Current loop, active work, recent progress
- Tools built, papers found, metrics
- Progress percentage

**Stuck escalation** — when watchdog exhausts self-repair:
- What's stuck, what was tried, what failed
- Asks for human input

**User commands** — reply to the bot:

| Command | Effect |
|---|---|
| Free text | Injected as CHAT signal into agent's next loop |
| `stop` | Pauses the session |
| `resume` | Resumes the session |
| `status` | Returns current state summary |
| `skip` | Marks current sub-question as blocked, moves on |
| `screenshot` | Returns PNG of current canvas |

### Architecture

Bot runs as a background thread in the Rust backend (long polling). No external server. When app is closed, bot stops. Queued messages processed on next launch.

### Config

```
~/.autoresearch/config.json
{
  "telegram_bot_token": "...",
  "telegram_chat_id": "...",
  "notify_every_n_loops": 10,
  "notify_on_stuck": true,
  "notify_on_complete": true
}
```

---

## 7. OpenRouter Integration

Replace DeepInfra with OpenRouter.

- Base URL: `https://openrouter.ai/api/v1`
- Model list: `GET /api/v1/models` (returns all available models with pricing, context length)
- Headers: `HTTP-Referer`, `X-Title` (required by OpenRouter)
- Same OpenAI-compatible chat completions format

Model picker: searchable dropdown showing model name, provider, context length, price per token. API key and model selection saved to `~/.autoresearch/config.json`.

---

## 8. Updated Data Layout

Working directory IS the session. No more `src-tauri/research/`.

```
/Users/you/Projects/BitNetTTS/     <- user picks this
+-- autoresearch/                   <- visible, internal state
|   +-- meta.json
|   +-- canvases/
|   +-- chat.json
+-- tools/                          <- project-specific tools
+-- overview.md                     <- always visible
+-- train.py                        <- agent-created code
+-- model.py
```

Global index at `~/.autoresearch/sessions.json` tracks all sessions by path. Home screen reads this index to list past sessions.

---

## 9. Node Detail Panel

Type-specific rich panels when clicking a node:

- **Source nodes:** title, URL (clickable), summary, relevance score, connections, loop context
- **Finding nodes:** claim, confidence bar, supporting sources (clickable), connections
- **Experiment nodes:** hypothesis, code snippet, before/after metrics, improvement percentage
- **Question nodes:** status, sub-questions with checkmarks, connections
- **Tool-building nodes:** status, test count, click-to-view sub-canvas

All nodes have an expandable "Loop Context" accordion showing the agent's reasoning, tool calls, and other nodes created in the same loop.

---

## Implementation Priority

1. **OpenRouter migration** — swap DeepInfra for OpenRouter, model picker
2. **Core tool set** — add shell, git, package_manager, arxiv_search, pdf_reader
3. **Watchdog + completion detection** — stuck detection, auto-stop
4. **Data layout** — working dir = session, autoresearch/ folder, global index
5. **Multi-canvas** — project tree sidebar, sub-canvas switching
6. **Tool-builder sub-agent** — spawn, build, test, register
7. **Self-improvement** — skill docs, SQLite FTS5 memory, wizard step 6
8. **Telegram bot** — progress, escalation, commands
9. **Node detail panel** — type-specific rich panels
10. **Session wizard** — 6-step guided flow
