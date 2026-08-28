# US-1170 — Convert the `graph` editor body to native views

## Goal

Convert the seven React body files under `src/renderer/editors/graph/` to native `VanillaView`
implementations while preserving graph rendering, selection/editing, search, expansion, tuning,
legend filtering, context menus, and tooltips. The final editor must mount `GraphBodyView` directly,
have no `.tsx` file under the graph directory, and use `highlightInto` for search results.

This is the final and largest body conversion in E15: 199 JSX markers across approximately 3,271
lines in seven files ([EPIC-073.md:139-159](../../epics/EPIC-073.md#e15-4--the-measured-baseline)).
The task is linked to E15-1, E15-5, and E15-6, including C1/C1a lifecycle ownership, C9a
presence verification, C12 type homes, C13 scope discipline, C14 residual UIKit paths, and C18's
framework-boundary lesson ([EPIC-073.md:14-35](../../epics/EPIC-073.md#e15-1--the-closing-property),
[EPIC-073.md:176-210](../../epics/EPIC-073.md#e15-5--the-cut),
[EPIC-073.md:214-261](../../epics/EPIC-073.md#e15-6--concerns)).

## Background

### Verified source shape and render graph

The supplied measurements match the current seven files: `GraphDetailPanel.tsx` 1,234 lines /
66 markers, `GraphBody.tsx` 708 / 43, `GraphLegendPanel.tsx` 604 / 40, `GraphTooltip.tsx` 298 /
16, `GraphIcons.tsx` 170 / 16, `GraphExpansionSettings.tsx` 167 / 11, and
`GraphTuningSliders.tsx` 90 / 7. The graph directory currently has those seven `.tsx` files plus
the already-native models, renderer, and `index.ts`.

The actual parent/child graph is narrower than the directory suggests:

```text
GraphEditorView (graph/index.ts)
└─ EditorErrorBoundary
   └─ GraphBody (GraphBody.tsx)
      ├─ GraphSearchResults (local component)
      ├─ GraphTuningSliders → Panel / Slider / Button
      ├─ GraphExpansionSettings → Panel / Select / Input
      ├─ GraphTooltip → IconButton and local markdown-link content
      ├─ GraphDetailPanel
      │  ├─ InfoTab / MultiInfoTab
      │  ├─ PropertiesTab → nested Panel / DataGrid / Button
      │  └─ LinksTab → nested Panel / DataGrid / Button
      └─ GraphLegendPanel
         ├─ LegendRow → checkbox / native SVG icon / Input
         └─ SelectionRadioRow
```

`GraphEditorView` currently owns native toolbar/footer views but creates the body through
`graphBodyElement()` at `src/renderer/editors/graph/index.ts:145-151`; the wrapper is used by
`onMount()` at `:164-186` and rebuilt by `onUpdate()` at `:188-199`. `GraphBody.tsx` is the only
renderer of the six direct rendered branches (`:644-703`), while `GraphDetailPanel.tsx` renders its
three tab families (`:547-635`, `:762-796`, `:1033-1071`, `:1103-1230`). `GraphMutationModel.ts:9`
also imports `buildMarkdown` from the tooltip module, so that pure export must survive the tooltip
rename until the final import sweep.

This graph is the reason the stages below are bottom-up. Each intermediate `.tsx` face continues to
serve its still-React parent through `mountVanilla`; `mountVanilla` returns the React element for
`VanillaHost` but creates no React root (`src/renderer/uikit/shared/mount.tsx:93-107`). Its host is
deliberately `display: contents`, so it adds no layout item
(`src/renderer/uikit/shared/mount.tsx:86-90`). That is materially different from
`mountReactHandle`, whose caller owns a plain `div` host and whose `createRoot(host)` mounts a
React island (`src/renderer/uikit/shared/mount.tsx:131-141`): the caller must size that host. Thus
temporary faces are layout-neutral, while newly introduced hosts are not; the distinction explains
the zero-height Excalidraw island fixed in US-1167. The parent can remain unchanged while a child is
converted.

### Reviewed decisions carried forward

The implementation must reuse the reviewed decisions from US-1166, US-1168, and US-1169 rather
than re-derive them:

- Build native children in `onMount()`, append roots before mounting, mount the body first and the
  chrome last, and throw from `index.ts:onUpdate()` if a different model instance arrives. This is
  the shipped shape in `src/renderer/editors/env-vars/index.ts:14-45` and
  `src/renderer/editors/file-diff/index.ts:15-57`, and the same decision is recorded in
  US-1166 README:258-330 and US-1169 README:371-435.
- Use `VanillaView.child()` for lifetime ownership, `releaseChild()` for a replaced child, one
  `bind()` installed from `onMount()`, `SubtreeSwap` for conditional branches, and `KeyedList`
  with disposal in `remove`. These contracts are in
  `src/renderer/uikit/shared/vanilla-view.ts:96-231`, `subtree-swap.ts:8-88`, and
  `keyed-list.ts:18-166`; the reviewed application of them is in US-1166 README:161-256.
- A `createComponentModelDriver` is valid only after that model's `init()` registers no
  `effect()`; `mount()` throws otherwise (`src/renderer/core/state/model.ts:278-318`). Effectful
  models must be made effect-free and moved to subscriptions or exact `createDepsGate()` calls, as
  in `src/renderer/editors/file-diff/FileDiffBodyModel.ts:71-126` and US-1169 README:258-355.
- Do not modify UIKit faces or shared compatibility files. Type-only imports from surviving UIKit
  faces are allowed under C12. This includes `uikit/shared/slots.ts`, `fill-slot.ts`, the React
  branch of `highlight.ts`, `PopoverView.tsx`, `DialogView.tsx`, and `TextChromeView.updateSlots`
  (US-1169 README:539-543, 624-635).
- No tests or harnesses are used. The existing gates after implementation are
  `npm run typecheck`, `npm run lint`, and `npm run build-prod`, as recorded by the reviewed
  Verification records in US-1166 README:510-556 and US-1168 README:533-590.

### Graph-specific decisions

#### Tooltip: own coordinate positioning on the overlay layer

`GraphTooltip.tsx:201-295` currently portals a fixed-position element to
`getOverlayLayer()` (`src/renderer/uikit/shared/overlayLayer.ts:1-35`) and
uses a layout effect over `[x, y]` to measure it and flip/clamp it against the viewport
(`GraphTooltip.tsx:207-231`, `:261-295`). The native `GraphTooltipView` will append its root
directly to `getOverlayLayer()` in `onMount()`, mark it `data-type="tooltip"`, and own its
positioning method. It will preserve the current 12px pointer offset and use the same
`getBoundingClientRect()` measurement and max-height logic.

Do not reuse the ordinary UIKit positioner: `PopoverFloatingView` uses Floating UI with a fixed
strategy and placement middleware (`src/renderer/uikit/Popover/PopoverView.tsx:282-317`), while
`attachTooltip()` is trigger-driven, owns its own show/hide delay and singleton claim, and expects
a trigger or floating reference (`src/renderer/uikit/Tooltip/attach-tooltip.ts:74-201`).
`tooltipRegistry` coordinates singleton visibility and drag suppression
(`src/renderer/uikit/shared/tooltipRegistry.ts:1-20`, `:69-114`), but does not position arbitrary
graph coordinates. GraphTooltipModel already owns the graph hover delay and hover-state handoff
(`src/renderer/editors/graph/GraphTooltipModel.ts:19-97`),
while the tooltip itself needs rich native buttons and link nodes. The native view will therefore
own only the floating root, its two buttons, the copy-reset timer, mouse-enter/leave listeners,
and coordinate repositioning. If global tooltip suppression is later required, it is a separate
UIKit concern; do not change `tooltipRegistry.ts` for this task.

The verification must use `getBoundingClientRect()` or computed style. `offsetParent` is always
`null` for `position: fixed`, which caused two false negatives in US-1168's reviewed live pass
(EPIC-073:89-137; US-1168 README:562-577).

#### Icons: canonical element factories

`GraphIcons.tsx` already contains the native implementation half: `createShapeIconElement()` and
`createLevelIconElement()` return real `SVGSVGElement`s at `:57-112` and `:147-163`. Its React
`ShapeIcon`/`LevelIcon` exports have no consumers (the only application consumers are the
`create*IconComponent` calls in `GraphDetailPanel.tsx:1122`, `:1142`, `:1209`, and `:1225`, while
`GraphLegendPanel.tsx` already uses element factories at `:436-492`).

The decision is to make element factories the canonical graph API. Stage 1 moves the DOM builders
to `GraphIcons.ts`, drops the unreferenced React component exports, and temporarily retains the
`SvgIconComponent` adapter functions for the still-React detail face. The adapter is the existing
bridge object, not a React component: `SvgIconComponent.createElement` and
`createIconComponentElement()` are defined at `src/renderer/theme/icons.ts:9-23`.
Stage 5 changes the native detail view to append `createShapeIconElement()` /
`createLevelIconElement()` directly, then removes those temporary adapter functions. Detail
consumers change from `<Icon icon={create...IconComponent(...)}/>` to a native button with a fresh
SVG element, and legend consumers continue to receive fresh SVG elements at size 14.

Every SVG node passed to a menu or row is fresh. A DOM node is single-use; no icon node may be
shared across menu items, rows, or updates. Preserve `color.graph.groupBorder` and the existing
`legend-shape-icon` class; colors remain theme tokens, never literals.

#### Search highlighting: native `highlightInto`

`GraphBody.tsx` is verified as the sole importer and caller of the React `highlight()` form:
the import is at `:3` and the three calls are at `:195`, `:200`, and `:203`. The other consumers
already use `highlightInto`; the epic records this as confirmed at EPIC-073:34-45. The native
search-result rows will own dedicated label hosts and call
`highlightInto(host, text, searchQuery)` (`src/renderer/uikit/shared/highlight.ts:28-57`). Because
`highlightInto` calls `replaceChildren`, those hosts must belong exclusively to the row view and
must not also be managed by `fillSlot`.

Do not delete or edit the React branch in `src/renderer/uikit/shared/highlight.ts:1-26`. Once the
final GraphBody face is gone, record that branch as an Epic F cleanup item; this task only removes
its last graph consumer.

### Model/effect ledger

The following is verified from the seven target files and is the required restructuring ledger:

The graph body/detail/legend model set registers **14 effects** in total: GraphBodyModel 2, GraphDetailModel 7,
LinksTabModel 1, PropertiesTabModel 1, and GraphLegendModel 3. The sum is checkable against the
individual rows below (`GraphBody.tsx:243-282`, `GraphDetailPanel.tsx:256-394`, `:657-685`,
`:863-913`, and `GraphLegendPanel.tsx:163-337`).

| Model | Current effect status | Native decision and exact trigger |
|---|---|---|
| `GraphBodyModel` (`GraphBody.tsx:243-282`) | 2 effects: `:253-260` is gated by `() => [this.props.model]` and installs `onDoubleClickNode`; `:262-281` is gated by `() => [this.props.model, state.searchResults, state.searchQuery]` and opens/closes the results panel via a guarded microtask | Keep an effect-free driver or plain local state. Assign/clear `onDoubleClickNode` once in `onMount()`/`onDispose()`; use one editor-state bind/projection to trigger the same guarded microtask when `searchResults` or `searchQuery` changes, retaining the current-state and liveness checks. |
| `GraphDetailModel` (`GraphDetailPanel.tsx:256-394`) | 7 effects: `[node?.id,node?.title]`, `[isMulti,activeTab]`, `[selectionKey,hasSelection]`, `[expandRequest]`, `[collapseRequest]`, `[expanded,onPanelExpandedChange]`, and `[linksTabActive,node?.id,linkedNodes]` | Remove `effect()` calls. Keep state in an effect-free driver or view fields; implement each exact gate once from central sync and guard queued callbacks with liveness/current-props checks. |
| `LinksTabModel` (`GraphDetailPanel.tsx:657-685`) | 1 effect over `[linkedNodes]`, seeds rows/columns and clears dirty state | Remove the effect and use one `createDepsGate()` over exactly `[linkedNodes]` in the native tab view. The grid remains the owner of its imperative rows. |
| `PropertiesTabModel` (`GraphDetailPanel.tsx:863-913`) | 1 effect over `[sorted node IDs, nodes]`, seeds rows and multi-value metadata | Remove the effect and use one `createDepsGate()` over exactly `[nodes.map(...).sort().join(","), nodes]`; preserve `_rowKey`, original keys, mixed-value status, and grid write-back. |
| `GraphLegendModel` (`GraphLegendPanel.tsx:163-337`) | 3 effects: install `onHighlightSelection` over `[editor]`; copy descriptions over `[editor]`; apply legend highlight over `[editor,expanded,activeTab,selectionFilter,checkedLevels,checkedShapes,selectedKey]` | Remove all effects. Install/clear the callback once, initialize descriptions once, and gate the highlight application over the exact final array with a guarded microtask. Debounce timers are owned and cleared on disposal. |
| `GraphExpansionModel` (`GraphExpansionSettings.tsx:31-43`) | No `effect()` registration | Safe for `createComponentModelDriver`; bind its three local values once and update existing `SelectView`/`InputView` children. |
| `GraphTooltipModel` (`GraphTooltipModel.ts:20-90`) | Not a `TComponentModel`; owns graph hover timers | Leave the model's behavior intact. `GraphTooltipView` owns only DOM/timer resources it creates and continues to call `setHovered()`. |
| `GraphTuningSliders` | No `TComponentModel`; uses React local state at `GraphTuningSliders.tsx:42-64` | Use plain view fields for three values and update existing `SliderView`s; `ForceGraphRenderer.defaultForceParams` remains the reset source. |

### Layout hazards and ownership

The native body root must reproduce `GraphBody.tsx:30-51`: a column flex root with `flex: 1 1
auto`, hidden overflow, relative positioning, and a canvas with explicit `width: 100%`,
`height: 100%`, and flex growth. The new body view root, the loading host, the canvas host, and
every newly introduced wrapper inside that height chain need explicit size/flex styles. A bare
`div` is `display: block; height: 0`; a child with `height: 100%` then resolves against zero.
The draw conversion found exactly this failure when an island host was inserted
(US-1167 README:589-606). The presence pass must measure the visible canvas with
`getBoundingClientRect()`, not infer it from React-root counts.

`GraphDetailPanel.css` already owns the absolute detail-panel placement
(`src/renderer/editors/graph/GraphDetailPanel.css:1-15`). Native static/co-located CSS must preserve
that contract. New `GraphBody.css`, `GraphTooltip.css`, `GraphLegendPanel.css`,
`GraphExpansionSettings.css`, and `GraphTuningSliders.css` should hold stable layout/typography;
only genuinely dynamic values such as tooltip `left`/`top`/`maxHeight` and detail width/height may
be assigned by the view. All colors must use existing theme CSS variables or `color` tokens.

All `bind()`/`listen()`/queue subscriptions are installed once from `onMount()` and released via
`own()`. `VanillaView.own()` has no early-release API (`vanilla-view.ts:142-169`), so no repeated
sync method may register a listener. The body's old `typedQueue.use(() => {})` at
`GraphBody.tsx:302-306` becomes exactly one `editor.typedQueue.subscribe(() => undefined)` with its
unsubscribe registered through `own()`.

## Implementation Plan

### Stage 1 — move graph utility output to native DOM

Touch `src/renderer/editors/graph/GraphIcons.ts`, delete `GraphIcons.tsx`, and modify
`src/renderer/editors/graph/GraphContextMenu.ts`. Move the verified SVG builders unchanged in
meaning, keep temporary `createShapeIconComponent`/`createLevelIconComponent` bridge objects only
for the still-React detail face, and remove the unused `ShapeIcon`/`LevelIcon` JSX exports. In
`GraphContextMenu.ts`, replace the module-level `ReactNode` made by `createElement` with a
`createOpenLinkIconElement()` factory that returns a fresh native SVG for each menu item; this
removes the file's React runtime import and avoids sharing one Node across submenu entries.

Afterwards the still-React `GraphDetailPanel.tsx` must compile through the temporary bridge,
`GraphLegendPanel.tsx` must compile against native element factories, and GraphEditor's existing
coordinate context menus must behave unchanged. A human can open a node context menu and check that
the “Open …” entry still has its arrow icon.

Before → after for the icon consumer seam:

```tsx
// Before: GraphDetailPanel.tsx:1122
<Icon icon={createLevelIconComponent(lvl)} />
```

```ts
// Final native form, introduced in Stage 5
button.append(createLevelIconElement(lvl, 16));
```

### Stage 2 — convert the two small settings leaves

Add `src/renderer/editors/graph/GraphTuningSlidersView.ts` and
`src/renderer/editors/graph/GraphExpansionSettingsView.ts`; reduce
`GraphTuningSliders.tsx` and `GraphExpansionSettings.tsx` to `mountVanilla` faces. The views use
`Panel`'s native `createPanelElement`, `createTextElement` where text hosts are needed,
`SliderView`, `ButtonView`, `SelectView`, and `InputView`, with their direct CSS imports. Keep the
exact names/ranges/defaults and editor calls from `GraphTuningSliders.tsx:19-87` and the exact
root-node sentinel, validation, blur, and Enter behavior from `GraphExpansionSettings.tsx:22-163`.

`GraphExpansionModel` has no effect and may use `createComponentModelDriver`; bind its whole local
state once from `onMount()`. Tuning uses view fields, not a new model. The faces remain so the
unchanged React `GraphBody` continues to render them. In this Stage 2 change set, add both
temporary-face rows to the roadmap ledger, each with collectability “Stage 7, after
`GraphBody.tsx` is deleted”; do not defer either row to a later stage.

```tsx
// Temporary face shape for both files
export function GraphTuningSliders(props: GraphTuningSlidersProps): React.ReactElement {
    return mountVanilla(GraphTuningSlidersView, props);
}
```

Afterwards the graph compiles, and a human can open Physics and Expansion, move a tuning slider,
and change the expansion depth or max-visible field without leaving the graph page.

### Stage 3 — convert the coordinate tooltip leaf

Add `src/renderer/editors/graph/GraphTooltipView.ts`, `GraphTooltip.css`, and reduce
`GraphTooltip.tsx` to a `mountVanilla(GraphTooltipView, props)` face plus
`export { buildMarkdown } from "./GraphTooltipView"` for the current `GraphMutationModel` import.
The view must:

- append a fixed `tooltip` root to `getOverlayLayer()` on mount and remove it on disposal;
- create native header/content hosts, fresh copy/open `IconButtonView`s, native markdown-link
  anchors, and the custom 12×12 copy/check SVGs from `GraphTooltip.tsx:158-199`;
- update existing children from `onUpdate()` rather than rebuild listeners; clear the copy reset
  timer through `own()` and guard its callback with the view's liveness;
- preserve `buildMarkdown()` byte-for-byte in behavior, `pagesModel.addEditorPage()` behavior, the
  500ms model delay, mouse-enter/leave handoff, and viewport flip/clamp logic;
- call `position()` after the root is attached and after `[node,x,y,isRoot]` changes. Use the root's
  `getBoundingClientRect()` for measurement and never `offsetParent`.

The React portal seam changes as follows:

```tsx
// Before: GraphTooltip.tsx:261-295
return ReactDOM.createPortal(<div ref={ref} style={rootStyle}>…</div>, getOverlayLayer());
```

```ts
// After: GraphTooltipView.ts
protected onMount(): void {
    getOverlayLayer().append(this.root);
    this.mountChildren();
    this.position();
}
```

`GraphMutationModel.ts` may continue importing through the face in this stage, so the repository
compiles and the current parent remains unchanged. In this Stage 3 change set, add the
`GraphTooltip.tsx` temporary-face row to the roadmap ledger with collectability “Stage 7, after
`GraphBody.tsx` is deleted”; this row is not retrospective. A human can hover a graph node, move the pointer
over the tooltip, and check the copy/open buttons; the stage-specific geometry check must report a
non-zero fixed tooltip rectangle.

### Stage 4 — convert the legend leaf

Add `src/renderer/editors/graph/GraphLegendPanelView.ts` and `GraphLegendPanel.css`; reduce
`GraphLegendPanel.tsx` to its `mountVanilla` face. In this Stage 4 change set, add its
`GraphLegendPanel.tsx` temporary-face row to the roadmap ledger with collectability “Stage 7, after
`GraphBody.tsx` is deleted”; do this when the face is created. Move `LegendRow` and `SelectionRadioRow` into
native view classes. Preserve the absolute bottom-left placement, opacity behavior, tab labels,
search-active notice, descriptions, and all filter calculations from
`GraphLegendPanel.tsx:257-327` and `:339-604`.

Remove all three `GraphLegendModel.effect()` registrations. Use an effect-free driver, one local
state `bind()`, and one editor-state subscription/projection for selected-node and search-query
changes. Use `createDepsGate()` over the exact highlight array recorded in the model ledger, and
guard the queued apply with `isLive` and current values. Install `editor.onHighlightSelection` once
and clear it only if it still points to this view's callback. Clear every description debounce timer
on disposal.

Use `SubtreeSwap` for expanded/closed content, search notice/normal content, and active tab
content. Use `KeyedList` for level/shape/radio rows where rows are created from arrays; its
`remove` callback must dispose each `LegendRowView`. Each row owns its checkbox, input, and fresh
SVG element. `highlight` is not used here.

Afterwards the graph compiles with the React body still rendering the face. A human can expand the
legend, switch between Selection/Level/Shape, toggle an icon row, and confirm the legend SVGs are
visible at 14px.

### Stage 5 — convert the detail panel and its tab owners

Add `src/renderer/editors/graph/GraphDetailPanelView.ts` and move the complete detail subtree into
native classes: `GraphDetailPanelView`, `LinksTabView`, `PropertiesTabView`, `InfoTabView`, and
`MultiInfoTabView`. Reduce `GraphDetailPanel.tsx` to the thin `mountVanilla` face. In this Stage 5
change set, add its `GraphDetailPanel.tsx` temporary-face row to the roadmap ledger with
collectability “Stage 7, after `GraphBody.tsx` is deleted”; record it at face creation. Keep
`GraphDetailPanel.css`, extending it only with static styles needed by the native hosts.

Preserve the exact model operations and callback contracts from
`GraphDetailPanel.tsx:451-528`, `:692-760`, `:816-1016`, and `:1082-1230`:

- detail header selection/dirty locking, expand/collapse requests, resize constraints, Info,
  Properties, and Links tab behavior;
- `DataGridView` ownership, columns, row keys, edit/add/delete/focus callbacks, mixed values,
  reserved-key validation, Apply/Cancel, linked-node hover, and external highlight callbacks;
- the nested `Panel` flex/overflow chain. Explicitly size the root, tab content, and the two nested
  DataGrid panel levels so the grid does not collapse to zero height;
- direct native `InputView`, `ButtonView`, `DataGridView`, and `createPanelElement` usage. No
  `Icon` face is used in native code: append a fresh `createLevelIconElement()` or
  `createShapeIconElement()` to each fixed icon button at size 16;
- one `SubtreeSwap` for active detail content and nested Info/Properties/Links branches. DataGrid
  is an imperative child owner; no view disposes a shared `GraphNode` or editor model.

Remove `effect()` from `GraphDetailModel`, `LinksTabModel`, and `PropertiesTabModel`. Use exact
deps gates and guarded microtasks from the model/effect ledger. For local inputs and resize state,
update fields and existing child views; never register a bind/listener from `sync()`. Document and
preserve the one-time document mousemove/mouseup pair for resizing, including disposal if the panel
is closed during a drag.

The final icon seam in this stage is:

```tsx
// Before: GraphDetailPanel.tsx:1209
<Icon icon={createLevelIconComponent(lvl)} />
```

```ts
// After: GraphDetailPanelView.ts
const icon = createLevelIconElement(lvl, 16);
levelButton.append(icon);
```

Remove the temporary `SvgIconComponent` adapter functions from `GraphIcons.ts` only after this
stage's native detail view no longer needs them. The still-React parent now consumes the detail
face, so it compiles and retains its existing root. A human can select a node, open the detail
panel, edit a title, inspect Properties, and open Links; the visible panel and DataGrid must have
non-zero rectangles.

### Stage 6 — convert the last body parent

Add `src/renderer/editors/graph/GraphBodyView.ts` and `GraphBody.css`; reduce `GraphBody.tsx` to a
thin `mountVanilla(GraphBodyView, props)` face. In this Stage 6 change set, add the
`GraphBody.tsx` temporary-face row to the roadmap ledger with collectability “Stage 7, after
`GraphBody.tsx` is deleted”; record it at face creation. This stage is the only one that changes the
renderer callback event surface: change `ForceGraphRenderer.ts:340-410` and
`:608-624` from `React.MouseEvent<HTMLCanvasElement>` to native `MouseEvent`, because the native
view installs the canvas listeners directly.

This is a deliberate, minimal C13 exception: the only signatures changed are
`ForceGraphRenderer.onClick`, `.onContextMenu`, `.onMouseMove`, `.onDblClick`,
`.hasNodeAt`, `.findNodeAt`, and `.findBadgeAt` at `ForceGraphRenderer.ts:340`, `:374`, `:381`,
`:406`, `:608`, `:612`, and `:624`. Their only callers are converted by this task, so removing
these React event types is necessary for the native listener boundary. The approximately 260
reference repo-wide `React.*` type surface remains Epic F's concern; no other file's `React.*`
types are touched.

`GraphBodyView` owns the exact children now available as native views: tuning, expansion, tooltip,
detail, legend, the canvas, and local search-result rows. It must:

- build the flex/height chain and loading/error/empty/canvas/toolbar hosts in `onMount()` with
  explicit sizes; replace `EditorError` with a native text/panel error projection and leave thrown
  failures to `AsyncEditorView` → `NativeEditorErrorView`;
- create one effect-free `GraphBodyModel` driver or equivalent local state, one local-state bind,
  and one editor projection bind. Assign/clear `editor.onDoubleClickNode` once. Subscribe once to
  `editor.typedQueue` and release it through `own()`;
- bind `themeState` once to `editor.refreshColors()`, install the Shift, Ctrl+F, Ctrl+A, blur,
  and keyup listeners once through `listen()`, and keep all live guards for asynchronous work;
- implement the search toolbar and `GraphSearchResultsView` with `KeyedList` keyed by
  `result.nodeId`, disposing removed row views. Each row owns three text hosts and calls
  `highlightInto()` for label, property key, and property value. Scroll the selected row from
  central sync, replacing the old `[selectedIndex]` effect;
- use `SubtreeSwap` for loading/content, toolbar-panel branches, and search-result/no-result
  branches. Use existing native UIKit twins (`IconButtonView`, `InputView`, `SpinnerView`,
  `ButtonView`, `createTextElement`, `createPanelElement`) and import their CSS directly;
- keep the coordinate `showAppPopupMenu()` path in `GraphEditor.ts:583-629` for renderer-originated
  node/empty-area context menus. For the anchored “N selected” action, use one caller-owned
  `MenuHandle` from `openMenu()`; dispose before reopen, clear in `onClose`, and dispose in
  `onDispose`. Fresh menu icon Nodes are required. Do not invent a second global popup owner;
- preserve canvas click/double-click/context-menu/mouse-move behavior, dirty-panel click blocking,
  popup-close debounce, expand-all confirmation, selection actions, and canvas ref handoff to the
  already-native toolbar in `index.ts`.

The React search calls change as follows:

```tsx
// Before: GraphBody.tsx:195, 200, 203
{highlight(result.label, searchQuery)}
```

```ts
// After: GraphSearchResultView
highlightInto(this.labelHost, result.label, searchQuery);
```

At the end of this stage the still-React `index.ts` renders a native body through the one remaining
body face, so the graph compiles and can be opened. A human can open the graph, select a node, type
in Search, use ArrowDown/Enter, and check that highlighted spans and the non-zero canvas remain.

### Stage 7 — final native composition and face/ledger drain

Modify only the graph composition and final import seams, then delete every temporary face:

- modify `src/renderer/editors/graph/index.ts` to import `GraphBodyView` directly and remove
  `createElement`, `EditorErrorBoundary`, and `GraphBody` imports;
- in `GraphEditorView.onMount()` construct body, toolbar, footer, and `TextChromeView`, own them
  with `child()`, append their roots before mounting, pass `body.root` as `children`, and mount
  body first with chrome last. Keep toolbar/footer contribution roots in the existing native
  slots. In `onUpdate()`, require `GraphEditor`, throw on a different model instance, and update
  existing body/toolbar/footer/chrome objects only;
- modify `src/renderer/editors/graph/GraphMutationModel.ts:9` to import `buildMarkdown` from
  `GraphTooltipView.ts`, so no surviving code imports the deleted tooltip face;
- before deleting any face, grep each **module path** for all importers and re-exports, not just the
  face's component name: for example, search `from "./GraphLegendPanel"` and the corresponding
  `GraphBody`, `GraphTooltip`, `GraphDetailPanel`, `GraphExpansionSettings`, and
  `GraphTuningSliders` module paths. This follows the recorded PageToolbar/SwitchWidget lesson
  that a module can have callers of a different export (`doc/de-react.md:1010-1014`);
- delete `GraphBody.tsx`, `GraphDetailPanel.tsx`, `GraphLegendPanel.tsx`, `GraphTooltip.tsx`,
  `GraphExpansionSettings.tsx`, and `GraphTuningSliders.tsx`. `GraphIcons.tsx` was already deleted
  in Stage 1. `find src/renderer/editors/graph -name "*.tsx"` must return nothing;
- remove the six graph temporary-face entries from `doc/de-react.md` in this final implementation
  stage. The entries are created as each face is introduced and remain until this stage; the
  programme cannot close while any one is still in the tree. The `uikit/shared/highlight.ts` React
  branch is not a temporary face and remains recorded for Epic F.

Before → after for the editor composition:

```ts
// Before: graph/index.ts:145-150 and :171-176
children: createElement(
    EditorErrorBoundary,
    null,
    createElement(GraphBody, { model, canvasRefSetter: this.setCanvas }),
),
```

```ts
// After: graph/index.ts:onMount
const body = this.child(new GraphBodyView({ model, canvasRefSetter: this.setCanvas }));
const chrome = this.child(new TextChromeView({
    model: this.props.model,
    children: body.root,
    rightToolbarContributions: toolbar.root,
    footerContributions: footer.root,
}));
this.root.append(body.root, toolbar.root, footer.root, chrome.root);
body.mount();
toolbar.mount();
footer.mount();
chrome.mount();
```

Afterwards the complete graph directory compiles without React runtime code, while the intentional
renderer-wide React survivors and UIKit compatibility files remain untouched.

The final human check is a cold-open of the visible graph editor followed by one node selection and
one tooltip hover, confirming the canvas, detail panel, legend, and fixed tooltip all have the
expected non-zero geometry.

### Temporary-face removal ledger

The implementation stages must add these individual entries to the “removal ledger” section of
`doc/de-react.md` when the corresponding face is created. This planning thread does not edit that
roadmap because the user requested a task document only. Each entry must state that it exists solely
to keep the named React parent compiling and is collectable in Stage 7; Stage 7 removes all six
entries together with the faces.

| Temporary face to record | Created in | Still-React parent it protects | Collectable |
|---|---|---|---|
| `src/renderer/editors/graph/GraphTuningSliders.tsx` | Stage 2 | `GraphBody.tsx` | Stage 7 |
| `src/renderer/editors/graph/GraphExpansionSettings.tsx` | Stage 2 | `GraphBody.tsx` | Stage 7 |
| `src/renderer/editors/graph/GraphTooltip.tsx` | Stage 3 | `GraphBody.tsx` and `GraphMutationModel.ts`'s compatibility import | Stage 7 |
| `src/renderer/editors/graph/GraphLegendPanel.tsx` | Stage 4 | `GraphBody.tsx` | Stage 7 |
| `src/renderer/editors/graph/GraphDetailPanel.tsx` | Stage 5 | `GraphBody.tsx` | Stage 7 |
| `src/renderer/editors/graph/GraphBody.tsx` | Stage 6 | `graph/index.ts` | Stage 7 |

This is required by the roadmap rule: temporary duplication is accepted only when written down at
creation, and the programme cannot close while an entry remains in the tree
(`doc/de-react.md:1766-1776`).

## Concerns / Open questions

All design questions found during investigation are resolved below; none should be reopened during
implementation without recording a scope change.

1. **Tooltip positioning.** Use a graph-owned coordinate positioner with `getOverlayLayer()`, not
   `attachTooltip()` or a new UIKit helper. The graph model already supplies delayed hover state;
   the view owns only the overlay DOM and fixed-position measurement. Verify fixed geometry with
   `getBoundingClientRect()`.
2. **Icon contract.** Element factories returning real SVG elements are canonical. Keep the
   temporary `SvgIconComponent` object adapters only while the React detail face needs them, then
   remove them after Stage 5. Do not create native equivalents of `Icon` and do not edit the UIKit
   `Icon.tsx` face.
3. **Effect-bearing models.** No effect-bearing model is passed to a native driver. Remove each
   effect and replace it with the exact state subscription/deps-gate entry in the ledger. The two
   effect-free choices are the only models eligible for `createComponentModelDriver` without
   restructuring.
4. **Context menus.** Keep `showAppPopupMenu` for coordinate menus triggered by the renderer's
   client coordinates. The selection counter has an anchor and gets one `openMenu`/`MenuHandle`
   owned by `GraphBodyView`. This keeps global coordinate behavior in `GraphEditor` while applying
   the native caller-owned menu contract to the new anchored site.
5. **Existing caught-value issue.** `GraphEditor.ts:821-825` has a pre-existing `e.message` parse
   catch. The conversion adds no catch around it and does not broaden this task into a model
   behavior change; any new catch must use `errMessage(e, fallback?)` from `src/shared/utils.ts`.
6. **Layout.** Every new wrapper inside the body/canvas/detail/DataGrid flex-height chains needs
   explicit flex/width/height styling. A React-root measurement is insufficient; the live pass must
   record visible canvas, detail panel, grid, and tooltip rectangles.
7. **Stale dynamic imports.** After the final `.tsx`→`.ts` import change, use a cold renderer and
   dev-server restart if Vite reports `Failed to fetch dynamically imported module`; a renderer-only
   reload does not clear the stale specifier cache (US-1169 README:730-737).

### Files that need no changes

Do not modify `src/renderer/editors/graph/GraphEditor.ts`, `GraphDataModel.ts`,
`GraphVisibilityModel.ts`, `GraphSearchModel.ts`, `GraphTooltipModel.ts`, `GraphHighlightModel.ts`,
`GraphGroupModel.ts`, `GraphGroupActionsModel.ts`, `GraphConnectivityModel.ts`, `types.ts`,
`shapeGeometry.ts`, or `constants.ts`, except for the explicitly listed `ForceGraphRenderer.ts`
native-event type change and the explicitly listed `GraphMutationModel.ts` import move. Their model,
renderer, serialization, and graph-data behavior stays owned by the existing classes.

Do not modify or delete any UIKit `*.tsx` face, `src/renderer/uikit/Popover/PopoverView.tsx`,
`DialogView.tsx`, `src/renderer/uikit/shared/slots.ts`, `fill-slot.ts`, the React branch of
`highlight.ts`, the `React.*` type surface, or `TextChromeView.updateSlots`. Do not modify
`doc/active-work.md`. Do not add tests, fixtures, test harnesses, commits, or unrelated editor
changes.

## Acceptance Criteria

### Native cut and lifecycle

- [ ] Add the native graph view modules and static CSS named in the Files Changed table; delete all
  seven graph `.tsx` files. `find src/renderer/editors/graph -name "*.tsx"` returns no output.
- [ ] No final graph view contains JSX, a React runtime import, `ReactDOM`, `useEffect`,
  `useLayoutEffect`, `useComponentModel`, `EditorError`, or `EditorErrorBoundary`. The temporary
  faces exist only before Stage 7 and are all removed there.
- [ ] `GraphBodyModel`, `GraphDetailModel`, `LinksTabModel`, `PropertiesTabModel`, and
  `GraphLegendModel` have no registered effects before being driven natively. `GraphExpansionModel`
  remains effect-free. No driver is mounted for an effect-bearing model.
- [ ] Every old effect has the exact dependency array in the model/effect ledger; each queued
  callback checks liveness and current props/state. Every `state.use()` is replaced by one compound
  bind per view/state source installed in `onMount()`.
- [ ] Every conditional branch uses `SubtreeSwap`; every view-owned keyed row uses `KeyedList` and
  disposes the removed row in its `remove` callback. All children, DataGrid instances, listeners,
  subscriptions, timers, document resize handlers, menu handles, and overlay roots are disposed.
- [ ] The body's typed queue has one `subscribe()` with `own()` cleanup. No bind/listener/gate is
  registered by a repeatedly called `sync()` method.
- [ ] The body/canvas/detail/DataGrid height chains have explicit flex/width/height styles. No
  layout value is pinned from a zero measurement; any frame retry checks `isConnected` and `> 0`.

### Tooltip, icons, menus, and highlighting

- [ ] `GraphTooltipView` appends its fixed root directly to `getOverlayLayer()`, preserves hover
  handoff/copy/open behavior, and positions using the current 12px offset and viewport clamp.
- [ ] Tooltip presence checks use `getBoundingClientRect()` or computed style; no overlay assertion
  uses `offsetParent`.
- [ ] `GraphIcons.ts` exposes canonical `createShapeIconElement` and `createLevelIconElement`
  factories that return real SVG elements. Detail uses size 16 and legend uses size 14; no DOM icon
  node is shared across rows or menu items.
- [ ] `GraphContextMenu.ts` has no React runtime import and builds fresh native open-link icons.
  `GraphMutationModel.ts` imports `buildMarkdown` from the surviving native tooltip module after
  the face is deleted.
- [ ] Search rows use `highlightInto` for label/key/value. The React branch in
  `uikit/shared/highlight.ts` remains unchanged and is recorded for Epic F cleanup.
- [ ] The anchored selection menu has one `MenuHandle`, disposes before reopen, clears on close,
  and disposes on view teardown. Coordinate node/empty-area context menus retain
  `showAppPopupMenu` in `GraphEditor`.

### Exact final editor composition

- [ ] `src/renderer/editors/graph/index.ts` has no `createElement`, `EditorErrorBoundary`, or
  `GraphBody` import. It builds body/chrome in `onMount()`, appends roots before mounting, mounts
  body first and chrome last, and passes `body.root` through `TextChromeView.children`.
- [ ] `GraphEditorView.onUpdate()` throws if `requireGraphModel(props.model)` is not the same model
  instance and otherwise updates existing body/toolbar/footer/chrome objects without rebuilding
  children.
- [ ] The final graph editor adds no React root. This is a per-editor assertion; do not claim
  application-wide zero roots because Storybook and the named draw vendor island remain deliberate
  React paths (EPIC-073:265-276).
- [ ] The six temporary graph-face entries are present in `doc/de-react.md` while stages are in
  progress and all removed in Stage 7; no temporary entry remains when this task is complete.

### Presence: opening and exercising Graph

Open the editor through either verified route:

1. Use the sidebar **Force Graph** tool. Its native registry entry creates
   `pagesModel.addEditorPage("graph-view", "json", "untitled.fg.json")`
   (`src/renderer/ui/sidebar/tools-editors-registry.ts:120-127`), or open a real file ending in
   `.fg.json`.
2. Confirm the matcher accepts JSON with `"type": "force-graph"` and `"nodes"`
   (`src/renderer/editors/base/editor-matchers.ts:125-135`) and the dynamic registration is
   `graph-view` with `hasContentHost: true` (`src/renderer/editors/register-editors.ts:157-158`).

On the visible page editor only, a human must see and exercise:

- the force-graph canvas rendering nodes and edges at non-zero `getBoundingClientRect()` size;
- selecting a node and seeing its detail panel with properties, including the Properties grid;
- the legend panel rendering its shape icons at non-zero size;
- hovering a node, seeing the tooltip appear after its delay, and confirming its fixed rectangle is
  positioned beside the pointer/within the viewport. Scope this query to the visible tooltip/root;
  never use `offsetParent` for it;
- Physics tuning sliders changing force parameters, Expansion root/depth/max-visible controls
  changing their editor settings, and Reset returning the default force parameters;
- search highlighting matches through the native `highlightInto` path, keyboard result selection,
  and the visible/no-results states;
- node/empty-area context menus, selection actions, detail tabs, property/link edit/apply/cancel,
  link-row external hover, group toggle, reset view, expand-all confirmation, tooltip copy/open,
  and the graph toolbar's open-in-draw/copy-image actions where the available instrument can drive
  them.

All DOM assertions must first select the page-editor element with a non-empty `getClientRects()`
result (or the equivalent visible-page marker), then query within that element. Assert no
`[data-react-root]` descendants there; do not query the first matching editor or make an
application-wide zero-root claim. If the available instrument cannot drive keyboard/pointer/file
dialog behavior, mark that behavior *unverified* rather than substituting a structural measurement,
following the reviewed C9a records (US-1166 README:545-559; US-1168 README:579-590; US-1167
README:608-622).

### Checks

- [ ] After implementation, `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.
- [ ] A cold dev-server/renderer restart is used after any stale dynamic-import error caused by the
  `.tsx`→`.ts` conversion; a renderer reload alone is not treated as sufficient.
- [ ] Structural checks show no `.tsx` under `src/renderer/editors/graph`, no React runtime or
  `react-dom` import in final graph code, the React `highlight` form still exists but has no graph
  consumer, and no prohibited shared/UIKit file changed.
- [ ] Any unavailable or failed human behavior check is explicitly recorded as unverified with its
  reason. Presence is not inferred from React absence.

## Files Changed Summary

| File | Planned status | Scope |
|---|---|---|
| `doc/tasks/US-1170-graph-native/README.md` | Add | This planning document only; no implementation is performed in this thread. |
| `src/renderer/editors/graph/GraphIcons.ts` | Add; replaces `.tsx` | Canonical native shape/level SVG element factories and temporary bridge adapters until Stage 5. |
| `src/renderer/editors/graph/GraphTuningSlidersView.ts` | Add | Native tuning controls and view-owned values. |
| `src/renderer/editors/graph/GraphExpansionSettingsView.ts` | Add | Native expansion controls and effect-free model driver. |
| `src/renderer/editors/graph/GraphTooltipView.ts` | Add | Overlay-layer tooltip DOM, positioning, links, copy/open actions, and markdown export. |
| `src/renderer/editors/graph/GraphLegendPanelView.ts` | Add | Native legend model/view, rows, tabs, filters, descriptions, and highlight gate. |
| `src/renderer/editors/graph/GraphDetailPanelView.ts` | Add | Native detail panel, info/multi-info, properties, links, grids, resize, and lifecycle. |
| `src/renderer/editors/graph/GraphBodyView.ts` | Add | Native graph body, canvas events, search, toolbar branches, child ownership, and state bindings. |
| `src/renderer/editors/graph/GraphBody.css` | Add | Static/co-located body, canvas, toolbar, and search-result styles. |
| `src/renderer/editors/graph/GraphTooltip.css` | Add | Static/co-located tooltip styles; dynamic position remains view-owned. |
| `src/renderer/editors/graph/GraphLegendPanel.css` | Add | Static/co-located legend styles. |
| `src/renderer/editors/graph/GraphExpansionSettings.css` | Add | Static/co-located expansion-control styles. |
| `src/renderer/editors/graph/GraphTuningSliders.css` | Add | Static/co-located tuning-control styles. |
| `src/renderer/editors/graph/GraphContextMenu.ts` | Modify | Replace React icon node with fresh native SVG factories. |
| `src/renderer/editors/graph/ForceGraphRenderer.ts` | Modify | Change canvas callback/helper event types from React mouse events to native `MouseEvent`. |
| `src/renderer/editors/graph/GraphMutationModel.ts` | Modify | Point `buildMarkdown` at `GraphTooltipView.ts` after the face is deleted. |
| `src/renderer/editors/graph/index.ts` | Modify | Direct body-first/chrome-last native composition, model identity guard, and no error boundary. |
| `src/renderer/editors/graph/GraphDetailPanel.css` | Modify if needed | Extend existing co-located detail styles only for native hosts; preserve current placement. |
| `src/renderer/editors/graph/GraphDetailPanel.tsx` | Delete in Stage 7 | Temporary React face during Stage 5–6; all detail logic moves to `GraphDetailPanelView.ts`. |
| `src/renderer/editors/graph/GraphBody.tsx` | Delete in Stage 7 | Temporary React face during Stage 6; body logic moves to `GraphBodyView.ts`. |
| `src/renderer/editors/graph/GraphLegendPanel.tsx` | Delete in Stage 7 | Temporary React face during Stage 4–6. |
| `src/renderer/editors/graph/GraphTooltip.tsx` | Delete in Stage 7 | Temporary React face during Stage 3–6; `buildMarkdown` moves to native module. |
| `src/renderer/editors/graph/GraphExpansionSettings.tsx` | Delete in Stage 7 | Temporary React face during Stage 2–6. |
| `src/renderer/editors/graph/GraphTuningSliders.tsx` | Delete in Stage 7 | Temporary React face during Stage 2–6. |
| `src/renderer/editors/graph/GraphIcons.tsx` | Delete in Stage 1 | Unreferenced React component half; native factories move to `GraphIcons.ts`. |
| `doc/de-react.md` | Future implementation-stage edits | Add each six temporary-face ledger entry when created; remove all six in Stage 7. Not modified in this planning thread. |
| `src/renderer/uikit/**`, `TextChromeView.ts`, `doc/active-work.md` | No change | Explicit scope guards. |
| Tests, harnesses, fixtures, commits | None | Explicitly forbidden. |

## Verification record (investigation, 2026-08-27)

**Guidance read:** `CLAUDE.md` was read in full first, followed by `.claude/rules/task-docs.md`.
The full EPIC-073 scope and the US-1166, US-1168, US-1167, and US-1169 task documents were read,
including their Verification records. Their reviewed lifecycle, overlay, sizing, and C9a decisions
are carried into this plan. No implementation, test, lint, typecheck, or build command was run.

**Source/render graph verified:** `graph/index.ts:145-220` owns the native toolbar/footer and the
React body wrapper; `GraphBody.tsx:644-703` renders the direct child panels; and
`GraphDetailPanel.tsx:547-635` plus `:762-796`, `:1033-1071`, and `:1103-1230` renders the nested
detail subtree. `GraphMutationModel.ts:9` is the additional markdown-export importer. No other
application file imports the seven graph `.tsx` modules; `rg` found no consumer of the
`ShapeIcon`/`LevelIcon` component exports.

**Graph-specific facts verified:** the only `react-dom` value use in the editors is
`GraphTooltip.tsx:2`; the portal target is already `getOverlayLayer()` at `:294`. The existing
native SVG builders are at `GraphIcons.tsx:57-112` and `:147-163`; the React component adapters
are at `:114-119` and `:165-169`. `GraphBody.tsx:3`, `:195`, `:200`, and `:203` are the sole graph
use of the React `highlight()` API. `GraphContextMenu.ts:1-8` is the remaining graph `.ts` React
value import and uses one reusable virtual icon node, so the plan replaces it with fresh native
nodes.

**Model facts verified:** effect-bearing and effect-free `TComponentModel`s, including their
dependency arrays, are recorded directly from `GraphBody.tsx:243-282`,
`GraphDetailPanel.tsx:256-394`, `:657-685`, `:863-913`, `GraphLegendPanel.tsx:163-337`, and
`GraphExpansionSettings.tsx:31-43`. `GraphTuningSliders.tsx` has only React local state. The
native-driver rejection for effect-bearing models is confirmed at
`src/renderer/core/state/model.ts:302-308`.

**Routing facts verified:** Force Graph is created by the sidebar registry at
`src/renderer/ui/sidebar/tools-editors-registry.ts:120-127`; `.fg.json` and force-graph content
matching is at `src/renderer/editors/base/editor-matchers.ts:125-135`; dynamic registration is at
`src/renderer/editors/register-editors.ts:157-158`.

**Roadmap ledger verified:** the removal ledger requires every temporary duplicate to be written
when created and forbids programme closure while an entry remains
(`doc/de-react.md:1766-1776`). Because this thread is document-only, the actual roadmap is not
edited; the exact six future entries and their Stage 7 removal are recorded above.

**Unverified until implementation and human pass:** all native modules, compilation, lint/build,
final `.tsx`/React counts, visible graph canvas/detail/grid/legend/tooltip geometry, node selection,
editing/apply behavior, legend filters, expansion/tuning changes, search keyboard flow, context
menus, copy/open actions, toolbar image actions, disposal, and cold-restart behavior. Any action an
available instrument cannot drive must remain explicitly unverified, following the prior reviewed
records rather than being replaced with a structural assertion.

---

## Verification record (2026-08-28)

**Gates:** `npm run typecheck`, `npm run lint`, `npm run build-prod` — all pass after every stage.

**Staged as planned, 7 stages across 4 threads**, each leaving the tree compiling:

| Stage | Result | markers |
|---|---|---|
| 1–2 | `GraphIcons.ts` native (its React `ShapeIcon`/`LevelIcon` were already dead), tuning + expansion leaves converted | 221 → 187 |
| 3–4 | tooltip (`ReactDOM.createPortal` → `getOverlayLayer()`) + legend, 3 legend effects removed | 187 → 131 |
| 5 | detail panel — 1,235 lines, all 9 effects re-expressed as exact-deps gates | 131 → 65 |
| 6–7 | `GraphBody` converted, all six faces deleted, all five ledger rows drained | 65 → **22** |

`find src/renderer/editors/graph -name "*.tsx"` returns nothing. No `effect()` remains in `graph/`.
No `ReactDOM`/`createPortal` remains. All 14 `effect()` registrations across the folder are gone.

**Live pass, after a cold dev-server restart**, on a 6-node/5-link `.fg.json` fixture:

| Check | Result |
|---|---|
| React roots in the visible graph editor | **0** |
| React roots app-wide | **1** (`GlobalStyles`) |
| Editor size | 1557×1011 |
| Native chrome renders | `Graph · 0 selected ▾ · Physics · Expansion · Results · Legend ▲ · **6 nodes**` — the footer count proves the fixture parsed |
| Canvas CSS size | 1557×949 |
| **Canvas backing store** | **1557×949** |
| **Canvas pixels** | **16 distinct colours, 30 opaque samples in a sparse scan — the graph is actually drawn** |

### The defect this pass caught, and the instrument that caught it

The first live run looked healthy by every structural measure — 0 React roots, no crash, canvas element
1557×949, footer reporting 6 nodes. **The graph was not rendering at all.**

Sampling the canvas pixels showed `backingSize: 300x150` — the HTML canvas *default* — and every
sampled pixel fully transparent. The element had CSS size; its backing store had never been sized.

Cause: the React original's `canvasRef` callback did two things — `editor.renderer.setCanvas(el)` and
`canvasRefSetter?.(el)` (old `GraphBody.tsx:388-392`). The conversion kept only the **unmount** half
(`setCanvas(null)` in `onDispose`) and never handed the canvas to the renderer on mount. So
`ForceGraphRenderer` never created its simulation, never added drag/zoom, never called
`handleResize()` (which is what sets `canvas.width/height` from the measured size), never observed
the canvas, and never applied the already-loaded data. Fixed by restoring both calls in `onMount()`,
with a comment recording the measured symptom.

**A sized canvas is not a drawn canvas.** Element geometry, React-root counts, crash checks and even
a model-derived footer count all passed while the feature was blank. The only instrument that could
see it was reading pixels. Any future canvas conversion should sample the backing store and the pixel
histogram, not the element box.

**Not verified — recorded as unverified rather than replaced (C9a):**

- **Node selection and the detail panel's contents** — needs pointer input on the canvas.
- **Hover tooltip appearance and positioning** — the `createPortal` → overlay-layer replacement is
  structurally in place and the overlay host exists, but no hover was driven.
- **Legend panel contents and its shape icons** — the panel renders, its rows were not inspected.
- **Expansion settings and tuning sliders changing the layout.**
- **Search highlighting** through the native `highlightInto` path.
- **Double-click expand**, context menu, and multi-select.
