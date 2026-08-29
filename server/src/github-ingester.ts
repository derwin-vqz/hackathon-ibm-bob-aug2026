
/**
 * GitHub repository downloader.
 *
 * Uses GitHub's codeload service (codeload.github.com) to download a
 * repository as a ZIP archive without requiring the Git CLI or the
 * GitHub Trees API.  The ZIP buffer is returned directly to the caller
 * so it can be passed to the analyzer for in-memory extraction.
 */

import fs from 'fs/promises';


/** Base URL of GitHub's codeload download service. */
export const CODELOAD_ORIGIN = 'https://codeload.github.com';

/** Git ref used when the URL does not specify a branch or tag. */
export const DEFAULT_REF = 'HEAD';

/**
 * Parses a GitHub repository URL into its owner, repo, and optional ref.
 *
 * Accepted formats:
 *   https://github.com/{owner}/{repo}
 *   https://github.com/{owner}/{repo}.git
 *   https://github.com/{owner}/{repo}/tree/{branch-or-tag}
 *
 * Throws if the URL does not match a recognised GitHub URL pattern.
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string; ref: string } {
  // Matches: https://github.com/{owner}/{repo}[/tree/{ref}]
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/(.+))?$/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return {
    owner: match[1],
    repo:  match[2].replace(/\.git$/, ''),
    ref:   match[3] ?? DEFAULT_REF,
  };
}

/**
 * Builds the codeload ZIP download URL for a given owner/repo/ref.
 * Ref segments are individually percent-encoded to handle slashes in
 * branch names (e.g. "feature/my-branch").
 */
function generateDownloadUrl(owner: string, repo: string, ref: string): string {
  const escapedRef = ref.split('/').map(encodeURIComponent).join('/');
  return `${CODELOAD_ORIGIN}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zip/${escapedRef}`;
}

/**
 * Returns the HTTP headers required for GitHub API / codeload requests.
 * If a Personal Access Token is supplied it is added as a Bearer token,
 * which raises the rate limit from 60 to 5 000 requests per hour.
 *
 * TS concept: `Record<string, string>` is shorthand for an object type
 * whose keys and values are both strings — equivalent to `{ [key: string]: string }`.
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
 * Downloads a GitHub repository as a ZIP archive and returns its raw bytes.
 *
 * @param owner  - GitHub username or organisation name.
 * @param repo   - Repository name.
 * @param ref    - Branch, tag, or commit SHA to download (defaults to HEAD).
 * @param token  - Optional GitHub PAT for higher rate limits.
 * @returns      A Node.js Buffer containing the full ZIP archive.
 *
 * TS concept: `Promise<Buffer<ArrayBuffer>>` means this async function
 * eventually resolves to a Buffer.  The `async/await` syntax lets you
 * write asynchronous code that reads like synchronous code.
 */
export async function downloadRepo(
  owner: string,
  repo: string,
  ref: string,
  token?: string
): Promise<Buffer<ArrayBuffer>> {
  const downloadUrl = generateDownloadUrl(owner, repo, ref);
  const res = await fetch(
    downloadUrl,
    { headers: githubHeaders(token) }
  );
  
  if (!res.ok) throw new Error(`GitHub codeload error ${res.status}: ${res.statusText}`);
  if (!res.body) throw new Error('Response body is empty');
  
  const buffer = Buffer.from(await res.arrayBuffer());

  return buffer;
}