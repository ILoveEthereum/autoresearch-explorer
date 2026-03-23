import { create } from 'zustand';

export type ActivePanel = 'home' | 'canvas' | 'chat' | 'skills' | 'integrations' | 'settings' | null;

interface UiState {
  selectedNodeId: string | null;
  showDetailPanel: boolean;
  showTemplateSelector: boolean;
  showSettings: boolean;
  activePanel: ActivePanel;
  defaultApproach: string | null;

  selectNode: (id: string | null) => void;
  toggleDetailPanel: () => void;
  setShowTemplateSelector: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setActivePanel: (panel: ActivePanel) => void;
  setDefaultApproach: (approach: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedNodeId: null,
  showDetailPanel: false,
  showTemplateSelector: false,
  showSettings: false,
  activePanel: null,
  defaultApproach: null,

  selectNode: (id) => set({ selectedNodeId: id, showDetailPanel: id !== null }),
  toggleDetailPanel: () => set((s) => ({ showDetailPanel: !s.showDetailPanel })),
  setShowTemplateSelector: (show) => set({ showTemplateSelector: show }),
  setShowSettings: (show) => set({ showSettings: show, activePanel: show ? 'settings' : null }),
  setActivePanel: (panel) => set({ activePanel: panel, showSettings: panel === 'settings' }),
  setDefaultApproach: (approach) => set({ defaultApproach: approach }),
}));
