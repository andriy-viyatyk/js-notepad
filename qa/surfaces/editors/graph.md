# Surface QA: graph editor

Manual scenarios for `pages[i].editor` after narrowing `editor.id` to `"graph-view"`. Run through
`call` only; do not add or run automated tests or a test harness for this surface. Leave pinned tabs
untouched and close only pages created by the scenario.

## Test G.1: Loaded, loading, and parse-error conditions

**Preparation:** Open a valid force-graph JSON page, a graph page that is still loading, and a page
with invalid graph JSON. Obtain their page ids from `pages`.

**Call:** Read each `pages[id].editor.elements`, `loading`, and `error`. Highlight a loaded toolbar
control and an absent loaded-branch control on the loading/error pages.

**Verify:** Valid content exposes page-scoped selectors and visible toolbar/chrome. Loading and
parse-error pages keep loaded graph controls `visible: false` until content exists. Highlighting an
absent target returns the normal not-found result and never claims success.

## Test G.2: Canvas boundary and selection

**Preparation:** Open a graph containing nodes with stable ids and no initial selection.

**Call:** Read the complete `editor.elements` list, then select one node through the facade and
inspect/highlight the detail panel. Clear the selection and inspect the list again.

**Verify:** The inventory contains graph chrome only: no per-node, node-label, or link selector is
present even though nodes are drawn. With one selected node, the detail panel is inspectable. After
clearing selection, `graph-detail-panel` and `graph-detail-toggle` remain `visible: true` while the
dimmed header is non-interactive and detail body controls are invisible. The selection menu trigger
follows selection state.

## Test G.3: Detail tabs and multi-selection

**Preparation:** Use a graph with at least two nodes and select one node, then select two nodes.

**Call:** Inspect `graph-detail-tab-info`, `graph-detail-tab-properties`, and
`graph-detail-tab-links` in each state, and make a temporary edit in a detail grid.

**Verify:** All three tabs are present for one selected node. With multiple nodes, Links is hidden
or invisible while multi-edit information remains usable. A dirty grid retains literal visibility;
the facade does not invent an Apply success or expose detail data-edit members.

## Test G.4: Legend

**Preparation:** Open a graph containing multiple levels or shapes and leave the legend collapsed.

**Call:** Inspect the legend elements, expand the legend, switch Selection, Level, and Shape tabs,
and inspect the live rows. Enter legend search/highlighting if available.

**Verify:** `graph-legend-panel` and `graph-legend-toggle` remain `visible: true` while collapsed;
collapsed tabs/content are not visible. Expanded stable tab controls are page-scoped. Row controls
appear only for data-present levels/shapes, and the search notice does not claim absent legend rows.

## Test G.5: Tuning and expansion

**Preparation:** Open a loaded graph and inspect the toolbar with its panels closed.

**Call:** Open Physics and Expansion, inspect `tuning-charge`, `tuning-link-distance`,
`tuning-collide`, `tuning-reset`, `graph-expansion-root`, `graph-expansion-depth`, and
`graph-expansion-max`. Read `forceParams` and `expansionOptions`, then update and reset values on a
scratch page.

**Verify:** The seven panel controls are invisible while their panels are closed and visible in the
matching panel. Current values are reported. Writes and Reset carry caution, and the depth/max note
says those settings apply when the file is reopened.

## Test G.6: Menus and confirmation

**Preparation:** Use a graph over 1,000 nodes and a graph with normal, group, and selectable nodes.

**Call:** Trigger Expand All and inspect `dialogs[0]`. Right-click empty space, a normal node, a
group node, and a selection; inspect `menus[0].items`, use `menus[0].click(label)`, and close it.

**Verify:** The Expand All confirmation is titled `Expand All Nodes`. Context menus expose their
live labels and enabled/disabled state, including group-dependent actions. No graph-specific menu
node is added and menu items are not duplicated in `editor.elements`.

## Test G.7: Page scoping and activation

**Preparation:** Open two graph pages with matching chrome and obtain both ids from `pages`.

**Call:** Read both editor inventories and highlight a control on the inactive page. Also highlight
a conditional control while it is absent.

**Verify:** Every selector contains its page's `[data-page-id="id"]`. Highlight activates the
requested page and waits for its slot layout before drawing. A conditional absent control remains
`visible: false` and returns the normal not-found result.
