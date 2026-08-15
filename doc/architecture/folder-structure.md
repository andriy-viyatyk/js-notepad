# Folder Structure

Detailed organization of the codebase. Verified against actual source files.

## Root Structure

```
persephone/
├── src/                    # Source code
│   ├── main/               # Electron main process
│   ├── renderer/           # React frontend (see below)
│   ├── ipc/                # IPC communication layer
│   ├── shared/             # Shared types, constants and cross-process helpers (errMessage, the execute() handle state machine)
│   ├── renderer.tsx        # Bootstrap entry point
│   ├── preload.ts          # Preload script (main renderer)
│   └── board-shim.ts       # Board bridge shim — browser IIFE inlined into board HTML; rebuilds window.persephone over a MessagePort
├── launcher/               # Rust launcher (Named Pipe client)
│   ├── src/main.rs
│   ├── build.rs
│   └── Cargo.toml
├── scripts/                # Build scripts
│   ├── dev.mjs             # Dev orchestrator (npm start) — Vite renderer dev server + HMR, watch-builds main/preload/preload-webview/board-shim/search-worker, launches Electron with restart-on-change
│   ├── build-prod.mjs      # Vite production build (main, preload, preload-webview, renderer, board-shim, search-worker)
│   └── vmp-sign.mjs        # electron-builder afterPack hook for Widevine VMP signing
├── assets/                 # Static assets
│   ├── editor-types/       # GENERATED — Vite plugin auto-copies .d.ts files from src/renderer/api/types/ (never hand-edit)
│   ├── icons/              # App icons
│   ├── excalidraw/fonts/   # Self-hosted Excalidraw fonts (woff2, OFL-1.1 licensed)
│   ├── script-library/     # Bundled example scripts (copied to user library on setup)
│   ├── mcp-res-overview.md # MCP resource: start-here mental model + task→tool→guide routing
│   ├── mcp-res-ui-push.md  # MCP resource: ui_push tool guide
│   ├── mcp-res-pages.md    # MCP resource: pages & windows guide
│   ├── mcp-res-scripting.md # MCP resource: scripting API reference
│   ├── mcp-res-graph.md    # MCP resource: force-graph data format & page.asGraph() API
│   ├── mcp-res-notebook.md # MCP resource: notebook editor JSON format
│   ├── mcp-res-links.md    # MCP resource: links editor JSON format
│   ├── mcp-res-boards.md   # MCP resource: boards guide (create/open lifecycle, bridge, testing)
│   ├── mcp-res-tools.md    # MCP resource: Agent Tools registry guide (manifest format, stdin/stdout contract, .env, self-repair)
│   ├── mcp-res-browser.md  # MCP resource: browser_* automation guide (targeting resolution, snapshot/ref lifecycle, waiting)
│   ├── mcp-res-ui.md       # MCP resource: Persephone's own interface — element purposes, data-name selectors, highlight recipe
│   ├── mcp-res-ui-editors.md # MCP resource: editor catalog for explaining the app's capabilities to the user
│   ├── agent/              # Standalone modules injected into a page by an agent (not part of the renderer bundle)
│   │   └── ui-highlight.js # Highlight-and-tooltip overlay behind app.ui.highlightElement; also pasteable into browser_evaluate
│   ├── board-base.css      # Shared board stylesheet copied into every board — theme defaults + the opt-in .p-* chrome layer
│   ├── board-template/     # Scaffold copied into every new board
│   │   └── CLAUDE.md       # Board authoring guide (bridge surface, --p-* contract, chrome classes, reload, MCP debug)
│   ├── tool-template/      # Scaffold copied into every new toolset (create_toolset)
│   │   ├── tools-manifest.json # Example manifest (one echo tool)
│   │   ├── echo.js         # Example stdin-JSON tool with the ##PERSEPHONE_RESULT## contract
│   │   ├── .env.example    # Required env var names (no values)
│   │   ├── .gitignore      # Ignores .env
│   │   └── CLAUDE.md       # Toolset authoring guide (manifest, stdin/stdout contract, .env, requirements)
│   └── demo-board/         # Bundled Demo board — exercises the full board surface
├── snip-tool/              # Rust native screen snip tool + Windows file-clipboard helper (persephone-snip.exe; `clipboard-read`/`clipboard-write` subcommands for CF_HDROP interop)
│   ├── src/main.rs         # Entry point, PNG encoding, stdout output
│   ├── src/capture.rs      # Monitor enumeration + GDI screen capture
│   ├── src/overlay.rs      # Fullscreen overlay windows, selection UI
│   ├── build.rs
│   └── Cargo.toml
├── mneme/                  # Rust knowledge-base / vector-memory service (mneme.exe) — standalone, extraction-ready (EPIC-032)
│   ├── src/main.rs         # CLI: serve / reindex / watch / status / model-update / embed / search
│   ├── src/config.rs       # config: wiki roots, include/ignore globs, transport, model, gpu
│   ├── src/store/          # Document Store over wiki roots (read/write/edit/glob/grep, {root}/{path})
│   ├── src/markdown/       # YAML frontmatter parse + heading chunker
│   ├── src/index/          # per-root SQLite index (FTS5 + sqlite-vec); hybrid search + RRF; versioned DB path
│   ├── src/indexer/        # reconcile + cancellable reindex job (keeps the index in sync with files)
│   ├── src/watcher/        # always-on per-root file watcher
│   ├── src/embed/          # embedding engine (ort + tokenizers, DirectML→CPU) + priority-queue worker
│   ├── src/model/          # model provisioner (download + sha256 + cache)
│   ├── src/mcp/            # MCP server (Streamable HTTP) — wiki_* tools + mneme:// resources
│   ├── assets/             # models.json manifest + wiki-guide.md (agent guide resource)
│   ├── Cargo.toml
│   └── README.md           # crate-local docs (module layout, build/test, invariants) — primary reference
├── boards-assets/          # Recommended-components catalog for Boards
│   ├── manifest.json       # Catalog index (id, label, files, description per skin)
│   ├── README.md           # Adoption playbook
│   └── *.css / *.js        # Pre-built skins: tabulator, chart-theme, flatpickr, tom-select,
│                           #   markdown, mermaid-theme, split, sortablejs, tippy, dialog
│                           #   (av-grid, the default grid, is in the catalog with NO skin —
│                           #    it reads the --p-* contract itself)
├── patches/                # Dependency patches (patch-package)
├── .mcp.json               # MCP server config for Claude Code (points to MCP HTTP server)
├── doc/                    # Developer documentation
│   ├── architecture/       # Architecture docs (this folder)
│   ├── standards/          # Coding standards and guides
│   ├── tasks/              # Task tracking
│   └── future-architecture/ # Migration design docs (historical)
└── docs/                   # User documentation (published)
```

## Renderer Structure

