import type React from 'react';

export interface ApproachOption {
  id: string;
  label: string;
  description: string;
}

const APPROACHES: ApproachOption[] = [
  {
    id: 'build',
    label: 'Build a project',
    description: 'Research \u2192 design \u2192 implement \u2192 test',
  },
  {
    id: 'literature',
    label: 'Literature review',
    description: 'Search \u2192 read \u2192 synthesize \u2192 gaps',
  },
  {
    id: 'explore',
    label: 'Explore a topic',
    description: 'Open-ended web research',
  },
  {
    id: 'ml',
    label: 'ML optimization',
    description: 'Modify \u2192 run \u2192 evaluate \u2192 decide',
  },
  {
    id: 'tool-builder',
    label: 'Build a tool',
    description: 'Design \u2192 implement \u2192 test a custom tool',
  },
  {
    id: 'skill-builder',
    label: 'Build a skill',
    description: 'Research \u2192 synthesize \u2192 write a skill doc',
  },
];

interface Props {
  approach: string;
  setApproach: (a: string) => void;
  maxLoops: number;
  setMaxLoops: (n: number) => void;
}

export function StepApproach({ approach, setApproach, maxLoops, setMaxLoops }: Props) {
  return (
    <div style={styles.container}>
      <label style={styles.label}>How should the agent work?</label>
      <p style={styles.hint}>Choose a research approach that fits your goal.</p>

      <div style={styles.radioGroup}>
        {APPROACHES.map((opt) => (
          <label
            key={opt.id}
            style={{
              ...styles.radioCard,
              ...(approach === opt.id ? styles.radioCardSelected : {}),
            }}
          >
            <div style={styles.radioOuter}>
              {approach === opt.id && <div style={styles.radioInner} />}
            </div>
            <div style={styles.radioText}>
              <div style={styles.radioLabel}>{opt.label}</div>
              <div style={styles.radioDesc}>{opt.description}</div>
            </div>
          </label>
        ))}
      </div>

      <div style={styles.loopField}>
        <label style={styles.loopLabel}>Max loops</label>
        <div style={styles.loopRow}>
          <input
            style={styles.loopInput}
            type="number"
            min={0}
            value={maxLoops}
            onChange={(e) => setMaxLoops(Math.max(0, parseInt(e.target.value) || 0))}
          />
          <span style={styles.loopHint}>0 = unlimited</span>
        </div>
      </div>
    </div>
  );
}

/** Map approach ID to template file path */
export function approachToTemplate(approach: string): string {
  switch (approach) {
    case 'build':
      return 'general-research';
    case 'literature':
      return 'literature-review';
    case 'ml':
      return 'ml-optimization';
    case 'tool-builder':
      return 'tool-builder';
    case 'skill-builder':
      return 'skill-builder';
    case 'explore':
    default:
      return 'general-research';
  }
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
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 4,
  },
  radioCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    background: '#fafafa',
    transition: 'border-color 0.15s, background 0.15s',
  },
  radioCardSelected: {
    borderColor: '#111827',
    background: '#f9fafb',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    border: '2px solid #d1d5db',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#111827',
  },
  radioText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  radioLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#111827',
  },
  radioDesc: {
    fontSize: 12,
    color: '#9ca3af',
  },
  loopField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 8,
  },
  loopLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  loopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  loopInput: {
    width: 80,
    padding: '8px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fafafa',
    boxSizing: 'border-box' as const,
  },
  loopHint: {
    fontSize: 12,
    color: '#9ca3af',
  },
};
