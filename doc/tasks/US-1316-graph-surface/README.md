# US-1316: The graph surface

Epic: [EPIC-086](../../epics/EPIC-086.md) - Task 7 of 8 in the page node redesign and the
text-and-preview editor family.

Status: Planned; investigation complete, implementation not started.

## Goal

Complete the `graph-view` AI-vision surface through `pages[i].editor`: expose a page-scoped,
curated inventory of the graph chrome; document the editor-internal detail and legend panels, the
force-tuning and expansion panels, and the transient menus; and extend the existing
`GraphEditorFacade` only where its current data/query members do not already answer the same
question.

The surface must be honest about conditions and rendering limits. In particular, a missing
selection-dependent control remains `visible: false`, and canvas-drawn graph nodes are not
declared as DOM elements that could never be found or highlighted.

## Background

### Epic decisions and the corrected control count

EPIC-086 decision 12 calls graph one task because it combines the largest editor facade with
toolbar controls, two panels, a popover, a context menu, and expansion settings
([EPIC-086.md:164-166](../../epics/EPIC-086.md:164)). The number **26** in the epic table does not
match the current source if it means already-emitted actionable `data-name` values.

The verified source count is **19 existing named controls**:

| Location | Existing named controls | Evidence |
|---|---:|---|
| Main graph toolbar and image toolbar | 8 | `graph-settings`, `graph-toggle-grouping`, `graph-reset-view`, `graph-expand-all`, `graph-search`, and `graph-search-clear` are created/updated in `GraphBodyView.ts:404-409,500-560`; `graph-open-in-draw` and `graph-copy-image` are emitted in `graph/index.ts:44-79`. |
| Detail panel | 4 | `graph-detail-id` and `graph-detail-title` are emitted by `GraphDetailPanelView.ts:510-511`; the links and properties grids use `graph-links-grid` and `graph-properties-grid` at `GraphDetailPanelView.ts:633` and `:713`. |
| Legend panel | 0 | `GraphLegendPanelView.ts:438-450` creates the panel and header with class names only; its tabs at `:267-273`, selection rows at `:171-181`, and legend rows at `:111-129` have no `data-name`. |
| Force-tuning panel | 4 | The three generated slider names are `tuning-charge`, `tuning-link-distance`, and `tuning-collide` from `GraphTuningSlidersView.ts:29-39,107-116`; reset is `tuning-reset` at `:119-126`. |
| Expansion-settings panel | 3 | `graph-expansion-root`, `graph-expansion-depth`, and `graph-expansion-max` are emitted at `GraphExpansionSettingsView.ts:142-175`. |
| **Total already in source** | **19** | Counted from the source rows above; structural names such as `graph-body`, `graph-body-content`, `graph-expansion-settings`, and `graph-tuning` are containers, not controls. |

There are also seven stable interactive controls with no name: the conditional selected-count
menu trigger and three graph-body panel tabs at `GraphBodyView.ts:345-352,413-421,449-450`, plus
the three detail tabs at `GraphDetailPanelView.ts:371-385`. Naming those seven gives the epic's
intended **19 + 7 = 26 named control** budget. It is not an exhaustive count of every native
button: detail level/shape buttons (`GraphDetailPanelView.ts:517-520,539-544`), search-result
actions (`GraphBodyView.ts:271-284,314-320`), legend rows, and Apply/Cancel buttons are additional
interactive DOM controls. They are addressed below as an explicit curation boundary rather than
inflating the 26 figure or pretending the number came from the current source.

### Page scope and element contract already available

US-1311 already supplies the infrastructure this facade should consume. `createElements` resolves
declared names, prefixes page selectors, computes literal visibility with `offsetParent`, and
passes the same resolved selector to the highlighter
([`elements.ts:64-75,90-97,117-143`](../../../src/renderer/scripting/ai-vision/elements.ts:64));
`pageScopeSelector` and `activatePageAndWaitForLayout` identify the page and wait for its retained
slot to have a layout box ([`page-elements.ts:5-40`](../../../src/renderer/scripting/ai-vision/page-elements.ts:5)).
The graph facade must use `editor.page?.id` in the same way as `TextEditorFacade`
([`TextEditorFacade.ts:35-48`](../../../src/renderer/scripting/api-wrapper/TextEditorFacade.ts:35)).

The UI contract makes `data-name` the semantic handle and says not to rename load-bearing
`data-type` attributes ([`ui-element-contract.md:7-30`](../../architecture/ui-element-contract.md:7)).
All new names in this task are additive. No existing `data-type` is to be renamed.

### Complete curated inventory

The following is the implementation inventory. Existing names remain byte-for-byte unchanged;
planned additions identify the exact owning view and current source line where the attribute will
be added. All declarations will be page-scoped by the existing resolver. The list is curated, not
DOM reflection: it includes stable chrome and panel entry points, not every repeated grid cell or
data-driven legend row.

#### Main toolbar

