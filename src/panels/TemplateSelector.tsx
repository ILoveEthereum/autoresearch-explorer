import { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { TemplateSummary } from '../types/template';
import { useCanvasStore } from '../stores/canvasStore';
import { useSessionStore } from '../stores/sessionStore';

interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

interface Props {
  onClose: () => void;
}

export function TemplateSelector({ onClose }: Props) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('qwen/qwen-2.5-72b-instruct');
  const [workingDir, setWorkingDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Model picker state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [selectedModelName, setSelectedModelName] = useState('');
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSession = useSessionStore((s) => s.setSession);

  // Fetch models when API key changes (debounced)
  const fetchModels = useCallback(async (key: string) => {
    if (!key.trim()) {
      setModels([]);
      return;
    }
    setFetchingModels(true);
    try {
      const result = await invoke<ModelInfo[]>('fetch_models', { apiKey: key });
      setModels(result);
      // If we have a saved model, find its name
      const saved = localStorage.getItem('openrouter_model');
      if (saved) {
        const found = result.find((m) => m.id === saved);
        if (found) setSelectedModelName(found.name);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
      setModels([]);
    } finally {
      setFetchingModels(false);
    }
  }, []);

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

    const saved = localStorage.getItem('openrouter_api_key');
    if (saved) {
      setApiKey(saved);
      fetchModels(saved);
    }
    const savedModel = localStorage.getItem('openrouter_model');
    if (savedModel) setModel(savedModel);
    const savedDir = localStorage.getItem('working_dir');
    if (savedDir) setWorkingDir(savedDir);
  }, [fetchModels]);

  // Debounced fetch on API key change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchModels(apiKey);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [apiKey, fetchModels]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const formatContext = (len: number): string => {
    if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(1)}M`;
    if (len >= 1_000) return `${Math.round(len / 1_000)}K`;
    return String(len);
  };

  const formatPrice = (price: string): string => {
    const n = parseFloat(price);
    if (isNaN(n) || n === 0) return 'free';
    // Price is per token, show per 1M tokens
    const perMillion = n * 1_000_000;
    if (perMillion < 0.01) return '<$0.01/M';
    return `$${perMillion.toFixed(2)}/M`;
  };

  const selectModel = (m: ModelInfo) => {
    setModel(m.id);
    setSelectedModelName(m.name);
    setModelSearch('');
    setShowModelDropdown(false);
  };

  const handleBrowse = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setWorkingDir(selected);
      localStorage.setItem('working_dir', selected);
    }
  };

  const handleStart = async () => {
    if (!selected || !question.trim() || !apiKey.trim() || !workingDir.trim()) return;

    setLoading(true);
    setError(null);

    localStorage.setItem('openrouter_api_key', apiKey);
    localStorage.setItem('openrouter_model', model);
    if (workingDir) localStorage.setItem('working_dir', workingDir);

    useCanvasStore.getState().applyOps([]);
    useCanvasStore.setState({ nodes: [], edges: [], clusters: [], focusNodeId: null });

    try {
      const meta = await invoke<{ id: string; name: string }>('create_session', {
        name: question.slice(0, 50),
        templatePath: selected,
        question: question,
        apiKey: apiKey,
        model: model,
        workingDir: workingDir,
      });

      setSession(meta.id, meta.name);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const canStart = selected && question.trim() && apiKey.trim() && workingDir.trim() && !loading;

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
            <div style={{ ...styles.field, flex: 1, position: 'relative' }} ref={modelDropdownRef}>
              <label style={styles.label}>
                Model
                {model && <span style={styles.savedBadge}>saved</span>}
              </label>
              <div
                style={{
                  ...styles.input,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 12px',
                  height: 38,
                }}
                onClick={() => setShowModelDropdown(!showModelDropdown)}
              >
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: selectedModelName || model ? '#111827' : '#9ca3af',
                  fontSize: 13,
                }}>
                  {selectedModelName || model || 'Select model...'}
                </span>
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, marginLeft: 4 }}>
                  <path d="M1 1l4 4 4-4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {showModelDropdown && (
                <div style={styles.dropdown}>
                  <div style={styles.dropdownSearchWrap}>
                    <input
                      style={styles.dropdownSearch}
                      type="text"
                      placeholder="Search models..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div style={styles.dropdownList}>
                    {fetchingModels ? (
                      <div style={styles.dropdownEmpty}>Loading models...</div>
                    ) : filteredModels.length === 0 ? (
                      <div style={styles.dropdownEmpty}>
                        {models.length === 0 ? 'Enter API key to load models' : 'No matches'}
                      </div>
                    ) : (
                      filteredModels.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            ...styles.dropdownItem,
                            ...(m.id === model ? styles.dropdownItemSelected : {}),
                          }}
                          onClick={() => selectModel(m)}
                        >
                          <div style={styles.dropdownItemName}>{m.name}</div>
                          <div style={styles.dropdownItemMeta}>
                            <span>{formatContext(m.context_length)} ctx</span>
                            <span style={styles.metaDot}>&middot;</span>
                            <span>{formatPrice(m.pricing.prompt)} in</span>
                            <span style={styles.metaDot}>&middot;</span>
                            <span>{formatPrice(m.pricing.completion)} out</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Working Directory
              <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>(required)</span>
            </label>
            <div style={styles.browseRow}>
              <input
                style={{ ...styles.input, flex: 1 }}
                type="text"
                placeholder="Choose a folder for this research session"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
              />
              <button style={styles.browseBtn} onClick={handleBrowse} type="button">
                Browse
              </button>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              OpenRouter API Key
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
  browseRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
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
  // Model dropdown styles
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.12)',
    zIndex: 200,
    overflow: 'hidden',
  },
  dropdownSearchWrap: {
    padding: '8px 8px 0',
  },
  dropdownSearch: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fafafa',
    boxSizing: 'border-box' as const,
  },
  dropdownList: {
    maxHeight: 240,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  dropdownEmpty: {
    padding: '16px 12px',
    textAlign: 'center' as const,
    fontSize: 12,
    color: '#9ca3af',
  },
  dropdownItem: {
    padding: '8px 12px',
    cursor: 'pointer',
    transition: 'background 0.1s',
    borderBottom: '1px solid #f9fafb',
  },
  dropdownItemSelected: {
    background: '#f0fdf4',
  },
  dropdownItemName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  dropdownItemMeta: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  metaDot: {
    color: '#d1d5db',
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
