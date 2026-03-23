import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUiStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import type { CanvasNode, CanvasEdge, CanvasCluster, NodeTypeDefinition } from '../types/canvas';
import { BUILTIN_NODE_TYPES } from '../stores/canvasStore';
import type { SessionMeta } from '../types/session';

export function HomeScreen() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const setSession = useSessionStore((s) => s.setSession);
  const setLoopCount = useSessionStore((s) => s.setLoopCount);
  const setStatus = useSessionStore((s) => s.setStatus);
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);
  const setActivePanel = useUiStore((s) => s.setActivePanel);

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
        node_types?: NodeTypeDefinition[];
      };
      agent: { current_loop: number };
    }>('load_session', { sessionId: session.id });

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
      nodeTypes: state.canvas.node_types || [...BUILTIN_NODE_TYPES],
      focusNodeId: null,
    });

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
      setActivePanel(null); // Close overlay
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

      const apiKey = localStorage.getItem('openrouter_api_key');
      if (!apiKey) {
        alert('No API key found. Please start a new session first to set your API key.');
        setResumingId(null);
        return;
      }

      await invoke('resume_saved_session', {
        sessionId: session.id,
        apiKey,
      });

      setSession(session.id, session.name);
      setLoopCount(loopCount);
      setStatus('idle');
      setActivePanel(null); // Close overlay
    } catch (err) {
      console.error('Failed to resume session:', err);
      alert(`Failed to resume session: ${err}`);
    } finally {
      setResumingId(null);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.hero}>
        <h2 style={styles.title}>Autoresearch</h2>
        <p style={styles.subtitle}>AI-powered research with a live visual canvas</p>
        <button style={styles.startBtn} onClick={() => setShowTemplateSelector(true)}>
          New Session
        </button>
      </div>

      {sessions.length > 0 && (
        <div style={styles.history}>
          <div style={styles.historyTitle}>Recent Sessions</div>
          <div style={styles.sessionList}>
            {sessions.map((s) => (
              <div key={s.id} style={styles.sessionCard}>
                <button
                  style={styles.sessionClickArea}
                  onClick={() => loadSession(s)}
                  disabled={loadingId === s.id || resumingId === s.id}
                >
                  <div style={styles.sessionName}>
                    {loadingId === s.id ? 'Loading...' : s.name}
                  </div>
                  <div style={styles.sessionMeta}>
                    {s.totalLoops} loops &middot; {formatDate(s.lastModified)}
                  </div>
                </button>
                <button
                  style={styles.resumeBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeSession(s);
                  }}
                  disabled={resumingId === s.id}
                  title="Resume"
                >
                  {resumingId === s.id ? (
                    <span style={styles.miniSpinner} />
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 1l6 4-6 4V1z" fill="#22c55e" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
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
    padding: '16px 14px',
  },
  hero: {
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
    color: '#111827',
    letterSpacing: '-0.03em',
    margin: 0,
  },
  subtitle: {
    fontSize: 12,
    color: '#9ca3af',
    margin: '4px 0 14px',
  },
  startBtn: {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  history: {
    marginTop: 4,
  },
  historyTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 8,
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  sessionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: '#f9fafb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  sessionClickArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    padding: '8px 10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    minWidth: 0,
  },
  sessionName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  sessionMeta: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  resumeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    marginRight: 6,
    border: '1px solid #d1fae5',
    borderRadius: 6,
    background: '#f0fdf4',
    cursor: 'pointer',
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
