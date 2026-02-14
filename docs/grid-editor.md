[← Editors](./editors.md)

# Grid Editor

The Grid Editor provides a spreadsheet-like interface for viewing and editing structured data stored in JSON or CSV formats.

## How to Open

- **JSON files**: Open a `.json` file containing an array of objects, then click **Grid** in the toolbar
- **CSV files**: Open a `.csv` file, then click **Grid** in the toolbar
- **Auto-open**: Files with `.grid.json` or `.grid.csv` extensions open directly in Grid view
- **Quick Add**: Click the dropdown arrow (&#9662;) next to the **+** button and select **Grid (JSON)** or **Grid (CSV)**

## Key Features

### Intelligent Data Handling

When you open a JSON file, the editor analyzes the objects in the JSON array to automatically detect the data type of each property (string, number, or boolean). It then creates a column for each property with the corresponding type.

### Data Validation

The editor enforces data types. When you edit a cell or paste data, it validates the input. For number and boolean columns, only valid values are accepted. Invalid inputs clear the cell value.

### Search

Use the **Search** field in the toolbar to highlight matching text across all cells. Clear the search with the **X** button.

### Filtering

Click the filter icon on any column header to open filter options:

- **Text/Number columns**: Type a filter value to show only matching rows
- **Options filter**: Select from a list of unique values in the column
- Filters combine — applying filters on multiple columns shows rows matching all conditions
- The filter bar above the grid shows active filters

### Sorting

Click a column header to sort by that column. Click again to toggle between ascending and descending. Sorting is indicated by an arrow icon in the header.

### Column Management

Use the **Columns** button (&#9776;) in the toolbar to manage columns:

- Show/hide columns
- Reorder columns
- Resize columns by dragging column header borders

### CSV Options

For CSV files, click the **&#9874;-csv** button in the toolbar to configure:

- **Delimiter**: Comma, semicolon, tab, or custom character
- **Header row**: Whether the first row contains column names

### Records Count

The status bar at the bottom shows the total number of records, or the visible/total count when filters are active.

## Editing Cells

### Text and Number Cells

- **Double-click** a cell, or press **Enter** / **F2** to enter edit mode
- **Type any character** to enter edit mode and replace the cell content
- Press **Enter** to confirm and exit edit mode
- Press **Escape** to discard changes and exit edit mode

### Boolean Cells

Boolean cells display a check icon for `true` and blank for `false`. They do not enter a separate edit mode:

- **Hover** over a boolean cell to see a checkbox — click it to toggle the value
- **Space**: Toggles each selected boolean cell (`true` becomes `false` and vice versa)
- **Enter**: Toggles the focused cell and applies that result to all selected boolean cells

## Keyboard Shortcuts

### Navigation

| Shortcut | Action |
|----------|--------|
| `Arrow Keys` | Move focus one cell up, down, left, or right |
| `Ctrl+Left` / `Ctrl+Right` | Jump to first or last column |
| `Ctrl+Up` / `Ctrl+Down` | Jump up or down by one page (visible rows) |
| `Page Up` / `Page Down` | Move focus up or down by one page |
| `Home` / `End` | Move focus to first or last row |
| `Ctrl+Home` | Move focus to the top-left cell |
| `Ctrl+End` | Move focus to the bottom-right cell |
| `Tab` | Move to next cell; wraps to next row |
| `Shift+Tab` | Move to previous cell; wraps to previous row |

All navigation keys (except Tab) support **Shift** to extend the selection.

### Selection

| Shortcut | Action |
|----------|--------|
| `Shift+Arrow Keys` | Extend selection in that direction |
| `Shift+Click` | Select range from focused cell to clicked cell |
| `Ctrl+A` | Select all cells |

### Editing

| Shortcut | Action |
|----------|--------|
| `Enter` / `F2` | Enter edit mode (or confirm and exit if already editing) |
| `Escape` | Exit edit mode, discard changes |
| `Delete` | Clear content of selected cells |
| `Space` | Toggle boolean cells in selection |
| Type any character | Enter edit mode with that character |

### Rows

| Shortcut | Action |
|----------|--------|
| `Ctrl+Insert` | Insert row(s) before the current position |
| `Ctrl+Delete` | Delete selected row(s) |
| `Arrow Down` on last row | Automatically add a new row (when editing is enabled) |

### Columns

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Insert` | Insert column(s) before the first selected column |
| `Ctrl+Shift+Delete` | Delete selected column(s) |
| `Ctrl+Right` on last column | Add a new column at the end |

### Copy and Paste

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Copy selected cells |
| `Ctrl+Shift+C` | Copy selected cells with column headers |
| `Ctrl+V` | Paste clipboard content |

## Copy and Paste

The copy and paste system is designed for seamless data transfer, both within the editor and to external applications like spreadsheets.

### Copy (`Ctrl+C`)

The data copied to the clipboard depends on your selection:

- **Single cell**: The raw value of the selected cell is copied
- **Range selection**: The entire range is copied in tab-delimited CSV format, compatible with Excel and other spreadsheet applications

### Copy with Headers (`Ctrl+Shift+C`)

Same as Copy, but the column names are included as the first row.

### Copy As (Context Menu)

Right-click to access additional copy formats:

- **With Headers** — Tab-delimited with column header row
- **JSON** — Copies selection as a JSON array of objects
- **Formatted (HTML Table)** — Copies as an HTML table for pasting into rich text editors

### Paste (`Ctrl+V`)

When you paste, the editor parses the clipboard content as tab-delimited data. The behavior depends on your selection:

- **Single cell selected**: The paste area adjusts to match the pasted data size. Columns extend up to the last grid column (extras are ignored). New rows are added at the bottom if needed.
- **Range selected**: Pasted data fills the selected range. If the pasted data is larger, extras are ignored. If smaller, the data **tiles** to fill the selection — paste a single value into a range to fill every cell with that value.

## Context Menu

Right-click on cells to access the context menu:

| Action | Shortcut | Description |
|--------|----------|-------------|
| Copy | `Ctrl+C` | Copy selected cells |
| Copy as... | | Submenu: With Headers, JSON, HTML Table |
| Paste | `Ctrl+V` | Paste from clipboard |
| Insert N row(s) | `Ctrl+Insert` | Insert rows before selection |
| Add N row(s) | `Arrow Down` on last | Append rows at end |
| Delete N row(s) | `Ctrl+Delete` | Delete selected rows |
| Insert N column(s) | `Ctrl+Shift+Insert` | Insert columns before selection |
| Add N column(s) | `Ctrl+Right` on last | Append columns at end |
| Delete N column(s) | `Ctrl+Shift+Delete` | Delete selected columns |

Right-click on a **column header** for column-specific actions:

| Action | Description |
|--------|-------------|
| Insert column | Insert one column before this column |
| Delete column | Delete this column |

Row insert and delete are disabled when sorting or filtering is active.

## Supported JSON Format

The grid expects a JSON array of objects:

```json
[
  { "name": "Alice", "age": 30, "active": true },
  { "name": "Bob", "age": 25, "active": false }
]
```

Each unique property becomes a column. Data types are auto-detected from values.

## Tips

- **Excel workflow**: Copy a range from Excel, paste into the grid with `Ctrl+V` — tab-delimited format is automatically handled
- **Bulk fill**: Copy a single value, select a range of cells, paste — the value fills every cell in the range
- **Quick add row**: Navigate past the last row with `Arrow Down` to auto-create a new row
- **Quick add column**: Press `Ctrl+Right` when at the last column to add a new column
- **Column headers in copy**: Use `Ctrl+Shift+C` when you need column names in the copied data
