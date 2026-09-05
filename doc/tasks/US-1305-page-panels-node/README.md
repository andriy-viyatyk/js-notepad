# US-1305 — `page.panels` node

Status: Planned  
Epic: [EPIC-085](../../epics/EPIC-085.md)

## Goal

Expose the page's live sidebar panel stack through `page.panels`: current bare panel
ids, labels, owning editor instance id and kind, expanded state, bare-id `expand`, the
flip-only `toggleSidebar` action, sidebar open state and width, and a sidebar-owned `elements`/
`highlight(name, message?)` surface. The implementation is a plan only; this task
document must not itself change runtime code or the existing dashboard entry.

## Background

EPIC-085 decision 5 assigns the sidebar API to the page, including its current panels,
owner and expanded metadata, `expand`/`close`, and open/width state. This plan
intentionally removes `close` after verifying the source-specific lifecycle rules
below; the epic's broad wording cannot define one safe page-level close operation.
(`doc/epics/EPIC-085.md:72-83`). Decision 7 assigns sidebar controls to
`page.panels`, while decision 8 makes the UI element contract authoritative and
requires missing `data-name` attributes to be added at the view
(`doc/epics/EPIC-085.md:85-104`).

The architecture uses “secondary views” as the conceptual name, but the current
PageModel stores editor models in `editors` and derives the contributors in
`panelEditors`; that getter filters `contributesPanels()` and orders Explorer
contributors first (`src/renderer/api/pages/PageModel.ts:208-221`). `IPageHost`
already exposes `panelEditors`, active-panel values, `secondaryViewsModel`, and
`expandPanel` (`src/renderer/api/pages/IPageHost.ts:18-39`). The node must consume
`panelEditors`, not assume a `secondaryViews[]` property exists.

The list is live. PageModel subscribes to each editor's `secondaryView` state and
reconciles contributors when it changes (`src/renderer/api/pages/PageModel.ts:264-285`,
`src/renderer/api/pages/PageModel.ts:393-417`). Main-editor navigation invokes
`beforeNavigateAway`, replaces the editor, and reconciles contributors
(`src/renderer/api/pages/PageModel.ts:421-484`); non-main editors receive
`onMainEditorChanged` (`src/renderer/api/pages/PageModel.ts:494-508`). The view is
also resynchronized from the current page contributors and nav state
(`src/renderer/ui/app/PageContentView.ts:94-129`). Therefore the node may not cache
panel records, owners, labels, or expanded state.

`SecondaryViewsModel` holds `open`, `width`, and `activePanel`, defaulting to open and
240px (`src/renderer/ui/secondary-views/SecondaryViewsModel.ts:7-45`). PageModel owns
the mutations, clamps width to 120px, and resolves active-panel ownership
(`src/renderer/api/pages/PageModel.ts:526-558`). When closed, PageContentView removes
the secondary-view DOM subtree (`src/renderer/ui/app/PageContentView.ts:109-138`),
so `isOpen` and `width` come from model state; element `visible` values must remain
DOM-derived. The model is lazy and null before first use
(`src/renderer/api/pages/PageModel.ts:655-667`), so the public node must report
`isOpen: false` and an absent/null `width` while it is null, rather than claiming the
default width has been measured.

There is an actual user gesture for toggling the whole secondary-view sidebar. The
page toolbar renders a `page-nav-panel` button and its click handler calls
`page.toggleNavigator(target.pipe, target.filePath)`
(`src/renderer/editors/base/PageToolbarView.ts:199-217`); BoardToolbar uses the same
PageModel method (`src/renderer/editors/board/BoardToolbar.ts:100-109`). However,
`toggleNavigator` also constructs and restores an Explorer when no Explorer/model
exists, or silently returns when it cannot derive a root path
(`src/renderer/editors/explorer/page-explorer.ts:58-87`). The node must not expose
that broader call. It will expose `toggleSidebar(): void`, which first requires at
least one current panel, then obtains the existing model or calls
`ensureSecondaryViewsModel()` and delegates only
`setSecondaryViewsState({ open: !open })`, matching the existing toggle branch
(`src/renderer/api/pages/PageModel.ts:674-686`). With no panels it throws a clear
error instead of creating an editor or silently doing nothing. `isOpen` and `width`
remain read-only observations.

