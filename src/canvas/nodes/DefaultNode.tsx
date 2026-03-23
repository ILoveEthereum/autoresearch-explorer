import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeTypeDefinition } from '../../types/canvas';
import { NODE_COLORS } from './nodeColors';

export interface DefaultNodeData {
  label: string;
  summary: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'discarded';
  fields: Record<string, unknown>;
  nodeType: string;
  typeDef?: NodeTypeDefinition;
  [key: string]: unknown;
}

function getColors(
  status: string,
  typeDef?: NodeTypeDefinition
): { fill: string; border: string; accent: string } {
  if (typeDef) {
    const c = typeDef.color;
    if (c.startsWith('#')) {
      return { fill: '#ffffff', border: '#e5e7eb', accent: c };
    }
    const m = c.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
    if (m) {
      return { fill: '#ffffff', border: '#e5e7eb', accent: c };
    }
  }
  const nc = NODE_COLORS[status] || NODE_COLORS.queued;
  return { fill: '#ffffff', border: '#e5e7eb', accent: nc.border };
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

export const DefaultNode = memo(function DefaultNode({ data, selected }: NodeProps) {
  const d = data as DefaultNodeData;
  const colors = getColors(d.status, d.typeDef);
  const typeLabel = d.typeDef?.label || d.nodeType;

  const STATUS_COLORS: Record<string, string> = {
    completed: '#22c55e',
    active: '#3b82f6',
    failed: '#ef4444',
    queued: '#9ca3af',
    discarded: '#6b7280',
  };
  const statusColor = STATUS_COLORS[d.status] || '#9ca3af';

  return (
    <div
      style={{
        background: colors.fill,
        border: `1px solid ${selected ? '#2563eb' : colors.border}`,
        borderLeft: `4px solid ${colors.accent}`,
        borderRadius: 8,
        padding: '10px 12px',
        minWidth: 180,
        maxWidth: 220,
        boxShadow: selected
          ? '0 0 0 2px rgba(37, 99, 235, 0.2), 0 2px 8px rgba(0,0,0,0.08)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />

      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#111827',
          lineHeight: 1.3,
          marginBottom: d.summary ? 4 : 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {truncate(d.label, 28)}
      </div>

      {d.summary && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: '#6b7280',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 6,
          }}
        >
          {truncate(d.summary, 40)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            padding: '2px 6px',
            borderRadius: 99,
            color: colors.accent,
            background: colors.accent + '15',
          }}
        >
          {typeLabel}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            padding: '2px 6px',
            borderRadius: 99,
            color: statusColor,
            background: statusColor + '15',
          }}
        >
          {d.status}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
});

const handleStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  background: '#94a3b8',
  border: '1px solid #fff',
};
