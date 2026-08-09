# Force-Graph Editor — Data Format & Scripting API

Force-graph pages (`.fg.json`) visualize node-link data as an interactive graph with drag, zoom, grouping, search, and BFS expansion.

## JSON Data Format

```json
{
  "type": "force-graph",
  "nodes": [
    { "id": "node-1", "title": "My Node", "level": 1, "shape": "circle" },
    { "id": "group-1", "title": "My Group", "isGroup": true }
  ],
  "links": [
    { "source": "node-1", "target": "node-2" },
    { "source": "group-1", "target": "node-1" }
  ],
  "options": {
    "rootNode": "node-1",
    "expandDepth": 3,
    "maxVisible": 500,
    "charge": -70,
    "linkDistance": 40,
    "collide": 0.7,
    "legend": {
      "levels": { "1": "Core modules", "root": "Entry point" },
      "shapes": { "circle": "TypeScript", "diamond": "React" }
    }
  }
}
```

### Node properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string (required) | Unique node identifier |
| `title` | string | Display label (defaults to `id` if omitted) |
| `level` | number (1-5) | Visual importance — level 1 is largest, level 5 smallest |
| `shape` | string | `circle`, `square`, `diamond`, `triangle`, `star`, `hexagon` |
| `isGroup` | boolean | If `true`, this is a group node (contains members) |
| *custom* | any | Any additional properties are displayed in tooltip and search |

**Indexed properties convention:** Properties with `#N` suffix (e.g., `function#1`, `class#2`) are treated as indexed — the `#N` suffix is stripped on display, allowing multiple values for the same logical key.

### Link format

`{ "source": "nodeId", "target": "nodeId" }` — both are string node IDs.