```
/src/renderer/
│
├── api/                    # Object Model — application interfaces
│   ├── app.ts              # Root App class (bootstrap orchestrator)
│   ├── settings.ts         # ISettings implementation
│   ├── editors.ts          # IEditorRegistry implementation
│   ├── recent.ts           # IRecentFiles implementation
│   ├── fs.ts               # IFileSystem implementation
│   ├── archive-service.ts  # ArchiveService — archive I/O (libarchive-wasm for reads, jszip for writes), used by fs.ts for archive paths
│   ├── window.ts           # IWindow implementation
│   ├── ui.ts               # IUserInterface implementation
│   ├── downloads.ts        # IDownloads implementation
│   ├── menu-folders.ts     # IMenuFolders implementation
│   ├── library-service.ts  # LibraryService — script library scanning, caching, file watching
│   ├── autoload-service.ts # Thin wrapper exposing AutoloadRunner to app lifecycle
│   ├── pages.ts            # PagesModel singleton export
│   ├── mcp-handler.ts      # MCP command handler (receives IPC from main, dispatches commands)
│   ├── mneme-connection.ts # Shared, persistent Mneme MCP client — one auto-reconnecting connection; refcounted resource subscriptions fanned out to per-document watchers
│   ├── mneme-status.ts     # Mneme health prober + reactive status (shared MCP connection; drives sidecar launch, indicators, and auto-opens the config editor when no model is provisioned)
│   ├── proc.ts             # IProc implementation (app.proc.execute) — the ipcRenderer transport for the shared execute() handle (shared/execute-handle.ts); compile-time drift guard keeps it in sync with runner-channels.ts
│   ├── terminal.ts         # openTerminalAt(dir) helper — reads terminal.command, auto-detects pwsh→powershell→cmd on first use and saves it, then launches ("Open Terminal here")
│   ├── board-trust.ts      # Per-board trust registry — persists trusted board roots (trustedBoards.txt); untrusted boards block rendering. This list IS the known-boards registry
│   ├── boards.ts           # IBoards implementation (app.boards) — board lifecycle (create/open/register/rename) + published-catalog ops (search/download/install/uninstall/updates)
│   ├── published-boards.ts # Reactive published-catalog model — useCatalog / useCatalogBoardsForFile / isCompatible / getVersions / updatesAvailable / refresh(force)
│   ├── board-install.ts    # Install engine — downloadBoard (download→extract→validate→registry, traversal-guarded) + installVersion/updateBoard folder-swap + uninstallCatalogBoard
│   ├── board-install-registry.ts # installedBoards.json reactive registry (record/remove/getByRoot/getById/useInstalled; one entry per catalog id; stale-entry reconciliation)
│   ├── board-updates.ts    # Update detection + safe re-install — getBoardUpdate/useBoardUpdates/listBoardUpdates, runBoardUpdate/runBoardVersionInstall, ensureBoardIdle
│   ├── internal.ts         # Disposable utilities (wrapSubscription, etc.)
│   │
│   ├── board-vars/         # Board environment-variables store — secrets kept outside the board folder
│   │   ├── BoardEnvStore.ts    # Session-singleton store over the settings-configured .env.json (namespace → profile → key → value; encryption reuse)
│   │   ├── namespace.ts        # resolveBoardNamespace (author/name → path fallback) + registration-time collision check
│   │   ├── board-vars-bridge.ts # Orchestrates a board's persephone.var.* request against ITS namespace (create-storage dialog, locked handling, serialized chain)
│   │   ├── admin-api.ts        # BoardVarsAdmin — app.boardVars, unrestricted-namespace admin surface for scripts/agents
│   │   ├── types.ts            # BoardVarsFile schema, DEFAULT_PROFILE
│   │   └── index.ts            # Barrel
│   │
│   ├── tools/              # Agent Tools registry (EPIC-038) — deliberately NOT on app or any script .d.ts
│   │   ├── tools-manifest.ts   # tools-manifest.json module — read/validate/write; isToolsetFolder; defaultToolsManifest
│   │   ├── tools-trust.ts      # toolsTrust registry — registered toolset roots (trustedTools.txt), exact-match, reactive; registration ≡ trust
│   │   ├── registered-tools.ts # registeredTools model — enumerate trusted roots → read manifests → flat tool list (id = <toolset>/<tool>); refresh(), reactive
│   │   ├── tool-executor.ts    # executeToolById — resolve → validate args → app.proc.execute (cwd = toolset root, stdin-JSON args, .env env); output contract + failure payload
│   │   ├── dotenv.ts           # loadDotEnv — parse <root>/.env via Node util.parseEnv (no dependency)
│   │   ├── tool-log.ts         # Self-rotating per-toolset tools-execution.log (TOOLS_EXECUTION_LOG_FILE)
│   │   ├── tool-stats.ts       # In-memory per-tool run stats
│   │   └── tool-scaffold.ts    # createToolset(name, dir) — copy tool-template + patch manifest name (trust-free; NOT on app/scripts)
│   │
│   ├── pages/              # Page collection — composed submodels
│   │   ├── PageModel.ts            # Tab container — sidebar, secondary views, mainEditor lifecycle
│   │   ├── IPageHost.ts            # IPageHost interface — editor↔owner contract (PageModel + BrowserPanelHost)
│   │   ├── PagesModel.ts           # Base: state, subscriptions, composes submodels
│   │   ├── PagesQueryModel.ts      # Queries: getAll, byId, byType, activePage
│   │   ├── PagesNavigationModel.ts # Navigation: show, focus, next/prev
│   │   ├── PagesLifecycleModel.ts  # Lifecycle: create, close, empty page
│   │   ├── PageNavigator.ts        # navigatePageTo — named-steps navigation of an existing page
│   │   ├── NavBackStack.ts         # Markdown back-nav stack owned by the page (persisted)
│   │   ├── PagesLayoutModel.ts     # Layout: grouping (side-by-side)
│   │   ├── PagesPersistenceModel.ts # Persistence: save/restore, debounced
│   │   └── well-known-pages.ts     # Singleton page definitions (MCP Log, etc.)
│   │
│   ├── internal/           # Event services (init-only, not public API)
│   │   ├── GlobalEventService.ts    # contextmenu, dragover, drop, paste (image / image-bearing HTML), unhandled rejections
│   │   ├── clipboard-image.ts       # Paste helpers: image file → Image viewer; image-bearing HTML → HTML viewer (editable-target fallback)
│   │   ├── KeyboardService.ts       # Global keyboard shortcuts
│   │   ├── WindowStateService.ts    # Window maximize/zoom state tracking
│   │   └── RendererEventsService.ts # IPC event subscriptions (open file, quit, etc.)
│   │
│   ├── events/             # Event channel system (scriptable events)
│   │   ├── AppEvents.ts             # app.events namespace (linkContextMenu, fileExplorer, etc.)
│   │   ├── BaseEvent.ts             # Base event class with `handled` flag
│   │   ├── EventChannel.ts          # EventChannel<T> — subscribe, send, sendAsync
│   │   ├── events.ts                # Event subclasses (ContextMenuEvent<T>, etc.)
│   │   └── index.ts
│   │
│   ├── shell/              # Shell service — OS integration
│   │   ├── index.ts                 # IShell facade (composes sub-services)
│   │   ├── shell-calls.ts           # IPC calls to main process
│   │   ├── encryption.ts            # AES-GCM encryption
│   │   └── version.ts              # Version info, update checking
│   │
│   ├── setup/              # Monaco editor configuration
│   │   ├── configure-monaco.ts      # Themes, keybindings, type definitions
│   │   ├── library-intellisense.ts  # Library module IntelliSense (addExtraLib + path completion)
│   │   └── monaco-languages/        # Custom language definitions
│   │       ├── csv.ts               # CSV rainbow coloring
│   │       ├── jsonl.ts            # JSONL (JSON Lines) syntax highlighting
│   │       ├── log.ts              # Log file syntax highlighting
│   │       ├── mermaid.ts           # Mermaid syntax highlighting
│   │       └── reg.ts              # Windows Registry file syntax
│   │
│   └── types/              # TypeScript interfaces (.d.ts)
│       ├── index.d.ts      # Global `app` and `page` declarations
│       ├── app.d.ts        # IApp interface
│       ├── common.d.ts     # IDisposable, IEvent, Language
│       ├── pages.d.ts      # IPageCollection interface
│       ├── page.d.ts       # IPage interface (with asX() methods)
│       ├── settings.d.ts   # ISettings
│       ├── editors.d.ts    # IEditorRegistry
│       ├── boards.d.ts     # IBoards (app.boards) — board lifecycle API
│       ├── board-vars.d.ts # IBoardVars (app.boardVars) — env-vars/secrets admin API
│       ├── recent.d.ts     # IRecentFiles
│       ├── fs.d.ts         # IFileSystem
│       ├── window.d.ts     # IWindow
│       ├── shell.d.ts      # IShell + sub-services
│       ├── ui.d.ts         # IUserInterface
│       ├── downloads.d.ts  # IDownloads
│       ├── menu-folders.d.ts # IMenuFolders
│       ├── text-editor.d.ts    # ITextEditor
│       ├── grid-editor.d.ts    # IGridEditor
│       ├── notebook-editor.d.ts # INotebookEditor
│       ├── link-editor.d.ts    # ILinkEditor
│       ├── browser-editor.d.ts # IBrowserEditor
│       ├── markdown-editor.d.ts # IMarkdownEditor
│       ├── svg-editor.d.ts     # ISvgEditor
│       ├── html-editor.d.ts    # IHtmlEditor
│       ├── mermaid-editor.d.ts # IMermaidEditor
│       ├── graph-editor.d.ts  # IGraphEditor, IGraphNode, IGraphComponent, IGraphSearchResult
│       ├── events.d.ts       # IEventChannel, IBaseEvent, IContextMenuEvent, MenuItem, IFileTarget
│       ├── io.d.ts            # IIoNamespace — script `io` global (providers, transformers, tree providers, createPipe)
│       ├── io.provider.d.ts  # IProvider, IProviderStat, IProviderDescriptor
│       ├── io.transformer.d.ts # ITransformer, ITransformerDescriptor
│       ├── io.pipe.d.ts      # IContentPipe, IPipeDescriptor
│       ├── io.link-data.d.ts # ILinkData — unified link descriptor for the pipeline (EPIC-023)
│       └── io.tree.d.ts     # ITreeProvider, ILink (was ITreeProviderItem), ITreeStat, ITreeSearch*
│
├── content/                # Content delivery layer — providers, transformers, pipes (EPIC-012)
│   ├── ContentPipe.ts      # IContentPipe implementation, createPipe() factory
│   ├── registry.ts         # Provider/transformer registries, createPipeFromDescriptor()
│   ├── encoding.ts         # Text encoding detection (BOM, jschardet) and conversion (iconv-lite)
│   ├── parsers.ts          # Layer 1: raw link parsers (file, HTTP/cURL, archive, data:) on openRawLink
│   ├── resolvers.ts        # Layer 2: pipe resolvers (file, HTTP, archive) on openLink
│   ├── link-utils.ts       # URL → pipe descriptor resolution (used by resolvers + tree providers)
│   ├── rebuild-pipe.ts     # pipeFromSourcePath() — rebuild a pipe from a persisted source path (plain, archive-bang, http); shared by the Image editor, board file materialization and page restore
│   ├── open-handler.ts     # Layer 3: open handler on openContent — creates/navigates pages
│   ├── persephone-board-link.ts # persephone-board:// link encode/decode (addresses a board root); parsed in parsers.ts → target "board-view"
│   ├── persephone-toolset-link.ts # persephone-toolset:// link encode/decode (addresses a toolset root) + openToolset() helper; parsed in parsers.ts → target "toolset-view"
│   ├── mneme-folder-link.ts # mneme-folder:// link encode/decode (addresses a Mneme root)
│   ├── mneme-link.ts        # mneme:// document scheme — canonical href ⇄ MCP address (toMnemeHref / toMnemeAddress)
│   ├── providers/
│   │   ├── FileProvider.ts      # IProvider for local binary files (read/write/watch/stat)
│   │   ├── CacheFileProvider.ts # IProvider for cache files by page ID (auto-save)
│   │   ├── HttpProvider.ts      # IProvider for HTTP/HTTPS URLs (read-only)
│   │   ├── DataUrlProvider.ts  # IProvider for data: URLs (inline content, read-only)
│   │   └── MnemeProvider.ts    # IProvider over the shared Mneme connection — read/write/edit a document, live-refresh on resource updates
│   ├── transformers/
│   │   ├── ArchiveTransformer.ts # ITransformer for archive entry extraction/replacement
│   │   └── DecryptTransformer.ts # ITransformer for AES-GCM decrypt/encrypt (non-persistent)
│   ├── tree-providers/           # ITreeProvider implementations
│   │   ├── FileTreeProvider.ts  # Local filesystem directories
│   │   ├── ArchiveTreeProvider.ts # Archives (ZIP, RAR, 7z, TAR, cab, ISO — read-only)
│   │   ├── tree-provider-link.ts # tree-category:// link format (encode/decode)
│   │   ├── MnemeTreeProvider.ts  # ITreeProvider over a Mneme root — browse like a filesystem; create/rename/delete; drag-drop import
│   │   └── mnemeLinkTraits.ts    # MnemeLink TraitSet (LINK + FILE_LINK) for tree drag-drop (move within / copy across roots)
│   ├── tree-context-menus.tsx   # Default context menu handlers for tree provider items
│   └── open-with-default-app.ts # Hand a path to the OS shell (shell.openPath); shared by the tree context menu and Explorer double-click
│
├── ui/                     # Application Shell
│   ├── app/                # Root layout
│   │   ├── MainPage.tsx            # Root component (header, tabs, editors, sidebar)
│   │   ├── Pages.tsx               # Page container/router
│   │   ├── RenderEditor.tsx        # Editor dispatcher
│   │   ├── AsyncEditor.tsx         # Async editor loader
│   │   └── index.ts
│   ├── tabs/               # Tab bar
│   │   ├── PageTabs.tsx            # Tab bar component
│   │   ├── PageTab.tsx             # Individual tab
│   │   └── index.ts
│   ├── sidebar/            # Sidebar/menu panel
│   │   ├── MenuBar.tsx             # Top menu bar
│   │   ├── OpenTabsList.tsx         # Open tabs list
│   │   ├── RecentFileList.tsx       # Recent files panel
│   │   ├── ToolsEditorsPanel.tsx    # Tools & Editors panel — pinned region + "Built-in Editors" / "Boards" / "Tools" segments (pin/unpin, drag reorder)
│   │   ├── TrustedBoardsList.tsx    # "Boards" segment — trusted boards grouped by folder; open / pin / Remove (≡ untrust)
│   │   ├── TrustedToolsList.tsx     # "Tools" segment — all registered toolsets across roots (ToolsTree); open / Remove (≡ untrust)
│   │   ├── pinned-items.ts          # Unified PinnedRef model over the pinned-editors setting (editors + "board:<root>" pins)
│   │   ├── tools-editors-registry.ts # Creatable items registry (editors + tools)
│   │   ├── ScriptLibraryPanel.tsx   # Script library folder panel
│   │   ├── FileList.tsx            # File browser list
│   │   ├── FolderItem.tsx          # Folder tree item
│   │   └── index.ts
│   ├── dialogs/            # Application dialogs
│   │   ├── Dialogs.tsx             # Dialog manager/renderer
│   │   ├── Dialog.tsx              # Base dialog component
│   │   ├── ConfirmationDialog.tsx
│   │   ├── InputDialog.tsx
│   │   ├── PasswordDialog.tsx
│   │   ├── TorInfoDialog.tsx       # Tor connection info — exit IP, location, check.torproject.org verdict; Reconnect restarts tor.exe
│   │   ├── RegisterToolsetDialog.tsx # Agent-initiated toolset registration confirmation (Allow/Deny; RCE gate — EPIC-038)
│   │   ├── CreateBoardVarsStorageDialog.tsx # First-use "Create environment variables storage" prompt (default path, editable) — shown by both persephone.var.* and app.boardVars.*
│   │   ├── NamespaceCollisionDialog.tsx # Non-blocking advisory at board registration when the new board's author/name namespace collides with an already-registered board
│   │   ├── TextDialog.tsx            # Multi-purpose text dialog (Monaco editor)
│   │   ├── alerts/                 # Notification bar
│   │   │   ├── AlertsBar.tsx
│   │   │   └── AlertItem.tsx
│   │   ├── progress/               # Progress overlay, notifications, screen lock
│   │   │   ├── ProgressModel.ts    # State + API (showProgress, createProgress, notifyProgress, addScreenLock)
│   │   │   └── Progress.tsx        # React component (two-zone overlay)
│   │   ├── poppers/                # Floating menus
│   │   │   ├── Poppers.tsx
│   │   │   ├── showPopupMenu.tsx
│   │   │   └── types.ts
│   │   └── index.ts
│   └── secondary-views/    # SecondaryViews — controlled panel host
│       ├── SecondaryViews.tsx       # Controlled panel host — renders CollapsiblePanel per registered secondary
│       ├── SecondaryViewsModel.ts   # Reactive state (open, width, activePanel)
│       ├── LazySecondaryView.tsx    # Dynamic panel component loader (dynamic import per panel ID)
│       ├── SideBarPanelHeader.tsx   # Shared panel header (icon + badge + truncating title + pinned actions); portals into the header
│       ├── panel-key.ts             # Composite panel keys (`${editorId}::${panelId}`)
│       └── secondary-view-registry.ts # Registry: panel ID → dynamic component factory
│
├── editors/                # Editor Implementations — each editor is an EditorModel subclass
│   ├── base/               # Shared editor infrastructure
│   │   ├── EditorModel.ts            # Abstract base class for all editors
│   │   ├── TextHostEditorModel.ts    # Base for TextFileModel-wrapping editors — host-adoption lifecycle, subscription registry, content echo guard, host-settings mirror
│   │   ├── IContentHost.ts           # Interface for text-content hosting (TextFileModel, NoteItemEditModel)
│   │   ├── EditorStateStorage.ts     # Per-editor view-state storage interface (id, name → state)
│   │   ├── editor-traits.ts          # CONTENT_HOST_TRAIT — owner-orchestrated editor switching
│   │   ├── editor-matchers.ts        # Acceptance / resolution priority helpers
│   │   ├── editorRegistry.ts         # Native editor registry — resolve, register, switch options
│   │   ├── editor-switch.ts          # switchMainEditor — switch-widget transition (host transfer / rebuild)
│   │   ├── PageToolbar.tsx           # Shared toolbar shell — NavPanel + switch widget auto-slots
│   │   ├── TextChrome.tsx            # Host-aware chrome wrapper (toolbar, script panel, footer)
│   │   ├── EditorToolbar.tsx         # Toolbar root component used by individual editors
│   │   ├── EditorConfigContext.tsx   # Editor configuration provider
│   │   ├── EditorError.tsx           # Error boundary
│   │   └── index.ts
│   │
│   ├── text/               # Text file content host (file I/O + encryption + script panel)
│   │   ├── TextEditorModel.ts        # TextFileModel — file-backed IContentHost (state, file I/O, encryption)
│   │   ├── TextFileIOModel.ts        # File I/O via content pipes (read/write/watch/cache)
│   │   ├── TextFileActionsModel.ts   # Text actions (duplicate, transform)
│   │   ├── TextFileEncryptionModel.ts # Encryption state machine
│   │   ├── ScriptPanel.tsx           # Inline script runner panel
│   │   ├── paste-rich-text.ts        # Rich-text paste handler
│   │   └── index.ts
│   ├── monaco/             # Monaco text editor (text-bearing, IContentHost + TRAIT)
│   │   ├── MonacoEditor.ts           # EditorModel subclass — composes IContentHost, hosts Monaco
│   │   ├── MonacoBody.tsx            # React component
│   │   └── index.tsx
│   ├── grid/               # JSON/CSV/JSONL grid editor (text-bearing, IContentHost + TRAIT)
│   │   ├── GridEditor.ts             # EditorModel — parsing, sort/filter/edit state
│   │   ├── GridBody.tsx              # React component (AVGrid integration)
│   │   ├── components/               # Grid-specific components
│   │   ├── utils/                    # Grid utilities
│   │   ├── util.ts                   # Shared utility helpers
│   │   └── index.tsx
│   ├── markdown/           # Markdown preview (text-bearing, IContentHost + TRAIT)
│   │   ├── MarkdownEditor.ts         # EditorModel — search state, scroll, compact
│   │   ├── MarkdownBody.tsx          # React component
│   │   ├── MarkdownBlock.tsx         # Reusable markdown rendering (CSS, ReactMarkdown, search + anchor handle)
│   │   ├── CodeBlock.tsx             # Code block + inline Mermaid (+ copyImageToClipboard helper)
│   │   ├── MarkdownImage.tsx         # Rendered image + hover toolbar (Copy / Open in new tab)
│   │   ├── rehypeHighlight.ts        # Search text highlighting
│   │   ├── rehypeHeadingIds.ts       # Heading slug ids for #fragment links (+ slugifyHeading)
│   │   ├── markdown-nav.ts           # isLocalMarkdownHref — local-.md link detection for in-page nav
│   │   └── index.tsx
│   │
│   ├── browser/            # Built-in browser (non-text, no trait)
│   │   ├── BrowserEditor.ts          # EditorModel subclass — registry entry point
│   │   ├── BrowserEditorModel.ts     # Multi-tab browser state
│   │   ├── BrowserView.tsx           # Browser UI
│   │   ├── BrowserWebviewModel.ts    # Webview management
│   │   ├── BrowserUrlBarModel.ts     # URL bar state
│   │   ├── BrowserTargetModel.ts     # Automation adapter (implements IBrowserTarget)
│   │   ├── BrowserTabsPanel.tsx      # Browser tab bar
│   │   ├── BookmarksDrawer.tsx       # Bookmarks panel
│   │   ├── DownloadButton.tsx        # Download indicator
│   │   ├── BrowserDownloadsPopup.tsx # Download list popup
│   │   ├── UrlSuggestionsDropdown.tsx # URL autocomplete
│   │   ├── TorStatusOverlay.tsx      # Tor connection status
│   │   ├── BrowserBookmarks.ts       # Bookmarks data management (wraps TextFileModel + LinkEditor)
│   │   ├── BrowserBookmarksUIModel.ts # Bookmarks UI state
│   │   ├── BrowserPanelHost.ts       # IPageHost impl for browser's bookmarks sidebar (EPIC-029 US-601)
│   │   ├── BrowserSecondaryViews.tsx # SecondaryViews mount for browser empty page and BookmarksDrawer
│   │   ├── browser-search-history.ts # Search history
│   │   ├── network-log-links.ts      # Network log → ILink[] conversion
│   │   ├── browser-pages.ts          # showBrowserPage / openUrlInBrowserTab — page opening; keeps the browser chunk out of startup
│   │   └── index.tsx
│   ├── notebook/           # Notebook editor (text-bearing, IContentHost + TRAIT)
│   │   ├── NotebookEditor.ts         # EditorModel — page-level notes, categories, tags
│   │   ├── NotebookBody.tsx          # React component
│   │   ├── NoteItemView.tsx
│   │   ├── NoteItemViewModel.ts      # Per-row view model for virtualized note list
│   │   ├── ExpandedNoteView.tsx      # Expanded note (portal overlay)
│   │   ├── TagsListView.tsx
│   │   ├── category-tree.tsx
│   │   ├── notebookTypes.ts
│   │   ├── note-editor/              # Per-note embedded editor subsystem
│   │   │   ├── NoteItemEditModel.ts  # IContentHost for one note (no file I/O — state in notebook JSON)
│   │   │   ├── MiniTextEditor.tsx    # Monaco mini-editor used for monaco notes
│   │   │   ├── NoteItemActiveEditor.tsx # Embeds language-gated editors per note
│   │   │   ├── NoteItemToolbar.tsx
│   │   │   └── index.ts
│   │   ├── panels/                   # Secondary view panel components
│   │   │   ├── NotebookCategoriesSecondaryView.tsx  # "notebook-categories" panel
│   │   │   └── NotebookTagsSecondaryView.tsx        # "notebook-tags" panel
│   │   └── index.tsx
│   ├── link-editor/        # Link collection editor (text-bearing, IContentHost + TRAIT)
│   │   ├── LinkEditor.ts             # EditorModel — links, categories, tags, filters
│   │   ├── LinkBody.tsx              # React component
│   │   ├── LinkTreeProvider.ts       # ITreeProvider adapter over LinkEditor state; drag-drop import (files→links, links across windows)
│   │   ├── linkTypes.ts
│   │   ├── link-open.ts              # buildLinkEditorContent — links → .link.json content; dependency-light for the sync openLinks API
│   │   ├── linkTraits.ts             # ILink trait definition + registration (LINK + FILE_LINK — local-file links yield bytes)
│   │   ├── tor-src.ts                # Rewrites remote image src → tor-src:// when the editor is hosted by a Tor browser page (the app renderer is unproxied); local schemes pass through
│   │   ├── pipe-image-src.ts         # usePipeImageSrc — reads an archive-entry imgSrc through a content pipe into a cached blob URL; every other src shape passes through
│   │   ├── panels/                   # Shared panel components (inline + secondary view)
│   │   │   ├── LinkCategoryPanel.tsx       # Categories tree panel
│   │   │   ├── LinkTagsPanel.tsx           # Tags list panel
│   │   │   ├── LinkHostnamesPanel.tsx      # Hostnames list panel
│   │   │   ├── LinkCategorySecondaryView.tsx  # Secondary view wrapper
│   │   │   ├── LinkTagsSecondaryView.tsx      # Secondary view wrapper
│   │   │   └── LinkHostnamesSecondaryView.tsx # Secondary view wrapper
│   │   ├── LinksList.tsx             # View-only list rendering
│   │   ├── LinksTiles.tsx            # View-only tiles rendering
│   │   ├── LinkItemList.tsx          # Wrapper: wires LinksList to LinkEditor
│   │   ├── LinkItemTiles.tsx         # Wrapper: wires LinksTiles to LinkEditor
│   │   ├── LinkTooltip.tsx
│   │   ├── PinnedLinksPanel.tsx
│   │   ├── EditLinkDialog.tsx
│   │   └── index.tsx
│   ├── svg/                # SVG preview (text-bearing, IContentHost + TRAIT)
│   │   ├── SvgEditor.ts              # EditorModel — SVG state
│   │   ├── SvgBody.tsx               # React component
│   │   └── index.tsx
│   ├── html/               # HTML preview (text-bearing, IContentHost + TRAIT)
│   │   ├── HtmlEditor.ts             # EditorModel — HTML state
│   │   ├── HtmlBody.tsx              # React component
│   │   └── index.tsx
│   ├── mermaid/            # Mermaid diagram preview (text-bearing, IContentHost + TRAIT)
│   │   ├── MermaidEditor.ts          # EditorModel — SVG URL, loading, error, light mode
│   │   ├── MermaidBody.tsx           # React component
│   │   ├── render-mermaid.ts         # Rendering utilities (shared with Markdown)
│   │   └── index.tsx
│   ├── graph/              # Force graph viewer (text-bearing, IContentHost + TRAIT)
│   │   ├── GraphEditor.ts            # EditorModel — JSON parsing, orchestration, sub-models
│   │   ├── GraphBody.tsx             # Canvas-based graph component
│   │   ├── GraphDataModel.ts         # Source data ownership + node/link CRUD + legend data
│   │   ├── GraphSearchModel.ts       # Search query matching + result computation
│   │   ├── GraphGroupModel.ts        # Group membership analysis + link pre-processing
│   │   ├── GraphGroupActionsModel.ts # Interactive grouping + membership operations
│   │   ├── GraphMutationModel.ts     # Graph edits, exports + rebuild/persist orchestration
│   │   ├── GraphTooltipModel.ts      # Tooltip timers, hover state + status hints
│   │   ├── GraphConnectivityModel.ts # Read-only query layer
│   │   ├── GraphHighlightModel.ts    # Highlight layers + selection/hover state
│   │   ├── GraphContextMenu.ts       # Context menu item builders
│   │   ├── ForceGraphRenderer.ts     # D3 force simulation + canvas rendering
│   │   ├── GraphVisibilityModel.ts   # BFS-based visibility filtering
│   │   ├── GraphDetailPanel.tsx      # Collapsible detail panel overlay
│   │   ├── GraphTuningSliders.tsx
│   │   ├── GraphExpansionSettings.tsx
│   │   ├── GraphLegendPanel.tsx
│   │   ├── GraphIcons.tsx
│   │   ├── GraphTooltip.tsx
│   │   ├── shapeGeometry.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── index.tsx
│   ├── draw/               # Excalidraw drawing editor (text-bearing, IContentHost + TRAIT)
│   │   ├── DrawEditor.ts             # EditorModel — JSON parsing, fingerprint change detection
│   │   ├── DrawBody.tsx              # Wraps <Excalidraw> component
│   │   ├── drawExport.ts             # Export helpers
│   │   ├── drawLibrary.ts            # Library persistence
│   │   └── index.tsx
│   ├── log-view/           # Log viewer (text-bearing, IContentHost + TRAIT)
│   │   ├── LogViewEditor.ts          # EditorModel — JSONL parsing, entry management
│   │   ├── LogBody.tsx               # Log viewer component (RenderFlexGrid + auto-scroll)
│   │   ├── LogViewContext.ts         # React Context for dialog views
│   │   ├── LogEntryWrapper.tsx       # Cell root — subscribes to entries[index]
│   │   ├── LogEntryContent.tsx       # Type router — dispatches to entry renderers
│   │   ├── LogMessageView.tsx        # Log message renderer
│   │   ├── StyledTextView.tsx        # StyledText renderer
│   │   ├── logTypes.ts               # LogEntry, StyledText, dialog/output types
│   │   ├── logConstants.ts
│   │   ├── items/                    # Dialog and output entry renderers (15 files)
│   │   └── index.tsx
│   ├── rest-client/        # Rest Client editor (text-bearing, IContentHost + TRAIT)
│   │   ├── RestClientEditor.ts       # EditorModel — collections, requests, responses
│   │   ├── RestClientBody.tsx        # React component
│   │   ├── RestClientShared.tsx
│   │   ├── RequestBuilder.tsx
│   │   ├── ResponseViewer.tsx
│   │   ├── KeyValueEditor.tsx
│   │   ├── multipartBuilder.ts
│   │   ├── httpConstants.ts
│   │   ├── open-in-rest-client.ts
│   │   ├── panels/                   # Secondary view panel components
│   │   │   └── RestPanelSecondaryView.tsx        # "rest" panel
│   │   └── index.tsx
│   ├── env-vars/           # Board environment-variables editor (text-bearing, IContentHost + TRAIT)
│   │   ├── EnvVarsEditor.ts          # EditorModel — namespace/profile selection, CRUD over the namespace's profile data
│   │   ├── EnvVarsBody.tsx           # React component
│   │   ├── open-env-vars.ts          # openEnvVarsPage(namespace) — used by persephone.var.show() and app.boardVars.show(namespace)
│   │   └── index.tsx
│   ├── image/              # Image viewer (non-text, no trait)
│   │   ├── ImageEditor.ts            # EditorModel — pipe-backed image state
│   │   ├── ImageView.tsx             # React component
│   │   └── index.tsx
│   ├── mcp-inspector/      # MCP Inspector (non-text, no trait)
│   │   ├── McpInspectorEditorModel.ts # EditorModel — connection, tools, resources, prompts
│   │   ├── McpInspectorView.tsx      # Main view — connection bar, panel routing
│   │   ├── McpConnectionManager.ts   # MCP SDK Client wrapper
│   │   ├── McpConnectionStore.ts     # Saved connections store (mcp-connections.json)
│   │   ├── ToolsPanel.tsx
│   │   ├── ToolArgForm.tsx
│   │   ├── ToolResultView.tsx
│   │   ├── ResourcesPanel.tsx
│   │   ├── ResourceContentView.tsx
│   │   ├── PromptsPanel.tsx
│   │   └── index.tsx
│   ├── compare/            # Diff editor (non-text, no trait)
│   │   ├── CompareEditor.tsx
│   │   └── index.ts
│   ├── about/              # About page (non-text, no trait)
│   │   ├── AboutEditor.ts            # EditorModel
│   │   ├── AboutView.tsx
│   │   └── index.tsx
│   ├── settings/           # Settings page (non-text, no trait)
│   │   ├── SettingsEditor.ts         # EditorModel
│   │   ├── SettingsView.tsx
│   │   └── index.tsx
│   ├── storybook/          # Storybook editor (non-text, no trait)
│   │   ├── StorybookEditorModel.ts   # EditorModel — component browser, live preview
│   │   ├── StorybookEditorView.tsx
│   │   ├── ComponentBrowser.tsx
│   │   ├── LivePreview.tsx
│   │   ├── PropertyEditor.tsx
│   │   ├── iconPresets.tsx
│   │   ├── storyRegistry.ts
│   │   ├── storyTypes.ts
│   │   └── index.tsx
│   ├── video/              # Audio/Video player (non-text, no trait)
│   │   ├── VideoEditor.ts            # EditorModel — playback state, streaming integration
│   │   ├── VideoView.tsx
│   │   ├── VPlayer.tsx               # Video playback component (video.js + hls.js)
│   │   ├── AudioPlayer.tsx           # Audio file playback with visualizer
│   │   ├── AudioVisualizer.tsx       # Frequency visualization (switchable effects)
│   │   ├── AudioControls.tsx
│   │   ├── effects/                  # Audio visualizer effect implementations
│   │   │   ├── types.ts
│   │   │   ├── BarsEffect.ts
│   │   │   └── CircularEffect.ts
│   │   ├── NodeFetchHlsLoader.ts     # Custom hls.js loader via nodeFetch
│   │   ├── video-types.ts
│   │   └── index.tsx
│   ├── category/           # Category/folder view (non-text, no trait — provider-agnostic)
│   │   ├── CategoryEditor.tsx        # EditorModel + React component (single file)
│   │   ├── CategoryEditorModel.ts    # Page model — decodes tree-category:// link
│   │   ├── FolderViewModeService.ts  # Per-folder view mode persistence
│   │   └── index.tsx
│   ├── archive/            # Archive editor (non-text, with sidebar panel)
│   │   ├── ArchiveEditor.ts          # EditorModel — archive state, tree provider, navigation survival
│   │   ├── ArchiveEditorView.tsx     # Main content view
│   │   ├── ArchiveSecondaryView.tsx # Secondary panel — tree view with portaled header
│   │   └── index.tsx
│   ├── explorer/           # File explorer (non-text, sidebar-only)
│   │   ├── ExplorerEditorModel.ts    # EditorModel — tree provider, selection, search, root navigation
│   │   ├── page-explorer.ts          # Explorer provisioning for a page — toggleNavigator, auto-init
│   │   ├── ExplorerSecondaryView.tsx # "explorer" panel — tree view with portaled header
│   │   ├── SearchSecondaryView.tsx # "search" panel — file search with portaled header
│   │   ├── BoardsSecondaryView.tsx # "boards" panel — Boards/Tools body switch: trusted boards (BoardsTree) or registered toolsets (ToolsTree) under the Explorer root; "+ New board" in the switch row
│   │   └── index.ts
│   ├── mneme-config/       # Mneme config & monitoring editor (non-text, no trait)
│   │   ├── MnemeConfigEditorModel.ts # EditorModel — roots, include/ignore, reindex + progress, model, status polling
│   │   ├── MnemeConfigView.tsx       # Main view (single page)
│   │   ├── RootsPanel.tsx            # Roots + include/ignore + reindex/progress
│   │   ├── ModelPanel.tsx            # Embedding-model status + update
│   │   ├── mnemeTypes.ts             # Shared types + parseToolResult helper
│   │   └── index.tsx
│   ├── mneme-root/         # Mneme root — search main view + Explorer-like tree sidebar (Pattern B navigation-singleton, per-folder)
│   │   ├── MnemeRootEditorModel.ts   # EditorModel — root resolve, search (text/vector/hybrid), tree state
│   │   ├── MnemeRootEditorView.tsx   # Search UI + ranked results
│   │   ├── MnemeTreeSecondaryView.tsx # "mneme-tree" sidebar panel (browse/create/rename/delete/drop)
│   │   ├── results-to-markdown.ts    # Render search hits as markdown
│   │   └── index.tsx
│   ├── board/              # Board editor (non-text, Pattern B survive-navigation)
│   │   ├── BoardEditorModel.ts       # EditorModel — single-board lifecycle, per-board trust gate, live iframe ref, icon; opens any board root; busy keep-alive (survives navigation as an invisible ownership handle while its processes run)
│   │   ├── BoardEditorView.tsx       # React component (view only)
│   │   ├── BoardToolbar.tsx          # In-board toolbar — Reload / Show-log / board path + switcher popover / File Explorer button
│   │   ├── BoardWebview.tsx          # Locked-down cross-origin <iframe src="board://<host>/index.html"> (no sandbox attr); brokers the MessagePort bridge handshake + ui.log reset
│   │   ├── BoardsTree.tsx            # Reusable boards tree (single-root + multi-root; folder-compacted; click / trailing / context-menu slots)
│   │   ├── boards-tree-build.ts      # Pure builder: board path list → compacted folder/board node tree
│   │   ├── BoardGlyph.tsx            # Default board glyph icon
│   │   ├── BoardTargetModel.ts       # Automation adapter (IBrowserTarget for browser_* MCP tools)
│   │   ├── board-manifest.ts         # board-manifest.json identity file — read/ensure; a folder is a board iff it carries one; Custom Editor fields (fileMasks/folderMasks/editorPriority/editorName) + matcher/accessor helpers
│   │   ├── custom-editor-registry.ts # Reactive mask → trusted-board map; board-editor:<root> virtual ids; resolveEditorIdForFile (merges built-in + board at file-open); isBoardEditorId
│   │   ├── board-icon-cache.ts       # Module-level icon cache (SVG/PNG/ICO → data URL, per board path)
│   │   ├── board-usage-cache.ts      # Reactive board-standalone metadata cache (mirrors the icon cache; gates pin affordances)
│   │   ├── busy-boards.ts            # Reactive registry of busy board roots (drives the Boards panel "running" dot)
│   │   ├── board-theme.ts            # computeBoardThemePalette + BOARD_TOKEN_VARS (--p-* contract)
│   │   ├── board-scaffold.ts         # Scaffold helpers — copy board-template into a new board folder (writes board-manifest.json)
│   │   ├── board-api.d.ts            # Author-facing window.persephone contract (the canonical board API .d.ts)
│   │   ├── UntrustedBoardView.tsx    # Shown in place of the board iframe when the board is untrusted (Trust board button)
│   │   ├── BoardNotFoundView.tsx     # Shown when a board root no longer exists on disk (e.g. stale trusted/pinned path)
│   │   └── index.tsx                 # boardModule + legacy EditorModule factory
│   ├── board-info/         # Board Info editor ("board-info") — install + properties over one host-capable holder
│   │   ├── BoardInfoEditorModel.ts   # EditorModel — install/properties modes; adopts/yields CONTENT_HOST_TRAIT without rendering (lossless Text↔+↔board switch)
│   │   ├── BoardInfoEditorView.tsx   # Download→Register install UI + properties/versions UI (UIKit only)
│   │   ├── BoardScreenshot.tsx       # Catalog screenshot at a fixed 16:10 footprint — remote <img>, placeholder on no-URL/404; also used by the hub's Search boards tab
│   │   ├── board-info-id.ts          # BOARD_INFO_EDITOR_ID constant (avoids an import cycle with PageToolbar)
│   │   ├── open-board-info.ts        # openBoardInfo(page,opts) replaces a page's editor; openBoardInfoPage(opts) opens a new page
│   │   └── index.tsx
│   ├── tools-hub/          # Tools & Editors hub ("tools-hub-view") — full-page counterpart of the sidebar panel (singleton via fixed PageModel id)
│   │   ├── ToolsHubEditor.ts         # EditorModel — HubTab state; Built-in / Registered boards / Search boards / Tools
│   │   ├── ToolsHubView.tsx          # Tab strip + body + right Pinned rail (reuses the sidebar list components)
│   │   ├── SearchBoardsTab.tsx       # Published-catalog browse/filter — board cards → Board Info page
│   │   └── index.tsx
│   ├── toolset/            # Per-toolset viewer (non-text, no trait) — opened via persephone-toolset://
│   │   ├── ToolsetEditorModel.ts     # EditorModel ("toolset-view") — reads manifest, exposes tool list + log path; restore from toolsetRoot
│   │   ├── ToolsetEditorView.tsx     # Read-only view — manifest info + registered chip + Open-Folder / Open-Log + tool cards (UIKit only)
│   │   └── index.tsx                 # toolsetModule + legacy EditorModule factory (decodes the link)
│   ├── tools/              # Shared registered-toolsets tree (used by the sidebar Tools panels)
│   │   ├── ToolsTree.tsx             # Presentational Tree of toolsets (folder-compacted; open / trailing / context-menu slots)
│   │   └── tools-tree-build.ts       # Pure builder: toolset path list → compacted folder/toolset node tree (leaf label = manifest name)
│   ├── shared/             # Shared editor utilities
│   │   ├── link-open-menu.tsx
│   │   └── ColorizedCode.tsx         # Syntax-highlighted code via Monaco colorize()
│   │
│   ├── register-editors.ts # Editor registration — table-driven (EDITORS rows + loop) + content-host module preload
│   ├── types.ts            # View-module prop types (FileEditorComponent, EditorViewModule)
│   └── index.ts
│
├── scripting/              # Script Execution
│   ├── ScriptRunnerBase.ts # Core execution engine (transpile, execute, library)
│   ├── ScriptRunner.ts     # Orchestrator (context lifecycle, result handling)
│   ├── ScriptContext.ts    # Execution scope class (context proxy, cleanup)
│   ├── AutoloadRunner.ts   # Autoload registration scripts from library/autoload/
│   ├── script-utils.ts     # Utilities (convertToText)
│   ├── transpile.ts        # TypeScript transpilation via sucrase (lazy-loaded)
│   ├── library-require.ts  # Library require() resolution + .ts extension handler
│   ├── worker/             # Background worker execution (app.runAsync)
│   │   └── WorkerRunner.ts # Renderer-side: IPC to main, proxy dispatch
│   └── api-wrapper/        # Safe wrappers for script access
│       ├── AppWrapper.ts           # Wraps app → IApp (events proxy; compile-time member check)
│       ├── PageCollectionWrapper.ts # Wraps pages → IPageCollection
│       ├── PageWrapper.ts          # Wraps page → IPage (with asX() + auto-release)
│       ├── TextEditorFacade.ts     # ITextEditor facade
│       ├── GridEditorFacade.ts     # IGridEditor facade
│       ├── NotebookEditorFacade.ts # INotebookEditor facade
│       ├── LinkEditorFacade.ts     # ILinkEditor facade
│       ├── BrowserEditorFacade.ts  # IBrowserEditor facade
│       ├── MarkdownEditorFacade.ts # IMarkdownEditor facade
│       ├── SvgEditorFacade.ts      # ISvgEditor facade
│       ├── HtmlEditorFacade.ts     # IHtmlEditor facade
│       ├── MermaidEditorFacade.ts  # IMermaidEditor facade
│       ├── GraphEditorFacade.ts   # IGraphEditor facade (graph query/analysis, designed for MCP)
│       ├── UiFacade.ts             # Log View UI (logging + dialogs + output)
│       ├── Progress.ts            # Progress helper class (returned by ui.show.progress)
│       ├── Grid.ts                # Grid helper class (returned by ui.show.grid)
│       ├── Text.ts                # Text helper class (returned by ui.show.text)
│       ├── Markdown.ts            # Markdown helper class (returned by ui.show.markdown)
│       ├── Mermaid.ts             # Mermaid helper class (returned by ui.show.mermaid)
│       └── StyledTextBuilder.ts    # Fluent styled text builder + styledText() factory
│
├── automation/             # Browser Automation (Playwright-compatible MCP tools)
│   ├── types.ts            # IBrowserTarget interface
│   ├── CdpSession.ts       # CDP session wrapper (IPC to main process debugger)
│   ├── snapshot.ts         # Accessibility snapshot (main frame + iframes, overlay detection)
│   ├── input.ts            # Keyboard/text input (typeText, pressKey, fill strategies)
│   ├── ref.ts              # Ref resolution (parseRef, resolveRef, callOnRef → element coercion)
│   ├── AppTargetModel.ts   # Automation adapter (IBrowserTarget) for the app's own UI (pageId "app")
│   └── commands.ts         # browser_* MCP command handlers
│
├── uikit/                  # UIKit — Standalone Component Library (EPIC-025)
│   │                       # Canonical home for reusable primitives. Must not import from
│   │                       # api/, ui/, editors/, or app-specific code. Authoring rules
│   │                       # live in uikit/CLAUDE.md. See uikit-vs-components-split.md
│   │                       # for the permanent contract.
│   ├── CLAUDE.md           # UIKit authoring rules (canonical reference)
│   ├── tokens.ts           # Design tokens (spacing, sizing, radius, fontSize, gap, height)
│   ├── index.ts            # Public exports (one entry per primitive)
│   ├── Button/             # Button
│   ├── IconButton/         # Icon-only button (also: chip variant)
│   ├── SplitButton/        # Primary action + caret dropdown menu (composes IconButton + WithMenu)
│   ├── Input/              # Text input
│   ├── Textarea/           # Multi-line text input (contentEditable, auto-grow)
│   ├── Checkbox/           # Checkbox
│   ├── RadioGroup/         # Radio group
│   ├── Select/             # Single-select dropdown (replaces ComboSelect)
│   ├── MultiSelect/        # Multi-select dropdown (replaces ListMultiselect)
│   ├── Autocomplete/       # Autocomplete combobox
│   ├── PathInput/          # File/folder path input with picker
│   ├── SegmentedControl/   # Segmented switch (replaces SwitchButtons)
│   ├── Slider/             # Range slider
│   ├── ProgressBar/        # Linear progress
│   ├── Spinner/            # Indeterminate circular progress (replaces CircularProgress)
│   ├── Tag/                # Tag/chip pill (replaces Chip)
│   ├── TagsInput/          # Tag-editing input
│   ├── Label/              # Form label
│   ├── Text/               # Text element with theme styling
│   ├── TruncatedText/      # Overflow-ellipsis with hover title (replaces OverflowTooltipText)
│   ├── Breadcrumb/         # Breadcrumb path navigation
│   ├── Panel/              # Flex container (props-driven layout)
│   ├── Spacer/             # Flex spacer (replaces FlexSpace)
│   ├── Divider/            # Horizontal or vertical divider
│   ├── Dot/                # Status dot indicator
│   ├── CollapsiblePanelStack/ # Stacked collapsible panels
│   ├── Splitter/           # Resizable splitter
│   ├── Toolbar/            # Toolbar container (roving tabindex internally)
│   ├── Minimap/            # Mini map navigation overlay
│   ├── CategoryList/       # Category-style list
│   ├── ListBox/            # Virtualized list with selection + traits (replaces List)
│   ├── MultiListBox/       # Two-pane multi-select list
│   ├── Tree/               # Virtualized tree with trait drag-drop (replaces TreeView)
│   ├── Menu/               # Portal menu + WithMenu wrapper (replaces PopupMenu)
│   ├── Popover/            # Portal-based floating element (replaces Popper)
│   ├── Tooltip/            # Hover tooltip
│   ├── Dialog/             # Modal dialog
│   ├── Notification/       # Alert / toast notification + AlertsBar
│   ├── Progress/           # Progress overlay + screen lock
│   ├── RenderGrid/         # Foundational virtualization (sticky regions, RenderFlexGrid)
│   ├── AVGrid/             # Composite data grid (uses RenderGrid; filters, sorting, edit)
│   └── shared/             # Internal helpers (overlayRegistry, etc.)
│
├── components/             # Persephone-Coupled Components (KEEP-only)
│   │                       # Each remaining folder uses app.* APIs, page model, file
│   │                       # system, or scripting — that's the criterion. No new pure
│   │                       # primitives go here.
│   ├── tree-provider/      # TreeProviderView (generic tree viewer) + CategoryView (the folder page a tree navigates to) — both over any ITreeProvider
│   │   ├── favicon-cache.ts # Favicon download/cache for HTTP links (shared by link-editor, browser, tree icons)
│   │   ├── os-clipboard.ts  # OS file-clipboard actions (Cut/Copy/Paste ⇄ Windows Explorer) shared by the tree + category view models; file provider only
│   │   ├── plural-actions.tsx # Set-shaped actions shared by the tree + folder page: the multi-select gate, nested-item pruning, the plural menu, batch delete
│   │   └── tree-drop-actions.ts # Move/import drop actions, taking a { path, title } target rather than a tree node so both views can call them
│   ├── file-search/        # FileSearch — standalone file content search with virtualized results; accumulated rows live on the model, not in reactive state
│   ├── file-list/          # FileList — flat file list (FileIcon + single-click + search), reused by the Recent files panel and the git Changes panel; getTrailing/compact props (EPIC-031)
│   ├── file-grid/          # FileGrid — AVGrid-based file list (icon/path/status columns, header-as-label, sorting, range select + range-copy, single/double click, context-menu passthrough); git Changes panel; eventual FileList replacement (EPIC-031)
│   ├── icons/              # FileIcon, LanguageIcon
│   ├── page-manager/       # Portal-based page/tab host (prevents iframe/webview reload on reorder)
│   └── git-tree/           # Git history view (AVGrid + SVG BranchTreeCell + swimlane layout) + git data submodels (GitTreeModel = commits, GitChangesModel = staged/unstaged status, GitStatusBadge) — shared by the git-tree editor + File Diff picker + Changes panel (EPIC-030/031)
│
├── core/                   # Core Infrastructure
│   ├── state/              # State management primitives
│   │   ├── state.ts        # TOneState, TComponentState, TGlobalState
│   │   ├── model.ts        # TModel, TDialogModel, TComponentModel
│   │   ├── events.ts       # Subscription event system
│   │   ├── view.tsx        # View registry (dialogs/poppers)
│   │   └── index.ts
│   ├── traits/             # Trait system — drag-and-drop type negotiation (EPIC-026)
│   │   ├── traits.ts       # TraitKey<T>, TraitSet, Traited<V>, traited(), isTraited()
│   │   ├── TraitRegistry.ts # TraitRegistry singleton + TraitTypeId enum
│   │   ├── dnd.ts          # setTraitDragData, getTraitDragData, hasTraitDragData, resolveTraits
│   │   └── index.ts        # Public exports
│   ├── utils/              # Utility functions
│   │   ├── utils.ts        # General helpers
│   │   ├── parse-utils.ts  # JSON/JSON5 parsing, tryParseJson fallback
│   │   ├── guard.ts        # guard(label, fn) — run and report failure as a toast
│   │   ├── csv-utils.ts    # CSV parsing/generation
│   │   ├── html-resources.ts  # HTML resource extraction (cheerio)
│   │   ├── file-path.ts    # Archive-aware path utility (wraps ALL path.* usage)
│   │   ├── path-utils.ts   # Markdown link resolution
│   │   ├── obj-path.ts     # Deep object access by path
│   │   ├── language-mapping.ts  # Extension → Monaco language
│   │   ├── monaco-languages.ts  # Monaco language config
│   │   ├── file-watcher.ts      # File change detection
│   │   ├── copy-files.ts        # Recursive file/folder copy + move onto the local fs (paste backend; guards, progress, per-item errors)
│   │   ├── focus-utils.ts       # isFocusInSidebar() — editors skip mount/navigation autofocus while focus is in a sidebar panel
│   │   ├── memorize.ts          # Memoization
│   │   ├── types.ts             # Type helpers
│   │   └── index.ts
│   └── index.ts
│
├── theme/                  # Styling
│   ├── color.ts            # Color tokens (CSS custom properties)
│   ├── GlobalStyles.tsx    # Global CSS reset
│   ├── icons.tsx           # SVG icon components
│   ├── language-icons.tsx  # Language-specific icons
│   ├── palette-colors.ts   # Color palette definitions
│   └── themes/             # Theme definitions (9 themes)
│
├── types/                  # Global Type Declarations
│   ├── window.d.ts         # Window interface extension
│   └── events.d.ts         # MouseEvent extension
│
└── index.tsx               # React root component (AppContent)
```

