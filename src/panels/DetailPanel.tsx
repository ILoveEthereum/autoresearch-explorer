import { useCanvasStore } from '../stores/canvasStore';
import { useUiStore } from '../stores/uiStore';

export function DetailPanel() {
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>{node.title}</h3>
        <button style={styles.closeBtn} onClick={() => useUiStore.getState().selectNode(null)}>
          ×
        </button>
      </div>

      <div style={styles.meta}>
        <span style={styles.badge}>{node.type}</span>
        <span style={{ ...styles.badge, ...statusStyle(node.status) }}>{node.status}</span>
      </div>

      {node.summary && <p style={styles.summary}>{node.summary}</p>}

      {Object.keys(node.fields).length > 0 && (
        <div style={styles.fields}>
          <h4 style={styles.fieldTitle}>Fields</h4>
          {Object.entries(node.fields).map(([key, value]) => (
            <div key={key} style={styles.field}>
              <span style={styles.fieldKey}>{key}</span>
              <span style={styles.fieldValue}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: '#111827',
    flex: 1,
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    fontSize: 20,
    cursor: 'pointer',
    color: '#9ca3af',
    padding: '0 4px',
  },
  meta: {
    display: 'flex',
    gap: 6,
    marginTop: 8,
  },
  badge: {
    fontSize: 11,
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
  fields: {
    marginTop: 16,
  },
  fieldTitle: {
    margin: '0 0 8px',
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  field: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #f3f4f6',
    fontSize: 12,
  },
  fieldKey: {
    color: '#6b7280',
    fontWeight: 500,
  },
  fieldValue: {
    color: '#111827',
    textAlign: 'right' as const,
    maxWidth: '60%',
    wordBreak: 'break-word' as const,
  },
};
