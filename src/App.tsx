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
    position: 'relative',
    overflow: 'hidden',
  },
  canvasArea: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
  },
};

export default App;
