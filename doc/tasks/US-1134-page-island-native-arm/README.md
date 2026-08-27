# US-1134 — the page-island native arm

**Epic:** [EPIC-070](../../epics/EPIC-070.md) (De-React E12)
**Scope:** US-1134 and US-1135 are intentionally planned as one implementation unit: the page-manager arm and its only app consumer must change together.
**Status:** Planned

## Goal

Give the shared `PageSlot` both a retained React arm and a lifecycle-owning native-view arm, then make `AppPageManagerView` and `PagesView` use the native arm for application pages. The app page path will mount `PageContentView` directly, removing the per-page React root and the five dead `ui/app` face/barrel files while preserving the browser editor's React page-manager path.

## Background

### Epic and baseline constraints

EPIC-070 identifies the remaining page contract as `renderPage: (id: string) => ReactNode` in both page-manager prop interfaces, consumed by `PageSlot.render(root, content: ReactNode)`. The authoritative US-1133 pre-change baseline is **7 pages open, 3 ever activated, and 6 settled React roots**: three page-level roots, two nested editor roots, and one `GlobalStyles` root. The baseline notes that successive probes read 7 and then 6 as an editor's own nested root disposed, so the count alone is not the measurement. This task predicts **6 → 3** on that session shape and must report the open-page list plus each root's depth and ancestor chain.

The baseline proves the load-bearing lazy predicate: seven placeholders exist, but only three contain page content and four have zero children. `AppPageManagerView.reconcile` adds only `activeId` and `groupedActiveId` to `hasBeenActive`, then calls `slot.render(...)` only for IDs in that set ([`AppPageManagerView.ts:69-82`](../../../src/renderer/components/page-manager/AppPageManagerView.ts), [`AppPageManagerView.ts:144-158`](../../../src/renderer/components/page-manager/AppPageManagerView.ts)). The native arm must preserve this exact gate; creating `PageContentView` for every placeholder would eagerly construct seven editors, including the two boards and a Monaco called out by the baseline.

The page placeholders currently have no `data-*` marker. The US-1133 DOM record confirms that this is why the earlier `:scope > [data-type]` probe found nothing. The new stable placeholder marker is `data-name="page-slot"`, following the shell addressing contract's rule that plain DOM elements set `data-name` directly. Repetition is explicitly legal: the contract says `data-name` is not unique when an element repeats and uses every open tab's repeated `data-name="page-tab"` as its example ([`ui-element-contract.md:33-40`](../../architecture/ui-element-contract.md)). `page-slot` is therefore a repeated diagnostic name, not a unique page ID. The current US-1133 instrument addresses placeholders positionally; the marker lets the closing measurement select the placeholder elements directly before recording their display, child count, and root marker.

### Current source path

The current application path is verified in the source:

```text
PagesView (native)
  └─ AppPageManagerView (native)
       └─ PageSlot.render → mountReactHandle       // one React root per activated page
            └─ PageContentBridge (React)
                 └─ mountVanilla(PageContentView, { pageId })
                      └─ PageContentView (native)
                           └─ RenderEditorView (native)
                                └─ AsyncEditorView (native)
```

`PageSlot` creates one stable `div`, applies its style, and currently stores only `MountedReactRoot`; `render()` wraps the supplied `ReactNode` in a Fragment, attaches the placeholder, and calls `mountReactHandle`, reusing the handle on later renders ([`PageSlot.ts:6-20`](../../../src/renderer/components/page-manager/PageSlot.ts), [`PageSlot.ts:22-45`](../../../src/renderer/components/page-manager/PageSlot.ts)). Its `dispose()` removes the placeholder synchronously and queues the React-root disposal behind a generation guard ([`PageSlot.ts:47-69`](../../../src/renderer/components/page-manager/PageSlot.ts)).

`PagesView` constructs `AppPageManagerView` before `super()`, adopts `manager.root` as its own root, mounts the manager, and binds `pagesModel.state` to manager updates ([`PagesView.ts:8-20`](../../../src/renderer/ui/app/PagesView.ts)). Its only React dependency is the callback that currently returns `React.createElement(PageContentBridge, { pageId })` ([`PagesView.ts:22-31`](../../../src/renderer/ui/app/PagesView.ts)). The replacement is the plain `pageView: PageContentView` constructor prop.

