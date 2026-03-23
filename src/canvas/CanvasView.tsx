import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
  type OnNodeContextMenu,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCanvasStore } from '../stores/canvasStore';
import { useUiStore } from '../stores/uiStore';
import { ContextMenu } from './interaction/ContextMenu';
import { DefaultNode } from './nodes/DefaultNode';
import { DiamondNode } from './nodes/DiamondNode';
import { FindingNode } from './nodes/FindingNode';
import { CheckpointNode } from './nodes/CheckpointNode';
import type { CanvasNode, CanvasEdge, NodeTypeDefinition } from '../types/canvas';

// Register custom node types (must be stable reference outside component)
const nodeTypes = {
  question: DiamondNode,
  finding: FindingNode,
  checkpoint: CheckpointNode,
  default: DefaultNode,
  source: DefaultNode,
  experiment: DefaultNode,
  tool_building: DefaultNode,
  gap: DefaultNode,
};

const KNOWN_TYPES = new Set(Object.keys(nodeTypes));

function getReactFlowType(type: string): string {
  return KNOWN_TYPES.has(type) ? type : 'default';
}

function toReactFlowNode(
  node: CanvasNode,
  allNodeTypes: NodeTypeDefinition[],
  selectedNodeId: string | null
): Node {
  const typeDef = allNodeTypes.find((t) => t.type_name === node.type);
  return {
    id: node.id,
    type: getReactFlowType(node.type),
    position: node.position,
    selected: node.id === selectedNodeId,
    data: {
      label: node.title,
      summary: node.summary,
      status: node.status,
      fields: node.fields,
      nodeType: node.type,
      typeDef: typeDef,
    },
  };
}

function toReactFlowEdge(edge: CanvasEdge): Edge {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: 'smoothstep',
    animated: edge.type === 'active',
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: '#9ca3af', fontWeight: 400 },
    labelBgStyle: { fill: '#fafafa', fillOpacity: 0.8 },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
  };
}

export function CanvasView() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const canvasNodeTypes = useCanvasStore((s) => s.nodeTypes);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  // Convert canvas nodes/edges to React Flow format
  const rfNodes = useMemo(
    () => nodes.map((n) => toReactFlowNode(n, canvasNodeTypes, selectedNodeId)),
    [nodes, canvasNodeTypes, selectedNodeId]
  );

  const rfEdges = useMemo(
    () => edges.map(toReactFlowEdge),
    [edges]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
  }, [selectNode]);

  const onNodeContextMenu: OnNodeContextMenu = useCallback(
    (event, node) => {
      event.preventDefault();
      selectNode(node.id);
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    [selectNode]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={40} size={1} color="#e5e7eb" />
        <Controls
          showInteractive={false}
          style={{ bottom: 16, right: 16 }}
        />
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as { typeDef?: NodeTypeDefinition; status?: string };
            return d.typeDef?.color || '#9ca3af';
          }}
          maskColor="rgba(250, 250, 250, 0.7)"
          style={{ bottom: 16, left: 16 }}
        />
      </ReactFlow>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
