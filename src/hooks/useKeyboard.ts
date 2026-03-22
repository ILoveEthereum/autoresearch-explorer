import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '../stores/sessionStore';
import { useUiStore } from '../stores/uiStore';

export function useKeyboard() {
  const status = useSessionStore((s) => s.status);
  const sessionId = useSessionStore((s) => s.sessionId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (!sessionId) return;
          if (status === 'paused') {
            invoke('resume_session').catch(console.error);
          } else if (status !== 'stopped') {
            invoke('pause_session').catch(console.error);
          }
          break;
        case 'Escape':
          useUiStore.getState().selectNode(null);
          break;
        case 'n':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            useUiStore.getState().setShowTemplateSelector(true);
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, sessionId]);
}
