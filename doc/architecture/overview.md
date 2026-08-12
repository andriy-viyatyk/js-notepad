# Architecture Overview

> Read this document before creating new modules or making architectural changes.

## Application Type

persephone is an **Electron desktop application** — a Windows Notepad replacement designed for developers. It combines:
- Monaco Editor (VS Code engine) for text editing
- Custom editors for specific file types (Grid, Markdown, Notebook, etc.)
- JavaScript/TypeScript execution environment for data transformation
- Built-in browser with multi-tab support

## Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Application                      │
├─────────────────────┬───────────────────────────────────────┤
│    Main Process     │          Renderer Process             │
│    (Node.js)        │          (Chromium + React)           │
├─────────────────────┼───────────────────────────────────────┤
│ - Window management │ - React UI                            │
│ - System tray       │ - Monaco Editor                       │
│ - File dialogs      │ - Object Model (app.*)                │
│ - Named Pipe server │ - Script execution                    │
│ - MCP HTTP server   │ - MCP command handler                 │
│ - Native menus      │ - Editor system                       │
│ - Version service   │                                       │
└─────────────────────┴───────────────────────────────────────┘
         │                           │
         └───────── IPC ─────────────┘
              (Inter-Process Communication)
```

### Key Characteristics

- **nodeIntegration: true** — Renderer has full Node.js access
- **contextIsolation: false** — Direct Node.js in renderer
- Scripts can `require()` any Node.js module or npm package
- Multi-window support — each window has its own `app` instance

## Object Model

The **Object Model** is the central architectural concept. It provides a single, typed API (`app.*`) that all consumers use — React components, user scripts, and coding agents all access the same interfaces.

```
  Consumers:   React UI  │  User Scripts  │  Coding Agents
                 │               │                │
  Access:    direct import  │  app/page globals  │  .d.ts types
                 │               │                │
  Object Model:  app.settings, app.fs, app.pages, app.window, app.ui, ...
                 │
  Implementation:  /src/renderer/api/  (one module per interface)
