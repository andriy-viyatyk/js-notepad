# persephone User Guide

A powerful notepad for developers, built with Monaco Editor.

## What is persephone?

persephone is a Windows Notepad replacement designed for developers. It combines the simplicity of Notepad with powerful features from VS Code:

- **Monaco Editor** - The same editor that powers VS Code
- **Syntax Highlighting** - 50+ programming languages
- **JavaScript & TypeScript Execution** - Run scripts to transform content
- **Multiple Editors** - Grid view for JSON/CSV, Markdown preview, Drawing canvas, Rest Client, PDF viewer, Video Player, and more
- **Tab Management** - Multiple files with drag-and-drop, grouping, and compare

## Quick Start

1. **Open a file**: File → Open or drag a file onto the window
2. **Edit**: Just like any text editor
3. **Save**: Ctrl+S to save

## Documentation

- [Getting Started](./getting-started.md) - Installation and first steps
- [Editors](./editors.md) - Overview of all editor types
- [Grid Editor](./grid-editor.md) - Spreadsheet-like data editor for JSON/CSV
- [Notebook Editor](./notebook.md) - Structured notes with categories and tags
- [Todo Editor](./editors.md#todo-editor) - Task lists for `.todo.json` files
- [Browser](./browser.md) - Built-in web browser with profiles, bookmarks, downloads, and scripting/MCP automation
- [Scripting](./scripting.md) - JavaScript/TypeScript execution and content transformation
- [Scripting API Reference](./api/index.md) - Complete API for `page` and `app` objects
- [MCP Server Setup](./mcp-setup.md) - Connect AI agents (Claude, ChatGPT, Gemini) to control persephone
- [Boards](./boards.md) - Build custom HTML-page apps inside a project folder, backed by local scripts and themed to match the app
- [Mneme Knowledge Base](./mneme.md) - Local full-text & semantic search over folders of Markdown — browsable in-app and MCP-accessible (optional, off by default)
- [Tabs & Navigation](./tabs-and-navigation.md) - Tab management, grouping, sidebar, and session restore
- [Encryption](./encryption.md) - Password-based file encryption
- [Keyboard Shortcuts](./shortcuts.md) - Complete shortcut reference

## Key Features

### For All Users
- Fast, lightweight text editor
- Syntax highlighting for 50+ languages
- Find and replace
- Multiple tabs with session restore
- Recent files and folder bookmarks
- Drag-and-drop file opening
- 9 color themes — 6 dark + 3 light (Default Dark, Solarized Dark, Monokai, Abyss, Red, Tomorrow Night Blue, Light Modern, Solarized Light, Quiet Light)

### For Developers
- Run JavaScript or TypeScript to transform content, with Log View for structured output and inline dialogs
- JSON/CSV grid view with sorting, filtering, and full keyboard navigation
- Notebook editor for structured notes
- Todo editor for file-based task tracking
- Built-in web browser with profiles, Incognito, Tor mode, DRM video support, and full scripting/MCP automation
- Markdown preview with syntax highlighting and Mermaid diagrams
- File comparison (diff view)
- File encryption
- Full Node.js access in scripts
- **AI scripting** — call Claude directly from scripts via `ai.ClaudeSession` (multi-turn conversations, tool use)
- AI agent integration — connect external tools like Claude Desktop, Claude Code, or ChatGPT to control persephone via HTTP (MCP)
- **Boards** — build fully custom HTML-page applications inside a project folder; call backend scripts (any language) via `persephone.execute()`, and theme the UI automatically with the `--p-*` CSS-variable contract; AI agents can author and test boards over MCP
- **Git integration** (optional, off by default) — Git Tree editor for browsing commit history, and a Git Diff editor switch for any tracked text file
- **Mneme knowledge base** (optional, off by default) — index folders of Markdown for full-text and semantic search; browse and edit documents in-app, and let AI agents read, search, and maintain the knowledge base over MCP

## Getting Help

- [GitHub Issues](https://github.com/andriy-viyatyk/persephone/issues) - Report bugs
- [What's New](./whats-new.md) - Latest changes
