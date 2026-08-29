import type { GraphData } from '../types';

type Props = {
  graph: GraphData;
};

/**
 * Top bar showing stats for the full graph.
 * Detects and surfaces basic modernization insights.
 */
export default function StatsBar({ graph }: Props) {
  const { nodes, edges, truncated } = graph;

  // Most imported node (highest centrality)
  const mostImported = [...nodes].sort((a, b) => b.importedBy - a.importedBy)[0];

  // Highly coupled nodes (imported by more than 5 files)
  const highlyCoupled = nodes.filter((n) => n.importedBy > 5).length;

  // Isolated nodes (neither import nor are imported by anything)
  const isolated = nodes.filter((n) => n.imports === 0 && n.importedBy === 0).length;

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
