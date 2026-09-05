# US-1311: Page-scoped elements, activation, and `page.tab`

Epic: [EPIC-086](../../epics/EPIC-086.md) - Task 2 of the page node redesign and the
text-and-preview editor family.

Status: Implemented

## Goal

Make every page-owned AI-vision element address its own page rather than the first matching
`data-name` in the renderer document. Add the page's tab as a first-class `page.tab` node, with
page identity in both tab and page-slot DOM roots, and make slot-hosted highlighting activate the
requested page before drawing.

The implementation must prove the contract with the existing Monaco text surface without taking
US-1312's full Monaco control inventory.

## Background

### Epic decisions and evidence

EPIC-086 decisions 3, 5, 6, and 8 govern this task:

| Decision | Source-verified result | Decision status |
|---|---|---|
| 3 - `page.tab` owns the tab and its controls | `PageTabView` owns the tab root, language button, close button, conditional sound button, active/pinned/modified state, and tab gestures. The existing `pages` API already owns `showPage`, `closePage`, `pinTab`/`unpinTab`, and `moveTab`; the new node will cross-reference those methods and add no duplicate actions. | Survives. `active` must mirror `PageTabView`, which treats both members of an active group as active. |
| 5 - identity comes from `data-page-id` on the slot and tab | `PageSlot` receives a stable page id and stores it as `PageSlot.id`, but currently emits only `data-name="page-slot"`. `PageTabsView` keys each `PageTabView` by `PageModel.id`; `PageTabView` currently emits `data-name="page-tab"` but no identity attribute. | Survives. |
| 6 - page highlights activate first | `PagesNavigationModel.showPage(pageId)` synchronously moves the page to the end of `ordered` and sends focus/show events. `AppPageManagerView` then applies `display: none` to inactive slots. Rendering/layout can still settle after that synchronous state notification, so the implementation must await at least a frame and verify the requested slot has a layout box before calling the overlay. | Survives with an explicit frame/layout wait. |
| 8 - elements belong to the node that explains them | `editorSwitches` owns `page-editor-switch`; `panels` owns sidebar controls and the page navigation toggle; editor facades own editor-specific controls; `page.tab` owns the tab root and tab controls. | Survives. |

Decision 7 is also relevant: this task must scope the host chrome only. It must not pretend that a
renderer-document selector can cross an HTML preview iframe or browser webview.

### Current resolver and the silent-success defect

`src/renderer/scripting/ai-vision/elements.ts` currently has three important behaviors:

1. `resolvedSelector()` uses the declaration's explicit selector or defaults to
   `[data-name="<name>"]`.
2. `isVisible()` runs `document.querySelectorAll(selector)` globally and considers any match with
   `offsetParent !== null` visible.
3. `highlight()` passes the same unscoped selector directly to `ui.highlightElement`.

The overlay in `assets/agent/ui-highlight.js` also queries the whole document. It reports
`found: true` when a hidden retained slot contains a match, but its `place()` function drops a
target with no rendered rectangle. That is the existing silent-success path: an inactive page can
appear found while nothing is ringed, and an unscoped selector can find another open page's
control.

The result contract already returns the selector in `IHighlightResult.selector`, and each
`IAiElement` already exposes a selector. The fix must make both values the same resolved,
page-scoped selector so an agent can reuse the selector without reconstructing page identity.

### DOM identity and retained slots

`src/renderer/components/page-manager/PageSlot.ts` constructs its root at line 17 and currently
sets only `this.element.dataset.name = "page-slot"`. Its constructor's `id` is readonly and is
passed back into the page view as `pageId` in `renderNative()`.

`src/renderer/components/page-manager/AppPageManagerView.ts` creates one `PageSlot` per id from
`props.pageIds`, attaches every slot, renders pages lazily after first activation, and controls
visibility with `slot.element.style.display`. Inactive slots remain in the DOM and are hidden.
`src/renderer/ui/app/PagesView.ts` supplies `projection.pages.map((page) => page.id)`, so these ids
are `PageModel.id` values, not editor-instance ids.

`src/renderer/ui/app/PageContentView.ts` resolves its page with
`pagesModel.query.findPage(this.props.pageId)`. It renders normal editor content under the slot,
and in compare mode renders `CompareEditor` only for the left page while the grouped slots still
retain their individual page ids.

