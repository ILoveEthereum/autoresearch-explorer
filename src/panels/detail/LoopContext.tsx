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

  const loopIndex = node.loopIndex ?? (node.fields.loop_index as number | undefined);
  if (loopIndex == null) return null;

  useEffect(() => {
    if (!expanded || !sessionId || data) return;
    setLoading(true);
    invoke<LoopData>('get_loop_detail', { sessionId, loopIndex })
      .then(setData)
      .catch((err) => console.error('Failed to fetch loop detail:', err))
      .finally(() => setLoading(false));
  }, [expanded, sessionId, loopIndex, data]);

  // Extract reasoning from process markdown (between "## Reasoning" and end)
  const reasoning = data?.process
    ? extractSection(data.process, '## Reasoning')
    : null;

  // Extract tool calls from results markdown
  const toolCalls = data?.results
    ? extractToolCalls(data.results)
    : [];

  return (
    <div style={ds.section}>
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
        <h4 style={{ ...ds.sectionTitle, margin: 0 }}>Loop {loopIndex}</h4>
      </div>

      {expanded && (
        <div style={accordionStyles.body}>
          {loading && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Loading...</span>
          )}

          {reasoning && (
            <div style={{ marginBottom: 10 }}>
              <span style={{ ...ds.label, fontSize: 10 }}>Reasoning</span>
              <p style={{ ...ds.text, fontSize: 12 }}>
                {reasoning.slice(0, 500)}
                {reasoning.length > 500 ? '...' : ''}
              </p>
            </div>
          )}

          {toolCalls.length > 0 && (
            <div>
              <span style={{ ...ds.label, fontSize: 10 }}>Tool Calls</span>
              {toolCalls.map((tc, i) => (
                <div key={i} style={accordionStyles.toolCall}>
                  <span style={{ fontWeight: 600, fontSize: 11, color: '#111827' }}>
                    {tc.name}
                  </span>
                  {tc.output && (
                    <pre style={{ ...ds.codeBlock, fontSize: 10, maxHeight: 100, margin: '4px 0' }}>
                      {tc.output.slice(0, 300)}
                      {tc.output.length > 300 ? '...' : ''}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !reasoning && toolCalls.length === 0 && data && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>No details available</span>
          )}
        </div>
      )}
    </div>
  );
}

function extractSection(md: string, heading: string): string | null {
  const idx = md.indexOf(heading);
  if (idx === -1) return null;
  const start = idx + heading.length;
  const nextHeading = md.indexOf('\n#', start);
  const text = nextHeading === -1 ? md.slice(start) : md.slice(start, nextHeading);
  return text.trim() || null;
}

interface ToolCallInfo {
  name: string;
  output: string | null;
}

function extractToolCalls(md: string): ToolCallInfo[] {
  const calls: ToolCallInfo[] = [];
  const regex = /### (.+)\n/g;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const name = match[1].trim();
    // Try to grab output section
    const afterMatch = md.slice(match.index + match[0].length);
    const outputMatch = afterMatch.match(/\*\*Output:\*\*\n```\n([\s\S]*?)```/);
    calls.push({
      name,
      output: outputMatch ? outputMatch[1].trim() : null,
    });
  }
  return calls;
}

const accordionStyles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    userSelect: 'none',
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
  toolCall: {
    padding: '4px 0',
    borderBottom: '1px solid #f9fafb',
  },
};
