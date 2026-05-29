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

22 editor classes. The `IContentHost?` column indicates whether the editor composes an `IContentHost` (text-bearing) — these can switch between each other on the same page. The `Trait?` column indicates whether the editor exposes `CONTENT_HOST_TRAIT` — these participate in owner-orchestrated switching.

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
| `todo-view` | `TodoEditor` | `.todo.json` | ✓ | ✓ |
| `link-view` | `LinkEditor` | `.link.json` | ✓ | ✓ |
| `log-view` | `LogViewEditor` | `.log.jsonl` | ✓ | ✓ |
| `graph-view` | `GraphEditor` | `.fg.json` | ✓ | ✓ |
| `draw-view` | `DrawEditor` | `.excalidraw` | ✓ | ✓ |
| `rest-client` | `RestClientEditor` | `.rest.json` | ✓ | ✓ |
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
| `compare` | `CompareEditor` | (triggered) | — | — |

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

    // Persistence
    getDescriptor(): HostDescriptor;
    confirmRelease(closing?: boolean): Promise<boolean>;
    dispose(): void;

    // Secondary editor membership (managed by setter, see secondary-editors.md)
    secondaryEditor: string[] | undefined;
}
```

`EditorModel` extends `TDialogModel` indirectly via the queue/state primitives — every editor can `close()` with confirmation and has a `canClose` guard.

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
| `page.asTodo()` | `TodoEditorFacade` | `TodoEditor` |
| `page.asLink()` | `LinkEditorFacade` | `LinkEditor` |
| `page.asMarkdown()` | `MarkdownEditorFacade` | `MarkdownEditor` |
| `page.asSvg()` | `SvgEditorFacade` | `SvgEditor` |
| `page.asHtml()` | `HtmlEditorFacade` | `HtmlEditor` |
| `page.asMermaid()` | `MermaidEditorFacade` | `MermaidEditor` |
| `page.asGraph()` | `GraphEditorFacade` | `GraphEditor` |
| `page.asDraw()` | `DrawEditorFacade` | `DrawEditor` |
| `page.asBrowser()` | `BrowserEditorFacade` | `BrowserEditorModel` |
| `page.asMcpInspector()` | `McpInspectorFacade` | `McpInspectorEditorModel` |

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

### Content-Based Editor Detection

Structured JSON editors (notebook, todo, link, graph, rest-client) embed a `"type"` property in their JSON content:
- `"type": "note-editor"` → notebook-view
- `"type": "todo-editor"` → todo-view
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
