import { useSessionStore } from '../stores/sessionStore';

export function HistorySlider() {
  const loopCount = useSessionStore((s) => s.loopCount);

  if (loopCount < 1) return null;

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <span style={styles.label}>History</span>
        <input
          type="range"
          min={1}
          max={loopCount}
          value={loopCount}
          style={styles.slider}
          readOnly
          title={`Loop ${loopCount}`}
        />
        <span style={styles.count}>Loop {loopCount}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
  },
  inner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 16px',
    background: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
    backdropFilter: 'blur(8px)',
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  slider: {
    width: 200,
    accentColor: '#3b82f6',
  },
  count: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    minWidth: 60,
  },
};
