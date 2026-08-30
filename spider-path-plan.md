# Spider Path Finder — Implementation Plan

## Overview

Add two draggable spider characters to the graph view:

- **Black spider** — marks the source node.
- **White spider** — marks the target node.

Once both are placed on graph nodes, the app finds every directed path from
source to target by traversing `GraphData.edges` on the client, then
visually highlights all nodes and edges that belong to any of those paths.
If no directed path exists, a message is displayed.

No backend changes are required. All new logic lives in the frontend.

## Confirmed Design Decisions

- **Spider snap-back:** When a spider is dropped on empty canvas (no node hit),
  it snaps back to its fixed home position in a corner of the graph area
  and is marked as unplaced.
- **Independent modes:** The existing neighbourhood-highlight (click a node to
  fade others) continues to work independently. Clicking a node does not
  affect spider placements or path highlights.
- **Path animation style:** Highlighted path edges use an animated white dashed
  line where the dashes continuously move forward along the edge direction,
  evoking a spider-web thread being traced. Implemented via a CSS `stroke-dashoffset`
  animation on a Cytoscape `line-dash-pattern` + `line-dash-offset` style rule
  driven by a `requestAnimationFrame` loop.

---

## Sub-Tasks

---

### Sub-Task 1 — Add path-finder algorithm

**Intent**
Implement a pure function that, given the graph's edge list and two node IDs,
returns all directed paths from source to target as arrays of node ID strings.
Keeping this as a standalone pure function makes it independently testable and
keeps `GraphView` free of graph-traversal logic.

**Expected Outcomes**
- A new file `client/src/utils/findAllPaths.ts` exports `findAllPaths(edges, sourceId, targetId): string[][]`.
- Returns an empty array when no directed path exists.
- Each path is an ordered list of node IDs from source to target inclusive.
- Cycles are avoided (a node cannot appear twice in the same path).

**Todo List**
1. Create `client/src/utils/findAllPaths.ts`.
2. Build an adjacency map (`Map<string, string[]>`) from the edge array for
   efficient neighbour lookup.
3. Implement iterative or recursive DFS starting at `sourceId`, collecting
   complete paths when `targetId` is reached.
4. Guard against cycles by tracking the set of visited node IDs per path.
5. Return all completed paths (empty array = no path exists).

**Relevant Context**
- Edge shape: `{ source: string; target: string }` — defined in
  `client/src/types.ts`.
- Edges are directed: `source` imports `target`.
- The edge array can be large; the adjacency map avoids O(n) scans per step.

**Status** `[x] done`

---

### Sub-Task 2 — Extend GraphView to accept and render path highlights

**Intent**
Make `GraphView` accept optional highlight data as a prop and apply a new
Cytoscape CSS class (`path-highlight`) to all nodes and edges that belong to
any found path. This must be a separate concern from the existing
neighbourhood-highlight logic.

**Expected Outcomes**
- `GraphView` accepts a new optional prop: `pathHighlight?: { nodeIds: Set<string>; edgeKeys: Set<string> }`.
- A second `useEffect` — dependent only on `pathHighlight` — applies / removes
  the `path-highlight` class without rebuilding the Cytoscape instance.
- A new Cytoscape style rule for `node.path-highlight` and `edge.path-highlight`
  gives path elements a distinct visual: white dashed lines on edges.
- A `requestAnimationFrame` loop animates the `line-dash-offset` property on
  path-highlighted edges to make the dashes appear to travel forward along
  each edge, evoking a spider-web thread being traced.
- When `pathHighlight` is `null` or `undefined`, no path classes are applied
  and the graph looks as it does today.

**Todo List**
1. Add `path-highlight` style rules to the existing stylesheet array inside
   the `cytoscape({...})` call in `GraphView.tsx`:
   - Edges: white color, dashed line (`line-dash-pattern`), increased width.
   - Nodes: white border to mark them as part of a path.
2. Add the optional `pathHighlight` prop to the `Props` type.
3. Add a second `useEffect([pathHighlight, cyRef])` that:
   a. Cancels any running `requestAnimationFrame` loop.
   b. Removes the `path-highlight` class from all elements.
   c. If `pathHighlight` is provided, adds the class to matching nodes and edges.
   d. Starts a `requestAnimationFrame` loop that increments `line-dash-offset`
      on each frame for all `edge.path-highlight` elements, making the dashes
      animate forward.
4. For edge matching: match on `(source, target)` pair using edge keys in
   `"source->target"` form, not on the synthetic `e{i}` ID.
5. Store the animation frame ID in a `useRef` so the cleanup function can
   cancel it when the component unmounts or highlights change.

**Relevant Context**
- Existing class-based styling is at `GraphView.tsx` lines 112–139
  (`node.faded`, `edge.highlighted`, `edge.faded`).
- The `useEffect([graph])` rebuilds the whole Cytoscape instance; the new
  `useEffect([pathHighlight])` must NOT rebuild it — it only mutates classes.
- `cyRef.current` holds the live Cytoscape instance between renders.

**Status** `[x] done`

---

### Sub-Task 3 — Add spider UI elements and drop-onto-node logic

**Intent**
Render two draggable HTML emoji/image elements (🕷 black and 🕸 white) as
overlay siblings of the `GraphView` canvas. When a spider is dropped over the
canvas, identify the Cytoscape node underneath the cursor and record it as
the source or target node ID in `App` state.

**Expected Outcomes**
- Two spider icons appear as floating overlays inside the graph area when a
  graph is loaded.
- Each spider can be dragged freely across the screen using the HTML Drag and
  Drop API or pointer events.
