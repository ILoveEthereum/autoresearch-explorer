import type React from 'react';

interface Props {
  successCriteria: string;
  setSuccessCriteria: (s: string) => void;
}

const CHIPS = [
  'Working code in directory',
  'All sub-questions resolved',
  'Benchmark results recorded',
  'Literature review complete with N+ sources',
];

export function StepSuccess({ successCriteria, setSuccessCriteria }: Props) {
  const appendChip = (chip: string) => {
    const trimmed = successCriteria.trim();
    if (trimmed.length === 0) {
      setSuccessCriteria(chip);
    } else {
      setSuccessCriteria(trimmed + '\n' + chip);
    }
  };

  return (
    <div style={styles.container}>
      <label style={styles.label}>What does success look like?</label>
      <p style={styles.hint}>Define what a successful outcome means for this session.</p>
      <textarea
        style={styles.textarea}
        placeholder="e.g. A working prototype with tests passing, or a comprehensive literature review with 20+ sources"
        value={successCriteria}
        onChange={(e) => setSuccessCriteria(e.target.value)}
        rows={3}
        autoFocus
      />
      <div style={styles.chipRow}>
        {CHIPS.map((chip) => (
          <button
            key={chip}
            style={styles.chip}
            onClick={() => appendChip(chip)}
            type="button"
          >
            {chip}
          </button>
        ))}
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
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    lineHeight: '1.5',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    background: '#fafafa',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box' as const,
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 4,
  },
  chip: {
    padding: '5px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    background: '#f9fafb',
    cursor: 'pointer',
    fontSize: 12,
    color: '#374151',
    fontFamily: 'inherit',
    transition: 'background 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap' as const,
  },
};
