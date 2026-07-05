[← Home](./index.md)

# Keyboard Shortcuts

## Application (Global)

These shortcuts work regardless of which editor is active.

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New tab |
| `Ctrl+Shift+N` | New window |
| `Ctrl+O` | Open — paste file path, URL, or cURL command |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+W` | Close tab |
| `Ctrl+F4` | Close tab (alternative) |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom |
| `Ctrl+Mouse Wheel` | Zoom in/out |
| `Ctrl+Alt+]` | Next theme |
| `Ctrl+Alt+[` | Previous theme |
| `F5` | Run script (JavaScript or TypeScript) |
| `Ctrl+V` | Paste clipboard image into a new viewer tab — bitmap images (screenshots, Snipping Tool) open in the **Image Viewer**; HTML-only images (PowerPoint / Office copies) open in the **HTML viewer**. Has no effect when a text editor or input has focus (those paste normally). |

## Text Editor (Monaco)

### Editing

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+X` | Cut line (or selection) |
| `Ctrl+C` | Copy line (or selection) |
| `Ctrl+V` | Paste |
| `Ctrl+Shift+V` | Paste as Markdown / HTML (Markdown and HTML files only) |
| `Ctrl+A` | Select all |
| `Ctrl+Y` | Delete line |
| `Ctrl+D` | Select next occurrence |
| `Ctrl+/` | Toggle comment |

### Find & Replace

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Find |
| `Ctrl+H` | Replace |
| `F3` | Find next |
| `Shift+F3` | Find previous |

### Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl+G` | Go to line |
| `Alt+Left` | Go back |
| `Alt+Right` | Go forward |
| `F12` | Go to definition |
| `Alt+F12` | Peek definition |

### Multi-Cursor & Selection

| Shortcut | Action |
|----------|--------|
| `Alt+Click` | Add cursor at click position |
| `Ctrl+Alt+Up` | Add cursor above |
| `Ctrl+Alt+Down` | Add cursor below |
| `Ctrl+D` | Add selection to next find match |
| `Ctrl+Shift+L` | Select all occurrences |
| `Shift+Alt+Up/Down/Left/Right` | Column (box) selection |

### Code

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Space` | Trigger suggestions |

## Grid Editor

For complete grid documentation, see [Grid Editor](./grid-editor.md).

### Navigation

| Shortcut | Action |
|----------|--------|
| `Arrow Keys` | Move focus one cell |
| `Ctrl+Left/Right` | Jump to first/last column |
| `Ctrl+Up/Down` | Jump by one page |
| `Page Up/Down` | Move focus by one page |
| `Home/End` | Jump to first/last row |
| `Ctrl+Home` | Jump to top-left cell |
| `Ctrl+End` | Jump to bottom-right cell |
| `Tab` | Next cell (wraps to next row) |
| `Shift+Tab` | Previous cell (wraps to previous row) |

All navigation keys (except Tab) support **Shift** to extend selection.

### Editing

| Shortcut | Action |
|----------|--------|
| `Enter` / `F2` | Enter/exit cell edit mode |
| `Escape` | Cancel edit, discard changes |
| `Delete` | Clear selected cells |
| `Space` | Toggle boolean cells |
| `Ctrl+A` | Select all cells |

### Rows & Columns

| Shortcut | Action |
|----------|--------|
| `Ctrl+Insert` | Insert row(s) before selection |
| `Ctrl+Delete` | Delete selected row(s) |
| `Ctrl+Shift+Insert` | Insert column(s) before selection |
| `Ctrl+Shift+Delete` | Delete selected column(s) |

### Copy & Paste

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Copy selection |
| `Ctrl+Shift+C` | Copy with column headers |
| `Ctrl+V` | Paste |

## Image / SVG / Mermaid Viewers

| Shortcut | Action |
|----------|--------|
| `Mouse Wheel` | Zoom in/out |
| `Ctrl+C` | Copy image to clipboard (as PNG) |
| Drag | Pan when zoomed in |

## Browser

| Shortcut | Action |
|----------|--------|
| `Ctrl+L` | Focus URL bar |
| `Ctrl+F` | Find in page (open search bar) |
| `F3` | Next match (when find bar is open) |
| `Shift+F3` | Previous match (when find bar is open) |
| `Enter` | Navigate to URL (URL bar) / Next match (find bar) |
| `F5` | Reload page |
| `Ctrl+F5` | Hard reload (bypass cache) |
| `Ctrl+R` | Reload page |
| `Ctrl+Shift+R` | Hard reload (bypass cache) |
| `F12` | Open DevTools |
| `Alt+Left` | Go back |
| `Alt+Right` | Go forward |
| `Alt+Home` | Go to tab's home page |
| `Escape` | Close find bar / stop loading / revert URL bar |

## Notebook Editor

| Shortcut | Action |
|----------|--------|
| `Escape` | Collapse expanded note / cancel editing |

## File Explorer Panel

### Navigation

| Shortcut | Action |
|----------|--------|
| `Arrow Up/Down` | Move the selection cursor |
| `Home` / `End` | Jump to the first/last row |
| `Page Up` / `Page Down` | Move the cursor by one page |
| `Enter` | Open the selected row |
| `Arrow Right` / `Arrow Left` | Expand / collapse the selected folder |
| `Ctrl+F` | Search files by name |
| `Escape` | Close search / name filter |

### File Operations

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Copy the selected file/folder to the Windows clipboard |
| `Ctrl+X` | Cut the selected file/folder to the Windows clipboard (not on the tree's root) |
| `Ctrl+V` | Paste from the Windows clipboard into the selected folder (or the selected file's parent, or the root) |
| `Delete` | Delete the selected file/folder (shows the confirmation dialog) |
| `F2` | Rename the selected file/folder |

These file-operation shortcuts are disabled while typing in the panel's search box, and Ctrl+C/X/V require a real file-system folder (not archive, Mneme, or link panels).

## Sidebar

| Shortcut | Action |
|----------|--------|
| `Escape` | Close sidebar |
| `Ctrl+F` | Search in file explorer |

## Encryption Panel

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit password |
| `Escape` | Cancel and close panel |

## Custom Shortcuts

Currently, keyboard shortcuts cannot be customized. This feature is planned for a future release.
