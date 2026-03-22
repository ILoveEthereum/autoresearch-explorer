import { useUiStore } from '../stores/uiStore';

export function SessionControls() {
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <span style={styles.logo}>Autoresearch</span>
      </div>
      <div style={styles.right}>
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
    gap: 12,
  },
  logo: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.02em',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
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
