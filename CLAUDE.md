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

> **Note:** Structure is being refactored. See `/doc/proposed-structure.md` for target structure and `/doc/refactoring-tasks.md` for progress.

**Current structure:**
```
/src
  /main              # Electron main process
  /renderer          # React frontend (renderer process)
    /common          # Shared utilities and helpers
    /controls        # Reusable UI components (Button, Input, Grid, etc.)
    /custom-editors  # Alternative editors (PDF viewer, etc.)
    /dialogs         # Dialogs, alerts, poppers
    /model           # Application state and data models
    /pages           # Main page components and tab content
    /script          # JavaScript scripting engine
    /setup           # Monaco editor configuration
    /theme           # Colors, icons, global styles
  /ipc               # Inter-process communication
  /shared            # Code shared between main and renderer
/assets              # Static assets (icons, images)
/patches             # Patch files for dependencies (patch-package)
/doc                 # Project documentation and planning
```

**Target structure** (see `/doc/proposed-structure.md`):
```
/src/renderer
  /core              # State primitives, services, utilities
  /store             # Application state (Zustand stores)
  /editors           # ALL editors (text, grid, markdown, pdf, compare, tools)
  /components        # Reusable UI (basic, form, layout, overlay, data-grid)
  /features          # App-specific features (tabs, sidebar, dialogs)
  /app               # Main application shell
  /theme             # Styling
  /setup             # Configuration
```

## Architecture

### Electron Process Model
- **Main Process** (`/src/main`): Window management, file system access, system tray
- **Renderer Process** (`/src/renderer`): React UI, Monaco editor, user interactions
- **Preload Script** (`/src/preload.ts`): Secure bridge between main and renderer
- **IPC** (`/src/ipc`): Type-safe communication between processes

### State Management
- Uses Zustand for global state
- Page/tab model in `/src/renderer/model/page-model.ts`
- File operations in `/src/renderer/model/files-model.ts`
- App settings in `/src/renderer/model/appSettings.ts`

### Custom Editors
Located in `/src/renderer/custom-editors/`:
- Similar concept to VSCode extensions - register custom editors for specific file types
- **IMPORTANT:** Custom editors must be loaded with dynamic `import()` to keep the core bundle small and fast-loading
- Each custom editor handles specific file extensions (e.g., PDF viewer for .pdf files)

### Custom Controls
Located in `/src/renderer/controls/`:
- `RenderGrid` - Base virtualization component (calculates visible cells, renders via callback). Used by AVGrid, List, and other scrollable components
- `AVGrid` - Advanced data grid with filtering and sorting (built on RenderGrid)
- `ComboSelect`, `Input`, `Button` - Form controls
- `Spliter` - Resizable split panes

## Coding Standards
- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use Emotion for styling (styled components or css prop)
- Keep components focused and reusable
- Use meaningful naming conventions

## Development Notes
- Monaco editor configuration is in `/src/renderer/setup/configure-monaco.ts`
- Custom language definitions in `/src/renderer/setup/monaco-languages/`
- File encoding detection uses jschardet and iconv-lite
- Script execution engine is in `/src/renderer/script/ScriptRunner.ts`
- Page context interface exposed to scripts is defined in the page model

## Important Patterns
- **Async imports for editors:** Always use dynamic `import()` for editors to ensure code splitting and keep core bundle fast
- **Script context expansion:** When adding new capabilities to scripts, extend the `page` variable interface
- **Grouped pages:** The auto-grouping behavior is central to the script output workflow
- **ContentPageModel base:** Text editor, Grid editor, and future tool editors share common base for file I/O, content management, encryption, and script context
- **Editor registry:** Editors are registered with file extensions/patterns and loaded on-demand
- **RenderGrid as base:** Use RenderGrid for any virtualized scrollable content (grids, lists, etc.)

## Project Documentation
Located in `/doc/`:
- `proposed-structure.md` - Target folder structure and architecture decisions
- `refactoring-tasks.md` - Task list for restructuring (153 tasks in 10 phases)
