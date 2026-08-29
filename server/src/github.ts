/**
 * GitHub API helpers
 *
 * TS concept: `interface` defines the shape of an object — a contract that any
 * value claiming to be a `GitHubFile` must satisfy exactly.
 */

export interface GitHubFile {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}

interface TreeResponse {
  tree: GitHubFile[];
  truncated: boolean;
}

// File types we want to analyze
const SUPPORTED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORE_PATHS = /(node_modules|dist|build|\.next|coverage|__tests__|\.git)/;

const FILE_LIMIT = 200;

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Extracts owner and repo from a GitHub URL.
 * Example: "https://github.com/facebook/react" → { owner: "facebook", repo: "react" }
 */
export function parseRepoUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/**
 * Returns the HEAD commit SHA for the repository's default branch.
 */
export async function getDefaultBranchSha(
  owner: string,
  repo: string,
  token?: string
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubHeaders(token),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { default_branch: string };
  
  const branchRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${data.default_branch}`,
    { headers: githubHeaders(token) }
  );
  if (!branchRes.ok) throw new Error(`Branch API error ${branchRes.status}`);
  const branch = await branchRes.json() as { commit: { sha: string } };
  return branch.commit.sha;
}

/**
 * Downloads the full repository tree (flat list of all files).
 * `recursive=1` flattens subdirectories into a single response.
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  sha: string,
  token?: string
): Promise<GitHubFile[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
    { headers: githubHeaders(token) }
  );
  if (!res.ok) throw new Error(`Tree API error ${res.status}: ${await res.text()}`);
  const data = await res.json() as TreeResponse;

  // Keep only relevant source files, within the cap
  return data.tree
    .filter(
      (f) =>
        f.type === 'blob' &&
        SUPPORTED_EXTENSIONS.test(f.path) &&
        !IGNORE_PATHS.test(f.path)
    )
    .slice(0, FILE_LIMIT);
}

/**
 * Downloads a file's base64-encoded content and decodes it.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<string> {
  console.log('Acabamos de ejecutar la consulta a github');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers: githubHeaders(token) }
  );
  if (!res.ok) return ''; // On failure return empty string instead of crashing
  const data = await res.json() as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== 'base64') return '';
  // atob is not available in Node — use native Buffer instead
  return Buffer.from(data.content, 'base64').toString('utf-8');
}
