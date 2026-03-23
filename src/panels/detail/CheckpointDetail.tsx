import { invoke } from '@tauri-apps/api/core';
import type { CanvasNode } from '../../types/canvas';
import { useSessionStore } from '../../stores/sessionStore';
import { ds, STATUS_COLORS } from './detailStyles';

interface Props {
  node: CanvasNode;
}

export function CheckpointDetail({ node }: Props) {
  const f = node.fields;
  const loopIdx = (f.loop_index as number) ?? node.loopIndex;
  const verdict = f.verdict as string | undefined;
  const nodeCount = f.node_count as number | undefined;
  const edgeCount = f.edge_count as number | undefined;
  const sessionId = useSessionStore((s) => s.sessionId);

  const handleBranch = async () => {
    if (!sessionId || loopIdx == null) return;
    const apiKey = (window as Record<string, unknown>).__autoresearch_api_key as string;
    if (!apiKey) return;
    try {
      await invoke('branch_from_checkpoint', {
        sessionId,
        loopIndex: loopIdx,
        apiKey,
      });
    } catch (err) {
      console.error('Branch failed:', err);
    }
  };

  return (
    <div>
      {node.summary && <p style={ds.text}>{node.summary}</p>}

      {loopIdx != null && (
        <div style={ds.row}>
          <span style={ds.label}>Loop Index</span>
          <span style={ds.value}>{loopIdx}</span>
        </div>
      )}

      {verdict && (
        <div style={ds.row}>
          <span style={ds.label}>Verdict</span>
          <span
            style={{
              ...ds.badge,
              color: STATUS_COLORS[verdict] || '#6b7280',
              background: (STATUS_COLORS[verdict] || '#6b7280') + '18',
            }}
          >
            {verdict}
          </span>
        </div>
      )}

      {nodeCount != null && (
        <div style={ds.row}>
          <span style={ds.label}>Nodes</span>
          <span style={ds.value}>{nodeCount}</span>
        </div>
      )}

      {edgeCount != null && (
        <div style={ds.row}>
          <span style={ds.label}>Edges</span>
          <span style={ds.value}>{edgeCount}</span>
        </div>
      )}

      <button style={ds.button} onClick={handleBranch}>
        Branch from here
      </button>
    </div>
  );
}
