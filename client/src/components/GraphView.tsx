import cytoscape from 'cytoscape';
// @ts-ignore — cytoscape-dagre has no perfect types but works fine
import dagre from 'cytoscape-dagre';
import { useEffect, useRef } from 'react';
import type { GraphData, NodeData } from '../types';

cytoscape.use(dagre);

/**
 * Color palette by file extension
 */
const EXT_COLORS: Record<string, string> = {
  ts: '#3b82f6',
  tsx: '#8b5cf6',
  js: '#f59e0b',
  jsx: '#f97316',
  mjs: '#10b981',
  cjs: '#6b7280',
};
const DEFAULT_COLOR = '#6b7280';

function nodeColor(ext: string): string {
  return EXT_COLORS[ext] ?? DEFAULT_COLOR;
}

/**
 * Calculates node size based on how many files import it (popularity).
 * Highly imported nodes appear larger and more prominent.
 */
function nodeSize(node: NodeData): number {
  return Math.max(20, Math.min(60, 20 + node.importedBy * 4));
}

type Props = {
  graph: GraphData;
  onNodeSelect: (node: NodeData | null) => void;
};

export default function GraphView({ graph, onNodeSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Build Cytoscape elements from our graph
    // Cytoscape expects: { data: { id, label, ... } } for nodes
    //                    { data: { source, target } }  for edges
    const elements: cytoscape.ElementDefinition[] = [
      ...graph.nodes.map((n) => ({
        group: 'nodes' as const,
        data: {
          id: n.id,
          label: n.label,
          ext: n.ext,
          imports: n.imports,
          importedBy: n.importedBy,
          color: nodeColor(n.ext),
          size: nodeSize(n),
        },
      })),
      ...graph.edges.map((e, i) => ({
        group: 'edges' as const,
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
        },
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
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#ffffff',
          },
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
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 80,
        padding: 30,
      } as cytoscape.LayoutOptions,
    });

    // On node click: highlight direct neighbors
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data() as NodeData;

      cy.elements().removeClass('highlighted faded');

      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass('faded');
      neighborhood.edges().addClass('highlighted');

      onNodeSelect(nodeData);
    });

    // Click on background: clear selection
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted faded');
        onNodeSelect(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, width: '100%', background: '#0f1117' }}
    />
  );
}
