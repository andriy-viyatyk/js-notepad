[← Home](./index.md)

# Scripting

persephone lets you run JavaScript and TypeScript to transform and process content. TypeScript is fully supported — type annotations are stripped automatically before execution.

## Quick Start

1. Open a file with JavaScript or TypeScript code (or set the language accordingly)
2. Press `F5` to run
3. Output appears in a new grouped tab

## Running Scripts

### Run File Content
- Set file language to JavaScript or TypeScript
- Press `F5` to run the entire file (works with both `.js` and `.ts` files)
- Or select text and press `F5` to run selection

### Script Panel
- Open Script Panel from toolbar or context menu
- The Script Panel uses TypeScript by default — write plain JavaScript or add type annotations as you like
- Press `F5` in Script Panel to run

#### Script Selector & Save

The Script Panel toolbar includes a **script selector dropdown** and a **Save button** for managing reusable scripts:

- **Script selector** — lists saved scripts from your Script Library under `script-panel/{language}/` and `script-panel/all/` folders. Scripts from the "all" folder are shown with an "all/" prefix. Select a script to load its content into the editor, or choose "(unsaved script)" for ad-hoc editing.
- **Save button** — saves the current script to the library:
  - **Ad-hoc scripts:** Opens a dialog where you enter a filename and choose the target folder (current language folder or "all" for shared scripts)
  - **Library scripts:** Directly overwrites the file when content has been modified
  - Folders are created automatically if they don't exist
  - Overwrite confirmation is shown when saving an ad-hoc script with an existing filename
- **Ctrl+S** shortcut works when the Script Panel editor is focused

## The `page` Object

Scripts have access to [`page`](./api/page.md) representing the current file:

```javascript
// Read content
const text = page.content;

// Write content
page.content = "new content";

// Get/set language
console.log(page.language);  // "javascript"
page.language = "json";

// Get/set editor type
page.editor = "grid-json";  // Switch to grid view

// Custom data storage
page.data.myValue = 123;
```

### Editor Facades

For specialized access to editor-specific features, use `page.asX()` methods. Each returns an async facade tailored to a particular editor type:

```javascript
const grid = await page.asGrid();    // Grid — rows, columns, cells
const graph = await page.asGraph();  // Graph — nodes, links, search, traversal
const nb = await page.asNotebook();  // Notebook — notes, categories
const todo = await page.asTodo();    // Todo — items, lists, tags
const text = await page.asText();    // Text — Monaco selection, cursor
const browser = await page.asBrowser(); // Browser — navigation, tab management, DOM query, interaction, wait, snapshot
const mcp = await page.asMcpInspector(); // MCP Inspector — connection, history
```

