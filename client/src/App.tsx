import { useState } from 'react';
import GraphView from './components/GraphView';
import NodePanel from './components/NodePanel';
import StatsBar from './components/StatsBar';
import type { GraphData, NodeData } from './types';

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleAnalyze() {
    if (!repoUrl.trim()) return;
    setStatus('loading');
    setGraph(null);
    setSelectedNode(null);
    setErrorMsg('');

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
          🕸️ Code Network
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
              graph={graph}
              onNodeSelect={setSelectedNode}
            />
            {selectedNode && (
              <NodePanel node={selectedNode} totalNodes={graph.nodes.length} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small subcomponents ──────────────────────────────────────────────────

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
