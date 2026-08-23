# US-1031: Page-manager portal hosts → `appendChild`

**Status:** Planned

**Epic:** [EPIC-058: De-React Epic D — Shell and shared components](../../epics/EPIC-058.md)

**Priority:** High

**Created:** 2026-08-23

**Depends on:** [US-989: Boundary adapters](../US-989-boundary-adapters/README.md),
[US-990: Storybook vanilla rendering](../US-990-storybook-vanilla-render/README.md), and the
existing `mountReactHandle` bridge in
[`uikit/shared/mount.tsx`](../../../src/renderer/uikit/shared/mount.tsx)

**Parallel with:** [US-1030: GitTree vanilla view](../US-1030-git-tree-vanilla/README.md),
US-1032 (dialog host), and the Epic E editor conversions

## Goal

Convert both `components/page-manager/` hosts to `VanillaView` implementations while preserving
the public React-facing props and the stable placeholder contract that keeps browser webviews,
iframes, canvases, and editor subtrees alive across tab changes. Replace React portals with explicit
`appendChild` ownership for the page placeholders, while keeping `renderPage` as a deliberate React
subtree boundary until the page contents are converted by later work.

The task must preserve page identity, visibility, grouping, compare mode, splitter behavior, lazy
activation, page persistence behavior, and browser webview lifecycle. It must not turn page
reordering into DOM reparenting: existing placeholders remain in their original DOM positions and
only newly-created placeholders are appended.

## Background and verified inventory

### Current surface

The folder has four tracked files and 534 lines:

| File | Current role | Planned treatment |
|---|---|---|
| `src/renderer/components/page-manager/PageManager.tsx` | Browser internal-tab host; stable placeholders plus one React portal per tab | Thin public React face calling `mountVanilla(PageManagerView, props)` |
| `src/renderer/components/page-manager/AppPageManager.tsx` | Application page host; deferred page rendering, grouping, compare mode, and visibility | Thin public React face calling `mountVanilla(AppPageManagerView, props)` |
| `src/renderer/components/page-manager/GroupContainer.ts` | Imperative grouping state and splitter ownership | Reuse unchanged unless implementation needs comment-only clarification |
| `src/renderer/components/page-manager/ImperativeSplitter.ts` | Resize observer, drag handling, and splitter layout | Reuse unchanged |

There is no barrel file in this folder. The two public faces are imported directly by their only
callers:

| Caller | Host | Current use |
|---|---|---|
| `src/renderer/editors/browser/BrowserView.tsx:608` | `PageManager` | Renders all internal browser tabs, including `BrowserWebviewItem` and the blank-tab `BlankPageLinks` overlay |
| `src/renderer/ui/app/Pages.tsx:155` | `AppPageManager` | Renders `PageContent` for application pages and supplies grouping/compare state from `pagesModel` |

No caller imports `GroupContainer` or `ImperativeSplitter` directly. No test files or test harness
cover this folder; the existing verification model is typecheck/lint/build plus live browser and
application smoke checks.

### `PageManager` behavior that must survive

`PageManager.tsx` currently:

1. Creates a `div` placeholder for each `pageIds` entry with `position: absolute`, `inset: 0`, and
   `display: none` during render (`:29-39`).
2. Appends only placeholders that are not already attached (`:56-62`). It never reorders existing
   placeholders when `pageIds` changes.
3. Removes placeholders for closed IDs (`:48-54`) and sets only the active placeholder's display to
   the empty string (`:64-67`).
4. Renders the result of `renderPage(id)` into each placeholder using `createPortal` with the page ID
   as the portal key (`:70-79`). Every browser tab is therefore kept mounted while inactive.

The browser child is not disposable presentation-only content. `BrowserWebviewItem` registers a
`<webview>` with `BrowserWebviewModel`, attaches DOM/IPC listeners, waits for `dom-ready`, and keeps
the guest page alive. Its memo comparator and the page-manager placeholder identity together avoid
reloading a tab on ordinary browser state changes or tab reordering. The new view must not create a
second webview or remove/reinsert an existing one as a side effect of an update.

