# <img src="assets/icon.png" width="38" /> Persephone

**Persephone** is a notepad for Windows that opens almost anything. It starts exactly like a notepad — one empty text page — but drop in a JSON file, a Word document, a SQLite database, or a ZIP archive and it shows the content, not the bytes. And it is built to be shared with AI agents: everything you see on screen, an agent can see and drive too.

![Demo Video](https://github.com/user-attachments/assets/bfe1df27-1c16-45b5-89e6-6510387f3a7c)

## One viewer for everything

Any file a developer meets during the day opens in place — in three tiers:

- **Built in** — code with syntax highlighting (Monaco, 50+ languages), JSON/CSV grids, Markdown, Mermaid diagrams, SVG and HTML previews, images, audio/video, archives (ZIP, RAR, 7z — including a look inside `.docx`/`.xlsx`), side-by-side diffs, and more. See the [full list](#built-in-editors) below.
- **Installable** — the **[persephone-boards](https://github.com/andriy-viyatyk/persephone-boards)** catalog adds viewers and editors on demand: Word, Excel, PowerPoint, PDF, draw.io diagrams, SQLite databases, Windows executables, todo lists. Open a matching file and an install offer appears right in the editor-switch control; each board is downloaded, checksum-verified, and trusted only after you accept it. The catalog keeps growing.
- **Made to order** — if no viewer exists for your file, ask an AI agent to build one. A viewer is a **Board**: a folder of plain HTML/JS/CSS with optional backend scripts. A simple viewer takes an agent a few minutes to create, and it plugs in like a native editor.

## A workspace shared with AI agents

Persephone ships a built-in [MCP](https://modelcontextprotocol.io/) server — enabled with one checkbox in Settings ([setup guide](docs/mcp-setup.md)). Through it the whole app is transparent to an agent, and the agent works in the same UI you are looking at:

- **It shows you things.** An agent opens pages with rendered Markdown, diagrams, sortable grids, and highlighted code — instead of dumping walls of text into a chat.
- **It sees what you see.** Snapshot, click, and type — browser-style MCP tools work on the app itself and on the built-in web browser, so an agent can find something online for you or summarize the page you have open.
- **It works your content.** The full application API (`app.*` — pages, files, settings, dialogs) is scriptable, so an agent reads and edits documents right alongside you.

Content lives in one place and both of you operate on it: the agent drafts, you correct; you paste, the agent transforms.

## Boards — a platform for mini apps

Boards turn Persephone into a platform for small personal applications: dashboards, data browsers, deployment helpers, tools specific to one project. A board runs locally in a sandboxed webview with **no remote network access**, is trusted per board, and pins to the sidebar next to the built-in editors.

The practical loop: describe the tool you need to your agent — it scaffolds the board, builds it, opens it, and iterates while you watch. Tools that used to stay on a "someday" list become things you get within a coffee break. See the [Boards guide](docs/boards.md).

## Also inside

- **Web browser** — tabs with profiles, incognito mode, Tor routing, bookmarks, and DRM video support. Links from Markdown and code open in the nearest browser tab.
- **Git integration** *(off by default)* — a commit-graph editor across all branches, staging and committing, push/pull, and revision diffs for any tracked file.
- **Mneme — vector memory** *(off by default)* — turns any folder of Markdown notes into a locally indexed knowledge base with hybrid full-text + semantic search, exposed over MCP so agents remember across sessions. See the [Mneme guide](docs/mneme.md).
- **Scripting** — the same `app.*` API agents use is available to you in a JavaScript/TypeScript tab with full Node.js access. See the [Scripting guide](docs/scripting.md).

## Download (Windows)

| Format | Link |
| :--- | :--- |
| **Installer** | [![Download EXE](https://img.shields.io/badge/Download-Installer%20(.exe)-blue?style=for-the-badge&logo=windows)](https://github.com/andriy-viyatyk/persephone/releases/latest) |
| **Portable** | [![Download ZIP](https://img.shields.io/badge/Download-Portable%20(.zip)-orange?style=for-the-badge&logo=windows)](https://github.com/andriy-viyatyk/persephone/releases/latest) |

## Built-in editors

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
| **Archive** | `.zip`, `.rar`, `.7z`, `.tar`, `.docx`, `.xlsx`, `.epub`, `.iso` | Browse archive contents as a file tree; open entries inline (ZIP-based formats are writable) |
| **Notebook** | `.note.json` | Structured notes with categories, tags, and search |
| **Force Graph** | `.fg.json` | Interactive force-directed graph with node editing, search, and BFS expansion |
| **Drawing** | `.excalidraw` | Excalidraw-based drawing editor with library persistence, export, and screen snip |
| **Links** | `.link.json` | Bookmark/link manager with tiles, list view, categories, and pinned links |
| **Rest Client** | `.rest.json` | HTTP request builder with collections, body types, and response viewer |
| **Board** | folder w/ `board-manifest.json` | Sandboxed custom HTML mini-app — dashboard, tool, viewer, or custom editor |
| **Browser** | — | Web browser with profiles, incognito, Tor, bookmarks, and DRM support |
| **Git Tree** | — | Commit-history graph with branches & tags, staging, commit, and pull/push *(Git integration)* |
| **Git Diff** | — | Side-by-side revision comparison for any tracked file *(Git integration)* |
| **Compare** | any two files | Side-by-side diff view |

More viewers and editors — PDF, Word, Excel, PowerPoint, draw.io, SQLite, and others — install on demand from the **[persephone-boards](https://github.com/andriy-viyatyk/persephone-boards)** catalog: browse it from the **Search boards** tab of the Tools & Editors hub, or just open a matching file. See the [Boards guide](docs/boards.md#published-boards-catalog--discover-install-update).

---

## Documentation

* **[User Guide](docs/index.md)** — Getting started, editors, keyboard shortcuts
* **[MCP Setup](docs/mcp-setup.md)** — Connect AI agents to Persephone
* **[Boards Guide](docs/boards.md)** — Custom viewers, editors, and mini apps
* **[Mneme Guide](docs/mneme.md)** — Vector memory / Markdown knowledge base for AI agents
* **[Scripting Guide](docs/scripting.md)** — Script execution, `page`/`app` API, autoload scripts
* **[API Reference](docs/api/index.md)** — `app.pages`, `app.fs`, `app.settings`, `app.ui`, `app.fetch`

---

## Contributing & Feedback

Contributions, bug reports, and feature requests are more than welcome!

* **Found a bug?** Please [open an issue](https://github.com/andriy-viyatyk/persephone/issues) with a description and steps to reproduce.
* **Want to contribute?** Feel free to fork the repository and submit a pull request — a new viewer, a bug fix, or a typo in the documentation, every bit helps!
* **Ideas?** If you have a "cool idea" for a tool that should be built into Persephone, jump into the [discussions](https://github.com/andriy-viyatyk/persephone/discussions) and let's talk about it.

### For Contributors

This project is developed with **Claude AI** assistance. Before contributing, please review:

* **[CONTRIBUTING.md](CONTRIBUTING.md)** - Setup guide and coding standards
* **[Developer Docs](doc/README.md)** - Architecture and standards
* **[Active Work](doc/active-work.md)** - Current epics and tasks
* **[CLAUDE.md](CLAUDE.md)** - Project context for AI-assisted development

---

Licensed under the MIT License.