### Panel identity and bare-id ambiguity

Rendered panel identity is `${editorId}::${panelId}`. `panelKey`, `parsePanelKey`,
`panelIdOf`, and `isCompositePanelKey` implement the distinction, with a bare key
representing the panel id without an editor owner
(`src/renderer/ui/secondary-views/panel-key.ts:1-39`). The renderer creates one
record per editor/panel pair, uses the composite key for the collapsible panel id,
and passes the bare id to the lazy view
(`src/renderer/ui/secondary-views/SecondaryViewsView.ts:150-221`).

The node methods accept bare ids only, as required by EPIC-085 and the architecture's
model-facing convention. PageModel's bare `expandPanel` path finds the first live
owner and stores a composite active key (`src/renderer/api/pages/PageModel.ts:560-581`);
the architecture documents bare model events/operations and composite rendered
identity (`doc/architecture/secondary-views.md:323-386`). Composite input will be
rejected by the node rather than made part of its public contract.

The ambiguity is real: every GitTree instance has a unique state id and contributes
the same bare `git-changes` panel (`src/renderer/editors/git-tree/GitTreeEditorModel.ts:65-74`,
`src/renderer/editors/git-tree/GitTreeEditorModel.ts:154-171`). Its navigation code
explicitly warns that multiple instances can otherwise remain, each contributing
that panel (`src/renderer/editors/git-tree/GitTreeEditorModel.ts:484-494`), and the
renderer gives each pair a distinct composite key
(`src/renderer/ui/secondary-views/SecondaryViewsView.ts:150-168`). For a duplicate
bare id, both node actions resolve the first rendered match in `panelEditors` order,
matching the existing renderer and PageModel behavior. Items expose their distinct
`editorId` values, and descriptor help must explain that a later duplicate cannot be
targeted until a future composite-id API is intentionally introduced.

Panel closing is deliberately not part of this node. The architecture documents two
different close semantics: a Pattern A Explorer model is disposed when its panel is
closed, while a Pattern B Archive model is also the main editor and must not be
disposed while it remains main (`doc/architecture/secondary-views.md:45-75`). The
Pattern B close path is only available when that editor's own rules allow it
(`doc/architecture/secondary-views.md:171-180`); Archive hides its close affordance
while it is main (`src/renderer/editors/archive/ArchiveSecondaryView.ts:117-130`).
The difference is observable in the source: Archive's user close button calls
`page.removeSecondaryView(archiveModel)` (`src/renderer/editors/archive/ArchiveSecondaryView.ts:146-150`),
whereas a generic `secondaryView` array mutation would not reproduce that lifecycle
and could orphan or half-detach a model. The close action belongs to each owning
editor's later surface (epics 3–5), where that editor knows whether close means hide
or dispose; the node descriptor must tell agents to use the panel's own header close
control.

### Labels, icons, and prefix registrations

The registry resolves exact ids before prefixes and provides labels, optional icon
overrides, and lazy view loaders (`src/renderer/ui/secondary-views/secondary-view-registry.ts:21-67`).
The renderer filters ids through `registry.has`, then uses a registry icon override or
the owning editor's DOM icon (`src/renderer/ui/secondary-views/SecondaryViewsView.ts:150-168`,
`src/renderer/ui/secondary-views/SecondaryViewsView.ts:228-244`). The public item
will expose a stable label, not an icon: the fallback is a rendered DOM node and the
requested contract does not require serializable icon data.

