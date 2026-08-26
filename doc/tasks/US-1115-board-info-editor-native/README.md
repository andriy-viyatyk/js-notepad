# US-1115: Convert the `board-info` editor to the vanilla View arm

Parent epic: [EPIC-068: De-React Epic E10 — the `PageToolbar` editor group](../../epics/EPIC-068.md)

## Goal

Convert the `board-info` editor from `EditorModule.Component` to
`EditorModule.View`. Preserve install-mode catalog tiles, download/register
actions, properties-mode board information, screenshots, version history, and
all existing model actions while making an opened Board Info editor contribute
0 `[data-react-root]` elements and 0 `[data-part="react-slot"]` elements.

0 roots is achievable within this task. The editor surface can use
`PageToolbarView`, native Panel/Text helpers, `ButtonView`,
`ProgressBarView`, and a native `BoardScreenshotView`; the retained React
`BoardScreenshot` compatibility face is used only by the separate React
`SearchBoardsTab` surface.

This is an unchecked epic task. The existing EPIC-068 dashboard entry remains
`[ ]`; do not add a dashboard entry, run `/review`, add tests, or commit.

## Background

### Current registration and editor surface

`src/renderer/editors/board-info/index.tsx:10-12` defines the generic
`BoardInfoEditorComponent`, casts `EditorModel` to `BoardInfoEditorModel`, and
renders `BoardInfoEditorView`. `boardInfoModule` registers that function as
`Component` at `:14-18`; it has no `View` arm.

`src/renderer/editors/board-info/BoardInfoEditorView.tsx:35-92` is the outer
surface. It renders one outer Panel with `data-type="board-info-editor"`,
`direction="column"`, `width="100%"`, `height="100%"`, and `minHeight={0}`.
That Panel contains exactly two children: `PageToolbar` at `:75` and a
scrolling body Panel at `:76-89`. The body is one Panel rather than a fragment
of page-column siblings, so this is the real Panel-root case from EPIC-068
E10-7—not the `display: contents` case used by the image pilot.

The native editor view must call `super(props, root)` with the outer Panel
element produced by `createPanelElement`, then restore the
`board-info-editor` data-type after the helper applies the ordinary Panel
data-type. The body Panel remains a claimed native child. Do not introduce a
local `createContentsRoot()` helper: it would remove the old editor-level
Panel and change the page-column flex/size contract.

The page mounting path is already native-compatible. `RenderEditorView` keeps
its root transparent and claims `AsyncEditorView` at
`src/renderer/ui/app/RenderEditorView.ts:15-25`; `AsyncEditorView` appends the
registered view root and calls `mount()` at
`src/renderer/ui/app/AsyncEditorView.ts:98-125`. The conversion only changes
the Board Info module and its surface.

### Exhaustive hook and reactive-read inventory

The following table accounts for every hook and reactive read in both React
files. There are no `useMemo`, `useCallback`, `useRef`, `useOptionalState`, or
`useComponentModel` calls in the Board Info surface.

