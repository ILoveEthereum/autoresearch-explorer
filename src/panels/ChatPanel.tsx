import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';
import type { ChatMessage } from '../stores/chatStore';

export function ChatPanel() {
  const [input, setInput] = useState('');
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    const referencedNodes = selectedNodeId ? [selectedNodeId] : [];

    addMessage({ from: 'user', text, referencedNodes });
    setInput('');

    try {
      await invoke('send_chat', { text, referencedNodes });
    } catch (err) {
      addMessage({ from: 'system', text: `Failed to send: ${err}` });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>Chat</h3>
      </div>

      <div ref={listRef} style={styles.messageList}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            Start a session, then chat to steer the research.
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      <div style={styles.inputArea}>
        {selectedNodeId && (
          <div style={styles.nodeRef}>
            Referencing: <strong>{selectedNodeId}</strong>
          </div>
        )}
        <div style={styles.inputRow}>
          <textarea
            style={styles.textarea}
            placeholder="Message the agent..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            style={{
              ...styles.sendBtn,
              ...(input.trim() ? {} : styles.sendBtnDisabled),
            }}
            disabled={!input.trim()}
            onClick={handleSend}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.from === 'user';
  const isSystem = message.from === 'system';

  return (
    <div style={{
      ...styles.bubble,
      ...(isUser ? styles.bubbleUser : {}),
      ...(isSystem ? styles.bubbleSystem : {}),
    }}>
      <div style={styles.bubbleFrom}>
        {isUser ? 'You' : isSystem ? 'System' : 'Agent'}
      </div>
      <div style={styles.bubbleText}>{message.text}</div>
      {message.referencedNodes && message.referencedNodes.length > 0 && (
        <div style={styles.bubbleRefs}>
          {message.referencedNodes.map((id) => (
            <span key={id} style={styles.refBadge}>{id}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'none',
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 1.5,
  },
  bubble: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#f3f4f6',
    maxWidth: '90%',
  },
  bubbleUser: {
    background: '#111827',
    color: '#fff',
    alignSelf: 'flex-end',
  },
  bubbleSystem: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    fontSize: 11,
  },
  bubbleFrom: {
    fontSize: 10,
    fontWeight: 600,
    marginBottom: 2,
    opacity: 0.6,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap' as const,
  },
  bubbleRefs: {
    display: 'flex',
    gap: 4,
    marginTop: 6,
  },
  refBadge: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 4,
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
    fontWeight: 500,
  },
  inputArea: {
    borderTop: '1px solid #f3f4f6',
    padding: '8px 12px',
  },
  nodeRef: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 6,
    padding: '4px 8px',
    background: '#f9fafb',
    borderRadius: 4,
  },
  inputRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '8px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'none' as const,
    outline: 'none',
    lineHeight: 1.4,
    maxHeight: 80,
  },
  sendBtn: {
    width: 34,
    height: 34,
    border: 'none',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
};