Links from a group node to another node indicate **group membership** (the target is a member of the source group).

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rootNode` | string | — | Root node ID for BFS expansion |
| `expandDepth` | number | — | BFS depth limit from root |
| `maxVisible` | number | 500 | Max visible nodes |
| `charge` | number | -70 | D3 charge force strength (repulsion between nodes; more negative = more spread) |
| `linkDistance` | number | 40 | D3 link force distance (desired link length in px) |
| `collide` | number | 0.7 | D3 collision force strength (0–1) |
| `legend` | object | — | Level/shape descriptions for the legend panel |

## `page.asGraph()` API Reference

Access via `execute_script`:

```javascript
const graph = await page.asGraph();
```

### Data Access

| Property / Method | Returns | Description |
|-------------------|---------|-------------|
| `graph.nodes` | `IGraphNode[]` | All nodes (cleaned, no D3 runtime fields) |
| `graph.links` | `{source, target}[]` | All links as ID pairs |
| `graph.nodeCount` | `number` | Total node count |
| `graph.linkCount` | `number` | Total link count |
| `graph.getNode(id)` | `IGraphNode \| undefined` | Get single node by ID |

### Selection

| Property / Method | Returns | Description |
|-------------------|---------|-------------|
| `graph.selectedIds` | `string[]` | Currently selected node IDs |
| `graph.selectedNodes` | `IGraphNode[]` | Currently selected nodes (cleaned) |
| `graph.select(ids)` | void | Replace selection with given IDs. Updates UI |
| `graph.addToSelection(ids)` | void | Add to current selection. Updates UI |
| `graph.clearSelection()` | void | Clear selection. Updates UI |

### Relationships

| Method | Returns | Description |
|--------|---------|-------------|
| `graph.getNeighborIds(nodeId)` | `string[]` | Real data-link neighbors (excludes group membership) |
| `graph.getVisualNeighborIds(nodeId)` | `string[]` | Visual neighbors (what user sees; links may route through groups) |
| `graph.getGroupOf(nodeId)` | `string \| undefined` | Group that contains this node |
| `graph.getGroupMembers(groupId)` | `string[]` | Direct members of a group |
| `graph.getGroupMembersDeep(groupId)` | `string[]` | All members recursively (includes sub-group members) |
| `graph.getGroupChain(nodeId)` | `string[]` | Group hierarchy: `[immediateGroup, parentGroup, ...]` |
| `graph.isGroup(nodeId)` | `boolean` | Whether node is a group node |

### Search

```javascript
const results = graph.search("auth controller");
// Returns: [{ nodeId, label, visible, matchedProps: [{ key, value }] }]
```

- Multi-word AND logic (same as UI search bar)
- Does NOT affect the UI — read-only query
- Searches node labels and all custom properties
- `includeHidden` parameter (default `true`): include nodes hidden by visibility filter

### Traversal

```javascript
const bfsResult = graph.bfs("root-node", 3);
// Returns: [{ id: "root-node", depth: 0 }, { id: "child-1", depth: 1 }, ...]
```

- `startId`: starting node
- `maxDepth` (optional): limit traversal depth
- `visual` (optional, default `false`): if `true`, follow visual links (group-aware); if `false`, follow real data links

### Analysis

```javascript
const components = graph.getComponents();
// Returns: [{ nodeCount: 100, rootId: "main-entry", nodeIds: [...] }, { nodeCount: 5, rootId: "orphan-1", nodeIds: [...] }]
```

- Finds disconnected subgraphs (connected components)
- Sorted by size (largest first)
- `rootId` — the graph's root node if it belongs to this component, otherwise the most connected node
- Only traverses real data links (group membership is ignored)
- Group nodes are excluded — only real data nodes appear in components

### State

| Property | Returns | Description |
|----------|---------|-------------|
| `graph.rootNodeId` | `string` | Current root node ID (empty string if none) |
| `graph.groupingEnabled` | `boolean` | Whether grouping is enabled |

## Editing Graph Data

The `page.asGraph()` API is **read-only** (query and analysis). To edit graph data, modify `page.content` JSON directly:

```javascript
// Read → parse → modify → write back
const data = JSON.parse(page.content);
data.nodes.push({ id: "new-node", title: "New Node", level: 3 });
data.links.push({ source: "existing-node", target: "new-node" });
page.content = JSON.stringify(data, null, 2);
```

**Important:**
- Always keep `"type": "force-graph"` at the root
- Use `graph.getNode(id)` or `graph.nodes` to read clean data (no D3 runtime fields like `x`, `y`, `vx`, `vy`)
- Do NOT read nodes from `JSON.parse(page.content)` on a live graph — they may contain D3 simulation fields. Use the API getters instead.
- Group nodes: set `isGroup: true` on the node, add links from the group to its members

## Examples

**Find all nodes connected to X:**
```javascript
const graph = await page.asGraph();
const neighbors = graph.getNeighborIds("my-module");
```

**What is selected?**
```javascript
const graph = await page.asGraph();
const selected = graph.selectedNodes;
```

**Search for modules containing "auth":**
```javascript
const graph = await page.asGraph();
const results = graph.search("auth");
```

**Select nodes that match criteria:**
```javascript
const graph = await page.asGraph();
const authNodes = graph.search("auth").map(r => r.nodeId);
graph.select(authNodes);
```

**Walk the graph from root (3 levels deep):**
```javascript
const graph = await page.asGraph();
const tree = graph.bfs(graph.rootNodeId, 3);
```

**Find disconnected parts of the graph:**
```javascript
const graph = await page.asGraph();
const components = graph.getComponents();
// components[0] is the largest subgraph
// Small components (nodeCount < 3) may be orphans worth investigating
```

**Get group structure:**
```javascript
const graph = await page.asGraph();
const members = graph.getGroupMembers("my-group");
const allMembers = graph.getGroupMembersDeep("my-group");
const chain = graph.getGroupChain("some-node"); // [parent-group, grandparent-group, ...]
```

## Errors & verification

- **`create_page` / `set_page_content` accept broken graph JSON silently** — the failure shows
  up in the editor, not in the tool result. Unparseable JSON renders as a parse-error message;
  structurally wrong JSON (e.g. a link pointing at a nonexistent node id) renders a partial or
  empty graph.
- **Verify**: `JSON.parse` the content yourself before writing it, keep `"type": "force-graph"`,
  and make sure every link's `source`/`target` matches a node `id`. To confirm the render,
  activate the page and `browser_snapshot({ pageId: "app" })` — a crashed editor shows
  `Editor crashed` plus the exception text.
- **`page.asGraph()` on a non-graph page** rejects — check `list_pages` for
  `editor: "graph-view"` first.
- **Writing `page.content` from stale parsed data**: if you `JSON.parse(page.content)` on a
  live graph, nodes may carry D3 runtime fields (`x`, `y`, `vx`, `vy`, `index`). Writing them
  back bloats the file and pins node positions. Read via `graph.nodes` / `graph.getNode(id)`
  (cleaned), modify, and merge into the parsed JSON only the fields you changed.
