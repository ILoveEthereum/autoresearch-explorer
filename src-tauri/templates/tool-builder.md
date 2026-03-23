---
name: "Tool Builder"
domain: tools
version: 1

process:
  description: |
    You are building a custom tool for the Autoresearch agent system.
    The user will describe the tool they want. You should research how to build it,
    design the interface, implement it, and test it.

  loop:
    - step: understand
      description: "Clarify what the tool should do, its inputs, outputs, and constraints"

    - step: research
      description: "Search for existing implementations, APIs, or libraries that can help"

    - step: design
      description: "Design the tool interface: name, description, parameters, return format"

    - step: implement
      description: "Write the tool code in the working directory under tools/{tool-name}/"

    - step: test
      description: "Test the tool with sample inputs and verify outputs"

    - step: package
      description: "Create a manifest.json with name, description, and usage instructions"

  tools:
    - web_search
    - web_read
    - code_executor
