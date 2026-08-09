[← Home](./index.md)

# Editors

persephone includes multiple editors for different file types. Some files support switching between editors using toolbar buttons.

## Text Editor (Default)

The default editor for all text files, powered by Monaco (the same engine as VS Code):

- **Syntax highlighting** for 50+ languages
- **IntelliSense** and auto-completion
- **Find and replace** (`Ctrl+F` / `Ctrl+H`)
- **Multi-cursor editing** (`Alt+Click`, `Ctrl+D`, `Ctrl+Alt+Up/Down`)
- **Code folding** — collapse and expand code blocks
- **Column selection** — `Shift+Alt+Arrow` keys for rectangular selection
- **Minimap** — code overview on the right side
- **Delete line** — `Ctrl+Y` deletes the entire current line
- **Paste as Markdown / HTML** — In Markdown and HTML files, press `Ctrl+Shift+V` to paste clipboard content as converted Markdown (or raw HTML). Uses [Turndown](https://github.com/mixmark-io/turndown) for conversion. Regular `Ctrl+V` pastes plain text as before.

The text editor also provides a **Script Panel** for running JavaScript or TypeScript against any file's content. See [Scripting](./scripting.md) for details.

## Grid Editor

A spreadsheet-like interface for JSON, CSV, and JSONL data with sorting, filtering, cell editing, and full keyboard navigation.

**Supported formats:**
- JSON files containing an array of objects
- CSV files (auto-detects delimiter)
- JSONL / NDJSON files (one JSON object per line)
- Files with `.grid.json`, `.grid.csv`, or `.grid.jsonl` extensions open directly in Grid view

**Key features:**
- Click column headers to sort
- Filter rows by column values
- Copy/paste to and from Excel (`Ctrl+C` / `Ctrl+V`)
- Edit cells directly (Enter/F2 to edit, Escape to cancel)
- Insert and delete rows (`Ctrl+Insert` / `Ctrl+Delete`)
- Insert and delete columns (`Ctrl+Shift+Insert` / `Ctrl+Shift+Delete`)
- Copy with headers (`Ctrl+Shift+C`)
- Copy as JSON or HTML table
- Column management (show/hide, reorder, resize)
- Full keyboard navigation

See **[Grid Editor](./grid-editor.md)** for complete documentation including all keyboard shortcuts.

## Markdown Preview

`.md`, `.markdown`, and the other recognized Markdown extensions (`.mkd`, `.mdown`, `.mkdn`, `.mdwn`, …) open directly in **Preview**, however you got there — from the Explorer, a clicked link, drag-and-drop, a script, or an MCP tool. Click **Text Editor** in the toolbar to see and edit the raw source, and **Preview** to come back:

- **GitHub-flavored Markdown** rendering
- **Text search** — press `Ctrl+F` to find text, `F3`/`Shift+F3` to navigate matches, `Esc` to close
- **Syntax highlighting** in fenced code blocks using Monaco's colorize API (supports all Monaco languages including aliases like `ts`, `js`, `py`, `bash`)
- **Copy-to-clipboard** button on code block hover
- **YAML frontmatter** — if the document starts with a `---` … `---` (or `---` … `...`) frontmatter block, it renders as a syntax-highlighted YAML code block instead of broken text or stray horizontal rules. The source file is never modified — this is a preview-only transform
- **Inline Mermaid diagrams** — ` ```mermaid ` code blocks render as SVG diagrams with hover toolbar (copy image to clipboard, open in Mermaid editor). Azure DevOps wiki fenced container syntax (`::: mermaid … :::`) is also recognized and rendered as a diagram
- **Relative images** — images referenced with a relative path (e.g. `![](images/diagram.png)`) resolve correctly relative to the Markdown file's location on disk and render inline in the preview
- **Image hover toolbar** — hover over any rendered image to reveal a small toolbar in the top-right corner of the image with two buttons:
  - **Copy** — copies the image to the clipboard as PNG. Paste directly into Teams, Slack, Outlook, or any app that accepts images.
  - **Open in new tab** — opens the image in Persephone's Image Viewer in a new tab. This button is hidden for embedded `data:` or `blob:` images (images that have no file path to open).
- **Azure DevOps wiki links** — when the Markdown file lives inside a git repository, root-relative ADO wiki paths are resolved against the wiki root (the folder that contains `.git`):
  - **Images** — a leading-slash image path such as `![](/.attachments/diagram.png)` resolves to `<wiki-root>/.attachments/diagram.png` and renders inline
  - **Page links** — a link like `[Page](/Area/Some%20Page)` or `[Page](/Business-Rule-Engine-(BRE))` resolves to the on-disk file at `<wiki-root>/Area/Some-Page.md` (literal dashes and parentheses in the path are kept as-is; only bare spaces are converted to dashes). Clicking the link navigates in the same tab (see **in-page navigation** below)
- **In-page navigation** — clicking a link to a local Markdown file (`.md` or `.markdown`) loads the target document **in the same tab** without opening a new one. The tab stays in Markdown Preview mode. A **← Back** button appears in the toolbar after the first such navigation; clicking it returns to the previous document. The back history is per-tab, unlimited depth, and **persists across app restarts and moving the tab to another window**. All other links — `http`/`https`, images, non-Markdown files, and `mailto:` — continue to open as before (new tab or current behavior)
- **Anchor links (`#fragment`)** — a link to a heading works whether it points at another document or the current one:
  - **`[text](other-doc.md#heading)`** — opens the target document (same-tab navigation, as above) and scrolls to the heading once it renders.
  - **`[text](#heading)`** — scrolls to the heading in the current document, in place — it does not navigate, and does not add a **← Back** entry.
  - Every rendered heading gets a stable, GitHub-style anchor id (lowercased, punctuation stripped, spaces → hyphens; duplicate headings get `-1`, `-2`, … suffixes). Matching a link's fragment against these ids is tolerant: exact match first, then case-insensitive, then a slug comparison against the heading's text — so both GitHub-style fragments (`#some-heading`) and Azure DevOps wiki-style fragments (`#some.heading`) resolve to the same heading.
  - If the fragment doesn't match any heading, the document still opens normally at the top — no error.
  - Works for Azure DevOps wiki root-relative links and for `mneme://` documents, the same as any other Markdown link.
  - **Ctrl+click** (or **Cmd+click**) on any link, including an anchor link, opens it in a new tab instead of navigating/scrolling in place.
- **Live preview** updates as you type
- **Minimap** navigation on the right side
- **Link context menu** — right-click a link for: "Copy Link", "Open in Default Browser", "Open in Internal Browser", browser profiles, "Open in Incognito"

## PDF Viewer

Persephone no longer ships a built-in PDF viewer. What happens when you open a `.pdf` depends on how it's opened:

- **A local `.pdf` file** opens in the **Text Editor**, which detects the large binary content and shows a warning instead of trying to render it.
- **A `.pdf` at an `http(s)` URL** opens in the built-in [Browser](./browser.md), rendered by Chromium's own PDF viewer.

For the full PDF experience — search, thumbnails sidebar, document outline, page navigation, zoom / fit-width / fit-page, rotate, text selection and copy, and print — install the **PDF Viewer** board from the published boards catalog (requires Persephone 4.0.18 or later): open the **Tools & Editors** sidebar panel → **Open in new tab** → **Search boards** tab, find "PDF Viewer", click **Install**, then register/trust it when prompted. Once installed, it becomes the default editor for `.pdf` files — local, inside an archive (e.g. `archive.zip!doc.pdf`), and at `http(s)` URLs all open in the board instead. The board is read-only (no annotation editing) and fully offline — it never makes a network request. It keeps pdf.js's own light/dark styling rather than following the Persephone app theme.

See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update) for the install/trust flow.

## Video Player

For video files (`.mp4`, `.webm`, `.avi`, `.mkv`, `.mov`, `.m3u8`, `.m3u`) and audio files (`.mp3`, `.wav`, `.aac`, `.flac`, `.m4a`, `.wma`, `.ogg`, `.opus`) — opens automatically. Also available as a standalone page via the **+** dropdown → **Video Player**.

**Opening a video or audio file:**
- Paste a file path, HTTPS URL, or HLS/M3U8 stream URL into the URL bar at the top and press **Enter** to start playback.
- Paste a full **cURL** or **fetch** command (any format) to play a stream that requires custom HTTP headers (e.g., `Authorization`, `Origin`, `Referer`). The parser reuses the same cURL engine as the [Open URL dialog](./getting-started.md) and Rest Client.
- For local file paths: type or paste the absolute path (e.g., `C:\Videos\movie.mp4`) and press **Enter**.

