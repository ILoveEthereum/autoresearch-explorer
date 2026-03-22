export interface ParsedTemplate {
  name: string;
  domain?: string;
  version?: number;
  process: ProcessConfig;
  canvas: CanvasSchema;
  instructions: string;
}

export interface ProcessConfig {
  description: string;
  loop: LoopStep[];
  tools: string[];
  stop_conditions: string[];
}

export interface LoopStep {
  step: string;
  description: string;
  constraints?: string[];
  tools?: string[];
  output?: string;
  timeout?: string;
}

export interface CanvasSchema {
  description?: string;
  node_types: Record<string, NodeTypeDef>;
  edge_types: Record<string, EdgeTypeDef>;
  layout: LayoutConfig;
}

export interface NodeTypeDef {
  shape: string;
  fields: string[];
  description?: string;
  color_rule?: string;
}

export interface EdgeTypeDef {
  description: string;
  style: string;
}

export interface LayoutConfig {
  primary_axis: 'left_to_right' | 'top_to_bottom' | 'radial' | 'freeform';
  branching?: string;
  clustering?: string;
  semantic_zoom?: {
    far?: string;
    mid?: string;
    close?: string;
  };
}

export interface TemplateSummary {
  name: string;
  domain?: string;
  path: string;
}
