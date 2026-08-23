# US-1036: `ui/app/` and the root flip

## Status

**Status:** Planned  
**Priority:** High  
**Epic:** [EPIC-058: De-React Epic D — Shell and shared components](../../epics/EPIC-058.md)  
**Created:** 2026-08-23  
**Depends on:** [US-1031: Page-manager portal hosts → `appendChild`](../US-1031-page-manager-append-child/README.md), [US-1033: Secondary views](../US-1033-secondary-views-vanilla/README.md), [US-1034: Sidebar and MenuBar](../US-1034-sidebar-menubar/README.md), [US-1035: Tabs](../US-1035-tabs-vanilla/README.md), and the existing `mountReactHandle` bridge in [`uikit/shared/mount.tsx`](../../../src/renderer/uikit/shared/mount.tsx)

## Goal

Convert the application shell in `src/renderer/ui/app/` to native views and flip the renderer entry point so the application is mounted into `#root` without a React-owned application root. Keep the editor subtree React where it is still required, with `EditorErrorBoundary` remaining the deliberate React error-boundary survivor and the editor root owned explicitly by a vanilla parent.

This is one task. The root flip and `MainPage` must ship together: a shell converted without its final mount would add a temporary `mountReact(MainPage)` boundary, while a root flip without the shell has no native application to mount.

## Background

### Verified surface and contracts

The unit is 761 lines across seven files, measured from the source rather than inherited from the epic estimate:

| File | Lines | Current role |
|---|---:|---|
| `src/renderer/ui/app/MainPage.tsx` | 366 | React application chrome, window controls, status indicators, `PageTabs`, `Pages`, and `MenuBar` composition |
| `src/renderer/ui/app/Pages.tsx` | 164 | React page coordinator, per-page subscriptions, page layout, compare path, `SecondaryViews`, and `RenderEditor` |
| `src/renderer/ui/app/EditorErrorBoundary.tsx` | 83 | Class React error boundary for editor failures and Storybook live preview |
| `src/renderer/ui/app/AsyncEditor.tsx` | 64 | Async editor-module cache/loading path and error-boundary wrapper |
| `src/renderer/ui/app/RenderEditor.tsx` | 39 | Editor-registry lookup, board ID normalization, and `AsyncEditor` composition |
| `src/renderer/ui/app/index.ts` | 4 | Public exports for `MainPage`, `Pages`, `RenderEditor`, and `AsyncEditor` |
| `src/renderer.tsx` | 41 | Bootstrap component, current React root, and `setContent(<cont.default />)` |

The current app entry is [`src/renderer/index.tsx`](../../../src/renderer/index.tsx:8). Its `AppContent` fragment renders, in order, `GlobalStyles`, `MainPage`, `Dialogs`, `ProgressOverlay`, `AlertsBar`, and `Poppers`. The first five shell faces are already native implementations behind React faces from completed Epic D work, but `AppContent` still requires the React root in [`src/renderer.tsx`](../../../src/renderer.tsx:37-41). The final mount must preserve this order and the `GlobalStyles` compatibility island while making the application shell itself vanilla-owned. The `#root` geometry is a separate first-paint prerequisite: it will be moved to static entry CSS, so it is committed before any native view is mounted or measures layout.

The only source importers of `src/renderer/ui/app/` outside that folder are:

- [`src/renderer/index.tsx:4`](../../../src/renderer/index.tsx:4), which imports `MainPage` as the current application entry;
- [`src/renderer/editors/storybook/LivePreview.tsx:2`](../../../src/renderer/editors/storybook/LivePreview.tsx:2), which imports `EditorErrorBoundary` for an editor-owned preview.

The folder barrel [`src/renderer/ui/app/index.ts`](../../../src/renderer/ui/app/index.ts) has no other production caller in the repository. Preserve the named React-facing exports and their current prop meanings for the remaining editor/Storybook callers; the renderer entry may switch from the `MainPage` face to the native `MainPageView` as part of the same root flip.

### `MainPage.tsx`: verified layout and interaction contract

`MainPage.tsx` has one Emotion declaration, `AppRoot`, at [`:27-193`](../../../src/renderer/ui/app/MainPage.tsx:27). Its complete style surface is:

- the root background, flex growth, column direction, and hidden overflow (`:28-32`);
- `.app-header` as a relative, dark, centered flex row with a 4px column gap, light text, `4px 0 0 8px` padding, and a light bottom border (`:33-43`);
- the header drag region at `:43`, with the nested `& button` no-drag exclusion at `:44-46`;
- `.app-button` layout, zero padding/border, bottom alignment, and pointer cursor (`:47-58`);
- `.system-button` dimensions, top alignment, dark background, icon color, and the dark-background and close-button hover branches (`:59-84`);
- `.app-content` and `.pages-container` as nested flex columns with hidden overflow and relative positioning (`:86-98`);
- `.autoload-reload button` and its icon color/hover rules (`:100-114`);
- `.zoom-indicator`, including hidden-by-default and `.visible` display states (`:115-127`);
- `.status-indicators` absolute positioning, flex layout, and its second no-drag declaration at [`:128-137`](../../../src/renderer/ui/app/MainPage.tsx:128-137);
- `.snip-indicator` sizing, green accent, opacity, clipping, and hover (`:138-159`); and
- `.mcp-indicator`, `.mneme-indicator`, `.mcp-dot`, `.mcp-count`, and `.mneme-dot` state/hover rules (`:160-192`).

The three `WebkitAppRegion` declarations are load-bearing and must become the explicit CSS property `-webkit-app-region`:

| Current source | Meaning | Required CSS |
|---|---|---|
| `MainPage.tsx:43` | Entire `.app-header` is draggable | `.app-header { -webkit-app-region: drag; }` |
| `MainPage.tsx:45` | Buttons carve themselves out of the drag region | `.app-header button { -webkit-app-region: no-drag; }` |
| `MainPage.tsx:135` | Status indicators remain clickable | `.status-indicators { -webkit-app-region: no-drag; pointer-events: auto; }` |

This is not a camelCase-to-kebab-case convenience: `webkit-app-region` is silently ignored, as US-1035 demonstrated with tab dragging. The smoke pass must inspect the element actually receiving the pointer, not only the computed value on the expected parent. In particular, verify that `.status-indicators` and its children are on top of the header at their measured bounds, and that no absolutely positioned child escapes its intended containing block.

The DOM composition at [`:198-283`](../../../src/renderer/ui/app/MainPage.tsx:198-283) is stable and must remain so: an app-header containing the Persephone menu button, `PageTabs`, the header spacer, autoload reload control, zoom indicator, three window controls, and the status-indicator group; followed by app-content containing the pages container and `MenuBar`. `PageTabs` and `MenuBar` are already native views behind React faces, so the native MainPage view should compose `PageTabsView`, `PagesView`, and `MenuBarView` directly. Their primitive roots must retain their own `data-type` attributes.

The only `<Panel>` in `MainPage.tsx` is [`:211`](../../../src/renderer/ui/app/MainPage.tsx:211): `<Panel name="app-header-spacer" flex={1} minWidth={40} />`. `Panel.tsx` emits `data-type="panel"`, `data-name="app-header-spacer"`, `class="panel-root"`, `flex: 1 1 auto`, and `min-width: 40px` ([`Panel.tsx:124-147`](../../../src/renderer/uikit/Panel/Panel.tsx:124)). The native implementation must use the existing `createPanelElement`/`panel-style` contract or an equivalent preserved `panel-root` element; it must not replace the primitive with an unrelated `data-type` or hand-roll a second Panel abstraction. The relevant CSS is `.panel-root` and its `data-*` variants in [`Panel.css:1-81`](../../../src/renderer/uikit/Panel/Panel.css:1), not `ListItem.css`.

The other app-local `<Panel>` is [`AsyncEditor.tsx:51`](../../../src/renderer/ui/app/AsyncEditor.tsx:51), the loading panel with `flex={1}`, centered alignment, and the `async-editor-loading` name. Preserve those Panel attributes when the loading branch becomes native. No `Panel` import uses Emotion; retaining the semantic Panel contract costs D6 nothing.

### `Pages.tsx`: verified page and sidebar behavior

`Pages.tsx` has four Emotion declarations:

- `PageEditorContainer` at [`:11-21`](../../../src/renderer/ui/app/Pages.tsx:11): flex column, hidden horizontal overflow, vertical auto scrolling, and `min-width: 100px`;
- `EmptyPageRoot` at [`:23-28`](../../../src/renderer/ui/app/Pages.tsx:23): flex growth, relative positioning, hidden overflow, and `min-width: 100px`;
- `OrnamentWrapper` at [`:30-39`](../../../src/renderer/ui/app/Pages.tsx:30): absolutely positioned, bottom/right 16px, 300×252px, muted border color, half opacity, and no pointer events; and
- `OrnamentPageArea` at [`:46-59`](../../../src/renderer/ui/app/Pages.tsx:46): a relative flex column with hidden overflow and a direct-child `.scroll-container` rule that raises the scrolling content to `z-index: 1`.

`SecondaryViewsWrapper` subscribes to `page.state.hasSidebar` at [`:61-65`](../../../src/renderer/ui/app/Pages.tsx:61), creates the page's own `SecondaryViews` host only when the page has a sidebar, and returns no host otherwise. `SecondaryViewsContent` ensures the page model, subscribes to `nav.state` for `open/width/activePanel`, and subscribes to `page.state.version` so panel attach/detach is re-derived ([`:67-77`](../../../src/renderer/ui/app/Pages.tsx:67)). Completed US-1033 established that each page owns this host and that an inactive page remains mounted while its page slot is hidden; the native page view must preserve that identity rather than recreating a sidebar on every page switch.

