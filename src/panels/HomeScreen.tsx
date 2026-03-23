import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUiStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import type { CanvasNode, CanvasEdge, CanvasCluster } from '../types/canvas';
import type { SessionMeta } from '../types/session';

export function HomeScreen() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const sessionId = useSessionStore((s) => s.sessionId);
  const setSession = useSessionStore((s) => s.setSession);
  const setLoopCount = useSessionStore((s) => s.setLoopCount);
  const setStatus = useSessionStore((s) => s.setStatus);
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);

  useEffect(() => {
    invoke<SessionMeta[]>('list_sessions')
      .then(setSessions)
      .catch(console.error);
  }, []);

  const loadCanvasState = async (session: SessionMeta) => {
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

    // Trigger layout and center
    const store = useCanvasStore.getState();
    store.applyOps([]);
    setTimeout(() => useCanvasStore.getState().centerOnNodes(), 100);

    return state.agent.current_loop;
  };

  const loadChatMessages = async (sessionId: string) => {
    try {
      const messages = await invoke<ChatMessage[]>('load_chat', { sessionId });
      if (messages && messages.length > 0) {
        useChatStore.getState().loadMessages(messages);
      }
    } catch {
      // No chat history, that's fine
    }
  };

  const loadSession = async (session: SessionMeta) => {
    setLoadingId(session.id);
    try {
      const loopCount = await loadCanvasState(session);
      await loadChatMessages(session.id);

      setSession(session.id, session.name);
      setLoopCount(loopCount);
      setStatus('stopped');
    } catch (err) {
      console.error('Failed to load session:', err);
      alert(`Failed to load session: ${err}`);
    } finally {
      setLoadingId(null);
    }
  };

  const resumeSession = async (session: SessionMeta) => {
    setResumingId(session.id);
    try {
      const loopCount = await loadCanvasState(session);
      await loadChatMessages(session.id);

      // Get API key from localStorage
      const apiKey = localStorage.getItem('openrouter_api_key');
      if (!apiKey) {
        alert('No API key found. Please start a new session first to set your API key.');
        setResumingId(null);
        return;
      }

      // Resume the agent loop on the backend
      await invoke('resume_saved_session', {
        sessionId: session.id,
        apiKey,
      });

      setSession(session.id, session.name);
      setLoopCount(loopCount);
      setStatus('idle');
    } catch (err) {
      console.error('Failed to resume session:', err);
      alert(`Failed to resume session: ${err}`);
    } finally {
      setResumingId(null);
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
                <div key={s.id} style={styles.sessionCard}>
                  <button
                    style={styles.sessionClickArea}
                    onClick={() => loadSession(s)}
                    disabled={loadingId === s.id || resumingId === s.id}
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
                  <button
                    style={styles.resumeBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      resumeSession(s);
                    }}
                    disabled={resumingId === s.id}
                    title="Resume this session's agent loop"
                  >
                    {resumingId === s.id ? (
                      <span style={styles.miniSpinner} />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 1l8 5-8 5V1z" fill="#22c55e" />
                      </svg>
                    )}
                    Resume
                  </button>
                </div>
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
    alignItems: 'center',
    gap: 8,
    width: '100%',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
  },
  sessionClickArea: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    minWidth: 0,
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
  resumeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '8px 12px',
    marginRight: 8,
    border: '1px solid #d1fae5',
    borderRadius: 6,
    background: '#f0fdf4',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    color: '#16a34a',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  miniSpinner: {
    width: 10,
    height: 10,
    border: '2px solid #d1fae5',
    borderTopColor: '#16a34a',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
    display: 'inline-block',
  },
};
