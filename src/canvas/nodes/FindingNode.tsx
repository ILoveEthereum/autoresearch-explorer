import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DefaultNodeData } from './DefaultNode';

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

export const FindingNode = memo(function FindingNode({ data, selected }: NodeProps) {
  const d = data as DefaultNodeData;
  const color = d.typeDef?.color || '#f59e0b';

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
        background: '#fffbeb',
        border: `2px solid ${selected ? '#2563eb' : color}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: '10px 12px',
        minWidth: 180,
        maxWidth: 220,
        boxShadow: selected
          ? `0 0 0 2px rgba(37, 99, 235, 0.2), 0 0 12px ${color}30`
          : `0 0 8px ${color}20, 0 1px 4px rgba(0,0,0,0.06)`,
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
            color: color,
            background: color + '18',
          }}
        >
          {d.typeDef?.label || 'Finding'}
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
  background: '#f59e0b',
  border: '1px solid #fff',
};