`src/renderer/ui/tabs/PageTabsView.ts` uses `keyOf: (page) => page.id` and creates
`new PageTabView({ model: page, ... })`. `PageTabView.onMount()` sets `data-type="page-tab"` and
`data-name="page-tab"`; `updateView()` writes `data-active`, `data-modified`, `data-pinned`,
`data-grouped`, and the other state attributes. It must additionally write
`data-page-id=page.id`.

### Page identity across ordinary, grouped, and compare pages

`PageModel.id` is a stable UUID (or an explicitly restored/well-known id) and is the tab key and
cache key. `PageWrapper.id` is currently `this.model.page?.id ?? this.model.id`.

The identity chain is therefore:

```text
PagesView projection page.id
  -> AppPageManagerView pageIds
  -> PageSlot.id and PageSlot data-page-id
  -> PageContentView pageId

PageTabsView page.id
  -> PageTabView model.id and PageTabView data-page-id

PageWrapper model.page?.id ?? model.id
```

For a grouped pair, each side has its own `PageModel.id`, slot, tab, and wrapper id. The grouped
relationship is represented separately by `leftRight`/`rightLeft`; it must not collapse the two
identity attributes. In compare mode, `PageContentView` mounts the compare editor for the left
member while `AppPageManagerView` controls the grouped display; the left and right page wrappers
and tabs still report their respective ids. The implementation must preserve this one-to-one
mapping and include QA verification for both cases.

### Page-owned nodes and activation

`src/renderer/scripting/ai-vision/page-editor-switches.ts` declares the page toolbar's
`page-editor-switch` with a plain selector and contains a TODO for this task.
`src/renderer/scripting/ai-vision/page-panels.ts` declares the three sidebar controls with default
selectors, so they are also globally resolved today. Both nodes receive an `IPageHost` provider;
the host's `id` is the page identity needed for scoping.

`src/renderer/scripting/api-wrapper/PageWrapper.ts` exposes `editorSwitches` and `panels` through
the current page host. Its `language` member summary currently tells an agent to call
`ui.highlight("tab-language")`; that reference must move to `page.tab.highlight("tab-language")`.

`src/renderer/scripting/ai-vision/namespaces/settings.ts` is the activation precedent:
`highlightSettingsElement()` awaits `pagesModel.showSettingsPage()`, waits in a
`requestAnimationFrame` ladder for a mounted section with a non-zero rectangle, and only then
calls `ui.highlightElement`. `pagesModel.showPage()` is synchronous, unlike
`showSettingsPage()`, but the retained-slot layout still warrants the same frame-based discipline.

### Tab presentation and off-screen highlighting

`PageTabView` shows:

- `title`: the real page/projection title for every tab. A pinned tab intentionally hides the title
  text in its rendered root, but `page.tab.title` still reports the title data;
- `modified`: `projection.modified`, represented by `data-modified` and the modified icon;
- `pinned`: `page.pinned`, represented by `data-pinned`;
- `active`: `page.id === activeId || page.id === groupedId`, represented by `data-active`;
- a sound indicator when `anyTabAudible || pageMuted || Boolean(editor.toggleMuteAll)` is true.

The tab root, `tab-language`, `tab-close`, and conditional `tab-sound` are the four declarations
for `page.tab`. No tab action is added: `pages.showPage`, `pages.closePage`, `pages.pinTab`,
`pages.unpinTab`, and `pages.moveTab` already describe the user actions and are discoverable on
the `pages` node.

`ui.highlightElement()` itself delegates to `assets/agent/ui-highlight.js`. The asset queries the
document, calls `targets[0].scrollIntoView({ block: "nearest", inline: "nearest" })`, then places
the ring. That handles ordinary overflow but not the tab strip's sticky pinned inset reliably.
`PageTabsView.scrollToActive()` has an explicit comment that `scrollIntoView` with `inline:
"nearest"` can park a tab behind pinned tabs; its existing centered behavior clears that inset
before the later exact adjustment. `page.tab.highlight()` will therefore pre-scroll its resolved
tab/control with `scrollIntoView({ block: "nearest", inline: "center" })`, then call the
highlighter with `{ scroll: false }`. Without that option, the overlay's own unconditional
`inline: "nearest"` scroll would undo the centering. It will not call `showPage`; reading or
highlighting a non-active tab must not change the active page.

