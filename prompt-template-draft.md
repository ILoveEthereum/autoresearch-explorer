# Prompt Template — Draft Exploration

This document explores what the prompt template file should look like.
It's the core design artifact of the whole system.

---

## What is this file?

The prompt template is the single file that defines a research session.
It's the user's input to the system. You write one of these, point the
agent at it, and the agent starts researching — producing a visual
diagram as it goes.

It's inspired by Karpathy's `program.md`, but it does more. It defines
three things:

1. **The question** — what to research.
2. **The process** — how to research it (steps, tools, evaluation).
3. **The output schema** — what the diagram should look like (node types,
   edge types, layout rules, what gets visualized and how).

---

## Example 1: ML Experiment Optimization

```yaml
---
# METADATA
name: "Optimize GPT-2 Training"
domain: ml-experiments
version: 1

# PROCESS DEFINITION
process:
  description: |
    You are optimizing a machine learning training script.
    Your goal is to reduce validation loss by making targeted
    modifications to train.py.

  loop:
    - step: read
      description: "Read the current training script and recent results"

    - step: hypothesize
      description: "Form a hypothesis about what change might help"
      constraints:
        - "Change one thing at a time"
        - "Prefer changes with theoretical justification"

    - step: implement
      description: "Modify train.py to test the hypothesis"
      artifact: "train.py"

    - step: run
      description: "Run training for the configured duration"
      timeout: "5 minutes"

    - step: evaluate
      description: "Compare validation loss to the baseline"
      metric: validation_loss
      direction: minimize

    - step: decide
      description: "Keep the change if it improved the metric, discard if not"
      on_keep: "Commit the change"
      on_discard: "Revert to previous state"

  tools:
    - code_executor
    - file_system

  stop_conditions:
    - "5 consecutive failures with no improvement"
    - "Human sends stop signal"
    - "24 hours elapsed"

# OUTPUT SCHEMA — what the canvas looks like
canvas:
  description: |
    The canvas shows a chronological pipeline of experiments.
    Time flows left to right. Each experiment is a vertical column.
    Successful experiments are green, failed are red.
    Branches represent different optimization directions
    (e.g., "architecture changes" vs "optimizer changes").

  node_types:
    experiment:
      shape: box
      fields: [hypothesis, change_summary, metric_before, metric_after, status]
      color_rule: "green if kept, red if discarded"

    direction:
      shape: group
      description: "A cluster of experiments exploring the same axis"
      fields: [name, total_experiments, best_result]

    insight:
      shape: note
      description: "A conclusion drawn from multiple experiments"
      fields: [text, supporting_experiments]

  edge_types:
    sequence:
      description: "This experiment followed that one"
      style: solid_arrow

    informed_by:
      description: "This experiment was motivated by that result"
      style: dashed_arrow

    contradicts:
      description: "This result contradicts that earlier finding"
      style: red_dashed

  layout:
    primary_axis: left_to_right
    branching: vertical
    clustering: by_direction
---

# Agent Instructions

You are a research agent optimizing a machine learning training script.
The script is `train.py`. You must not modify `prepare.py`.

## Approach

Start by reading the current state of `train.py` and any existing results.
Identify the most promising axis of improvement. Run experiments one at a
time, always changing a single variable so results are interpretable.

After every 10 experiments, pause and create an "insight" node that
summarizes what you've learned so far. Use this to decide whether to
continue on the current direction or pivot.

## What NOT to do

- Don't make random changes. Every experiment needs a hypothesis.
- Don't ignore failed experiments. They're information.
- Don't change multiple things at once.
```

---

## Example 2: Literature Review

