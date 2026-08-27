# US-1144 — `about` + `tools-hub` native editor bodies

**Epic:** [EPIC-071](../../epics/EPIC-071.md), task 3 (E13 De-React)
**Status:** investigation / implementation plan

## Goal

Move the `about` and `tools-hub` editor bodies from the `EditorModule.Component` arm to
`EditorModule.View` using native `VanillaView` classes. Preserve their current DOM, behavior, and
standalone open routes, while establishing a reusable conversion pattern for the five later editor
tasks in EPIC-071.

This document is an implementation plan only. No implementation, tests, test harnesses, dashboard
entry, or API surface change is in scope.

## Background

EPIC-071 §E13-4 measures `about` at 2 JSX-bearing files, 242 lines, and 34 JSX markers, and
`tools-hub` at 3 JSX-bearing files, 272 lines, and 42 JSX markers; both have zero genuine React
`createElement` calls. The source inventory confirms the files are:

| Editor | JSX-bearing files read completely | Recorded scope |
|---|---|---|
| `about` | `AboutView.tsx`, `index.tsx` | 2 files / 242 lines / 34 markers / 0 React `createElement` |
| `tools-hub` | `SearchBoardsTab.tsx`, `ToolsHubView.tsx`, `index.tsx` | 3 files / 272 lines / 42 markers / 0 React `createElement` |

The line/marker totals above are the EPIC-071 measured scope, verified against the complete file
inventory rather than re-derived as a new metric.

### Existing body and editor models

- `about` is a page-sized standalone editor. `AboutEditor` identifies itself as `about-view` and
  has no language/content host (`src/renderer/editors/about/AboutEditor.ts:21-27`). Its current
  body is the `AboutView` function, which returns the `about-root` `Panel` directly
  (`src/renderer/editors/about/AboutView.tsx:83-90`, `142-216`).
- `tools-hub` is likewise standalone and page-sized. `ToolsHubEditor` identifies itself as
  `tools-hub-view`, persists the four-tab value, and documents that it is reached only through
  `showToolsHubPage` (`src/renderer/editors/tools-hub/ToolsHubEditor.ts:23-39`). Its current
  `ToolsHubView` returns the `tools-hub` `Panel` directly (`src/renderer/editors/tools-hub/ToolsHubView.tsx:16-20`,
  `35-48`).
- Neither current body imports or renders `TextChrome`; neither should gain `TextChromeView`.
  The current `Component` output is already the page root, not text-editor chrome. The native
  module view should therefore mount its own root directly.

### Pattern this task establishes

The five later conversions should copy this sequence:

1. Replace each JSX body component with a public-constructor `VanillaView` class. Build only the
   stable root and constructor-owned resources in the constructor; create child DOM, listeners,
   subscriptions, and async side effects in `onMount`, registering cleanup immediately with
   `own()` or a replaceable subscription slot.
2. Translate UIKit JSX to direct native view/helper composition: `createPanelElement` plus
   `applyPanelAttributes`, `createTextElement` plus `applyTextAttributes`, `ButtonView`,
   `InputView`, `IconButtonView`, `TagView`, `SegmentedControlView`, `DividerView`, and
   `createIconElement` as appropriate. Import every borrowed stylesheet needed by direct DOM
   composition.
3. Lift hook state into explicit view fields or the existing editor model. Use a replaceable
   subscription when the source can change; use `own()` for subscriptions and disposer cleanup.
   Do not use React hooks in the native path.
4. Keep conditional branches explicit. When React previously unmounted a branch, dispose and
   detach its native child view on branch change unless the branch is proven to have no retained
   side effects and is only a view-owned DOM region.
5. In each `index.ts`, validate the incoming `EditorModel`, construct the native view, and register
   it on `View`. The body view is attached directly because these editors have no text chrome.

The reference implementation is the converted Markdown registration:
`src/renderer/editors/markdown/index.ts:159-175` constructs the body/toolbar/chrome, calls
`super(props, chrome.root)`, claims each child with `this.child(...)`, and
`src/renderer/editors/markdown/index.ts:178-195` mounts/updates them. HTML follows the same
create → claim → pass-root → mount shape at `src/renderer/editors/html/index.ts:172-185` and
`188-202`. For this task, the corresponding shape is create native body view → claim it → pass
its root to the editor view (or make that body class itself the registered view) → mount it; no
`TextChromeView` is inserted.

## Verified source findings

### `about`: components, state, hooks, and lifecycle destinations

The complete `AboutView` source was read at
[`AboutView.tsx`](../../../src/renderer/editors/about/AboutView.tsx). The component-to-native
mapping and destination plan is:

