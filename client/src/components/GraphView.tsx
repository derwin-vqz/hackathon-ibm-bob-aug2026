import cytoscape from 'cytoscape';
// @ts-ignore — cytoscape-dagre has no perfect types but works fine
import dagre from 'cytoscape-dagre';
import { useEffect, useRef } from 'react';
import type { GraphData, NodeData } from '../types';

cytoscape.use(dagre);

/**
 * Color palette by file extension
 */
const DEFAULT_COLOR = '#6b7280';

function nodeColor(imports: number, maxImports: number): string {
  if (maxImports === 0) {
    return '#22c55e';
  }

  const ratio = imports / maxImports;

  const red = Math.round(255 * ratio);
  const green = 0; //255 - Math.round(255 * ratio);
  const blue = 255 - Math.round(255 * ratio); //Math.round(94 + (68 - 94) * ratio);

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
};

export default function GraphView({ graph, onNodeSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const maxImports = Math.max(
      ...graph.nodes.map(node => node.imports),
      0
    );

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
          color: nodeColor(n.imports, maxImports),
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
            // --- brillo ---
            'underlay-color': 'data(color)',   // color del brillo (puede ser fijo también, ej '#00ffff')
            'underlay-opacity': 0.5,           // qué tan intenso se ve
            'underlay-padding': 8,             // tamaño del brillo (más padding = más grande)
            'underlay-shape': 'ellipse',       // forma del halo: 'ellipse' o 'round-rectangle'
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
      style={{ flex: 1, width: '100%', height: '100%', background: '#0f1117' }}
    />
  );
}