### `AppPageManager` behavior that must survive

`AppPageManager.tsx` has the same stable placeholder map, plus these rules:

- `activeId` and `groupedActiveId` are added to `hasBeenActiveRef` during render (`:46-48`). A page
  placeholder exists for every current page, but `renderPage` is called only for pages that have
  been active or grouped. This is deliberate deferred page construction and must remain.
- Closed pages are removed from both the placeholder map and the activated set (`:69-75`).
- A valid grouping is a `leftId → rightId` pair whose two IDs are still present (`:78-83`).
- `GroupContainer` instances are disposed when a group disappears or its right page changes, then
  recreated for new groups (`:85-107`). The placeholders remain direct children of the main
  container; grouping is CSS positioning, not DOM reparenting.
- New placeholders are appended in `pageIds` order only when they have no parent (`:109-115`).
- Standalone pages use absolute full-size flex rows; grouped pages use left/right absolute styles;
  inactive groups and pages are hidden (`:117-140`). Compare mode shows only the left placeholder,
  restores standalone styling, and pauses the splitter (`:124-137`, `:143-153`).
- `ImperativeSplitter` owns its `ResizeObserver`, pointer listeners, pointer capture, and width
  state. `GroupContainer.dispose()` removes the splitter and restores both placeholders to the
  standalone style. These resources must still be disposed before the page-manager root is removed.

### Why `appendChild` is the correct boundary

The page-manager hosts target DOM nodes that they own. React portals are currently used only to
place React page subtrees into those nodes; they are not needed for ownership or positioning. A
vanilla view can create the placeholders, append them to its root, and use `mountReactHandle` once
per activated placeholder. The page content remains a React island, but the host lifecycle no
longer depends on a parent React portal list.

The nested React boundary is intentional and finite:

```text
mountVanilla(PageManagerView/AppPageManagerView)
  └─ display: contents adapter host
     └─ page-manager root div (the former portal container)
        ├─ placeholder div for page A
        │  └─ nested React root: Fragment(renderPage("A"))
        └─ placeholder div for page B
           └─ nested React root: Fragment(renderPage("B"))
```

`renderPage` remains a `ReactNode` callback because its two current consumers return complete
React-owned subtrees. It is not widened into a generic slot protocol, and no page content is
converted in this task. `React.createElement(React.Fragment, null, renderPage(id))` is the adapter
from `ReactNode` to the `ReactElement` required by `mountReactHandle`; it adds no DOM wrapper.

## Implementation plan

### 1. Freeze the baseline and audit the DOM contract before editing

- Take the Epic D Rule 4 measurements before changing either public face: one active app-page switch
  through `AppPageManager` and one browser-tab switch through `PageManager`. For each, record the
  exact observation roots, slot/root count, observer options, raw record counts, and settled state.
  Record both before numbers in `EPIC-058.md` and repeat the identical switches after conversion.
- Confirm the two production call sites remain unchanged: `BrowserView.tsx:608` and
  `Pages.tsx:155`. No caller should switch to a new prop shape or manually manage a placeholder.
  Every reconciliation pass must capture `pageIds` and `renderPage` from the same props snapshot;
  never invoke a retained callback with an ID outside that snapshot or with an ID removed earlier
  in the current pass.
- Inspect the parent styles and page-manager-related selectors for direct-child, empty, sibling, or
  positional assumptions (`>`, `:empty`, `:nth-child`, `+`, `~`). In particular verify that the
  `mountVanilla` `display: contents` adapter host does not become the element selected by a caller's
  direct-child rule. The semantic page-manager root must keep the same class and layout role as the
  current container `div`.
- Record the current DOM invariants: one real container per manager, one placeholder per current ID,
  no placeholder reordering, absolute full-size placeholder styles, and React content directly
  inside each placeholder with no wrapper element introduced by this task.

### 2. Split the public faces from native implementations

