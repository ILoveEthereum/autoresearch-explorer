import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjectStore, type CanvasEntry } from '../stores/projectStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useSessionStore } from '../stores/sessionStore';
import { useUiStore } from '../stores/uiStore';
import type { CanvasOp } from '../types/canvas';

type Tab = 'canvases' | 'tools' | 'skills';

interface ToolManifest {
  name: string;
  description: string;
  path: string;
}

interface SkillDoc {
  name: string;
  path: string;
  created_at: string;
  times_used: number;
}

function statusDot(status: CanvasEntry['status']): React.CSSProperties {
  const colors: Record<string, string> = {
    active: '#3b82f6',
    building: '#eab308',
    ready: '#22c55e',
    failed: '#ef4444',
    stopped: '#9ca3af',
  };
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: colors[status] || '#9ca3af',
    flexShrink: 0,
  };
}

export function SkillsPanel() {
  const [tab, setTab] = useState<Tab>('canvases');

  return (
    <div style={styles.container}>
      <div style={styles.tabBar}>
        {(['canvases', 'tools', 'skills'] as Tab[]).map((t) => (
          <button
            key={t}
            style={{
              ...styles.tabBtn,
              ...(tab === t ? styles.tabBtnActive : {}),
            }}
            onClick={() => setTab(t)}
          >
            {t === 'canvases' ? 'Canvases' : t === 'tools' ? 'Tools' : 'Skills'}
          </button>
        ))}
      </div>
      <div style={styles.tabContent}>
        {tab === 'canvases' && <CanvasesTab />}
        {tab === 'tools' && <ToolsTab />}
        {tab === 'skills' && <SkillsTab />}
      </div>
    </div>
  );
}

function CanvasesTab() {
  const canvases = useProjectStore((s) => s.canvases);
  const activeCanvasId = useProjectStore((s) => s.activeCanvasId);
  const setActiveCanvas = useProjectStore((s) => s.setActiveCanvas);
  const sessionId = useSessionStore((s) => s.sessionId);
  const applyOps = useCanvasStore((s) => s.applyOps);

  const handleSwitch = async (canvasId: string) => {
    if (canvasId === activeCanvasId) return;
    setActiveCanvas(canvasId);

    if (sessionId) {
      try {
        const state = await invoke<{ canvas?: { nodes?: unknown[]; edges?: unknown[]; clusters?: unknown[] } }>('get_canvas_state', {
          sessionId,
          canvasId,
        });
        useCanvasStore.setState({ nodes: [], edges: [], clusters: [], focusNodeId: null });

        if (state?.canvas) {
          const ops: CanvasOp[] = [];
          for (const node of (state.canvas.nodes || []) as Array<Record<string, unknown>>) {
            ops.push({
              op: 'ADD_NODE',
              node: {
                id: String(node.id || ''),
                type: String(node.node_type || node.type || 'finding'),
                title: String(node.title || ''),
                summary: String(node.summary || ''),
                status: String(node.status || 'active'),
                fields: (node.fields as Record<string, unknown>) || {},
              },
            } as CanvasOp);
          }
          for (const edge of (state.canvas.edges || []) as Array<Record<string, unknown>>) {
            ops.push({
              op: 'ADD_EDGE',
              edge: {
                id: String(edge.id || `e-${edge.from}-${edge.to}`),
                from: String(edge.from || ''),
                to: String(edge.to || ''),
                type: String(edge.type || 'related'),
                label: String(edge.label || ''),
              },
            } as CanvasOp);
          }
          if (ops.length > 0) {
            applyOps(ops);
            setTimeout(() => useCanvasStore.getState().centerOnNodes(), 100);
          }
        }
      } catch (err) {
        console.error('Failed to load canvas state:', err);
      }
    }
  };

  return (
    <div style={styles.list}>
      {canvases.length === 0 && (
        <div style={styles.empty}>No canvases yet. Start a session to begin.</div>
      )}
      {canvases.map((canvas) => (
        <button
          key={canvas.id}
          style={{
            ...styles.listItem,
            ...(canvas.id === activeCanvasId ? styles.listItemActive : {}),
          }}
          onClick={() => handleSwitch(canvas.id)}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {canvas.label}
          </span>
          <span style={statusDot(canvas.status)} />
        </button>
      ))}
    </div>
  );
}

