# Surface QA: page-scoped elements and `page.tab`

Manual scenarios for the page-owned AI-vision surface. Run through `call` only; do not add or run
automated tests or a test harness for this surface. Leave pinned tabs untouched and close only pages
created by the scenario.

## Test P.1: Two same-editor pages

**Preparation:** Open two Monaco/script pages and obtain both page ids from `pages`.

**Call:** Read `pages[firstId].editor.elements`, `pages[secondId].editor.elements`, and both
pages' `editorSwitches.elements` and `panels.elements`. Read `pages[firstId].tab.elements` and
`pages[secondId].tab.elements` as well.

**Verify:** Every returned selector contains the requested `[data-page-id="id"]`; the active
page's slot-hosted controls are visible, while the inactive retained slot's controls are not
visible. Each `tab.elements` list independently addresses its own tab root and controls. A
conditional control that is absent remains `visible: false` rather than becoming a fabricated
success.

## Test P.2: Inactive-page highlight activates first

**Preparation:** Leave the second same-editor page inactive and use a script-language page so
`text-run-script` exists.

**Call:** `pages[secondId].editor.highlight("text-run-script", "...")`.

**Verify:** The active page becomes `secondId`, the result is `found: true`, and the visible ring
is on the second page's button rather than the first page's matching button. Repeat with
`editorSwitches.highlight("page-editor-switch")` and `panels.highlight("page-nav-panel")` when
those conditional controls are present. The helper waits for the requested slot's non-zero
rectangle before drawing, including when the requested page is the right member of a group.

## Test P.3: Non-active tab remains visible

**Preparation:** Leave one page inactive. Read `pages[inactiveId].tab` and its `elements`.

**Verify:** The tab root and any rendered tab controls report visible, `tab.active` is false, and
the inactive page's editor elements report invisible. Read and highlight a tab control, then verify
the page remains inactive. Create enough tabs to overflow the strip and verify tab highlighting
centres the target into view without relying on `[data-active]` or activating the page.

## Test P.4: Grouped and compare identity

**Preparation:** Create a grouped pair, then a compare pair from two text pages.

**Call:** For each side, read `PageWrapper.id`, inspect the rendered slot/tab identity through the
page-owned selectors, and read `pages[id].tab.elements`.

**Verify:** Each `PageWrapper.id`, slot `data-page-id`, and tab `data-page-id` equals that side's
`PageModel.id`. Grouping and compare mode preserve the two ids; they never merge the left and right
identity attributes. The grouped partner reports `tab.active: true` while the group is active.
