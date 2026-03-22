import { useUiStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  building_context: 'Building context...',
  calling_llm: 'Calling LLM...',
  writing_loop: 'Writing results...',
  stopped: 'Stopped',
};

export function SessionControls() {
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);
  const sessionName = useSessionStore((s) => s.sessionName);
  const status = useSessionStore((s) => s.status);
  const loopCount = useSessionStore((s) => s.loopCount);
  const isRunning = useSessionStore((s) => s.isRunning);

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <span style={styles.logo}>Autoresearch</span>
        {sessionName && (
          <>
            <span style={styles.sep}>/</span>
            <span style={styles.sessionName}>{sessionName}</span>
          </>
        )}
      </div>
      <div style={styles.center}>
        {isRunning && (
          <span style={styles.status}>
            <span style={styles.dot} />
            {STATUS_LABELS[status] || status}
          </span>
        )}
        {loopCount > 0 && (
          <span style={styles.loopBadge}>Loop {loopCount}</span>
        )}
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
    gap: 8,
  },
  logo: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.02em',
  },
  sep: {
    color: '#d1d5db',
    fontSize: 14,
  },
  sessionName: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: 500,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#22c55e',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  loopBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    background: '#eff6ff',
    color: '#3b82f6',
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
