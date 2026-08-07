# Persephone Project Guidelines

## English Correction (MANDATORY)

The user is learning English. For EVERY user message, BEFORE responding to the task:
1. Check spelling, grammar, tenses (have/had, do/did), and sentence structure ("I can ask?" → "Can I ask?")
2. Print the corrected sentence with **bold** on every corrected word/part
3. Do NOT explain corrections — just show the fixed sentence
4. Do NOT beautify or rephrase — only fix actual errors
5. If the message has no mistakes — print a 👍 emoji
6. Then proceed with the task as usual

## Quick Start for Claude

1. **Read this file completely** - essential context for all tasks
2. **For new features:** Read [/doc/architecture/overview.md](doc/architecture/overview.md)
3. **Check active work:** Review [/doc/active-work.md](doc/active-work.md)
4. **Follow standards:** Use [/doc/standards/coding-style.md](doc/standards/coding-style.md) when writing code

## Task Workflow (IMPORTANT)

### Finding work

When user says "let's work on tasks" or similar:

1. **Check the dashboard:** Read [/doc/active-work.md](doc/active-work.md) for "Active" or "Planned" work
2. **If nothing found:** Ask the user what to work on
4. **Ask before starting**: Say "The next task is '[Task Title]'. Do you want to proceed with this task, or would you like to reprioritize and pick a different one?"
5. Wait for user confirmation

### Auto-task creation

If the user gives work without a defined task (e.g., "fix this bug", "add this feature"):
- **Small work** (single fix, quick change): Proceed without creating a task document. Add an entry to the **Active** section of [/doc/active-work.md](doc/active-work.md) with a generated US-XXX ID.
- **Large work** (multiple files, many changes): Create a task folder with README.md to track context. Add a linked entry to the **Active** section: `- [ ] [US-XXX: Title](tasks/US-XXX-short-name/README.md)`. This helps when running `/review`, `/document`, and `/userdoc` at the end.
- **Epic linking**: If an active epic exists and the work relates to it, add the task under that epic in the dashboard.
- **Before committing**: If no task entry exists yet, add one to the dashboard so the work is tracked.

### Dashboard rules (STRICT)

The dashboard [/doc/active-work.md](doc/active-work.md) MUST be kept up to date at every stage:
- **When a task document is created:** Add the task to the dashboard with a link to the document. Format: `- [ ] [US-XXX: Title](tasks/US-XXX-short-name/README.md)`. Place it in **Active** if work is starting now, or in **Planned** if it's queued for later — both sections may contain tasks with documents.
- **When work begins on a Planned task:** Move it from Planned to Active.
- **When a task is completed:** Mark `[x]` and follow the completion rules (standalone → completed.md, epic task → stays until epic completes).

### Creating a new task ("Let's create a task for ...")

When the user says **"let's create a task for [description]"** (or similar), follow this workflow. The goal is to produce a thorough task document **before** any implementation begins, because:
- The codebase is large — the agent cannot hold all relevant code in context during implementation
- A detailed plan with resolved concerns lets the agent implement correctly even after context compaction

**Steps:**

1. **Create task folder and README.md** — `doc/tasks/US-XXX-short-name/README.md`
2. **Deep investigation** — Read all relevant source files, types, existing patterns, and similar implementations in the codebase. Be thorough: check renderers, models, script API wrappers, MCP handlers, type definitions, and tests.
3. **Write the task document** with these sections:
   - **Goal** — What this task achieves (1-2 sentences)
   - **Background** — Relevant existing code, patterns to follow, similar implementations to reference
   - **Implementation plan** — Step-by-step checklist of what to create/modify, with file paths and key details. Each step should have enough detail that the agent can implement it without re-reading the entire codebase.
   - **Concerns / Open questions** — Anything ambiguous, risky, or needing user input. Flag design decisions that could go either way.
   - **Acceptance criteria** — How to verify the task is complete
