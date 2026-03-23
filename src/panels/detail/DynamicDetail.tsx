import type { CanvasNode, NodeTypeDefinition } from '../../types/canvas';
import { ds } from './detailStyles';

interface Props {
  node: CanvasNode;
  typeDef: NodeTypeDefinition;
}

function renderFieldValue(value: unknown, fieldType: string): React.ReactNode {
  if (value === null || value === undefined) return '\u2014';

  switch (fieldType) {
    case 'code':
      return <pre style={ds.codeBlock}>{String(value)}</pre>;

    case 'url': {
      const url = String(value);
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...ds.value, color: '#3b82f6', textDecoration: 'underline', cursor: 'pointer' }}
        >
          {url.length > 40 ? url.slice(0, 40) + '\u2026' : url}
        </a>
      );
    }

    case 'list': {
      const items = Array.isArray(value) ? value : [value];
      return (
        <ul style={{ margin: '4px 0', paddingLeft: 16, fontSize: 12, color: '#374151' }}>
          {items.map((item, i) => (
            <li key={i} style={{ padding: '2px 0' }}>{String(item)}</li>
          ))}
        </ul>
      );
    }

    case 'number':
      return <span style={ds.value}>{String(value)}</span>;

    case 'text':
    default:
      return <span style={{ ...ds.value, maxWidth: '65%' }}>{String(value)}</span>;
  }
}

export function DynamicDetail({ node, typeDef }: Props) {
  return (
    <div>
      {/* Description of the type */}
      {typeDef.description && (
        <p style={{ ...ds.text, color: '#9ca3af', fontSize: 11, fontStyle: 'italic' }}>
          {typeDef.description}
        </p>
      )}

      {/* Summary */}
      {node.summary && <p style={ds.text}>{node.summary}</p>}

      {/* Typed fields from the definition */}
      {typeDef.fields.length > 0 && (
        <div style={ds.section}>
          <h4 style={ds.sectionTitle}>Fields</h4>
          {typeDef.fields.map((fieldDef) => {
            const value = node.fields[fieldDef.name];
            if (value === undefined || value === null) return null;

            // Code and list fields get full-width rendering
            if (fieldDef.field_type === 'code' || fieldDef.field_type === 'list') {
              return (
                <div key={fieldDef.name} style={{ marginBottom: 8 }}>
                  <span style={{ ...ds.label, display: 'block', marginBottom: 4 }}>
                    {fieldDef.name}
                  </span>
                  {renderFieldValue(value, fieldDef.field_type)}
                </div>
              );
            }

            return (
              <div key={fieldDef.name} style={ds.row}>
                <span style={ds.label} title={fieldDef.description}>
                  {fieldDef.name}
                </span>
                {renderFieldValue(value, fieldDef.field_type)}
              </div>
            );
          })}
        </div>
      )}

      {/* Extra fields not in the type definition */}
      {(() => {
        const definedNames = new Set(typeDef.fields.map((f) => f.name));
        const extraFields = Object.entries(node.fields).filter(([key]) => !definedNames.has(key));
        if (extraFields.length === 0) return null;

        return (
          <div style={ds.section}>
            <h4 style={ds.sectionTitle}>Additional Fields</h4>
            {extraFields.map(([key, value]) => (
              <div key={key} style={ds.row}>
                <span style={ds.label}>{key}</span>
                <span style={{ ...ds.value, maxWidth: '65%' }}>
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
