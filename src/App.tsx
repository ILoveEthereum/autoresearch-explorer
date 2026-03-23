import { invoke } from '@tauri-apps/api/core';
import { CanvasView } from './canvas/CanvasView';
import { SessionControls } from './panels/SessionControls';
import { DetailPanel } from './panels/DetailPanel';
import { ChatPanel } from './panels/ChatPanel';
import { HistorySlider } from './panels/HistorySlider';
import { HomeScreen } from './panels/HomeScreen';
import { ProjectTree } from './panels/ProjectTree';
import { TemplateSelector } from './panels/TemplateSelector';
import { Settings } from './panels/Settings';
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
  const showSettings = useUiStore((s) => s.showSettings);
  const setShowSettings = useUiStore((s) => s.setShowSettings);
  const sessionId = useSessionStore((s) => s.sessionId);

  useTauriEvents();
  useKeyboard();

  return (
    <div style={styles.app}>
      <SessionControls />
      <div style={styles.main}>
        {sessionId && <ChatPanel />}
        {sessionId && <ProjectTree />}
        <div style={styles.canvasContainer}>
          <CompletionBanner />
          <CanvasView />
          {sessionId && <HistorySlider />}
          {!sessionId && <HomeScreen />}
        </div>
        {showDetailPanel && <DetailPanel />}
      </div>
      {showTemplateSelector && (
        <TemplateSelector onClose={() => setShowTemplateSelector(false)} />
      )}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
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
  canvasContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
};

export default App;
