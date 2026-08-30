import type { EdgeData } from '../types';

/**
 * Returns every directed path from sourceId to targetId as ordered arrays of
 * node ID strings (source → ... → target inclusive).
 *
 * Builds an adjacency map for O(1) neighbour lookup, then runs a recursive DFS.
 * Cycles are prevented by tracking visited nodes per active path.
 *
 * Returns an empty array when no directed path exists.
 */
export function findAllPaths(
  edges: EdgeData[],
  sourceId: string,
  targetId: string,
): string[][] {
  // Build adjacency map: nodeId → list of neighbour IDs it points to.
  const adj = new Map<string, string[]>();
  for (const { source, target } of edges) {
    const neighbours = adj.get(source);
    if (neighbours) {
      neighbours.push(target);
    } else {
      adj.set(source, [target]);
    }
  }

  const results: string[][] = [];

  function dfs(current: string, path: string[], visited: Set<string>): void {
    if (current === targetId) {
      results.push([...path]);
      return;
    }
    for (const neighbour of adj.get(current) ?? []) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        path.push(neighbour);
        dfs(neighbour, path, visited);
        path.pop();
        visited.delete(neighbour);
      }
    }
  }

  // Only start DFS if source exists in the graph and is not the same as target.
  if (sourceId !== targetId) {
    dfs(sourceId, [sourceId], new Set([sourceId]));
  } else if (adj.has(sourceId)) {
    // source === target: a trivial single-node "path" if the node exists.
    results.push([sourceId]);
  }

  return results;
}