- Keep `PageManager.tsx` and `AppPageManager.tsx` as the public import paths and preserve the exact
  inferred prop contracts, including `ReactNode`-returning `renderPage`, `className`, `grouping`,
  `groupedActiveId`, and `compareModeIds`.
- Add distinct-basename native modules `PageManagerView.ts` and `AppPageManagerView.ts`. Do not use
  `PageManager.ts` or `AppPageManager.ts` beside the `.tsx` files: TypeScript's extension resolution
  would make the existing direct imports ambiguous.
- Each public face should be a thin `mountVanilla` call. The native constructor must be public as
  required by `VanillaViewCtor`; it creates only the stable root. Child placeholders, React handles,
  group containers, listeners, and observers are created from `onMount` or the reconciliation path.
- Make the native root the same container `div` that the React implementation currently returns,
  including the caller's `className`. The adapter's `display: contents` host is not a replacement
  for that root and must not receive page-manager layout styles.

### 3. Add a page-slot ownership helper for the nested React boundary

- Add a private folder-local helper (for example `PageSlot.ts`) that owns one placeholder and, when
  activated, one `MountedReactRoot` from `mountReactHandle`.
- The helper must append the placeholder to the supplied page-manager root before mounting its React
  handle. Render `React.Fragment` around the callback result so arrays, strings, `null`, and multiple
  sibling nodes keep their existing DOM shape.
- `mountReactHandle().render()` is concurrent/asynchronous: calling it does not mean the nested
  subtree is committed or that a child `useLayoutEffect` has run. `unmount()` is synchronous, so the
  slot transition must use the established detach-then-deferred-unmount pattern from
  `fill-slot.ts:60-71` (`releaseReactSlot`): detach the placeholder immediately, then queue the
  nested-root disposal. A generation token must make superseded queued disposals no-ops.
- `render(next)` must call the retained handle's `render()` rather than disposing and recreating the
  nested React root. This is critical for `BrowserWebviewItem`: ordinary parent updates must not
  recreate its `<webview>` or repeat the IPC registration effect.
- `dispose()` must be idempotent and one-shot. After a page slot's placeholder has been detached and
  its nested root has been scheduled for deferred unmount, that `PageSlot` and placeholder are never reused,
  even if the same page ID appears again later; a reappearing ID gets a new slot and new placeholder.
  The page-slot helper owns both resources; the vanilla manager owns the order in which page slots and
  group containers are cleaned up.
- Do not use `createPortal`, `createRoot` directly, `fillSlot`, or a generic cross-component portal
  abstraction. `mountReactHandle` is the existing explicit React-island boundary and is the only
  retained React root this task should add.
- Exercise first activation while the page is loading. The placeholder may be attached and visible
  before the concurrent nested render commits, so verify that no user-visible empty frame or broken
  immediate DOM read occurs. If the smoke check exposes one, defer first-activation visibility until
  a module-scope commit signal from the nested Fragment, not an arbitrary timeout or animation frame.

### 4. Implement `PageManagerView` reconciliation

- Keep a `Map<string, PageSlot>` and reconcile it from `onMount` and `onUpdate`.
- Begin each pass with one captured `{ pageIds, renderPage }` props snapshot and use that pair for
  slot creation, removal, activation, and rendering; do not read a retained callback after its ID
  has left the snapshot.
- For each current ID, create a slot if missing, append its placeholder exactly once, and immediately
  activate/render it. The initial render must happen after the placeholder is attached. This is a
  deliberate deviation from the current portal timing: today React renders into detached placeholders
  during render and attaches them later in `useLayoutEffect`; the native view appends first so the
  nested React commit and any child layout reads see an attached DOM. Smoke the first browser tab/open
  while loading explicitly.
- Remove absent IDs by detaching the placeholder immediately, scheduling its generation-guarded
  nested React-root disposal, and then deleting the one-shot slot/map entry. Do not touch the DOM
  nodes of surviving IDs.
