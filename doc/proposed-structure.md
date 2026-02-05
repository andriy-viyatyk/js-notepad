# Proposed Application Structure

This document outlines a proposed restructuring of the js-notepad application to achieve:
- Clear separation of concerns
- Easy-to-understand folder organization
- Extensible architecture for new editors
- Maintainable codebase as the project grows

## Current Issues

### 1. Mixed Responsibilities
- `TextFilePage.model.tsx` (552 lines) handles file I/O, encryption, script context, content management, and state persistence
- `pages-model.ts` (552 lines) mixes page lifecycle, grouping logic, drag-drop handling, and state persistence

### 2. Inconsistent Editor Organization
- Custom editors in `/custom-editors` but text editor in `/pages/text-file-page`
- Editor resolution logic scattered across multiple files (`resolve-editor.ts`, `ActiveEditor.tsx`, `RenderEditor.tsx`)

### 3. Unclear Module Boundaries
- `/controls` contains both simple components (Button) and complex systems (AVGrid with 27 files)
- `/common` is a catch-all for utilities, state management, and helpers
- `/model` vs `/pages/*.model.ts` - models in two places

### 4. Not Extensible for New Editors
- Adding a new editor requires changes in multiple places
- No clear plugin/registry pattern for editors

---

## Proposed Structure

