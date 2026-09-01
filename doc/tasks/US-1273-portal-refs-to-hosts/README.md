# US-1273: Replace portal-ref vocabulary with host passing

## Status

**Status:** Planned  
**Priority:** Medium  
**Epic:** [EPIC-082 - React architecture removal at the call sites](../../epics/EPIC-082.md)  
**Started:** -  
**Completed:** -

## Goal

Remove the remaining React-era portal-ref vocabulary from §1.7 without inventing a new
rendering mechanism. The Category toolbar site already passes a DOM host and appends native
views into it, so it needs a host-oriented rename and ownership documentation; its three
link-editor ref fields and the rest of their unused `LinkEditorProps` interface have no live
callers after the native conversion and should be removed as stale contract surface.

## Background

### Scope and settled constraints

The current source is the post-US-1272 state. US-1272's `itemsView(host, initialProps)` factory,
owned item handle, projection gate, synchronous repaint, and list/tile reconciliation are already
in the working tree and are not to be redesigned here. This task must not touch
`src/renderer/uikit/`, `TreeProviderViewImpl`, or the Category model's synchronous behavior.

`components/tree-provider/` currently has no static import from `editors/`; that boundary must
remain unchanged. The Category editor continues to supply editor-specific behavior from
`src/renderer/editors/category/CategoryEditor.ts`. No new import is needed for this task.

The relevant native ownership convention is `PopoverViewProps.contentView?: (host) => IOwnedView`
in `src/renderer/uikit/Popover/PopoverView.ts:24-29`. `PopoverFloatingView.onMount()` claims the
factory result with `this.child(...)` and mounts it at `:92-100`; the factory, not PopoverView,
knows the concrete content view. `src/renderer/uikit/shared/overlayLayer.ts:1-35` supplies a
document-level host for global overlays. Neither file needs changing: the Category toolbar is a
page-toolbar slot, not a global overlay, and it already follows the simpler direct-append form of
host passing.

### Site 1 — Category `toolbarPortalRef`

The declaration is `src/renderer/components/tree-provider/CategoryViewModel.ts:91-115`:
`CategoryViewProps.toolbarPortalRef?: HTMLElement | null`, currently documented as a portal
target. The only implementation consumer is
`src/renderer/components/tree-provider/CategoryViewImpl.ts:372-401`, where
`updateToolbar()` reads the target, appends `inputView.root` and `viewModeButton.root` into it,
updates the native `InputView`/`IconButtonView` instances, and removes the controls through
`detachToolbarNodes()` at `:403-407`. Those controls are constructed and claimed by
`CategoryViewImpl.onMount()` at `:105-135`; the Category view therefore owns the controls, not the
caller-supplied host. The clear button is an `endSlot` of the input and follows the input root.

The sole producer is `src/renderer/editors/category/CategoryEditor.ts`. `syncSurface()` creates
the `searchPortal` container at `:153-187`; `pageToolbarProps()` passes that same node as
`rightContributions` at `:262-269`, and `categoryViewProps()` passes it as
`toolbarPortalRef` at `:272-285`. `PageToolbarView.setSlots()` uses `fillSlot()` to attach the
container to its right-toolbar host (`src/renderer/editors/base/PageToolbarView.ts:393-400`),
while CategoryView appends its controls inside the container. When the provider disappears,
CategoryEditor removes the container and updates the toolbar (`CategoryEditor.ts:166-187`).

This is already host passing in Persephone terms:

| Resource | Current owner | Required invariant |
|---|---|---|
| Search/view-mode/clear native views | `CategoryViewImpl` | Construct, claim, mount, update, and detach them there. |
| Search container element | `CategoryEditor`/`PageToolbarView` slot composition | Supply it to CategoryView; CategoryView must not dispose or remove the container itself. |
| Toolbar slot bookkeeping | `PageToolbarView`/`fillSlot` | Continue to attach and release the caller's contribution node. |

The honest change is therefore a rename/documentation fix, not a mechanism change. Rename the
prop to `toolbarHost`, rename the Category editor's private `searchPortal` to `searchHost`, and
rename the editor-local debug name `category-search-portal` to `category-search-host`. That
debug name is not listed in `assets/mcp-res-ui.md` and the guide explicitly gives no stable-name
promise to names inside editors, so this does not require a selector-contract update. Rename the
private `toolbarTarget` to `toolbarHost` as well, and document that it tracks the attached host;
keep the existing explicit append/remove operations and the existing `contentArm` behavior.

