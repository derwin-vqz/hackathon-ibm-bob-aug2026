/**
 * GraphView — interactive Cytoscape.js dependency graph canvas.
 *
 * Responsibilities:
 *   - Renders the graph using a dagre (top-to-bottom) layout.
 *   - Colours nodes on a blue→red gradient based on their import count.
 *   - Handles left-click (neighbourhood highlight) and right-click
 *     (context menu to place source / target spiders).
 *   - Accepts an optional `pathHighlight` prop and applies the
 *     `path-highlight` CSS class + an animated dashed-line effect to all
 *     nodes and edges that belong to a found path.
 *   - Renders HTML spider icon overlays that track the placed source and
 *     target nodes as the user pans and zooms.
 *   - Exposes the live Cytoscape instance to its parent via a forwarded ref
 *     (`GraphViewHandle`) so ZoomControls can drive zoom/pan externally.
 */
import cytoscape from 'cytoscape';
// @ts-ignore — cytoscape-dagre has no perfect types but works fine
import dagre from 'cytoscape-dagre';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { GraphData, NodeData } from '../types';

cytoscape.use(dagre);

/** Fixed display size for the spider HTML overlay, in CSS pixels. */
const SPIDER_SIZE = 48;

/**
 * Maps a node's import count to an RGB colour on a blue→red gradient.
 * The node with the most imports (`maxImports`) renders as full red;
 * a node with zero imports renders as green (no gradient pressure).
 *
 * @param imports    - Number of imports for this node.
 * @param maxImports - Highest import count in the current graph.
 */
