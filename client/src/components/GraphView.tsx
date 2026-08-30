import cytoscape from 'cytoscape';
// @ts-ignore — cytoscape-dagre has no perfect types but works fine
import dagre from 'cytoscape-dagre';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { GraphData, NodeData } from '../types';

cytoscape.use(dagre);

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
  return Math.max(20, Math.min(60, 20 + node.imports * 4));
}

type Props = {
  graph: GraphData;
  onNodeSelect: (node: NodeData | null) => void;
  /** Called when the user right-clicks a node and picks "Set as source". */
  onSourcePlace: (nodeId: string | null) => void;
  /** Called when the user right-clicks a node and picks "Set as target". */
  onTargetPlace: (nodeId: string | null) => void;
  pathHighlight?: { nodeIds: Set<string>; edgeKeys: Set<string> } | null;
};

/** The ref handle exposed to the parent — gives access to the live Cytoscape instance. */
export type GraphViewHandle = {
  cy: cytoscape.Core | null;
};

/** Position + node ID for the floating right-click context menu. */
type ContextMenuState = {
  x: number;
  y: number;
  nodeId: string;
};

const GraphView = forwardRef<GraphViewHandle, Props>(function GraphView(
  { graph, onNodeSelect, onSourcePlace, onTargetPlace, pathHighlight },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const rafRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
    </div>
  );
});

export default GraphView;

// ─── Context menu ─────────────────────────────────────────────────────────

type NodeContextMenuProps = {
  x: number;
  y: number;
  onSetSource: () => void;
  onSetTarget: () => void;
  onClose: () => void;
};

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
        minWidth: 170,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        fontSize: 13,
      }}>
        <ContextMenuItem onPointerDown={onSetSource}>🕷 Set as source</ContextMenuItem>
        <ContextMenuItem onPointerDown={onSetTarget}>🕸 Set as target</ContextMenuItem>
      </div>
    </>
  );
}

function ContextMenuItem({ onPointerDown, children }: { onPointerDown: () => void; children: React.ReactNode }) {
  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(); }}
      style={{
        display: 'block',
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
