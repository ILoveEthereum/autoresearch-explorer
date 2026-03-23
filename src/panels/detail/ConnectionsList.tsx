import type { CanvasNode, CanvasEdge } from '../../types/canvas';
import { useCanvasStore } from '../../stores/canvasStore';
import { useUiStore } from '../../stores/uiStore';
import { ds } from './detailStyles';

interface Props {
  node: CanvasNode;
  edges: CanvasEdge[];
}

export function ConnectionsList({ node, edges }: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectNode = useUiStore((s) => s.selectNode);
  const setViewport = useCanvasStore((s) => s.setViewport);

  const incoming = edges.filter((e) => e.to === node.id);
  const outgoing = edges.filter((e) => e.from === node.id);

  if (incoming.length === 0 && outgoing.length === 0) return null;

  const navigateTo = (id: string) => {
    const target = nodes.find((n) => n.id === id);
    if (target) {
      setViewport({ x: target.position.x, y: target.position.y });
    }
    selectNode(id);
  };

  return (
    <div style={ds.section}>
      <h4 style={ds.sectionTitle}>Connections</h4>
      {incoming.map((e) => {
        const from = nodes.find((n) => n.id === e.from);
        return (
          <div key={e.id} style={connStyles.row}>
            <span style={connStyles.arrow}>&larr;</span>
            <span style={ds.clickableNode} onClick={() => navigateTo(e.from)}>
              {from?.title || e.from}
            </span>
            <span style={connStyles.type}>{e.type}</span>
          </div>
        );
      })}
      {outgoing.map((e) => {
        const to = nodes.find((n) => n.id === e.to);
        return (
          <div key={e.id} style={connStyles.row}>
            <span style={connStyles.arrow}>&rarr;</span>
            <span style={ds.clickableNode} onClick={() => navigateTo(e.to)}>
              {to?.title || e.to}
            </span>
            <span style={connStyles.type}>{e.type}</span>
          </div>
        );
      })}
    </div>
  );
}

const connStyles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 0',
    fontSize: 12,
  },
  arrow: {
    color: '#9ca3af',
    fontSize: 14,
    flexShrink: 0,
  },
  type: {
    color: '#9ca3af',
    fontSize: 10,
    flexShrink: 0,
    marginLeft: 'auto',
  },
};
