import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useCanvasStore } from '../stores/canvasStore';
import { useSessionStore } from '../stores/sessionStore';
import { useChatStore } from '../stores/chatStore';
import type { CanvasOp } from '../types/canvas';

/**
 * Retry listen with exponential backoff.
 * Tauri 2 may reject listen() if the backend isn't ready yet.
 */
async function listenWithRetry<T>(
  event: string,
  handler: (event: { payload: T }) => void,
  maxRetries = 10,
  delay = 200
): Promise<() => void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await listen<T>(event, handler);
    } catch {
      if (i === maxRetries - 1) {
        console.warn(`Failed to listen for "${event}" after ${maxRetries} retries`);
        return () => {};
      }
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  return () => {};
}

export function useTauriEvents() {
  const applyOps = useCanvasStore((s) => s.applyOps);
  const setStatus = useSessionStore((s) => s.setStatus);
  const setLoopCount = useSessionStore((s) => s.setLoopCount);
  const addChatMessage = useChatStore((s) => s.addMessage);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    let cancelled = false;

    let isFirstOps = true;

    async function setup() {
      const u1 = await listenWithRetry<CanvasOp[]>('canvas-ops', (event) => {
        applyOps(event.payload);
        // Center on first batch of ops for this session
        if (isFirstOps) {
          isFirstOps = false;
          setTimeout(() => useCanvasStore.getState().centerOnNodes(), 100);
        }
      });
      if (!cancelled) unlisteners.push(u1);

      const u2 = await listenWithRetry<{ status: string; loop: number }>('agent-status', (event) => {
        setStatus(event.payload.status);
      });
      if (!cancelled) unlisteners.push(u2);

      const u3 = await listenWithRetry<{ loop: number; plan: string }>('loop-completed', (event) => {
        setLoopCount(event.payload.loop);
      });
      if (!cancelled) unlisteners.push(u3);

      const u4 = await listenWithRetry<{ from: string; text: string }>('chat-message', (event) => {
        addChatMessage({ from: 'agent', text: event.payload.text });
      });
      if (!cancelled) unlisteners.push(u4);

      const u5 = await listenWithRetry<{ error: string }>('session-error', (event) => {
        console.error('[Session Error]', event.payload.error);
      });
      if (!cancelled) unlisteners.push(u5);
    }

    setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, [applyOps, setStatus, setLoopCount, addChatMessage]);
}
