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
- Syntax highlighting in code blocks
- Live preview updates

## PDF Viewer

For `.pdf` files:

1. Open a PDF file
2. Automatically opens in PDF viewer

**Features:**
- Page navigation
- Zoom controls
- Search within PDF
- Read-only view

## Compare Mode

Compare two files side-by-side:

1. Open two files
2. Drag one tab next to another to group them
3. Click the Compare button in the toolbar

**Features:**
- Side-by-side diff view
- Inline diff highlighting
- Navigate between changes

## Switching Editors

Some files support multiple editors:

| File Type | Available Editors |
|-----------|-------------------|
| `.json` | Text, Grid |
| `.csv` | Text, Grid |
| `.md` | Text, Preview |
| `.pdf` | PDF only |
| Other | Text only |

Use the buttons in the toolbar to switch between available editors.