### Monaco proof surface

`src/renderer/scripting/api-wrapper/TextEditorFacade.ts` currently exposes operations but no
elements. The text chrome in `src/renderer/editors/base/TextChromeView.ts` already emits these
named toolbar controls:

| Name | Rendering condition / purpose |
|---|---|
| `text-compare-left` | Compare with the left grouped page when the compare action is available. |
| `text-run-script` | Run the current script, present for script languages. |
| `text-run-all-script` | Run all script content when a selection is present. |
| `text-show-resources` | Show extracted HTML resources when the language is `html`. |

These four are the minimal TextEditorFacade declaration. The shared page toolbar's
`page-editor-switch` belongs to `editorSwitches`, and `page-nav-panel` belongs to `panels`; the
script panel and the rest of Monaco's surface remain US-1312 work. `TextChromeView` also emits
`text-chrome-root` and `text-chrome-top`; record those as future US-1312 surface names, not as
additional controls for this task.

## Implementation Plan

### 1. Add and document page identity

- In `src/renderer/components/page-manager/PageSlot.ts`, set
  `this.element.dataset.pageId = id` immediately beside the existing `data-name` assignment.
  Keep `PageSlot.id`, the `pageId` view prop, and slot lifecycle unchanged.
- In `src/renderer/ui/tabs/PageTabView.ts`, set `this.root.dataset.pageId = page.id` in
  `updateView()` (and therefore on initial mount and any future model update). Do not remove
  `data-type`, `data-name`, or any state attribute.
- In `doc/architecture/ui-element-contract.md`, add a distinct identity section/row:

  ```md
  | `data-page-id` | Which `PageModel` owns this repeated root; identity, not element kind or state | `data-page-id="<page id>"` on `page-slot` and `page-tab` |
  ```

  Explain that it is combined with `data-name`, is the same value returned by `PageWrapper.id`,
  and remains distinct from `data-type` and state attributes such as `data-active`. Add the
  page-scoped selector examples for the slot and tab roots without changing the existing shell
  selector names.
- Verify in the implementation review and page QA that ordinary pages, grouped pairs, and compare
  pairs preserve the identity chain described above.

Before -> after:

```ts
// src/renderer/components/page-manager/PageSlot.ts
this.element.dataset.name = "page-slot";
applyStyle(this.element);

// planned
this.element.dataset.name = "page-slot";
this.element.dataset.pageId = id;
applyStyle(this.element);
```

```ts
// src/renderer/ui/tabs/PageTabView.ts
this.root.dataset.type = "page-tab";
this.root.dataset.name = "page-tab";

// planned in updateView(), using the live model
this.root.dataset.pageId = page.id;
```

### 2. Make `createElements` scope and prepare highlights

- In `src/renderer/scripting/ai-vision/elements.ts`, extend `CreateElementsOptions` with a
  page-scope selector, a list of declarations that match the scope root itself, and an optional
  asynchronous `beforeHighlight(selector)` hook. Keep all options optional so shell/settings
  callers retain their current selectors and behavior.
- Make `resolvedSelector()` apply the scope consistently for both `elements` and `highlight`:
  descendant declarations become
  `[data-page-id="<id>"] <declaration selector>`, while a root declaration such as
  `page-tab` becomes `[data-page-id="<id>"]<declaration selector>`.
  Prefix every selector branch if a declaration ever contains a comma-separated selector.
- Change the local `HighlightElement` callback type to accept the existing optional third argument:
  `(selector, message?, options?: IHighlightOptions)`. Import `IHighlightOptions` from
  `src/renderer/api/types/ui.d.ts` and add an optional `highlightOptions?: IHighlightOptions` to
  `CreateElementsOptions`. Pass that option object through to the highlighter after
  `beforeHighlight`; the tab node will set `{ scroll: false }`, while slot-hosted nodes leave it
  undefined and retain the default overlay scroll.
