import { useCanvasStore } from '../stores/canvasStore';
import { useUiStore } from '../stores/uiStore';

export function DetailPanel() {
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  // Find connected nodes
  const incomingEdges = edges.filter((e) => e.to === node.id);
  const outgoingEdges = edges.filter((e) => e.from === node.id);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>{node.title}</h3>
        <button style={styles.closeBtn} onClick={() => useUiStore.getState().selectNode(null)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 3L3 11M3 3l8 8" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={styles.meta}>
        <span style={{ ...styles.badge, ...statusStyle(node.status) }}>{node.status}</span>
        <span style={styles.badge}>{node.type}</span>
        {node.loopIndex && <span style={styles.badge}>Loop {node.loopIndex}</span>}
      </div>

      {node.summary && <p style={styles.summary}>{node.summary}</p>}

      {/* Fields */}
      {Object.keys(node.fields).length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Fields</h4>
          {Object.entries(node.fields).map(([key, value]) => (
            <div key={key} style={styles.field}>
              <span style={styles.fieldKey}>{key}</span>
              <span style={styles.fieldValue}>{formatValue(value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Connections */}
      {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Connections</h4>
          {incomingEdges.map((e) => {
            const from = nodes.find((n) => n.id === e.from);
            return (
              <div key={e.id} style={styles.connection}>
                <span style={styles.connArrow}>&larr;</span>
                <span
                  style={styles.connNode}
                  onClick={() => useUiStore.getState().selectNode(e.from)}
                >
                  {from?.title || e.from}
                </span>
                <span style={styles.connType}>{e.type}</span>
              </div>
            );
          })}
          {outgoingEdges.map((e) => {
            const to = nodes.find((n) => n.id === e.to);
            return (
              <div key={e.id} style={styles.connection}>
                <span style={styles.connArrow}>&rarr;</span>
                <span
                  style={styles.connNode}
                  onClick={() => useUiStore.getState().selectNode(e.to)}
                >
                  {to?.title || e.to}
                </span>
                <span style={styles.connType}>{e.type}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Node ID */}
      <div style={styles.nodeId}>ID: {node.id}</div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
}

function statusStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    completed: '#22c55e',
    active: '#3b82f6',
    failed: '#ef4444',
    queued: '#9ca3af',
    discarded: '#6b7280',
  };
  return { color: colors[status] || '#6b7280', borderColor: colors[status] || '#e5e7eb' };
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 300,
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
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: '#111827',
    flex: 1,
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
  meta: {
    display: 'flex',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap' as const,
  },
  badge: {
    fontSize: 10,
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid #e5e7eb',
    color: '#6b7280',
  },
  summary: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 1.5,
    marginTop: 12,
  },
  section: {
    marginTop: 16,
    paddingTop: 12,
    borderTop: '1px solid #f3f4f6',
  },
  sectionTitle: {
    margin: '0 0 8px',
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  field: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '5px 0',
    borderBottom: '1px solid #f9fafb',
    fontSize: 12,
    gap: 8,
  },
  fieldKey: {
    color: '#6b7280',
    fontWeight: 500,
    flexShrink: 0,
  },
  fieldValue: {
    color: '#111827',
    textAlign: 'right' as const,
    wordBreak: 'break-word' as const,
    maxWidth: '65%',
  },
  connection: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 0',
    fontSize: 12,
  },
  connArrow: {
    color: '#9ca3af',
    fontSize: 14,
    flexShrink: 0,
  },
  connNode: {
    color: '#3b82f6',
    cursor: 'pointer',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  connType: {
    color: '#9ca3af',
    fontSize: 10,
    flexShrink: 0,
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
