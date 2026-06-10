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

For `.md` and `.markdown` files — click **Preview** in the toolbar:

- **GitHub-flavored Markdown** rendering
- **Text search** — press `Ctrl+F` to find text, `F3`/`Shift+F3` to navigate matches, `Esc` to close
- **Syntax highlighting** in fenced code blocks using Monaco's colorize API (supports all Monaco languages including aliases like `ts`, `js`, `py`, `bash`)
- **Copy-to-clipboard** button on code block hover
- **Inline Mermaid diagrams** — ` ```mermaid ` code blocks render as SVG diagrams with hover toolbar (copy image to clipboard, open in Mermaid editor). Azure DevOps wiki fenced container syntax (`::: mermaid … :::`) is also recognized and rendered as a diagram
- **Live preview** updates as you type
- **Minimap** navigation on the right side
- **Link context menu** — right-click a link for: "Copy Link", "Open in Default Browser", "Open in Internal Browser", browser profiles, "Open in Incognito"

## PDF Viewer

For `.pdf` files — opens automatically:

- Page navigation (scroll or page controls)
- Zoom controls (in/out, fit to page)
- Text search within PDF
- Read-only view

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
- **Save Image to File** — for URL-based images, a toolbar button downloads the image and saves it to disk
- **Open in Drawing Editor** — toolbar button embeds the image into a new Excalidraw drawing tab for annotation

## SVG Preview

For `.svg` files — opens in text editor by default, click **Preview** in the toolbar:

- Same zoom/pan/copy controls as Image Viewer
- **Live preview** of unsaved changes
- **Open in Drawing Editor** — toolbar button embeds the SVG into a new Excalidraw drawing tab for annotation
- Switch between text editor and preview anytime

## Mermaid Diagram Viewer

For `.mmd` and `.mermaid` files — click **Mermaid** in the toolbar:

- Supports all Mermaid diagram types (flowchart, sequence, class, state, ER, Gantt, pie, git graph)
- Same zoom/pan controls as Image Viewer
- **Light/dark theme toggle** (dark by default, light for copying into documents)
- **Copy diagram** to clipboard as image
- **Open in Drawing Editor** — toolbar button embeds the rendered diagram into a new Excalidraw drawing tab for annotation
- **Live preview** with debounced re-rendering
- Mermaid syntax highlighting in the text editor

## HTML Preview

For `.html` files — click **Preview** in the toolbar:

- **Live preview** of unsaved changes
- **JavaScript execution** — scripts in the HTML run in the preview
- **Sandboxed rendering** — preview is isolated from the application
- **Show Resources** — click the web-scraper toolbar button (or use the right-click context menu in the Browser) to extract all resource URLs from the page (images, scripts, stylesheets, media, fonts, iframes, favicons, and links). Results open as a categorized link collection.
- Switch between text editor and preview anytime

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

## Todo Editor

For `.todo.json` files — a structured task list interface:

- **Multiple lists** — organize tasks into named lists (e.g., "Project A", "Personal")
- **Tags** — define colored tags and assign one tag per item for categorization (e.g., "bug", "feature")
- **Sidebar panel** — A **Todo** panel in the page sidebar contains the list selector and tag filter. Click a list to filter items; click a tag to filter by tag. Filters combine with search.
- **Item counts** — each list shows undone/total count badges
- **Quick add** — type and press Enter to add new items
- **Checkbox toggle** — mark items done/undone with a click
- **Sorting** — undone items first, then done items sorted by completion date
- **Drag-to-reorder** — reorder undone items via drag handle (select a specific list first)
- **Optional comments** — add multiline comments to any item
- **Dates** — hover to see created/done dates
- **Search** — toolbar search filters items with highlighted matches
- **Inline editing** — edit titles and comments for both done and undone items
- **List management** — add, rename, and delete lists
- **Tag management** — add, rename, delete tags; assign colors from a predefined palette
- **Session state persistence** — selected list and tag are remembered across app restarts
- Can switch to Monaco for raw JSON editing

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
- **Screen Snip** — toolbar button (scissors icon) captures a screen region and inserts it as an image into the canvas. Hides all persephone windows, shows a dimmed fullscreen overlay on each monitor, and lets you drag-select a region. Press Escape or right-click to cancel. Works on multi-monitor setups with mixed DPI scaling.
- **Library persistence** — custom shape libraries are saved to disk and restored across sessions. Use the "Browse libraries" button to open the Excalidraw libraries site in the internal browser — installing a library adds it directly to the editor. Library storage path is configurable via `drawing.library-path` in Settings (defaults to `<userData>/data/excalidraw-lib/`).
- **Offline ready** — no external dependencies; all assets are bundled
- Can switch to Monaco for raw JSON editing

**Scripting API:** Scripts and MCP agents can interact with drawings via `const draw = await page.asDraw()`. The facade supports inserting images (`addImage`), exporting as SVG or PNG, and querying element count. Use `app.pages.addDrawPage(dataUrl)` to create a new drawing page with an embedded image. See the [asDraw() API reference](./api/page.md#asdrawpromiseidraweditor) for details.

## Link Editor

For `.link.json` files — a structured link manager:

- **Collections**, **tags**, and **hostnames** for organizing and filtering links
- **Sidebar panels** — Collections, Tags, and Hostnames appear as separate panels in the always-open page sidebar. The sidebar cannot be closed while a link file is open. Click a panel header to expand it. The breadcrumb in the toolbar shows the current filter path.
  - **Collections panel** — Shows the category tree (all categories + their links). Click a category folder to filter the main link list. Click a link to open it in the main view. The panel header has a swap button (⇄) to promote the link list into the main editor area (full-page view) or demote it back when a file is already open.
  - **Tags panel** — In addition to the tag list, the Tags panel shows a resizable bottom pane listing all links in the selected tag. Click a link to open it. When the main editor is an audio player, clicking a link in this pane establishes the tag set as the audio source, enabling **Next Track** and **Shuffle** navigation within that tag. The pane scrolls automatically to highlight the current track as the player auto-advances.
  - **Hostnames panel** — In addition to the hostname list, the Hostnames panel shows a resizable bottom pane listing all links under the selected hostname. Click a link to open it.
- **Multiple view modes** — List, Landscape tiles, Portrait tiles (normal and large variants)
- **View mode per category, per tag, and per hostname** — each filter remembers its preferred layout
- **Image tiles** — tile views display preview images with "no image" placeholder for links without images
- **Edit/Create dialog** — title (auto-growing), URL, category (with autocomplete), tags (chip-based with autocomplete), image URL with preview, **Target** editor dropdown (auto-detect, Text Editor, Browser, PDF Viewer, Image Viewer, Markdown Preview, HTML Preview, SVG Preview, JSON Grid, CSV Grid)
- **Search** — toolbar search filters links by title or URL
- **Context menu** — Edit, Open in Default Browser, Open in Internal Browser, browser profiles, Open in Incognito, Copy URL, Pin/Unpin, Delete
  - For links with images: Copy Image URL, Open Image in New Tab (opens in Image Viewer)
- **Delete confirmation** — with Ctrl+click bypass for quick delete
- **Double-click** to open a link in list and tile views. Use the right-click context menu → **Edit** to open the edit dialog.
- **Favicons** — cached favicons from the internal browser are displayed next to links in list view and as fallback in tile view
- **Drag-and-drop** — drag links onto categories to reassign them; drag categories onto other categories to reparent (with confirmation); drag files or folders from the File Explorer (or links from another editor) onto the main area to import them as new links. Folders are scanned recursively (confirmation required if more than 100 files are found). Duplicate entries are skipped.
- **Tag editing in tooltips** — Hover over any link to see its tooltip. The tooltip includes a tag section: all available tags appear as clickable badges (highlighted when assigned to the link). Click a badge to toggle the tag on or off. An inline input at the end of the badge row lets you type a new tag name and press Enter to add it.
- **Pinned links panel** — pin important links for quick access; pinned panel appears on the right edge, auto-hides when empty, resizable, with drag-to-reorder support. Double-click a pinned link to open it. Right-click for a context menu: Edit, Open in Default Browser, browser profiles, Open in Incognito, Copy URL, Unpin, Delete. Hover a pinned link to see a rich tooltip with title, URL, and thumbnail image.
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

## Folder View

Opens when you click a folder in the File Explorer or Archive panel. Displays the folder's contents in the main editor area with list or tile layouts.

- **List mode** — Files and folders shown as a vertical list with file-type icons
- **Tile modes** — Switch between landscape tiles, portrait tiles (normal and large) for a visual grid layout. Images show a preview thumbnail; links show favicons as fallback icons
- **View mode per folder** — Each folder remembers its preferred view mode. Child folders inherit the parent's mode unless overridden
- **Breadcrumb navigation** — The toolbar shows a breadcrumb with the root folder name and one chip per ancestor folder, up to the current folder. Click any chip to jump to that ancestor. On deep paths the breadcrumb clips the start (root side) so the current folder is always visible
- **View mode toggle** — Switch between list and tile modes using the toolbar button
- **Single click to select** — Click an item to highlight it; double-click to open files or navigate into folders
- **Sidebar sync** — The sidebar panel tree stays in sync with the folder you are viewing
- **Works with any tree provider** — File Explorer folders, archive subfolders, and link categories all use the same Folder View with breadcrumb

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
- **Inline entry viewing** — Click any file inside the archive to view it in the main editor area. Text-based files (XML, JSON, CSS, etc.) open in Monaco; images open in the Image Viewer; PDFs open in the PDF Viewer.
- **Entry highlighting** — The Archive panel highlights the currently viewed entry in the tree as you navigate between files.
- **Auto-reveal** — When the Archive panel is expanded, navigating to a file automatically expands its parent folders and scrolls the tree to reveal the entry.
- **Auto-expand/collapse** — The Archive panel expands automatically when navigating to files inside the archive and collapses when you navigate away to unrelated files.
- **Read-only (non-ZIP)** — RAR, 7z, TAR, and other non-ZIP formats are read-only. ZIP-based archives support writing entries back. To read individual entries in scripts, use `io.ArchiveTransformer` with `io.FileProvider`.
- **Open as Archive** — Right-click an archive file in the File Explorer and choose **Open as Archive** to browse it in a dedicated Archive tab.
- **ASAR archives** — Electron `.asar` files open the same way. File operations are disabled inside `.asar` archives.

## Git Tree

Requires **Git integration** to be enabled (see [Settings — Git Integration](#git-integration-setting)).

The Git Tree editor shows the commit history of a git repository as a read-only scrollable list. Open it by clicking the `.git` entry in the **File Explorer** panel — this entry appears automatically for any folder that is (or contains) a git repo root.

**Columns:**

| Column | Description |
|--------|-------------|
| Graph | Swimlane graph showing branch topology; auto-sized to the number of branch lanes |
| Message | Commit subject line; ref labels (branch, tag) appear inline |
| Author | Commit author name |
| Time | Commit date and time in `YYYY-MM-DD HH:mm` format (24-hour, local time) |
| Hash | Abbreviated commit hash |

Column widths and order are remembered. Resize or reorder any column and the layout is saved — it survives **Refresh**, **Load more**, navigating away and back, and app restarts. The Graph column is the exception: it auto-sizes to fit the branch lane count and ignores any saved width.

**Toolbar:**

- **Repository name** — The toolbar displays the repository folder name. Hover over it to see the full path.
- **Refresh** — Reload both the commit history and the Changes panel from disk.

**Pagination:** The first 200 commits load immediately. A **Load more** row at the bottom of the list appends the next 200 commits. A **Load all** option fetches the entire history at once (use with care on very large repos).

**Changes panel:**

When the Git Tree editor is open, a **Changes** panel appears in the sidebar. The panel header shows the repository name and a count of changed files: **[repoName] Changes (n)** (e.g. `[persephone] Changes (3)`). The count reflects the union of unstaged and staged files — a file modified in both lists is counted once. The panel is split into two parts:

- **Unstaged** (top) — working-tree modifications not yet staged, plus untracked files. Git-ignored files are not shown.
- **Staged** (bottom) — files currently in the git index (ready to commit).

Each row shows the repo-relative file path with a file icon and a right-aligned colored **status badge**:

| Badge | Meaning |
|-------|---------|
| `M` | Modified |
| `A` | Added (staged new file) |
| `D` | Deleted |
| `R` | Renamed |
| `?` | Untracked (new file, not yet staged) |

Click any file row to open its **Git Diff** in the main area. The Changes panel stays open so you can click through files one by one. The panel header has three buttons:

- **Refresh** — reloads the file status and the commit history.
- **Show Git Tree** (git icon) — switches the main area back to the commit-graph view. Use this after clicking a file (which opens its Git Diff) to return to the Git Tree without closing the Changes panel.
- **× (Close Git Tree)** — removes the Git Tree editor entirely (see below).

When a list has no files, it shows a **"No changes"** label.

The Changes panel is display-only in this release — staging, unstaging, discarding, and committing are not yet available.

**Multiple repositories:**

When two or more repositories are open in the same page (e.g. you clicked `.git` for a second repo while the first repo's Git Tree is already open), each repository gets its own **Changes** panel in the sidebar. The panels are independently expandable and collapsible. Re-opening the same repo's `.git` entry does not create a duplicate panel.

**Closing the Changes panel:**

The Changes panel does not close on its own — navigating away or switching editors leaves it open. The only way to close it is the **×** button in the panel header. What happens when you click it depends on which editor is in the main area:

- **Git Tree is the main editor** — the Git Tree editor is removed and the page becomes empty (the tab stays open as a blank tab).
- **Git Diff is the main editor** (you opened a diff from the Changes panel) — the Git Tree and Changes panel are removed; the diff view stays as the main editor.

**Auto-refresh:**

The Git Tree and Changes panel update automatically when the repository changes on disk — no manual **Refresh** needed. Saving a tracked file, staging or unstaging, committing, checking out, merging, or fetching all trigger a refresh within about half a second. Auto-refresh is always on when Git integration is enabled.

The Git Tree is read-only — it is an inspection tool. Stage, commit, push, branch, and merge operations are not available in v1.

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
await app.pages.showMcpInspectorPage({ url: "http://localhost:7865/mcp" });
```