```
/src
├── main/                       # Electron main process (unchanged)
│   ├── main.ts
│   ├── main-setup.ts
│   ├── window/
│   │   ├── open-window.ts
│   │   ├── open-windows.ts
│   │   └── window-states.ts
│   ├── services/
│   │   ├── tray-setup.ts
│   │   ├── file-icon-cache.ts
│   │   └── drag-model.ts
│   ├── store/
│   │   └── e-store.ts
│   └── constants.ts
│
├── preload.ts                  # Electron preload (unchanged)
│
├── shared/                     # Shared between main & renderer
│   ├── types.ts
│   ├── constants.ts
│   └── utils.ts
│
├── ipc/                        # IPC communication (unchanged structure)
│   ├── api-types.ts
│   ├── api-param-types.ts
│   ├── main/
│   │   ├── controller.ts
│   │   ├── dialog-handlers.ts
│   │   ├── window-handlers.ts
│   │   ├── registry-handler.ts
│   │   └── renderer-events.ts
│   └── renderer/
│       ├── api.ts
│       └── renderer-events.ts
│
├── renderer/                   # React renderer process
│   ├── index.tsx               # Entry point
│   ├── renderer.tsx            # App bootstrap
│   │
│   ├── core/                   # Core application infrastructure
│   │   ├── state/              # State management primitives
│   │   │   ├── state.ts        # TOneState, TComponentState, TGlobalState
│   │   │   ├── model.ts        # TModel, TDialogModel base classes
│   │   │   ├── events.ts       # Subscription system
│   │   │   └── view.ts         # Views registry for dialogs/poppers
│   │   │
│   │   ├── services/           # Application-wide services
│   │   │   ├── encryption.ts   # Encryption/decryption service
│   │   │   ├── file-watcher.ts # File change detection
│   │   │   └── script-runner/  # JavaScript execution engine
│   │   │       ├── ScriptRunner.ts
│   │   │       └── ScriptContext.ts
│   │   │
│   │   └── utils/              # Pure utility functions
│   │       ├── csv-utils.ts
│   │       ├── node-utils.ts
│   │       ├── parse-utils.ts
│   │       ├── obj-path.ts
│   │       ├── memorize.ts
│   │       └── utils.ts
│   │
│   ├── store/                  # Application state (Zustand stores)
│   │   ├── pages-store.ts      # Page/tab collection management
│   │   ├── page-grouping.ts    # Page grouping logic (split view)
│   │   ├── app-settings.ts     # User preferences
│   │   ├── recent-files.ts     # Recent files list
│   │   ├── menu-folders.ts     # Sidebar bookmarks
│   │   └── files-store.ts      # File I/O and caching
│   │
│   ├── editors/                # ALL EDITORS LIVE HERE
│   │   ├── registry.ts         # Editor registry & resolution
│   │   ├── types.ts            # Editor interfaces
│   │   │
│   │   ├── base/               # Shared editor infrastructure
│   │   │   ├── PageModel.ts    # Base page model class
│   │   │   ├── EditorToolbar.tsx
│   │   │   └── EditorFooter.tsx
│   │   │
│   │   ├── text/               # Monaco text editor (core)
│   │   │   ├── index.ts        # Public exports
│   │   │   ├── TextEditor.tsx  # Monaco wrapper component
│   │   │   ├── TextPageModel.ts # Text page state & logic
│   │   │   ├── TextPageView.tsx # Layout (toolbar, editor, footer)
│   │   │   ├── TextToolbar.tsx
│   │   │   ├── TextFooter.tsx
│   │   │   ├── EncryptionPanel.tsx
│   │   │   └── ScriptPanel.tsx
│   │   │
│   │   ├── grid/               # Grid editor (JSON/CSV)
│   │   │   ├── index.ts
│   │   │   ├── GridEditor.tsx
│   │   │   ├── GridPageModel.ts
│   │   │   ├── GridToolbar.tsx
│   │   │   ├── components/     # Grid-specific components
│   │   │   │   ├── ColumnsOptions.tsx
│   │   │   │   └── CsvOptions.tsx
│   │   │   └── utils/
│   │   │       └── grid-utils.ts
│   │   │
│   │   ├── markdown/           # Markdown preview
│   │   │   ├── index.ts
│   │   │   ├── MarkdownView.tsx
│   │   │   └── MarkdownPageModel.ts
│   │   │
│   │   ├── pdf/                # PDF viewer
│   │   │   ├── index.ts
│   │   │   ├── PdfViewer.tsx
│   │   │   └── PdfPageModel.ts
│   │   │
│   │   ├── compare/            # Diff/compare editor
│   │   │   ├── index.ts
│   │   │   ├── CompareEditor.tsx
│   │   │   └── ComparePageModel.ts
│   │   │
│   │   └── [future-editor]/    # Template for new editors
│   │       ├── index.ts
│   │       ├── Editor.tsx
│   │       └── PageModel.ts
│   │
│   ├── components/             # Reusable UI components
│   │   ├── basic/              # Simple, atomic components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── TextField.tsx
│   │   │   ├── Chip.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── CircularProgress.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── form/               # Form-related components
│   │   │   ├── ComboSelect.tsx
│   │   │   ├── ComboTemplate.tsx
│   │   │   ├── ListMultiselect.tsx
│   │   │   ├── SwitchButtons.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── layout/             # Layout components
│   │   │   ├── Splitter.tsx
│   │   │   ├── Elements.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── overlay/            # Popups, tooltips, menus
│   │   │   ├── Popper.tsx
│   │   │   ├── PopupMenu.tsx
│   │   │   ├── WithPopupMenu.tsx
│   │   │   └── index.ts
│   │   │
│   │   └── data-grid/          # Complex grid system
│   │       ├── AVGrid/         # Advanced virtual grid
│   │       │   ├── AVGrid.tsx
│   │       │   ├── model/
│   │       │   ├── filters/
│   │       │   └── index.ts
│   │       ├── RenderGrid/     # Render grid
│   │       │   └── ...
│   │       └── index.ts
│   │
│   ├── features/               # Feature-specific UI
│   │   ├── tabs/               # Tab bar and management
│   │   │   ├── PageTabs.tsx
│   │   │   ├── PageTab.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── sidebar/            # Sidebar/menu bar
│   │   │   ├── MenuBar.tsx
│   │   │   ├── FileExplorer.tsx
│   │   │   ├── FileList.tsx
│   │   │   ├── FolderItem.tsx
│   │   │   ├── OpenTabsList.tsx
│   │   │   ├── RecentFileList.tsx
│   │   │   └── index.ts
│   │   │
│   │   └── dialogs/            # Application dialogs
│   │       ├── Dialog.tsx
│   │       ├── Dialogs.tsx
│   │       ├── ConfirmationDialog.tsx
│   │       ├── InputDialog.tsx
│   │       ├── alerts/
│   │       │   ├── AlertsBar.tsx
│   │       │   └── AlertItem.tsx
│   │       └── index.ts
│   │
│   ├── app/                    # Main application shell
│   │   ├── MainPage.tsx        # Root component
│   │   ├── Pages.tsx           # Page container
│   │   ├── RenderEditor.tsx    # Editor router
│   │   └── EventHandler.tsx    # Global event handling
│   │
│   ├── theme/                  # Styling (unchanged)
│   │   ├── colors.ts
│   │   ├── GlobalStyles.tsx
│   │   ├── icons.tsx
│   │   └── language-icons.tsx
│   │
│   └── setup/                  # Configuration (unchanged)
│       ├── configure-monaco.ts
│       └── monaco-languages/
│           ├── csv.ts
│           └── reg.ts
```

