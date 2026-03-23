import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface TelegramConfig {
  bot_token: string;
  chat_id: number;
  notify_every_n_loops: number;
  notify_on_stuck: boolean;
  notify_on_complete: boolean;
}

export function Settings({ onClose }: { onClose: () => void }) {
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Settings</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Telegram Notifications</h3>
          <p style={styles.hint}>
            Get progress updates and control sessions remotely via Telegram.
            Create a bot with @BotFather and send it a message to get your chat
            ID.
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

          <label style={styles.label}>
            Notify every N loops
          </label>
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
              Notify when stuck / needs human input
            </label>
          </div>

          <div style={styles.checkRow}>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={notifyComplete}
                onChange={(e) => setNotifyComplete(e.target.checked)}
              />
              Notify on session completion
            </label>
          </div>
        </div>

        {status && (
          <div
            style={{
              ...styles.status,
              color: status.startsWith('Error') || status.startsWith('Failed')
                ? '#ef4444'
                : '#16a34a',
            }}
          >
            {status}
          </div>
        )}

        <div style={styles.actions}>
          <button
            style={styles.testBtn}
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? 'Sending...' : 'Test Connection'}
          </button>
          <button
            style={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
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
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    width: 440,
    maxHeight: '80vh',
    overflowY: 'auto' as const,
    padding: 24,
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 22,
    cursor: 'pointer',
    color: '#9ca3af',
    padding: '0 4px',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
    margin: '0 0 4px',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    margin: '0 0 12px',
    lineHeight: 1.4,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  checkRow: {
    marginTop: 10,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
  },
  status: {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 12,
  },
  actions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
  },
  testBtn: {
    padding: '8px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
  },
  saveBtn: {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
};
