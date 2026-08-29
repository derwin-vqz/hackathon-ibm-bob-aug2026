/**
 * File dependency analyzer
 *
 * TS concept: `type` is similar to `interface` but more flexible —
 * it also works for unions, aliases, etc. Here we use it to describe
 * the graph shape returned to the client.
 */

export type NodeData = {
  id: string;         // relative file path, e.g. "src/utils/math.ts"
  label: string;      // short name displayed in the graph
  ext: string;        // file extension: ts, tsx, js, etc.
  imports: number;    // number of files this node imports
  importedBy: number; // number of files that import this node
};

export type EdgeData = {
  source: string;  // importing file
  target: string;  // imported file
};

export type GraphData = {
  nodes: NodeData[];
  edges: EdgeData[];
  truncated: boolean; // true when analysis was capped at the file limit
};

// Regex patterns capturing static/dynamic imports and require()
// TS concept: RegExp with /g flag for multiple matches within the same string
const IMPORT_PATTERNS = [
  /import\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g,    // import ... from '...'
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,                     // require('...')
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,                      // import('...') dinámico
];

/**
 * Extracts all imported modules from a file's content.
 * Only relative imports (starting with . or /) are kept —
 * external packages like 'react' or 'lodash' are ignored in the MVP.
 */
function extractImports(content: string): string[] {
  const found = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    // Important: reset lastIndex before reusing a /g regex
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.') || importPath.startsWith('/')) {
        found.add(importPath);
      }
    }
  }

  return [...found];
}

/**
 * Resolves a relative import path to its canonical path within the repo.
 * Example: from "src/components/Graph.tsx" importing "../utils/parse"
 * → resolves to "src/utils/parse"
 * Then checks whether a file with that base path exists in fileSet.
 */
function resolveImport(
  fromFile: string,
  importPath: string,
  fileSet: Set<string>
): string | null {
  // Build base path without extension
  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  
  // Resolve ../ and ./ segments
  const parts = [...(fromDir ? fromDir.split('/') : []), ...importPath.split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.') resolved.push(part);
  }
  const basePath = resolved.join('/');

  // Try candidate extensions when the import has no explicit extension
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
  ];

  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

/**
 * Main function: given a map of { path → content }, returns the graph.
 *
 * TS concept: `Map<K, V>` is a key→value structure with guaranteed types.
 * Safer than a plain object when keys are dynamic.
 */
export function buildGraph(fileContents: Map<string, string>): GraphData {
  const fileSet = new Set(fileContents.keys());

  // Counters for node metrics
  const importCounts = new Map<string, number>();     // how many files each node imports
  const importedByCounts = new Map<string, number>(); // how many times each node is imported

  for (const path of fileSet) {
    importCounts.set(path, 0);
    importedByCounts.set(path, 0);
  }

  const edges: EdgeData[] = [];
  const seenEdges = new Set<string>(); // prevent duplicate edges

  for (const [filePath, content] of fileContents) {
    const rawImports = extractImports(content);

    for (const imp of rawImports) {
      const resolved = resolveImport(filePath, imp, fileSet);
      if (!resolved) continue;

      const edgeKey = `${filePath}→${resolved}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);

      edges.push({ source: filePath, target: resolved });
      importCounts.set(filePath, (importCounts.get(filePath) ?? 0) + 1);
      importedByCounts.set(resolved, (importedByCounts.get(resolved) ?? 0) + 1);
    }
  }

  const nodes: NodeData[] = [...fileSet].map((path) => {
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    const ext = filename.includes('.') ? filename.split('.').pop()! : '';
    return {
      id: path,
      label: filename,
      ext,
      imports: importCounts.get(path) ?? 0,
      importedBy: importedByCounts.get(path) ?? 0,
    };
  });

  return { nodes, edges, truncated: fileSet.size >= 200 };
}
