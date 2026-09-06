# Persephone Editors — the catalog, for explaining them to the user

Every page in Persephone renders through an **editor**. This guide is the catalog from the
*user's* point of view: what each editor is for, how the user opens it, and what it can do — so
you can answer "what can this app open?", "how do I view this file as a table?", or "is there a
diagram editor?".

This is the companion to `read_guide("ui")` (the app's chrome — tabs, Menu Bar, sidebar,
highlighting an element on screen).

**If you are creating a page rather than explaining one, read `read_guide("pages")` instead.** It
carries the required `language` value and title suffix for each editor id, which this guide
deliberately does not duplicate — getting those wrong produces a broken page.

## How a user gets to an editor

Four routes, worth knowing because "how do I open X?" is the most common question:

1. **Open a file** — the file's extension picks the editor. Most files just work.
2. **The `+` button's arrow** (tab strip) — a menu of the user's pinned editors. **Show All…**
   opens the **Tools & Editors** hub, listing every editor, board and tool, with pin/reorder.
3. **The Menu Bar** (Persephone glyph) → **Tools & Editors** — the same hub as a sidebar panel.
4. **The editor-switch buttons** in the page toolbar — for files that support more than one
   editor (see *Switching editors* below).

## Text and code

### Text Editor — `monaco`
The default for any text file, and the fallback for anything unrecognized. It is the VS Code
engine, so the user gets what they expect: syntax highlighting for 50+ languages, IntelliSense,
find/replace (`Ctrl+F` / `Ctrl+H`), multi-cursor (`Alt+Click`, `Ctrl+D`), code folding, column
selection (`Shift+Alt+Arrows`), minimap, `Ctrl+Y` to delete a line. In Markdown and HTML files,
`Ctrl+Shift+V` pastes clipboard content converted to Markdown (or raw HTML).

It also hosts the **Script Panel** — run JavaScript/TypeScript against the file's content. That
is Persephone's headline feature; see `read_guide("scripting")`.

### Compare Mode
Side-by-side diff of two open files, using Monaco's diff viewer. The user opens both files,
`Ctrl+click`s the second tab to group them, then clicks **Compare** in the toolbar. Not a
separate editor id — it is a mode over a grouped pair.

### Git Diff — `file-diff`
Compares revisions of one file. Appears as a switch button on any text file tracked by git.
**From** / **To** pickers choose between *Unstaged*, *Staged*, and any commit; a **File History**
sidebar panel lists the file's commits with **L**/**R** toggles. When **To** is *Unstaged*, the
right pane is editable and writes to disk; every other combination is read-only.

### Git Tree — `git-tree`
The repository's commit history as a scrollable list. Opened from the **File Explorer** panel:
the `.git` row has a small **Open Git Tree** button on its right edge — clicking the row itself
just expands the folder.

**Both git editors require Git integration, which is OFF by default.** Settings → **Git
Integration** → *Enable Git integration*. With it off, Persephone does no git activity at all. If
a user asks why they see no git features, this is almost always the answer.

## Structured data

### Grid — `grid-json`, `grid-csv`, `grid-jsonl`
A spreadsheet over JSON arrays, CSV, and JSONL/NDJSON. The workhorse for tabular data: click
headers to sort, filter by column value, edit cells (`Enter`/`F2`), insert/delete rows
(`Ctrl+Insert` / `Ctrl+Delete`) and columns (`Ctrl+Shift+Insert` / `Ctrl+Shift+Delete`), show/
hide/reorder/resize columns, and **copy-paste directly to and from Excel**. `Ctrl+Shift+C` copies
with headers; the copy menu also offers JSON and HTML-table forms.

Any `.json` file holding an array of objects offers a **Grid** switch button; `.csv`, `.jsonl`
and `.ndjson` do too.

### Notebook — `notebook-view`
For `.note.json`. Structured notes where **each note has its own editor** (Monaco, Grid,
Markdown, SVG) and can run JavaScript/TypeScript on its own. Categories and Tags appear as
sidebar panels; full-text search highlights across all notes; notes expand to full editor size
and can carry comments. Drag files or links onto a category to create notes from them.
Format: `read_guide("notebook")`.