- Call `beforeHighlight` with the same resolved selector immediately before invoking the supplied
  highlighter. Do not activate from `elements`; `visible` must remain a literal current-layout
  observation using the existing `document.querySelectorAll` plus `offsetParent` test.
- Keep `IAiElement.selector` and the resolver's returned selector equal to this final scoped
  string. Preserve current unknown-name errors and the default unscoped behavior for shell,
  settings, and other non-page callers.

Before -> after:

```ts
// current
function resolvedSelector(declaration: IAiElementDeclaration): string {
    return declaration.selector ?? `[data-name="${declaration.name}"]`;
}

// planned shape
function resolvedSelector(
    declaration: IAiElementDeclaration,
    options: CreateElementsOptions,
): string {
    const selector = declaration.selector ?? `[data-name="${declaration.name}"]`;
    if (!options.scopeSelector) return selector;
    return options.scopeRootNames?.includes(declaration.name)
        ? `${options.scopeSelector}${selector}`
        : `${options.scopeSelector} ${selector}`;
}

// planned highlight call inside createElements
await beforeHighlight?.(selector);
return highlightElement(selector, message, options.highlightOptions);
```

The exact helper name is implementation detail, but the option must have this observable behavior;
the scope is an option on the existing helper rather than a second resolver so all returned
selectors and highlight paths share one implementation.

### 3. Scope page nodes and activate slot-hosted highlights

- Add a small shared helper beside the AI-vision element resolver (for example,
  `src/renderer/scripting/ai-vision/page-elements.ts`) for:
  - building `[data-page-id="<id>"]` safely;
  - calling `pagesModel.showPage(pageId)`;
  - awaiting a `requestAnimationFrame` ladder until the requested page-slot is rendered and has a
    non-zero client rectangle, with a bounded failure that reports the page did not become visible.
    The success condition is specifically the requested slot's non-zero rectangle, regardless of
    which grouped member is primary.
  The helper must not change `elements.visible` and must not open a sidebar or otherwise invent a
  control that the user did not ask to highlight.
- In `src/renderer/scripting/ai-vision/page-editor-switches.ts`, remove the US-1311 TODO and pass
  the owning host id to `createElements`. Use slot activation in `beforeHighlight`; retain
  `page-editor-switch` as the node's declaration and return its scoped selector.
- In `src/renderer/scripting/ai-vision/page-panels.ts`, add the page toolbar's existing
  `page-nav-panel` declaration (the control belongs to `panels` per EPIC-086 decision 4), retain
  the three sidebar declarations, and use the same page scope and activation hook. All four
  selectors must be descendants of the owning slot.
- Activation must be idempotent: highlighting the active page does not reorder it unnecessarily,
  and highlighting an inactive page activates exactly the requested page before the overlay call.
  If the target itself is conditional or absent, return the highlighter's normal `found: false`
  result after the slot wait rather than claiming success.
- For a grouped pair whose left member is active, `pagesModel.showPage(rightId)` moves the right
  page to the end of `ordered`, so the right page becomes the primary active id and the left page
  becomes its grouped partner. `AppPageManagerView` still computes one active group and displays
  both slots (outside compare mode); the helper must wait for the requested right slot's rectangle,
  not assume that the original left slot remains primary. In compare mode, the manager likewise
  decides each slot's display, but the wait remains per requested slot.

Before -> after:

```ts
// current in both page nodes
const elements = createElements(DECLARATIONS, ui.highlightElement.bind(ui));

// planned
const elements = createElements(DECLARATIONS, ui.highlightElement.bind(ui), {
    scopeSelector: pageScopeSelector(host.id),
    beforeHighlight: () => activatePageAndWaitForLayout(host.id),
});
```

### 4. Add `page.tab` and move per-tab ownership

- Add `src/renderer/scripting/ai-vision/page-tab.ts` with `PageTabNode`, following the descriptor
  pattern in `page-panels.ts`.
- Give it live read-only members `title`, `modified`, `pinned`, `active`, and
  `soundIndicator`. `active` must use the same active-plus-grouped calculation as
  `PageTabView`; `soundIndicator` must mirror `PageTabView.syncSoundButton()`'s
  `anyTabAudible || pageMuted || Boolean(toggleMuteAll)` predicate.