Board panels use the `board-secondary:` prefix
(`src/renderer/editors/board/board-secondary.ts:1-20`). The registry registration's
`Board View` label is explicitly “never shown”; BoardSecondaryView renders the
declaration title (`src/renderer/editors/register-editors.ts:99-107`,
`src/renderer/editors/board/BoardSecondaryView.ts:104-122`). The node must parse the
prefix, find the owning board model's current `secondaryViewDefs`, and report
`title ?? viewId ?? "View"`. Exact registered ids use the registry label. This lookup
must happen per read so runtime declaration changes remain live.

### AiVision and page API contract

AiVision descriptors have static `members`, element metadata, and descriptor-owned
`provide` for synthesized values (`src/shared/ai-vision/types.ts:57-86`). The resolver
asks `provide` before reading a real target member
(`src/shared/ai-vision/resolver.ts:124-146`). `createElements` provides a live
`elements` array with selectors/visibility and a validated `highlight` method
(`src/renderer/scripting/ai-vision/elements.ts:10-25`,
`src/renderer/scripting/ai-vision/elements.ts:36-81`); the `ui` namespace uses that
pattern (`src/renderer/scripting/ai-vision/namespaces/ui.ts:42-52`).

PageWrapper is the concrete wrapper for `IPage`; its current `PAGE_MEMBERS`, real
getters, and descriptor have no `panels` member or provider
(`src/renderer/scripting/api-wrapper/PageWrapper.ts:41-70`,
`src/renderer/scripting/api-wrapper/PageWrapper.ts:106-119`,
`src/renderer/scripting/api-wrapper/PageWrapper.ts:206-245`). `IPage` likewise has no
panels property (`src/renderer/api/types/page.d.ts:30-155`), while PageCollectionWrapper
returns PageWrapper objects (`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:50-55`,
`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:90-113`). Thus `panels`
must be a real PageWrapper member and an `IPage` type addition; its `elements` and
`highlight` are synthesized by the child node's `provide`. The separate AiRoot adds
AiVision without changing the script-facing app surface
(`src/renderer/scripting/ai-vision/root.ts:18-25`,
`src/renderer/scripting/api-wrapper/AppWrapper.ts:54-63`).

The editor-type copy plugin scans every `.d.ts` in the types directory
(`vite.renderer.config.ts:8-23`), so the new page-panels type file requires no build
configuration change.

### Sidebar element ownership

The contract lists `secondary-views-container`, `secondary-views-stack`, and
`secondary-views-splitter` under Page area
(`doc/architecture/ui-element-contract.md:126-136`). SecondaryViewsView passes these
exact names (`src/renderer/ui/secondary-views/SecondaryViewsView.ts:246-282`). Panel
writes its name as `data-name` and marks the root `data-component="panel"`
(`src/renderer/uikit/Panel/panel-style.ts:303-329`); the collapsible stack applies
its root name (`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:103-126`),
and Splitter applies its name (`src/renderer/uikit/Splitter/SplitterView.ts:69-83`).
All three rows already match the source, so no view or contract edit is planned.

The contract's named panel roots are editor-owned inspection surfaces
(`doc/architecture/ui-element-contract.md:138-155`) and the contract intentionally
keeps exhaustive editor internals out of the shell list
(`doc/architecture/ui-element-contract.md:157-166`). They belong to their owning
editor epics, not `page.panels.elements`; the page node owns only the sidebar shell,
stack, and splitter.

## Implementation Plan

### 1. Add public page-panels types

Create `src/renderer/api/types/page-panels.d.ts`:

~~~ts
export interface IPagePanel {
    readonly id: string;          // bare registered panel id
    readonly label: string;
    readonly editorId: string;    // owning EditorModel.id, instance id
    readonly editorKind: string; // owning EditorModel.editorId, kind/registry id
    readonly expanded: boolean;
}

export interface IPagePanels {
    readonly items: readonly IPagePanel[];
    /** Observation of the model's current sidebar visibility; not a setter. */
    readonly isOpen: boolean;
    /** Sidebar width, or null until the lazy sidebar model exists. */
    readonly width: number | null;
    expand(panelId: string): void;
    /** Show or hide the whole sidebar container; throws when the page has no panels. */
    toggleSidebar(): void;
}
~~~

