# Scripting System

## Overview

persephone includes a JavaScript/TypeScript execution environment that allows users to:
- Transform content programmatically
- Automate repetitive tasks
- Connect to databases and APIs
- Process data with full Node.js access

TypeScript support is provided via [sucrase](https://github.com/alangpierce/sucrase) (~275 KB), which strips type annotations before execution. Sucrase is loaded dynamically on first TypeScript execution, so it has zero cost if only JavaScript is used.

All scripting code lives in `/src/renderer/scripting/`.
Type definitions for the script API live in `/src/renderer/api/types/*.d.ts`.

## Architecture

```
ScriptRunner.run(script, page?, language?)
    │
    ├── new ScriptContext(page?, consoleLogs?, libraryPath?)
    │       ├── app = AppWrapper        ← wraps `app` global
    │       │     ├── PageCollectionWrapper  ← wraps `app.pages`
    │       │     └── Events proxy ← wraps `app.events` (auto-tracks subscriptions)
    │       ├── page = PageWrapper      ← wraps `page` global
    │       │     └── EditorFacades (14)  ← page.asText(), page.asGrid(), ...
    │       ├── io = IoNamespace        ← wraps `io` global (providers, pipes, events)
    │       ├── ai = AiNamespace        ← wraps `ai` global (ClaudeSession)
    │       ├── ui getter (lazy, stack-based on globalThis)
    │       ├── styledText()     ← standalone styled text builder for dialog labels
    │       ├── preventOutput()   ← suppresses default grouped-page output
    │       ├── customRequire    ← context-bound require with library/ resolution
    │       ├── console          ← native or MCP-capturing
    │       ├── React             ← React library
    │       └── ScriptOutputFlags ← tracks output suppression state
    │
    ├── ScriptRunnerBase.execute(script, context, language?)
    │       ├── prepare(script, language)
    │       │     ├── transpileIfNeeded()   ← strips TS types via sucrase (lazy-loaded)
    │       │     ├── ensureSucraseLoaded() + registerLibraryExtensions()
    │       │     └── clearLibraryRequireCache() if dirty (file watcher only)
    │       └── executeInternal(script, context)
    │             ├── Expression/statement detection
    │             ├── Wrap in async function, fn.call(context)
    │             ├── SCRIPT_PREFIX reads from `this` (context)
    │             └── Await result if Promise
    │
    └── context.dispose()  ← restores previous ui getter, unsubscribes events
```

## Execution Modes

### 1. Run Script (F5) / `page.runScript()`

For files with `javascript` or `typescript` language:
- Runs selected text, or entire content if nothing selected
- Output appears in grouped page (unless suppressed — see Output Suppression below)
- TypeScript files are transpiled (types stripped) before execution
- Also available programmatically via `page.runScript()` (equivalent to F5)

### 2. Script Panel

Available on any text file:
- Open via toolbar or context menu
- Monaco editor uses TypeScript language (supports both JS and TS transparently)
- Scripts are always transpiled as TypeScript (no-op for pure JS)
- Scripts have access to `page` and `app` variables

## Script Globals

Scripts execute with access to these globals:

### `page` — Current Page

```typescript
interface IPage {
    // Identity (read-only)
    readonly id: string;
    readonly type: EditorType;
    readonly title: string;
    readonly modified: boolean;
    readonly pinned: boolean;
    readonly filePath: string | undefined;

    // Mutable properties
    content: string;
    language: string;
    editor: string;  // editor ID (e.g. "monaco", "grid-json")

    // Script-local data storage (persists across runs within same session)
    data: Record<string, any>;

    // Grouped page (auto-creates if none exists)
    readonly grouped: IPage;

    // Editor facades (async — acquire ViewModel)
    asText(): Promise<ITextEditor>;
    asGrid(): Promise<IGridEditor>;
    asNotebook(): Promise<INotebookEditor>;
    asTodo(): Promise<ITodoEditor>;
    asLink(): Promise<ILinkEditor>;
    asMarkdown(): Promise<IMarkdownEditor>;
    asSvg(): Promise<ISvgEditor>;
    asHtml(): Promise<IHtmlEditor>;
    asMermaid(): Promise<IMermaidEditor>;
    asGraph(): Promise<IGraphEditor>;
    asDraw(): Promise<IDrawEditor>;
    asBrowser(): Promise<IBrowserEditor>;
    asMcpInspector(): Promise<IMcpInspectorEditor>;
    asImage(): Promise<IImageEditor>;

    // Run this page as a script (same as F5)
    runScript(): Promise<string>;
}
```

### `preventOutput()` — Suppress Default Output

Calling `preventOutput()` in a script prevents `runWithResult` from writing the script's return value to the grouped page. Useful when scripts handle their own output or need no output at all.

```javascript
preventOutput();
await processFiles();
app.ui.notify("Done!", "success");
```

Output is also automatically suppressed when a script writes to `page.grouped.content` directly (tracked via `GroupedPageWrapper`), or when the script accesses the `ui` global (see below).

### `ui` — Log View UI Facade

Provides logging and interactive dialogs via a Log View page. **Lazy-initialized** — the Log View page is created only when the script first accesses `ui`.

```typescript
interface IUiLog {
    // Logging — returns StyledLogBuilder for optional fluent styling
    log(message: StyledText): IStyledLogBuilder;
    info(message: StyledText): IStyledLogBuilder;
    warn(message: StyledText): IStyledLogBuilder;
    error(message: StyledText): IStyledLogBuilder;
    success(message: StyledText): IStyledLogBuilder;
    text(message: StyledText): IStyledLogBuilder;
    clear(): void;

    // Dialogs (async — returns Promise)
    // Two-overload pattern: simple positional form + full object form
    readonly dialog: {
        confirm(message: StyledText, buttons?: string[]): Promise<IDialogResult>;
        confirm(options: { message: StyledText; buttons?: string[] }): Promise<IDialogResult>;
        buttons(buttons: string[], title?: StyledText): Promise<IDialogResult>;
        buttons(options: { buttons: string[]; title?: StyledText }): Promise<IDialogResult>;
        textInput(title?: StyledText, options?: { ... }): Promise<IDialogResult>;
        textInput(options: { title?: StyledText; placeholder?: string; ... }): Promise<IDialogResult>;
        checkboxes(items: (string | CheckboxItem)[], title?, buttons?): Promise<IDialogResult>;
        checkboxes(options: { items: (string | CheckboxItem)[]; title?; layout?; buttons? }): Promise<IDialogResult>;
        radioboxes(items: string[], title?, buttons?): Promise<IDialogResult>;
        radioboxes(options: { items: string[]; title?; checked?; layout?; buttons? }): Promise<IDialogResult>;
        select(items: string[], title?, buttons?): Promise<IDialogResult>;
        select(options: { items: string[]; title?; selected?; placeholder?; buttons? }): Promise<IDialogResult>;
    };

    // Output (display-only rich content)
    readonly show: {
        progress(label?: StyledText): IProgress;
        progress(options: { label?; value?; max? }): IProgress;
        grid(data: any[]): IGrid;
        grid(options: { data: any[]; columns?; title? }): IGrid;
        text(text: string, language?: string): IText;
        text(options: { text; language?; title?; wordWrap?; lineNumbers?; minimap? }): IText;
        markdown(text: string): IMarkdown;
        markdown(options: { text: string; title?: StyledText }): IMarkdown;
        mermaid(text: string): IMermaid;
        mermaid(options: { text: string; title?: StyledText }): IMermaid;
    };
}
```

**Two-overload pattern:** All dialog methods and `ui.show.*` methods support two calling styles: a simple positional form and a full object form. Disambiguation relies on `StyledText` being `string | StyledSegment[]` — a plain non-array object is always the full form. Implementation uses `isOptionsObject()` helper in `UiFacade`.

**Styled text builder:** Logging methods return `IStyledLogBuilder` — a fluent builder that allows chaining `.append()`, `.color()`, `.bold()`, etc. and finalizing with `.print()`:

```typescript
ui.text("Status: ")
    .append("OK").color("lime").bold()
    .append(" — all checks passed")
    .print();
```

The standalone `styledText()` global creates a builder for use in dialog labels and other components:

```typescript
const label = styledText("Warning").color("red").bold().value;
await ui.dialog.confirm(label);
```

**Implementation:** `StyledTextBuilder` and `StyledLogBuilder` classes in `/src/renderer/scripting/api-wrapper/StyledTextBuilder.ts`. `StyledLogBuilder` extends `StyledTextBuilder` with a `print()` method that calls `LogViewModel.updateEntryText()` to update the already-added entry with the built styled text.

**Console forwarding:** When `ui` is first accessed, `console.log/info/warn/error` are automatically forwarded to the Log View:
- `console.log` → `log.log` (light/dimmed text)
- `console.info` → `log.info` (blue)
- `console.warn` → `log.warn` (yellow)
- `console.error` → `log.error` (red)
- Native console is always called (forwarding is additive, not a replacement)
- For MCP scripts, console output is captured in both `consoleLogs` (returned to agent) and Log View (visible to user)
- Suppress forwarding per-level with `ui.preventConsoleLog()`, `ui.preventConsoleWarn()`, `ui.preventConsoleError()`

**Callable `ui()` yield:** The `ui` global is also callable — `await ui()` yields to the event loop (via `setTimeout(0)`), preventing long-running scripts from freezing the UI. This is implemented via a `Proxy` that delegates property access to `UiFacade` but treats function calls as event-loop yields.

```javascript
for (const item of largeArray) {
    // ... heavy processing ...
    await ui(); // let UI breathe
}
```

**Key behaviors:**
- Accessing `ui` auto-creates a Log View page grouped with the source page (or standalone if no page context)
- For MCP scripts (`runWithCapture`), `ui` uses the well-known MCP Log page (`mcp-ui-log`) — same page as `ui_push`. See [pages-architecture.md § Well-Known Pages](pages-architecture.md#8-well-known-pages)
- Accessing `ui` sets `groupedContentWritten = true`, suppressing default script output
- Re-running a script reuses the existing grouped Log View (appends with separator)
- Dialog results are always objects — `button` is `undefined` if canceled (page closed while pending)
- Log View page title uses datetime format: `"2026-03-10 12:24.log.jsonl"`

**Implementation:** `UiFacade` wraps the `LogViewEditor` instance for the well-known MCP Log page (or a script-grouped Log View page). The editor module is loaded on demand via the `editorRegistry`; the `LogViewEditor` instance is reused across `ui` calls within a script's lifetime.

### `app` — Application Object

```typescript
interface IApp {
    readonly version: string;
    readonly settings: ISettings;
    readonly editors: IEditors;
    readonly recent: IRecent;
    readonly fs: IFileSystem;
    readonly window: IWindow;
    readonly shell: IShell;
    readonly ui: IUserInterface;
    readonly downloads: IDownloads;
    readonly menuFolders: IMenuFolders;
    readonly pages: IPageCollection;
    readonly proc: IProc;

    runAsync<TData, TProxy, TResult>(
        fn: (data: TData, proxy: TProxy) => Promise<TResult>,
        data: TData,
        proxy?: TProxy
    ): Promise<TResult>;
}
```

### `app.proc` — Process Execution

Spawn external programs and stream their output. The main process owns the child process registry (including whole-tree kill); `app.proc` is the renderer client.

```typescript
// One-shot: run a script and parse its JSON stdout
const data = await app.proc.execute("python scripts/load.py").getJson();

// Streaming
const h = app.proc.execute("npm run build");
const dec = new TextDecoder();
h.on("stdout", (chunk) => console.log(dec.decode(chunk)));
h.on("exit", ({ code }) => console.log("done", code));

// Pass a regex pattern to extract marked JSON from noisy stdout
const result = await app.proc.execute(cmd).getJson(/@@RESULT@@(.*)/);
```

The same channel backs a board's `persephone.execute()` — both the board bridge shim (over its `MessagePort`) and `app.proc` call into the same `command-runner.ts` in the main process. A board additionally has `persephone.executeNode(script, args?, options?)`: the board bridge rewrites it to spawn Persephone's own binary as Node (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`, argv-style, no shell), giving boards a guaranteed Node runtime — including built-in `node:sqlite` — with no Node install on the machine. It returns the same handle.

Type definitions: `/src/renderer/api/types/proc.d.ts` (`IProc`, `IExecuteHandle`, `IExecuteOptions`).

### `io` — Content Delivery API

Provides access to content pipe providers, transformers, pipe assembly, and link events.

```typescript
interface IIoNamespace {
    readonly FileProvider: new (filePath: string) => IProvider;
    readonly HttpProvider: new (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => IProvider;
    readonly ArchiveTransformer: new (entryPath: string) => ITransformer;
    readonly DecryptTransformer: new (password: string) => ITransformer;
    readonly ArchiveTreeProvider: new (sourceUrl: string) => ITreeProvider;
    createLinkData(href: string, options?: Partial<ILinkData>): ILinkData;
    linkToLinkData(link: ILink): ILinkData;
    createPipe(provider: IProvider, ...transformers: ITransformer[]): IContentPipe;
}
```

**Examples:**
```javascript
// Read a file through a pipe
const pipe = io.createPipe(new io.FileProvider("C:\\data.json"));
const text = await pipe.readText();

// Fetch HTTP content with authentication
const pipe = io.createPipe(new io.HttpProvider(url, { headers: { "Authorization": "Bearer token" } }));

// Browse and open files from an archive (ZIP, RAR, 7z, TAR, etc.)
const archive = new io.ArchiveTreeProvider("C:\\docs.zip");
const items = await archive.list("");
const url = archive.getNavigationUrl(items[0]);
await app.events.openRawLink.sendAsync(io.createLinkData(url));

// Open a URL through the link pipeline
await app.events.openRawLink.sendAsync(io.createLinkData("https://api.com/data.json"));
```

### `ai` — AI Model Integrations

Provides the `ClaudeSession` class for conversational AI scripting via `@anthropic-ai/sdk`.

```typescript
interface IAiNamespace {
    readonly ClaudeSession: new(config: IClaudeSessionConfig) => IClaudeSession;
}
```

`ClaudeSession` wraps the raw Anthropic SDK and manages the message list, tool-call loop, and events automatically. The SDK is **lazy-loaded** on first instantiation via `require("@anthropic-ai/sdk")` — no cost if unused.

**Examples:**
```javascript
// Basic conversation
const session = new ai.ClaudeSession({ apiKey: "sk-ant-..." });
session.systemMessage("You are a helpful assistant.");
session.userMessage("What is 2 + 2?");
const reply = await session.send();

// With tools
session.tools = [{
    name: "get_data",
    description: "Read data from the current page",
    inputSchema: { type: "object", properties: {} },
    tool: () => page.content,
}];
session.on("tool-call", (name, input) => console.log(`Tool called: ${name}`));
session.userMessage("Analyze the current page data");
const reply = await session.send();

// Force a specific tool, multi-turn
session.userMessage("What's the weather in Paris?");
await session.send({ toolChoice: "get_weather" });
session.userMessage("And London?");
await session.send();
```

Key features:
- **`send(options?)`** — runs the full tool-call loop until `end_turn`, returns final text
- **`toolChoice`** — `"auto"` (default) / `"any"` / specific tool name
- **Events** — `"tool-call"`, `"tool-result"`, `"assistant-message"`, `"message"`, `"error"`
- **`maxToolRounds`** (default 20) — safety limit to prevent infinite tool loops
- **`clear()`** — resets message history, keeps system message and tools
- **`dangerouslyAllowBrowser: true`** — set internally (Electron renderer is trusted, not a public browser)

See type definitions: [`src/renderer/api/types/ai.d.ts`](../../src/renderer/api/types/ai.d.ts)
Implementation: [`src/renderer/scripting/api-wrapper/ClaudeSession.ts`](../../src/renderer/scripting/api-wrapper/ClaudeSession.ts)

### `app.events` — Event Channels

Scripts can both subscribe to and send events. `send()` is synchronous, `sendAsync()` is async with LIFO subscriber ordering.

```javascript
// Subscribe (auto-cleaned up when script ends)
app.events.openRawLink.subscribe((event) => { /* handle */ });

// Send events
app.events.openRawLink.sendAsync(io.createLinkData("C:\\file.txt"));
await app.events.openRawLink.sendAsync(io.createLinkData(url));
```

### `React`

The React library is available for advanced use cases.

### Full Node.js Access

With `nodeIntegration: true`, scripts can use:

```javascript
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load npm packages
const sql = require(path.join('D:\\packages\\node_modules', 'mssql'));
const axios = require(path.join('D:\\packages\\node_modules', 'axios'));
```

### Script Library Imports

When a script library folder is linked (via `script-library.path` setting), scripts can import library modules:

```javascript
const { greet } = require("library/utils/helpers");
const config = require("library/config");
```

- `require("library/...")` resolves to `{script-library.path}/...`
- Supports `.ts` and `.js` files — TypeScript files are transpiled via sucrase; `.js` files with ES module syntax (`export`/`import`) are also transpiled (imports transform only)
- Extension auto-resolution: tries exact path, `.ts`, `.js`, `/index.ts`, `/index.js`
- Relative requires within library modules work naturally (e.g., `require('./db-config')` inside a library file)
- **Context injection — two mechanisms:**
  - **Top-level scripts:** `fn.call(context)` where context is the `ScriptContext` instance. `SCRIPT_PREFIX` reads from `this`: `var app=this.app, page=this.page, io=this.io, ai=this.ai, require=this.customRequire, ...`
  - **Library modules:** Extension handler reads `globalThis.__activeScriptContext__` (set by `ScriptContext.customRequire()` before native require) and injects `MODULE_CONTEXT_PREFIX`: `var __ctx=globalThis.__activeScriptContext__, app=__ctx?.app, io=__ctx?.io, ai=__ctx?.ai, ...`
- **Context-bound require chain:** Each `ScriptContext` creates a `customRequire` function bound to itself. It's injected as the `require` local var in every script and module. When a module calls `require("library/X")`, it calls the context's `customRequire`, which sets `__activeScriptContext__`, calls native require, and the extension handler injects the same context's properties. Sub-modules get the same `customRequire` injected, so the chain propagates through the entire dependency tree.
- **Always-fresh cache:** `customRequire()` deletes the specific module from `require.cache` before loading. This ensures fresh compilation with the current context's bindings. Library modules cannot share state across script executions (use `page.data` or `app.settings` for shared state).
- **Cache clearing on file changes:** Bulk `clearLibraryRequireCache()` only runs when `libraryDirty` is set by the file watcher — not on every execution.
- `ui` is excluded from both prefixes — it's a lazy getter on `globalThis` (stack-based per context) to avoid eagerly creating the Log View.
- When the library is not linked, `customRequire("library/...")` throws a descriptive error.

Implementation: `library-require.ts` provides `registerLibraryExtensions()` (`.ts` and `.js` handlers via `require.extensions`), `resolveLibraryModule()` (path resolution), and `clearLibraryRequireCache()`. The `customRequire` function is created per-context in `ScriptContext.createCustomRequire()`.

### Library IntelliSense

Monaco provides IntelliSense (autocomplete, type checking) for library modules. When a script library folder is linked, all library `.ts`/`.js` files are registered with Monaco via `addExtraLib()`, and compiler options include `paths: { "library/*": ["file:///library/*"] }` so that `import`/`require` of `library/...` paths resolve to the registered virtual files.

- Lazy-loaded: `loadLibraryIntelliSense()` is called from `initMonaco()` (in `configure-monaco.ts`)
- Live updates: subscribes to `libraryService.state` changes, disposes old extra-lib registrations and re-registers on library changes
- Path completion: a `CompletionItemProvider` triggers inside `require("library/...")` strings, suggesting folders and files from the library. Folders show with folder icon and re-trigger suggestions; files show without extension (matching runtime auto-resolution). Registered once per language (JS/TS), reads `allFiles` dynamically.
- Implementation: `/src/renderer/api/setup/library-intellisense.ts`

### Script Panel Library Integration

The script panel toolbar includes a **script selector dropdown** (Select) and a **save button** for loading/saving scripts from the `script-panel/` folder in the library.

**Script selector dropdown:**
- Lists scripts from `script-panel/{pageLanguage}/` and `script-panel/all/` (prefixed with `all/` to distinguish)
- First entry is always "(unsaved script)" representing the ad-hoc script
- Selecting a script reads the file and loads its content into the editor
- Subscribes to `libraryService.state` for live refresh when library files change

**Save button (SaveIcon):**
- Disabled when content is unmodified (for selected library scripts); always enabled for ad-hoc scripts (acts as "save as")
- Ad-hoc script: shows `InputDialog` with filename input + radio buttons for folder choice (`{language}` or `all`)
- Selected library script: directly overwrites the file (no prompt)
- Ctrl+S shortcut triggers save when script panel editor is focused
- Creates `script-panel/{folder}/` directory if it doesn't exist; shows overwrite confirmation if file exists

**State:** `ScriptPanelState` includes `selectedScript: string | null` (file path) and `dirty: boolean` (modification indicator). Both are persisted to cache and restored on app restart.

- Implementation: `/src/renderer/editors/text/ScriptPanel.tsx` (ScriptPanelModel)

### Library Setup Wizard

When no library is linked, actions that need the library (sidebar "Select Folder", settings "Browse...", script panel save) open the **Library Setup Dialog** instead of a raw folder picker.

**Dialog:** `showLibrarySetupDialog()` — async `TDialogModel` pattern, returns `Promise<string | undefined>` (linked path or cancelled).
- Folder input field + "Browse..." button (Electron folder dialog)
- "Copy example scripts" checkbox (default: checked) — copies bundled examples from `assets/script-library/` to the target folder, skipping files that already exist
- Creates target folder if it doesn't exist
- Saves path to `script-library.path` setting on success

**Bundled example scripts** (`assets/script-library/`):
- `script-panel/all/` — example, base64-encode, base64-decode
- `script-panel/plaintext/` — sort-lines, parse-jwt-token
- `script-panel/json/` — format-json
- `utils/helpers.ts` — shared module demonstrating `require("library/...")`

**Copy logic:** `copyExampleScripts(targetPath)` in `library-service.ts` — resolves asset path via `api.getAppRootPath()`, recursively copies files, never overwrites existing.

- Implementation: `/src/renderer/ui/dialogs/LibrarySetupDialog.tsx`

## Editor Facades

Facades provide safe, typed access to editor-specific features. Each facade wraps an `EditorModel` subclass (the page's `mainEditor`) and is returned by `page.asX()` methods.

| Method | Facade | Wraps | Key Operations |
|--------|--------|-------|----------------|
| `page.asText()` | `TextEditorFacade` | `MonacoEditor` | `getSelectedText()`, `insertText()`, `replaceSelection()`, `revealLine()`, cursor position |
| `page.asGrid()` | `GridEditorFacade` | `GridEditor` | `rows`, `columns`, `editCell()`, `addRows()`, `deleteRows()`, `addColumns()`, `deleteColumns()` |
| `page.asNotebook()` | `NotebookEditorFacade` | `NotebookEditor` | `notes`, `categories`, `tags`, `addNote()`, `deleteNote()`, `updateNoteTitle()` |
| `page.asTodo()` | `TodoEditorFacade` | `TodoEditor` | `items`, `lists`, `tags`, `addItem()`, `toggleItem()`, `deleteItem()`, `addList()`, `selectList()`, `selectTag()`, `setSearch()`, `clearSearch()` |
| `page.asLink()` | `LinkEditorFacade` | `LinkEditor` | `links`, `categories`, `tags`, `addLink()`, `deleteLink()`, `updateLink()` |
| `page.asMarkdown()` | `MarkdownEditorFacade` | `MarkdownEditor` | `viewMounted`, `html` (read-only) |
| `page.asSvg()` | `SvgEditorFacade` | `SvgEditor` | `svg` (read-only), `savePngToFile()` |
| `page.asHtml()` | `HtmlEditorFacade` | `HtmlEditor` | `html` (read-only) |
| `page.asMermaid()` | `MermaidEditorFacade` | `MermaidEditor` | `svgUrl`, `loading`, `error` (read-only), `savePngToFile()` |
| `page.asGraph()` | `GraphEditorFacade` | `GraphEditor` | `nodes`, `links`, `search()`, `bfs()`, `getComponents()`, `select()`, selection, groups, neighbors |
| `page.asDraw()` | `DrawEditorFacade` | `DrawEditor` | `addImage()`, `exportAsSvg()`, `exportAsPng()`, `elementCount`, `editorIsMounted` |
| `page.asBrowser()` | `BrowserEditorFacade` | `BrowserEditorModel` | `url`, `title`, `navigate()`, `back()`, `forward()`, `reload()`, `evaluate()`, `snapshot()`, `getText()`, `getValue()`, `click()`, `type()`, `select()`, `pressKey()`, `waitForSelector()`, `waitForNavigation()`, `tabs`, `addTab()`, `closeTab()`, `switchTab()`, `cdp()` |
| `page.asMcpInspector()` | `McpInspectorFacade` | `McpInspectorEditorModel` | `connect()`, `disconnect()`, connection params, server info (title, description, websiteUrl, instructions), `history`, `clearHistory()`, `showHistory()` |
| `page.asImage()` | `ImageEditorFacade` | `ImageEditor` | `savePngToFile()` |

Facade source: `/src/renderer/scripting/api-wrapper/`

The Mermaid, SVG, and Image editors expose `savePngToFile(filePath)` — they rasterise their
rendered output to PNG and write it to disk. This is the same capability used by each editor's
toolbar "Save" action, surfaced to scripts and to MCP agents (which call it via `execute_script`,
then read the written file). The rendering is host-independent and runs at the model level, so it
works even when the page is not the active tab; the Mermaid editor renders on demand if its preview
has not been generated yet. The underlying capability is the `IImageExport` interface (see
[editors.md](editors.md)).
Interface definitions: `/src/renderer/api/types/*.d.ts`

## Auto-Cleanup Lifecycle

Editor facades are stateless wrappers — there is nothing to release when a script ends. Event subscriptions made through `app.events`, however, ARE tracked and unsubscribed automatically. A shared `releaseList` ensures cleanup:

```
1. Script starts → new ScriptContext() creates releaseList = []
2. Script calls page.asGrid()
   → returns a stateless GridEditorFacade wrapping page.mainEditor (GridEditor)
   → no entry added to releaseList
3. Script calls app.events.fileExplorer.itemContextMenu.subscribe(handler)
   → events proxy intercepts subscribe(), calls real subscribe()
   → releaseList.push(() => sub.unsubscribe())
   → return SubscriptionObject
4. Script completes (or throws)
5. context.dispose() iterates releaseList
   → sub.unsubscribe()  (removes event handler)
```

The `releaseList` is shared across all wrappers: `AppWrapper → PageCollectionWrapper → PageWrapper → Facades`. Event subscriptions made through `app.events` from any path are automatically unsubscribed when the script completes.

### Events Proxy

`AppWrapper.events` returns a recursive proxy that wraps `app.events`. When a script calls `subscribe()` on any EventChannel, the proxy intercepts the call, subscribes on the real channel, and pushes the `unsubscribe()` handle to the `releaseList`. This means scripts never need to manually unsubscribe — cleanup happens automatically when `ScriptContext.dispose()` is called. The proxy also exposes `send()` and `sendAsync()` methods, allowing scripts to trigger events through the pipeline (e.g., `app.events.openRawLink.sendAsync(event)`).

## Wrapper Architecture

Three wrapper classes provide safe script access to the application:

### PageWrapper

Wraps `EditorModel`, implements `IPage`. Created per-page:

```typescript
class PageWrapper {
    constructor(model: EditorModel, releaseList: Array<() => void>, outputFlags?: ScriptOutputFlags);

    // IPage properties delegate to model
    get content(): string { return model.state.get().content; }
    set content(v: string) { model.changeContent(v); }

    // Grouped page auto-creation (returns GroupedPageWrapper)
    get grouped(): PageWrapper {
        let grouped = pagesModel.getGroupedPage(this.model.id);
        if (!grouped) grouped = pagesModel.requireGroupedText(this.model.id);
        return new GroupedPageWrapper(grouped, this.releaseList, this.outputFlags);
    }

    // Facade acquisition with auto-release
    async asGrid(): Promise<GridEditorFacade> { ... }

    // Run this page's content as a script (same as F5)
    async runScript(): Promise<string> { ... }
}

// Subclass that tracks writes to grouped page content
class GroupedPageWrapper extends PageWrapper {
    set content(value: string) {
        super.content = value;
        this.flags.groupedContentWritten = true;  // suppresses default output
    }
}
```

### AppWrapper

Wraps the `app` singleton, implements `IApp`. Delegates most properties directly. Wraps `pages` in `PageCollectionWrapper`. `fetch` delegates directly to `app.fetch` (Node.js HTTP client with full header control — see `src/renderer/api/node-fetch.ts`).

### PageCollectionWrapper

Wraps `PagesModel`, implements `IPageCollection`. Returns `PageWrapper` instances instead of raw `EditorModel` for all query methods.

## Script Execution

### ScriptRunnerBase (core engine)

Located in `/src/renderer/scripting/ScriptRunnerBase.ts`.

Stateless singleton execution engine. Takes a `ScriptContext` parameter — does not create or own context. Handles:
- **`execute(script, context, language?)`** — prepares (transpile + library) then executes with `fn.call(context)`
- **`prepare()`** — transpiles TypeScript, loads sucrase, registers Script Library extensions
- **`executeInternal(script, context)`** — expression/statement detection, `SCRIPT_PREFIX` reads from `this` (context), implicit return, async await
- **`invalidateLibraryCache()`** — marks library require cache as dirty

### ScriptRunner (orchestrator)

Located in `/src/renderer/scripting/ScriptRunner.ts`. Extends `ScriptRunnerBase`.

### `run(script, page?, language?)`

1. Creates `ScriptContext` (owns `app`, `page`, `customRequire`, stack-based `ui` getter)
2. Calls `execute(script, context, language)` (base handles transpilation + execution via `fn.call(context)`)
3. Calls `context.dispose()` in `finally` block (restores previous `ui` getter, releases resources)

### `runWithResult(pageId, script, page?, language?)`

Calls `executeScript()`, then converts result to text and writes to grouped page — unless output is suppressed. Output suppression is triggered by:
- `preventOutput()` called in the script
- Script writing to `page.grouped.content` directly

When output is suppressed and the script throws an error, the error is shown in a `TextDialog` instead of the grouped page.

### `runWithCapture(script, page?, language?)`

Headless execution for MCP/programmatic use. Returns a `McpScriptResult` without writing to any grouped page:

```typescript
interface McpScriptResult {
    text: string;
    language: string;
    isError: boolean;
    consoleLogs: ConsoleLogEntry[];
}
```

Captures `console.log/error/warn/info` calls during script execution via `ScriptContext`'s console capture support. If the script accesses `ui`, console output is forwarded to both `consoleLogs` (returned to agent) and the shared MCP Log View (visible to user).

### `convertToText(value)` (utility)

Located in `/src/renderer/scripting/script-utils.ts`. Converts any JS value to displayable `{ text, language }`:

| Return Type | Output | Language |
|-------------|--------|----------|
| `string` | As-is | `"plaintext"` |
| `object`, `array` | `JSON.stringify` formatted | `"json"` |
| `Error` | Message + stack trace | `"plaintext"` |
| `undefined` | `"undefined"` | `"plaintext"` |
| `Date`, `RegExp`, `Map`, `Set` | Appropriate string representation | varies |

## Script Context (ScriptContext)

Located in `/src/renderer/scripting/ScriptContext.ts`.

`ScriptContext` is the context owner — each instance holds `app`, `page`, `customRequire`, `console`, and other context properties. It serves as the `this` object for script execution via `fn.call(context)`. Multiple instances can coexist (e.g., long-lived autoload context + short-lived F5 context).

```typescript
const ctx = new ScriptContext(page?, consoleLogs?, libraryPath?);
// ... execute script via fn.call(ctx) ...
ctx.dispose();  // restores previous ui getter, releases ViewModels, unsubscribes events
```

The constructor:

1. Creates `releaseList` (shared cleanup array)
2. Creates `AppWrapper` (always), `PageWrapper` (if page provided), `io` namespace (`createIoNamespace()`), and `ai` namespace (`createAiNamespace()`) — stored as instance properties
3. If `consoleLogs` array is provided (MCP mode), sets `this.console` to a capturing console that records `log`, `error`, `warn`, `info` calls. Otherwise uses native `console`. Capture is replaced with full forwarding when `ui` is accessed (see step 6).
   ```typescript
   interface ConsoleLogEntry {
       level: "log" | "error" | "warn" | "info";
       args: any[];
       timestamp: number;
   }
   ```
4. Creates `customRequire` — a context-bound require function. Resolves `library/` paths to the library folder. Sets `globalThis.__activeScriptContext__` before calling native `require()` so extension handlers inject the correct context prefix. Always clears the specific module from `require.cache` before loading (always-fresh). If library not linked, throws a descriptive error.
5. Adds `styledText` and `React` as instance properties
6. **Stack-based `ui` getter** on `globalThis` — saves the previous `ui` property descriptor (if any, e.g., autoload's getter), then defines a new lazy getter via `Object.defineProperty`. Creates `UiFacade` on first access, then installs console forwarding. Must be on `globalThis` (not in prefix) to preserve laziness — `var ui=this.ui` would eagerly trigger the getter.
7. `dispose()` restores the previous `ui` getter (or deletes if none), then releases all ViewModels and unsubscribes all event subscriptions made through `app.events`

**Context coexistence:** The stack-based `ui` getter ensures autoload's getter survives F5 script runs: F5 saves autoload's getter → defines its own → on dispose restores autoload's getter. Context properties (`app`, `page`, `customRequire`) are per-instance and don't use global state — no conflicts between contexts.

## Grouped Pages & Output Suppression

When a script accesses `page.grouped`:
1. If no grouped page exists, one is automatically created
2. The new page is grouped (side-by-side) with the source page
3. Script return value is written to the grouped page (default behavior)

```javascript
// This automatically creates and groups a new page
page.grouped.content = 'Output here';
page.grouped.language = 'json';
page.grouped.editor = 'grid-json';
```

### Output Suppression

By default, `runWithResult` writes the script's return value to the grouped page. This can be suppressed in three ways:

1. **`preventOutput()`** — explicitly called in the script. Use when the script handles its own output (e.g., creates custom pages, shows notifications) or needs no output at all.

2. **`page.grouped.content` write detection** — if the script writes to `page.grouped.content`, the default output is suppressed automatically. This prevents the return value from overwriting script-managed output.

3. **`ui` access** — accessing the `ui` global creates a Log View page grouped with the source page, which sets `groupedContentWritten = true`. The `ui` facade handles its own output.

All three mechanisms set flags on `ScriptOutputFlags` (tracked in `ScriptContext`). The `GroupedPageWrapper` subclass intercepts `content` setter to set the `groupedContentWritten` flag.

When output is suppressed and the script throws an error, the error is displayed via `TextDialog` (a Monaco-based dialog) instead of the grouped page.

## Script Triggers

| Trigger | Location | Language | What Runs |
|---------|----------|----------|-----------|
| F5 (script panel open) | `TextFileActionsModel` | Always `"typescript"` | Script panel content |
| F5 (script panel closed, JS/TS file) | `TextFileActionsModel` | From page state | Page content (or selection) |
| F5 (notebook JS/TS note) | `NoteItemEditModel` | From note language | Note content as script |
| Run button (script panel) | `ScriptPanel.tsx` | Always `"typescript"` | Script panel content |
| MCP `execute_script` | `mcp-handler.ts` | Caller-specified (optional) | Script from MCP tool call |
| Autoload (window open) | `AutoloadRunner.ts` | Determined by file extension | Registration scripts from `library/autoload/` |

## Autoload Scripts

Registration scripts in the Script Library's `autoload/` subfolder are loaded automatically when the window opens. They subscribe to application events via `app.events` and persist for the window session.

### Convention

```typescript
// autoload/01-custom-menu.ts
export function register() {
    app.events.fileExplorer.itemContextMenu.subscribe((event) => {
        event.items.push({ label: "Custom Action", onClick: () => { ... } });
    });
}
```

Scripts must export a named `register` function. Files without it are skipped (utility modules). Loading order is alphabetical by filename (prefix with `01-`, `02-` to control order).

### Architecture

```
AutoloadRunner (scripting/)
    │
    ├── autoloadService (api/autoload-service.ts)  ← thin wrapper for lifecycle
    │
    ├── loadScripts()
    │     ├── new ScriptContext(no page, no consoleLogs, libraryPath)
    │     ├── ensureSucraseLoaded() + registerLibraryExtensions()
    │     └── for each .ts/.js in autoload/ (sorted):
    │           ├── context.customRequire(filePath)  ← always-fresh, injects context
    │           └── mod.register()     ← await if async
    │
    ├── markNeedsReload()  ← called by LibraryService on file changes
    │     └── Sets state.needsReload = true (reactive via TOneState)
    │
    └── dispose()  ← ScriptContext.dispose() restores ui getter, unsubscribes all
```

**Bootstrap:** Deferred in `app.initEvents()` via `setTimeout(1500)` to not block window rendering.

**Reload:** When `LibraryService` detects file changes, it calls `markNeedsReload()`. A yellow refresh button appears in the header (next to zoom indicator). User clicks to reload all scripts (disposes old context, loads fresh).

**Error handling:** All-or-nothing. If any `register()` throws, all subscriptions from all scripts are unsubscribed, error notification shown.

**State:** `AutoloadRunner.state` is a `TOneState<{ isLoaded, needsReload }>`. The `AutoloadReloadButton` in `MainPage.tsx` subscribes to this state.

## Type Definitions

Script API types are defined in `/src/renderer/api/types/`:

| File | Defines |
|------|---------|
| `index.d.ts` | Global declarations: `app: IApp`, `page: IPage`, `ui: IUiLog`, `styledText()`, `preventOutput()`, `require()` |
| `app.d.ts` | `IApp` — root application interface |
| `page.d.ts` | `IPage`, `IPageInfo` — page/tab interface |
| `pages.d.ts` | `IPageCollection` — pages management |
| `common.d.ts` | `IDisposable`, `IEvent`, `Language`, `EditorView` |
| `boards.d.ts` | `IBoards` — `app.boards` board lifecycle + published-catalog operations |
| `board-vars.d.ts` | `IBoardVars` — `app.boardVars` admin access to the board secrets store (get/set/list per namespace, unrestricted — unlike a board's own sandboxed `persephone.var.*`) |
| `text-editor.d.ts` | `ITextEditor` — Monaco editor operations |
| `grid-editor.d.ts` | `IGridEditor` — grid editor operations |
| `notebook-editor.d.ts` | `INotebookEditor` — notebook operations |
| `todo-editor.d.ts` | `ITodoEditor` — todo list operations |
| `link-editor.d.ts` | `ILinkEditor` — link manager operations |
| `markdown-editor.d.ts` | `IMarkdownEditor` |
| `svg-editor.d.ts` | `ISvgEditor` |
| `html-editor.d.ts` | `IHtmlEditor` |
| `mermaid-editor.d.ts` | `IMermaidEditor` |
| `graph-editor.d.ts` | `IGraphEditor`, `IGraphNode`, `IGraphComponent`, `IGraphSearchResult` |
| `browser-editor.d.ts` | `IBrowserEditor` — browser page operations |
| `ui.d.ts` | `IUserInterface`, `ITextDialogOptions`, `ITextDialogResult` — dialogs and notifications |
| `ui-log.d.ts` | `IUiLog`, `IUiDialog`, `IUiShow`, `IProgress`, `IGrid`, `IGridColumn`, `IDialogResult`, `IStyledTextBuilder`, `IStyledLogBuilder` — Log View UI facade |

These files serve dual purpose: TypeScript type checking **and** IDE IntelliSense for script authors.

## File Structure

```
/src/renderer/scripting/
├── ScriptRunnerBase.ts          # Core execution engine (transpile, execute)
├── ScriptRunner.ts              # Orchestrator (context lifecycle, result handling)
├── ScriptContext.ts             # Execution scope (context proxy, cleanup)
├── AutoloadRunner.ts            # Autoload registration scripts from library/autoload/
├── script-utils.ts              # Utilities (convertToText)
├── transpile.ts                 # TypeScript transpilation (sucrase, lazy-loaded)
├── library-require.ts           # Library require() resolution + .ts/.js extension handlers
├── worker/                      # Background worker execution (app.runAsync)
│   └── WorkerRunner.ts          # Renderer-side: IPC to main, proxy dispatch
└── api-wrapper/                 # Facade layer
    ├── AppWrapper.ts            # Wraps app singleton
    ├── PageWrapper.ts           # Wraps EditorModel → IPage
    ├── PageCollectionWrapper.ts # Wraps PagesModel → IPageCollection
    ├── TextEditorFacade.ts      # Monaco operations
    ├── GridEditorFacade.ts      # Grid data operations
    ├── NotebookEditorFacade.ts  # Notebook operations
    ├── TodoEditorFacade.ts      # Todo list operations
    ├── LinkEditorFacade.ts      # Link manager operations
    ├── MarkdownEditorFacade.ts  # Markdown preview (read-only)
    ├── SvgEditorFacade.ts       # SVG preview (read-only)
    ├── HtmlEditorFacade.ts      # HTML preview (read-only)
    ├── MermaidEditorFacade.ts   # Mermaid diagram (read-only + savePngToFile)
    ├── GraphEditorFacade.ts     # Graph query/analysis (read-only, designed for MCP)
    ├── ImageEditorFacade.ts     # Image viewer (savePngToFile)
    ├── BrowserEditorFacade.ts   # Browser page operations
    ├── McpInspectorFacade.ts    # MCP Inspector connection & troubleshooting
    ├── UiFacade.ts              # Log View UI (logging + dialogs + output)
    ├── Progress.ts              # Progress helper class (returned by ui.show.progress)
    ├── Grid.ts                  # Grid helper class (returned by ui.show.grid)
    ├── Text.ts                  # Text helper class (returned by ui.show.text)
    ├── Markdown.ts              # Markdown helper class (returned by ui.show.markdown)
    ├── Mermaid.ts               # Mermaid helper class (returned by ui.show.mermaid)
    └── StyledTextBuilder.ts     # Fluent styled text builder + styledText() factory

/src/renderer/api/types/
├── index.d.ts                   # Global: app, page, ui
├── app.d.ts                     # IApp
├── page.d.ts                    # IPage, IPageInfo
├── pages.d.ts                   # IPageCollection
├── ui.d.ts                      # IUserInterface, ITextDialogOptions, ITextDialogResult
├── ui-log.d.ts                  # IUiLog, IUiDialog, IDialogResult
├── common.d.ts                  # IDisposable, IEvent, EditorView, Language
├── text-editor.d.ts             # ITextEditor
├── grid-editor.d.ts             # IGridEditor
├── notebook-editor.d.ts         # INotebookEditor
├── todo-editor.d.ts             # ITodoEditor
├── link-editor.d.ts             # ILinkEditor
├── markdown-editor.d.ts         # IMarkdownEditor
├── svg-editor.d.ts              # ISvgEditor
├── html-editor.d.ts             # IHtmlEditor
├── mermaid-editor.d.ts          # IMermaidEditor
├── graph-editor.d.ts            # IGraphEditor, IGraphNode, IGraphComponent, IGraphSearchResult
└── browser-editor.d.ts          # IBrowserEditor
```

## Execution Model

Scripts execute inside an `async function` with `fn.call(context)` where `context` is the `ScriptContext` instance. `SCRIPT_PREFIX` injects context properties as local `var` declarations reading from `this` (the context). There is no `with(this)` proxy chain — scripts access `globalThis` directly for standard APIs (like `Buffer`, `URL`, `setTimeout`).

Two injection mechanisms exist:
- **Top-level scripts:** `SCRIPT_PREFIX` reads from `this` — `var app=this.app, page=this.page, io=this.io, require=this.customRequire, ...`
- **Library modules (require'd):** `MODULE_CONTEXT_PREFIX` reads from `globalThis.__activeScriptContext__` — set by `customRequire()` during the synchronous `require()` call

Both produce the same result: `app`, `page`, `React`, `styledText`, `preventOutput`, `require`, and `console` are available as local variables in scripts and modules.

- **`require()`** — context-bound `customRequire` on `ScriptContext`. Supports `library/` path resolution. Always clears specific module from cache before loading (always-fresh). Falls back to Node.js native `require` for non-library paths.
- **`ui`** — lazy getter on `globalThis` (not a local variable, not in prefix). Stack-based: each `ScriptContext` saves the previous getter and restores it on dispose. Eagerly accessing `ui` creates a Log View page.
- **Context coexistence** — multiple `ScriptContext` instances can coexist. Long-lived autoload context persists while short-lived F5 contexts come and go. Per-instance properties prevent interference. Stack-based `ui` getter ensures autoload's `ui` survives F5 dispose.
- **Always-fresh modules** — library modules are reloaded on every `require()` call (cache cleared per-module). Modules cannot share state across script executions. Use `page.data` or `app.settings` for persistent state.
- **Global pollution** — scripts run in sloppy mode. Unqualified assignments (`x = 5` without `var`/`let`/`const`) leak to `globalThis`. Use `let`/`const` to avoid this.

## Background Worker Execution (`app.runAsync`)

Scripts run on the renderer main thread, which means CPU-intensive operations (file scanning, TypeScript program creation, large data processing) freeze the UI. `await ui()` helps with short pauses but can't prevent freezes during CPU-bound loops.

`app.runAsync(fn, data, proxy?)` offloads a function to a background worker thread via the main process:

```
Renderer                    Main Process               Worker Thread
────────                    ────────────               ─────────────
app.runAsync(fn, data, proxy)
  │
  ├─ IPC: WorkerChannel.start ──▶ spawn worker_thread
  │                                  │
  │                                  ├──▶ fn(data, proxy)
  │                                  │      require('fs') ✓
  │                                  │      require('path') ✓
  │                                  │
  │  ◀── WorkerChannel.proxyCall ────┤     await proxy.onProgress(...)
  │  execute callback on renderer    │
  │  ─── WorkerChannel.proxyResult ──┤──▶  continues
  │                                  │
  │  ◀── WorkerChannel.result ───────┘     return result
  │
  resolve promise
```

### Two-parameter design

- **`data`** — Plain serializable data cloned into the worker. Fast local access, no round-trips. Must be structured-clone-compatible (no functions, DOM elements, class instances).
- **`proxy`** — Any object transparently proxied back to the renderer. Every property read, write, or method call round-trips via IPC. Use for callbacks, progress handles, app API references.

### Architecture

The renderer cannot use Node.js `worker_threads` directly (Electron V8 limitation). Instead:

1. **WorkerRunner** (`/src/renderer/scripting/worker/WorkerRunner.ts`) — Renderer side. Sends IPC to main, handles proxy call/set messages, wraps `proxyObj` in `Proxy.revocable()` for safe cleanup.
2. **worker-host** (`/src/main/worker-host.ts`) — Main process. Receives IPC, spawns `worker_threads.Worker` with inline code (eval mode), forwards proxy messages between worker and renderer.
3. **Inline worker code** — Embedded as a string in `worker-host.ts`. Includes Sucrase helpers (`_optionalChain`, `_nullishCoalesce`, etc.) so transpiled functions work correctly, a recursive `Proxy` factory for the proxy parameter, and a message handler.
4. **IPC channels** — Defined in `/src/ipc/worker-channels.ts`. Protocol: `start`, `result`, `error`, `proxyCall`, `proxySet`, `proxyResult`.

### Proxy mechanism

The worker-side proxy is a recursive `Proxy` over a function target:
- **`get`** — returns a new proxy with extended path (supports nested access like `proxy.progress.setLabel`)
- **`set`** — sends fire-and-forget `proxy-set` message (no await needed)
- **`apply`** — sends `proxy-call` message, returns a Promise that resolves when the renderer responds

On the renderer side, `WorkerRunner` resolves the path on the real `proxyObj`, executes the method or reads the property, and sends the result back.

### Lifecycle

- Each `runAsync` call spawns a fresh worker thread and terminates it after completion
- The proxy object is wrapped in `Proxy.revocable()` — after completion, any access throws `TypeError`
- Worker errors propagate to the renderer as rejected promises

### AppWrapper integration

`AppWrapper.runAsync` uses dynamic `import()` to load `WorkerRunner` on first use (same pattern as `app.fetch`). The worker module is only loaded when a script actually calls `app.runAsync`.

## Security Considerations

Scripts have full Node.js access. This is by design for power users, but means:
- Scripts can access filesystem
- Scripts can make network requests
- Scripts can execute any Node.js code

This is appropriate for a developer tool where the user writes/controls the scripts.
