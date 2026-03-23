import type { CanvasNode } from '../../types/canvas';
import { ds, STATUS_COLORS } from './detailStyles';

interface Props {
  node: CanvasNode;
}

export function ExperimentDetail({ node }: Props) {
  const f = node.fields;
  const hypothesis = f.hypothesis as string | undefined;
  const code = f.code as string | undefined;
  const metricsBefore = f.metrics_before as Record<string, number> | undefined;
  const metricsAfter = f.metrics_after as Record<string, number> | undefined;
  const verdict = (f.verdict as string) || node.status;

  return (
    <div>
      {hypothesis && (
        <>
          <h4 style={ds.sectionTitle}>Hypothesis</h4>
          <p style={ds.text}>{hypothesis}</p>
        </>
      )}

      {code && (
        <>
          <h4 style={{ ...ds.sectionTitle, marginTop: 12 }}>Code</h4>
          <pre style={ds.codeBlock}>{code}</pre>
        </>
      )}

      {metricsBefore && metricsAfter && (
        <div style={ds.section}>
          <h4 style={ds.sectionTitle}>Metrics</h4>
          {Object.keys(metricsAfter).map((key) => {
            const before = metricsBefore[key];
            const after = metricsAfter[key];
            if (before == null || after == null) return null;
            const delta = after - before;
            const improved = delta < 0; // lower is better by default; flip if needed
            return (
              <div key={key} style={ds.row}>
                <span style={ds.label}>{key}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  {before.toFixed(2)} &rarr; {after.toFixed(2)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: improved ? '#22c55e' : '#ef4444',
                    marginLeft: 4,
                  }}
                >
                  {improved ? '\u25BC' : '\u25B2'} {Math.abs(delta).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {verdict && (
        <div style={{ marginTop: 10 }}>
          <span
            style={{
              ...ds.badge,
              color: STATUS_COLORS[verdict] || '#6b7280',
              background: (STATUS_COLORS[verdict] || '#6b7280') + '18',
            }}
          >
            {verdict}
          </span>
        </div>
      )}

      {node.summary && !hypothesis && <p style={ds.text}>{node.summary}</p>}
    </div>
  );
}
