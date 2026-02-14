[← Home](./index.md)

# Getting Started

## Installation

### Windows

1. Download the latest release from [GitHub Releases](https://github.com/andriy-viyatyk/js-notepad/releases)
2. Run the installer (MSI) or extract the ZIP
3. Launch js-notepad

### From Source

```bash
git clone https://github.com/andriy-viyatyk/js-notepad.git
cd js-notepad
npm install
npm start
```

## First Launch

When you first open js-notepad, you'll see a clean, simple interface:
- Tab bar at the top
- An empty text editor

The application looks like a simple notepad by default. To access additional features (recent files, folder bookmarks, settings, about), click the **js-notepad icon** at the top-left corner of the tab bar — a sidebar slides in from the left. Click anywhere outside the sidebar to dismiss it.

## Basic Operations

### Creating a New File
- Press `Ctrl+N` or click the + button in the tab bar
- Click the dropdown arrow (▾) next to the + button to create a page with a specific editor:
  - **Script (JS)** — JavaScript file for scripting
  - **Grid (JSON)** — Grid editor for JSON data
  - **Grid (CSV)** — Grid editor for CSV data
  - **Notebook** — Notebook editor for structured notes

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

js-notepad automatically detects the programming language based on file extension (.js, .py, .json, etc.).

To manually change the language:
- Click the language icon button on the left side of the tab
- Select the desired language from the dropdown list

## Checking for Updates

js-notepad automatically checks for updates once every 24 hours. When a new version is available, you'll see a notification.

To manually check for updates:
1. Click the app button (js-notepad icon) in the top-left corner to open the sidebar menu
2. Click the Info button (ℹ) to open the About page
3. Click "Check for Updates"

The About page also shows:
- Current application version
- Electron, Node.js, and Chromium versions
- Links to download the latest version and report issues

## Changing the Theme

js-notepad includes 9 color themes (6 dark, 3 light) inspired by VSCode:

1. Click the app button (js-notepad icon) in the top-left corner to open the sidebar menu
2. Click the Settings button (gear icon) to open the Settings page
3. Click a theme card to switch instantly

**Dark themes:** Default Dark, Solarized Dark, Monokai, Abyss, Red, Tomorrow Night Blue
**Light themes:** Light Modern, Solarized Light, Quiet Light

You can also cycle through themes with `Ctrl+Alt+]` (next) and `Ctrl+Alt+[` (previous).

Your theme preference is saved automatically and applied on next launch.

The Settings page also has a "View Settings File" button to open the raw `appSettings.json` for manual editing.

## Next Steps

- Learn about [different editors](./editors.md)
- Explore the [Grid Editor](./grid-editor.md) for JSON/CSV data
- Try [JavaScript scripting](./scripting.md)
- Learn about [tabs, sidebar, and navigation](./tabs-and-navigation.md)
- Protect files with [encryption](./encryption.md)
- See all [keyboard shortcuts](./shortcuts.md)
