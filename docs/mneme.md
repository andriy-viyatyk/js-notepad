[← Home](./index.md)

# Mneme — Knowledge Base

**Mneme** is an optional, built-in knowledge base. Point it at one or more folders of Markdown documents and it indexes them for fast **full-text** and **semantic** (meaning-based) search. You can browse, edit, and organize those documents inside Persephone, and AI agents (Claude and others) can read, search, and maintain the same knowledge base over MCP.

Mneme is **off by default** and runs as a separate local service (`mneme.exe`) that Persephone launches in the background when you enable it. Your files on disk are always the source of truth — the search index is derived and can be rebuilt at any time.

> **Privacy:** Mneme runs entirely on your machine over loopback (`127.0.0.1`). Indexing and search are local; enabling semantic search downloads an embedding model once, after which no document data leaves your computer.

## Enabling Mneme

1. Open **Settings** (sidebar button or the **Tools & Editors** panel).
2. Scroll to the **Mneme (vector memory)** section.
3. Check **Enable Mneme**.

Persephone launches the Mneme service and connects to it over loopback HTTP. A status line then shows **Running / Stopped**, the server URL (e.g. `http://localhost:7700/mcp`), and a **Copy URL** button.

- **Port** — defaults to `7700`. To change it, toggle Mneme **off**, edit the port, then toggle it back **on** (the port field is locked while Mneme is running).
- When disabled (the default), the service is never launched and no indexing happens.

## Config & monitoring editor

Open it from the **Tools & Editors** panel → **Mneme** (or the **+** dropdown if you've pinned it). This is where you manage roots, indexing, and the embedding model.

- **Roots** — add one or more folders ("roots") to index. Each root gets a small `.mneme` store folder holding its index. Remove a root to stop indexing it — your documents are never deleted.
- **Include / ignore** — per-root glob patterns control which files are indexed and searched. They do **not** hide files from browsing: the whole folder stays navigable; include/ignore only scope what search looks at.
- **Reindex** — rebuild or refresh a root's index. Long-running reindexing shows live progress, and an always-on watcher keeps the index in sync automatically as files change on disk.
- **Index inventory** — each root's indexed file counts and status at a glance.
- **Embedding model** — full-text search works with no model. To enable semantic (**vector** / **hybrid**) search, download the embedding model from the model panel; status shows whether it is present. Until then, vector and hybrid searches fall back to full-text with a note.

  When no embedding model is loaded, the model panel header shows a yellow **"Model not loaded — semantic search unavailable"** warning, and the button reads **Load model** (highlighted) instead of **Update model**. Click **Load model** to download the model file.

  > **First-run prompt:** If Mneme is enabled but no embedding model has been downloaded yet, Persephone automatically opens the Mneme config editor shortly after start so you can set up the model. This happens once per session — once the model is provisioned, it no longer auto-opens.

Toolbar buttons:

- **Restart Mneme** — restart the background service.
- **Open in MCP Inspector** — open the running service in the [MCP Inspector](./editors.md#mcp-inspector) to explore its tools and resources.
- **Open Mneme log** — open the service log file in a text editor for troubleshooting.

## Searching a knowledge base

In the **File Explorer**, any folder that is a Mneme root shows a **`.mneme`** entry — visible only while Mneme is enabled, mirroring the `.git` entry shown for git repositories. Click it to open the **Mneme root** editor: a search view with an Explorer-like document tree in the sidebar.

**Search modes** (selector next to the search box):

- **Hybrid** (default) — combines full-text and semantic search: exact terms *and* meaning-based matches.
- **Text** — classic full-text search; always available, no model needed.
- **Vector** — purely semantic / meaning-based search; needs the embedding model.

Type a query and press **Enter** or click **Search**. Results are ranked best-first and rendered as Markdown — each hit shows the document title, a snippet, and its tags, and links straight to the document. If semantic search is not available yet (no model downloaded), a note explains that the search fell back to full-text.

**Filters** (below the search box):

- **Include tags** / **Exclude tags** — narrow results to, or away from, documents carrying specific tags.
- **Created from** / **to** — restrict results to a document creation-date range.

## Browsing & organizing documents

The **Mneme** sidebar panel shows the root as a navigable tree — like the File Explorer, but backed by the knowledge base:

- **Open** a document by clicking it. Markdown opens in Preview; images and other attachments open in the appropriate viewer.
- **Create, rename, delete** files and folders directly in the tree (deleting a folder removes it and its contents).
- **Drag-and-drop import** — drop files from Windows Explorer onto the tree to add them to the knowledge base.
- **Move & copy** — drag documents within a root to move them; drag between two different roots (even across separate windows) to copy them.
- **Drag to Link editor** — drag a document node from the Mneme tree onto a category in the Collections panel (or onto the main links area) of an open Link editor to create a `mneme://` link to that document.
- **Copy Path** — right-click a tree node and choose **Copy Path** to copy its full `mneme://{root}/{path}` URL to the clipboard.

## Opening documents & `mneme://` links

Documents and attachments are addressed as `mneme://{root}/{path}`. A relative `mneme://` link inside a document opens its target in Persephone — Markdown in Preview, images and PDFs in the Image / PDF viewer. Right-clicking a node in the Mneme tree and choosing **Copy Path** copies this full URL to the clipboard so you can paste it anywhere.

## AI agent integration (MCP)

Mneme exposes a single **MCP** interface, so AI agents can read, search, and maintain your knowledge base with the same operations you use:

- **File-like tools** — `read`, `write`, `edit`, `delete`, `glob`, `grep`, `mkdir`, `rename`, `upload` — addressing documents as `{root}/{path}`.
- **`search`** — text, vector, or hybrid.
- **Views & management** — `tree`, `timeline`, `tags`, `add_root`, `reindex`, `status`, `model_update`, and more.

The same running service serves Persephone *and* external agents at the same time. Point any MCP client (Claude Desktop, Claude Code, or the built-in [MCP Inspector](./editors.md#mcp-inspector)) at the Mneme URL shown in Settings (e.g. `http://localhost:7700/mcp`) — the Settings page also shows a ready-to-paste server entry for agent configuration. See [MCP Server Setup](./mcp-setup.md) for how to connect agents.