- Call `renderPage(id)` for every current slot on updates, because the current React portal map
  recomputes each current portal on every parent render. The nested root's normal React reconciliation
  and existing `BrowserWebviewItem` memo comparator decide whether its descendants actually change.
- Apply visibility after the slot set is reconciled: `display = ""` only for `activeId`, `display =
  "none"` for every other placeholder. Preserve `position: absolute` and `inset: 0`; the empty
  string for the active placeholder is part of the current DOM contract, not a truthy substitute.
- Update the owned root's class when `className` changes, without introducing a second class or
  wrapper. `pageIds` are assumed to be stable unique IDs as they are today; do not silently reorder
  the DOM to mirror an array reorder.

### 5. Implement `AppPageManagerView` reconciliation and grouping

- Keep `Map<string, PageSlot>`, `Map<string, GroupContainer>`, and a `Set<string>` for activated
  pages. Mark `activeId` and `groupedActiveId` as activated before reconciling, matching the current
  render-time behavior. Existing activated pages remain mounted until their page IDs disappear.
- Capture `pageIds` and `renderPage` from the same props object for the entire pass. All deferred
  activation and retained-slot renders must use that pair; a removed ID must never be sent back
  through an older callback closure.
- Create placeholders for every current page, even when not activated, because the current manager
  establishes the full placeholder map and DOM ownership before it renders deferred content. Only
  activated slots receive a nested React root.
- Preserve the current phase order: remove closed slots; compute valid groups; dispose stale group
  containers; create new `GroupContainer` instances; append only unattached placeholders; activate or
  update the React slots that belong to `hasBeenActive`; then run the two ordered visual phases below.
  The exact order matters for splitter references, splitter paint order, and for not rendering a page
  into a placeholder that is already closed.
- When creating a group, guard every `Map.get` before constructing it: if either the left or right
  placeholder is missing, skip that group and do not pass `undefined` to `GroupContainer`.
- Visibility phase (first): determine the active group and set every placeholder's visibility. A
  visible standalone or grouped placeholder uses `display = "flex"`; an inactive placeholder and a
  compare-mode right placeholder use `display = "none"`. In compare mode the left placeholder uses
  `display = "flex"` after standalone styling is restored. These exact values preserve the current
  React implementation.
- Compare/group-style phase (second): after visibility is written, update each `GroupContainer`'s
  compare-mode state and set splitter display. This order is load-bearing: `GroupContainer` appends
  its splitter before newly-created placeholders are appended, so the splitter remains an absolute
  sibling with the current DOM/paint order; changing the phase order can change overlap and pointer
  targeting even when computed positions look equivalent.
- Reuse `GroupContainer` and `ImperativeSplitter` rather than moving their behavior into the view.
  Grouping must continue to position the two sibling placeholders with CSS. `appendChild` is only for
  first attachment of a placeholder; it must never reparent a live placeholder during grouping,
  ungrouping, compare-mode changes, or page-array reordering.
- Preserve all current style resets: standalone clears grouped `top`/`bottom`/`left`/`right`, width,
  flex, shrink, and min/max width before applying `position: absolute; inset: 0; display: flex;
  flex-direction: row; overflow: hidden`; grouped mode restores the left/right layout; compare mode
  hides the right side and pauses the splitter.
- Render current content into every activated slot on each update. Newly activated pages must render
  once; unactivated pages must remain empty and hidden until active or grouped. When a page closes,
  detach its slot immediately, schedule the generation-guarded nested-root disposal, then remove the
  page from the activation set. A disposed slot and placeholder are one-shot and never reused.
- Set the root class from `className` exactly as the React host did. Do not add a layout wrapper around
  the manager root or around either page.

### 6. Preserve lifecycle and error ordering

- Detach page placeholders immediately, then let each `PageSlot` queue its nested-root unmount using
  the generation-guarded `releaseReactSlot` pattern. On manager disposal, clean up all page slots and
  all `GroupContainer` instances, including the splitter's `ResizeObserver` and pointer listeners,
  before the adapter removes the manager root.