| `data-name` | Status / source | Purpose | Condition and visibility |
|---|---|---|---|
| `graph-open-in-draw` | Existing, `graph/index.ts:63-70` | Open the current graph image in a Drawing page. | Present with the graph editor toolbar; `visible: false` while the graph content branch is absent. |
| `graph-copy-image` | Existing, `graph/index.ts:73-80` | Copy the rendered graph image to the clipboard. | Same toolbar condition; the facade action must throw if the mounted view/canvas is unavailable. |
| `graph-settings` | Existing, `GraphBodyView.ts:404,500,558` | Open or close the force-tuning panel. | Present in loaded graph content; `visible: false` during loading/error. |
| `graph-toggle-grouping` | Existing, `GraphBodyView.ts:405,501,559` | Toggle group-node rendering. | Present in loaded content and disabled when `GraphEditor.hasGroups` is false (`GraphBodyView.ts:559`; `GraphEditor.ts:539-542`). Disabled is still visible; absent content is not. |
| `graph-reset-view` | Existing, `GraphBodyView.ts:406,502` | Rebuild the graph view from its current root and visibility state. | Present in loaded content. |
| `graph-expand-all` | Existing, `GraphBodyView.ts:407,503` | Reveal all graph nodes. | Present in loaded content; disabled when `hasVisibilityFilter` is false (`GraphBodyView.ts:503`; `GraphEditor.ts:433-435`). |
| `graph-search` | Existing, `GraphBodyView.ts:409,560` | Enter the UI search query for graph nodes. | Present in loaded content. |
| `graph-search-clear` | Existing, `GraphBodyView.ts:408,504` | Clear the current UI search query. | The button is created and mounted once (`GraphBodyView.ts:345-353,455`), then attached as the input end slot only when `searchQuery` is non-empty (`GraphBodyView.ts:560`). When empty it remains owned but detached, has no layout box, and therefore reports `visible: false`. |
| `graph-selection-menu` | **Add** to the conditional trigger only at `GraphBodyView.ts:345,400-401,450` | Open actions for the current selection. | Only when at least one node is selected (`GraphBodyView.ts:496`); no selection means `visible: false`. Do not name the always-present toolbar/container element. |
| `graph-panel-physics` | **Add** in the `GraphBodyView.ts:413-421` tab-button loop | Select the force-tuning panel. | Only while the graph body is loaded; the panel is mounted when toolbar state is `settings` (`GraphBodyView.ts:513-527`). |
| `graph-panel-expansion` | **Add** in `GraphBodyView.ts:413-421` tab-button loop | Select expansion settings. | Same loaded/toolbar condition. |
| `graph-panel-results` | **Add** in `GraphBodyView.ts:413-421` tab-button loop | Select search results. | Only when the Results tab is exposed; search-result state opens it when results exist (`GraphBodyView.ts:747-771`). |

The three body-tab names must be assigned from this literal stable model-key map, never from a
display label or array index (the Results tab can be conditionally absent):

```ts
const GRAPH_PANEL_TAB_NAMES: Record<"settings" | "expansion" | "results", string> = {
    settings: "graph-panel-physics",
    expansion: "graph-panel-expansion",
    results: "graph-panel-results",
};
```

The existing force-tuning controls are part of the same toolbar surface but remain a separate
popover/panel branch in the count:

| `data-name` | Status / source | Purpose | Condition and visibility |
|---|---|---|---|
| `tuning-charge` | Existing, generated by `GraphTuningSlidersView.ts:107-116` | Adjust D3 charge/repulsion. | Visible only while the Physics panel is mounted. |
| `tuning-link-distance` | Existing, generated by `GraphTuningSlidersView.ts:107-116` | Adjust desired link distance. | Same Physics-panel condition. |
| `tuning-collide` | Existing, generated by `GraphTuningSlidersView.ts:107-116` | Adjust collision force. | Same Physics-panel condition. |
| `tuning-reset` | Existing, `GraphTuningSlidersView.ts:119-126` | Restore the default force parameters. | Same Physics-panel condition. |

`GraphBodyView.ts:523-527` constructs `GraphTuningSlidersView`, `GraphExpansionSettingsView`,
or `SearchPanelView` inside the same `graph-body-panel`; the source does not use the UIKit
`Popover` primitive. The implementation plan therefore calls these toolbar branches
“panels/popovers” only as user-facing behavior and must describe the actual DOM ownership.

#### Detail panel

The detail overlay is editor-internal. Its stable curated controls are:

| `data-name` | Status / source | Purpose | Condition and visibility |
|---|---|---|---|
| `graph-detail-panel` | **Add** to the root `createPanelElement` at `GraphDetailPanelView.ts:242-245` | Identify the graph's selected-node detail overlay. | The root remains laid out with graph content even with no selection; its header is dimmed and non-interactive by opacity/pointer-events (`GraphDetailPanelView.ts:266-276`; `GraphDetailPanel.css:2-30`), so `visible: true` is correct while detail body controls are absent. |
| `graph-detail-toggle` | **Add** to the header action at `GraphDetailPanelView.ts:246-250` | Expand or collapse the detail panel. | The header action remains visible with the root; with no selection it is inert because the header uses opacity/pointer-events, not `display: none` (`GraphDetailPanel.css:26-30`). This is panel chrome, not one of the 26 controls. |
| `graph-detail-id` | Existing, `GraphDetailPanelView.ts:488-511` | Edit the selected node ID. | Only in the single-selection Info body; the body is created only for a non-empty selection (`GraphDetailPanelView.ts:279-295,409-435`). |
| `graph-detail-title` | Existing, `GraphDetailPanelView.ts:488-511` | Edit the selected node title. | Same single-selection condition. |
| `graph-links-grid` | Existing, `GraphDetailPanelView.ts:610-633` | Inspect/edit links from the selected node. | Only in the single-selection Links tab; the tab is hidden for multi-selection (`GraphDetailPanelView.ts:401-411`). |
| `graph-properties-grid` | Existing, `GraphDetailPanelView.ts:706-713` | Inspect/edit custom node properties. | Only when the detail body is expanded and the Properties tab is active. |
| `graph-detail-tab-info` | **Add** in the `GraphDetailPanelView.ts:371-378` tab loop | Show node identity, title, level, and shape. | Present while the detail body exists. |
| `graph-detail-tab-properties` | **Add** in `GraphDetailPanelView.ts:371-378` tab loop | Show custom properties. | Present while the detail body exists. |
| `graph-detail-tab-links` | **Add** in `GraphDetailPanelView.ts:371-378` tab loop | Show linked nodes and editable link rows. | Present only for one selected node; otherwise the existing `hidden` behavior remains (`GraphDetailPanelView.ts:401-405`). |