| Current React unit | Evidence | Native replacement / destination |
|---|---|---|
| `AboutView` | `AboutView.tsx:83-90`, `142-216` | `AboutEditorView` (or equivalently named native editor view) owning the page root, status region, and child UIKit views. Register this class directly on `View`. |
| `AboutViewModel` | `AboutView.tsx:33-67` | Remove the React model wrapper. `runtimeVersions`, `updateResult`, and `checking` become view fields; their setters become private mutation/render methods. The `init()` effect becomes `onMount` work. |
| `renderUpdateStatus` | `AboutView.tsx:110-140` | A view-owned status region updated by one explicit render method. Dispose conditional `ButtonView` children when the status branch changes; plain status text can be rebuilt in the owned region. |
| `Icon` face | `AboutView.tsx:155-157` | Build a fresh `createIconElement("persephone", { width: 64, height: 64 })` node in the icon panel. Do not cache/share a single-use DOM node. |
| `Panel`, `Text`, `Button`, `Divider` faces | `AboutView.tsx:143-215` | Use panel/text helpers and `ButtonView`/`DividerView`; preserve every `name`, panel prop, text prop, button prop, and literal label. Direct composition must load `Panel.css`, `Text.css`, `Button.css`, and the Divider view/style dependency. |

The existing model state reads are exactly `runtimeVersions` at `AboutView.tsx:85`,
`updateResult` at `86`, `checking` at `87`, and the catalog count at `90`. The effect starts the
runtime-version request and catalog load at `AboutView.tsx:47-54`, and subscribes to update events
at `55-64`. Port these as follows:

- `onMount`: set an `alive` flag; call `shell.version.runtimeVersions()` and apply the result only
  while alive (`AboutView.tsx:48-51`); call `publishedBoards.load()` for the initial catalog
  (`52-54`); subscribe to `rendererEvents[EventEndpoint.eUpdateAvailable]` and map with the
  existing `mapUpdateResult` (`55-59`, `69-80`); subscribe to the catalog’s native
  `publishedBoards.subscribeCatalog` API (`src/renderer/api/published-boards.ts:80-88`) so the
  available-board count updates without a React hook. Register both unsubscribe/dispose operations
  with `own()`.
- `onUpdate`: update the validated editor model reference if the adapter supplies a new one and
  refresh model-derived labels/handlers. The standalone body has no prop-driven JSX inputs beyond
  its model, so do not recreate subscriptions on every update; use a replaceable subscription
  only if the model/source identity actually changes.
- `onDispose`: set `alive = false`, dispose the update-event and catalog subscriptions through
  their registered cleanup, clear DOM/view references, and ensure any in-flight completion cannot
  mutate the disposed view.
- The `handleCheckForUpdates` async flow at `AboutView.tsx:92-108` remains a live button caller:
  set `checking`, await `shell.version.checkForUpdates(true)` and best-effort
  `publishedBoards.refresh()` together (`100-103`), apply the result, and clear `checking` in a
  `finally` block. Its three UI consequences (button disabled/label and status branch) must all be
  refreshed by the same render method.

The update-status branches at `AboutView.tsx:110-140` are: checking (`111-113`), no result
(`114-115`), available release with two buttons (`117-137`), and up-to-date text (`139`). The
native implementation must destroy the conditional status buttons when leaving the available
branch; it may rebuild the text-only branches in a region owned outright by the view. The main
`AboutView` root and all three persistent action buttons remain mounted for the life of the view.

### `tools-hub`: components, hooks, and lifecycle destinations

The complete `SearchBoardsTab`, `BoardCard`, `ToolsHubView`, and `index.tsx` sources were read at
[`SearchBoardsTab.tsx`](../../../src/renderer/editors/tools-hub/SearchBoardsTab.tsx),
[`ToolsHubView.tsx`](../../../src/renderer/editors/tools-hub/ToolsHubView.tsx), and
[`index.tsx`](../../../src/renderer/editors/tools-hub/index.tsx).