This naming is established house vocabulary, not a new convention:
`src/renderer/editors/git-tree/GitPanelSecondaryView.ts:34` already declares
`private toolbarHost: HTMLDivElement | undefined`
and appends into that host at `:280`. The mechanism here is likewise already host-passing: the
Category parent supplies an `HTMLElement`, and `CategoryViewImpl` appends its own already-owned
search, clear, and view-mode nodes into it at the current `:373-401` implementation, then
`detachToolbarNodes()` removes those nodes at `:403-407` on host changes or disposal. Nothing
about ownership or attachment needs to change; only the name and portal-oriented comments do.

Before:

```ts
// CategoryViewModel.ts
/** Portal target for search controls. When set, search renders there instead of own toolbar. */
toolbarPortalRef?: HTMLElement | null;

// CategoryEditor.ts
private searchPortal: HTMLDivElement | undefined;
name: "category-search-portal",
rightContributions: this.searchPortal,
toolbarPortalRef: this.searchPortal,
```

After:

```ts
// CategoryViewModel.ts
/** Caller-owned host for the Category search and view-mode controls. CategoryView appends and
 * detaches its controls here; it does not own or remove the host element. */
toolbarHost?: HTMLElement | null;

// CategoryEditor.ts
private searchHost: HTMLDivElement | undefined;
name: "category-search-host",
rightContributions: this.searchHost,
toolbarHost: this.searchHost,
```

In `CategoryViewImpl.ts`, the corresponding read and bookkeeping become:

```ts
// Before
private toolbarTarget: HTMLElement | null = null;
const desired = contentArm ? this.props.toolbarPortalRef ?? null : null;

// After
private toolbarHost: HTMLElement | null = null;
const desired = contentArm ? this.props.toolbarHost ?? null : null;
```

`updateToolbar()` must continue to remove the old controls before switching hosts, append the
controls only when the desired host exists, and leave the host lifecycle to CategoryEditor and
PageToolbarView. Do not replace this with `createPortal`, `PopoverView`, `getOverlayLayer()`, or a
new scheduler. Do not alter US-1272's `itemProjectionGate` ordering or its stamp-before-child-call
rule while renaming this unrelated channel.

### Site 2 — link-editor `toolbarRefFirst`, `toolbarRefLast`, `footerRefLast`

The three fields are declared only in
`src/renderer/editors/link-editor/linkTypes.ts:90-100`, each as
`HTMLDivElement | null` and each described as a portal target:

| Field | Historical target | Current source status |
|---|---|---|
| `toolbarRefFirst` | First toolbar section, breadcrumb | Declaration only; no current producer or consumer. |
| `toolbarRefLast` | Last toolbar section, actions/search | Declaration only; no current producer or consumer. |
| `footerRefLast` | Footer section, link count | Declaration only; no current producer or consumer. |

The repository-wide current-source trace finds no use of any of the three names beyond that
interface. In particular, `src/renderer/editors/link-editor/index.ts:375-437` constructs
`LinkBreadcrumbView`, `LinkActionView`, `LinkFooterView`, `LinkBodyView`, and `TextChromeView` as
native children. It passes the first three roots as `toolbarContributions`,
`rightToolbarContributions`, and `footerContributions` at `:387-412`, and updates those native
slots at `:415-426`. `TextChromeView` consumes those slot nodes with `fillSlot()` at
`src/renderer/editors/base/TextChromeView.ts:338-412`; there is no ref box or portal target in
that path. The same native link subviews are also directly owned by browser bookmark surfaces:
`src/renderer/editors/browser/BrowserView.ts:203-204` and
`src/renderer/editors/browser/BookmarksDrawer.ts:43`.

The old React `LinkView.tsx` (deleted by the native editor conversion) did consume these props
with `createPortal`, falling back to model fields named `editorToolbarRefFirst`,
`editorToolbarRefLast`, and `editorFooterRefLast`. Those old consumers and model fields are not
part of the current source. The current `LinkEditorProps` interface is not exported by the
link-editor module and has no current construction or import site. A grep for `LinkEditorProps`
across `src/`, `docs/`, and `src/renderer/api/types/` found no consumer beyond its declaration;
`swapLayout` likewise has no other hit, and `model` is only the interface's own field. The other
`linkTypes.ts` exports (`LinkItem`, `LinkViewMode`, `LinkEditorData`, and `ILinkSource`) are live,
so this is one dead export inside a live module. The entire interface, not merely its three ref
fields, is dead.