Facades are stateless wrappers — nothing needs to be released. Event subscriptions made via `app.events` are still auto-unsubscribed when the script completes. See the [page API reference](./api/page.md#editor-facades) for the full list and detailed documentation.

## Grouped Pages (Output)

When a script runs, the result is displayed in a grouped (side-by-side) output page:

- **On success:** The return value is written to the output page
- **On error:** The error message with stack trace is displayed
- **No return value:** Shows "undefined"

```javascript
// Return value is written to grouped page
return { result: "data" };
```

You can configure the output page before returning:

```javascript
// Set language and editor type for the output
page.grouped.language = "json";
page.grouped.editor = "grid-json";
return result.recordset;
```

## Output Suppression

Sometimes you want full control over script output — for example, when writing to `page.grouped.content` directly or when using dialogs to display results. There are two ways to prevent the default output behavior:

### Writing to `page.grouped.content` directly

When you assign to `page.grouped.content`, the default output is automatically suppressed. The grouped page shows exactly what you wrote:

```javascript
// Default output is suppressed — grouped page shows your content
page.grouped.content = "Custom output";
page.grouped.language = "json";
```

### Using `preventOutput()`

Call the global `preventOutput()` function to explicitly suppress default output:

```javascript
// Show results in a dialog instead of the grouped page
const data = JSON.parse(page.content);
await app.ui.textDialog({
    title: "Results",
    text: JSON.stringify(data, null, 2),
    options: { language: "json" },
});
preventOutput();
```

### Error handling with suppressed output

When output is suppressed and a script error occurs, the error is shown in a text dialog instead of the grouped page. This keeps error details visible even when the grouped page is not used for output.

## The `ui` Object (Log View)

Scripts can use the global [`ui`](./api/ui-log.md) object for structured logging and inline dialogs. Instead of writing output to a grouped text page, `ui` opens a **Log View** — a scrollable list of typed log entries and interactive dialogs.

```javascript
ui.info("Starting import...");

const data = JSON.parse(page.content);
ui.log(`Found ${data.length} records`);

const result = await ui.dialog.confirm("Continue with import?");
if (result.button === "Yes") {
    // process data...
    ui.success("Import complete!");
} else {
    ui.warn("Import canceled");
}
```

Key points:
- **`await ui()` yield** — call `await ui()` inside long-running loops to yield to the event loop, keeping the UI responsive. This works whether or not you use any logging methods:
  ```javascript
  for (const item of largeArray) {
      // ... heavy processing ...
      await ui(); // let the UI breathe
  }
  ```
- **Lazy initialization** — the Log View page is created on the first `ui` access and auto-grouped with the source page
- **Suppresses default output** — accessing `ui` automatically prevents the return value from being written to a grouped page (same as `preventOutput()`)
- **Console forwarding** — when `ui` is active, `console.log/info/warn/error` are automatically forwarded to the Log View (`console.log` → lighter text, `console.info` → info, etc.). The native console is always called too. Suppress with `ui.preventConsoleLog()`, `ui.preventConsoleWarn()`, `ui.preventConsoleError()`.
- **Logging levels** — `ui.log()` (lighter text), `ui.text()` (normal text), `ui.info()`, `ui.warn()`, `ui.error()`, `ui.success()`
- **Fluent styled text** — logging methods return a builder for chaining: `ui.log("Status: ").append("OK").color("lime").bold().print()`
- **Styled text arrays** — pass an array of `{ text, styles }` segments for custom formatting
- **`styledText()` global** — build styled text for dialog labels: `styledText("Warning").color("red").bold().value`
- **Inline dialogs** — `ui.dialog.confirm()`, `ui.dialog.buttons()`, `ui.dialog.textInput()`, `ui.dialog.checkboxes()`, `ui.dialog.radioboxes()`, `ui.dialog.select()` appear directly in the Log View and return a `Promise` with the user's response
- **Progress bars** — `ui.show.progress()` adds a progress bar to the Log View and returns a `Progress` helper with `label`, `value`, `max`, and `completed` setters for real-time updates. Use `progress.completeWithPromise(promise)` to auto-complete on promise settlement.
- **Inline grids** — `ui.show.grid(data)` displays tabular data inline in the Log View using a full-featured grid with column resizing, reordering, and cell selection/copy. Pass an options object for custom columns and title: `ui.show.grid({ data, columns?, title? })`. The returned `Grid` helper has live `data`, `columns`, and `title` setters, plus `openInEditor()` to open the data in a dedicated Grid editor tab.
- **Inline markdown** — `ui.show.markdown(text)` renders markdown inline in the Log View — headings, tables, code blocks, Mermaid diagrams, task lists, and blockquotes. Pass an options object for a title: `ui.show.markdown({ text, title? })`. The returned `Markdown` helper has live `text` and `title` setters, plus `openInEditor()` to open in a Markdown editor tab.
- **Inline mermaid** — `ui.show.mermaid(text)` renders a Mermaid diagram inline in the Log View with theme-aware light/dark rendering. Pass an options object for a title: `ui.show.mermaid({ text, title? })`. The returned `Mermaid` helper has live `text` and `title` setters, plus `openInEditor()` to open in a Mermaid editor tab. Hover toolbar provides "Copy image to clipboard" and "Open in Mermaid editor" buttons.

See the [ui API reference](./api/ui-log.md) for complete details.

## The `io` Namespace

Scripts have access to a global `io` object for building **content pipes** — a way to read (and sometimes write) binary content from files, HTTP URLs, and archives. This is the same pipeline that Persephone uses internally when you open a file or URL.

### Providers

Providers are data sources. Create one and pass it to `io.createPipe()`.

| Constructor | Description |
|-------------|-------------|
| `new io.FileProvider(filePath)` | Reads/writes a local file |
| `new io.HttpProvider(url, options?)` | Fetches from an HTTP/HTTPS URL |

`HttpProvider` options: `{ method?, headers?, body? }` — useful when you need custom headers or a POST body.

### Transformers

Transformers process the raw bytes before they reach your code.

| Constructor | Description |
|-------------|-------------|
| `new io.ArchiveTransformer(archivePath, entryPath)` | Extracts a single entry from an archive (ZIP, RAR, 7z, TAR, etc.) |
| `new io.DecryptTransformer(password)` | Decrypts AES-GCM encrypted content |

### Creating a pipe

```javascript
const pipe = io.createPipe(provider, ...transformers);
const text = await pipe.readText();
```

### Examples

**Read a remote JSON file:**

```javascript
const provider = new io.HttpProvider("https://example.com/data.json");
const pipe = io.createPipe(provider);
const text = await pipe.readText();
return JSON.parse(text);
```

**Read a file inside an archive:**

```javascript
const provider = new io.FileProvider("C:/reports/archive.zip");
const entry = new io.ArchiveTransformer("C:/reports/archive.zip", "reports/summary.csv");
const pipe = io.createPipe(provider, entry);
return await pipe.readText();
```

**Fetch with custom headers (like a cURL command):**

```javascript
const provider = new io.HttpProvider("https://api.example.com/data", {
    method: "GET",
    headers: { "Authorization": "Bearer my-token" },
});
const pipe = io.createPipe(provider);
const text = await pipe.readText();
return JSON.parse(text);
```

### Opening content in an editor

To open content from a pipe in a new tab, fire it through the link pipeline:

```javascript
// Open a URL in Persephone (auto-selects editor by content type)
await app.events.openRawLink.sendAsync(
    io.createLinkData("https://example.com/report.pdf")
);
```

```javascript
// Open a specific file path (skip Layer 1 raw parsing, go directly to Layer 2)
await app.events.openLink.sendAsync(
    io.createLinkData("C:/data/file.json", { url: "C:/data/file.json" })
);
```

See the [Events API](./api/events.md) for the full pipeline reference.

## The `ai` Namespace

Scripts have access to a global `ai` object for **AI model integrations**. Currently this provides `ClaudeSession` — a helper class that wraps the Anthropic API to manage multi-turn conversations, tool calls, and event callbacks automatically.

### Quick start

```javascript
const session = new ai.ClaudeSession({ apiKey: "sk-ant-..." });
session.systemMessage("You are a helpful assistant.");
session.userMessage("Summarize this text in one sentence.");
const reply = await session.send();
return reply;
```

### With tools

Define tools as plain JavaScript functions. Claude will call them as needed during the response:

```javascript
const session = new ai.ClaudeSession({ apiKey: "sk-ant-..." });

session.tools = [{
    name: "read_file",
    description: "Read the content of a file",
    inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
    },
    tool: async ({ path }) => await app.fs.read(path),
}];

session.userMessage("Read C:/data/notes.txt and summarize it.");
const reply = await session.send();
return reply;
```

### Multi-turn conversations

Messages accumulate across multiple `send()` calls. Call `clear()` to start fresh:

```javascript
const session = new ai.ClaudeSession({ apiKey: "sk-ant-..." });
session.userMessage("What is a closure?");
await session.send();

session.userMessage("Show me an example.");
const reply = await session.send();
return reply;
```

See the [`ai` API reference](./api/ai.md) for the complete method list, event types, and more examples.

## Examples

### Transform JSON

```javascript
// Parse, filter, and format
const data = JSON.parse(page.content);
return data.filter(item => item.active);
```

### Process CSV Lines

```javascript
const lines = page.content.split('\n');
const filtered = lines.filter(line => line.includes('important'));
return filtered.join('\n');
```

### Convert JSON to CSV

```javascript
const data = JSON.parse(page.content);
const headers = Object.keys(data[0]);
const csv = [
  headers.join(','),
  ...data.map(row => headers.map(h => row[h]).join(','))
];
return csv.join('\n');
```

### Query Database

```javascript
const path = require('path');
const sql = require(path.join('D:\\packages\\node_modules', 'mssql'));

const config = {
  user: 'sa',
  password: '123',
  server: 'localhost',
  database: 'MyDB',
  options: { encrypt: false, trustServerCertificate: true }
};

await sql.connect(config);
const result = await sql.query(page.content);
await sql.close();

// Display as grid
page.grouped.language = 'json';
page.grouped.editor = 'grid-json';
return result.recordset;
```

### TypeScript Example

```typescript
interface User {
  name: string;
  email: string;
  active: boolean;
}

const users: User[] = JSON.parse(page.content);
const active: User[] = users.filter((u: User) => u.active);
return active.map((u: User) => `${u.name} <${u.email}>`).join('\n');
```

TypeScript type annotations are stripped before execution. You get the readability benefits of types without any extra setup.

### Fetch API Data

```javascript
// Simple GET — app.fetch uses Node.js with no automatic Chromium headers
const res = await app.fetch("https://api.example.com/users");
const data = await res.json();
return data;
```

```javascript
// POST with custom headers and body
const res = await app.fetch("https://api.example.com/users", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer my-token",
    },
    body: JSON.stringify({ name: "John" }),
});
return await res.json();
```

## The `app` Object

Scripts also have access to [`app`](./api/app.md) — the root application object with settings, file system, dialogs, and more:

```javascript
// Show a confirmation dialog
const answer = await app.ui.confirm("Proceed?", { buttons: ["Yes", "No"] });
if (answer === "Yes") { /* ... */ }

// Show a notification
app.ui.notify("Done!", "success");

// Prompt for input
const result = await app.ui.input("Enter name:", { value: "default" });
if (result) { console.log(result.value); }

// Read/write files
const text = await app.fs.read("C:/data/file.txt");
await app.fs.write("C:/data/out.txt", text);

// Change settings
app.settings.set("theme", "monokai");

// Open URL in browser
await app.shell.openExternal("https://github.com");
```

### Available services

| Property | Description |
|----------|-------------|
| `app.version` | Application version string |
| [`app.settings`](./api/settings.md) | Read/write application settings |
| [`app.editors`](./api/editors.md) | Read-only editor registry |
| [`app.recent`](./api/recent.md) | Recently opened files |
| [`app.fs`](./api/fs.md) | File system operations and dialogs |
| [`app.window`](./api/window.md) | Window management (minimize, maximize, zoom) |
| [`app.ui`](./api/ui.md) | Dialogs (confirm, input, password) and notifications |
| [`app.shell`](./api/shell.md) | OS integration (open URLs, encryption, version info) |
| [`app.pages`](./api/pages.md) | Open tabs management |
| [`app.downloads`](./api/downloads.md) | Download tracking |
| [`app.fetch()`](./api/app.md#fetchurl-options) | HTTP client (Node.js, no automatic headers) |
| [`app.runAsync()`](./api/app.md#runasyncfn-data-proxy) | Run a function in a background worker thread |

For the complete API with all methods and parameters, see the [Scripting API Reference](./api/index.md).

## AI Agent Integration (MCP)

The same `page` and `app` scripting API is available to external AI agents via the built-in MCP server. Agents can execute scripts, create pages, read content, and more — without any user interaction.

AI agents also have access to the **`ui_push`** MCP tool, which pushes log entries and interactive dialogs to a Log View page — the same Log View that scripts access via the `ui` global. This is the recommended output channel for agents to show status messages, results, and ask users questions. See the [ui API reference](./api/ui-log.md#mcp-ui_push-tool) for details.

See [MCP Server Setup](./mcp-setup.md) to connect Claude, ChatGPT, Gemini, or any MCP-compatible client.

## Script Library

You can designate a folder as your **Script Library** for quick access to frequently used scripts. The library appears as a dedicated entry in the sidebar — click it to browse and open scripts without navigating through custom folders.

### Setting Up

When you link a library folder for the first time (from the sidebar, Settings, or the Script Panel save button), a **Library Setup** dialog appears:

- **Folder path** — pick any folder to use as your library root
- **Copy example scripts** — enabled by default; copies a set of bundled example scripts into the folder so you can start immediately
  - `script-panel/all/` — general-purpose examples (example.ts, base64-encode.ts, base64-decode.ts)
  - `script-panel/plaintext/` — text-oriented scripts (sort-lines.ts, parse-jwt-token.ts)
  - `script-panel/json/` — JSON utilities (format-json.ts)
  - `utils/helpers.ts` — a shared helper module you can import with `require("library/utils/helpers")`

Existing files are never overwritten — only missing example files are copied.

You can also configure the library path later in **Settings → Script Library**. See [Tabs & Navigation](./tabs-and-navigation.md#script-library) for sidebar details.

### Importing Library Modules

Once a library folder is linked, scripts can import modules from it using `require("library/...")`:

```javascript
// Import a module from your library folder
const helpers = require("library/utils/helpers");
const db = require("library/db/connection");

const result = await db.query(page.content);
return helpers.formatTable(result);
```

**How it works:**
- `require("library/utils/helpers")` resolves to a file inside your linked library folder
- Extension auto-resolution: `.ts`, `.js`, `/index.ts`, `/index.js` are tried automatically — no need to specify the extension
- TypeScript files are transpiled automatically; `.js` files using ES module syntax (`export`/`import`) are also transpiled
- Relative requires within library modules work as expected (e.g., `require('./db-config')` inside a library file)
- Library modules have access to the same globals as the top-level script — `app`, `page`, `React`, `styledText`, `ui`, `preventOutput()`, and `require()` all work inside library code
- Library modules are reloaded fresh on every `require()` call — there is no cached state between script runs. If you need to persist data across executions, use `page.data` or `app.settings`
- If no library folder is linked, `require("library/...")` throws a clear error message

### IntelliSense for Library Modules

When a library folder is linked, Monaco provides full IntelliSense for `require("library/...")` calls:

- **Path completion** — typing `require("library/` auto-suggests folders and files from your library. Selecting a folder re-triggers suggestions so you can drill into subdirectories; files appear without extension (matching runtime auto-resolution)
- **Type information** — exported functions and variables from library `.ts` and `.js` files show parameter types, return types, and JSDoc documentation
- **Live updates** — when you edit a library file, IntelliSense reflects the changes immediately

The built-in `require()` and `preventOutput()` functions also appear in autocomplete with documentation.

This lets you build a reusable toolkit — database helpers, formatters, API clients — and use it from any script or the Script Panel.

### Autoload Scripts

Place scripts in an `autoload/` subfolder of your Script Library to have them run automatically when the window opens:

```
script-library/
├── script-panel/     ← Scripts shown in Script Panel UI
├── autoload/         ← Registration scripts loaded on window open
│   ├── 01-custom-menus.ts
│   ├── 02-bookmark-fixer.ts
│   └── helper-utils.ts       ← Skipped (no register export)
└── utils/            ← Shared library code (imported via require)
```

Scripts must export a named `register` function to be executed:

```typescript
// autoload/01-custom-menus.ts
export function register() {
    app.events.fileExplorer.itemContextMenu.subscribe((event) => {
        // Add custom context menu items for certain files
    });

    app.events.browser.onBookmark.subscribe((event) => {
        // Modify bookmark fields before the Add/Edit dialog opens
        // event.data has: title, href, discoveredImages, imgSrc, category, tags, isEdit
        if (!event.data.isEdit) {
            event.data.category = "Uncategorized";
        }
    });
}
```

**How it works:**

- On window startup, all `.ts` and `.js` files in `autoload/` are loaded **alphabetically** — prefix filenames with `01-`, `02-` to control order
- Each file is checked for a `register` export. If found, `register()` is called (async functions are awaited). Files without a `register` export are silently skipped — they can serve as utility modules imported by other autoload scripts
- All event subscriptions made during registration persist for the window session
- **All-or-nothing error handling** — if any script fails during registration, all subscriptions from all scripts are unsubscribed and an error notification is shown
- Autoload scripts can import shared modules with `require("library/...")` just like regular scripts
- The `app` global is available (but not `page` — autoload scripts run outside any specific page context)

**Reloading:** When library files change on disk, a yellow reload indicator button appears in the header. Click it to reload all autoload scripts — the previous session is disposed (all event subscriptions removed) and scripts are loaded fresh.

## Node.js Access

Scripts have full Node.js access:

```javascript
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read other files
const config = fs.readFileSync('config.json', 'utf8');

// Use npm packages (from your node_modules)
const _ = require(path.join('D:\\myproject\\node_modules', 'lodash'));
```

> **Tip:** For Base64 encoding/decoding, you can use either Node.js `Buffer` (`Buffer.from(str).toString('base64')`) or browser APIs (`btoa()` / `atob()`). For binary conversions, `TextEncoder` / `TextDecoder` are also available.

## Background Workers (`app.runAsync`)

Scripts run on the renderer main thread, so CPU-intensive operations (recursive file scans, large data processing, TypeScript program creation) can freeze the UI. `app.runAsync()` offloads a function to a background worker thread — the UI stays responsive while the function executes.

```javascript
const result = await app.runAsync(fn, data, proxy?);
```

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `fn` | The function to run in the worker. Must be **self-contained** — closures and outer-scope variables are not available. Has full Node.js access via `require()`. |
| `data` | Plain serializable data cloned into the worker (primitives, objects, arrays, `Map`, `Set`, `Date`, `RegExp`, `ArrayBuffer`). Does **not** support functions, DOM elements, or class instances. |
| `proxy` | *(Optional)* Object transparently proxied back to the renderer. Every access on `proxy` inside the worker is async (round-trips via `postMessage`). Use for callbacks, progress reporting, and app API access. |

### Simple example — offload heavy computation

```javascript
const files = await app.runAsync(
    async (data) => {
        const fs = require("fs");
        return fs.readdirSync(data.dir, { recursive: true });
    },
    { dir: "C:/projects/my-app/src" }
);
return files;
```

### With proxy — progress updates from the worker

```javascript
const progress = await app.ui.createProgress("Processing...");
const result = await progress.show(app.runAsync(
    async (data, proxy) => {
        const fs = require("fs");
        const files = fs.readdirSync(data.dir);
        for (let i = 0; i < files.length; i++) {
            // proxy.onProgress runs on the renderer — UI stays responsive
            await proxy.onProgress(`${i + 1}/${files.length}`);
            // ... process file ...
        }
        return files;
    },
    { dir: "C:/my-project" },
    { onProgress: (msg: string) => { progress.label = msg; } }
));
```

### With proxy — passing app API objects

```javascript
const result = await app.runAsync(
    async (data, proxy) => {
        const content = await proxy.fs.readFile(data.path);
        return JSON.parse(content);
    },
    { path: "C:/data.json" },
    { fs: app.fs }
);
```

### Key points

- **Self-contained function** — the function is serialized as a string, so it cannot reference variables from the outer scope. Pass everything it needs via `data` or `proxy`.
- **`data` vs `proxy`** — use `data` for values the worker needs fast (tight loops, local access). Use `proxy` when you need to call back into the renderer (progress updates, app API, UI dialogs).
- **Proxy property sets are fire-and-forget** — setting `proxy.something = value` sends the update but does not wait for confirmation. Use callback methods (`await proxy.onProgress(msg)`) when you need to be sure the renderer processed the call.
- **Node.js access** — `require("fs")`, `require("path")`, `require("child_process")`, npm packages, etc. all work inside the worker.
- **Worker lifecycle** — each `app.runAsync` call spawns a fresh worker and terminates it after completion. No state persists between calls.
- **Error handling** — errors thrown inside the worker propagate as rejected promises to the caller.

See the [app.runAsync() API reference](./api/app.md#runasyncfn-data-proxy) for full type signatures.

## Output Types

| Return Type | Result |
|-------------|--------|
| String | Written as-is |
| Number/Boolean | Converted to string |
| Object/Array | JSON formatted |
| Error | Error message + stack |
| undefined | "undefined" |

## Tips

1. **Use async/await** for asynchronous operations
2. **Return values** to set output content, or write to `page.grouped.content` directly for full control
3. **Use `ui`** for structured logging and inline dialogs instead of grouped page output
4. **Use `preventOutput()`** when displaying results via dialogs instead of the grouped page
5. **Set language** on grouped page for syntax highlighting: `page.grouped.language = 'json'`
6. **Use grid view** for tabular data: `page.grouped.editor = 'grid-json'`