| Current React unit | Evidence | Native replacement / destination |
|---|---|---|
| `ToolsHubView` | `ToolsHubView.tsx:16-18`, `19-48` | `ToolsHubEditorView`, a native root owning the tab strip, active body view, and `PinnedRailView`. Register directly on `View`. |
| `SearchBoardsTab` | `SearchBoardsTab.tsx:55-60`, `85-129` | `SearchBoardsTabView`, with native `InputView`, `IconButtonView`, panel/text helpers, and explicit catalog/installed subscriptions. |
| `BoardCard` | `SearchBoardsTab.tsx:132-200` | `BoardCardView`, owned by the search view’s keyed/card collection. Compose `BoardScreenshotView` directly, plus native Tag/Button views and text/panel nodes. |
| `SearchBoardsModel` | `SearchBoardsTab.tsx:33-53` | Remove the React-only component model. `query` and `refreshing` become explicit view fields (or a small native model if shared); its load effect becomes `SearchBoardsTabView.onMount`. |
| `SegmentedControl`, `PinnedRail`, `BuiltinEditorsList`, `TrustedBoardsList`, `TrustedToolsList` | `ToolsHubView.tsx:23-47` | Use `SegmentedControlView`, `PinnedRailView`, `BuiltinEditorsListView`, `TrustedBoardsListView`, and `TrustedToolsListView` directly. The four sidebar list view classes already exist; do not call their React shims from the native editor. |
| `BoardScreenshot` | `SearchBoardsTab.tsx:158` | Use the existing `BoardScreenshotView` directly; its image error listener is a child-view lifecycle concern. |
| `Tag` | `SearchBoardsTab.tsx:165-170`, `178-180` | Use `TagView` for update/installed/file-mask tags and dispose branch-specific instances when their card changes. |

#### Hook-by-hook live-caller audit (acceptance requirement)

The source has three `useMemo` invocations and four textual `useCallback` occurrences: the fourth
occurrence is the import name at `SearchBoardsTab.tsx:1`; the three callback definitions are at
`62`, `141`, and `144`. There are no other hook invocations in the two editor folders. Every
ported definition has a live caller, recorded here so a definition cannot silently become dead:

| Hook | Evidence and native destination | Live caller (must remain explicit in the port) |
|---|---|---|
| `refresh` `useCallback` | `SearchBoardsTab.tsx:62-65` | `IconButton`’s `onClick={() => { void refresh(); }}` at `97-104`; native `IconButtonView` click handler calls the view’s refresh method. |
| `filtered` `useMemo` | `SearchBoardsTab.tsx:67-74` | `filtered.length` empty branch at `110-112` and the group/card mapping at `113-125`; native render computes it before those same branches. |
| `groups` `useMemo` | `SearchBoardsTab.tsx:76-83` | `GROUP_ORDER.filter((g) => groups.has(g))` and `groups.get(g)!` at `113-116`; native group rendering must consume the map, not merely define it. |
| `openInstall` `useCallback` | `SearchBoardsTab.tsx:141-143` | The uninstalled card’s `Install…` Button at `189-190`; native `ButtonView` must call `openBoardInfoPage({ catalogId: board.id })`. |
| `openProperties` `useCallback` | `SearchBoardsTab.tsx:144-146` | The installed card’s `Update…` and `Properties` buttons at `193-194`; both native buttons must call the board-root opener when an install exists. |
| `useBoardUpdates`’s internal `useMemo` | `src/renderer/api/board-updates.ts:77-101`, called by `SearchBoardsTab.tsx:58` | `BoardCard` consumes the resulting map at `SearchBoardsTab.tsx:137-139` and uses it for the update tag (`165-167`) and update button (`193`). Replace the hook with a synchronous derived update map (`listBoardUpdates()` after the load subscriptions) or an equivalent native derivation, and keep these callers. |

`SearchBoardsModel`’s effect loads both sources at `SearchBoardsTab.tsx:47-51`; move those calls to
`SearchBoardsTabView.onMount`, subscribe with `publishedBoards.subscribeCatalog` and
`boardInstallRegistry.subscribeInstalled` (`src/renderer/api/board-install-registry.ts:116-123`),
and re-render the filtered/grouped/card regions on either source change. `query` mutation at `39-41` becomes the `InputView.onChange` caller at
`88-95`; `refreshing` mutation at `43-45` drives the refresh button at `97-104`.

`ToolsHubView`’s `model.state.use` is at `ToolsHubView.tsx:17`. Replace it with a model-state
subscription owned by the native view: update `SegmentedControlView` and replace the active body
view whenever `tab` changes. The selected tab is written by the existing `ToolsHubEditor.setTab`
method at `src/renderer/editors/tools-hub/ToolsHubEditor.ts:38-40`.

## Registration and routes

### Registration: `Component` arm → `View` arm

Both current registrations are exactly the `Component` arm:

```tsx
// Before — src/renderer/editors/about/index.tsx:7-15
function AboutEditorComponent({ model }: { model: EditorModel }) {
    return <AboutView model={model as AboutEditor} />;
}
export const aboutModule: EditorModule = {
    createEditor: () => new AboutEditor(new TComponentState(getDefaultAboutEditorState())),
    Component: AboutEditorComponent,
};
```

