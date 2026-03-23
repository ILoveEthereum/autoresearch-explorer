import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DefaultNodeData } from './DefaultNode';

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

export const DiamondNode = memo(function DiamondNode({ data, selected }: NodeProps) {
  const d = data as DefaultNodeData;
  const color = d.typeDef?.color || '#3b82f6';

  return (
    <div
      style={{
        width: 100,
        height: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, top: -3 }} />

      {/* Diamond shape */}
      <div
        style={{
          width: 80,
          height: 80,
          transform: 'rotate(45deg)',
          background: color + '12',
          border: `2px solid ${selected ? '#2563eb' : color}`,
          borderRadius: 6,
          boxShadow: selected
            ? '0 0 0 2px rgba(37, 99, 235, 0.2)'
            : '0 1px 4px rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Counter-rotate content */}
        <div
          style={{
            transform: 'rotate(-45deg)',
            textAlign: 'center',
            padding: 4,
            maxWidth: 70,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#111827',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {truncate(d.label, 24)}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -3 }} />
    </div>
  );
});

const handleStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  background: '#3b82f6',
  border: '1px solid #fff',
};