`PageContentView` is already a public-constructor `VanillaView` whose constructor only stores props, creates the stable root through `super(props)`, and sets the root's `display` to `contents` ([`PageContentView.ts:13-31`](../../../src/renderer/ui/app/PageContentView.ts)). It installs the page subscription and performs the first content construction in `onMount()`/`sync()` ([`PageContentView.ts:33-80`](../../../src/renderer/ui/app/PageContentView.ts)). This makes it suitable for the native arm; `PageSlot` must construct it only during activation/reconciliation, never in the slot constructor.

The five files in `ui/app` are all removable React faces/barrel code after this change, subject to the measured counts below. `PageContentBridge` has one current caller—the `PagesView` import/use—and becomes zero when `PagesView` switches to `pageView`; `RenderEditor` has zero component callers and only the barrel re-export; `MainPage` and `Pages` each have zero component callers; and `ui/app/index.ts` itself has zero imports under `src`. The underlying native views are live independently: `src/renderer/index.tsx` imports and constructs `MainPageView` directly, and `MainPageView` imports and constructs `PagesView` directly. `RenderEditorView` is not callerless: `PageContentView` imports it and constructs it at [`PageContentView.ts:10`](../../../src/renderer/ui/app/PageContentView.ts) and [`PageContentView.ts:134-149`](../../../src/renderer/ui/app/PageContentView.ts), so it remains.

### Two page-manager arms and measured caller counts

`PageManagerView` must remain React-armed. Its props still declare `renderPage: (id: string) => ReactNode`, and its reconciliation calls `slot.render(this.root, renderPage(id))` for every browser tab ([`PageManagerView.ts:5-12`](../../../src/renderer/components/page-manager/PageManagerView.ts), [`PageManagerView.ts:54-77`](../../../src/renderer/components/page-manager/PageManagerView.ts)). The only production caller is `PageManager` in `BrowserView.tsx:25`, rendered at [`BrowserView.tsx:596-615`](../../../src/renderer/editors/browser/BrowserView.tsx). That callback returns the React `BlankPageLinks` and `BrowserWebviewItem` subtree, including one `<webview>` per internal tab.

The React-facing `PageManager.tsx` therefore remains and continues to be the thin `mountVanilla(PageManagerView, props)` face ([`PageManager.tsx:1-12`](../../../src/renderer/components/page-manager/PageManager.tsx)). Its measured production caller count is **1**.

`AppPageManagerView` is already directly constructed by `PagesView` at [`PagesView.ts:12-15`](../../../src/renderer/ui/app/PagesView.ts), so the React-facing `AppPageManager.tsx` has no production callers. A repository-wide source search found **0** callers of `AppPageManager`; it is only its own definition/type re-export. It should be deleted once `AppPageManagerProps` is imported directly from `AppPageManagerView` by the native caller. `AppPageManagerView` itself remains and has **1** production caller (`PagesView`).

### Chosen native-arm design

Use a `VanillaViewCtor` arm, following the existing `EditorModule.View` and Storybook/secondary-view constructor contracts. `VanillaViewCtor<P>` is `new (props: P) => VanillaView<P>` ([`mount.tsx:3-5`](../../../src/renderer/uikit/shared/mount.tsx)); a concrete view must have a public constructor, and `VanillaView` deliberately creates only its stable root in the base constructor. The app page has one constructor for every page, so the page manager should hold that constructor as a plain prop rather than wrap it in an ID-ignoring callback. The page arm should use a small page-slot props shape, structurally matching `PageContentView`:

```ts
// Current: both managers force a React value through the shared slot.
renderPage: (id: string) => ReactNode;
render(root: HTMLElement, content: ReactNode): void;

// Planned: the app manager holds one native constructor; the shared slot keeps both arms.
type PageSlotViewProps = { pageId: string };
pageView: VanillaViewCtor<PageSlotViewProps>;
render(root: HTMLElement, content: ReactNode): void; // retained React arm
renderNative(root: HTMLElement, view: VanillaViewCtor<PageSlotViewProps>): void;
```

