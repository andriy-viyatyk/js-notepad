# js-notepad Project Guidelines

## Project Overview
JS-Notepad is a Windows Notepad replacement designed for developers, especially JavaScript developers. Built with Electron and Monaco Editor (VS Code engine), it extends classic notepad functionality with powerful code editing features and a JavaScript execution environment.

### Design Philosophy
- **Core First:** Keep the core notepad functionality fast and lightweight
- **Extensible:** Additional features (custom editors) are loaded on-demand via async imports
- **Developer-Focused:** Provide tools that help developers manipulate and transform data
- **Container with Building Blocks:** js-notepad provides UI building blocks (toolbar, editors, grouped pages). Users bring their own integrations via Node.js/npm - the app doesn't need to build specific database or API integrations

## Core Features

### 1. Monaco Editor
The foundation - a powerful text editor with:
- Syntax highlighting and IntelliSense for 50+ languages
- Tab management with drag-and-drop between windows
- Compare mode (side-by-side viewing and diff editor)

### 2. JavaScript Executor
The key differentiator - execute JavaScript to manipulate content:

**Execution modes:**
- Run selected text or full page content (for tabs with 'javascript' language)
- Script Panel - available on any text page for writing and executing scripts

**Script Context (`page` variable):**
Scripts have access to the `page` variable representing the active page:
- `page.content` - read/write the page text content
- `page.language` - read/write the language mode (e.g., "javascript", "json")
- `page.editor` - read/write the active editor type: `"monaco"` | `"grid-json"` | `"grid-csv"` | `"md-view"`
- `page.data` - custom data storage for scripts
- `page.grouped` - access to the grouped page (if any)

**Editor Types:**
Some file types support multiple editors. User can switch between them via toolbar buttons:
- `.md` files: `"monaco"` (source) or `"md-view"` (rendered preview)
- `.json` files: `"monaco"` (source) or `"grid-json"` (grid view)
- `.csv` files: `"monaco"` (source) or `"grid-csv"` (grid view)

**Additional Context:**
- `React` - React library is exposed to scripts for advanced use cases
- **Full Node.js access** - With `nodeIntegration: true`, scripts can use `require()` to load any Node.js module or npm package

**Grouped Pages:**
- Any two tabs can be grouped (displayed side-by-side)
- If a script accesses `page.grouped` when no grouped page exists, js-notepad automatically creates an empty page and groups it with the active page
- Script output (return value or exception with stack trace) is written to the grouped page

**Example use cases:**
```javascript
// Example 1: Transform JSON - open a JSON file, open Script Panel, run:
return JSON.parse(page.content).map(i => ({ name: i.name }))
// Result appears in the auto-created grouped page

// Example 2: Query SQL Server and display results in grid
const path = require("path");
const sql = require(path.join("D:\\packages\\node_modules", "mssql"));

const config = {
    user: 'sa', password: '123', server: 'localhost',
    database: 'MyDB', options: { encrypt: false, trustServerCertificate: true }
};

await sql.connect(config);
const result = await sql.query(page.content); // Use page content as SQL query
await sql.close();

page.grouped.language = "json";
page.grouped.editor = "grid-json";
return result.recordset;
```

## Additional Features
- **JSON Grid Editor:** Grid view for tabular JSON with sorting, filtering, Excel copy-paste
- **Markdown Preview:** Toggle between source and rendered preview
- **PDF Support:** Integrated pdf.js viewer
- **Compare Mode:** Monaco DiffEditor for comparing two grouped pages side-by-side

## Planned Tool Editors
Future specialized editors for structured data files:
- **Notebook** (`*.note.json`) - Chat-like notes with categories/tags, search, left panel navigation
- **ToDo Lists** (`*.todo.json`) - Multiple categorized todo lists
- **Bookmarks** (`*.link.json`) - Categorized bookmarks with tags

## Tech Stack
- **Runtime:** Electron 39 (nodeIntegration: true, contextIsolation: false)
- **Frontend:** React 19 with TypeScript
- **Editor:** Monaco Editor
- **State Management:** Zustand with Immer
- **Build Tool:** Vite + Electron Forge
- **Styling:** Emotion (CSS-in-JS)
- **CSV Parsing:** csv-parse / csv-stringify

## Commands
```bash
npm start       # Run in development mode
npm run package # Package the app
npm run make    # Create distributables (MSI, ZIP)
npm run lint    # Run ESLint
```

## Folder Structure

