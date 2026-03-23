import { useCanvasStore } from '../stores/canvasStore';
import { useUiStore } from '../stores/uiStore';
import { TYPE_COLORS, STATUS_COLORS, ds } from './detail/detailStyles';
import { SourceDetail } from './detail/SourceDetail';
import { FindingDetail } from './detail/FindingDetail';
import { ExperimentDetail } from './detail/ExperimentDetail';
import { QuestionDetail } from './detail/QuestionDetail';
import { CheckpointDetail } from './detail/CheckpointDetail';
import { ToolBuildingDetail } from './detail/ToolBuildingDetail';
import { GenericDetail } from './detail/GenericDetail';
import { DynamicDetail } from './detail/DynamicDetail';
import { ConnectionsList } from './detail/ConnectionsList';
import { LoopContext } from './detail/LoopContext';

const SPECIALIZED_TYPES = ['source', 'finding', 'experiment', 'question', 'checkpoint', 'tool_building'];

export function DetailPanel() {
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const nodeTypes = useCanvasStore((s) => s.nodeTypes);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const typeDef = nodeTypes.find((t) => t.type_name === node.type);
  const typeColor = typeDef?.color || TYPE_COLORS[node.type] || '#6b7280';
  const statusColor = STATUS_COLORS[node.status] || '#6b7280';
  const typeLabel = typeDef?.label || node.type;

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.badges}>
          <span
            style={{
              ...ds.badge,
              color: typeColor,
              background: typeColor + '18',
            }}
          >
            {typeLabel}
          </span>
          <span
            style={{
              ...ds.badge,
              color: statusColor,
              background: statusColor + '18',
              fontSize: 9,
            }}
          >
            {node.status}
          </span>
          {node.loopIndex != null && (
            <span style={styles.loopBadge}>L{node.loopIndex}</span>
          )}
        </div>
        <button
          style={styles.closeBtn}
          onClick={() => useUiStore.getState().selectNode(null)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M11 3L3 11M3 3l8 8"
              stroke="#9ca3af"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <h3 style={styles.title}>{node.title}</h3>

      {/* Type-specific content */}
      {node.type === 'source' && <SourceDetail node={node} />}
      {node.type === 'finding' && <FindingDetail node={node} edges={edges} />}
      {node.type === 'experiment' && <ExperimentDetail node={node} />}
      {node.type === 'question' && <QuestionDetail node={node} edges={edges} />}
      {node.type === 'checkpoint' && <CheckpointDetail node={node} />}
      {node.type === 'tool_building' && <ToolBuildingDetail node={node} />}
      {!SPECIALIZED_TYPES.includes(node.type) && typeDef && <DynamicDetail node={node} typeDef={typeDef} />}
      {!SPECIALIZED_TYPES.includes(node.type) && !typeDef && <GenericDetail node={node} />}

      {/* Common footer */}
      <ConnectionsList node={node} edges={edges} />
      <LoopContext node={node} />

      {/* Node ID */}
      <div style={styles.nodeId}>ID: {node.id}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 320,
    borderLeft: '1px solid #e5e7eb',
    background: '#fff',
    padding: 16,
    overflowY: 'auto',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  badges: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
    flex: 1,
  },
  title: {
    margin: '10px 0 8px',
    fontSize: 15,
    fontWeight: 600,
    color: '#111827',
    lineHeight: 1.3,
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: 2,
    borderRadius: 4,
    display: 'flex',
    flexShrink: 0,
  },
  loopBadge: {
    fontSize: 9,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 99,
    color: '#6b7280',
    background: '#f3f4f6',
  },
  nodeId: {
    marginTop: 16,
    paddingTop: 8,
    borderTop: '1px solid #f3f4f6',
    fontSize: 10,
    color: '#d1d5db',
    fontFamily: 'monospace',
  },
};