At runtime, `PageSlot` must retain the arm it was given. For the React arm it keeps the existing `MountedReactRoot` and Fragment render path. For the native arm it creates one view after attaching the stable placeholder, appends the view root, and mounts it once. Later reconciliations may call the native slot arm because the manager's reconciliation shape is retained, but the slot returns immediately when that native view already exists. There is deliberately no native update path and no constructor-identity replacement path: the slot ID is fixed for its lifetime and `AppPageManagerView.pageView` is one module-level constructor.

A bare `Node`-returning callback was considered and rejected. It would let `PageSlot` append the page root but gives it no lifecycle/dispose hook; `PageContentView` owns page-model and child-view subscriptions, so a Node-only arm would leak those resources or force a second ownership protocol beside `VanillaView`. A constructor gives `PageSlot` explicit ownership and direct disposal. The native arm intentionally does not claim update-in-place semantics: `PageContentView` has no `onUpdate()` override and drives itself from its `pagesModel.state` subscription, while `VanillaView.update()`'s default hook is empty ([`PageContentView.ts:33-47`](../../../src/renderer/ui/app/PageContentView.ts), [`vanilla-view.ts:67-79`](../../../src/renderer/uikit/shared/vanilla-view.ts), [`vanilla-view.ts:219-223`](../../../src/renderer/uikit/shared/vanilla-view.ts)).

Do not use `mountVanilla` for the app-page arm. `mountVanilla` returns a React element and its module-scope `VanillaHost` necessarily creates a React tree; the purpose of this arm is to avoid that root. `mountReactHandle` remains only in the retained React branch. `VanillaView`'s lifecycle contract requires children to be mounted explicitly and says disposal releases behavior without detaching the root; therefore `PageSlot` owns the placeholder removal and native view disposal ordering.

## Implementation Plan

### 1. Extend `PageSlot` with an owned native arm

Modify [`src/renderer/components/page-manager/PageSlot.ts`](../../../src/renderer/components/page-manager/PageSlot.ts):

- Import `VanillaViewCtor` as a type and retain the existing React/mount imports.
- Add the shared `PageSlotViewProps` shape (`{ pageId: string }`) and a native-view reference alongside the React handle. Keep the placeholder as the one stable `HTMLDivElement`; stamp `element.dataset.name = "page-slot"` in the constructor next to its existing style application.
- Preserve the current React behavior exactly: Fragment wrapping, attach-before-first-mount, retained `MountedReactRoot.render()`, and the generation-guarded deferred disposal.
- Add the native constructor arm to the slot render API. The native path must attach the existing placeholder before calling `mount()`, append the constructed view root to that placeholder, and mount exactly once. It must not construct a view in `PageSlot`'s constructor and must not replace the placeholder on update.
- On every later native-arm call, return immediately when the one native view already exists. Do not add `view.update(...)`, constructor comparison, constructor replacement, or native remount machinery: `PageSlot.id` is fixed and the app manager's `pageView` is constant.
- In `dispose()`, remove the placeholder first as today. Copy the native-view reference to a local and clear the field **before** calling native `dispose()`, then dispose it directly and synchronously; do not queue it behind a microtask. Keep the existing generation increment and guard for the React handle, because the browser page manager still uses that arm during an outer React commit. Make cleanup one-shot and safe if one branch is absent; the clear-before-dispose ordering prevents a throwing teardown from being re-entered or double-disposed.
- Keep React and native resources mutually exclusive. Do not unify disposal by deleting the React generation guard, and do not call `mountReactHandle` from the native branch.

Before → after lifecycle shape:

```text
Current React arm:
attach placeholder → mountReactHandle(element, Fragment(content))
dispose: remove placeholder → queueMicrotask(generation-guarded root.dispose())

Planned native arm:
attach stable placeholder → new PageContentView({ pageId })
                      → append(view.root) → view.mount()
later reconcile: native arm returns without doing anything
dispose: remove placeholder → view.dispose() synchronously
```

### 2. Make only the application manager view-valued

Modify [`src/renderer/components/page-manager/AppPageManagerView.ts`](../../../src/renderer/components/page-manager/AppPageManagerView.ts):