```
/src
  /main              # Electron main process
  /renderer          # React frontend (renderer process)
    /app             # Main application shell (MainPage, Pages, RenderEditor, EventHandler)
    /core            # Core infrastructure
      /state         # State primitives (TOneState, TComponentState, TModel, events)
      /services      # App services (encryption, file-watcher, scripting/)
      /utils         # Utilities (csv, node, parse, obj-path, memorize)
    /store           # Application state (Zustand stores)
      pages-store    # Page/tab management
      files-store    # File I/O and caching
      app-settings   # User preferences
      recent-files   # Recent files list
      menu-folders   # Sidebar bookmarks
      page-factory   # Page model creation
      language-mapping # Language utilities
    /editors         # ALL editors
      /base          # Shared: PageModel, ContentPageModel, EditorToolbar, LanguageIcon
      /text          # Monaco text editor (TextPageView, TextPageModel, ScriptPanel, etc.)
      /grid          # JSON/CSV grid editor (GridEditor, GridPageModel)
      /markdown      # Markdown preview (MarkdownView)
      /pdf           # PDF viewer (PdfViewer, PdfViewerModel)
      /compare       # Diff editor (CompareEditor)
      registry.ts    # Editor resolution utilities
      types.ts       # Editor interfaces
    /components      # Reusable UI components
      /basic         # Button, Input, TextField, Chip, Tooltip, CircularProgress
      /form          # ComboSelect, SwitchButtons, ListMultiselect
      /layout        # Splitter, Elements
      /overlay       # Popper, PopupMenu, WithPopupMenu
      /virtualization # RenderGrid (base virtualization)
      /data-grid     # AVGrid (advanced data grid)
    /features        # App-specific features
      /tabs          # PageTabs, PageTab
      /sidebar       # MenuBar, FileExplorer, FileList, RecentFileList
      /dialogs       # Dialogs, ConfirmationDialog, InputDialog, alerts/
    /theme           # Colors, icons, global styles
    /setup           # Monaco configuration
    /types           # Global type declarations (window.d.ts, events.d.ts)
  /ipc               # Inter-process communication
  /shared            # Code shared between main and renderer
/assets              # Static assets (icons, images)
/patches             # Patch files for dependencies (patch-package)
/doc                 # Project documentation
```

## Architecture

### Electron Process Model
- **Main Process** (`/src/main`): Window management, file system access, system tray
- **Renderer Process** (`/src/renderer`): React UI, Monaco editor, user interactions
- **Preload Script** (`/src/preload.ts`): Secure bridge between main and renderer
- **IPC** (`/src/ipc`): Type-safe communication between processes

### State Management
- Uses Zustand-style stores in `/src/renderer/store/`
- Page/tab management: `pages-store.ts`
- File operations: `files-store.ts`
- App settings: `app-settings.ts`
- State primitives (TOneState, TComponentState, TModel) in `/src/renderer/core/state/`

### Editors
All editors located in `/src/renderer/editors/`:
- **Base classes** in `/editors/base/`: `PageModel`, `ContentPageModel`, `EditorToolbar`
- **Text editor** in `/editors/text/`: Monaco-based, with ScriptPanel, EncryptionPanel
- **Grid editor** in `/editors/grid/`: JSON/CSV grid view with AVGrid
- **Markdown** in `/editors/markdown/`: Preview rendering
- **PDF** in `/editors/pdf/`: pdf.js integration
- **Compare** in `/editors/compare/`: Monaco DiffEditor
- **IMPORTANT:** Editors must be loaded with dynamic `import()` for code splitting

### Components
Located in `/src/renderer/components/`:
- `/basic` - Atomic components: Button, Input, TextField, Chip, Tooltip
- `/form` - Form controls: ComboSelect, SwitchButtons, ListMultiselect
- `/layout` - Layout helpers: Splitter, Elements
- `/overlay` - Floating UI: Popper, PopupMenu
- `/virtualization` - RenderGrid (base virtualization for visible cell calculation)
- `/data-grid` - AVGrid (advanced data grid with filtering, sorting, Excel copy-paste)

## Coding Standards
- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use Emotion for styling (styled components or css prop)
- Keep components focused and reusable
- Use meaningful naming conventions

## Development Notes
- Monaco editor configuration: `/src/renderer/setup/configure-monaco.ts`
- Custom language definitions: `/src/renderer/setup/monaco-languages/`
- File encoding detection uses jschardet and iconv-lite
- Script execution: `/src/renderer/core/services/scripting/ScriptRunner.ts`
- Script context (page variable): `/src/renderer/core/services/scripting/ScriptContext.ts`
- Page models: `/src/renderer/editors/text/TextPageModel.ts`, `/src/renderer/editors/grid/GridPageModel.ts`

## Important Patterns
- **Async imports for editors:** Always use dynamic `import()` for editors to ensure code splitting and keep core bundle fast
- **Script context expansion:** When adding new capabilities to scripts, extend the `page` variable interface
- **Grouped pages:** The auto-grouping behavior is central to the script output workflow
- **ContentPageModel base:** Text editor, Grid editor, and future tool editors share common base for file I/O, content management, encryption, and script context
- **Editor registry:** Editors are registered with file extensions/patterns and loaded on-demand
- **RenderGrid as base:** Use RenderGrid for any virtualized scrollable content (grids, lists, etc.)

## Project Documentation
Located in `/doc/`:
- `proposed-structure.md` - Architecture decisions and design rationale
- `refactoring-tasks.md` - Phase 1 completed: folder reorganization (188 tasks)
- `refactoring-tasks-2.md` - Phase 2: architectural improvements (73 tasks, future)
