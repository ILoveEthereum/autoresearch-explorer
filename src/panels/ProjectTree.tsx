import { invoke } from '@tauri-apps/api/core';
import { useProjectStore, type CanvasEntry } from '../stores/projectStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useSessionStore } from '../stores/sessionStore';
import type { CanvasOp } from '../types/canvas';

function statusDot(status: CanvasEntry['status']): React.CSSProperties {
  const colors: Record<string, string> = {
    active: '#3b82f6',
    building: '#eab308',
    ready: '#22c55e',
    failed: '#ef4444',
    stopped: '#9ca3af',
  };
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: colors[status] || '#9ca3af',
    flexShrink: 0,
  };
}

function typeIcon(type: CanvasEntry['type']): string {
  switch (type) {
    case 'main':
      return '\u{1F52C}'; // microscope
    case 'tool':
      return '\u{1F527}'; // wrench
    case 'branch':
      return '\u{1F33F}'; // branch/herb
    default:
      return '\u{1F4C4}'; // document
  }
}

export function ProjectTree() {
  const canvases = useProjectStore((s) => s.canvases);
  const activeCanvasId = useProjectStore((s) => s.activeCanvasId);
  const setActiveCanvas = useProjectStore((s) => s.setActiveCanvas);
  const sessionId = useSessionStore((s) => s.sessionId);
  const applyOps = useCanvasStore((s) => s.applyOps);

  const handleSwitch = async (canvasId: string) => {
    if (canvasId === activeCanvasId) return;

    setActiveCanvas(canvasId);

    // Load the canvas state from the backend
    if (sessionId) {
      try {
        const state = await invoke<{ canvas?: { nodes?: unknown[]; edges?: unknown[]; clusters?: unknown[] } }>('get_canvas_state', {
          sessionId,
          canvasId,
        });

        // Reset the canvas store and rebuild from the loaded state
        // We use a SNAPSHOT op to clear, then rebuild
        const canvasStore = useCanvasStore.getState();
        // Clear current state by setting directly
        useCanvasStore.setState({
          nodes: [],
          edges: [],
          clusters: [],
          focusNodeId: null,
        });

        // Build ops from the loaded state to populate the canvas
        if (state?.canvas) {
          const ops: CanvasOp[] = [];
          for (const node of (state.canvas.nodes || []) as Array<Record<string, unknown>>) {
            ops.push({
              op: 'ADD_NODE',
              node: {
                id: String(node.id || ''),
                type: String(node.node_type || node.type || 'finding'),
                title: String(node.title || ''),
                summary: String(node.summary || ''),
                status: String(node.status || 'active'),
                fields: (node.fields as Record<string, unknown>) || {},
              },
            } as CanvasOp);
          }
          for (const edge of (state.canvas.edges || []) as Array<Record<string, unknown>>) {
            ops.push({
              op: 'ADD_EDGE',
              edge: {
                id: String(edge.id || `e-${edge.from}-${edge.to}`),
                from: String(edge.from || ''),
                to: String(edge.to || ''),
                type: String(edge.type || 'related'),
                label: String(edge.label || ''),
              },
            } as CanvasOp);
          }
          if (ops.length > 0) {
            applyOps(ops);
            setTimeout(() => useCanvasStore.getState().centerOnNodes(), 100);
          }
        }
      } catch (err) {
        console.error('Failed to load canvas state:', err);
      }
    }
  };

  if (canvases.length <= 1) {
    return null; // Don't show tree with only the main canvas
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>Canvases</div>
      <div style={styles.list}>
        {canvases.map((canvas) => (
          <button
            key={canvas.id}
            style={{
              ...styles.item,
              ...(canvas.id === activeCanvasId ? styles.activeItem : {}),
            }}
            onClick={() => handleSwitch(canvas.id)}
          >
            <span style={styles.icon}>{typeIcon(canvas.type)}</span>
            <span
              style={{
                ...styles.label,
                fontWeight: canvas.id === activeCanvasId ? 600 : 400,
              }}
            >
              {canvas.label}
            </span>
            <span style={statusDot(canvas.status)} />
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 200,
    minWidth: 200,
    backgroundColor: '#fff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 14px 8px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6b7280',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '0 6px 8px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '6px 8px',
    border: 'none',
    background: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: 13,
    color: '#374151',
    transition: 'background 0.15s',
  },
  activeItem: {
    backgroundColor: '#f3f4f6',
  },
  icon: {
    fontSize: 14,
    flexShrink: 0,
  },
  label: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};
