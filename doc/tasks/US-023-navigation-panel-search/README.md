# US-023: NavigationPanel File Content Search

## Status

**Status:** Planned
**Priority:** Medium
**Started:** —
**Completed:** —

## Summary

Add VS Code-style file content search to the NavigationPanel — a search field in the header with include/exclude patterns, results displayed in a split bottom panel grouped by file with matched lines, and FileExplorer filtering to show only matching files.

## Why

- Developers need to search across project files without leaving the editor
- Current FileExplorer only searches file names, not content
- VS Code's search-in-files is one of the most used features — bringing it to js-notepad fills a significant gap
- Searching within the NavigationPanel's root folder is contextually appropriate (scoped to the folder the user is already browsing)

## Design

### Layout

```
┌─────────────────────────────────┐
│ NavigationPanel Header          │
│ ┌─────────────────────────────┐ │
│ │ [Search in files...]    [×] │ │
│ │ [Files to include...]       │ │
│ │ [Files to exclude...]       │ │
│ └─────────────────────────────┘ │
│ [↑] [⊞] [↻] [×]               │
├─────────────────────────────────┤
│ FileExplorer (filtered)         │
│ ▸ src/                          │
│   ▸ components/                 │
│     ├ Button.tsx                │
│     └ Input.tsx                 │
│   ├ App.tsx                     │
│   └ index.ts                    │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤  ← splitter
│ Search Results (N matches in M  │
│ files)                          │
│                                 │
│ ▸ src/components/Button.tsx (2) │
│   │ 12: onClick={handleClick}   │
│   │ 25: handleClick = () => {   │
│ ▸ src/App.tsx (1)               │
│   │ 8: import { handleClick }   │
│                                 │
└─────────────────────────────────┘
```

### Header Changes

- **Remove:** Root folder name label from header (already shown as root tree node)
- **Add:** Search input field with collapsible include/exclude pattern fields below it
- **Keep:** Up, Collapse All, Refresh, Close buttons (move below search area)

### Search Input

- Main search field: text to search for in file contents
- **Include pattern:** glob pattern for files to search (e.g., `*.ts,*.tsx`). Empty = search all text files.
- **Exclude pattern:** glob pattern for files to exclude (e.g., `*.test.ts,dist/**`). Default excludes: `node_modules`, `.git`, build output.
- Include/exclude fields toggle visibility (collapsed by default, expand with a chevron/button)
- Press Enter or debounced auto-search after typing pause (~500ms)
- Show "X" clear button to reset search and restore full FileExplorer

### Search Results Panel

- Appears at the bottom of NavigationPanel when search has results
- Separated from FileExplorer by a draggable splitter
- Header shows summary: "N matches in M files"
- Results grouped by file (collapsible groups):
  - File path (relative to root) with match count badge
  - Under each file: matched lines with line number prefix
  - Matched text highlighted within each line
- Clicking a matched line:
  1. Opens the file in the current page (or new tab if current page has unsaved changes)
  2. Activates Monaco editor
  3. Scrolls to and highlights the matched line
- Virtualized list for large result sets

### FileExplorer Filtering

- While search is active, FileExplorer shows only files/folders containing matches
- Folders that contain matching files are auto-expanded
- Non-matching files and empty folders are hidden
- Clear search restores full tree

### Text File Detection

Maintain a configurable list of file extensions considered "text files" for searching:

**Default searchable extensions:**
```
.ts, .tsx, .js, .jsx, .mjs, .cjs,
.json, .jsonc, .json5,
.html, .htm, .xml, .svg,
.css, .scss, .sass, .less,
.md, .mdx, .txt, .log,
.yaml, .yml, .toml, .ini, .cfg, .conf,
.env, .gitignore, .editorconfig,
.sh, .bash, .zsh, .bat, .cmd, .ps1,
.py, .rb, .java, .c, .cpp, .h, .hpp, .cs, .go, .rs, .swift, .kt,
.sql, .graphql, .gql,
.vue, .svelte, .astro,
.dockerfile, .makefile,
.csv
```

- Store in application settings so users can customize
- Files without extension: check if readable as text (first 512 bytes, look for null bytes)
- Skip files larger than a configurable max size (default: 1 MB) to avoid performance issues

