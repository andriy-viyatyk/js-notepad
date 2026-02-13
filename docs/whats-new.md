[← Home](./index.md)

# What's New

Release notes and changelog for js-notepad.

---

## Version 1.0.8 (Upcoming)

### New Features

- **Application Theming** — Switch between 6 dark color themes via the new Settings page
  - Available themes: Default Dark, Solarized Dark, Monokai, Abyss, Red, Tomorrow Night Blue
  - Settings page with visual theme previews (access via toolbar Settings button)
  - Monaco editor theme updates automatically with app theme
  - Theme preference persists across sessions
  - Flash-free startup — correct theme applied before first paint
  - "View Settings File" button for raw JSON access

- **HTML Preview** — Switch to "Preview" for HTML files to see rendered output in a sandboxed iframe. Supports JavaScript execution, live updates, and works with unsaved content.

---

## Version 1.0.7

### New Features

- **Markdown View Enhancements**
  - Syntax highlighting in fenced code blocks using Monaco's `colorize()` API
  - Supports all Monaco languages with alias resolution (e.g., `ts`, `js`, `py`, `bash`)
  - Copy-to-clipboard button on code block hover
  - Inline Mermaid diagram rendering for ` ```mermaid ` code blocks
  - Mermaid diagrams use dark theme with text contrast fix for readable labels
  - Shared rendering pipeline with standalone Mermaid viewer (`.mmd` files)
  - Compact mode font size increase for better readability in notebook notes

### Improvements

- Distinctive file icons for `.note.json` (notebook) and `.grid.json`/`.grid.csv` (grid) files in tabs and sidebar
- Restyled editor switch buttons with modern look and hover effects
- Notebook editor: smoother transitions, improved focus indication
- Expanded note editor now properly fills available space
- Disabled browser spellcheck in editor windows

### Bug Fixes

- Fixed notebook editor overwriting raw content when JSON has parse errors

---

## Version 1.0.6

### New Features

- **Mermaid Diagram Viewer**: Preview `.mmd` and `.mermaid` files as rendered diagrams
  - Supports all Mermaid diagram types (flowchart, sequence, class, state, ER, Gantt, pie, git graph)
  - Switch between text editor and diagram preview using toolbar button
  - Light/dark theme toggle for diagram rendering
  - Copy diagram to clipboard as image
  - Zoom, pan, and keyboard shortcuts (reuses Image Viewer controls)
  - Live preview of unsaved changes with debounced re-rendering
  - Mermaid syntax highlighting in Monaco editor

- **Copy Image to Clipboard**: Copy displayed images to clipboard as PNG
  - Copy button in Image Viewer toolbar and SVG Preview toolbar
  - Ctrl+C keyboard shortcut when image is focused
  - Works with all image formats (PNG, JPG, GIF, BMP, WebP) and SVG preview
  - Paste into external apps (Teams, Word, Outlook, etc.)

- **Notebook Editor**: A structured notes editor for `.note.json` files
  - Create and organize notes with categories and tags
  - Each note contains its own code editor (Monaco, Grid, Markdown, SVG)
  - Hierarchical category tree with drag-and-drop organization
  - Tag system with categorized tags (e.g., "env:dev", "env:prod")
  - Full-text search across note titles, categories, tags, and content
  - Search highlighting in all editor types (Monaco, Grid, Markdown)
  - Expand any note to full editor size for detailed work
  - Run JavaScript scripts directly from notes
  - Comments on individual notes
  - Virtualized list for smooth scrolling with many notes
  - See [Notebook Editor](./notebook.md) for full documentation

---

## Version 1.0.5

### New Features

- **About Page**: View application and system information
  - Access via Info button in the sidebar menu
  - Shows app version, Electron, Node.js, and Chromium versions
  - "Check for Updates" button to manually check for new versions
  - Links to GitHub repository, downloads, and issue tracker

- **Automatic Update Check**: Get notified when new versions are available
  - Checks GitHub Releases automatically on startup (once per 24 hours)
  - Shows notification when a new version is available
  - Click notification to open About page for download link
  - No automatic downloads - you stay in control

- **Image Viewer**: View binary images directly in the application
  - Supported formats: PNG, JPG, GIF, WEBP, BMP, ICO
  - Zoom with mouse wheel or +/- buttons
  - Pan by dragging when zoomed in
  - Click zoom indicator to reset to fit view
  - Automatic fit-to-window on open

- **SVG Preview**: Preview SVG files as rendered graphics
  - Open SVG in Monaco text editor by default
  - Switch to "Preview" mode using toolbar button
  - Same zoom/pan controls as Image Viewer
  - Shows live preview of unsaved changes

### Improvements

- **Application Structure Refactoring**: Major reorganization of codebase for better maintainability
  - New folder structure: `/core`, `/store`, `/editors`, `/components`, `/features`
  - All editors now in unified `/editors` folder
  - Better separation of concerns

- **Editor Registry Pattern**: New declarative system for editor registration
  - Single place to register editors (`register-editors.ts`)
  - Adding new editors now requires only one file change
  - Automatic file type detection by extension or filename patterns
  - Priority-based editor resolution
  - See [Editor Guide](/doc/standards/editor-guide.md) for details

### Documentation

- New developer documentation structure
- Architecture documentation
- Coding standards and guides
- Task tracking system
- User documentation with guides

---

## Version 1.0.4

### Improvements

- File operations improvements

---

## Version 1.0.3

### Features

- Grid improvements for JSON/CSV viewing
- Better file operation handling

---

## Version 1.0.2

### Bug Fixes

- Various stability improvements

---

## Version 1.0.1

### Features

- Initial public release
- Monaco Editor integration
- JavaScript script execution
- JSON/CSV Grid view
- Markdown preview
- PDF viewer
- Tab management
- File encryption

---

## Planned Features

See [GitHub Issues](https://github.com/andriy-viyatyk/js-notepad/issues) for planned features and known issues.

### Coming Soon

- Testing infrastructure
- Keyboard shortcut customization
