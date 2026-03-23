import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSessionStore } from '../stores/sessionStore';
import { useCanvasStore } from '../stores/canvasStore';
import type { CanvasOp } from '../types/canvas';

interface CheckpointInfo {
  loop_index: number;
  created_at: string;
  verdict: Record<string, unknown>;
  node_count: number;
  edge_count: number;
}

export function HistorySlider() {
  const loopCount = useSessionStore((s) => s.loopCount);
  const sessionId = useSessionStore((s) => s.sessionId);
  const [viewLoop, setViewLoop] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);

  const displayLoop = viewLoop ?? loopCount;
  const isLive = viewLoop === null || viewLoop === loopCount;

  // Load checkpoints when session changes or new checkpoint is created
  useEffect(() => {
    if (!sessionId) {
      setCheckpoints([]);
      return;
    }

    const loadCheckpoints = async () => {
      try {
        const cps = await invoke<CheckpointInfo[]>('list_checkpoints', { sessionId });
        setCheckpoints(cps);
      } catch {
        // Session may not have checkpoints yet
      }
    };

    loadCheckpoints();

    const unlisten = listen('checkpoint-created', () => {
      loadCheckpoints();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [sessionId, loopCount]);

  const scrubTo = useCallback(async (targetLoop: number) => {
    if (!sessionId || loading) return;

    if (targetLoop === loopCount) {
      // Return to live — the next canvas-ops event will restore
      setViewLoop(null);
      return;
    }

    setViewLoop(targetLoop);
    setLoading(true);

    try {
      // Replay canvas ops from loop 1 to targetLoop
      useCanvasStore.setState({ nodes: [], edges: [], clusters: [], focusNodeId: null });

      for (let i = 1; i <= targetLoop; i++) {
        const ops = await invoke<CanvasOp[]>('get_loop_ops', {
          sessionId,
          loopIndex: i,
        });
        if (ops && ops.length > 0) {
          useCanvasStore.getState().applyOps(ops);
        }
      }
    } catch (err) {
      console.error('Failed to scrub history:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, loopCount, loading]);

  if (loopCount < 2) return null;

  // Compute checkpoint positions as percentages along the slider
  const checkpointMarkers = checkpoints
    .filter((cp) => cp.loop_index >= 1 && cp.loop_index <= loopCount)
    .map((cp) => ({
      loop_index: cp.loop_index,
      pct: ((cp.loop_index - 1) / (loopCount - 1)) * 100,
    }));

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <span style={styles.label}>History</span>
        <div style={styles.sliderWrapper}>
          <input
            type="range"
            min={1}
            max={loopCount}
            value={displayLoop}
            style={styles.slider}
            onChange={(e) => scrubTo(Number(e.target.value))}
          />
          {/* Diamond markers for checkpoints */}
          {checkpointMarkers.map((m) => (
            <div
              key={m.loop_index}
              title={`Checkpoint @ Loop ${m.loop_index}`}
              onClick={() => scrubTo(m.loop_index)}
              style={{
                ...styles.diamond,
                left: `calc(${m.pct}% + 2px)`,
              }}
            />
          ))}
        </div>
        <span style={styles.count}>
          {loading ? '...' : `Loop ${displayLoop}`}
        </span>
        {!isLive && (
          <button style={styles.liveBtn} onClick={() => scrubTo(loopCount)}>
            Live
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
  },
  inner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 16px',
    background: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
    backdropFilter: 'blur(8px)',
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  sliderWrapper: {
    position: 'relative' as const,
    width: 200,
    height: 20,
    display: 'flex',
    alignItems: 'center',
  },
  slider: {
    width: 200,
    accentColor: '#3b82f6',
    cursor: 'pointer',
  },
  diamond: {
    position: 'absolute' as const,
    top: -2,
    width: 8,
    height: 8,
    background: '#f59e0b',
    transform: 'rotate(45deg)',
    cursor: 'pointer',
    zIndex: 2,
    border: '1px solid #d97706',
    pointerEvents: 'auto' as const,
  },
  count: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    minWidth: 55,
  },
  liveBtn: {
    padding: '3px 10px',
    border: 'none',
    borderRadius: 4,
    background: '#22c55e',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  },
};
