import type { CanvasNode } from '../../types/canvas';
import { ds } from './detailStyles';

interface Props {
  node: CanvasNode;
}

export function SourceDetail({ node }: Props) {
  const f = node.fields;
  const url = f.url as string | undefined;
  const relevance = f.relevance as number | undefined;
  const maxRelevance = 5;

  return (
    <div>
      {url && (
        <div style={ds.row}>
          <span style={ds.label}>URL</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...ds.clickableNode, fontSize: 11, maxWidth: '70%' }}
            title={url}
          >
            {url.replace(/^https?:\/\//, '').slice(0, 40)}
          </a>
        </div>
      )}

      {node.summary && <p style={ds.text}>{node.summary}</p>}

      {relevance != null && (
        <div style={ds.row}>
          <span style={ds.label}>Relevance</span>
          <span style={{ fontSize: 11, color: '#6b7280', marginRight: 4 }}>
            {relevance}/{maxRelevance}
          </span>
          <div style={{ ...ds.bar, maxWidth: 80 }}>
            <div
              style={{
                ...ds.barFill,
                width: `${(relevance / maxRelevance) * 100}%`,
                background: '#22c55e',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