The three detail-tab names must use this literal stable model-key map, never the display label or
tab index:

```ts
const DETAIL_TAB_NAMES: Record<"info" | "properties" | "links", string> = {
    info: "graph-detail-tab-info",
    properties: "graph-detail-tab-properties",
    links: "graph-detail-tab-links",
};
```

The 26-control count includes the seven stable additions listed in the main/detail tables; the
detail root is a panel target, not one of those 26 controls. The repeated level/shape icon
buttons, grid Apply/Cancel buttons, and resize handle are deliberately not in the curated
`elements` list. They have no names today, repeat in single and multi-selection branches, and
their state is better explained by `selectedNodes`, node data, and the live grid than by a large
set of unstable per-button selectors. If implementation needs one of them for a demonstrated
agent scenario, add a purpose-specific name in its owning loop and update this document rather
than using a class selector.

#### Legend panel

The legend is a second editor-internal overlay, not a page sidebar panel. Add only its stable
panel chrome:

| `data-name` | Status / source | Purpose | Condition and visibility |
|---|---|---|---|
| `graph-legend-panel` | **Add** to `GraphLegendPanelView.ts:438-450` | Identify the graph legend overlay. | Mounted whenever the loaded `GraphContentView` is mounted (`GraphBodyView.ts:413-423,747-755`); it remains a visible collapsed header even when not expanded. |
| `graph-legend-toggle` | **Add** to the header created at `GraphLegendPanelView.ts:442-449` | Expand or collapse the legend. | Present with the legend panel; click toggles `expanded` at `GraphLegendPanelView.ts:496-498`. |
| `graph-legend-tab-selection` | **Add** in the `GraphLegendPanelView.ts:267-273` tab loop | Show selected/not-selected filters. | Present only while the legend is expanded; the content subtree is swapped at `GraphLegendPanelView.ts:513-541`. |
| `graph-legend-tab-level` | **Add** in `GraphLegendPanelView.ts:267-273` tab loop | Show level/root/group legend filters. | Same expanded condition; rows are data-dependent. |
| `graph-legend-tab-shape` | **Add** in `GraphLegendPanelView.ts:267-273` tab loop | Show shape/root/group legend filters. | Same expanded condition; rows are data-dependent. |

The three legend-tab names must use this literal stable model-key map, never the display label or
tab index:

```ts
const LEGEND_TAB_NAMES: Record<"selection" | "level" | "shape", string> = {
    selection: "graph-legend-tab-selection",
    level: "graph-legend-tab-level",
    shape: "graph-legend-tab-shape",
};
```

The dynamic row checkboxes, description inputs, and the search-clear button are explicitly left
out of this curated subset. Their cardinality and labels come from `getPresentLevelsAndShapes()`
and the current graph data (`GraphLegendPanelView.ts:563-606`), while search swaps the entire
expanded branch for an unnamed `Clear search` button (`GraphLegendPanelView.ts:325-353,389-424`).
The graph facade should expose the data/query state and name the stable panel chrome; it must not
invent selectors for a row that may not exist. This is the defensible subset boundary for the
legend, and it is why the 26-control figure must not be described as exhaustive DOM coverage.

#### Expansion-settings popover

These three names already exist and must be declared without renaming:

| `data-name` | Source | Purpose | Condition and visibility |
|---|---|---|---|
| `graph-expansion-root` | `GraphExpansionSettingsView.ts:142-151` | Choose the BFS expansion root, or automatic root selection. | Only while the Expansion panel is selected (`GraphBodyView.ts:521-527`). |
| `graph-expansion-depth` | `GraphExpansionSettingsView.ts:154-163` | Set the persisted maximum expansion depth. | Same panel condition; the control can be empty for unlimited depth. |
| `graph-expansion-max` | `GraphExpansionSettingsView.ts:166-175` | Set the persisted maximum visible-node count. | Same panel condition; the control can be empty for the default. |

The note that depth and maximum visible apply when the file is reopened is rendered at
`GraphExpansionSettingsView.ts:100-108`; the facade help must preserve that distinction.

### Render boundary: canvas, not per-node DOM

The graph surface must stop its `elements` list at the chrome. `GraphBodyView` creates one
`HTMLCanvasElement` at `GraphBodyView.ts:334-342`, appends it as the graph content at `:423`, and
hands it to `GraphEditor.renderer.setCanvas` at `:426-436`. `ForceGraphRenderer` stores an
`HTMLCanvasElement` at `ForceGraphRenderer.ts:48-50,85-103` and draws through a 2D canvas context
in `ForceGraphRenderer.ts:732-860`; its node selection and drag handlers use coordinates against
that canvas (`ForceGraphRenderer.ts:354-371,548-593`).

The SVG elements found in graph code are icons for detail/legend/tooltip affordances, not graph
nodes (`GraphIcons.ts:1-18`; `GraphDetailPanelView.ts:517-520`; `GraphTooltipView.ts:75-109`).
There is no foreign document or shadow root for the graph body. Consequently:

- do not declare `graph-node-${id}`, node labels, links, or a per-node selector;
- `highlight` may ring the toolbar/panel chrome only;
- node selection, search, traversal, and highlighting remain facade/model operations, not DOM
  element declarations;
- QA must verify that a graph with nodes has no false per-node element entry.

This follows EPIC-086 decision 7: declaring an element that can never be found is worse than
declaring nothing. The canvas evidence also means that adding `data-name` to a canvas itself would
only identify the whole drawing, not an individual node.

