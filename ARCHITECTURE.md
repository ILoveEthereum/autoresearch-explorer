# Autoresearch — Technical Architecture

---

## 1. System Overview

Autoresearch has four major components. The **Prompt Template** defines the research session. The **Agent Runtime** executes the research loop. The **Canvas** renders the agent's evolving understanding as a visual diagram. The **Interaction Layer** translates human input into signals the agent can process.

Data flows in a cycle:

```
Template ──▶ Agent Runtime ──▶ Canvas Operations ──▶ Canvas
                  ▲                                     │
                  │                                     │
                  └──── Human Signals ◄────────────────┘
```

The template is read once at session start (and potentially re-read if modified). The agent runs its loop, emitting canvas operations. The canvas renders those operations. The human observes the canvas and produces signals (chat messages, direct edits). Those signals feed back into the agent on its next cycle.

---

## 2. Component Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           TAURI SHELL                                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      RENDERER (React)                          │  │
│  │                                                                │  │
│  │  ┌──────────────┐  ┌──────────────────┐  ┌────────────────┐   │  │
│  │  │ Canvas View  │  │ Chat Panel       │  │ Detail Panel   │   │  │
│  │  │              │  │                  │  │                │   │  │
│  │  │ Rough.js     │  │ Message list     │  │ Node inspector │   │  │
│  │  │ rendering    │  │ Input box        │  │ Full data view │   │  │
│  │  │ Layout eng.  │  │ Node references  │  │                │   │  │
│  │  │ Interaction  │  │                  │  │                │   │  │
│  │  │ handlers     │  │                  │  │                │   │  │
│  │  └──────┬───────┘  └────────┬─────────┘  └───────┬────────┘   │  │
│  │         │                   │                     │            │  │
│  │         ▼                   ▼                     ▼            │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │                     STATE STORE (Zustand)                │  │  │
│  │  │                                                          │  │  │
│  │  │  diagram: { nodes, edges, clusters, viewport }           │  │  │
│  │  │  session: { status, step, history[], template }          │  │  │
│  │  │  chat: { messages[] }                                    │  │  │
│  │  │  humanSignals: { pending[], processed[] }                │  │  │
│  │  │  ui: { selectedNode, activeTool, panels }                │  │  │
│  │  └──────────────────────────┬───────────────────────────────┘  │  │
│  └─────────────────────────────┼──────────────────────────────────┘  │
│                                │                                     │
│  ┌─────────────────────────────┼──────────────────────────────────┐  │
│  │                    BACKEND (Rust / Node)                       │  │
│  │                             │                                  │  │
│  │  ┌─────────────────────────┐│┌──────────────────────────────┐  │  │
│  │  │    AGENT RUNTIME        │││   TEMPLATE PARSER            │  │  │
│  │  │                         │││                              │  │  │
│  │  │  ┌───────────────────┐  │││  YAML frontmatter ──▶ config │  │  │
│  │  │  │  Research Loop    │  │││  Markdown body ──▶ prompt     │  │  │
│  │  │  │                   │  │││  Validate schema              │  │  │
│  │  │  │  For each cycle:  │◄─┘│└──────────────────────────────┘  │  │
│  │  │  │  1. Read signals  │   │                                  │  │
│  │  │  │  2. Build context │   │┌──────────────────────────────┐  │  │
│  │  │  │  3. Call LLM      │   ││   TOOL EXECUTOR              │  │  │
│  │  │  │  4. Parse output  │   ││                              │  │  │
│  │  │  │  5. Execute tools │──▶││  Web search                  │  │  │
│  │  │  │  6. Emit canvas   │   ││  Code sandbox (Docker)       │  │  │
│  │  │  │     operations    │   ││  File system                 │  │  │
│  │  │  │  7. Snapshot      │   ││  Domain-specific             │  │  │
│  │  │  └───────────────────┘   ││                              │  │  │
│  │  └──────────────────────────┘│└──────────────────────────────┘  │  │
│  │                              │                                  │  │
│  │  ┌───────────────────────────┴─────────────────────────────┐   │  │
│  │  │                   PERSISTENCE                            │   │  │
│  │  │                                                          │   │  │
│  │  │  session/                                                │   │  │
│  │  │  ├── meta.json          (session metadata)               │   │  │
│  │  │  ├── template.md        (copy of prompt template used)   │   │  │
│  │  │  ├── state.json         (current canvas + agent state)   │   │  │
│  │  │  ├── history/                                            │   │  │
│  │  │  │   ├── 001.json       (snapshot after step 1)          │   │  │
│  │  │  │   ├── 002.json       (snapshot after step 2)          │   │  │
│  │  │  │   └── ...                                             │   │  │
│  │  │  ├── sources/           (cached web pages, papers)       │   │  │
│  │  │  └── artifacts/         (generated code, proofs, data)   │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Agent Runtime

