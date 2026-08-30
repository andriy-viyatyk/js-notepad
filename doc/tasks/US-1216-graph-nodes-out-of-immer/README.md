# US-1216 - R5: graph nodes out of immer

## Goal

Correct the task scope from the verified source: the graph's full node collection is already a
plain `GraphDataModel` field, so no collection move is required. The remaining work is a truthful
comment at the visibility copy, a narrow fix for the expansion settings root-node list, and a
recorded correction to EPIC-077. This document plans work only; it does not implement anything.

## Background

### Governing pattern

`doc/architecture/state-management.md:68-86` says that an unbounded collection must be kept in a
plain model field, with only a version counter in Immer state. The exact mechanism is:

```ts
this.allResults.push(...rows);
this.state.update(s => { s.resultsVersion += 1; });
```

`src/renderer/components/file-search/FileSearchModel.ts:63-68,70-75,100-104,173-179` follows it:
`allResults` is a plain field, each IPC batch pushes into it, and one state update increments
`resultsVersion`. Its reset paths at `:223-231,279-293,358-371` clear the field and bump the
version. `src/renderer/editors/grid/GridEditor.ts:122-133` follows the related boundary rule:
rows are excluded from reactive state because Immer freezes them, while row counts remain reactive;
`_rows`/the grid own the live rows at `:125-130`, exposed by `liveRows()`/`rowsForGrid()` at
`:226-245`, and the callback comment at `:560-566` says that the grid owns mutable rows.

### Verified scope correction

This investigation checked EPIC-077 §C-1 statement 3, §C-2 correction 8, §C-4 US-1216, and the
§C-5 risk named "Immer removal changes freeze semantics". The epic premise is false for this
checkout. `GraphEditorState` at `src/renderer/editors/graph/GraphEditor.ts:46-63` has no full
`nodes` or `links` collection. The full source graph is already the plain
`GraphDataModel.sourceData` field at `src/renderer/editors/graph/GraphDataModel.ts:7-10,25-26`.
CRUD methods mutate `sourceData.nodes` directly, and `GraphEditor.parseContent` assigns parsed
arrays directly to that field at `GraphEditor.ts:791-795`.

The arrays in Immer state are bounded `selectedNodes` and `linkedNodes` snapshots
(`GraphEditor.ts:59-61,77-78`), not the full graph collection. Statement 3 is already satisfied
for this editor. Do not add `nodesVersion`, `markNodesChanged()`, or another notification channel:
the existing imperative mutation callbacks call `GraphEditor.rebuildAndRender()` directly, and
that is how the canvas learns about node changes.

### Investigation commands

Commands used during verification:

```text
Get-Content -Raw CLAUDE.md
Get-Content -Raw .claude/rules/task-docs.md
Get-Content -Raw doc/epics/EPIC-077.md
Get-Content -Raw doc/architecture/state-management.md
Get-Content src/renderer/editors/grid/GridEditor.ts
Get-Content src/renderer/components/file-search/FileSearchModel.ts
rg --files src/renderer/editors/graph
rg -n "(nodes|edges|links|produce|immer|freeze|frozen|subscribe|bind|version|position|layout|persist|serialize|state\.get|state\.update)" src/renderer/editors/graph
rg -n 'sourceData\??\.nodes|selectedNodes|linkedNodes' src/renderer/editors/graph --glob '*.ts'
rg -n -i "freeze|frozen|shallow|copy|clone|immer|produce" src/renderer/editors/graph
rg -n -i "autoFreeze|Object\.freeze|isFrozen|immer|freeze|frozen" src/renderer/editors/graph
rg -n "getAllNodes|GraphExpansionSettingsView|toolbarPanel|panelSwap|SubtreeSwap" src/renderer/editors/graph
```

## Investigation

### Node collection: every writer

The authoritative collection is `GraphDataModel.sourceData.nodes`. Direct writers found across
`editors/graph/**` are:

| File:line | Writer |
|---|---|
| `GraphEditor.ts:162` | Initializes `sourceData` with empty `nodes` and `links`. |
| `GraphEditor.ts:792-795` | Replaces parsed `sourceData` with JSON `nodes` and `links`. |
| `GraphDataModel.ts:38` | `addNode()` pushes a node. |
| `GraphDataModel.ts:45` | `deleteNode()` replaces the array after filtering. |
| `GraphDataModel.ts:65` | `renameNode()` mutates the matching node ID. |
| `GraphDataModel.ts:90-92` | `updateNodeProps()` deletes/sets node properties. |
| `GraphDataModel.ts:100` | `addChild()` pushes a node. |
| `GraphDataModel.ts:163` | `applyLinkedNodesUpdate()` pushes a newly referenced node. |
| `GraphDataModel.ts:198-204` | `applyPropertiesUpdate()` deletes/sets node properties. |
| `GraphDataModel.ts:399` | `removeLinkSmart()` replaces the array when an orphan is removed. |
| `GraphGroupActionsModel.ts:175` | `ungroupNode()` replaces the array after removing the group. |
| `GraphGroupActionsModel.ts:311` | `createGroup()` pushes a group node. |