Document in the declarations that `expand` accepts a bare id and duplicate ids use
first-rendered-owner resolution. Document that `isOpen` and `width` are observations,
that `width` is absent until the lazy sidebar model is created, and that closing is
performed by each panel's own header control. Add `readonly panels: IPagePanels` to
`src/renderer/api/types/page.d.ts`; keep the public values free of editor model and
DOM types.

Before:

~~~ts
    readonly data: Record<string, any>;
    readonly grouped: IPage;
~~~

After:

~~~ts
    readonly data: Record<string, any>;
    readonly panels: IPagePanels;
    readonly grouped: IPage;
~~~

### 2. Implement the live node

Create `src/renderer/scripting/ai-vision/page-panels.ts` with a `PagePanelsNode`
implementing `IAiVisible`. Give it a callback to the current `IPageHost`, rather than
capturing a page or panel array. On each `items` read, iterate `host.panelEditors` and
each editor's current `state.secondaryView`, filter with
`secondaryViewRegistry.has`, and emit one record per rendered pair in renderer order
(`src/renderer/ui/secondary-views/SecondaryViewsView.ts:150-168`). Map `model.id` to
`editorId`, `model.editorId` to `editorKind`, and the bare panel id to `id`; the two
editor identity meanings are verified by `EditorModel`
(`src/renderer/editors/base/EditorModel.ts:43-48`,
`src/renderer/editors/base/EditorModel.ts:206-208`). Resolve each label on the same
read, including the board-prefix declaration path described above.

Compute `expanded` against rendered identity: compare a composite active value with
`panelKey(model.id, panelId)`, and for a bare active value mark only the first matching
rendered item. This matches the renderer's active-key conversion and PageModel's
bare-id seed (`src/renderer/ui/secondary-views/SecondaryViewsView.ts:164-168`,
`src/renderer/api/pages/PageModel.ts:583-621`), avoiding both duplicate Git records
reporting expanded.

Read `isOpen` and `width` from `host.secondaryViewsModel?.state.get()`. If the model
is null, report `isOpen: false` and `width: null`, regardless of the model's eventual
defaults; do not claim a measured width before lazy creation
(`src/renderer/api/pages/PageModel.ts:655-667`). Do not use DOM presence for these
state values.

Implement `expand(panelId)` as a bare-id call to `host.expandPanel(panelId)`, after
rejecting composite input. This retains PageModel's first-owner resolution and
composite storage (`src/renderer/api/pages/PageModel.ts:560-581`). There is no
`close` method in this node. Do not mutate `secondaryView` or call
`removeSecondaryView`: the correct close path differs by owning editor and
registration pattern, and the panel header owns that decision. Descriptor help must
tell agents to use the panel's own header close control; closing belongs to the owning
editor surface in later editor epics.

Implement `toggleSidebar()` by checking the current live panel projection first and
throwing `Page has no sidebar panels to show.` when it is empty. Otherwise obtain
`host.secondaryViewsModel ?? host.ensureSecondaryViewsModel()`, read its current
`open`, and call `host.setSecondaryViewsState({ open: !open })`. Do not call
`host.toggleNavigator()`: its optional pipe/path arguments and Explorer-creating
branch are UI navigation context. The descriptor must say this action only shows or
hides the whole sidebar container, not an individual panel.

### 3. Add the node descriptor and elements

Define this declaration list in the node module:

~~~ts
const SIDEBAR_ELEMENTS = [
    { name: "secondary-views-container", purpose: "The page's sidebar panel container; present while the sidebar is open." },
    { name: "secondary-views-stack", purpose: "The collapsible stack of the page's sidebar panels." },
    { name: "secondary-views-splitter", purpose: "Resizes the page's sidebar." },
] as const;
~~~

