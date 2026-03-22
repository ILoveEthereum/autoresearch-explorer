import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUiStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { useCanvasStore } from '../stores/canvasStore';
import type { CanvasNode, CanvasEdge, CanvasCluster } from '../types/canvas';
import type { SessionMeta } from '../types/session';

export function HomeScreen() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const sessionId = useSessionStore((s) => s.sessionId);
  const setSession = useSessionStore((s) => s.setSession);
  const setLoopCount = useSessionStore((s) => s.setLoopCount);
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);

  useEffect(() => {
    invoke<SessionMeta[]>('list_sessions')
      .then(setSessions)
      .catch(console.error);
  }, []);

  const loadSession = async (session: SessionMeta) => {
    setLoadingId(session.id);
    try {
      const state = await invoke<{
        canvas: {
          nodes: CanvasNode[];
          edges: CanvasEdge[];
          clusters: CanvasCluster[];
        };
        agent: { current_loop: number };
      }>('load_session', { sessionId: session.id });

      // Populate canvas store with saved state
      useCanvasStore.setState({
        nodes: state.canvas.nodes.map((n: any) => ({
          id: n.id,
          type: n.node_type || n.type,
          title: n.title,
          summary: n.summary || '',
          status: n.status || 'completed',
          fields: n.fields || {},
          position: { x: 100 + Math.random() * 600, y: 100 + Math.random() * 400 },
          pinned: false,
          createdAt: n.created_at || new Date().toISOString(),
          loopIndex: n.loop_index,
        })),
        edges: state.canvas.edges.map((e: any) => ({
          id: e.id,
          from: e.from,
          to: e.to,
          type: e.edge_type || e.type,
          label: e.label,
          style: e.style,
        })),
        clusters: state.canvas.clusters || [],
        focusNodeId: null,
      });

      // Trigger layout
      const store = useCanvasStore.getState();
      store.applyOps([]);

      setSession(session.id, session.name);
      setLoopCount(state.agent.current_loop);
    } catch (err) {
      console.error('Failed to load session:', err);
      alert(`Failed to load session: ${err}`);
    } finally {
      setLoadingId(null);
    }
  };

  // Don't show home screen if a session is active
  if (sessionId) return null;

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={styles.hero}>
          <h1 style={styles.title}>Autoresearch</h1>
          <p style={styles.subtitle}>
            AI-powered research with a live visual canvas
          </p>
          <button style={styles.startBtn} onClick={() => setShowTemplateSelector(true)}>
            New Research Session
          </button>
        </div>

        {sessions.length > 0 && (
          <div style={styles.history}>
            <h2 style={styles.historyTitle}>Recent Sessions</h2>
            <div style={styles.sessionList}>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  style={styles.sessionCard}
                  onClick={() => loadSession(s)}
                  disabled={loadingId === s.id}
                >
                  <div style={styles.sessionInfo}>
                    <div style={styles.sessionName}>
                      {loadingId === s.id ? 'Loading...' : s.name}
                    </div>
                    <div style={styles.sessionMeta}>
                      {s.templateName} &middot; {s.totalLoops} loops &middot; {formatDate(s.lastModified)}
                    </div>
                  </div>
                  <div style={styles.sessionStatus}>
                    <span style={{
                      ...styles.statusDot,
                      background: s.status === 'running' ? '#22c55e' : s.status === 'paused' ? '#f59e0b' : '#9ca3af',
                    }} />
                    {s.status}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    background: '#fafafa',
  },
  inner: {
    width: 500,
    maxHeight: '80vh',
    overflowY: 'auto',
  },
  hero: {
    textAlign: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    color: '#111827',
    letterSpacing: '-0.03em',
    margin: 0,
  },
  subtitle: {
    fontSize: 15,
    color: '#9ca3af',
    margin: '8px 0 24px',
  },
  startBtn: {
    padding: '12px 28px',
    border: 'none',
    borderRadius: 10,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  history: {},
  historyTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: '0 0 12px',
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  sessionCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '12px 16px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'border-color 0.15s, box-shadow 0.15s',
    fontFamily: 'inherit',
  },
  sessionInfo: {
    flex: 1,
    minWidth: 0,
  },
  sessionName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  sessionMeta: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  sessionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: '#6b7280',
    fontWeight: 500,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
};