### 3.1 The Loop

The agent runs a continuous loop. Each iteration ("cycle") follows this sequence:

```
┌─────────────────────────────────────────────┐
│               AGENT CYCLE                    │
│                                              │
│  1. COLLECT SIGNALS                          │
│     Read all pending human signals           │
│     (chat messages, canvas edits)            │
│                                              │
│  2. BUILD CONTEXT                            │
│     Assemble the LLM prompt:                 │
│     - Template instructions (static)         │
│     - Current canvas state (serialized)      │
│     - Human signals from this cycle          │
│     - Rolling window of recent N steps       │
│     - Summary of older history               │
│                                              │
│  3. CALL LLM                                 │
│     Send context to the configured LLM       │
│     Request structured JSON output:          │
│     - reasoning (text)                       │
│     - plan (what to do this cycle)           │
│     - tool_calls (if any)                    │
│     - canvas_operations (what to update)     │
│                                              │
│  4. EXECUTE TOOLS                            │
│     Run any tool calls (web search,          │
│     code execution, etc.) in sandbox         │
│     Collect results                          │
│                                              │
│  5. SECOND LLM CALL (if tools were used)     │
│     Feed tool results back to LLM            │
│     Get final canvas operations              │
│                                              │
│  6. EMIT CANVAS OPERATIONS                   │
│     Push operations to the state store       │
│     Canvas re-renders                        │
│                                              │
│  7. SNAPSHOT                                 │
│     Save current state to history/           │
│     Increment step counter                   │
│                                              │
│  8. CHECK STOP CONDITIONS                    │
│     If any stop condition is met, halt       │
│     Otherwise, loop back to step 1           │
└─────────────────────────────────────────────┘
```

### 3.2 Context Management

The LLM has a finite context window. The agent must fit the entire research state into it. Strategy:

**Always included:**
- Template instructions (process + canvas schema + agent instructions)
- Pending human signals
- Current canvas state (all nodes and edges, serialized as structured text)

**Windowed:**
- Detailed history of the last N cycles (reasoning, tool outputs, decisions)
- N is dynamically adjusted based on available context budget

**Summarized:**
- Older history is compressed into a summary: "In cycles 1-50, the agent explored X and found Y. Key findings: ..."
- Summaries are generated by a separate LLM call when the window shifts

**On demand:**
- Full source content (papers, web pages) is stored in `sources/` and referenced by ID. The agent can request a source be loaded into context when needed.

The context budget allocation:

```
┌──────────────────────────────────────┐
│         CONTEXT WINDOW               │
│                                      │
│  ┌──────────────────────────┐        │
│  │ Template instructions    │  ~15%  │
│  ├──────────────────────────┤        │
│  │ Human signals            │  ~5%   │
│  ├──────────────────────────┤        │
│  │ Current canvas state     │  ~30%  │
│  ├──────────────────────────┤        │
│  │ Recent history window    │  ~30%  │
│  ├──────────────────────────┤        │
│  │ Older history summary    │  ~10%  │
│  ├──────────────────────────┤        │
│  │ Reserved for output      │  ~10%  │
│  └──────────────────────────┘        │
└──────────────────────────────────────┘
```

### 3.3 LLM Output Schema

Every LLM call returns structured JSON:

