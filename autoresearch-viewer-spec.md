# Autoresearch — Product Spec

**Author:** Mekyle Naidoo
**Date:** March 22, 2026
**Status:** Draft v3

---

## 1. Problem

Research — whether scientific, mathematical, or engineering — follows the same shape: question, explore, experiment, evaluate, refine, repeat. Humans have always done this manually. Karpathy's autoresearch showed that an AI agent can run this loop autonomously for ML optimization: it made 700 changes to a training script in two days, finding 20 real improvements.

But that system is locked to one domain, one output format, and one way of working. The human writes a fixed prompt (`program.md`), walks away, and comes back to a TSV log. There's no way to see the shape of the research as it unfolds. No way to steer mid-flight. No shared representation between the human and the agent.

Meanwhile, every other autonomous research system — Sakana's AI Scientist, Google's AI Co-Scientist, DOLPHIN — has the same gap. The AI's understanding is trapped in context windows and logs. The human either gets a final artifact (a paper, a number) or nothing at all until it's done.

What's missing is a **shared visual surface** where the AI externalizes its research process as a diagram, and the human can watch it grow, read it, and edit it to steer the agent's direction. The diagram isn't a report generated at the end — it's the live, evolving representation of the agent's thinking.

---

## 2. Core Idea

A prompt template defines a research session. It specifies three things:

1. **The question** — what to research.
2. **The process** — how to research it (loop steps, tools, evaluation criteria, stop conditions).
3. **The output schema** — what the visual diagram should look like (node types, edge types, layout rules, visual encoding).

The agent reads this template, begins researching, and produces a visual diagram on an infinite canvas as it works. The diagram is the agent's externalized understanding. The human watches the diagram grow in real time and can intervene in two ways: chatting with the agent in natural language, or directly editing the diagram (deleting branches, adding annotations, drawing connections). The agent treats both as input on its next cycle.

Different templates produce different diagrams:

- An ML optimization template produces a **horizontal timeline** of experiments with keep/discard coloring.
- A literature review template produces a **radial knowledge web** of sources clustered by subtopic.
- A math exploration template produces a **top-down proof tree** with branching sub-conjectures.

Same engine. Same canvas. Different templates.

---

## 3. Users

**Primary:** Researchers, engineers, and anyone who wants to point an AI at a question and watch it systematically explore — intervening when they see fit, not babysitting every step.

**Secondary:** Template authors — domain experts who encode their research methodology into a prompt template that anyone can use. Contributing a template doesn't require writing code.

**Tertiary:** Open-source developers who extend the engine (new tools, new canvas features, new layout algorithms).

---

## 4. The Prompt Template

The prompt template is the single most important artifact in the system. It's a Markdown file with YAML frontmatter. The frontmatter is structured configuration; the Markdown body is freeform natural language instructions for the agent.

### 4.1 Structure

```
---
# Metadata
name: string
domain: string
version: number

# Process — how the agent researches
process:
  description: string
  loop: [steps]
  tools: [tool names]
  stop_conditions: [conditions]

# Canvas — what the output looks like
canvas:
  description: string
  node_types: {type definitions}
  edge_types: {type definitions}
  layout: {layout rules}
---

# Agent Instructions (freeform Markdown)

Natural language guidance for the agent: starting points,
strategies, constraints, evaluation rubrics, domain-specific
knowledge the agent should use.
```

### 4.2 The Process Section

Defines the research loop. Each step has a name, a description, and optionally specifies what output it produces on the canvas.

The process section is **descriptive, not executable.** It tells the agent what the steps of research look like in this domain. The agent uses it as a guide, not as a rigid program. The agent can skip steps, reorder them, or repeat them as the research demands — but it should follow the spirit of the defined process.

Key fields:

- **`loop`** — ordered list of step definitions. Each step has a `step` name, a `description`, optional `constraints`, optional `tools`, and optional `output` (what kind of canvas node this step produces).
- **`tools`** — which tools the agent has access to (web search, code execution, file system, domain-specific tools).
- **`stop_conditions`** — when the agent should stop autonomously. Can include time limits, failure thresholds, coverage criteria, or "human sends stop signal."

