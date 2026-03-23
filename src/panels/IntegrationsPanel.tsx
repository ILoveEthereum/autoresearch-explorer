import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface TelegramConfig {
  bot_token: string;
  chat_id: number;
  notify_every_n_loops: number;
  notify_on_stuck: boolean;
  notify_on_complete: boolean;
}

export function IntegrationsPanel() {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [notifyEvery, setNotifyEvery] = useState(10);
  const [notifyStuck, setNotifyStuck] = useState(true);
  const [notifyComplete, setNotifyComplete] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<TelegramConfig | null>('load_telegram_config')
      .then((config) => {
        if (config) {
          setToken(config.bot_token);
          setChatId(String(config.chat_id));
          setNotifyEvery(config.notify_every_n_loops);
          setNotifyStuck(config.notify_on_stuck);
          setNotifyComplete(config.notify_on_complete);
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    const id = parseInt(chatId, 10);
    if (!token || isNaN(id)) {
      setStatus('Please enter a valid bot token and chat ID.');
      return;
    }
    setSaving(true);
    try {
      await invoke('save_telegram_config', {
        token,
        chatId: id,
        notifyEvery,
        notifyStuck,
        notifyComplete,
      });
      setStatus('Saved!');
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus(`Error: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const id = parseInt(chatId, 10);
    if (!token || isNaN(id)) {
      setStatus('Please enter a valid bot token and chat ID first.');
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const msg = await invoke<string>('test_telegram_connection', {
        token,
        chatId: id,
      });
      setStatus(msg);
    } catch (err) {
      setStatus(`Failed: ${err}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Telegram section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M14 2L2 7l4 1.5M14 2L9 14l-3-5.5M14 2L6 8.5" stroke="#0088cc" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={styles.sectionTitle}>Telegram</span>
        </div>
        <p style={styles.hint}>
          Get progress updates and control sessions remotely. Create a bot with @BotFather to get your token.
        </p>

        <label style={styles.label}>Bot Token</label>
        <input
          style={styles.input}
          type="password"
          placeholder="123456:ABC-DEF..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />

        <label style={styles.label}>Chat ID</label>
        <input
          style={styles.input}
          type="text"
          placeholder="12345678"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
        />

        <label style={styles.label}>Notify every N loops</label>
        <input
          style={{ ...styles.input, width: 80 }}
          type="number"
          min={1}
          max={100}
          value={notifyEvery}
          onChange={(e) => setNotifyEvery(parseInt(e.target.value, 10) || 10)}
        />

        <div style={styles.checkRow}>
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={notifyStuck}
              onChange={(e) => setNotifyStuck(e.target.checked)}
            />
            Notify when stuck
          </label>
        </div>

        <div style={styles.checkRow}>
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={notifyComplete}
              onChange={(e) => setNotifyComplete(e.target.checked)}
            />
            Notify on completion
          </label>
        </div>

        {status && (
          <div
            style={{
              ...styles.status,
              color: status.startsWith('Error') || status.startsWith('Failed') || status.startsWith('Please')
                ? '#ef4444'
                : '#16a34a',
            }}
          >
            {status}
          </div>
        )}

        <div style={styles.actions}>
          <button style={styles.testBtn} onClick={handleTest} disabled={testing}>
            {testing ? 'Sending...' : 'Test'}
          </button>
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Future integrations */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Slack</span>
          <span style={styles.comingSoon}>Coming soon</span>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Discord</span>
          <span style={styles.comingSoon}>Coming soon</span>
        </div>
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
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  hint: {
    fontSize: 11,
    color: '#9ca3af',
    margin: '0 0 10px',
    lineHeight: 1.4,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: 3,
    marginTop: 8,
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
  checkRow: {
    marginTop: 8,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#374151',
    cursor: 'pointer',
  },
  status: {
    fontSize: 12,
    fontWeight: 500,
    marginTop: 8,
  },
  actions: {
    display: 'flex',
    gap: 6,
    marginTop: 10,
  },
  testBtn: {
    padding: '6px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
    fontFamily: 'inherit',
  },
  saveBtn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 6,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  comingSoon: {
    fontSize: 10,
    fontWeight: 500,
    color: '#9ca3af',
    background: '#f3f4f6',
    padding: '2px 6px',
    borderRadius: 4,
  },
};