- Keep page-slot disposal one-shot and generation-guarded even when a manager is disposed while its
  parent React root is committing. This is the primary lifecycle path, not a warning-dependent
  fallback. Group/splitter cleanup must still run as a complete snapshot and rethrow the first
  synchronous cleanup error; queued nested-root disposal must not be allowed to block cleanup of the
  remaining pages.
- Keep `EditorErrorBoundary` inside the page subtree returned by `renderPage`. The page manager is a
  host, not an error-boundary replacement; errors from editor React islands must retain their current
  boundary behavior.

### 7. Update architecture records and verify the migration

- Update `doc/architecture/pages-architecture.md` to describe direct placeholder ownership and the
  per-placeholder React island rather than React portals. Preserve the stable-placeholder and
  non-reparenting rationale.
- Update the `PageManager` section in `doc/architecture/browser-editor.md` to name the native view,
  `appendChild`, `mountReactHandle`, and the unchanged webview identity guarantee.
- Add the page-manager host/view ownership rows to `doc/architecture/key-files.md`; do not add a new
  barrel file.
- Confirm `createPortal` no longer appears in either page-manager implementation. `CategoryView` is
  already converted and is not a remaining portal site. After this task the exact remaining
  `createPortal` sites are `src/renderer/editors/graph/GraphTooltip.tsx:238`,
  `src/renderer/editors/notebook/NotebookBody.tsx:170`, and
  `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx:106`; this task must not modify those
  caller-owned or overlay portals or the secondary-view registry compatibility arm.
- Run `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check`.
- Run live smoke checks in the browser and application shell: open/reorder/close internal browser
  tabs; switch active tabs while a page is loading; navigate a tab and return to it; verify blank-tab
  bookmarks survive switching; open and close application pages; group and ungroup pages; resize the
  splitter; enter and leave compare mode; switch the left and right page; close a grouped page; and
  confirm deferred pages mount exactly when first activated.
- Repeat the active app-page switch and browser-tab switch measurements with the recorded observer
  options, compare slot/root counts and raw after records to the frozen before measurements, and
  record both results in `EPIC-058.md`.

## Concerns / Open questions

### 1. Nested React-root timing during an outer React commit

`mountReactHandle` calls `root.render()` through a concurrent React root, so rendering is queued and
does not synchronously guarantee committed children or completed child layout effects. Its
`root.unmount()` is synchronous. `PageSlot` therefore always follows the established
`fill-slot.ts:60-71` / `releaseReactSlot` sequence: detach the placeholder immediately, increment a
generation, and queue the unmount only if that generation is still current. This prevents React from
touching a host that the manager has already detached and makes page closure safe during an outer
commit. The smoke check must verify first activation while loading, visible/empty-frame behavior,
and immediate DOM reads; if first activation must remain hidden until commit, add a module-scope
commit signal to the Fragment and reveal only after that signal, without a timer-based retry loop.

### 2. The React island must not change webview identity

The current guarantee depends on two independent identities: the placeholder `div` stays attached,
and `BrowserWebviewItem` stays the same React component inside it. A naive implementation that calls
`mountReact` again on every `onUpdate`, disposes a slot before rendering its replacement, or rebuilds
the Fragment with a changing root key can create a new `<webview>`, repeat IPC registration, and leave
the old guest renderer alive. The slot helper's retained handle and the smoke check comparing the
actual webview element before/after tab reorder are load-bearing.

### 3. Adapter-host depth and direct-child selectors

`mountVanilla` adds a `display: contents` host around the semantic page-manager root. The current
React component returns its container `div` directly as a child of the caller, so a selector such as
`caller > .page-manager-root` would no longer match the same element after conversion even though the
box layout is unchanged. No current page-manager caller intentionally styles a class owned by these
components, but the implementation must scan parent styles and verify the browser `webview-area`
and app-page containers. Do not compensate by making the adapter host a real box or by adding a
duplicate wrapper.

