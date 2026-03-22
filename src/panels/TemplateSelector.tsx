import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TemplateSummary } from '../types/template';
import { useCanvasStore } from '../stores/canvasStore';
import { useSessionStore } from '../stores/sessionStore';

interface Props {
  onClose: () => void;
}

export function TemplateSelector({ onClose }: Props) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSession = useSessionStore((s) => s.setSession);

  useEffect(() => {
    invoke<TemplateSummary[]>('list_templates')
      .then(setTemplates)
      .catch((err) => {
        console.error('Failed to list templates:', err);
        // Fallback to indicate no templates found
        setTemplates([]);
      });

    // Try to load API key from localStorage
    const saved = localStorage.getItem('deepinfra_api_key');
    if (saved) setApiKey(saved);
  }, []);

  const handleStart = async () => {
    if (!selected || !question.trim() || !apiKey.trim()) return;

    setLoading(true);
    setError(null);

    // Save API key for next time
    localStorage.setItem('deepinfra_api_key', apiKey);

    // Clear existing test nodes
    useCanvasStore.getState().applyOps([]);
    useCanvasStore.setState({ nodes: [], edges: [], clusters: [], focusNodeId: null });

    try {
      const meta = await invoke<{ id: string; name: string }>('create_session', {
        name: question.slice(0, 50),
        templatePath: selected,
        question: question,
        apiKey: apiKey,
      });

      setSession(meta.id, meta.name);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const canStart = selected && question.trim() && apiKey.trim() && !loading;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>New Research Session</h2>
        <p style={styles.subtitle}>Choose a template and enter your research question</p>

        <div>
          <label style={styles.label}>Template</label>
          <select
            style={styles.select}
            value={selected || ''}
            onChange={(e) => setSelected(e.target.value || null)}
          >
            <option value="">Select a template...</option>
            {templates.map((t) => (
              <option key={t.path} value={t.path}>
                {t.name}{t.domain ? ` (${t.domain})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={styles.label}>Research Question</label>
          <textarea
            style={styles.textarea}
            placeholder="What would you like to research?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={styles.label}>DeepInfra API Key</label>
          <input
            style={styles.input}
            type="password"
            placeholder="Enter your DeepInfra API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        {error && (
          <div style={styles.error}>{error}</div>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            style={{
              ...styles.startBtn,
              ...(canStart ? {} : styles.startBtnDisabled),
            }}
            disabled={!canStart}
            onClick={handleStart}
          >
            {loading ? 'Starting...' : 'Start Session'}
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
    width: 480,
    maxHeight: '90vh',
    overflowY: 'auto' as const,
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
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#fff',
    color: '#111827',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'auto' as const,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 4,
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  },
  error: {
    marginTop: 12,
    padding: '8px 12px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
    fontSize: 12,
    color: '#dc2626',
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
