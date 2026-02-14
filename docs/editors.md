[← Home](./index.md)

# Editors

js-notepad includes multiple editors for different file types. Some files support switching between editors using toolbar buttons.

## Text Editor (Default)

The default editor for all text files, powered by Monaco (the same engine as VS Code):

- **Syntax highlighting** for 50+ languages
- **IntelliSense** and auto-completion
- **Find and replace** (`Ctrl+F` / `Ctrl+H`)
- **Multi-cursor editing** (`Alt+Click`, `Ctrl+D`, `Ctrl+Alt+Up/Down`)
- **Code folding** — collapse and expand code blocks
- **Column selection** — `Shift+Alt+Arrow` keys for rectangular selection
- **Minimap** — code overview on the right side
- **Delete line** — `Ctrl+Y` deletes the entire current line

The text editor also provides a **Script Panel** for running JavaScript against any file's content. See [Scripting](./scripting.md) for details.

## Grid Editor

A spreadsheet-like interface for JSON and CSV data with sorting, filtering, cell editing, and full keyboard navigation.

**Supported formats:**
- JSON files containing an array of objects
- CSV files (auto-detects delimiter)
- Files with `.grid.json` or `.grid.csv` extensions open directly in Grid view

**Key features:**
- Click column headers to sort
- Filter rows by column values
- Copy/paste to and from Excel (`Ctrl+C` / `Ctrl+V`)
- Edit cells directly (Enter/F2 to edit, Escape to cancel)
- Insert and delete rows (`Ctrl+Insert` / `Ctrl+Delete`)
- Insert and delete columns (`Ctrl+Shift+Insert` / `Ctrl+Shift+Delete`)
- Copy with headers (`Ctrl+Shift+C`)
- Copy as JSON or HTML table
- Column management (show/hide, reorder, resize)
- Full keyboard navigation

See **[Grid Editor](./grid-editor.md)** for complete documentation including all keyboard shortcuts.

## Markdown Preview

For `.md` and `.markdown` files — click **Preview** in the toolbar:

- **GitHub-flavored Markdown** rendering
- **Syntax highlighting** in fenced code blocks using Monaco's colorize API (supports all Monaco languages including aliases like `ts`, `js`, `py`, `bash`)
- **Copy-to-clipboard** button on code block hover
- **Inline Mermaid diagrams** — ` ```mermaid ` code blocks render as SVG diagrams
- **Live preview** updates as you type
- **Minimap** navigation on the right side

## PDF Viewer

For `.pdf` files — opens automatically:

- Page navigation (scroll or page controls)
- Zoom controls (in/out, fit to page)
- Text search within PDF
- Read-only view

## Image Viewer

For image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`) — opens automatically:

- **Zoom** with mouse wheel or toolbar +/- buttons
- **Pan** by dragging when zoomed in
- **Fit to window** (default view)
- **Reset zoom** — click the zoom percentage indicator
- **Copy to clipboard** — `Ctrl+C` or toolbar button (copies as PNG)

## SVG Preview

For `.svg` files — opens in text editor by default, click **Preview** in the toolbar:

- Same zoom/pan/copy controls as Image Viewer
- **Live preview** of unsaved changes
- Switch between text editor and preview anytime

## Mermaid Diagram Viewer

For `.mmd` and `.mermaid` files — click **Mermaid** in the toolbar:

- Supports all Mermaid diagram types (flowchart, sequence, class, state, ER, Gantt, pie, git graph)
- Same zoom/pan controls as Image Viewer
- **Light/dark theme toggle** (dark by default, light for copying into documents)
- **Copy diagram** to clipboard as image
- **Live preview** with debounced re-rendering
- Mermaid syntax highlighting in the text editor

## HTML Preview

For `.html` files — click **Preview** in the toolbar:

- **Live preview** of unsaved changes
- **JavaScript execution** — scripts in the HTML run in the preview
- **Sandboxed rendering** — preview is isolated from the application
- Switch between text editor and preview anytime

## Compare Mode

Compare two files side-by-side using Monaco's built-in diff viewer:

1. Open two text files
2. Hold `Ctrl` and click the second file's tab to group them side-by-side
3. Click the **Compare** button in the toolbar

**Features:**
- Side-by-side diff view
- Inline diff highlighting (additions, deletions, modifications)
- Navigate between changes

See [Tabs & Navigation](./tabs-and-navigation.md) for more on tab grouping.

## Notebook Editor

For `.note.json` files — a structured notes interface:

- **Categories** and **tags** for organizing notes
- Each note has its own code editor (Monaco, Grid, Markdown, SVG)
- **Full-text search** with highlighting across all content
- **Drag-and-drop** to reorganize categories
- **Expand** notes to full editor size
- **Run JavaScript** from individual notes
- Optional **comments** on each note

See **[Notebook Editor](./notebook.md)** for detailed documentation.

## Switching Editors

Some files support multiple editors:

| File Type | Available Editors |
|-----------|-------------------|
| `.json` | Text, Grid |
| `.note.json` | Text, Notebook |
| `.csv` | Text, Grid |
| `.md` | Text, Preview |
| `.svg` | Text, Preview |
| `.html` | Text, Preview |
| `.mmd` | Text, Mermaid |
| `.pdf` | PDF only |
| Images | Image Viewer only |
| Other | Text only |

Use the buttons in the toolbar to switch between available editors.

**Quick Add:** Click the dropdown arrow (&#9662;) next to the **+** button in the tab bar to create a new page with a specific editor: Script (JS), Grid (JSON), Grid (CSV), or Notebook.
