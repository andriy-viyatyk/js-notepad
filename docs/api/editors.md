[← API Reference](./index.md)

# app.editors

Read-only registry of all editors in the application. Query available editors and resolve the best editor for a file.

```javascript
const all = app.editors.getAll();
const best = app.editors.resolve("data.json");
console.log(best?.name); // "JSON Grid"
```

## Methods

### getAll() → `IEditorInfo[]`

Get all registered editors.

```javascript
app.editors.getAll().forEach(e => {
    const kind = e.hasContentHost ? "text" : "standalone";
    console.log(`${e.id}: ${e.name} [${kind}]`);
});
```

### getById(id) → `IEditorInfo | undefined`

Get editor info by ID.

```javascript
const info = app.editors.getById("grid-json");
console.log(info?.name); // "JSON Grid"
```

### resolve(filePath) → `IEditorInfo | undefined`

Resolve the best matching editor for a file path.

```javascript
const editor = app.editors.resolve("readme.md");
console.log(editor?.id); // "md-view"
```

### resolveId(filePath) → `string | undefined`

Resolve just the editor ID for a file path.

### getSwitchOptions(languageId, filePath?) → `ISwitchOptions`

Get available editor switch options for a language. Used to build editor switch dropdowns.

```javascript
const opts = app.editors.getSwitchOptions("json", "data.json");
opts.options.forEach(id =>
    console.log(`${id}: ${opts.getOptionLabel(id)}`)
);
```

## IEditorInfo

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Editor ID (e.g., `"monaco"`, `"grid-json"`). |
| `name` | `string` | Display name (e.g., `"Text Editor"`, `"JSON Grid"`). |
| `hasContentHost` | `boolean` | `true` for text-bearing editors that share text content and can switch between each other; `false` for standalone editors with their own page model. |

Text-bearing editors (`hasContentHost === true`) — Monaco, Grid (JSON/CSV/JSONL), Markdown, Notebook, Link, SVG, HTML, Mermaid, Log View, Graph, Draw, Rest Client — share the same underlying text content and can switch between each other (e.g., JSON text ↔ Grid).

Standalone editors (`hasContentHost === false`) — Image Viewer, Browser, Archive, Video Player, MCP Inspector, Storybook, About, Settings, Compare — own their own state and do not participate in content-based editor switching. (Persephone no longer ships a built-in PDF viewer — see [Editors — PDF Viewer](../editors.md#pdf-viewer). The `"pdf-view"` editor id no longer exists.)