### Node collection: every direct reader

| File:line | Read |
|---|---|
| `GraphEditor.ts:325-326` | `getAllNodes()` returns source nodes to expansion settings. |
| `GraphEditor.ts:520` | `recordsCount` reads the length. |
| `GraphEditor.ts:533` | `isEmpty` reads the length. |
| `GraphEditor.ts:541` | `hasGroups` scans group flags. |
| `GraphEditor.ts:597` | Context-menu handling finds the clicked node. |
| `GraphEditor.ts:645,654` | Selection refresh finds selected nodes and linked snapshots. |
| `GraphEditor.ts:668,675` | Post-edit selection refresh finds selected nodes and linked snapshots. |
| `GraphEditor.ts:697` | `rebuildAndRender()` reads source `nodes` and `links`. |
| `GraphEditor.ts:757` | Serialization reads source `nodes`. |
| `GraphDataModel.ts:45` | `deleteNode()` reads before filtering. |
| `GraphDataModel.ts:61,63` | `renameNode()` checks duplicates and finds the target. |
| `GraphDataModel.ts:83` | `updateNodeProps()` finds the target. |
| `GraphDataModel.ts:162,171` | Linked-node update checks for and finds a node. |
| `GraphDataModel.ts:194` | Property update finds the target. |
| `GraphDataModel.ts:335,343` | ID generators scan existing IDs. |
| `GraphDataModel.ts:366` | `getNodeLabel()` finds a node. |
| `GraphDataModel.ts:399` | Orphan cleanup reads before filtering. |
| `GraphGroupActionsModel.ts:38-39,102,144,157,182,288` | Group actions find, partition, and inspect source nodes. |
| `GraphMutationModel.ts:114,136` | Export and extraction build selected node data. |
| `GraphTooltipModel.ts:106-107` | Hover status reads selected and hovered source nodes. |

The downstream array pipeline is also verified: `GraphEditor.ts:711,715,718` sends arrays to
`GraphGroupModel.rebuild/preprocess` and `GraphConnectivityModel.rebuild`; `:723,726` sends
processed nodes to `GraphVisibilityModel.setFullGraph/updateGraph`; `GraphVisibilityModel.ts:51,80,173`
rebuilds from them; `GraphGroupModel.ts:32,135` and `GraphConnectivityModel.ts:29` analyze them;
`ForceGraphRenderer.ts:111,124,255` owns the derived D3 graph; and `GraphSearchModel.ts:91-110`
reads visible/hidden derived nodes. None reads a full node collection from Immer state.

The separate bounded state accesses are `GraphEditor.ts:59-61,77-78,642-657,668-679`,
`GraphBodyView.ts:78,86-87,474-475,505,517,541,590-593,638`,
`GraphLegendPanelView.ts:466-467,609,618`, `GraphDetailPanelView.ts:187,228,291,323,415-429,512-534,594-639`,
and `GraphMutationModel.ts:214-221`. These are selection/linked snapshots and are not the source
collection.

### Freeze semantics, both directions

The requested site is verified at `src/renderer/editors/graph/GraphVisibilityModel.ts:124-125`:

> `// Shallow copy — original nodes may be frozen by immer (state management),`
> `// and D3 needs to add mutable properties (x, y, vx, vy, index).`

The comment's Immer premise is false here, but the spread immediately below at `:126-131` is
required. It allocates a new object so `_$showIndex` and `_$hiddenCount` can be added without
mutating a source node, and so D3's mutable `x`, `y`, `vx`, `vy`, and `index` fields remain on
renderer-owned records rather than on nodes serialized to disk. Only the comment is wrong; the
copy is not a workaround to delete or relocate.

The source-side code depends on mutable nodes: `GraphDataModel.ts:38,45,65,90-92,100,163,198-204,399`
and `GraphGroupActionsModel.ts:175,311` mutate source records or arrays. The renderer-side code
depends on mutable D3 records at `ForceGraphRenderer.ts:140-151,564-588`. The other ownership
boundaries are `GraphVisibilityModel.ts:126-131`, `GraphEditor.ts:731`, and clean export/snapshot
copies from `GraphDataModel.cleanNode` at `:319-327`.

