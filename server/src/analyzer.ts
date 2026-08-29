import AdmZip from "adm-zip";
import { readdir, rm, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * File dependency analyzer
 *
 * TS concept: `type` is similar to `interface` but more flexible —
 * it also works for unions, aliases, etc. Here we use it to describe
 * the graph shape returned to the client.
 */

const OUTPUT_PATH = 'temp/';

type DartProject = {
    name: string;
};

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


// Regex patterns capturing static/dynamic imports
const IMPORT_PATTERN = /^\s*import\s+['"]([^'"]+)['"]/gm;

/**
 * Extracts all imported modules from a file's content.
 * Only relative imports (starting with . or /) are kept —
 * external packages like 'react' or 'lodash' are ignored in the MVP.
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

function resolveImport(
    fromFile: string,
    importPath: string,
    projectName: string,
    fileSet: Set<string>
): string | null {

    // Dart standard library
    if (importPath.startsWith("dart:")) {
        return null;
    }

    // package: import
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

function resolveDartFile(
    importPath: string,
    fileSet: Set<string>
): string | null {

    const normalizedPath = importPath.endsWith(".dart")
        ? importPath
        : `${importPath}.dart`;

    if (fileSet.has(normalizedPath)) {
        return normalizedPath;
    }

    return null;
}

export async function buildGraph(fileContents: Buffer<ArrayBuffer>): Promise<{name: string, shape: GraphData}> {
    await extractBuffer(fileContents, OUTPUT_PATH);

    const tree = await readDirectories(OUTPUT_PATH);

    const repository = tree.find(
        (node): node is Extract<FileNode, { type: "directory" }> =>
            node.type === "directory"
    );

    if (!repository) {
        throw new Error("Repository root not found");
    }

    const project = await readProject(repository.path);

    //console.log("Project:", project.name);

    const fileSet = new Set<string>();

    collectFiles(
        repository.children,
        repository.path,
        fileSet
    );

    const data = await processFiles(
        repository.children,
        repository.path,
        project.name,
        fileSet
    );

    //console.log(data);

    return {
      name: project.name,
      shape: data
    };
}

async function processFiles(
    nodes: FileNode[],
    repositoryRoot: string,
    projectName: string,
    fileSet: Set<string>
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

function collectFiles(
    nodes: FileNode[],
    repositoryRoot: string,
    fileSet: Set<string>
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

        fileSet.add(relativePath);
    }
}

function generateNode(
    filePath: string,
    importsNumber: number
): NodeData {

    const fileName = path.posix.basename(filePath);
    const extension = path.posix.extname(fileName);

    return {
        id: filePath,
        label: fileName.slice(
            0,
            fileName.length - extension.length
        ),
        ext: extension,
        imports: importsNumber,
    };
}

async function extractBuffer(buffer: Buffer, outputPath: string) {
    await rm("./temp", { recursive: true, force: true });
    const zip = new AdmZip(buffer);
    zip.extractAllTo(outputPath, true);
}

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