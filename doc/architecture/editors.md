# Editor System Architecture

## Overview

Every editor in Persephone is a top-level `EditorModel` subclass. There is one uniform editor architecture — no separation between "content-views" and "standalone" editors. Text-bearing editors (Monaco, Grid, Markdown, Notebook, etc.) compose an `IContentHost` for content I/O and expose a `CONTENT_HOST_TRAIT` so any owner (page, notebook note, future container) can switch editor types by transferring host ownership.

Each editor:
- Subclasses `EditorModel<TState>` (`/src/renderer/editors/base/EditorModel.ts`)
- Has its own state, lifecycle hooks, and reactive `state: TOneState<TState>`
- Renders a specific UI for the file type
- Is loaded asynchronously for code splitting
- Can expose a scripting facade through the current-page `page.editor` node

All editor code lives in `/src/renderer/editors/`.

## Editor Catalog

29 editor classes (33 registered editor IDs — `GridEditor` serves three IDs). The `IContentHost?` column indicates whether the editor composes an `IContentHost` (text-bearing) — these can switch between each other on the same page. The `Trait?` column indicates whether the editor exposes `CONTENT_HOST_TRAIT` — these participate in owner-orchestrated switching.

| Editor ID | Class | File types | IContentHost? | Trait? |
|-----------|-------|------------|---------------|--------|
| `monaco` | `MonacoEditor` | `*` (all — the fallback when nothing else claims the file) | ✓ | ✓ |
| `grid-json` | `GridEditor` | `.json`, `.grid.json` | ✓ | ✓ |
| `grid-csv` | `GridEditor` | `.csv`, `.grid.csv` | ✓ | ✓ |
| `grid-jsonl` | `GridEditor` | `.jsonl`, `.ndjson`, `.grid.jsonl` | ✓ | ✓ |
| `md-view` | `MarkdownEditor` | `.md`, `.markdown`, … (opens by default) | ✓ | ✓ |
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

