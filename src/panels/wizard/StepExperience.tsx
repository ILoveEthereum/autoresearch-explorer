import type React from 'react';

export function StepExperience() {
  return (
    <div style={styles.container}>
      <label style={styles.label}>Past Experience</label>
      <p style={styles.hint}>
        The agent can learn from past sessions to improve future research.
      </p>
      <div style={styles.empty}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.4 }}>
          <circle cx="16" cy="16" r="14" stroke="#9ca3af" strokeWidth="1.5" />
          <path d="M16 10v6l4 4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={styles.emptyText}>No past experience yet</span>
        <span style={styles.emptyHint}>
          This will be available when memory is implemented.
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
  },
  hint: {
    fontSize: 13,
    color: '#9ca3af',
    margin: 0,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '32px 24px',
    border: '1px dashed #e5e7eb',
    borderRadius: 8,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: 600,
    color: '#6b7280',
  },
  emptyHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center' as const,
  },
};