| File:line | Current hook/read | State or dependency read | Native replacement |
|---|---|---|---|
| `BoardInfoEditorView.tsx:36-44` | `model.state.use(selector)` | `boardRoot`, `matches`, `installDir`, `installUi`, `props`, `versions`, `versionsState` | One compound `this.bind(this.model.state, selectSurfaceState, applySurfaceState)` from `onMount()`, with immediate apply and updates to the existing body and toolbar. |
| `BoardInfoEditorView.tsx:47` | `boardInstallRegistry.useInstalled()` | Installed-board entries used by `tileStatus()` at `:116-120` | `subscribeInstalled(() => this.syncSurface())`, plus immediate `listInstalled()` in the projection; API at `board-install-registry.ts:130-135`. |
| `BoardInfoEditorView.tsx:48` | `boardTrust.useTrustedPaths()` | Returned paths are unused; the read makes `boardTrust.isTrusted()` at `:118-120` reactive | `boardTrust.subscribePaths(() => this.syncSurface())`, with synchronous `isTrusted()` checks; API at `board-trust.ts:77-87`. |
| `BoardInfoEditorView.tsx:56-59` | First `useEffect` | `matches.length` and `Boolean(boardRoot)`; calls `shouldAutoSwitch()` only in install mode | A second binding selecting only `{ matchCount: matches.length, isProperties: Boolean(boardRoot) }`, whose immediate apply and selected changes call guarded `maybeAutoSwitch()`. |
| `BoardInfoEditorView.tsx:64-71` | Second `useEffect` | `isProperties` chooses `loadProperties()` versus `reconcile()` on window focus | One `window` focus listener installed in `onMount()`; it reads the current model mode at event time and is owned by `this.listen()`. |
| `BoardInfoEditorView.tsx:339-342` | `publishedBoards.useCatalog()` | Catalog entry matching `props.catalogId` supplies the properties screenshot URL | Add `publishedBoards.subscribeCatalog(listener)`; route `useCatalog()`, `getCatalog()`, and the subscription through one private `selectCatalogBoards` projection, then subscribe once in `onMount()` and use `getCatalog()` for the immediate projection. |
| `BoardScreenshot.tsx:45` | `useState(false)` | Transient `failed` state chooses image or placeholder | A private `failed` field on `BoardScreenshotView`. |
| `BoardScreenshot.tsx:49` | `useEffect(..., [url])` | A changed URL starts a fresh image attempt | `BoardScreenshotView.onUpdate()` resets failure only when the URL changes. |
| `BoardScreenshot.tsx:73` | React `onError` | Failed remote images show the fixed-size placeholder | One native `error` listener on the stable image. |

The `React.ReactNode` type at `BoardInfoEditorView.tsx:294` is not a reactive
read; remove it when the helper becomes a native DOM builder. The direct
`model.state.get()` read in the Versions retry callback at `:481-482` is an
event-time command read, not a render dependency; retain it in the native
button callback so retry uses the current catalog id.

### Subscription source-object audit

All required sources are stable for one mounted Board Info view:

- `BoardInfoEditorModel.state` is the model’s fixed state object for the
  mounted editor instance. The editor mounting path creates the registered
  view at `src/renderer/ui/app/AsyncEditorView.ts:102-125`; do not call
  `bind()` again from `onUpdate()` for ordinary state changes.
- `boardInstallRegistry`, `boardTrust`, and `publishedBoards` are module
  singletons. Their internal state objects do not get replaced; the catalog
  subscription is added in this task.
- `window` is not a replaceable state source; its focus listener is owned once.

There is no host-selection-style replaceable subscription in this editor. Do
not re-call `bind()` on every surface update. If a source is found to change,
store its unsubscribe in a field, unsubscribe before switching sources, and
apply the replacement immediately; `own()` has no early-release API
(`src/renderer/uikit/shared/vanilla-view.ts:128-132`).

### Native replacements for every UIKit face

The old surface imports these UIKit React faces at
`BoardInfoEditorView.tsx:3-4` and `BoardScreenshot.tsx:2`:

| React face | Sites | Native replacement | Availability evidence |
|---|---|---|---|
| `Panel` | Outer/body panels and all layout rows | `createPanelElement()`; use `resolvePanelAttributes()`/`applyPanelAttributes()` for updates | `src/renderer/uikit/Panel/panel-style.ts:145-357`; no `PanelView` class exists. |
| `Text` | Titles, labels, descriptions, statuses, errors, and versions | `createTextElement()` and native text-content/attribute updates | `src/renderer/uikit/Text/text-style.ts:51-108`. |
| `Button` | Browse, download/cancel/retry/register/delete, open/uninstall/unregister, version actions | `ButtonView` with plain-string `children` and existing names/variants/titles/disabled values | Public constructor and lifecycle at `src/renderer/uikit/Button/ButtonView.tsx:35-69`; props at `:11-13`. |
| `ProgressBar` | Download progress `:210-215` and version loading `:466-470` | `ProgressBarView` | Public constructor/native projection at `src/renderer/uikit/ProgressBar/ProgressBarView.tsx:20-42`. |
| `PageToolbar` | `BoardInfoEditorView.tsx:75` | `PageToolbarView` with model and mode-dependent name; no slot content | Public constructor at `src/renderer/editors/base/PageToolbarView.ts:364-431`; props at `:20-28`. |

