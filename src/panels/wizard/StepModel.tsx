import { useEffect, useState, useRef, useCallback } from 'react';
import type React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

interface Props {
  apiKey: string;
  setApiKey: (k: string) => void;
  model: string;
  setModel: (m: string) => void;
}

export function StepModel({ apiKey, setApiKey, model, setModel }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [selectedModelName, setSelectedModelName] = useState('');
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchModels = useCallback(async (key: string) => {
    if (!key.trim()) {
      setModels([]);
      return;
    }
    setFetchingModels(true);
    try {
      const result = await invoke<ModelInfo[]>('fetch_models', { apiKey: key });
      setModels(result);
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

  // Fetch on mount if key exists
  useEffect(() => {
    if (apiKey.trim()) {
      fetchModels(apiKey);
    }
    // Find name for current model
    if (model && models.length > 0) {
      const found = models.find((m) => m.id === model);
      if (found) setSelectedModelName(found.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div style={styles.container}>
      <label style={styles.sectionLabel}>Model & API</label>
      <p style={styles.hint}>Configure your LLM provider and model.</p>

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
          onChange={(e) => {
            setApiKey(e.target.value);
            localStorage.setItem('openrouter_api_key', e.target.value);
          }}
          autoFocus
        />
      </div>

      <div style={{ ...styles.field, position: 'relative' }} ref={modelDropdownRef}>
        <label style={styles.label}>
          Model
          {model && <span style={styles.savedBadge}>saved</span>}
        </label>
        <div
          style={styles.modelTrigger}
          onClick={() => setShowModelDropdown(!showModelDropdown)}
        >
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
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
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
  },
  hint: {
    fontSize: 13,
    color: '#9ca3af',
    margin: 0,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 4,
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
    boxSizing: 'border-box' as const,
  },
  modelTrigger: {
    width: '100%',
    padding: '0 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fafafa',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 38,
    boxSizing: 'border-box' as const,
  },
  dropdown: {
    position: 'absolute',
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
};
