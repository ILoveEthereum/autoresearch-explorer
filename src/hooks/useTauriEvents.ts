import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useCanvasStore } from '../stores/canvasStore';
import { useSessionStore } from '../stores/sessionStore';
import type { CanvasOp } from '../types/canvas';

export function useTauriEvents() {
  const applyOps = useCanvasStore((s) => s.applyOps);
  const setStatus = useSessionStore((s) => s.setStatus);
  const setLoopCount = useSessionStore((s) => s.setLoopCount);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<CanvasOp[]>('canvas-ops', (event) => {
      applyOps(event.payload);
    }).then((u) => unlisteners.push(u));

    listen<{ status: string; loop: number }>('agent-status', (event) => {
      setStatus(event.payload.status);
    }).then((u) => unlisteners.push(u));

    listen<{ loop: number; plan: string }>('loop-completed', (event) => {
      setLoopCount(event.payload.loop);
    }).then((u) => unlisteners.push(u));

    listen<{ from: string; text: string }>('chat-message', (event) => {
      console.log('[Agent]', event.payload.text);
    }).then((u) => unlisteners.push(u));

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [applyOps, setStatus, setLoopCount]);
}
