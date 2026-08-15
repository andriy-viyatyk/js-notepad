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

**Rust implementations (`mneme/`, `launcher/`, `snip-tool/`) — `/review` & `/userdoc` do not apply.** There are no Rust review rules, so **skip `/review`**; these are standalone binaries (built in CI, shipped beside `persephone.exe`), not user-facing UI, so **skip `/userdoc`**. Verify the build (`cargo build --release`) and tests (`cargo test`) instead. Run **`/document` only** if a developer doc needs a pointer to new top-level structure (e.g. `folder-structure.md`, the [key-files index](doc/architecture/key-files.md)) — the Rust crate's own `README.md` is its primary documentation.

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
| Address a UI element / add `data-name` | [/doc/architecture/ui-element-contract.md](doc/architecture/ui-element-contract.md) |
| Add sidebar panels            | [/doc/architecture/secondary-views.md](doc/architecture/secondary-views.md) |
| Work with scripting system    | [/doc/architecture/scripting.md](doc/architecture/scripting.md) |
| Check coding style            | [/doc/standards/coding-style.md](doc/standards/coding-style.md) |
| See active/planned work       | [/doc/active-work.md](doc/active-work.md) |
| Find the file that owns a behavior | [/doc/architecture/key-files.md](doc/architecture/key-files.md) |
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
/boards-assets       # Recommended-components catalog for Boards (manifest + 11 components, 10 skins)
/assets              # Static assets (board-template/, demo-board/, agent/, mcp-res-*.md, editor-types/, …)
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
- **No hand-rolled error stringification** - A caught value is `unknown`; use `errMessage(e, fallback?)` from `/src/shared/utils.ts` instead of `e instanceof Error ? e.message : String(e)` or the unsafe `(e as Error).message`. When the whole catch is "toast it and carry on", use `guard(label, fn)` from `/src/renderer/core/utils/guard.ts`.
- **No direct `require("fs")`** - Use `app.fs` (`/src/renderer/api/fs.ts`) for file operations. Only `fs.ts` and a few documented exceptions may use `fs` directly (see `coding-style.md`).

See [/doc/standards/coding-style.md](doc/standards/coding-style.md) for complete standards.

## Key Files

**Full index: [/doc/architecture/key-files.md](doc/architecture/key-files.md)** — a purpose→path
lookup for every subsystem (editors, boards, content pipes, git, Tor, Mneme, toolsets, MCP, …),
including the reasoning behind each design. Read it when you need to find the owner of a
behavior or recall why something works the way it does.

Below is only the short list you need on almost any task.

| Purpose                     | File                                              |
|-----------------------------|---------------------------------------------------|
| Shared types (IEditorState) | `/src/shared/types.ts`                            |
| App object model            | `/src/renderer/api/app.ts`                        |
| Page/tab management         | `/src/renderer/api/pages/PagesModel.ts`           |
| Page container (tab)        | `/src/renderer/api/pages/PageModel.ts`            |
| Editor base class           | `/src/renderer/editors/base/EditorModel.ts`       |
| Editor registry             | `/src/renderer/editors/base/editorRegistry.ts`    |
| File→editor matchers        | `/src/renderer/editors/base/editor-matchers.ts`   |
| File operations             | `/src/renderer/api/fs.ts`                         |
| Path utilities              | `/src/renderer/core/utils/file-path.ts`           |
| State primitives            | `/src/renderer/core/state/`                       |
| Event channel system        | `/src/renderer/api/events/EventChannel.ts`        |
| UIKit library               | `/src/renderer/uikit/`                            |
| UIKit authoring rules       | `/src/renderer/uikit/CLAUDE.md`                   |
| Color tokens                | `/src/renderer/theme/color.ts`                    |

### Keeping the index current

When `/document` runs, new or changed key files go in
[key-files.md](doc/architecture/key-files.md) — **not** in the short list above. Add a row here
only when a file is genuinely needed on most tasks; the whole point of the split is that this
file stays small enough to load every session.