---

## Key Design Decisions

### 1. Unified `/editors` Folder

**Before:** Editors scattered across `/custom-editors`, `/pages/text-file-page`, `/pages/CompareEditor`

**After:** ALL editors in `/editors` with consistent structure:
```
/editors/[editor-name]/
├── index.ts           # Public exports, async loading
├── Editor.tsx         # Main component
├── PageModel.ts       # State and business logic
├── Toolbar.tsx        # Editor-specific toolbar (optional)
└── components/        # Editor-specific components (optional)
```

**Benefits:**
- Easy to find any editor
- Consistent patterns across all editors
- Simple to add new editors

### 2. Editor Registry Pattern

```typescript
// /editors/registry.ts

interface EditorDefinition {
  id: string;                           // e.g., "text", "grid-json", "markdown"
  name: string;                         // Display name
  extensions: string[];                 // File extensions this editor handles
  languagePatterns?: string[];          // Language IDs this editor handles
  filenamePatterns?: RegExp[];          // Filename patterns (e.g., *.grid.json)
  priority: number;                     // Resolution priority

  // Async loader for code splitting
  loadEditor: () => Promise<{
    Editor: React.ComponentType<EditorProps>;
    createPageModel: (options: PageModelOptions) => PageModel;
  }>;

  // Alternative editors this page can switch to
  alternativeEditors?: string[];        // e.g., text editor can switch to grid, markdown
}

// Register editors
export const editorRegistry = new EditorRegistry();

editorRegistry.register({
  id: 'text',
  name: 'Text Editor',
  extensions: ['*'],                    // Default for all files
  priority: 0,                          // Lowest priority (fallback)
  loadEditor: () => import('./text'),
  alternativeEditors: ['grid-json', 'grid-csv', 'markdown']
});

editorRegistry.register({
  id: 'grid-json',
  name: 'JSON Grid',
  extensions: ['.json'],
  filenamePatterns: [/\.grid\.json$/],
  priority: 10,
  loadEditor: () => import('./grid'),
});

editorRegistry.register({
  id: 'markdown',
  name: 'Markdown Preview',
  extensions: ['.md', '.markdown'],
  priority: 10,
  loadEditor: () => import('./markdown'),
});

editorRegistry.register({
  id: 'pdf',
  name: 'PDF Viewer',
  extensions: ['.pdf'],
  priority: 100,                        // High priority, exclusive
  loadEditor: () => import('./pdf'),
});
```

### 3. Separated State Management

**Before:** Everything in `pages-model.ts` and `TextFilePage.model.ts`

**After:** Dedicated stores:
- `pages-store.ts` - Page collection (open, close, reorder)
- `page-grouping.ts` - Split view logic
- `files-store.ts` - File I/O operations
- Each editor has its own `PageModel.ts`

### 4. Component Organization by Purpose

**Before:** Flat `/controls` with 35+ files

**After:** Grouped by function:
- `/components/basic` - Button, Input, Chip (atomic)
- `/components/form` - ComboSelect, SwitchButtons (form controls)
- `/components/layout` - Splitter, Elements (layout helpers)
- `/components/overlay` - Popper, PopupMenu (floating UI)
- `/components/data-grid` - AVGrid, RenderGrid (complex data display)