## Main Process Structure

```
/src/main/
├── main-setup.ts           # Application setup and window creation
├── windows-env.ts          # Windows env backfill — reconstructs missing standard folder/system vars (APPDATA, LOCALAPPDATA, ProgramFiles*, …) at startup so child processes get a full env even when the app was launched from a degraded shell; win32-only, backfill-only
├── open-window.ts          # Window creation logic
├── open-windows.ts         # Multi-window management and broadcasting
├── window-states.ts        # Window state persistence
├── pipe-server.ts          # Named Pipe server (launcher integration)
├── mcp-http-server.ts      # MCP Streamable HTTP transport — sessions (idle reaper, cap), HTTP handling, start/stop lifecycle
├── mcp/                    # What the MCP server offers, separate from how it is served
│   ├── server-factory.ts   # createMcpServer({ browserTools }) — assembles manifest + tool groups + guide resources
│   ├── manifest.ts         # Server identity, client instructions, guide resource list, mtime-cached guide reader
│   ├── register-tools.ts   # Generic registrar + the pass-through that implements most tools
│   ├── renderer-bridge.ts  # MCP_EXECUTE/MCP_RESULT IPC — sendToRenderer with per-call timeout
│   ├── sdk.ts              # Lazy MCP SDK + zod loader (loadSdk / requireSdk)
│   ├── tool-results.ts     # Response → MCP content mappers (text, page content with image, screenshot)
│   ├── types.ts            # IMcpToolDef and friends
│   └── tools/              # The tools themselves, as data — one module per group (window, page, board, agent, browser, guide)
├── browser-service.ts      # Browser page support (webview management)
├── browser-registration.ts # Default browser registration
├── sidecar-process.ts      # Shared sidecar lifecycle (spawn → stdout-readiness sentinel → stop) used by tor-service and mneme-service: start dedupe, readiness timeout, stale-child guard, unexpected-death callback, stop-and-wait before respawn
├── tor-service.ts          # Tor concerns on top of sidecar-process: per-partition SOCKS5 proxy (fail-closed arming), torrc generation, restart-based reconnect, exit-IP/geo lookup through the partition's session
├── tor-src-protocol.ts     # tor-src:// scheme handler — fetches an http(s) URL through a Tor partition's session (the app renderer itself is unproxied); guarded by partition shape, live-partition check, and http(s)-only target
├── git-service.ts          # Git access via simple-git — status, stage/unstage/commit, branch/switch, fetch/push/pull, ahead-behind, log/show, --version probe — main-process only
├── download-service.ts     # Download management
├── search-service.ts       # File search host — owns one search-worker thread per sender window, relays its batches to the renderer; cancel/window-close is worker.terminate()
├── search-worker.ts        # File search walk — runs in a worker_thread (bundled separately to .vite/build/search-worker.js); never imports electron
├── worker-host.ts          # Worker thread host for app.runAsync (IPC + worker_threads)
├── command-runner.ts       # Streaming command runner — spawns child processes, streams stdout/stderr/exit over IPC by jobId; shared by app.proc.execute and the board bridge's execute(); whole-tree kill via taskkill; jobs carry an optional caller-chosen name + a getJobsBySinkIds query (board job re-association)
├── board-protocol-service.ts # board:// scheme handler — host→board-root registry; serves board files + CSP; injects --p-* palette, boot context, and the bridge shim into served HTML
├── board-bridge.ts         # Per-board MessagePort bridge — execute() over the command runner, dialogs/readFile/writeFile, openRawLink/notify, theme push; busy-owner job retention (a busy board's jobs survive its unload, reaped on final teardown/page close/crash)
├── cdp-service.ts          # CDP session service for browser_* automation — attaches the debugger to webContents; board frames registered/resolved by their ?v= nonce
├── mneme-service.ts        # Mneme concerns on top of sidecar-process: port/config wiring and MnemeStatus broadcasts for the knowledge-base service
├── snip-service.ts         # Screen snip (spawns persephone-snip.exe, reads PNG from stdout; exports getSnipToolPath for clip-service)
├── clip-service.ts         # Windows file-clipboard (CF_HDROP) read/write via the snip exe's clipboard subcommands — Explorer copy/paste interop; degrades to empty result when the exe is missing
├── version-service.ts      # Version checking (runs in main, not renderer)
├── published-boards-service.ts # Published-boards catalog — net.fetch raw boards-manifest.json (24h-gated, cached, isSafeBoardId/isSafeAssetName-guarded), getBoardVersions(id) on demand, ePublishedBoardsUpdated broadcast; screenshotUrl derived on the way out (never cached); PERSEPHONE_BOARDS_BRANCH dev override
├── board-download-service.ts # Streamed board-archive download — net.fetch → temp file + incremental sha256 verify, throttled eBoardInstallProgress, digest check
├── video-stream-server.ts  # Local HTTP streaming server (range requests, faststart MP4 relocation, session management)
├── vlc-launcher.ts         # VLC process launcher (spawn + auto-detect VLC path)
├── terminal-launcher.ts    # Terminal launcher — detectTerminal (pwsh→powershell→cmd via `where`) + openTerminalAt (cmd /c start, gives the console shell its own window) for "Open Terminal here"
├── tray-setup.ts           # System tray
├── drag-model.ts           # Tab drag between windows
├── e-store.ts              # Electron store wrapper
├── dialog-folder-memory.ts # Last-used folder per native dialog kind (open/save/folder), persisted in electronStore under dialog.lastDir.<kind>; resolveDefaultPath applies the precedence, rememberDirFromPick records a completed pick
├── fileIconCache.ts        # File icon caching
├── constants.ts            # Main process constants
└── utils.ts                # Main process utilities
```

