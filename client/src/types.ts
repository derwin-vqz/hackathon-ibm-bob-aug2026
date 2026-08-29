/**
 * Tipos compartidos entre componentes.
 * Espejo del GraphData que devuelve el servidor.
 */

export type NodeData = {
  id: string;
  label: string;
  ext: string;
  imports: number;
};

export type EdgeData = {
  source: string;
  target: string;
};

export type GraphData = {
  nodes: NodeData[];
  edges: EdgeData[];
  truncated: boolean;
};