### 5. Features vs Components

- `/components` - Reusable, context-agnostic UI building blocks
- `/features` - Application-specific feature implementations (tabs, sidebar, dialogs)

---

## Adding a New Editor

With the proposed structure, adding a new editor (e.g., Image Viewer) requires:

### Step 1: Create Editor Folder
```
/editors/image/
├── index.ts
├── ImageViewer.tsx
└── ImagePageModel.ts
```

### Step 2: Implement Editor

```typescript
// /editors/image/index.ts
export { ImageViewer as Editor } from './ImageViewer';
export { ImagePageModel, createImagePageModel as createPageModel } from './ImagePageModel';

// /editors/image/ImageViewer.tsx
export const ImageViewer: React.FC<EditorProps> = ({ model }) => {
  // Render image
};

// /editors/image/ImagePageModel.ts
export class ImagePageModel extends PageModel {
  // Image-specific state
}

export function createImagePageModel(options: PageModelOptions): ImagePageModel {
  return new ImagePageModel(options);
}
```

### Step 3: Register Editor

```typescript
// /editors/registry.ts
editorRegistry.register({
  id: 'image',
  name: 'Image Viewer',
  extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
  priority: 100,
  loadEditor: () => import('./image'),
});
```

**That's it.** No changes needed in:
- RenderEditor.tsx (uses registry)
- resolve-editor.ts (replaced by registry)
- ActiveEditor.tsx (replaced by registry)

---

## Migration Strategy

### Phase 1: Foundation
1. Create `/core` folder structure
2. Move utilities without changing imports
3. Create editor registry (parallel to existing system)

### Phase 2: Editor Consolidation
1. Create `/editors/base` with shared PageModel
2. Move text editor to `/editors/text`
3. Move grid editor to `/editors/grid`
4. Move markdown to `/editors/markdown`
5. Move PDF to `/editors/pdf`
6. Move compare to `/editors/compare`

### Phase 3: Components Reorganization
1. Create `/components` subfolders
2. Move components incrementally
3. Update imports

### Phase 4: State Refactoring
1. Extract page grouping logic
2. Split large models into focused stores
3. Update references

### Phase 5: Cleanup
1. Remove old folders
2. Update CLAUDE.md with new structure
3. Verify all features work

---

## File Count Comparison

| Area | Current | Proposed |
|------|---------|----------|
| Editor files | Scattered (~40) | `/editors` (~35) |
| Component files | `/controls` (35) | `/components` (35 organized) |
| Model files | Mixed locations (15) | `/store` + `/editors/*/` (15) |
| Core/Utils | `/common` (20) | `/core` (15 organized) |

**Total files unchanged** - this is reorganization, not rewriting.

---

## Design Decisions (Resolved)

### 1. RenderGrid as Base Virtualization Component

RenderGrid is a **base virtualization component**, not part of AVGrid. It's a generic virtualized grid that:
- Accepts `columnCount`, `rowCount`, `columnWidth`, `rowHeight`, sticky props
- Provides `renderCell` callback for rendering visible cells
- Calculates cell positions in visible viewport
- Used by: AVGrid, List, and potentially other scrollable components

**Location:** `/components/virtualization/RenderGrid/`

```
/components/
├── virtualization/           # Base virtualization primitives
│   ├── RenderGrid/
│   │   ├── RenderGrid.tsx
│   │   ├── RenderFlexGrid.tsx
│   │   ├── RenderGridModel.ts
│   │   ├── types.ts
│   │   └── index.ts
│   └── index.ts
│
├── data-grid/                # High-level data grids (uses RenderGrid)
│   ├── AVGrid/
│   │   └── ...
│   └── index.ts
```

### 2. Script Service with Language Hooks

Script execution should be a **core service** with extensibility for language-specific automation.

**Vision:** Users can configure scripts that run when specific conditions are met (e.g., language selected), allowing dynamic toolbar setup and custom functionality.

