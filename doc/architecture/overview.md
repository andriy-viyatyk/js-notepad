# Architecture Overview

> Read this document before creating new modules or making architectural changes.

## Application Type

persephone is an **Electron desktop application** — a Windows Notepad replacement designed for developers. It combines:
- Monaco Editor (VS Code engine) for text editing
- Custom editors for specific file types (Grid, PDF, Markdown, Notebook, Todo, etc.)
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
| `app.shell` | `IShell` | OS integration, encryption, version |
| `app.ui` | `IUserInterface` | Dialogs, notifications |
| `app.downloads` | `IDownloads` | Download tracking |
| `app.menuFolders` | `IMenuFolders` | Sidebar folder shortcuts |
| `app.pages` | `PagesModel` | Page/tab collection, lifecycle |

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
├── components/       # Persephone-coupled components (icons, page-manager, file-search, tree-provider)
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
| **components/** | Persephone-coupled components only (KEEP-only) | `icons/`, `page-manager/`, `file-search/`, `tree-provider/` |
| **core/** | State primitives, utilities | `state/` (TOneState, TModel), `utils/` |
| **theme/** | Design tokens, themes | `color.ts`, `themes/` |

### Dependency Rules

1. **`core/`** is the foundation — no imports from other renderer layers
2. **`uikit/`** is the standalone library — imports only `core/` and `theme/`. No imports from `api/`, `ui/`, `editors/`, or app-specific code (the contract that lets `uikit/` be split into a separate package later)
3. **`components/`** is persephone-coupled by definition — each remaining folder (`icons/`, `page-manager/`, `file-search/`, `tree-provider/`) uses `api/`, the page model, file system, or scripting. New pure primitives do NOT go here — they go in `uikit/`
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

- All editors in `/editors/` — 22 editor folders, every editor is an `EditorModel` subclass
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
- Renderer process: `mcp-handler.ts` dispatches 9 commands (`execute_script`, `list_pages`, `get_page_content`, `get_active_page`, `create_page`, `set_page_content`, `get_app_info`, `open_url`, `ui_push`)
- Multi-window support: all tools accept optional `windowIndex` parameter (defaults to first open window). `list_windows` tool runs in main process (no IPC) to discover windows and their status. `open_window` tool reopens closed windows with persisted pages.
- Log View integration: `ui_push` tool pushes log entries, dialogs, and output items to a managed Log View page. Tracks an "active MCP log page" per window (auto-creates on first call, reuses on subsequent calls). Dialog entries block until user responds (infinite IPC timeout). This is the recommended output channel for AI agents.
- MCP resources & `read_guide` tool: focused guides (`assets/mcp-res-*.md`) exposed as MCP resources (`notepad://guides/*`) and also available via the `read_guide` tool (for clients that cannot read MCP resources, e.g. Claude Desktop). Guides cover: `ui-push`, `pages`, `scripting`, `graph`, `notebook`, `todo`, `links`, plus `notepad://guides/full` (concatenated). Tool descriptions warn agents to read guides before using structured editors or dialogs.
- MCP validation: `mcp-handler.ts` validates dialog entries (known properties, required fields) and `output.grid` content (must be string, valid JSON array). Returns descriptive errors with correct usage examples to guide AI agents.
- Opt-in via `mcp.enabled` setting — server starts/stops dynamically based on setting changes
- Port is configurable via `mcp.port` setting (default `7865`)
- Script execution uses `ScriptRunner.runWithCapture()` for headless operation with console capture
- Status broadcasting: main process pushes `eMcpStatusChanged` events to all windows on server start/stop and session connect/disconnect — renderer `Window` class holds reactive `mcpRunning`/`mcpClientCount` state, UI shows a title-bar indicator

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

## Design Principles

### 1. Core First
Keep the core text editing experience fast and lightweight. Heavy features load on-demand.

### 2. Async Imports for Editors
```typescript
// CORRECT - async import preserves code splitting
const getPdfModule = async () =>
    (await import("../editors/pdf")).default;

// WRONG - synchronous import increases main bundle
import pdfModule from "../editors/pdf";
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