### Links — `link-view`
For `.link.json`. A link manager with collections, tags, and hostnames — each a sidebar panel
with its own filter. List and tile view modes (remembered per collection/tag/hostname), favicons,
preview images, a pinned-links strip, and heavy drag-and-drop: reassign links between categories,
import files or folders from Windows Explorer, drag across windows. Each link can name a **target
editor**, so a link can be set to always open in the Browser, the Image Viewer, Grid, and so on.
Format: `read_guide("links")`.

### Rest Client — `rest-client`
For `.rest.json`. An HTTP request collection: a request tree in the sidebar, request detail in
the main area. Body types are none / form-urlencoded / raw (with a language sub-selector) /
binary (streams from disk, no size limit) / multipart form-data. Responses render by type, with
binary and image responses given a save button and inline preview. "Copy as…" exports a request
as cURL, fetch, or Node fetch.

Scripts do not need this editor to make HTTP calls — `app.fetch(url, options)` is direct.

### Environment Variables — `env-vars-view`
For `.env.json` — the per-board secrets store that lives *outside* board folders. A namespace
list (one per board), profile tabs (`default`, plus any the board defines), and a Name/Value grid.
Values are shown in plain text; the file itself can be encrypted, in which case it shows a
**Locked** state with an **Unlock** button. Reached from Settings → **Board Environment
Variables**, or when a board calls `persephone.var.show()`.

### Graph — `graph-view`
For `.fg.json`, and any JSON containing `"type": "force-graph"` with a `"nodes"` property. An
interactive force-directed graph with a detail panel and group nodes.
Format: `read_guide("graph")`.

### Log View — `log-view`
For `.log.jsonl` and JSONL log content — a reader for structured log lines. This is also the
editor behind the **Log View page that `ui_push` manages for you**; see `read_guide("ui-push")`.

## Viewers and previews

### Markdown Preview — `md-view`
`.md` and friends open **directly in Preview**, however they were opened; **Text Editor** in the
toolbar shows the source. Rendered as GitHub-flavored Markdown, with a lot of practical polish
worth knowing about: syntax-highlighted fenced code blocks with copy buttons, inline **Mermaid
diagrams**, YAML frontmatter rendered as a code block, relative images resolved from disk, an
image hover toolbar (copy as PNG, open in Image Viewer), `Ctrl+F` search, and **in-page
navigation** — clicking a link to another local Markdown file loads it in the *same* tab, with a
**← Back** button whose history survives restarts. Anchor links (`#heading`) work within and
across documents. Azure DevOps wiki links and `/.attachments/` image paths resolve against the
repo root.

### HTML Preview — `html-view`
For `.html`. Live, sandboxed preview with JavaScript running. The toolbar can capture the
rendered page as PNG — copy to clipboard, save to file, open in the Image Viewer, or open in the
Drawing Editor for annotation. The capture is exactly what is on screen at the current window
size, which makes this a serviceable mockup tool: build the layout, resize the window, capture.
**Show Resources** extracts every resource URL on the page into a link collection.

### SVG Preview — `svg-view`
For `.svg`. Opens in the Text Editor with a **Preview** switch. Zoom/pan like the Image Viewer,
live preview of unsaved edits, **Save as PNG** (rasterized by Persephone's own engine, so fonts
are right), and **Open in Drawing Editor** for annotation.

### Mermaid — `mermaid-view`
For `.mmd` / `.mermaid`. Renders all Mermaid diagram types with zoom/pan, a light/dark toggle
(independent of the app theme, for pasting into documents), copy-as-image, and Save as PNG.

Two distinct export routes, and users do confuse them: **Convert to Excalidraw** (orange pencil)
turns flowchart / sequence / class diagrams into *individually editable* shapes; **Open in
Drawing Editor** embeds any diagram type as a *single flat image* for drawing on top of.

### Image Viewer — `image-view`
For `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`. Zoom, pan, fit-to-window, copy as
PNG (`Ctrl+C`), and a save dropdown offering **Save as .png** (re-encode) or **Save original**
(byte-for-byte). **Open in Drawing Editor** sends the image to Excalidraw for annotation.

`Ctrl+V` anywhere in Persephone opens a clipboard image in a new Image Viewer tab — unless the
paste lands in a focused text field, which pastes normally. An image copied as HTML-only (from
PowerPoint, Word, Excel) opens in an HTML viewer tab instead.