### `page.panels` question: resolved as editor-internal

The detail and legend panels are **owned by `GraphEditorFacade`**, not cross-referenced through
`page.panels`.

Evidence:

1. `GraphContentView` constructs `GraphDetailPanelView` and `GraphLegendPanelView` at
   `GraphBodyView.ts:354-355,410-411`, appends both under the graph body at `:423`, and mounts
   them at `:456-467`. They are siblings of the canvas, not secondary-view registrations.
2. `PageContentView.syncSecondary` only creates `SecondaryViewsView` from a page's
   `panelEditors`/`secondaryView` state at `PageContentView.ts:94-131`. It is a separate sidebar
   column and never receives the graph detail or legend instances.
3. `PagePanelsNode` projects only registered `secondaryViewRegistry` entries from
   `host.panelEditors` (`page-panels.ts:54-77`), and its declared elements are the navigation
   button and generic sidebar container/stack/splitter (`page-panels.ts:34-39`).

Do not add `detail` or `legend` summaries to the graph facade. `selectedNodes` already answers
what the detail panel displays (`GraphEditorFacade.ts:15-16,96-101`; `GraphDetailPanelView.ts:266-295`),
and the legend is derived from graph data already exposed by `nodes`/`links`
(`GraphLegendPanelView.ts:563-606`). The facade must not add graph detail or legend records to
`page.panels`, and it must not duplicate `page-nav-panel`, `secondary-views-container`,
`secondary-views-stack`, or `secondary-views-splitter` from `page.panels`.

### Existing `GraphEditorFacade`: what it covers and what is missing

The current facade is already the correct data/query boundary. Its descriptor at
`GraphEditorFacade.ts:7-31` and implementation at `:66-276` cover:

| Existing member group | Members | What it already answers |
|---|---|---|
| Identity/data | `id`, `name`, `nodes`, `links`, `nodeCount`, `linkCount`, `getNode` | Which editor is active and what the cleaned source graph contains. |
| Selection | `selectedIds`, `selectedNodes`, `select`, `addToSelection`, `clearSelection` | What is selected and the existing selection operations. The three writing operations need `caution` in their descriptors because they change visible UI (`GraphEditorFacade.ts:15-19,92-116`). |
| Relationships | `getNeighborIds`, `getVisualNeighborIds`, `getGroupOf`, `getGroupMembers`, `getGroupMembersDeep`, `getGroupChain`, `isGroup` | Logical/visual links and group membership, including the distinction the renderer makes between them (`GraphEditorFacade.ts:20-26,120-146`). |
| Query/analysis | `search`, `bfs`, `getComponents` | Pure search, traversal, and connected-component analysis. `search` deliberately does not change UI (`GraphEditorFacade.ts:27-29,150-264`). |
| Current options | `rootNodeId`, `groupingEnabled` | Current root and grouping state (`GraphEditorFacade.ts:30-31,269-275`). |

The following are missing and should be resolved before implementation:

- **Surface descriptor:** `elements`/`highlight` are not present in the current descriptor; add the
  curated declarations above using `createElements`, `pageScopeSelector`, and the existing
  activate-and-layout hook. Do not duplicate the page switch or sidebar controls.
- **Live graph state:** add only state that explains visible controls, such as `loading`, `error`,
  `isEmpty`, `hasGroups`, `hasVisibilityFilter`, `recordsCount`, `totalNodeCount`, and the current
  UI search state/results. These values already exist on `GraphEditor` at
  `GraphEditor.ts:46-63,433-435,513-546` and should be projected rather than read from DOM text.
- **Expansion state:** `rootNodeId` exists, but `getExpansionOptions()` and
  `updateExpansionOptions()` expose `expandDepth`/`maxVisible` only to the view at
  `GraphEditor.ts:303-322`; add read-only options and caution-bearing writes if the public facade
  is to answer the expansion-settings question.
- **UI actions:** add wrappers for `resetView`, `resetVisibility`, `expandAll`, `toggleGrouping`,
  `setSearchQuery`, `revealHiddenMatches`, `revealAndSelectNode`, and `selectSearchResults`, all
  with `caution` because they change graph visibility, selection, or the visible UI
  (`GraphEditor.ts:381-406,437-511,549-556`). The facade must distinguish pure `search(query)` from
  the UI-mutating search box.
- **Image actions:** add `openInDrawingEditor()` and `copyImageToClipboard()` to the facade, both
  with `caution`. The canvas belongs to the view/renderer (`GraphBodyView.ts:334-342,423-436`),
  so a public model bridge or callback installed by the mounted graph view must route these calls
  through the existing view actions (`graph/index.ts:83-103`): use the existing Drawing-page
  export path for the former and the `canvas.toBlob`/`ClipboardItem` path for the latter. If the
  view callback is not mounted, each action must throw a diagnostic and never resolve silently;
  do not expose the private canvas or claim that a canvas node is highlightable.
- **Detail edits:** keep detail ID/title, properties, links, and grouping edits UI-only in this
  task; data edits go through `page.content` (`assets/mcp-res-graph.md:100-123`). The page content
  is the source of truth, while facade `nodes`/`links` are its projection. The existing mutation
  paths are private (`GraphDetailPanelView.ts:335-349`; `GraphEditor.ts:563-579`) and would need
  widening without a demonstrated agent scenario. Reopen this decision only when such a scenario
  is demonstrated; do not expose private model objects wholesale.

Every new member that writes graph content, changes selection/visibility/grouping, opens a page or
menu, copies data, or changes persisted expansion/force settings must carry a descriptor
`caution`. A member must not report success if the underlying editor refuses or cannot perform the
requested action. The image actions specifically throw when their mounted-view bridge is
unavailable.

