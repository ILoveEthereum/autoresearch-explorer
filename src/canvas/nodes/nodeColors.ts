export const NODE_COLORS: Record<string, { fill: string; border: string }> = {
  completed: { fill: '#f0fdf4', border: '#22c55e' },
  active:    { fill: '#eff6ff', border: '#3b82f6' },
  failed:    { fill: '#fef2f2', border: '#ef4444' },
  queued:    { fill: '#f9fafb', border: '#9ca3af' },
  discarded: { fill: '#f3f4f6', border: '#6b7280' },
};

export const EDGE_COLORS: Record<string, string> = {
  solid_arrow:      '#9ca3af',
  red_dashed:       '#ef4444',
  green_arrow:      '#22c55e',
  blue_arrow:       '#3b82f6',
  dashed_arrow:     '#9ca3af',
  dotted_arrow:     '#9ca3af',
  red_dashed_arrow: '#ef4444',
};

export const FOCUS_COLOR = 'rgba(59, 130, 246, 0.3)';
export const SELECTION_COLOR = '#2563eb';
export const CANVAS_BG = '#fafafa';
export const TEXT_PRIMARY = '#111827';
export const TEXT_SECONDARY = '#6b7280';
export const TEXT_META = '#9ca3af';
