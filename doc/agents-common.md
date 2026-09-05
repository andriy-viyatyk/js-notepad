# Persephone Project Guidelines

> **Shared instructions for all coding agents.** Claude Code imports this via `@doc/agents-common.md`
> in [CLAUDE.md](../CLAUDE.md); Codex is directed here by [AGENTS.md](../AGENTS.md). Agent-specific
> rules live in those two files.

## Quick Start

1. **Read this file completely**
2. **New features:** read [architecture/overview.md](architecture/overview.md)
3. **Active work:** review [active-work.md](active-work.md)
4. **Standards:** follow [standards/coding-style.md](standards/coding-style.md)

## Task Workflow (IMPORTANT)

### Finding work

On "let's work on tasks": read [active-work.md](active-work.md) (Active/Planned); if empty, ask
the user. Before starting, ask: "The next task is '[Task Title]'. Proceed, or pick a different one?"
and wait for confirmation.

### Auto-task creation

Work given without a defined task:
- **Small** (single fix): no task document; add an entry to **Active** in
  [active-work.md](active-work.md) with a generated US-XXX ID.
- **Large** (multiple files): create a task folder with README.md and a linked **Active** entry:
  `- [ ] [US-XXX: Title](tasks/US-XXX-short-name/README.md)`.
- Relates to an active epic → list it under that epic.
- Before committing, make sure a dashboard entry exists.

### Dashboard rules (STRICT)

Keep [active-work.md](active-work.md) current at every stage:
- **Task document created:** add a linked entry — `- [ ] [US-XXX: Title](tasks/US-XXX-short-name/README.md)` —
  under **Active** (starting now) or **Planned** (queued). Both sections may hold documented tasks.
- **Work starts on a Planned task:** move it to Active.
- **Task completed:** mark `[x]` and follow completion rules (standalone → completed.md; epic task → stays until epic completes).

### Creating a new task ("Let's create a task for ...")

Produce a thorough task document **before** any implementation — the codebase is too large to hold in
context, and a detailed plan survives context compaction.

1. Create `doc/tasks/US-XXX-short-name/README.md`
2. **Deep investigation** — read all relevant source: renderers, models, script API wrappers, MCP
   handlers, type definitions, tests.
3. Write the document with sections: **Goal** (1-2 sentences), **Background** (existing code and
   patterns to follow), **Implementation plan** (step-by-step checklist with file paths, detailed
   enough to implement without re-reading the codebase), **Concerns / Open questions**,
   **Acceptance criteria**.
4. Add (or move) the dashboard entry under the relevant epic or "no epic", Active or Planned; the
   entry MUST link to the document; remove any old entry elsewhere.
