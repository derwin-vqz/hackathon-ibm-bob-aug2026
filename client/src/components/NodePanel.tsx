import type { NodeData } from '../types';

type Props = {
  node: NodeData;
  totalNodes: number;
};

/**
 * Side panel that appears when the user clicks a node in the graph.
 *
 * Displays:
 *   - Full file path and short filename as the header.
 *   - "Imports" count — how many files this node directly imports.
 *   - "Centrality" — percentage of other nodes this one imports
 *     (imports / (totalNodes - 1) × 100).
 *   - Insight badges: "High coupling" when imports > 5,
 *     "Leaf (no deps)" when imports === 0,
 *     "Many imports" when imports > 10.
 */
export default function NodePanel({ node, totalNodes }: Props) {
  // Centrality: fraction of all other nodes that this node imports, as a %.
  const centrality = totalNodes > 1 ? ((node.imports / (totalNodes - 1)) * 100).toFixed(1) : '0.0';
  const isHighlyCoupled = node.imports > 5;
  const isLeaf = node.imports === 0;

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      right: 16,
      width: 260,
      background: '#161b22',
      border: '1px solid #30363d',
      borderRadius: 8,
      padding: '16px',
      zIndex: 10,
    }}>
      <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4, wordBreak: 'break-all' }}>
        {node.id}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#e6edf3' }}>
        {node.label}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Metric label="Imports" value={node.imports} unit="files" />
        <Metric label="Centrality" value={`${centrality}%`} />
      </div>

      {/* Insight badges */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {isHighlyCoupled && (
          <Badge color="#f59e0b" label="⚠ High coupling" />
        )}
        {isLeaf && (
          <Badge color="#6b7280" label="Leaf (no deps)" />
        )}
        {node.imports > 10 && (
          <Badge color="#ef4444" label="Many imports" />
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      <span style={{ color: '#e6edf3', fontVariantNumeric: 'tabular-nums' }}>
        {value}{unit ? ` ${unit}` : ''}
      </span>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      background: `${color}22`,
      border: `1px solid ${color}55`,
      color,
      borderRadius: 4,
      padding: '2px 7px',
      fontSize: 11,
    }}>
      {label}
    </span>
  );
}
