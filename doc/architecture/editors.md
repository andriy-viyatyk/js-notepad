# Editor System Architecture

## Overview

Every editor in Persephone is a top-level `EditorModel` subclass. There is one uniform editor architecture — no separation between "content-views" and "standalone" editors. Text-bearing editors (Monaco, Grid, Markdown, Notebook, etc.) compose an `IContentHost` for content I/O and expose a `CONTENT_HOST_TRAIT` so any owner (page, notebook note, future container) can switch editor types by transferring host ownership.

Each editor:
- Subclasses `EditorModel<TState>` (`/src/renderer/editors/base/EditorModel.ts`)
- Has its own state, lifecycle hooks, and reactive `state: TOneState<TState>`
- Renders a specific UI for the file type
- Is loaded asynchronously for code splitting
- Can expose a scripting facade via `page.asX()` methods

All editor code lives in `/src/renderer/editors/`.

## Editor Catalog

29 editor classes (33 registered editor IDs — `GridEditor` serves three IDs). The `IContentHost?` column indicates whether the editor composes an `IContentHost` (text-bearing) — these can switch between each other on the same page. The `Trait?` column indicates whether the editor exposes `CONTENT_HOST_TRAIT` — these participate in owner-orchestrated switching.

| Editor ID | Class | File types | IContentHost? | Trait? |
|-----------|-------|------------|---------------|--------|
| `monaco` | `MonacoEditor` | `*` (all, default) | ✓ | ✓ |
| `grid-json` | `GridEditor` | `.json`, `.grid.json` | ✓ | ✓ |
| `grid-csv` | `GridEditor` | `.csv`, `.grid.csv` | ✓ | ✓ |
| `grid-jsonl` | `GridEditor` | `.jsonl`, `.ndjson`, `.grid.jsonl` | ✓ | ✓ |
| `md-view` | `MarkdownEditor` | `.md`, `.markdown` | ✓ | ✓ |
| `svg-view` | `SvgEditor` | `.svg` | ✓ | ✓ |
| `html-view` | `HtmlEditor` | `.html` | ✓ | ✓ |
| `mermaid-view` | `MermaidEditor` | `.mmd`, `.mermaid` | ✓ | ✓ |
| `notebook-view` | `NotebookEditor` | `.note.json` | ✓ | ✓ |
| `link-view` | `LinkEditor` | `.link.json` | ✓ | ✓ |
| `log-view` | `LogViewEditor` | `.log.jsonl` | ✓ | ✓ |
| `graph-view` | `GraphEditor` | `.fg.json` | ✓ | ✓ |
| `draw-view` | `DrawEditor` | `.excalidraw` | ✓ | ✓ |
| `rest-client` | `RestClientEditor` | `.rest.json` | ✓ | ✓ |
| `env-vars-view` | `EnvVarsEditor` | `.env.json` | ✓ | ✓ |
| `file-diff` | `FileDiffEditor` | (switch — "Git Diff", offered for files in a git repo) | ✓ | ✓ |
| `pdf-view` | `PdfEditor` | `.pdf` | — | — |
| `image-view` | `ImageEditor` | `.png`, `.jpg`, `.gif`, `.webp`, `.bmp`, `.ico` | — | — |
| `archive-view` | `ArchiveEditor` | `.zip`, `.epub`, `.docx`, `.xlsx`, etc. | — | — |
| `category-view` | `CategoryEditor` | `tree-category://` links | — | — |
| `browser-view` | `BrowserEditorModel` | (none — opened via UI) | — | — |
| `mcp-view` | `McpInspectorEditorModel` | (none — opened via UI) | — | — |
| `about-view` | `AboutEditor` | (none — opened via UI) | — | — |
| `settings-view` | `SettingsEditor` | (none — opened via UI) | — | — |
| `video-view` | `VideoEditorModel` | `.mp4`, `.mkv`, `.webm`, `.mp3`, `.flac`, `.wav`, `.ogg`, `.m3u8`, `.hls` | — | — |
| `storybook-view` | `StorybookEditorModel` | (none — opened via UI) | — | — |
| `git-tree` | `GitTreeEditorModel` | (none — opened via the `.git` node's trailing button in Explorer) | — | — |
| `compare` | `CompareEditor` | (triggered) | — | — |
| `board-view` | `BoardEditorModel` | folders carrying `board-manifest.json` (opened via `persephone-board://`; also acts as a custom editor for files it associates via `fileMasks` — see "Custom-Editor Boards") | — | — |
| `toolset-view` | `ToolsetEditorModel` | folders carrying `tools-manifest.json` (opened via `persephone-toolset://`) | — | — |
| `board-info` | `BoardInfoEditorModel` | (none — "+" switch entry / board toolbar Properties / Tools & Editors hub / update toast) | holder | ✓ |
| `tools-hub-view` | `ToolsHubEditor` | (none — Tools & Editors panel "Open in new tab" / tab-bar "+" dropdown "Show All…") | — | — |

> **Toolset editor:** `ToolsetEditorModel` is a lightweight read-only viewer for one registered *toolset* (a folder holding `tools-manifest.json` + tool scripts — the Agent Tools registry). Like the board and git-tree editors it is a **no-host target editor** (`hasContentHost: false`, `accepts: () => -1`): it is never resolved from a filename, but opened by the `persephone-toolset://` link scheme (encode/decode in `content/persephone-toolset-link.ts`, parsed in `parsers.ts` → `target: "toolset-view"`, built by the explicit case in `PagesLifecycleModel.buildEditorById`, and restored via the `NO_HOST_EDITOR_IDS` allow-list in `PagesPersistenceModel`). Opening it from a normal click on `tools-manifest.json` is deliberately *not* wired — that still opens the JSON in Monaco; instead the file gets an "Open Toolset" trailing icon in the Explorer tree (register-gated via `RegisterToolsetDialog` when the folder is untrusted), mirroring `board-manifest.json`'s "Open Board" icon. The view shows the manifest's metadata, a registered chip, Open-Folder / Open-Log buttons, and a card per declared tool. The registry/trust/executor layer it reads (`api/tools/`) is intentionally kept off the `app` model and every script `.d.ts`, so scripts can neither self-register nor execute tools — the same rule that keeps `board-trust.ts` unscriptable.

> **Board editor:** `BoardEditorModel` is a Pattern-B (survive-navigation) editor. It hosts the board's `index.html` in an in-DOM cross-origin `<iframe src="board://<host>/index.html">` (no `sandbox` attribute; `host` is a stable hash of the board root minted by main; isolated by SOP + `nodeIntegrationInSubFrames: false` + a CSP that forbids remote network). The `board://` protocol is registered once on the host session and routes host→board-root. A browser-IIFE shim (`src/board-shim.ts`), inlined into the served HTML by the `board://` handler, rebuilds `window.persephone` — the bridge object — over a per-board `MessagePort` (minted by `MessageChannelMain` in main, handed off through a one-time renderer-brokered handshake): `execute()` (thin client over the main-process command runner), the integration tier (`openRawLink`, `notify`, file/folder dialogs, `readFile`/`writeFile`), and the theme/token contract (`--p-*` CSS variables injected into the served `<head>` for a themed first paint, live across theme switches). Automation (`browser_*`) targets the board **frame** via CDP through `BoardTargetModel`. Trust is per-board (`board-trust.ts`): an untrusted board blocks rendering (see `UntrustedBoardView.tsx`), and a missing board root shows `BoardNotFoundView.tsx`. The `boards-assets/` root holds the recommended-components catalog (skins + manifest). See `assets/board-template/CLAUDE.md` for the board authoring guide.

> **Board Info editor:** `BoardInfoEditorModel` (`board-info`) is a single screen serving two modes — **install** (an uninstalled catalog board: a Download → Register two-step with byte progress) and **properties** (an installed board: info, a fetched-on-demand versions list for install/rollback, Uninstall/Unregister, Open board). It is a **host-capable holder**: like `BoardContentEditorModel` it adopts/yields `CONTENT_HOST_TRAIT` without ever rendering the content, so switching `Text ↔ + ↔ content-host board` on a file page transfers the same content host with no reload or data loss (hence the "holder" entry in the table — it exposes the trait but composes no `IContentHost` of its own). It is reached from the `"+"` editor-switch entry (which maps to this editor id, so selection is an ordinary `switchMainEditor`), the board toolbar's Properties button, the Tools & Editors hub, and the update toast. `openBoardInfo(page, opts)` replaces a page's editor in place; `openBoardInfoPage(opts)` opens a new page. When the outgoing editor is a **simple** board (or a plain `board-view`) it holds no transferable host, so `openBoardInfo` instead captures that editor's `filePath` into the Board Info state; `currentFileName()` prefers it, so the editor-switch still offers the file's real built-in peers plus the board, and **Open board** switches back to the file-viewing board rather than opening a bare one. (A content-host source needs none of this — the transferred host already carries the file.) Install trusts nothing — registration is the separate `showTrustBoardDialog` consent step.

> **Published Boards catalog:** boards published to the `andriy-viyatyk/persephone-boards` GitHub repo are discoverable and installable in-app. The main-process `published-boards-service.ts` fetches the raw `boards-manifest.json` (24h-gated, cached for offline, `isSafeBoardId`-guarded against traversal ids), the renderer `published-boards.ts` model holds it reactively, and `board-install.ts` / `board-install-registry.ts` / `board-updates.ts` perform the sha256-verified download → extract → registry-record install, in-place folder-swap updates/rollbacks (never destroying a working board), and update detection. The **Tools & Editors hub** (`editors/tools-hub/`, `tools-hub-view`) — a full-page counterpart to the sidebar panel, a singleton page keyed by a fixed `PageModel` id — browses the catalog in its "Search boards" tab. Every install/properties action opens the Board Info editor above; nothing is ever trusted without the user's dialog click.

> **Tools & Editors hub:** `ToolsHubEditor` (`tools-hub-view`) is the page-sized sibling of the `ToolsEditorsPanel` sidebar panel, opened by the panel's "Open in new tab" button. It is a singleton — `showToolsHubPage()` builds it against a fixed `PageModel` id so `addPage` dedups to the existing page rather than the well-known-pages machinery. Its Built-in / Registered boards / Search boards / Tools tabs and the Pinned rail reuse the same components as the panel (`PinnedRail`, `BuiltinEditorsList`, `TrustedBoardsList`, `TrustedToolsList`), extracted so the panel and page share one implementation.

> **PDF / Image content pipe integration:** Both have `ensurePipe()` to reconstruct the pipe from `filePath` on app restart. For non-local sources (HTTP URLs, archive entries), they read content through the pipe and cache to disk for offline restart recovery. PDF caches as `{pageId}.pdf`, Image caches as `{pageId}.img`. Cache files are cleaned up on page dispose.
>
> **Image URL support:** `ImageEditor` can display images from external URLs (e.g. browser context menu "Open Image in New Tab"). For HTTP URLs, an `HttpProvider` pipe is created (serializable, re-fetches on restart). The image binary is also cached to disk as a fallback. For blob URLs (REST client, drawing export), the binary is cached to disk immediately since blob URLs don't survive restart. URL-based images show a "Save Image to File" toolbar button.

## Rendering Architecture

```
RenderEditor
└── AsyncEditor
    └── EditorErrorBoundary
        └── <EditorComponent model={page.mainEditor} />
```

All editors flow through the same path — there is no longer a content-view branching point that wraps text-bearing editors inside `TextEditorView`. Shared chrome (`PageToolbar`, `TextChrome`) is composed by each editor's view component as needed.

**Error protection:** `EditorErrorBoundary` (`/src/renderer/ui/app/EditorErrorBoundary.tsx`) wraps every editor inside `AsyncEditor`. If the editor component throws during render, the boundary catches the error and displays the error message + stack trace in the tab instead of crashing the application. This is a React class component (required for `getDerivedStateFromError`).

## EditorModel Base Class

```typescript
abstract class EditorModel<TState extends IEditorState = IEditorState> {
    readonly id: string;
    readonly editorId: string;          // e.g. "grid-json", "pdf-view"
    readonly state: TOneState<TState>;
    readonly traits: TraitSet;
    readonly queue: ComponentQueue;
    page: IPageHost | null;             // back-reference, set via setPage()

    // Lifecycle (three-phase)
    applyRestoreData(data: Partial<TState>): void;
    switchFrom?(oldEditor: EditorModel): Promise<void>;  // optional content-host transfer
    restore(): Promise<void>;

    // Navigation hooks
    setPage(page: IPageHost | null): void;
    beforeNavigateAway(newEditor: EditorModel): void;
    onMainEditorChanged(newMainEditor: EditorModel | null): void;
    survivesNavigation(sourceLink?: ILinkData): boolean;  // true → skip save-prompt (editor stays on page)
    keepAliveOnNavigation(): boolean;   // true → stay attached with NO view when replaced as main
                                        // (invisible ownership handle — e.g. a busy Board whose
                                        // spawned processes must outlive its iframe)

    // Persistence
    getDescriptor(): HostDescriptor;
    confirmRelease(closing?: boolean): Promise<boolean>;
    dispose(): void;

    // Secondary view membership (managed by setter, see secondary-views.md)
    secondaryView: string[] | undefined;

    // Icon (see "Editor icons" below)
    noLanguage: boolean;                 // default false
    getIcon?: () => React.ReactNode;     // self-supplied icon for noLanguage editors

    // Page-area presentation hint
    showBackgroundOrnament: boolean;     // default false; when true the page area
                                         // pins the decorative Ornament bottom-right,
                                         // behind content (Settings, About)

    // Page-tab context menu (see "Page-tab context menu" below)
    onGetMenuItems(): MenuItem[];        // default delegates to contentHost
}
```

`EditorModel` extends `TDialogModel` indirectly via the queue/state primitives — every editor can `close()` with confirmation and has a `canClose` guard.

## Editor icons

The glyph that represents an editor — on its page tab, in the Tools & Editors list, and at the start of its sidebar panel headers — comes from one of two sources, decided per editor:

- **`noLanguage` editors** (`noLanguage = true`) supply their own icon by assigning `getIcon` in the constructor — e.g. `this.getIcon = () => createElement(GitIcon)`. These are editors with no Monaco language (Git Tree, Archive, Explorer, Storybook, …). An editor that sets `noLanguage` but no `getIcon` shows no icon.
- **Language editors** (`noLanguage = false`, the default) derive a file-type icon from their `language` + `title` via `LanguageIcon` (`components/icons/LanguageIcon.tsx`, which resolves the language map, compound-extension patterns like `*.note.json` → Notebook, the OS system icon, then a default).

This decision is centralized in the shared **`EditorIcon`** resolver ([`components/icons/EditorIcon.tsx`](../../src/renderer/components/icons/EditorIcon.tsx)):

```tsx
<EditorIcon editor={model} />
// noLanguage ? editor.getIcon?.() : <LanguageIcon language={editor.language} fileName={editor.title} />
```

`EditorIcon` accepts a duck-typed `EditorIconSource` (`{ noLanguage?, getIcon?, language?, title? }`) rather than importing `EditorModel`, so `components/icons` stays decoupled from the editors layer. It is the single source of truth shared by the page tab (`PageTab.tsx`) and the sidebar panel headers (`SecondaryViews.tsx`), so the two never drift. It forces **no size and no color**: icons carry their own sizing, and leaving `color` unset lets the surrounding header color cascade — monochrome `currentColor` icons (e.g. `GitIcon`) follow the header state (accent when a panel is active), while explicitly-colored icons (Link, the folder emoji, the Storybook brand mark) keep their own hue.

The Tools & Editors list keeps its **own** per-item icon in [`tools-editors-registry.ts`](../../src/renderer/ui/sidebar/tools-editors-registry.ts) (it lists editor *types*, not live models), so a new editor icon must be set there too if the editor appears in that list.

## Page-tab context menu

A page tab's right-click menu has two tiers. The **tab-level** items (Close, Close Others, Close to Right, Open in New Window, Duplicate, Pin/Unpin) are built in `PageTab.tsx` and are identical for every editor — they call only page/`PagesModel` operations. The **editor-specific** items come from the editor model itself, through a single hook:

```ts
onGetMenuItems(): MenuItem[] {           // EditorModel default
    return this.contentHost?.onGetMenuItems?.() ?? [];
}
```

`PageTab.handleContextMenu` appends `mainEditorInstance.onGetMenuItems()` after the tab-level items and stamps `startGroup: true` on the first contributed item, so the tab owns the divider between the two tiers.

The default routes to the content host, which is the extensibility seam:

- **Text-bearing editors** get the full text-file menu for free — `TextFileModel.onGetMenuItems()` returns it, and every editor that wraps a `TextFileModel` host inherits it without per-editor code.
- **Non-text editors** override `onGetMenuItems()` to contribute their own items (Git Tree → "Open Git Root Folder" / "Copy Remote URL"; PDF/Image/Archive → the file-path items).
- An editor with nothing to add inherits the base default and a null content host, returning `[]` — so no disabled/irrelevant items appear.

The menu items themselves live in [`editors/shared/editor-menu-items.tsx`](../../src/renderer/editors/shared/editor-menu-items.tsx):

- `textFileMenuItems(host)` — Save / Save As / Rename / file-path items / encryption group. The single home of the text-file menu; `TextFileModel.onGetMenuItems()` returns it, and `TextFileModel` owns `promptRename()` (the rename dialog).
- `filePathMenuItems(filePath)` — Show in File Explorer + Copy File Path. Reusable by any editor with an on-disk path (the text host, plus standalone PDF / Image / Archive editors). Disabled (not hidden) when the path is absent.

## IContentHost

The shared abstraction for "something that owns editable text content". Two concrete implementations ship today:

```typescript
interface IContentHost {
    readonly id: string;
    readonly type: "textFile";
    readonly state: TOneState<IContentHostState>;  // { content, language, editor, filePath, ... }
    readonly stateStorage: EditorStateStorage;
    readonly pipe: IContentPipe | null;
    changeContent(content: string, byUser?: boolean): void;
    changeLanguage(language: string | undefined): void;
    confirmRelease(closing?: boolean): Promise<boolean>;
    getDescriptor(): HostDescriptor;
    dispose(): void;
}
```

| Implementation | Backing | I/O |
|----------------|---------|-----|
| `TextFileModel` | Local file (or archive entry, HTTP URL) | File-backed via content pipe, with debounced auto-save to cache |
| `NoteItemEditModel` | Notebook note (lives in notebook JSON) | No file I/O; reads/writes via the parent notebook's `updateNoteContent` |

Text-bearing editors (Monaco, Grid, Markdown, ...) hold a reference to an `IContentHost` via `this.contentHost` and read content through it. The host outlives the editor — when a user switches a JSON file from text view to grid view, the same `TextFileModel` host transfers to the new `GridEditor` instance.

## CONTENT_HOST_TRAIT

Switchable text-bearing editors expose `CONTENT_HOST_TRAIT` so any owner can transfer their host to a new editor instance:

```typescript
const CONTENT_HOST_TRAIT = TraitRegistry.register<IContentHostTrait>("content-host");

interface IContentHostTrait {
    extractContentHost(): IContentHost;     // detach — old editor must NOT dispose it
    inheritContentHost(host: IContentHost): void;
}
```

The owner-side switch helper (`switchEditorViaContentHost`) calls `extractContentHost()` on the old editor, creates the new editor instance, then calls `inheritContentHost(host)` on it. Content, file path, modifications, I/O state, encryption all survive the switch untouched because the host is the same object.

## IImageExport

Editors that render visual content — the Mermaid preview, SVG preview, Image viewer, and HTML viewer — implement the `IImageExport` capability (`/src/renderer/editors/base/IImageExport.ts`):

```typescript
interface IImageExport {
    exportPng(): Promise<Blob>;          // rendered content as a PNG blob (natural size, 1×)
    suggestedImageName(): string;        // file basename without extension
}
```

For the rasterising editors (Mermaid, SVG, Image), export runs at the **model level and is host-independent** — it does not require a mounted view, so it works for a page that is not the active tab. The shared helpers in `/src/renderer/editors/shared/image-export.ts` do the canvas work: `rasterToPngBlob(src)` loads any source (an `image/svg+xml` data URL, a blob URL, or an http(s) URL) into an offscreen `<img>`, draws it to a canvas at natural size, and encodes a PNG. Because the browser performs the rasterisation, fonts and text render correctly — output external "SVG → PNG" tooling fails to produce.

Each model builds its own source before delegating: Mermaid uses its rendered SVG data URL (rendering on demand via `renderMermaid` when the preview has not been generated), SVG builds the `image/svg+xml` data URL from host content, and the Image viewer rasterises the displayed image URL. `BaseImageView`'s clipboard copy shares the same canvas path (`imageElementToPngBlob`).

The **HTML viewer captures differently**, and is the one implementer whose `exportPng()` is *not* headless. Its content renders inside a sandboxed `<iframe srcDoc>` whose document is cross-origin to the renderer, so it cannot be rasterised to a canvas. Instead `exportPng()` captures the **live on-screen iframe** pixel-for-pixel (WYSIWYG — the image matches exactly what is displayed) via the `capturePageRegion` IPC endpoint, which runs `webContents.capturePage(rect)` in the main process with the rect scaled by the window zoom factor. This requires a mounted, visible view and throws otherwise. The view reports the iframe element to the model through `setCaptureElement`, and the model derives the capture rect from its `getBoundingClientRect()`. Its toolbar exposes a Copy action plus a "…" menu (Save as PNG / Open in Image View / Edit Image); the latter two feed the captured blob to `pagesModel.openImageInNewTab` and `pagesModel.addDrawPage` (the data-URL conversion uses the shared `blobToDataUrl` helper alongside `blobToBuffer`).

Two shared entry points sit on top of `exportPng()`: `savePngViaDialog(source)` (prompts for a path; backs the editors' toolbar "Save" actions and surfaces failures as a toast) and `writePngToFile(source, filePath)` (writes directly; backs the `savePngToFile(filePath)` script-facade method). The Image viewer additionally offers a "Save original" action that writes the source bytes in their original format without re-encoding.

## Owner-Orchestrated Switching

Editor switching is initiated by the owner (the page, or a notebook), not by the editor itself. `PageModel.switchMainEditor(newEditorId)` and notebook-level note switching both call the same helper:

```typescript
async function switchEditorViaContentHost(
    oldEditor: EditorModel | null,
    newEditorId: string,
    swap: (newEditor: EditorModel) => Promise<void>,
): Promise<void> {
    const oldTrait = oldEditor?.traits.get(CONTENT_HOST_TRAIT);
    const host = oldTrait?.extractContentHost();
    const newEditor = await createEditor(newEditorId);
    const newTrait = newEditor.traits.get(CONTENT_HOST_TRAIT);
    if (host && newTrait) {
        newTrait.inheritContentHost(host);
    }
    await swap(newEditor);   // owner-specific install (e.g., `page.setMainEditor`)
}
```

For non-text editors (PDF, Image, Browser, etc.) without `CONTENT_HOST_TRAIT`, there is no host to transfer — switching is a plain create+swap.

When the **source** is host-less but the **target** is a built-in file editor, a plain create+swap is not enough — the target has no host to adopt and its `switchFrom` would have nothing to build over. This happens when switching back from the Board Info install page ("+"), or from the host-less Archive viewer that claims zip-based files (`.xlsx`/`.docx`/`.pptx`). In that case `switchMainEditor` dispose-and-rebuilds the target over the file (`createEditorFromFile(filePath, …)`), reading the source editor's `filePath` (which host-less editors like Archive expose via a getter override). The Board Info target itself is exempt — its tolerant `switchFrom` captures the source's `filePath` so the install page can still match catalog editors and keep the file name.

## EditorModule Interface

Each editor folder's `index.tsx` exports an `EditorModule` registered with `editorRegistry`:

```typescript
interface EditorModule {
    id: string;                          // e.g. "grid-json"
    name: string;                        // display name
    Editor: React.ComponentType<{ model: EditorModel }>;
    create(): EditorModel;               // factory for a new instance
    accepts?(input: AcceptanceInput): number;  // priority >= 0 if this editor accepts the input, -1 otherwise
    hasContentHost?: boolean;            // true for text-bearing editors
    validateForLanguage?(language: string): boolean;
    switchOption?(language: string, filePath?: string): number;
    isEditorContent?(language: string, content: string): boolean;
}
```

Editors are registered in `/src/renderer/editors/register-editors.ts` via `editorRegistry.register(module)`.

## Scripting Facades

Editor facades provide safe, typed script access to editors via `page.asX()` methods. Each facade wraps the page's `mainEditor` (an `EditorModel` subclass) directly — there is no separate view-model layer.

| Method | Facade | Wraps |
|--------|--------|-------|
| `page.asText()` | `TextEditorFacade` | `MonacoEditor` |
| `page.asGrid()` | `GridEditorFacade` | `GridEditor` |
| `page.asNotebook()` | `NotebookEditorFacade` | `NotebookEditor` |
| `page.asLink()` | `LinkEditorFacade` | `LinkEditor` |
| `page.asMarkdown()` | `MarkdownEditorFacade` | `MarkdownEditor` |
| `page.asSvg()` | `SvgEditorFacade` | `SvgEditor` |
| `page.asHtml()` | `HtmlEditorFacade` | `HtmlEditor` |
| `page.asMermaid()` | `MermaidEditorFacade` | `MermaidEditor` |
| `page.asGraph()` | `GraphEditorFacade` | `GraphEditor` |
| `page.asDraw()` | `DrawEditorFacade` | `DrawEditor` |
| `page.asBrowser()` | `BrowserEditorFacade` | `BrowserEditorModel` |
| `page.asMcpInspector()` | `McpInspectorFacade` | `McpInspectorEditorModel` |
| `page.asImage()` | `ImageEditorFacade` | `ImageEditor` |

Facades live in `/src/renderer/scripting/api-wrapper/`. Interfaces in `/src/renderer/api/types/*.d.ts`.

The `page.asX(force?: boolean)` methods optionally accept `force: true` to bypass the type check and return a facade for the current editor regardless of type — useful for scripts that target editors via traits rather than declared editor IDs.

## Editor Resolution

When a file is opened:

```
File path → editorRegistry.resolve(filePath) → EditorModule → create() → Render
```

Resolution priority (higher priority wins):
1. Content-based detection (e.g., `"type": "note-editor"` in JSON) — priority 90 (when applicable)
2. Filename patterns (e.g., `*.note.json`) — priority 20
3. File extensions (e.g., `.pdf`) — priority 100
4. Default to monaco text editor — priority 0

All editor registration is in `/src/renderer/editors/register-editors.ts`.

## Custom-Editor Boards

A trusted **Board** can register itself as the editor for a file type, so it appears in the editor switch next to Monaco (and can become the default open target) — the same extensibility the built-in editors have, but authored entirely outside Persephone's code. A board declares the association in its `board-manifest.json`:

- `fileMasks` — glob masks (`*`, `?`) matched against the file **basename** (e.g. `["*.drawio"]`, `["*.grid.json"]`). A bare extension is coerced to a suffix mask.
- `editorPriority` — the board's slot on the same numeric resolution ladder the built-in editors use (monaco 0 / grid 20 / draw 50 / viewers 100 / category 200). The board becomes the **default** editor for its masks only when this strictly exceeds the best built-in claimant; omitted/`0` makes it a switch option only.
- `editorName` — the switch-widget label (falls back to the manifest `name`, then the folder name).

These fields are honored **only when the board is trusted**.

**Two registries, merged.** Board editors are runtime-discovered, so they are **not** injected into the static `editorRegistry`. They live in a separate reactive registry, `customEditorRegistry` (`editors/board/custom-editor-registry.ts`), which enumerates `boardTrust.listPaths()`, reads each manifest, and maps file → claiming boards. It reacts to trust changes (an untrust drops the association live) and re-reads a manifest on refresh — there is no filesystem watcher, mirroring the Agent Tools `registeredTools` precedent. Each associated board is a distinct **virtual editor id** `board-editor:<boardRoot>` (`boardEditorId` / `parseBoardEditorId`), where the remainder after the prefix is the board root verbatim (original case; may contain `:` and `\` — parse by prefix, never by split).

**Merged resolution.** `resolveEditorIdForFile(filePath)` reads both registries and returns the winning id: it compares the best built-in `acceptFile` priority against the highest-priority trusted board claiming the file. A board wins only for a real local file (`isPlainLocalPath` — boards edit local files only; the option is hidden for `https://` / archive paths) and only on a strictly-greater priority (built-ins win exact ties; among boards, trusted-list order). This helper — **not** `editorRegistry.resolveId` — is the merge point, called at the two file-open decision points: direct open (`PagesLifecycleModel.newEditorModel`) and the Layer 2 `openRawLink` file resolver (`content/resolvers.ts`). It is deliberately kept out of `editorRegistry.resolveId` so a `board-editor:<root>` id never leaks into `TextFileModel`/`resolvers` internal lookups.

**Construction & switch.** When resolution yields a `board-editor:<root>` id, `PagesLifecycleModel.buildEditorById` decodes the root (in a branch placed *before* the text-fallback, so an unrecognized board id can't silently open as text) and builds a `BoardEditorModel` initialized with the target file path. `PageModel.switchMainEditor` branches on the `board-editor:` prefix *before* the `editorRegistry.getById` lookup (which throws on unregistered ids): it runs the old editor's `confirmRelease()` guard (abort on cancel — reusing navigation's unsaved-changes prompt), then rebuilds through `createEditorFromFile` in both directions (a board has no shared content host to transfer). The switch widget (`SwitchWidget` in `PageToolbar.tsx`, and its reuse in `BoardToolbar.tsx`) merges the board options from `customEditorRegistry.useBoardsForFile` and resolves their labels from the registry rather than `editorRegistry.getById`. For the switch to stay visible while the user is *on* the built-in peer, that peer must expose `filePath` (the `switchMainEditor` board branch reads `oldEditor.filePath` and aborts if it is absent) and return itself from `findCompatibleEditors()` (the widget hides unless the active id is among its options, then appends the file-associated boards). Text editors inherit both from the shared host; a **no-host** built-in that can be a simple board's peer overrides them explicitly — the Archive editor does (exposing its `archiveUrl` as `filePath`, returning `["archive-view"]`), so it can be the built-in peer of a board claiming a ZIP-based file such as `.xlsx` / `.docx`.

**Identity & persistence.** A `BoardEditorModel` acting as a custom editor reports its `editorId` as the dynamic `board-editor:<root>` so the switch widget matches; but `getRestoreData()` pins the persisted id to `"board-view"` (the virtual id is re-derived from the persisted `filePath` on restore), keeping the board inside the `NO_HOST_EDITOR_IDS` allow-list and the automation guards. MCP/automation board detection uses `isBoardEditorId` (true for both `"board-view"` and any `board-editor:<root>`) so a file-associated board stays automatable. Note that `list_pages` reports the live `board-editor:<root>` id as a custom-editor board's editor — match such a page by its `boardRoot` / `selectedBoard`.

**File delivery.** The associated file path rides `ILinkData.filePath` (persisted, never baked into the `persephone-board://` URL) → `BoardEditorState.filePath` → `BoardEditorModel.currentFilePath()` → `BoardPortInitMsg.filePath`, and reaches the board as the async bridge method `persephone.getFilePath()`. The board reads/writes the file with the existing top-level `persephone.readFile()` / `writeFile()` — no Persephone content pipe is involved (the direct-`filePath` case). This is the **simple** custom-editor kind.

### Content-Host Boards

A custom-editor board can go one step further and let Persephone own the file the way it does for every built-in editor. The `board-manifest.json` field `editorKind` selects the variant:

- **`"simple"`** (default, or absent) — the direct-`filePath` case above: the board gets a path and reads/writes it itself.
- **`"content-host"`** — Persephone builds the board **with an `IContentHost`** (a `TextFileModel`, the same host that backs Monaco/Grid/Notebook). Persephone keeps the file, the content pipe, encoding detection, encryption, the auto-save cache, and dirty tracking; the board works with the content through the injected `persephone.host.*` bridge instead of a raw path. `editorKind` is honored only for a trusted board and is carried through `getBoardEditorAssociation` → `CustomEditorMatch` so construction can pick the model without re-reading the manifest.

**The model — `BoardContentEditorModel`** (`editors/board/BoardContentEditorModel.ts`) subclasses `BoardEditorModel`, inheriting the iframe / trust / toolbar / automation / icon machinery unchanged and adding only the host composition (template: `MonacoEditor`). It composes a private `_host: TextFileModel` and registers `CONTENT_HOST_TRAIT`, so it **switches with the built-in editors by transferring the same host** — no reload, no data loss — exactly like Monaco↔Grid:

- `get contentHost()` → the composed host (base board returns `null`).
- `switchFrom(oldEditor)` extracts the old editor's host via `CONTENT_HOST_TRAIT`, preserves `oldEditor.id` (cache-file continuity), and `adoptHost()`s it.
- `restore()` runs the board validation (`super.restore()`), then ensures a host — an already-adopted one, one rebuilt from the persisted descriptor, or a fresh `newTextFileModel(filePath)`; a restore failure sets `contentHostError` (drives an empty state in the view).
- `getRestoreData()` adds `host: this._host?.getDescriptor()` while still pinning `editorId: "board-view"`; **`d.host` present on a `board-view` descriptor is the content-host-vs-plain discriminator** at restore.
- `saveState()` / `confirmRelease()` delegate to the host, and `skipSave = false` — so the tab's unsaved dot, the "save changes?" release prompt, and the tab-menu Save all work through the host, like every text editor.
- `findCompatibleEditors()` returns **all** built-in editors accepting the composed host — via `editorRegistry.findEditorsAccepting(host)`, the *same* call the built-in editors make — plus this board. So a content-host board offers the **identical** switch set to the built-in editors that accept the same file (e.g. `Text Editor` alongside the board itself), letting the user reach Monaco as well as the natural viewer. It applies **no** `isPlainLocalPath` gate — content-host boards edit `https://` / archive / encrypted files too. `findEditorsAccepting` reads the host's `filePath ?? title`, so an **untitled page** stays resolvable and the user can switch back after renaming a fresh page to a matching name (e.g. `untitled` → `diagram.drawio`); before the host is adopted it falls back to the single natural built-in id.
- `get editorId()` always reports the virtual `board-editor:<root>` whenever a board root is set — a content-host board is *always* a custom file editor, so (unlike the base `BoardEditorModel`, which reports it only once a `filePath` exists) it keeps that id even on an untitled page. This is what lets `switchMainEditor` recognize the board boundary (via `parseBoardEditorId`) when switching back to a built-in editor, and lets the switch widget highlight the active option. Persistence is unaffected — `getRestoreData()` still pins `"board-view"`.
- **No busy retention** (`keepAliveOnNavigation()` / `survivesNavigation()` → `false`; `setBusy()` is a no-op + `console.warn`). The host transfers out on switch, so a surviving host-less board would be a broken zombie, and duplicating the host would give two unsynchronized writers of the same file.
- **Footer + Script panel parity.** `BoardEditorView` renders the shared `ContentHostFooter` (the `script` toggle · provider icon · encoding label) and the `ScriptPanel` below the board iframe **whenever `model.contentHost` is set** — so a content-host board gets the same footer and script-run affordance the built-in text editors get from `TextChrome`. Plain boards (no host) stay footer-less. The footer row lives in `ContentHostFooter` (`editors/base/`), extracted out of `TextChrome` so both hosts share one implementation. A board can also contribute its own **footer status text** (e.g. a Todo board's item count) via `persephone.setStatusText(text)` — it lands in the footer's `footerContributions` slot (between the script toggle and the provider/encoding), the same slot the built-in Grid/Notebook editors fill. It rides the board→host-renderer `postMessage` channel as `board:setStatusText`, is routed only from the **main** frame (a secondary frame can't hijack the main footer), and stored as transient `BoardEditorState.statusText` (stripped from persistence, cleared on restore, re-set by the board on load). An isolated `FooterStatus` subscriber renders it so a frequently-changing count re-renders only the label, never the board iframe. `""` clears it; it's a no-op for plain boards.

**Construction & switch & persistence** (`PagesLifecycleModel`, `PageModel`, `PagesPersistenceModel`) branch on the kind: the `board-editor:<root>` construction branch builds the pipe + host + `BoardContentEditorModel` for `"content-host"`; `PageModel.switchMainEditor` transfers the host in **both** directions (built-in→board via `boardModule.createEditor` + `initFromBoardRoot` + `board.switchFrom`; board→built-in via `editorRegistry.createEditor` + `builtin.switchFrom`) with no `confirmRelease` (nothing is lost when the host survives); and `PagesPersistenceModel.restorePage` gains a board branch placed **before** its generic `if (d.host)` branch, so a restored content-host board rebuilds the subclass + host instead of collapsing into a plain `BoardEditorModel`. The three `isPlainLocalPath` gates (`resolveEditorIdForFile`, `findCompatibleEditors`, and the `PageToolbar` switch-widget) are lifted by kind so a content-host board surfaces as a switch option over non-local files. The `PageToolbar` `SwitchWidget` additionally treats the page **title** as the file name when there is no path (mirroring `editorRegistry.findEditorsAccepting`, which already resolves the built-in switch via `filePath ?? host.title`), so the board is offered on a freshly-renamed untitled page — only content-host boards qualify there, since a title-only page has no local path and simple boards require a real local file.

**The content bridge — `persephone.host.*`.** The host is a renderer-side object, so its bridge rides the board↔host-renderer channel (`postMessage`), not the main `MessagePort`. `BoardWebview` subscribes to `host.state` and pushes `{ __persephone: "host:content", content, language }` into the iframe after the frame loads and on every change (echo-guarded against the board's own writes); the board posts `board:setContent` / `board:save` back. The shim exposes `persephone.host.getContent()`, `setContent()`, `onContentChange(cb)`, `getLanguage()`, and `save()`. **These are safe to call in any order** — a board reached via the editor-switch runs its `load()` before the handshake lands, so `getContent()` / `getLanguage()` **await the handshake internally** and only *then* resolve (content-host board) or reject (plain board); no ready-gate is needed and the editor-switch empty-render trap is gone. `onContentChange()` always registers the callback — on a plain board no `host:content` push ever arrives, so it simply never fires. `setContent()` updates the shim's own local replica before posting, so a `getContent()` immediately after returns the just-written value (read-your-own-write); the echo-guard still means a frame's own write does not re-fire *its own* `onContentChange` (the other frame does receive it). **Automatic Ctrl+S:** the shim registers a `window`-level keydown handler (before any author script) that posts `board:save` → `host.io.saveFile()` unless a board handler already called `preventDefault()` — so saving works with zero board code. The DrawIO viewer board (read-only; edits happen in Monaco after a host transfer) is the reference implementation.

### Board Secondary Views & Shared State

A board is not limited to its main iframe — it can contribute one or more **secondary views**, each a second `board://` iframe rendered in its own sidebar panel and wired to the same board model as the main view. This is what lets a board pair a main view with a coordinated sidebar panel (a task list + its Lists/Tags panel, for example). Available to **every** board — plain, custom-editor, and content-host alike — because it lives on the base `BoardEditorModel`.

**Declaration.** A board declares its views in `board-manifest.json`:

```jsonc
"secondaryViews": [
  { "id": "lists", "html": "lists.html", "title": "Lists" },
  { "id": "detail", "title": "Detail" }   // html omitted → served from index.html
]
```

Each decl is `{ id, html?, title? }`. `html` defaults to the main entry (`index.html`), so a board can point every view at one file and branch on its role. View ids containing `::` (the composite-panel-key separator) are rejected/normalized at the manifest-read and `setSecondaryViews` boundaries. The manifest reader is **independent of `fileMasks` / `getBoardEditorAssociation`** — secondary views are general board functionality, not part of the custom-editor axis.

**The panel family.** Each declared view maps to a stable panel id `board-secondary:<viewId>` (helpers in `editors/board/board-secondary.ts`). The base model seeds `state.secondaryViewDefs` from the manifest (persisted set wins on restore) and derives `state.secondaryView = defs.map(d => "board-secondary:" + d.id)` — the bare panel-id list the shell reads (see [secondary-views.md](secondary-views.md)). The `secondary-view-registry` resolves the whole `board-secondary:*` family to **one generic component**, `BoardSecondaryView` (`editors/board/BoardSecondaryView.tsx`), via prefix-aware `has()`/`get()` at all three consumers (`SecondaryViews.tsx`, `LazySecondaryView.tsx`). `SecondaryViewProps` gained a `panelId` field (backward-compatible) so the one component reads *which* view it is → strips the prefix → looks up the `secondaryViewDefs` entry → renders a `SideBarPanelHeader` (title/icon from the decl / board icon) over a `BoardWebview` pointed at that view's HTML. Every panel gets the **same `BoardEditorModel` instance**, preserving the single-model pattern.

**Multi-frame safety — the `isMain` role.** `BoardWebview` gained an `entry` prop (default `index.html`) and an **`isMain` prop** (default `true`). All frames of a board share one `model.id`, so only the **main** frame may call `model.setIframe`/`clearIframe`, `registerBoardFrame`/`unregisterBoardFrame`, reset `ui.log`, and autofocus — a secondary frame calling them would clobber the shared automation target and CDP registration. Each frame still mints its **own** `MessagePort` (own `boardId`), so `execute`/`readFile`/etc. work in every frame; they share the one model, hence the one shared state and (content-host) the one content host. **Job reaping is per-sink:** a secondary frame's port disposal (`disposeBoardPort(boardId)`) reaps only its own sink; the whole owner (`model.id`) is reaped only from `BoardEditorModel.dispose()` (page close) — so closing a secondary panel never tree-kills the main frame's spawned processes.

**The shared-state bridge — `persephone.state.*`.** Mirrors the `persephone.host.*` precedent: it rides the board↔host-renderer `postMessage` channel, not the main `MessagePort`, and is injected into **all** board frames. The board API is `state.init(defaults, { restorableKeys })`, `get()`, `set()`, `merge()`, and `onChange(cb)`. State is **authoritative on the Persephone side** (`BoardEditorState.sharedState` on the base model). Writes **round-trip through the host**: on a frame's `set`/`merge`/`init`, that frame's `BoardWebview` writes the shared model, then **every** `BoardWebview` (including the originator's) pushes `state:sync` to its own frame, each stamped with a monotonic `model.sharedStateSeq`; the shim keeps a pure replica and applies a push only when its seq exceeds the last applied, so seed-on-load vs. `set`/`merge`/`init` deliveries are order-independent (and the seq is robust under `merge`, where value-equality is not). The writing frame observes its own change one sub-millisecond round-trip later — `onChange` is the source of truth (React-`setState` semantics). **Persistence is opt-in per key:** `getRestoreData()` persists only `pick(sharedState, restorableKeys)` (nothing if a board never calls `init`), so a board can hold large/transient state without bloating the open-pages file. `secondaryViewDefs` (small) persists in full.

**Role & runtime control.** Each frame's role reaches the board as `persephone.view` — `"main"` for the main frame, or the view's `id` for a secondary frame — delivered synchronously at boot via a `view=<role>` URL query param on the iframe `src` (alongside the `?v=<boardId>` nonce), read from `location.search` before any author script runs. So one HTML file can encapsulate every view and branch on `persephone.view`. Any frame can replace the board's whole set of secondary views at runtime with `persephone.setSecondaryViews([...])` (`[]` removes them all); the sidebar reacts live via the existing slice subscription.

**Navigation (Pattern A).** A board that contributes panels is **not** kept alive as a sidebar contributor when its main view navigates away — the base `EditorModel.beforeNavigateAway` already clears the derived `state.secondaryView`, so the panels are removed and the board is disposed normally. `secondaryViewDefs` is retained (not wiped) so a re-promoted **busy** board re-derives its panels via `onNavigationReuse()`. Keeping a board alive on the page via its secondary views is a future concern, orthogonal to the existing busy-process retention for plain boards.

**Automating secondary views (frames-as-tabs).** `browser_*` automation maps each board frame — main + each declared secondary view — onto the existing `IBrowserTarget` **tab** abstraction, so `browser_tabs {action:"list"}` enumerates them and `{action:"select"}` switches to one. `registerBoardFrame` threads a `tab` arg so every frame registers under its own CDP key `${model.id}/${tab}` (the `isMain`-gated ui.log-reset + autofocus stay main-only; only the CDP-registration gate is relaxed to register every frame). `BoardEditorModel` tracks frames in a per-tab map + `activeTabId`; `BoardTargetModel` enumerates frames as tabs, and its `switchTab` **opens + activates the sidebar panel** so the target frame mounts before automation drives it. Frames are resolved by their unique `?v=<nonce>`, disambiguating multiple tabs of the same board and the lingering pre-reload frame after a remount.

**Debugging observability.** The shim mirrors `console.error`/`console.warn` from every board frame to the board's `ui.log` via a `board:log` host-frame message (alongside its existing uncaught-error / unhandled-rejection / CSP detectors) — `console.log`/`info` are deliberately not mirrored. The `board_refresh` MCP tool is deterministic: it registers a `BoardEditorModel.waitForFrameLoad()` waiter **before** issuing the reload, awaits the remounted main frame's load + CDP re-registration, and returns `frameReady` — so a snapshot right after refresh can no longer hit the stale pre-reload frame (a `frameReady: false` timeout still reports `refreshed: true`, signalling the agent to check `ui.log` rather than snapshot garbage).

## Editor Folder Structure

Every editor follows this pattern:

```
/editors/[name]/
├── index.tsx              # EditorModule export — factory + matchers
├── [Name]Editor.ts        # EditorModel subclass (state, lifecycle, business logic)
├── [Name]Body.tsx         # React component (or [Name]View.tsx for non-text editors)
├── components/            # Editor-specific components (optional)
└── utils/                 # Editor-specific utilities (optional)
```

## Editor Switching

Text-bearing editors (those with `IContentHost` + `CONTENT_HOST_TRAIT`) support switching views (e.g., JSON text ↔ Grid view):

```typescript
// Get available switch options for current language
const opts = editorRegistry.getSwitchOptions(language, filePath);
if (opts.options.length > 1) {
    // Render switch buttons in the toolbar
}
```

The page-level switch invokes `PageModel.switchMainEditor(newEditorId)`, which delegates to `switchEditorViaContentHost` to transfer the host.

**Host-state-driven switch offers:** an editor's `accepts(input)` receives the candidate `input.host`, so a switch can be offered conditionally on host state — not just file type. The `file-diff` editor uses this: `accepts` returns a positive priority only when `input.host.state.gitRepo` is set (the file lives in a git repo), otherwise `-1`. Because the `SwitchWidget` (`PageToolbar.tsx`) also subscribes to `host.state`, the "Git Diff" switch appears the moment async git detection lands on the shared host (see [state-management.md](state-management.md#host-centric-git-detection)). This is how every text editor inherits the File Diff switch with zero per-editor code.

### Content-Based Editor Detection

Structured JSON editors (notebook, link, graph, rest-client) embed a `"type"` property in their JSON content:
- `"type": "note-editor"` → notebook-view
- `"type": "link-editor"` → link-view
- `"type": "force-graph"` → graph-view
- `"type": "rest-client"` → rest-client

This allows the correct switch button to appear even when the file name doesn't match the expected pattern (e.g., `.note.json`). Detection uses fast regex checks (no JSON parsing) via the `isEditorContent()` hook on `EditorModule`.

`TextFileModel` runs detection:
- **Immediately** on `restore()` and `changeEditor()`
- **Debounced (2.5s)** on `changeContent()`
- Timer is cancelled on `dispose()`

The detected editor is stored in `TextFileModel.state.detectedContentEditor` and merged into switch options by the toolbar.

## EditorRegistry API

```typescript
editorRegistry.register(module)                    // Register an EditorModule
editorRegistry.getById(id)                         // Get module by ID
editorRegistry.getAll()                            // Get all registered modules
editorRegistry.resolve(input)                      // Resolve module for file path / content / language
editorRegistry.resolveId(input)                    // Resolve just the editor ID
editorRegistry.validateForLanguage(editor, lang)   // Validate editor/language combo
editorRegistry.getSwitchOptions(lang, filePath)    // Get UI switch options
editorRegistry.getPreviewEditor(lang, filePath)    // Get auto-preview editor for the file
editorRegistry.detectContentEditor(lang, content)  // Detect editor from content `type` field
editorRegistry.createEditor(id)                    // Create an EditorModel instance
```

The registry is the single resolution surface — it owns extension/language/content matching internally (no external `registry.ts` to delegate to).

## Adding a New Editor

See [Editor Creation Guide](../standards/editor-guide.md) for the full recipe with code samples.