```yaml
---
name: "Survey: Mechanistic Interpretability 2024-2026"
domain: literature-review
version: 1

process:
  description: |
    You are conducting a systematic literature review on mechanistic
    interpretability in large language models, covering 2024-2026.

  loop:
    - step: search
      description: "Find relevant papers, blog posts, and talks"
      tools: [web_search, arxiv_search]

    - step: read
      description: "Read and summarize each source"
      output: "A source node on the canvas"

    - step: connect
      description: "Identify how this source relates to existing ones"
      output: "Edges connecting the new source to existing nodes"

    - step: synthesize
      description: |
        After every 5 new sources, write a finding node that captures
        an emerging theme, consensus, or open question.

    - step: evaluate
      description: "Is this area sufficiently covered or should we go deeper?"
      criteria: "At least 3 sources per major subtopic"

  tools:
    - web_search
    - pdf_reader

  stop_conditions:
    - "All identified subtopics have 3+ sources"
    - "Human sends stop signal"
    - "No new relevant sources found in 3 consecutive searches"

canvas:
  description: |
    The canvas shows a knowledge web. Sources are scattered spatially
    by subtopic — papers about the same thing cluster together.
    Findings float above their supporting sources. The center of the
    canvas shows the main question, with subtopics radiating outward.

  node_types:
    source:
      shape: box
      fields: [title, authors, year, url, summary, relevance_score]
      color_rule: "shade by relevance (darker = more relevant)"

    finding:
      shape: highlighted_box
      fields: [claim, confidence, supporting_sources, status]
      description: "A synthesized conclusion from multiple sources"

    question:
      shape: diamond
      fields: [text, status]
      description: "An open question or subtopic to explore"
      color_rule: "blue if open, gray if resolved"

    gap:
      shape: dashed_box
      fields: [description, importance]
      description: "An identified gap in the literature"

  edge_types:
    supports:
      description: "This source supports that finding"
      style: solid_arrow

    contradicts:
      description: "This source contradicts that finding"
      style: red_dashed_arrow

    extends:
      description: "This work builds on that earlier work"
      style: dotted_arrow

    answers:
      description: "This finding answers that question"
      style: green_arrow

  layout:
    primary_axis: radial
    center: main_question
    clustering: by_subtopic
    semantic_zoom:
      far: "Show only findings and questions"
      mid: "Show sources as dots with titles"
      close: "Show full source details"
---

# Agent Instructions

You are conducting a literature review on mechanistic interpretability
in large language models, focusing on work from 2024-2026.

## Starting Points

Begin by searching for:
- "mechanistic interpretability" survey papers from 2025-2026
- Key authors: Chris Olah, Neel Nanda, Anthropic interpretability team
- Major conferences: NeurIPS, ICML, ICLR interpretability tracks

## How to Evaluate Sources

Rate each source on:
- Relevance (1-5): How directly does it address mechanistic interpretability?
- Impact (1-5): How cited/discussed is this work?
- Novelty (1-5): Does it introduce new techniques or just apply existing ones?

Only add sources with relevance >= 3 to the canvas.

## Synthesis Rules

After adding 5 sources to any subtopic cluster, you MUST write a finding
node that synthesizes what you've learned. Don't just collect — conclude.

If you find two sources that disagree, create both a "contradicts" edge
AND a gap node asking "which is correct?"
```

---

## Example 3: Math Exploration

