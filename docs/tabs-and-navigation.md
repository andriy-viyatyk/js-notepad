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

### Pinning Tabs

Pin tabs to keep them compact and always visible at the left side of the tab bar.

- **Pin a tab** — right-click a tab → **Pin Tab**
- **Unpin a tab** — right-click a pinned tab → **Unpin Tab**

**Pinned tab behavior:**

- Displayed as compact icon-only tabs (no title text) at the left of the tab bar
- Stay fixed in place when scrolling through other tabs
- Cannot be closed or dragged to another window
- Can be grouped with other tabs for side-by-side view (including script output)
- Can be reordered among other pinned tabs by dragging
- Show language icon, encryption icon (if applicable), and modification indicator
- Content can be replaced via the File Explorer panel (in-tab navigation)
- Pinned state is preserved across app restarts
- A window with pinned tabs is preserved on close (can be reopened from "Open Tabs" in sidebar)

### Tab Context Menu

Right-click any tab to access these options:

| Action | Description |
|--------|-------------|
| Close Tab | Close this tab (not available for pinned tabs) |
| Close Other Tabs | Close all tabs except this one (skips pinned tabs) |
| Close Tabs to the Right | Close all tabs after this one (skips pinned tabs; not available for pinned tabs) |
| Open in New Window | Move this tab to a new window (not available for pinned tabs) |
| Duplicate Tab | Create a copy of this tab grouped side-by-side |
| Pin Tab / Unpin Tab | Pin or unpin the tab |
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

**Open Folder in New Tab:**
- When a custom folder is selected, click the chevron (▶) icon to open a new tab with the File Explorer panel showing that folder's contents
- This gives you a full-width file browser alongside an editor, without keeping the sidebar open

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

## File Explorer Panel

Any saved file can open a **File Explorer** panel alongside the editor. Click the File Explorer button in the toolbar to toggle it.

- **Tree-based browser** — Shows all files and folders in the same directory as the current file
- **In-place navigation** — Click any file to load it in the same tab (no new tabs created)
- **Auto-preview** — Navigated files switch to preview mode automatically (Markdown preview, SVG view, etc.)
- **All editor types** — Available for text files, markdown, images, PDFs, and more
- **Navigate up** — Click the up arrow button in the panel header to move the root to the parent folder
- **Make root** — Right-click any folder and choose "Make Root" to focus the tree on that folder, or double-click a folder to do the same
- **Collapse all** — Click the collapse button in the panel header to collapse all expanded folders at once
- **File operations** — Right-click for: create files/folders, rename, delete, copy path, show in explorer, open in new tab
- **Search files by name** — Press Ctrl+F within the panel to search files by name
- **Search in files** — Press Ctrl+Shift+F to search file contents across the entire folder tree
  - Results appear in a split panel below the file tree, grouped by file with matched lines
  - Matched text is highlighted in results; clicking a result opens the file at that line in Monaco editor
  - The file tree filters to show only files with matches while a search is active
  - Include/exclude glob patterns for fine-grained control (toggle with the filter button)
  - Search text is highlighted in the Monaco editor when navigating results
  - While the search panel is open, clicking files in the tree activates Monaco editor instead of preview mode
  - Configurable file extensions in Settings → File Search
- **Lazy loading** — Folders load their contents on expand, keeping large directories fast
- **Resizable** — Drag the panel border to resize
- **Persistent state** — Expanded folders, panel width, and scroll position survive app restarts and in-tab navigation

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