### Live-state contract before graph content is loaded

The epic-wide facade rule used by US-1312 through US-1315 applies here: a getter whose backing
model or view may not be attached returns `undefined`, not a falsy stand-in; an action that cannot
proceed throws a diagnostic rather than resolving silently. The proposed live-state members use
the following contract before graph content has loaded:

| Member | Before the model/content branch is attached or settled | After attachment/load |
|---|---|---|
| `loading` | `undefined` if the editor model is detached; `true` while its attached parse is pending. | The real loading boolean. |
| `error` | `undefined` if the editor model is detached; an empty string is valid only for an attached, error-free state. | The real parse error message or empty string. |
| `isEmpty` | `undefined` until attached content is loaded; do not return `false` for “not known”. | The real empty-graph boolean (`GraphEditor.ts:531-537`). |
| `hasGroups` | `undefined` until source data is attached; do not use the model’s `false` fallback as “not loaded”. | The real group-presence boolean (`GraphEditor.ts:539-542`). |
| `hasVisibilityFilter` | `undefined` until the loaded visibility model is available. | The real filter-active boolean (`GraphEditor.ts:433-435`). |
| `recordsCount` | `undefined` until source data/load has settled; do not return a zero-count string. | The model’s records summary (`GraphEditor.ts:518-524`). |
| `totalNodeCount` | `undefined` until source data is attached; do not return zero as a stand-in. | The real total count (`GraphEditor.ts:513-516`). |
| `expansionOptions` | `undefined`; do not return `{}` when the graph/content model is unavailable. | The live `getExpansionOptions()` result (`GraphEditor.ts:303-306`). |

The same distinction applies to action wrappers: model-dependent calls throw when graph content is
not loaded, and view-dependent image calls throw when the graph view is not mounted. No action
reports a successful no-op.

### Transient dialogs and menus in `$help`

The graph facade help must name transient surfaces instead of re-implementing them as facade
members:

- **Expand-all confirmation:** `GraphBodyView.handleExpandAll` opens the confirmation titled
  `Expand All Nodes` for graphs over 1,000 nodes and stops on a non-Yes response
  (`GraphBodyView.ts:622-628`). Direct the agent to `dialogs[0]`/the existing dialog surface.
- **Selection popup:** the selected-count trigger calls `openMenu` with
  `buildSelectionMenu` (`GraphBodyView.ts:630-638`); name it as the selection action menu and say
  to inspect the live popup/snapshot rather than inventing a second `selectMenu` API.
- **Canvas context menu:** right-clicking the canvas builds empty-area, node, group-node, or
  selection menus (`GraphEditor.ts:583-628`; builders in `GraphContextMenu.ts:44-201`) and sends
  them to `showAppPopupMenu`. The architecture explicitly identifies GraphViewModel/canvas
  handlers as direct popup-menu users (`context-menu.md:125-137`); the agent should use the existing
  `menus[0].items`, `menus[0].click(label)`, and `menus[0].close()` contract from
  `src/renderer/scripting/ai-vision/menus/index.ts:17-37`, not a graph-specific menu clone.

The help should describe that menu item availability is represented by menu `enabled`/`disabled`
state, not by `elements.visible`, and that a menu must first be opened by the user or an
in-scope UI action.

### Constraints

These constraints are part of the implementation contract:

- Do not add unit tests or a test harness. Verification is typecheck/lint/build plus manual
  call-only surface QA, as the page precedent requires (`US-1311 README:447-449`).
- Never hand-edit `assets/editor-types/*.d.ts`. It is generated from
  `src/renderer/api/types/` by `editorTypesPlugin` in `vite.renderer.config.ts:8-47`; when canonical
  typings change, run `npm run build-prod` so the plugin copies declarations and regenerates
  `_imports.txt`.
- Do not add hardcoded colours. Reuse existing theme tokens; the graph views already use theme
  variables in `GraphBodyView.ts:114-116` and graph CSS variables in `GraphBody.css:57-60`.
- For caught `unknown` values, use `errMessage(e, fallback?)` from the project utility, not manual
  stringification (`doc/agents-common.md:282-284`).
- Use `file-path` instead of `require("path")` for path work (`doc/agents-common.md:283-284`).
- Keep editor implementation loading dynamic with `import()`; the registered graph editor is
  loaded that way at `src/renderer/editors/register-editors.ts:147-158`. Facade-only model
  references should remain `import type` where possible.
- Do not edit `doc/active-work.md` or `doc/epics/EPIC-086.md`; both are orchestrator-owned for
  this task.

## Implementation Plan

### 1. Add the graph facade's page-scoped elements

In `src/renderer/scripting/api-wrapper/GraphEditorFacade.ts`:

- Add a static declaration list for the curated controls above. Preserve all 19 existing
  `data-name` strings exactly; add the seven 26-budget names at the exact view loops recorded in
  the inventory, plus the separately counted detail/legend panel chrome names.
- Import `ui`, `createElements`, `pageScopeSelector`, and
  `activatePageAndWaitForLayout` using the same pattern as `TextEditorFacade.ts:1-48`.
- Resolve `const pageId = this.editor.page?.id`; scope every selector beneath that page. Use
  `beforeHighlight` to activate and wait for the owning page slot. `elements` must remain a
  literal current-layout observation, so inactive/conditional controls remain invisible until
  their page is active and absent controls remain `visible: false`.
- Merge `elements.members` and `elements.provide` into the existing graph descriptor without
  replacing its curated data members.

Before:

```ts
// GraphEditorFacade.ts:47-61
return {
    kind: "GraphEditor",
    members: GRAPH_EDITOR_MEMBERS,
    help: GRAPH_EDITOR_HELP,
    summarize: () => ({ /* data summary */ }),
};
```