```ts
// After — proposed shape; the native class accepts { model: EditorModel } and validates it.
export const aboutModule: EditorModule = {
    createEditor: () => new AboutEditor(new TComponentState(getDefaultAboutEditorState())),
    View: AboutEditorView,
};
```

Apply the same change to `toolsHubModule`: remove the `ToolsHubEditorComponent` JSX wrapper at
`src/renderer/editors/tools-hub/index.tsx:7-9` and replace `Component: ToolsHubEditorComponent` at
`14` with `View: ToolsHubEditorView`. Rename the implementation files to `.ts` when their JSX is
gone, and rename each index to `.ts` if the registration/export file has no JSX. Preserve the
editor/model/type exports at the existing index paths.

```tsx
// Before — src/renderer/editors/tools-hub/index.tsx:7-15
function ToolsHubEditorComponent({ model }: { model: EditorModel }) {
    return <ToolsHubView model={model as ToolsHubEditor} />;
}
export const toolsHubModule: EditorModule = {
    createEditor: () => new ToolsHubEditor(new TComponentState(getDefaultToolsHubEditorState())),
    Component: ToolsHubEditorComponent,
};
```

```ts
// After — proposed shape
export const toolsHubModule: EditorModule = {
    createEditor: () => new ToolsHubEditor(new TComponentState(getDefaultToolsHubEditorState())),
    View: ToolsHubEditorView,
};
```

The registered view must have a public constructor. The adapter attaches the root before calling
`mount()`; the view must not assume a parent in its constructor. For this direct-root case, the
editor view either is the body class itself or follows the Markdown/HTML outer-view pattern with
the body created, claimed, root passed to `super`, and child mounted in `onMount`.

### Dedicated openers and click-verifiable route

`about` opens through `PagesLifecycleModel.showAboutPage()` at
`src/renderer/api/pages/PagesLifecycleModel.ts:744-747`, while the internal `PagesModel` delegate is
at `src/renderer/api/pages/PagesModel.ts:260-262`; the script-facing `IPageCollection` exposes
`showAboutPage()` at `src/renderer/api/types/pages.d.ts:97-101`.

`tools-hub` opens through `PagesLifecycleModel.showToolsHubPage()` at
`src/renderer/api/pages/PagesLifecycleModel.ts:797-805`, delegated by `PagesModel` at
`src/renderer/api/pages/PagesModel.ts:271-273`. It is deliberately not on the script-facing
`IPageCollection`: that interface has no `showToolsHubPage` between its opener declarations at
`src/renderer/api/types/pages.d.ts:97-123`. Do not add it merely for verification.

The UI route is the sidebar’s **Tools & Editors** panel. `MenuBarView` names that panel
`tools-editors` and creates `ToolsEditorsPanelView` at `src/renderer/ui/sidebar/MenuBarView.ts:49-55`
and `489-502`; its native panel’s “open in new tab” action calls
`pagesModel.showToolsHubPage({ tab: panelTabToHubTab(this.tab) })` at
`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:93-108`.
The same panel is also reachable from the Page Tabs “Show All…” menu at
`src/renderer/ui/tabs/PageTabsView.ts:307-310`. Verify `tools-hub` by clicking the sidebar
Tools & Editors panel’s new-tab action, then capture the implementation-time digest through that
route. This is the baseline’s recorded programmatic-open gap, not permission to add API surface.

Both editors are rejected by the generic `addEditorPage` flow because standalone definitions are
checked at `src/renderer/api/pages/PagesLifecycleModel.ts:274-277`; this task keeps their dedicated
openers and does not add a file-host workaround.

The checked `src/renderer/ui/sidebar/tools-editors-registry.ts:43-184` supplies the panel’s
creatable editor/tool rows, but contains no separate `tools-hub` row; the hub route is the panel’s
own open-in-new-tab action, not a registry item.

### `EditorErrorBoundary`

Neither editor folder imports or references `EditorErrorBoundary` (the complete-folder search found
only its definition and other editors’ importers). The shared `AsyncEditorView` wraps the remaining
`Component` arm at `src/renderer/ui/app/AsyncEditorView.ts:127-145`; when `View` is present it
constructs and mounts the native view instead (`102-125`). Therefore this conversion removes no
direct boundary import because neither editor has one, and it must not delete
`src/renderer/ui/app/EditorErrorBoundary.tsx`: `browser`, `board`, and the other remaining React
editors still depend on it.

## Conditional branches and persistent-child hazard

React destroyed inactive subtrees automatically. Native parents must preserve that behavior where a
branch owns listeners, subscriptions, async work, or a nested React root.

### `about`

