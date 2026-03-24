import { useUiStore } from '../stores/uiStore';
import { HomeScreen } from './HomeScreen';
import { ChatPanel } from './ChatPanel';
import { SkillsPanel } from './SkillsPanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { Settings } from './Settings';

const PANEL_TITLES: Record<string, string> = {
  home: 'Home',
  chat: 'Chat',
  skills: 'Skills & Tools',
  integrations: 'Integrations',
  settings: 'Settings',
};

export function OverlayPanel() {
  const activePanel = useUiStore((s) => s.activePanel);
  const setActivePanel = useUiStore((s) => s.setActivePanel);

  if (!activePanel || activePanel === 'canvas') return null;

  const title = PANEL_TITLES[activePanel] || '';

  const renderContent = () => {
    switch (activePanel) {
      case 'home':
        return <HomeScreen />;
      case 'chat':
        return <ChatPanel />;
      case 'skills':
        return <SkillsPanel />;
      case 'integrations':
        return <IntegrationsPanel />;
      case 'settings':
        return <Settings />;
      default:
        return null;
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>
        <button
          style={styles.closeBtn}
          onClick={() => setActivePanel(null)}
          title="Close panel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 3L3 11M3 3l8 8" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div style={styles.content}>
        {renderContent()}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 280,
    minWidth: 280,
    background: '#ffffff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid #f3f4f6',
    flexShrink: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: 2,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
};
