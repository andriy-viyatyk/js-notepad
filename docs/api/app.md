[← API Reference](./index.md)

# app

The root application object. Entry point to all app functionality.

Available as the global `app` variable in scripts.

```javascript
console.log(app.version);               // "1.0.17"
app.settings.set("theme", "monokai");
app.pages.activePage.content;
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `version` | `string` | Application version (e.g. `"1.0.17"`). Read-only. |
| [settings](./settings.md) | `ISettings` | Application configuration. |
| [pages](./pages.md) | `IPageCollection` | Open pages (tabs) in the current window. |
| [fs](./fs.md) | `IFileSystem` | File system operations and dialogs. |
| [ui](./ui.md) | `IUserInterface` | Dialogs and notifications. |
| [shell](./shell.md) | `IShell` | OS integration: open URLs, encryption, version info. |
| [window](./window.md) | `IWindow` | Window management: minimize, maximize, zoom, multi-window. |
| [editors](./editors.md) | `IEditorRegistry` | Read-only registry of all editors. |
| [recent](./recent.md) | `IRecentFiles` | Recently opened files. |
| [downloads](./downloads.md) | `IDownloads` | Global download tracking. |
| [proc](#proc) | `IProc` | Spawn external programs and stream their output. |
| [boards](#boards) | `IBoards` | Create and open [Boards](../boards.md) from scripts or agents. |
| `menuFolders` | `IMenuFolders` | User-configured sidebar folders. |

## Methods

### fetch(url, options?)

Make an HTTP request using Node.js. Unlike browser `fetch()`, this sends **only the headers you specify** — no automatic Chromium headers (Origin, User-Agent, Sec-Fetch-*, etc.). Returns a standard `Response` object.

```javascript
// Simple GET
const res = await app.fetch("https://api.example.com/users");
const data = await res.json();
```

```javascript
// POST with custom headers
const res = await app.fetch("https://api.example.com/users", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token123",
    },
    body: JSON.stringify({ name: "John" }),
});
const result = await res.json();
```

#### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `method` | `string` | `"GET"` | HTTP method. |
| `headers` | `Record<string, string>` | — | Request headers. Sent exactly as specified. |
| `body` | `string \| ReadableStream \| null` | — | Request body. |
| `timeout` | `number` | `30000` | Request timeout in milliseconds. |
| `maxRedirects` | `number` | `10` | Maximum number of redirects to follow. |
| `rejectUnauthorized` | `boolean` | `true` | Set to `false` to skip SSL certificate validation (e.g. self-signed certs). |

### openRawLink(href)

Open any link through Persephone's navigation pipeline — a local file path, a URL, or an in-app scheme (`persephone-board://`, etc.). Opens a new tab or reuses a matching one if it already exists.

```javascript
// Open a local file in a new tab
await app.openRawLink("C:/data/report.json");

// Open a URL in the built-in browser
await app.openRawLink("https://example.com");

// Open a Board by its root path (prefer app.boards.openBoard for boards)
await app.boards.openBoard("C:/work/boards/My Board");
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `href` | `string` | File path, URL, or in-app link scheme. |

**Returns:** `Promise<void>` — resolves after the navigation is dispatched.

---

### runAsync(fn, data, proxy?)

Run a function in a background worker thread. The renderer stays responsive while the function executes. The function runs in an isolated worker with full Node.js access (`require`, `fs`, `path`, `child_process`, npm packages, etc.).

The function is serialized as a string — it must be **self-contained** and cannot reference outer-scope variables (closures are lost). Pass all inputs via `data` (cloned) or `proxy` (proxied).

```javascript
// Simple: offload heavy computation
const files = await app.runAsync(
    async (data) => {
        const fs = require("fs");
        return fs.readdirSync(data.dir, { recursive: true });
    },
    { dir: "C:/projects/my-app/src" }
);
```

```javascript
// With proxy: progress updates from the worker
const progress = await app.ui.createProgress("Processing...");
const result = await progress.show(app.runAsync(
    async (data, proxy) => {
        const fs = require("fs");
        const files = fs.readdirSync(data.dir);
        for (let i = 0; i < files.length; i++) {
            await proxy.onProgress(`${i + 1}/${files.length}`);
        }
        return files;
    },
    { dir: "C:/my-project" },
    { onProgress: (msg: string) => { progress.label = msg; } }
));
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `(data: TData, proxy: TProxy) => Promise<TResult>` | Self-contained function to run in the worker. |
| `data` | `TData` | Plain serializable data cloned into the worker via structured clone. Supports: primitives, plain objects, arrays, `Map`, `Set`, `ArrayBuffer`, `Date`, `RegExp`. Does **not** support: functions, DOM elements, class instances, circular references. |
| `proxy` | `TProxy?` | Optional object transparently proxied back to the renderer. Every access on `proxy` inside the worker is async (round-trips via `postMessage`). Property sets are fire-and-forget — use callback methods (`await proxy.onProgress(msg)`) when confirmation is needed. |