`BoardIcon` is not a UIKit face. It has a native builder because its string
body is defined at `src/renderer/theme/icons.tsx:183-186` and
`createIconWithViewBox` assigns `createElement` at `:153-170`. The native
screenshot can use `createIconComponentElement(BoardIcon, { width: 32,
height: 32, opacity: 0.35 })`, never its React callable form.

### `BoardScreenshot` and intrinsic sizing

`BoardScreenshot.tsx:39-44` accepts an optional width with fixed default 200.
It derives `height = Math.round(width * ASPECT)` at `:51`, where `ASPECT` is
the fixed 16:10 value `0.625` at `:28-30`. The Panel sets both dimensions and
the image uses `width: "100%"`, `height: "100%"`, `objectFit: "cover"`, and
`display: "block"` at `:32-37,55-67`.

This code does not measure layout or use intrinsic image dimensions: there is
no `getBoundingClientRect`, `offsetWidth`, `clientWidth`, `naturalWidth`,
`ResizeObserver`, or size-dependent effect. The browser’s intrinsic size is
contained by the fixed Panel. The native replacement must preserve this fixed
footprint and must not add measurement. A bounded post-paint retry is not
applicable; never introduce a microtask measurement before first paint.

### Export and importer audit

| Export/module edge | Verified use | Required treatment |
|---|---|---|
| `boardInfoModule` | Dynamic registry row at `src/renderer/editors/register-editors.ts:180-188` | Rename the index, register `View`, remove `Component`, and keep the extensionless importer. |
| `BoardInfoEditorModel` / default state from the index | Index factory at `index.tsx:1-5,15-16`; direct model consumers at `open-board-info.ts:5,33-58` and `api/boards.ts:300-310` | Preserve model exports and factory exactly. |
| `BoardInfoEditorState` from the index | No production importer found; it remains public API | Preserve the type export. |
| `BoardInfoEditorView` | Only the current local wrapper at `index.tsx:6,10-12` | Make the native class the `View` constructor. |
| `BoardScreenshot` | Board Info `:14,164,366` and `tools-hub/SearchBoardsTab.tsx:7,158` | Retain the export as a React `mountVanilla` shim backed by the new native view. Board Info imports the native class directly. |
| `BoardScreenshotView` | New direct native consumer and retained shim | Export the native class/props from its new file; no barrel change. |

No other importer of the old Board Info React surface was found. The `.tsx`
to `.ts` rename is expected to appear as delete-plus-add, per EPIC-068 E10-5.8.

### `BOARD_INFO_EDITOR_ID` special case

`BOARD_INFO_EDITOR_ID` is defined at
`src/renderer/editors/board-info/board-info-id.ts:4`. It is used by
`PageToolbarView.ts:314-334` to place and label the `+` switch segment, by
`editors/base/editor-switch.ts:121-136` for tolerant host-less transitions,
and by `BoardInfoEditorModel.ts:120-121` as `editorId`.

This special case does not affect the conversion. Passing the same model to
`PageToolbarView` preserves the `+` label/title and host-transfer behavior.
Do not modify `board-info-id.ts`, `PageToolbarView.ts`, or `editor-switch.ts`.

## Implementation Plan

### 1. Add the native screenshot view and retain the shared React face

Create `src/renderer/editors/board-info/BoardScreenshotView.ts` with a public
`BoardScreenshotView extends VanillaView<BoardScreenshotViewProps>`.

- Keep props `{ url?: string; width?: number }`, default width 200, and the
  existing 16:10 height calculation.
- In the constructor create only the stable Panel root with width, rounded
  border, light background, centered alignment, and hidden overflow. Override
  its `data-type` to `board-screenshot`, matching the React Panel at
  `BoardScreenshot.tsx:55-67`.
- In `onMount()`, create one image and one placeholder icon, append both,
  install one native `error` listener, and project visibility. Use
  `createIconComponentElement` for `BoardIcon`.
- In `onUpdate()`, reapply Panel attributes for a changed width, clear
  `failed` only when URL changes, set the image source, and toggle visibility.
  Keep the fixed footprint for no URL, 404, and network failure.
- Do not measure layout, schedule a measurement, or add a retry loop.

Rewrite `src/renderer/editors/board-info/BoardScreenshot.tsx` as the retained
React compatibility shim. It must keep `BoardScreenshot` for
`SearchBoardsTab.tsx:7,158`, but contain no duplicate hook-based rendering:

```tsx
// Before: BoardScreenshot.tsx:39-79
export function BoardScreenshot({ url, width = DEFAULT_WIDTH }: Props) {
    const [failed, setFailed] = useState(false);
    useEffect(() => { setFailed(false); }, [url]);
    return <Panel>{/* img or BoardIcon */}</Panel>;
}
```

```tsx
// After: BoardScreenshot.tsx
import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { BoardScreenshotView, type BoardScreenshotViewProps } from "./BoardScreenshotView";

export type { BoardScreenshotViewProps };

export function BoardScreenshot(props: BoardScreenshotViewProps): React.ReactElement {
    return mountVanilla(BoardScreenshotView, props);
}
```

The compatibility face remains a React child of Search Boards’ existing tree;
the converted Board Info view must import `BoardScreenshotView` directly.

### 2. Replace the Board Info React surface with a native Panel-rooted view

Rename `src/renderer/editors/board-info/BoardInfoEditorView.tsx` to
`BoardInfoEditorView.ts` and replace the function plus nested React functions
with a public `BoardInfoEditorView extends
VanillaView<{ model: EditorModel }>`.

Validate the incoming model with an `instanceof BoardInfoEditorModel` helper
and store it. The constructor creates only the stable outer root:

```tsx
// Before: BoardInfoEditorView.tsx:73-91
return (
    <Panel data-type="board-info-editor" direction="column"
        width="100%" height="100%" minHeight={0}>
        <PageToolbar model={model} name={isProperties ? "Board properties" : "Install editor"} />
        <Panel direction="column" flex={1} minHeight={0} overflowY="auto"
            align="stretch" gap="lg" paddingX="xl" paddingY="lg">
            {isProperties ? <PropertiesBody ... /> : <InstallBody ... />}
        </Panel>
    </Panel>
);
```

```ts
// After: BoardInfoEditorView.ts
export class BoardInfoEditorView extends VanillaView<{ model: EditorModel }> {
    public constructor(props: { model: EditorModel }) {
        const root = createPanelElement({
            direction: "column", width: "100%", height: "100%", minHeight: 0,
        });
        root.dataset.type = "board-info-editor";
        super(props, root);
        this.model = requireBoardInfoModel(props.model);
    }

    protected onMount(): void {
        // Claim/mount PageToolbarView and the scrolling body here.
        // Install bindings and external subscriptions after both children exist.
    }
}
```

In `onMount()` construct and claim exactly one `PageToolbarView` and one body
view, append them in toolbar-then-body order, and mount each once. The toolbar
props are `{ model, name: model.mode === "properties" ? "Board properties" :
"Install editor" }`; do not supply `children` or `rightContributions`, matching
`BoardInfoEditorView.tsx:75`.

The body view owns the scrolling Panel attributes from
`BoardInfoEditorView.tsx:76-85` and reproduces the install/properties fragments
inside its own root. It may use small native helpers/classes in the renamed
file (`InstallBodyView`, `PropertiesBodyView`, `VersionsSectionView`, and
`VersionRowView`) or equivalent view-owned helpers. Every dynamic
`ButtonView`, `ProgressBarView`, and `BoardScreenshotView` must be claimed with
`this.child(...)`; release old child views with `releaseChild()` before roots
are removed. Never merely detach a claimed child, and never use
`replaceChildren()` on a structural-helper-owned container. It is safe only on
a body-owned region.

Preserve all existing DOM attributes, text, and action behavior from
`BoardInfoEditorView.tsx:98-287,294-322,324-449,451-508,510-564`:

- Install mode keeps the title, install-location row, browse button, empty
  message, one tile per match, screenshot, name/version/size, optional
  description, selectable file-mask Panels, and idle/downloading/error/
  downloaded/registered status actions.
- Properties mode keeps the catalog-resolved screenshot, missing-board
  warning, metadata rows, repository-link guard, file/folder mask chips,
  catalog id, version loading/error/empty/list states, and Open/
  Uninstall/Unregister actions.
- Preserve `formatBytes`, `compareVersions`, `publishedBoards.isCompatible`,
  `boardTrust.isTrusted`, the retry callback’s current
  `model.state.get().props?.catalogId`, all button names/variants/titles, and
  all model command methods.