The three fields are not the same shape as Category's live host channel: they are three separate
legacy target slots for a deleted React component, whereas Category has one live host element
whose children are native views owned by CategoryViewImpl. The honest link-editor change is
therefore dead-contract removal/documentation cleanup, not a rename and not host creation.
Delete the entire `LinkEditorProps` interface and its now-unused `TextFileModel` import from
`linkTypes.ts`; leave all live `linkTypes.ts` exports and native slot composition unchanged.

Before:

```ts
export interface LinkEditorProps {
    model: TextFileModel;
    swapLayout?: boolean;
    /** Portal target for the first toolbar section (breadcrumb). When omitted, portal is not rendered. */
    toolbarRefFirst?: HTMLDivElement | null;
    /** Portal target for the last toolbar section (buttons, search). When omitted, portal is not rendered. */
    toolbarRefLast?: HTMLDivElement | null;
    /** Portal target for the footer section (link count). When omitted, portal is not rendered. */
    footerRefLast?: HTMLDivElement | null;
}
```

After:

```ts
// No LinkEditorProps interface remains; the live linkTypes.ts exports stay in place.
```

No `toolbarHost`/`footerHost` replacement is needed because there is no current caller that needs
one. If a future embedding needs link chrome in a different location, it should
compose the existing native view roots through `TextChromeView`/`PageToolbarView` slot content,
or introduce a concrete factory at that future call site; it must not resurrect the deleted ref
contract.

## Implementation Plan

1. Reconfirm the inventory before editing. Verify that `CategoryViewImpl` has no static
   `editors/` import, that CategoryView's toolbar prop has only the CategoryEditor producer and
   CategoryViewImpl consumer, and that each link-editor ref name has no current occurrence outside
   `linkTypes.ts`. Do not change `TreeProviderViewImpl.ts`, its six consumers, or the US-1272 item
   factory contract.

2. Apply the Category host vocabulary fix in
   `src/renderer/components/tree-provider/CategoryViewModel.ts`,
   `src/renderer/components/tree-provider/CategoryViewImpl.ts`, and
   `src/renderer/editors/category/CategoryEditor.ts`:
   rename `toolbarPortalRef` → `toolbarHost`, `toolbarTarget` → `toolbarHost`,
   `searchPortal` → `searchHost`, and `category-search-portal` → `category-search-host`.
   Update all null/host comparisons, toolbar props, and comments. Preserve the current
   `updateToolbar()`/`detachToolbarNodes()` attach-detach behavior, including the fact that the
   clear button is nested through the input's `endSlot` and that the caller-owned host is never
   disposed by CategoryViewImpl.

3. Delete the entire dead `LinkEditorProps` interface and its now-unused `TextFileModel` import
   from `src/renderer/editors/link-editor/linkTypes.ts`, after confirming there is no
   `LinkEditorProps` consumer in `src/`, `docs/`, or `src/renderer/api/types/` and no other
   `swapLayout` use. This removes `toolbarRefFirst`, `toolbarRefLast`, and `footerRefLast` along
   with the dead `model` and `swapLayout` fields. Do not change `LinkEditorView`, `LinkBodyView`, the breadcrumb/action/footer views,
   `TextChromeView`, or the browser bookmark compositions; their native slot ownership is the
   settled replacement for the deleted React portal path.

4. Check ownership and import invariants. The Category editor owns the search host; CategoryViewImpl
   owns its three control views and only removes their roots. `PageToolbarView` remains responsible
   for the contribution slot. The link editor must have no `*Ref*` toolbar/footer fields and must
   still pass native roots through `TextChromeView`. `components/tree-provider/` must still import
   zero editor code. Do not touch `src/renderer/uikit/`, `overlayLayer.ts`, or `PopoverView.ts`.

5. Run structural checks applicable to the implementation (typecheck, lint, and the applicable
   production build). Do not add unit tests or test harnesses. Inspect the final diff for stale
   `toolbarPortalRef`, `searchPortal`, `toolbarRefFirst`, `toolbarRefLast`, `footerRefLast`, and
   portal-target comments in the live source path; historical task/epic/roadmap references may
   continue to name the §1.7 site for tracking.