## Technical Approach

### Search Execution: Main Process via IPC (Chosen)

Run file content search in the Electron main process to avoid freezing the renderer UI.

**Architecture:**

```
Renderer (NavigationPanel)          Main Process
    │                                    │
    ├──── IPC: search-start ────────────►│
    │     { rootPath, query,             │ Walks directory tree
    │       include, exclude }           │ Reads files
    │                                    │ Matches lines
    │◄─── IPC: search-result ───────────┤ (streamed per file)
    │     { file, matches[] }            │
    │                                    │
    │◄─── IPC: search-progress ─────────┤
    │     { filesSearched, filesTotal }  │
    │                                    │
    │◄─── IPC: search-complete ─────────┤
    │     { totalMatches, totalFiles }   │
    │                                    │
    ├──── IPC: search-cancel ───────────►│ (user clears/changes search)
    │                                    │
```

**Why main process:**
- File I/O in renderer blocks the UI thread (React rendering, user interactions)
- Main process runs independently — search won't cause UI stutters
- Results streamed incrementally — user sees matches as they're found
- Easy cancellation — new search cancels the previous one
- The project already uses IPC for dialog operations; this follows the same pattern

**Implementation details:**
- Main process search service uses `fs.promises` with async iteration
- Walks directory tree recursively, respecting include/exclude patterns
- Reads each file, splits into lines, matches query against each line
- Sends results per-file via IPC (not per-line, to reduce IPC overhead)
- Tracks cancellation token — aborts immediately when search is cancelled
- Supports case-sensitive/insensitive toggle
- Supports regex search (optional, can be added later)

### Alternative Considered: Worker Threads in Renderer

Use `require('worker_threads').Worker` directly from renderer.

**Pros:**
- No IPC overhead — direct message passing within process
- Simpler architecture

**Cons:**
- Worker threads from Electron renderer are less conventional
- Harder to debug
- Still shares process memory pressure with renderer

**Decision:** Main process IPC is more aligned with Electron's architecture and the project's existing patterns.

### Alternative Considered: Chunked Async in Renderer

Read files asynchronously in renderer with `setTimeout` yielding between batches.

**Pros:**
- Simplest implementation
- No IPC or worker setup

**Cons:**
- Still causes micro-stutters during heavy I/O
- File reading competes with React rendering for the event loop
- Not truly non-blocking

**Decision:** Rejected — would degrade UI responsiveness for large projects.

### Opening Files at Specific Lines

When user clicks a search result line:

1. Call `pagesModel.navigatePageTo(pageId, filePath)` (existing method)
2. After file loads, ensure Monaco editor is active (not grid/preview)
3. Use Monaco's `revealLineInCenter(lineNumber)` and `setPosition({ lineNumber, column: 1 })`
4. Optionally highlight the matched text using Monaco decorations

This requires a mechanism to pass a "go to line" instruction when opening a file. Options:
- Add an optional `options` parameter to `navigatePageTo`: `{ revealLine?: number, searchHighlight?: string }`
- Or use the existing TextPageModel to set cursor position after load completes

## Acceptance Criteria

- [ ] Search input field in NavigationPanel header (replaces folder name label)
- [ ] Include/exclude pattern fields (collapsible)
- [ ] Search runs in main process — does not freeze renderer UI
- [ ] Results streamed incrementally (appear as found)
- [ ] Results panel at bottom of NavigationPanel with draggable splitter
- [ ] Results grouped by file with matched lines and line numbers
- [ ] Matched text highlighted in results
- [ ] Clicking a result opens file in Monaco at the matched line
- [ ] FileExplorer filters to show only files with matches during active search
- [ ] Only text files searched (configurable extension list in settings)
- [ ] Large files skipped (configurable max size, default 1 MB)
- [ ] Default exclude patterns: node_modules, .git
- [ ] Search cancellation (new search cancels previous)
- [ ] Progress indication during search
- [ ] Clear button resets search and restores full FileExplorer
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Files to Modify

### New Files

