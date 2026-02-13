[← Home](./index.md)

# Editors

js-notepad includes multiple editors for different file types.

## Text Editor (Default)

The default Monaco-based text editor with:
- Syntax highlighting for 50+ languages
- IntelliSense and auto-completion
- Find and replace
- Multi-cursor editing
- Code folding

## JSON Grid View

For `.json` files, switch to Grid view for tabular data:

1. Open a JSON file with array of objects
2. Click "Grid" in the toolbar (or use the editor switch)
3. View data in a sortable, filterable grid

**Features:**
- Click column headers to sort
- Filter data with the filter row
- Copy/paste to Excel
- Edit cells directly

**Supported JSON format:**
```json
[
  { "name": "Alice", "age": 30 },
  { "name": "Bob", "age": 25 }
]
```

## CSV Grid View

For `.csv` files:

1. Open a CSV file
2. Click "Grid" in the toolbar
3. View and edit as a spreadsheet

**Features:**
- Auto-detects delimiter (comma, semicolon, tab)
- Header row detection
- Same grid features as JSON

## Markdown Preview

For `.md` files:

1. Open a Markdown file
2. Click "Preview" in the toolbar
3. See rendered Markdown

**Features:**
- GitHub-flavored Markdown
- Syntax highlighting in code blocks using Monaco's colorize API (supports all Monaco languages including aliases like `ts`, `js`, `py`, `bash`)
- Copy-to-clipboard button on code block hover
- Inline Mermaid diagram rendering — ` ```mermaid ` code blocks render as SVG diagrams
- Live preview updates
- Minimap navigation

## PDF Viewer

For `.pdf` files:

1. Open a PDF file
2. Automatically opens in PDF viewer

**Features:**
- Page navigation
- Zoom controls
- Search within PDF
- Read-only view

## Image Viewer

For image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`):

1. Open an image file
2. Automatically opens in Image Viewer

**Features:**
- Zoom in/out with mouse wheel or toolbar buttons
- Pan image by dragging when zoomed in
- Fit to window (default view)
- Click zoom percentage to reset zoom

## SVG Preview

For `.svg` files:

1. Open an SVG file (opens in text editor by default)
2. Click "Preview" in the toolbar to see rendered SVG

**Features:**
- Same zoom/pan controls as Image Viewer
- Shows live preview of unsaved changes
- Switch between text editor and preview anytime

## Mermaid Diagram Viewer

For `.mmd` and `.mermaid` files:

1. Open a Mermaid file (opens in text editor with syntax highlighting)
2. Click "Mermaid" in the toolbar to see the rendered diagram

**Features:**
- Supports all Mermaid diagram types (flowchart, sequence, class, state, ER, Gantt, pie, git graph)
- Same zoom/pan controls as Image Viewer
- Light/dark theme toggle (dark by default, light for copying into documents)
- Copy diagram to clipboard as image
- Live preview of unsaved changes
- Debounced re-rendering for smooth editing

## Compare Mode

Compare two files side-by-side:

1. Open two files
2. Drag one tab next to another to group them
3. Click the Compare button in the toolbar

**Features:**
- Side-by-side diff view
- Inline diff highlighting
- Navigate between changes

## Notebook Editor

For `.note.json` files — a structured notes interface:

1. Create a file with the `.note.json` extension
2. Click "Add Note" to create your first note

**Features:**
- Categories and tags for organizing notes
- Each note has its own code editor (Monaco, Grid, Markdown, SVG)
- Full-text search with highlighting across all content
- Drag-and-drop to reorganize categories
- Expand notes to full editor size
- Run JavaScript from individual notes
- Optional comments on each note

See [Notebook Editor](./notebook.md) for detailed documentation.

## Switching Editors

Some files support multiple editors:

| File Type | Available Editors |
|-----------|-------------------|
| `.json` | Text, Grid |
| `.note.json` | Text, Notebook |
| `.csv` | Text, Grid |
| `.md` | Text, Preview |
| `.svg` | Text, Preview |
| `.mmd` | Text, Mermaid |
| `.pdf` | PDF only |
| Images | Image Viewer only |
| Other | Text only |

Use the buttons in the toolbar to switch between available editors.