### 4.3 The Canvas Section

This is what makes the system different from every other autonomous research tool. The canvas section defines the **visual ontology** — the vocabulary of shapes and connections the agent uses to externalize its thinking.

Key fields:

- **`node_types`** — each node type has a `shape`, a list of `fields` (structured data it carries), optional `color_rule` (how it's visually encoded), and a `description` (what this node type represents).
- **`edge_types`** — each edge type has a `description` (what the relationship means), and a `style` (solid, dashed, colored, directional).
- **`layout`** — spatial arrangement rules. `primary_axis` (left-to-right, top-to-bottom, radial), `branching` direction, `clustering` logic, and optionally `semantic_zoom` rules (what's visible at different zoom levels).

The canvas section is a **soft schema.** The agent should follow it, but it can create an "untyped" node if it encounters something that doesn't fit the defined types. This keeps the system flexible without losing structure.

### 4.4 The Agent Instructions (Markdown Body)

Freeform natural language. This is where the template author's domain expertise lives. It can include:

- Starting points and search strategies
- Evaluation rubrics (how to judge quality of sources, significance of results)
- Domain-specific constraints ("never modify `prepare.py`", "only consider papers from 2024+")
- Synthesis rules ("after every 5 sources, write a finding node")
- Strategic guidance ("if you've failed 5 times in a row, step back and reconsider your approach")

This section is the direct descendant of Karpathy's `program.md`. The difference is that it operates alongside a structured process and canvas schema, rather than being the only interface between human and agent.

### 4.5 Template Library

Templates are shared as individual `.md` files. The project ships with starter templates covering the most common research patterns:

- **`ml-optimization.md`** — Karpathy-style experiment loop
- **`literature-review.md`** — systematic source gathering and synthesis
- **`math-exploration.md`** — conjecture testing with computation
- **`general-research.md`** — open-ended exploration with web search

The community contributes domain-specific templates. No code required — just a Markdown file.

---

## 5. The Canvas

### 5.1 What It Is

An infinite, zoomable visual surface. The agent populates it with nodes and edges as it researches. The human observes and can edit.

The canvas is **not** a dashboard, not a log viewer, not a visualization of something happening elsewhere. The canvas IS the agent's working memory, made visible. When the agent updates the canvas, it's updating its own state. When the human edits the canvas, they're editing the agent's state.

### 5.2 What Appears On It

The node and edge types are defined by the prompt template (Section 4.3). Across all templates, every node carries:

- **`id`** — unique identifier
- **`type`** — which node type from the template
- **`title`** — short label visible at most zoom levels
- **`summary`** — longer description visible when zoomed in or clicked
- **`status`** — `queued`, `active`, `completed`, `failed`, `discarded`
- **`created_at`** — timestamp, used for history scrubbing
- **`fields`** — domain-specific structured data defined by the template

### 5.3 How It Grows

The agent emits structured operations as it works:

- `ADD_NODE` — a new node appears on the canvas
- `UPDATE_NODE` — an existing node's status, summary, or fields change
- `REMOVE_NODE` — the agent decides a node is no longer relevant
- `ADD_EDGE` — a relationship between two nodes
- `REMOVE_EDGE` — a relationship is retracted
- `ADD_CLUSTER` — a group of nodes is recognized as a logical unit
- `SET_FOCUS` — the agent highlights the node it's currently working on
- `SNAPSHOT` — a history checkpoint is saved

Node placement uses **position hints** ("near node X", "branch from Y", "continuation of current path"), not exact coordinates. The layout engine resolves hints into positions.

### 5.4 Semantic Zoom

At different zoom levels, the canvas shows different amounts of detail. This is critical for making diagrams with hundreds of nodes readable.

- **Far zoom:** Cluster labels and major branches only. Individual nodes are dots or hidden.
- **Mid zoom:** Node titles visible. Edge labels visible on hover.
- **Close zoom:** Full node detail — summary, fields, metadata.
- **Click-to-inspect:** Opens a detail panel with everything the agent knows about that item.

The template's `layout.semantic_zoom` section can customize these thresholds.

### 5.5 History Scrubbing

A timeline slider at the bottom of the canvas lets the human scrub through the research history. Every `SNAPSHOT` operation from the agent marks a point on the timeline. Dragging the slider backward shows the canvas as it existed at that earlier point. This lets the human replay how the research unfolded.

### 5.6 Visual Style

Hand-drawn, informal, Excalidraw-like. The diagram should feel like a whiteboard, not a UML editor. Rendered with Rough.js on an HTML Canvas 2D context.

---

## 6. Human-Agent Interaction

### 6.1 Observation

The default mode. The human watches the canvas grow in real time. Nodes appear as the agent works. A pulse or glow highlights the currently-active node. The human zooms in and out, pans around, inspects nodes by clicking.

### 6.2 Chat

A persistent chat panel alongside the canvas. The human types natural language messages:

- Broad steering: "Focus more on the theoretical angle."
- Specific references: "The finding in node F-23 seems wrong — check the source again."
- Questions: "Why did you choose to explore optimizer changes over architecture changes?"
- Instructions: "Stop exploring that branch and try X instead."

The agent processes chat messages at the start of its next cycle. The agent can also initiate messages: "I've hit a dead end on Branch A. Should I try a different approach or go deeper?"

Node references in chat are first-class: clicking a node then typing a message auto-tags the message with that node's ID.

### 6.3 Direct Manipulation

The human can directly edit the canvas:

| Action | What the agent interprets |
|---|---|
| Delete a node or branch | Deprioritize that direction |
| Add an annotation node | A human note to factor into the next cycle |
| Draw a new edge between nodes | "Investigate this relationship" |
| Mark a node as "important" (right-click) | Prioritize this direction |
| Mark a node as "wrong" (right-click) | Challenge this finding, re-examine |
| Rearrange nodes | Cosmetic only — agent ignores spatial moves |

Human edits are accumulated and processed by the agent at the start of each loop iteration, alongside any chat messages.

### 6.4 Pause / Resume / Fork

- **Pause:** The agent finishes its current step, then stops. The canvas freezes. The human can explore, read, annotate at leisure.
- **Resume:** The agent picks up where it left off, incorporating any edits the human made while paused.
- **Fork:** The human picks a point in history (via the scrubber) and starts a new research branch from that point. The original branch is preserved. This lets the human explore "what if the agent had gone a different direction?"

---

## 7. Session Lifecycle

**Start.** The human opens the app, selects or writes a prompt template, and hits start. The agent reads the template, generates an initial plan (a small cluster of nodes: the main question decomposed into sub-questions), and begins executing.

**Run.** The agent loops continuously. The canvas grows. The human observes and intervenes as needed. Sessions can run for minutes or days.

**End.** The human stops the agent (or a stop condition triggers). The final canvas is the deliverable: a visual map of everything explored, what worked, what didn't, and how findings connect.

**Output.** The session can be:

- **Saved** as a `.autoresearch` file (JSON) and reopened later to continue.
- **Exported** as PNG/SVG (the diagram as an image).
- **Exported** as Markdown (an auto-generated research report, structured from the canvas contents — findings as sections, sources as citations, experiment results as tables).
- **Forked** to start a new research branch from any point.

---

## 8. Technology

| Component | Choice | Rationale |
|---|---|---|
| Desktop shell | Tauri | ~10MB binary, Rust backend for file system and code sandboxing, cross-platform. |
| UI framework | React + TypeScript | Large contributor pool for OSS, well-understood. |
| Canvas rendering | HTML Canvas 2D + Rough.js | Handles thousands of nodes, hand-drawn aesthetic, no DOM overhead. |
| Layout engine | Dagre (hierarchical) + force-directed | Dagre for structured layouts (trees, pipelines), force-directed for organic/radial layouts. Template selects which. |
| State management | Zustand | Lightweight, supports undo/redo via history middleware. |
| LLM interface | Provider-agnostic abstraction | OpenAI, Anthropic, Ollama/local. Structured JSON output. Streaming for real-time node updates. |
| Code sandbox | Docker containers | Agent-generated code runs isolated with resource limits. |
| Persistence | JSON files on disk | Simple, inspectable, git-friendly. No database. |

---

## 9. Milestones

### M1 — Prompt Template Parser + Headless Agent (3 weeks)
Parse the template format. Build the research loop. Run the agent in a terminal with no UI. Output is a stream of canvas operations (JSON). Validate with the ML optimization template against a real `train.py`.

**Exit criteria:** The agent can run the Karpathy-style loop end-to-end, emitting structured canvas operations that correctly represent its research process.

### M2 — Canvas Renderer (3 weeks)
Build the canvas as a standalone component. It reads a recorded stream of canvas operations and renders them as an interactive diagram. Pan, zoom, semantic zoom, node inspection, history scrubbing.

**Exit criteria:** A recorded ML optimization session renders as a readable, navigable diagram with correct layout and semantic zoom.

### M3 — Live Integration (2 weeks)
Connect the agent to the canvas in real time. Nodes appear as the agent works. Pause/resume. Active node highlighting.

**Exit criteria:** A human can start a research session, watch nodes appear live, pause, inspect, resume.

### M4 — Human-in-the-Loop (2 weeks)
Chat panel. Direct canvas manipulation. Canvas→Agent signal protocol. The agent processes human input on each cycle.

**Exit criteria:** A human can steer a live research session via chat and canvas edits, and the agent demonstrably changes direction in response.

### M5 — Second Domain (2 weeks)
Build and validate a second template (literature review). Fix any ML-specific assumptions baked into the engine. Refine the template format.

**Exit criteria:** The literature review template produces a radial knowledge web that is qualitatively different from the ML timeline, using the same engine.

### M6 — Export + Package + Ship (2 weeks)
PNG/SVG/Markdown export. Tauri packaging for macOS, Windows, Linux. Documentation. Starter template library. First public release.

**Exit criteria:** A new user can download the app, select a starter template, run a research session, and export the result.

**Total: ~14 weeks to v1.**

---

## 10. Design Principles

**The template is the product.** The engine is infrastructure. The templates are where domain expertise lives. The community contributes templates, not code.

**The canvas is the truth.** Everything the agent knows and has done is visible. There is no hidden state. If it's not on the canvas, it didn't happen.

**The AI leads, the human steers.** The default is autonomous operation. The human intervenes selectively, not constantly. The system is useful even if the human walks away for an hour.

**Legible reasoning.** Every decision the agent makes is visible and inspectable. The human should never wonder "why did the agent do that?"

**Local-first.** Everything runs on the user's machine. No cloud dependency except LLM API calls (which can be local via Ollama).

---

## 11. Open Questions

1. **Self-modifying templates.** Should the agent be able to propose changes to its own template mid-session? This would give it Reflexion-style self-evolution. Safest approach: the agent proposes, the human approves. The canvas could show proposed template changes as a special node type.

2. **Canvas complexity at scale.** After hundreds of nodes, the canvas gets dense. Options: auto-collapse old branches, aggressive semantic zoom, a "prune" command that archives completed work. Which are v1?

3. **Multi-agent.** Multiple agents working different branches in parallel, converging on the same canvas. Powerful but complex. Probably v2.

4. **Template inheritance.** Can a "chemistry-optimization" template extend a base "experiment-loop" template? Reduces duplication but adds complexity to the template format.

5. **Trust and verification.** The agent makes claims. How does the human verify? Source links are baseline. A "verify" action that asks the agent to double-check itself? Confidence scores on findings?

6. **Template marketplace.** How are community templates discovered and installed? A GitHub repo? A CLI? A registry in the app?

---

## 12. Non-Goals (v1)

- Cloud hosting or SaaS
- Real-time multiplayer
- Mobile or tablet interface
- Agent fine-tuning or training
- Formal verification of outputs
- Integration with physical lab equipment
