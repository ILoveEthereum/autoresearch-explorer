import type React from 'react';

interface Props {
  question: string;
  setQuestion: (q: string) => void;
}

export function StepQuestion({ question, setQuestion }: Props) {
  return (
    <div style={styles.container}>
      <label style={styles.label}>What are you researching?</label>
      <p style={styles.hint}>Describe your research question or goal clearly.</p>
      <textarea
        style={styles.textarea}
        placeholder="e.g. What are the latest advances in quantum error correction?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        autoFocus
      />
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
};