- Replace its `ReactNode` import/return contract with the plain `pageView: VanillaViewCtor<PageSlotViewProps>` prop used by `PageSlot`.
- Keep `PageManagerView.ts` unchanged as the React-armed manager. Its `renderPage` type, `slot.render(...)` call, retained React slot behavior, and browser caller remain in scope only for verification.
- In `reconcile`, preserve the current order and predicate: record `activeId` and `groupedActiveId` in `hasBeenActive` before rendering; create/attach a placeholder for every current `pageId`; render only slots whose IDs are in `hasBeenActive`; then apply visibility/group/compare styles.
- Replace the app call to the React slot arm with the native arm. `pageView` supplies the one constructor, and `PageSlot` supplies `{ pageId: id }`; no native view may be constructed for a never-activated placeholder. The existing reconcile loop may call the native arm for each activated ID on each pass, but the slot must no-op after its first mount.
- Preserve closed-page cleanup, deletion from `hasBeenActive`, valid-group filtering, stale `GroupContainer` disposal, splitter visibility, compare-mode state, and all inline style resets. A page becoming hidden, grouped, ungrouped, or compare-inactive must not cause its retained native view to be disposed or recreated.
- Keep `onDispose()`'s `runCleanup` snapshot/wrapper and first-error rethrow. Native `PageContentView.dispose()` now runs synchronously in the slot loop and can throw while tearing down descendants; the manager must continue attempting every group and slot cleanup before rethrowing the first error.
- Keep the existing manager constructor root-only. `AppPageManagerView`'s `onMount()` remains the point where reconciliation creates placeholders, groups, and page views; this honors the UIKit rule that constructors must not create or touch child DOM.

### 3. Point `PagesView` at `PageContentView` and remove the app shims

Modify [`src/renderer/ui/app/PagesView.ts`](../../../src/renderer/ui/app/PagesView.ts):

- Remove the default React import used only to create the bridge element.
- Replace the `PageContentBridge` import with `PageContentView` and set `pageView: PageContentView`. Do not instantiate it in `managerProps()`; `PageSlot` owns construction at the existing activation point.
- Preserve the established constructor pattern (`new AppPageManagerView(...)` before `super()`, adopting `manager.root`) because `PagesView` is a view whose root is its child manager. Do not copy this root-adoption pattern into `PageSlot`, whose placeholder must remain stable.

Delete [`src/renderer/ui/app/PageContentBridge.tsx`](../../../src/renderer/ui/app/PageContentBridge.tsx). It becomes callerless once `PagesView` uses `pageView`.

Delete [`src/renderer/ui/app/RenderEditor.tsx`](../../../src/renderer/ui/app/RenderEditor.tsx), [`src/renderer/ui/app/MainPage.tsx`](../../../src/renderer/ui/app/MainPage.tsx), [`src/renderer/ui/app/Pages.tsx`](../../../src/renderer/ui/app/Pages.tsx), and [`src/renderer/ui/app/index.ts`](../../../src/renderer/ui/app/index.ts). The three named React faces have zero consumers under `src`, and the barrel has zero imports under `src`; `MainPageView` is instead constructed directly by [`src/renderer/index.tsx:7-18`](../../../src/renderer/index.tsx), while `PagesView` is constructed directly by [`MainPageView.ts:16`](../../../src/renderer/ui/app/MainPageView.ts) and [`MainPageView.ts:60-65`](../../../src/renderer/ui/app/MainPageView.ts). Remove the entire dead barrel rather than retaining two unused exports. Keep [`RenderEditorView.ts`](../../../src/renderer/ui/app/RenderEditorView.ts) because `PageContentView` constructs it directly.

Before deleting each file, repeat the repository-wide caller search for its exported symbol/path and record the result: `PageContentBridge` (one current caller, expected zero after the `PagesView` edit), `RenderEditor` (zero), `MainPage` (zero), `Pages` (zero), and the `ui/app/index.ts` barrel (zero imports). Do not infer a face's liveness from its sibling native view; the direct native constructors are separate, live symbols.

### 4. Resolve the React faces by measured caller count

Delete [`src/renderer/components/page-manager/AppPageManager.tsx`](../../../src/renderer/components/page-manager/AppPageManager.tsx): the source search measured zero production callers, and `PagesView` already imports the native view directly.

