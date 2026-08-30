/**
 * Dart dependency analyzer.
 *
 * Accepts a ZIP buffer (downloaded from GitHub), extracts it to a
 * temporary directory, traverses the file tree, and builds a directed
 * dependency graph by parsing `import` statements in every `.dart` file.
 *
 * TS concept: `type` is similar to `interface` but more flexible —
 * it also works for unions, aliases, and mapped types.  Here we use it
 * to describe the graph shape that is returned to the client.
 */

import AdmZip from "adm-zip";
import { readdir, rm, readFile } from "node:fs/promises";
import path from "node:path";

/** Temporary directory where the downloaded ZIP is extracted. */
const OUTPUT_PATH = 'temp/';

/** Minimal representation of a Dart project, read from pubspec.yaml. */
type DartProject = {
    name: string;
};

/**
 * Recursive tree node produced by `readDirectories`.
 *
 * TS concept: this is a *discriminated union* — the `type` field acts as
 * a tag that lets TypeScript know which variant you have.  When you write
 * `if (node.type === "directory")`, TypeScript narrows the type so you
 * can safely access `node.children` without a cast.
 */
type FileNode =
    | {
        name: string;
        type: "file";
        path: string;
    }
    | {
        name: string;
        type: "directory";
        path: string;
        children: FileNode[];
    };

