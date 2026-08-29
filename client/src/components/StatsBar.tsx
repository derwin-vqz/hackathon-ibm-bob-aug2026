import type { GraphData } from '../types';

type Props = {
  graph: GraphData;
};

/**
 * Thin stats bar rendered below the header once a graph has been loaded.
 *
 * Shows at a glance:
 *   - Total file count and dependency (edge) count.
 *   - The node with the highest import count ("Most imported").
 *   - Number of highly-coupled nodes (imports > 5) — shown with a warning.
 *   - Number of isolated nodes (imports === 0, i.e. leaf files with no deps).
 *   - A truncation notice when the repo exceeded the 200-file cap.
 */
export default function StatsBar({ graph }: Props) {
  const { nodes, edges, truncated } = graph;

  // Node with the most outgoing imports — sorted descending, first element wins.
  const mostImported = [...nodes].sort((a, b) => b.imports - a.imports)[0];

  // Nodes that import more than 5 other files — potential coupling hotspots.
  const highlyCoupled = nodes.filter((n) => n.imports > 5).length;

  // Nodes that import nothing — leaf files with no outgoing dependencies.
  const isolated = nodes.filter((n) => n.imports === 0).length;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      padding: '8px 20px',
      background: '#161b22',
      borderBottom: '1px solid #30363d',
      fontSize: 12,
      flexWrap: 'wrap',
    }}>
      <Stat label="Files" value={nodes.length} />
      <Stat label="Dependencies" value={edges.length} />
      {mostImported && (
        <Stat label="Most imported" value={mostImported.label} />
      )}
      {highlyCoupled > 0 && (
        <Stat label="⚠ High coupling" value={highlyCoupled} color="#f59e0b" />
      )}
      {isolated > 0 && (
        <Stat label="Isolated" value={isolated} color="#6b7280" />
      )}
      {truncated && (
        <span style={{ color: '#f59e0b', marginLeft: 'auto' }}>
          ⚠ Large repo — showing first 200 files
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span style={{ color: '#8b949e' }}>{label}:</span>
      <span style={{ color: color ?? '#e6edf3', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}