- Declare exactly these elements: `page-tab`, `tab-language`, `tab-close`, and `tab-sound`.
  Use the new scope option with `scopeRootNames: ["page-tab"]`, producing the root selector
  `[data-page-id="<id>"][data-name="page-tab"]` and descendant selectors for the three controls.
  `tab-sound` remains conditionally absent when the view does not create it.
- Supply a `beforeHighlight` hook that finds the resolved tab/control and centers it in the tab
  strip before calling `ui.highlightElement`. Pass `highlightOptions: { scroll: false }` to
  `createElements` so the overlay does not undo that centering with its own nearest scroll. Do not
  activate the page. This preserves literal `visible` values and handles an inactive tab that is
  horizontally outside the scrollport.
- `PageTabNode.title` must return the real `PageModel`/projection title even for pinned tabs. Its
  `$help` must explain that pinned tabs hide the title text on screen, so callers should use this
  data property rather than infer the title from the rendered text.
- In `src/renderer/scripting/api-wrapper/PageWrapper.ts`, add a `tab` getter, a `node: true`
  `PAGE_MEMBERS` entry, and page help describing the tab presentation and the cross-referenced
  `pages` actions. Update the `language` summary to direct "where is it?" questions to
  `page.tab.highlight("tab-language")`, not `ui.highlight`.
- In `src/renderer/api/types/page-tab.d.ts`, add the canonical `IPageTab` interface, including
  the five state properties, `elements`, and `highlight(name, message?)`.
- In `src/renderer/api/types/page.d.ts`, import `IPageTab` and add `readonly tab: IPageTab`.
  Never edit `assets/editor-types/`; the Vite editor-types plugin will regenerate it from the
  canonical source declarations.

Before -> after:

```ts
// current PageWrapper members
{ name: "language", kind: "property", writable: true, summary: "...ui.highlight(\"tab-language\")..." },
{ name: "editor", kind: "property", node: true, summary: "Current editor facade..." },

// planned
{ name: "language", kind: "property", writable: true, summary: "...page.tab.highlight(\"tab-language\")..." },
{ name: "tab", kind: "property", node: true, summary: "This page's tab-strip entry and its visible controls." },
{ name: "editor", kind: "property", node: true, summary: "Current editor facade..." },
```

### 5. Prove the scope on the minimal Monaco surface

- In `src/renderer/scripting/api-wrapper/TextEditorFacade.ts`, import the element helper and UI
  highlighter, declare only `text-compare-left`, `text-run-script`, `text-run-all-script`, and
  `text-show-resources`, and merge `elements.members`/`elements.provide` into the facade
  descriptor. Scope with `editor.page?.id` and use the same activate-and-layout hook as the page
  nodes.
- Keep `page-editor-switch` out of this facade because it is owned by `page.editorSwitches`, and
  keep `page-nav-panel` out because it is owned by `page.panels`. Do not add script-panel,
  encryption, find/replace, or other Monaco controls; those are US-1312.
- Add help text explaining that these are curated text-toolbar controls and that `visible` is the
  current page-layout state.

### 6. Remove shell per-tab entries and update pointers

- In `src/renderer/scripting/ai-vision/namespaces/ui.ts`, remove `page-tab`, `tab-language`,
  `tab-close`, and `tab-sound` from `HEADER_ELEMENTS`. Keep `page-tabs`,
  `page-tabs-wrapper`, both scroll arrows, and `page-tabs-add`; update the shell help sentence to
  say that an individual tab is reached through `pages[i].tab`.
- In `src/renderer/scripting/ai-vision/root.ts`, replace the common-path example
  `ui.highlight("tab-language")` with the page-owned `pages[0].tab.highlight(...)` form.
- In `qa/surfaces/shell.md`, update S.1/S.2 and any regression wording that assumes the active tab
  controls are in `ui.elements`. Keep shell QA for the strip and its arrows; move page identity,
  per-page visibility, activation, and `page.tab` checks to the new page surface below.

### 7. Add page-specific QA scenarios (Claude executes them)

Create `qa/surfaces/page.md` and link it from the surface QA index if required by that index. Do
not add automated tests or a test harness. Include these manual `call`-only scenarios:

