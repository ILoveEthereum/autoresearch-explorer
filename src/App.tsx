import { useEffect } from 'react';
import { CanvasView } from './canvas/CanvasView';
import { SessionControls } from './panels/SessionControls';
import { DetailPanel } from './panels/DetailPanel';
import { ChatPanel } from './panels/ChatPanel';
import { HistorySlider } from './panels/HistorySlider';
import { TemplateSelector } from './panels/TemplateSelector';
import { useCanvasStore } from './stores/canvasStore';
import { useUiStore } from './stores/uiStore';
import { useSessionStore } from './stores/sessionStore';
import { useTauriEvents } from './hooks/useTauriEvents';
import { useKeyboard } from './hooks/useKeyboard';

function App() {
  const showDetailPanel = useUiStore((s) => s.showDetailPanel);
  const showTemplateSelector = useUiStore((s) => s.showTemplateSelector);
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);
  const addTestNodes = useCanvasStore((s) => s.addTestNodes);
  const sessionId = useSessionStore((s) => s.sessionId);

  // Listen for Tauri backend events and keyboard shortcuts
  useTauriEvents();
  useKeyboard();

  // Load test nodes only if no session is active
  useEffect(() => {
    if (!sessionId) {
      addTestNodes();
    }
  }, [addTestNodes, sessionId]);

  return (
    <div style={styles.app}>
      <SessionControls />
      <div style={styles.main}>
        <ChatPanel />
        <div style={styles.canvasContainer}>
          <CanvasView />
          <HistorySlider />
        </div>
        {showDetailPanel && <DetailPanel />}
      </div>
      {showTemplateSelector && (
        <TemplateSelector onClose={() => setShowTemplateSelector(false)} />
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
