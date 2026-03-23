import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUiStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useChatStore } from '../stores/chatStore';
import { ExportMenu } from './ExportMenu';

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  building_context: 'Building context...',
  calling_llm: 'Calling LLM...',
  writing_loop: 'Writing results...',
  updating_overview: 'Updating overview...',
  paused: 'Paused',
  stopped: 'Stopped',
  error: 'Error — check logs',
};

export function SessionControls() {
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);
  const sessionId = useSessionStore((s) => s.sessionId);
  const sessionName = useSessionStore((s) => s.sessionName);
  const status = useSessionStore((s) => s.status);
  const loopCount = useSessionStore((s) => s.loopCount);
  const isRunning = useSessionStore((s) => s.isRunning);
  const [resuming, setResuming] = useState(false);

  const isPaused = status === 'paused';
  const isStopped = status === 'stopped';
  const isActive = sessionName && !isStopped;

  const clearSession = useSessionStore((s) => s.clearSession);
  const setStatus = useSessionStore((s) => s.setStatus);

  const handlePause = async () => {
    try {
      await invoke('pause_session');
      setStatus('paused');
    } catch (err) {
      console.error('Pause failed:', err);
      // Force UI update anyway
      setStatus('paused');
    }
  };

  const handleResume = async () => {
    try {
      await invoke('resume_session');
      setStatus('idle');
    } catch (err) {
      console.error('Resume failed:', err);
    }
  };

  const handleStop = async () => {
    try {
      await invoke('stop_session');
    } catch (err) {
      console.error('Stop failed:', err);
    }
    // Always update UI to stopped
    setStatus('stopped');
  };

  const handleResumeSaved = async () => {
    if (!sessionId) return;
    const apiKey = localStorage.getItem('openrouter_api_key');
    if (!apiKey) {
      alert('No API key found. Please start a new session first to set your API key.');
      return;
    }
    setResuming(true);
    try {
      await invoke('resume_saved_session', { sessionId, apiKey });
      setStatus('idle');
    } catch (err) {
      console.error('Failed to resume:', err);
      alert(`Failed to resume: ${err}`);
    } finally {
      setResuming(false);
    }
  };

  const handleGoHome = () => {
    // Stop the active session if running
    if (isActive && !isStopped) {
      invoke('stop_session').catch(console.error);
    }
    // Clear all state
    clearSession();
    useCanvasStore.setState({ nodes: [], edges: [], clusters: [], focusNodeId: null });
    useChatStore.getState().clearMessages();
    useUiStore.getState().selectNode(null);
  };

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <button style={styles.logoBtn} onClick={handleGoHome} title="Back to home">
          Autoresearch
        </button>
        {sessionName && (
          <>
            <span style={styles.sep}>/</span>
            <span style={styles.sessionName}>{sessionName}</span>
          </>
        )}
      </div>

      <div style={styles.center}>
        {isActive && (
          <span style={styles.status}>
            {!isPaused && !isStopped && status !== 'idle' && status !== 'error' && (
              <span style={styles.dot} />
            )}
            {isPaused && <span style={styles.pauseIcon}>||</span>}
            {STATUS_LABELS[status] || status}
          </span>
        )}
        {loopCount > 0 && (
          <span style={styles.loopBadge}>Loop {loopCount}</span>
        )}
      </div>

      <div style={styles.right}>
        {/* Stopped session — show Resume button */}
        {sessionName && isStopped && (
          <button
            style={{ ...styles.controlBtn, ...styles.resumeBtn }}
            onClick={handleResumeSaved}
            disabled={resuming}
            title="Resume agent loop"
          >
            {resuming ? (
              <span style={styles.miniSpinner} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 2l9 5-9 5V2z" fill="#22c55e" />
              </svg>
            )}
            {resuming ? 'Resuming...' : 'Resume'}
          </button>
        )}
        {/* Active session — show Pause/Resume + Stop */}
        {isActive && (
          <>
            {isPaused ? (
              <button style={styles.controlBtn} onClick={handleResume} title="Resume">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 2l9 5-9 5V2z" fill="#22c55e" />
                </svg>
                Resume
              </button>
            ) : (
              <button style={styles.controlBtn} onClick={handlePause} title="Pause">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="3" y="2" width="3" height="10" rx="0.5" fill="#f59e0b" />
                  <rect x="8" y="2" width="3" height="10" rx="0.5" fill="#f59e0b" />
                </svg>
                Pause
              </button>
            )}
            <button style={{ ...styles.controlBtn, ...styles.stopBtn }} onClick={handleStop} title="Stop">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="1" fill="#ef4444" />
              </svg>
              Stop
            </button>
          </>
        )}
        <ExportMenu />
        <button style={styles.btn} onClick={() => setShowTemplateSelector(true)}>
          New Session
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    padding: '0 16px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  logoBtn: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.02em',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  sep: {
    color: '#d1d5db',
    fontSize: 14,
  },
  sessionName: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: 200,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#22c55e',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  pauseIcon: {
    fontSize: 10,
    fontWeight: 800,
    color: '#f59e0b',
    letterSpacing: 1,
  },
  loopBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    background: '#eff6ff',
    color: '#3b82f6',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  controlBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
  },
  stopBtn: {
    borderColor: '#fecaca',
  },
  resumeBtn: {
    borderColor: '#bbf7d0',
    background: '#f0fdf4',
    color: '#16a34a',
    fontWeight: 600,
  },
  miniSpinner: {
    width: 12,
    height: 12,
    border: '2px solid #bbf7d0',
    borderTopColor: '#16a34a',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
    display: 'inline-block',
  },
  btn: {
    padding: '6px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
  },
};