- `src/main/search-service.ts` — Main process file content search service (directory walking, file reading, line matching, cancellation)
- `src/ipc/search-ipc.ts` — IPC channel definitions for search communication (start, result, progress, complete, cancel)
- `src/renderer/features/navigation/SearchResultsPanel.tsx` — Search results component (grouped by file, matched lines, click handler)
- `src/renderer/features/navigation/NavigationSearchModel.ts` — Renderer-side search state management (query, results, filtering, IPC communication)

### Modified Files

- `src/main/main-setup.ts` — Register search IPC handlers
- `src/renderer/features/navigation/NavigationPanel.tsx` — Replace folder label with search input, add include/exclude fields, integrate results panel with splitter
- `src/renderer/features/navigation/nav-panel-store.ts` — Add search-related state (searchQuery, searchResults, isSearching, resultsPanelHeight)
- `src/renderer/components/file-explorer/FileExplorerModel.ts` — Add external filter prop for hiding non-matching files
- `src/renderer/store/app-settings.ts` — Add searchable file extensions setting, max file size setting
- `src/renderer/store/pages-store.ts` — Extend `navigatePageTo` with optional line number/highlight parameter
- `src/ipc/api-types.ts` — Add search-related IPC command types

## Implementation Progress

### Phase 1: Main Process Search Service
- [ ] Create `search-service.ts` with async directory walker
- [ ] Implement file content matching (line-by-line, case-insensitive by default)
- [ ] Implement include/exclude glob pattern filtering
- [ ] Implement text file detection (extension list + binary check)
- [ ] Implement file size limit
- [ ] Implement cancellation support
- [ ] Add searchable extensions to app settings with defaults
- [ ] Create `search-ipc.ts` with IPC channel definitions
- [ ] Register IPC handlers in `main-setup.ts`

### Phase 2: NavigationPanel UI Changes
- [ ] Remove folder name label from header
- [ ] Add search input field to header
- [ ] Add collapsible include/exclude pattern fields
- [ ] Add search clear button
- [ ] Connect search input to IPC (debounced, with cancel on new search)
- [ ] Add progress indicator during search

### Phase 3: Search Results Panel
- [ ] Create `SearchResultsPanel.tsx` — virtualized list of grouped results
- [ ] Show results grouped by file with match count
- [ ] Show matched lines with line numbers and highlighted text
- [ ] Add splitter between FileExplorer and results panel
- [ ] Implement click handler to open file at line
- [ ] Extend `navigatePageTo` with `revealLine` option
- [ ] Ensure Monaco activates and scrolls to target line

### Phase 4: FileExplorer Integration
- [ ] Add filter prop to FileExplorerModel for external file filtering
- [ ] When search active: filter tree to show only matching files and their ancestor folders
- [ ] Auto-expand folders containing matches
- [ ] Restore full tree when search cleared

### Phase 5: Polish & Documentation
- [ ] Case-sensitive/insensitive toggle
- [ ] Search summary ("N matches in M files")
- [ ] Keyboard shortcut to focus search (e.g., Ctrl+Shift+F when NavPanel open)
- [ ] Update user documentation
- [ ] Update what's new

## Notes

### 2026-02-17
- NavigationPanel header currently shows: Up button, folder name label, Collapse All, Refresh, Close
- Folder name label is redundant — root folder already appears as the first tree node in FileExplorer
- FileExplorer already has file name search (Ctrl+F) — content search is a separate feature using the NavPanel header
- All filesystem access in the project uses direct `require("fs")` in renderer — but content search is too heavy for renderer thread
- Main process IPC approach is similar to how VS Code runs search in a separate extension host process
- The project's IPC pattern (see `api.ts` and `api-types.ts`) uses command IDs with response callbacks — search needs a streaming variant (multiple result messages per request)
- Consider using `micromatch` or `picomatch` npm package for glob pattern matching (include/exclude) — check if already in dependencies, otherwise minimatch is available in Node.js

## Related

- Current file name search: `FileExplorerModel.ts` search functionality
- NavigationPanel: `src/renderer/features/navigation/NavigationPanel.tsx`
- IPC patterns: `src/ipc/api-types.ts`, `src/ipc/renderer/api.ts`
- Related doc: [Architecture Overview](../../architecture/overview.md)