Keep [`src/renderer/components/page-manager/PageManager.tsx`](../../../src/renderer/components/page-manager/PageManager.tsx): it has one production caller in `BrowserView.tsx`, and the browser editor remains React-backed. Do not delete or narrow `PageManagerView`'s React contract. No barrel file exists in `components/page-manager/`; preserve the existing direct import path for the surviving face.

### 5. Preserve grouped, compare, and retained-child behavior

No implementation change is planned for [`GroupContainer.ts`](../../../src/renderer/components/page-manager/GroupContainer.ts) or [`ImperativeSplitter.ts`](../../../src/renderer/components/page-manager/ImperativeSplitter.ts). The source verifies that grouping does **not** physically reparent placeholders: `GroupContainer` styles the two placeholder siblings and inserts a splitter sibling; its comments explicitly prohibit `appendChild` reparenting because it would reload iframes/webviews ([`GroupContainer.ts:3-16`](../../../src/renderer/components/page-manager/GroupContainer.ts), [`GroupContainer.ts:23-45`](../../../src/renderer/components/page-manager/GroupContainer.ts)). `AppPageManagerView` reapplies standalone inline styles on compare entry and restores grouped styles on compare exit ([`AppPageManagerView.ts:160-200`](../../../src/renderer/components/page-manager/AppPageManagerView.ts)).

The native slot must therefore preserve each activated `PageContentView` instance across:

- **Group / ungroup:** only placeholder CSS and splitter ownership change. The page view, its editor view, subscriptions, and DOM identity stay mounted.
- **Compare on / off:** the slot stays mounted, while `PageContentView.sync()` owns the editor transition: it clears the ordinary content and secondary views, creates/updates `CompareEditor` for the left text page, then clears compare and recreates ordinary content on exit ([`PageContentView.ts:49-80`](../../../src/renderer/ui/app/PageContentView.ts), [`PageContentView.ts:117-195`](../../../src/renderer/ui/app/PageContentView.ts)). The page slot must not add a second disposal/remount cycle around this logic.
- **Browser and board `<webview>` content:** the app page's browser/board editor subtree must not be recreated merely because its page placeholder becomes hidden, grouped, or compare-styled. The surviving browser-internal `PageManager` independently retains its React `<webview>` tabs, and both browser and board are registered on the React `Component` arm ([`browser/index.tsx:8-16`](../../../src/renderer/editors/browser/index.tsx), [`board/index.tsx:11-19`](../../../src/renderer/editors/board/index.tsx)); they remain deliberate editor-owned React islands. Placeholder identity and native-view identity are the protection against duplicate guest renderers.
- **`<audio>` / `<video>`:** the video editor is already a native `EditorModule.View`; `VideoEditorView` owns `VPlayerView`, whose `onMount()` creates the video and audio resources and whose disposal path pauses/removes media sources and disposes the video adapter ([`VideoView.ts:34-104`](../../../src/renderer/editors/video/VideoView.ts), [`VPlayer.ts:34-92`](../../../src/renderer/editors/video/VPlayer.ts), [`VPlayer.ts:197-213`](../../../src/renderer/editors/video/VPlayer.ts), [`AudioPlayer.ts:21-78`](../../../src/renderer/editors/video/AudioPlayer.ts), [`AudioPlayer.ts:128-151`](../../../src/renderer/editors/video/AudioPlayer.ts)). Keeping an inactive page's native view mounted preserves the existing retained-page behavior; closing the page remains the event that reaches `dispose()`.
- **Monaco:** Monaco is registered on the `View` arm but still creates `MonacoBody` as a React element inside `TextChromeView` ([`monaco/index.ts:16-47`](../../../src/renderer/editors/monaco/index.ts)). The native page arm must not convert or dispose that editor body on group transitions; its nested React body root remains an editor-owned root. Compare transitions are still handled by `PageContentView`, not by changing the page slot arm.

The verification path must exercise plain pages plus group, ungroup, compare-on, and compare-off transitions with browser/board webviews, a media page where available, and Monaco. Check element identity, duplicate mount symptoms, media state/error events, and that inactive placeholders are hidden by layout rather than assumed absent from the DOM.

