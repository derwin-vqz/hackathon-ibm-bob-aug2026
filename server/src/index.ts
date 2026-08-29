/**
 * Code GPS — Express API server (port 3001).
 *
 * Single active endpoint:
 *   GET /api/repo?repo=<github_url>[&token=<pat>]
 *
 * The server downloads the requested GitHub repository as a ZIP archive
 * via github-ingester, then hands the buffer to the analyzer which
 * extracts it, parses Dart imports, and returns a dependency graph.
 */
import express from 'express';
import cors from 'cors';
import { parseRepoUrl, getDefaultBranchSha, fetchRepoTree, fetchFileContent } from './github';
import { parseGitHubUrl, downloadRepo } from './github-ingester';
import { buildGraph } from './analyzer';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/*
app.get('/api/analyze', async (req, res) => {
  const repoUrl = req.query['repo'] as string | undefined;
  const token = req.query['token'] as string | undefined;

  if (!repoUrl) {
    res.status(400).json({ error: '"repo" query parameter is required' });
    return;
  }

  try {
    const { owner, repo } = parseRepoUrl(repoUrl);
    console.log(`[analyze] ${owner}/${repo}`);

    const sha = await getDefaultBranchSha(owner, repo, token);
    console.log(`[analyze] SHA: ${sha}`);

    const files = await fetchRepoTree(owner, repo, sha, token);
    console.log(`[analyze] ${files.length} files found`);

    // Download in batches of 10 to avoid saturating the GitHub API
    const BATCH_SIZE = 10;
    const fileContents = new Map<string, string>();

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (f) => ({
          path: f.path,
          content: await fetchFileContent(owner, repo, f.path, token),
        }))
      );
      for (const { path, content } of results) {
        if (content) fileContents.set(path, content);
      }
    }

    console.log(`[analyze] ${fileContents.size} files downloaded`);
    const graph = buildGraph(fileContents);
    console.log(`[analyze] ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

    res.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analyze] Error:', message);
    res.status(500).json({ error: message });
  }
});
*/

/** Simple liveness probe used to verify the server is reachable. */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * GET /api/repo?repo=<github_url>[&token=<pat>]
 *
 * Query parameters:
 *   repo   — Full GitHub repository URL (required).
 *             Supports https://github.com/{owner}/{repo}[/tree/{ref}]
 *   token  — GitHub Personal Access Token (optional).
 *             Increases the rate limit from 60 to 5 000 requests/hour.
 *
 * Response: GraphData JSON  { nodes, edges, truncated }
 *           or { error: string } with an appropriate HTTP status code.
 */
app.get('/api/repo', async (req, res) => {
  const repoUrl = req.query['repo'] as string | undefined;
  const token = req.query['token'] as string | undefined;

  try {
    if (!repoUrl) {
      res.status(400).json({ error: '"repo" query parameter is required' });
      return;
    }
    const { owner, repo, ref } = parseGitHubUrl(repoUrl);
    const fileContents = await downloadRepo(owner, repo, ref, token);

    const graph = await buildGraph(fileContents);
    
    res.json(graph);
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Code GPS server running on http://localhost:${PORT}`);
});