```json
{
  "reasoning": "I'm exploring optimizer changes because the last 3 architecture experiments showed diminishing returns. The learning rate schedule hasn't been touched yet and is a likely source of improvement.",

  "plan": "Test cosine annealing with warm restarts, period=100 steps.",

  "tool_calls": [
    {
      "tool": "code_executor",
      "input": {
        "code": "# modified train.py with cosine annealing...",
        "timeout": 300
      }
    }
  ],

  "canvas_operations": [
    {
      "op": "ADD_NODE",
      "node": {
        "id": "exp-47",
        "type": "experiment",
        "title": "Cosine annealing LR schedule",
        "summary": "Testing cosine annealing with warm restarts, T_0=100",
        "status": "active",
        "fields": {
          "hypothesis": "Cosine annealing will improve convergence in later training stages",
          "change_summary": "Replaced linear LR decay with CosineAnnealingWarmRestarts(T_0=100)"
        },
        "position_hint": { "after": "exp-46", "cluster": "optimizer-experiments" }
      }
    },
    {
      "op": "ADD_EDGE",
      "edge": {
        "from": "insight-12",
        "to": "exp-47",
        "type": "informed_by",
        "label": "motivated by diminishing architecture returns"
      }
    }
  ],

  "chat_message": null
}
```

The `chat_message` field allows the agent to proactively communicate with the human ("I've hit a dead end, should I try a different approach?").

---

## 4. Canvas Engine

### 4.1 Rendering Pipeline

```
State Store (nodes, edges, clusters)
        │
        ▼
Layout Engine (Dagre / force-directed)
        │
        ▼
Position Resolution (position_hints → coordinates)
        │
        ▼
Visibility Culling (viewport + semantic zoom)
        │
        ▼
Rough.js Rendering (Canvas 2D)
        │
        ▼
Interaction Layer (hit detection, drag, selection)
```

The layout engine runs when nodes are added or removed. It does not re-run when the human drags a node (those positions are pinned). When the agent adds a new node with a `position_hint`, the layout engine places it and adjusts surrounding nodes minimally.

### 4.2 Layout Modes

The prompt template's `layout.primary_axis` field selects the layout mode:

- **`left_to_right`** — Dagre with horizontal rank direction. Best for timelines and pipelines.
- **`top_to_bottom`** — Dagre with vertical rank direction. Best for proof trees and hierarchies.
- **`radial`** — Force-directed layout with a central anchor node. Best for knowledge webs and exploration maps.
- **`freeform`** — No auto-layout. The agent specifies coordinates directly (useful for highly custom templates).

### 4.3 Clustering

Nodes with the same `cluster` in their `position_hint` are grouped together. Clusters are rendered as a light background region with a label. The layout engine treats clusters as constraints: nodes in the same cluster stay spatially close.

Clusters can be nested. A cluster can be collapsed (showing only its label and a count) or expanded. The `semantic_zoom` rules from the template control default collapse behavior at different zoom levels.

### 4.4 Semantic Zoom Implementation

The canvas maintains three render lists based on zoom level:

- **Z < 0.3 (far):** Only clusters and their labels. Edges between clusters as bundled lines.
- **0.3 ≤ Z < 0.7 (mid):** Cluster backgrounds + individual node titles. Edges shown with directional arrows.
- **Z ≥ 0.7 (close):** Full node rendering with summary text, fields, and status indicators. Edge labels visible.

Templates can override these thresholds.

### 4.5 Performance

Target: 60fps with up to 2,000 nodes. Strategies:

- **Viewport culling:** Only render nodes within the visible viewport (plus a margin for smooth panning).
- **Level-of-detail:** Far-zoom nodes render as simple rectangles or circles, not full Rough.js shapes.
- **Batched rendering:** Canvas operations from a single agent cycle are batched into one render pass.
- **Off-screen canvas:** The minimap renders to a separate, lower-resolution canvas.

---

## 5. Protocols

### 5.1 Agent → Canvas (Canvas Operations)

| Operation | Fields | Effect |
|---|---|---|
| `ADD_NODE` | `id, type, title, summary, status, fields, position_hint` | New node appears on canvas |
| `UPDATE_NODE` | `id, status?, summary?, fields?` | Existing node updates in place |
| `REMOVE_NODE` | `id` | Node fades out and is removed |
| `ADD_EDGE` | `from, to, type, label?, style?` | Connection drawn between nodes |
| `REMOVE_EDGE` | `from, to` | Connection removed |
| `ADD_CLUSTER` | `id, label, children[]` | Nodes grouped visually |
| `SET_FOCUS` | `nodeId` | Highlight glow on the active node |
| `SNAPSHOT` | — | History checkpoint saved |