After:

```ts
const elements = createElements(GRAPH_ELEMENTS, ui.highlightElement.bind(ui), {
    scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
    beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
});

return {
    kind: "GraphEditor",
    members: [...GRAPH_EDITOR_MEMBERS, ...elements.members],
    provide: elements.provide,
    elements: GRAPH_ELEMENTS,
    help: GRAPH_EDITOR_HELP,
    summarize: () => ({ /* data summary plus live graph state */ }),
};
```

### 2. Name only the verified stable chrome

Add the names in the inventory in their owning views:

- `GraphBodyView.ts`: `graph-selection-menu` on the conditional `selectionInfo` trigger only,
  never on the always-present container, and the three `graph-panel-*` names in the tab loop.
  Keep the current hidden behavior for no selection, inactive search results, and absent content.
- `GraphDetailPanelView.ts`: `graph-detail-panel` on the root, `graph-detail-toggle` on the
  header action, and the three `graph-detail-tab-*` names in the tab loop. The toggle is separate
  panel chrome, not one of the 26 controls.
- `GraphLegendPanelView.ts`: add `graph-legend-panel`, `graph-legend-toggle`, and the three
  `graph-legend-tab-*` names for panel chrome. Do not give synthetic names to node rows or to
  labels generated from arbitrary graph data.

Use `data-name`/UIKit `name` additively. Do not change `data-type`, existing grid names, or CSS
state attributes. The exact before-to-after shape for the unnamed toolbar tab is:

```ts
// GraphBodyView.ts:413-419 (current)
button.className = "graph-body-tab";
button.textContent = label;

// planned: use the stable model key, not the display label or array index
button.className = "graph-body-tab";
button.dataset.name = GRAPH_PANEL_TAB_NAMES[tab];
button.textContent = label;
```

Use the analogous literal `DETAIL_TAB_NAMES` and `LEGEND_TAB_NAMES` maps in the detail and
legend loops. The keys are the stable model keys `info`/`properties`/`links` and
`selection`/`level`/`shape`; never derive a semantic name from user-visible text or position.

### 3. Extend the facade only across existing public model seams

Update `GRAPH_EDITOR_MEMBERS`, the facade getters/methods, and the canonical graph editor type
under `src/renderer/api/types/graph-editor.d.ts` together. Keep the current cleaned-node and
relationship behavior intact. Add the live state and narrow action wrappers listed above, with
`caution` on all writing/UI-changing members. Do not expose `GraphMutationModel`,
`GraphGroupActionsModel`, or renderer internals as arbitrary objects.

Detail editing stays UI-only in this task. Data edits use the documented `page.content` JSON route
(`assets/mcp-res-graph.md:100-123`), because page content is authoritative and `nodes`/`links`
are projections; the private mutation/group paths (`GraphDetailPanelView.ts:335-349`;
`GraphEditor.ts:563-579`) are not widened without a demonstrated agent scenario. Reopen this
decision only for such a scenario.

Add `openInDrawingEditor()` and `copyImageToClipboard()` with `caution`. Because the canvas belongs
to the view/renderer (`GraphBodyView.ts:334-342,423-436`), route both through a mounted-view
callback/bridge on the model: preserve the existing Drawing-page and canvas export paths in
`graph/index.ts:83-103`. Throw a diagnostic when the view is not mounted; never resolve silently.

For force/expansion settings, expose current values from `getExpansionOptions()` and
`renderer.forceParams`, and delegate writes to the existing `updateExpansionOptions()`/
`updateForceParams()`/`resetForceParams()` methods (`GraphEditor.ts:248-258,303-322`). Persisted
settings and UI-changing actions are caution-bearing. The expansion note that changes apply on
reopen must be included in help.

### 4. Preserve conditional visibility and canvas limits

Make the static declarations cover the full curated list, but verify these runtime states:

- loading and parse-error branches do not expose loaded graph controls: `GraphBodyView` selects a
  loading/content branch at `:742-755`, and `GraphEditor` sets `loading`/`error` during parse at
  `GraphEditor.ts:788-825`;
- detail body controls are absent without a selected node, while the detail root/header remains
  laid out and visible because its no-selection CSS uses opacity/pointer-events; the Links tab is
  absent for multi-select (`GraphDetailPanelView.ts:266-295,401-411`; `GraphDetailPanel.css:2-30`);
- graph-toggle-grouping and graph-expand-all may be disabled while still visible; `visible` must
  not be used as an enabled-state substitute;
- results and selection controls are absent when their state has no results/selection;
- legend content controls exist only while expanded and only for the present levels/shapes; the
  collapsed legend root/header remains visible through its opacity-only CSS, and no missing row
  is reported as visible (`GraphLegendPanel.css:2-30`);
- every selector stops at page chrome. There is no per-node `elements` entry because the renderer
  is canvas-only.

### 5. Name transient surfaces in graph help

Expand `GRAPH_EDITOR_HELP` to answer “where is the control/menu?” without duplicating transient
surface APIs. Name the `Expand All Nodes` confirmation, the selection popup, and the node/group/
empty-area canvas context menus. Point to `dialogs[0]` and `menus[0]` and explain that `menus` is
the live source of menu labels and enabled state. Keep `highlight` limited to declared DOM chrome.

### 6. Add manual graph surface QA

Create `qa/surfaces/editors/graph.md`, following `qa/surfaces/page.md`'s
`**Preparation:**` / `**Call:**` / `**Verify:**` format. Do not update the aggregate surface index;
US-1317 owns that cross-task index and runs the completed surface files.

Required scenarios:

1. **G.1 - loaded, loading, and parse-error conditions.** Open a valid graph, inspect
   `pages[i].editor.elements`, and confirm page-scoped selectors and visible toolbar/chrome. Open
   a graph that is still loading and one with invalid JSON; verify loaded controls are
   `visible: false` until content exists and no highlight reports success for an absent target.
2. **G.2 - canvas boundary and selection.** With a graph containing nodes, verify the elements list
   has chrome only and no per-node selector. Select one node and inspect/highlight the detail panel;
   clear selection and verify `graph-detail-panel` and `graph-detail-toggle` remain `visible: true`
   while the header is dimmed/non-interactive and the detail body controls become invisible. This
   is expected: `GraphDetailPanel.css:26-30` uses opacity/pointer-events, not `display: none`,
   so the laid-out root is not a bug. Confirm the selected-count menu trigger follows selection
   state.
3. **G.3 - detail tabs and multi-selection.** With one selected node, verify Info, Properties,
   and Links controls. With multiple selected nodes, verify Links is absent/invisible while the
   multi-edit information remains usable. Dirty grids must retain literal visibility and must not
   fabricate an Apply success.
4. **G.4 - legend.** With the legend collapsed, verify `graph-legend-panel` and
   `graph-legend-toggle` remain `visible: true` because `GraphLegendPanel.css:2-30` changes
   opacity rather than using `display: none`; collapsed tab/content controls are not visible.
   Expand the legend, switch Selection/Level/Shape tabs, and inspect the stable panel/tab elements.
   Verify row controls appear only for data-present levels/shapes and that search mode's “Search
   highlighting is active” branch does not claim absent legend rows.
5. **G.5 - tuning and expansion.** Open Physics and Expansion, inspect all seven existing
   tuning/expansion names, verify current values, and confirm writes/Reset carry caution and the
   depth/max note says they apply when reopened. Verify controls are not visible while their
   toolbar panel is closed.
6. **G.6 - menus and confirmation.** Trigger Expand All on a graph over 1,000 nodes and inspect
   `dialogs[0]` for the confirmation. Right-click empty space, a normal node, a group node, and a
   selection; inspect `menus[0].items`, including disabled/invisible group actions, and use the
   existing `menus[0].click`/`close` contract. No graph-specific menu node should appear.
7. **G.7 - page scoping and activation.** Open two graph pages with matching chrome, inspect both
   facades, and verify selectors contain each page's `[data-page-id="..."]`. Highlight a control on
   the inactive page and verify activation/layout wait targets that page. A conditional absent
   control stays `visible: false` and returns the normal not-found result.

## Concerns

All investigation questions are resolved before implementation:

- **Count meaning:** source verification finds 19 existing named controls. The epic's 26 is a
  prospective curated-control count after seven stable unnamed toolbar/detail tabs receive names;
  it is not an existing-source count and not exhaustive DOM coverage.
- **Epic-table annotation:** the Graph row in `EPIC-086.md` should be annotated `19 existing + 7
  added` so the 26 figure is not re-derived later. The orchestrator owns and applies that edit;
  this task does not edit `doc/epics/EPIC-086.md`.
- **Curation size:** the task keeps the 26 stable-control budget and adds separately identified
  panel chrome. It explicitly leaves out repeated detail icon buttons, grid Apply/Cancel and cell
  controls, search-result row/actions, dynamic legend rows/inputs, and per-node graph content.
  Those controls either have data-driven cardinality, no stable names, or are better represented by
  facade state/menu/grid snapshots. Do not split the task; if QA proves one omitted control is
  needed, add it within this task with a stable purpose and source citation.
- **Panel ownership:** detail and legend are children of `GraphBodyView`, not secondary views;
  they belong to the graph facade and must not be duplicated under `page.panels`.
- **Conditional semantics:** `visible` means a matching, laid-out DOM element now. A disabled
  control can be visible; an absent conditional control is false. `highlight` activates the page
  only through US-1311's existing hook and still returns the real overlay result.
- **Unattached state and actions:** live getters return `undefined` until their backing model/view
  is attached, as detailed above; once attached, real `false`, empty-string, or zero values are
  allowed. Actions that cannot proceed throw diagnostics, including both image actions before the
  graph view mounts.
- **Canvas:** no node can be highlighted by the DOM overlay. Node operations remain data/facade
  operations and must not be converted into fake selectors.
- **Transient UI:** confirmation and context/selection menus are already represented by the
  dialogs/menus infrastructure. The graph help cross-references them; it does not reimplement
  their item lists.
- **Generated types:** edit canonical declarations only and run Vite's generation path; never
  hand-edit `assets/editor-types/`.
- **Safety and standards:** no unit tests/harness, no hardcoded colours, `errMessage` for caught
  values, `file-path` over `require("path")`, and dynamic `import()` for editor code are mandatory.

## Acceptance Criteria

- `GraphEditorFacade` retains every current data/query member and exposes the curated graph
  `elements`/`highlight` descriptor through the page-scoped US-1311 resolver.
- The source count is recorded accurately: 19 existing named graph controls, with seven named
  additions identified as the path to the epic's 26-control curated inventory. The document does
  not call the 26 figure exhaustive.
- Every curated control has a one-line purpose, an exact existing or planned `data-name`, and a
  source file/line. Existing names and all `data-type` attributes remain unchanged.
- Detail and legend panel chrome is owned by the graph facade, while `page.panels` remains the
  page sidebar node. No graph detail/legend entry is duplicated there.
- `elements.visible` is false for loading/error, absent, closed, or data-dependent controls;
  the detail root/header and collapsed legend root/header remain visible when their CSS only
  dims or disables them, while detail/legend body controls follow their actual layout. Disabled-
  but-rendered controls remain visible. Highlighting an absent conditional control returns the
  normal not-found result, never fabricated success.
