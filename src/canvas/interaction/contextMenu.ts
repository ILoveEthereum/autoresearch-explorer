import { invoke } from '@tauri-apps/api/core';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}

export function createContextMenuState(): ContextMenuState {
  return { visible: false, x: 0, y: 0, nodeId: null };
}

export async function handleSignal(type: string, nodeId: string) {
  try {
    await invoke('send_signal', { signalType: type, nodeId });
  } catch (err) {
    console.error(`Failed to send ${type} signal:`, err);
  }
}
