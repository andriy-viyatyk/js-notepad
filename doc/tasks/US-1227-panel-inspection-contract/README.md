# US-1227 — Restore a stable Panel inspection contract

**Status:** Open · **Epic:** [EPIC-078](../../epics/EPIC-078.md)

This is an investigation and planning document. It does not implement the fix, add tests, or
change the dashboard.

## Goal

Give the app-specific Panel roots a stable component marker and data-name addressing contract
without changing their current custom data-type values, CSS selectors, or visual behavior.

## Background

The governing UI contract assigns data-name as the addressing handle and data-type as a
load-bearing structural marker; adding a name must not remove or rename an existing type
(doc/architecture/ui-element-contract.md:7-20, :22-44). The contract also states that adding
a data-name is safe, while data-type and data-part must be preserved
(doc/architecture/ui-element-contract.md:42-55).

The eight call sites below are the historical Panel call sites in the pre-native-conversion
source snapshot used by US-1003. They are enumerated precisely because current HEAD has converted
the JSX away; the corresponding native roots are listed after the census. The old custom marker
was not a PanelElementAttributes prop: PanelElementAttributes has no data-type field
(src/renderer/uikit/Panel/panel-style.ts:68-88), while applyPanelAttributes sets
element.dataset.type = "panel" unconditionally before it applies the
other data values (src/renderer/uikit/Panel/panel-style.ts:303-325). The override happened
after construction in each caller by assigning root.dataset.type = ...; current native examples
are src/renderer/components/file-grid/FileGridView.ts:23,
src/renderer/components/tree-provider/CategoryViewImpl.ts:172, and
src/renderer/components/tree-provider/TreeProviderViewImpl.ts:67, while the
historical eight are listed below.

| Historical Panel call site | Custom data-type | name in the historical call |
|---|---|---|
| src/renderer/components/tree-provider/TreeProviderView.tsx:282 | tree-provider-error | omitted |
| src/renderer/components/tree-provider/TreeProviderView.tsx:290 | tree-provider-empty | omitted |
| src/renderer/components/tree-provider/TreeProviderView.tsx:333 | tpv-search | tree-provider-search |
| src/renderer/editors/board-info/BoardInfoEditorView.tsx:74 | board-info-editor | omitted |
| src/renderer/editors/tools-hub/SearchBoardsTab.tsx:87 | search-boards-tab | omitted |
| src/renderer/editors/tools-hub/ToolsHubView.tsx:20 | tools-hub | omitted |
| src/renderer/editors/toolset/ToolsetEditorView.tsx:46 | toolset-editor | omitted |
| src/renderer/ui/sidebar/ScriptLibraryPanel.tsx:68 | script-library-panel | sidebar-script-library |

Thus the six historical call sites that omit name are TreeProviderView.tsx:282,
TreeProviderView.tsx:290, BoardInfoEditorView.tsx:74, SearchBoardsTab.tsx:87,
ToolsHubView.tsx:20, and ToolsetEditorView.tsx:46. The exact eight-site count and the six-name
omission are also the compatibility gap recorded by the epic
(doc/epics/EPIC-078.md:177-182).

### Current-head reconciliation

There are no Panel JSX tags in current HEAD: the eight logical roots are now native elements. The
current mapping is:

| Historical root | Current native root | Current state |
|---|---|---|
| TreeProvider error / empty | src/renderer/components/tree-provider/TreeProviderViewImpl.ts:183-203 | A shared panel-root is assigned tree-provider-error or tree-provider-empty; it has no data-name. |
| TreeProvider search | src/renderer/components/tree-provider/TreeProviderViewImpl.ts:211-219 | It has both data-type and data-name tree-provider-search. |
| Board info | src/renderer/editors/board-info/BoardInfoEditorView.ts:82-92 | createPanelElement is overridden to board-info-editor; it has no data-name. |
| Search boards | src/renderer/editors/tools-hub/SearchBoardsTab.ts:57-60 | createPanelElement is overridden to search-boards-tab; it has no data-name. |
| Tools hub | src/renderer/editors/tools-hub/ToolsHubView.ts:32-37 | createPanelElement is overridden to tools-hub; it has no data-name. |
| Toolset | src/renderer/editors/toolset/ToolsetEditorView.ts:61-70 | Already repaired: createPanelElement emits the canonical panel type and toolset-editor name. |
| Script library | src/renderer/ui/sidebar/ScriptLibraryPanelView.ts:39-46 | It has data-name sidebar-script-library and the custom script-library-panel type. |

