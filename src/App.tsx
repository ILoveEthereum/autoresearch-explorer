import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CanvasView } from './canvas/CanvasView';
import { SessionControls } from './panels/SessionControls';
import { DetailPanel } from './panels/DetailPanel';
import { IconRail } from './panels/IconRail';
import { OverlayPanel } from './panels/OverlayPanel';
import { HistorySlider } from './panels/HistorySlider';
import { TemplateSelector } from './panels/TemplateSelector';
import { useUiStore } from './stores/uiStore';
import { useSessionStore } from './stores/sessionStore';
import { useTauriEvents } from './hooks/useTauriEvents';
import { useKeyboard } from './hooks/useKeyboard';

// --- Error Boundary ---

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught error in React tree:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={errorStyles.container}>
          <div style={errorStyles.card}>
            <h2 style={errorStyles.title}>Something went wrong</h2>
            <p style={errorStyles.message}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button style={errorStyles.button} onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const errorStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#111',
    color: '#e5e5e5',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    maxWidth: 480,
    padding: '40px 32px',
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    textAlign: 'center' as const,
  },
  title: {
    margin: '0 0 12px 0',
    fontSize: 20,
    fontWeight: 600,
    color: '#f87171',
  },
  message: {
    margin: '0 0 24px 0',
    fontSize: 14,
    lineHeight: 1.5,
    color: '#a3a3a3',
    wordBreak: 'break-word' as const,
  },
  button: {
    padding: '10px 28px',
    fontSize: 14,
    fontWeight: 500,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
};

// --- App ---

function CompletionBanner() {
  const completionReason = useSessionStore((s) => s.completionReason);
  const dismissCompletion = useSessionStore((s) => s.dismissCompletion);

  if (!completionReason) return null;

  const handleResume = async () => {
    dismissCompletion();
    try {
      await invoke('resume_session');
    } catch (err) {
      console.error('Failed to resume after completion:', err);
    }
  };

  return (
    <div style={completionStyles.banner}>
      <span style={completionStyles.text}>
        Research complete: {completionReason}
      </span>
      <button style={completionStyles.button} onClick={handleResume}>
        Resume Anyway
      </button>
    </div>
  );
}

const completionStyles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: '#fff',
    fontWeight: 500,
    fontSize: 14,
  },
  text: {
    flex: 1,
  },
  button: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: 6,
    padding: '5px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
};

function App() {
  const showDetailPanel = useUiStore((s) => s.showDetailPanel);
  const showTemplateSelector = useUiStore((s) => s.showTemplateSelector);
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);
  const sessionId = useSessionStore((s) => s.sessionId);

  useTauriEvents();
  useKeyboard();

  return (
    <div style={styles.app}>
      <SessionControls />
      <div style={styles.main}>
        <IconRail />
        <div style={styles.canvasWrapper}>
          <OverlayPanel />
          <div style={styles.canvasArea}>
            <CompletionBanner />
            <CanvasView />
            {sessionId && <HistorySlider />}
          </div>
        </div>
        {showDetailPanel && <DetailPanel />}
      </div>
      {showTemplateSelector && (
        <TemplateSelector onClose={() => {
          setShowTemplateSelector(false);
          useUiStore.getState().setDefaultApproach(null);
        }} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  canvasWrapper: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  canvasArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};

function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithBoundary;