function nodeColor(imports: number, maxImports: number): string {
  if (maxImports === 0) {
    return '#22c55e';
  }
  const ratio = imports / maxImports;
  const red = Math.round(255 * ratio);
  const green = 0;
  const blue = 255 - Math.round(255 * ratio);
  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Calculates node size based on how many files import it (popularity).
 * Highly imported nodes appear larger and more prominent.
 */
function nodeSize(node: NodeData): number {
  //return Math.max(20, Math.min(60, 20 + node.imports * 4));
  return Math.max(50, Math.min(120, 20 + node.imports * 4));
}

/** Props accepted by the GraphView component. */
type Props = {
  /** Full graph data to render. Changing this value rebuilds the Cytoscape instance. */
  graph: GraphData;
  /** Called with the clicked node's data, or `null` when the background is clicked. */
  onNodeSelect: (node: NodeData | null) => void;
  /** Called when the user right-clicks a node and picks "Set as source". */
  onSourcePlace: (nodeId: string | null) => void;
  /** Called when the user right-clicks a node and picks "Set as target". */
  onTargetPlace: (nodeId: string | null) => void;
  /**
   * Optional path highlight data produced by `findAllPaths`.
   * When present, matching nodes and edges receive the `path-highlight` class
   * and the animated dashed-line effect is started.
   * `null` / `undefined` clears all path highlights.
   */
  pathHighlight?: { nodeIds: Set<string>; edgeKeys: Set<string> } | null;
  /** ID of the node currently marked as the path source (white spider). */
  sourceNodeId?: string | null;
  /** ID of the node currently marked as the path target (yellow spider). */
  targetNodeId?: string | null;
};

/** The ref handle exposed to the parent — gives access to the live Cytoscape instance. */
export type GraphViewHandle = {
  cy: cytoscape.Core | null;
};

/** Position + node ID for the floating right-click context menu. */
type ContextMenuState = {
  /** CSS-pixel X coordinate relative to the Cytoscape container. */
  x: number;
  /** CSS-pixel Y coordinate relative to the Cytoscape container. */
  y: number;
  /** ID of the node that was right-clicked. */
  nodeId: string;
};

/**
 * Rendered (CSS-pixel) position of a placed spider overlay, relative to the
 * Cytoscape container div.  `null` means the spider is not currently placed.
 */
type SpiderPos = { x: number; y: number } | null;

const GraphView = forwardRef<GraphViewHandle, Props>(function GraphView(
  { graph, onNodeSelect, onSourcePlace, onTargetPlace, pathHighlight, sourceNodeId, targetNodeId },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const rafRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sourcePos, setSourcePos] = useState<SpiderPos>(null);
  const [targetPos, setTargetPos] = useState<SpiderPos>(null);

  // Expose the Cytoscape instance to the parent via the forwarded ref.
  useImperativeHandle(ref, () => ({ get cy() { return cyRef.current; } }), []);

  useEffect(() => {
    if (!containerRef.current) return;

    const maxImports = Math.max(...graph.nodes.map((n) => n.imports), 0);

    const elements: cytoscape.ElementDefinition[] = [
      ...graph.nodes.map((n) => ({
        group: 'nodes' as const,
        data: {
          id: n.id,
          label: n.label,
          ext: n.ext,
          imports: n.imports,
          color: nodeColor(n.imports, maxImports),
          size: nodeSize(n),
        },
      })),
      ...graph.edges.map((e, i) => ({
        group: 'edges' as const,
        data: { id: `e${i}`, source: e.source, target: e.target },
      })),
    ];

    cyRef.current?.destroy();

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'width': 'data(size)',
            'height': 'data(size)',
            'color': '#e6edf3',
            'font-size': '9px',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-outline-color': '#0f1117',
            'text-outline-width': 2,
            'border-width': 0,
            'underlay-color': 'data(color)',
            'underlay-opacity': 0.5,
            'underlay-padding': 8,
            'underlay-shape': 'ellipse',
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 3, 'border-color': '#ffffff' },
        },
        {
          selector: 'node.faded',
          style: { opacity: 0.15 },
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': '#30363d',
            'target-arrow-color': '#30363d',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.6,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#58a6ff',
            'target-arrow-color': '#58a6ff',
            'opacity': 1,
            'width': 2,
          },
        },
        {
          selector: 'edge.faded',
          style: { opacity: 0.05 },
        },
        {
          selector: 'node.path-highlight',
          style: { 'border-width': 3, 'border-color': '#ffffff' },
        },
        {
          selector: 'edge.path-highlight',
          style: {
            'line-color': '#ffffff',
            'target-arrow-color': '#ffffff',
            'line-style': 'dashed',
            'line-dash-pattern': [8, 4],
            'line-dash-offset': 0,
            'width': 2.5,
            'opacity': 1,
          },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 80,
        padding: 30,
        fit: false
      } as cytoscape.LayoutOptions,
    });

    // Left-click on node: highlight direct neighbours.
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data() as NodeData;
      cy.elements().removeClass('highlighted faded');
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass('faded');
      neighborhood.edges().addClass('highlighted');
      onNodeSelect(nodeData);
      setContextMenu(null);
    });

    // Left-click on background: clear selection.
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted faded');
        onNodeSelect(null);
        setContextMenu(null);
      }
    });

    // Right-click on node: show context menu.
    // renderedPosition() returns CSS-pixel coords relative to the container —
    // no zoom or pan math needed.
    cy.on('cxttap', 'node', (evt) => {
      const node = evt.target;
      const pos = node.renderedPosition();
      setContextMenu({ x: pos.x, y: pos.y, nodeId: node.id() as string });
    });

    // Right-click on background: close context menu.
    cy.on('cxttap', (evt) => {
      if (evt.target === cy) setContextMenu(null);
    });

    cyRef.current = cy;

    return () => { cy.destroy(); };
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply / remove path-highlight classes and run the dash animation.
  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass('path-highlight');

    if (!pathHighlight) return;

    pathHighlight.nodeIds.forEach((id) => {
      cy.getElementById(id).addClass('path-highlight');
    });

    cy.edges().forEach((e) => {
      const key = `${e.data('source')}->${e.data('target')}`;
      if (pathHighlight.edgeKeys.has(key)) e.addClass('path-highlight');
    });

    let offset = 0;
    const animate = () => {
      offset -= 1;
      cy.edges('.path-highlight').style('line-dash-offset', offset);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [pathHighlight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute rendered positions of placed spider nodes.
  // Runs whenever source/target IDs change, and also subscribes to pan/zoom
  // so the overlays track the node as the user navigates the graph.
  const updateSpiderPositions = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (sourceNodeId) {
      const node = cy.getElementById(sourceNodeId);
      if (node.length) setSourcePos(node.renderedPosition());
      else setSourcePos(null);
    } else {
      setSourcePos(null);
    }

    if (targetNodeId) {
      const node = cy.getElementById(targetNodeId);
      if (node.length) setTargetPos(node.renderedPosition());
      else setTargetPos(null);
    } else {
      setTargetPos(null);
    }
  }, [sourceNodeId, targetNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    updateSpiderPositions();

    const cy = cyRef.current;
    if (!cy) return;

    // Re-run on every viewport change (pan, zoom, fit).
    cy.on('render', updateSpiderPositions);
    return () => { cy.off('render', updateSpiderPositions); };
  }, [updateSpiderPositions]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, width: '100%', height: '100%', background: '#0f1117', position: 'relative' }}
    >
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSetSource={() => { onSourcePlace(contextMenu.nodeId); setContextMenu(null); }}
          onSetTarget={() => { onTargetPlace(contextMenu.nodeId); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Spider HTML overlays */}
      {sourcePos && (
        <div style={{
          position: 'absolute',
          left: sourcePos.x,
          top: sourcePos.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 5,
        }}>
          <SpiderIcon color="#ffffff" rotation={0} size={SPIDER_SIZE} />
        </div>
      )}
      {targetPos && (
        <div style={{
          position: 'absolute',
          left: targetPos.x,
          top: targetPos.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 5,
        }}>
          <SpiderIcon color="#facc15" rotation={180} size={SPIDER_SIZE} />
        </div>
      )}

    </div>
  );
});