**Example - SQL Editor scenario:**
1. User opens a file and selects 'sql' language
2. A configured script runs automatically on language change
3. Script sets up toolbar: connection combobox, "Run" button
4. User writes query, selects connection, clicks Run
5. Script uses Node.js `require()` to load any database driver (mssql, sqlite, etc.)
6. Results displayed in grouped page as a grid

**Key principle:** js-notepad is a **container with building blocks**. With `nodeIntegration: true`, scripts have full Node.js access. Users can connect to any database, call any API, use any npm package - js-notepad doesn't need to expose specific integrations.

**Location:** `/core/services/scripting/`

```
/core/services/scripting/
├── ScriptRunner.ts           # Core script execution
├── ScriptContext.ts          # Sandbox context (page, React, etc.)
├── ScriptHooks.ts            # Language/event hooks system
├── ToolbarBuilder.ts         # API for scripts to add toolbar items
└── types.ts
```

**Script capabilities:**
```typescript
// Scripts have full Node.js access via nodeIntegration
const path = require("path");
const sql = require(path.join("D:\\packages\\node_modules", "mssql"));
const fs = require("fs");
const https = require("https");
// Any npm package can be loaded!

// ScriptContext provides app-specific building blocks:
interface ScriptContext {
  // Existing
  page: PageInterface;
  React: typeof React;

  // Future expansions - app building blocks only
  app: {
    openFile(path: string): Promise<PageInterface>;
    showAlert(message: string): void;
    // ...
  };
  toolbar: {
    addButton(config: ButtonConfig): void;
    addCombobox(config: ComboConfig): void;
    // ...
  };
}

// Example: SQL query with results in grid
const sql = require("mssql");
await sql.connect(config);
const result = await sql.query(page.content);
await sql.close();

page.grouped.language = "json";
page.grouped.editor = "grid-json";
return result.recordset;
```

**Philosophy:** js-notepad provides the UI building blocks (toolbar, editors, grouped pages). Users bring their own integrations via Node.js/npm.

### 3. Compare Editor - Standalone

Compare is a **standalone editor** that:
- Uses Monaco DiffEditor
- Compares two grouped pages side-by-side
- Is one editor for both pages (not a mode of text editor)

**Location:** `/editors/compare/`

### 4. File I/O - Keep in Renderer

File operations stay in renderer process because:
- App configured with `nodeIntegration: true`, `contextIsolation: false`
- Simpler to work with files directly
- Scripts need file access through context

---

## ContentPageModel - Base Model for Content Editors

### The Problem

Current `TextFilePage.model.ts` is used by:
- Monaco text editor (primary)
- Grid editor (reuses content/file management)
- Future tools will also need this base

### Future Tool Editors Planned

| Tool | Extension | Description |
|------|-----------|-------------|
| **Notebook** | `*.note.json` | Chat-like notes with categories/tags, search, left panel navigation |
| **ToDo Lists** | `*.todo.json` | Multiple categorized todo lists |
| **Bookmarks** | `*.link.json` | Categorized bookmarks with tags, potential Browser tool integration |

All these tools share common needs:
- File I/O (read, write, auto-save)
- Content state management
- Modification tracking
- File watching for external changes
- Encryption support
- Script context exposure

### Solution: ContentPageModel in `/editors/base/`

```
/editors/
├── base/                          # Shared editor infrastructure
│   ├── PageModel.ts               # Abstract base for ALL page types
│   ├── ContentPageModel.ts        # Base for content/file editors
│   ├── EditorToolbar.tsx          # Shared toolbar wrapper
│   └── EditorFooter.tsx           # Shared footer/status bar
```

**Inheritance hierarchy:**

```
PageModel (abstract)
├── ContentPageModel              # File-based content (text, JSON data)
│   ├── TextPageModel             # Monaco-specific (language, encoding)
│   ├── GridPageModel             # Grid-specific (columns, rows, filters)
│   ├── NotebookPageModel         # Notebook-specific (notes, categories)
│   ├── TodoPageModel             # Todo-specific (lists, items)
│   └── BookmarkPageModel         # Bookmark-specific (links, categories)
│
└── ViewerPageModel               # Read-only viewers (no content editing)
    ├── PdfPageModel              # PDF viewing
    └── ImagePageModel            # Image viewing (future)
```

