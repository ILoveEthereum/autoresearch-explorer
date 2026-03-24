import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SearxngStatus {
  docker_installed: boolean;
  container_running: boolean;
  url: string | null;
  message: string;
}

export function Settings() {
  const [model, setModel] = useState('');
  const [maxLoops, setMaxLoops] = useState(50);
  const [searxngUrl, setSearxngUrl] = useState('');
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [searxng, setSearxng] = useState<SearxngStatus | null>(null);
  const [searxngLoading, setSearxngLoading] = useState(false);

  useEffect(() => {
    const savedModel = localStorage.getItem('openrouter_model');
    if (savedModel) setModel(savedModel);
    const savedLoops = localStorage.getItem('default_max_loops');
    if (savedLoops) setMaxLoops(parseInt(savedLoops, 10) || 50);

    // Check SearXNG status
    invoke<SearxngStatus>('searxng_status')
      .then((status) => {
        setSearxng(status);
        if (status.url) setSearxngUrl(status.url);
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
          One-click search engine powered by Docker. Aggregates Google, Bing, DuckDuckGo, and Brave results. No API keys needed.
        </p>

        {searxng && !searxng.docker_installed && (
          <div style={{ ...styles.statusBox, borderColor: '#fbbf24', background: '#fffbeb' }}>
            <span style={{ fontSize: 12, color: '#92400e' }}>
              Docker is required. <a href="https://docker.com/products/docker-desktop" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Install Docker Desktop</a>
            </span>
          </div>
        )}

        {searxng?.container_running ? (
          <div style={{ ...styles.statusBox, borderColor: '#22c55e', background: '#f0fdf4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>SearXNG Running</span>
            </div>
            <span style={{ fontSize: 11, color: '#166534' }}>{searxng.url}</span>
            <button
              style={{ ...styles.btn, marginTop: 8, color: '#dc2626', borderColor: '#fca5a5' }}
              disabled={searxngLoading}
              onClick={async () => {
                setSearxngLoading(true);
                try {
                  const status = await invoke<SearxngStatus>('searxng_stop');
                  setSearxng(status);
                  setSearxngUrl('');
                } catch (e) { setSearchStatus(String(e)); }
                setSearxngLoading(false);
              }}
            >
              Stop SearXNG
            </button>
          </div>
        ) : (
          <button
            style={{ ...styles.startBtn, opacity: searxngLoading || (searxng && !searxng.docker_installed) ? 0.5 : 1 }}
            disabled={searxngLoading || (searxng !== null && !searxng.docker_installed)}
            onClick={async () => {
              setSearxngLoading(true);
              setSearchStatus('Pulling image and starting container...');
              try {
                const status = await invoke<SearxngStatus>('searxng_start');
                setSearxng(status);
                if (status.url) setSearxngUrl(status.url);
                setSearchStatus(null);
              } catch (e) {
                setSearchStatus(String(e));
              }
              setSearxngLoading(false);
            }}
          >
            {searxngLoading ? 'Starting SearXNG...' : 'Enable SearXNG (one click)'}
          </button>
        )}

        {searchStatus && (
          <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{searchStatus}</div>
        )}

        <p style={{ ...styles.hint, marginTop: 10 }}>
          Or enter a custom SearXNG URL:
        </p>
        <input
          style={styles.input}
          type="text"
          placeholder="http://localhost:8080"
          value={searxngUrl}
          onChange={(e) => setSearxngUrl(e.target.value)}
          onBlur={handleSaveSearxng}
        />
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Search Priority</div>
        <p style={styles.hint}>
          1. SearXNG (if enabled) → 2. Brave Search (if API key set) → 3. DuckDuckGo (always available)
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
  startBtn: {
    width: '100%',
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  statusBox: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid',
    marginBottom: 8,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
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
