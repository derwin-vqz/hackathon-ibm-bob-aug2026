import { useEffect, useRef, useState } from 'react';
import GraphView, { ZoomControls } from './components/GraphView';
import type { GraphViewHandle } from './components/GraphView';
import NodePanel from './components/NodePanel';
import PathPanel from './components/PathPanel';
import StatsBar from './components/StatsBar';
import type { GraphData, NodeData } from './types';
import { findAllPaths } from './utils/findAllPaths';

/** Four-state machine for the analysis lifecycle. */
type Status = 'idle' | 'loading' | 'done' | 'error';

/**
 * Derived highlight data passed to GraphView once path-finding has run.
 * `nodeIds` — IDs of every node that belongs to at least one found path.
 * `edgeKeys` — "source->target" strings for every edge on a found path.
 */
type PathHighlight = { nodeIds: Set<string>; edgeKeys: Set<string> };

/**
 * Root application component.
 *
 * Owns all top-level state and orchestrates the three main panels:
 *   - Header with the repo URL input and optional GitHub token.
 *   - StatsBar (global graph metrics).
 *   - Main area: GraphView canvas + NodePanel + PathPanel + ZoomControls.
 *
 * The spider path-finder feature works as follows:
 *   1. The user right-clicks a node in GraphView and picks "Set as source"
 *      or "Set as target" from the context menu.
 *   2. App stores the selected node IDs as `sourceNodeId` / `targetNodeId`.
 *   3. A `useEffect` reacts to both IDs changing, calls `findAllPaths`, and
 *      derives `pathHighlight` from the result.
 *   4. `pathHighlight` is forwarded to GraphView, which applies the
 *      `path-highlight` CSS class and runs the animated dash effect.
 *   5. PathPanel shows the outcome (paths found / no path) in the top-left.
 */
