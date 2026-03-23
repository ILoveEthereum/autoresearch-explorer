import type { CanvasNode, CanvasEdge } from '../../types/canvas';
import { useCanvasStore } from '../../stores/canvasStore';
import { useUiStore } from '../../stores/uiStore';
import { ds } from './detailStyles';

interface Props {
  node: CanvasNode;
  edges: CanvasEdge[];
}

export function FindingDetail({ node, edges }: Props) {
  const f = node.fields;
  const claim = (f.claim as string) || node.summary;
  const confidence = f.confidence as number | undefined;
  const maxConfidence = 5;
  const nodes = useCanvasStore((s) => s.nodes);
  const selectNode = useUiStore((s) => s.selectNode);

  // Find supporting sources through edges
  const supportingEdges = edges.filter(
    (e) => e.to === node.id && (e.type === 'supports' || e.type === 'evidence')
  );
  const supportingNodes = supportingEdges
    .map((e) => nodes.find((n) => n.id === e.from))
    .filter(Boolean) as CanvasNode[];

  return (
    <div>
      {claim && <p style={ds.largeText}>{claim}</p>}

      {confidence != null && (
        <div style={ds.row}>
          <span style={ds.label}>Confidence</span>
          <span style={{ fontSize: 11, color: '#6b7280', marginRight: 4 }}>
            {confidence}/{maxConfidence}
          </span>
          <div style={{ ...ds.bar, maxWidth: 80 }}>
            <div
              style={{
                ...ds.barFill,
                width: `${(confidence / maxConfidence) * 100}%`,
                background: '#f59e0b',
              }}
            />
          </div>
        </div>
      )}

      {supportingNodes.length > 0 && (
        <div style={ds.section}>
          <h4 style={ds.sectionTitle}>Supporting Sources</h4>
          {supportingNodes.map((src) => (
            <div key={src.id} style={ds.listItem}>
              <span style={{ color: '#22c55e' }}>&#9679;</span>
              <span
                style={ds.clickableNode}
                onClick={() => selectNode(src.id)}
              >
                {src.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