Do not add a custom `onDispose()` merely to dispose children. Normal child
lifetime belongs to `this.child(...)` and `VanillaView.dispose()`; use
`releaseChild()` only for dynamic replacement.

### 3. Replace implicit React rerenders with explicit native channels

Define a fixed projection containing exactly the seven fields read by the old
`model.state.use()` selector:

```ts
const selectSurfaceState = (state: BoardInfoEditorState) => ({
    boardRoot: state.boardRoot,
    matches: state.matches,
    installDir: state.installDir,
    installUi: state.installUi,
    props: state.props,
    versions: state.versions,
    versionsState: state.versionsState,
});
```

After the body and toolbar exist, install a three-argument `bind()` from
`onMount()`. Its apply callback updates the existing body and toolbar; it must
apply immediately and cover every later selected-field change. Model-state
writes must not rely on `onUpdate()`.

Install a second binding selecting only `matches.length` and
`Boolean(boardRoot)` for the old auto-switch effect. Its immediate callback and
selected changes call `shouldAutoSwitch()` only in install mode and invoke
`void autoSwitchToNatural()`. This avoids repeating the async switch for every
download-progress update.

Install these stable subscriptions once in `onMount()`:

```ts
this.own(boardInstallRegistry.subscribeInstalled(() => this.syncSurface()));
this.own(boardTrust.subscribePaths(() => this.syncSurface()));
this.own(publishedBoards.subscribeCatalog(() => this.syncSurface()));
this.listen(window, "focus", () => {
    if (this.model.mode === "properties") void this.model.loadProperties();
    else void this.model.reconcile();
});
```

`syncSurface()` must read `boardInstallRegistry.listInstalled()` and
`publishedBoards.getCatalog()` immediately; tile/property projections must call
`boardTrust.isTrusted()` synchronously. This covers external writes that do
not touch `BoardInfoEditorModel.state`.

### 4. Add the missing catalog subscription API

In `src/renderer/api/published-boards.ts`, extract the shared projection beside
`useCatalog()`/`getCatalog()` at `:82-90`, and route all three APIs through it:

```ts
private selectCatalogBoards(state: CatalogState): PublishedBoardInfo[] {
    return state.catalog?.boards ?? [];
}

useCatalog(): PublishedBoardInfo[] {
    return this.state.use(this.selectCatalogBoards);
}

getCatalog(): PublishedBoardInfo[] {
    return this.selectCatalogBoards(this.state.get());
}

subscribeCatalog(listener: () => void): () => void {
    return this.state.subscribe(listener, this.selectCatalogBoards);
}
```

The private catalog state is updated by `load()`/`refresh()` at `:50-80` and
by the main-process event at `:50-55`; the subscription is the native
equivalent of `useCatalog()` and covers all those writes. Sharing one
projection across `useCatalog()`, `getCatalog()`, and `subscribeCatalog()` is
the read-side form of EPIC-067's sharpest lesson: a channel added beside a
hook is safe only when both read through the same projection, so the two
cannot drift. No existing caller changes.

### 5. Move the module registration to `index.ts`

Rename `src/renderer/editors/board-info/index.tsx` to `index.ts`.

```tsx
// Before: index.tsx:10-18
function BoardInfoEditorComponent({ model }: { model: EditorModel }) {
    return <BoardInfoEditorView model={model as BoardInfoEditorModel} />;
}
export const boardInfoModule: EditorModule = {
    createEditor: () => new BoardInfoEditorModel(new TComponentState(...)),
    Component: BoardInfoEditorComponent,
};
```

```ts
// After: index.ts
export const boardInfoModule: EditorModule = {
    createEditor: () =>
        new BoardInfoEditorModel(new TComponentState(getDefaultBoardInfoEditorState())),
    View: BoardInfoEditorView,
};
```

Remove the generic wrapper, JSX, and `EditorModel` type import. Preserve the
factory exactly and retain `BoardInfoEditorModel`,
`getDefaultBoardInfoEditorState`, and `BoardInfoEditorState` exports from
`index.tsx:20-21`.

### 6. Verify the native path and scope boundary