**ContentPageModel responsibilities:**
```typescript
abstract class ContentPageModel extends PageModel {
  // Content management
  content: string;
  modified: boolean;

  // File operations
  filePath?: string;
  encoding: string;

  // File watching
  fileWatcher: FileWatcher;

  // Encryption
  encrypted: boolean;
  password?: string;

  // Script context
  getScriptContext(): PageScriptContext;

  // Lifecycle
  save(): Promise<void>;
  reload(): Promise<void>;

  // Abstract - subclasses implement
  abstract parseContent(raw: string): void;
  abstract serializeContent(): string;
}
```

**TextPageModel adds:**
- Language detection and management
- Monaco editor instance reference
- Text-specific encoding handling

**GridPageModel adds:**
- Column/row parsing from JSON/CSV
- Grid state (sorting, filtering, selection)
- Grid-specific serialization

**NotebookPageModel adds:**
- Notes array with categories/tags
- Search/filter state
- Note CRUD operations

---

## Updated Proposed Structure

```
/src/renderer/
├── core/
│   ├── state/
│   ├── services/
│   │   ├── encryption.ts
│   │   ├── file-watcher.ts
│   │   └── scripting/              # Expanded scripting service
│   │       ├── ScriptRunner.ts
│   │       ├── ScriptContext.ts
│   │       ├── ScriptHooks.ts
│   │       └── types.ts
│   └── utils/
│
├── store/
│
├── editors/
│   ├── registry.ts
│   ├── types.ts
│   │
│   ├── base/                       # Shared editor infrastructure
│   │   ├── PageModel.ts            # Abstract base
│   │   ├── ContentPageModel.ts     # Content/file base
│   │   ├── ViewerPageModel.ts      # Read-only viewer base
│   │   ├── EditorToolbar.tsx
│   │   └── EditorFooter.tsx
│   │
│   ├── text/                       # Monaco text editor
│   │   ├── index.ts
│   │   ├── TextEditor.tsx
│   │   ├── TextPageModel.ts        # extends ContentPageModel
│   │   ├── TextPageView.tsx
│   │   ├── TextToolbar.tsx
│   │   ├── EncryptionPanel.tsx
│   │   └── ScriptPanel.tsx
│   │
│   ├── grid/                       # JSON/CSV grid
│   │   ├── index.ts
│   │   ├── GridEditor.tsx
│   │   ├── GridPageModel.ts        # extends ContentPageModel
│   │   └── ...
│   │
│   ├── markdown/
│   ├── pdf/
│   ├── compare/
│   │
│   └── tools/                      # Tool editors (future)
│       ├── notebook/               # *.note.json
│       │   ├── index.ts
│       │   ├── NotebookEditor.tsx
│       │   ├── NotebookPageModel.ts # extends ContentPageModel
│       │   └── components/
│       │       ├── NoteItem.tsx
│       │       ├── CategoryPanel.tsx
│       │       └── SearchBar.tsx
│       │
│       ├── todo/                   # *.todo.json
│       │   ├── index.ts
│       │   ├── TodoEditor.tsx
│       │   ├── TodoPageModel.ts    # extends ContentPageModel
│       │   └── components/
│       │
│       └── bookmarks/              # *.link.json
│           ├── index.ts
│           ├── BookmarkEditor.tsx
│           ├── BookmarkPageModel.ts # extends ContentPageModel
│           └── components/
│
├── components/
│   ├── basic/
│   ├── form/
│   ├── layout/
│   ├── overlay/
│   ├── virtualization/             # Base virtualization
│   │   ├── RenderGrid/
│   │   └── index.ts
│   └── data-grid/                  # High-level grids
│       ├── AVGrid/
│       └── index.ts
│
├── features/
├── app/
├── theme/
└── setup/
```

---

## Next Steps

If this structure looks good:
1. Review and confirm the design decisions
2. Prioritize which phase to start with
3. Begin incremental migration
4. Update CLAUDE.md as structure evolves