6. Verify the Category editor in the running app. Reach a host-backed Category page by opening a
   real local folder in the Explorer, keeping its Explorer panel on the page, then clicking a
   normal directory row. `ExplorerSecondaryView.handleItemClick()` sends the encoded
   `tree-category://` URL with `sourceId: "explorer"` (`src/renderer/editors/explorer/ExplorerSecondaryView.ts:248-259`);
   `FileTreeProvider.getNavigationUrl()` encodes normal directories at
   `src/renderer/content/tree-providers/FileTreeProvider.ts:137-148`; and
   `CategoryEditorView.syncSurface()` finds that surviving Explorer provider through
   `findTreeProviderHost(page.panelEditors, link.type, link.url)` at
   `src/renderer/editors/category/CategoryEditor.ts:153-187`. Do not reach the page with a
   source-less direct URL, because then the Category editor intentionally has no provider or
   toolbar host.

7. On that page, scope every DOM assertion to the visible Category editor instance (`offsetParent
   !== null`) because inactive pages retain hidden `category-editor-root` elements. Confirm the
   search input, clear button, and view-mode button are attached to the page toolbar and remain
   attached after loading, refresh, provider/category navigation, empty results, and clearing the
   search. Confirm search filtering and clearing work, and switch repeatedly between list and all
   tile modes while scrolled; the view-mode switch must work and retain the existing reset-to-row-
   zero behavior on mode changes.

8. Complete the deferred US-1272 checks now that the toolbar host is reachable: verify tile
   rendering, tile image/favicon repaint, scroll preservation across ordinary updates, and real
   drag-hover onto folder rows. Cover folder-row and whitespace enter/leave/clear/drop behavior,
   with no stale child or grid callback after changing category or disposing the editor. This is a
   manual pointer/drag verification; a green build is not evidence for it.

9. Smoke-test the native link editor and its embedded browser bookmark surfaces for unchanged
   breadcrumb, action/search, and footer placement. The expected result is no new host mechanism
   and no behavior change: native roots continue to flow through `TextChromeView` slots.

## Concerns

### This is intentionally two different outcomes

The Category site is a rename/documentation fix. Its mechanism already is “append child roots to a
caller-supplied host,” and `detachToolbarNodes()` already supplies the explicit teardown required
by the native lifecycle. A new factory, Popover, overlay-layer entry, or scheduler would add
indirection without changing ownership.

The link-editor site is stale-contract removal/documentation cleanup. The three fields and their
containing `LinkEditorProps` interface once described separate React portal targets, but current
source has no producers or consumers. Adding three hosts would manufacture an API for a use case
the native composition no longer has.

### Host lifecycle and re-entrancy

CategoryEditor may create the host before PageToolbarView attaches it. That is valid: native DOM
nodes can be appended to a detached host, and `fillSlot()` later attaches the host node. On a host
change, remove only CategoryViewImpl's control roots before adopting the new host; never remove the
host itself. Keep the existing `inert` guard and synchronous update ordering.

No deferral is being converted in this task. Carry forward US-1272's rule to stamp state/gate
snapshots before invoking child code, but do not add `queueMicrotask`, `schedule.raf`, timeout, or
delayer work to a vocabulary-only change. Existing sanctioned microtask/coalescing patterns outside
these sites are out of scope.

The other accumulated state lessons are likewise not new work here: the US-1272 gate remains
primed after its first pump because `depsChanged(undefined, next)` is true; no selector is being
changed to a raw array or fresh signature; no liveness flag is being removed; and no existing
coalesced microtask is being converted. If a future edit causes a synchronous child callback to
re-enter the Category path, it must preserve the established stamp-before-invoking order.

### Selector and verification traps

`category-search-host` is an editor-local debug `data-name`, not a selector promised by the UI guide;
the stable verification target is the visible `[data-name="category-toolbar"]` and its attached
native controls. Any runtime query for a Category root or control must filter to the instance whose
`offsetParent` is non-null, since hidden inactive pages remain in the DOM.

### Import and scope boundary

The Category prop rename must not cause a static editor import in
`src/renderer/components/tree-provider/`. The link-editor cleanup must not reach back into deleted
React files or alter the current `TextChromeView` slot contract. No UIKit file, unit test, or test
harness is part of this task.

## Acceptance Criteria

- [ ] `CategoryViewProps.toolbarPortalRef` is renamed to `toolbarHost` with a comment that clearly
  states the caller owns the host and `CategoryViewImpl` owns/attaches/detaches its controls.
