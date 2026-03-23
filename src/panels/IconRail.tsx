import { useUiStore, type ActivePanel } from '../stores/uiStore';

interface RailIcon {
  id: ActivePanel;
  label: string;
  icon: JSX.Element;
}

const ICONS_TOP: RailIcon[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 8.5L10 3l7 5.5V16a1 1 0 01-1 1h-3v-4a1 1 0 00-1-1H8a1 1 0 00-1 1v4H4a1 1 0 01-1-1V8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'canvas',
    label: 'Canvas',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="12" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="12" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="12" y="12" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H7l-3 3V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12a1 1 0 01-1 1H9a1 1 0 01-1-1v-1.5C6.8 9.8 6 8.5 6 7a4 4 0 014-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 15h3M9 17h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M12 3v4a1 1 0 001 1h4M8 17v-4a1 1 0 00-1-1H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

const SETTINGS_ICON: RailIcon = {
  id: 'settings',
  label: 'Settings',
  icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 3v1.5M10 15.5V17M17 10h-1.5M4.5 10H3M14.95 5.05l-1.06 1.06M6.11 13.89l-1.06 1.06M14.95 14.95l-1.06-1.06M6.11 6.11L5.05 5.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

export function IconRail() {
  const activePanel = useUiStore((s) => s.activePanel);
  const setActivePanel = useUiStore((s) => s.setActivePanel);

  const handleClick = (id: ActivePanel) => {
    if (id === 'canvas') {
      // Canvas always closes the overlay
      setActivePanel(null);
    } else if (activePanel === id) {
      // Toggle off
      setActivePanel(null);
    } else {
      setActivePanel(id);
    }
  };

  return (
    <div style={styles.rail}>
      <div style={styles.topIcons}>
        {ICONS_TOP.map((item) => {
          const isActive = item.id === 'canvas'
            ? activePanel === null
            : activePanel === item.id;
          return (
            <button
              key={item.id}
              style={{
                ...styles.iconBtn,
                color: isActive ? '#ffffff' : '#6b7280',
                borderLeft: isActive ? '2px solid #ffffff' : '2px solid transparent',
              }}
              onClick={() => handleClick(item.id)}
              title={item.label}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
      <div style={styles.bottomIcons}>
        <button
          style={{
            ...styles.iconBtn,
            color: activePanel === 'settings' ? '#ffffff' : '#6b7280',
            borderLeft: activePanel === 'settings' ? '2px solid #ffffff' : '2px solid transparent',
          }}
          onClick={() => handleClick('settings')}
          title={SETTINGS_ICON.label}
        >
          {SETTINGS_ICON.icon}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rail: {
    width: 48,
    minWidth: 48,
    background: '#111827',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    flexShrink: 0,
  },
  topIcons: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  bottomIcons: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  iconBtn: {
    width: 48,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.15s',
    boxSizing: 'border-box',
  },
};