```

### Key interfaces

| Interface | Access | Purpose |
|-----------|--------|---------|
| `app.settings` | `ISettings` | Theme, user preferences |
| `app.editors` | `IEditorRegistry` | Available editors, resolution |
| `app.recent` | `IRecentFiles` | Recently opened files |
| `app.fs` | `IFileSystem` | File I/O, dialogs, paths |
| `app.window` | `IWindow` | Window state, zoom, multi-window |
| `app.shell` | `IShell` | OS integration, screen snip, encryption, version |
| `app.ui` | `IUserInterface` | Dialogs, notifications, element highlights |
| `app.downloads` | `IDownloads` | Download tracking |
| `app.menuFolders` | `IMenuFolders` | Sidebar folder shortcuts |
| `app.pages` | `PagesModel` | Page/tab collection, lifecycle |
| `app.proc` | `IProc` | Spawn external processes + stream output (scripts, boards) |

Type definitions live in `/src/renderer/api/types/*.d.ts` and serve triple duty:
1. TypeScript compilation contracts
2. Monaco IntelliSense for user scripts (auto-copied to `assets/editor-types/`)
3. Documentation via JSDoc comments

## Bootstrap Sequence

Each renderer window bootstraps via `src/renderer.tsx`:

```
1. app.init()          ──  Fetch version from main process
2. app.initSetup()     ──  Configure Monaco (themes, languages, types)
3. import(index)       ──  Load main bundle, register editors
4. app.initServices()  ──  Load all Object Model interfaces (settings, fs, ui, ...)
5. app.initPages()     ──  Restore persisted pages, handle CLI args
6. app.initEvents()    ──  Subscribe to global/keyboard/IPC events, init MCP handler
7. api.windowReady()   ──  Signal main process → window shown
8. React renders       ──  UI appears with pages ready
```

Steps 1-3 run in parallel. Steps 4-7 are sequential (each depends on the previous).

## Renderer Architecture

```
/src/renderer/
├── api/              # Object Model — application interfaces
├── ui/               # Application shell (layout, tabs, sidebar, dialogs)
├── editors/          # ALL editor implementations (lazy-loaded)
├── content/          # Content delivery — providers, transformers, pipes
├── scripting/        # Script execution engine and API wrappers
├── automation/       # Browser automation — Playwright-compatible MCP tools
├── uikit/            # Standalone component library (canonical home for primitives)
├── components/       # Persephone-coupled components (icons, page-manager, file-search, tree-provider, git-tree)
├── core/             # State primitives and utilities
├── theme/            # Colors, icons, theme definitions
└── types/            # Global type declarations
```

### Layer Responsibilities

| Layer | Responsibility | Key files |
|-------|---------------|-----------|
| **api/** | Object Model interfaces + implementations | `app.ts`, `settings.ts`, `fs.ts`, `pages/`, `internal/`, `types/` |
| **ui/** | Application shell, tabs, sidebar, dialogs | `MainPage.tsx`, `PageTabs.tsx`, `MenuBar.tsx`, `Dialogs.tsx` |
| **editors/** | File type handling, content editing | `registry.ts`, `text/`, `grid/`, `browser/`, etc. |
| **content/** | Content I/O pipeline — providers, transformers, pipes | `ContentPipe.ts`, `parsers.ts`, `resolvers.ts`, `providers/`, `transformers/` |
| **scripting/** | Script sandbox, API wrappers, facades | `ScriptRunner.ts`, `ScriptContext.ts`, `api-wrapper/` |
| **automation/** | Playwright-compatible browser MCP tools, CDP, input, refs | `commands.ts`, `input.ts`, `ref.ts`, `snapshot.ts` |
| **uikit/** | Standalone reusable component library (EPIC-025) | `Button/`, `Menu/`, `Tree/`, `ListBox/`, `Select/`, `RenderGrid/`, `AVGrid/`, … — see `uikit/index.ts` |
| **components/** | Persephone-coupled components only (KEEP-only) | `icons/`, `page-manager/`, `file-search/`, `tree-provider/`, `git-tree/` |
| **core/** | State primitives, utilities | `state/` (TOneState, TModel), `utils/` |
| **theme/** | Design tokens, themes | `color.ts`, `themes/` |

### Dependency Rules

1. **`core/`** is the foundation — no imports from other renderer layers
2. **`uikit/`** is the standalone library — imports only `core/` and `theme/`. No imports from `api/`, `ui/`, `editors/`, or app-specific code (the contract that lets `uikit/` be split into a separate package later)
3. **`components/`** is persephone-coupled by definition — each remaining folder (`icons/`, `page-manager/`, `file-search/`, `tree-provider/`, `git-tree/`) uses `api/`, the page model, file system, or scripting. New pure primitives do NOT go here — they go in `uikit/`. **Sanctioned exception:** `components/icons/LanguageIcon.tsx` imports `custom-editor-registry` and `BoardGlyph` from `editors/board/` so a file claimed by a trusted custom-editor board shows that board's icon wherever files are listed. This is a deliberate, accepted upward import (no actual import cycle exists); the sibling `EditorIcon` resolver stays decoupled by duck-typing instead (see [editors.md](./editors.md#editor-icons))
4. **`api/`** implements the Object Model — imports `core/`, uses IPC
5. **`content/`** implements the I/O pipeline — imports `core/`, `api/types/`
6. **`editors/`** implement page types — import `core/`, `uikit/`, `components/`, `api/`, `content/`
7. **`scripting/`** wraps `api/`, `editors/`, and `content/` for safe script access
8. **`automation/`** implements browser MCP tools — imports `api/`, `editors/`, `ipc/`; loaded via dynamic import from `mcp-handler.ts`
9. **`ui/`** orchestrates everything — imports all layers
10. Lower layers must NOT import from higher layers

## Key Subsystems

### 1. State Management

See [state-management.md](./state-management.md).

- Custom reactive primitives in `core/state/` (TOneState, TModel, TComponentModel)
- Object Model interfaces in `api/` use these primitives internally
- `EditorModel<TState>` base class for all editors

### 2. Editor System

See [editors.md](./editors.md).

- All editors in `/editors/` — every editor is an `EditorModel` subclass (31 editor IDs as of current catalog)
- Text-bearing editors compose an `IContentHost` (`TextFileModel` for file-backed, `NoteItemEditModel` for notebook notes) and expose `CONTENT_HOST_TRAIT` for owner-orchestrated switching
- Dynamic loading via `import()` for code splitting
- Scripting facades expose editor APIs via `page.asX()` methods

### 3. Scripting System

See [scripting.md](./scripting.md).

- JavaScript/TypeScript execution with `page` and `app` globals
- TypeScript transpilation via sucrase (lazy-loaded, type stripping only)
- Full Node.js and React access for scripts
- API wrappers (AppWrapper, PageWrapper) provide safe, typed access
- Editor facades (TextEditorFacade, GridEditorFacade, etc.) for typed editor operations
- Auto-cleanup of event subscriptions on script completion
- Monaco IntelliSense via `.d.ts` files

### 4. MCP Integration (Model Context Protocol)

- External AI agents (Claude Desktop, Claude Code) control persephone via a Streamable HTTP MCP server
- Protocol: MCP over HTTP at `http://127.0.0.1:{port}/mcp` (default port 7865)
- Main process: `mcp-http-server.ts` accepts connections using `@modelcontextprotocol/sdk`, forwards requests to renderer via IPC
- Renderer process: `mcp-handler.ts` dispatches the core page/script commands (`execute_script`, `list_pages`, `get_page_content`, `get_active_page`, `create_page`, `set_page_content`, `get_app_info`, `open_url`, `ui_push`), the board tools (`create_board`, `open_board`, `board_refresh`), and the Agent Tools registry meta-tools (`search_tools`, `execute_tool`, `refresh_toolset`, `create_toolset` — a constant-size surface over an arbitrary number of registered tools; see [folder-structure.md](folder-structure.md) `api/tools/`)
- Page-content reads adapt to the page type: `get_page_content` / `get_active_page` return text-host source text when present; otherwise, an editor with the `IImageExport` capability (image viewer) renders to PNG and the server returns it as an MCP **image content block** (agents see the picture directly; works for background pages — `exportPng` is headless; images over a ~5 MB base64 cap degrade to a hint pointing at `page.asImage().savePngToFile()`); all other non-text pages return a one-line `hint` naming the right tool (`browser_*`, board guide, `filePath`, or `execute_script` facades)
- Multi-window support: all tools accept optional `windowIndex` parameter (defaults to first open window). `list_windows` tool runs in main process (no IPC) to discover windows and their status. `open_window` tool reopens closed windows with persisted pages.
- Browser profile support: browser pages report `profileName` / `isIncognito` / `isTor` / active-tab `url` in page metadata (`url` omitted for incognito/Tor); `get_app_info` lists `browserProfiles` + `defaultBrowserProfile`; every `browser_*` tool accepts optional `pageId` / `profileName` to deterministically target a browser page — see [browser-editor.md](browser-editor.md) "Browser Automation (MCP)".
- App-window automation: the `browser_*` tools also drive Persephone's own UI with `pageId: "app"` (snapshot/click/type/press_key/screenshot/evaluate the tab strip, sidebar, dialogs, and active editor) — explicit-only (never resolved by fallback), no registration (the calling window's own webContents is the target), behind the same `mcp.browser-tools.enabled` gate; see [browser-editor.md](browser-editor.md) "App-Window Target".
- Log View integration: `ui_push` tool pushes log entries, dialogs, and output items to a managed Log View page. Tracks an "active MCP log page" per window (auto-creates on first call, reuses on subsequent calls). Dialog entries block until user responds (infinite IPC timeout). This is the recommended output channel for AI agents.
- MCP resources & `read_guide` tool: focused guides (`assets/mcp-res-*.md`) exposed as MCP resources (`persephone://guides/*`) and also available via the `read_guide` tool (for clients that cannot read MCP resources, e.g. Claude Desktop). Guides cover: `overview` (start-here mental model + task→tool→guide routing), `ui-push`, `pages`, `scripting`, `graph`, `notebook`, `links`, `boards`, `tools`, `browser` (targeting resolution, snapshot/ref lifecycle, waiting), plus `persephone://guides/full` (concatenated). Every guide carries an "Errors & verification" section describing what failures actually look like in tool responses. Tool descriptions warn agents to read guides before using structured editors or dialogs.
- MCP validation: `mcp-handler.ts` validates dialog entries (known properties, required fields) and `output.grid` content (must be string, valid JSON array). Returns descriptive errors with correct usage examples to guide AI agents.
- Opt-in via `mcp.enabled` setting — server starts/stops dynamically based on setting changes
- Port is configurable via `mcp.port` setting (default `7865`)
- Script execution uses `ScriptRunner.runWithCapture()` for headless operation with console capture
- Status broadcasting: main process pushes `eMcpStatusChanged` events to all windows on server start/stop and session connect/disconnect — renderer `Window` class holds reactive `mcpRunning`/`mcpClientCount` state, UI shows a title-bar indicator
- Session lifecycle: each client gets one Streamable HTTP session (`McpServer` + transport) kept in a `sessions` map. A session is evicted on explicit `DELETE`, on an idle-timeout reaper (closes sessions with no traffic for 30 min; swept every 60 s — each request bumps a per-session `lastActivity`), or on a `MAX_SESSIONS` cap (evicts least-recently-active on `initialize`). All eviction paths funnel through `transport.close()` → `onclose` → map delete. Sessions deliberately outlive a dropped SSE stream so reconnecting clients keep working; without the reaper, clients that quit without sending `DELETE` would leak sessions indefinitely.

### 5. Content Delivery Pipeline

Unified content I/O layer in `/src/renderer/content/` that decouples editors from data sources.

**Architecture:**
- **IProvider** — data backend (FileProvider, CacheFileProvider, HttpProvider). Reads/writes raw bytes.
- **ITransformer** — data effect applied in chain (ArchiveTransformer, DecryptTransformer). Bidirectional read/write.
- **IContentPipe** — composes a provider with transformers. Handles encoding detection (`readText()`/`writeText()`).
- **IPipeDescriptor** — serializable pipe state for persistence across app restarts.

**3-layer open flow** (all layers pass a single `ILinkData` object):
1. **Parsers** (`parsers.ts`): parse raw href, enrich ILinkData (`openRawLink` → `openLink`)
2. **Resolvers** (`resolvers.ts`): build pipe + resolve target editor (`openLink` → `openContent`)
3. **Open Handler** (`open-handler.ts`): consume pipe, create page

**Dual pipe pattern:** TextFileIOModel maintains two pipes — primary (source file/URL) and cache (auto-save). Both share the same transformer chain, ensuring cached content has the same format as the source (e.g., encrypted files stay encrypted in cache).

**Script access:** The `io` global namespace exposes providers, transformers, `createPipe()`, `createLinkData()`, and `linkToLinkData()` to scripts.

### 6. Trait System

See [trait-system.md](./trait-system.md).

- Universal mechanism for drag-and-drop type negotiation — replaces React-DnD and ad-hoc string checks
- Core primitives in `core/traits/`: `TraitKey<T>`, `TraitSet`, `Traited<V>`, `traited()`, `isTraited()`
- `TraitRegistry` maps serializable `TraitTypeId` strings to `TraitSet` objects (bridges DnD serialization boundary)
- All drag-and-drop is native HTML5; `setTraitDragData`/`getTraitDragData`/`hasTraitDragData`/`resolveTraits` utilities in `core/traits/dnd.ts`
- Only `ILink` has a registered TraitSet; other `TraitTypeId` values are type discriminators for within-component reorder

### 7. Theming System

- CSS Custom Properties — `color.ts` returns `var()` references, theme definitions set actual values on `:root`
- 55+ component files import `color` unchanged — zero migration when adding themes
- Theme definitions in `src/renderer/theme/themes/` (one file per theme, 9 themes)
- Monaco editor has separate theme integration via `onMonacoThemeChange` callback
- Startup: synchronous `fs.readFileSync` + inline `<script>` in `index.html` for flash-free startup

### 8. Mneme Knowledge-Base Service

**Mneme** is a standalone, single-binary **Rust** service (`mneme/`, alongside `launcher/` and `snip-tool/`) that indexes a tree of markdown documents for full-text and semantic search and exposes a **single MCP interface**. The files on disk are the source of truth; the SQLite index is a derived, rebuildable artifact.

- **Separate process, not in the Electron bundle.** Built in CI via `cargo build --release` and shipped beside `persephone.exe`; not wired into `npm start` / `npm run dist`. Persephone manages it as a Tor-style sidecar — an optional feature (off by default) that the renderer auto-launches and stops based on a settings toggle.
- **One transport — Streamable HTTP on loopback** (`127.0.0.1/mcp`, no auth locally). The same server serves Persephone *and* external agents (e.g. Claude Code) concurrently. Persephone consumes it through a single shared MCP client (`mnemeConnection`, wrapping one auto-reconnecting `McpConnectionManager`) that refcounts resource subscriptions and multiplexes change notifications out to per-document watchers.
- **Tool surface** (bare, file-like names): `read`/`write`/`upload`/`edit`/`delete`/`mkdir`/`rename`/`glob`/`grep` (addresses are `{root}/{path}`; the whole root is visible like a filesystem — `include`/`ignore` only scope indexing/search), `search` (`text` FTS5 / `vector` sqlite-vec KNN / `hybrid` RRF default, model on DirectML→CPU via `ort`), views `tree`/`timeline`/`tags`, and management `add_root`/`remove_root`/`list_roots`/`reindex`/`status`/`model_update`/`root_config`/… Resources: documents/attachments at `mneme://{root}/{path}`, the agent guide at `mneme://guide`, and a status snapshot at `mneme://status`; resource subscriptions (`subscribe` + `listChanged`) drive Persephone's live refresh.
- **Index is versioned & rebuildable** — `.mneme/<model>-<precision>/index-v<schemaVer>.db` per root; a model/precision or schema-version change selects a fresh DB (full rebuild from files), no migration code.
- **Persephone-side integration (renderer).** Content flows through the standard delivery pipeline: `MnemeProvider` reads/writes/edits a document over the shared connection (with live-refresh), and `MnemeTreeProvider` browses a root like a filesystem. They back two link schemes — `mneme://{root}/{path}` for documents/attachments and `mneme-folder://` for a root. The UI surface is a config & monitoring editor (roots, include/ignore, reindex progress, model update, log), a root **search** editor with an Explorer-like sidebar tree (create/rename/delete, drag-drop import), and a provider indicator in the editor chrome. Relative `mneme://` image links open in the Image viewer.
- **Crate detail lives in the crate.** This section is only an architectural pointer; the crate's own [`mneme/README.md`](../../mneme/README.md) (module layout, MCP surface, build/test, invariants) is the primary reference. Mneme is kept self-contained / extraction-ready, so it follows its own Rust conventions, not the renderer coding standards.

### 9. Board Subsystem

A **Board** is a small local web application (plain HTML + JS) owned by the user, hosted in an in-DOM cross-origin `<iframe>`. A board is any folder carrying a `board-manifest.json` identity file — it can live anywhere on disk. The Create-board dialog defaults the target to the current Explorer root (when one is open); a board can be created at any path.

**Security model:**
- The board loads in a plain `<iframe src="board://<host>/index.html">` rendered in the host renderer's DOM — no `sandbox` attribute (a bare `sandbox` forces an opaque origin with no stable per-board storage). Each board gets a **distinct cross-origin** `board://<host>` origin, where `host` is a stable hash of the normalized board root minted by `registerBoard` in the main process. Isolation from the Node-privileged host comes from the Same-Origin Policy (a cross-origin child cannot reach `window.parent`), `nodeIntegrationInSubFrames: false`, and the served CSP — adequate for trusted, user-authorized local code. Because the iframe lives in the DOM, all host overlays (page-tab context menu, dropdowns, dialogs, command palette, tooltips) compose over it naturally. This mirrors VS Code's editor-webview model.
- The `board://` protocol is registered **once** on the shared host session and routes by **host → board root** (a `Map` registry, populated on board open, dropped on close). It serves the board's local files; the CSP (`connect-src 'self'`) blocks all remote network access — CDNs, fetch, XHR to external hosts are all forbidden. Distinct `board://<host>` origins give per-board `localStorage`/IndexedDB/cookie isolation without separate session partitions. Per-board origin isolation replaces process-level isolation; the trade-off is accepted because a board is the user's own trusted code (it can already run arbitrary processes via `execute()`).
- Trust is **per board**: only boards the user has explicitly trusted render. The decision is persisted by `board-trust.ts` (a path-keyed registry, `trustedBoards.txt` under `<userData>/persephone/data/`) and never read from the manifest or any in-board file — a received board cannot self-trust. Foreign boards prompt a "Trust board" dialog on first open; boards created through Persephone's own API (`app.boards.createBoard`/`createDemoBoard`, user or agent) are auto-trusted at creation. Trust is inherited down the tree — a board nested inside a trusted folder is trusted automatically, and the registry never holds an ancestor/descendant pair (outer wins). This trusted-boards list also *is* the known-boards registry surfaced in the sidebar.

**Bridge (`window.persephone`):**
- An `<iframe>` cannot run an Electron preload/`contextBridge`, so the bridge is delivered over a `MessagePort` RPC instead. Main mints a `MessageChannelMain` port pair **per board**; the renderer brokers a one-time handshake — it requests a port on mount and, on the iframe's `load`, transfers `port1` into the frame with explicit `targetOrigin: "board://<host>"`. Thereafter the board talks **directly** to a main-process handler over the duplex port (the host is out of the data path). A small in-board shim (`src/board-shim.ts`, built as a self-contained browser IIFE) rebuilds the `window.persephone` surface over the port and is inlined into served board HTML `<head>` by the `board://` handler — so `window.persephone` exists synchronously before the first author script. Port-dependent calls made before the handshake queue, then flush on connect.
- `execute(commandLine, opts)` — thin client over `command-runner.ts` in the main process. Returns an `IExecuteHandle` (buffered: `getText`/`getJson`/`getBytes`; streaming: `on("stdout"|"stderr"|"exit"|"error")`, `write`, `kill`). `opts.name` gives a job a caller-chosen name — the re-association key for `getJobs()` (below). The same main-process command runner backs `app.proc.execute()` in scripts.
- Integration tier: `openRawLink(href, opts?)` (optional `{ editor }` requests a specific editor — e.g. `"md-view"` — routed via `ILinkData.target`), `notify(msg, type)`, `openFileDialog` / `saveFileDialog` / `openFolderDialog`, and `readFile(path, opts?)` / `writeFile(path, data, opts?)` (relative paths resolve against the board root; text or `base64`; a sanctioned persistence primitive that avoids shelling a script).
- Process retention (busy boards): by default, everything a board spawned is tree-killed when its iframe unloads (page navigation or board reload). `setBoardBusy(true)` opts out — main keys job sinks by the owning `BoardEditorModel` id (stable across mounts) and keeps a busy owner's jobs when the port is disposed; the model itself survives navigation as an invisible ownership handle, so page/tab close (or app quit) still kills everything. The renderer is the authoritative busy holder (shim → host-frame `postMessage` → model → IPC mirror to main). On re-open the board reinitializes itself: `getBoardBusy()` (carried in the port handshake) and `getJobs()` — live jobs including previous board lifetimes, re-associated by the `execute()` `name`, control-only (kill/stdin work; no output streaming, output produced while unloaded is dropped). The Boards panel shows a green "running" dot for busy boards; a cross-window page move kills a busy board's processes.
- Theme/tokens: `--p-*` CSS variables are injected into the served HTML `<head>` at serve time by the `board://` handler, so the first paint is themed (no white flash). Live theme switches are pushed host→board over the port. Also available as `persephone.theme` / `persephone.tokens` (snapshots) and `persephone.getTheme()` / `persephone.getTokens()` (live). `persephone.onThemeChange(cb)` fires on every switch.

**Reload & failure reporting:** Boards do not auto-reload; the manual **Reload** toolbar action and the `board_refresh` MCP tool remount the iframe to pick up edited files. Each load starts a fresh `ui.log` (reset to a single "board loaded" line, so the log only ever holds the current board lifetime — clicking Show-log never opens an empty page). Load failures funnel into that `ui.log` (and a toast for "board failed to load"): the main process reports navigation failures via `did-fail-load` filtered to the board frame and a missing-document log line for 404s; the shim reports CSP violations (`securitypolicyviolation`) and uncaught author errors (`window.onerror`/`unhandledrejection`) over a direct board→host-frame `postMessage`; and a handshake watchdog flags a board that paints but whose bridge never connects.

**Board structure:** `board-manifest.json` (identity marker — descriptive metadata only, no behavior-driving or trust fields), `index.html`, `app.js`, `style.css`, `board-base.css` (shared base with page defaults + themed scrollbars), optional `scripts/` folder, optional `icon.svg`/`png`/`ico` (shown in tab, boards tree, sidebar).

**Lifecycle & open-by-link:** `app.boards` is the renderer Object Model API for board lifecycle — `createBoard` / `createDemoBoard` / `openBoard`, plus a **register/rename** layer (`registerBoard` shows the trust dialog and may return `false`; `unregisterBoard`; `renameBoard` transfers existing trust with no dialog) and the **published-catalog** operations (`searchPublished` / `getPublishedVersions` / `downloadPublished` / `installPublished` / `uninstallBoard` / `checkPublishedUpdates`). Its guiding invariant is *the API requests, the user's dialog click grants*: a script can never self-trust, but it can drive the whole discover→download→review→register→update lifecycle with at most one dialog click per privilege step. The `create_board` / `open_board` MCP tools (plus the `read_guide("boards")` agent guide) wrap the lifecycle so an agent can create a board at a user-specified path, open it, and develop it without user clicks. A board is opened by routing the `persephone-board://` in-app link scheme (encode/decode in `persephone-board-link.ts`, parsed in `parsers.ts` → `target: "board-view"`) through the canonical `openRawLink` pipeline — the same seam that also forwards a `filePath` to a custom-editor board.

**Published catalog:** boards published to a GitHub repo (`andriy-viyatyk/persephone-boards`) can be discovered and installed in-app. The main-process `published-boards-service.ts` fetches the raw `boards-manifest.json` (24h-gated, cached for offline use, and `isSafeBoardId`-guarded so a traversal/separator `id` never becomes an install path); a `board-download-service.ts` streams the per-board release ZIP with an incremental sha256 verify. On the renderer, `published-boards.ts` holds the catalog reactively, and `board-install.ts` / `board-install-registry.ts` / `board-updates.ts` handle the sha256-verified download → extract → registry-record install (which trusts *nothing* — the code lands on disk inert for review), in-place folder-swap updates and rollbacks that never destroy a working board, and silent update detection. Installation and properties both flow through the **Board Info editor** (`editors/board-info/`); registration is always the separate `showTrustBoardDialog` consent step, so an installed catalog board is indistinguishable from a locally-authored trusted board once registered. A catalog entry may declare a **screenshot** — a bare file name, guarded like the `id` because it is interpolated into a raw URL, and resolved to a URL as the catalog leaves the service rather than stored with it. It is shown on the catalog surfaces, loaded directly from the repo, and excluded from the release ZIP; see [editors.md](editors.md) for the full contract.

**Discovery & switching:** Boards are listed wherever a `BoardsTree` is rendered — a shared, fully-expanded tree (folders compacted VSCode-style; `BoardsTree.tsx` over the pure `boards-tree-build.ts`) fed from the trusted-boards registry. Three surfaces share it: the **Explorer-sibling "Boards" panel** (`BoardsSecondaryView`, backed by `ExplorerEditor` exactly like Search, scoped to the Explorer root), the global **"Tools & Editors → Boards" tab** (`TrustedBoardsList.tsx`, all trusted boards across roots), and the **in-board toolbar** switcher popover. Boards are pinnable alongside built-in editors — pins are one unified ordered list over the `pinned-editors` setting (`pinned-items.ts`, boards stored as `board:<root>`). The Explorer also adds an "Open Board" trailing button on `board-manifest.json` rows; the row's normal click still opens the JSON in Monaco. An open board carries its own Persephone toolbar (`BoardToolbar`): Reload, Show-log, the full board path (click → switcher popover), a Properties button (→ Board Info), and a File Explorer button that opens the sidebar Explorer rooted at the board's parent folder. Opening a file whose mask a not-yet-installed catalog board claims adds a `"+"` segment to the editor switch (`Text | +`) that leads to the Board Info install screen. The "Tools & Editors" sidebar panel has an "Open in new tab" button that opens the full-page **hub** (`editors/tools-hub/`), whose "Search boards" tab browses the published catalog; pin affordances everywhere are gated to *standalone* boards (`isBoardStandalone` — a file-viewer board that needs a file is not pinnable).

**MCP automation:** Boards are `browser_*` targets. `list_pages` returns board pages with `editor: "board-view"` and a `selectedBoard` field; all `browser_*` tools (snapshot, click, type, evaluate, …) work by `pageId`.

**Recommended components** in `boards-assets/`: a catalog of 11 vetted libraries — av-grid (the default data grid; **no skin**, it reads `--p-*` itself), plus 10 with pre-built skins (Tabulator, Chart.js, Flatpickr, Tom Select, marked/highlight.js, Mermaid, Split.js, SortableJS, Tippy.js, native `<dialog>`). Described in `boards-assets/manifest.json`; adoption playbook in `boards-assets/README.md`.

## Design Principles

### 1. Core First
Keep the core text editing experience fast and lightweight. Heavy features load on-demand.

### 2. Async Imports for Editors
```typescript
// CORRECT - async import preserves code splitting
const getArchiveModule = async () =>
    (await import("../editors/archive")).default;

// WRONG - synchronous import increases main bundle
import archiveModule from "../editors/archive";
```

### 3. Container with Building Blocks
persephone provides UI building blocks (toolbar, editors, grouped pages). Users bring their own integrations via Node.js/npm — the app doesn't need built-in database or API integrations.

### 4. Consistent Editor Structure
Every editor follows the same pattern:
```
/editors/[name]/
├── index.tsx             # EditorModule registration (factory + matchers)
├── [Name]Editor.ts       # EditorModel subclass — state, lifecycle, business logic
├── [Name]Body.tsx        # React component (or [Name]View.tsx for older naming)
└── components/           # Editor-specific (optional)
```

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React Component | PascalCase.tsx | `TextEditor.tsx` |
| Model/State | PascalCase.ts | `PagesModel.ts`, `GridViewModel.ts` |
| Utility | kebab-case.ts | `csv-utils.ts` |
| Types | kebab-case.d.ts | `page.d.ts`, `settings.d.ts` |
| Index | index.ts | `index.ts` |

## Related Documentation

- [Folder Structure](./folder-structure.md) — Detailed folder organization
- [Editors](./editors.md) — Editor system architecture
- [Browser Editor](./browser-editor.md) — Multi-process browser editor
- [State Management](./state-management.md) — State patterns and primitives
- [Scripting](./scripting.md) — Script execution and API wrappers
- [Pages Architecture](./pages-architecture.md) — Pages lifecycle and submodels
- [Context Menu](./context-menu.md) — Context menu event flow, bubbling, and EventChannel integration
- [Trait System](./trait-system.md) — Drag-and-drop type negotiation, TraitRegistry, native HTML5 DnD patterns