export default GraphView;


// ─── Zoom controls ────────────────────────────────────────────────────────

/** Discrete zoom levels available in the level selector drop-down. */
const ZOOM_LEVELS = [1.5, 1.25, 1, 0.75, 0.5, 0.25];

/**
 * Zoom controls panel — rendered as a sibling of GraphView in App.tsx so it
 * sits in the position:relative wrapper and is never covered by the Cytoscape canvas.
 * Accepts the GraphViewHandle ref and reads .cy from it.
 */
export function ZoomControls({ cyRef }: { cyRef: React.RefObject<GraphViewHandle | null> }) {
  const getCy = () => cyRef.current?.cy ?? null;

  const zoomBy = (factor: number) => {
    const cy = getCy();
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  const setZoom = (level: number) => {
    const cy = getCy();
    if (!cy) return;
    cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  const fitAll = () => {
    getCy()?.fit(undefined, 30);
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      right: 16,
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      alignItems: 'stretch',
      background: 'rgba(22,27,34,0.85)',
      backdropFilter: 'blur(4px)',
      border: '1px solid #30363d',
      borderRadius: 6,
      padding: '6px',
    }}>
      <ZoomBtn onClick={() => zoomBy(1.2)} title="Zoom in">+</ZoomBtn>
      <ZoomBtn onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</ZoomBtn>
      <ZoomBtn onClick={fitAll} title="Fit all nodes" style={{ fontSize: 10 }}>Fit</ZoomBtn>
      <select
        title="Set zoom level"
        onChange={(e) => setZoom(Number(e.target.value))}
        defaultValue=""
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          color: '#e6edf3',
          borderRadius: 4,
          padding: '4px 2px',
          fontSize: 11,
          cursor: 'pointer',
          textAlign: 'center',
        }}
      >
        <option value="" disabled>%</option>
        {ZOOM_LEVELS.map((z) => (
          <option key={z} value={z}>{Math.round(z * 100)}%</option>
        ))}
      </select>
    </div>
  );
}

