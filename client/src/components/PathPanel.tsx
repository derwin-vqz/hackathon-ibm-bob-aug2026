import type { NodeData } from '../types';

type Props = {
  sourceNode: NodeData | null;
  targetNode: NodeData | null;
  /** null = not yet computed; 0 = computed, no path found; >0 = paths found */
  pathCount: number | null;
};

/**
 * Panel shown in the top-left of the graph area while either spider is placed.
 *
 * States:
 *   - One spider placed, other not: prompt to place the second.
 *   - Both placed, pathCount null: should not occur in practice.
 *   - Both placed, pathCount 0: "No directed path" message.
 *   - Both placed, pathCount > 0: shows how many paths were found.
 */
export default function PathPanel({ sourceNode, targetNode, pathCount }: Props) {
  if (!sourceNode && !targetNode) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 16,
      width: 220,
      background: '#161b22',
      border: '1px solid #30363d',
      borderRadius: 8,
      padding: '14px 16px',
      zIndex: 10,
      fontSize: 12,
    }}>
      <div style={{ color: '#8b949e', marginBottom: 8, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Path Finder
      </div>

      <Row label="🕷 Source" value={sourceNode?.label ?? <Placeholder />} />
      <Row label="🕸 Target" value={targetNode?.label ?? <Placeholder />} />

      {sourceNode && targetNode && pathCount !== null && (
        <div style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid #30363d',
          color: pathCount === 0 ? '#f85149' : '#3fb950',
          fontWeight: 600,
        }}>
          {pathCount === 0
            ? '✗ No directed path'
            : `✓ ${pathCount} path${pathCount === 1 ? '' : 's'} found`}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
      <span style={{ color: '#8b949e', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function Placeholder() {
  return <span style={{ color: '#484f58', fontStyle: 'italic' }}>drag spider here</span>;
}