> **Toolset editor:** `ToolsetEditorModel` is a lightweight read-only viewer for one registered *toolset* (a folder holding `tools-manifest.json` + tool scripts — the Agent Tools registry). Like the board and git-tree editors it is a **no-host target editor** (`hasContentHost: false`, `accepts: () => -1`): it is never resolved from a filename, but opened by the `persephone-toolset://` link scheme (encode/decode in `content/persephone-toolset-link.ts`, parsed in `parsers.ts` → `target: "toolset-view"`, built by its module's `newEditorModel` through `PagesLifecycleModel.buildEditorById`, and restored via the `NO_HOST_EDITOR_IDS` allow-list in `PagesPersistenceModel`). Opening it from a normal click on `tools-manifest.json` is deliberately *not* wired — that still opens the JSON in Monaco; instead the file gets an "Open Toolset" trailing icon in the Explorer tree (register-gated via `RegisterToolsetDialog` when the folder is untrusted), mirroring `board-manifest.json`'s "Open Board" icon. The view shows the manifest's metadata, a registered chip, Open-Folder / Open-Log buttons, and a card per declared tool. The registry/trust/executor layer it reads (`api/tools/`) is intentionally kept off the `app` model and every script `.d.ts`, so scripts can neither self-register nor execute tools — the same rule that keeps `board-trust.ts` unscriptable.

> **Board editor:** `BoardEditorModel` is a Pattern-B (survive-navigation) editor. It hosts the board's `index.html` in an in-DOM cross-origin `<iframe src="board://<host>/index.html">` (no `sandbox` attribute; `host` is a stable hash of the board root minted by main; isolated by SOP + `nodeIntegrationInSubFrames: false` + a CSP that forbids remote network). The `board://` protocol is registered once on the host session and routes host→board-root. A browser-IIFE shim (`src/board-shim.ts`), inlined into the served HTML by the `board://` handler, rebuilds `window.persephone` — the bridge object — over a per-board `MessagePort` (minted by `MessageChannelMain` in main, handed off through a one-time renderer-brokered handshake): `execute()` (thin client over the main-process command runner), the integration tier (`openRawLink`, `notify`, file/folder dialogs, `readFile`/`writeFile`), and the theme/token contract (`--p-*` CSS variables injected into the served `<head>` for a themed first paint, live across theme switches). The theme shortcuts travel the other way for the same SOP reason the content bridge exists: the host's global `KeyboardService` listens on the **host** document, which a cross-origin frame's keydown never reaches, so the shim forwards Ctrl+Alt+`[` / `]` to the host as `board:cycleTheme` and both paths converge on the shared `api/cycle-app-theme.ts`. It uses the same bubble-phase `defaultPrevented` opt-out as the forwarded Ctrl+S, and — unlike `board:setStatusText`, which is main-frame-only because the footer is main-view state — it is accepted from **any** frame, since the app theme is global rather than per-board. Automation (`browser_*`) targets the board **frame** via CDP through `BoardTargetModel`. Trust is per-board (`board-trust.ts`): an untrusted board blocks rendering (see `UntrustedBoardView.ts`), and a missing board root shows `BoardNotFoundView.ts`. The `boards-assets/` root holds the recommended-components catalog (skins + manifest). See `assets/board-template/CLAUDE.md` for the board authoring guide.

> **Board Info editor:** `BoardInfoEditorModel` (`board-info`) is a single screen serving two modes — **install** (an uninstalled catalog board: a Download → Register two-step with byte progress) and **properties** (an installed board: info, a fetched-on-demand versions list for install/rollback, Uninstall/Unregister, Open board). It is a **host-capable holder**: like `BoardContentEditorModel` it adopts/yields `CONTENT_HOST_TRAIT` without ever rendering the content, so switching `Text ↔ + ↔ content-host board` on a file page transfers the same content host with no reload or data loss (hence the "holder" entry in the table — it exposes the trait but composes no `IContentHost` of its own). It is reached from the `"+"` editor-switch entry (which maps to this editor id, so selection is an ordinary `switchMainEditor`), the board toolbar's Properties button, the Tools & Editors hub, and the update toast. `openBoardInfo(page, opts)` replaces a page's editor in place; `openBoardInfoPage(opts)` opens a new page. When the outgoing editor is a **simple** board (or a plain `board-view`) it holds no transferable host, so `openBoardInfo` instead captures that editor's `filePath` into the Board Info state; `currentFileName()` prefers it, so the editor-switch still offers the file's real built-in peers plus the board, and **Open board** switches back to the file-viewing board rather than opening a bare one. (A content-host source needs none of this — the transferred host already carries the file.) Install trusts nothing — registration is the separate `showTrustBoardDialog` consent step.

> **Published Boards catalog:** boards published to the `andriy-viyatyk/persephone-boards` GitHub repo are discoverable and installable in-app. The main-process `published-boards-service.ts` fetches the raw `boards-manifest.json` (24h-gated, cached for offline, `isSafeBoardId`-guarded against traversal ids), the renderer `published-boards.ts` model holds it reactively, and `board-install.ts` / `board-install-registry.ts` / `board-updates.ts` perform the sha256-verified download → extract → registry-record install, in-place folder-swap updates/rollbacks (never destroying a working board), and update detection. The **Tools & Editors hub** (`editors/tools-hub/`, `tools-hub-view`) — a full-page counterpart to the sidebar panel, a singleton page keyed by a fixed `PageModel` id — browses the catalog in its "Search boards" tab. Every install/properties action opens the Board Info editor above; nothing is ever trusted without the user's dialog click.
>
> A catalog entry may also declare a **screenshot** — a bare file name (`"screenshot": "screenshot.png"`) that the board carries in its folder in the catalog repo. `validateBoard` accepts it only through `isSafeAssetName`, the same bare-name charset rule that guards board ids: the value is interpolated into a raw URL, so a path separator, `..`, a leading dot or a scheme must never survive, or a hostile catalog entry could escape the board's folder or aim the app at another host. The resolved `screenshotUrl` is **derived as the catalog leaves the service** (`withScreenshotUrls`, applied to both `getPublishedBoards` returns and the `ePublishedBoardsUpdated` broadcast) rather than stored — so the cached copy holds only what the manifest said, a `PERSEPHONE_BOARDS_BRANCH` switch takes effect without a refetch, and a changed base URL is not mistaken for changed content by the cache comparison. `BoardScreenshotView.ts` renders it on the Search boards cards and both Board Info modes. The image loads straight from the repo over `https`: the app renderer sets no `img-src`/`default-src` CSP, so a remote `<img>` needs no policy change and Chromium's HTTP cache covers repeat views. It is deliberately **not** fetched through main or cached to disk — a screenshot is decoration, and the visible consequence is that screenshots do not appear offline even though the catalog itself is cached offline by design. No URL, a 404 and no network therefore all collapse to the same placeholder at an identical footprint, which is what keeps card heights from jumping. The screenshot is also **excluded from the published board ZIP** (it is catalog decoration the board never reads), so an installed board has none on disk — which is why properties mode resolves the URL by catalog id, and why a locally registered board that was never in the catalog shows the placeholder.

> **Tools & Editors hub:** `ToolsHubEditor` (`tools-hub-view`) is the page-sized sibling of the `ToolsEditorsPanel` sidebar panel, opened by the panel's "Open in new tab" button. It is a singleton — `showToolsHubPage()` builds it against a fixed `PageModel` id so `addPage` dedups to the existing page. Its native `ToolsHubView` owns the Built-in / Registered boards / Search boards / Tools tabs and the Pinned rail; `SearchBoardsTabView` owns the published-catalog cards. The sidebar and hub share native view implementations (`PinnedRailView`, `BuiltinEditorsListView`, `TrustedBoardsListView`, `TrustedToolsListView`).

> **Image content pipe integration:** `ImageEditor` has `ensurePipe()` to reconstruct the pipe from `filePath` on app restart (the shared helper is `content/rebuild-pipe.ts`). For non-local sources (HTTP URLs, archive entries) it reads content through the pipe and caches to disk as `{pageId}.img` for offline restart recovery; cache files are cleaned up on page dispose. Custom-editor boards reach the same outcome through `BoardEditorModel.getFilePath()` — see [Custom-Editor Boards](#custom-editor-boards).
>
> **Image URL support:** `ImageEditor` can display images from external URLs (e.g. browser context menu "Open Image in New Tab"). For HTTP URLs, an `HttpProvider` pipe is created (serializable, re-fetches on restart). The image binary is also cached to disk as a fallback. For blob URLs (REST client, drawing export), the binary is cached to disk immediately since blob URLs don't survive restart. URL-based images show a "Save Image to File" toolbar button.

## Rendering Architecture

The board editor follows the same native page path: `BoardEditorView` owns the board's four-way
exclusive branch, while `BoardWebview`, `BoardToolbar`, `BoardNotFoundView`, and
`UntrustedBoardView` are native views. The board iframe and any secondary board frame therefore
remain native-owned children of the page slot; a board branch does not add a React root.

```
RenderEditor
└── AsyncEditorView
    └── module.View → native VanillaView root
```

All editors flow through the same path — there is no longer a content-view branching point that wraps text-bearing editors inside `TextEditorView`. Every `EditorModule` has one required framework-free `View` arm, and `AsyncEditorView` mounts it directly. Native text editors compose `TextChromeView`, while no-host editors that need shared page controls compose `PageToolbarView`. `EditorToolbar` and `ContentHostFooter` are native views, not editor-module arms.

**Error protection:** `AsyncEditorView` catches native editor construction, mount, update, and module-load failures and displays `NativeEditorErrorView` with the error message and optional stack.

There are two distinct module-load boundaries on the file-open path. Standalone (no-host)
editors load their `newEditorModel(filePath)` implementation while `buildEditorById` is
constructing the model; user-action callers that own a transient content pipe must guard that
operation and dispose the pipe when construction is abandoned. Text-bearing/content-host editors
are different: their synchronous attach step constructs from the registry's warmed module cache,
while the native editor `View` is loaded and mounted later by `AsyncEditorView`. A registry-cache
miss can therefore fail during synchronous `attachEditorToPage`, while a later view-module failure
is reported by the native error host. A guard around `createEditorFromFile` cannot be treated as
coverage for either later boundary; each caller or view owner must handle the boundary it owns.

The graph, rest-client, env-vars, and file-diff editor bodies are native `VanillaView`s. The draw
editor is native around its vendor boundary: `DrawBodyView` owns the chrome, model bindings, and
teardown, while `ExcalidrawIsland.tsx` is the named React island required by the Excalidraw
package. A vendor host introduced by a native view must have explicit geometry in its scoped CSS
when the hosted widget cannot establish its own size.

### Monaco widget hosting

Monaco widgets are owned by two framework-free hosts in `editors/shared/`: `MonacoEditorHostView`
wraps `monaco.editor.create`, and `MonacoDiffEditorHostView` wraps
`monaco.editor.createDiffEditor`. Their `*View.ts` files own the Monaco lifecycle directly.

The hosts are uncontrolled. `initialValue`, or `initialOriginal` and `initialModified`, is read only
when the widget mounts. Later content changes go through `setValue(next)` or
`setDiffValues(original, modified)`. Those methods compare against the current model, no-op when
equal, suppress the host's own change callback while writing, use `setValue` for read-only widgets,
and otherwise use `executeEdits` followed by `pushUndoStop` so external updates preserve undo
history. Consumers must not duplicate that policy against the raw Monaco editor.

`onMount` receives the host view, not the Monaco widget. Consumers needing widget-specific APIs use
`host.getEditor()`. The hosts have no `theme` or `height` prop: Monaco's theme is global and is
defined/applied by `api/setup/configure-monaco.ts`, while sizing belongs to CSS. Each host has its
own root class and child-width rule because Monaco can collapse to zero width as a flex child.

Models created through a host are owned by it. `setModel(model, "owned" | "borrowed")` releases an
owned model it displaces; borrowed models are never disposed. The host detaches the widget before
disposing owned models, and defers that disposal to a macrotask so Monaco has finished releasing its
model references. This applies to single-editor models and diff original / modified pairs.

## EditorModel Base Class

```typescript
abstract class EditorModel<TState extends IEditorState = IEditorState> {
    readonly id: string;
    readonly editorId: string;          // e.g. "grid-json", "image-view"
    readonly state: TOneState<TState>;
    readonly traits: TraitSet;
    readonly queue: ComponentQueue;
    page: IPageHost | null;             // back-reference, set via setPage()

    // Lifecycle (three-phase)
    applyRestoreData(data: Partial<TState>): void;
    switchFrom(oldEditor: EditorModel): void;   // content-host transfer (throws if unsupported)
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
    getIconElement?: () => Element | undefined; // self-supplied DOM icon for noLanguage editors

    // Page-area presentation hint
    showBackgroundOrnament: boolean;     // default false; when true the page area
                                         // pins the decorative Ornament bottom-right,
                                         // behind content (Settings, About)

    // Page-tab context menu (see "Page-tab context menu" below)
    onGetMenuItems(): MenuItem[];        // default delegates to contentHost
}
```

`EditorModel` extends `TDialogModel` indirectly via the queue/state primitives — every editor can `close()` with confirmation and has a `canClose` guard.

## TextHostEditorModel Base Class

Every text-bearing editor that wraps a `TextFileModel` host extends
`TextHostEditorModel` (`/src/renderer/editors/base/TextHostEditorModel.ts`), a layer between
`EditorModel` and the concrete editors (Monaco, Grid, Markdown, Mermaid, SVG, HTML, Graph,
Link, Notebook, Rest Client, Draw, EnvVars, FileDiff, LogView). It owns the host-adoption
lifecycle those editors would otherwise each reimplement:

- `CONTENT_HOST_TRAIT` registration (host transfer on editor switch), `switchFrom`,
  `restore` (with the fallback-to-empty-host error path), the public `adoptHost(host)`
  (teardown → `descriptorChanged` forward → title/id stamp → host `state.editor` tag →
  `setPage` propagation), identity-only `getRestoreData`/`applyRestoreData`,
  `confirmRelease`/`saveState`/`setPage`/`dispose`, and the `contentHost`/`host` accessors
  plus `findCompatibleEditors`/`getNavigatorTarget`.
- A **host-subscription registry**: subclasses attach domain subscriptions via
  `registerHostSubscription(unsub)`; the whole set is torn down together on re-adopt, on
  trait extraction (switch-away), and on dispose — a subclass cannot leak a subscription by
  forgetting a release handle.
- A **content echo guard**: editors that serialize back into the host call
  `writeToHost(content, byUser?)`, and read external changes via
  `subscribeHostContent(handler)`. The shared guard matches the exact written content; a matching
  notification is consumed, while every nonmatching notification clears pending tokens before the
  handler processes the genuine external change.
- A **host-settings mirror**: `mirrorHostSettings(apply, snapshot, selector?)` seeds editor
  state from `host.getEditorState(editorId)` and mirrors later changes back with
  `setEditorState`, so per-editor view settings (Markdown `compactMode`, Mermaid
  `lightMode`, Grid columns/filters, …) survive both editor switches and app restarts.

Subclass hooks: `displayName` (error/notify strings), `adoptHost` override (call `super`
first, then wire domain subscriptions / kick an in-adoption parse), `onHostAttached(host)`
(initial load — runs on the switch, session-restore, and open-file paths; the open-file
constructor `attachEditorToPage` reaches it through the public `bootstrapFromHost()` bridge
after `adoptHost`. It does NOT run on a bare `adoptHost` or on `restore`'s error-fallback
path), `onHostExtracted()` (clear domain refs when a successor extracts the host), and
`untitledName()` (title fallback, e.g. `"untitled.link.json"`).

The two board editors do **not** extend it: `BoardContentEditorModel` already extends
`BoardEditorModel` (single inheritance), and `BoardInfoEditorModel` deliberately deviates
from the standard lifecycle (optional host, tolerant `switchFrom`, no host `editor` stamp,
no fallback host on restore failure). Both keep their own host plumbing.

## Editor icons

The glyph that represents an editor — on its page tab, in the Tools & Editors list, and at the start of its sidebar panel headers — comes from one of two sources, decided per editor:

- **`noLanguage` editors** (`noLanguage = true`) supply their own icon through `getIconElement` — e.g. `this.getIconElement = () => createIconComponentElement(GitIcon)`. These are editors with no Monaco language (Git Tree, Archive, Explorer, Storybook, …). An editor that sets `noLanguage` but no `getIconElement` shows no icon.
- **Language editors** (`noLanguage = false`, the default) derive a file-type icon from their
  `language` + `title` via the native resolver in
  `components/icons/language-icon-resolver.ts`, which resolves the language map, compound-extension
  patterns like `*.note.json` → Notebook, the OS system icon, then a default.

This decision is centralized in the shared **DOM-first editor-icon resolver** ([`components/icons/icon-elements.ts`](../../src/renderer/components/icons/icon-elements.ts)):

```typescript
createEditorIconElement({
    noLanguage: model.noLanguage,
    getIconElement: model.getIconElement,
    language: model.language,
    title: model.title,
});
```

`createEditorIconElement` accepts a duck-typed source rather than importing `EditorModel`, so `components/icons` stays decoupled from the editors layer. It prefers an editor's `getIconElement()` when available, then the language/file DOM resolver, and returns either `{ kind: "element", element }` or `null`; there is no React fallback arm. The resolver forces **no size and no color**: icons carry their own sizing, and leaving `color` unset lets the surrounding header color cascade — monochrome `currentColor` icons follow the header state, while explicitly-colored icons keep their own hue.

`getIconElement()` must return a fresh detached node for each call. A DOM node is single-use: passing the same node to a tab and a panel, or to two menu hosts, moves it to the later host and makes it disappear from the first. Build editor glyphs at the point of use rather than caching or sharing them. The theme icon module (`theme/icons.ts`) is a builder contract, not a React component contract: `SvgIconComponent` exposes a required `createElement` function and optional `viewBox`; native callers use the builders in `components/icons/icon-elements.ts` and `theme/icons.ts`.

The Tools & Editors list keeps its **own** per-item icon in [`tools-editors-registry.ts`](../../src/renderer/ui/sidebar/tools-editors-registry.ts) (it lists editor *types*, not live models), so a new editor icon must be set there too if the editor appears in that list.

## Page-tab context menu

A page tab's right-click menu has two tiers. The **tab-level** items (Close, Close Others, Close to Right, Open in New Window, Duplicate, Pin/Unpin) are built with the shared helpers and constants in `PageTab.ts` and are identical for every editor — they call only page/`PagesModel` operations. The **editor-specific** items come from the editor model itself, through a single hook:

```ts
onGetMenuItems(): MenuItem[] {           // EditorModel default
    return this.contentHost?.onGetMenuItems?.() ?? [];
}
```

`PageTabView.handleContextMenu` appends `mainEditorInstance.onGetMenuItems()` after the tab-level items and stamps `startGroup: true` on the first contributed item, so the tab owns the divider between the two tiers.

The default routes to the content host, which is the extensibility seam:

- **Text-bearing editors** get the full text-file menu for free — `TextFileModel.onGetMenuItems()` returns it, and every editor that wraps a `TextFileModel` host inherits it without per-editor code.
- **Non-text editors** override `onGetMenuItems()` to contribute their own items (Git Tree → "Open Git Root Folder" / "Copy Remote URL"; Image/Archive → the file-path items).
- An editor with nothing to add inherits the base default and a null content host, returning `[]` — so no disabled/irrelevant items appear.

The menu items themselves live in [`editors/shared/editor-menu-items.ts`](../../src/renderer/editors/shared/editor-menu-items.ts):

- `textFileMenuItems(host)` — Save / Save As / Rename / file-path items / encryption group. The single home of the text-file menu; `TextFileModel.onGetMenuItems()` returns it, and `TextFileModel` owns `promptRename()` (the rename dialog).
- `filePathMenuItems(filePath)` — Show in File Explorer + Copy File Path. Reusable by any editor with an on-disk path (the text host, plus standalone Image / Archive editors). Disabled (not hidden) when the path is absent.

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
const CONTENT_HOST_TRAIT = new TraitKey<IContentHostTrait>("content-host");

interface IContentHostTrait {
    extractContentHost(): IContentHost;     // detach — old editor must NOT dispose it
}
```

The transfer runs through the **new** editor's `switchFrom(oldEditor)` (implemented once in
`TextHostEditorModel`): it reads the old editor's `CONTENT_HOST_TRAIT`, calls
`extractContentHost()` (which tears down the old editor's host subscriptions and detaches
without disposing), preserves the old editor's `id` for cache-file continuity, then
`adoptHost()`s the extracted host. Content, file path, modifications, I/O state, encryption
all survive the switch untouched because the host is the same object.

## IImageExport

Editors that render visual content — the Mermaid preview, SVG preview, Image viewer, and HTML viewer — implement the `IImageExport` capability (`/src/renderer/editors/base/IImageExport.ts`):

```typescript
interface IImageExport {
    exportPng(): Promise<Blob>;          // rendered content as a PNG blob (natural size, 1×)
    suggestedImageName(): string;        // file basename without extension
}
```

For the rasterising editors (Mermaid, SVG, Image), export runs at the **model level and is host-independent** — it does not require a mounted view, so it works for a page that is not the active tab. The shared helpers in `/src/renderer/editors/shared/image-export.ts` do the canvas work: `rasterToPngBlob(src)` loads any source (an `image/svg+xml` data URL, a blob URL, or an http(s) URL) into an offscreen `<img>`, draws it to a canvas at natural size, and encodes a PNG. Because the browser performs the rasterisation, fonts and text render correctly — output external "SVG → PNG" tooling fails to produce.

Each model builds its own source before delegating: Mermaid uses its rendered SVG data URL (rendering on demand via `renderMermaid` when the preview has not been generated), SVG builds the `image/svg+xml` data URL from host content, and the Image viewer rasterises the displayed image URL. The shared `ImageViewport` UIKit component's clipboard copy shares the same canvas path (`imageElementToPngBlob`). Its zoom/pan model is view-local; the editor models remain responsible for source data and export capabilities.

The **HTML viewer captures differently**, and is the one implementer whose `exportPng()` is *not* headless. Its content renders inside a sandboxed `<iframe srcDoc>` whose document is cross-origin to the renderer, so it cannot be rasterised to a canvas. Instead `exportPng()` captures the **live on-screen iframe** pixel-for-pixel (WYSIWYG — the image matches exactly what is displayed) via the `capturePageRegion` IPC endpoint, which runs `webContents.capturePage(rect)` in the main process with the rect scaled by the window zoom factor. This requires a mounted, visible view and throws otherwise. The view reports the iframe element to the model through `setCaptureElement`, and the model derives the capture rect from its `getBoundingClientRect()`. Its toolbar exposes a Copy action plus a "…" menu (Save as PNG / Open in Image View / Edit Image); the latter two feed the captured blob to `pagesModel.openImageInNewTab` and `pagesModel.addDrawPage` (the data-URL conversion uses the shared `blobToDataUrl` helper alongside `blobToBuffer`).

Two shared entry points sit on top of `exportPng()`: `savePngViaDialog(source)` (prompts for a path; backs the editors' toolbar "Save" actions and surfaces failures as a toast) and `writePngToFile(source, filePath)` (writes directly; backs the `savePngToFile(filePath)` script-facade method). The Image viewer additionally offers a "Save original" action that writes the source bytes in their original format without re-encoding.

## Owner-Orchestrated Switching

Editor switching is initiated by the owner (the page, or a notebook), not by the editor itself. `PageModel.switchMainEditor(newEditorId)` — implemented in [`editor-switch.ts`](../../src/renderer/editors/base/editor-switch.ts), reached through a thin dynamic-import delegate on the page — creates the new editor via `editorRegistry.createEditor(newEditorId)` and hands it the old one:

```typescript
const newEditor = await editorRegistry.createEditor(newEditorId);
newEditor.switchFrom(oldEditor);   // extracts + adopts the shared host (TextHostEditorModel)
await page.setMainEditor(newEditor);
```

For non-text editors (Image, Browser, etc.) without `CONTENT_HOST_TRAIT`, there is no host to transfer — switching is a plain create+swap.

When the **source** is host-less but the **target** is a built-in file editor, a plain create+swap is not enough — the target has no host to adopt and its `switchFrom` would have nothing to build over. This happens when switching back from the Board Info install page ("+"), or from the host-less Archive viewer that claims zip-based files (`.xlsx`/`.docx`/`.pptx`). In that case `switchMainEditor` dispose-and-rebuilds the target over the file (`createEditorFromFile(filePath, …)`), reading the source editor's `filePath` (which host-less editors like Archive expose via a getter override). The Board Info target itself is exempt — its tolerant `switchFrom` captures the source's `filePath` so the install page can still match catalog editors and keep the file name.

## EditorModule Interface & Registration

Each editor folder's `index.ts` exports an `EditorModule` — the lazily-loaded half of the
registration (`/src/renderer/editors/base/editorRegistry.ts`):

```typescript
interface EditorModule {
    createEditor(): EditorModel;         // factory for a new instance (default state, id: "")
    newEditorModel?(filePath?: string): Promise<EditorModel>;
        // file-open factory for standalone (no-host) editors whose construction depends on
        // the opened path — decoding a link (git-tree, mneme-root, board, toolset, category),
        // seeding path-derived state (image, video), or reading the target (archive)
    // The required native main editor arm.
    View: VanillaViewCtor<{ model: EditorModel }>;
    // Chrome-free embedded arm: vanilla BodyView.
    BodyView?: VanillaViewCtor<{ model: EditorModel }>;
}
```

`View` is required and `BodyView` is optional for embeddable editors. The registry stores and
returns the native constructor as-is; it has no React arm and no normalization shim. All chrome
callers use native views, and `AsyncEditorView` mounts the module's `View` directly.

The eagerly-registered half is the `EditorDefinition` (`id`, `name`, `accepts`,
`hasContentHost`, `match?`, `loadModule`). Registration lives in
`/src/renderer/editors/register-editors.ts` as a **table + loop**: one row per editor
(`{ id, name, hasContentHost?, accepts?, load }`), with `match` derived from
`EDITOR_MATCHERS[id]` and `accepts` defaulting to `makeAccepts(match)` (or `() => -1` for
standalone editors with no matcher). Monaco and `file-diff` carry explicit `accepts`
overrides. Each row's `load` keeps a literal `import("./…")` so Vite code splitting is
preserved, and row order is preserved deliberately — it breaks priority ties in
`resolveForFile`.

## Editor Construction Paths

All construction is registry-driven; there are three paths:

- **Open a file (text-bearing).** The open flow builds a `TextFileModel` host, restores it,
  and hands it to `attachEditorToPage` (`api/pages/PagesLifecycleModel.ts`), which
  constructs the editor named by `host.state.editor` via `editorRegistry.createEditorSync`,
  calls `adoptHost(host)`, then `bootstrapFromHost()`. `attachEditorToPage` must stay
  **synchronous** — it sits under the sync scripting APIs (`addEditorPage`, `openLinks`,
  `addEmptyPage`, `page.grouped`) — so `createEditorSync` reads the registry's module cache,
  which `preloadContentHostModules()` warms in the background at the end of registration.
  Monaco is the one static exception (the guaranteed-sync floor): the startup empty page and
  `requireGroupedText` construct it before the preload can be assumed complete.
- **Open a file (standalone).** `buildEditorById` asks the module for `newEditorModel(filePath)`;
  a no-host id without one (browser, settings, …) is never a file-open target and falls back
  to a text host.
- **Editor switch / session restore.** `editorRegistry.createEditor(id, instanceId?)` +
  `switchFrom(oldEditor)` (switch) or `applyRestoreData` + `restore()` (restore) — see
  Owner-Orchestrated Switching above. `createEditor` awaits the module load, then delegates
  to `createEditorSync`, so the id-stamp rule lives once: modules construct with `id: ""`,
  and only a real (non-empty) `instanceId` is stamped.

## Scripting Facades

Editor facades provide safe, typed script access through the current-page `page.editor` node. Each
operation facade wraps the page's `mainEditor` (an `EditorModel` subclass) directly — there is no
separate view-model layer. The union is discriminated by `id`; registered editors without an
operation facade use `GenericEditorFacade`, which exposes only identity metadata.

| Facade access | Facade | Wraps |
|--------|--------|-------|
| `page.editor` | `TextEditorFacade` | `MonacoEditor` |
| `page.editor` | `GridEditorFacade` | `GridEditor` |
| `page.editor` | `NotebookEditorFacade` | `NotebookEditor` |
| `page.editor` | `LinkEditorFacade` | `LinkEditor` |
| `page.editor` | `MarkdownEditorFacade` | `MarkdownEditor` |
| `page.editor` | `SvgEditorFacade` | `SvgEditor` |
| `page.editor` | `HtmlEditorFacade` | `HtmlEditor` |
| `page.editor` | `MermaidEditorFacade` | `MermaidEditor` |
| `page.editor` | `GraphEditorFacade` | `GraphEditor` |
| `page.editor` | `DrawEditorFacade` | `DrawEditor` |
| `page.editor` | `BrowserEditorFacade` | `BrowserEditorModel` |
| `page.editor` | `McpInspectorFacade` | `McpInspectorEditorModel` |
| `page.editor` | `ImageEditorFacade` | `ImageEditor` |
| `page.editor` | `VideoEditorFacade` | `VideoEditor` |
| `page.editor` | `FileDiffEditorFacade` | `FileDiffEditor` |
| `page.editor` | `GenericEditorFacade` | Any registered editor without an operation facade |

Facades live in `/src/renderer/scripting/api-wrapper/`. Interfaces in `/src/renderer/api/types/*.d.ts`.

`page.editor` is a read-only discriminated facade union. Use `page.editorSwitches.switchTo(id)` to
change editors; the operation uses the same merged option projection as the toolbar and verifies
that the awaited switch completed. The switch projection is shared by
`PageToolbarView` and `PageEditorSwitchesNode` through
`/src/renderer/editors/base/editor-switch-options.ts`.

## Editor Resolution

When a file is opened:

```
File path → editorRegistry.resolve(filePath) → EditorModule → createEditor() / newEditorModel(filePath) → Render
```

`resolve` consults **only** each matcher's `acceptFile(fileName)` — a pure file-name test — and the highest returned priority wins. The tiers:

| Priority | Claimants | Matched on |
|----------|-----------|------------|
| 0 | `monaco` | everything — the floor that guarantees a file always resolves |
| 10 | `md-view` | any extension the Monaco language table maps to `markdown` |
| 20 | `grid-json`, `grid-csv`, `grid-jsonl`, `log-view`, `notebook-view`, `rest-client`, `link-view`, `graph-view`, `env-vars-view` | compound file-name patterns (`*.note.json`, `*.grid.csv`, …) |
| 50 | `draw-view` | `.excalidraw` |
| 100 | `image-view`, `archive-view`, `video-view` | binary-format extensions |
| 200 | `category-view` | `tree-category://` links |

Markdown sits at 10 rather than sharing monaco's floor because Persephone is used far more as a documentation *viewer* than as a Markdown editor, so `.md` files open in the rendered Preview by default. The tier is kept below 20 so a compound name always outranks it, and `md-view` derives its extension set from the shared Monaco language table (`getLanguageByExtension`) instead of a duplicated list — `.md`, `.markdown`, `.mkd`, `.mdown`, and the rest come along automatically.

Content-based detection is **not** part of this path: `acceptFile` never sees content. It belongs to `accepts()` (priority 60 when a `detectsContent` matcher fires) and reaches the user through the switch widget and `detectContentEditor` — see [Content-Based Editor Detection](#content-based-editor-detection).

All editor registration is in `/src/renderer/editors/register-editors.ts`; the matchers themselves are in `/src/renderer/editors/base/editor-matchers.ts`.

## Custom-Editor Boards

A trusted **Board** can register itself as the editor for a file type, so it appears in the editor switch next to Monaco (and can become the default open target) — the same extensibility the built-in editors have, but authored entirely outside Persephone's code. A board declares the association in its `board-manifest.json`:

- `fileMasks` — glob masks (`*`, `?`) matched against the file **basename** (e.g. `["*.drawio"]`, `["*.grid.json"]`). A wildcard-free entry is read by shape: one that starts with a dot or contains none at all is an **extension** (`"drawio"`, `".drawio"` → `*.drawio`), while one with a dot inside it is a whole **file name** kept exact (`"DASHBOARD.md"`, `"package.json"`) — that is how a board claims one specific file rather than a file type.
- `folderMasks` — optional folder globs that **narrow** `fileMasks` to certain locations (e.g. `fileMasks: ["DASHBOARD.md"]` + `folderMasks: ["*/tasks"]` claims only a dashboard that sits in a `tasks` folder, not every `DASHBOARD.md`).
- `editorPriority` — the board's slot on the same numeric resolution ladder the built-in editors use (monaco 0 / markdown 10 / compound names 20 / draw 50 / viewers 100 / category 200 — see [Editor Resolution](#editor-resolution)). The board becomes the **default** editor for its masks only when this strictly exceeds the best built-in claimant; omitted/`0` makes it a switch option only. Note the floor is not always 0: a board claiming a Markdown file competes with `md-view` at 10, so it needs `editorPriority` above **10** — not merely above 0 — to open by default.
- `editorName` — the switch-widget label (falls back to the manifest `name`, then the folder name).
- `editorSources` — `"local"` (default) or `"any"`: whether the board may be offered for a **non-local** source (an archive entry, an `http(s)` URL). Default-closed on purpose — see [Non-Local Sources](#non-local-sources).

These fields are honored **only when the board is trusted**.

**The mask predicate.** `matchesBoardMasks(filePathOrName, fileMasks, folderMasks)` is the single entry point for the whole axis — every consumer (the registry, the published-catalog matchers) goes through it rather than testing masks itself. A board claims a file iff the **basename** matches one of `fileMasks` **and** either there are no folder masks or the file's **parent folder** matches one of them. Folder masks only narrow: a board with no `fileMasks` has no association at all, even when `folderMasks` is present, so `getBoardEditorAssociation` still gates on `fileMasks` alone.

A folder mask is a path **suffix**, so it need not spell out the drive or root, and it is separator-aware: `*` and `?` stop at `/` while `**` crosses it. That is what makes `*/tasks` mean "exactly one segment above a `tasks` folder"; `tasks` matches a folder of that name at any depth, `**/dev/tasks` spans intermediate segments, and an absolute mask such as `c:/projects/acme/**` scopes a board to one tree. Masks are normalized to lowercase forward-slash form (a trailing slash is accepted and ignored) and matched case-insensitively.

Callers may legitimately pass a bare file **name** instead of a path — a page title, or a tree row's display name in the file-icon surfaces. With no directory to inspect the folder gate cannot be evaluated, and it is **skipped rather than failed**: a folder-scoped board still lends its icon to every name-matching file. That is a deliberate trade. An icon is cosmetic and carries no path, whereas the two paths that actually **decide** which editor opens a file — `resolveEditorIdForFile` and the editor-switch widget — always hold a full path and therefore always honor the folder scope.

**Two registries, merged.** Board editors are runtime-discovered, so they are **not** injected into the static `editorRegistry`. They live in a separate reactive registry, `customEditorRegistry` (`editors/board/custom-editor-registry.ts`), which enumerates `boardTrust.listPaths()`, reads each manifest, and maps file → claiming boards. It reacts to trust changes (an untrust drops the association live) and re-reads a manifest on refresh — there is no filesystem watcher, mirroring the Agent Tools `registeredTools` precedent. Each associated board is a distinct **virtual editor id** `board-editor:<boardRoot>` (`boardEditorId` / `parseBoardEditorId`), where the remainder after the prefix is the board root verbatim (original case; may contain `:` and `\` — parse by prefix, never by split).

**Merged resolution.** `resolveEditorIdForFile(filePath, matchPath?)` reads both registries and returns the winning id: it compares the best built-in `acceptFile` priority against the highest-priority trusted board claiming the file. A board wins only on a strictly-greater priority (built-ins win exact ties; among boards, trusted-list order), and — for a non-local source — only when it is eligible for one (see [Non-Local Sources](#non-local-sources)). The optional `matchPath` exists because those are two different questions about the same open: locality is judged on the **original** url (`isPlainLocalPath`), while mask and built-in matching run against the **effective** path, so an `archive.zip!doc.pdf` entry is matched as `doc.pdf` without being mistaken for a local file. This helper — **not** `editorRegistry.resolveId` — is the merge point, called at the two file-open decision points: direct open (`PagesLifecycleModel.newEditorModel`) and the Layer 2 `openRawLink` file resolver (`content/resolvers.ts`). It is deliberately kept out of `editorRegistry.resolveId` so a `board-editor:<root>` id never leaks into `TextFileModel`/`resolvers` internal lookups.

**Construction & switch.** When resolution yields a `board-editor:<root>` id, `PagesLifecycleModel.buildEditorById` decodes the root (in a branch placed *before* the text-fallback, so an unrecognized board id can't silently open as text) and builds a `BoardEditorModel` initialized with the target file path. `PageModel.switchMainEditor` branches on the `board-editor:` prefix *before* the `editorRegistry.getById` lookup (which throws on unregistered ids): it runs the old editor's `confirmRelease()` guard (abort on cancel — reusing navigation's unsaved-changes prompt), then rebuilds through `createEditorFromFile` in both directions (a board has no shared content host to transfer). The switch widget (`SwitchWidgetView` in `PageToolbarView.ts`, and its direct `mountVanilla` use in `BoardToolbar.ts`) merges the board options from `customEditorRegistry.useBoardsForFile` and resolves their labels from the registry rather than `editorRegistry.getById`. For the switch to stay visible while the user is *on* the built-in peer, that peer must expose `filePath` (the `switchMainEditor` board branch reads `oldEditor.filePath` and aborts if it is absent) and return itself from `findCompatibleEditors()` (the widget hides unless the active id is among its options, then appends the file-associated boards). Text editors inherit both from the shared host; a **no-host** built-in that can be a simple board's peer overrides them explicitly — the Archive editor does (exposing its `archiveUrl` as `filePath`, returning `["archive-view"]`), so it can be the built-in peer of a board claiming a ZIP-based file such as `.xlsx` / `.docx`.

**The switch list while the board is active.** The mirror-image requirement: `BoardEditorModel.findCompatibleEditors()` has to name the built-in editors the user should be able to return to, and it must agree with what those editors themselves offer — otherwise segments appear and disappear as the user switches, which reads as a bug. Getting that agreement takes deliberate work, because the two sides ask different questions. A built-in text editor calls `findEditorsAccepting(host)`, which evaluates the **live content host** and therefore knows the file's `language`; that is the only way language-only editors (`md-view`, `html-view`, `mermaid-view`, `svg-view` — matchers with a `switchOption` but no `acceptFile`) can ever be named. A *simple* board never loads the file into a host, so it has no language to offer and a name-based `resolveId` lookup structurally cannot return any of them. It therefore reconstructs the language from the file extension via `getLanguageByExtension` and takes `editorRegistry.getSwitchOptions(language, filePath).options`, then appends the `resolveId` winner if the language pass missed it (`getSwitchOptions` deliberately returns an empty list when fewer than two options apply) and finally its own id. `getSwitchOptions` sorts ascending, so Monaco leads — the same order the built-in editors show. The general rule for any future host-less editor joining the switch: **`findEditorsAccepting` sees language, `resolveId` does not** — derive the language yourself or language-only peers will silently drop out of the widget.

**Identity & persistence.** A `BoardEditorModel` acting as a custom editor reports its `editorId` as the dynamic `board-editor:<root>` so the switch widget matches; but `getRestoreData()` pins the persisted id to `"board-view"` (the virtual id is re-derived from the persisted `filePath` on restore), keeping the board inside the `NO_HOST_EDITOR_IDS` allow-list and the automation guards. MCP/automation board detection uses `isBoardEditorId` (true for both `"board-view"` and any `board-editor:<root>`) so a file-associated board stays automatable. Note that `list_pages` reports the live `board-editor:<root>` id as a custom-editor board's editor — match such a page by its `boardRoot` / `selectedBoard`.

**File delivery.** The associated file path rides `ILinkData.filePath` (persisted, never baked into the `persephone-board://` URL) → `BoardEditorState.filePath` → `BoardEditorModel.currentFilePath()` → `BoardPortInitMsg.filePath`, and reaches the board as the async bridge method `persephone.getFilePath()`. The board reads/writes the file with the existing top-level `persephone.readFile()` / `writeFile()`. This is the **simple** custom-editor kind.

### Non-Local Sources

A simple board reads an ordinary path, but Persephone opens plenty of things that are not one — an entry inside an archive (`archive.zip!doc.pdf`), an `http(s)` URL, a pipe with transformers. Two mechanisms let a simple board serve those without learning anything about them.

**The declarative gate — `editorSources`.** `resolveEditorIdForFile` refuses to offer a non-local source to a *simple* board unless its manifest says `editorSources: "any"`; a content-host board is always eligible (Persephone owns its content either way). The gate is **default-closed**, and deliberately so: a board that reads its file with `persephone.readFile(path)` — the common shape — would break on a source that has no readable path, and the failure would be invisible to an author who only ever tests local files. Opting in is one manifest field, and the decision is made *before* any board code runs, which is why it has to be declarative rather than something a board could opt into by calling an API.

**The mechanism — materialization.** `BoardEditorModel.getFilePath()` always resolves to a readable **local** path. A plain local file returns its own path untouched, with no I/O. Anything else is read through the page's content pipe and written to a cache file named after the source (so the board's file-name label stays meaningful), memoized for the model's lifetime — the cache file outlives the iframe, so a board reload or `board_refresh` re-resolves for free. It is read-only: the cache is never written back through the pipe.

So a board has **no source-specific code at all** — one `getFilePath()` → `readFile()` path serves every source. What does change is the contract's edges, and a board must handle both: the call can be **slow** (for a URL it completes only after the whole download, since a content pipe read is all-or-nothing), and it can now **reject** (missing archive entry, HTTP failure) where before it could only return a path or `undefined`. A board that starts its heavy UI work in parallel with the call, and reports a rejection instead of leaving a blank frame, behaves correctly for every source.

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
- **Footer + Script panel parity.** `BoardEditorView` renders the shared `ContentHostFooter` (the `script` toggle · provider icon · encoding label) and the `ScriptPanel` below the board iframe **whenever `model.contentHost` is set** — so a content-host board gets the same footer and script-run affordance the built-in text editors get from `TextChromeView`. Plain boards (no host) stay footer-less. The footer row lives in `ContentHostFooterView` (`editors/base/`). A board can also contribute its own **footer status text** (e.g. a Todo board's item count) via `persephone.setStatusText(text)` — it lands in the footer's `footerContributions` slot (between the script toggle and the provider/encoding), the same slot the built-in Grid/Notebook editors fill. It rides the board→host-renderer `postMessage` channel as `board:setStatusText`, is routed only from the **main** frame (a secondary frame can't hijack the main footer), and stored as transient `BoardEditorState.statusText` (stripped from persistence, cleared on restore, re-set by the board on load). An isolated `FooterStatus` subscriber renders it so a frequently-changing count re-renders only the label, never the board iframe. `""` clears it; it's a no-op for plain boards.

**Construction & switch & persistence** (`PagesLifecycleModel`, `PageModel`, `PagesPersistenceModel`) branch on the kind: the `board-editor:<root>` construction branch builds the pipe + host + `BoardContentEditorModel` for `"content-host"`; `PageModel.switchMainEditor` transfers the host in **both** directions (built-in→board via `boardModule.createEditor` + `initFromBoardRoot` + `board.switchFrom`; board→built-in via `editorRegistry.createEditor` + `builtin.switchFrom`) with no `confirmRelease` (nothing is lost when the host survives); and `PagesPersistenceModel.restorePage` gains a board branch placed **before** its generic `if (d.host)` branch, so a restored content-host board rebuilds the subclass + host instead of collapsing into a plain `BoardEditorModel`. The three `isPlainLocalPath` gates (`resolveEditorIdForFile`, `findCompatibleEditors`, and the `SwitchWidgetView`) are lifted by kind so a content-host board surfaces as a switch option over non-local files — a simple board reaches the same sources by declaring `editorSources: "any"` (see [Non-Local Sources](#non-local-sources)). The `SwitchWidgetView` additionally treats the page **title** as the file name when there is no path (mirroring `editorRegistry.findEditorsAccepting`, which already resolves the built-in switch via `filePath ?? host.title`), so the board is offered on a freshly-renamed untitled page — only content-host boards qualify there, since a title-only page has no local path and simple boards require a real local file.

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

**The panel family.** Each declared view maps to a stable panel id `board-secondary:<viewId>` (helpers in `editors/board/board-secondary.ts`). The base model seeds `state.secondaryViewDefs` from the manifest (persisted set wins on restore) and derives `state.secondaryView = defs.map(d => "board-secondary:" + d.id)` — the bare panel-id list the shell reads (see [secondary-views.md](secondary-views.md)). The `secondary-view-registry` resolves the whole `board-secondary:*` family to **one generic provider**, `BoardSecondaryView` (`editors/board/BoardSecondaryView.ts`), via prefix-aware `has()`/`get()` at the native secondary-view host. `SecondaryViewProps` carries the `panelId` and DOM `iconElement`, so the one provider reads *which* view it is → strips the prefix → looks up the `secondaryViewDefs` entry → renders a native `SideBarPanelHeaderView` over a `BoardWebview` compatibility island pointed at that view's HTML. Every panel gets the **same `BoardEditorModel` instance**, preserving the single-model pattern.

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
├── index.ts               # EditorModule export — factory + matchers
├── [Name]Editor.ts        # EditorModel subclass (state, lifecycle, business logic)
├── [Name]BodyView.ts      # Native body, or [Name]View.ts for a standalone main view
├── [Name]Body.tsx         # Only for the Excalidraw vendor island under editors/draw/
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

The page-level switch invokes `PageModel.switchMainEditor(newEditorId)`, which transfers the host through the new editor's `switchFrom(oldEditor)` (see [Owner-Orchestrated Switching](#owner-orchestrated-switching)).

**Host-state-driven switch offers:** an editor's `accepts(input)` receives the candidate `input.host`, so a switch can be offered conditionally on host state — not just file type. The `file-diff` editor uses this: `accepts` returns a positive priority only when `input.host.state.gitRepo` is set (the file lives in a git repo), otherwise `-1`. Because the `SwitchWidgetView` (`PageToolbarView.ts`) also subscribes to `host.state`, the "Git Diff" switch appears the moment async git detection lands on the shared host (see [state-management.md](state-management.md#host-centric-git-detection)). This is how every text editor inherits the File Diff switch with zero per-editor code.

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
editorRegistry.resolve(fileName)                   // Best module for a file NAME (acceptFile only)
editorRegistry.resolveId(fileName)                 // Resolve just the editor ID
editorRegistry.findEditorsAccepting(host)          // All ids accepting a live content host (sees language)
editorRegistry.validateForLanguage(editor, lang)   // Validate editor/language combo
editorRegistry.getSwitchOptions(lang, filePath)    // Get UI switch options ([] when fewer than 2 apply)
editorRegistry.getPreviewEditor(lang, filePath)    // Get auto-preview editor for the file
editorRegistry.detectContentEditor(lang, content)  // Detect editor from content `type` field
editorRegistry.createEditor(id)                    // Create an EditorModel instance
```

The registry is the single resolution surface — it owns extension/language/content matching internally (no external `registry.ts` to delegate to).

## Adding a New Editor

See [Editor Creation Guide](../standards/editor-guide.md) for the full recipe with code samples.
