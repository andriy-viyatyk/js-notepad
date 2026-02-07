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

When you first open js-notepad, you'll see:
- An empty text editor
- Tab bar at the top
- Sidebar on the left

## Basic Operations

### Creating a New File
- Press `Ctrl+N` or click the + button in the tab bar

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

## Next Steps

- Learn about [different editors](./editors.md)
- Set up [keyboard shortcuts](./shortcuts.md)
- Try [JavaScript scripting](./scripting.md)
