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

The operation-bearing ids are `monaco`, `grid-json`, `grid-csv`, `grid-jsonl`, `notebook-view`,
`link-view`, `md-view`, `svg-view`, `html-view`, `mermaid-view`, `graph-view`, `draw-view`,
`browser-view`, `mcp-view`, and `image-view`. Each facade also exposes its registry `name`.

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
- `html-view`: HTML source.
- `mermaid-view`: diagram state and PNG export.
- `graph-view`: graph queries, selection, traversal, and analysis.
- `draw-view`: drawing image insertion and SVG/PNG export.
- `browser-view`: browser navigation, tabs, inspection, interaction, and evaluation.
- `mcp-view`: MCP connection parameters, connection status, and request history.
- `image-view`: PNG export.

Every facade's `$help` describes access through `page.editor` and gives its id-narrowing example.

## `runScript()`

Runs the page's JavaScript or TypeScript content as a script and returns its output text.

```javascript
const scriptPage = app.pages.all.find(p => p.title === "transform.js");
await scriptPage.runScript();
```
