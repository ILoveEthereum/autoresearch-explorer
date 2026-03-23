import { create } from 'zustand';
import type { CanvasNode, CanvasEdge, CanvasCluster, Viewport, CanvasOp, NodeTypeDefinition } from '../types/canvas';
import { runLayout, type LayoutMode } from '../canvas/layout/layoutEngine';

/** Generate a deterministic color from a type name (matches the Rust implementation). */
function defaultColorForType(typeName: string): string {
  let hash = 0;
  for (let i = 0; i < typeName.length; i++) {
    hash = (Math.imul(hash, 31) + typeName.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/** Built-in node type definitions matching the backend defaults. */
export const BUILTIN_NODE_TYPES: NodeTypeDefinition[] = [
  {
    type_name: 'question', label: 'Question', shape: 'diamond', color: '#3b82f6',
    fields: [
      { name: 'text', field_type: 'text', description: 'The research question' },
      { name: 'status', field_type: 'text', description: 'Question status (open/resolved)' },
    ],
    description: 'A research question to investigate',
  },
  {
    type_name: 'finding', label: 'Finding', shape: 'rounded', color: '#f59e0b',
    fields: [
      { name: 'claim', field_type: 'text', description: 'The finding claim' },
      { name: 'confidence', field_type: 'number', description: 'Confidence level (1-5)' },
    ],
    description: 'A conclusion or finding from research',
  },
  {
    type_name: 'source', label: 'Source', shape: 'box', color: '#22c55e',
    fields: [
      { name: 'title', field_type: 'text', description: 'Source title' },
      { name: 'url', field_type: 'url', description: 'Source URL' },
      { name: 'relevance', field_type: 'number', description: 'Relevance score' },
    ],
    description: 'A source of information (paper, article, etc.)',
  },
  {
    type_name: 'experiment', label: 'Experiment', shape: 'box', color: '#8b5cf6',
    fields: [
      { name: 'hypothesis', field_type: 'text', description: 'What is being tested' },
      { name: 'result', field_type: 'text', description: 'Experiment result' },
    ],
    description: 'An experiment or test',
  },
  {
    type_name: 'checkpoint', label: 'Checkpoint', shape: 'box', color: '#f97316',
    fields: [{ name: 'summary', field_type: 'text', description: 'Checkpoint summary' }],
    description: 'A research checkpoint',
  },
  {
    type_name: 'tool_building', label: 'Tool Building', shape: 'box', color: '#06b6d4',
    fields: [
      { name: 'tool_name', field_type: 'text', description: 'Name of the tool' },
      { name: 'status', field_type: 'text', description: 'Build status' },
    ],
    description: 'A tool being built during research',
  },
  {
    type_name: 'gap', label: 'Gap', shape: 'dashed_box', color: '#ec4899',
    fields: [
      { name: 'description', field_type: 'text', description: 'What is missing' },
      { name: 'importance', field_type: 'text', description: 'How important this gap is' },
    ],
    description: 'A gap in knowledge or research',
  },
];

interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  clusters: CanvasCluster[];
  nodeTypes: NodeTypeDefinition[];
  viewport: Viewport;
  focusNodeId: string | null;
  layoutMode: LayoutMode;

  setViewport: (viewport: Partial<Viewport>) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  centerOnNodes: () => void;
  applyOps: (ops: CanvasOp[]) => void;
  defineNodeType: (def: NodeTypeDefinition) => void;
  getNodeType: (typeName: string) => NodeTypeDefinition | undefined;
  addTestNodes: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  clusters: [],
  nodeTypes: [...BUILTIN_NODE_TYPES],
  viewport: { x: 0, y: 0, zoom: 1 },
  focusNodeId: null,
  layoutMode: 'left_to_right',

  setViewport: (partial) =>
    set((state) => ({ viewport: { ...state.viewport, ...partial } })),

  setLayoutMode: (mode) => set({ layoutMode: mode }),

  centerOnNodes: () =>
    set((state) => {
      if (state.nodes.length === 0) return {};
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of state.nodes) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x);
        maxY = Math.max(maxY, node.position.y);
      }
      return {
        viewport: {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
          zoom: Math.min(1, 800 / Math.max(maxX - minX + 200, maxY - minY + 200, 1)),
        },
      };
    }),

  defineNodeType: (def) =>
    set((state) => {
      const existing = state.nodeTypes.findIndex((t) => t.type_name === def.type_name);
      const updated = [...state.nodeTypes];
      if (existing >= 0) {
        updated[existing] = def;
      } else {
        updated.push(def);
      }
      return { nodeTypes: updated };
    }),

  getNodeType: (typeName) => {
    return get().nodeTypes.find((t) => t.type_name === typeName);
  },

  applyOps: (ops) =>
    set((state) => {
      let nodes = [...state.nodes];
      let edges = [...state.edges];
      let clusters = [...state.clusters];
      let nodeTypes = [...state.nodeTypes];
      let focusNodeId = state.focusNodeId;

      for (const op of ops) {
        switch (op.op) {
          case 'ADD_NODE': {
            const { position_hint, ...rest } = op.node;
            const raw = rest as Record<string, unknown>;
            const newNode: CanvasNode = {
              id: String(raw.id || `node-${nodes.length}`),
              type: String(raw.type || 'source'),
              title: String(raw.title || raw.text || raw.name || raw.id || 'Untitled'),
              summary: String(raw.summary || raw.description || ''),
              status: (raw.status as CanvasNode['status']) || 'queued',
              fields: (raw.fields as Record<string, unknown>) || {},
              position: { x: 100 + nodes.length * 280, y: 200 },
              pinned: false,
              createdAt: new Date().toISOString(),
            };
            nodes = [...nodes, newNode];
            break;
          }
          case 'UPDATE_NODE': {
            nodes = nodes.map((n) =>
              n.id === op.id
                ? {
                    ...n,
                    ...(op.status && { status: op.status as CanvasNode['status'] }),
                    ...(op.summary && { summary: op.summary }),
                    ...(op.fields && { fields: { ...n.fields, ...op.fields } }),
                  }
                : n
            );
            break;
          }
          case 'REMOVE_NODE':
            nodes = nodes.filter((n) => n.id !== op.id);
            edges = edges.filter((e) => e.from !== op.id && e.to !== op.id);
            break;
          case 'ADD_EDGE':
            edges = [...edges, op.edge];
            break;
          case 'REMOVE_EDGE':
            edges = edges.filter((e) => !(e.from === op.from && e.to === op.to));
            break;
          case 'ADD_CLUSTER':
            clusters = [...clusters, { id: op.id, label: op.label, children: op.children, collapsed: false }];
            break;
          case 'DEFINE_NODE_TYPE': {
            const resolvedColor = op.color || defaultColorForType(op.type_name);
            const resolvedShape = op.shape || 'box';
            const newDef: NodeTypeDefinition = {
              type_name: op.type_name,
              label: op.label,
              shape: resolvedShape,
              color: resolvedColor,
              fields: op.fields,
              description: op.description,
            };
            const idx = nodeTypes.findIndex((t) => t.type_name === op.type_name);
            if (idx >= 0) {
              nodeTypes[idx] = newDef;
            } else {
              nodeTypes = [...nodeTypes, newDef];
            }
            break;
          }
          case 'SET_FOCUS':
            focusNodeId = op.nodeId;
            break;
          case 'SNAPSHOT':
            break;
        }
      }

      // Run layout on unpinned nodes
      if (nodes.some((n) => !n.pinned)) {
        const positions = runLayout(nodes, edges, state.layoutMode);
        nodes = nodes.map((n) => {
          if (n.pinned) return n;
          const pos = positions.get(n.id);
          return pos ? { ...n, position: pos } : n;
        });
      }

      return { nodes, edges, clusters, nodeTypes, focusNodeId };
    }),

  addTestNodes: () =>
    set(() => ({
      nodes: [
        {
          id: 'q-main',
          type: 'question',
          title: 'Main Research Question',
          summary: 'What are the key advances in mechanistic interpretability?',
          status: 'active',
          fields: { text: 'What are the key advances?', status: 'open' },
          position: { x: 500, y: 300 },
          pinned: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'src-001',
          type: 'source',
          title: 'Transformer Circuits Thread',
          summary: 'Anthropic\'s foundational work on reverse-engineering transformer circuits',
          status: 'completed',
          fields: { title: 'Transformer Circuits Thread', url: 'https://transformer-circuits.pub', relevance: 5 },
          position: { x: 200, y: 100 },
          pinned: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'src-002',
          type: 'source',
          title: 'Sparse Autoencoders for Features',
          summary: 'Using SAEs to extract interpretable features from LLMs',
          status: 'completed',
          fields: { title: 'Sparse Autoencoders', url: 'https://example.com/sae', relevance: 4 },
          position: { x: 800, y: 100 },
          pinned: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'f-001',
          type: 'finding',
          title: 'Circuit-level analysis is tractable',
          summary: 'Multiple groups have shown that individual circuits can be identified and understood in transformers up to medium scale',
          status: 'completed',
          fields: { claim: 'Circuit analysis works at medium scale', confidence: 4 },
          position: { x: 500, y: 500 },
          pinned: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'gap-001',
          type: 'gap',
          title: 'Scaling interpretability',
          summary: 'No clear path to interpreting full frontier models end-to-end',
          status: 'active',
          fields: { description: 'How to scale to frontier models?', importance: 'high' },
          position: { x: 200, y: 500 },
          pinned: false,
          createdAt: new Date().toISOString(),
        },
      ],
      edges: [
        { id: 'e-1', from: 'src-001', to: 'f-001', type: 'supports', label: 'supports' },
        { id: 'e-2', from: 'src-002', to: 'f-001', type: 'supports', label: 'supports' },
        { id: 'e-3', from: 'q-main', to: 'gap-001', type: 'leads_to', label: 'leads to' },
        { id: 'e-4', from: 'f-001', to: 'q-main', type: 'answers', label: 'partially answers' },
      ],
    })),
}));