The only conditional renderer is `renderUpdateStatus` (`AboutView.tsx:110-140`). Keep the page’s
static panels and the three permanent buttons mounted. Replace/destroy the status branch as its
state changes: checking text, empty result, available-release text plus two buttons, and up-to-date
text. The available-release `ButtonView`s must be released when that branch is left; the text-only
branches may use a view-owned `replaceChildren` region because it owns that region outright. The
async runtime/update subscriptions are view-level, not branch-level, so they stay alive until
`onDispose`.

### `tools-hub`

The parent has one conditional tab branch at `ToolsHubView.tsx:35-45`: `builtin`, `boards`,
`search`, and `tools`. Create only the selected child view and, on tab change, dispose and detach
the old child before creating/claiming/mounting the new one. Do not merely set `hidden` or leave all
four mounted. In particular, `TrustedBoardsListView` and `TrustedToolsListView` each own a React
slot (`src/renderer/ui/sidebar/TrustedBoardsListView.tsx:98-125` and
`TrustedToolsListView.tsx:55-82`), so retaining inactive branches would retain nested React roots
and their effects. Use the already-established native sidebar views directly:
`BuiltinEditorsListView`, `TrustedBoardsListView`, and `TrustedToolsListView` are constructed by
the analogous body switch in `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:93-103`.

Inside `SearchBoardsTab`, the empty/catalog/group branches at `SearchBoardsTab.tsx:107-127` are
view-owned content branches. Dispose removed `BoardCardView`s (including each
`BoardScreenshotView` image listener) and rebuild/reconcile the owned region; do not retain cards
that React would have removed. Within a card, the update-vs-installed tags at `165-170`, optional
description at `173`, optional file-mask panel/tags at `175-182`, incompatibility warning at
`184-186`, and install-vs-update/properties buttons at `188-197` are all conditional. Branch-
specific Tag/Button/Panel child views must be released when their condition becomes false. The
card’s stable screenshot and identity fields may remain mounted while the same keyed board remains
present.

## Face ownership and collection hand-off

This task does not delete any `uikit/` face; UIKit-face collection is US-1149. It does, however,
delete four zero-caller `ui/sidebar/` `mountVanilla` faces exposed only for the React editor body.
The check includes both JSX value use and `createElement(Face, ...)` value use, because a tag-only
grep is insufficient.

| Face | Value use in these two editors | Last caller within these two editors after conversion? | Wider status |
|---|---|---:|---|
| `Divider` | `about/AboutView.tsx:164`, `185`, `194` | **Yes — `about` has no remaining React value caller** | Other E13 cut editors still hold it; EPIC-071 §E13-4 collects it only after those callers are converted. |
| `Icon` | `about/AboutView.tsx:2`, `156` | **Yes — `about` has no remaining React value caller** | Other editors (`board`, `browser`, `graph`, `link-editor`, `settings`) still keep the face alive; it is not collected by this task. |
| `Tag` | `tools-hub/SearchBoardsTab.tsx:2`, `166`, `169`, `179` | **Yes — `tools-hub` has no remaining React value caller** | `mcp-inspector` and `mneme-config` remain wider callers; US-1149 owns collection. |

No `createElement(Divider, ...)`, `createElement(Icon, ...)`, or `createElement(Tag, ...)` usage was
found in either editor folder; the complete `React.createElement` search was empty. The native
replacement uses `DividerView`, `createIconElement`, and `TagView`, so it removes these React-face
value callers without deleting the face files or barrels. Finding 3 is therefore confirmed: the
last callers within these two editors are removed, while wider callers keep all three UIKit faces
alive.

### `ui/sidebar/` mountVanilla faces collected by this task

The four React sidebar faces below were searched across `src/renderer`, excluding story files and
each face's own file. Each has exactly one caller, in the current React `ToolsHubView`; the native
editor will construct the named twin directly. The native sidebar panel already constructs those
twins directly at `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:5-8,93-103` (including
`TrustedBoardsListView` and `TrustedToolsListView` at `7-8,99-100`), so it does not keep these
React shims alive.