### 6. Validate the native constructor/lifecycle contract

The new slot arm must follow [`src/renderer/uikit/CLAUDE.md`](../../../src/renderer/uikit/CLAUDE.md) and [`doc/standards/model-view-pattern.md`](../../standards/model-view-pattern.md): constructors create only the stable root; `onMount()` creates child DOM, claims child views, installs listeners/subscriptions, and mounts children; `dispose()` releases owned resources. The native page arm deliberately has no `update()` operation because its fixed page ID and constant constructor make an update contract unnecessary.

- `PageSlot` may create/style/mark its placeholder in its constructor, but may not instantiate `PageContentView` or append child view DOM there.
- The native view must be appended to its already-attached placeholder before `mount()`, so future views that measure their attached root see the correct DOM context.
- Native disposal is direct because it is not constrained by React's parent-commit rule. React disposal remains deferred and generation-guarded.
- Do not add a `DocumentFragment`, a second wrapper, a timer-based activation workaround, a generic portal abstraction, or a new test harness.

### 7. Live verification deferred to a human run

The interactive group/compare/media/webview smoke path cannot be executed during this planning run because the visible application window is unavailable while the user is away and the screen is locked. It must remain explicitly outstanding; no live behavior claim is made here. When a human can interact with the window, run this sequence in one pass:

1. Reproduce the US-1133 shape: restore/open seven pages with three ever activated, then record `[data-react-root]`, the open-page list, each root's depth/chain/first child, and all `[data-name="page-slot"]` placeholders' display, child count, and root marker. Confirm four placeholders are empty before activation.
2. Activate an unactivated page and switch among active/inactive pages. Confirm exactly one native page view is created at first activation, the placeholder remains the same element, and hidden pages retain their content without a new page-level React root.
3. Use an app page with a browser `<webview>` and switch/reorder its internal tabs, navigate away and back, and confirm each tab's existing webview element and guest state are retained. Repeat with a trusted board webview and check that its editor-owned React root is not duplicated.
4. Open a Monaco page and a video/audio page. Switch them inactive and active; confirm Monaco's body root remains editor-owned and media does not gain duplicate players or unexpected loading/error activity.
5. Group two app pages, switch the active group, resize the splitter, ungroup them, then repeat with a text-file pair through compare-on and compare-off. At every transition check placeholder identity, display/style state, page-view identity, and absence of duplicate webview/media/editor resources.
6. Close a grouped page and an activated standalone page. Confirm the removed placeholder detaches and native disposal releases page subscriptions, descendants, media, and editor resources; then repeat the root/placeholder probe and record the result as outstanding in EPIC-070.

## Concerns / Decisions

1. **React deferred teardown remains arm-specific — resolved.** The existing `PageSlot.dispose()` removes its element immediately and queues `MountedReactRoot.dispose()` behind a generation guard because React cannot be synchronously unmounted during its parent's commit. The native view has no such constraint, so it disposes directly. The two branches must not be unified by deleting the guard. Because native disposal is now synchronous and can throw, clear the native-view field before invoking `dispose()`; `AppPageManagerView.onDispose()` keeps its `runCleanup` snapshot/wrapper and first-error rethrow so every slot cleanup is attempted.

2. **Lazy activation — resolved.** Preserve `hasBeenActive` exactly. Slot creation for all current IDs is allowed and required for layout, but native view construction is allowed only for an active or previously activated ID (including `groupedActiveId`). Closing a page removes both the slot and the activation-set entry; a later ID reuse receives a new slot/view.

3. **Persistent children — resolved for this task's ownership boundary.** Group and compare layout changes must not dispose a page slot merely because it is hidden or moved between CSS layouts. The page content's existing `sync()` remains responsible for compare editor transitions. Explicit teardown is only for page removal/manager disposal, where the native slot disposes directly and the descendant view lifecycle releases subscriptions, media, webviews, and editor resources.