## Switching Editors

Some files support multiple editors:

| File Type | Available Editors |
|-----------|-------------------|
| `.json` | Text, Grid |
| `.note.json` | Text, Notebook |
| `.todo.json` | Text, ToDo |
| `.link.json` | Text, Links |
| `.csv` | Text, Grid |
| `.jsonl` / `.ndjson` | Text, Grid |
| `.md` | Text, Preview |
| `.svg` | Text, Preview |
| `.html` | Text, Preview |
| `.mmd` | Text, Mermaid |
| `.excalidraw` | Text, Drawing |
| `.fg.json` | Text, Graph |
| `.rest.json` | Text, Rest Client |
| `.zip`, `.docx`, `.xlsx`, etc. | Archive Editor |
| `.asar` | Archive Editor (read-only) |
| `.pdf` | PDF only |
| `.mp4`, `.webm`, `.avi`, `.mkv`, `.mov`, `.m3u8`, `.m3u` | Video Player only |
| `.mp3`, `.wav`, `.aac`, `.flac`, `.m4a`, `.wma`, `.ogg`, `.opus` | Video Player only (audio with visualizer) |
| Images | Image Viewer only |
| Any text file in a git repo (requires Git integration enabled) | + Git Diff |
| Other | Text only |

Use the buttons in the toolbar to switch between available editors.

**Content-based detection:** JSON pages that contain a `"type"` property (`"note-editor"`, `"todo-editor"`, `"link-editor"`, `"rest-client"`, or `"force-graph"`) automatically show the corresponding switch button — even without the special file extension. For the Graph View, the JSON must also contain a `"nodes"` property; for the Rest Client, it must also contain a `"requests"` property. This is useful for pages created via MCP or scripting.

**Quick Add:** Click the dropdown arrow (&#9662;) next to the **+** button in the tab bar to create a new page from your pinned editors. Choose "Show All..." to open the **Tools & Editors** sidebar panel, which lists every available editor and tool. You can pin/unpin items and drag to reorder your pinned set. See [Tabs & Navigation](./tabs-and-navigation.md#tools--editors) for details.
