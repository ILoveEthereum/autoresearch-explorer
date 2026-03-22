# Autoresearch

An AI agent that researches any question autonomously — while you watch and steer through a live visual canvas.

You give it a question and a prompt template. The agent searches, reads, experiments, and evaluates in a loop. As it works, it builds a diagram on an infinite canvas: every step it takes, every source it finds, every conclusion it draws, every decision it makes. You watch the diagram grow in real time. When you want to intervene, you type a message or edit the diagram directly — and the agent adjusts course.

The diagram is not a visualization of the agent's work. It IS the agent's work. The canvas is the shared mental model between you and the AI.

---

## How it works

**1. Write a prompt template** (or pick a starter one).

A prompt template is a single Markdown file that defines three things: what to research, how to research it, and what the output diagram should look like.

```yaml
---
name: "Survey: Mechanistic Interpretability"
process:
  loop:
    - step: search
      description: "Find relevant papers and talks"
    - step: read
      description: "Read and summarize each source"
    - step: connect
      description: "Link this source to what you already know"
    - step: synthesize
      description: "After every 5 sources, write a finding"
  tools: [web_search, pdf_reader]
canvas:
  node_types:
    source: { shape: box, fields: [title, authors, url, summary] }
    finding: { shape: highlighted_box, fields: [claim, confidence] }
    question: { shape: diamond, fields: [text, status] }
  edge_types:
    supports: { style: solid_arrow }
    contradicts: { style: red_dashed }
  layout:
    primary_axis: radial
    clustering: by_subtopic
---

# Agent Instructions

Search for papers on mechanistic interpretability in LLMs (2024-2026).
Start with survey papers, then go deep on the most cited techniques.
Rate each source on relevance, impact, and novelty (1-5 each).
After every 5 sources in a subtopic, write a finding that synthesizes
what the field currently knows.
```

**2. Start a session.** The agent reads the template and begins. Nodes appear on the canvas as it works.

**3. Watch, steer, or walk away.** You can:
- Watch the diagram grow in real time (zoom in on any node for details)
- Chat with the agent ("go deeper on circuits-level analysis")
- Click a node and say "this seems wrong" or "explore more like this"
- Delete a branch the agent is wasting time on
- Add a sticky note with context the agent doesn't have
- Pause, go get coffee, come back and resume
- Scrub through history to see how the research unfolded

**4. Export.** When done, export the canvas as an image, a structured Markdown report, or raw JSON.

---

## What it's for

Different templates produce different kinds of research on different kinds of canvases:

| Template | What the agent does | What the canvas looks like |
|---|---|---|
| ML Optimization | Modifies a training script in a loop, evaluating each change | Horizontal timeline of experiments (green = kept, red = discarded) |
| Literature Review | Searches, reads, and synthesizes papers on a topic | Radial knowledge web clustered by subtopic |
| Math Exploration | Tests conjectures computationally, attempts proofs, branches into sub-questions | Top-down proof tree |
| General Research | Open-ended web research on any question | Organic knowledge graph |

Same engine. Same canvas. Different templates.

---

## Concepts

**Prompt template** — the single Markdown file that defines a research session. Contains the research process (what steps to follow), the canvas schema (what nodes and edges mean), and freeform instructions for the agent. Templates are the main thing the community contributes.

**Canvas** — the infinite visual surface where the agent externalizes its thinking. Nodes represent steps, sources, findings, decisions. Edges represent relationships. The human can observe and edit. The agent updates it every cycle.

**Canvas operations** — structured messages the agent emits to update the canvas: `ADD_NODE`, `UPDATE_NODE`, `ADD_EDGE`, `SET_FOCUS`, etc. These are the agent's "output language."

**Human signals** — structured messages generated when the human interacts with the canvas or chat: `CHAT`, `DEPRIORITIZE`, `PRIORITIZE`, `CHALLENGE`, `ANNOTATE`, `INVESTIGATE`. These are the human's "input language."

**Session** — a running or paused research instance. Contains the canvas state, full history (every step), cached sources, and generated artifacts. Sessions can be saved, resumed, forked, and exported.

---

## Architecture

```
Template ──▶ Agent Runtime ──▶ Canvas Operations ──▶ Canvas
                  ▲                                     │
                  │                                     │
                  └──── Human Signals ◄────────────────┘
```

The agent runs a continuous loop: collect human signals → build LLM context → call LLM → execute tools → emit canvas operations → snapshot → repeat. The template defines the loop structure, available tools, evaluation criteria, and canvas vocabulary. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical design.

---

## Tech stack

- **Desktop shell:** Tauri (Rust)
- **UI:** React + TypeScript
- **Canvas:** HTML Canvas 2D + Rough.js
- **Layout:** Dagre + force-directed
- **State:** Zustand
- **LLM:** Provider-agnostic (Anthropic, OpenAI, Ollama)
- **Code sandbox:** Docker
- **Persistence:** JSON files on disk

---

## Project status

This project is in the design phase. The documents in this repo:

- [**Product Spec**](./autoresearch-viewer-spec.md) — what we're building and why
- [**Architecture**](./ARCHITECTURE.md) — how the system is structured technically
- [**Prompt Template Draft**](./prompt-template-draft.md) — exploration of the template format with examples

---

## Inspiration

- [Karpathy's autoresearch](https://github.com/karpathy/autoresearch) — proved autonomous experiment loops work. We generalize it beyond ML and add the visual interface.
- [Reflexion](https://arxiv.org/abs/2303.11366) — showed that an agent's state can be its own self-modifying prompt. We make that state visual.
- [Excalidraw](https://excalidraw.com) — the canvas aesthetic. Hand-drawn, informal, approachable.
- Self-driving labs (DMTA loop) — the most mature autonomous research systems, in chemistry and materials science.

---

## Contributing

This is an open-source project. The easiest way to contribute is to write a prompt template for a domain you know well. Templates are single Markdown files — no code required. See [prompt-template-draft.md](./prompt-template-draft.md) for the format and examples.

---

## License

MIT