4. **Add to dashboard** — Add (or move) the task entry to [/doc/active-work.md](doc/active-work.md) under the relevant epic (or "no epic"). Place it in **Active** if work is starting immediately, or **Planned** if it's queued for later. The entry MUST be a link to the task document: `- [ ] [US-XXX: Title](tasks/US-XXX-short-name/README.md)`. If the task already exists elsewhere in the dashboard, remove the old entry.
5. **Link to epic** if applicable (update epic's task table in its doc)
6. **Present the document to the user** — Summarize key points and highlight concerns
7. **Wait for user review** — Do NOT start implementation. The user will review, ask questions, request changes, and eventually say "let's implement"

**Important:** Do not rush this phase. Spend time reading code thoroughly. Missing a pattern or dependency during investigation leads to rework during implementation.

### During implementation:
- Update task progress checklist
- Ask for clarification when uncertain
- Do NOT commit automatically - wait for user to request commits

### Completing a task (user-initiated):

**Do NOT run completion steps automatically after implementation.** After implementation, the user will test the changes manually. During testing, bugs or adjustments may appear that require additional code changes. Only when the user explicitly says **"let's complete the task"** (or similar) should you proceed with the completion steps below.

**Rust implementations (`mneme/`, `launcher/`, `snip-tool/`) — `/review` & `/userdoc` do not apply.** There are no Rust review rules, so **skip `/review`**; these are standalone binaries (built in CI, shipped beside `persephone.exe`), not user-facing UI, so **skip `/userdoc`**. Verify the build (`cargo build --release`) and tests (`cargo test`) instead. Run **`/document` only** if a developer doc needs a pointer to new top-level structure (e.g. `folder-structure.md`, the Key Files table) — the Rust crate's own `README.md` is its primary documentation.

#### Standalone tasks (no epic)

1. Verify all acceptance criteria are met
2. **Run `/review`** — validates code against architecture docs, reports concerns
3. **Run `/document`** — updates developer docs in `/doc/` (architecture, standards, CLAUDE.md)
4. **Run `/userdoc`** — updates user docs in `/docs/` (guides, API reference, what's new)
5. **Update the dashboard** [/doc/active-work.md](doc/active-work.md):
   - Mark task `[x]` in the Active section
   - Move to [/doc/tasks/completed.md](doc/tasks/completed.md) and remove from dashboard
6. **Task folder cleanup** (if one exists): **ask user for confirmation** before deleting.

Steps 2-4 are mandatory. Only skip if the user explicitly says to.

#### Epic tasks — deferred review model

Review and docs updates (`/review`, `/document`, `/userdoc`) are **scoped to the epic, not individual tasks**. This avoids redundant reviews when later tasks touch the same code.

**When a task within an epic is completed:**
1. Verify acceptance criteria are met
2. Keep task as `[ ]` (unchecked) in [/doc/active-work.md](doc/active-work.md) — it stays "in progress" on the dashboard
3. Do NOT run `/review`, `/document`, `/userdoc` unless the user explicitly asks

**When the user explicitly requests review during epic work:**
The user may say "review done tasks" or "run review for completed tasks" at any point. When they do:
1. Run `/review`, `/document`, `/userdoc` covering all implemented-but-unreviewed tasks
2. Mark those tasks `[x]` in the dashboard

**When completing the epic:**
1. If unreviewed tasks remain — run `/review`, `/document`, `/userdoc` for them first, then mark `[x]`
2. If all tasks are already `[x]` — no additional review needed
3. Move entire epic block (with tasks) to [/doc/epics/completed.md](doc/epics/completed.md) and remove from dashboard
4. **Task folder cleanup** (if any exist): **ask user for confirmation** before deleting

**Summary:** `[ ]` = implemented but unreviewed. `[x]` = reviewed and done. Review is mandatory before an epic can close.

## Documentation Map

| Need to...                    | Read...                                                |
|-------------------------------|--------------------------------------------------------|
| Understand architecture       | [/doc/architecture/overview.md](doc/architecture/overview.md) |
| Learn folder structure        | [/doc/architecture/folder-structure.md](doc/architecture/folder-structure.md) |
| Add a new editor              | [/doc/standards/editor-guide.md](doc/standards/editor-guide.md) |
| Modify the browser editor     | [/doc/architecture/browser-editor.md](doc/architecture/browser-editor.md) |
| Add a UI component            | [/doc/standards/component-guide.md](doc/standards/component-guide.md) — see also [`src/renderer/uikit/CLAUDE.md`](src/renderer/uikit/CLAUDE.md) |
| UIKit vs components/ split    | [/doc/standards/uikit-vs-components-split.md](doc/standards/uikit-vs-components-split.md) |
| Work with context menus       | [/doc/architecture/context-menu.md](doc/architecture/context-menu.md) |
| Work with drag-and-drop       | [/doc/architecture/trait-system.md](doc/architecture/trait-system.md) |
| Build complex components      | [/doc/standards/model-view-pattern.md](doc/standards/model-view-pattern.md) |
| Understand state management   | [/doc/architecture/state-management.md](doc/architecture/state-management.md) |
| Work with pages/tabs          | [/doc/architecture/pages-architecture.md](doc/architecture/pages-architecture.md) |
| Add sidebar panels            | [/doc/architecture/secondary-views.md](doc/architecture/secondary-views.md) |
| Work with scripting system    | [/doc/architecture/scripting.md](doc/architecture/scripting.md) |
| Check coding style            | [/doc/standards/coding-style.md](doc/standards/coding-style.md) |
| See active/planned work       | [/doc/active-work.md](doc/active-work.md) |
| See future ideas              | [/doc/tasks/backlog.md](doc/tasks/backlog.md) |
| Publish a new build           | [/doc/standards/release-process.md](doc/standards/release-process.md) |
| Test MCP documentation        | [/qa/README.md](qa/README.md) |
| User documentation            | [/docs/index.md](docs/index.md) |

## Project Overview

Persephone (formerly js-notepad) is a Windows Notepad replacement for developers. Built with Electron and Monaco Editor (VS Code engine), it extends classic notepad with powerful code editing and a JavaScript/TypeScript execution environment.

### Design Philosophy
- **Core First:** Keep core functionality fast and lightweight
- **Extensible:** Editors loaded on-demand via async imports
- **Developer-Focused:** Tools for manipulating and transforming data
- **Container:** Provides UI building blocks; users bring integrations via Node.js/npm

### Key Features
- **Monaco Editor** - Syntax highlighting, IntelliSense, multi-cursor, compare mode
- **Script Executor** - Run JavaScript/TypeScript scripts with `page` object to transform content
- **Grid Editors** - JSON/CSV viewing with sorting, filtering, Excel copy-paste
- **Markdown Preview** - Live rendered preview
- **Rest Client** - HTTP request builder with collections (`.rest.json` files)

## Tech Stack

- **Runtime:** Electron 43 — [Castlabs ECS](https://github.com/castlabs/electron-releases) fork with Widevine DRM support (nodeIntegration: true, contextIsolation: false)
- **Frontend:** React 19 with TypeScript
- **Editor:** Monaco Editor
- **State:** Custom reactive primitives (TOneState, TGlobalState, TComponentState, TModel)
- **Build:** Vite 8 (rolldown) — `scripts/dev.mjs` (dev server + HMR), `scripts/build-prod.mjs` (production bundle), electron-builder (installer/packaging)
- **Styling:** Emotion (CSS-in-JS)

## Commands

```bash
npm start           # Development mode (Vite dev server + HMR via scripts/dev.mjs)
npm run dist        # Build NSIS installer + ZIP (electron-builder)
npm run dist:publish # Build and publish to GitHub Releases (draft)
npm run lint        # Run ESLint
```

## Folder Structure (Summary)

```
/src
  /main              # Electron main process
  /renderer          # React frontend
    /api             # Object Model — app.settings, app.pages, app.fs, app.proc, etc.
    /ui              # Application shell — MainPage, tabs, sidebar, dialogs
    /editors         # ALL editors (text, grid, markdown, compare, notebook, board, …)
    /content         # Content delivery — providers, transformers, pipes
    /scripting       # Script execution, wrappers, editor facades, worker
    /automation      # Browser automation — Playwright-compatible MCP tools, CDP, snapshots
    /uikit           # Standalone component library (canonical home for reusable primitives)
    /components      # Persephone-coupled components only (icons, page-manager, file-search, tree-provider)
    /core            # State primitives, utilities
    /theme           # Styling
  /ipc               # Inter-process communication
/boards-assets       # Recommended-components catalog for Boards (manifest + 10 skins)
/assets              # Static assets (board-template/, demo-board/, mcp-res-*.md, editor-types/, …)
/doc                 # Developer documentation
  /epics             # Epic tracking (big ideas with linked tasks)
/docs                # User documentation
/.claude
  /skills            # Skills: /review (forked), /document, /userdoc (forked), /mcp-test-agent (forked)
```

New reusable UI primitives go in `uikit/`. The four folders inside `components/` are persephone-coupled and never receive new pure primitives — see [/doc/standards/uikit-vs-components-split.md](doc/standards/uikit-vs-components-split.md) for the contract and [`src/renderer/uikit/CLAUDE.md`](src/renderer/uikit/CLAUDE.md) for UIKit authoring rules.

See [/doc/architecture/folder-structure.md](doc/architecture/folder-structure.md) for complete details.

## Critical Patterns

### 1. Dynamic Imports for Editors
Always use `import()` for editor code to maintain code splitting:
```typescript
// Good
const { ArchiveEditorView } = await import("../archive/ArchiveEditorView");

// Bad - increases bundle size
import { ArchiveEditorView } from "../archive/ArchiveEditorView";
```

### 2. Script Context (`page`, `app`, `io`, and `ai` objects)
Scripts access content via `page`, the application via `app`, the content pipe system via `io`, and AI integrations via `ai`:
```javascript
const data = JSON.parse(page.content);
page.grouped.content = JSON.stringify(result);
page.grouped.editor = "grid-json";

// Typed editor access via facades
const grid = await page.asGrid();
grid.addRows(5);

// Content pipe API — providers, transformers, events
const pipe = io.createPipe(new io.HttpProvider(url, { headers }));
const text = await pipe.readText();
await app.events.openRawLink.sendAsync(io.createLinkData(url));
```

### 3. Grouped Pages
- Two tabs can be grouped (side-by-side)
- Accessing `page.grouped` auto-creates a grouped page if none exists
- Script output is written to the grouped page

### 4. State Management
- Object Model APIs in `/src/renderer/api/` (app.settings, app.pages, etc.)
- State primitives in `/src/renderer/core/state/`
- See [state-management.md](doc/architecture/state-management.md)

### 5. Content Delivery Pipeline
Content I/O flows through a 3-layer pipeline (`/src/renderer/content/`). A single `ILinkData` object is created by the caller and enriched by each layer:
- **Layer 1 (Parsers):** Reads `data.href`, sets `data.url` (resolved path/URL), forwards same object (`openRawLink` → `openLink`)
- **Layer 2 (Resolvers):** Sets `data.pipe` (temporal) + `data.pipeDescriptor` (persisted) + `data.target`, forwards same object (`openLink` → `openContent`)
- **Layer 3 (Open Handler):** Consumes `data.pipe`, calls `cleanForStorage(data)` to build `sourceLink`, creates/navigates page

Content pipes (`IContentPipe`) compose a provider (data source) with transformers (data effects):
```typescript
// Provider reads/writes raw bytes; transformers process in chain
const pipe = createPipe(new FileProvider(filePath), new ArchiveTransformer(entry));
const text = await pipe.readText();  // FileProvider → ArchiveTransformer → decode
```

TextFileIOModel uses dual pipes: primary (source file) + cache (auto-save). Pipe state is serialized in `IEditorState.pipe` (`IPipeDescriptor`) for restore across app restarts.

### 6. Event Channels (LIFO)
`EventChannel.sendAsync()` calls subscribers in LIFO order (newest first). This allows late subscribers (like the open handler) to intercept and handle events before earlier subscribers.

## Coding Standards (Quick Reference)

- **TypeScript** for all new code
- **Emotion** for styling (styled components or css prop)
- **Functional components** with hooks
- **Direct imports** preferred over barrel imports (avoid circular deps)
- **Meaningful names** - descriptive, no abbreviations
- **No hardcoded colors** - All colors must come from `import color from "../../theme/color"`. Never use hex codes, `rgb()`/`rgba()`, or named colors directly in styled components or inline styles. If a needed color doesn't exist in `color`, add it to `color.ts` and all theme definitions in `/src/renderer/theme/themes/`.
- **No direct `require("path")`** - Use `file-path` utility (`/src/renderer/core/utils/file-path.ts`) for all path operations. Only `file-path.ts` itself may import `path` directly.
- **No direct `require("fs")`** - Use `app.fs` (`/src/renderer/api/fs.ts`) for file operations. Only `fs.ts` and a few documented exceptions may use `fs` directly (see `coding-style.md`).

See [/doc/standards/coding-style.md](doc/standards/coding-style.md) for complete standards.

## Key Files

| Purpose                  | File                                              |
|--------------------------|---------------------------------------------------|
| Shared types (IEditorState)| `/src/shared/types.ts`                            |
| ILinkData helpers        | `/src/shared/link-data.ts`                        |
| App object model         | `/src/renderer/api/app.ts`                        |
| Page/tab management      | `/src/renderer/api/pages/PagesModel.ts`           |
| Page container (tab)     | `/src/renderer/api/pages/PageModel.ts`            |
| Editor↔owner contract    | `/src/renderer/api/pages/IPageHost.ts`            |
| Well-known pages         | `/src/renderer/api/pages/well-known-pages.ts`     |
| File operations          | `/src/renderer/api/fs.ts`                         |
| Archive I/O (ZIP/RAR/7z/TAR) | `/src/renderer/api/archive-service.ts`          |
| Node.js HTTP client      | `/src/renderer/api/node-fetch.ts`                 |
| Path utilities           | `/src/renderer/core/utils/file-path.ts`           |
| Markdown link resolution (relative → `file://`; Azure DevOps wiki root-relative pages + `.attachments`) | `/src/renderer/core/utils/path-utils.ts` |
| Git-root detection for Markdown wiki links (walk up to nearest `.git`, cached) | `/src/renderer/editors/markdown/detect-git-root.ts` |
| Markdown heading anchors (GitHub-style slug ids + `-1`/`-2` dedupe; exports `slugifyHeading`, reused by `MarkdownBlock.scrollToAnchor` to match a `#fragment` against heading text so Azure-DevOps and GitHub dialects meet) | `/src/renderer/editors/markdown/rehypeHeadingIds.ts` |
| File / directory watchers (`FileWatcher`, `DirectoryWatcher`) | `/src/renderer/core/utils/file-watcher.ts` |
| Performance-timeline janitor (caps React dev-build `performance.measure` accumulation; self-gating no-op in release) | `/src/renderer/core/utils/performance-janitor.ts` |
| App settings             | `/src/renderer/api/settings.ts`                   |
| Event channel system     | `/src/renderer/api/events/EventChannel.ts`        |
| App events namespace     | `/src/renderer/api/events/AppEvents.ts`           |
| Trait system core        | `/src/renderer/core/traits/traits.ts`             |
| Trait registry + TraitTypeId | `/src/renderer/core/traits/TraitRegistry.ts`  |
| Drag-and-drop utilities  | `/src/renderer/core/traits/dnd.ts`                |
| ILink trait definition   | `/src/renderer/editors/link-editor/linkTraits.ts` |
| Content pipe             | `/src/renderer/content/ContentPipe.ts`            |
| Content pipe registry    | `/src/renderer/content/registry.ts`               |
| File provider            | `/src/renderer/content/providers/FileProvider.ts` |
| Cache file provider      | `/src/renderer/content/providers/CacheFileProvider.ts` |
| Encoding detection       | `/src/renderer/content/encoding.ts`               |
| Link parsers (Layer 1)   | `/src/renderer/content/parsers.ts`                |
| Pipe rebuild from a persisted source path (`pipeFromSourcePath` — plain / `archive.zip!entry` / `http(s)`; shared by the Image editor, board file materialization and page restore) | `/src/renderer/content/rebuild-pipe.ts` |
| Pipe resolvers (Layer 2; the http resolver's extension table decides browser-vs-content AND names the built-in editor, so an entry may carry `browserFallback: true` with no `editor` — the type has no built-in editor, opens as content only if a trusted board claims it, else falls through to the browser tab) | `/src/renderer/content/resolvers.ts` |
| Link resolution utils    | `/src/renderer/content/link-utils.ts`             |
| Open handler (Layer 3)   | `/src/renderer/content/open-handler.ts`           |
| HTTP provider            | `/src/renderer/content/providers/HttpProvider.ts`  |
| cURL/fetch parser        | `/src/renderer/core/utils/curl-parser.ts`         |
| Open URL dialog          | `/src/renderer/ui/dialogs/OpenUrlDialog.tsx`      |
| Script `io` namespace    | `/src/renderer/scripting/api-wrapper/IoNamespace.ts` |
| Script `ai` namespace    | `/src/renderer/scripting/api-wrapper/AiNamespace.ts` |
| Script `ClaudeSession`   | `/src/renderer/scripting/api-wrapper/ClaudeSession.ts` |
| Script library service   | `/src/renderer/api/library-service.ts`            |
| Script autoloading       | `/src/renderer/scripting/AutoloadRunner.ts`       |
| Script execution (core)  | `/src/renderer/scripting/ScriptRunnerBase.ts`     |
| Script execution         | `/src/renderer/scripting/ScriptRunner.ts`         |
| TypeScript transpilation | `/src/renderer/scripting/transpile.ts`            |
| Async worker (renderer)  | `/src/renderer/scripting/worker/WorkerRunner.ts`  |
| Async worker (main)      | `/src/main/worker-host.ts`                        |
| Script API types         | `/src/renderer/api/types/*.d.ts`                  |
| Script-facing `app` wrapper (whitelists one getter per namespace — a namespace added to `IApp` is invisible to scripts until it gets a getter here; a type-only `Exclude<keyof IApp, keyof AppWrapper>` check at the bottom of the file fails the build on omission, since the wrapper's richer return types rule out a real `implements IApp`) | `/src/renderer/scripting/api-wrapper/AppWrapper.ts` |
| Monaco setup             | `/src/renderer/api/setup/configure-monaco.ts`     |
| Editor registry          | `/src/renderer/editors/base/editorRegistry.ts`    |
| File→editor matchers (the per-editor `acceptFile`/`switchOption`/`validForLanguage`/`detectsContent` rules + the numeric priority ladder that decides which editor OPENS a file — monaco 0, markdown 10, compound names 20, draw 50, viewers 100, category 200; `acceptFile` is name-only while `switchOption` is language-based, which is why language-only editors like `html-view` never claim a file on open) | `/src/renderer/editors/base/editor-matchers.ts` |
| Secondary view registry| `/src/renderer/ui/secondary-views/secondary-view-registry.ts` |
| Composite panel keys (sidebar) | `/src/renderer/ui/secondary-views/panel-key.ts` |
| Shared sidebar panel header (icon + badge + truncating title + pinned actions; owns the header portal; standardized right-edge "show main view" zone-button via `onShowMain`/`showMainActive`/`showMainTitle` props) | `/src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` |
| Editor registration      | `/src/renderer/editors/register-editors.ts`       |
| Editor base class        | `/src/renderer/editors/base/EditorModel.ts`       |
| Content host interface   | `/src/renderer/editors/base/IContentHost.ts`      |
| Content host trait       | `/src/renderer/editors/base/editor-traits.ts`     |
| Shared text-host footer (`script` toggle · `footerContributions` slot · provider icon · encoding label; extracted from `TextChrome` so it's shared by built-in text editors and content-host boards via `BoardEditorView` — boards fill the contributions slot with a footer status label via `persephone.setStatusText`) | `/src/renderer/editors/base/ContentHostFooter.tsx` |
| Image-export capability (`exportPng`/`suggestedImageName`; Mermaid/SVG/Image/HTML) | `/src/renderer/editors/base/IImageExport.ts` |
| Image-export helpers (canvas→PNG, save-to-file/dialog) | `/src/renderer/editors/shared/image-export.ts` |
| Page-tab context-menu builders (`textFileMenuItems` / `filePathMenuItems` / `openInBrowserMenuItems` — "Open in Browser" for HTML files via `target: "browser"`; consumed via `EditorModel.onGetMenuItems()`) | `/src/renderer/editors/shared/editor-menu-items.tsx` |
| Text editor model        | `/src/renderer/editors/text/TextEditorModel.ts`   |
| Monaco editor            | `/src/renderer/editors/monaco/MonacoEditor.ts`    |
| Grid editor              | `/src/renderer/editors/grid/GridEditor.ts`        |
| Log view editor          | `/src/renderer/editors/log-view/LogViewEditor.ts` |
| Syntax-highlighted code  | `/src/renderer/editors/shared/ColorizedCode.tsx`  |
| Editor icon resolver (tab + sidebar panel headers; `noLanguage`/`getIcon` vs `LanguageIcon`) | `/src/renderer/components/icons/EditorIcon.tsx` |
| Notebook editor          | `/src/renderer/editors/notebook/NotebookEditor.ts` |
| Notebook types           | `/src/renderer/editors/notebook/notebookTypes.ts` |
| Note item edit model     | `/src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` |
| Graph editor             | `/src/renderer/editors/graph/GraphEditor.ts`      |
| Draw editor              | `/src/renderer/editors/draw/DrawEditor.ts`        |
| Rest Client editor       | `/src/renderer/editors/rest-client/RestClientEditor.ts` |
| MCP Inspector model      | `/src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts` |
| Base virtualization      | `/src/renderer/uikit/RenderGrid/RenderGrid.tsx`   |
| Advanced grid            | `/src/renderer/uikit/AVGrid/AVGrid.tsx`           |
| Tree primitive (lazy expansion state lives in `TreeState.expanded`, keyed by source `value`; `getExpandedMap()` is the one truth a consumer should persist — `onExpandChange` is a notification, not a ledger. `collapseDescendants` closes a whole subtree in the same state write as the toggled row, which lazy consumers that drop a collapsed row's children **must** opt into) | `/src/renderer/uikit/Tree/TreeModel.ts` |
| UIKit library            | `/src/renderer/uikit/`                            |
| UIKit authoring rules    | `/src/renderer/uikit/CLAUDE.md`                   |
| Focus-aware list selection contract (`rowSelectionBase` / `focusSelectionOverride` / `rowFocusSelectionOverride`; Explorer two-state look — blurred gray / focused blue via `:focus-within` + `data-focus-selection`) | `/src/renderer/uikit/shared/selection-style.ts` |
| Selectable-row primitive (Rule-7-clean bespoke-row host for the focus-aware selection; `selected`/`active` props) | `/src/renderer/uikit/SelectableRow/SelectableRow.tsx` |
| Color tokens             | `/src/renderer/theme/color.ts`                    |
| App theme cycling (`cycleAppTheme(direction)` — cycle + persist to settings; shared by the host `KeyboardService` shortcut and the `board:cycleTheme` message forwarded out of a board frame, so both paths behave identically) | `/src/renderer/api/cycle-app-theme.ts` |
| Theme definitions        | `/src/renderer/theme/themes/`                     |
| Tor service (main; tor.exe lifecycle + restart-based reconnect, per-partition SOCKS5 proxy, exit-IP/geo lookup through the partition's session. **Fails closed**: `armPartition` applies the proxy *before* the daemon exists — awaited from `BrowserEditor.restore()`, the one path every Tor page takes (session restore included) and always ahead of `addPage`, because an unproxied Electron session is DIRECT and the first webview mounts with `src` already set, so the bootstrap window would otherwise leak the opening navigation; `settleStart` re-applies it on failure too, so a daemon that never bootstraps can't leave a page browsing normally; `armTorProxy` is idempotent because `restore()`/`showBrowserPage`/`reconnectTor` each must guarantee it independently. Arming stays out of `activePartitions` — `isActiveTorPartition` means "live and *bootstrapped*" for `tor-src://`/`checkIp`) | `/src/main/tor-service.ts` |
| `tor-src://` scheme handler (main; fetches an `http(s)` URL through a Tor partition's session so the SOCKS proxy applies — the app renderer is unproxied, so a Tor page's Link-editor images would otherwise leak direct. Three guards required together: partition-shape regex, live-partition check, `http(s)`-only target; target travels in `?u=` because Chromium canonicalizes standard-scheme paths) | `/src/main/tor-src-protocol.ts` |
| Tor image-src resolver (renderer; rewrites remote `src` → `tor-src://`, passes local schemes through, renders nothing when the circuit is down. Lives in `link-editor/` to keep the `browser → link-editor` dependency arrow one-way) | `/src/renderer/editors/link-editor/tor-src.ts` |
| Piped image-src resolver (`usePipeImageSrc` — an archive-entry `imgSrc` like `deck.pptx!ppt/media/img.png` is unloadable by `<img>`, so it is read through `pipeFromSourcePath` into a blob URL; `http(s)`/`data:`/`blob:`/`file://` **and plain local paths** pass through untouched, since the renderer loads those natively and piping them would force a full in-memory read per visible image. Capped blob-URL cache with oldest-first eviction + `revokeObjectURL`, because tile grids are virtualized and every scroll would otherwise re-read the archive. Runs BEFORE `resolveTorSrc` so the resulting `blob:` counts as local and is never proxied) | `/src/renderer/editors/link-editor/pipe-image-src.ts` |
| Tor connection info dialog (exit IP + location + `check.torproject.org` verdict; Reconnect restarts tor.exe) | `/src/renderer/ui/dialogs/TorInfoDialog.tsx` |
| Native-dialog folder memory (last-used directory per dialog kind — `open`/`save`/`folder` — persisted in `electronStore` under `dialog.lastDir.<kind>`. `resolveDefaultPath` owns the precedence: a caller `defaultPath` **carrying a directory** is an explicit choice and wins (so text Save As opens beside the original and a settings picker opens at the configured value), else the remembered directory, else the weak `location?: CommonFolder` param, else the caller's value as-is — a bare file name in `defaultPath` is only a suggested name and gets placed into whichever directory wins. A remembered directory that no longer exists is ignored. Lives in `main/` rather than inside the dialog handlers because `will-download` demands a synchronous dialog, so `download-service` can't route through them) | `/src/main/dialog-folder-memory.ts` |
| File-search walk (worker thread; the directory walk, picomatch include/exclude matchers, per-file line matching, batching and the matched-line cap. Bundled as its OWN entry to `.vite/build/search-worker.js` and loaded by `search-service` as **source** — the walk is entirely synchronous `fs` I/O, so running it on the main-process event loop froze the window message pump and, worse, made cancellation structurally impossible: the cancel IPC handler could not run until the search it was meant to stop had finished. Two constraints follow from `{ eval: true }` — it must never import `electron`, and the bundle must externalize only node builtins so `picomatch` stays inlined) | `/src/main/search-worker.ts` |
| File-search host (main; one worker per sender `webContents`, relays batches/progress/complete to the renderer. Cancel — from the panel, a changed query, a replacing search, or the window closing via `sender.once("destroyed")` — is `worker.terminate()`, not a flag, because a blocked worker would never read one. `getWorkerSource()` reads the worker bundle beside `main.js` with `fs.readFileSync` and caches it only when `app.isPackaged`: `new Worker(path)` can't be trusted to resolve an entry inside the packaged asar, while `readFileSync` is asar-aware — the same trick `board-protocol-service` uses for the board shim, and the dev-time skip lets a rebuilt worker apply without restarting Electron) | `/src/main/search-service.ts` |
| Named Pipe server        | `/src/main/pipe-server.ts`                        |
| Windows browser registration | `/src/main/browser-registration.ts`           |
| MCP HTTP server          | `/src/main/mcp-http-server.ts`                    |
| Audio/Video player editor| `/src/renderer/editors/video/VideoPlayerEditor.tsx` |
| Video playback component | `/src/renderer/editors/video/VPlayer.tsx`          |
| Audio player component   | `/src/renderer/editors/video/AudioPlayer.tsx`      |
| Audio controls bar       | `/src/renderer/editors/video/AudioControls.tsx`    |
| Audio visualizer         | `/src/renderer/editors/video/AudioVisualizer.tsx`  |
| Video streaming server   | `/src/main/video-stream-server.ts`                |
| VLC launcher             | `/src/main/vlc-launcher.ts`                       |
| Terminal launcher (main; `detectTerminal` via `where`, `openTerminalAt` via `cmd /c start` so a console shell gets a visible window; supports pwsh/powershell/cmd/wt) | `/src/main/terminal-launcher.ts` |
| Terminal open helper (renderer; reads `terminal.command`, auto-detects pwsh→powershell→cmd on first use and saves it, then launches — drives the "Open Terminal here" folder menu item) | `/src/renderer/api/terminal.ts` |
| MCP resource guides      | `/assets/mcp-res-*.md`                            |
| MCP command handler      | `/src/renderer/api/mcp-handler.ts`                |
| Browser automation cmds  | `/src/renderer/automation/commands.ts`             |
| Browser input dispatch   | `/src/renderer/automation/input.ts`                |
| Browser ref resolution (a snapshot ref is a `backendDOMNodeId`, so a `StaticText` ref denotes a **text node** — `callOnRef` coerces to the nearest element before invoking, since text nodes have no `Element` methods and roleless list rows often expose no other ref; its `fn` must be a plain `function(){}` expression, invoked via `.call(element)`) | `/src/renderer/automation/ref.ts` |
| CDP session wrapper      | `/src/renderer/automation/CdpSession.ts`           |
| Accessibility snapshot   | `/src/renderer/automation/snapshot.ts`              |
| App-window automation adapter (`IBrowserTarget` for the app's own UI; `browser_*` with `pageId: "app"`; `APP_WINDOW_CDP_KEY` sentinel routed to the calling window's own webContents in `cdp-service`; explicit-only in `getTarget`; snapshot shows only the active page — hidden pages excluded by the AX tree) | `/src/renderer/automation/AppTargetModel.ts` |
| CDP service (main; three target kinds — browser webContents, board frame, and the app window itself via the `APP_WINDOW_CDP_KEY` sentinel → `event.sender`) | `/src/main/cdp-service.ts` |
| Rust launcher            | `/launcher/src/main.rs`                           |
| Rust screen snip tool + file-clipboard helper (`clipboard-read`/`clipboard-write` CF_HDROP subcommands) | `/snip-tool/src/main.rs` |
| Screen snip service (main; spawns the snip exe, returns PNG data URL; optionally hides windows for the capture) | `/src/main/snip-service.ts` |
| File-clipboard service (main; Windows-Explorer copy/paste interop — CF_HDROP read/write via the snip exe; degrades to empty when the exe is missing) | `/src/main/clip-service.ts` |
| Native OS file drag-out service (main; `startOsFileDrag` via `webContents.startDrag` — real CF_HDROP so Windows Explorer / Teams accept the dragged file; win32-only, shell icon via `app.getFileIcon` + fallback) | `/src/main/os-drag-service.ts` |
| Provider-backed tree view model (the Explorer, Archive, Mneme, Script-library and link-category trees; lazy `list()` per expanded folder, `buildTree` refresh, expansion persisted as `expandedPaths`. `buildTree` re-lists children ONLY for currently-expanded paths, so a collapsed folder's subtree is dropped on every refresh — which is why the view opts into `Tree`'s `collapseDescendants`) | `/src/renderer/components/tree-provider/TreeProviderViewModel.tsx` |
| Explorer tree OS-clipboard actions (Cut/Copy/Paste ⇄ Windows Explorer — context menu + Ctrl+C/X/V; file provider only; recursive copy/move via `core/utils/copy-files.ts`) | `/src/renderer/components/tree-provider/os-clipboard.ts` |
| Sidebar-focus guard (`isFocusInSidebar` — navigation from a sidebar panel doesn't steal editor focus; page activation still autofocuses) | `/src/renderer/core/utils/focus-utils.ts` |
| Mneme service (Rust)     | `/mneme/` (knowledge-base service; see `/mneme/README.md`) |
| Mneme shared MCP connection (single auto-reconnecting client; refcounted subscriptions → per-document watchers) | `/src/renderer/api/mneme-connection.ts` |
| Mneme status prober + reactive status (drives sidecar launch + indicators; auto-opens the config editor once per session when active but unprovisioned) | `/src/renderer/api/mneme-status.ts` |
| Mneme content provider (read/write/edit a document, live-refresh) | `/src/renderer/content/providers/MnemeProvider.ts` |
| Mneme tree provider (browse a root like a filesystem; create/rename/delete; drag-drop import) | `/src/renderer/content/tree-providers/MnemeTreeProvider.ts` |
| Mneme link traits (`MnemeLink`: `LINK` + `FILE_LINK`) | `/src/renderer/content/tree-providers/mnemeLinkTraits.ts` |
| `mneme-folder://` link format (encode/decode a root) | `/src/renderer/content/mneme-folder-link.ts` |
| `mneme://` document scheme — canonical href ⇄ MCP address (`toMnemeHref`/`toMnemeAddress`) | `/src/renderer/content/mneme-link.ts` |
| Mneme config & monitoring editor (roots, include/ignore, reindex + progress, model, log) | `/src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` |
| Mneme root/search editor (+ Explorer-like tree sidebar; Pattern B per-folder singleton) | `/src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` |
| VMP signing (build hook) | `/scripts/vmp-sign.mjs`                           |
| Git service (main)       | `/src/main/git-service.ts`                        |
| Git IPC types            | `/src/ipc/git-ipc.ts`                             |
| Git renderer API         | `/src/renderer/api/git.ts`                        |
| Git Tree component       | `/src/renderer/components/git-tree/GitTree.tsx`   |
| Git Tree model (load/paginate) | `/src/renderer/components/git-tree/GitTreeModel.ts` |
| Git changes (status) model + stage/unstage/reset/commit (+ branch, identity) | `/src/renderer/components/git-tree/GitChangesModel.ts` |
| Git refs (branches/remotes/tags) model + fetch / push / pull / ahead-behind | `/src/renderer/components/git-tree/GitBranchesModel.ts` |
| Refs-tree builder (Branches/Remotes/Tags nodes, `/`-folding, historical/alpha order) | `/src/renderer/components/git-tree/git-refs-tree.ts` |
| Git status badge         | `/src/renderer/components/git-tree/GitStatusBadge.tsx` |
| Git ref chip (branch/tag/HEAD, shared) | `/src/renderer/components/git-tree/RefBadge.tsx` |
| Git history date formatter (shared) | `/src/renderer/components/git-tree/git-date.ts` |
| L/R side-select toggle   | `/src/renderer/components/git-tree/SideSelectToggle.tsx` |
| Swimlane lane layout     | `/src/renderer/components/git-tree/swimlane-layout.ts` |
| Git Tree editor          | `/src/renderer/editors/git-tree/GitTreeEditorModel.ts` |
| Git Tree editor view (toolbar + grid + bottom panel) | `/src/renderer/editors/git-tree/GitTreeEditorView.tsx` |
| Git "Git" panel — merged secondary view (container: "Git (N)" header, Refresh + "x" close + "Show Git Tree" zone, Changes/Branches/Tags SegmentedControl + body-toolbar AZ toggle for refs segments; persists `gitPanelTab`) | `/src/renderer/editors/git-tree/GitPanelSecondaryView.tsx` |
| Git "Changes" segment body (stage/unstage/reset + Commit button — buttons, double-click, context menu; header-less) | `/src/renderer/editors/git-tree/GitChangesView.tsx` |
| Git "Branches"/"Tags" segment body (`show="branches"` → Branches + Remotes refs tree; `show="tags"` → flat tags; head-green active branch, AZ/historical order, click-to-reveal, Switch context menu; header-less) | `/src/renderer/editors/git-tree/GitRefsView.tsx` |
| Commit dialog (message + author Name/Email + branch; "Commit" / "Commit & Push" actions; `showCommitDialog`) | `/src/renderer/ui/dialogs/CommitDialog.tsx` |
| Git Tree "Commit" bottom panel (commit metadata + message) | `/src/renderer/editors/git-tree/CommitInfoPanel.tsx` |
| Git Tree "Diff" bottom panel (changed-file list + inline Monaco diff) | `/src/renderer/editors/git-tree/CommitDiffPanel.tsx` |
| File Diff editor (single shared `fileTree` model) | `/src/renderer/editors/file-diff/FileDiffEditor.ts` |
| Git Diff "File History" panel | `/src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.tsx` |
| Flat file list (icons + single-click) | `/src/renderer/components/file-list/FileList.tsx` |
| AVGrid-based file list (range select + sorting + range-copy) | `/src/renderer/components/file-grid/FileGrid.tsx` |
| Process execution (`app.proc.execute` — renderer client) | `/src/renderer/api/proc.ts` |
| Process execution (script-facing types `IProc`/`IExecuteHandle`) | `/src/renderer/api/types/proc.d.ts` |
| Command runner wire types + IPC channels (shared by proc.ts and board preload) | `/src/ipc/runner-channels.ts` |
| Command runner (main-process spawn service; whole-tree kill; jobId registry; jobs carry an optional caller `name` + `getJobsBySinkIds` query for board job re-association; `startJobTo` spawns `spawn(command, msg.args ?? [], opts)` — an `args` array on the start message enables argv-style/no-shell spawns, empty ≡ the classic single-string shell path) | `/src/main/command-runner.ts` |
| Windows env backfill (`reconstructWindowsEnv` — restores missing standard folder/system vars at startup so spawned children get a full env even when launched from a degraded shell; win32-only, backfill-only; called first in `setupMainProcess()`) | `/src/main/windows-env.ts` |
| Per-board trust registry (trusted board roots; `trustedBoards.txt`; boards won't render without trust; also the known-boards registry; **inherited trust** — a board is trusted if it or any ancestor folder is registered, and `trust()` keeps the registry free of nested pairs) | `/src/renderer/api/board-trust.ts` |
| Board lifecycle + catalog API (`app.boards` — `createBoard`/`createDemoBoard`/`openBoard`; **lifecycle**: `registerBoard` (shows the trust dialog, may return `false`) / `unregisterBoard` / `renameBoard` (transfers existing trust, no dialog); **catalog**: `searchPublished` / `getPublishedVersions` / `downloadPublished` (headless, trusts nothing) / `installPublished` (opens the Board Info page) / `uninstallBoard` / `checkPublishedUpdates`. Security invariant: the API requests, the user's dialog click grants) | `/src/renderer/api/boards.ts` |
| Board lifecycle script types (`IBoards`) | `/src/renderer/api/types/boards.d.ts` |
| `board-manifest.json` identity file (read/ensure; a folder is a board iff it carries one; also the Custom Editor axis — `fileMasks`/`folderMasks`/`editorPriority`/`editorName`/`editorKind` (`"simple"` \| `"content-host"`)/`editorSources` (`"local"` \| `"any"` — whether a SIMPLE board may be offered a non-local source; default-closed because the common `readFile(getFilePath())` shape breaks on a source with no readable path) + `normalizeFileMasks`/`matchesFileMask`/`normalizeFolderMasks`/`matchesFolderMask`/`getBoardEditorAssociation`, and the one predicate every consumer calls, `matchesBoardMasks(pathOrName, fileMasks, folderMasks)` — basename AND (no folder masks OR parent-folder match), with the folder gate SKIPPED (not failed) for a bare name, which is why file ICONS stay file-mask-only while the two editor-deciding paths always hold a full path; folder masks are suffix-anchored and separator-aware (`*`/`?` stop at `/`, `**` crosses) and only NARROW `fileMasks`, so a masks-free board is still no association; and the **secondary-views axis** — optional `secondaryViews: SecondaryViewDecl[]` (`{id,html?,title?}`) read by a `fileMasks`-independent reader + `normalizeSecondaryViews` rejecting/cleaning `::`-bearing ids; and the **published-catalog axis** — optional `version?`/`standalone?`/`minAppVersion?` + `boardUsageGroup(manifest)` → `"file-viewer" \| "file-editor" \| "tool"` and `isBoardStandalone(manifest)` (no masks → standalone; masks → opt-in) gating pin actions) | `/src/renderer/editors/board/board-manifest.ts` |
| Board environment-variables store (session-singleton over the settings-configured `.env.json`; `namespace → profile → key → value` schema; reuses `shell.encryption`/`ui.password`/`TextFileModel.decrypt` for optional password encryption — no new crypto) | `/src/renderer/api/board-vars/BoardEnvStore.ts` |
| Board vars namespace resolution (`resolveBoardNamespace` — manifest `author/name` when both explicitly set, else the board's root path; `findNamespaceCollision`/`confirmNamespaceNotColliding` — non-blocking advisory warning at board registration when a namespace collides with an already-registered board) | `/src/renderer/api/board-vars/namespace.ts` |
| Board vars bridge orchestration (routes a board's `persephone.var.*` request against ITS OWN namespace, resolved by `BoardWebview` — not board-supplied; shows the "Create environment variables storage" dialog on first use; serializes concurrent requests on a shared chain so two boards can't each pop a dialog at once) | `/src/renderer/api/board-vars/board-vars-bridge.ts` |
| Agent-facing admin API (`app.boardVars` — unrestricted-namespace `get`/`set`/`list`/`listNamespaces`/`namespaceFor`/`show`; unlike the board-side bridge, not limited to the calling board's own namespace since `execute_script` already carries full app trust) | `/src/renderer/api/board-vars/admin-api.ts` |
| Board vars script types (`IBoardVars`) | `/src/renderer/api/types/board-vars.d.ts` |
| "Create environment variables storage" dialog (first-use prompt; default path = data folder, editable) | `/src/renderer/ui/dialogs/CreateBoardVarsStorageDialog.tsx` |
| Namespace collision dialog (non-blocking advisory at board registration; Register-anyway / Cancel) | `/src/renderer/ui/dialogs/NamespaceCollisionDialog.tsx` |
| `*.env.json` built-in editor (namespace list + profile tabs + an AVGrid name/value editor per profile; target of `persephone.var.show()` / `app.boardVars.show(namespace)`) | `/src/renderer/editors/env-vars/EnvVarsEditor.ts` |
| Custom-editor registry (reactive `mask → trusted board` map over `boardTrust`; `board-editor:<root>` virtual ids via `boardEditorId`/`parseBoardEditorId`; `resolveEditorIdForFile(filePath, matchPath?)` merges built-in + board candidates at file-open — `matchPath` splits the two questions apart, locality judged on the original url while mask/built-in matching runs on the effective path, and a non-local source reaches a simple board only via `editorSources: "any"`; `isBoardEditorId` for MCP/automation board detection; `refresh()` is generation-guarded so a stale overlapping refresh — e.g. a rapid untrust+trust board-folder rename — can't clobber the newer result) | `/src/renderer/editors/board/custom-editor-registry.ts` |
| `persephone-board://` link scheme (encode/decode; parsed in `parsers.ts` → `target: "board-view"`) | `/src/renderer/content/persephone-board-link.ts` |
| Board editor model (single-board lifecycle, per-board trust, live iframe ref, icon; opens any board root; busy keep-alive — while `persephone.setBoardBusy(true)`, survives navigation as an invisible ownership handle so its spawned processes outlive the iframe; dispose reaps them; **secondary views + shared state** (base for every board) — seeds `secondaryViewDefs` from the manifest, derives `state.secondaryView = board-secondary:<id>` list, `setSecondaryViews`, `sharedState`/`sharedStateRestorableKeys` with a monotonic `sharedStateSeq`, opt-in `getRestoreData` persistence; **multi-frame** — a per-tab frame map + `activeTabId`, `markFrameLoaded`/`waitForFrameLoad` (deterministic `board_refresh`); **file materialization** — `getFilePath()` always resolves to a readable LOCAL path: a plain local file returns its own path with no I/O, anything else (archive entry, `http(s)` URL, transformed pipe) is read through the page's content pipe into a cache file named after the source, memoized for the model's lifetime so it outlives the iframe, read-only, and REJECTS on an unreadable source — which is why a board needs no source-specific code but must handle a slow/rejecting call) | `/src/renderer/editors/board/BoardEditorModel.ts` |
| Content-host board model (`BoardContentEditorModel extends BoardEditorModel` — composes an `IContentHost`/`TextFileModel` via `CONTENT_HOST_TRAIT`; manifest `editorKind: "content-host"`; switches with built-in editors by transferring the shared host — no reload; delegates save/dirty to the host, `skipSave=false`; persists the host descriptor in `getRestoreData` — `d.host` on a `board-view` descriptor is the content-host discriminator; no busy — host transfers out on switch; content over the `persephone.host.*` bridge; always reports the `board-editor:<root>` editorId + falls back to the page title as the file name when path-less, so the switch appears and round-trips on an untitled page renamed to a matching name; `override get modified()` delegates to the host so `page.modified` / `list_pages` report a dirty content-host board correctly) | `/src/renderer/editors/board/BoardContentEditorModel.ts` |
| Busy-boards reactive registry (busy board roots → Boards panel "running" dot) | `/src/renderer/editors/board/busy-boards.ts` |
| Board editor view (React component; also renders `ScriptPanel` + `ContentHostFooter` below the iframe when `model.contentHost` is set, giving content-host boards the built-in text-editor footer + script panel) | `/src/renderer/editors/board/BoardEditorView.tsx` |
| In-board toolbar (Reload / Show-log / board path + boards-switcher popover / File Explorer button → `page.toggleNavigator` rooted at the board's parent folder) | `/src/renderer/editors/board/BoardToolbar.tsx` |
| Board module + factory (boardModule + legacy EditorModule) | `/src/renderer/editors/board/index.tsx` |
| Board secondary-view panel component (generic; serves the whole `board-secondary:*` family via one prefix registration; reads its `panelId` → view id → `secondaryViewDefs` entry → `BoardWebview` `isMain=false` over the shared board model; per-board trust-gated) | `/src/renderer/editors/board/BoardSecondaryView.tsx` |
| Board secondary-view panel-id family helpers (`BOARD_SECONDARY_PREFIX`, `boardSecondaryPanelId`/`isBoardSecondaryPanelId`/`parseBoardSecondaryPanelId`) | `/src/renderer/editors/board/board-secondary.ts` |
| Board host (locked-down cross-origin `<iframe src="board://<host>/<entry>?v=<boardId>&view=<role>">`, no `sandbox` attr; the per-mount `?v=<boardId>` nonce uniquely identifies this tab's frame for CDP automation — passed to `registerBoardFrame` with a per-frame `tab`; brokers the one-time `MessagePort` handshake into the frame; **`entry`/`isMain`/`view` props** — a secondary frame (`isMain=false`) does NOT own the shared automation target / CDP-iframe registration, ui.log reset, or autofocus; per-frame shared-state sync (seed-on-load + `state:sync` push, seq-guarded) and content-host `host:content` push run in every frame; resets the board's `ui.log` per load (main only); routes shim `board:interact`/`board:error`/`board:log`/`board:setState`/`board:setSecondaryViews`/`board:setStatusText` (content-host footer status, main-frame only) posts) | `/src/renderer/editors/board/BoardWebview.tsx` |
| `board://` scheme handler (single host-routed `protocol.handle` on the shared session, `host → board root`; serves board files + CSP; injects `--p-*` palette + boot context + the bridge shim `<script>` into served HTML `<head>` so first paint is themed and `window.persephone` exists before the first author script) | `/src/main/board-protocol-service.ts` |
| Untrusted-board placeholder (Trust board button) | `/src/renderer/editors/board/UntrustedBoardView.tsx` |
| Board-not-found placeholder (stale trusted/pinned path) | `/src/renderer/editors/board/BoardNotFoundView.tsx` |
| Trust board dialog (`showTrustBoardDialog`; RCE wording) | `/src/renderer/ui/dialogs/TrustBoardDialog.tsx` |
| Create-board dialog (folder picker + name + live target-location label; defaults folder to the Explorer root; both inputs required) | `/src/renderer/ui/dialogs/CreateBoardDialog.tsx` |
| Explorer-sibling "Boards" panel (trusted boards under the Explorer root via `BoardsTree`; backed by `ExplorerEditor` like Search; "+ New board" SplitButton) | `/src/renderer/editors/explorer/BoardsSecondaryView.tsx` |
| Board theme contract (`computeBoardThemePalette`, `BOARD_TOKEN_VARS`, `--p-*`) | `/src/renderer/editors/board/board-theme.ts` |
| Board icon cache (module-level SVG/PNG/ICO → data URL cache) | `/src/renderer/editors/board/board-icon-cache.ts` |
| Board usage cache (reactive board-standalone metadata cache mirroring the icon cache — `getBoardUsageSync`/`resolveBoardUsage`/`invalidateBoardUsage`/`useBoardStandalone`; a trusted board's standalone bit needs a manifest read, so pin affordances subscribe through this rather than block) | `/src/renderer/editors/board/board-usage-cache.ts` |
| Reusable boards tree (folder-compacted; single-root + multi-root; board-click / trailing-action / context-menu slots) | `/src/renderer/editors/board/BoardsTree.tsx` |
| Boards-tree pure builder (path list → compacted folder/board node tree; VSCode-style single-child folder compaction) | `/src/renderer/editors/board/boards-tree-build.ts` |
| Board bridge shim (browser IIFE inlined into served board HTML; rebuilds `window.persephone` over the `MessagePort` — queue-then-flush, `execute` streaming, `executeNode(script, args?, opts?)` (same handle contract, marks the start `node:true` + argv-style `args` so main runs it on the bundled runtime), dialogs, files, theme, `setBoardBusy`/`getBoardBusy`/`getJobs`; `persephone.view` (`"main"` \| view id) read synchronously from the `view=` URL param at boot; posts `board:interact`/`board:error`/`board:busy`/`securitypolicyviolation`/`window.onerror` to the host frame + mirrors `console.error`/`console.warn` as `board:log`; **content-host boards** — `persephone.host.*` (`getContent`/`setContent`/`onContentChange`/`getLanguage`/`save`) over the renderer-pushed `host:content` message + `board:setContent`/`board:save` back — `getContent`/`getLanguage` await the handshake internally (safe in any call order, no ready-gate), `setContent` is read-your-own-write, `onContentChange` always registers; the footer status text is set via `persephone.setStatusText(text)` → `board:setStatusText` (main-view footer, `""` clears, no-op on plain boards); plus an automatic `window`-level Ctrl+S that posts `board:save` unless a board handler `preventDefault`s it; **forwarded theme shortcuts** — a `window`-level keydown for Ctrl+Alt+`[` / `]` posts `board:cycleTheme` (`direction` -1/+1) to the host, because the host's global `KeyboardService` listens on the HOST document and a cross-origin frame's keydown never reaches it; same bubble-phase `preventDefault` opt-out as Ctrl+S, and allowed from ANY frame since the app theme is global state; **external-link routing** — a `window`-level click/auxclick interceptor routes any `<a href>` leaving the board's `board://` origin through `openRawLink` (so a stray hyperlink can't navigate the frame into a blank screen — the host CSP would block it); in-board/`#fragment` links pass through, and a board can opt out via `preventDefault`; **default context menu** — a `window`-level `contextmenu` handler renders a minimal themed (`--p-*`) vanilla-DOM menu inside the frame (boards can't reach the renderer's React `showAppPopupMenu`): _Open Link_/_Copy Link_ on external links, _Open Image in New Tab_ (→ `openRawLink` `{ editor: "image-view" }`)/_Copy Image_ (canvas→PNG)/_Save Image As…_ (data-URL decoded directly — CSP forbids `fetch("data:")`) on images, _Cut_/_Copy_/_Paste_ on editable fields, _Copy_ on a plain selection; a board opts out via `preventDefault` (bubble-phase, like Ctrl+S); **secondary views** — `persephone.state.*` (`init`/`get`/`set`/`merge`/`onChange`, seq-guarded replica) over `state:sync` in / `board:setState`/`board:mergeState`/`board:stateInit` out, and `persephone.setSecondaryViews([...])`) | `/src/board-shim.ts` |
| Board bridge (main side: mints a `MessageChannelMain` port pair per board, routes the duplex port — `execute` over the command runner, `executeNode` translation (a `node:true` start is rewritten to spawn `process.execPath` with `[scriptAbs, ...args]`, env `ELECTRON_RUN_AS_NODE=1`/`NODE_NO_WARNINGS=1`, `shell:false` — the app's own binary is the Node runtime, no install needed; missing script → `error` event), `openRawLink` + editor target, `notify`, file dialogs, `readFile`/`writeFile`, `getJobs`; busy-owner job retention — a busy board's jobs survive port disposal, reaped on final teardown; **per-sink reaping** — `disposeBoardPort(boardId)` reaps only that frame's sink, the whole owner (`model.id`) is reaped only from `BoardEditorModel.dispose()`, so closing a secondary frame never tree-kills the main frame's processes; `disposeAllBoardPorts` on quit) | `/src/main/board-bridge.ts` |
| Board bridge channels + wire types (`MessagePort` message unions board↔main + the renderer-broker handshake IPC; host-frame `BoardToHostMsg` incl. `board:log`, `board:setState`/`board:mergeState`/`board:stateInit`, `board:setSecondaryViews`, `board:setStatusText`, and the `state:sync` host→board push; shared by board-shim + main + renderer) | `/src/ipc/board-bridge-channels.ts` |
| Board automation adapter (`IBrowserTarget` for `browser_*`; **frames-as-tabs** — each board frame (main + each secondary view) is a tab enumerated by `tabs`, `switchTab` opens+activates the sidebar panel so the frame mounts; CDP targets the board **frame** of the host webContents via `cdp-service` `registerBoardFrame`/`unregisterBoardFrame` keyed `${model.id}/${tab}` — not a separate webContents; the frame is resolved by the iframe's `?v=<boardId>` nonce, disambiguating multiple tabs of the same board and the lingering pre-reload frame after a remount) | `/src/renderer/editors/board/BoardTargetModel.ts` |
| Published-boards catalog service (main; mirrors `version-service` — `net.fetch` the raw `boards-manifest.json`, 24h `electronStore` gate + `force`, cached last-good catalog for offline, `ePublishedBoardsUpdated` broadcast; `getBoardVersions(id)` on-demand `versions-manifest.json` fetch; `isSafeBoardId` charset guard drops traversal/separator ids before they reach the install engine; `PERSEPHONE_BOARDS_BRANCH` dev source override) | `/src/main/published-boards-service.ts` |
| Board download service (main; streamed `net.fetch` → temp file + incremental sha256, throttled `eBoardInstallProgress`, digest check) | `/src/main/board-download-service.ts` |
| Version utils (shared; `parseVersion`/`compareVersions` — extracted so the renderer catalog model can compare without pulling main-only imports. `compareVersions(current, latest)` returns 1 when the **second** arg is newer) | `/src/shared/version-utils.ts` |
| Published-boards renderer model (reactive `TGlobalState` catalog; `useCatalog`/`useCatalogBoardsForFile`, `isCompatible(minAppVersion)`, `getVersions`, silent `updatesAvailable` derivation, `refresh(force)`) | `/src/renderer/api/published-boards.ts` |
| Board install engine (`downloadBoard` — download→extract→validate→registry, `assertContained` traversal guard; `updateBoard`/`installVersion` — temp-extract + folder swap with a `preSwap` re-check so a failed download never destroys a working board; `uninstallCatalogBoard`) | `/src/renderer/api/board-install.ts` |
| Board install registry (`installedBoards.json`; reactive `record`/`remove`/`getByRoot`/`getById`/`useInstalled`; one entry per catalog id; stale-entry reconciliation when a root's manifest is gone) | `/src/renderer/api/board-install-registry.ts` |
| Board update detection + safe re-install (`getBoardUpdate`/`useBoardUpdates`/`listBoardUpdates`; `runBoardUpdate`/`runBoardVersionInstall` share the idle precondition + progress + toasts; `ensureBoardIdle` — close-pages/busy guard before a swap) | `/src/renderer/api/board-updates.ts` |
| Board Info editor (install + properties over one host-capable holder that adopts/yields `CONTENT_HOST_TRAIT` without rendering, so `Text ↔ + ↔ board` switches transfer the host losslessly; **install mode** — Download → Register two-step with byte progress; **properties mode** — info + on-demand versions list install/rollback + Uninstall/Unregister + Open board; editor id `board-info`, state type `boardInfoPage`. `openBoardInfo(page,opts)` replaces a page's editor; `openBoardInfoPage(opts)` opens a new page; id in `board-info-id.ts`) | `/src/renderer/editors/board-info/` |
| Tools & Editors hub page (full-page counterpart to the sidebar panel; singleton via a fixed `PageModel` id `TOOLS_HUB_PAGE_ID` + `addPage` dedup — NOT well-known-pages; `HubTab = builtin\|boards\|search\|tools`; Built-in / Registered boards / Search boards / Tools tabs + right Pinned rail; editor id `tools-hub-view`, state type `toolsHubPage`; opened via `pages.showToolsHubPage({tab})`) | `/src/renderer/editors/tools-hub/` |
| Tools & Editors sidebar panel (thin composition — pinned rail + Built-in Editors / Boards / Tools tabs; "Open in new tab" header button → `showToolsHubPage`) | `/src/renderer/ui/sidebar/ToolsEditorsPanel.tsx` |
| Pinned rail (extracted from the panel; `layout="horizontal"\|"vertical"`, shared `RowStyled`; drives both the sidebar panel and the hub page) | `/src/renderer/ui/sidebar/PinnedRail.tsx` |
| Built-in editors list (extracted from the panel; the creatable-items list with pin/open — shared by panel + hub) | `/src/renderer/ui/sidebar/BuiltinEditorsList.tsx` |
| Published-catalog search tab (hub "Search boards" — filter over the cached catalog grouped by usage; per-board card with Install / Update / Properties → Board Info page; Refresh) | `/src/renderer/editors/tools-hub/SearchBoardsTab.tsx` |
| Creatable-items registry (`CreatableItem` list shared by the Tools & Editors panel and the `+` new-page dropdown; `DEFAULT_PINNED_EDITORS`) | `/src/renderer/ui/sidebar/tools-editors-registry.ts` |
| Trusted-boards sidebar tab (all trusted boards across roots via `BoardsTree` multi-root; open / pin (standalone-gated via `useBoardStandalone`) / Remove ≡ untrust; "Update available" badge + context-menu Update for catalog-installed boards) | `/src/renderer/ui/sidebar/TrustedBoardsList.tsx` |
| Human-readable byte size (`formatBytes`) | `/src/renderer/core/utils/format-bytes.ts` |
| Unified pin model (`PinnedRef` over `pinned-editors`; editors + `board:<root>`) | `/src/renderer/ui/sidebar/pinned-items.ts` |
| Board authoring guide (bridge surface, reload, MCP debugging, --p-* contract) | `/assets/board-template/CLAUDE.md` |
| Agent-facing boards guide (`read_guide("boards")`) | `/assets/mcp-res-boards.md` |
| Recommended-components catalog (manifest + 10 skins) | `/boards-assets/` |
| Toolset manifest module (`tools-manifest.json` read/validate/write; `isToolsetFolder`; `defaultToolsManifest`) | `/src/renderer/api/tools/tools-manifest.ts` |
| Toolset trust/registry (`toolsTrust`; `trustedTools.txt`; exact-path match; registration ≡ trust; NOT on `app`/scripts) | `/src/renderer/api/tools/tools-trust.ts` |
| Registered-toolsets model (enumerate roots → manifests → flat tool list `<toolset>/<tool>`; reactive; `refresh()`) | `/src/renderer/api/tools/registered-tools.ts` |
| Tool execution engine (`executeToolById` — cwd = toolset root, stdin-JSON args, `.env` env, `##PERSEPHONE_RESULT##` output contract, failure payload for self-repair) | `/src/renderer/api/tools/tool-executor.ts` |
| Toolset `.env` loader (`loadDotEnv` via Node `util.parseEnv`) | `/src/renderer/api/tools/dotenv.ts` |
| Per-toolset execution log (self-rotating; `TOOLS_EXECUTION_LOG_FILE`) | `/src/renderer/api/tools/tool-log.ts` |
| Toolset scaffold (`createToolset` — copy `tool-template`; trust-free; NOT on `app`/scripts) | `/src/renderer/api/tools/tool-scaffold.ts` |
| Agent Tools MCP handlers (`search_tools`/`execute_tool`/`refresh_toolset`/`create_toolset`) | `/src/renderer/api/mcp-handler.ts` |
| `persephone-toolset://` link scheme (encode/decode + `openToolset`; parsed in `parsers.ts` → `target: "toolset-view"`) | `/src/renderer/content/persephone-toolset-link.ts` |
| Per-toolset editor model (`toolset-view`; manifest info + tool list + open-log) | `/src/renderer/editors/toolset/ToolsetEditorModel.ts` |
| Shared registered-toolsets tree (`ToolsTree` + `buildToolsTree`) | `/src/renderer/editors/tools/ToolsTree.tsx` |
| Toolset registration dialog (`showRegisterToolsetDialog`; RCE gate, MCP-initiated only) | `/src/renderer/ui/dialogs/RegisterToolsetDialog.tsx` |
| Trusted-toolsets sidebar tab (all registered toolsets; open / Remove ≡ untrust) | `/src/renderer/ui/sidebar/TrustedToolsList.tsx` |
| Toolset authoring guide (manifest, stdin/stdout contract, `.env`, requirements) | `/assets/tool-template/CLAUDE.md` |
| Agent-facing tools guide (`read_guide("tools")`) | `/assets/mcp-res-tools.md` |
