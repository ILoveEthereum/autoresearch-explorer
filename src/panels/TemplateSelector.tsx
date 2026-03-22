import { useEffect, useState } from 'react';
import type { TemplateSummary } from '../types/template';

// For Slice 1, we use mock data. In Slice 2+, this calls Tauri commands.
const MOCK_TEMPLATES: TemplateSummary[] = [
  { name: 'General Research', domain: 'general', path: 'general-research.md' },
  { name: 'Literature Review', domain: 'literature-review', path: 'literature-review.md' },
  { name: 'ML Optimization', domain: 'ml-experiments', path: 'ml-optimization.md' },
];

interface Props {
  onClose: () => void;
}

export function TemplateSelector({ onClose }: Props) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Replace with invoke('list_templates') in Slice 2
    setTemplates(MOCK_TEMPLATES);
  }, []);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Select a Template</h2>
        <p style={styles.subtitle}>Choose a research template to start a session</p>

        <div style={styles.list}>
          {templates.map((t) => (
            <button
              key={t.path}
              style={{
                ...styles.item,
                ...(selected === t.path ? styles.itemSelected : {}),
              }}
              onClick={() => setSelected(t.path)}
            >
              <div style={styles.itemName}>{t.name}</div>
              {t.domain && <div style={styles.itemDomain}>{t.domain}</div>}
            </button>
          ))}
        </div>

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{
              ...styles.startBtn,
              ...(selected ? {} : styles.startBtnDisabled),
            }}
            disabled={!selected}
            onClick={() => {
              if (selected) {
                // TODO: Create session in Slice 2
                console.log('Starting session with template:', selected);
                onClose();
              }
            }}
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    width: 420,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: '#111827',
  },
  subtitle: {
    margin: '4px 0 16px',
    fontSize: 13,
    color: '#6b7280',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  item: {
    display: 'block',
    width: '100%',
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s',
  },
  itemSelected: {
    borderColor: '#3b82f6',
    background: '#eff6ff',
  },
  itemName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
  },
  itemDomain: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20,
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
  startBtn: {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    background: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  startBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};