The state snapshots are read-only in their consumers: selection records are copied at
`GraphEditor.ts:646-651,669-674`, linked records are cleaned at `GraphConnectivityModel.ts:81-92`,
and tooltip records are copied at `GraphTooltipModel.ts:57-60`. The graph-scoped freeze search
found no other `freeze`, `frozen`, `immer`, or `produce` workaround. These ordinary copies must not
be removed mechanically.

EPIC-077 §C-4's instruction to drop the frozen-node workaround and §C-6 criterion 3 requiring its
deletion are therefore wrong. The workaround does not exist as described; the copy is required and
only its comment was false. This finding must be carried into the epic's Notes when the epic closes.

### View notification and lifecycle

The canvas learns about source-node changes from mutation callbacks at
`GraphMutationModel.ts:52,61-62,185,229`, through `finalize()` at `:227-229`, which calls
`GraphEditor.rebuildAndRender()`. Parsing calls it at `GraphEditor.ts:814`. The footer uses the
separate derived count at `GraphEditor.ts:104,526-529`, read/bound by `index.ts:122,129`.
`GraphBodyView.ts:638` binds the editor projection for error/loading/search/selection/grouping; it
does not bind a full source-node collection.

`GraphExpansionSettingsView.ts:77` constructs `items` from `editor.getAllNodes()` at `:126`, and
its only binding at `:115` watches local scalar model state. `GraphBodyView.ts:504` constructs it
when the expansion panel opens. `SubtreeSwap.set()` at
`src/renderer/uikit/shared/subtree-swap.ts:15-75` retains the view for the same key and disposes
it when the key changes or closes; reopening creates a fresh view and re-reads the nodes. While the
panel remains open, however, its `onUpdate` at `GraphExpansionSettingsView.ts:118-122` only calls
`driver.update`, so the root list can go stale after add/delete/rename/reparse.

The narrow fix is to refresh `getAllNodes()` in the view's construction/update path and pass the
new items to the existing select before `driver.update()` (or via the existing state sync helper),
preserving the current selected-root behavior. No editor-wide version or subscription is needed.
There is no selector reading a full node collection from state; `GraphLegendPanelView.ts:466-467`
reads only bounded selection snapshots.

### Links, persistence, and layout

`SourceData` has `nodes`, `links`, and optional `options` at `GraphDataModel.ts:7-10`; there is no
`edges` field. Parsing restores both arrays at `GraphEditor.ts:791-795`, and node/group operations
update links alongside nodes, including `GraphDataModel.deleteNode` at `:42-50`, `addChild` at
`:97-102`, and `GraphGroupActionsModel.ungroupNode` at `:157-175`. Links stay beside nodes in the
already-plain `sourceData`; they do not need to move.

`GraphEditor.serializeToHost` writes `sourceData.nodes`, `sourceData.links`, and optional
`sourceData.options` at `:753-763`. Physics options are persisted at `:241-265`, and expansion/root
options at `:275-321`. Runtime D3 layout is separate: `ForceGraphRenderer.graphData` at `:52`
and its `x/y/vx/vy` updates at `:124-163` are not serialized. Existing input positions remain in
source records and are serialized; the planned comment-only visibility change and expansion-list
refresh do not change persisted shape or layout behavior.

## Implementation Plan

1. Keep `GraphDataModel.sourceData.nodes` as the authoritative plain collection. Do not add
   `nodesVersion`, `markNodesChanged()`, state collection selectors, or a second notification
   mechanism. Leave existing mutation callbacks and `rebuildAndRender()` orchestration unchanged.
2. At `GraphVisibilityModel.ts:124-125`, replace only the two misleading comment lines with the
   source/D3 ownership explanation. Keep the spread construction at `:126-131` exactly, including
   the derived `_$` fields; it must not be deleted or relocated.
3. Fix `GraphExpansionSettingsView.ts` narrowly: refresh its node-derived items on construction and
   in `onUpdate`, then update the existing select props. The panel lifecycle at `GraphBodyView.ts:504`
   already guarantees a fresh read when reopened; the update-path refresh covers changes while open.
4. Keep links with `sourceData`, preserve the JSON shape and runtime position behavior, and carry
   the false EPIC-077 C-4/C-6 frozen-workaround acceptance wording into the epic Notes at close.
5. After implementation, rerun the recorded searches and manually verify expansion open/update/
   close/reopen/reparse behavior plus the existing rebuild, grouping, selection, search, visibility,
   serialization, and D3 ownership paths. Do not add tests, test harnesses, dashboard entries, or a
   commit.