**Supported sources:**
| Source | How it plays |
|--------|-------------|
| Local MP4/WebM/AVI/MKV/MOV file | Routed through the local streaming server — smooth seeking for large files. AVI/MKV/MOV require VLC if the built-in player cannot decode them. |
| Local MP3/WAV/AAC/FLAC/M4A/OGG/OPUS file | Routed through the local streaming server with animated spectrum visualizer |
| Local WMA file | Opens with the spectrum visualizer; use **Open in VLC** if playback fails (WMA is not supported by Chromium's built-in decoder) |
| HTTPS URL to MP4/WebM | Routed through the local streaming server — forwards Range requests to the origin |
| HLS/M3U8 stream | Played directly by hls.js; uses Node.js HTTP (bypassing Chromium restrictions) when custom headers are present |

**Player controls:**
- Standard video controls: play/pause, seek bar, volume, fullscreen
- **Mute button** on the tab — toggle audio without opening the player
- Mute state is remembered across Video Player instances within the same session

**Audio playback:**

When you open an audio-only file (`.mp3`, `.wav`, `.aac`, `.flac`, `.m4a`, `.wma`, `.ogg`, `.opus`), a spectrum analyzer visualizer fills the player area instead of a blank video frame. The visualizer reacts in real time to the playing audio.

- **Effect switcher** — Hover over the visualizer to reveal effect buttons in the top-right corner. Three styles are available: **Bars** (vertical frequency bars), **Circular** (radial spectrum with spark particles that fly outward on volume peaks), and **No effect** (displays the track name and artist on a blank canvas, read from ID3 metadata or the filename). Click a button to switch. The selected effect is remembered across sessions.
- **Controls bar** — Hover over the visualizer to reveal a playback controls bar centered near the bottom: play/pause button, (when available) a **Next Track** button, current time, seek bar, total duration, a mute toggle, and (when available) a **Shuffle** button. The bar fades out when idle and reappears on hover, keeping the visualizer unobstructed.
- **Next Track & Shuffle** — When a file was opened from the **File Explorer** panel or the **Links** panel (by category or by tag), the player automatically advances to the next audio file in the same folder, category, or tag set when the current track ends. A **Shuffle** button toggles shuffle mode: all tracks in the set play once in random order before any track repeats (shuffle bag algorithm). The shuffle state persists across app restarts. When a track auto-advances, the selection highlight in the File Explorer or Links panel updates to follow the current track. These buttons are hidden when a file was opened by typing a URL directly (no source panel available).
- Click anywhere on the visualizer canvas to toggle play/pause.

**State badge:** When the player is loading, in an error state, or the format is unsupported, a badge at the bottom of the player area shows the current state.

**VLC integration:**
- When the built-in player cannot play a file (error or unsupported format), an **Open in VLC** button appears.
- All sources — including HTTP with custom headers — are served through the local streaming server, so VLC always receives a plain `http://127.0.0.1:PORT/...` URL.
- Configure VLC in **Settings → Video Player → vlc.exe**. Leave empty to auto-detect from the default installation path (`C:\Program Files\VideoLAN\VLC\vlc.exe`).

**Settings (Video Player section in Settings):**

| Setting | Default | Description |
|---------|---------|-------------|
| `vlc-path` | *(auto-detect)* | Full path to `vlc.exe`. Leave empty to auto-detect. |
| `video-stream.port` | `7866` | Port for the local HTTP streaming server. Change if `7866` is in use. |
| `visualizer-effect` | `bars` | Active audio visualizer effect (`bars`, `circular`, `none`). Persisted automatically when you switch effects. |
| `audio-shuffle` | `false` | Whether shuffle mode is enabled for audio playback. Persisted automatically when you toggle the Shuffle button. |

## Image Viewer

For image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`) — opens automatically:

- **Zoom** with mouse wheel or toolbar +/- buttons
- **Pan** by dragging when zoomed in
- **Fit to window** (default view)
- **Reset zoom** — click the zoom percentage indicator
- **Copy to clipboard** — `Ctrl+C` or toolbar button (copies as PNG)
- **Save image** — the toolbar save button is a dropdown with two options:
  - **Save as .png** — re-encodes the image to PNG (useful for converting JPG, GIF, etc. to PNG)
  - **Save original** — writes the source bytes in their original format with no re-encoding
- **Open in Drawing Editor** — toolbar button embeds the image into a new Excalidraw drawing tab for annotation
- **Paste image from clipboard** — press `Ctrl+V` anywhere in Persephone (even when a text editor is focused) to open a clipboard image in a new viewer tab. Two cases are handled:
  - **Bitmap image** (screenshots, images copied from Snipping Tool, Teams, browsers) — opens in a new **Image Viewer** tab titled **"Pasted image"**. The tab survives an app restart.
  - **HTML-only image** (pictures copied from PowerPoint, Word, Excel, or any app that places the image on the clipboard as HTML with no bitmap) — opens in a new **HTML viewer** tab titled **"Pasted HTML"**. The tab is not persisted across restarts.
  - If the paste lands in a focused editor (Monaco, any input, or other text field), those targets paste normally and no new tab is opened.
- **Screen Snip** — the **…** (three-dot) button in the Persephone window header opens a snip menu with two options: **Snip Screen** (hides Persephone, then capture the desktop) and **Snip Persephone** (keeps Persephone visible so you can capture its own content). After selecting a region, the screenshot opens in a new Image Viewer tab. See [Screen Snip](#screen-snip) for details.

**Scripting:** `const img = await page.asImage()` — exposes `savePngToFile(filePath)` to write the image to disk as PNG. See [`asImage()` API reference](./api/page.md#asimage--promiseimageeditor).

## Screen Snip

The **…** (three-dot) button in the Persephone window header (just before the Mneme indicator) opens a snip menu for capturing any region of the screen.

**Two capture modes:**

| Mode | Behavior |
|------|----------|
| **Snip Screen** | Hides all Persephone windows before the overlay appears, so you can capture any part of the desktop or another app. |
| **Snip Persephone** | Keeps Persephone visible, so you can capture content shown inside the app — an image, a web page, a chart, or a diagram. |

In both modes a dimmed fullscreen overlay appears across all monitors. Drag to select a region, then release to capture. Press Escape or right-click to cancel without capturing.

**After capture:** The screenshot opens automatically in a new **Image Viewer** tab. From the Image Viewer you can:
- Copy the image to the clipboard (`Ctrl+C` or toolbar button)
- Save to a file (toolbar save dropdown → **Save as .png** or **Save original**)
- Open in the Drawing Editor (toolbar button) for annotation in Excalidraw

Works on multi-monitor setups with mixed DPI scaling.

**Related:** The [Drawing Editor](#drawing-editor) has its own **Screen Snip** button (scissors icon in the toolbar) that inserts the captured region directly into the drawing canvas instead of opening a standalone Image Viewer tab.

## SVG Preview

For `.svg` files — opens in text editor by default, click **Preview** in the toolbar:

- Same zoom/pan/copy controls as Image Viewer
- **Live preview** of unsaved changes
- **Save as PNG** — toolbar button rasterises the SVG to a PNG file (opens a save dialog); the PNG is rendered by Persephone's own engine so text and fonts are correct
- **Open in Drawing Editor** — toolbar button embeds the SVG into a new Excalidraw drawing tab for annotation
- Switch between text editor and preview anytime

**Scripting:** `const svg = await page.asSvg()` — exposes `savePngToFile(filePath)` to rasterise and write the SVG as PNG to disk. See [`asSvg()` API reference](./api/page.md#assvg--promiseisvgeditor).

## Mermaid Diagram Viewer

For `.mmd` and `.mermaid` files — click **Mermaid** in the toolbar:

- Supports all Mermaid diagram types (flowchart, sequence, class, state, ER, Gantt, pie, git graph)
- Same zoom/pan controls as Image Viewer
- **Light/dark theme toggle** (dark by default, light for copying into documents)
- **Copy diagram** to clipboard as image
- **Save as PNG** — toolbar button rasterises the rendered diagram to a PNG file (opens a save dialog); the PNG is rendered by Persephone's own engine so diagram text and fonts are correct (fixes broken output from external mermaid-to-PNG converters)
- **Open in Drawing Editor** — toolbar button embeds the rendered diagram into a new Excalidraw drawing tab as a single flat image, suitable for annotation and highlighting
- **Convert to Excalidraw** (orange pencil icon) — converts the diagram into native, individually-editable Excalidraw shapes. Each node, label, and connector becomes a separate shape you can move, resize, and style:
  - **Supported types:** flowchart, sequence diagram, class diagram — these convert to editable shapes with clean Helvetica text
  - **Other types** (state, ER, Gantt, pie, git graph) — open in the Drawing Editor as a flat image, the same as **Open in Drawing Editor**, and a notification explains that native conversion is not available for that diagram type
  - The converted drawing opens in a new tab in the Drawing Editor
- **Live preview** with debounced re-rendering
- Mermaid syntax highlighting in the text editor

**Convert to Excalidraw vs. Open in Drawing Editor:**

| | Convert to Excalidraw | Open in Drawing Editor |
|---|---|---|
| Result | Native shapes — each element is editable | Single flat image — the diagram is embedded as a picture |
| When to use | You want to rearrange nodes, change colors, or annotate individual elements | You want to add callouts or highlights on top of a diagram without breaking it apart |
| Supported types | Flowchart, sequence, class | All types |

**Scripting:** `const m = await page.asMermaid()` — exposes `savePngToFile(filePath)` to render the diagram and write it as PNG to disk. The method renders on demand even when the diagram page is not the active tab. See [`asMermaid()` API reference](./api/page.md#asmermaid--promiseimermaideditor).

## HTML Preview

For `.html` files — click **Preview** in the toolbar:

- **Live preview** of unsaved changes
- **JavaScript execution** — scripts in the HTML run in the preview
- **Sandboxed rendering** — preview is isolated from the application
- **Show Resources** — click the web-scraper toolbar button (or use the right-click context menu in the Browser) to extract all resource URLs from the page (images, scripts, stylesheets, media, fonts, iframes, favicons, and links). Results open as a categorized link collection.
- **Open in Browser** — right-click the tab and choose **Open in Browser** to open the local `.html`/`.htm`/`.xhtml` file in Persephone's built-in browser. Useful for testing interactive behavior, following hyperlinks, or inspecting the page with DevTools.
- **Menu dismiss on click** — clicking anywhere inside the preview pane dismisses any open Persephone context menu or popover, keeping the UI responsive.
- Switch between text editor and preview anytime

**Image export toolbar:**

The HTML Preview toolbar includes image-capture buttons for sharing or annotating the rendered page:

- **Copy** (clipboard icon) — captures the rendered page exactly as shown on screen and copies it as a PNG image to the clipboard. Paste directly into Teams, Slack, Outlook, Word, or any app that accepts images.
- **… (more actions)** — opens a menu with three additional options:
  - **Save as PNG** — captures the rendered page and opens a save dialog to write it as a PNG file.
  - **Open in Image View** — captures the rendered page and opens the PNG in a new Image Viewer tab.
  - **Edit Image** — captures the rendered page and opens the PNG in a new Drawing Editor (Excalidraw) tab for annotation.

**WYSIWYG capture:** The capture is pixel-perfect — it takes exactly what is shown on screen at the current window size, including any JavaScript-rendered content. To control the output dimensions, resize the Persephone window (or the editor pane) to your desired size before capturing. This makes the HTML Preview a convenient mockup tool: build your layout in HTML, resize the window to the target dimensions, then capture.

## Browser

A built-in web browser for viewing documentation, APIs, and web resources without leaving persephone.

**Opening:** Click the dropdown arrow (&#9662;) next to the **+** button → **Browser** (if pinned), or find it in the **Tools & Editors** sidebar panel.

**Key features:**
- **URL bar** with search, suggestions, and 11 search engines
- **Internal tabs** — multiple browser tabs within a single persephone tab
- **Browser Profiles** — isolated sessions with separate cookies, storage, and cache
- **Incognito mode** — ephemeral browsing with no persistent data
- **Bookmarks** — per-profile bookmark management with star button and bookmarks panel
- **Downloads** — toolbar button with progress tracking, download history popup
- **Context menu** — contextual actions for links, images, text, SVG elements, and developer tools
- **Default browser registration** — set persephone as your Windows default browser
- **Session restore** — all tabs, URLs, history, and profile selection saved across restarts
- **Find in page** — `Ctrl+F` opens inline search bar with match counter and navigation
- **Keyboard shortcuts** — `Ctrl+L` URL bar, `Ctrl+F` find, `F5` reload, `F12` DevTools, `Alt+Left/Right` back/forward, and more

See **[Browser](./browser.md)** for complete documentation including profiles, bookmarks, downloads, and all keyboard shortcuts.

## Compare Mode

Compare two files side-by-side using Monaco's built-in diff viewer:

1. Open two text files
2. Hold `Ctrl` and click the second file's tab to group them side-by-side
3. Click the **Compare** button in the toolbar

**Features:**
- Side-by-side diff view
- Inline diff highlighting (additions, deletions, modifications)
- Navigate between changes

See [Tabs & Navigation](./tabs-and-navigation.md) for more on tab grouping.

## Todo Lists

Persephone no longer ships a built-in Todo editor. `.todo.json` files now open like any other JSON file (Text, with a Grid switch if the content is an array of objects).

For the full task-list experience — multiple lists, tags, drag-to-reorder, search, and more — install the **Todo board** from the published boards catalog (requires Persephone 4.0.17 or later). See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update) and [Tools & Editors — Search boards](./tabs-and-navigation.md#tools--editors).

## Notebook Editor

For `.note.json` files — a structured notes interface:

- **Categories** and **tags** for organizing notes — shown as **Categories** and **Tags** panels in the always-open page sidebar
- Each note has its own code editor (Monaco, Grid, Markdown, SVG)
- **Full-text search** with highlighting across all content
- **Drag-and-drop** to reorganize categories; drag links from the Links editor (or files from the File Explorer) onto a category to create notes from them
- **Expand** notes to full editor size
- **Run JavaScript or TypeScript** from individual notes
- Optional **comments** on each note

See **[Notebook Editor](./notebook.md)** for detailed documentation.

## Graph View

For `.fg.json` files — a force-directed graph viewer. Also activates for any JSON file that contains `"type": "force-graph"` and a `"nodes"` property. Click **Graph** in the toolbar to switch between the text editor and the graph view.

**Interaction:**
- **Zoom** — scroll wheel to zoom in/out (double-click zoom is disabled)
- **Pan** — drag the canvas background
- **Drag nodes** — click and drag individual nodes to reposition them
- **Select** — click a node to select it; selected node and its direct neighbors are highlighted. `Ctrl+Click` to toggle nodes in and out of a multi-selection.
- **Selection toolbar** — when nodes are selected, an "N selected ▾" button appears in the toolbar. Click it to open a popup menu with selection actions: "Select children" (adds direct neighbors of non-group nodes), "Select members" (adds direct members of selected groups), "Select members deep" (recursively adds all members including sub-groups), "Highlight" (opens the Legend panel with the Selection tab and "Selected" filter active), "Copy (markdown)" (copies markdown for selected nodes to clipboard — multi-node includes a summary table), "Open (markdown)" (opens the markdown in a new md-view page), "Group Selected" (groups 2+ selected nodes), "Extract" (creates a new graph page with selected nodes and their inter-links), "Extract with children" (same but includes direct neighbors first), and "Delete N Nodes" (with confirmation for 2+). Group-related items ("Group Selected", "Select members", "Select members deep") are hidden when grouping is disabled.
- **Double-click node** — expands the detail panel for the clicked node
- **Hover** — hover over a node to highlight it and its children; after ~500 ms a tooltip appears showing the node's title, id, and any custom user-defined properties. Tooltips do not appear during node drag or while a context menu is open. The tooltip is **hoverable** — move the mouse into the tooltip to interact with it. It includes a **Copy as Markdown** button and an **Open in new page** button (opens the node info as a Markdown page). Property values that contain markdown links (`[text](url)`) are rendered as clickable links.
- **Labels** — node labels appear for selected and hovered nodes when zoomed in sufficiently. Level 1 and 2 nodes always show their label regardless of selection or zoom state. Highlighted node labels are always visible regardless of zoom level. Font size scales by level (larger for root/level 1, smaller for deeper levels). Labels display the node's `title` if present, otherwise its `id`.
- **Selection highlight** — selected node label text turns orange. Hovered node and its children get green label text.

**Node properties:**
- `id` — unique identifier (required)
- `title` — display label shown instead of `id` when present
- `level` — size tier from `1` (largest) to `5` (smallest); defaults to `5` if omitted
- `shape` — visual shape: `circle` (default), `square`, `diamond`, `triangle`, `star`, or `hexagon`
- `isGroup` — when `true`, the node is rendered as a double circle (filled inner circle with a dark blue outer ring) in violet. Group nodes use level-1 size, always-visible labels, and show a "GROUP" badge followed by "Group · N members" in tooltips (membership = links between the group and non-group nodes, in either direction). Group nodes appear in the Legend panel but are excluded from the detail edit panel and from legend level/shape counting. When groups exist, links are automatically pre-processed: membership links (group-to-member) are hidden, cross-group links are routed through the group node, inter-group links are routed through both group nodes, and intra-group links are preserved. Grouping can be toggled on/off via a toolbar button (see Toolbar below).

**Graph options:**
- `options.rootNode` — initial root node ID; the graph centers on this node. The root node is visually distinct: it uses a compass (4-pointed star) shape, level-1 size, violet color, an always-visible label, and a "ROOT NODE" badge in its tooltip.
- `options.expandDepth` — BFS depth limit from the root node; only nodes within this depth are shown initially
- `options.maxVisible` — maximum number of visible nodes (default `500`); when a graph exceeds this limit, only the closest nodes are shown initially
- `options.charge` — repulsion strength between nodes (persisted)
- `options.linkDistance` — target link distance between connected nodes (persisted)
- `options.collide` — overlap prevention strength (persisted)
- `options.legend` — legend descriptions for levels and shapes (persisted by the Legend Panel)

**Detail Panel:**

A collapsible overlay panel in the top-right corner for editing the selected node's properties. The header always shows the selected node's title (or "select node for edit" when nothing is selected). When multiple nodes are selected, the header shows "N nodes selected". Click the header or double-click a node to expand the panel. The panel auto-collapses when you deselect all nodes. Clicking the canvas background collapses expanded panels without changing the selection. Clicking a different node while the detail panel is expanded keeps the panel open and updates it with the new selection.

- **Info tab** — editable fields for ID (with rename validation), Title, Level (1–5 icon selector), and Shape (6 shape icons: circle, square, diamond, triangle, star, hexagon). In multi-selection mode, only Level and Shape are shown; mixed values across selected nodes are highlighted in yellow.
- Changes immediately update the canvas and JSON
- Resizable via the bottom-left corner drag handle
- **Properties tab** — an AVGrid showing all custom (non-core) key-value properties of the selected node. Supports inline editing (double-click), adding and deleting rows (`Ctrl+Insert` / `Ctrl+Delete` or context menu), copy/paste from spreadsheets, and the same Apply/Cancel batch workflow as the Links tab. Reserved keys (`id`, `title`, `level`, `shape`, and system keys) are highlighted and blocked from being added. Unsaved edits block tab switching, panel collapse, and node selection changes. In multi-selection mode, the grid shows the union of all selected nodes' properties; values that differ across nodes are highlighted in yellow, with a status message indicating mixed values.
- **Links tab** — an AVGrid showing all nodes linked to the selected node with columns for ID, Title, Level, Shape, and any custom properties. Hidden during multi-selection. Column widths are auto-detected and the ID column is sticky. Supports batch editing with Apply/Cancel buttons, adding new linked nodes (including paste from Excel), and deleting rows (removes the link, and also removes the node if it becomes orphaned). Unsaved edits block panel collapse and node selection changes. When the Links tab is active, non-linked nodes are dimmed on the canvas. Focusing a grid row highlights the corresponding node in green on the canvas and draws a green link line from the selected node to the hovered node. Hidden children are automatically expanded when the Links tab is activated.

**Editing:**
- **Add Node** — right-click on empty canvas area and choose "Add Node" to create a new node at the click position
- **Add Child** — right-click on a node and choose "Add Child" to create a new node linked to the clicked node
- **Select children** — right-click a node and choose "Select children" to add its direct neighbors to the selection. For group nodes, use "Select members" or "Select members deep" instead (hidden when grouping is disabled).
- **Delete Node** — right-click on a node and choose "Delete Node" to remove it and all its links. When multiple nodes are selected, this becomes "Delete N Nodes" (with confirmation for 2+). Right-clicking a node that is part of a multi-selection preserves the selection. Deleting the last member of a group auto-deletes the empty group (including cascading cleanup of nested empty groups).
- **Delete Link to...** — right-click on a node and use the "Delete Link to..." submenu to remove a specific link from that node
- **Open link** — right-click a node whose custom properties contain markdown links (`[text](path)`) to see "Open {property}" at the top of the context menu (opens the linked path). When a node has multiple markdown links across its properties, the menu shows "Open link..." with a submenu listing each link.
- **Set as Root** — right-click on a node and choose "Set as Root" to designate it as the root node
- **Collapse** — right-click on a node and choose "Collapse" to hide its descendant nodes (those discovered later in BFS order from the root). Only available when visibility filtering is active.
- **Toggle Link** — `Alt+Click` on a node to add or remove a link between it and the currently selected node
- **Group Selected** — multi-select 2 or more regular (non-group) nodes, then right-click → "Group Selected" to create a new group containing them. You will be prompted to enter a title for the group. If the selection includes exactly one existing group plus regular nodes, the regular nodes are added to that group instead of creating a new one. Each node can belong to only one group — moving a node to a new group silently removes it from the old one.
- **Ungroup** — right-click a group node → "Ungroup" to dissolve the group. Member nodes are preserved; only the group node and its membership links are removed.
- **Delete Group** — right-click a group node → "Delete Group" to remove the group AND all of its member nodes.
- **Edit Title** — right-click a group node → "Edit Title" to rename the group.
- **Alt+Click membership** — select a group node, then `Alt+Click` a regular node to toggle its membership: if the node is not a member, it is added; if it is already a member, it is removed.
- **Remove from Group** — right-click a node that belongs to a group → "Remove from Group" to take it out of the group while keeping the node itself. If this was the last member, the empty group is automatically deleted (including cascading cleanup of nested empty groups).
- All edits serialize back to clean JSON with no internal properties. Existing node positions are preserved after edits.

**Large graph support:** Graphs with more nodes than `maxVisible` automatically show a subset of nodes closest to the root node (or the most-connected node if no root is set). Nodes with hidden neighbors display a **"+"** badge — click the badge to expand and reveal the next layer of neighbors. `Ctrl+Click` on a badge performs a **deep expand**, revealing the entire hidden subtree connected to that node (already-visible nodes act as barriers). The **Expand All** toolbar button makes all nodes visible at once (a confirmation dialog appears when the graph has more than 1,000 nodes); it is hidden when no visibility filter is active. The **Reset View** toolbar button resets BFS visibility and restarts the D3 simulation (re-compacting drifted nodes); it is always enabled. Disconnected components (nodes not reachable from the focus) show their root plus one level of children.

**Status bar:** The footer displays the node count — "N of M nodes" when visibility filtering hides some nodes, or "N nodes" when all nodes are visible.

**Empty graph:** New empty graph pages show a centered hint: "Right-click → Add Node".

**Toolbar:** The toolbar auto-grows to fit its content (minimum 280px). It displays a search input (fixed 130px width), an expand-all icon (hidden when no visibility filter), a reset view icon, a grouping toggle button, a **Copy to clipboard** button (copies the graph as a PNG image), an **Open in Drawing editor** button (exports the graph as an image and opens it in the Excalidraw drawing editor for annotation), and a gear icon in a single row. The **grouping toggle** (violet circle icon) disables/enables group node rendering — when grouping is enabled, the button shows a diagonal strikethrough line (meaning "click to disable"); when disabled, group nodes and membership links are stripped from the graph and all group-related menu items are hidden. The button is greyed out when the graph has no groups. Below the toolbar, three tabs — **Physics**, **Expansion**, and **Results (N)** — switch between the force tuning panel, expansion settings panel, and search results panel. The toolbar is semi-transparent when idle and becomes fully opaque on hover, focus, or when a panel is expanded.

**Search:** Press `Ctrl+F` to focus the search input. The search input supports **multi-word AND matching**. Type multiple words separated by spaces — all words must match somewhere in a node's title, ID, or custom property names/values. Non-matching nodes and their links are dimmed.

When matches are found, the **Results** tab shows the match count and opens a scrollable results panel listing matching nodes with highlighted matches. Hidden nodes appear at reduced opacity and can be clicked to reveal them. Use **ArrowUp/Down** to navigate results, **Enter** to select, and **Escape** to close the results panel.

A status bar below the results shows "matched N visible" and, when hidden nodes also match, a clickable **"+K hidden"** link for bulk reveal. The status bar also provides **[select all]** and **[add to selection]** actions to select matching nodes in bulk. The collapsed search toolbar remains visible with a green border when a search is active. Press Escape or the **×** button to clear the search.

**Force Tuning:** Click the gear icon in the toolbar (or select the **Physics** tab) to toggle an expandable tuning panel with three sliders that control the force simulation in real time:
- **Charge** (-200 to 0) — how strongly nodes repel each other
- **Distance** (10 to 200) — target link distance between connected nodes
- **Collide** (0 to 1) — overlap prevention strength

Adjustments take effect immediately. Click **Reset** to restore the default values. Physics settings are persisted to the JSON `options` object and restored when the file is reopened. Clicking the canvas auto-collapses the tuning panel.

**Expansion Settings:** Select the **Expansion** tab to configure how the graph expands from the root node:
- **Root Node** — dropdown to select which node is the root (the graph centers on this node)
- **Expand Depth** — BFS depth limit from the root node
- **Max Visible** — maximum number of visible nodes

Changes to Expand Depth and Max Visible are deferred — they take effect when the file is reopened.

**Legend Panel:** A collapsible panel at the bottom-left corner for documenting what node levels and shapes mean. Click to expand (the chevron turns green when expanded); the panel has three tabs — **Selection**, **Level**, and **Shape** (Selection is the default tab). The Level and Shape tabs list levels or shapes present in the graph, with a checkbox to highlight matching nodes and a text input for a free-form description. Descriptions are persisted to the JSON `options.legend` object. The root node (if set) appears in both tabs with a shared description. The **Selection** tab provides radio filters — **Selected**, **Selected with children** (includes visual and real neighbors), and **Not selected** — enabling quick visual isolation of multi-selected subsets. Hold **Shift** as a shortcut to temporarily apply the "selected with children" highlighting without opening the legend panel. When checkboxes or radio filters are active, matching nodes are highlighted and non-matching nodes are dimmed. When search highlighting is active and the Legend panel is expanded, the Legend shows a "Search highlighting is active" message with a "Clear search" button instead of the normal tabs/content. Collapsing the panel clears the highlighting but preserves checkbox state.

**Scripting API:** Scripts and MCP agents can query and analyze graph data via `const graph = await page.asGraph()`. The facade provides read-only access to nodes, links, selection, neighbor/group relationships, search, BFS traversal, and connected component analysis. See the [asGraph() API reference](./api/page.md#asgraphpromiseigrapheditor) for details.

**Theme support:** Graph colors (node fill, edge color, selected/hover highlights) adapt to whichever of the 9 app themes is active.

**Example file:** See [greek-gods.fg.json](./examples/greek-gods.fg.json) — a family tree of Greek gods showing parent-child and spouse relationships. This is also where the name "Persephone" comes from — the goddess of spring and queen of the underworld.

## Log View

For `.log.jsonl` files — a structured log reader that renders each line as a typed entry (info, warning, error, success, plain text, progress bars, inline grids, Markdown, Mermaid diagrams, and interactive dialogs) instead of raw JSON text.

You'll most often meet this editor without opening a file yourself: it's what powers the **Log View page** that scripts (via the `ui` global) and AI agents (via the MCP `ui_push` tool) use as their output channel. The page is created automatically on first use and reused afterward. See [Scripting — The `ui` Object](./scripting.md#the-ui-object-log-view) for what scripts can push to it, and [MCP Server Setup](./mcp-setup.md#available-tools) for the `ui_push` tool agents use the same way.

## Drawing Editor

For `.excalidraw` files — an Excalidraw-based drawing canvas. Click **Drawing** in the toolbar to switch between the text editor and the drawing view.

- **Shapes** — rectangles, ellipses, diamonds, arrows, lines, and freehand drawing
- **Text** — add text labels anywhere on the canvas
- **Arrows and connectors** — link shapes with arrows
- **Freehand drawing** — sketch freely with the pencil tool
- **Fonts** — Helvetica (default), Excalifont, Cascadia, Virgil, and more — all self-hosted for offline support
- **Theme support** — canvas syncs dark/light theme with the app; an independent toggle button lets you switch the canvas theme without changing the app theme
- **Export** — toolbar buttons for exporting the drawing:
  - **Copy to clipboard** — copies the drawing as a PNG image at 2x scale
  - **Save as file** — dropdown menu to save as SVG or PNG (2x scale)
  - **Open in new tab** — dropdown menu to open as an SVG preview or PNG image in a new tab
  - Exports respect the current canvas theme (dark or light)
- **Screen Snip** — toolbar button (scissors icon) captures a screen region and inserts it as an image into the canvas. Hides all Persephone windows, shows a dimmed fullscreen overlay on each monitor, and lets you drag-select a region. Press Escape or right-click to cancel. Works on multi-monitor setups with mixed DPI scaling. To capture a region and open it as a standalone image instead, use the [Screen Snip menu](#screen-snip) in the window header.
- **Library persistence** — custom shape libraries are saved to disk and restored across sessions. Use the "Browse libraries" button to open the Excalidraw libraries site in the internal browser — installing a library adds it directly to the editor. Library storage path is configurable via `drawing.library-path` in Settings (defaults to `<userData>/data/excalidraw-lib/`).
- **Offline ready** — no external dependencies; all assets are bundled
- Can switch to Monaco for raw JSON editing

**Scripting API:** Scripts and MCP agents can interact with drawings via `const draw = await page.asDraw()`. The facade supports inserting images (`addImage`), exporting as SVG or PNG, and querying element count. Use `app.pages.addDrawPage(dataUrl)` to create a new drawing page with an embedded image. See the [asDraw() API reference](./api/page.md#asdrawpromiseidraweditor) for details.

## Link Editor

For `.link.json` files — a structured link manager:

- **Collections**, **tags**, and **hostnames** for organizing and filtering links
- **Sidebar panels** — Collections, Tags, and Hostnames appear as separate panels in the always-open page sidebar. The sidebar cannot be closed while a link file is open. Click a panel header to expand it. The breadcrumb in the toolbar shows the current filter path.
  - **Collections panel** — Shows the category tree (all categories + their links). Click a category folder to filter the main link list. Click a link to open it in the main view. The panel header has a **Show in main view** button (chevron-right, right edge) that brings the link list back as the main editor. The button is always visible; it turns blue when the link editor is already the main view.
  - **Tags panel** — In addition to the tag list, the Tags panel shows a resizable bottom pane listing all links in the selected tag. Click a link to open it. When the main editor is an audio player, clicking a link in this pane establishes the tag set as the audio source, enabling **Next Track** and **Shuffle** navigation within that tag. The pane scrolls automatically to highlight the current track as the player auto-advances.
  - **Hostnames panel** — In addition to the hostname list, the Hostnames panel shows a resizable bottom pane listing all links under the selected hostname. Click a link to open it. `mneme://` links are excluded from this panel — they appear only in Collections and Tags.
- **Multiple view modes** — List, Landscape tiles, Portrait tiles (normal and large variants)
- **View mode per category, per tag, and per hostname** — each filter remembers its preferred layout
- **Image tiles** — tile views display preview images with "no image" placeholder for links without images
- **Edit/Create dialog** — title (auto-growing), URL, category (with autocomplete), tags (chip-based with autocomplete), image URL with preview, **Target** editor dropdown (auto-detect, Text Editor, Browser, Image Viewer, Markdown Preview, HTML Preview, SVG Preview, JSON Grid, CSV Grid)
- **Search** — toolbar search filters links by title or URL
- **Context menu** — Edit, Open in Default Browser, Open in Internal Browser, browser profiles, Open in Incognito, Copy URL, Pin/Unpin, Delete
  - For links with images: Copy Image URL, Open Image in New Tab (opens in Image Viewer)
- **Delete confirmation** — with Ctrl+click bypass for quick delete
- **Double-click** to open a link in list and tile views. Use the right-click context menu → **Edit** to open the edit dialog.
- **Favicons** — cached favicons from the internal browser are displayed next to links in list view and as fallback in tile view
- **Drag-and-drop** — a comprehensive set of drag sources and drop targets:
  - **Reassign links** — drag a link onto a category in the main area or Collections panel to move it to that category.
  - **Reparent categories** — drag a category onto another category to reparent it (confirmation required).
  - **Import from Windows Explorer** — drag files or folders from Windows Explorer onto a **Collections panel category** to create links to them under that category. A dropped folder imports all of its files (including those nested in subfolders) into that category as a flat list — sub-categories are not created. Confirmation is required when more than 100 files are found.
  - **Drop onto main area** — drag files or folders from the File Explorer sidebar (or links from another editor) onto the main link list to import them as new links. Folders are scanned recursively (same 100-file confirmation threshold). Duplicate entries are skipped.
  - **Cross-window link drag** — drag links from a Link editor open in one window and drop them onto a category in another window's Link editor. If a link with the same target already exists in the destination, it is **moved** to the dropped category instead of duplicated.
  - **Drop onto Mneme** — drag a file link from the Link editor onto a Mneme knowledge-base tree node to copy that file into Mneme. Non-file links (web URLs) are ignored when dropped onto Mneme.
  - **Drop from Mneme tree** — drag a document node from the Mneme tree (the sidebar panel in a Mneme root or search editor) onto a Collections panel category or the main links area to create a `mneme://` link to that document.
- **Tag editing in tooltips** — Hover over any link to see its tooltip. The tooltip includes a tag section: all available tags appear as clickable badges (highlighted when assigned to the link). Click a badge to toggle the tag on or off. An inline input at the end of the badge row lets you type a new tag name and press Enter to add it.
- **Pinned links panel** — pin important links for quick access; pinned panel appears on the right edge, auto-hides when empty, resizable, with drag-to-reorder support. Double-click a pinned link to open it. Right-click for a context menu: Edit, Open in Default Browser, browser profiles, Open in Incognito, Copy URL, Unpin, Delete. Hover a pinned link to see a rich tooltip with title, URL, and thumbnail image.
- **Save behavior and navigation safety**
  - The **Collections** panel shows a **Save** button whenever the collection has unsaved changes — whether the Link editor is the active main-area tab or shown via the sidebar panel.
  - A modified Link editor (with pending collection changes) is preserved across any navigation: opening a file from Windows Explorer, switching tabs, or clicking links in the Tags, Collections, or Hostnames panels. The editor stays in the sidebar until you save or explicitly close its panel.
  - The "Do you want to save changes?" dialog appears only when you close the Link editor tab itself, not when navigating within or away from it while it remains in the sidebar.
- **Session state persistence** — selected category, tag, hostname, and expanded panel are remembered across app restarts
- Can switch to Monaco for raw JSON editing

## Rest Client

For `.rest.json` files — an HTTP request collection editor:

- **Sidebar + detail layout** — request collection tree in the always-open page sidebar, request detail in the main area
- **Request collection** — organize multiple HTTP requests in a single file
- **Collection grouping** — requests can be organized into named collections (one level deep). Collections are virtual — derived from each request's `collection` field. Drag-drop requests between collections, use context menus to add/delete/duplicate, and edit collection and request names inline in the header bar. New requests inherit the collection of the currently selected request. You can also drag links from the Links editor (or files from the File Explorer) onto a collection or request to create new requests pre-populated with those URLs.
- **Add, delete, rename, reorder** requests within the collection
- **Request body types** — choose between **none**, **x-www-form-urlencoded** (key-value editor), **raw** body with a language sub-selector (JSON, JavaScript, HTML, XML, plaintext), **binary** (file picker that streams from disk), or **form-data** (multipart/form-data with text and file fields per row). Raw body uses Monaco Editor with syntax highlighting. Content-Type header is set automatically when you switch body type or language. Binary uploads stream directly from disk with no file size limit.
- **Smart defaults** — changing the HTTP method syncs the body type (e.g., GET clears the body, POST defaults to raw). Pasting from clipboard auto-detects JSON or form-urlencoded content.
- **Binary response handling** — Binary responses (images, PDFs, octet-stream, etc.) are automatically detected. A dedicated panel shows the content type, size, and a "Save to File" button. Image responses also display an inline preview with an "Open in Image Viewer" button.
- **Header view switch** — Request and response headers have a **Table/JSON** toggle. Table view shows the default key-value editor (request) or HTML table (response). JSON view displays headers as a JSON object in Monaco Editor — editable for request headers (valid JSON updates the headers immediately) and read-only for response headers. Invalid JSON in request headers shows a warning when switching back to Table view or sending the request.
- **Result integration** — "Open in new tab" opens the response body in a Monaco tab with the correct language. "Copy as JSON" on response headers and request headers copies them as a JSON object. "Copy as..." on the request bar exports as cURL (bash/cmd), fetch, or fetch (Node.js). Collections and requests can be opened in a new rest-client tab via the tree context menu.
- **Content-based detection** — JSON files with `"type": "rest-client"` and a `"requests"` property automatically show the Rest Client switch button
- Can switch to Monaco for raw JSON editing

Create a new Rest Client page via the **+** menu → **Rest Client**.

## Environment Variables Editor

For `.env.json` files — a structured editor for [Board environment variables](./boards.md#environment-variables--secrets-outside-the-board-folder), Persephone's per-board secrets store kept outside board folders:

- **Namespace list** (left pane) — every namespace (board) currently stored in the file. Click one to select it; add or delete a namespace directly from this pane.
- **Profile tabs + variable grid** (right pane) — tabs for the selected namespace's profiles (`default` plus any custom profiles a board has written, e.g. `dev`/`qa`), and below them a two-column (Name/Value) grid for that profile's variables. Values are shown in plain text — there is no masking, since this is a local file on your own machine.
- **Grid editing** — add, edit, and delete variables with the same range-select, copy/paste, and add-row behavior as any other Persephone grid. An empty or duplicate variable name shows a validation warning and is not applied until fixed.
- **Locked state** — an encrypted, not-yet-unlocked file shows a "Locked" message with an **Unlock** button instead of its contents; unlocking reuses the standard password dialog.
- **Save** — `Ctrl+S` persists changes, re-encrypting automatically if the file is encrypted. Can switch to Monaco for raw JSON editing.

Opening the file from **Settings → Board Environment Variables → Open Environment Variables** opens the currently-configured store file; a board calling `persephone.var.show()` opens the same file pre-scoped to its own namespace. See [Boards — Environment variables](./boards.md#environment-variables--secrets-outside-the-board-folder) for the full feature reference.

## Folder View

Opens when you click a folder in the File Explorer or Archive panel. Displays the folder's contents in the main editor area with list or tile layouts.

You can also open a folder from outside the app: pass a folder path on the command line, or use the **"Open with persephone" for folders** Explorer context-menu entry (enabled during install — see [Getting Started — Installation](./getting-started.md#installation)). Either one opens a new tab with the File Explorer panel rooted at that folder, same as the **Open Folder** pinned tool.

- **List mode** — Files and folders shown as a vertical list with file-type icons
- **Tile modes** — Switch between landscape tiles, portrait tiles (normal and large) for a visual grid layout. Images show a preview thumbnail — including images inside an archive (e.g. browsing `document.docx!word/media` in the Archive panel), so opening an Office file's media folder in a tile mode gives you a visual contact sheet of its embedded pictures; links show favicons as fallback icons
- **View mode per folder** — Each folder remembers its preferred view mode. Child folders inherit the parent's mode unless overridden
- **Breadcrumb navigation** — The toolbar shows a breadcrumb with the root folder name and one chip per ancestor folder, up to the current folder. Click any chip to jump to that ancestor. On deep paths the breadcrumb clips the start (root side) so the current folder is always visible
- **View mode toggle** — Switch between list and tile modes using the toolbar button
- **Single click to select** — Click an item to highlight it; double-click to open files or navigate into folders
- **Sidebar sync** — The sidebar panel tree stays in sync with the folder you are viewing
- **Works with any tree provider** — File Explorer folders, archive subfolders, and link categories all use the same Folder View with breadcrumb

**Right-click context menu:**

Right-clicking a file or folder item opens a context menu with link actions:

| Action | Description |
|--------|-------------|
| Open in New Tab | Opens the item in a new tab |
| Open in New Window | Opens the item in a new Persephone window |
| Show in File Explorer | Reveals the file or folder in Windows Explorer |
| Open in Browser | (URL items only) Opens the link in the built-in browser |
| Open in Rest Client | (URL items only) Opens the link as a Rest Client request |
| Copy Path | Copies the full path or URL to the clipboard |
| Cut | (file-system folders only) Cuts the file or folder to the Windows clipboard |
| Copy | (file-system folders only) Copies the file or folder to the Windows clipboard |
| Rename | Renames the file or folder inline |
| Delete | Deletes the file or folder (with confirmation) |

Right-clicking an empty area (no item under the cursor) opens a **New** menu — available for writable locations such as file-system folders (not archive subfolders):

| Action | Description |
|--------|-------------|
| New File | Creates a new empty file in the currently-viewed folder |
| New Folder | Creates a new subfolder in the currently-viewed folder |
| Paste | (file-system folders only) Pastes files/folders cut or copied from Windows Explorer (or another Persephone Explorer panel) into the currently-viewed folder |

Right-clicking a **subfolder** item in the list also offers **New File** and **New Folder** options, which create the item inside that subfolder rather than the currently-viewed folder.

**Footer:** The item count ("N items") is displayed in the right-aligned footer bar, matching the height and font of the Monaco editor status bar.

The Folder View uses editor ID `"category-view"` in scripts:
```javascript
// Open the folder view for a directory
app.pages.addEditorPage("category-view", "", "My Folder");
```

## Archive Editor

Opens automatically when you open an archive file. Supports:
- **ZIP-based:** `.zip`, `.docx`, `.xlsx`, `.pptx`, `.jar`, `.war`, `.epub`, `.odt`, `.ods`, `.odp`
- **Multi-format (read-only):** `.rar`, `.7z`, `.tar`, `.tar.gz`, `.tar.bz2`, `.tar.xz`, `.cab`, `.iso`
- **Electron:** `.asar`

**How it works:**

- **Archive panel** — Opens in the page sidebar showing the archive's file tree. Click the Archive panel header to expand it and browse entries as a folder tree.
- **Inline entry viewing** — Click any file inside the archive to view it in the main editor area. Text-based files (XML, JSON, CSS, etc.) open in Monaco; images open in the Image Viewer; PDFs open in the installed **PDF Viewer** board (see [PDF Viewer](#pdf-viewer)) if you have it, or as a Text Editor warning otherwise.
- **Entry highlighting** — The Archive panel highlights the currently viewed entry in the tree as you navigate between files.
- **Auto-reveal** — When the Archive panel is expanded, navigating to a file automatically expands its parent folders and scrolls the tree to reveal the entry.
- **Auto-expand/collapse** — The Archive panel expands automatically when navigating to files inside the archive and collapses when you navigate away to unrelated files.
- **Read-only (non-ZIP)** — RAR, 7z, TAR, and other non-ZIP formats are read-only. ZIP-based archives support writing entries back. To read individual entries in scripts, use `io.ArchiveTransformer` with `io.FileProvider`.
- **Open as Archive** — Right-click an archive file in the File Explorer and choose **Open as Archive** to browse it in a dedicated Archive tab.
- **ASAR archives** — Electron `.asar` files open the same way. File operations are disabled inside `.asar` archives.

## Git Tree

Requires **Git integration** to be enabled (see [Settings — Git Integration](#git-integration-setting)).

The Git Tree editor shows the commit history of a git repository as a scrollable list. To open it, click the small **Open Git Tree** button (git icon) that appears on the right side of the **`.git`** row in the **File Explorer** panel — this entry appears automatically for any folder that is (or contains) a git repo root. Clicking the `.git` row itself expands or collapses it and opens the folder's plain contents; only the trailing icon button opens the Git Tree editor.

**Columns:**

| Column | Description |
|--------|-------------|
| Graph | Swimlane graph showing branch topology; auto-sized to the number of branch lanes |
| Message | Commit subject line; ref labels (branch, tag) appear inline |
| Author | Commit author name |
| Time | Commit date and time in `YYYY-MM-DD HH:mm` format (24-hour, local time) |
| Hash | Abbreviated commit hash — shown in **green** on the HEAD commit (the currently checked-out commit), so the active position is always visible even when HEAD is detached |

Column widths and order are remembered. Resize or reorder any column and the layout is saved — it survives **Refresh**, **Load more**, navigating away and back, and app restarts. The Graph column is the exception: it auto-sizes to fit the branch lane count and ignores any saved width.

**Full graph:** The Git Tree shows commits from **all branches** (equivalent to `git log --all`), matching the view in Git Extensions. Switching to a branch that is behind another branch (e.g. an older `develop` while `main` is ahead) keeps the full history visible — you do not lose commits that are only reachable from other branches.

**Toolbar:**

The toolbar has two groups separated by a divider. The left cluster shows repository context and remote actions; **Refresh** stays on the right.

Left cluster (left to right):

- **"Repo:" label** — static label identifying the cluster as repository controls.
- **Repository name badge** — the repository folder name. Hover to see the full path to the repository root.
- **Ahead / behind indicator** — shows `↑N` (local commits not yet pushed) and `↓N` (remote commits not yet pulled) for the current branch. Only visible when the branch has a configured remote tracking branch. Updated on every refresh.
- **Pull (split-button)** — fetches and merges the upstream into the current branch in one step (`git pull`). The button has two parts:
  - **Primary click** — runs **Pull (merge)**: fetches from the upstream and merges it into the working tree.
  - **Caret (▾)** — opens a dropdown with two items:
    - **Pull (merge)** — same action as the primary click.
    - **Fetch all** — runs `git fetch --all --prune`, downloading all remotes and removing stale remote-tracking branches (the action the standalone Fetch button performed in earlier versions).
  - The Pull button is **disabled** (greyed out) when the current branch has no configured upstream tracking branch. The **Fetch all** dropdown item remains available regardless.
  - **On success:** if the branch was already up to date, a toast shows "Already up to date." If the pull merges new commits, the commit grid refreshes automatically.
  - **Conflicts:** if the merge produces conflicts, a toast lists up to 5 conflicted files and the files appear in the **Changes** panel's **Unstaged** list with status `U`. Resolve conflicts in an external editor or the File Diff view, then commit.
  - **Authentication:** pull over HTTPS uses the OS credential manager or SSH agent — Persephone shows no in-app credential prompt. If no credential is stored and authentication is required, the operation fails immediately with an error toast.
- **Push** — pushes the current branch to its remote tracking branch. The first push of a newly created branch automatically sets the upstream (`-u`). Push never force-pushes; a non-fast-forward rejection shows a toast asking you to pull first. Authentication uses the OS credential manager or SSH agent — no in-app credential prompt.

Right side:

- **Refresh** — reloads both the commit history and the Git panel from disk.

**Pagination:** The first 200 commits load immediately. A **Load more** row at the bottom of the list appends the next 200 commits. A **Load all** option fetches the entire history at once (use with care on very large repos).

**Switching branches and commits:**

Right-click any commit row in the grid to open a context menu with **Switch** operations. Switching is the same action as `git switch` / `git checkout` and changes the working tree:

- **Switch to Branch '…'** — checks out a local branch. The current branch is listed as disabled ("current").
- **Switch to Remote Branch '…'** — creates a local tracking branch (named after the remote branch) and checks it out. If the local branch already exists, switches to it.
- **Switch to Commit `<hash>`** — detaches HEAD at that exact commit. This item appears only when no local branch points at the commit; otherwise the branch item is shown instead.

A switch that git refuses (for example, because uncommitted changes would be overwritten) shows an error toast. No confirmation dialog is shown before switching — cancel by dismissing any outstanding changes first.

After a switch the commit grid and the **Git** panel both refresh automatically.

**Creating a branch at a commit:**

Right-click a single commit row and choose **Create branch here…** to create a new branch at that commit and check it out. A prompt asks for the branch name. The new branch becomes the current branch (shown in green in the graph and the Git panel) once the operation completes. Selecting multiple rows disables the item — it only applies to a single commit.

If the name is invalid (e.g. contains spaces or other disallowed characters) or already exists, an error toast appears and no branch is created. Creating a branch at a historical commit moves the working tree to that commit — if uncommitted changes would be overwritten, git refuses the operation and a toast describes the error.

**Git panel:**

When the Git Tree editor is open, a **Git** panel appears in the sidebar. The panel header shows a **"Git (N)"** title where *N* is the total count of changed files (unstaged + staged combined, counted once per file). The count is visible even when the panel is collapsed, so you can see at a glance which repositories have uncommitted work.

The panel has three tabs selected with a segmented control:

- **Changes** (default) — working-tree and staged file lists. The panel body shows the same Unstaged and Staged grids described below.
- **Branches** — repository branches rendered as a tree with `/`-folder nesting. Local branches are listed under **Branches**; remote tracking branches are nested under **Remotes** (one entry per configured remote, e.g. `origin`). The checked-out branch is displayed in **green** (matching the green ref label in the commit grid).
- **Tags** — flat list of all tags.

**Ordering (Branches and Tags tabs):** By default refs appear most-recent-first (the branch or tag with the newest commit is at the top). Click the **AZ** button in the panel body toolbar to switch to alphabetical order; click again to return to historical order. The preference is saved across restarts. The AZ button only appears on the Branches and Tags tabs.

**Click to reveal (Branches and Tags tabs):** Clicking a branch or tag focuses that ref's commit in the commit grid (scrolls to it and highlights the row). If the commit is not yet loaded (pagination), the last loaded row is focused instead so the **Load more / Load all** controls are visible.

**Right-click to switch (Branches and Tags tabs):** Right-click any branch, remote branch, or tag leaf to open a Switch context menu:

- **Switch to Branch '…'** — checks out the local branch. The current branch is listed as disabled.
- **Switch to Remote Branch '…'** — creates or reuses a local tracking branch and checks it out.
- **Switch to Tag '<name>' Commit** — detaches HEAD at the tagged commit.

The panel header has two buttons:

- **Show in main view** (chevron-right, right edge) — brings the Git Tree commit graph back as the main editor. The button is always visible; it turns blue when the Git Tree is already the main view. Use this after clicking a file or ref opened a diff as the main editor.
- **× (Close Git Tree)** — removes the Git Tree editor entirely (see [Closing the Git Tree](#closing-the-git-tree) below).

**Changes tab — file lists:**

The Changes tab is split into two parts:

- **Unstaged** (top) — working-tree modifications not yet staged, plus untracked files. Git-ignored files are not shown.
- **Staged** (bottom) — files currently in the git index (ready to commit).

Each list is displayed as a three-column grid:

| Column | Description |
|--------|-------------|
| Icon | File-type icon |
| Path | Repo-relative path — the column header shows the section name (**Unstaged** or **Staged**) |
| Status | Colored status badge (right-aligned) |

| Badge | Meaning |
|-------|---------|
| `M` | Modified |
| `A` | Added (staged new file) |
| `D` | Deleted |
| `R` | Renamed |
| `?` | Untracked (new file, not yet staged) |

Click a column header to sort by that column. Click again to reverse the sort order.

**Selecting files:** Click a row to select it. **Shift-click** extends the selection. **Ctrl+A** selects all rows in that list. You can also drag to select a range.

**Single-click to diff:** Clicking a file row opens its **Git Diff** in the main area. The Git panel stays open so you can click through files one by one. The comparison preselected depends on which list you click:

- **Unstaged list** — opens **Staged ↔ Unstaged** (what you have changed but not yet staged). This is the standard working-tree diff.
- **Staged list** — opens **Last commit ↔ Staged** (what will be included in the next commit). This comparison shows meaningful changes even for a fully-staged file (where Staged ↔ Unstaged would be identical and appear empty).

The body toolbar has one button (Changes tab only):

- **Refresh** — reloads the file status and the commit history.

When a list has no files, it shows a **"No changes"** label.

**Staging and unstaging files:**

The Changes tab lets you move files between the **Unstaged** and **Staged** lists. Three ways to do it:

- **Arrow buttons on the Staged list header** — select one or more files in a list, then click the arrow button on the **Staged** list's header: **↓** stages the current Unstaged selection; **↑** unstages the current Staged selection.
- **Double-click** — double-click any file row to move it to the other list. Double-clicking an Unstaged row stages the file; double-clicking a Staged row unstages it.
- **Right-click context menu** — right-click one or more selected rows and choose **Stage N files** or **Unstage N files**.

A file that has been partially staged (modified after staging) appears in **both** lists simultaneously. Double-clicking the Unstaged row fully stages it; double-clicking the Staged row fully unstages it.

**Resetting files (Unstaged only):**

Right-click one or more rows in the **Unstaged** list and choose **Reset N files** to discard uncommitted changes and restore the file(s) to the last staged or committed version. Untracked files are deleted. A confirmation dialog appears before the reset is applied.

**Committing staged files:**

A **Commit** button sits in a bar above the **Staged** list (alongside the stage/unstage arrow buttons). The button is disabled when the Staged list is empty.

Clicking **Commit** opens a dialog with:

- **Branch** — an editable field showing the branch the commit will land on. It is prepopulated with the current branch name. The field is required: leaving it empty disables the action button and shows a red border.
  - **Keep the prefilled name** to commit to the current branch as normal.
  - **Type a different name** to create a new branch and commit onto it. The new branch is created and checked out first (carrying your staged changes), and then the commit is made. The action button relabels to **"Create Branch & Commit"** when the name differs from the current branch.
  - **Detached HEAD** — when HEAD is not on any branch (e.g. after switching to a commit or a tag), the field starts empty and must be filled before you can commit. This ensures the new commit is kept on a real branch instead of becoming unreachable after the next checkout.
- **Author** — editable **Name** and **Email** fields, prepopulated from your git config (`user.name` / `user.email`). Changes here apply only to this commit — your git config is never modified.
- **Message** — a multi-line text area for the commit message. The action button is disabled until both a branch name and a message are entered.

From the dialog:

- Click **Commit** (or **Create Branch & Commit**, or press **Ctrl+Enter**) to commit all staged files with the message and author shown.
- Click **Commit & Push** (or **& Push** when a new branch name is typed) to commit and immediately push the result to the remote in one step. The first push of a newly created branch sets the upstream automatically. If the push is rejected after a successful commit, the commit is kept and a toast describes the push failure.
- Click **Cancel** (or press **Esc**) to close without committing.

On success the **Staged** list clears and the new commit appears at the top of the Git Tree. On failure (e.g. the branch name is invalid, the name already exists, no git identity configured, or a failing pre-commit hook) a toast notification describes the error and **the dialog stays open** — your message and branch name are preserved so you can fix the problem and retry without retyping.

**Multiple repositories:**

When two or more repositories are open in the same page (e.g. you clicked the **Open Git Tree** button on a second repo's `.git` row while the first repo's Git Tree is already open), each repository gets its own **Git** panel in the sidebar. The panels are independently expandable and collapsible. Re-opening the same repo's `.git` entry does not create a duplicate panel.

**Commit panel:**

Below the commit grid, a resizable **bottom panel** shows details about the selected commit. The panel has two tabs:

- **Commit** — displays the selected commit's author (name and email), date, full commit hash, ref badges (branches and tags at that commit), and the full commit message (multiline). With no commit selected, the panel shows a hint: *"Select a commit to see its details."*
- **Diff** — shows a split view of the files changed in the selected commit:
  - **Left side — changed files list.** Each row shows the file path with a colored status badge: `M` modified, `A` added, `D` deleted, `R` renamed. Click a row to load its diff on the right — the selected row is highlighted. Right-clicking a row also selects it (so the diff updates) and opens a context menu with **"Open in new Tab"** — this opens the file in a new tab as a File Diff preselected to **previous commit ↔ selected commit**, which is the same comparison shown inline. For a root commit (no parent), the left side is empty, showing all additions. A new-tab File Diff opened this way starts with the **File History** panel expanded.
  - **Right side — inline diff.** Shows the full content diff for the selected file, comparing the parent commit (before) to the selected commit (after). The diff is displayed as a single inline column (not side-by-side) because the panel is compact. With no commit selected, or before clicking a file, the right side shows an empty placeholder.
  - The divider between the file list and the inline diff is draggable; its position is saved and restored across restarts.

Drag the divider between the commit grid and the panel to resize it. The panel height is capped at 80% of the editor height so the commit list is never completely crowded out. Both the panel height and the active tab persist across navigation-away/back and app restarts.

**Closing the Git Tree:**

The Git panel does not close on its own — navigating away or switching editors leaves it open. The only way to close it is the **×** button in the **Git** panel header. Clicking it tears down the entire Git Tree editor and removes the Git panel. What happens to the main area depends on what is shown there:

- **Git Tree is the main editor** — the Git Tree editor is removed and the page becomes empty (the tab stays open as a blank tab).
- **Git Diff is the main editor** (you opened a diff by clicking a file in the Changes tab) — the Git Tree and the Git panel are removed; the diff view stays as the main editor.

**Auto-refresh:**

The Git Tree and the Git panel update automatically when the repository changes on disk — no manual **Refresh** needed. Saving a tracked file, staging or unstaging, committing, checking out, merging, or fetching all trigger a refresh within about half a second. Auto-refresh is always on when Git integration is enabled.

The Git Tree supports inspecting history, browsing branches and tags, switching branches and commits, staging/unstaging files, committing staged changes, pulling (fetch + merge), fetching from all remotes, and pushing the current branch. Merge operations initiated outside of pull are not yet available.

## Git Diff

Requires **Git integration** to be enabled (see [Settings — Git Integration](#git-integration-setting)).

The Git Diff editor is a revision comparison view surfaced via the editor switch toolbar for any text file that is tracked by a git repository. Click **Git Diff** in the switch toolbar (next to Text Editor, Preview, etc.) to activate it.

**Toolbar controls:**

The **From** / **To** revision pickers sit at the left end of the toolbar. Each picker is a button showing the active revision label; clicking it opens a popover with a compact commit list scoped to the file's history. At the top of every list, **Unstaged** and **Staged** (when staged changes exist) appear as inline rows — so all revision choices live in one scrollable list with no separate buttons needed.

- **From** button — the left (original) side of the diff. Choose **Staged** (git index, shown only when the file has staged changes) or any specific commit from the list.
- **To** button — the right (modified) side. Choose **Unstaged** (current working-tree content), **Staged** (git index, shown only when staged changes exist), or a specific commit.

The **Run Script** toolbar button does not appear on the Git Diff editor — running a script over a read-only diff is not supported.

**Default view:** When you first open Git Diff for a file, the comparison defaults to the file's latest commit (left) versus **Unstaged** / working tree (right). This immediately shows what you have changed since the last commit.

**Editing:** When **To** is **Unstaged**, the right pane is a live editor — changes you make are written back to the file on disk. All other combinations (commit ↔ commit, commit ↔ staged, etc.) are read-only.

**Commit picker:** Commit dates in the picker are shown in `YYYY-MM-DD HH:mm` format (24-hour, local time).

**File History panel:** When the Git Diff editor is active, a **File History** panel appears in the page sidebar. It lists the file's commits with the same two-column layout used by the toolbar popovers — **Unstaged** (and **Staged**, when the file has staged changes) at the top, followed by the file's full commit history. Each row has two toggle buttons, **L** (left / "From" side) and **R** (right / "To" side), highlighted in blue to show which version is currently loaded on each side. Click **L** on a row to set that revision as the left side; click **R** to set it as the right side. The Unstaged row offers only an **R** toggle (the working-tree copy can only be the right side). The File History panel and the toolbar From/To dropdowns share a single selection — changing one updates the other. A **Refresh** button in the panel header reloads the file's history. The panel is shown only while the Git Diff editor is the active view; it disappears automatically when you switch back to the Text Editor or navigate to a different file.

**Persistence:** The selected From/To pair is saved with the tab and restored on the next app start or when the tab is re-opened via drag-and-drop between windows.

**Error state:** If the file is not inside a git repo, or git is unavailable, the editor shows an explanatory message with a **Switch to Text Editor** button. The **Git Diff** switch button is also hidden for those files.

## Git Integration Setting

Git features (Git Tree and Git Diff) are disabled by default. To enable them:

1. Open **Settings** (sidebar button or **Tools & Editors** panel).
2. Scroll to the **Git Integration** section.
3. Check **Enable Git integration**.

When the checkbox is on, Persephone immediately probes for git on your PATH and shows the result inline:
- A green dot and "Git 2.x.x detected" — git is found and ready.
- A grey dot and "git not found on PATH" — install git or fix your PATH, then toggle the setting off and back on to re-probe.

When the checkbox is off (the default), Persephone performs zero git activity — no background processes, no disk access beyond normal file opening.

## MCP Inspector

A tool for connecting to and testing MCP (Model Context Protocol) servers. Open it from the **+** dropdown → **MCP Inspector** (if pinned), or from the **Tools & Editors** panel.

**Features:**

- **Connection panel** — Enter a server URL (HTTP transport) or a command with arguments (stdio transport). Give the connection a display name for easy identification.
- **Connect / Disconnect** — Connect to any MCP server and see its capabilities instantly.
- **Tools tab** — Lists all tools exposed by the server. Select a tool to see its input schema and run it with custom arguments. Results are shown as formatted JSON.
- **Resources tab** — Lists resources and resource templates provided by the server. Click a static resource to read and display its content. Click a resource template to open a parameter input form — fill in the URI parameters and click **Read Resource** to construct the URI and read the resource. Results render adaptively (Markdown, JSON, images, binary).
- **Prompts tab** — Lists prompt templates. Select a prompt, fill in any arguments, and preview the resulting messages.
- **Request history** — A collapsible history panel records all requests and responses with timing information, useful for debugging.
- **Scripting API** — Scripts can interact with MCP Inspector pages via `const mcp = await page.asMcpInspector()`. See the [asMcpInspector() API reference](./api/page.md#asmcpinspectorpromiseimcpinspectoreditor) for details.

Open an MCP Inspector page programmatically:
```javascript
await app.pages.showMcpInspectorPage({ url: "http://127.0.0.1:7865/mcp" });
```

## Mneme Knowledge Base

Requires **Mneme** to be enabled (Settings → **Mneme (vector memory)** → **Enable Mneme**; off by default).

Mneme is an optional, local knowledge base that indexes folders of Markdown for full-text and semantic search. It surfaces as two editors:

- **Config & monitoring editor** — open from the **Tools & Editors** panel → **Mneme**. Manage indexed roots, include/ignore patterns, reindexing (with live progress), and the semantic-search embedding model. Toolbar buttons restart the service, open it in the MCP Inspector, and open its log.
- **Mneme root editor** — click the small **Open Mneme Root** button (memory icon) that appears on the right side of the **`.mneme`** row in the **File Explorer** (shown for any indexed folder while Mneme is enabled, mirroring the `.git` entry). Clicking the `.mneme` row itself expands or collapses it and opens the folder's plain contents; only the trailing icon button opens the Mneme root editor. The editor opens a search view (Text / Vector / Hybrid modes, tag and date filters, Markdown results) with an Explorer-like document tree in the sidebar for browsing, editing, and organizing documents.

AI agents can read, search, and maintain the same knowledge base over MCP.

See **[Mneme — Knowledge Base](./mneme.md)** for complete documentation.

## Board

A sandboxed HTML-page application that can live anywhere on disk. Boards let you build fully custom UIs backed by scripts in any language (Node.js, Python, PowerShell, shell, …).

**Opening:** Click the **Boards** button in the **File Explorer** header to open the **Boards** panel, which lists every trusted board under the current Explorer root. Click any board name to open it. You can also click the **Open Board** button that appears on any `board-manifest.json` row in the Explorer, or open one from the **Tools & Editors** panel → **Boards** tab.

**Installing a board published by the project:** open a file whose type has no editor installed yet but matches a board Persephone publishes (e.g. a `.drawio` diagram) and a **+** entry appears next to **Text** in the editor-switch control — click it to download and install that board in a couple of clicks. See [Boards — Published boards catalog](./boards.md#published-boards-catalog--discover-install-update).

**Key features:**

- **Owns its own UI** — you (or an AI agent) write plain HTML + CSS + JS; Persephone only hosts the page
- **`persephone.execute()` channel** — call backend scripts from the page; consume the result buffered (`getJson()`, `getText()`) or streamed (`on("stdout", …)`)
- **Integration tier** — `notify()`, `openFileDialog()`, `saveFileDialog()`, `openFolderDialog()`, `openRawLink()`, `readFile()`, `writeFile()`
- **`--p-*` theme contract** — CSS variables injected into the board that update live when the user switches app themes
- **Reload** — click the **Reload** button in the in-board toolbar to remount the board and pick up edited files; boards do not reload automatically on file changes
- **In-board toolbar** — Reload, Show-log, the board path, and (when opened from a Boards panel) a click-to-switch boards popover for the current Explorer root
- **Custom icon** — place `icon.svg`, `icon.png`, or `icon.ico` in the board folder to set the board's tab icon and Boards-panel icon
- **Error log** — script failures are toasted and appended to `ui.log` in the board folder
- **Can act as a custom editor** — a trusted board that declares `fileMasks` in its manifest appears in the editor-switch toolbar for matching files, and can become their default editor. By default the board reads/writes the file itself (local files only); setting `editorKind: "content-host"` instead lets Persephone own the file — encoding, encryption, auto-save, and unsaved-changes tracking come free, the board works over `https://`/archive/encrypted files too, and it shares its content live with the Text Editor/Grid on switch. See [Boards — Custom editors](./boards.md#custom-editors--associate-a-board-with-a-file-type)

**Creating a board:** Click **New board** in the **Boards** Explorer-sibling panel (or use the caret for **Create Demo board**). A dialog prompts for a **folder** (defaults to the current Explorer root) and a **name**; a live label shows the final path. Both fields are required.

**Trust gate:** Before any board renders, you must explicitly trust it. A warning dialog states that trusting lets the board's scripts run programs with your full user privileges. Trust is per board folder, remembered across restarts. Boards inside an already-trusted folder are covered automatically (inherited trust).

**MCP automation:** AI agents can drive an open board using the `browser_*` MCP tools (same Playwright-compatible tools used for the built-in browser). Find the board in `list_pages` by `editor: "board-view"`, then use `browser_snapshot`, `browser_click`, `browser_evaluate`, etc. to test and debug without touching source files.

**Recommended components:** Persephone publishes a catalog of component libraries (Tabulator, Chart.js, Flatpickr, Tom Select, Mermaid, and more) with pre-built skins that match the `--p-*` theme. The catalog lives in `boards-assets/` in the repository.

See **[Boards](./boards.md)** for complete documentation.

## Switching Editors

Some files support multiple editors:

| File Type | Available Editors |
|-----------|-------------------|
| `.json` | Text, Grid |
| `.note.json` | Text, **Notebook (default)** |
| `.link.json` | Text, **Links (default)** |
| `.csv` | Text, Grid |
| `.jsonl` / `.ndjson` | Text, Grid |
| `.md` / `.markdown` (and other recognized Markdown extensions) | Text, **Preview (default)** |
| `.svg` | Text, Preview |
| `.html` | Text, Preview |
| `.mmd` | Text, Mermaid |
| `.excalidraw` | Text, **Drawing (default)** |
| `.fg.json` | Text, **Graph (default)** |
| `.rest.json` | Text, **Rest Client (default)** |
| `.zip`, `.docx`, `.xlsx`, etc. | Archive Editor |
| `.asar` | Archive Editor (read-only) |
| `.pdf` | Text only, unless the [PDF Viewer board](#pdf-viewer) is installed (then that board, by default) |
| `.mp4`, `.webm`, `.avi`, `.mkv`, `.mov`, `.m3u8`, `.m3u` | Video Player only |
| `.mp3`, `.wav`, `.aac`, `.flac`, `.m4a`, `.wma`, `.ogg`, `.opus` | Video Player only (audio with visualizer) |
| Images | Image Viewer only |
| Any text file in a git repo (requires Git integration enabled) | + Git Diff |
| Other | Text only |

Use the buttons in the toolbar to switch between available editors. Where a row marks one editor **(default)**, that is the editor the file opens in and Text is the switch option; otherwise the file opens in the Text editor and the others are switch options.

**Content-based detection:** JSON pages that contain a `"type"` property (`"note-editor"`, `"link-editor"`, `"rest-client"`, or `"force-graph"`) automatically show the corresponding switch button — even without the special file extension. For the Graph View, the JSON must also contain a `"nodes"` property; for the Rest Client, it must also contain a `"requests"` property. This is useful for pages created via MCP or scripting.

**Board-provided editors:** A trusted [Board](#board) that declares a file association in its manifest also appears in this switch control alongside the built-in entries above — and can be configured to open by default instead of the Text Editor. A "simple" board only offers itself for matching local files; a **content-host** board also offers itself for a file opened over `https://`, inside an archive, or encrypted. See [Boards — Custom editors](./boards.md#custom-editors--associate-a-board-with-a-file-type).

**Quick Add:** Click the dropdown arrow (&#9662;) next to the **+** button in the tab bar to create a new page from your pinned editors. Choose "Show All..." to open the **Tools & Editors** hub page, which lists every available editor, board, and tool (and also lets you search the published boards catalog). You can pin/unpin items and drag to reorder your pinned set. See [Tabs & Navigation](./tabs-and-navigation.md#tools--editors) for details.