## IPC Layer

```
/src/ipc/
├── api-types.ts            # IPC channel definitions
├── api-param-types.ts      # IPC parameter types
├── browser-ipc.ts          # Browser-specific IPC channels
├── tor-ipc.ts              # Tor service IPC channels (start, stop, log, check-ip, restart, status) + TorStatus/TorIpInfo types
├── git-ipc.ts              # Git service IPC channel names + request/response types
├── clipboard-ipc.ts        # File-clipboard DTOs (ClipboardFileList — CF_HDROP paths + drop effect)
├── search-ipc.ts           # Search IPC channels + wire types; also the batch-flush bounds, the matched-line result cap, and the default exclude patterns that seed the search-exclude setting
├── worker-channels.ts      # Worker thread IPC channels (app.runAsync)
├── runner-channels.ts      # Streaming command-runner IPC channels + wire types (RunnerChannel, inbound/outbound message unions, IExecuteHandle contract — implemented once in shared/execute-handle.ts for proc.ts and board-shim.ts)
├── popup-rate-limiter.ts   # Global popup/tab rate limiter (app-wide singleton)
├── main/                   # Main process handlers
│   ├── controller.ts       # IPC handler registration
│   ├── dialog-handlers.ts  # File dialog handlers — the single place all three native dialogs are opened (renderer app.fs and the board bridge both route here); resolves the starting folder through dialog-folder-memory and records the pick
│   ├── renderer-events.ts  # Events sent TO renderer
│   └── window-handlers.ts  # Window management handlers
└── renderer/               # Renderer process API
    ├── api.ts              # IPC API (typed method calls)
    └── renderer-events.ts  # Events received FROM main
```

## When to Create New Folders

| Scenario | Location |
|----------|----------|
| New editor type | `/editors/[name]/` |
| New Object Model interface | `/api/[name].ts` + `/api/types/[name].d.ts` |
| New composed API (multiple files) | `/api/[name]/` subfolder |
| New internal service | `/api/internal/` |
| New reusable UIKit primitive | `/uikit/<ComponentName>/` |
| New persephone-coupled component | `/components/<existing-keep-folder>/` (`icons/`, `page-manager/`, `file-search/`, `file-list/`, `file-grid/`, `tree-provider/`, `git-tree/`) |
| New utility | `/core/utils/` |
| New scripting facade | `/scripting/api-wrapper/[Name]Facade.ts` |

## Import Conventions

```typescript
// Direct imports preferred — avoid barrel imports that cause circular deps
import { pagesModel } from "../../api/pages";
import { app } from "../../api/app";

// Specific component imports — UIKit primitives
import { Button } from "../../uikit/Button/Button";

// Type-only imports for code splitting (erased at compile time)
import type { BrowserEditorModel } from "../../editors/browser/BrowserEditorModel";

// Dynamic imports for editors (preserves code splitting)
const { ArchiveEditorView } = await import("../editors/archive/ArchiveEditorView");
```
