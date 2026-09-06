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
`link-view`, `md-view`, `svg-view`, `html-view`, `mermaid-view`, `graph-view`, `draw-view`,
`browser-view`, `mcp-view`, `image-view`, `video-view`, and `file-diff`. Each facade also exposes
its registry `name`.

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
- `mcp-view`: MCP connection parameters, connection status, and request history.
- `image-view`: image source, PNG/original save, drawing export, and clipboard copy.
- `video-view`: video/audio source and playback state, playback controls, next-track and
  visualizer settings, and VLC handoff.
- `file-diff`: selected original/modified revisions, staged-state detection, and read-only state.

The `html` value on `md-view` and `html-view`, and the `svg` value on `svg-view`, are `undefined`
when their backing preview host is not mounted; use each facade's `viewMounted` property to tell
that state apart from genuinely empty content. Mermaid's `svgUrl` is different by design: `""`
means its state-backed diagram has not rendered yet or rendered with an error.

Every facade's `$help` describes access through `page.editor` and gives its id-narrowing example.

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