### Video / Audio Player — `video-view`
Video (`.mp4`, `.webm`, `.avi`, `.mkv`, `.mov`, `.m3u8`, `.m3u`) and audio (`.mp3`, `.wav`,
`.aac`, `.flac`, `.m4a`, `.wma`, `.ogg`, `.opus`). Also available as a standalone page from the
`+` dropdown, where the user pastes a path, an HTTPS URL, an HLS stream, or even a **cURL/fetch
command** to play a stream needing custom headers.

Audio files get a **spectrum visualizer** with three effects (Bars, Circular, None), a hover
controls bar, and — when the file was opened from the File Explorer or a Links panel —
**Next Track** and **Shuffle** across that folder/category/tag. When the built-in player cannot
decode a file, an **Open in VLC** button appears (VLC path is configurable in Settings).

### Archive — `archive-view`
Opens automatically for archives. Read/write for ZIP-based formats (`.zip`, `.docx`, `.xlsx`,
`.pptx`, `.jar`, `.war`, `.epub`, `.odt`, `.ods`, `.odp`); read-only for `.rar`, `.7z`, `.tar*`,
`.cab`, `.iso`, and Electron `.asar`. The archive's tree opens as a **sidebar panel** and entries
render inline in the main area — text in Monaco, images in the Image Viewer — so an `.xlsx` or
`.docx` can be inspected without unpacking it.

### Folder View — `category-view`
Opens when the user clicks a folder in the File Explorer or Archive panel. List and tile layouts
(each folder remembers its own), breadcrumb navigation, and image thumbnails — including images
*inside* an archive, so browsing `document.docx!word/media` in tile mode gives a contact sheet of
the file's embedded pictures. Right-click offers open/rename/delete/copy-path plus **New File** /
**New Folder** / **Paste** in writable locations. On local folders it behaves like the File Explorer
panel: Ctrl/Shift+click multi-selection (Ctrl+A, `Delete`, `Escape`), plural copy/cut/delete,
dragging files in from Windows Explorer — onto a folder row or onto empty space, meaning the open
folder — and dragging a selection back out to Windows Explorer or another app. Archive folders stay
single-select and read-only.

## Drawing

### Drawing Editor — `draw-view`
For `.excalidraw` — an Excalidraw canvas. Shapes, arrows, freehand, text, self-hosted fonts, and
a canvas theme toggle independent of the app theme. Exports as PNG (2x) or SVG to clipboard, file,
or a new tab. Its own **Screen Snip** button (scissors) captures a screen region straight onto the
canvas. Custom shape libraries persist to disk.

This is where the other viewers send their **Open in Drawing Editor** output, so it is the
general answer to "how do I annotate this?" — a screenshot, an SVG, a Mermaid diagram, or a
rendered HTML page.

## Web and custom apps

### Browser — `browser-view`
A real Chromium browser in a tab: URL bar with 11 search engines, **inner tabs** within the one
Persephone tab, **profiles** (isolated cookies/storage), incognito, bookmarks, downloads,
find-in-page, DevTools (`F12`), and session restore. Persephone can be set as the Windows default
browser. Agents open one with `pages.openUrlInBrowserTab(url, options)` and drive it through
`pages[i].editor` — `read_guide("browser")`.

### Board — `board-view`
A sandboxed mini web-app (HTML + CSS + JS) backed by scripts in any language, living in a folder
on disk. This is the extension point: dashboards, viewers, custom tools, and **custom editors**
for a file type. A board can declare `fileMasks` and then appear in the editor-switch toolbar for
matching files, even becoming their default.

**Every board must be explicitly trusted before it renders** — its scripts run with the user's
full privileges. Trust is per folder and remembered.

Persephone publishes a **boards catalog** the user can install from (Tools & Editors → Boards →
Search boards). Two editors that Persephone no longer ships built-in now live there — see
*Things that are no longer built in* below. Building one: `read_guide("boards")`.

## App and tool pages

These are ordinary tabs, not file editors. `create_page` rejects them; open them the listed way.

| Page | What it is | How to open |
|---|---|---|
| `settings-view` | Settings | Menu Bar → gear icon, or `execute_script`: `app.pages.showSettingsPage()` |
| `about-view` | About / version | Menu Bar → info icon |
| `tools-hub-view` | Tools & Editors hub — every editor, board and tool, plus the published boards catalog | `+` arrow → *Show All…*, or the Menu Bar category |
| `mcp-view` | MCP Inspector — connect to an MCP server using a credential-free URL and exercise its tools, resources and prompts, with request history | `+` arrow, or `app.pages.showMcpInspectorPage({ url })` |
| `mneme-config` / `mneme-root` | Mneme knowledge base — config/monitoring, and the search + document-tree editor | Tools & Editors → Mneme; or the `.mneme` row's button in File Explorer |
| `toolset-view`, `board-info`, `storybook-view` | Internal app views | Opened by the app — read them, don't create them |