The current unresolved logical-root count is therefore seven, not eight: Toolset was already
repaired, while the historical census remains eight. The current missing names are the two
TreeProvider message states, Board info, Search boards, and Tools hub; the historical Toolset
omission is the sixth omission but no longer an open current-head defect
(src/renderer/editors/toolset/ToolsetEditorView.ts:61-69).

createPanelElement delegates to applyPanelAttributes, which currently emits data-type="panel",
applies the panel-root class, and then appends children
(src/renderer/uikit/Panel/panel-style.ts:303-356). The custom caller assignments therefore
explain why these roots do not remain addressable as [data-type="panel"].

The `tileScope` and `footer` elements in `src/renderer/components/tree-provider/CategoryViewImpl.ts`
(:178 and :185) are deliberate non-targets. Although they use `panel-root` styling and stable
`data-name` values, they are internal CategoryView layout/focus helpers with app-specific
`data-type` values, not independent logical Panel roots from the eight-site inspection contract.
They therefore do not receive `data-component="panel"`; adding that marker would broaden the
addressing contract to implementation scaffolding without serving a separate panel inspection
target.

## Reader audit

### Automation and highlighting

browser_snapshot obtains and formats the accessibility tree
(src/renderer/automation/commands.ts:157-166, :219-220). Its formatter emits role,
accessible name, selected accessibility properties, and a backend ref, not arbitrary data-*
attributes (src/renderer/automation/snapshot.ts:258-303). The marker is therefore a DOM
selector/instrumentation contract; it will not add a line to the textual snapshot merely by
existing.

Selector-based browser actions resolve through document.querySelector, as shown by browserClick
(src/renderer/automation/commands.ts:223-233), and the UI highlight API forwards its selector to
the packaged highlighter (src/renderer/api/ui.ts:121-128). The highlighter uses
document.querySelectorAll (assets/agent/ui-highlight.js:255-282). A stable additive component
marker is consequently usable by both DOM-driven automation and app.ui.highlightElement, even
though the snapshot formatter does not print it.

The requested selector audit found no Panel-root selectors under qa/, docs/, assets/, or
boards-assets/. The relevant application selectors are the canonical Panel selector in
src/renderer/editors/base/ContentHostFooter.css:2-22, the canonical Panel selector in
src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css:51-60, and the custom
TreeProvider selectors in src/renderer/components/tree-provider/TreeProviderView.css:11-18.

### Panel CSS and the US-1223 boundary

Panel.css styles panel-root and its data-direction, background, border, state, and sizing
attributes (src/renderer/uikit/Panel/Panel.css:1-66). It also contains the
data-part="react-slot" emptiness selector at line 68
(src/renderer/uikit/Panel/Panel.css:67-68). That selector belongs to US-1223 and is explicitly
out of scope here: this task must not rename, remove, or otherwise change it. Adding a
data-component attribute does not match or alter any current Panel.css rule
(src/renderer/uikit/Panel/Panel.css:1-88).

## Recommendation

Recommend the separate-marker option: add data-component="panel" to the Panel-element factory
alongside its canonical data-type="panel", and add the same marker explicitly to the two
TreeProvider message roots that are created without the factory. Add stable name values for the
five currently unnamed logical roots, while retaining every existing app-specific data-type.
Use these names:

| Current root | data-name to add or retain |
|---|---|
| TreeProvider error | tree-provider-error |
| TreeProvider empty | tree-provider-empty |
| TreeProvider search | retain tree-provider-search |
| Board info | board-info-editor |
| Search boards | search-boards-tab |
| Tools hub | tools-hub |
| Toolset | retain toolset-editor |
| Script library | retain sidebar-script-library |

The stable inspection query becomes [data-component="panel"][data-name="..."]; the existing
custom data-type remains available to component-specific CSS. This is safer than repairing
callers to force data-type="panel": TreeProviderView.css actively selects
tree-provider-search, tree-provider-error, and tree-provider-empty for padding
(src/renderer/components/tree-provider/TreeProviderView.css:11-18). Replacing those types would
require a coordinated selector migration and creates unnecessary visual-regression risk. The
canonical factory marker and the additive names do not participate in existing Panel CSS, so the
intended visual change is **nothing** (src/renderer/uikit/Panel/Panel.css:1-68).

