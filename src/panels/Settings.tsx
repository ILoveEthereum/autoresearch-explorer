import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function Settings() {
  const [model, setModel] = useState('');
  const [maxLoops, setMaxLoops] = useState(50);
  const [searxngUrl, setSearxngUrl] = useState('');
  const [searchStatus, setSearchStatus] = useState<string | null>(null);

  useEffect(() => {
    const savedModel = localStorage.getItem('openrouter_model');
    if (savedModel) setModel(savedModel);
    const savedLoops = localStorage.getItem('default_max_loops');
    if (savedLoops) setMaxLoops(parseInt(savedLoops, 10) || 50);

    // Load SearXNG URL from backend config
    invoke<{ searxng_url?: string }>('load_telegram_config')
      .then((config: any) => {
        if (config?.searxng_url) setSearxngUrl(config.searxng_url);
      })
      .catch(() => {});
  }, []);

  const handleSaveModel = () => {
    if (model.trim()) {
      localStorage.setItem('openrouter_model', model);
    }
  };

  const handleSaveLoops = () => {
    localStorage.setItem('default_max_loops', String(maxLoops));
  };

  const handleSaveSearxng = async () => {
    try {
      // Save to backend config.json
      await invoke('save_telegram_config', {
        config: { searxng_url: searxngUrl.trim() || null },
      });
      setSearchStatus('Saved');
      setTimeout(() => setSearchStatus(null), 2000);
    } catch (e) {
      setSearchStatus('Failed to save');
    }
  };

  const handleTestSearxng = async () => {
    if (!searxngUrl.trim()) return;
    setSearchStatus('Testing...');
    try {
      const resp = await fetch(
        `${searxngUrl.trim().replace(/\/$/, '')}/search?q=test&format=json&engines=google&language=en`
      );
      if (resp.ok) {
        const data = await resp.json();
        const count = data?.results?.length || 0;
        setSearchStatus(`Connected — ${count} results returned`);
      } else {
        setSearchStatus(`Error: HTTP ${resp.status}`);
      }
    } catch (e) {
      setSearchStatus(`Cannot connect: ${e}`);
    }
    setTimeout(() => setSearchStatus(null), 5000);
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
        <div style={styles.sectionTitle}>SearXNG (Search Engine)</div>
        <p style={styles.hint}>
          Self-hosted metasearch engine. Best search quality, no rate limits.
          Install via Docker: <code>docker run -p 8080:8080 searxng/searxng</code>
        </p>
        <input
          style={styles.input}
          type="text"
          placeholder="http://localhost:8080"
          value={searxngUrl}
          onChange={(e) => setSearxngUrl(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button style={styles.btn} onClick={handleSaveSearxng}>Save</button>
          <button style={styles.btn} onClick={handleTestSearxng}>Test Connection</button>
          {searchStatus && (
            <span style={{ fontSize: 11, color: searchStatus.startsWith('Connected') ? '#22c55e' : searchStatus === 'Saved' ? '#3b82f6' : '#ef4444', alignSelf: 'center' }}>
              {searchStatus}
            </span>
          )}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Search Priority</div>
        <p style={styles.hint}>
          Search providers are tried in order: SearXNG → Brave → DuckDuckGo.
          Configure SearXNG above or set BRAVE_SEARCH_API_KEY for Brave. DuckDuckGo is always available as fallback.
        </p>
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
  btn: {
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    color: '#374151',
    fontFamily: 'inherit',
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