**Returns:** `Promise<TResult>` — the value returned by `fn`, cloned back to the renderer.

See [Scripting — Background Workers](../scripting.md#background-workers-apprunasync) for usage guide and examples.

---

## proc

Spawn external programs and stream their output. Each call to `execute()` returns a handle — consume it either **one-shot** (buffer stdout to completion) or **streaming** (attach event listeners). Do not mix both modes on the same handle.

```javascript
// One-shot: run a script and parse its JSON output
const data = await app.proc.execute("python scripts/load.py").getJson();

// One-shot: capture plain text output
const output = await app.proc.execute("git log --oneline -10").getText();

// Streaming: render output as it arrives
const h = app.proc.execute("npm run build");
const dec = new TextDecoder();
h.on("stdout", (chunk) => console.log(dec.decode(chunk)));
h.on("exit", ({ code }) => console.log("Done, exit code:", code));

// With options: custom cwd and env
const result = await app.proc.execute("node index.js", {
    cwd: "C:/my-project",
    env: { DEBUG: "1" },
}).getText();
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `execute(command, options?)` | `IExecuteHandle` | Spawn a command line and return a process handle. The command runs through the OS shell by default (so `&&`, pipes, and inline arguments work). |

### IExecuteOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `cwd` | `string?` | app cwd | Working directory for the spawned process. |
| `env` | `Record<string, string>?` | — | Extra environment variables, merged over the inherited environment. |
| `shell` | `boolean \| string?` | `true` | Shell to use. `true` = OS default; a string picks a specific shell (`"bash"`, `"pwsh"`); `false` = run the executable directly without a shell. |
| `name` | `string?` | — | Optional job name. Mainly used by [Boards](../boards.md#long-running-processes-setboardbusy--getboardbusy--getjobs), where a busy board re-associates its surviving jobs by name after a reload. |

### IExecuteHandle

| Member | Description |
|--------|-------------|
| `jobId` | Unique ID for this job. |
| `getText()` | Buffer stdout to completion and decode as UTF-8 text. Rejects only on a spawn-level error. |
| `getJson(pattern?)` | Buffer stdout, then `JSON.parse`. Rejects on spawn error, non-zero exit, or parse failure. Pass a `RegExp` to extract JSON from noisy output (the last match is used; capture group 1 if present). |
| `getBytes()` | Buffer stdout to completion and return the raw `Uint8Array`. |
| `on("stdout" \| "stderr", cb)` | Stream binary chunks as they arrive. Attaching a listener switches to streaming mode (one-shot getters then throw). Returns an unsubscribe function. |
| `on("exit", cb)` | Fires once when the process exits. Callback receives `{ code, signal }`. |
| `on("error", cb)` | Fires once on a spawn-level failure (process never started). |
| `write(data)` | Write to the process's stdin (`string` or `Uint8Array`). |
| `endStdin()` | Close the process's stdin. |
| `kill(signal?)` | Terminate the process (default `"SIGTERM"`). |

---

## boards

Create and open [Boards](../boards.md). Boards created via this API are scaffolded from the built-in template, get a `board-manifest.json` identity file, and are **auto-trusted** — they open without a trust prompt.

```javascript
// Create a blank board in any folder and open it
const root = await app.boards.createBoard("My Board", "C:/work/boards");
await app.boards.openBoard(root);

// Create from the Demo template (rich annotated example)
const root = await app.boards.createDemoBoard("Demo", "C:/work/boards");
await app.boards.openBoard(root);

// Open an existing board by its root path
await app.boards.openBoard("C:/work/boards/Existing Board");
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `createBoard(name, dir)` | `Promise<string>` | Create a blank board named `name` inside container folder `dir` (created if needed). Returns the new board's absolute root path. Throws if a board named `name` already exists in `dir`. |
| `createDemoBoard(name, dir)` | `Promise<string>` | Same as `createBoard`, but scaffolds from the bundled Demo board template — a full working example of the bridge API, theme contract, and multi-tab layout. Returns the board root. |
| `openBoard(boardRoot)` | `Promise<void>` | Open an existing board by its absolute root folder path (the folder containing `board-manifest.json`). Opens a new tab or reuses an existing one. Boards created by Persephone open immediately; foreign boards prompt for trust. Throws if `boardRoot` is missing or has no `board-manifest.json`. |
| `registerBoard(boardRoot)` | `Promise<boolean>` | Trust an existing board on disk — shows the user a trust dialog (a script can never trust a board without that click). Resolves to whether the board ended up trusted (`true` also when already trusted, including via a trusted ancestor folder). Use after downloading/reviewing a board. |
| `unregisterBoard(boardRoot)` | `Promise<void>` | Untrust a board and remove its pin. No dialog — untrusting only reduces privilege. Idempotent. |
| `renameBoard(boardRoot, newName)` | `Promise<string>` | Rename a board's folder, carrying its trust, pin, and catalog-install registration to the new path with no dialog, and re-pointing any open page for it. Returns the new root. Throws if the board is busy, not a board, or the new name already exists. |

### Published boards catalog

Persephone ships against a small **catalog of boards published by the project** (ready-made custom editors and tools — see [Boards — Published boards catalog](../boards.md#published-boards-catalog--discover-install-update)). These methods let a script or AI agent drive the whole discover → download → review → install → update lifecycle, always through the same one-click trust rule as the rest of the API — a script can download and inspect a board, but only the user's dialog click can trust it.

```javascript
// Find a published board, download it for review, then ask the user to trust it
const results = await app.boards.searchPublished("drawio");
const root = await app.boards.downloadPublished(results[0].id); // no trust yet
// ...inspect the files at `root`...
const trusted = await app.boards.registerBoard(root); // shows the trust dialog

// Interactive install/update/rollback via the Board Info screen
await app.boards.installPublished("drawio-viewer");
await app.boards.installPublished("drawio-viewer", { version: "1.0.0" }); // rollback

// Check for updates and uninstall
const updates = await app.boards.checkPublishedUpdates(true);
await app.boards.uninstallBoard("drawio-viewer");
```

| Method | Returns | Description |
|--------|---------|-------------|
| `searchPublished(query?)` | `Promise<PublishedBoardResult[]>` | Search the catalog by name/description/file mask; each result is annotated with install state (`installed`, `installedVersion`, `updateAvailable`, `compatible`). Read-only, no dialog. |
| `getPublishedVersions(id)` | `Promise<PublishedVersionResult[]>` | A published board's full version history (newest first), each entry annotated with `compatible` and `installed`. Read-only, no dialog. |
| `downloadPublished(id, opts?)` | `Promise<string>` | Download + verify (sha256) + extract a board to disk and record it in the install registry — **no dialog, no trust**. The board sits inert on disk, ready to review. `opts: { dir?, version? }`. Returns the install root. |
| `installPublished(id, opts?)` | `Promise<string \| undefined>` | Interactive install: opens the Board Info page for **Download → Register** (fresh install) or auto-runs a version swap (update/rollback) if `id` is already installed and `opts.version` is given. Resolves the root, or `undefined` if the user abandons it. |
| `uninstallBoard(id)` | `Promise<boolean>` | Uninstall a catalog-installed board: shows the delete confirmation, then removes its folder, trust, pin, and install-registry entry. |
| `checkPublishedUpdates(force?)` | `Promise<BoardUpdateInfo[]>` | Refresh the catalog and return installed boards with a compatible newer version available. No dialog. |

---

## menuFolders

Manage sidebar folders (persisted to `menuFolders.json`).

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `folders` | `IMenuFolder[]` | Current list of configured folders. |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `add({ name, path?, files? })` | `string` | Add a folder. Returns the generated ID. |
| `remove(id)` | `void` | Remove a folder by ID. |
| `find(id)` | `IMenuFolder \| undefined` | Find a folder by ID. |
| `move(sourceId, targetId)` | `void` | Reorder folders. |

### IMenuFolder

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique folder ID. |
| `name` | `string` | Display name. |
| `path` | `string?` | Folder path on disk. |
| `files` | `string[]?` | Explicit list of file paths (virtual folders). |

```javascript
// List all sidebar folders
app.menuFolders.folders.forEach(f => console.log(f.name, f.path));

// Add a project folder
app.menuFolders.add({ name: "My Project", path: "C:/projects/my-app" });
```
