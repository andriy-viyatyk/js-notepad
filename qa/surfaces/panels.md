# Surface QA: sidebar panels and the navigation surfaces

Manual scenarios for `page.panels`' individual panel nodes, and for the Folder View and Git Tree
editors. Run through `call` only; do not add or run automated tests or a test harness for these
surfaces. Leave pinned tabs untouched and close only pages the scenario created.

Landed by EPIC-087 (US-1323), building on the `page.panels` collection EPIC-085 shipped.

## Test P.1: Panels are addressable, and an absent panel says so

**Preparation:** A page with its sidebar open on the Explorer panel.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `page.panels`, then `page.panels.explorer`, then `page.panels.rest`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The collection still carries its EPIC-085 members (`items`, `isOpen`, `width`,
`expand`, `toggleSidebar`) unchanged, and now also lists panel members. `panels.explorer` resolves
as a bare member and reports its `id`, `label`, `ownerEditorId`, `expanded` flag and panel state.
`panels.rest` reports **absent** on a page that has no REST panel — it does not fabricate an empty
node.

## Test P.2: Reading a panel never creates one

**Preparation:** A page with **no** sidebar — a plain text page whose Explorer has never been
opened. Note whether the sidebar is visible before you start.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `page.panels`, `page.panels.explorer` and `page.panels.items` several times.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** No panel appears, the sidebar does not open, and the page looks exactly as it did.
This is the point of the test: `page.grouped` elsewhere in the tree carries the caution "reading it
CREATES a grouped page if none exists", and panels deliberately do not behave that way. Reading the
tree must never change the app.

## Test P.3: Panel elements are scoped to their own panel

**Preparation:** A page with two panels open at once — for example Explorer plus Git, or a notebook
page with Categories and Tags.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `elements` on each panel node, and `highlight` a control on one of them.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Every selector carries **both** the page id and the panel's own
`[data-type="collapsible-panel"][data-name="<panel>"]` root, so a control name that exists in two
panels cannot resolve to the wrong one. The highlight rings a control inside the intended panel.
Controls that are view-owned say so in their purpose text and have no facade action attached.

## Test P.4: Folder View

**Preparation:** A Folder View page (`category-view`).

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `pages[id].editor` and its `elements`; read the current root and item list.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The facade reports the folder it is showing and a **copied**, capped item list with a
count. An empty folder reports a real `[]` rather than `undefined`. Every selector is page-scoped.

## Test P.5: Git Tree is read-mostly

**Preparation:** A Git Tree page on a repository with history.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `editor` for `repoRoot`, `currentRef` and `loadedCommitCount`; read `commits`,
`changes` and the element inventory; call `loadMore()`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** `commits` is bounded — a capped page plus a loaded count, never an unbounded history
dump into the agent's context — and `loadMore()` fetches one further bounded page. `changes`
reports real empty arrays on a clean tree. The inventory **does** include `git-commit`,
`git-stage`, `git-unstage`, `git-tree-pull` and `git-tree-push`, so an agent can see and point at
them; the facade has **no** method that invokes any of them. Confirm the only actions are
`refresh`, `loadMore`, `openChange` and `revealRef`. Repository mutation through an agent is
deliberately out of scope and a scenario is what would reopen it.

## Test P.6: Reveal against an unmounted view

**Preparation:** A Git Tree page that is open but **not** active, or whose relevant panel is closed.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `editor.revealRef(...)` or `editor.openChange(...)` targeting the unmounted view.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The action either brings the target on screen or throws a clear diagnostic. It must not
report success while doing nothing, and it must not queue silently against a view that may never
mount — a silent queue is indistinguishable from success and is the failure mode this epic's
plan reviews were watching for.