| Face to delete | Sole caller before conversion | Native twin verified in source |
|---|---|---|
| `src/renderer/ui/sidebar/BuiltinEditorsList.tsx` | `editors/tools-hub/ToolsHubView.tsx:3,37` | `BuiltinEditorsListView` exported by `BuiltinEditorsListView.ts:37` |
| `src/renderer/ui/sidebar/PinnedRail.tsx` | `editors/tools-hub/ToolsHubView.tsx:2,47` | `PinnedRailView` exported by `PinnedRailView.ts:45` |
| `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | `editors/tools-hub/ToolsHubView.tsx:4,39` | `TrustedBoardsListView` exported by `TrustedBoardsListView.tsx:132` |
| `src/renderer/ui/sidebar/TrustedToolsList.tsx` | `editors/tools-hub/ToolsHubView.tsx:5,43` | `TrustedToolsListView` exported by `TrustedToolsListView.tsx:57` |

Each face is a `mountVanilla` React wrapper around its twin. `rg --files src/renderer/ui/sidebar`
verified that there is no sidebar `index.ts` barrel and none of the four faces has a per-face
`index.ts`; there are therefore no dead barrel re-exports to remove. Once `ToolsHubView` uses the
native twins, all four `.tsx` files reach zero callers and are deleted in this task. This is the
EPIC-070 standing finding: a `mountVanilla` face can outlive its last caller silently, so the
caller removal and face deletion belong together here.

## Constraint audit

- `useState`: no `useState` occurrence exists in either editor folder. The only state hooks are
  `AboutView`’s three model reads (`AboutView.tsx:85-87`), `publishedBoards.useCatalog()`
  (`90`), `SearchBoardsTab`’s catalog/installed/update/model reads (`SearchBoardsTab.tsx:56-60`),
  and `ToolsHubView`’s tab read (`ToolsHubView.tsx:17`). All must become explicit native fields,
  subscriptions, or model reads in lifecycle methods.
- Direct DOM/document access: neither current editor body directly accesses `document` or the DOM;
  all current markup is JSX. The native implementation will necessarily create DOM nodes, but must
  do so under the UIKit lifecycle rules: no listeners, subscriptions, timers, or layout measurement
  in constructors, and no constructor-touched resource may instead be created by `onMount`.
- Colors: neither editor contains a hardcoded color literal. Existing values such as `light`,
  `warning`, `success`, and `primary` are semantic UIKit props (`AboutView.tsx:112`, `121`, `139`,
  and `SearchBoardsTab.tsx:109-111`, `184-185`); retain those semantic tokens and do not add hex,
  RGB, or named CSS colors.
- Banned filesystem/path calls: neither editor contains `require("path")`, `require("fs")`, or
  any `require(...)` call. Keep the native files free of those calls.
- Error stringification: neither editor hand-stringifies caught errors; `about` only uses a
  best-effort `catch(() => {})` for the catalog refresh at `AboutView.tsx:100-103`. Preserve that
  best-effort behavior. If the port introduces a user-visible catch, use `errMessage`, never
  `String(error)` or unsafe `.message` access.

## Implementation Plan

1. **Convert `about`’s body and lifecycle.** Rename the JSX implementation to a `.ts` native view
   file, remove `AboutViewModel`/`useComponentModel`, and implement a public-constructor view whose
   root is the `about-root` panel. Reproduce the complete panel/text structure and five markers,
   using `DividerView`, `ButtonView`, `createIconElement`, and native text/panel helpers. Keep the
   runtime-version request, catalog load/count subscription, update-event mapping, and update
   button async flow in `onMount`/explicit methods with `own()` cleanup and an `alive` guard.
2. **Convert `tools-hub`’s parent and tab switch.** Rename `ToolsHubView.tsx` to a `.ts` native
   `ToolsHubEditorView`; construct the root/panel regions and `SegmentedControlView` with the four
   exact values/labels. Subscribe to `ToolsHubEditor.state` after mount, call `setTab` from the
   control, and dispose/detach the active body before replacing it. Construct direct native
   sidebar views and `PinnedRailView`, never their React shim functions, and mount only the active
   tab. Delete the now-zero-caller `BuiltinEditorsList.tsx`, `PinnedRail.tsx`,
   `TrustedBoardsList.tsx`, and `TrustedToolsList.tsx`; verify there is no sidebar barrel or
   per-face index re-export to clean up.
3. **Convert `SearchBoardsTab` and `BoardCard`.** Rename `SearchBoardsTab.tsx` to `.ts`; replace
   hook/model state with native fields and catalog/installed subscriptions. Keep the filter and
   group computations as called methods, with the live callers listed above. Implement
   `SearchBoardsTabView` and an owned `BoardCardView` using `InputView`, `IconButtonView`,
   `BoardScreenshotView`, `TagView`, `ButtonView`, and native panel/text nodes. Reconcile cards by
   board id and release removed/conditional children so no inactive side effects survive.
4. **Switch both module registrations.** Rename each JSX-free index to `.ts`, remove the two
   `EditorModule.Component` wrappers, validate the editor model type in the public native view
   constructor, and set `View` to the native editor view. Preserve `createEditor` and all exports.
   Do not add `TextChromeView`, `EditorErrorBoundary`, or a script-facing tools-hub opener.
5. **Load styles at the direct-view boundary.** Ensure direct native composition imports the
   stylesheets for every borrowed primitive it constructs, including `Button.css`, `Panel.css`,
   `Text.css`, `SegmentedControl.css`, `Tag.css`, and any view-owned Divider/Icon styles not already
   imported transitively by the direct view module. Keep colors semantic and all view roots/data
   markers stable.
6. **Verify manually through the dedicated routes.** Open `about` with
   `app.pages.showAboutPage()` and verify its DOM baseline. Open `tools-hub` by clicking the
   sidebar Tools & Editors panel’s open-in-new-tab action, then capture the before/after structure
   digest at implementation time. Do not use a new API or `addEditorPage` for either standalone
   editor.

## Concerns

- **Persistent children:** the tab body must use real child retirement (`releaseChild` or an
  equivalent owned structural switch), not only `dispose()` plus `root.remove()`, so inactive
  tab views and nested React slots are not retained in the parent’s ownership list.
- **Nested React remains in two imported sidebar views:** converting the editor body does not
  convert `TrustedBoardsListView` or `TrustedToolsListView`’s existing React slot contents. Their
  `fillSlot(..., React.createElement(...))` calls at `TrustedBoardsListView.tsx:155-157` and
  `TrustedToolsListView.tsx:80-82` create shell-owned React roots. This task must not broaden into
  those shared shell views; `TrustedBoardsTreeSlot` and `TrustedToolsTreeSlot` own the roots and
  neither is in EPIC-071’s scope.
- **Measured root concentration:** the live epic instrument measured editor roots as 1 / 26 / 1 /
  2 for Built-in / Registered boards / Search boards / Tools, with app-wide counts 4 / 29 / 4 / 5.
  The 26 Registered-boards roots decompose into the one `tools-hub` body root, one
  `TrustedBoardsTreeSlot` root, and 24 per-visible-row `fillSlot` roots inside the virtualized tree
  (measured alongside 16 images and 88 tree rows). This is the programme’s largest measured React
  concentration: it varies with registered content and viewport-visible rows, not open pages, and
  is owned by `TrustedBoardsTreeSlot`/`TrustedToolsTreeSlot`, outside EPIC-071.
- **Hook-count wording:** the measured “4 `useCallback`” figure includes the import occurrence;
  there are three callback definitions, and each has a verified live caller. The three memoized
  computations include `useBoardUpdates`’s internal memo at `src/renderer/api/board-updates.ts:77-101`.
- **No `TextChromeView`:** this is intentional and follows the current direct `Panel` roots. Adding
  chrome would change the standalone page shape and violate the existing editor behavior.
- **No test harnesses:** per task constraints, verification is the existing app/UI route and
  structure digest only; no unit tests or new harness are proposed.

## Acceptance Criteria

- `aboutModule` and `toolsHubModule` register `View`, not `Component`; the two old JSX component
  wrappers are gone, and both native views have public constructors and obey the constructor/
  `onMount` ownership rules.
- `about`’s live behavior is preserved: runtime versions load, catalog count updates, update events
  map through `mapUpdateResult`, Check for Updates refreshes both sources with best-effort catalog
  failure handling, and Download / What’s New / GitHub / Report Issue retain their actions.
- Every ported `useMemo`/`useCallback` computation has a live caller exactly as listed in the hook
  audit; no definition is merely present but unused. The filter, groups, update map, refresh,
  install, and properties paths are all exercised by their native render/click consumers.
- No `EditorErrorBoundary.tsx` deletion or unrelated editor/API conversion occurs. No `uikit/`
  face is deleted; US-1149 receives the accurate last-caller-within-these-editors list. The four
  zero-caller `ui/sidebar/` `mountVanilla` faces named below are deleted, and no sidebar barrel
  re-export remains to clean up.
- `about`, opened via `app.pages.showAboutPage()`, has React roots **1 → 0**, exactly **3 buttons**,
  the five markers `about-root`, `about-content`, `about-check-updates`, `about-github`, and
  `about-report-issue`, and `emptySvgs` **0**. Its existing structure baseline remains intact.
- `tools-hub` is verified by the sidebar route, not by a new script API or `addEditorPage`. At
  implementation time, capture a structure digest through that click route and require the native
  result to match the captured pre-conversion digest for active-tab DOM/markers, tab switching,
  card branches, and `emptySvgs` **0**. Do not invent DOM digest numbers here: the baseline
  explicitly records `tools-hub` as programmatically unopenable.
- The live measurement recorded these editor-root counts before conversion, with the corresponding
  required counts after US-1144:

  | Tab | Before | After US-1144 |
  |---|---:|---:|
  | Built-in | 1 | 0 |
  | Registered boards | 26 | 25 |
  | Search boards | 1 | 0 |
  | Tools | 2 | 1 |

  These are observed values, not hard-coded universal counts. Registered boards is content- and
  viewport-dependent because its visible rows each contribute a `fillSlot` React root. The
  checkable criterion is exactly one removed root: the root whose DOM chain ends at `@page-editor`;
  every remaining root must have a chain beginning at `#react-slot`. The remaining roots belong to
  the shared `TrustedBoardsListView`/`TrustedToolsListView` shell, not `tools-hub`; this conversion
  does not free `TrustedBoardsTreeSlot`/`TrustedToolsTreeSlot`, neither of which is in EPIC-071.