## Concerns

The central finding is a stale epic premise, not an unresolved design choice: statement 3 is already
satisfied because the full source nodes are plain `GraphDataModel.sourceData.nodes`. The remaining
scope is intentionally small: one truthful comment, one stale-list fix, and the recorded epic
correction.

The visibility spread is load-bearing source/D3 isolation. Calling it a frozen-node workaround or
deleting it would allow view-derived `_$` fields and mutable D3 fields to contaminate source records
and potentially serialized data. Only the comment should change.

The expansion list is stale only for an instance kept open across source changes; opening/reopening
already recreates the view. The local update-path refresh is preferred over introducing an
editor-wide change signal. If the parent does not invoke that existing update path for a particular
source mutation, record that limitation during verification rather than reintroducing
`nodesVersion`/`markNodesChanged()` through another route.

## Acceptance Criteria

- [ ] The document and implementation confirm that full source nodes already live in the plain
      `GraphDataModel.sourceData.nodes`; no collection move, `nodesVersion`, or `markNodesChanged()`
      wiring is added.
- [ ] The two-line comment at `GraphVisibilityModel.ts:124-125` no longer mentions Immer/frozen
      nodes and explains source/D3 ownership isolation. The spread at `:126-131` and its derived
      fields remain unchanged.
- [ ] `GraphExpansionSettingsView` re-reads `getAllNodes()` on construction and update, refreshes
      the root select while open, and is correct after node add/delete/rename/reparse and after
      close/reopen, without an editor-wide version subscription.
- [ ] The existing imperative `rebuildAndRender()` path remains the canvas notification mechanism;
      no selector reads a full node collection from state, and bounded selection snapshots remain
      separate.
- [ ] Freeze behavior is documented in both directions: source CRUD remains mutable, D3 receives
      renderer-owned mutable records, and no other graph-scoped frozen workaround was found.
- [ ] Links remain in `GraphDataModel.sourceData`; serialized JSON remains `nodes`, `links`, and
      optional `options`, with physics/expansion options and runtime layout behavior unchanged.
- [ ] The document records the exact writer/reader inventory, lifecycle evidence, commands, and
      files needing no changes. EPIC-077 C-4/C-6's false workaround acceptance is explicitly marked
      for the epic Notes at close.
- [ ] No tests or test harnesses are added, no dashboard entry is added, and no commit is created.

## Files needing no changes

These files were inspected and do not need changes for this corrected scope:

| File | Reason |
|---|---|
| `GraphEditor.ts` | Already owns the plain source model and imperative rebuild path. |
| `GraphDataModel.ts` | Already owns mutable plain `sourceData.nodes` and `links`. |
| `GraphGroupActionsModel.ts` | Existing group mutation orchestration remains valid. |
| `GraphMutationModel.ts` | Existing mutation callbacks already rebuild the renderer. |
| `types.ts` | Node/link shapes and serialization helpers only. |
| `GraphConnectivityModel.ts` | Derived indexes from passed arrays only. |
| `GraphGroupModel.ts` | Derived grouping indexes from passed arrays only. |
| `GraphSearchModel.ts` | Searches visibility/renderer outputs only. |
| `ForceGraphRenderer.ts` | Owns mutable D3 graph data and runtime positions. |
| `GraphTooltipModel.ts` | Reads source nodes; owns no collection. |
| `GraphBodyView.ts` | Existing selection projection and panel lifecycle are sufficient. |
| `GraphLegendPanelView.ts` | Observes bounded selection snapshots only. |
| `GraphDetailPanelView.ts` | Consumes selection/linked snapshots only. |
| `GraphContextMenu.ts`, `GraphIcons.ts`, `shapeGeometry.ts`, `constants.ts` | Menu, icons, geometry, and constants only. |
| `index.ts` | Count/status wiring, not source-node ownership. |
| `GraphTuningSlidersView.ts` | Force controls only. |
| `GraphLegendPanel.css`, `GraphDetailPanel.css`, `GraphBody.css`, `GraphTooltip.css` | Styling only. |
| `GraphExpansionSettings.css`, `GraphTuningSliders.css` | Styling only. |

## Files in the corrected implementation scope

| File | Planned change |
|---|---|
| `doc/tasks/US-1216-graph-nodes-out-of-immer/README.md` | This investigation and corrected plan. |
| `GraphVisibilityModel.ts` | Comment only; retain the ownership copy. |
| `GraphExpansionSettingsView.ts` | Refresh node-derived root-select items on construction/update. |
