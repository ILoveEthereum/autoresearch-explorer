use super::types::ParsedTemplate;

/// Validate a parsed template has all required fields and makes sense.
pub fn validate(template: &ParsedTemplate) -> Result<(), String> {
    if template.name.is_empty() {
        return Err("Template 'name' is required and cannot be empty".to_string());
    }

    if template.process.description.is_empty() {
        return Err("process.description is required".to_string());
    }

    if template.process.r#loop.is_empty() {
        return Err("process.loop must have at least one step".to_string());
    }

    for (i, step) in template.process.r#loop.iter().enumerate() {
        if step.step.is_empty() {
            return Err(format!("process.loop[{}].step is required", i));
        }
        if step.description.is_empty() {
            return Err(format!("process.loop[{}].description is required", i));
        }
    }

    if template.canvas.node_types.is_empty() {
        return Err("canvas.node_types must define at least one node type".to_string());
    }

    if template.canvas.edge_types.is_empty() {
        return Err("canvas.edge_types must define at least one edge type".to_string());
    }

    for (name, node_type) in &template.canvas.node_types {
        if node_type.shape.is_empty() {
            return Err(format!("canvas.node_types.{}.shape is required", name));
        }
    }

    for (name, edge_type) in &template.canvas.edge_types {
        if edge_type.style.is_empty() {
            return Err(format!("canvas.edge_types.{}.style is required", name));
        }
    }

    Ok(())
}
