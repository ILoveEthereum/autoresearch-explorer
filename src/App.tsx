import { CanvasView } from './canvas/CanvasView';
import { SessionControls } from './panels/SessionControls';
import { DetailPanel } from './panels/DetailPanel';
import { ChatPanel } from './panels/ChatPanel';
import { HistorySlider } from './panels/HistorySlider';
import { HomeScreen } from './panels/HomeScreen';
import { TemplateSelector } from './panels/TemplateSelector';
import { useUiStore } from './stores/uiStore';
import { useSessionStore } from './stores/sessionStore';
import { useTauriEvents } from './hooks/useTauriEvents';
import { useKeyboard } from './hooks/useKeyboard';

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
        {sessionId && <ChatPanel />}
        <div style={styles.canvasContainer}>
          <CanvasView />
          {sessionId && <HistorySlider />}
          {!sessionId && <HomeScreen />}
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
