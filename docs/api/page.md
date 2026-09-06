# Page API

`page` is the active tab. `app.pages.activePage` and `app.pages.all` expose the same page
objects. The page API is structural: the current editor is available as `page.editor`, and
editor switching is available as `page.editorSwitches`.

## Page properties

| Property | Description |
|---|---|
| `id`, `title`, `filePath`, `modified`, `pinned` | Page and tab metadata |
| `content` | Read or assign text content for text-based editors |
| `language` | Read or assign the language id |
| `editor` | Read-only current editor facade; narrow on `editor.id` |
| `editorSwitches` | Current id, toolbar-identical options, and `switchTo(id)` |
| `tab` | This page's tab state and scoped tab-strip controls |
| `data` | Per-page in-memory data bag |
| `panels` | Page sidebar state and controls |
| `grouped` | The side-by-side page; reading it creates one if needed |

`page.editor` never returns `undefined`. Editors without operations yet return an identity facade
with `kind: "Editor"`, `id`, and `name`, whose help explains that no operations are available yet.

```javascript
const editor = page.editor;
if (editor.id === "grid-json") {
    editor.addRows(5);
}
```

## `page.tab`

`page.tab` describes this page's tab-strip presentation. It exposes `title`, `modified`,
`pinned`, `active`, and `soundIndicator`, plus the tab's curated `elements` and
`highlight(name, message?)` helper. `active` also includes the grouped partner shown beside the
active page. Reading or highlighting the tab does not activate the page.

```javascript
console.log(page.tab.title, page.tab.active, page.tab.modified);
await page.tab.highlight("page-tab");
```

The operation-bearing ids are `monaco`, `grid-json`, `grid-csv`, `grid-jsonl`, `notebook-view`,
`rest-client`, `env-vars-view`, `archive-view`, `log-view`, `category-view`, `git-tree`,
`link-view`, `md-view`, `svg-view`, `html-view`, `mermaid-view`, `graph-view`, `draw-view`,
`browser-view`, `mcp-view`, `image-view`, `video-view`, `file-diff`, `board-view`, `board-info`,
`toolset-view`, `tools-hub-view`, `mneme-config`, and `mneme-root`. A custom board secondary view
uses an id such as `board-editor:details`. Each facade also exposes its registry `name`.

## `page.editorSwitches`

`current` is the current main editor id. `options` is the exact merged projection shown by the
toolbar, including compatible built-in editors, trusted board matches, and the install entry.

```javascript
console.log(page.editorSwitches.current);
console.log(page.editorSwitches.options); // [{ id, label }]
await page.editorSwitches.switchTo("grid-json");
```

`switchTo(id)` accepts any registered editor id; it is not restricted to `options`. A same-id call
is a silent no-op. The operation awaits the switch and then verifies
`mainEditorInstance.editorId`. If the call returns without switching, it throws a diagnostic that
the release prompt may have been declined or the page may have no file to rebuild over. Unknown
ids preserve the registry's existing rejection. The page toolbar is available as
`page.editorSwitches.elements` with the `page-editor-switch` declaration.

## Editor facades

The current `page.editor` value exposes the following existing operation surfaces when its id is
narrowed:

- `monaco`: selection, cursor, insertion, replacement, line reveal, and highlighting.
- `grid-json`, `grid-csv`, `grid-jsonl`: rows, columns, cell editing, search, and row/column changes.
- `notebook-view`: notes, categories, tags, and note editing.
- `link-view`: links, categories, tags, and link editing.
- `md-view`: markdown preview state and rendered HTML.
- `svg-view`: SVG source and PNG export.
- `html-view`: HTML source, preview capture, image export, and resource/image actions.
- `mermaid-view`: diagram state and PNG export.
- `graph-view`: graph queries, selection, traversal, and analysis.
- `draw-view`: drawing image insertion and SVG/PNG export.
- `browser-view`: browser navigation, tabs, inspection, interaction, and evaluation.
- `mcp-view`: MCP connection status, server metadata, request history, and copied Tools/Resources/
  Prompts panel state. `command` and `args` are read-only; the `url` setter rejects embedded
  credentials, fragments, and credential-like query parameters.
- `board-view` and `board-editor:<id>`: board identity, trust/render state, manifest, secondary
  views, busy/frame status, and `reload()` for the open board.