`PageContent` also subscribes to `pagesModel.state` so compare-group changes re-render ([`:81-89`](../../../src/renderer/ui/app/Pages.tsx:81`). It resolves the page by ID, reads `page.mainEditorInstance`, and checks `pagesModel.query.isInCompareMode(pageId)` ([`:84-93`](../../../src/renderer/ui/app/Pages.tsx:84). Compare mode renders `CompareEditor` only in the left page and returns `null` for the right page ([`:93-110`](../../../src/renderer/ui/app/Pages.tsx:93). The compare props come from `pagesModel.query.getTextFileHost` for both IDs and pass `leftPageId`.

The ordinary path preserves the page's secondary views, then chooses between:

- an ornament page area with the ornament behind a raised scroll container and `RenderEditor key={editor.id}` ([`:124-132`](../../../src/renderer/ui/app/Pages.tsx:124));
- a normal scrolling `PageEditorContainer` with the same editor key ([`:133-137`](../../../src/renderer/ui/app/Pages.tsx:133); or
- an empty page root with only the ornament ([`:138-143`](../../../src/renderer/ui/app/Pages.tsx:138).

The `editor.id` key is intentional: a new model instance of the same editor type must remount its view, while an editor-type swap with the same model identity is handled by `AsyncEditor`'s module swap. The native view must keep this distinction explicit when replacing an editor child.

`Pages` passes the following exact application-page contract to `AppPageManager` ([`:149-162`](../../../src/renderer/ui/app/Pages.tsx:149): page IDs, active ID, grouped active ID, grouping map, compare-mode IDs, and a page-ID render callback. The already-native [`AppPageManagerView`](../../../src/renderer/components/page-manager/AppPageManagerView.ts:23) preserves stable placeholders, deferred activation, grouping, compare visibility, and hidden inactive pages. It must remain the owner of page placeholder identity; the new `PagesView` owns its child page content and updates the manager from a single `pagesModel` snapshot.

### Editor island and disposal: verified source order

`RenderEditor` currently resolves an editor definition by `model.editorId` at [`:29-37`](../../../src/renderer/ui/app/RenderEditor.tsx:29), memoizes a loader by editor ID, maps virtual `board-editor:<root>` IDs to `board-view` ([`:12-20`](../../../src/renderer/ui/app/RenderEditor.tsx:12), and calls the registry's asynchronous `loadModule`. The module component is passed through unchanged as the editor's `Editor` field ([`:21-26`](../../../src/renderer/ui/app/RenderEditor.tsx:21).

`AsyncEditor` uses a module cache keyed by `cacheKey` ([`:8-16`](../../../src/renderer/ui/app/AsyncEditor.tsx:8), synchronously reuses a matching cached module, and otherwise renders the named loading Panel while its effect calls `getEditorModule()` ([`:23-55`](../../../src/renderer/ui/app/AsyncEditor.tsx:23). Once loaded it renders `EditorModule.Editor` inside `EditorErrorBoundary` ([`:57-61`](../../../src/renderer/ui/app/AsyncEditor.tsx:57). The boundary is not replaceable by `window.onerror` or a `try/catch`; it catches descendant render failures and must remain a React component per D5.

The native parent should keep the public `AsyncEditorProps`/`RenderEditor` contracts as React faces where they remain useful, but move the stateful host lifecycle into concrete native views. The editor element itself remains React. The direct shape is:

```text
vanilla MainPageView
  └─ vanilla PagesView
     └─ existing AppPageManagerView / PageSlot
        └─ native page-content view
           └─ native AsyncEditorView
              └─ mountReactHandle(editorHost,
                   <EditorErrorBoundary><EditorModule.Editor model={...} /></EditorErrorBoundary>)
```

`mountReactHandle` is the only permitted root-creation boundary. At [`mount.tsx:131-152`](../../../src/renderer/uikit/shared/mount.tsx:131), it creates the root on the caller-owned host, renders the first element, reuses the same root for later `render()` calls, and makes `dispose()` idempotent before synchronously calling `root.unmount()`.

Disposal is ordered, not assumed:

1. The vanilla owner marks the editor slot dead and detaches the React host/container from the page DOM first.
2. The retained `MountedReactRoot` is then disposed after the current commit (the established microtask boundary). This prevents `root.unmount()` from clearing a host that has already been reused or filled with the replacement branch.
3. `VanillaView.dispose()` disposes owned children before its own resources and deliberately leaves its semantic root attached for the structural owner to remove ([`vanilla-view.ts:82-121`](../../../src/renderer/uikit/shared/vanilla-view.ts:82)).
4. `PageSlot.dispose()` follows the same sequence: it marks the slot one-shot, removes its placeholder immediately, and queues a generation-guarded nested-root disposal ([`PageSlot.ts:47-69`](../../../src/renderer/components/page-manager/PageSlot.ts:47)). `AppPageManagerView` disposes groups and slots before its adapter removes the manager root ([`AppPageManagerView.ts:41-67`](../../../src/renderer/components/page-manager/AppPageManagerView.ts:41)).

The page manager's queued outer unmount can therefore run after the page-content view has synchronously detached its editor host. The editor's queued unmount cannot touch the page manager's replacement DOM. This ordering must be verified during a page close, editor replacement, page switch, and whole-window disposal—not inferred from a passing build.

`fillSlot` is a separate, already-shipped slot transition used by UIKit children. Its React-to-React path retains the same `mountReactHandle` and calls `render` ([`fill-slot.ts:87-101`](../../../src/renderer/uikit/shared/fill-slot.ts:87)); a transition away from React removes the React container and queues `handle.dispose()` ([`:64-72`, `:125-139`](../../../src/renderer/uikit/shared/fill-slot.ts:64)); the non-React branch then calls `host.replaceChildren()` and appends the new node unconditionally. Do not pre-run a stale cleanup before the next `fillSlot` call: that discards the state that enables root reuse. The editor host must follow the same detach-before-unmount rule even if the implementation uses a retained handle directly rather than `fillSlot`.

### Root bootstrap and remaining React portals

The current [`src/renderer.tsx`](../../../src/renderer.tsx:11) defines `RootComponent` with a `useState` content slot and a `useEffect` that performs this exact sequence:

```tsx
const [cont] = await Promise.all([
    import("./renderer/index"),
    app.init(),
    app.initSetup(),
]);
await app.initServices();
await app.initPages();
await app.initEvents();
setTimeout(() => api.windowReady(), 0);
setContent(<cont.default />);
```

The target is an async bootstrap that returns the loaded mount module, followed by an explicit native mount:

```ts
const mount = await bootstrap();
const container = document.getElementById("root");
if (container) mount(container);
```

The bootstrap order, error behavior, `windowReady` timing, and dynamic import must remain unchanged. `src/renderer.tsx:1-2` already establishes entry stylesheet order with `theme/style-layers.css`; add a static `theme/root.css` immediately after it, containing the `#root` geometry currently at `GlobalStyles.tsx:35-46`. Remove only that `#root` block from `GlobalStyles.tsx`; its remaining global rules and D6 Emotion ownership stay intact. This static CSS must be loaded before `bootstrap()` can mount anything, so the native shell and `PageTabsView.checkScrollButtons()` measure the real flex/absolute layout on first mount. `src/renderer/index.tsx` must expose the mount operation that preserves the former `AppContent` order: mount native `MainPageView`, `DialogsView`, `ProgressOverlayView`, `AlertsBarView`, and `PoppersView` into `#root`, and keep the remaining `GlobalStyles` rules as its explicitly named React/Emotion compatibility island. The shell itself must not be rendered as `<MainPage />` from a React application root.

The source scan currently finds `createRoot` only at [`src/renderer.tsx:4,39`](../../../src/renderer.tsx:4) and [`uikit/shared/mount.tsx:2,135`](../../../src/renderer/uikit/shared/mount.tsx:2). After the flip, the renderer entry import and call disappear; `createRoot` must remain only in `uikit/shared/mount.tsx`.

The current production `createPortal` sites are:

- [`src/renderer/editors/graph/GraphTooltip.tsx:238-272`](../../../src/renderer/editors/graph/GraphTooltip.tsx:238), which portals the fixed graph tooltip to the shared document overlay returned by `getOverlayLayer()`;
- [`src/renderer/editors/notebook/NotebookBody.tsx:170-180`](../../../src/renderer/editors/notebook/NotebookBody.tsx:170), which portals `ExpandedNoteView` to the text editor's `.editor-overlay` host supplied by `TextChrome`; and
- [`src/renderer/ui/secondary-views/SideBarPanelHeader.tsx:47`](../../../src/renderer/ui/secondary-views/SideBarPanelHeader.tsx:47), which portals the published secondary-panel header content to the `headerRef` owned by the native secondary-view stack.

The page-manager portal sites are already gone from US-1031. These three callers must not be rewritten here. They survive a vanilla parent because their React owners remain inside the nested editor/secondary-view React islands, while their targets are ordinary DOM elements with stable ownership: the document overlay layer, the editor overlay node, and the secondary-view header element. The root flip must not remove or replace those target elements while their React owner is mounted.

### Scope decision

Keep all 761 lines in one implementation task. `MainPage` and the root flip are inseparable by D9, and `Pages`/editor disposal is the same smoke surface: page activation, editor loading, sidebar visibility, and shell teardown must be verified together. A split would leave either an unmounted native shell or a temporary React-owned shell boundary and would make the critical vanilla-parent disposal path harder to validate.

## Implementation Plan

### 1. Freeze the contracts and DOM evidence before editing

- Record the current shell DOM for `#root`, `.app-header`, `.app-content`, `.pages-container`, the app-header spacer, the page manager root, one active page, one inactive page, the editor loading state, and a page with `SecondaryViews`.
- Record one baseline interaction-cost measurement for an active app-page switch, including the observation root, settled state, React-root/slot count, and any relevant mutation/observer records. Repeat the identical interaction after conversion. Do not substitute tab or menu measurements for the page-switch unit.
- Confirm the only external app imports listed above and preserve the `ui/app/index.ts` named export meanings. Do not change editor callers or Storybook's boundary import.
- Before changing any element shape, inspect the selectors keyed on its current attributes. For the app spacer, inspect `Panel.css`; for `PageTabsView`, `MenuBarView`, `SecondaryViewsView`, `IconButtonView`, and `SpinnerView`, retain each primitive's own `data-type` and `data-part` values. Add app-specific classes/attributes instead of overriding primitive types.

### 2. Convert `MainPage` to a native shell with CSS-owned chrome

- Replace the implementation in `src/renderer/ui/app/MainPage.tsx` with a thin React-facing `mountVanilla(MainPageView, props)` face. Preserve the no-props `MainPage` export used by the current renderer contract until the native entry takes over.
- Add `src/renderer/ui/app/MainPageView.ts`. Its stable root must carry an additive app-root class and preserve the current `.app-header`, `.app-content`, and `.pages-container` semantic roots. Compose `PageTabsView`, `PagesView`, and `MenuBarView` directly as owned native children; do not create another registry or a generic shell adapter.
- Rebuild the existing `app.window.use()` projection with a native binding. Update zoom visibility/text, maximized restore/maximize icon, menu-bar open state, and MCP status from the selected state without recreating stable controls. Bind `autoloadService.state` and `mnemeStatusModel.state` to their existing conditional controls.
- Preserve every click action from `MainPage.tsx:201-280`: toggle menu bar, reset zoom, minimize, toggle window, close, show MCP request log, show Mneme configuration, reload autoload scripts, and both snip actions.
- Reuse native icon builders and existing `IconButtonView`/`MenuView`/`openMenu` APIs for controls. The snip menu must keep its two `SNIP_MENU_ITEMS`, `bottom-end` placement, and focus/close behavior. A concrete snip menu consumer is required; do not add a general menu registry.
- Use `createPanelElement({ name: "app-header-spacer", flex: 1, minWidth: 40 })` for the spacer or an equivalent call through `panel-style`. Preserve `data-type="panel"`, `data-name`, `.panel-root`, and the resolved inline flex/min-width values.
- Add `src/renderer/ui/app/MainPage.css` in `@layer app`, translating all declarations and nested selectors from `MainPage.tsx:27-193`. Use the established color CSS variables. Spell all three vendor-prefixed declarations as `-webkit-app-region`, and preserve the close hover colors through the project token/CSS-variable convention rather than introducing new hard-coded color declarations.

Before → after shape:

```tsx
// Before: React owns the whole shell
export function MainPage() {
    return <AppRoot><div className="app-header">...</div></AppRoot>;
}

// After: React callers keep the face; the native view owns the shell
export function MainPage(): React.ReactElement {
    return mountVanilla(MainPageView, {});
}
```

### 3. Convert `Pages` and retain page identity, grouping, and per-page hosts

- Replace `src/renderer/ui/app/Pages.tsx` with a thin `mountVanilla(PagesView, {})` face. Add `src/renderer/ui/app/PagesView.ts` as the native coordinator and `src/renderer/ui/app/Pages.css` for the four Emotion blocks.
- `PagesView` must bind the exact `pagesModel` projection currently read at `Pages.tsx:149-152`: page list, left/right grouping, compare groups, active page, and grouped page. Update one retained `AppPageManagerView` instance with the matching props; do not create a new manager on every notification.
- Keep the existing `AppPageManagerView`/`PageSlot` ownership model from US-1031. The page manager remains responsible for stable placeholders, deferred activation, hidden inactive pages, grouping, compare visibility, and generation-guarded nested-root disposal. The app task must not reintroduce `createPortal` or directly reorder live placeholders.
- Add `PageContentBridge.tsx` as the narrow adapter required by the existing `renderPage: ReactNode` callback. It returns `mountVanilla(PageContentView, { pageId })` and owns no subscriptions or page state. Add `PageContentView.ts` as the native per-page owner of the secondary-view host, ornament/empty layout, compare host, and editor host; it is one immediate consumer of the existing page-manager callback, not a generic slot registry.
- Preserve the per-page `SecondaryViews` behavior: subscribe to `page.state.hasSidebar`, ensure the page's own secondary-view model, bind `open/width/activePanel`, and re-derive on `page.state.version`. The inactive page's host remains mounted inside its retained slot and is hidden by the page manager.
- Preserve compare mode exactly: only the left page mounts `CompareEditor`, the right page contributes no compare content, both text hosts come from `pagesModel.query.getTextFileHost`, and `leftPageId` remains the left page ID. Compare remains an editor-owned React island and must be mounted/disposed through the same explicit host ordering.
- Translate `PageEditorContainer`, `EmptyPageRoot`, `OrnamentWrapper`, and `OrnamentPageArea` exactly. Preserve direct-child `.scroll-container` z-index behavior, hidden overflow, minimum widths, ornament pointer transparency, and `editor.id` remount semantics. Add `createOrnamentElement()` beside the existing static SVG component in `src/renderer/theme/Ornament.tsx` and use that one directly-consumed builder from `PageContentView`; do not create a general SVG/icon infrastructure or leave an app-level ornament React island.
- Add no UIKit changes. If a page layout appears to need a new primitive seam, record the evidence and immediate consumer count in Concerns rather than widening `uikit/` speculatively.

### 4. Make the editor path explicit under the vanilla parent

- Keep `EditorErrorBoundary` as a class React component. Replace only its Emotion `ErrorRoot` with a normal element carrying a stable class, and add `src/renderer/ui/app/EditorErrorBoundary.css` with the exact flex, padding, typography, overflow, and `.error-*` rules using theme variables. Preserve `getDerivedStateFromError`, `componentDidCatch`, error message/stack rendering, and the direct Storybook caller.
- Refactor `AsyncEditor.tsx` into its unchanged React-facing export and add a concrete `AsyncEditorView` used by the native page-content owner. The view owns the loading Panel/Spinner branch, module-cache lookup, async load generation, and one retained `MountedReactRoot` for the loaded editor subtree.
- On module availability, call `mountReactHandle` on a caller-owned editor host with a fragment containing `EditorErrorBoundary` and the module's `Editor` component. On ordinary model/module updates, call the retained handle's `render`; do not dispose/recreate the root for every state notification.
- Before disposing an editor view, detach its React host from the page DOM, then queue the retained handle's `dispose()` after the current commit. Guard asynchronous module completions and queued cleanup with the view's live/generation state. A page close must leave no editor React root after the queued unmount settles.
- Refactor `RenderEditor.tsx` into its unchanged React-facing face and add a native `RenderEditorView` that retains the existing board-ID normalization, registry lookup, dynamic `loadModule`, and editor-ID identity rule. The native view owns/updates one `AsyncEditorView` and replaces it only when the editor model identity requires the old React editor subtree to remount.
- Keep the `EditorModule.Editor` type contract (`model` is the editor model/content host) and the public `AsyncEditorProps`, `AsyncEditorComponent`, `RenderEditor`, and `AsyncEditor` exports. Do not statically import editor implementations; retain the registry's dynamic module loading.

Before → after editor boundary:

```tsx
// Before: a React page renders the editor directly
<AsyncEditor getEditorModule={loader} model={model} cacheKey={editorId} />

// After: a native page owns the host and the only React subtree is explicit
const handle = mountReactHandle(editorHost,
    React.createElement(EditorErrorBoundary, null,
        React.createElement(EditorModule.Editor, { model }),
    ),
);
// Update: handle.render(nextElement)
// Dispose: editorHost.remove(); queueMicrotask(() => handle.dispose())
```

### 5. Flip the application entry without a React-owned shell root

- Change `src/renderer/index.tsx` from the default `AppContent` React fragment to an explicit `mount(container)` operation. Preserve the old child order: global styles compatibility host, native MainPage, Dialogs, ProgressOverlay, AlertsBar, and Poppers. Own and dispose every native view; remove roots only after their view resources have been disposed.
- Keep `GlobalStyles` as D6's named Emotion survivor, but do not use its asynchronous React commit to establish `#root` geometry. Move only the `#root` block to `src/renderer/theme/root.css`, imported immediately after `theme/style-layers.css` at the top of `src/renderer.tsx`; this static option is chosen over `flushSync` because it removes the scheduling dependency rather than forcing one React commit before the native shell. Mount the remaining `GlobalStyles` rules only in its own explicit `display: contents` compatibility host through the shared mount boundary, never by making `#root` the container for a second application-wide React tree. The host must not affect the shell's flex layout.
- Set `display: contents` on every non-visual compatibility host appended to `#root`, including the GlobalStyles host and any host used for a remaining React compatibility face. Visual native overlay roots remain ordinary real shell children; only adapter hosts must be layout-transparent.
- Replace `src/renderer.tsx`'s `useEffect`/`useState`/`createRoot` implementation with a top-level async bootstrap that retains the current `Promise.all`, initialization order, delayed `api.windowReady()`, and error propagation. Import `theme/style-layers.css` first and the new static `theme/root.css` second, before the bootstrap can mount anything. The final call shape is `const mount = await bootstrap(); if (container) mount(container);` (or the equivalent returned mount function), not `setContent(<cont.default />)`.
- Verify with a source scan that `createRoot` appears only in `src/renderer/uikit/shared/mount.tsx`. The application shell must no longer be a React root; any remaining roots are explicit nested compatibility/editor islands owned by a vanilla host.

Before → after root shape:

```tsx
// Before: renderer.tsx creates the application root
const root = createRoot(container);
root.render(<RootComponent />);

// After: bootstrap returns the native entry mount
const mount = await bootstrap();
if (container) mount(container);
```

### 6. Verify conversion, disposal, and interaction hit-testing

- Run `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check`.
- Repeat the frozen Rule 4 app-page switch measurement with identical roots/options and record the result for the task/epic completion step; do not edit `EPIC-058.md` in this task-document pass.
- Smoke the full shell after a fresh renderer restart, not only HMR: first page activation while an editor module is loading; editor type switch; model-ID replacement; compare left/right; page grouping/ungrouping; page close; inactive-page revisit; sidebar attach/detach and collapse; MenuBar open/close; tab activation and drag; window controls; zoom reset; autoload reload; snip menu; MCP and Mneme indicators; and shutdown/disposal.
- In the running DOM, verify the app header's drag/no-drag regions by checking the actual topmost hit element and its bounds. Verify tab drag does not drag the window, status indicators remain clickable, and no absolute overlay covers the header.
- Verify the editor React island's disposal with a DOM/root observation: detach page/host first, then observe the queued unmount; confirm no old editor subtree, listener, loading completion, or nested root survives after page close. Exercise repeated close/reopen and a module promise resolving after disposal.
- Scan `src/renderer/ui/app/` for Emotion importers. The only renderer-wide Emotion importers after the task must be D6's four named files: `theme/GlobalStyles.tsx`, `core/state/view.tsx`, `uikit/RenderGrid/RenderGrid.tsx`, and `uikit/Tree/Tree.story.tsx`.

## Concerns

### 1. Static root geometry must precede every native measurement

`mountReactHandle(globalStylesHost, <GlobalStyles />)` schedules its `root.render()` at [`mount.tsx:135-136`](../../../src/renderer/uikit/shared/mount.tsx:135); it does not synchronously commit the Emotion `<Global>`. Mounting `MainPageView` immediately afterwards would therefore measure an unstyled `#root`. `GlobalStyles.tsx:35-46` currently owns `#root`'s absolute inset, hidden overflow, flex display, column direction, outline, and radius; without those rules, `PageTabsView.onMount`'s `checkScrollButtons()` and other geometry-sensitive code observe the wrong box, then a later observer silently repairs it.

The resolved choice is the static stylesheet option: move only the `#root` block to `src/renderer/theme/root.css` and import it immediately after `theme/style-layers.css` at renderer entry. This is chosen over `flushSync` because the geometry becomes available before any React scheduling or native mount, eliminating the first-paint ordering dependency instead of forcing a React commit. `GlobalStyles` remains the D6 Emotion survivor for the remaining global rules, mounted through a separate `display: contents` host that is never used as the native shell container.

### 2. Vanilla parent disposal is the release-blocking risk

There are two nested disposal boundaries: `AppPageManagerView`/`PageSlot` owns the page placeholder React root, and the page-content/`AsyncEditorView` owns the editor React root. The required order is detach inner host, queue inner unmount, dispose native children, then detach the outer placeholder and queue the outer root unmount. A synchronous `root.unmount()` on a still-live or already-reused host can clear replacement content; a deferred unmount without detachment can clear a later page. The implementation must use a generation/live guard and prove the order with close/reopen and late async-load tests.

### 3. `fillSlot` has a different transition contract from a retained editor handle

`fillSlot` reuses a React root only for a React-to-React transition. Its cleanup is intentionally owned by the next `fillSlot` call and its non-React branch always runs `replaceChildren()` before appending. The editor path should use one retained `mountReactHandle` for the editor subtree and must not mix an old `fillSlot` cleanup with direct DOM writes. UIKit child slots that already use `fillSlot` remain unchanged; verify their React-valued icons and menus survive page-shell conversion.

### 4. The page-manager callback is an existing React contract, not permission for a React page shell

US-1031 deliberately left `AppPageManagerView.renderPage` as a `ReactNode` callback and made `PageSlot` the explicit nested-root owner. US-1036 must use that existing consumer without restoring `PageContent` as the application shell's React owner. If a concrete page-content bridge is needed, keep it local to `ui/app/`, make it a direct consumer, and ensure its native view owns `SecondaryViews`, layout, and editor host lifecycle. Do not add a generic page registry, generic portal abstraction, or second manager API with no immediate consumer.

### 5. `Ornament` and `CompareEditor` are different from the editor module path

`Ornament` is a React SVG component used by `Pages.tsx`; `CompareEditor` is an editor-owned React component. The compare path is allowed to remain an editor island. The resolved choice is to add `createOrnamentElement()` to `theme/Ornament.tsx` and use it from `PageContentView`, retaining the React `Ornament` wrapper only for any remaining callers. This keeps the converted app page free of an additional React island without introducing broad SVG infrastructure.

### 6. CSS conversion can silently change hit-testing

The three `WebkitAppRegion` locations, the absolute `.status-indicators` group, the header's relative containing block, and the child no-drag controls are all interaction contracts. Computed CSS alone is insufficient: inspect paint order and actual pointer targets. Preserve selector scope and containing blocks in `MainPage.css`; do not flatten nested selectors in a way that makes an overlay cover the header.

### 7. Attribute-keyed UIKit CSS is load-bearing

`ListItem.css` has more than twenty selectors keyed on `[data-type="list-item"]` ([`ListItem.css:20-147`](../../../src/renderer/uikit/ListBox/ListItem.css:20)). No app conversion in this task may overwrite a UIKit primitive's own `data-type`; app-specific state must use additive classes/attributes. The MainPage spacer and AsyncEditor loading Panel similarly must retain their Panel data contract. If an element-shape change is proposed, first inspect the CSS keyed on its current attributes and record the consumer count.

### 8. No UIKit exception is justified by the verified consumers

`Panel.tsx` imports no Emotion and already has a native `createPanelElement` helper. `PageTabsView`, `MenuBarView`, `SecondaryViewsView`, `AppPageManagerView`, `IconButtonView`, `SpinnerView`, `DialogsView`, `ProgressOverlayView`, `AlertsBarView`, and `PoppersView` are existing consumers. This task should not modify `src/renderer/uikit/`, add an empty registry, or add a primitive whose only purpose is to make the conversion look uniform.

## Acceptance Criteria

- [ ] `MainPage.tsx` and `Pages.tsx` retain their public import paths and React-facing signatures but delegate to native views; `RenderEditor` and `AsyncEditor` retain their exported contracts for remaining React callers.
- [ ] `MainPageView` preserves the complete app-header/app-content DOM composition, all window/status/menu actions, state-driven visibility, and the exact `Panel` contract for `app-header-spacer`.
- [ ] The translated app CSS is in `@layer app`, uses project color variables, preserves all existing selectors/layout values, and spells `-webkit-app-region: drag`/`no-drag` explicitly at the three verified locations.
- [ ] Human hit-testing verification confirms tab drag and header controls behave correctly; the actual topmost pointer target is checked, not only computed styles.
- [ ] `PagesView` preserves page IDs, active/grouped IDs, grouping, compare mode, deferred page activation, hidden inactive pages, page placeholder identity, and per-page `SecondaryViews` host identity.
- [ ] The page content preserves ornament placement, scroll-container stacking, empty-page layout, compare-left-only behavior, editor-ID remount semantics, and all existing editor model/query props.
- [ ] The editor module remains dynamically loaded through `editorRegistry`; virtual board IDs still resolve to `board-view`; the module cache and loading state remain correct.
- [ ] `EditorErrorBoundary` remains a React class boundary with the same error state/render/logging behavior, and its Emotion styles move to `@layer app` CSS. `LivePreview.tsx` remains a valid caller.
- [ ] A vanilla owner mounts the editor React subtree through `mountReactHandle`, reuses the retained handle for updates, detaches the host before queued unmount, and guards late async module completion. A close/reopen test proves no stale editor root or subtree remains after disposal settles.
- [ ] The `fillSlot` contract is respected: no prior cleanup is run before a replacement fill, React slot containers detach before deferred unmount, and the non-React branch's `replaceChildren()`/`append()` behavior is not relied on for a still-live editor root.
- [ ] `src/renderer/index.tsx` exposes an explicit native `mount(container)` preserving the former AppContent order and a separate layout-transparent `GlobalStyles` compatibility host.
- [ ] `src/renderer/theme/root.css` is imported immediately after `theme/style-layers.css`, contains the former `GlobalStyles.tsx:35-46` `#root` geometry, and is applied before bootstrap/native mounting; no native view measures layout during initial mount before those rules are applied, including the first `PageTabsView.checkScrollButtons()` call.
- [ ] Every non-visual compatibility host appended to `#root` has `display: contents` (including the GlobalStyles host); a post-mount DOM check finds only the shell's real visual/overlay children as `#root` flex items and no extra zero-height adapter item.
- [ ] `src/renderer.tsx` keeps the exact bootstrap initialization order and delayed `api.windowReady()` signal but no longer imports React hooks or calls `createRoot`; the final mount is `await bootstrap(); mount(container)` (equivalent returned-mount form accepted).
- [ ] `rg -n "createRoot" src/renderer.tsx src/renderer` reports only `src/renderer/uikit/shared/mount.tsx`; no new direct root or portal abstraction exists in the app unit.
- [ ] Emotion importers under `src/renderer/ui/app/` are zero, and renderer-wide Emotion importers are exactly D6's four named survivors.
- [ ] No UIKit file is modified, no UIKit primitive `data-type` is overridden, no empty registry/infrastructure is introduced, and no dashboard or epic table is changed by this task-document pass.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass; fresh-start smoke verification covers shell controls, pages, sidebar, editor loading/switching, compare, disposal, and header hit-testing.

## Files that need NO changes

- `doc/active-work.md` and `doc/epics/EPIC-058.md` — the user explicitly reserved the dashboard and epic table.
- `src/renderer/uikit/shared/mount.tsx` — `mountReact`/`mountReactHandle` already provide the required boundary and are the only allowed `createRoot` owner.
- `src/renderer/uikit/shared/fill-slot.ts` — its detach/deferred-unmount and non-React replacement behavior is already the verified contract; do not alter it to accommodate this task.
- `src/renderer/uikit/shared/vanilla-view.ts` — lifecycle, child ownership, binding, and dispose ordering already exist.
- `src/renderer/uikit/Panel/Panel.tsx`, `src/renderer/uikit/Panel/panel-style.ts`, and `src/renderer/uikit/Panel/Panel.css` — the existing Panel contract/helper is reused for the two app-local Panel sites.
- `src/renderer/uikit/ListBox/ListItem.css` — it is inspected for the data-type rule but has no consumer in this app conversion and must remain untouched.
- `src/renderer/ui/app/index.ts` — the existing named exports remain the React-facing contract; no barrel reshaping is needed.
- `src/renderer/uikit/`, `src/renderer/ui/tabs/`, `src/renderer/ui/sidebar/`, `src/renderer/ui/secondary-views/`, `src/renderer/components/page-manager/`, `src/renderer/ui/dialogs/`, and `src/renderer/uikit/Progress/` — completed native faces/hosts are consumed as-is; no new UIKit or completed-unit seam is authorized.
- `src/renderer/editors/storybook/LivePreview.tsx` — its direct `EditorErrorBoundary` contract remains unchanged.
- `src/renderer/editors/graph/GraphTooltip.tsx`, `src/renderer/editors/notebook/NotebookBody.tsx`, and `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` — their caller-owned portal targets remain valid inside their existing React islands and are outside this task.
- `src/renderer/api/pages/PagesModel.ts`, `src/renderer/api/pages/PageModel.ts`, `src/renderer/api/pages/PagesQueryModel.ts`, and `src/renderer/api/pages/PagesLayoutModel.ts` — existing page identity, query, grouping, and state APIs are consumed unchanged.
- `src/renderer/editors/register-editors.ts` and editor registry/module implementations — dynamic editor loading remains the existing source of truth; no static imports or registry changes are needed.

## Files Changed summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1036-app-root-flip/README.md` | Verified investigation, resolved implementation plan, disposal ordering, concerns, and acceptance criteria. |
| `src/renderer/ui/app/MainPage.tsx` | Thin React-facing `mountVanilla(MainPageView, {})` face; remove Emotion-rendered shell. |
| `src/renderer/ui/app/MainPageView.ts` | Native application chrome, bindings, controls, native child composition, and disposal. |
| `src/renderer/ui/app/MainPage.css` | `@layer app` translation of all MainPage Emotion rules, including explicit `-webkit-app-region`. |
| `src/renderer/ui/app/Pages.tsx` | Thin React-facing `mountVanilla(PagesView, {})` face. |
| `src/renderer/ui/app/PagesView.ts` | Native page-model binding, AppPageManager ownership, and retained page-slot reconciliation. |
| `src/renderer/ui/app/PageContentBridge.tsx` | Narrow React adapter required by the existing `AppPageManagerView.renderPage` callback; it mounts the native page-content view and owns no page state. |
| `src/renderer/ui/app/PageContentView.ts` | Native per-page layout, secondary-view host, compare/editor host transitions, and page-content disposal. |
| `src/renderer/ui/app/Pages.css` | `@layer app` translation of the four Pages Emotion declarations and preserved stacking/layout selectors. |
| `src/renderer/ui/app/RenderEditor.tsx` | Public face retained while editor-registry rendering moves behind the native view. |
| `src/renderer/ui/app/RenderEditorView.ts` | Native editor-ID reconciliation and dynamic editor-module loader. |
| `src/renderer/ui/app/AsyncEditor.tsx` | Public props/component export retained as the React-facing adapter. |
| `src/renderer/ui/app/AsyncEditorView.ts` | Native loading/cache lifecycle and retained `mountReactHandle` ownership of the editor React subtree. |
| `src/renderer/ui/app/EditorErrorBoundary.tsx` | Preserve the deliberate React class boundary; replace Emotion `styled.div` with a stable classed element. |
| `src/renderer/ui/app/EditorErrorBoundary.css` | `@layer app` translation of the boundary error presentation. |
| `src/renderer/theme/Ornament.tsx` | Add the directly consumed `createOrnamentElement()` DOM builder while retaining the existing React wrapper contract. |
| `src/renderer/theme/root.css` | Static `#root` geometry moved out of the asynchronous Emotion global block so it is applied before native mount and measurement. |
| `src/renderer/theme/GlobalStyles.tsx` | Remove only the `#root` geometry block; retain the remaining D6 Emotion global rules. |
| `src/renderer/index.tsx` | Replace `AppContent` React rendering with explicit native `mount(container)` and separate GlobalStyles compatibility mounting. |
| `src/renderer.tsx` | Remove the startup React root and convert the 41-line entry to bootstrap-then-mount. |
