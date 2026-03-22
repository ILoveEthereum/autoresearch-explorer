export type DetailLevel = 'far' | 'mid' | 'close';

const FAR_THRESHOLD = 0.3;
const MID_THRESHOLD = 0.7;

/**
 * Determine the detail level based on current zoom.
 */
export function getDetailLevel(zoom: number): DetailLevel {
  if (zoom < FAR_THRESHOLD) return 'far';
  if (zoom < MID_THRESHOLD) return 'mid';
  return 'close';
}
