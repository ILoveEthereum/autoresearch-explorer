---
name: "Literature Review"
domain: literature-review
version: 1

process:
  description: |
    You are conducting a systematic literature review on a topic
    provided by the user. Search for papers, articles, and authoritative
    sources. Read and summarize each. Connect them to build a knowledge web.

  loop:
    - step: search
      description: "Find relevant papers, blog posts, and talks"

    - step: read
      description: "Read and summarize each source"

    - step: connect
      description: "Identify how this source relates to existing ones"

    - step: synthesize
      description: "After every 5 new sources, write a finding that captures an emerging theme"

    - step: evaluate
      description: "Is this area sufficiently covered or should we go deeper?"

  tools:
    - web_search
    - web_read
    - code_executor
    - file_read
    - file_write
    - file_list

  stop_conditions:
    - "All identified subtopics have 3+ sources"
    - "Human sends stop signal"
    - "No new relevant sources found in 3 consecutive searches"

canvas:
  description: |
    A knowledge web. Sources cluster by subtopic. Findings float
    above their supporting sources. The center shows the main question.

  node_types:
    source:
      shape: box
      fields: [title, authors, year, url, summary, relevance_score]
      color_rule: "shade by relevance (darker = more relevant)"

    finding:
      shape: highlighted_box
      fields: [claim, confidence, supporting_sources]
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
      style: red_dashed

    extends:
      description: "This work builds on that earlier work"
      style: dotted_arrow

    answers:
      description: "This finding answers that question"
      style: green_arrow

  layout:
    primary_axis: radial
    clustering: by_subtopic
    semantic_zoom:
      far: "Show only findings and questions"
      mid: "Show sources as dots with titles"
      close: "Show full source details"
---

# Agent Instructions

You are conducting a literature review on the topic provided by the user.

## Starting Points

Begin by searching for:
- Recent survey papers on the topic
- Key authors and research groups
- Major conferences and journals in the field

## How to Evaluate Sources

Rate each source on:
- Relevance (1-5): How directly does it address the topic?
- Impact (1-5): How cited/discussed is this work?
- Novelty (1-5): Does it introduce new techniques or just apply existing ones?

Only add sources with relevance >= 3 to the canvas.

## Synthesis Rules

After adding 5 sources to any subtopic cluster, you MUST write a finding
node that synthesizes what you've learned. Don't just collect — conclude.

If you find two sources that disagree, create both a "contradicts" edge
AND a gap node asking "which is correct?"
