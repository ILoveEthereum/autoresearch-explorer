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
  const [model, setModel] = useState('Qwen/Qwen2.5-72B-Instruct');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSession = useSessionStore((s) => s.setSession);

  const MODELS = [
    { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct' },
    { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen 3 235B (MoE)' },
    { id: 'deepseek-ai/DeepSeek-V3-0324', name: 'DeepSeek V3' },
    { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', name: 'Llama 4 Maverick 17B' },
    { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B Instruct' },
    { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct', name: 'Llama 3.1 405B Instruct' },
    { id: 'mistralai/Mistral-Small-24B-Instruct-2501', name: 'Mistral Small 24B' },
    { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B' },
  ];

  useEffect(() => {
    invoke<TemplateSummary[]>('list_templates')
      .then((t) => {
        setTemplates(t);
        if (t.length > 0) setSelected(t[0].path);
      })
      .catch((err) => {
        console.error('Failed to list templates:', err);
        setTemplates([]);
      });

    const saved = localStorage.getItem('deepinfra_api_key');
    if (saved) setApiKey(saved);
    const savedModel = localStorage.getItem('deepinfra_model');
    if (savedModel) setModel(savedModel);
  }, []);

  const handleStart = async () => {
    if (!selected || !question.trim() || !apiKey.trim()) return;

    setLoading(true);
    setError(null);

    localStorage.setItem('deepinfra_api_key', apiKey);
    localStorage.setItem('deepinfra_model', model);

    useCanvasStore.getState().applyOps([]);
    useCanvasStore.setState({ nodes: [], edges: [], clusters: [], focusNodeId: null });

    try {
      const meta = await invoke<{ id: string; name: string }>('create_session', {
        name: question.slice(0, 50),
        templatePath: selected,
        question: question,
        apiKey: apiKey,
        model: model,
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
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>New Research Session</h2>
            <p style={styles.subtitle}>Configure your research and let the agent explore</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={styles.divider} />

        {/* Form */}
        <div style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Research Question</label>
            <textarea
              style={styles.textarea}
              placeholder="e.g. What are the latest advances in quantum error correction?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.label}>Template</label>
              <select
                style={styles.select}
                value={selected || ''}
                onChange={(e) => setSelected(e.target.value || null)}
              >
                <option value="">Select...</option>
                {templates.map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.label}>Model</label>
              <select
                style={styles.select}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              DeepInfra API Key
              {apiKey && <span style={styles.savedBadge}>saved</span>}
            </label>
            <input
              style={styles.input}
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div style={styles.error}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="7" cy="7" r="6" stroke="#dc2626" strokeWidth="1.2" />
              <path d="M7 4v3.5M7 9.5v.01" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div style={styles.divider} />

        {/* Footer */}
        <div style={styles.footer}>
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
            {loading ? (
              <span style={styles.loadingInner}>
                <span style={styles.spinner} />
                Starting...
              </span>
            ) : (
              'Start Research'
            )}
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
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    width: 500,
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.05)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px 24px 0',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#9ca3af',
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    background: '#f3f4f6',
    margin: '16px 0',
  },
  form: {
    padding: '0 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  row: {
    display: 'flex',
    gap: 12,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  savedBadge: {
    fontSize: 10,
    fontWeight: 500,
    color: '#22c55e',
    background: '#f0fdf4',
    padding: '1px 6px',
    borderRadius: 4,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#fafafa',
    color: '#111827',
    outline: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.15s',
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
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fafafa',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  error: {
    margin: '0 24px',
    padding: '10px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    fontSize: 12,
    color: '#dc2626',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    lineHeight: '1.4',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '0 24px 24px',
  },
  cancelBtn: {
    padding: '10px 18px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    transition: 'background 0.15s',
  },
  startBtn: {
    padding: '10px 24px',
    border: 'none',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    transition: 'background 0.15s',
  },
  startBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  loadingInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
    display: 'inline-block',
  },
};