No unit tests or harnesses are to be added. Verify:

- The module has `View` and no `Component`; both renamed editor files contain
  no JSX or hooks. The only remaining React code in `BoardScreenshot.tsx` is
  its required compatibility `mountVanilla` face.
- The root is the real `board-info-editor` Panel, toolbar precedes body, and
  no local contents root exists.
- Every inventory item has an explicit binding/subscription; progress,
  registry/trust/catalog changes, mode changes, version states, and focus regain
  update existing native DOM.
- Install mode covers empty/match, downloading/progress/cancel, retry,
  downloaded/register/delete, registered, browse, and auto-switch. Properties
  mode covers missing, metadata/link, catalog/local actions, all version
  states, compatible update, incompatible disabling, and rollback.
- Screenshot URL changes reset failure; no URL/error/network failure preserves
  the footprint; no layout measurement or pre-paint microtask is introduced.
- The real Board Info editor subtree reports 0 `[data-react-root]` and 0
  `[data-part="react-slot"]`; the Search Boards compatibility caller is outside
  this subtree.
- `BOARD_INFO_EDITOR_ID` switch behavior and host transfer remain functional;
  no dashboard duplicate, test harness, completion workflow, or commit exists.

## Concerns / Open Questions

### Resolved: 0 roots is achievable

Yes. The current editor root is the only React root attributable to Board Info.
The outer Panel, toolbar, body primitives, progress bars, buttons, and
screenshots all have native construction paths. The retained React screenshot
shim is used by Search Boards, not imported by this editor.

### Resolved: real Panel root

The old surface returns one outer Panel at
`BoardInfoEditorView.tsx:74-90`, with toolbar and body inside it. A
`display: contents` root would change the page-column flex item and lose the
outer width/height/overflow contract. Use `createPanelElement` and restore the
`board-info-editor` data-type on the stable root.

### Resolved: no multi-node toolbar slot hazard

The old call at `BoardInfoEditorView.tsx:75` supplies only model and a
mode-dependent name. It has no children or `rightContributions`, so the native
call does not pass a `DocumentFragment` to a slot. The general rule remains
important because `PageToolbarView.onUpdate()` refills slots at
`src/renderer/editors/base/PageToolbarView.ts:420-427`, and `fill-slot.ts:137`
appends a Node.

### Resolved: screenshot sizing needs no after-paint measurement

`BoardScreenshot.tsx:28-37,51-74` uses fixed calculated dimensions,
`object-fit: cover`, and no layout or intrinsic-size read. The native view
preserves that calculation and adds neither retry nor microtask measurement.

### Resolved: `useCatalog()` needs a real native channel

`getCatalog()` covers only a snapshot. The React hook at `:339-342` also reacts
to the catalog singleton’s private state, which is written by load, refresh,
and broadcast. Add `subscribeCatalog()` rather than subscribing only to the
event, which would miss direct API load/refresh writes.

The shared selector can yield a new array identity on a state write (`?? []`
and the catalog’s `.boards` value), so `state.subscribe` must use structural
`compareSelection` (`src/renderer/core/state/state.ts:36-53,135-150`) to
suppress `syncSurface()` when the selected list is structurally unchanged. An
identity-only comparison would fire on every unrelated catalog state write.

### Risk: dynamic native child ownership

React reconciled dynamic buttons, progress bars, and screenshots automatically.
Native views must be claimed by the body owner and released before their roots
are removed; merely detaching a root can leak listeners even when root counts
are zero. Keep `replaceChildren()` limited to a body-owned region and leave any
structural helper container under that helper’s control.

### Risk: external status is separate from editor state

Registry and trust are authoritative sources outside the editor model
(`board-install-registry.ts:42-63`, `board-trust.ts:42-59`), while screenshot
catalog data is external too. A binding on the seven editor fields alone would
miss the old `useInstalled()`, `useTrustedPaths()`, and `useCatalog()` updates.

### Non-goals and protected files

- Do not modify `BoardInfoEditorModel.ts`, `open-board-info.ts`, or
  `api/boards.ts`; model actions, restore, host transfer, and consumers remain
  authoritative.
- Do not modify `PageToolbarView.ts`, `PageToolbar.ts`, `board-info-id.ts`, or
  `editors/base/editor-switch.ts`; the special switch behavior already works
  through the native toolbar.
