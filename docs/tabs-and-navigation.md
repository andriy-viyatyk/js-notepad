[← Home](./index.md)

# Tabs & Navigation

## Tab Management

Each open file appears as a tab in the tab bar. Tabs show the file name, a language icon, and an unsaved-changes indicator (dot).

### Creating Tabs

| Action | How |
|--------|-----|
| New empty tab | `Ctrl+N` or click the **+** button |
| New with specific editor | Click the dropdown arrow (&#9662;) next to **+** — choose Script (JS), Grid (JSON), Grid (CSV), or Notebook |
| Open a file | `Ctrl+O`, or drag a file onto the window |

### Closing Tabs

| Action | How |
|--------|-----|
| Close current tab | `Ctrl+W` or `Ctrl+F4` |
| Close via tab | Click the **X** on the tab |
| Close other tabs | Right-click tab → **Close Other Tabs** |
| Close tabs to the right | Right-click tab → **Close Tabs to the Right** |

If a file has unsaved changes, you'll be prompted to save before closing.

### Switching Tabs

| Shortcut | Action |
|----------|--------|
| `Ctrl+Tab` | Switch to next tab |
| `Ctrl+Shift+Tab` | Switch to previous tab |
| Click a tab | Switch to that tab |

### Moving Tabs

- **Reorder** — drag and drop tabs within the tab bar to rearrange them
- **Detach to new window** — drag a tab outside the window and drop it to open it in a separate window
- **Move between windows** — drag a tab from one js-notepad window and drop it into another window's tab bar
- **Open in New Window** — right-click a tab and select "Open in New Window"

### Tab Context Menu

Right-click any tab to access these options:

| Action | Description |
|--------|-------------|
| Close Tab | Close this tab |
| Close Other Tabs | Close all tabs except this one |
| Close Tabs to the Right | Close all tabs after this one |
| Open in New Window | Move this tab to a new window |
| Duplicate Tab | Create a copy of this tab |
| Save | Save the file |
| Save As... | Save with a new name |
| Rename | Rename the file/tab |
| Show in File Explorer | Open the file's folder in Windows Explorer |
| Copy File Path | Copy the full file path to clipboard |
| Encrypt / Change Password | Encrypt the file or change its password (see [Encryption](./encryption.md)) |
| Decrypt | Decrypt an encrypted file |
| Make Unencrypted | Remove encryption from a file |

## Tab Grouping (Side-by-Side View)

You can display two files side-by-side by grouping their tabs.

### Creating a Group

- Hold **Ctrl** and **click** on a tab to group it with the currently active tab
- Both files appear side-by-side in the editor area

### Ungrouping

- Click the **close** button on either grouped tab's indicator to ungroup them
- The tabs return to normal individual view

### Compare Mode

When two text files are grouped, a **Compare** button appears in the toolbar. Click it to enter diff view:

- Side-by-side comparison using Monaco's diff editor
- Additions, deletions, and modifications are highlighted
- Navigate between changes

## Sidebar

Click the **js-notepad icon** (top-left) to open the sidebar menu. The sidebar has a two-panel layout:

### Left Panel — Folder List

The left side shows your folder shortcuts:

- **Open Tabs** — Lists all open pages in the current window and other open windows
- **Recent Files** — Recently opened files
- **Custom Folders** — Your bookmarked filesystem folders

Click a folder in the left panel to see its contents in the right panel.

**Managing Custom Folders:**
- Right-click in the left panel to add or remove folder shortcuts
- Folders provide quick access to frequently used directories

### Right Panel — Contents

The right panel shows the contents of the selected folder:

**Open Tabs view:**
- Lists all open tabs in the current window
- Shows tabs from other open js-notepad windows (grouped by window)
- Click any entry to switch to that tab

**Recent Files view:**
- Shows recently opened files
- Right-click for options: Open, Open in New Window, Show in File Explorer, Remove from Recent

**Custom Folder view (File Explorer):**
- Browse files and folders
- Click a file to open it
- Right-click for options: Create File, Create Folder, Rename, Delete
- Search files with `Ctrl+F` when the file explorer is active

### Sidebar Header Buttons

| Button | Action |
|--------|--------|
| Open File | Opens file dialog (`Ctrl+O`) |
| New Window | Opens a new js-notepad window (`Ctrl+Shift+N`) |
| About | Opens the About page (version info, update check) |
| Settings | Opens the Settings page (themes, preferences) |

### Closing the Sidebar

Click anywhere outside the sidebar, or press **Escape** to close it.

## Document Navigation Panel

For markdown and documentation files, the **Navigation** button in the toolbar opens a document navigation panel:

- **Link tree** — Scans the current markdown file for links to other `.md` files, then recursively builds a folder/file tree
- **In-place navigation** — Click any file to load it in the same tab (no new tabs created)
- **Auto-preview** — Navigated files switch to preview mode automatically (Markdown preview, SVG view, etc.)
- **All file types** — Works with PDF, images, and other file types linked from markdown
- **Resizable** — Drag the panel border to resize
- **Context menu** — Right-click items for: Open in New Tab, Show in File Explorer, Copy File Path
- **Refresh** — Click the refresh button to rebuild the tree

## Session Restore

js-notepad automatically saves your session when you close the application. On next launch:

- All previously open tabs are restored
- Editor content, scroll positions, and state are preserved
- Unsaved changes are recovered
- Grid filters, sorting, and search state are restored

## File Watching

When a file that is open in js-notepad is modified by another application:

- The editor detects the change automatically
- If you haven't made local edits, the content refreshes silently
- The file status updates in real time (including deletion detection)
