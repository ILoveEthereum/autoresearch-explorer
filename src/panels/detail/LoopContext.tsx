import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CanvasNode } from '../../types/canvas';
import { useSessionStore } from '../../stores/sessionStore';
import { ds } from './detailStyles';

interface Props {
  node: CanvasNode;
}

interface LoopData {
  loop_index: number;
  process: string;
  results: string;
  explanation: string;
}

export function LoopContext({ node }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<LoopData | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionId = useSessionStore((s) => s.sessionId);

  const loopIndex = node.loopIndex ?? (node.fields?.loop_index as number | undefined);

  useEffect(() => {
    if (!expanded || !sessionId || !loopIndex || data) return;
    setLoading(true);
    invoke<LoopData>('get_loop_detail', { sessionId, loopIndex })
      .then(setData)
      .catch((err) => console.error('Failed to fetch loop detail:', err))
      .finally(() => setLoading(false));
  }, [expanded, sessionId, loopIndex, data]);

  return (
    <div style={ds.section}>
      {/* Summary — always show if available */}
      {node.summary && node.summary !== node.title && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ ...ds.label, fontSize: 10 }}>Summary</span>
          <p style={{ ...ds.text, fontSize: 12, lineHeight: 1.5 }}>{node.summary}</p>
        </div>
      )}

      {/* Fields — always show if any exist */}
      {node.fields && Object.keys(node.fields).length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ ...ds.label, fontSize: 10 }}>Details</span>
          {Object.entries(node.fields).map(([key, value]) => {
            if (key === 'loop_index') return null;
            const strVal = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
            if (!strVal) return null;
            return (
              <div key={key} style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const }}>
                  {key.replace(/_/g, ' ')}
                </span>
                {strVal.length > 80 || strVal.includes('\n') ? (
                  <pre style={{ ...ds.codeBlock, fontSize: 11, margin: '2px 0', whiteSpace: 'pre-wrap' as const }}>
                    {strVal}
                  </pre>
                ) : (
                  <p style={{ ...ds.text, fontSize: 12, margin: '2px 0' }}>{strVal}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Loop context — expandable if loop index is known */}
      {loopIndex != null && (
        <div>
          <div
            style={accordionStyles.header}
            onClick={() => setExpanded(!expanded)}
          >
            <span
              style={{
                ...accordionStyles.chevron,
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              &#9654;
            </span>
            <h4 style={{ ...ds.sectionTitle, margin: 0 }}>Agent Reasoning (Loop {loopIndex})</h4>
          </div>

          {expanded && (
            <div style={accordionStyles.body}>
              {loading && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Loading...</span>
              )}

              {data?.process && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ ...ds.label, fontSize: 10 }}>Process</span>
                  <pre style={{ ...ds.codeBlock, fontSize: 11, whiteSpace: 'pre-wrap' as const, maxHeight: 200, overflow: 'auto' }}>
                    {data.process}
                  </pre>
                </div>
              )}

              {data?.results && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ ...ds.label, fontSize: 10 }}>Tool Results</span>
                  <pre style={{ ...ds.codeBlock, fontSize: 11, whiteSpace: 'pre-wrap' as const, maxHeight: 200, overflow: 'auto' }}>
                    {data.results}
                  </pre>
                </div>
              )}

              {data?.explanation && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ ...ds.label, fontSize: 10 }}>Explanation</span>
                  <pre style={{ ...ds.codeBlock, fontSize: 11, whiteSpace: 'pre-wrap' as const, maxHeight: 200, overflow: 'auto' }}>
                    {data.explanation}
                  </pre>
                </div>
              )}

              {!loading && !data?.process && !data?.results && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>No loop details available</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const accordionStyles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    userSelect: 'none',
    marginTop: 8,
  },
  chevron: {
    fontSize: 8,
    color: '#9ca3af',
    transition: 'transform 0.15s ease',
    flexShrink: 0,
  },
  body: {
    marginTop: 8,
    paddingLeft: 14,
  },
};