### Before → after shape

~~~ts
// Before — current custom root shape, e.g. SearchBoardsTab.ts:57-60
const root = createPanelElement({ direction: "column", flex: 1, minHeight: 0 });
root.dataset.type = "search-boards-tab";
~~~

~~~ts
// After — intended additive contract; preserve the existing data-type
const root = createPanelElement({
    name: "search-boards-tab",
    direction: "column",
    flex: 1,
    minHeight: 0,
});
// The factory also emits data-component="panel"; custom data-type remains unchanged.
~~~

For the manually-created TreeProvider message root, the after shape must set
dataset.component = "panel" and the matching dataset.name beside the existing custom type
(src/renderer/components/tree-provider/TreeProviderViewImpl.ts:183-203). The factory change
must be centralized in applyPanelAttributes, not expressed by changing Panel.css
(src/renderer/uikit/Panel/panel-style.ts:303-347; src/renderer/uikit/Panel/Panel.css:1-88).

## Concerns

- data-type is load-bearing and currently carries app-specific styling meaning in TreeProvider;
  preserving it is mandatory (doc/architecture/ui-element-contract.md:42-44;
  src/renderer/components/tree-provider/TreeProviderView.css:11-18).
- data-name is an addressing/debug handle rather than a uniqueness guarantee; repeated roots
  would still be disambiguated by state or a more specific selector when needed
  (doc/architecture/ui-element-contract.md:33-40).
- The new data-component value is an additive proposal for this task, not a replacement for
  data-type, data-part, or any existing custom selector. No data-part="react-slot" change is
  permitted because that selector is owned by US-1223 (src/renderer/uikit/Panel/Panel.css:67-68).
- The current browser_snapshot text does not expose arbitrary data attributes, so post-change
  verification must inspect the DOM selector contract in addition to exercising the snapshot path;
  no unit test or test harness is proposed (src/renderer/automation/snapshot.ts:258-303).

## Acceptance criteria

- The eight historical call sites remain accounted for, with the six historical name omissions
  recorded above; current-head status distinguishes the already-repaired Toolset root from the
  seven unresolved logical roots (src/renderer/editors/toolset/ToolsetEditorView.ts:61-69).
- Panel roots expose data-component="panel" additively, and all eight logical roots have the
  listed stable data-name values; existing custom data-type values remain unchanged
  (src/renderer/uikit/Panel/panel-style.ts:303-356; src/renderer/components/tree-provider/TreeProviderViewImpl.ts:183-219).
- Existing TreeProvider custom selectors continue to match, and no selector in Panel.css is
  changed (src/renderer/components/tree-provider/TreeProviderView.css:11-18;
  src/renderer/uikit/Panel/Panel.css:1-88).
- data-part="react-slot" remains untouched because it belongs to US-1223
  (src/renderer/uikit/Panel/Panel.css:67-68).
- browser_snapshot continues to return the same accessibility structure, while DOM selector and
  highlight consumers can address the new marker (src/renderer/automation/snapshot.ts:258-303;
  src/renderer/api/ui.ts:121-128; assets/agent/ui-highlight.js:265-282).
- Visual behavior is unchanged: **nothing** changes in layout, colors, borders, visibility, or
  spacing (src/renderer/uikit/Panel/Panel.css:1-88).
- No unit tests, test harness, unrelated source cleanup, or dashboard edit is added for this
  planning task.

## Files changed

This task adds only this README. The eventual implementation scope is the Panel element attribute
factory, the seven current unresolved logical roots, and their existing caller files. Explicit
no-change files are src/renderer/uikit/Panel/Panel.css, the data-part="react-slot" selector,
src/renderer/automation/snapshot.ts, src/renderer/automation/commands.ts,
src/renderer/api/ui.ts, assets/agent/ui-highlight.js,
src/renderer/components/tree-provider/TreeProviderView.css,
src/renderer/editors/base/ContentHostFooter.css,
src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css, and all files under
qa/, docs/, assets/, and boards-assets/.
