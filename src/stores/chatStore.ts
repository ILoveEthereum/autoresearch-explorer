import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ChatMessage {
  id: string;
  from: 'user' | 'agent' | 'system';
  text: string;
  referencedNodes?: string[];
  timestamp: string;
}

interface ChatState {
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  loadMessages: (msgs: ChatMessage[]) => void;
  clearMessages: () => void;
}

let msgCounter = 0;

function persistChat(messages: ChatMessage[]) {
  // Get session ID from sessionStore (avoid circular import by reading directly)
  const sessionId = (window as any).__autoresearch_session_id;
  if (sessionId) {
    invoke('save_chat', { sessionId, messages }).catch(() => {});
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],

  addMessage: (msg) =>
    set((state) => {
      const newMessages = [
        ...state.messages,
        {
          ...msg,
          id: `msg-${++msgCounter}`,
          timestamp: new Date().toISOString(),
        },
      ];
      persistChat(newMessages);
      return { messages: newMessages };
    }),

  loadMessages: (msgs) => {
    // Reset counter to avoid ID collisions
    const maxId = msgs.reduce((max, m) => {
      const num = parseInt(m.id.replace('msg-', ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    msgCounter = maxId;
    set({ messages: msgs });
  },

  clearMessages: () => set({ messages: [] }),
}));
