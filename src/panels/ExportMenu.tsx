import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useCanvasStore } from '../stores/canvasStore';
import { useSessionStore } from '../stores/sessionStore';

export function ExportMenu() {
  const [show, setShow] = useState(false);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const sessionName = useSessionStore((s) => s.sessionName);

  const slug = (sessionName || 'autoresearch').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const exportJSON = async () => {
    const data = {
      name: sessionName,
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
    };
    try {
      const path = await invoke<string>('export_file', {
        filename: `${slug}-export.json`,
        content: JSON.stringify(data, null, 2),
      });
      alert(`Exported to ${path}`);
    } catch (err) {
      alert(`Export failed: ${err}`);
    }
    setShow(false);
  };

  const exportMarkdown = async () => {
    let md = `# ${sessionName || 'Research'} — Export\n\n`;
    md += `**Exported:** ${new Date().toLocaleString()}\n`;
    md += `**Nodes:** ${nodes.length} | **Edges:** ${edges.length}\n\n---\n\n`;

    const byType = new Map<string, typeof nodes>();
    for (const node of nodes) {
      const list = byType.get(node.type) || [];
      list.push(node);
      byType.set(node.type, list);
    }

    for (const [type, typeNodes] of byType) {
      md += `## ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
      for (const node of typeNodes) {
        md += `### ${node.title}\n\n`;
        if (node.summary) md += `${node.summary}\n\n`;
        if (Object.keys(node.fields).length > 0) {
          for (const [key, value] of Object.entries(node.fields)) {
            md += `- **${key}:** ${String(value)}\n`;
          }
          md += '\n';
        }
      }
    }

    try {
      const path = await invoke<string>('export_file', {
        filename: `${slug}-report.md`,
        content: md,
      });
      alert(`Exported to ${path}`);
    } catch (err) {
      alert(`Export failed: ${err}`);
    }
    setShow(false);
  };

  if (nodes.length === 0) return null;

  return (
    <div style={styles.wrapper}>
      <button style={styles.btn} onClick={() => setShow(!show)}>
        Export
      </button>
      {show && (
        <>
          <div style={styles.overlay} onClick={() => setShow(false)} />
          <div style={styles.menu}>
            <button style={styles.menuItem} onClick={exportJSON}>
              JSON (raw data)
            </button>
            <button style={styles.menuItem} onClick={exportMarkdown}>
              Markdown (report)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
  },
  btn: {
    padding: '6px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 98,
  },
  menu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
    padding: '4px 0',
    minWidth: 160,
    zIndex: 99,
  },
  menuItem: {
    display: 'block',
    width: '100%',
    padding: '8px 14px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
    textAlign: 'left' as const,
  },
};
