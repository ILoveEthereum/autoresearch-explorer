import type { CanvasNode } from '../../types/canvas';
import { ds } from './detailStyles';

interface Props {
  node: CanvasNode;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined) return '\u2014';
  return JSON.stringify(value);
}

export function GenericDetail({ node }: Props) {
  const fields = Object.entries(node.fields);

  return (
    <div>
      {node.summary && <p style={ds.text}>{node.summary}</p>}

      {fields.length > 0 && (
        <div style={ds.section}>
          <h4 style={ds.sectionTitle}>Fields</h4>
          {fields.map(([key, value]) => (
            <div key={key} style={ds.row}>
              <span style={ds.label}>{key}</span>
              <span style={{ ...ds.value, maxWidth: '65%' }}>{formatValue(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
