import { create } from 'zustand';

export interface CanvasEntry {
  id: string;        // "main" or "tool-arxiv-scraper"
  label: string;
  type: "main" | "tool" | "branch";
  status: "active" | "building" | "ready" | "failed" | "stopped";
}

interface ProjectState {
  canvases: CanvasEntry[];
  activeCanvasId: string;
  addCanvas: (entry: CanvasEntry) => void;
  setActiveCanvas: (id: string) => void;
  updateCanvas: (id: string, updates: Partial<CanvasEntry>) => void;
  removeCanvas: (id: string) => void;
  resetCanvases: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  canvases: [{ id: 'main', label: 'Main Research', type: 'main', status: 'active' }],
  activeCanvasId: 'main',

  addCanvas: (entry) =>
    set((s) => {
      // Don't add duplicates
      if (s.canvases.some((c) => c.id === entry.id)) return s;
      return { canvases: [...s.canvases, entry] };
    }),

  setActiveCanvas: (id) => set({ activeCanvasId: id }),

  updateCanvas: (id, updates) =>
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  removeCanvas: (id) =>
    set((s) => ({
      canvases: s.canvases.filter((c) => c.id !== id),
      // Switch to main if we removed the active canvas
      activeCanvasId: s.activeCanvasId === id ? 'main' : s.activeCanvasId,
    })),

  resetCanvases: () =>
    set({
      canvases: [{ id: 'main', label: 'Main Research', type: 'main', status: 'active' }],
      activeCanvasId: 'main',
    }),
}));