1. **Two same-editor pages:** open two Monaco/script pages, obtain both page ids, and read each
   `pages[id].editor.elements` (plus `editorSwitches.elements`/`panels.elements`). Verify every
   returned selector contains the requested `[data-page-id="id"]`, the active page's controls are
   visible, and the inactive page's slot-hosted controls are not visible. Verify the tab node is
   independently addressable for both ids.
2. **Inactive-page highlight activates first:** with the second same-editor page inactive, call
   `pages[secondId].editor.highlight("text-run-script", ...)` (using a script-language page so the
   declared control exists). Verify the active page becomes `secondId`, the result is `found: true`,
   and the visible ring is on the second page's button, not the first page's matching button.
3. **Non-active tab remains visible:** leave one page inactive and read
   `pages[inactiveId].tab`. Verify its tab/root (and any rendered tab controls) reports visible,
   its editor elements report invisible, `tab.active` is false, and reading/highlighting the tab
   does not activate the page. Repeat with enough tabs to overflow the strip and verify tab
   highlighting scrolls the target into view without relying on `[data-active]`.

Also include a short identity check for a grouped pair and a compare pair: each `PageWrapper.id`,
slot `data-page-id`, and tab `data-page-id` must match that page's `PageModel.id`; grouping or
compare mode must not merge ids.

### 8. Generate types and perform the documentation-only verification pass

- Run the normal Vite/editor-types generation after changing canonical declarations so
  `assets/editor-types/page.d.ts` and `assets/editor-types/page-tab.d.ts` are synchronized. Do
  not hand-edit generated output.
- Verify that current help text and QA no longer present `ui.highlight("tab-language")` as the
  per-page path; the shell still documents the tab strip itself.
- Verify scoped selectors, active/inactive visibility, grouped/compare identity, and the actual
  overlay rectangle during the manual QA run. No unit tests or test harnesses are in scope.

## Concerns

All implementation concerns are resolved before coding:

- **Selector scope root versus descendant:** `createElements` will support both in one option so
  the tab root can resolve to `[data-page-id]` plus its own `data-name`, while controls and slot
  content resolve as descendants. This avoids a second resolver and guarantees that the returned
  selector is the selector used by highlighting.
- **Activation timing:** `showPage` is synchronous at the model layer, but the page manager's
  `display` update and editor mount are layout-sensitive. The bounded `requestAnimationFrame`
  wait on the page slot resolves this gap; `visible` itself never activates or waits.
- **Off-screen tabs:** the overlay uses `inline: "nearest"` by default, and the tab strip documents
  why nearest can hide a target behind sticky pinned tabs. The tab node's pre-highlight center
  scroll plus `{ scroll: false }` handles this without activating the target page.
- **Grouped activation:** `showPage(rightId)` reorders the right member to primary while the
  grouped pair remains displayed together. The layout wait checks the requested slot's rectangle,
  not a hard-coded primary/left slot.
- **Grouped and compare identity:** active grouping is state, not identity. Each side keeps its
  own slot/tab id; compare rendering may be left-owned, but it must not rewrite the right page's
  identity.
- **Conditional controls:** `tab-language`, `tab-sound`, `text-run-all-script`, and the other
  conditional declarations retain literal `visible`/`found` behavior. Missing conditional UI is
  not converted into a fabricated success.
- **Generated declarations:** only `src/renderer/api/types/` is edited. `assets/editor-types/`
  is build output and must be regenerated, never hand-edited.

No EPIC-086 decision 3, 5, 6, or 8 is overturned. Decisions 5 and 6 are tightened by the
verified distinction between synchronous state changes and post-frame layout; decision 3 is
tightened by mirroring the grouped tab's actual `data-active` semantics.

## Acceptance Criteria

- Every rendered `PageSlot` and `PageTabView` root has `data-page-id` equal to its
  `PageModel.id`; the architecture contract identifies it as an identity attribute distinct from
  `data-name`, `data-type`, and state attributes.
- `page.editorSwitches.elements`, `page.panels.elements`, the minimal Monaco editor elements, and
  `page.tab.elements` return resolved selectors scoped to the owning page. `elements[].selector`
  is exactly the selector used by `highlight`.