**Mneme is OFF by default** (Settings → *Mneme (vector memory)*). Like git integration, this is
usually the answer when a user cannot find the feature.

## Switching editors

Files that offer more than one editor show switch buttons in the page toolbar. The **(default)**
column is what the file opens in:

| File type | Editors |
|---|---|
| `.json` | Text, Grid |
| `.csv`, `.jsonl`, `.ndjson` | Text, Grid |
| `.md` and other Markdown extensions | Text, **Preview (default)** |
| `.note.json` | Text, **Notebook (default)** |
| `.link.json` | Text, **Links (default)** |
| `.fg.json` | Text, **Graph (default)** |
| `.rest.json` | Text, **Rest Client (default)** |
| `.excalidraw` | Text, **Drawing (default)** |
| `.svg`, `.html` | Text, Preview |
| `.mmd`, `.mermaid` | Text, Mermaid |
| Archives | Archive only |
| Images | Image Viewer only |
| Audio / video | Player only |
| Any text file in a git repo (git integration on) | + Git Diff |
| Anything else | Text only |

**Content-based detection:** a JSON page whose content carries `"type": "note-editor"`,
`"link-editor"`, `"rest-client"`, or `"force-graph"` gets the matching switch button **without**
the special extension (graph also needs `"nodes"`, rest-client also needs `"requests"`). This is
how a page you create over MCP gets its editor switch.

**Board-provided editors** appear in the same switch control once the board is trusted.

## Things that are no longer built in

Say so plainly if asked — do not describe a feature Persephone does not have:

- **No built-in Todo editor.** `.todo.json` opens as ordinary JSON (Text, with a Grid switch if
  it is an array of objects). The full task-list experience is the **Todo board** from the
  published catalog.
- **No built-in PDF viewer.** A local `.pdf` opens in the Text Editor, which shows a
  binary-content warning; a `.pdf` at an `http(s)` URL renders in the built-in Browser via
  Chromium's own viewer. For search, thumbnails, outline, and zoom, the user installs the
  **PDF Viewer** board from the catalog — after which it becomes the default for `.pdf`,
  including PDFs inside archives.

Both are installed the same way: **Tools & Editors** → *Open in new tab* → **Search boards** →
find it → **Install** → trust it when prompted.

## Errors & verification

| Symptom | Meaning | Fix |
|---|---|---|
| `Unknown editor '…'. Valid editors: …` | Bad `editor` id on `create_page` | Use an id from `read_guide("pages")` |
| `create_page` rejects an id with a hint | It is a standalone editor (browser, board, image, settings…) | Use the path the hint names — `pages.openUrlInBrowserTab`, `open_board`, `app.pages.openFile(path)` |
| The page renders empty or shows raw text | Wrong `language` for the editor | Each non-monaco editor needs a specific `language` — `read_guide("pages")` |
| The editor shows a parse error, or `Editor crashed` | Content is not valid for that editor | Read the format guide (`notebook` / `links` / `graph`) and `JSON.parse` your content first |
| The user reports a missing switch button | The file lacks the required title suffix, or content-based detection did not match | Check the suffix column in `read_guide("pages")` |
| No git features anywhere | Git integration is off (the default) | Settings → Git Integration |
| No Mneme features anywhere | Mneme is off (the default) | Settings → Mneme (vector memory) |
| A board shows a trust prompt instead of content | Expected — boards are never rendered untrusted | The user must trust it; you cannot bypass this |

To see what an editor actually did with your content, snapshot the app window:
`window.screen.snapshot()` shows the active page — a healthy editor shows its content
tree, a broken one shows the error text.

## Where to go next

- `read_guide("ui")` — the app's chrome, and highlighting an element on screen for the user.
- `read_guide("pages")` — editor ids, required languages, title suffixes, creating pages.
- `read_guide("scripting")` — the Script Panel, `page` facades, Node.js access.
- `read_guide("boards")` — building a board, including custom editors.
- `read_guide("browser")` — driving the browser, boards, and the app window.