### 5.2 Canvas → Agent (Human Signals)

| Human Action | Signal Type | Payload |
|---|---|---|
| Chat message | `CHAT` | `{ text, referencedNodeIds[] }` |
| Delete node/branch | `DEPRIORITIZE` | `{ nodeId }` |
| Add annotation node | `ANNOTATE` | `{ text, nearNodeId }` |
| Draw new edge | `INVESTIGATE` | `{ fromId, toId }` |
| Mark "important" | `PRIORITIZE` | `{ nodeId }` |
| Mark "wrong" | `CHALLENGE` | `{ nodeId }` |
| Pause | `PAUSE` | — |
| Resume | `RESUME` | — |

Signals are queued in `humanSignals.pending[]` and consumed by the agent at the start of each cycle.

---

## 6. Template Parser

### 6.1 Parsing Steps

1. **Read file.** Load the `.md` template from disk.
2. **Split frontmatter and body.** Extract the YAML block between `---` delimiters. Everything below is the Markdown body.
3. **Parse YAML.** Validate against the template schema (Section 6.2).
4. **Extract agent instructions.** The Markdown body becomes the freeform prompt text.
5. **Register node and edge types.** The `canvas.node_types` and `canvas.edge_types` become the valid types the agent can emit.
6. **Configure tools.** The `process.tools` list determines which tool executors are available to the agent.
7. **Set stop conditions.** Parsed into runtime-checkable predicates.

### 6.2 Template Schema Validation

Required fields:
- `name` (string)
- `process.description` (string)
- `process.loop` (array, at least one step)
- `canvas.node_types` (object, at least one type)
- `canvas.edge_types` (object, at least one type)
- `canvas.layout.primary_axis` (enum: left_to_right | top_to_bottom | radial | freeform)

Optional fields:
- `domain`, `version` (metadata)
- `process.tools` (defaults to `[web_search]`)
- `process.stop_conditions` (defaults to `["human sends stop signal"]`)
- `canvas.layout.semantic_zoom` (defaults to standard thresholds)
- `canvas.layout.clustering` (defaults to none)
- `canvas.description` (informational, not parsed)

The parser emits warnings for unrecognized fields (forward compatibility) and errors for missing required fields or invalid types.

---

## 7. Persistence

### 7.1 Session Directory Structure

Each session is saved as a directory:

```
~/.autoresearch/sessions/{session-id}/
├── meta.json
├── template.md
├── state.json
├── history/
│   ├── 000001.json
│   ├── 000002.json
│   └── ...
├── sources/
│   ├── {source-id}.json    (metadata + cached content)
│   └── ...
└── artifacts/
    ├── {artifact-id}.py    (generated code)
    ├── {artifact-id}.png   (generated plots)
    └── ...
```

### 7.2 `meta.json`

```json
{
  "id": "session-2026-03-22-abc123",
  "name": "Optimize GPT-2 Training",
  "templateName": "ml-optimization",
  "createdAt": "2026-03-22T10:00:00Z",
  "lastModified": "2026-03-22T18:45:00Z",
  "totalSteps": 93,
  "status": "paused",
  "llmProvider": "anthropic",
  "llmModel": "claude-sonnet-4-6"
}
```

### 7.3 `state.json`

The current canvas and agent state. This is the file loaded when resuming a session.

```json
{
  "canvas": {
    "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
    "nodes": [...],
    "edges": [...],
    "clusters": [...]
  },
  "agent": {
    "currentStep": 93,
    "recentHistory": [...],
    "historySummary": "In steps 1-70, the agent explored...",
    "pendingSignals": []
  }
}
```

### 7.4 History Snapshots

Each `history/{n}.json` file contains the delta from the previous snapshot (not the full state). This keeps storage manageable for long sessions. To reconstruct state at step N, apply deltas 1 through N to the initial state.

### 7.5 Auto-Save

The current state is auto-saved every 30 seconds and after every agent cycle. History snapshots are saved on every `SNAPSHOT` operation (typically once per cycle).

