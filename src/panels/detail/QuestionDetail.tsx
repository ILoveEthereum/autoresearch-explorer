import type { CanvasNode, CanvasEdge } from '../../types/canvas';
import { useCanvasStore } from '../../stores/canvasStore';
import { useUiStore } from '../../stores/uiStore';
import { ds, STATUS_COLORS } from './detailStyles';

interface Props {
  node: CanvasNode;
  edges: CanvasEdge[];
}

export function QuestionDetail({ node, edges }: Props) {
  const f = node.fields;
  const questionText = (f.text as string) || node.summary;
  const questionStatus = (f.status as string) || node.status;
  const subQuestions = f.sub_questions as string[] | undefined;
  const nodes = useCanvasStore((s) => s.nodes);
  const selectNode = useUiStore((s) => s.selectNode);

  // Find connected findings
  const findingEdges = edges.filter(
    (e) => e.to === node.id && (e.type === 'answers' || e.type === 'partially_answers')
  );
  const findingNodes = findingEdges
    .map((e) => nodes.find((n) => n.id === e.from))
    .filter(Boolean) as CanvasNode[];

  return (
    <div>
      {questionText && <p style={ds.largeText}>{questionText}</p>}

      <span
        style={{
          ...ds.badge,
          color: STATUS_COLORS[questionStatus] || '#6b7280',
          background: (STATUS_COLORS[questionStatus] || '#6b7280') + '18',
        }}
      >
        {questionStatus}
      </span>

      {subQuestions && subQuestions.length > 0 && (
        <div style={ds.section}>
          <h4 style={ds.sectionTitle}>Sub-questions</h4>
          {subQuestions.map((sq, i) => (
            <div key={i} style={ds.listItem}>
              <span style={{ color: '#22c55e', fontSize: 14 }}>&#10003;</span>
              <span>{sq}</span>
            </div>
          ))}
        </div>
      )}

      {findingNodes.length > 0 && (
        <div style={ds.section}>
          <h4 style={ds.sectionTitle}>Connected Findings</h4>
          {findingNodes.map((fn_) => (
            <div key={fn_.id} style={ds.listItem}>
              <span style={{ color: '#f59e0b' }}>&#9679;</span>
              <span
                style={ds.clickableNode}
                onClick={() => selectNode(fn_.id)}
              >
                {fn_.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
