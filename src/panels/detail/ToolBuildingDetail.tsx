import type { CanvasNode } from '../../types/canvas';
import { ds, STATUS_COLORS } from './detailStyles';

interface Props {
  node: CanvasNode;
}

export function ToolBuildingDetail({ node }: Props) {
  const f = node.fields;
  const toolName = (f.tool_name as string) || (f.name as string);
  const toolStatus = (f.tool_status as string) || node.status;
  const testResults = f.test_results as string | undefined;
  const canvasId = f.canvas_id as string | undefined;

  return (
    <div>
      {toolName && (
        <div style={ds.row}>
          <span style={ds.label}>Tool</span>
          <span style={{ ...ds.value, fontWeight: 600 }}>{toolName}</span>
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        <span
          style={{
            ...ds.badge,
            color: STATUS_COLORS[toolStatus] || '#6b7280',
            background: (STATUS_COLORS[toolStatus] || '#6b7280') + '18',
          }}
        >
          {toolStatus}
        </span>
      </div>

      {node.summary && <p style={ds.text}>{node.summary}</p>}

      {testResults && (
        <div style={ds.section}>
          <h4 style={ds.sectionTitle}>Test Results</h4>
          <pre style={ds.codeBlock}>{testResults}</pre>
        </div>
      )}

      {canvasId && (
        <button
          style={ds.button}
          onClick={() => {
            // Could dispatch an event to switch canvas view
            console.log('Switch to canvas:', canvasId);
          }}
        >
          View Canvas
        </button>
      )}
    </div>
  );
}
