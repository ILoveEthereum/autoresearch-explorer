import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
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

function CenterButton() {
  const { setCenter, getNodes } = useReactFlow();

  const handleCenter = () => {
    const nodes = getNodes();
    if (nodes.length === 0) return;
    // Go to the first node
    const first = nodes[0];
    setCenter(first.position.x + 90, first.position.y + 25, { zoom: 1, duration: 300 });
  };

  return (
    <button
      onClick={handleCenter}
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 10,
        width: 36,
        height: 36,
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        background: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
      title="Fit all nodes in view"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="5" y="5" width="6" height="6" rx="1" stroke="#374151" strokeWidth="1.2" />
      </svg>
    </button>
  );
}

function CanvasInner() {
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

  const { fitView } = useReactFlow();

  const rfNodes = useMemo(
    () => nodes.map((n) => toReactFlowNode(n, canvasNodeTypes, selectedNodeId)),
    [nodes, canvasNodeTypes, selectedNodeId]
  );

  const rfEdges = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    return edges
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map(toReactFlowEdge);
  }, [edges, nodes]);

  // Fit view whenever nodes or edges change
  const prevCountRef = useRef(0);
  useEffect(() => {
    const count = rfNodes.length + rfEdges.length;
    if (count !== prevCountRef.current && rfNodes.length > 0) {
      prevCountRef.current = count;
      // Delay to let React Flow measure nodes first
      const timer = setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.5, duration: 300 }), 50);
      return () => clearTimeout(timer);
    }
  }, [rfNodes, rfEdges, fitView]);

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
    <>
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
      </ReactFlow>

      <CenterButton />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

export function CanvasView() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    </div>
  );
}