```yaml
---
name: "Explore: Collatz-like sequences over Gaussian integers"
domain: math-exploration
version: 1

process:
  description: |
    You are exploring the behavior of Collatz-like iterative maps
    extended to Gaussian integers (complex numbers with integer parts).

  loop:
    - step: formulate
      description: "Define a specific question or sub-conjecture to test"

    - step: compute
      description: "Run numerical experiments to gather evidence"
      tools: [code_executor]
      language: python
      libraries: [numpy, matplotlib, sympy]

    - step: analyze
      description: "What do the results suggest? Any patterns?"
      output: "An observation node with plots if relevant"

    - step: prove_or_disprove
      description: "Can you prove or disprove the pattern?"
      output: "A proof-sketch node or a counterexample node"

    - step: branch
      description: "Does this result suggest new questions?"
      output: "New question nodes on the canvas"

  tools:
    - code_executor
    - web_search
    - latex_renderer

  stop_conditions:
    - "Main conjecture is resolved (proved or disproved)"
    - "Human sends stop signal"
    - "All generated sub-questions are resolved or abandoned"

canvas:
  description: |
    The canvas shows a proof tree / exploration tree. The main conjecture
    is at the top. Sub-questions branch downward. Resolved branches
    are collapsed. Active branches glow.

  node_types:
    conjecture:
      shape: diamond
      fields: [statement, status, confidence]
      color_rule: "yellow if open, green if proved, red if disproved"

    observation:
      shape: box
      fields: [description, evidence_type, plots]
      description: "An empirical observation from computation"

    proof_sketch:
      shape: highlighted_box
      fields: [argument, gaps, confidence]

    counterexample:
      shape: alert_box
      fields: [value, explanation]
      color_rule: "always red"

    computation:
      shape: small_box
      fields: [code_summary, runtime, key_output]
      description: "A completed computation"

  edge_types:
    decomposes_into:
      description: "This conjecture breaks into these sub-questions"
      style: solid_arrow

    evidence_for:
      description: "This observation supports that conjecture"
      style: green_dashed

    evidence_against:
      description: "This observation weakens that conjecture"
      style: red_dashed

    leads_to:
      description: "This result suggests that new question"
      style: blue_arrow

  layout:
    primary_axis: top_to_bottom
    branching: horizontal
    collapse_rule: "Collapse resolved branches after 30 seconds"
    active_glow: true
---

# Agent Instructions

You are exploring the extension of Collatz-like maps to Gaussian integers.

## Starting Point

The classical Collatz map is: if n is even, n → n/2; if n is odd, n → 3n+1.
Consider extending this to Gaussian integers z = a + bi where a, b ∈ ℤ.

Begin by defining what "even" and "odd" mean for Gaussian integers,
then formulate the extended map and explore its behavior computationally.

## Exploration Strategy

1. Start with small Gaussian integers (|a|, |b| ≤ 10)
2. Compute orbits and look for cycles
3. Visualize orbit behavior in the complex plane
4. Compare with known results for the real Collatz conjecture
5. Look for structural differences introduced by the complex extension

## When to Branch

If you find a pattern that holds for all tested cases but you can't prove
it, create a new conjecture node and explore it as a sub-question.
Don't get stuck trying to prove something hard — branch and gather
more evidence first.
```

---

## What these examples reveal

The three templates above produce fundamentally different canvases:

1. **ML Optimization** → a horizontal timeline of experiments with
   keep/discard coloring. Linear, chronological.

2. **Literature Review** → a radial knowledge web with sources clustering
   around subtopics. Spatial, associative.

3. **Math Exploration** → a top-down proof tree with branching sub-questions.
   Hierarchical, logical.

Same engine, same agent, same canvas renderer — but the **prompt template
controls the shape of the output.** The `canvas` section of the template
IS the ontology. It defines:

- What kinds of nodes exist and what data they carry
- What kinds of edges exist and what they mean
- How things are laid out spatially
- How semantic zoom works (what you see at different zoom levels)
- What visual rules apply (coloring, collapsing, glowing)

This means **the prompt template is both program and schema.** It programs
the agent's behavior AND defines the visual language the agent uses to
externalize its thinking.

---

## The template is the product

For the open-source community, the prompt template IS the thing people
contribute. You don't need to be a programmer to create a new research
domain — you write a Markdown file with YAML frontmatter. The community
builds up a library of templates:

- `ml-optimization.md`
- `literature-review.md`
- `math-exploration.md`
- `chemistry-catalyst-search.md`
- `security-vulnerability-audit.md`
- `competitive-analysis.md`
- `patent-landscape.md`
- `drug-interaction-review.md`
- ...

Each template encodes someone's expertise about HOW to research that
domain AND what the output of that research should look like.

---

## Open design questions about the template

1. **Should the agent be able to modify its own template mid-session?**
   Karpathy's agent can't modify program.md. But in a general research
   system, the agent might discover that its process isn't working and
   want to adapt. If we allow self-modification, we get Reflexion-style
   evolution. If we don't, we keep the process stable and predictable.
   Possible middle ground: the agent can PROPOSE template modifications
   that the human must approve.

2. **How strict is the canvas schema?** Can the agent create node types
   that aren't defined in the template? If it encounters something that
   doesn't fit the schema, should it force-fit it or create a "misc"
   node? Strict schemas keep the canvas clean; loose schemas let the
   agent be creative.

3. **Inheritance and composition.** Can templates extend other templates?
   A "chemistry-optimization" template might extend a base "experiment-loop"
   template and just add chemistry-specific node types and tools. This
   would reduce duplication across the template library.

4. **Can the human edit the template mid-session?** If the user changes
   the canvas schema while research is in progress, what happens to
   existing nodes that no longer fit? Migration rules? Graceful handling?
