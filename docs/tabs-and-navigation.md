[← Home](./index.md)

# Tabs & Navigation

## Tab Management

Each open file appears as a tab in the tab bar. Tabs show the file name, a language icon, and an unsaved-changes indicator (dot).

### Creating Tabs

| Action | How |
|--------|-----|
| New empty tab | `Ctrl+N` or click the **+** button |
| New with specific editor | Click the dropdown arrow (&#9662;) next to **+** — shows your pinned editors plus "Show All..." to open the Tools & Editors hub page |
| Open a file | `Ctrl+O`, or drag a single file onto the window |
| Open multiple files or a folder | Drag multiple files or a folder onto the window — opens a link collection page listing all files. Click any file to view it in the main area. Subfolders become link categories. |

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
- **Move between windows** — drag a tab from one persephone window and drop it into another window's tab bar
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
- **File path tooltip** — hover over a pinned tab to see the full file path (1.5s delay)
- Content can be replaced via the File Explorer panel (in-tab navigation)
- Pinned state is preserved across app restarts
- A window with pinned tabs is preserved on close (can be reopened from "Open Tabs" in sidebar)

### Tab Context Menu

Right-click any tab to open its context menu. The menu is split into two groups: **tab-level items** that are always present, and **editor-specific items** that depend on what the tab contains.

**Tab-level items (always shown):**

| Action | Description |
|--------|-------------|
| Close Tab | Close this tab (not available for pinned tabs) |
| Close Other Tabs | Close all tabs except this one (skips pinned tabs) |
| Close Tabs to the Right | Close all tabs after this one (skips pinned tabs; not available for pinned tabs) |
| Open in New Window | Move this tab to a new window (not available for pinned tabs) |
| Duplicate Tab | Create a copy of this tab grouped side-by-side |
| Pin Tab / Unpin Tab | Pin or unpin the tab |

**Editor-specific items:**

Each editor contributes only the actions that are relevant to it. Editors with no specific actions (e.g. MCP Inspector) show only the tab-level items — no greyed-out entries.

*Text editor tabs:*

| Action | Description |
|--------|-------------|
| Save | Save the file |
| Save As... | Save with a new name |
| Rename | Rename the file/tab |
| Show in File Explorer | Open the file's folder in Windows Explorer |
| Copy File Path | Copy the full file path to clipboard |
| Encrypt / Change Password | Encrypt the file or change its password (see [Encryption](./encryption.md)) |
| Decrypt | Decrypt an encrypted file |
| Make Unencrypted | Remove encryption from a file |

*Git Tree tabs:*

| Action | Description |
|--------|-------------|
| Open Git Root Folder | Reveal the repository root folder in Windows Explorer |
| Copy Remote URL | Copy the configured remote URL (origin preferred) to the clipboard |

*PDF, Image, and Archive tabs:*

| Action | Description |
|--------|-------------|
| Show in File Explorer | Open the source file's folder in Windows Explorer |
| Copy File Path | Copy the source file's full path to clipboard |

*HTML file tabs (`.html`, `.htm`, `.xhtml`):*

| Action | Description |
|--------|-------------|
| Open in Browser | Open the local HTML file in Persephone's built-in browser |
| Show in File Explorer | Open the file's folder in Windows Explorer |
| Copy File Path | Copy the full file path to clipboard |

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

Click the **persephone icon** (top-left) to open the sidebar menu. The sidebar has a two-panel layout:

### Left Panel — Folder List

The left side shows your folder shortcuts:

- **Open Tabs** — Lists all open pages in the current window and other open windows
- **Recent Files** — Recently opened files
- **Tools & Editors** — All creatable editors and tools (see below)
- **Script Library** — A dedicated folder for your reusable scripts (see below)
- **Custom Folders** — Your bookmarked filesystem folders

Click a folder in the left panel to see its contents in the right panel.

**Open Folder in New Tab:**
- When a custom folder is selected, click the chevron (▶) icon, double-click the folder, or right-click it and choose **Open in New Tab** to open a new tab with the File Explorer panel showing that folder's contents
- This gives you a full-width file browser alongside an editor, without keeping the sidebar open

**Managing Custom Folders:**
- Click the **Add Folder** button at the bottom of the left panel to pick a folder and add it as a shortcut
- Right-click in the left panel for the same **Add Folder** option, plus **Open in New Tab**, **Show in File Explorer**, **Open Terminal here** (Windows only — see [Open Terminal here](#open-terminal-here)), and **Remove Folder** on an existing shortcut
- Folders provide quick access to frequently used directories

### Right Panel — Contents

The right panel shows the contents of the selected folder:

**Open Tabs view:**
- Lists all open tabs in the current window
- Shows tabs from other open persephone windows (grouped by window)
- Click any entry to switch to that tab

**Recent Files view:**
- Shows recently opened files
- Right-click for options: Open, Open in New Window, Show in File Explorer, Remove from Recent

**Custom Folder view (File Explorer):**
- Browse files and folders in a tree view
- Click a file to open it
- Right-click for options: Create File, Create Folder, Rename, Delete, Cut, Copy, Paste
- Right-click a folder for **Open Terminal here** (Windows only — see [Open Terminal here](#open-terminal-here))
- Search files by name with `Ctrl+F` when the file explorer is active
- **Drag a file out to the OS** — drag a file from the tree onto Windows Explorer or into a Microsoft Teams chat to copy/attach it there. No modifier key needed. Dragging it into another folder in the tree instead asks whether to **Move** or **Copy** it there. Currently one file at a time.
- **Drop files from Windows Explorer** — drag a file or folder from Windows Explorer (or another app) and drop it onto a folder in the tree; a **Move / Copy / Cancel** dialog asks which you want (folders are handled recursively), and dropping onto an existing name asks for confirmation before overwriting.

### Sidebar Header Buttons

| Button | Action |
|--------|--------|
| Open File | Opens file dialog (`Ctrl+O`) |
| New Window | Opens a new persephone window (`Ctrl+Shift+N`) |
| About | Opens the About page (version info, update check) |
| Settings | Opens the Settings page (themes, preferences) |

### Tools & Editors

The **Tools & Editors** entry appears between Recent Files and Script Library. It opens as a slide-out panel with a **Pinned** rail at the top and a row of tabs below it:

- **Pinned** — Your favorite editors and boards, shown at the top. Drag to reorder. These are also the items that appear in the **+** dropdown menu in the tab bar.
- **Built-in Editors** — Every standard editor/tool, sorted alphabetically. Click the pin button to add an item to your pinned list.
- **Boards** — All trusted [boards](./boards.md) across every location, grouped by folder.
- **Tools** — All registered [Agent Tools](./agent-tools.md) toolsets.

Click any item to create a new page (or open the board/toolset) with that editor. Pinned editors are saved in settings (`pinned-editors`) and persist across restarts. The default pinned set (for new installations) is: **Open Folder**, Script (JS), Script (TS), Drawing, Grid (JSON), Grid (CSV), Browser.

**Open in new tab** — A button in the panel header opens the same content as a full page instead of a slide-out panel — handy when you want more room, or want to keep browsing while doing something else in the app. The full-page **Tools & Editors hub** has the same **Pinned** rail plus four tabs: **Built-in**, **Registered boards**, **Search boards**, and **Tools**. **Search boards** is hub-only — it browses the catalog of boards published by the project and lets you install one directly, without needing a matching file open. See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update).

**Open Folder** — The first entry in the default pinned set. Clicking it shows a native Select Folder dialog; once you pick a folder, a new tab opens with the File Explorer panel rooted at that folder. This is identical to right-clicking a folder in the Explorer sidebar and choosing **"Open in New Tab"**. Existing users can pin it from the **Built-in Editors** tab.

Items include all standard editors (Script, Grid, Notebook, Todo, Links, Drawing, Force Graph, Browser, Video Player) as well as MCP Inspector and individual browser profiles (Incognito and named profiles).

### Script Library

The **Script Library** entry appears below Recent Files and provides quick access to a folder of reusable scripts.

- **First time:** Click "Script Library" to see a placeholder with a **Select Folder** button. A setup dialog opens where you pick a folder and optionally copy bundled example scripts into it.
- **After linking:** The right panel shows a File Explorer rooted at your library folder. Click any script to open it.
- **Open in New Tab:** Double-click the "Script Library" entry (or click its icon when selected) to open the library in a full File Explorer tab — same behavior as custom linked folders.
- **Context menu:** Right-click the "Script Library" entry for **Change Library Folder**, **Open in Explorer**, or **Unlink Library**.
- **Settings:** You can also configure the library path in **Settings → Script Library** (browse, change, or unlink).

### Closing the Sidebar

Click anywhere outside the sidebar, or press **Escape** to close it.

## Page Sidebar Panels

The page sidebar is shared across editors. Different editors contribute their own collapsible panels:

- **File Explorer** — Available for any saved file. Shows files and folders alongside the editor.
- **Archive** — Appears when a file inside a ZIP-based archive is open. Shows the archive's file tree.
- **Link Editor panels** — When a `.link.json` file is open, the sidebar is always open and shows **Collections**, **Tags**, and **Hostnames** panels for filtering links. The sidebar cannot be closed while a link file is open. Click a panel header to expand it; click an item to filter the link list. The breadcrumb in the Link Editor toolbar shows the current filter path. A File Explorer panel is also added automatically for the link file's folder.
- **Links panel** — When a standalone link collection page is open (created by multi-file drop, `app.pages.openLinks()`, or "Show Resources"), a **Collections** panel appears in the sidebar. Click a link to navigate the page's main area to that file or URL. Hover a non-directory link to see a rich tooltip with title, URL, and image preview. Right-click a non-directory link for an **Edit Link** context menu.
- **Notebook panels** — When a `.note.json` file is open, the sidebar shows **Categories** and **Tags** panels.
- **Todo panel** — When a `.todo.json` file is open, the sidebar shows a **Todo** panel containing the list selector and tag filter.
- **Rest Client panel** — When a `.rest.json` file is open, the sidebar shows a **Rest** panel containing the request collection tree.

## File Explorer Panel

Any saved file can open a **File Explorer** panel alongside the editor. Click the File Explorer button in the toolbar to toggle it.

- **Tree-based browser** — Shows all files and folders in the same directory as the current file
- **In-place navigation** — Click any file to load it in the same tab (no new tabs created)
- **Auto-preview** — Navigated files switch to preview mode automatically (Markdown preview, SVG view, etc.)
- **All editor types** — Available for text files, markdown, images, PDFs, and more
- **Navigate up** — Click the up arrow button in the panel header to move the root to the parent folder
- **Make root** — Right-click any folder and choose "Make Root" to focus the tree on that folder, or double-click a folder to do the same
- **Collapse all** — Click the collapse button in the panel header to collapse all expanded folders at once
- **Selection** — Clicking a file or folder selects it and highlights the row; unlike before, selecting a folder keeps it highlighted even after its folder view opens in the main area, and right-clicking a row selects it before the context menu opens (same as Windows Explorer). Opening a file another way — switching tabs, opening it from Recent — also highlights and reveals it in the tree.
- **Chevron-only expand/collapse** — Clicking a folder's label only selects it; it no longer expands or collapses the folder. Use the chevron arrow (or `ArrowRight`/`ArrowLeft` on the keyboard) to expand or collapse.
- **Keyboard navigation** — Once the tree has focus (click a row, or Tab into it), arrow keys move the selection cursor, `Home`/`End` jump to the first/last row, `Page Up`/`Page Down` move by a page, `Enter` opens the highlighted row, and `ArrowRight`/`ArrowLeft` expand/collapse a folder. When the tree has keyboard focus, the selected row shows an accent highlight with a focus outline around the cursor row; move focus elsewhere (for example, into the editor) and the selection falls back to a plain highlight, but stays visible.
- **File operations** — Right-click files for: create files/folders, rename, delete, copy path, show in explorer, open in new tab. `F2` renames the selected row and `Delete` deletes it (with the usual confirmation dialog) directly from the keyboard, without opening the context menu.
- **Cut / Copy / Paste with Windows Explorer** — Right-click a file or folder for **Cut** or **Copy**, then paste it into Windows Explorer (or another Persephone Explorer panel) — this uses the real Windows clipboard, so files copied in Windows Explorer can also be pasted here. Right-click a folder (or empty space in the tree) and choose **Paste** to paste files/folders copied or cut from Windows Explorer into that folder; folders are copied recursively. **Cut** from Windows Explorer and pasted here moves the files (originals are removed only after the copy succeeds); **Cut** here and pasted into Windows Explorer works the same way. Pasting over existing files/folders asks for confirmation before overwriting, and large pastes show a progress indicator. The same actions are also available from the keyboard on the selected row: `Ctrl+C` copies, `Ctrl+X` cuts (not available on the tree's root), and `Ctrl+V` pastes into the selected folder (or the selected file's parent folder, or the root if nothing is selected).
- **Drag a file out to the OS** — Drag a file from the tree onto Windows Explorer to copy it there, or onto a Microsoft Teams chat compose box to attach it — a native OS drag, just like dragging from Windows Explorer itself. No modifier key needed. Not available on the tree's root, and one file at a time for now.
- **Move or copy between folders** — Dragging a file onto another folder in the tree — whether the file comes from this tree or from Windows Explorer — opens a **Move / Copy / Cancel** dialog so you always choose the operation; folders dropped from Windows Explorer are handled the same way, recursively. Dropping a file back onto the folder it already lives in does nothing. Dropping onto a name that already exists asks for confirmation before overwriting.
- **Open folder in new panel** — Right-click any folder and choose **Open in New Panel** to open it in a new File Explorer tab alongside the current editor
- **Open Terminal here** — Right-click any folder (including the tree's root) and choose **Open Terminal here** to launch a terminal window with that folder as its working directory. Windows only. See [Open Terminal here](#open-terminal-here) below for details and configuration.
- **Auto-reveal current file** — When the Explorer panel is active (expanded), navigating to a file automatically expands its parent folders and scrolls the tree to show the file. When the Search panel is active instead, the file is highlighted in the tree without expanding folders.
- **Search files by name** — Press `Ctrl+F` within the panel to search files by name (filters the tree to matching entries)
- **Search in file contents** — Click the **Search** icon in the Explorer panel header to open a content-search panel scoped to the root folder. You can also right-click any folder in the tree and choose **Search in Folder** to search only within that folder.
  - Results appear progressively in a collapsible "Search" panel below the Explorer tree, grouped by file with matched lines
  - Matched text is highlighted in results; clicking a result opens the file at that line in Monaco editor
  - Search text is highlighted in the Monaco editor when navigating results
  - Include/exclude glob patterns for fine-grained control (toggle with the filter button)
  - Configurable file extensions in Settings → File Search
  - Search state persists across app restarts
- **Archive browsing** — Click a ZIP-based archive file (`.zip`, `.docx`, `.xlsx`, `.pptx`, `.jar`, `.war`, `.epub`, `.odt`, `.ods`, `.odp`) in the tree, and an **Archive** panel appears below the Explorer panel. Click the Archive panel header to expand it and browse the archive contents as a folder tree. Text-based files inside the archive (XML, JSON, etc.) open in Monaco editor. You can also right-click an archive file and choose **Open as Archive** to browse it in a separate tab. When an archive is opened from a remote URL, the File Explorer panel is not shown (there is no local folder to browse).
  - **Entry highlighting** — The Archive panel highlights the currently viewed entry in the tree as you navigate between files.
  - **Auto-reveal in archive** — When the Archive panel is expanded, navigating to a file inside the archive automatically expands its parent folders and scrolls the tree to reveal the entry.
- **Browse `.asar` archives** — Electron `.asar` archive files can also be browsed via the Archive panel or **Open as Archive**, just like ZIP archives. Files inside `.asar` open in Monaco editor. `.asar` archives are read-only — file operations are disabled inside them.
- **Auto-refresh** — The Explorer tree automatically refreshes when files or folders are created, deleted, or renamed outside the app. No manual refresh is needed.
- **Lazy loading** — Folders load their contents on expand, keeping large directories fast
- **Resizable** — Drag the panel border to resize
- **Persistent state** — Expanded folders, panel width, and scroll position survive app restarts and in-tab navigation
- **Focus stays where you left it** — Clicking a file from the Explorer tree (or any sidebar panel) loads it in the main editor without moving keyboard focus there, so the tree's selection highlight stays fully lit and you can keep navigating with the keyboard. Focus only moves to the editor when you actively activate a page — clicking a tab, opening a new file, or switching tabs — so typing works immediately in that case.

### Open Terminal here

Right-click any folder and choose **Open Terminal here** to open a terminal window with that folder as its working directory. **Windows only.** This is available in three places:

- The File Explorer tree (sidebar panel or page-level panel), including the tree's root folder
- The sidebar's flat Custom Folder list
- The App bar left panel's pinned **Custom Folders** shortcuts

**Choosing the terminal:** Go to **Settings → Terminal** to pick which terminal is launched — **Auto-detect** (the default), **PowerShell 7 (pwsh)**, **Windows PowerShell (powershell)**, **Command Prompt (cmd)**, or **Windows Terminal (wt)**. On first use, if no terminal is configured, persephone auto-detects one (preferring `pwsh`, then falling back to `powershell`, then `cmd`) and remembers the choice — change it any time in Settings if you install PowerShell 7 later or prefer a different terminal.

## Session Restore

persephone automatically saves your session when you close the application. On next launch:

- All previously open tabs are restored
- Editor content, scroll positions, and state are preserved
- Unsaved changes are recovered
- Grid filters, sorting, and search state are restored

## File Watching

When a file that is open in persephone is modified by another application:

- The editor detects the change automatically
- If you haven't made local edits, the content refreshes silently
- The file status updates in real time (including deletion detection)
