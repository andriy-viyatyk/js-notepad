# Surface QA: Markdown, HTML, SVG, and Mermaid previews

Manual scenarios for the four preview-family facades after narrowing `pages[i].editor` by
`editor.id`. Run through `call` only; do not add or run automated tests or a test harness for this
surface. Leave pinned tabs untouched and close only pages created by the scenario.

## Test V.1: Four preview inventories

**Preparation:** Open Markdown, HTML, SVG, and Mermaid preview pages and obtain each page id.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read each `pages[id].editor.elements` and `$help`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The lists contain exactly 7, 4, 4, and 6 declarations. Every purpose is non-empty and
every selector contains its owning `[data-page-id="id"]`. Structural roots (`markdown-view-root`,
`svg-root`, `mermaid-root`) and the transient `html-image-menu` are not advertised as persistent
controls.

## Test V.2: Same-editor scope and inactive highlight

**Preparation:** Open two pages of each preview type and leave the second page inactive. Create a
comparable grouped pair where the `text-compare-left` control can render.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read both inventories and highlight a present control on each inactive page, including
`text-compare-left` when available.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The active page's present controls are visible while the inactive retained slot's
controls are not. Highlighting activates exactly the requested page, waits for its slot layout, and
rings only that page. Reading `elements` does not activate a page.

## Test V.3: Conditional and disabled states

**Preparation:** Use Markdown with no back history and then with back history. Open search with a
non-empty external `editorConfig.highlightText`, then clear that highlight. Use HTML while a
capture is active and Mermaid while loading or without an SVG URL.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read the relevant inventories, call `openSearch()` and `closeSearch()`, and invoke HTML
image actions while `capturing` is true.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** `markdown-back` and all four `find-*` controls are absent with `visible: false` in the
corresponding states, including when external highlighting suppresses the find bar. HTML capture
buttons remain visible while disabled, and facade actions reject with the busy diagnostic. Mermaid
keeps all five toolbar controls in the static list while export controls are disabled; disabled
does not mean absent.

## Test V.4: HTML foreign-document boundary

**Preparation:** Put a user-authored named button inside the HTML source and open the HTML preview.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `html-view.elements` and `$help`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The inventory contains host controls only. It has no selector for the iframe button or
its internal document, and `$help` points to the browser automation surface that EPIC-089 will
attach to the same page node. Do not use `document.querySelectorAll` as evidence that iframe
content is in the host document.

## Test V.5: Menus, dialogs, and actions

**Preparation:** Use HTML, Markdown with a rendered link, and image-capable SVG/Mermaid pages.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Open `html-more` and inspect `menus[0]`; right-click a Markdown link and inspect the
`markdown-link` menu; invoke PNG save actions; inspect the native `Save Image` picker path. Open
the common page-tab menu and exercise Rename File, Unsaved Changes, and password dialog paths.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The HTML menu contains Save as PNG, Open in Image View, and Edit Image. Markdown lists
its link and browser-opening actions. The common menu and named dialogs are reached through
`menus`/`dialogs`, not duplicated page elements. Drawing/Excalidraw actions open their new pages,
and no password value enters a summary.

## Test V.6: Same-document previews and identity

**Preparation:** Use Markdown, SVG, and Mermaid previews with rendered content, then create a
grouped pair and a compare pair.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Highlight same-document preview controls and read each wrapper, slot, tab, and editor id.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Same-document previews remain highlightable. Each wrapper, slot, and tab retains its
own page id; grouping and compare mode do not merge selectors or identities.