### 4. Placeholder order is deliberately not array order

Both current implementations append only detached placeholders. They do not call `appendChild` on a
placeholder that already has a parent, so an array reorder does not move a live webview, iframe, or
canvas. The native reconciliation must preserve this deliberate asymmetry. A generic "reconcile DOM
children into incoming order" loop would be a regression even if the visible layout looks identical.

### 5. Props-snapshot consistency and deferred activation

`AppPageManager` creates all placeholders but only renders pages in `hasBeenActive`. A page can be
removed between state updates while its content callback would otherwise still be queued. Reconcile
the current ID set before invoking `renderPage`, delete closed IDs from the activation set, and never
call the app callback for a removed page. Capture `pageIds` and `renderPage` together from the same
props snapshot for the whole pass; never pair a new ID array with an older callback or invoke a
retained callback for an ID outside the current snapshot. This protects `Pages.tsx`'s
`findPage(pageId)` lookup from receiving a stale ID.

### 6. GroupContainer references and compare-mode transitions

`GroupContainer` stores direct references to the left and right placeholders and creates a splitter
that observes the manager root. It must be disposed before a changed group is replaced, but its
placeholders must not be detached/reparented merely because compare mode changes. Verify right-page
replacement, ungrouping, closing either side, toggling compare mode, and returning to grouped mode;
these are the transitions most likely to leave stale splitter listeners or grouped inline styles.

### 7. `renderPage` remains a React contract by design

This task does not convert `BrowserWebviewItem`, `BlankPageLinks`, `PageContent`, editors, or
secondary-view content. The native views therefore retain a direct React import for `ReactNode` and
the nested Fragment bridge. Do not narrow the callback to a DOM factory, add a generic slot
descriptor, or claim that this task removes all React roots. The later root flip still needs these
page subtrees to be mounted through the explicit adapter boundary.

### 8. Measurement covers both host consumers

Neither page-manager component owns the measurement interaction directly. The Epic D measurement for
this task must instead measure an active app-page switch and a browser-tab switch, recording the exact slot/root
count and the observer options/raw records for each host. The smoke pass must include many browser
tabs, not only the one-tab happy path, so the measurement covers placeholder creation, activation,
visibility changes, and retained webview subtrees. Do not fabricate a baseline after conversion or
substitute an unrelated menu interaction.

## Acceptance criteria

- [ ] `PageManager.tsx` and `AppPageManager.tsx` retain their existing public props and direct import
      paths, but are thin `mountVanilla` faces.
- [ ] Distinct native implementations exist without `.ts`/`.tsx` basename collisions, and each
      declares a public constructor compatible with `mountVanilla`.
- [ ] Neither page-manager implementation imports or calls `createPortal`; page content crosses the
      boundary only through one retained `mountReactHandle` per activated placeholder.
- [ ] `renderPage` remains a `ReactNode` callback and the Fragment bridge adds no DOM wrapper or
      public slot API.
- [ ] Each current page ID has one stable placeholder; new placeholders are attached with
      `appendChild`, existing placeholders are never moved during reorder/group/compare changes, and
      closed placeholders are detached immediately before their nested root is disposed by the
      generation-guarded deferred cleanup. A closed slot/placeholder is one-shot and never reused.
- [ ] Browser tab webviews remain the same DOM elements across tab reorder, active-tab changes,
      navigation state updates, grouping changes outside the browser host, and ordinary parent
      renders; no duplicate webview registration appears.
- [ ] `PageManager` preserves absolute full-size placeholder styles, the exact active
      `display=""` / inactive `display="none"` values, the root class, and rendering of every current
      browser page.
- [ ] `AppPageManager` preserves deferred activation, page removal, grouping, ungrouping, compare
      mode, splitter visibility/pausing/resizing, standalone style reset, and the exact visible
      `display="flex"` / hidden `display="none"` values.
- [ ] `GroupContainer` and `ImperativeSplitter` resources are disposed exactly once, including on
      manager unmount and group replacement; cleanup continues after an individual cleanup error and
      rethrows the first error.
