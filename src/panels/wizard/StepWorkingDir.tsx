import type React from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface Props {
  workingDir: string;
  setWorkingDir: (d: string) => void;
}

export function StepWorkingDir({ workingDir, setWorkingDir }: Props) {
  const handleBrowse = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setWorkingDir(selected);
      localStorage.setItem('working_dir', selected);
    }
  };

  return (
    <div style={styles.container}>
      <label style={styles.label}>Where should it work?</label>
      <p style={styles.hint}>All files, code, and research data will be saved here.</p>

      <div style={styles.browseRow}>
        <input
          style={styles.input}
          type="text"
          placeholder="Choose a folder for this research session"
          value={workingDir}
          onChange={(e) => setWorkingDir(e.target.value)}
          autoFocus
        />
        <button style={styles.browseBtn} onClick={handleBrowse} type="button">
          Browse
        </button>
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
  browseRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fafafa',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box' as const,
  },
  browseBtn: {
    padding: '10px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    fontFamily: 'inherit',
  },
};