---

## 8. Tool Executor

### 8.1 Tool Interface

Every tool implements:

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  execute(input: unknown): Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  output: string;
  artifacts?: { id: string; path: string; type: string }[];
  error?: string;
}
```

### 8.2 Built-in Tools

| Tool | Description | Sandbox |
|---|---|---|
| `web_search` | Search the web, return titles + snippets + URLs | No sandbox needed |
| `web_read` | Fetch and parse a specific URL | No sandbox needed |
| `code_executor` | Run code (Python, JS, etc.) and return stdout/stderr | Docker container with resource limits |
| `file_read` | Read a file from the session's artifact directory | Session directory only |
| `file_write` | Write a file to the session's artifact directory | Session directory only |

### 8.3 Domain-Specific Tools

Templates can reference tools beyond the built-in set. These are registered as plugins:

```typescript
// Example: arxiv search tool
{
  name: "arxiv_search",
  description: "Search arXiv for papers matching a query",
  inputSchema: { query: "string", max_results: "number" },
  execute: async (input) => {
    // Call arXiv API
    // Return formatted results
  }
}
```

Plugins are installed separately and referenced by name in the template's `process.tools` list. If a template references a tool that isn't installed, the agent is told the tool is unavailable and must work without it.

### 8.4 Code Sandbox

Code execution runs in a Docker container with:
- No network access (unless explicitly granted by the template)
- CPU and memory limits (configurable, defaults: 2 CPU, 4GB RAM)
- Execution timeout (from the template's step timeout, default 5 minutes)
- Mounted volume: the session's `artifacts/` directory (read-write)
- Pre-installed: Python 3.11, numpy, scipy, matplotlib, sympy, pandas

The container is created once per session and reused across cycles. State within the container persists (installed packages, generated files) until the session ends.

---

## 9. LLM Integration

### 9.1 Provider Abstraction

```typescript
interface LLMProvider {
  name: string;
  call(messages: Message[], options: CallOptions): AsyncIterator<Chunk>;
}

interface CallOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  responseFormat: "json" | "text";
  tools?: ToolDefinition[];  // for native tool use
}
```

### 9.2 Supported Providers

| Provider | Models | Notes |
|---|---|---|
| Anthropic | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Recommended default. Strong structured output. |
| OpenAI | GPT-4+, GPT-5 | Native tool use support. |
| Ollama | Any locally-hosted model | For fully offline use. Performance varies by model. |

### 9.3 Streaming

Canvas operations are streamed as the LLM generates them. This means nodes can appear on the canvas *while the agent is still thinking about the rest of its cycle.* The UI shows a "thinking..." indicator on the agent's current focus while streaming is in progress.

### 9.4 Cost Management

Each cycle's token usage is tracked and displayed in the session UI. The template can set a `max_cost` stop condition (e.g., "stop after $5 of API usage"). Users can set global budget limits in settings.

---

## 10. Export

### 10.1 Image Export (PNG / SVG)

The canvas is rendered to an off-screen canvas at a configurable resolution. SVG export re-renders using SVG drawing primitives instead of Canvas 2D, preserving the hand-drawn Rough.js style as vector paths.

### 10.2 Markdown Report Export

The canvas is traversed in layout order and converted to a structured Markdown document:

- **Title:** Session name
- **Question:** From the template
- **Findings:** Each finding node becomes a section with its supporting evidence
- **Methods:** The process steps and tools used
- **Sources:** All source nodes, formatted as a bibliography
- **Appendix:** Experiment logs, code artifacts

This produces a readable research report from the canvas contents without the human writing anything.

### 10.3 JSON Export

The raw `state.json` for programmatic use or import into other tools.

---

## 11. Security Considerations

- **Code sandbox:** All agent-generated code runs in Docker. No host access.
- **API keys:** Stored in the OS keychain, not in plaintext config files.
- **Template safety:** Templates are just Markdown/YAML. They cannot execute code. Only the agent (via the LLM) can trigger tool execution.
- **Network:** The agent can only access the internet through registered tools. No raw HTTP from the agent runtime.
- **File system:** The agent can only read/write within its session directory. No access to the user's broader file system unless the template explicitly grants it (and the user confirms).