function ToolsTab() {
  const [tools, setTools] = useState<ToolManifest[]>([]);
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);
  const setDefaultApproach = useUiStore((s) => s.setDefaultApproach);

  useEffect(() => {
    const workingDir = localStorage.getItem('working_dir') || undefined;
    invoke<ToolManifest[]>('list_available_tools', { workingDir })
      .then(setTools)
      .catch(() => setTools([]));
  }, []);

  const handleBuildTool = () => {
    setDefaultApproach('tool-builder');
    setShowTemplateSelector(true);
  };

  const builtInTools = [
    { name: 'web_search', desc: 'Search the web' },
    { name: 'web_read', desc: 'Read a web page' },
    { name: 'code_executor', desc: 'Execute code' },
  ];

  return (
    <div style={styles.list}>
      <button style={styles.buildBtn} onClick={handleBuildTool}>
        + Build New Tool
      </button>

      <div style={styles.sectionTitle}>Built-in Tools</div>
      {builtInTools.map((t) => (
        <div key={t.name} style={styles.toolItem}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M3 7l3 3 5-6" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div style={styles.toolName}>{t.name}</div>
            <div style={styles.toolDesc}>{t.desc}</div>
          </div>
        </div>
      ))}

      {tools.length > 0 && (
        <>
          <div style={{ ...styles.sectionTitle, marginTop: 12 }}>Custom Tools</div>
          {tools.map((t) => (
            <div key={t.path} style={styles.toolItem}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M3 7l3 3 5-6" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <div style={styles.toolName}>{t.name}</div>
                <div style={styles.toolDesc}>{t.description}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SkillsTab() {
  const [skills, setSkills] = useState<SkillDoc[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const setShowTemplateSelector = useUiStore((s) => s.setShowTemplateSelector);
  const setDefaultApproach = useUiStore((s) => s.setDefaultApproach);

  useEffect(() => {
    invoke<SkillDoc[]>('list_skill_docs')
      .then(setSkills)
      .catch(() => setSkills([]));
  }, []);

  const handleBuildSkill = () => {
    setDefaultApproach('skill-builder');
    setShowTemplateSelector(true);
  };

  return (
    <div style={styles.list}>
      <button style={styles.buildBtn} onClick={handleBuildSkill}>
        + Build New Skill
      </button>

      {skills.length === 0 && (
        <div style={styles.empty}>
          No skill docs yet. Complete a session to generate one automatically.
        </div>
      )}
      {skills.map((s) => (
        <div key={s.path}>
          <button
            style={styles.skillItem}
            onClick={() => setExpanded(expanded === s.path ? null : s.path)}
          >
            <div style={{ flex: 1 }}>
              <div style={styles.toolName}>{s.name}</div>
              <div style={styles.toolDesc}>
                {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Unknown'} &middot; Used {s.times_used}x
              </div>
            </div>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: expanded === s.path ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
            >
              <path d="M4 2l4 4-4 4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {expanded === s.path && (
            <div style={styles.preview}>
              {s.path}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  tabBar: {
    display: 'flex',
    gap: 4,
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
    flexShrink: 0,
  },
  tabBtn: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: 6,
    background: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    color: '#9ca3af',
    fontFamily: 'inherit',
    transition: 'color 0.15s, background 0.15s',
  },
  tabBtnActive: {
    background: '#111827',
    color: '#ffffff',
  },
  tabContent: {
    flex: 1,
    overflow: 'auto',
  },
  list: {
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  empty: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    padding: '20px 8px',
    lineHeight: 1.5,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    background: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: 13,
    color: '#374151',
    fontFamily: 'inherit',
  },
  listItemActive: {
    backgroundColor: '#f3f4f6',
    fontWeight: 600,
  },
  buildBtn: {
    padding: '8px 12px',
    border: 'none',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: '#9ca3af',
    padding: '4px 0',
  },
  toolItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 0',
  },
  toolName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#111827',
  },
  toolDesc: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  skillItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 0',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  },
  preview: {
    fontSize: 11,
    color: '#6b7280',
    padding: '6px 8px',
    background: '#f9fafb',
    borderRadius: 4,
    marginBottom: 4,
    lineHeight: 1.4,
    wordBreak: 'break-all' as const,
  },
};