function ZoomBtn({
  onClick,
  title,
  style: extraStyle,
  children,
}: {
  onClick: () => void;
  title?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: '#161b22',
        border: '1px solid #30363d',
        color: '#e6edf3',
        borderRadius: 4,
        width: 30,
        height: 28,
        fontSize: 16,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...extraStyle,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1f2937'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#161b22'; }}
    >
      {children}
    </button>
  );
}


// ─── Context menu ─────────────────────────────────────────────────────────

/** Props for the floating right-click context menu. */
type NodeContextMenuProps = {
  /** CSS-pixel X position (from `node.renderedPosition()`). */
  x: number;
  /** CSS-pixel Y position (from `node.renderedPosition()`). */
  y: number;
  /** Called when the user selects "Set as source". */
  onSetSource: () => void;
  /** Called when the user selects "Set as target". */
  onSetTarget: () => void;
  /** Called when the user clicks outside the menu. */
  onClose: () => void;
};

/**
 * Minimal floating context menu rendered as an absolute-positioned div
 * inside the Cytoscape container.  An invisible full-area backdrop closes
 * the menu when the user clicks outside it.
 */
function NodeContextMenu({ x, y, onSetSource, onSetTarget, onClose }: NodeContextMenuProps) {
  return (
    <>
      {/* Invisible full-area backdrop — closes menu on outside click */}
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 19 }}
        onPointerDown={onClose}
      />
      <div style={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: 20,
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 180,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        fontSize: 13,
      }}>
        <ContextMenuItem onPointerDown={onSetSource}>
          <SpiderIcon color="#ffffff" rotation={0} />
          Set as source
        </ContextMenuItem>
        <ContextMenuItem onPointerDown={onSetTarget}>
          <SpiderIcon color="#facc15" rotation={180} />
          Set as target
        </ContextMenuItem>
      </div>
    </>
  );
}

/**
 * Single interactive row inside the context menu.
 * Uses `onPointerDown` instead of `onClick` to avoid a race condition
 * where the backdrop's `onPointerDown` fires first and unmounts the menu
 * before the `click` event is dispatched.
 */
function ContextMenuItem({ onPointerDown, children }: { onPointerDown: () => void; children: React.ReactNode }) {
  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        background: 'none',
        border: 'none',
        color: '#e6edf3',
        padding: '7px 14px',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: 13,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1f2937'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      {children}
    </button>
  );
}

// ─── Spider SVG icon ───────────────────────────────────────────────────────

/**
 * Inline spider SVG from assets/spider.svg.
 * color    — CSS colour string applied via currentColor.
 * rotation — degrees; 0 = upright (source), 180 = upside-down (target).
 */
