# <img src="assets/icon.png" width="38" /> Persephone

**Persephone** is a developer notepad for Windows — built with Electron, Monaco Editor, and a JavaScript/TypeScript runtime. It extends the classic tabbed text editor with specialized viewers, a scripting engine, and an MCP server that lets AI agents drive the UI.



![Demo Video](https://github.com/user-attachments/assets/bfe1df27-1c16-45b5-89e6-6510387f3a7c)

## Key Features

### Monaco Editor
Syntax highlighting, IntelliSense, and search/replace for 50+ languages. Drag tabs between windows for multi-monitor workflows. Side-by-side grouping and a full diff editor for comparing files.

### Specialized Editors
Beyond text: JSON/CSV grids with sorting and filtering, Markdown preview, Mermaid diagrams, SVG/HTML preview, PDF viewer, image viewer, a structured notebook, force-directed graphs, Excalidraw drawings, and an HTTP Rest Client.

### Scripting Engine
Write and execute JavaScript or TypeScript directly in a tab. Scripts access open documents via the `page` object, the application via `app`, and have full Node.js access for file I/O, HTTP requests, and npm packages. A Script Library with autoload support lets you extend the application — add context menu items, hook into events, and automate workflows.

### Event System
An extensible event channel system (`app.events`) lets scripts subscribe to application events — file explorer context menus, browser bookmarks, and more. Autoload scripts register handlers at startup that persist for the session.

### AI Agent Integration (MCP Server)
A built-in [MCP](https://modelcontextprotocol.io/) HTTP server lets AI agents (Claude, ChatGPT, Gemini, etc.) create pages, execute scripts, display diagrams and grids, and manipulate documents — all programmatically. Enable with a single checkbox in Settings. See the [MCP Setup Guide](docs/mcp-setup.md).

### Boards
Build fully custom HTML-page mini-apps — dashboards, tools, viewers, even custom editors — that run locally in a sandboxed webview with **no remote network access**. A **Board** is any folder with a `board-manifest.json`; it pairs a plain HTML/JS/CSS frontend with backend scripts in any language, wired together by a single `persephone.execute()` bridge and themed automatically to match the app. Boards are trusted per-board, pinnable in the sidebar alongside the built-in editors, and can be created, opened, and developed end-to-end by an AI agent over MCP (`create_board` / `open_board`) or from scripts (`app.boards`). See the [Boards guide](docs/boards.md).

### Mneme — Vector Memory *(off by default)*
A built-in knowledge-base service that turns any folder of Markdown notes into a searchable **vector memory**. Mneme indexes your files locally (SQLite + an on-device embedding model) and exposes hybrid full-text + semantic search over MCP — so AI agents can read, write, and search a persistent knowledge base across sessions. Browse and edit roots in an Explorer-like sidebar, search with a dedicated results view, and manage indexing from a config editor. Files on disk stay the source of truth; the index is derived. Enable in Settings — the embedding model (~357 MB) downloads on first use. See the [Mneme guide](docs/mneme.md).

### Built-in Web Browser
Browse the web in a dedicated tab with profiles, incognito mode, Tor routing, bookmarks, and DRM video support. Links from Markdown and Monaco open in the nearest browser tab automatically.

### Browser Automation *(experimental)*
Automate the built-in browser from scripts using `page.asBrowser()` — click elements, fill forms, extract text, run JavaScript, manage tabs, and wait for dynamic content via a CDP-powered API. AI agents can drive the browser directly through MCP browser tools (`browser_navigate`, `browser_click`, `browser_type`, and more) without writing a script.

### Git Integration *(off by default)*
Optional, built-in git support — enable it with a single checkbox in Settings (requires git on your PATH). Browse a repository's full commit history in the **Git Tree** editor: a swimlane graph across all branches, a Branches & Tags panel, and a Changes panel for staging, unstaging, resetting, and committing. Create and switch branches, and pull, fetch, or push to remotes. A side-by-side **Git Diff** editor compares any tracked file across revisions (unstaged, staged, or any commit). See the [What's New](docs/whats-new.md) notes for details.

## Download (Windows)

| Format | Link |
| :--- | :--- |
| **Installer** | [![Download EXE](https://img.shields.io/badge/Download-Installer%20(.exe)-blue?style=for-the-badge&logo=windows)](https://github.com/andriy-viyatyk/persephone/releases/latest) |
| **Portable** | [![Download ZIP](https://img.shields.io/badge/Download-Portable%20(.zip)-orange?style=for-the-badge&logo=windows)](https://github.com/andriy-viyatyk/persephone/releases/latest) |

## Editors

| Editor | File Types | Description |
| :--- | :--- | :--- |
| **Text Editor** | all files | Monaco-powered editor with syntax highlighting for 50+ languages |
| **JSON Grid** | `.json` | Sortable, filterable table view for JSON arrays |
| **CSV Grid** | `.csv`, `.tsv` | Spreadsheet-like view with auto-detected delimiters |
| **JSONL Grid** | `.grid.jsonl`, `.jsonl` | Grid view for JSONL/NDJSON data — one JSON object per line |
| **Log View** | `.log.jsonl` | Structured viewer for JSONL log files with log-level filtering |
| **Markdown Preview** | `.md` | Rendered markdown with live updates |
| **Mermaid Diagrams** | `.mmd`, `.mermaid` | Rendered diagram preview with light/dark toggle |
| **SVG Preview** | `.svg` | Rendered SVG with zoom and pan |
| **HTML Preview** | `.html` | Sandboxed rendered preview with script support |
| **Image Viewer** | `.png`, `.jpg`, `.gif`, `.webp`, `.bmp`, `.ico` | Image viewer with zoom and pan |
| **Audio / Video Player** | `.mp4`, `.mkv`, `.webm`, `.mov`, `.mp3`, `.flac`, `.wav`, `.m3u8` | Plays local and streamed media, with HLS support and an audio spectrum visualizer |
| **PDF Viewer** | `.pdf` | Integrated pdf.js document viewer |
| **Archive** | `.zip`, `.rar`, `.7z`, `.tar`, `.docx`, `.xlsx`, `.epub`, `.iso` | Browse archive contents as a file tree; open entries inline (ZIP-based formats are writable) |
| **Notebook** | `.note.json` | Structured notes with categories, tags, and search |
| **Force Graph** | `.fg.json` | Interactive force-directed graph with node editing, search, and BFS expansion |
| **Drawing** | `.excalidraw` | Excalidraw-based drawing editor with library persistence, export, and screen snip |
| **Links** | `.link.json` | Bookmark/link manager with tiles, list view, categories, and pinned links |
| **Rest Client** | `.rest.json` | HTTP request builder with collections, body types, and response viewer |
| **Board** | folder w/ `board-manifest.json` | Sandboxed custom HTML mini-app — dashboard, tool, viewer, or custom editor — with backend scripts via `persephone.execute()` |
| **Browser** | — | Web browser with profiles, incognito, Tor, bookmarks, and DRM support |
| **Git Tree** | — | Commit-history graph with branches & tags, staging, commit, and pull/push *(Git integration)* |
| **Git Diff** | — | Side-by-side revision comparison for any tracked file *(Git integration)* |
| **Compare** | any two files | Side-by-side diff view |

### Published Boards — additional editors & viewers

Beyond the built-in editors above, Persephone maintains a small catalog of ready-made **Boards** — portable custom editors, viewers, and tools you can install on demand. Open a file whose type matches a published board (a `.todo.json` task list, a `.drawio` diagram, an Office document) and an install entry appears right in the editor-switch control, or browse the full catalog from the **Search boards** tab of the Tools & Editors hub. Each board is downloaded, checksum-verified, and trusted only after you explicitly accept it. See the [Boards guide](docs/boards.md#published-boards-catalog--discover-install-update).

The catalog is open source — browse the source, versions, and manifests, or publish your own board, at the **[persephone-boards](https://github.com/andriy-viyatyk/persephone-boards)** repository.

---

## Documentation

* **[User Guide](docs/index.md)** — Getting started, editors, keyboard shortcuts
* **[Scripting Guide](docs/scripting.md)** — Script execution, `page`/`app` API, autoload scripts
* **[API Reference](docs/api/index.md)** — `app.pages`, `app.fs`, `app.settings`, `app.ui`, `app.fetch`
* **[MCP Setup](docs/mcp-setup.md)** — Configure AI agents to control Persephone
* **[Mneme Guide](docs/mneme.md)** — Vector memory / Markdown knowledge base for AI agents
* **[Boards Guide](docs/boards.md)** — Build sandboxed custom HTML mini-apps and editors

---

## Contributing & Feedback

Contributions, bug reports, and feature requests are more than welcome!

* **Found a bug?** Please [open an issue](https://github.com/andriy-viyatyk/persephone/issues) with a description and steps to reproduce.
* **Want to contribute?** Feel free to fork the repository and submit a pull request. Whether it's a new "Alternative Editor," a bug fix, or a typo in the documentation, every bit helps!
* **Ideas?** If you have a "cool idea" for a tool that should be built into Persephone, jump into the [discussions](https://github.com/andriy-viyatyk/persephone/discussions) and let's talk about it.

### For Contributors

This project is developed with **Claude AI** assistance. Before contributing, please review:

* **[CONTRIBUTING.md](CONTRIBUTING.md)** - Setup guide and coding standards
* **[Developer Docs](doc/README.md)** - Architecture and standards
* **[Active Work](doc/active-work.md)** - Current epics and tasks
* **[CLAUDE.md](CLAUDE.md)** - Project context for AI-assisted development

---

Licensed under the MIT License.