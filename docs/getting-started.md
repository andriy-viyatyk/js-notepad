[← Home](./index.md)

# Getting Started

## Installation

### Windows

1. Download the latest release from [GitHub Releases](https://github.com/andriy-viyatyk/persephone/releases)
2. Run the installer or extract the ZIP
3. Launch persephone

### From Source

```bash
git clone https://github.com/andriy-viyatyk/persephone.git
cd persephone
npm install
npm start
```

## First Launch

When you first open persephone, you'll see a clean, simple interface:
- Tab bar at the top
- An empty text editor

The application looks like a simple notepad by default. To access additional features (recent files, folder bookmarks, settings, about), click the **persephone icon** at the top-left corner of the tab bar — a sidebar slides in from the left. Click anywhere outside the sidebar to dismiss it.

## Basic Operations

### Creating a New File
- Press `Ctrl+N` or click the + button in the tab bar
- Click the dropdown arrow (▾) next to the + button to create a page with a specific editor. The default items are:
  - **Open Folder** — Pick a folder; opens a new tab with the File Explorer panel rooted at that folder
  - **Script (JS)** — JavaScript file for scripting
  - **Script (TS)** — TypeScript file for scripting
  - **Drawing** — Excalidraw-based drawing canvas
  - **Grid (JSON)** — Grid editor for JSON data
  - **Grid (CSV)** — Grid editor for CSV data
  - **Browser** — Built-in web browser (or pick a specific profile / incognito)

  The dropdown shows your **pinned** editors. You can add or remove items from the **Tools & Editors** panel in the sidebar (see [Tabs & Navigation](./tabs-and-navigation.md#tools--editors)).

### Opening Files
- Press `Ctrl+O` to open file dialog
- Drag and drop files onto the window
- Use recent files in the sidebar

### Saving Files
- Press `Ctrl+S` to save
- Press `Ctrl+Shift+S` to Save As
- Unsaved changes show a dot on the tab

### Closing Files
- Press `Ctrl+W` to close current tab
- Click the X on the tab

## Language Selection

persephone automatically detects the programming language based on file extension (.js, .py, .json, etc.).

To manually change the language:
- Click the language icon button on the left side of the tab
- Select the desired language from the dropdown list

## Checking for Updates

persephone automatically checks for updates once every 24 hours. When a new version is available, you'll see a notification.

To manually check for updates:
1. Click the app button (persephone icon) in the top-left corner to open the sidebar menu
2. Click the Info button (ℹ) to open the About page
3. Click "Check for Updates"

"Check for Updates" also refreshes the catalog of [boards published by the project](./boards.md#published-boards-catalog--discover-install-update), so a newly published board or board update shows up immediately instead of waiting for the next automatic check.

The About page also shows:
- Current application version
- Electron, Node.js, and Chromium versions
- Available boards — the number of boards currently published in the catalog
- Links to download the latest version and report issues

## Changing the Theme

persephone includes 9 color themes (6 dark, 3 light) inspired by VSCode:

1. Click the app button (persephone icon) in the top-left corner to open the sidebar menu
2. Click the Settings button (gear icon) to open the Settings page
3. Click a theme card to switch instantly

**Dark themes:** Default Dark, Solarized Dark, Monokai, Abyss, Red, Tomorrow Night Blue
**Light themes:** Light Modern, Solarized Light, Quiet Light

You can also cycle through themes with `Ctrl+Alt+]` (next) and `Ctrl+Alt+[` (previous).

Your theme preference is saved automatically and applied on next launch.

The Settings page also has a "View Settings File" button to open the raw `appSettings.json` for manual editing (`%APPDATA%\persephone\data\appSettings.json`). Edits to the file — made by hand, by a script, or by an AI agent — take effect immediately, with no restart needed, including settings that start or stop something (the MCP server, browser tools, Mneme). The file carries a header comment plus a per-setting comment (accepted values, default, and any gotcha — for example, changing a port only moves a running server if you also toggle the feature off and on). Persephone rewrites these comments on every save, so they always match the current version.

## Next Steps

- Learn about [different editors](./editors.md)
- Explore the [Grid Editor](./grid-editor.md) for JSON/CSV data
- Try [JavaScript scripting](./scripting.md)
- Learn about [tabs, sidebar, and navigation](./tabs-and-navigation.md)
- Protect files with [encryption](./encryption.md)
- See all [keyboard shortcuts](./shortcuts.md)
