import { handleSignal } from './signalActions';

interface Props {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
}

export function ContextMenu({ x, y, nodeId, onClose }: Props) {
  const actions = [
    { label: 'Prioritize', icon: '\u2605', type: 'prioritize', color: '#22c55e' },
    { label: 'Challenge', icon: '?', type: 'challenge', color: '#f59e0b' },
    { label: 'Deprioritize', icon: '\u2193', type: 'deprioritize', color: '#9ca3af' },
  ];

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={{ ...styles.menu, left: x, top: y }}>
        <div style={styles.header}>{nodeId}</div>
        {actions.map((a) => (
          <button
            key={a.type}
            style={styles.item}
            onClick={() => {
              handleSignal(a.type, nodeId);
              onClose();
            }}
          >
            <span style={{ ...styles.icon, color: a.color }}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 99,
  },
  menu: {
    position: 'fixed',
    zIndex: 100,
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
    padding: '4px 0',
    minWidth: 160,
  },
  header: {
    padding: '6px 12px',
    fontSize: 10,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid #f3f4f6',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
    textAlign: 'left' as const,
  },
  icon: {
    fontSize: 14,
    width: 18,
    textAlign: 'center' as const,
    fontWeight: 700,
  },
};