- `board-info`: published-board matches, install/properties state, version history, and the
  install-directory picker or download cancellation. Trust and registration remain user actions.
- `toolset-view`: registered toolset identity, validity and errors, plus `refresh()`, `openFolder()`
  and `openLog()`.
- `tools-hub-view`: the active hub tab (`builtin`, `boards`, `search`, or `tools`) and `setTab()`.
- `mneme-config`: Mneme service, root, reindex, and model state, with refresh/restart, root-config,
  reindex, and model-update actions.
- `mneme-root`: Mneme search query, mode, tag/date filters, result state, and search/filter actions.
- `image-view`: image source, PNG/original save, drawing export, and clipboard copy.
- `video-view`: video/audio source and playback state, playback controls, next-track and
  visualizer settings, and VLC handoff.
- `file-diff`: selected original/modified revisions, staged-state detection, and read-only state.
- `rest-client`: REST requests, the selected response, request organization, and sending requests.
- `env-vars-view`: environment-variable namespaces, profiles, values, and encryption state.
- `archive-view`: archive entries, selection, entry opening, and extraction.
- `log-view`: Log View entries, non-blocking output/dialog pushes, dialog results, and timestamps.
- `category-view`: Folder View provider state, listing, category navigation, and refresh.
- `git-tree`: repository history, changes, refs, ahead/behind state, and changed-file navigation.

The `html` value on `md-view` and `html-view`, and the `svg` value on `svg-view`, are `undefined`
when their backing preview host is not mounted; use each facade's `viewMounted` property to tell
that state apart from genuinely empty content. Mermaid's `svgUrl` is different by design: `""`
means its state-backed diagram has not rendered yet or rendered with an error.

Every facade's `$help` describes access through `page.editor` and gives its id-narrowing example.

### Board, Tools & Editors, and Mneme facades

These pages are available through the same `page.editor` object model used by the built-in editors.
They return snapshots of live page state; optional values are absent until the corresponding data
exists. For example:

```javascript
const editor = page.editor;
if (editor.id === "board-view") {
    console.log(editor.boardName, editor.renderState, editor.busy);
    await editor.reload();
}

if (editor.id === "mneme-root") {
    editor.setMode("hybrid");
    editor.setQuery("deployment notes");
    await editor.runSearch();
    console.log(editor.results);
}
```

The board and toolset actions do not accept secrets and cannot grant board trust or toolset
registration. `board-info` can prepare or cancel a download, but registering a downloaded board
still requires the user's trust-dialog click. See [Boards](../boards.md), [Agent Tools](../agent-tools.md),
and [Mneme](../mneme.md) for the user workflows.

### Data editor facades

The Grid facade is shared by JSON, CSV, and JSONL pages. It exposes copied `rows` and `columns`,
row counts, search/filter/sort/selection state, hidden columns, and CSV options. Use `editCell`,
`addRows`, `deleteRows`, `addColumns`, `deleteColumns`, `setSearch`, and `clearSearch`; CSV pages
also support `setCsvDelimiter` and `setCsvWithColumns`. Data-changing methods are caution-marked
in the `call` tree.

The Notebook facade exposes copied notes, categories, tags, counts, filters, expanded-note state,
and parse errors. It supports adding, removing, and updating notes, comments, categories, tags,
language, and embedded editor, as well as search and category/tag filtering. Notebook sidebar
panels are available separately through `page.panels.notebookCategories` and
`page.panels.notebookTags`.

The REST facade exposes copied request and response snapshots, including the URL, headers, body,
and response body. It can select, add, rename, move, and remove requests, change request metadata
and header/form keys, and send the selected request. It deliberately does not accept password,
token, header-value, body-value, or form-value arguments. The `.rest.json` text remains available
through `page.content`, so this facade does not claim to redact values that are already in that
text; `send()` uses the request's actual headers and body and can contact a real service.

The environment-variable facade exposes parsed namespaces, profiles, variable names and values,
plus parse/encryption state. It can select namespaces and profiles, add or remove them, and open
the existing encryption dialog without accepting or returning its password. Values are not
redacted after unlock because the plaintext is already present in the page content. The separate
`app.boardVars` service remains the value-capable store for board environment variables.

