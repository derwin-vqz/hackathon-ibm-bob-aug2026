
import fs from 'fs/promises';


export const CODELOAD_ORIGIN = 'https://codeload.github.com';
export const DEFAULT_REF = 'HEAD';

const SUPPORTED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORE_PATHS = /(node_modules|dist|build|\.next|coverage|__tests__|\.git)/;

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

function generateDownloadUrl(owner: string, repo: string, ref: string): string {
  const escapedRef = ref.split('/').map(encodeURIComponent).join('/');
  //return `${CODELOAD_ORIGIN}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tar.gz/${escapedRef}`;
  return `${CODELOAD_ORIGIN}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zip/${escapedRef}`;
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

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