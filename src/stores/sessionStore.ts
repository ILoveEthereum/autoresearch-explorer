import { create } from 'zustand';

interface SessionState {
  sessionId: string | null;
  sessionName: string | null;
  status: string;
  loopCount: number;
  isRunning: boolean;

  setSession: (id: string, name: string) => void;
  setStatus: (status: string) => void;
  setLoopCount: (count: number) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  sessionName: null,
  status: 'idle',
  loopCount: 0,
  isRunning: false,

  setSession: (id, name) => set({ sessionId: id, sessionName: name, isRunning: true }),
  setStatus: (status) => set({ status, isRunning: status !== 'idle' && status !== 'stopped' }),
  setLoopCount: (count) => set({ loopCount: count }),
  clearSession: () => set({ sessionId: null, sessionName: null, status: 'idle', loopCount: 0, isRunning: false }),
}));