- On drop, the app resolves the Cytoscape node under the drop point via
  `cy.elementFromPoint(x, y)` and records the node ID.
- A spider that has been placed shows a small label beneath it displaying the
  name of the node it was dropped on.
- Dragging a placed spider to a new node updates the placement.
- Dragging a spider to empty canvas space (no node hit) cancels the placement
  for that spider (resets it to unplaced state).

**Todo List**
1. Create a `SpiderOverlay` component in `client/src/components/SpiderOverlay.tsx`.
2. Render two `div` elements (one black spider 🕷, one white spider 🕸) with
   `position: absolute` and `cursor: grab` styling.
3. Implement drag movement: update the `div` position on `pointermove` while
   the pointer is pressed (pointerdown / pointermove / pointerup).
4. On `pointerup`, call `cy.elementFromPoint(canvasX, canvasY)`.
   - If the result is a node: call `onSourcePlace(nodeId)` or
     `onTargetPlace(nodeId)` depending on which spider was dragged.
   - If no node hit: snap the spider back to its home position and call the
     callback with `null` to clear the placement.
5. Each spider has a **home position** — a fixed corner of the graph area
   (e.g. black spider: bottom-left; white spider: bottom-right). When unplaced,
   the spider rests at its home position.
6. `SpiderOverlay` receives `cyRef` (a `React.RefObject<cytoscape.Core>`) and
   two callbacks: `onSourcePlace` and `onTargetPlace`.
7. Render `SpiderOverlay` as a sibling of `GraphView` inside the
   `position: relative` wrapper in `App.tsx`.

**Relevant Context**
- The `position: relative` wrapper is at `App.tsx` line 99.
- `GraphView` already exposes `cyRef` as an internal ref; it will need to be
  lifted or forwarded so `SpiderOverlay` can call `elementFromPoint`.
- Use `React.forwardRef` on `GraphView` or lift `cyRef` into `App` as a
  `useRef` passed down as a prop — whichever is cleaner.
- Pointer event coordinates must be translated to Cytoscape canvas coordinates
  using `cy.container().getBoundingClientRect()`.

**Status** `[x] done`

---

### Sub-Task 4 — Wire state and path computation in App

**Intent**
Connect spider placements, path computation, and highlight data in `App` so
that placing both spiders automatically triggers the DFS and passes the result
to `GraphView`.

**Expected Outcomes**
- `App` holds two new state values: `sourceNodeId: string | null` and
  `targetNodeId: string | null`.
- Whenever both are non-null, `findAllPaths` is called with `graph.edges` and
  the result is stored as `pathHighlight` state.
- `pathHighlight` is passed to `GraphView` via the new prop from Sub-Task 2.
- When either spider is moved (ID changes or becomes null), `pathHighlight`
  is recalculated or cleared immediately.
- Switching to a new graph (new `Analyze` call) resets all spider and path
  state.

**Todo List**
1. Add `useState` entries for `sourceNodeId`, `targetNodeId`, and
   `pathHighlight` in `App.tsx`.
2. Add a `useEffect([sourceNodeId, targetNodeId, graph])` that calls
   `findAllPaths` and converts the result into
   `{ nodeIds: Set<string>, edgeKeys: Set<string> }`, or sets `null` if either
   ID is absent or no paths are found.
3. Reset `sourceNodeId`, `targetNodeId`, and `pathHighlight` inside
   `handleAnalyze` when a new analysis starts.
4. Pass `onSourcePlace` and `onTargetPlace` callbacks to `SpiderOverlay`.
5. Pass `pathHighlight` to `GraphView`.

**Relevant Context**
- `handleAnalyze` already resets `selectedNode` at line 22; add the spider
  resets there.
- `findAllPaths` from Sub-Task 1 returns `string[][]`; derive edge keys as
  `"source->target"` strings by iterating consecutive pairs in each path.

**Status** `[x] done`

---

### Sub-Task 5 — Add PathPanel: status and result display

**Intent**
Show the user a small overlay panel that describes the path-finding result:
how many paths were found, or a "no connection" message if none exist.
This mirrors the existing `NodePanel` pattern.

**Expected Outcomes**
- A `PathPanel` component renders in the top-left of the graph area (mirroring
  `NodePanel`'s top-right position) when both spiders are placed.
- Displays: source node label, target node label, number of paths found.
- When no path exists: shows a clear "No directed path" message.
- When only one spider is placed: shows a hint ("Place the second spider to
  find paths").
- When neither spider is placed: `PathPanel` is not rendered.

**Todo List**
1. Create `client/src/components/PathPanel.tsx`.
2. Accept props: `sourceNode: NodeData | null`, `targetNode: NodeData | null`,
   `pathCount: number | null`.
3. Style consistently with `NodePanel` (same dark panel, border, font sizes).
4. Render the panel in `App.tsx` inside the `status === 'done'` block,
   alongside `GraphView`, `NodePanel`, and `SpiderOverlay`.

**Relevant Context**
- `NodePanel` is positioned `top: 16, right: 16` — place `PathPanel` at
  `top: 16, left: 16` to avoid overlap.
- `NodeData` is already available in scope in `App.tsx`; look up the full
  node objects from `graph.nodes` using the spider IDs.

**Status** `[x] done`

---

## Implementation Order

The sub-tasks must be implemented in order — each one builds on the previous:

1. **findAllPaths** — pure function, no UI dependencies.
2. **GraphView highlight prop** — adds the rendering hook without any state.
3. **SpiderOverlay** — drag UI; needs `cyRef` forwarded from `GraphView`.
4. **App wiring** — connects all pieces together.
5. **PathPanel** — purely presentational; can be done any time after Sub-Task 4.