5. Link to the epic if applicable (update the epic's task table).
6. Present the document to the user; highlight concerns.
7. **Wait for user review — do NOT implement** until the user says "let's implement".

Do not rush investigation; a missed pattern here means rework later.

### During implementation

- Update the task progress checklist
- Ask when uncertain
- Do NOT commit automatically — wait for the user to request commits

### Commit messages — co-author attribution

Every commit must attribute **every** agent that produced any part of the work (authoring,
investigation, review) — the committing agent is often not the authoring one, so attribution is the
committer's job. Trailers, exact casing:

- Claude → `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Codex → `Co-authored-by: Codex <noreply@openai.com>`

A delegated task normally earns both, including when Codex only wrote the task document.

### Completing a task (user-initiated)

**Do NOT run completion steps automatically after implementation** — the user tests manually first
and may need more changes. Proceed only when the user says "let's complete the task" (or similar).

> Canonical `/review`, `/document`, `/userdoc` skill definitions live in
> [`.agents/skills/`](../.agents/skills/). Codex discovers them natively and spawns one sub-agent
> per skill per [AGENTS.md](../AGENTS.md); Claude Code runs them as slash commands via thin
> wrappers in `.claude/skills/`.

**Rust implementations (`mneme/`, `launcher/`, `snip-tool/`):** skip `/review` (no Rust rules) and
`/userdoc` (standalone binaries, not user-facing UI); verify `cargo build --release` and
`cargo test` instead. Run `/document` only if a developer doc needs a pointer to new top-level
structure — the crate's own `README.md` is its primary documentation.

#### Standalone tasks (no epic)

1. Verify acceptance criteria
2. Run `/review` — validate against architecture docs
3. Run `/document` — update developer docs in `/doc/`
4. Run `/userdoc` — update user docs in `/docs/`
5. Update dashboard: mark `[x]`, move to [tasks/completed.md](tasks/completed.md), remove from dashboard
6. Task folder cleanup (if any): **ask user before deleting**

Steps 2-4 are mandatory unless the user explicitly says to skip.

#### Epic tasks — deferred review model

`/review`, `/document`, `/userdoc` are scoped to the **epic**, not individual tasks (avoids
re-reviewing the same code).

- **Task within an epic completed:** verify acceptance criteria; keep it `[ ]` on the dashboard;
  do NOT run the skills unless the user asks.
- **User requests review mid-epic** ("review done tasks"): run the three skills over all
  implemented-but-unreviewed tasks, then mark them `[x]`.
- **Completing the epic:** run the skills for any unreviewed tasks first and mark `[x]`; move the
  entire epic block to [epics/completed.md](epics/completed.md) and remove from dashboard;
  ask before deleting task folders.

**Summary:** `[ ]` = implemented but unreviewed; `[x]` = reviewed. Review is mandatory before an
epic closes.

## Documentation Map

| Need to...                    | Read...                                                |
|-------------------------------|--------------------------------------------------------|
| Understand architecture       | [architecture/overview.md](architecture/overview.md) |
| Learn folder structure        | [architecture/folder-structure.md](architecture/folder-structure.md) |
| Add a new editor              | [standards/editor-guide.md](standards/editor-guide.md) |
| Modify the browser editor     | [architecture/browser-editor.md](architecture/browser-editor.md) |
| Add a UI component            | [standards/component-guide.md](standards/component-guide.md) — see also [`src/renderer/uikit/CLAUDE.md`](../src/renderer/uikit/CLAUDE.md) |
| UIKit vs components/ split    | [standards/uikit-vs-components-split.md](standards/uikit-vs-components-split.md) |
| Work with context menus       | [architecture/context-menu.md](architecture/context-menu.md) |
| Work with drag-and-drop       | [architecture/trait-system.md](architecture/trait-system.md) |
| Build complex components      | [standards/model-view-pattern.md](standards/model-view-pattern.md) |
| Understand state management   | [architecture/state-management.md](architecture/state-management.md) |
| Work with pages/tabs          | [architecture/pages-architecture.md](architecture/pages-architecture.md) |
| Address a UI element / add `data-name` | [architecture/ui-element-contract.md](architecture/ui-element-contract.md) |
| Add sidebar panels            | [architecture/secondary-views.md](architecture/secondary-views.md) |
| Work with scripting system    | [architecture/scripting.md](architecture/scripting.md) |
| Check coding style            | [standards/coding-style.md](standards/coding-style.md) |
| Styling / inline-style inventory | [architecture/styling-inventory.md](architecture/styling-inventory.md) |
| See active/planned work       | [active-work.md](active-work.md) |
| Find the file that owns a behavior | [architecture/key-files.md](architecture/key-files.md) |
| See future ideas              | [tasks/backlog.md](tasks/backlog.md) |
| Publish a new build           | [standards/release-process.md](standards/release-process.md) |
| Test MCP documentation        | [qa/README.md](../qa/README.md) (including [surface QA](../qa/surfaces/README.md)) |
| User documentation            | [docs/index.md](../docs/index.md) |

## Project Overview

Persephone (formerly js-notepad) is a Windows Notepad replacement for developers: Electron + Monaco
Editor, extending classic notepad with code editing and a JavaScript/TypeScript execution environment.

**Design philosophy:** core stays fast and lightweight; editors load on demand via async imports;
developer-focused data tooling; the app is a container — users bring integrations via Node.js/npm.

**Key features:** Monaco editor (IntelliSense, multi-cursor, compare), script executor (`page`
object transforms content), grid editors (JSON/CSV with sorting/filtering/Excel paste), markdown
preview, REST client (`.rest.json` collections).

## Tech Stack

- **Runtime:** Electron 43 — [Castlabs ECS](https://github.com/castlabs/electron-releases) fork with Widevine DRM (nodeIntegration: true, contextIsolation: false)
- **Frontend:** framework-free `VanillaView` classes; React 19 only in the Excalidraw island `editors/draw/**`
- **Editor:** Monaco
- **State:** custom reactive primitives (TOneState, TGlobalState, TComponentState, TModel)
- **Build:** Vite 8 (rolldown) — `scripts/dev.mjs` (dev + HMR), `scripts/build-prod.mjs`, electron-builder
- **Styling:** static/co-located CSS; no Emotion; editor-local CSS for generated content and third-party hosts

## Commands

```bash
npm start           # Development mode (Vite dev server + HMR)
npm run dist        # Build NSIS installer + ZIP
npm run dist:publish # Build and publish to GitHub Releases (draft)
npm run lint        # ESLint
```

## Folder Structure (Summary)

```
/src
  /main              # Electron main process
  /renderer          # VanillaView frontend; React confined to editors/draw/**
    /api             # Object Model — app.settings, app.pages, app.fs, app.proc, etc.
    /ui              # Application shell — MainPage, tabs, sidebar, dialogs
    /editors         # ALL editors (text, grid, markdown, compare, notebook, board, …)
    /content         # Content delivery — providers, transformers, pipes
    /scripting       # Script execution, wrappers, editor facades, worker
    /automation      # Browser automation — Playwright-compatible MCP tools, CDP, snapshots
    /uikit           # Standalone component library (canonical home for reusable primitives)
    /components      # Persephone-coupled views/models (icons, page-manager, file-search, tree-provider, file lists, git-tree)
    /core            # State primitives, utilities
    /theme           # Styling
  /ipc               # Inter-process communication
/boards-assets       # Recommended-components catalog for Boards (manifest + 11 components, 10 skins)
/assets              # Static assets (board-template/, demo-board/, agent/, mcp-res-*.md, editor-types/, …)
/doc                 # Developer documentation
  /epics             # Epic tracking
/docs                # User documentation
/.agents
  /skills            # Canonical shared skills: review, document, userdoc (native Codex skills)
/.claude
  /skills            # Claude-only skills (codex-dev, mcp-test-agent, …) + thin pointer wrappers
                     # for the three shared skills above
```

New reusable UI primitives go in `uikit/`; the four `components/` folders are persephone-coupled and
never receive new pure primitives — see
[standards/uikit-vs-components-split.md](standards/uikit-vs-components-split.md) and
[`src/renderer/uikit/CLAUDE.md`](../src/renderer/uikit/CLAUDE.md).
Full details: [architecture/folder-structure.md](architecture/folder-structure.md).

## Critical Patterns

### 1. Dynamic Imports for Editors
Always `import()` editor code (keeps code splitting):
```typescript
// Good
const { ArchiveEditorView } = await import("../archive/ArchiveEditorView");
// Bad — increases bundle size
import { ArchiveEditorView } from "../archive/ArchiveEditorView";
```

### 2. Script Context (`page`, `app`, `io`, `ai`)
```javascript
const data = JSON.parse(page.content);
const output = page.grouped;
output.content = JSON.stringify(result);
await output.editorSwitches.switchTo("grid-json");

// Typed editor access via facades
if (output.editor.id === "grid-json") {
    output.editor.addRows(5);
}

// Content pipe API — providers, transformers, events
const pipe = io.createPipe(new io.HttpProvider(url, { headers }));
const text = await pipe.readText();
await app.events.openRawLink.sendAsync(io.createLinkData(url));
```

### 3. Grouped Pages
Two tabs can be grouped side-by-side; accessing `page.grouped` auto-creates the grouped page;
script output goes to it.

### 4. State Management
Object Model APIs in `/src/renderer/api/`; state primitives in `/src/renderer/core/state/`;
see [state-management.md](architecture/state-management.md).

### 5. Content Delivery Pipeline
3-layer pipeline in `/src/renderer/content/`; one `ILinkData` object is enriched by each layer:
- **Layer 1 (Parsers):** reads `data.href`, sets `data.url` (`openRawLink` → `openLink`)
- **Layer 2 (Resolvers):** sets `data.pipe` (temporal) + `data.pipeDescriptor` (persisted) + `data.target` (`openLink` → `openContent`)
- **Layer 3 (Open Handler):** consumes `data.pipe`, `cleanForStorage(data)` builds `sourceLink`, creates/navigates page

Content pipes (`IContentPipe`) compose a provider (data source) with transformers (data effects):
```typescript
const pipe = createPipe(new FileProvider(filePath), new ArchiveTransformer(entry));
const text = await pipe.readText();  // FileProvider → ArchiveTransformer → decode
```
TextFileIOModel uses dual pipes: primary (source file) + cache (auto-save). Pipe state persists in
`IEditorState.pipe` (`IPipeDescriptor`) for restore across restarts.

### 6. Event Channels
`EventChannel.send()` is synchronous, freezes the event, and calls subscribers FIFO. Its
`sendAsync()` pipeline awaits subscribers newest-first, letting late subscribers (e.g. the open
handler) intercept before earlier ones; it stops when the event is marked handled.

### 7. React-root measurement and conversion debugging
`editors/draw/react-island.ts` owns the only React-root adapter; `mountReactHandle` marks its host
with `data-react-root` — the authoritative marker for a live React root (`fillSlot` is native,
creates none). Check visibility (`offsetParent`) separately from `textContent`, which includes
hidden subtrees. If a converted dynamic import reports `Failed to fetch dynamically imported module`
after a `.tsx` → `.ts` rename, touch the importer to invalidate Vite's stale specifier resolution —
a renderer reload alone does not clear it.

## Coding Standards (Quick Reference)

- **TypeScript** for all new code
- **Static/co-located CSS** for native views; editor-owned generated-content and integration styling in scoped local CSS
- **React hooks only inside `editors/draw/**`**; `VanillaView` classes everywhere else
- **Direct imports** over barrel imports (avoids circular deps)
- **Meaningful names** — descriptive, no abbreviations
- **No hardcoded colors** — only `import color from "../../theme/color"`; never hex, `rgb()`/`rgba()`, or named colors. Missing color → add to `color.ts` and all themes in `/src/renderer/theme/themes/`.
- **No direct `require("path")`** — use `file-path` (`/src/renderer/core/utils/file-path.ts`); only `file-path.ts` itself imports `path`.
- **No hand-rolled error stringification** — a caught value is `unknown`; use `errMessage(e, fallback?)` from `/src/shared/utils.ts`, never `e instanceof Error ? e.message : String(e)` or `(e as Error).message`. If the whole catch is "toast and carry on", use `guard(label, fn)` from `/src/renderer/core/utils/guard.ts`.
- **No direct `require("fs")`** — use `app.fs` (`/src/renderer/api/fs.ts`); only `fs.ts` and documented exceptions (see `coding-style.md`).

Complete standards: [standards/coding-style.md](standards/coding-style.md).

## Key Files

**Full index: [architecture/key-files.md](architecture/key-files.md)** — purpose→path lookup
for every subsystem, including design reasoning. Below is only the short list needed on almost any task.

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

When `/document` runs, new/changed key files go in [key-files.md](architecture/key-files.md) —
**not** the short list above. Add a row here only when a file is needed on most tasks; this file
must stay small enough to load every session.