export default function App() {
  /** Repository URL typed by the user. */
  const [repoUrl, setRepoUrl] = useState('');
  /** Optional GitHub Personal Access Token — raises the API rate limit. */
  const [token, setToken] = useState('');
  /** Whether the token input field is currently visible. */
  const [showToken, setShowToken] = useState(false);
  /** Current analysis state machine phase. */
  const [status, setStatus] = useState<Status>('idle');
  /** The graph returned by the last successful `/api/repo` call. */
  const [graph, setGraph] = useState<GraphData | null>(null);
  /** The node the user last clicked in the graph (drives NodePanel). */
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  /** Human-readable error message shown when `status === 'error'`. */
  const [errorMsg, setErrorMsg] = useState('');

  /** ID of the node placed as the path-finder source (white spider). null = unplaced. */
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
  /** ID of the node placed as the path-finder target (yellow spider). null = unplaced. */
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  /** Computed path highlight data; null means path-finding has not run yet. */
  const [pathHighlight, setPathHighlight] = useState<PathHighlight | null>(null);

  /** Ref to the live Cytoscape instance, lifted from GraphView via forwardRef. */
  const graphViewRef = useRef<GraphViewHandle>(null);

  /**
   * Initiates a new analysis: resets all state, then calls `/api/repo`.
   * On success, stores the returned `GraphData.shape` in `graph` and
   * transitions to `'done'`.  On failure, stores the error message and
   * transitions to `'error'`.
   */
  async function handleAnalyze() {
    if (!repoUrl.trim()) return;
    setStatus('loading');
    setGraph(null);
    setSelectedNode(null);
    setErrorMsg('');
    // Reset spider state when loading a new graph.
    setSourceNodeId(null);
    setTargetNodeId(null);
    setPathHighlight(null);

    try {
      const params = new URLSearchParams({ repo: repoUrl.trim() });
      if (token.trim()) params.set('token', token.trim());

      const res = await fetch(`/api/repo?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Unknown error');
      
      setGraph(data.shape as GraphData);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  /**
   * Recomputes path highlights whenever either spider ID or the active graph
   * changes.  Calls `findAllPaths` and converts the returned path arrays into
   * the flat `{ nodeIds, edgeKeys }` structure expected by GraphView.
   *
   * Sets `pathHighlight` to `{ nodeIds: empty, edgeKeys: empty }` (not null)
   * when a path-finding run yields zero results, so PathPanel can distinguish
   * "not computed yet" from "computed but no path found".
   */
  useEffect(() => {
    if (!graph || !sourceNodeId || !targetNodeId) {
      setPathHighlight(null);
      return;
    }

    const paths = findAllPaths(graph.edges, sourceNodeId, targetNodeId);

    if (paths.length === 0) {
      // Signal "computed, no path" without any highlight.
      setPathHighlight({ nodeIds: new Set(), edgeKeys: new Set() });
      return;
    }

    const nodeIds = new Set<string>();
    const edgeKeys = new Set<string>();

    for (const path of paths) {
      for (let i = 0; i < path.length; i++) {
        nodeIds.add(path[i]);
        if (i + 1 < path.length) {
          edgeKeys.add(`${path[i]}->${path[i + 1]}`);
        }
      }
    }

    setPathHighlight({ nodeIds, edgeKeys });
  }, [sourceNodeId, targetNodeId, graph]);

  /**
   * Derives the numeric path count to display in PathPanel.
   * - `null`  — path-finding has not yet run (one or both spiders unplaced).
   * - `0`     — path-finding ran but found no directed path.
   * - `>0`    — rough count: number of edge-keys + 1 (approximation for display).
   */
  const pathCount =
    pathHighlight === null && sourceNodeId && targetNodeId
      ? null
      : pathHighlight
        ? pathHighlight.nodeIds.size === 0
          ? 0
          : pathHighlight.edgeKeys.size + 1  // rough approximation for display
        : null;

  /** Full NodeData for the placed source spider — used by PathPanel for the label. */
  const sourceNode = graph?.nodes.find((n) => n.id === sourceNodeId) ?? null;
  /** Full NodeData for the placed target spider — used by PathPanel for the label. */
  const targetNode = graph?.nodes.find((n) => n.id === targetNodeId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header style={{
        padding: '12px 20px',
        background: '#0d1117',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#58a6ff', flexShrink: 0 }}>
          🕷️ Code Web 🕸️
        </span>

        <input
          type="text"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          style={inputStyle}
        />

        {/* Optional token — hidden by default to avoid confusion */}
        <button
          onClick={() => setShowToken((v) => !v)}
          style={{ ...ghostBtnStyle, flexShrink: 0 }}
          title="GitHub Personal Access Token (optional — raises API rate limit)"
        >
          🔑 Token
        </button>

        {showToken && (
          <input
            type="password"
            placeholder="ghp_... (optional)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ ...inputStyle, width: 200 }}
          />
        )}

        <button
          onClick={handleAnalyze}
          disabled={status === 'loading'}
          style={primaryBtnStyle}
        >
          {status === 'loading' ? 'Analyzing…' : 'Analyze'}
        </button>
      </header>

      {/* Stats bar */}
      {graph && <StatsBar graph={graph} />}

      {/* Main area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {status === 'idle' && (
          <Placeholder>
            Enter a GitHub repository URL and click <strong>Analyze</strong>.
          </Placeholder>
        )}

        {status === 'loading' && (
          <Placeholder>
            <Spinner /> Downloading and analyzing dependencies…
          </Placeholder>
        )}

        {status === 'error' && (
          <Placeholder>
            <span style={{ color: '#f85149' }}>⚠ {errorMsg}</span>
          </Placeholder>
        )}

        {status === 'done' && graph && (
          <>
            <GraphView
              ref={graphViewRef}
              graph={graph}
              onNodeSelect={setSelectedNode}
              onSourcePlace={setSourceNodeId}
              onTargetPlace={setTargetNodeId}
              pathHighlight={pathHighlight}
              sourceNodeId={sourceNodeId}
              targetNodeId={targetNodeId}
            />
            {selectedNode && (
              <NodePanel node={selectedNode} totalNodes={graph.nodes.length} />
            )}
            <PathPanel
              sourceNode={sourceNode}
              targetNode={targetNode}
              pathCount={pathCount}
            />
            <ZoomControls cyRef={graphViewRef} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small subcomponents ──────────────────────────────────────────────────

/**
 * Centred, muted message shown in the main area when no graph is rendered
 * (idle, loading, or error states).
 */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: '#8b949e',
      fontSize: 15,
      gap: 10,
    }}>
      {children}
    </div>
  );
}

/** Animated CSS border-radius spinner shown during the `loading` phase. */
function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 16,
      height: 16,
      border: '2px solid #30363d',
      borderTopColor: '#58a6ff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 6,
  color: '#e6edf3',
  padding: '6px 12px',
  fontSize: 13,
  outline: 'none',
  flex: 1,
  minWidth: 240,
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#238636',
  border: '1px solid #2ea043',
  color: '#fff',
  borderRadius: 6,
  padding: '6px 16px',
  fontSize: 13,
  cursor: 'pointer',
  flexShrink: 0,
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #30363d',
  color: '#8b949e',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
