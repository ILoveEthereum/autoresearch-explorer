import { create } from 'zustand';

interface SessionState {
  sessionId: string | null;
  sessionName: string | null;
  status: string;
  loopCount: number;
  isRunning: boolean;
  completionReason: string | null;

  setSession: (id: string, name: string) => void;
  setStatus: (status: string) => void;
  setLoopCount: (count: number) => void;
  setCompletionReason: (reason: string) => void;
  dismissCompletion: () => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  sessionName: null,
  status: 'idle',
  loopCount: 0,
  isRunning: false,
  completionReason: null,

  setSession: (id, name) => {
    (window as any).__autoresearch_session_id = id;
    set({ sessionId: id, sessionName: name, isRunning: true, completionReason: null });
  },
  setStatus: (status) => set({ status, isRunning: status !== 'idle' && status !== 'stopped' }),
  setLoopCount: (count) => set({ loopCount: count }),
  setCompletionReason: (reason) => set({ completionReason: reason, isRunning: false, status: 'completed' }),
  dismissCompletion: () => set({ completionReason: null }),
  clearSession: () => {
    (window as any).__autoresearch_session_id = null;
    set({ sessionId: null, sessionName: null, status: 'idle', loopCount: 0, isRunning: false, completionReason: null });
  },
}));
