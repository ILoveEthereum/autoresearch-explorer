import { useEffect } from 'react';
import { CanvasView } from './canvas/CanvasView';
import { SessionControls } from './panels/SessionControls';
import { DetailPanel } from './panels/DetailPanel';
import { TemplateSelector } from './panels/TemplateSelector';
import { useCanvasStore } from './stores/canvasStore';
import { useUiStore } from './stores/uiStore';
import { useSessionStore } from './stores/sessionStore';
import { useTauriEvents } from './hooks/useTauriEvents';

function App() {
  const showDetailPanel = useUiStore((s) => s.showDetailPanel);
  const showTemplateSelector = useUiStore((s) => s.showTemplateSelector);
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);
  const addTestNodes = useCanvasStore((s) => s.addTestNodes);
  const sessionId = useSessionStore((s) => s.sessionId);

  // Listen for Tauri backend events
  useTauriEvents();

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
        <div style={styles.canvasContainer}>
          <CanvasView />
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
