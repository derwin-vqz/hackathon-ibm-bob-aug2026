/**
 * GitHub REST API helpers (Trees + Contents).
 *
 * NOTE: These helpers are used only by the commented-out `/api/analyze`
 * endpoint in `index.ts`, which fetches individual file contents via the
 * GitHub Contents API.  The active `/api/repo` endpoint uses
 * `github-ingester.ts` (codeload ZIP download) instead.
 *
 * TS concept: `interface` defines the shape of an object — a contract that any
 * value claiming to be a `GitHubFile` must satisfy exactly.
 */

/** A single entry returned by GitHub's Git Trees API. */
export interface GitHubFile {
  /** Repository-relative file path (e.g. `"lib/main.dart"`). */
  path: string;
  /** `'blob'` for files, `'tree'` for directories. */
  type: 'blob' | 'tree';
  /** Git object SHA for this entry. */
  sha: string;
}

/** Shape of the GitHub Git Trees API response (`?recursive=1`). */
interface TreeResponse {
  tree: GitHubFile[];
  /** `true` when the tree was truncated by GitHub (too many entries). */
  truncated: boolean;
}

/** Regex matching the file extensions analysed by the TypeScript/JS pipeline. */
const SUPPORTED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Regex matching paths that should be excluded from analysis.
 * Covers generated artefacts, test directories, and Git internals.
 */
const IGNORE_PATHS = /(node_modules|dist|build|\.next|coverage|__tests__|\.git)/;

/** Maximum number of files fetched from the repository tree per request. */
const FILE_LIMIT = 200;

/**
 * Returns the HTTP headers required for GitHub API requests.
 * Adds a Bearer token when provided, raising the rate limit from
 * 60 to 5 000 requests per hour.
 */
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
