# Code GPS

Interactive dependency visualizer for GitHub repositories.

## Requirements

- Node.js 18+
- npm

## Installation

```bash
# Backend
cd server && npm install

# Frontend
cd ../client && npm install
```

## Development

Open **two terminals**:

```bash
# Terminal 1 — server (port 3001)
cd server && npm run dev

# Terminal 2 — client (port 5173)
cd client && npm run dev
```

Then open http://localhost:5173

## Usage

1. Paste a GitHub repository URL (e.g. `https://github.com/flutter/flutter`)
2. Click **Analyze**
3. Explore the graph — click any node to highlight its direct dependencies
4. The right panel shows metrics for the selected node

### GitHub Token (optional)

Without a token: 60 requests/hour. With a PAT: 5 000 requests/hour.
Click **🔑 Token** to enter one. Read-only public access is sufficient.

## Structure

```
server/
  src/
    index.ts            — Express API (GET /api/repo)
    github-ingester.ts  — Downloads a GitHub repo as a ZIP via codeload
    analyzer.ts         — Extracts the ZIP, parses Dart imports, builds graph
client/
  src/
    App.tsx             — Main UI: form, state machine, layout
    types.ts            — Shared TypeScript types (NodeData, EdgeData, GraphData)
    components/
      GraphView.tsx     — Interactive Cytoscape.js graph canvas
      NodePanel.tsx     — Details panel for the selected node
      StatsBar.tsx      — Global graph metrics (file count, coupling, etc.)
```

## How it works

1. The client sends `GET /api/repo?repo=<url>` to the backend.
2. The backend downloads the repository as a ZIP archive from GitHub's
   codeload service (`codeload.github.com/{owner}/{repo}/zip/HEAD`).
3. The analyzer extracts the ZIP, walks the file tree, and reads every
   `.dart` file.
4. Import statements are parsed and resolved against the project's own
   file set (standard library and external packages are excluded).
5. The resulting `GraphData` — nodes (files) and edges (imports) — is
   returned as JSON and rendered in the browser.

## Current limitations

- Only **Dart** repositories are supported (requires a `pubspec.yaml`).
- Only `dart:*`, `package:<own-project>/*`, and relative imports are
  resolved; imports from external pub packages are ignored.
- No file count cap is enforced yet (`truncated` is always `false`).
