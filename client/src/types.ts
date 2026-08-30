/**
 * Shared TypeScript types used by every client component.
 * These mirror the shapes returned by the `/api/repo` server endpoint.
 */

/**
 * Metadata for a single file (graph node) in the dependency graph.
 *
 * `id` is the node's unique key and equals its relative file path,
 * lowercased (e.g. `"lib/src/utils/math.dart"`).
 */
export type NodeData = {
  /** Relative file path from the repository root (lowercased). */
  id: string;
  /** Short filename without extension, displayed as the node label. */
  label: string;
  /** File extension including the leading dot (e.g. `".dart"`). */
  ext: string;
  /** Number of raw `import` statements found in this file. */
  imports: number;
};

/**
 * A directed dependency edge: `source` file imports `target` file.
 * Both values are relative file paths matching a `NodeData.id`.
 */
export type EdgeData = {
  /** Relative path of the importing file. */
  source: string;
  /** Relative path of the imported file. */
  target: string;
};

/**
 * The full dependency graph returned by the server and consumed by the client.
 *
 * `truncated` is currently always `false` — a file-count cap is not yet
 * enforced on the ZIP-download path.
 */
export type GraphData = {
  nodes: NodeData[];
  edges: EdgeData[];
  /** `true` when the analysis was capped at the 200-file limit. */
  truncated: boolean;
};