- The elements list stops at canvas-backed graph chrome. It contains no per-node or per-link DOM
  declaration and no selector that cannot exist.
- Graph help names the Expand All confirmation, selection popup, and canvas context menus and
  points to `dialogs[0]`/`menus[0]`; it does not duplicate menu actions.
- Missing facade members are implemented only at existing public model seams, with `caution` on
  selection, visibility, grouping, settings, content, clipboard, page-opening, and other writing
  members. Pure `search`, traversal, and query members remain read-only.
- `openInDrawingEditor()` and `copyImageToClipboard()` route through the mounted view/canvas and
  throw diagnostics when unavailable; detail edits remain UI-only and use `page.content`, with no
  `detail`/`legend` summary members added.
- The proposed live-state getters return `undefined` before their backing model/content is
  attached rather than falsy stand-ins, including `loading`, `error`, `isEmpty`, `hasGroups`,
  `hasVisibilityFilter`, `recordsCount`, `totalNodeCount`, and `expansionOptions`.
- `qa/surfaces/editors/graph.md` contains the seven manual call-only scenarios above in page QA
  format. No unit tests or test harnesses are added.
- Canonical typings under `src/renderer/api/types/` match the facade; `npm run build-prod`
  regenerates `assets/editor-types/`, which is never hand-edited.
- Implementation follows the repository constraints: no hardcoded colours, `errMessage` for
  caught values, `file-path` over `require("path")`, and dynamic `import()` for editor code.
- `doc/active-work.md` and `doc/epics/EPIC-086.md` remain unchanged by this task.

## Files that need NO changes

- `src/renderer/scripting/ai-vision/elements.ts` - US-1311 already provides page selector scope,
  literal `visible`, and the before-highlight hook.
- `src/renderer/scripting/ai-vision/page-elements.ts` - page identity and bounded activation/layout
  waiting already satisfy the graph facade's page-scoped highlight contract.
- `src/renderer/scripting/ai-vision/page-panels.ts` - it correctly owns only sidebar controls;
  graph detail and legend are not sidebar panels.
- `src/renderer/editors/register-editors.ts` - `graph-view` is already registered with a dynamic
  `import("./graph")` at `:157`.
- `src/renderer/editors/graph/GraphBody.css`, `GraphDetailPanel.css`, `GraphLegendPanel.css`, and
  `GraphExpansionSettings.css` - existing theme-token styling is sufficient; no hardcoded colours
  or layout rewrite is needed.
- `src/renderer/editors/graph/ForceGraphRenderer.ts` - its canvas rendering and interaction model
  are the verified reason not to add per-node elements; do not convert it to DOM/SVG rendering.
- `src/renderer/editors/graph/GraphContextMenu.ts` and
  `src/renderer/ui/dialogs/poppers/showPopupMenu.ts` - existing menu builders/display and the
  `menus` adapter are the transient-menu source of truth.
- `doc/architecture/context-menu.md` - the direct-display canvas pattern is already documented;
  this task only cross-references it from graph help.
- `doc/architecture/ui-element-contract.md` - the semantic `data-name`/load-bearing `data-type`
  rules already cover additive graph names; no contract rename is needed.
- `assets/editor-types/` - generated output only; regenerate it from canonical declarations.
- `assets/mcp-res-graph.md` - its graph data/query and `page.content` editing guidance remains
  valid; the new AI-vision chrome is discovered through facade help and surface QA.
- `qa/surfaces/page.md` and `qa/surfaces/menus.md` - existing page-scoping and menu formats are
  the precedents; graph-specific scenarios belong in the new editor surface file.
- `doc/active-work.md` and `doc/epics/EPIC-086.md` - explicitly orchestrator-owned and prohibited
  from this task.

## Files Changed Summary

| Path | Current status | Planned change |
|---|---|---|
| `doc/tasks/US-1316-graph-surface/README.md` | New task document | Record verified graph inventory, ownership, render boundary, implementation plan, concerns, and QA. |
| `src/renderer/scripting/api-wrapper/GraphEditorFacade.ts` | Existing 276-line data/query facade | Add page-scoped curated elements, help/menu cross-references, live graph state, and narrow caution-aware wrappers for verified model actions. |
| `src/renderer/editors/graph/GraphBodyView.ts` | Emits six named body controls plus four unnamed stable toolbar controls | Add names for the selection trigger and three toolbar tabs; preserve all conditions and existing names. |
| `src/renderer/editors/graph/GraphDetailPanelView.ts` | Emits four named controls plus unnamed tabs/panel chrome | Add detail root, header-toggle, and tab names; keep repeated low-level controls outside the curated subset unless QA proves a need. |
| `src/renderer/editors/graph/GraphLegendPanelView.ts` | Emits no `data-name` values | Add panel/header/tab chrome names only; keep data-driven rows curated out. |
| `src/renderer/editors/graph/GraphEditor.ts` | Owns graph state and model/view seams | Add the mounted-view bridge and diagnostics for facade image actions; project live state without falsy unattached stand-ins. |
| `src/renderer/editors/graph/index.ts` | Existing toolbar image callbacks | Route the existing Drawing-page and clipboard paths through the shared mounted-view bridge. |
| `src/renderer/api/types/graph-editor.d.ts` | Existing graph facade type | Match the implemented state/actions/elements contract. |
| `qa/surfaces/editors/graph.md` | Not yet present | Add G.1-G.7 manual call-only graph surface scenarios; the aggregate index remains US-1317 work. |
| `assets/editor-types/*.d.ts` | Generated | Regenerated by Vite `editorTypesPlugin` via `npm run build-prod`; never hand-edited. |

No product implementation, generated declaration, QA, epic, or dashboard file was changed while
preparing this task document.
