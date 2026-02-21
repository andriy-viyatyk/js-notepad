# Active Tasks

Current work in progress and planned tasks.

## In Progress

| ID | Title | Priority | Link |
|----|-------|----------|------|


## Planned (Next)

| ID | Title | Priority | Link |
|----|-------|----------|------|
| US-027 | Browser Profiles, Incognito & Downloads | Medium | [README](US-027-browser-profiles-downloads/README.md) |
| US-028 | Browser Bookmarks (Links Editor Integration) | Low | [README](US-028-browser-bookmarks/README.md) |
| US-029 | Browser Web Page Context Menu | Medium | [README](US-029-browser-context-menu/README.md) |

## Recently Completed

| ID | Title | Notes |
|----|-------|-------|
| US-026 | Browser Internal Tabs | Multi-tab browsing within a browser page, left-side tabs panel, target="_blank"/window.open() open new internal tabs, tab context menu (close/close others/close below), resizable panel, session restore for all tabs |
| US-025 | Basic Browser Editor | Built-in web browser as page-editor using webview, multi-process architecture (renderer + main + guest preload), favicon/title detection, session restore, protocol blocking |
| US-023 | NavigationPanel File Content Search | VS Code-style file content search with streaming results, include/exclude patterns, FileExplorer filtering, Monaco highlighting, configurable extensions in Settings |
| US-024 | ToDo List Enhancement — Tags | Colored tags with filtering, tag assignment on items, predefined color palette, drag-drop warnings |
| US-022 | ToDo Editor | Structured task list editor for `.todo.json` files with multiple lists, drag-to-reorder, search, comments, virtualized grid |
| US-020 | Markdown View Search | Ctrl+F search in Markdown Preview with match highlighting, F3/Shift+F3 navigation, match counter, active match background |
| US-019 | Open User Folder in Tab | Chevron on sidebar folders opens new tab with NavPanel, hover+tooltip for discoverability, built-in items unchanged |
| US-018 | Implement Grouping for Pinned Tabs | Non-adjacent grouping for pinned+unpinned tabs, script execution works in pinned tabs, grouping preserved through pin/unpin |
| US-017 | Pinning Page Tabs | Compact icon-only pinned tabs with sticky positioning, drag constraints, window persistence, navigation preservation |
| US-016 | Reusable File Explorer Component | Tree-based FileExplorer replacing flat lists in sidebar and NavigationPanel, lazy loading, search, file operations, state persistence, navigate up/make root, collapse all |
| US-015 | Document Navigation Panel | Folder-based nav tree from markdown links, in-tab navigation with auto-preview, pages-store lifecycle refactoring, global keyboard shortcuts fix |
| US-014 | Application Theming | CSS Custom Properties theming with 6 dark themes, Settings page with theme selector, Monaco integration |
| US-013 | Create HTML Viewer | Sandboxed iframe preview for HTML files with script execution support |
| US-012 | Markdown View Enhancements | Code block syntax highlighting, copy-to-clipboard button, inline Mermaid diagrams, shared render-mermaid module |
| US-011 | Mermaid Diagram Viewer | .mmd/.mermaid preview with light/dark toggle, copy to clipboard, syntax highlighting |
| US-010 | Copy Image to Clipboard | Copy button in Image Viewer header and SVG View toolbar, Ctrl+C shortcut |
| US-009 | Notebook Editor | Structured notes editor with categories, tags, search, drag-and-drop, expand-to-overlay |
| US-008 | TypeScript and Dependencies Upgrade | TypeScript 4.5→5.4, @types/node 16→20, fixed vite compatibility |
| US-007 | About Page and Version Check | About page with version info + auto update check via GitHub API |
| US-006 | Create Image View Editor | Image viewer for binary images + SVG preview as content-view |
| US-003 | ContentPageModel Extraction | Closed - architecture review concluded existing design is correct |
| US-002 | Editor Registry Pattern | Declarative editor registration in `register-editors.ts` |
| US-001 | Fix Circular Dependencies | Direct imports instead of barrel exports |
| US-005 | Create User Documentation | Completed - see `/docs/` folder |

## How to Work on Tasks

### Starting a Task

1. Check this file for available tasks
2. Read the task's `README.md` in its folder
3. Update task status to "In Progress"
4. Update this file to move task to "In Progress" section

### During Work

1. Update the task's progress checklist as you complete items
2. Add notes for any decisions or discoveries
3. Commit regularly with task ID in message: `US-001: Fix import in ScriptContext`

### Completing a Task

1. Verify all acceptance criteria are met
2. Run the documentation checklist:
   - [ ] Update architecture docs (if structure changed)
   - [ ] Update standards docs (if new patterns established)
   - [ ] Review and update user guidance docs in `/docs/` — check all pages that describe affected features, update text/screenshots to match the new behavior
   - [ ] Update CLAUDE.md (if significant patterns or key files changed)
   - [ ] Update `/docs/whats-new.md` (for notable features/changes)
3. Update this file: move task to "Recently Completed" section
4. **Ask user for confirmation** before deleting the task folder
5. Delete task folder after user confirms

## Creating New Tasks

1. Copy `_template/` folder to `US-XXX-short-name/`
2. Fill in the README.md
3. Add to "Planned" section in this file
4. Use next available US number

## Task ID Format

`US-XXX` where XXX is a sequential number.

- US-001 through US-099: Infrastructure/refactoring
- US-100+: Features and enhancements

---

*Last updated: 2026-02*