function SpiderIcon({ color, rotation, size = 22 }: { color: string; rotation: number; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 800"
      width={size}
      height={size}
      style={{ color, transform: `rotate(${rotation}deg)`, flexShrink: 0 }}
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M305,60h4l-2,3c-58.98,26.79-52.4,79.16-77,137-5.15,12.11-23.85,12.68-28,28h1c6.27-2.25,16.71-7.12,23-5l18,31c16.14,26.76,33.29,58.51,56,79h1l1-2c5.79-24.68-21.1-48.7-14-86,15.86-83.33,100-142.01,177-83,25.34,19.42,41.19,48.94,48,87,5.65,31.56-24.4,73.1-12,85v-2c32.53-25.56,51.18-73.78,73-110,9.33.8,19.26,7.17,25,4-6.54-9.49-23.44-15.67-28-25l-27-90c-12.45-21.21-35.52-32.04-51-50l1-1c71.32,28.24,67.42,45.16,98,111,8.56,18.43,21.51,38.99,22,64l-104,134v1c34.05-7.33,77.73-52.11,105-72l25-18,30,8v-1l-2-2-10-17,9-62c-5.16-24.49-27.16-38.64-34-60h1c21.32,10.52,48.28,34.4,56,58v50c0,16.17,1.09,34.74-5,45-48.26,14.75-91.3,49.37-129,77l-46,33v2h2c12.83,5.22,31.23-9.6,40-14,28.65-14.37,68.42-44.56,101-49,31.26,29.72,55.48,63.34,81,99l32,45c2.37,10.36-17.34,68.94-21,79-7.01,19.27-21.86,64.83-39,71,8.05-24.24,13.13-51.49,19-79l3-39c3.61-8.2,16.53-16.73,22-25l-1-2-19,6c-2.92-5.53-.72-18.52-4-24l-71-77c.37-12.09,1.92-30.51-3-38l-1-2h-1l-9,31c-42.64,9.4-77.38,36.08-116,51l-28,1,2,1c25.37,26.84,93.93-19.3,129-12v1l-35,39-85,16-38-16c-6.05,24.8-22.09,56.24-46,64,4.27-9.45,6-22.48,3-34h-4c-15.29,6.57-34.11,1.81-50,0-2.1,12.59-.12,22.67,3,34h-1c-23.58-14.61-35.3-36.95-45-65l-37,17-86-16-15-19c-5.42-6.79-20.02-14.36-18-22h1c37.99,3.57,101.44,34.44,129,12v-1c-46.42,1.19-72.21-22.16-106-37-9.52-4.18-32.18-7.9-38-16l-10-29-2,1c-1.35,11.23-2.03,26-2,40-13.91,10.46-65.86,63.27-72,78l-2,21-2,1-18-6-1,2,2,2,20,24,2,32c5.69,29.68,10.14,59.63,20,85l-1,1-3-2-16-23c-16.57-27.91-24.32-60.09-33-96l-6-32,27-38c27.2-37.03,52.01-72.95,85-104,32.39,4.89,72.53,34.32,101,49,8.85,4.56,27.11,18.79,40,14l2-1v-1l-112-78c-19.82-12.81-50.52-20.36-67-37l-2-89c7.24-22.02,37.01-54,60-60-12.09,16.46-30.75,37.12-36,59-5.5,22.92,14.02,43.46,9,63l-12,21h4l25-8c42.1,20.36,86.22,80,131,90l-1-3c-28-21.77-51.87-67.94-74-97l-30-37c-2.94-11.78,15.97-46.64,20-56,16.45-38.21,26.38-77.9,60-99l39-18Z
M167,439c4.71,2.73,29.42,39.44,31,45l-5,58c-4.19,27.31,6.03,49.97,7,69-5.78.18-17.57.9-20,5l31,15,23,47c15,20.33,30,40.67,45,61h-1c-39.86-23.47-66.23-54.6-93-91l-21-28v-40c-6.12-40.04-6.54-102.98,3-141Z
M632,439c11.34,8.26,7.12,80.23,7,102l-2,78c-8.11,25.88-89.46,116.81-115,119l4-4c13.67-18.66,27.33-37.34,41-56l22-46,32-17-1-2c-8.19.25-16.12-.83-20-5,8.53-21.99,10.61-59.53,6-90l-3-34,29-45Z
M342,263l28-25s3.44-5.68-1-10-10-2-10-2l-36,31s-3,1.46-3,6,3,6,3,6l35,31s6.15,1.67,10-2,2-10,2-10l-28-25Z
M404,216s2.33-8.97,13-6c5.97,1.66,5,11,5,11l-23,88s-4.09,4.41-10,3-6-8-6-8l21-88Z
M458,263l-27,24s-3.37,6.91,1,11,11,2,11,2l34-31s3-2.27,3-6-2-5-2-5l-36-32s-7.54-1.71-11,2,0,12,0,12l27,23Z"
      />
    </svg>
  );
}
