import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DefaultNodeData } from './DefaultNode';

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

export const CheckpointNode = memo(function CheckpointNode({ data, selected }: NodeProps) {
  const d = data as DefaultNodeData;
  const color = '#f97316';

  return (
    <div
      style={{
        background: '#fff7ed',
        border: `1px solid ${selected ? '#2563eb' : '#fed7aa'}`,
        borderLeft: `4px solid ${color}`,
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{'\u{1F6A9}'}</span>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#111827',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {truncate(d.label, 24)}
        </div>
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
            background: color + '15',
          }}
        >
          Checkpoint
        </span>
        {d.fields?.loopIndex != null && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 99,
              color: '#6b7280',
              background: '#f3f4f6',
            }}
          >
            L{String(d.fields.loopIndex)}
          </span>
        )}
        {d.fields?.verdict && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              padding: '2px 6px',
              borderRadius: 99,
              color: '#059669',
              background: '#ecfdf5',
            }}
          >
            {truncate(String(d.fields.verdict), 12)}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
});

const handleStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  background: '#f97316',
  border: '1px solid #fff',
};