- [ ] Removing a manager from the parent React tree detaches all page placeholders immediately and
      leaves no nested React roots, splitter element, observer, or page-manager listener after the
      generation-guarded deferred unmounts settle.
- [ ] Parent direct-child/empty/sibling selectors around both production call sites remain correct,
      and no new real layout wrapper is introduced by the adapter.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass.
- [ ] The pre-edit and post-edit measurements cover both active app-page switching and browser-tab
      switching with the same roots/options and raw slot/root record accounting; the results are
      recorded in `EPIC-058.md`.
- [ ] Live smoke checks cover many browser tabs, browser tab identity/loading/blank bookmarks, app
      page switching, grouping, compare mode, splitter drag/double-click, deferred activation, and
      closing pages.
- [ ] No unit-test harness, generic portal abstraction, secondary-view registry change, or editor
      conversion is introduced.

## Files changed summary

| File | Planned change |
|---|---|
| `src/renderer/components/page-manager/PageManager.tsx` | Keep the public prop surface; replace portal implementation with `mountVanilla` |
| `src/renderer/components/page-manager/AppPageManager.tsx` | Keep the public prop surface; replace portal implementation with `mountVanilla` |
| `src/renderer/components/page-manager/PageManagerView.ts` | New native browser page host and placeholder reconciliation |
| `src/renderer/components/page-manager/AppPageManagerView.ts` | New native app page host, deferred activation, grouping, and compare reconciliation |
| `src/renderer/components/page-manager/PageSlot.ts` | New folder-local placeholder and retained nested React-root ownership helper |
| `doc/architecture/pages-architecture.md` | Document direct placeholder ownership and the retained React page-island boundary |
| `doc/architecture/browser-editor.md` | Update the PageManager/webview stability description from portals to appendChild + mountReactHandle |
| `doc/architecture/key-files.md` | Add the page-manager host/view ownership entries |
| `doc/active-work.md` | Link US-1031 under EPIC-058 |
| `doc/epics/EPIC-058.md` | Link US-1031 in the task table; record its Rule 4 result at implementation time |

## Explicitly not changed

- `src/renderer/editors/browser/BrowserView.tsx` and `src/renderer/ui/app/Pages.tsx` — existing
  consumers keep their public component imports and props.
- `src/renderer/components/page-manager/GroupContainer.ts` and
  `src/renderer/components/page-manager/ImperativeSplitter.ts` — reuse the established imperative
  grouping/splitter behavior; change only if implementation reveals a concrete lifecycle defect.
- `src/renderer/ui/secondary-views/secondary-view-registry.ts` and its editor callers — the
  caller-owned portal compatibility contract belongs to US-1033 and Epic E.
- `src/renderer/editors/notebook/NotebookBody.tsx` and
  `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` — the other caller-owned portal hosts
  remain outside this task.
- `src/renderer/editors/browser/BrowserWebviewModel.ts` and `BrowserWebviewItem` behavior — the
  browser model/listener contract is preserved; only the host lifecycle changes.
- `src/renderer/renderer.tsx` / root bootstrap, `createRoot` ownership, and the application root flip
  — US-1036 owns the final root transition.
- Any unit-test framework or synthetic portal abstraction.

## Related

- [EPIC-058: De-React Epic D — Shell and shared components](../../epics/EPIC-058.md)
- [US-989: Boundary adapters](../US-989-boundary-adapters/README.md)
- [US-990: Storybook vanilla rendering](../US-990-storybook-vanilla-render/README.md)
- [US-973: Route document-body portals through one host](../US-973-portal-host/README.md)
- [US-1030: GitTree vanilla view](../US-1030-git-tree-vanilla/README.md)
- [Model/view pattern](../../standards/model-view-pattern.md)
- [Page architecture](../../architecture/pages-architecture.md)
- [Browser editor architecture](../../architecture/browser-editor.md)
- [De-React roadmap](../../de-react.md)
