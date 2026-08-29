import express from 'express';
import cors from 'cors';
import { parseRepoUrl, getDefaultBranchSha, fetchRepoTree, fetchFileContent } from './github';
import { parseGitHubUrl, downloadRepo } from './github-ingester';
import { buildGraph } from './analyzer';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/**
 * GET /api/analyze?repo=<github_url>&token=<optional_pat>
 *
 * Flow:
 * 1. Parse the repo URL
 * 2. Get the HEAD SHA
 * 3. Download the file tree
 * 4. Download each file's content (in parallel, batches of 10)
 * 5. Build and return the graph
 *
 * TS concept: `async/await` + `Promise.all` for parallelism.
 * Promise.all([p1, p2, p3]) waits for ALL of them at once —
 * much faster than awaiting them one by one.
 */

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

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
