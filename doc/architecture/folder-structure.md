# Folder Structure

Detailed organization of the codebase. Verified against actual source files.

## Root Structure

```
persephone/
├── src/                    # Source code
│   ├── main/               # Electron main process
│   ├── renderer/           # Native VanillaView frontend plus the Excalidraw React island (see below)
│   ├── ipc/                # IPC communication layer
│   ├── shared/             # Shared types, constants and cross-process helpers (errMessage, the execute() handle state machine, AiVision resolver/types)
│   ├── renderer.ts          # Async bootstrap; calls renderer/index.ts mount(container)
│   ├── preload.ts          # Preload script (main renderer)
│   ├── board-shim.ts       # Board bridge shim entry — browser IIFE inlined into board HTML; boot, host trust gate, MessagePort plumbing, window.persephone
│   ├── board-context-menu.ts # Browser-safe Board context menu, image and editable-field clipboard support
│   └── board-console-mirror.ts # Browser-safe Board error and console warning/error reporting to the host frame
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
│   ├── mcp-res-graph.md    # MCP resource: force-graph data format & page.editor API
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
├── mneme/                  # Rust knowledge-base / vector-memory service (mneme.exe) — standalone, extraction-ready
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
├── qa/                     # MCP QA suites, split between tool-oriented and surface-oriented tests
│   ├── mcp-test-*.md       # Tests grouped by MCP tool
│   ├── surfaces/           # Tests grouped by the application surface under test
│   │   └── editors/        # Manual call-only checks for editor facades and controls
│   └── runs/               # Recorded test-agent runs
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

The renderer entry is `src/renderer.ts`: after asynchronous application bootstrap it calls
`mount(container)` exported by `src/renderer/index.ts`. The application shell, coupled views,
editors, and UIKit are framework-free `VanillaView` classes. The only React root is the Excalidraw
vendor island under `editors/draw/`; native global styles are installed by `theme/global-styles.ts`.

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
│   ├── menu-bar.ts         # MenuBarModel — reactive Menu Bar openness, folder selection, and legacy opener bridge
│   ├── ui.ts               # IUserInterface implementation
│   ├── downloads.ts        # IDownloads implementation
│   ├── menu-folders.ts     # IMenuFolders implementation
│   ├── library-service.ts  # LibraryService — script library scanning, caching, file watching
│   ├── autoload-service.ts # Thin wrapper exposing AutoloadRunner to app lifecycle
│   ├── pages.ts            # PagesModel singleton export
│   ├── mcp-handler.ts      # Thin MCP IPC shell (receives commands from main, logs and returns results)
│   ├── mcp/                # Renderer MCP command dispatch and focused command handlers
│   │   ├── command-registry.ts # Built-in command registry + dynamic browser_* dispatch
│   │   ├── call-command.ts  # Renderer-side MCP call command; creates a ScriptContext and resolves AiVision
│   │   ├── board-call-command.ts # Page-scoped Board bridge calls; owner-page and trust checks
│   │   ├── page-commands.ts # Page, script, app-info, and URL command handlers
│   │   ├── board-commands.ts # Board lifecycle and refresh command handlers
│   │   ├── ui-push.ts       # ui_push validation and Log View integration
│   │   ├── tool-commands.ts # Agent Tools registry command handlers
│   │   ├── request-log.ts   # Bounded MCP request history and server-log page integration
│   │   └── types.ts         # Shared renderer MCP request/response types
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
│   ├── tools/              # Agent Tools registry — deliberately NOT on app or any script .d.ts
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
│   │   ├── GlobalEventService.ts    # contextmenu, dragover, drop, paste (image capture; rich HTML bubble fallback with handled/editable/grid stand-downs), unhandled rejections
│   │   ├── clipboard-image.ts       # Paste helpers: image file → Image viewer (capture); any rich HTML → HTML viewer (bubble fallback)
│   │   ├── KeyboardService.ts       # Global keyboard shortcuts
│   │   ├── WindowStateService.ts    # Window maximize/zoom state tracking
│   │   └── RendererEventsService.ts # IPC event subscriptions (open file, quit, etc.)
│   │
│   ├── events/             # Event channel system (scriptable events)
│   │   ├── AppEvents.ts             # app.events namespace (linkContextMenu, fileExplorer, etc.)
│   │   ├── BaseEvent.ts             # Base event class with `handled` flag
│   │   ├── EventChannel.ts          # EventChannel<T> — subscribe, send, sendAsync, dispose
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
│       ├── page.d.ts       # IPage interface (with `editor` and `editorSwitches`)
│       ├── page-panels.d.ts # IPagePanels — live page sidebar panel surface
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
│       ├── rest-client-editor.d.ts # IRestClientEditor — REST request/response surface
│       ├── env-vars-editor.d.ts # IEnvVarsEditor — environment-variable state and actions
│       ├── archive-editor.d.ts # IArchiveEditor — archive entries and extraction
│       ├── folder-view-editor.d.ts # IFolderViewEditor — provider-backed folder navigation
│       ├── git-tree-editor.d.ts # IGitTreeEditor — Git history, refs, and changes
│       ├── log-view-editor.d.ts # ILogViewEditor — Log View entries and non-blocking output
│       ├── events.d.ts       # IEventChannel, IBaseEvent, IContextMenuEvent, MenuItem, IFileTarget
│       ├── io.d.ts            # IIoNamespace — script `io` global (providers, transformers, tree providers, createPipe)
│       ├── io.provider.d.ts  # IProvider, IProviderStat, IProviderDescriptor
│       ├── io.transformer.d.ts # ITransformer, ITransformerDescriptor
│       ├── io.pipe.d.ts      # IContentPipe, IPipeDescriptor
│       ├── io.link-data.d.ts # ILinkData plus StoredLinkData — composable pipeline and persistence shapes
│       └── io.tree.d.ts     # ITreeProvider, ILink (was ITreeProviderItem), ITreeStat, ITreeSearch*
│
├── content/                # Content delivery layer — providers, transformers, pipes
│   ├── ContentPipe.ts      # IContentPipe implementation, createPipe() factory
│   ├── PipePair.ts         # Paired TextFile source/cache pipe ownership and disposal
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
│   ├── tree-context-menus.ts    # Default context menu handlers for tree provider items
│   └── open-with-default-app.ts # Hand a path to the OS shell (shell.openPath); shared by the tree context menu and Explorer double-click
│
├── ui/                     # Application Shell
│   ├── app/                # Root shell
│   │   ├── MainPageView.ts         # Native root layout (header, tabs, editors, sidebar)
│   │   ├── PagesView.ts            # Native page container/router
│   │   ├── RenderEditorView.ts      # Native editor dispatcher
│   │   ├── AsyncEditorView.ts      # Native async editor loader and error surface
│   │   └── PageContentView.ts        # Native page content and editor lifecycle
│   ├── tabs/               # Tab bar
│   │   ├── PageTabsView.ts         # Native tab strip and scroll projection
│   │   ├── PageTab.ts              # Tab props/constants and shared helpers
│   │   ├── PageTabView.ts          # Native tab, drag, and activation behavior
│   │   └── PageTabs.css
│   ├── sidebar/            # Sidebar/menu panel
│   │   ├── MenuBarView.ts          # Native top menu bar
│   │   ├── OpenTabsListView.ts      # Native open-tabs list
│   │   ├── RecentFileListView.ts    # Native recent-files panel
│   │   ├── ToolsEditorsPanelView.ts # Native Tools & Editors panel
│   │   ├── TrustedBoardsListView.ts   # Native trusted-board list and owned trailing controls
│   │   ├── TrustedToolsListView.ts    # Native trusted-toolset list and owned trailing controls
│   │   ├── pinned-items.ts          # Unified PinnedRef model over the pinned-editors setting (editors + "board:<root>" pins)
│   │   ├── tools-editors-registry.ts # Creatable items registry (editors + tools)
│   │   ├── ScriptLibraryPanelView.ts # Native script-library panel
│   │   ├── FolderItemView.ts        # Native folder tree item
│   │   ├── BuiltinEditorsListView.ts # Native built-in editor list
│   │   ├── PinnedRailView.ts        # Native pinned rail
│   ├── dialogs/            # Application dialogs
│   │   ├── Dialogs.ts              # Dialog state/actions API
│   │   ├── DialogsView.ts          # Native dialog host and slot ownership
│   │   ├── dialog-view-registry.ts # Only dialog/popper view registry; maps view IDs to native constructors
│   │   ├── DialogsView.ts          # Native dialog host
│   │   ├── ConfirmationDialog.ts
│   │   ├── InputDialog.ts
│   │   ├── PasswordDialog.ts
│   │   ├── TorInfoDialog.ts         # Tor connection info — exit IP, location, check.torproject.org verdict; Reconnect restarts tor.exe
│   │   ├── RegisterToolsetDialog.ts # Agent-initiated toolset registration confirmation (Allow/Deny; RCE gate)
│   │   ├── CreateBoardVarsStorageDialog.ts # First-use "Create environment variables storage" prompt (default path, editable) — shown by both persephone.var.* and app.boardVars.*
│   │   ├── NamespaceCollisionDialog.ts # Non-blocking advisory at board registration when the new board's author/name namespace collides with an already-registered board
│   │   ├── TextDialog.ts            # Multi-purpose text dialog (Monaco editor)
│   │   ├── alerts/                 # Notification bar
│   │   │   ├── AlertsBar.ts
│   │   │   └── AlertItem.ts
│   │   ├── progress/               # Progress overlay, notifications, screen lock
│   │   │   ├── ProgressModel.ts    # State + API (showProgress, createProgress, notifyProgress, addScreenLock)
│   │   │   └── ProgressOverlay.ts  # Two-zone overlay model
│   │   ├── poppers/                # Floating menus
│   │   │   ├── Poppers.ts
│   │   │   ├── PoppersView.ts      # Native popper host and slot ownership
│   │   │   ├── showPopupMenu.ts
│   │   │   └── types.ts
│   │   └── index.ts
│   └── secondary-views/    # SecondaryViews — native controlled panel host
│       ├── SecondaryViewsView.ts    # Native panel host; owns the header element (headerHost)
│       ├── SecondaryViewsModel.ts   # Reactive state (open, width, activePanel)
│       ├── LazySecondaryViewView.ts  # Native dynamic panel loader (vanilla arm)
│       ├── SideBarPanelHeaderView.ts # React-free DOM header factory
│       ├── SideBarPanelHeader.css   # Static panel-header styles
│       ├── panel-key.ts             # Composite panel keys (`${editorId}::${panelId}`)
│       └── secondary-view-registry.ts # Registry: panel ID → native view loader
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
│   │   ├── PageToolbarView.ts        # Native page toolbar — NavPanel + switch widget auto-slots
│   │   ├── TextChromeView.ts         # Native host-aware chrome (toolbar, script panel, footer)
│   │   ├── EditorToolbarView.ts      # Native toolbar root used by individual editors
│   │   ├── ContentHostFooterView.ts  # Native text-host footer
│   │   ├── ContentHostFooter.css     # Footer styles
│   │   ├── EditorConfig.ts            # Editor configuration value and empty default
│   │   └── index.ts
│   │
│   ├── text/               # Text file content host (file I/O + encryption + script panel)
│   │   ├── TextEditorModel.ts        # TextFileModel — file-backed IContentHost (state, file I/O, encryption)
│   │   ├── TextFileIOModel.ts        # File I/O via content pipes (read/write/watch/cache)
│   │   ├── TextFileActionsModel.ts   # Text actions (duplicate, transform)
│   │   ├── TextFileEncryptionModel.ts # Encryption state machine
│   │   ├── ScriptPanel.ts            # Script panel model
│   │   ├── ScriptPanelView.ts        # Native inline script runner panel
│   │   ├── paste-rich-text.ts        # Rich-text paste handler
│   │   └── index.ts
│   ├── monaco/             # Monaco text editor (text-bearing, IContentHost + TRAIT)
│   │   ├── MonacoEditor.ts           # EditorModel subclass — composes IContentHost, hosts Monaco
│   │   ├── MonacoBodyView.ts         # Native Monaco body
│   │   └── index.ts
│   ├── grid/               # JSON/CSV/JSONL grid editor (text-bearing, IContentHost + TRAIT)
│   │   ├── GridEditor.ts             # EditorModel — parsing, sort/filter/edit state
│   │   ├── GridBodyView.ts            # Native DataGrid integration
│   │   ├── components/               # Grid-specific components
│   │   ├── utils/                    # Grid utilities
│   │   ├── util.ts                   # Shared utility helpers
│   │   └── index.ts
│   ├── markdown/           # Markdown preview (text-bearing, IContentHost + TRAIT)
│   │   ├── MarkdownEditor.ts         # EditorModel — search state, scroll, compact
│   │   ├── MarkdownBodyView.ts        # Native body (search, minimap, scroll and host binding)
│   │   ├── MarkdownBlockView.ts       # Reusable markdown rendering (HAST-to-DOM, search + anchors)
│   │   ├── MarkdownBlock.css         # Scoped stylesheet for generated Markdown DOM
│   │   ├── CodeBlock.ts              # Code block + inline Mermaid (+ copyImageToClipboard helper)
│   │   ├── MarkdownImage.ts          # Rendered image + hover toolbar (Copy / Open in new tab)
│   │   ├── hast-dom.ts               # HAST properties and namespace conversion
│   │   ├── rehypeMarkdownOverrides.ts # HAST rewrites for links and task-list inputs
│   │   ├── rehypeHighlight.ts        # Search text highlighting
│   │   ├── rehypeHeadingIds.ts       # Heading slug ids for #fragment links (+ slugifyHeading)
│   │   ├── markdown-nav.ts           # isLocalMarkdownHref — local-.md link detection for in-page nav
│   │   └── index.ts
│   │
│   ├── browser/            # Built-in browser (non-text, no trait)
│   │   ├── BrowserEditor.ts          # EditorModel subclass — registry entry point
│   │   ├── BrowserEditorModel.ts     # Browser state types, defaults, and partition helper
│   │   ├── BrowserTabsModel.ts       # Internal tabs, URL/favicon caches, bookmarks resource
│   │   ├── BrowserTorModel.ts         # Tor partition and daemon lifecycle
│   │   ├── BrowserView.ts             # Native browser UI and per-tab webview host
│   │   ├── BrowserWebviewModel.ts    # Webview management
│   │   ├── webview-context-menu.ts    # Webview context-menu construction
│   │   ├── BrowserUrlBarModel.ts     # URL bar state
│   │   ├── BrowserTargetModel.ts     # Automation adapter (implements IBrowserTarget)
│   │   ├── BrowserTabsPanel.ts        # Native browser tab bar and compact hover preview
│   │   ├── BrowserTabsPanel.css      # Scoped browser-tab presentation
│   │   ├── BrowserView.css           # Scoped browser/webview presentation
│   │   ├── BookmarksDrawer.ts         # Native bookmarks panel
│   │   ├── DownloadButton.ts          # Download indicator
│   │   ├── BrowserDownloadsPopup.ts  # Download list popup
│   │   ├── UrlSuggestionsDropdown.ts  # URL autocomplete
│   │   ├── TorStatusOverlay.ts        # Tor connection status
│   │   ├── BrowserBookmarks.ts       # Bookmarks data management (wraps TextFileModel + LinkEditor)
│   │   ├── BrowserBookmarksUIModel.ts # Bookmarks UI state
│   │   ├── BrowserPanelHost.ts       # IPageHost impl for browser's bookmarks sidebar
│   │   ├── BrowserSecondaryViews.ts   # Native secondary views for blank page and BookmarksDrawer
│   │   ├── browser-search-history.ts # Search history
│   │   ├── network-log-links.ts      # Network log → ILink[] conversion
│   │   ├── browser-pages.ts          # showBrowserPage / openUrlInBrowserTab — page opening; keeps the browser chunk out of startup
│   │   └── index.ts
│   ├── notebook/           # Notebook editor (text-bearing, IContentHost + TRAIT)
│   │   ├── NotebookEditor.ts         # EditorModel — page-level notes, categories, tags
│   │   ├── NotebookBodyView.ts       # Native body (MeasuredRowGrid + expanded overlay)
│   │   ├── NoteItemView.ts           # Recycled native note cell
│   │   ├── NoteItemViewModel.ts      # Per-row view model for virtualized note list
│   │   ├── ExpandedNoteView.ts        # Expanded note overlay
│   │   ├── TagsListView.ts
│   │   ├── category-tree.ts
│   │   ├── notebookTypes.ts
│   │   ├── note-editor/              # Per-note embedded editor subsystem
│   │   │   ├── NoteItemEditModel.ts  # IContentHost for one note (no file I/O — state in notebook JSON)
│   │   │   ├── MiniTextEditorView.ts  # Monaco mini-editor used for monaco notes
│   │   │   ├── NoteItemActiveEditorView.ts # Embeds language-gated editors per note
│   │   │   ├── NoteItemToolbarView.ts
│   │   │   └── index.ts
│   │   ├── panels/                   # Secondary view panel components
│   │   │   ├── NotebookCategoriesSecondaryView.ts  # "notebook-categories" panel
│   │   │   └── NotebookTagsSecondaryView.ts        # "notebook-tags" panel
│   │   └── index.ts
│   ├── link-editor/        # Link collection editor (text-bearing, IContentHost + TRAIT)
│   │   ├── LinkEditor.ts             # EditorModel — links, categories, tags, filters
│   │   ├── LinkBody.ts               # Native link body and branch ownership
│   │   ├── LinkTreeProvider.ts       # ITreeProvider adapter over LinkEditor state; drag-drop import (files→links, links across windows)
│   │   ├── linkTypes.ts
│   │   ├── link-open.ts              # buildLinkEditorContent — links → .link.json content; dependency-light for the sync openLinks API
│   │   ├── tor-src.ts                # Rewrites remote image src → tor-src:// when the editor is hosted by a Tor browser page (the app renderer is unproxied); local schemes pass through
│   │   ├── pipe-image-src.ts         # usePipeImageSrc — reads an archive-entry imgSrc through a content pipe into a cached blob URL; every other src shape passes through
│   │   ├── panels/                   # Shared panel components (inline + secondary view)
│   │   │   ├── LinkCategoryPanel.ts         # Categories tree panel
│   │   │   ├── LinkTagsPanel.ts             # Tags list panel
│   │   │   ├── LinkHostnamesPanel.ts        # Hostnames list panel
│   │   │   ├── LinkCategorySecondaryView.ts    # Secondary view wrapper
│   │   │   ├── LinkTagsSecondaryView.ts        # Secondary view wrapper
│   │   │   └── LinkHostnamesSecondaryView.ts   # Secondary view wrapper
│   │   ├── LinksList.ts              # Native/type module
│   │   ├── LinksListView.ts           # Native RenderGrid list renderer
│   │   ├── LinksTiles.ts             # Native/type module
│   │   ├── LinksTilesView.ts          # Native RenderGrid tile renderer
│   │   ├── LinkTooltipView.ts         # Native tooltip content
│   │   ├── PinnedLinksPanelView.ts    # Native pinned-links panel
│   │   ├── EditLinkDialog.ts       # Edit-link dialog model and registration
│   │   ├── EditLinkDialogView.ts   # Native edit-link dialog view
│   │   └── index.ts
│   ├── svg/                # SVG preview (text-bearing, IContentHost + TRAIT)
│   │   ├── SvgEditor.ts              # EditorModel — SVG state
│   │   ├── SvgBodyView.ts             # Native preview body
│   │   └── index.ts
│   ├── html/               # HTML preview (text-bearing, IContentHost + TRAIT)
│   │   ├── HtmlEditor.ts             # EditorModel — HTML state
│   │   ├── HtmlBodyView.ts            # Native sandboxed preview body
│   │   └── index.ts
│   ├── mermaid/            # Mermaid diagram preview (text-bearing, IContentHost + TRAIT)
│   │   ├── MermaidEditor.ts          # EditorModel — SVG URL, loading, error, light mode
│   │   ├── MermaidBodyView.ts         # Native preview body
│   │   ├── render-mermaid.ts         # Rendering utilities (shared with Markdown)
│   │   └── index.ts
│   ├── graph/              # Force graph viewer (text-bearing, IContentHost + TRAIT)
│   │   ├── GraphEditor.ts            # EditorModel — JSON parsing, orchestration, sub-models
│   │   ├── GraphBodyView.ts          # Native canvas graph body and interaction wiring
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
│   │   ├── GraphDetailPanelView.ts    # Collapsible detail panel overlay
│   │   ├── GraphDetailPanel.css      # Scoped graph-detail presentation
│   │   ├── GraphTuningSlidersView.ts
│   │   ├── GraphExpansionSettingsView.ts
│   │   ├── GraphLegendPanelView.ts
│   │   ├── GraphIcons.ts
│   │   ├── GraphTooltipView.ts
│   │   ├── GraphBody.css              # Canvas/body geometry and native graph presentation
│   │   ├── GraphExpansionSettings.css
│   │   ├── GraphLegendPanel.css
│   │   ├── GraphTooltip.css
│   │   ├── GraphTuningSliders.css
│   │   ├── shapeGeometry.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── index.ts
│   ├── draw/               # Excalidraw drawing editor (text-bearing, IContentHost + TRAIT)
│   │   ├── DrawEditor.ts             # EditorModel — JSON parsing, fingerprint change detection
│   │   ├── DrawBodyView.ts            # Native chrome, model binding, and vendor-host lifecycle
│   │   ├── ExcalidrawIsland.tsx       # Deliberate React island required by Excalidraw
│   │   ├── drawExport.ts             # Export helpers
│   │   ├── drawLibrary.ts            # Library persistence
│   │   └── index.ts
│   ├── log-view/           # Log viewer (text-bearing, IContentHost + TRAIT)
│   │   ├── LogViewEditor.ts          # EditorModel — JSONL parsing, entry management
│   │   ├── LogBodyView.ts             # Log viewer native view (MeasuredRowGrid + auto-scroll)
│   │   ├── LogEntryWrapper.ts        # Cell root — subscribes to entries[index]
│   │   ├── LogEntryContent.ts        # Type router — dispatches to entry renderers
│   │   ├── LogMessageView.ts          # Log message renderer
│   │   ├── StyledTextView.ts          # StyledText renderer
│   │   ├── logTypes.ts               # LogEntry, StyledText, dialog/output types
│   │   ├── logConstants.ts
│   │   ├── items/                    # Dialog and output entry renderers (15 files)
│   │   └── index.ts
│   ├── rest-client/        # Rest Client editor (text-bearing, IContentHost + TRAIT)
│   │   ├── RestClientEditor.ts       # EditorModel — collections, requests, responses
│   │   ├── RestClientBodyView.ts      # Native request/response composition
│   │   ├── RestClientShared.ts        # Shared request/response helpers and types
│   │   ├── RequestBuilderView.ts      # Native request builder
│   │   ├── ResponseViewerView.ts      # Native response viewer
│   │   ├── KeyValueEditorView.ts      # Native key/value editor
│   │   ├── multipartBuilder.ts
│   │   ├── httpConstants.ts
│   │   ├── open-in-rest-client.ts
│   │   ├── panels/                   # Secondary view panel components
│   │   │   └── RestPanelSecondaryView.ts         # "rest" panel
│   │   └── index.ts
│   ├── env-vars/           # Board environment-variables editor (text-bearing, IContentHost + TRAIT)
│   │   ├── EnvVarsEditor.ts          # EditorModel — namespace/profile selection, CRUD over the namespace's profile data
│   │   ├── EnvVarsBodyView.ts         # Native environment-variable grid body
│   │   ├── open-env-vars.ts          # openEnvVarsPage(namespace) — used by persephone.var.show() and app.boardVars.show(namespace)
│   │   └── index.ts
│   ├── image/              # Image viewer (non-text, no trait)
│   │   ├── ImageEditor.ts            # EditorModel — pipe-backed image state
│   │   ├── ImageView.ts              # Native page view
│   │   └── index.ts
│   ├── mcp-inspector/      # MCP Inspector (non-text, no trait)
│   │   ├── McpInspectorEditorModel.ts # EditorModel — connection, tools, resources, prompts
│   │   ├── McpInspectorView.ts        # Main view — connection bar, panel routing
│   │   ├── McpConnectionManager.ts   # MCP SDK Client wrapper
│   │   ├── McpConnectionStore.ts     # Saved connections store (mcp-connections.json)
│   │   ├── ToolsPanel.ts
│   │   ├── ToolArgForm.ts
│   │   ├── ToolResultView.ts
│   │   ├── ResourcesPanel.ts
│   │   ├── ResourceContentView.ts
│   │   ├── PromptsPanel.ts
│   │   ├── mcp-inspector.css
│   │   └── index.ts
│   ├── compare/            # Diff editor (non-text, no trait)
│   │   ├── CompareEditor.ts
│   │   └── index.ts
│   ├── file-diff/          # Git revision diff editor (text-bearing, IContentHost + TRAIT)
│   │   ├── FileDiffEditor.ts         # EditorModel — revision selection and diff state
│   │   ├── FileDiffBodyModel.ts      # Diff content and revision state
│   │   ├── FileDiffBodyView.ts       # Native diff body and Monaco host composition
│   │   ├── FileDiffToolbarView.ts    # Native revision toolbar
│   │   ├── RevisionPickerView.ts     # Native revision picker popover
│   │   ├── GitDiffRevisionsSecondaryView.ts # Native revisions sidebar panel
│   │   └── index.ts
│   ├── about/              # About page (non-text, no trait)
│   │   ├── AboutEditor.ts            # EditorModel
│   │   ├── AboutView.ts
│   │   └── index.ts
│   ├── settings/           # Settings page (non-text, no trait)
│   │   ├── SettingsEditor.ts         # EditorModel
│   │   ├── SettingsView.ts            # Page layout + section composition
│   │   ├── sections/                  # Focused settings views + component models
│   │   │   ├── BrowserProfilesSection.ts
│   │   │   ├── BrowserProfilesSectionModel.ts # Profile CRUD, bookmarks + partition cleanup
│   │   │   ├── DefaultBrowserSection.ts
│   │   │   ├── DefaultBrowserSection.ts       # Registration status + actions
│   │   │   ├── McpSection.ts
│   │   │   ├── McpSectionModel.ts    # MCP/Mneme status, validation + actions
│   │   │   ├── FileSearchSection.ts
│   │   │   ├── ThemeSection.ts
│   │   │   ├── SettingsSections.ts
│   │   │   └── settings-native.ts   # Shared native settings helpers
│   │   └── index.ts
│   ├── storybook/          # Native Storybook editor and component gallery
│   │   ├── StorybookEditorModel.ts   # EditorModel — component browser, live preview
│   │   ├── StorybookEditorView.ts
│   │   ├── ComponentBrowser.ts
│   │   ├── LivePreview.ts
│   │   ├── PropertyEditor.ts
│   │   ├── iconPresets.ts
│   │   ├── story-props.ts            # Shared story prop preparation
│   │   ├── storyRegistry.ts
│   │   ├── renderGridStory.ts        # RenderGrid virtualization story
│   │   ├── storyTypes.ts
│   │   └── index.ts
│   ├── video/              # Audio/Video player (non-text, no trait)
│   │   ├── VideoEditor.ts            # EditorModel — playback state, streaming integration
│   │   ├── VideoView.ts              # Native editor view
│   │   ├── VPlayer.ts                # Video playback view (video.js + hls.js)
│   │   ├── AudioPlayer.ts             # Audio file playback with visualizer
│   │   ├── AudioVisualizer.ts         # Frequency visualization (switchable effects)
│   │   ├── AudioControls.ts
│   │   ├── video-editor.css           # Static video-editor presentation styles
│   │   ├── effects/                  # Audio visualizer effect implementations
│   │   │   ├── types.ts
│   │   │   ├── BarsEffect.ts
│   │   │   └── CircularEffect.ts
│   │   ├── NodeFetchHlsLoader.ts     # Custom hls.js loader via nodeFetch
│   │   ├── video-types.ts
│   │   └── index.ts
│   ├── category/           # Category/folder view (non-text, no trait — provider-agnostic)
│   │   ├── CategoryEditor.ts         # EditorModel + native view (single file)
│   │   ├── CategoryEditorModel.ts    # Page model — decodes tree-category:// link
│   │   ├── FolderViewModeService.ts  # Per-folder view mode persistence
│   │   └── index.ts
│   ├── archive/            # Archive editor (non-text, with sidebar panel)
│   │   ├── ArchiveEditor.ts          # EditorModel — archive state, tree provider, navigation survival
│   │   ├── ArchiveEditorView.ts       # Main content view
│   │   ├── ArchiveSecondaryView.ts    # Secondary panel — tree view with native header
│   │   └── index.ts
│   ├── explorer/           # File explorer (non-text, sidebar-only)
│   │   ├── ExplorerEditorModel.ts    # EditorModel — tree provider, selection, search, root navigation
│   │   ├── page-explorer.ts          # Explorer provisioning for a page — toggleNavigator, auto-init
│   │   ├── ExplorerSecondaryView.ts   # "explorer" panel — tree view with native header
│   │   ├── SearchSecondaryView.ts  # "search" panel — file search with native header
│   │   ├── BoardsSecondaryView.ts # "boards" panel — Boards/Tools body switch: trusted boards (BoardsTree) or registered toolsets (ToolsTree) under the Explorer root; "+ New board" in the switch row
│   │   └── index.ts
│   ├── mneme-config/       # Mneme config & monitoring editor (non-text, no trait)
│   │   ├── MnemeConfigEditorModel.ts # EditorModel — roots, include/ignore, reindex + progress, model, status polling
│   │   ├── MnemeConfigView.ts        # Main view (single page)
│   │   ├── RootsPanel.ts             # Roots + include/ignore + reindex/progress
│   │   ├── ModelPanel.ts             # Embedding-model status + update
│   │   ├── mnemeTypes.ts             # Shared types + parseToolResult helper
│   │   └── index.ts
│   ├── mneme-root/         # Mneme root — search main view + Explorer-like tree sidebar (Pattern B navigation-singleton, per-folder)
│   │   ├── MnemeRootEditorModel.ts   # EditorModel — root resolve, search (text/vector/hybrid), tree state
│   │   ├── MnemeRootEditorView.ts    # Search UI + ranked results
│   │   ├── MnemeTreeSecondaryView.ts # "mneme-tree" sidebar panel (browse/create/rename/delete/drop)
│   │   ├── results-to-markdown.ts    # Render search hits as markdown
│   │   └── index.ts
│   ├── board/              # Board editor (non-text, Pattern B survive-navigation)
│   │   ├── BoardEditorModel.ts       # EditorModel — single-board lifecycle, per-board trust gate, live iframe ref, icon; opens any board root; busy keep-alive (survives navigation as an invisible ownership handle while its processes run)
│   │   ├── BoardEditorView.ts        # Native four-way board branch host
│   │   ├── BoardToolbar.ts           # In-board toolbar — Reload / Show-log / board path + switcher popover / File Explorer button
│   │   ├── BoardWebview.ts            # Locked-down cross-origin <iframe src="board://<host>/index.html"> (no sandbox attr); brokers the MessagePort bridge handshake + ui.log reset
│   │   ├── BoardsTreeView.ts         # Reusable native boards tree (single-root + multi-root; folder-compacted; click / trailing / context-menu slots)
│   │   ├── boards-tree-build.ts      # Pure builder: board path list → compacted folder/board node tree
│   │   ├── BoardTargetModel.ts       # Automation adapter (IBrowserTarget for browser_* MCP tools)
│   │   ├── board-manifest.ts         # board-manifest.json identity file — read/ensure; a folder is a board iff it carries one; Custom Editor fields (fileMasks/folderMasks/editorPriority/editorName) + matcher/accessor helpers
│   │   ├── custom-editor-registry.ts # Reactive mask → trusted-board map; board-editor:<root> virtual ids; resolveEditorIdForFile (merges built-in + board at file-open); isBoardEditorId
│   │   ├── board-icon-cache.ts       # Module-level icon cache (SVG/PNG/ICO → data URL, per board path)
│   │   ├── board-usage-cache.ts      # Reactive board-standalone metadata cache (mirrors the icon cache; gates pin affordances)
│   │   ├── busy-boards.ts            # Reactive registry of busy board roots (drives the Boards panel "running" dot)
│   │   ├── board-theme.ts            # computeBoardThemePalette + BOARD_TOKEN_VARS (--p-* contract)
│   │   ├── board-scaffold.ts         # Scaffold helpers — copy board-template into a new board folder (writes board-manifest.json)
│   │   ├── board-api.d.ts            # Author-facing window.persephone contract (the canonical board API .d.ts)
│   │   ├── UntrustedBoardView.ts      # Shown in place of the board iframe when the board is untrusted (Trust board button)
│   │   ├── BoardNotFoundView.ts       # Shown when a board root no longer exists on disk (e.g. stale trusted/pinned path)
│   │   └── index.ts                   # boardModule + native EditorModule factory
│   ├── board-info/         # Board Info editor ("board-info") — install + properties over one host-capable holder
│   │   ├── BoardInfoEditorModel.ts   # EditorModel — install/properties modes; adopts/yields CONTENT_HOST_TRAIT without rendering (lossless Text↔+↔board switch)
│   │   ├── BoardInfoEditorView.ts     # Download→Register install UI + properties/versions UI (UIKit only)
│   │   ├── BoardScreenshotView.ts      # Catalog screenshot at a fixed 16:10 footprint — remote <img>, placeholder on no-URL/404; also used by the hub's Search boards tab
│   │   ├── board-info-id.ts          # BOARD_INFO_EDITOR_ID constant (avoids an import cycle with PageToolbarView)
│   │   ├── open-board-info.ts        # openBoardInfo(page,opts) replaces a page's editor; openBoardInfoPage(opts) opens a new page
│   │   └── index.ts
│   ├── tools-hub/          # Tools & Editors hub ("tools-hub-view") — full-page counterpart of the sidebar panel (singleton via fixed PageModel id)
│   │   ├── ToolsHubEditor.ts         # EditorModel — HubTab state; Built-in / Registered boards / Search boards / Tools
│   │   ├── ToolsHubView.ts            # Tab strip + body + right Pinned rail
│   │   ├── SearchBoardsTab.ts         # Published-catalog browse/filter — board cards → Board Info page
│   │   └── index.ts
│   ├── toolset/            # Per-toolset viewer (non-text, no trait) — opened via persephone-toolset://
│   │   ├── ToolsetEditorModel.ts     # EditorModel ("toolset-view") — reads manifest, exposes tool list + log path; restore from toolsetRoot
│   │   ├── ToolsetEditorView.ts       # Native read-only view — manifest info + tool cards
│   │   └── index.ts                   # toolsetModule + EditorModule factory (decodes the link)
│   ├── tools/              # Shared registered-toolsets tree (used by the sidebar Tools panels)
│   │   ├── ToolsTreeView.ts          # Native Tree of toolsets (folder-compacted; open / trailing / context-menu slots)
│   │   └── tools-tree-build.ts       # Pure builder: toolset path list → compacted folder/toolset node tree (leaf label = manifest name)
│   ├── shared/             # Shared editor utilities and Monaco widget hosts
│   │   ├── link-open-menu.ts
│   │   ├── MonacoEditorHostView.ts   # VanillaView host for the single-editor host
│   │   ├── MonacoEditorHostView.css  # Single-editor host flex geometry
│   │   ├── MonacoDiffEditorHostView.ts # VanillaView host for the diff host
│   │   ├── MonacoDiffEditorHostView.css # Diff-host flex geometry
│   │   ├── ColorizedCodeView.ts      # Native syntax-highlighted code via Monaco colorize()
│   │   └── FindBarView.ts            # Native browser find bar
│   │
│   ├── register-editors.ts # Editor registration — table-driven (EDITORS rows + loop) + content-host module preload
│   ├── types.ts            # View-module prop types (required native EditorModule.View)
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
│   ├── api-wrapper/        # Safe wrappers for script access
│       ├── AppWrapper.ts           # Wraps app → IApp (events proxy; compile-time member check)
│       ├── PageCollectionWrapper.ts # Wraps pages → IPageCollection
│       ├── PageWrapper.ts          # Wraps page → IPage (with the current editor facade and switch node)
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
│       ├── VideoEditorFacade.ts    # IVideoEditor facade (playback and media state)
│       ├── FileDiffEditorFacade.ts # IFileDiffEditor facade (revision state)
│       ├── BoardEditorFacade.ts    # IBoardEditor facade (metadata, trust state, panels, reload)
│       ├── BoardInfoEditorFacade.ts # IBoardInfoEditor facade (install/properties state)
│       ├── ToolsetEditorFacade.ts  # IToolsetEditor facade (registered toolset state/actions)
│       ├── ToolsHubEditorFacade.ts # IToolsHubEditor facade (hub tab state)
│       ├── MnemeConfigEditorFacade.ts # IMnemeConfigEditor facade (configuration/status/actions)
│       ├── MnemeRootEditorFacade.ts # IMnemeRootEditor facade (search state/actions)
│       ├── UiFacade.ts             # Log View UI (logging + dialogs + output)
│       ├── Progress.ts            # Progress helper class (returned by ui.show.progress)
│       ├── Grid.ts                # Grid helper class (returned by ui.show.grid)
│       ├── Text.ts                # Text helper class (returned by ui.show.text)
│       ├── Markdown.ts            # Markdown helper class (returned by ui.show.markdown)
│       ├── Mermaid.ts             # Mermaid helper class (returned by ui.show.mermaid)
│       └── StyledTextBuilder.ts    # Fluent styled text builder + styledText() factory
│   └── ai-vision/           # Renderer AiVision root, call/attention entry points, and descriptors
│       ├── dialogs/         # ViewId-keyed adapters for renderer dialogs
│       ├── menus/           # Popup-menu adapter and indexed menus node
│       ├── namespaces/      # App namespace descriptors, including boards and Agent Tools
│       │   ├── boards.ts    # Local board inventory and published-catalog namespace
│       │   ├── tools.ts     # Registered Agent Tools search, execution, and toolsets
│       │   └── index.ts     # Namespace registration and descriptor wiring
│       ├── root.ts          # Renderer object-model root
│       ├── page-compare.ts  # pages.compare pair projection and controls
│       └── elements.ts      # Curated element visibility and highlight protocol
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
├── uikit/                  # UIKit — standalone component library
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
│   ├── ImageViewport/      # Reusable zoom/pan image preview with clipboard copy
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
│   ├── DataGrid/            # av-grid boundary: RenderGrid, MeasuredRowGrid, and data-grid mounting
│   └── shared/             # Internal helpers (overlay layer, focus restoration, native slots, and view lifecycle)
│       ├── vanilla-view.ts # Framework-free view lifecycle, ownership, binding, and cleanup
│       ├── keyed-list.ts   # Keyed DOM reconciliation with minimal cursor moves
│       ├── subtree-swap.ts # Owned conditional subtree replacement
│       ├── deps-gate.ts    # Fixed-length repaint/dependency identity gate
│       ├── element-id.ts   # Shared DOM id allocation for generated elements
│       ├── fill-slot.ts    # Native slot-content filling and generation-safe cleanup
│       ├── dom-props.ts    # Native attributes/events, targeted residual props, and listener cleanup
│       ├── focus-restore.ts # Marks synchronous focus restoration so focusin consumers can ignore it
│       └── slots.ts        # Neutral icon and slot-content types/resolution
│
├── components/             # Persephone-Coupled Components (KEEP-only)
│   │                       # Each remaining folder uses app.* APIs, page model, file
│   │                       # system, or scripting — that's the criterion. No new pure
│   │                       # primitives go here.
│   ├── tree-provider/      # TreeProviderView and CategoryView native views over any ITreeProvider
│   │   ├── TreeProviderViewImpl.ts # Native tree chrome and UIKit Tree wiring
│   │   ├── TreeProviderViewModel.ts # Tree loading, selection, actions, and drops
│   │   ├── CategoryViewImpl.ts # Native folder-content view and bounded editor island
│   │   ├── CategoryViewModel.ts # Folder listing, selection, actions, and drops
│   │   ├── os-clipboard.ts  # OS file-clipboard actions (Cut/Copy/Paste ⇄ Windows Explorer) shared by the tree + category view models; file provider only
│   │   ├── plural-actions.ts # Set-shaped actions shared by the tree + folder page: the multi-select gate, nested-item pruning, the plural menu, batch delete
│   │   ├── item-crud-actions.ts # Shared create/rename/delete/paste operations and refresh handling
│   │   ├── item-menus.ts # Shared single-item and background menu construction
│   │   ├── drop-dispatch.ts # Trait payload to provider-level move/import action resolution
│   │   ├── href-utils.ts # Case-insensitive selection and normalized href helpers
│   │   └── tree-drop-actions.ts # Move/import drop actions, taking a { path, title } target rather than a tree node so both views can call them
│   ├── file-search/        # FileSearch native view and prop/state types; virtualized results
│   │   ├── FileSearch.ts  # File-search prop/state types
│   │   └── FileSearchView.ts # Native search view and RenderGrid renderer
│   ├── file-list/          # FileList.ts core/model + FileListView.ts native flat list
│   ├── file-grid/          # FileGrid.ts types + FileGridView.ts native DataGrid/av-grid list
│   ├── icons/              # Builder-backed Icon face and DOM icon resolvers
│   ├── page-manager/       # Native app-page and browser internal-tab hosts
│   └── git-tree/           # GitTreeView.ts native history view and git submodels
│
├── core/                   # Core Infrastructure
│   ├── state/              # State management primitives
│   │   ├── state.ts        # TOneState, TComponentState, TGlobalState
│   │   ├── dispatch.ts      # Module-global after-dispatch boundary
│   │   ├── listener-list.ts # Shared listener registration and dispatch core
│   │   ├── model.ts        # TModel, TDialogModel, TComponentModel, createComponentModelDriver
│   │   ├── ComponentQueue.ts # Model-to-view event and request/reply mailbox
│   │   ├── events.ts       # Emitter/Event primitive and named Subscription broadcasts
│   │   └── index.ts
│   ├── traits/             # Trait system — drag-and-drop type negotiation
│   │   ├── traits.ts       # TraitKey<T>, TraitSet, Traited<V>, traited(), isTraited()
│   │   ├── TraitRegistry.ts # TraitRegistry singleton + TraitTypeId enum
│   │   ├── dnd.ts          # setTraitDragData, getTraitDragData, hasTraitDragData, resolveTraits
│   │   ├── fileLinkTraits.ts # FILE_LINK trait definition + registration
│   │   ├── linkTraits.ts    # ILink trait definition + registration (LINK + FILE_LINK)
│   │   └── index.ts        # Public exports
│   ├── utils/              # Utility functions
│   │   ├── utils.ts        # General helpers
│   │   ├── DisposableStore.ts # Function/object cleanup ownership, child stores, and ordered cleanup
│   │   ├── scheduling.ts   # OwnerScheduler, Delayer, and paint-boundary scheduling helpers
│   │   ├── echo-guard.ts   # Bounded exact-value self-write echo guard
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
│   ├── global-styles.ts    # Native theme-dependent global stylesheet
│   ├── icons.ts             # SVG icon DOM builders and builder contract
│   ├── icon-registry.ts    # Single-source-of-truth names for registered SVG icons
│   ├── language-icons.ts   # Language-specific DOM-built icons
│   ├── palette-colors.ts   # Color palette definitions
│   ├── style-layers.css    # Shared cascade-layer order for static CSS
│   ├── root.css            # Static #root geometry, before renderer mount
│   ├── theme-state.ts      # Shared active-theme snapshot and subscriptions
│   ├── token-vars.ts       # App token CSS-variable generation and installation
│   └── themes/             # Theme definitions and color resolution (9 themes)
│
├── types/                  # Global Type Declarations
│   ├── window.d.ts         # Window interface extension
│   ├── events.d.ts         # MouseEvent extension
│   └── vite-env.d.ts       # Vite import.meta.env declarations
│
└── index.ts                # mount(container): application composition root
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
│   ├── tools/              # The tools themselves, as data — one module per group (window, page, board, agent, browser, guide)
│   └── ai-vision/          # Main-process AiVision roots, service descriptors, and gated main scripting
├── browser-service.ts      # Browser page support (webview management and tracked native message boxes)
├── browser-registration.ts # Default browser registration
├── sidecar-process.ts      # Shared sidecar lifecycle (spawn → stdout-readiness sentinel → stop) used by tor-service and mneme-service: start dedupe, readiness timeout, stale-child guard, unexpected-death callback, stop-and-wait before respawn
├── tor-service.ts          # Tor concerns on top of sidecar-process: per-partition SOCKS5 proxy (fail-closed arming), torrc generation, restart-based reconnect, exit-IP/geo lookup through the partition's session
├── tor-src-protocol.ts     # tor-src:// scheme handler — fetches an http(s) URL through a Tor partition's session (the app renderer itself is unproxied); guarded by partition shape, live-partition check, and http(s)-only target
├── git-service.ts          # Git access via simple-git — status, stage/unstage/commit, branch/switch, fetch/push/pull, ahead-behind, log/show, --version probe — main-process only
├── download-service.ts     # Download management and tracked synchronous save dialogs
├── native-dialog-tracker.ts # Per-window tracking and non-actionable attention for native dialogs
├── search-service.ts       # File search host — owns one search-worker thread per sender window, relays its batches to the renderer; cancel/window-close is worker.terminate()
├── search-worker.ts        # File search walk — runs in a worker_thread (bundled separately to .vite/build/search-worker.js); never imports electron
├── worker-host.ts          # Worker thread host for app.runAsync (IPC + worker_threads)
├── command-runner.ts       # Streaming command runner — spawns child processes, streams stdout/stderr/exit over IPC by jobId; shared by app.proc.execute and the board bridge's execute(); whole-tree kill via taskkill; jobs carry an optional caller-chosen name + a getJobsBySinkIds query (board job re-association)
├── board-protocol-service.ts # board:// scheme handler — host→board-root registry; serves board files + CSP; injects --p-* palette, boot context, and the bridge shim into served HTML
├── board-bridge.ts         # Per-board MessagePort bridge — execute(), page-scoped call(), dialogs/readFile/writeFile, openRawLink/notify, theme push; busy-owner job retention (a busy board's jobs survive its unload, reaped on final teardown/page close/crash)
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
│   ├── controller.ts       # Compact IPC composition root — initializes endpoint registrars and renderer events
│   ├── endpoint-registry.ts # Shared typed Endpoint binder; derives main handler signatures from Api and owns reply/error wiring
│   ├── core-handlers.ts    # Desktop, app, local-service, and utility Endpoint registrations
│   ├── git-handlers.ts     # Lazy Git service Endpoint registrations
│   ├── board-handlers.ts   # Lazy Board lifecycle, bridge, automation, and catalog Endpoint registrations
│   ├── dialog-handlers.ts  # File dialog handlers — the single place all three native dialogs are opened (renderer app.fs and the board bridge both route here); wraps them in native-dialog tracking, resolves the starting folder, and records the pick
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