4. **Constructor arm vs. Node callback — resolved.** Choose `VanillaViewCtor<PageSlotViewProps>`. A Node callback lacks a dispose contract and would leak `PageContentView` ownership. The constructor also matches the existing `EditorModule.View`, secondary-view, and Storybook view-valued patterns. The native arm constructs once on first activation, mounts once, no-ops on later reconcile calls, and disposes on slot disposal; it intentionally has no update path or constructor-swap path because `PageSlot.id` is fixed, `pageView` is one constant constructor, and `PageContentView` has no `onUpdate()` behavior. A later reader must not restore those dead branches as a missing feature.

5. **`AppPageManager` / `PageManager` React faces — resolved by measurement.** `AppPageManager.tsx`: 0 production callers, delete. `PageManager.tsx`: 1 production caller (`BrowserView.tsx:596`), retain. `PageManagerView`'s React arm is a non-goal and must remain.

6. **`ui/app` face cleanup — resolved by measured counts.** `PageContentBridge` has one current caller and becomes zero after the `PagesView` edit. `RenderEditor`, `MainPage`, and `Pages` each have zero component callers. `ui/app/index.ts` has zero imports under `src`. Delete all five files after repeating those individual searches; retain the directly constructed `MainPageView`, `PagesView`, and `RenderEditorView` classes.

7. **Placeholder addressing — resolved.** Stamp repeated `data-name="page-slot"` on each placeholder. Do not use `data-type` or `data-part` for this new marker, and do not claim the name identifies a unique page. The existing `pages-container`, `page-editor`, and `page-empty` contract remains unchanged.

8. **Out-of-scope editor conversion — resolved.** Do not modify `MonacoBody`, `GraphBody`, `BrowserView`'s internal tab content, board editor bodies, video/media views, `AsyncEditorView`, or any editor body. This task changes only the page host arm and deletes the five `ui/app` face/barrel files whose counts are recorded above.

## Acceptance Criteria

- [ ] `PageSlot` has a native `VanillaViewCtor<PageSlotViewProps>` arm and a retained React arm; both own their respective lifecycle correctly.
- [ ] The native arm attaches the stable placeholder before mounting, constructs and mounts exactly once on activation, no-ops on later reconcile calls, disposes directly with its field cleared first, and never constructs child views in the `PageSlot` constructor.
- [ ] The React arm still wraps content in a Fragment, reuses its `MountedReactRoot`, and retains the generation-guarded deferred disposal.
- [ ] Every placeholder carries `data-name="page-slot"`; its identity and DOM position remain stable across updates, reordering, grouping, ungrouping, and compare toggles.
- [ ] `AppPageManagerView` accepts a view-valued page contract and renders only `hasBeenActive` pages; four never-activated placeholders remain empty in the US-1133 seven-page scenario.
- [ ] `PageManagerView` and its React `renderPage` arm remain unchanged in behavior for `BrowserView`'s internal tabs.
- [ ] `PagesView` sets `pageView: PageContentView`, with no `React.createElement` or `PageContentBridge` dependency.
- [ ] `PageContentBridge.tsx`, `RenderEditor.tsx`, `MainPage.tsx`, `Pages.tsx`, and `ui/app/index.ts` are deleted after their individual caller counts are rechecked; `MainPageView`, `PagesView`, and `RenderEditorView` remain live through direct native construction.
- [ ] `AppPageManager.tsx` is deleted after its measured zero callers; `PageManager.tsx` remains because its measured caller count is one.
- [ ] Group/ungroup and compare-on/off preserve placeholder, page-view, browser/board webview, media, and Monaco identities as applicable; page removal still disposes all descendants. This live criterion is explicitly outstanding until the human sequence in §7 is run.
- [ ] No editor body is converted, no unit tests or test harnesses are added, no dashboard entry is changed, and no commit is created.
- [ ] After implementation, `tsc --noEmit`, `npm run lint`, and `npm run build-prod` pass. The human live smoke sequence in §7 is run and recorded; until then, live interaction and closing root measurement remain outstanding. The closing measurement uses `[data-react-root]`, the open-page list, per-root depth/chain, and the same baseline session procedure.

## Files Changed Summary

