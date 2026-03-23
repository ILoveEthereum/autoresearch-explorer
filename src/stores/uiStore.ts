import { create } from 'zustand';

interface UiState {
  selectedNodeId: string | null;
  showDetailPanel: boolean;
  showTemplateSelector: boolean;
  showSettings: boolean;

  selectNode: (id: string | null) => void;
  toggleDetailPanel: () => void;
  setShowTemplateSelector: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedNodeId: null,
  showDetailPanel: false,
  showTemplateSelector: false,
  showSettings: false,

  selectNode: (id) => set({ selectedNodeId: id, showDetailPanel: id !== null }),
  toggleDetailPanel: () => set((s) => ({ showDetailPanel: !s.showDetailPanel })),
  setShowTemplateSelector: (show) => set({ showTemplateSelector: show }),
  setShowSettings: (show) => set({ showSettings: show }),
}));