- Do not remove or convert `SearchBoardsTab.tsx`; retain its `BoardScreenshot`
  compatibility import.
- Do not modify `register-editors.ts`, UIKit primitive implementations, or
  icon implementation files; required native arms/builders already exist.
- Do not add tests, a harness, dashboard work, completion skills, or a commit.

## Acceptance Criteria

- `src/renderer/editors/board-info/index.ts` exists, registers
  `View: BoardInfoEditorView`, has no `Component`, and preserves the factory
  and all model exports.
- `BoardInfoEditorView.ts` is a public native `VanillaView` with no JSX/hooks,
  one stable real Panel root, and toolbar/body children claimed and mounted
  exactly once.
- The native body preserves every install/properties branch, text, data name,
  status, button action, version action, repository navigation, and screenshot
  footprint from the React surface.
- `BoardScreenshotView` handles URL-reset and native image-error state with the
  native Board icon builder and performs no layout measurement or retry.
- The seven model fields use an explicit compound binding; registry, trust, and
  catalog reads have immediate projections plus owned subscriptions; both
  effects have native equivalents; and no hook/read in the inventory is lost.
- Dynamic native children are claimed and released correctly, and normal
  `VanillaView` ownership disposes listeners without a child-disposal
  `onDispose()`.
- `publishedBoards.subscribeCatalog()` observes all catalog state writes.
- `BoardScreenshot` still serves `SearchBoardsTab.tsx:7,158`, while Board Info
  imports only `BoardScreenshotView`.
- The real Board Info editor subtree reports 0 `[data-react-root]` and 0
  `[data-part="react-slot"]`; `BOARD_INFO_EDITOR_ID` switch and host transfer
  remain functional.
- No tests/harnesses or dashboard duplicate are added, EPIC-068/US-1115 stays
  unchecked, and no commit is created.

## Files that need NO changes

- `src/renderer/editors/board-info/BoardInfoEditorModel.ts`,
  `open-board-info.ts`, and `src/renderer/api/boards.ts`.
- `src/renderer/editors/register-editors.ts`,
  `src/renderer/editors/base/PageToolbarView.ts`,
  `src/renderer/editors/base/PageToolbar.ts`,
  `src/renderer/editors/base/editor-switch.ts`, and
  `src/renderer/editors/board-info/board-info-id.ts`.
- `src/renderer/uikit/Panel/panel-style.ts`, `Panel/Panel.css`,
  `Text/text-style.ts`, `Text/Text.css`, `Button/ButtonView.tsx`,
  `ProgressBar/ProgressBarView.tsx`, and `src/renderer/theme/icons.tsx`.
- `src/renderer/ui/app/RenderEditorView.ts` and `AsyncEditorView.ts`.
- `src/renderer/editors/tools-hub/SearchBoardsTab.tsx` — it keeps the
  compatibility import and remains outside the Board Info root measurement.
- `src/renderer/uikit/shared/vanilla-view.ts` and
  `src/renderer/uikit/shared/mount.tsx`.
- `doc/active-work.md` — EPIC-068 already contains the unchecked US-1115 entry.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/board-info/BoardInfoEditorView.tsx` → `BoardInfoEditorView.ts` | Replace the React surface and nested JSX bodies with the native Panel-rooted editor view, native body composition, explicit bindings, and owned external subscriptions. |
| `src/renderer/editors/board-info/BoardScreenshot.tsx` | Replace hook-based rendering with the retained React `mountVanilla` compatibility face and preserve the `BoardScreenshot` export used by Search Boards. |
| `src/renderer/editors/board-info/BoardScreenshotView.ts` | Add the native fixed-footprint screenshot `VanillaView`, native error/failure projection, and native Board icon placeholder. |
| `src/renderer/editors/board-info/index.tsx` → `src/renderer/editors/board-info/index.ts` | Remove `Component`, register `View: BoardInfoEditorView`, and preserve model factory and exports. |
| `src/renderer/api/published-boards.ts` | Add `subscribeCatalog()` and route it, `useCatalog()`, and `getCatalog()` through one shared `selectCatalogBoards` projection for load/refresh and broadcast state writes. |