export type NodeData = {
  id: string;         // relative file path, e.g. "src/utils/math.ts"
  label: string;      // short name displayed in the graph
  ext: string;        // file extension: ts, tsx, js, etc.
  imports: number;    // number of files this node imports
  //importedBy: number; // number of files that import this node
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


/**
 * Matches Dart `import '...'` and `import "..."` statements.
 * The capture group holds the raw import path (before resolution).
 * The `gm` flags make it scan every line of the file.
 */
const IMPORT_PATTERN = /^\s*import\s+['"]([^'"]+)['"]/gm;

/**
 * Extracts all import paths found in a Dart file's source text.
 *
 * Three kinds of imports exist in Dart:
 *   - `dart:*`    — standard library (skipped by the resolver)
 *   - `package:*` — pub packages; only same-project imports are followed
 *   - relative    — `./` or `../` paths resolved against the importer's directory
 */
function extractImports(content: string): string[] {
    const found = new Set<string>();

    IMPORT_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;

    while ((match = IMPORT_PATTERN.exec(content)) !== null) {
        found.add(match[1]);
    }

    return [...found];
}

/**
 * Resolves a raw Dart import path to a relative file path within the repo.
 * Returns `null` when the import points outside the project (e.g. to the
 * standard library or an external pub package).
 *
 * @param fromFile    - Relative path of the file that contains the import.
 * @param importPath  - Raw string from the `import '...'` statement.
 * @param projectName - Name field from pubspec.yaml; used to distinguish
 *                      same-project `package:` imports from external ones.
 * @param fileSet     - Set of all known relative file paths in the repo,
 *                      used to verify that a resolved path actually exists.
 */
function resolveImport(
    fromFile: string,
    importPath: string,
    projectName: string,
    fileSet: Map<string, string>
): string | null {

    // Dart standard library — never part of the project graph.
    if (importPath.startsWith("dart:")) {
        return null;
    }

    // `package:` import — only follow it if it belongs to this project.
    if (importPath.startsWith("package:")) {
        const packagePath = importPath.slice("package:".length);

        const [packageName, ...segments] = packagePath.split("/");

        // External package
        if (packageName !== projectName) {
            return null;
        }

        const relativePath = path.posix.join(
            "lib",
            segments.join("/")
        );

        return resolveDartFile(relativePath, fileSet);
    }

    // Relative import
    if (
        importPath.startsWith("./") ||
        importPath.startsWith("../")
    ) {
        const fromDir = path.posix.dirname(fromFile);

        const resolvedPath = path.posix.normalize(
            path.posix.join(fromDir, importPath)
        );

        return resolveDartFile(resolvedPath, fileSet);
    }

    return null;
}

/**
 * Checks whether a candidate `.dart` path exists in the project's file set.
 * Appends `.dart` if the path has no extension (Dart allows omitting it).
 * Returns `null` when the file is not found.
 */
function resolveDartFile(
    importPath: string,
    fileSet: Map<string, string>
): string | null {

    const normalizedPath = importPath.endsWith(".dart")
        ? importPath
        : `${importPath}.dart`;

    return fileSet.get(
        normalizedPath.toLowerCase()
    ) ?? null;
}

/**
 * Entry point: builds the full dependency graph from a ZIP buffer.
 *
 * Steps:
 *   1. Extract the ZIP to `temp/`.
 *   2. Find the repository root directory inside the extracted folder.
 *   3. Read `pubspec.yaml` to discover the project name.
 *   4. Collect all file paths into a Set for fast lookup during resolution.
 *   5. Walk the tree, parse imports, and emit nodes + edges.
 *
 * @returns An object with the project `name` and the graph `shape`.
 */
export async function buildGraph(fileContents: Buffer<ArrayBuffer>): Promise<{name: string, shape: GraphData}> {
    await extractBuffer(fileContents, OUTPUT_PATH);

    const tree = await readDirectories(OUTPUT_PATH);

    const projectRoot = findProjectRoot(tree);

    if (!projectRoot) {
        throw new Error("Dart project root not found");
    }

    const project = await readProject(projectRoot.path);

    // First pass: collect every file path so imports can be validated.
    const fileSet = new Map<string, string>();

    collectFiles(
        projectRoot.children,
        projectRoot.path,
        fileSet
    );
    console.log(projectRoot.path);

    // Second pass: parse imports and build the graph.
    const data = await processFiles(
        projectRoot.children,
        projectRoot.path,
        project.name,
        fileSet
    );

    return {
      name: project.name,
      shape: data
    };
}

/**
 * Recursively walks the file tree, parsing every `.dart` file it finds.
 * Produces `NodeData` entries (one per file) and `EdgeData` entries
 * (one per resolved import relationship).
 */
async function processFiles(
    nodes: FileNode[],
    repositoryRoot: string,
    projectName: string,
    fileSet: Map<string, string>
): Promise<GraphData> {

    const nodesTree: NodeData[] = [];
    const edgesTree: EdgeData[] = [];

    for (const node of nodes) {
        if (node.type === "directory") {
            const data = await processFiles(
                node.children,
                repositoryRoot,
                projectName,
                fileSet
            );

            nodesTree.push(...data.nodes);
            edgesTree.push(...data.edges);

            continue;
        }

        if (!node.path.endsWith(".dart")) {
            continue;
        }

        const content = await readFile(node.path, "utf-8");

        const relativePath = path
            .relative(repositoryRoot, node.path)
            .split(path.sep)
            .join("/");

        const imports = extractImports(content);

        const resolvedImports: string[] = [];

        for (const importPath of imports) {
          const target = resolveImport(
              relativePath,
              importPath,
              projectName,
              fileSet
          );

          if (!target) {
              continue;
          }

          resolvedImports.push(target);

          edgesTree.push({
              source: relativePath,
              target,
          });
        }

        const myNode = generateNode(
            relativePath,
            imports.length
        );

        nodesTree.push(myNode);
    }

    return {
        nodes: nodesTree,
        edges: edgesTree,
        truncated: false,
    };
}

/**
 * First-pass traversal: populates `fileSet` with the relative path of
 * every file in the repository so that `resolveImport` can verify that
 * a resolved path actually exists before adding an edge.
 */
function collectFiles(
    nodes: FileNode[],
    repositoryRoot: string,
    fileSet: Map<string, string>
) {
    for (const node of nodes) {
        if (node.type === "directory") {
            collectFiles(
                node.children,
                repositoryRoot,
                fileSet
            );
            continue;
        }

        const relativePath = path
            .relative(repositoryRoot, node.path)
            .split(path.sep)
            .join("/");

        fileSet.set(
            relativePath.toLowerCase(),
            relativePath
        );
    }
}

/**
 * Creates a `NodeData` object for a single Dart file.
 *
 * @param filePath      - Relative path from the repository root.
 * @param importsNumber - Number of raw `import` statements found in the file.
 */
function generateNode(
    filePath: string,
    importsNumber: number
): NodeData {

    const fileName = path.posix.basename(filePath);
    const extension = path.posix.extname(fileName);

    return {
        id: filePath.toLowerCase(),
        label: fileName.slice(
            0,
            fileName.length - extension.length
        ),
        ext: extension,
        imports: importsNumber,
    };
}

/**
 * Removes any previous extraction, then extracts the ZIP buffer to
 * `outputPath` using AdmZip.
 */
async function extractBuffer(buffer: Buffer, outputPath: string) {
    await rm("./temp", { recursive: true, force: true });
    const zip = new AdmZip(buffer);
    zip.extractAllTo(outputPath, true);
}

/**
 * Recursively reads a directory and returns a `FileNode` tree.
 * Directories and files are distinguished via `entry.isDirectory()`.
 */
async function readDirectories(directory: string): Promise<FileNode[]> {
    const entries = await readdir(directory, {
        withFileTypes: true,
    });

    const nodes: FileNode[] = [];

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            nodes.push({
                name: entry.name,
                type: "directory",
                path: fullPath,
                children: await readDirectories(fullPath),
            });
        } else {
            nodes.push({
                name: entry.name,
                type: "file",
                path: fullPath,
            });
        }
    }

    return nodes;
}

/**
 * Reads `pubspec.yaml` from the given directory and extracts the project
 * name.  Throws if the file is missing or the `name:` field is absent.
 *
 * The `name:` field follows the pattern:
 *   name: my_project_name
 */
async function readProject(directory: string): Promise<DartProject> {
    const pubspecPath = path.join(directory, "pubspec.yaml");

    const content = await readFile(pubspecPath, "utf-8");

    const match = content.match(/^\s*name:\s*([a-zA-Z0-9_-]+)/m);

    if (!match) {
        throw new Error("Could not find project name in pubspec.yaml");
    }

    return {
        name: match[1],
    };
}

function findProjectRoot(
    nodes: FileNode[]
): Extract<FileNode, { type: "directory" }> | null {

    for (const node of nodes) {

        if (node.type === "directory") {

            const hasPubspec = node.children.some(
                child =>
                    child.type === "file" &&
                    child.name === "pubspec.yaml"
            );

            if (hasPubspec && node.path != 'temp\\OriginaGO-HEAD\\crystal_navigation_bar') {
                console.log(node.path);
                return node;
            }

            const result = findProjectRoot(node.children);

            if (result) {
                return result;
            }
        }
    }

    return null;
}