- Switching `tools-hub` tabs leaves only the selected body mounted; leaving Search Boards disposes
  its subscriptions/cards, and leaving trusted boards/tools disposes the tab view while the
  shared shell's content-dependent `#react-slot` roots remain governed by those shell views.
- The four zero-caller sidebar faces `BuiltinEditorsList.tsx`, `PinnedRail.tsx`,
  `TrustedBoardsList.tsx`, and `TrustedToolsList.tsx` are deleted; the native twins remain for
  `tools-hub` and the sidebar panel.
- `npm run lint` and the project’s normal type/build checks may be run by the implementation task,
  but this investigation proposes no tests and does not run `npm run build-prod`.

## Files that need NO changes

- `src/renderer/uikit/shared/vanilla-view.ts`
- `src/renderer/uikit/shared/mount.tsx`
- `src/renderer/uikit/shared/fill-slot.ts`
- `src/renderer/uikit/Panel/panel-style.ts`
- `src/renderer/uikit/Text/text-style.ts`
- `src/renderer/uikit/Divider/DividerView.tsx`
- `src/renderer/uikit/Tag/TagView.tsx`
- `src/renderer/uikit/Input/InputView.tsx`
- `src/renderer/uikit/IconButton/IconButtonView.tsx`
- `src/renderer/uikit/Button/ButtonView.tsx`
- `src/renderer/ui/app/EditorErrorBoundary.tsx`
- `src/renderer/api/pages/PagesModel.ts`
- `src/renderer/api/pages/PagesLifecycleModel.ts`
- `src/renderer/api/types/pages.d.ts`
- `src/renderer/ui/sidebar/tools-editors-registry.ts`
- `src/renderer/ui/sidebar/PinnedRailView.ts`
- `src/renderer/ui/sidebar/BuiltinEditorsListView.ts`
- `src/renderer/ui/sidebar/TrustedBoardsListView.tsx`
- `src/renderer/ui/sidebar/TrustedToolsListView.tsx`
- `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts`
- `src/renderer/ui/sidebar/MenuBarView.ts`
- `src/renderer/ui/tabs/PageTabsView.ts`
- `src/renderer/editors/board-info/BoardScreenshot.tsx`
- `src/renderer/editors/board-info/BoardScreenshotView.ts`
- `src/renderer/api/board-updates.ts`
- Anything under `src/renderer/editors/monaco/`
- `eslint.config.mjs`
- `src/renderer/components/page-manager/PageSlot.ts`
- Any test file or test harness

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/editors/about/AboutView.tsx` → `AboutView.ts` | Replace JSX `AboutView`/`AboutViewModel` with native about editor view and lifecycle. |
| `src/renderer/editors/about/index.tsx` → `index.ts` | Register the native view on `View`; preserve model/type exports. |
| `src/renderer/editors/tools-hub/ToolsHubView.tsx` → `ToolsHubView.ts` | Replace parent JSX with native tab/rail/body composition and disposal. |
| `src/renderer/editors/tools-hub/SearchBoardsTab.tsx` → `SearchBoardsTab.ts` | Replace hooks, JSX, `SearchBoardsTab`, and `BoardCard` with native views and live callers. |
| `src/renderer/editors/tools-hub/index.tsx` → `index.ts` | Register the native view on `View`; preserve model/type exports. |
| `src/renderer/ui/sidebar/BuiltinEditorsList.tsx` | Delete zero-caller `mountVanilla` face after `ToolsHubView` uses `BuiltinEditorsListView`. |
| `src/renderer/ui/sidebar/PinnedRail.tsx` | Delete zero-caller `mountVanilla` face after `ToolsHubView` uses `PinnedRailView`. |
| `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | Delete zero-caller `mountVanilla` face after `ToolsHubView` uses `TrustedBoardsListView`. |
| `src/renderer/ui/sidebar/TrustedToolsList.tsx` | Delete zero-caller `mountVanilla` face after `ToolsHubView` uses `TrustedToolsListView`. |

No other file is authorized to be written for this investigation; the dashboard is intentionally
unchanged per the task request.
