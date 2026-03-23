---
name: "Skill Builder"
domain: skills
version: 1

process:
  description: |
    You are creating a skill document that captures knowledge and best practices
    for a specific research domain or task. Research the topic thoroughly,
    then produce a structured skill doc that future sessions can reference.

  loop:
    - step: scope
      description: "Define the scope of the skill: what domain, what tasks, what outcomes"

    - step: research
      description: "Search for best practices, common patterns, and expert knowledge"

    - step: synthesize
      description: "Organize findings into actionable sections"

    - step: write
      description: "Write the skill document with What Worked, Key Sources, Recommended Approach"

    - step: save
      description: "Save the skill doc as a markdown file in the skills/ directory"

  tools:
    - web_search
    - web_read
    - code_executor