| File | Planned change |
|---|---|
| [`src/renderer/components/page-manager/PageSlot.ts`](../../../src/renderer/components/page-manager/PageSlot.ts) | Add the native constructor arm, stable `data-name="page-slot"`, one-shot native ownership, and direct native disposal while preserving the React arm's deferred guard. |
| [`src/renderer/components/page-manager/AppPageManagerView.ts`](../../../src/renderer/components/page-manager/AppPageManagerView.ts) | Replace the ID-ignoring callback with `pageView: VanillaViewCtor<PageSlotViewProps>` and call the native slot arm without changing lazy/group/compare reconciliation semantics. |
| [`src/renderer/ui/app/PagesView.ts`](../../../src/renderer/ui/app/PagesView.ts) | Return `PageContentView` as the view-valued callback and remove the bridge's React dependency. |
| [`src/renderer/ui/app/PageContentBridge.tsx`](../../../src/renderer/ui/app/PageContentBridge.tsx) | Delete; callerless after `PagesView` changes. |
| [`src/renderer/ui/app/RenderEditor.tsx`](../../../src/renderer/ui/app/RenderEditor.tsx) | Delete; already has zero component callers. |
| [`src/renderer/ui/app/index.ts`](../../../src/renderer/ui/app/index.ts) | Delete the unused barrel; its three React face exports have zero consumers under `src`. |
| [`src/renderer/ui/app/MainPage.tsx`](../../../src/renderer/ui/app/MainPage.tsx) | Delete; exported `MainPage` has zero consumers. |
| [`src/renderer/ui/app/Pages.tsx`](../../../src/renderer/ui/app/Pages.tsx) | Delete; exported `Pages` has zero consumers. |
| [`src/renderer/components/page-manager/AppPageManager.tsx`](../../../src/renderer/components/page-manager/AppPageManager.tsx) | Delete; measured production caller count is zero. |
| [`src/renderer/components/page-manager/PageManager.tsx`](../../../src/renderer/components/page-manager/PageManager.tsx) | **No change.** Retain the one surviving browser React face. |
| [`src/renderer/components/page-manager/PageManagerView.ts`](../../../src/renderer/components/page-manager/PageManagerView.ts) | **No change.** Retain its React arm for `BrowserView.tsx:596-615`. |
| [`src/renderer/components/page-manager/GroupContainer.ts`](../../../src/renderer/components/page-manager/GroupContainer.ts) | **No change.** Verify its sibling/CSS non-reparenting contract. |
| [`src/renderer/components/page-manager/ImperativeSplitter.ts`](../../../src/renderer/components/page-manager/ImperativeSplitter.ts) | **No change.** Existing observer/pointer lifecycle remains owned by `GroupContainer`. |
| [`src/renderer/ui/app/PageContentView.ts`](../../../src/renderer/ui/app/PageContentView.ts) | **No change.** Existing native page owner remains the native arm's child. |
| [`src/renderer/ui/app/RenderEditorView.ts`](../../../src/renderer/ui/app/RenderEditorView.ts) | **No change.** It remains directly constructed by `PageContentView`. |
| [`src/renderer/ui/app/AsyncEditorView.ts`](../../../src/renderer/ui/app/AsyncEditorView.ts) | **No change.** Editor arm selection and editor-owned React roots remain out of scope. |
| [`src/renderer/uikit/shared/mount.tsx`](../../../src/renderer/uikit/shared/mount.tsx) | **No change.** Reuse `VanillaViewCtor` and retain both existing adapters. |
| [`src/renderer/uikit/shared/vanilla-view.ts`](../../../src/renderer/uikit/shared/vanilla-view.ts) | **No change.** Consume the existing constructor/mount/update/dispose contract. |
| [`src/renderer/editors/browser/BrowserView.tsx`](../../../src/renderer/editors/browser/BrowserView.tsx) | **No change.** Its one `PageManager` caller and React `<webview>` tab subtree survive. |
| `doc/architecture/pages-architecture.md`, `doc/standards/model-view-pattern.md`, `doc/architecture/ui-element-contract.md` | **No change in this task.** They are the governing architecture, lifecycle, and addressing references. |
| `doc/active-work.md` and `doc/epics/EPIC-070.md` | **No change.** The user explicitly says the dashboard is already updated; the epic remains authoritative. |
| [`doc/tasks/US-1134-page-island-native-arm/README.md`](README.md) | This investigation, resolved design decisions, implementation plan, concerns, and verification criteria. |