- [ ] `CategoryViewImpl` and `CategoryEditor` use host vocabulary consistently, while the existing
  explicit append/remove behavior, clear-button nesting, content-arm visibility, and toolbar slot
  lifecycle remain unchanged.
- [ ] The Category toolbar change is classified as a rename/documentation fix: no React portal,
  Popover, overlay-layer, factory, or scheduler mechanism is introduced.
- [ ] The entire dead `LinkEditorProps` interface is deleted from `linkTypes.ts`, including its
  unreferenced `model` and `swapLayout` fields, the three portal-ref fields, and the now-unused
  `TextFileModel` import; the no-consumer check covers `src/`, `docs/`, and
  `src/renderer/api/types/`, while live `linkTypes.ts` exports remain intact.
- [ ] No current link-editor producer or consumer is replaced with an invented host API, and
  native `TextChromeView` slot composition remains intact.
- [ ] `components/tree-provider/` still imports zero editor code, and
  `TreeProviderViewImpl.ts`, its props contract, and all six consumers are untouched.
- [ ] The running Category editor is reached through an Explorer-backed `tree-category://` page
  with a surviving provider host; the visible instance has reachable, functional search, clear,
  and view-mode controls in the page toolbar.
- [ ] Search filtering and clearing work; switching between list and every tile mode works, with
  the established mode-change scroll reset and no duplicate toolbar controls.
- [ ] The deferred US-1272 tile arm, image/favicon repaint, scroll preservation, and real
  drag-hover behavior are verified. Folder-row and whitespace enter/leave/clear/drop feedback is
  immediate and correct, and no stale grid/child callback appears after navigation or disposal.
- [ ] The standalone Link editor and browser bookmark embedding retain their breadcrumb,
  action/search, body, and footer placement through native slot composition.
- [ ] Typecheck, lint, and the applicable production build pass; no unit tests or test harnesses
  are added.
- [ ] `doc/active-work.md` and the EPIC-082 task table link to this README.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Rename the live Category toolbar target to `toolbarHost` and document caller-host/native-child ownership. | Implementation |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Rename toolbar host bookkeeping and preserve the existing explicit native attach/detach path. | Implementation |
| `src/renderer/editors/category/CategoryEditor.ts` | Rename the caller-owned search container and its editor-local debug name; pass `toolbarHost`. | Implementation |
| `src/renderer/editors/link-editor/linkTypes.ts` | Delete the dead `LinkEditorProps` interface and its now-unused `TextFileModel` import; retain live exports. | Implementation |
| `doc/active-work.md` | Link the existing US-1273 dashboard entry to this task document. | Dashboard link |
| `doc/epics/EPIC-082.md` | Link the existing US-1273 row to this task document. | Epic link |
| `doc/tasks/US-1273-portal-refs-to-hosts/README.md` | Record verified source findings, the two different design decisions, implementation plan, concerns, and running-app acceptance checks. | This task document |

Files that need **no changes** in US-1273:

- `src/renderer/uikit/Popover/PopoverView.ts`, `src/renderer/uikit/shared/overlayLayer.ts`, and
  all of `src/renderer/uikit/` — architectural references only; the toolbar is not a global overlay.
- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` and all six of its consumers —
  the shared tree props contract and import boundary are outside this task.
- `src/renderer/components/tree-provider/index.ts` — it re-exports `CategoryViewProps`, so the
  prop rename flows through without an export-list change.
- `src/renderer/editors/base/PageToolbarView.ts`, `TextChromeView.ts`, and `fill-slot.ts` — their
  existing host/slot behavior is the mechanism being retained.
- `src/renderer/editors/link-editor/index.ts`, `LinkBody.ts`, `LinksListView.ts`,
  `LinksTilesView.ts`, `LinkTreeProvider.ts`, and the browser bookmark compositions — current
  native slot/view ownership is already correct and has no ref-prop consumers.
- `src/renderer/core/utils/scheduling.ts`, `src/renderer/core/state/model.ts`, and
  `src/renderer/core/state/state.ts` — no scheduling or selector behavior is being changed.
- US-1272's Category item factory/handle files beyond the required toolbar prop rename — their
  ownership and synchronous projection behavior are settled precedent, not this task's redesign.
- Unit tests and test harnesses — explicitly excluded by the task.