### Archive, Folder View, and Git Tree facades

The Archive facade lists copied entry metadata, opens an archive-relative entry, and extracts the
archive to a directory. Extraction writes to disk and retains the archive's path-safety checks.
The Folder View facade lists copied items, opens items or categories, reports the provider and
current selection, and refreshes the listing. The Git Tree facade reports copied commits, changes,
refs, and ahead/behind counts; it can refresh, load more history, open a changed path in File Diff,
and reveal a branch, remote branch, or tag. Git commit, checkout, stage, and push operations are
not facade methods.

All of these surfaces expose a curated `elements` inventory to the `call` tree. Each element has a
purpose and live `visible` state; `highlight(name, message?)` activates the owning page and points
at the matching control. Repeated controls may highlight more than one mounted row, and the
highlight result reports both the number found and the number drawn.

## `page.panels`

`page.panels` describes the sidebar belonging to this page. `items` lists rendered panels in order,
with each panel's `id`, `label`, owner, and `expanded` state. The node also exposes `isOpen`,
`width`, `expand(panelId)`, `toggleSidebar()`, `elements`, and `highlight(...)`.

Use the named child nodes when present: `explorer`, `search`, `boards`, `git`,
`notebookCategories`, `notebookTags`, `rest`, `archive`, and `fileHistory`. Explorer, Search,
Boards, and Git provide state and model-backed actions; other panels expose their live identity,
state, elements, and available close operation. A child is `undefined` when its panel is not
currently rendered.

```javascript
const panels = page.panels;
console.log(panels.items.map(panel => `${panel.id}: ${panel.label}`));
if (panels.explorer) {
    console.log(await panels.explorer.listItems());
    panels.explorer.openSearch();
}
await panels.highlight("secondary-views-container", "This page's sidebar");
```

Panel access is page-scoped, so the same panel id on two pages resolves to the correct page. A
bare id can be expanded; when multiple editor instances contribute that id, use `items` and the
owner id to distinguish them.

### Video facade (`video-view`)

The video facade exposes the current source, detected `format`, `playerState`, mute state, live
media values (`duration`, `currentTime`, `paused`, `volume`, `muted`, and `playbackRate`), and
audio navigation settings. Use `submitUrl`, `play`, `pause`, `seek`, `toggleMute`, `playNext`,
`toggleShuffle`, `setVisualizerEffect`, and `openInVlc` for playback actions. `play`, `seek`,
`playNext`, and VLC handoff can affect a page that is not currently on screen.

```javascript
const player = page.editor;
if (player.id === "video-view") {
    console.log(player.playerState, player.currentTime, player.duration);
    await player.play();
}
```

### File Diff facade (`file-diff`)

The File Diff facade reports the selected `from` and `to` revisions, whether staged changes were
detected (`hasStaged`), and whether the modified side is read-only (`readOnly`). These values can
be `undefined` while the repository-backed diff is still resolving. A revision is one of
`{ kind: "unstaged" }`, `{ kind: "staged" }`, `{ kind: "head" }`, or a commit object with
`kind: "commit"`, `hash`, and `shortHash`.

```javascript
const diff = page.editor;
if (diff.id === "file-diff" && diff.to) {
    console.log(diff.from, diff.to, diff.readOnly);
}
```

## `app.pages.compare`

`app.pages.compare` describes active side-by-side compare pairs. `pairs` identifies each pair's
left and right page IDs, titles, and available file paths. `enter(pageId)` and `exit(pageId)` accept
either member of a grouped pair. Entering requires a comparable grouped pair; failed entry or exit
throws a diagnostic instead of silently doing nothing.

The node also exposes `elements` and `highlight(name, message?)` for the compare surface. Its
`compare-root` and `compare-exit` controls are scoped to the pair's left page.

```javascript
const pair = app.pages.compare.pairs[0];
if (pair) {
    app.pages.compare.enter(pair.leftPageId);
    await app.pages.compare.highlight("compare-exit");
    app.pages.compare.exit(pair.rightPageId);
}
```

## `runScript()`

Runs the page's JavaScript or TypeScript content as a script and returns its output text.

```javascript
const scriptPage = app.pages.all.find(p => p.title === "transform.js");
await scriptPage.runScript();
```