- With two same-kind pages open, each page reports its own controls' literal current visibility;
  the inactive retained slot is not reported visible merely because another page has the same
  `data-name`.
- Highlighting a slot-hosted page control activates that page, waits for layout, and then returns a
  visible overlay result. Highlighting a missing conditional control reports the normal not-found
  result.
- `page.tab` reports title, modified, pinned, grouped-aware active state, and sound-indicator
  presence. Its `title` is the real page title even when a pinned tab hides title text on screen.
  It exposes only the tab root, language, close, and sound elements; tab actions are
  cross-referenced to `pages` and not duplicated.
- Reading or highlighting a non-active `page.tab` does not activate the page, and an overflowed
  tab is scrolled into view before the overlay is drawn.
- `ui.elements` retains only shell strip controls for this area; current help and QA point at
  `page.tab.highlight("tab-language")` for an individual page tab.
- The Monaco proof declares only the four existing text-toolbar names listed above; US-1312's
  full surface remains untouched. `text-chrome-root` and `text-chrome-top` are recorded for
  US-1312 and are not added here.
- Manual QA covers two same-editor pages, inactive-page activation/highlighting, non-active tab
  visibility, overflow scrolling, and grouped/compare identity. No unit tests or harnesses are
  added.

## Files that need no changes

- `src/renderer/api/ui.ts` - `highlightElement` already delegates to the shared overlay; the
  page nodes prepare state before calling it.
- `src/renderer/api/types/ui.d.ts` - `IHighlightResult.selector`, `found`, and `count` already
  describe the required result.
- `src/renderer/ui/tabs/PageTabsView.ts` - its existing tab-strip scrolling evidence is used by
  the page-tab pre-scroll; no new tab action or model state is required.
- `src/renderer/ui/app/PagesView.ts` and `src/renderer/components/page-manager/AppPageManagerView.ts`
  - their retained-slot and page-id projection are the behavior being addressed, not behavior to
  redesign.
- `src/renderer/api/pages/PagesModel.ts`, `PagesNavigationModel.ts`, and `PageModel.ts` - use the
  existing `showPage` and stable page identity; no page-model API change is needed.
- `assets/editor-types/` - generated output only; regenerate from canonical declarations.

## Files Changed Summary

| Path | Planned change |
|---|---|
| `src/renderer/components/page-manager/PageSlot.ts` | Emit `data-page-id` from the stable slot id. |
| `src/renderer/ui/tabs/PageTabView.ts` | Emit `data-page-id` from the tab's `PageModel.id`. |
| `src/renderer/scripting/ai-vision/elements.ts` | Add shared page scoping, root/descendant resolution, and pre-highlight hook. |
| `src/renderer/scripting/ai-vision/page-elements.ts` | Add bounded page activation/layout-wait helpers. |
| `src/renderer/scripting/ai-vision/page-editor-switches.ts` | Scope its element and activate before highlight. |
| `src/renderer/scripting/ai-vision/page-panels.ts` | Add/scoped `page-nav-panel` and sidebar elements; activate before highlight. |
| `src/renderer/scripting/ai-vision/page-tab.ts` | Add `PageTabNode`, live tab state, elements, and non-activating highlight preparation. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Expose `tab`, update help, and cross-reference tab highlighting. |
| `src/renderer/scripting/api-wrapper/TextEditorFacade.ts` | Add the four minimal, page-scoped Monaco text-toolbar declarations. |
| `src/renderer/scripting/ai-vision/namespaces/ui.ts` | Remove per-tab declarations and retain shell strip declarations. |
| `src/renderer/scripting/ai-vision/root.ts` | Update the common per-tab highlight path. |
| `src/renderer/api/types/page.d.ts` | Add typed `readonly tab: IPageTab`. |
| `src/renderer/api/types/page-tab.d.ts` | Define the canonical `IPageTab` type. |
| `doc/architecture/ui-element-contract.md` | Document `data-page-id` as identity and page-scoped selectors. |
| `qa/surfaces/shell.md` | Remove per-tab ownership assumptions and update language-help scenarios. |
| `qa/surfaces/page.md` | Add manual page-scoping, activation, tab, overflow, and identity scenarios. |
| `assets/editor-types/*` | Regenerated by the Vite plugin only; never hand-edited. |
