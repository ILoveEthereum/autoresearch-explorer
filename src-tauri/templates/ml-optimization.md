---
name: "ML Optimization"
domain: ml-experiments
version: 1

process:
  description: |
    You are optimizing a machine learning training script.
    Your goal is to reduce validation loss by making targeted
    modifications. Run experiments one at a time.

  loop:
    - step: read
      description: "Read the current training script and recent results"

    - step: hypothesize
      description: "Form a hypothesis about what change might help"
      constraints:
        - "Change one thing at a time"
        - "Prefer changes with theoretical justification"

    - step: implement
      description: "Modify the training script to test the hypothesis"

    - step: run
      description: "Run training for the configured duration"
      timeout: "5 minutes"

    - step: evaluate
      description: "Compare validation loss to the baseline"

    - step: decide
      description: "Keep the change if it improved the metric, discard if not"

  tools:
    - web_search
    - web_read
    - code_executor
    - file_read
    - file_write
    - file_list

  stop_conditions:
    - "5 consecutive failures with no improvement"
    - "Human sends stop signal"
    - "24 hours elapsed"

canvas:
  description: |
    A chronological pipeline of experiments. Time flows left to right.
    Successful experiments are green, failed are red.

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
      shape: highlighted_box
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

## Approach

Start by reading the current state of any training scripts and existing results.
Identify the most promising axis of improvement. Run experiments one at a
time, always changing a single variable so results are interpretable.

After every 10 experiments, pause and create an "insight" node that
summarizes what you've learned so far.

## What NOT to do

- Don't make random changes. Every experiment needs a hypothesis.
- Don't ignore failed experiments. They're information.
- Don't change multiple things at once.
