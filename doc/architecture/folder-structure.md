# Folder Structure

Detailed organization of the codebase. Verified against actual source files.

## Root Structure

```
persephone/
├── src/                    # Source code
│   ├── main/               # Electron main process
│   ├── renderer/           # React frontend (see below)
│   ├── ipc/                # IPC communication layer
│   ├── shared/             # Shared types and constants
│   ├── renderer.tsx        # Bootstrap entry point
│   └── preload.ts          # Preload script
├── launcher/               # Rust launcher (Named Pipe client)
│   ├── src/main.rs
│   ├── build.rs
│   └── Cargo.toml
├── scripts/                # Build scripts
│   ├── build-prod.mjs      # Vite production build (main, preload, renderer)
│   └── vmp-sign.mjs        # electron-builder afterPack hook for Widevine VMP signing
├── assets/                 # Static assets
│   ├── editor-types/       # GENERATED — Vite plugin auto-copies .d.ts files from src/renderer/api/types/ (never hand-edit)
│   ├── icons/              # App icons
│   ├── pdfjs/              # PDF.js library
│   ├── excalidraw/fonts/   # Self-hosted Excalidraw fonts (woff2, OFL-1.1 licensed)
│   ├── script-library/     # Bundled example scripts (copied to user library on setup)
│   ├── mcp-res-ui-push.md  # MCP resource: ui_push tool guide
│   ├── mcp-res-pages.md    # MCP resource: pages & windows guide
│   ├── mcp-res-scripting.md # MCP resource: scripting API reference
│   ├── mcp-res-graph.md    # MCP resource: force-graph data format & page.asGraph() API
│   ├── mcp-res-notebook.md # MCP resource: notebook editor JSON format
│   ├── mcp-res-todo.md     # MCP resource: todo editor JSON format
│   └── mcp-res-links.md    # MCP resource: links editor JSON format
├── snip-tool/              # Rust native screen snip tool (persephone-snip.exe)
│   ├── src/main.rs         # Entry point, PNG encoding, stdout output
│   ├── src/capture.rs      # Monitor enumeration + GDI screen capture
│   ├── src/overlay.rs      # Fullscreen overlay windows, selection UI
│   ├── build.rs
│   └── Cargo.toml
├── mneme/                  # Rust knowledge-base / vector-memory service (mneme.exe) — standalone, extraction-ready
│   ├── src/main.rs         # CLI entry (serve / status)
│   ├── src/config.rs       # config: wiki roots, include/ignore globs, transport, model, gpu
│   ├── src/store/          # Document Store — filesystem over wiki roots (read/write/edit/glob/grep)
│   ├── build.rs
│   ├── Cargo.toml
│   └── README.md           # crate-local docs (build/test, invariants)
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
│   ├── internal.ts         # Disposable utilities (wrapSubscription, etc.)
│   │
│   ├── pages/              # Page collection — composed submodels
│   │   ├── PageModel.ts            # Tab container — sidebar, secondary views, mainEditor lifecycle
│   │   ├── IPageHost.ts            # IPageHost interface — editor↔owner contract (PageModel + BrowserPanelHost)
│   │   ├── PagesModel.ts           # Base: state, subscriptions, composes submodels
│   │   ├── PagesQueryModel.ts      # Queries: getAll, byId, byType, activePage
│   │   ├── PagesNavigationModel.ts # Navigation: show, focus, next/prev
│   │   ├── PagesLifecycleModel.ts  # Lifecycle: create, close, empty page
│   │   ├── PagesLayoutModel.ts     # Layout: grouping (side-by-side)
│   │   ├── PagesPersistenceModel.ts # Persistence: save/restore, debounced
│   │   └── well-known-pages.ts     # Singleton page definitions (MCP Log, etc.)
│   │
│   ├── internal/           # Event services (init-only, not public API)
│   │   ├── GlobalEventService.ts    # contextmenu, dragover, drop, unhandled rejections
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
│       ├── todo-editor.d.ts    # ITodoEditor
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
│   ├── open-handler.ts     # Layer 3: open handler on openContent — creates/navigates pages
│   ├── providers/
│   │   ├── FileProvider.ts      # IProvider for local binary files (read/write/watch/stat)
│   │   ├── CacheFileProvider.ts # IProvider for cache files by page ID (auto-save)
│   │   ├── HttpProvider.ts      # IProvider for HTTP/HTTPS URLs (read-only)
│   │   └── DataUrlProvider.ts  # IProvider for data: URLs (inline content, read-only)
│   ├── transformers/
│   │   ├── ArchiveTransformer.ts # ITransformer for archive entry extraction/replacement
│   │   └── DecryptTransformer.ts # ITransformer for AES-GCM decrypt/encrypt (non-persistent)
│   ├── tree-providers/           # ITreeProvider implementations (EPIC-015)
│   │   ├── FileTreeProvider.ts  # Local filesystem directories
│   │   ├── ArchiveTreeProvider.ts # Archives (ZIP, RAR, 7z, TAR, cab, ISO — read-only)
│   │   └── tree-provider-link.ts # tree-category:// link format (encode/decode)
│   └── tree-context-menus.tsx   # Default context menu handlers for tree provider items (EPIC-015)
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
│   │   ├── ToolsEditorsPanel.tsx    # Tools & Editors panel (pin/unpin, drag reorder)
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
│   │   ├── IContentHost.ts           # Interface for text-content hosting (TextFileModel, NoteItemEditModel)
│   │   ├── EditorStateStorage.ts     # Per-editor view-state storage interface (id, name → state)
│   │   ├── editor-traits.ts          # CONTENT_HOST_TRAIT — owner-orchestrated editor switching
│   │   ├── editor-matchers.ts        # Acceptance / resolution priority helpers
│   │   ├── editorRegistry.ts         # Native editor registry — resolve, register, switch options
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
│   │   ├── MarkdownBlock.tsx         # Reusable markdown rendering (CSS, ReactMarkdown, search handle)
│   │   ├── CodeBlock.tsx             # Code block + inline Mermaid
│   │   ├── rehypeHighlight.ts        # Search text highlighting
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
│   ├── todo/               # Todo editor (text-bearing, IContentHost + TRAIT)
│   │   ├── TodoEditor.ts             # EditorModel — items, lists, tags
│   │   ├── TodoBody.tsx              # React component
│   │   ├── todoTypes.ts
│   │   ├── todoColors.ts
│   │   ├── components/
│   │   ├── panels/                   # Secondary view panel components
│   │   │   └── TodoSecondaryView.tsx             # "todo" panel
│   │   └── index.tsx
│   ├── link-editor/        # Link collection editor (text-bearing, IContentHost + TRAIT)
│   │   ├── LinkEditor.ts             # EditorModel — links, categories, tags, filters
│   │   ├── LinkBody.tsx              # React component
│   │   ├── LinkTreeProvider.ts       # ITreeProvider adapter over LinkEditor state
│   │   ├── linkTypes.ts
│   │   ├── linkTraits.ts             # ILink trait definition + registration (TraitTypeId.ILink)
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
│   ├── pdf/                # PDF viewer (non-text, no trait)
│   │   ├── PdfEditor.ts              # EditorModel — pipe-backed PDF state
│   │   ├── PdfView.tsx               # React component (pdf.js)
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
│   │   ├── ExplorerSecondaryView.tsx # "explorer" panel — tree view with portaled header
│   │   ├── SearchSecondaryView.tsx # "search" panel — file search with portaled header
│   │   └── index.ts
│   ├── shared/             # Shared editor utilities
│   │   ├── link-open-menu.tsx
│   │   └── ColorizedCode.tsx         # Syntax-highlighted code via Monaco colorize()
│   │
│   ├── register-editors.ts # Editor registration (all editors call editorRegistry.register)
│   ├── types.ts            # Shared editor types
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
│       ├── AppWrapper.ts           # Wraps app → IApp (events proxy for auto-cleanup)
│       ├── PageCollectionWrapper.ts # Wraps pages → IPageCollection
│       ├── PageWrapper.ts          # Wraps page → IPage (with asX() + auto-release)
│       ├── TextEditorFacade.ts     # ITextEditor facade
│       ├── GridEditorFacade.ts     # IGridEditor facade
│       ├── NotebookEditorFacade.ts # INotebookEditor facade
│       ├── TodoEditorFacade.ts     # ITodoEditor facade
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
│   ├── ref.ts              # Ref resolution (parseRef, resolveRef, callOnRef)
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
│   ├── tree-provider/      # TreeProviderView — generic tree viewer for any ITreeProvider (EPIC-015)
│   │   └── favicon-cache.ts # Favicon download/cache for HTTP links (shared by link-editor, browser, tree icons)
│   ├── file-search/        # FileSearch — standalone file content search with virtualized results (EPIC-015)
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
│   │   ├── parse-utils.ts  # JSON5, JS parsing
│   │   ├── csv-utils.ts    # CSV parsing/generation
│   │   ├── html-resources.ts  # HTML resource extraction (cheerio)
│   │   ├── file-path.ts    # Archive-aware path utility (wraps ALL path.* usage)
│   │   ├── path-utils.ts   # Markdown link resolution
│   │   ├── obj-path.ts     # Deep object access by path
│   │   ├── language-mapping.ts  # Extension → Monaco language
│   │   ├── monaco-languages.ts  # Monaco language config
│   │   ├── file-watcher.ts      # File change detection
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
├── open-window.ts          # Window creation logic
├── open-windows.ts         # Multi-window management and broadcasting
├── window-states.ts        # Window state persistence
├── pipe-server.ts          # Named Pipe server (launcher integration)
├── mcp-http-server.ts      # MCP Streamable HTTP server (MCP SDK, AI agent integration)
├── browser-service.ts      # Browser page support (webview management)
├── browser-registration.ts # Default browser registration
├── tor-service.ts          # Tor process lifecycle and per-partition SOCKS5 proxy
├── git-service.ts          # Git access via simple-git — status, stage/unstage/commit, branch/switch, fetch/push/pull, ahead-behind, log/show, --version probe — main-process only
├── download-service.ts     # Download management
├── search-service.ts       # File search service
├── worker-host.ts          # Worker thread host for app.runAsync (IPC + worker_threads)
├── snip-service.ts         # Screen snip (spawns persephone-snip.exe, reads PNG from stdout)
├── version-service.ts      # Version checking (runs in main, not renderer)
├── video-stream-server.ts  # Local HTTP streaming server (range requests, faststart MP4 relocation, session management)
├── vlc-launcher.ts         # VLC process launcher (spawn + auto-detect VLC path)
├── tray-setup.ts           # System tray
├── drag-model.ts           # Tab drag between windows
├── e-store.ts              # Electron store wrapper
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
├── tor-ipc.ts              # Tor service IPC channels (start, stop, log)
├── git-ipc.ts              # Git service IPC channel names + request/response types (EPIC-030)
├── search-ipc.ts           # Search IPC channels
├── worker-channels.ts      # Worker thread IPC channels (app.runAsync)
├── popup-rate-limiter.ts   # Global popup/tab rate limiter (app-wide singleton)
├── main/                   # Main process handlers
│   ├── controller.ts       # IPC handler registration
│   ├── dialog-handlers.ts  # File dialog handlers
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
const { PdfViewer } = await import("../editors/pdf/PdfViewer");
```
