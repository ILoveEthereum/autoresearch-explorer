export interface CanvasNode {
  id: string;
  type: string;
  title: string;
  summary: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'discarded';
  fields: Record<string, unknown>;
  position: { x: number; y: number };
  pinned: boolean;
  cluster?: string;
  createdAt: string;
  loopIndex?: number;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  style?: string;
}

export interface CanvasCluster {
  id: string;
  label: string;
  children: string[];
  collapsed: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type CanvasOp =
  | { op: 'ADD_NODE'; node: Omit<CanvasNode, 'position' | 'pinned'> & { position_hint?: PositionHint } }
  | { op: 'UPDATE_NODE'; id: string; status?: string; summary?: string; fields?: Record<string, unknown> }
  | { op: 'REMOVE_NODE'; id: string }
  | { op: 'ADD_EDGE'; edge: CanvasEdge }
  | { op: 'REMOVE_EDGE'; from: string; to: string }
  | { op: 'ADD_CLUSTER'; id: string; label: string; children: string[] }
  | { op: 'SET_FOCUS'; nodeId: string }
  | { op: 'SNAPSHOT' };

export interface PositionHint {
  after?: string;
  near?: string;
  cluster?: string;
}
