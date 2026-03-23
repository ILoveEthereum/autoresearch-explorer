import { useState, useEffect } from 'react';

export function Settings() {
  const [model, setModel] = useState('');
  const [maxLoops, setMaxLoops] = useState(50);

  useEffect(() => {
    const savedModel = localStorage.getItem('openrouter_model');
    if (savedModel) setModel(savedModel);
    const savedLoops = localStorage.getItem('default_max_loops');
    if (savedLoops) setMaxLoops(parseInt(savedLoops, 10) || 50);
  }, []);

  const handleSaveModel = () => {
    if (model.trim()) {
      localStorage.setItem('openrouter_model', model);
    }
  };

  const handleSaveLoops = () => {
    localStorage.setItem('default_max_loops', String(maxLoops));
  };

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Default Model</div>
        <p style={styles.hint}>
          The model to pre-fill when creating new sessions.
        </p>
        <input
          style={styles.input}
          type="text"
          placeholder="qwen/qwen-2.5-72b-instruct"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={handleSaveModel}
        />
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Default Max Loops</div>
        <p style={styles.hint}>
          Default loop limit for new sessions. 0 = unlimited.
        </p>
        <input
          style={{ ...styles.input, width: 80 }}
          type="number"
          min={0}
          value={maxLoops}
          onChange={(e) => setMaxLoops(parseInt(e.target.value, 10) || 0)}
          onBlur={handleSaveLoops}
        />
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Theme</div>
        <p style={styles.hint}>
          Theme customization coming soon.
        </p>
        <div style={styles.placeholder}>Light (default)</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px 14px',
  },
  section: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: '1px solid #f3f4f6',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    color: '#9ca3af',
    margin: '0 0 8px',
    lineHeight: 1.4,
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  placeholder: {
    fontSize: 12,
    color: '#6b7280',
    padding: '6px 10px',
    background: '#f9fafb',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
  },
};
