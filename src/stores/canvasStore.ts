import { create } from 'zustand';
import type { CanvasNode, CanvasEdge, CanvasCluster, Viewport, CanvasOp } from '../types/canvas';
import { runDagreLayout } from '../canvas/layout/dagreLayout';

interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  clusters: CanvasCluster[];
  viewport: Viewport;
  focusNodeId: string | null;

  setViewport: (viewport: Partial<Viewport>) => void;
  applyOps: (ops: CanvasOp[]) => void;
  addTestNodes: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  nodes: [],
  edges: [],
  clusters: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  focusNodeId: null,

  setViewport: (partial) =>
    set((state) => ({ viewport: { ...state.viewport, ...partial } })),

  applyOps: (ops) =>
    set((state) => {
      let nodes = [...state.nodes];
      let edges = [...state.edges];
      let clusters = [...state.clusters];
      let focusNodeId = state.focusNodeId;

      for (const op of ops) {
        switch (op.op) {
          case 'ADD_NODE': {
            const { position_hint, ...rest } = op.node;
            const newNode: CanvasNode = {
              ...rest,
              position: { x: 100 + nodes.length * 280, y: 200 },
              pinned: false,
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
          case 'SET_FOCUS':
            focusNodeId = op.nodeId;
            break;
          case 'SNAPSHOT':
            break;
        }
      }

      // Run layout on unpinned nodes
      if (nodes.some((n) => !n.pinned)) {
        const positions = runDagreLayout(nodes, edges, 'LR');
        nodes = nodes.map((n) => {
          if (n.pinned) return n;
          const pos = positions.get(n.id);
          return pos ? { ...n, position: pos } : n;
        });
      }

      return { nodes, edges, clusters, focusNodeId };
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