Call `createElements(SIDEBAR_ELEMENTS, ui.highlightElement.bind(ui))`, append its
members to the node descriptor, use its `provide`, and retain the declarations as
descriptor metadata. This supplies live `elements` visibility/selectors and validated
`highlight(name, message?)` exactly as the existing UI namespace does
(`src/renderer/scripting/ai-vision/elements.ts:36-81`,
`src/renderer/scripting/ai-vision/namespaces/ui.ts:42-52`). Advertise `items`,
`isOpen`, `width`, `expand`, and `toggleSidebar`; only `expand` has a bare-id
signature, and its help must cover duplicate ids. State members must say they are observations, `width` is null
until the lazy model exists, and panel closing is performed by the panel header.
`elements` and `highlight` are descriptor-synthesized; `panels` itself is a real
PageWrapper property, consistent with resolver `provide` precedence
(`src/shared/ai-vision/resolver.ts:124-146`).

### 4. Expose the node from PageWrapper

In `src/renderer/scripting/api-wrapper/PageWrapper.ts`, import the node, add `panels`
to `PAGE_MEMBERS`, and add a real getter bound to the current `this.model.page`.
The callback must remain live after navigation/detachment; it must not cache panel
records. Extend the Page descriptor summary/help to mention live panels, bare-id
expansion, the observation-only `isOpen`/`width` state, `toggleSidebar`, and the
fact that closing is done through each panel's own header control.

Before:

~~~ts
    get data(): Record<string, unknown> {
        return this.model.scriptData;
    }

    get grouped(): PageWrapper {
~~~

After:

~~~ts
    get data(): Record<string, unknown> {
        return this.model.scriptData;
    }

    get panels(): PagePanelsNode {
        return new PagePanelsNode(() => this.model.page);
    }

    get grouped(): PageWrapper {
~~~

Do not add a top-level `panels` member to `AppWrapper` or `AiRoot`; the nested `IPage`
contract is the appropriate `.d.ts` change and the app surface remains otherwise
unchanged.

### 5. Keep view ownership unchanged

No changes are planned for `SecondaryViewsView`, the UIKit primitives, or
`doc/architecture/ui-element-contract.md`: the three required names are already
assigned and emitted as `data-name` by the view and primitives
(`src/renderer/ui/secondary-views/SecondaryViewsView.ts:246-282`,
`src/renderer/uikit/Panel/panel-style.ts:303-329`,
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:103-126`,
`src/renderer/uikit/Splitter/SplitterView.ts:69-83`). Panel-header controls are
editor-owned and are not needed for the model-backed node actions.

After implementation, update `doc/architecture/scripting.md` with the page-panels
script surface and `doc/architecture/secondary-views.md` with its live-list,
bare-id, duplicate-owner, and node-omits-close rules. Do not edit the existing
`doc/active-work.md` dashboard entry.

## Concerns

- Duplicate bare ids cannot target a later owner. First-rendered-owner resolution is
  deterministic and exposes the distinction through each item's `editorId`; the
  limitation must be in descriptor help.
- No uniform `close(panelId)` belongs here. Pattern A Explorer is disposed on close,
  while Pattern B Archive must not be disposed while it remains the main editor
  (`doc/architecture/secondary-views.md:45-75`). Archive's own close button uses
  `removeSecondaryView` (`src/renderer/editors/archive/ArchiveSecondaryView.ts:146-150`)
  only under its editor-specific affordance rules. Only the owning editor surface can
  choose the correct lifecycle, so agents must use the panel header close control.
- Board's generic registry label is not reported for prefix panels; declaration
  titles and runtime declaration changes are authoritative.
- A closed sidebar has no secondary-view DOM subtree, so only `elements[].visible`
  changes through DOM querying; `isOpen` comes from model state.
- `secondaryViewsModel` is lazy, so `width` is `null` before first use rather than
  the eventual 240px default. `isOpen`, `width`, and `toggleSidebar` are the
  whole-sidebar surface here; the first two are observations and the last performs
  only the existing open-state flip.
- The existing `toggleNavigator(page, pipe?, filePath?)` is intentionally not reused:
  its first branch flips the model, but its other branch derives a root, constructs/
  attaches/restores an Explorer, or silently returns when no root can be derived
  (`src/renderer/editors/explorer/page-explorer.ts:58-87`). `toggleSidebar` therefore
  requires current panels, uses the model flip only, and errors instead of creating
  an editor or silently doing nothing.
- `data-component="panel"` roots listed by the contract remain with their owning
  editor epics, avoiding duplicated page-level ownership.
- `IPage` is returned through `app.pages`, so its declaration must change; `AppWrapper`
  itself must not change its top-level `.d.ts` surface.

## Acceptance Criteria

- `page.panels` is a discoverable Page member with `items`, `isOpen`, `width`,
  `expand`, `toggleSidebar`, `elements`, and `highlight` in its descriptor.
- Every `items` read reflects current `panelEditors` and current `secondaryView` state,
  filters unregistered ids, reports bare id/label/owner id/owner kind, and marks only
  the correct rendered record expanded.
- `expand` accepts bare ids only, rejects composite ids, uses first-owner resolution
  for duplicates, and never caches ownership.
- No `close` action is exposed; descriptor help directs agents to the owning panel's
  header control, whose editor-specific lifecycle is implemented by later editor
  epics.
- Board-prefix labels use declaration title, then view id, then `"View"`, never the
  generic `Board View` registry label.
- `isOpen` and `width` reflect model state, report `false`/`null` when the lazy model
  is absent, and remain read-only; `toggleSidebar` performs only the existing whole-
  sidebar open-state flip and errors when no panels exist.
- `page.panels.elements` contains exactly the three contract names with live selectors
  and visibility, and `highlight` delegates through `createElements`.
- Inspectable editor panel roots remain excluded from this node.
- `IPage` and copied editor types expose `panels`, while `app`/`AppWrapper` retain
  their top-level surface. After implementation, `npm run typecheck`, `npm run lint`,
  and `npm run build-prod` pass.
- Manual checks cover Explorer, archive/search/board, navigation-driven changes, two
  Git-tree owners contributing `git-changes`, prefix-label fallbacks, sidebar state,
  and all three element/highlight names.

## Files Changed Summary

| File | Planned change |
| --- | --- |
| `src/renderer/api/types/page-panels.d.ts` | Add `IPagePanel` and `IPagePanels`. |
| `src/renderer/api/types/page.d.ts` | Add `IPage.panels`. |
| `src/renderer/scripting/ai-vision/page-panels.ts` | Add the live node, descriptor, projection, actions, prefix-label resolver, and elements provider. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Add the real `panels` member and descriptor metadata. |
| `doc/architecture/scripting.md` | Document the page-panels script surface. |
| `doc/architecture/secondary-views.md` | Cross-reference the node's live/bare-id behavior. |

Files verified and expected to need no changes:

- `src/renderer/api/pages/PageModel.ts` and `src/renderer/api/pages/IPageHost.ts` —
  existing live collection, state, and action contracts are sufficient.
- `src/renderer/ui/secondary-views/SecondaryViewsModel.ts`, `SecondaryViewsView.ts`,
  `secondary-view-registry.ts`, and `panel-key.ts` — consumed as-is for state,
  rendering, registry lookup, and composite identity.
- `src/renderer/editors/base/EditorModel.ts` — existing `secondaryView`, `id`, and
  `editorId` members provide the required owner data.
- `src/renderer/ui/app/PageContentView.ts` and the UIKit Panel, stack, and Splitter
  views — all required sidebar `data-name` assignments already exist.
- `src/shared/ai-vision/types.ts`, `src/shared/ai-vision/resolver.ts`, and
  `src/renderer/scripting/ai-vision/elements.ts` — existing descriptor/provide and
  elements protocols are sufficient.
- `vite.renderer.config.ts` — all `.d.ts` files are copied automatically.
- `doc/architecture/ui-element-contract.md`, `doc/active-work.md`, and
  `doc/epics/EPIC-085.md` — the contract and epic/dashboard entry already cover this
  task; no dashboard edit is authorized.
