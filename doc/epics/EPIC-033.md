# EPIC-033: Configurable Dashboards (`.persephone` projects)

## Status

**Status:** 🗣 In Discussion (design phase — no tasks planned yet)
**Created:** 2026-06-17

> This epic is in **discussion**. The design below is a working draft the user is reviewing and extending. **No tasks are carved and none should be** until the user moves it out of discussion. Treat everything here as proposal, not commitment.

## Overview

Introduce a **generic, configuration-driven Dashboard editor** to Persephone. A dashboard is described by a descriptor file and is **decoupled from Persephone entirely**: the rows are produced by an **external command** (any language — node, python, bash, pwsh) that writes a plain `rows.json` file; the dashboard watches that file and refreshes. Toolbar buttons, row context-menu items, and double-click each run a command too (or a small set of declarative native actions like "open this file").

The descriptors, scripts, and data files live in a **`.persephone/` project folder** placed inside any directory — analogous to `.vscode/` or `.git/`. Because scripts are ordinary external programs that just read files and write `rows.json`, **an agent (or developer) who knows nothing about Persephone can author and test them in a terminal.** The entire contract is two file formats (`dashboard-descriptor.json5`, `rows.json`) plus how a command is registered and run.

The differentiator is **agent-authorability over a tiny, decoupled, file-based contract.** The make-or-break is that contract and the command runner — not the grid (the grid reuses `AVGrid`).

## Goals

- A new **`dashboard`** editor type that renders a descriptor as a filterable/sortable grid (reusing `AVGrid`).
- A generic **command runner** — run an external process, capture stdout/stderr/exit code, **show an error notification on failure**. Reusable beyond dashboards.
- A **file-based data contract**: the load command writes `rows.json` (plain JSON array); Persephone watches it (single-file `FileWatcher`) and reloads the grid.
- A **descriptor schema** (JSON5, comments allowed) declaring: columns, the load command, and actions (toolbar / row context-menu / double-click) — each action either a **command** or a **declarative native action** (open/reveal).
- A **`.persephone/` project-folder convention** with **scaffolding commands**: *"Create Persephone project in this folder"* and *"Create Grid Dashboard"* generate the folder + **self-documenting JSON5 placeholders** whose comments are the inline spec.
- A **documented authoring guide** (human + agent/MCP) so a developer can say *"create a task dashboard for this repo"* and Claude writes plain scripts that produce `rows.json`.
- **Dogfood:** a reference dashboard rendering Persephone's own task board (`doc/active-work.md` + `doc/tasks/` + `doc/epics/`).

## v1 scope (as discussed — not final)

Deliberately minimal, to prove the full loop end-to-end:

- **Grid dashboard only.** Descriptor → AVGrid.
- **Data + side-effects from external commands.** The load command writes `rows.json`; the dashboard renders it. Actions run commands (any language) or declarative native actions.
- **Explicit Load/Refresh.** Pressing Load/Refresh runs the load command; nothing runs merely on opening the file.
- **Single-file watch only.** Persephone watches `rows.json` (the data output) and reloads on change — this catches both the load command's write and any external regeneration. **No watching of source trees, and no command auto-spawns** in v1.
- **Generic behavior.** Double-click runs a command or a declarative open — it is **not** hardcoded to open a document.
- **Error handling.** Non-zero exit / stderr surfaces as an `ui.notify(..., "error")` toast.
- **Cross-platform commands.** The descriptor names a full command + args + cwd; the script author picks the interpreter (Windows: PowerShell, Git Bash, `python`, `node`).
- **Scaffolding** for the `.persephone/` folder and a grid dashboard, with JSON5 self-documenting placeholders.

Likely **out of v1** (see Future Directions): file-watch / event *triggers* that auto-run commands, a script-trust gate, timeline & non-grid dashboard types, side panels, configurable tooltips, and streaming/long-running command progress UI.

## Design (working draft)

### Data flow

```
[user clicks Load/Refresh]
        │
        ▼
 command runner ── spawns ──▶  external script (python/node/bash/pwsh)
        │                              │ reads source files, fetches web, etc.
        │                              ▼
        │                       writes .persephone/.../rows.json   (plain JSON array)
        ▼                              │
 exit code 0?  ── no ──▶ ui.notify(stderr, "error")                │
        │ yes                                                       ▼
        └──────────────▶  FileWatcher(rows.json) fires ──▶ Dashboard reloads grid
```

The runner spawn and the grid reload are **decoupled** through `rows.json`: the command's only job is to write that file; the watcher does the reload. This is what lets the script be written and tested with zero Persephone knowledge.

### Descriptor (`dashboard-descriptor.json5` — JSON5, comments allowed)

```jsonc
{
  type: "dashboard",
  title: "Tasks",
  rows: "rows.json",                 // data file (relative to descriptor dir); Persephone watches it
  columns: [
    { key: "status",   name: "Status",   width: 110, filterType: "options" },
    { key: "title",    name: "Title" },
    { key: "priority", name: "Priority", dataType: "number" },
  ],
  // The load command writes `rows`. Command + args + cwd; any interpreter.
  load: { command: "python", args: ["scripts/load_tasks.py"], cwd: "." },
  // Double-click: a declarative NATIVE action that opens a row field as a file.
  doubleClick: { open: "{path}" },
  // Toolbar buttons + row context-menu items each run a command or a native action.
  toolbar:    [ { id: "new",  label: "New Task",  icon: "add", command: "python", args: ["scripts/new_task.py"] } ],
  rowActions: [ { id: "done", label: "Mark Done", command: "python", args: ["scripts/mark_done.py", "{path}"] } ],
}
```

- `rows.json` is **plain JSON** (machine-written by the script) — an array of row objects. Scaffolded placeholders are JSON5 with comments documenting the schema.
- **Action kinds:** a `command` action runs an external process (selection passed via argv `{field}` substitution and/or an env var carrying the selection JSON — to decide); a **native** action (`open`/`reveal`) is performed by Persephone declaratively from a row field (navigation can't be done by an external process). An action may run a command and then refresh.

### Command runner

A generic main-process service + IPC: `runCommand({ command, args, cwd, env }) → { stdout, stderr, exitCode }`, blueprinted on `mneme-service.ts` (spawn → pipe stdout/stderr → `error`/`close` → exit code). Renderer API wrapper + an error-toast helper. (Renderer-side `child_process` is possible since `customRequire` is unrestricted, but main+IPC is the consistent, safer home — open.) **Reusable beyond dashboards.**

### Security posture (v1)

Running external OS processes is powerful. v1 mitigations: **commands run only on explicit user action** (Load/Refresh, action click) — never on open; the only watch is on the **data file**, which never spawns anything. (Scripts can already spawn via `require("child_process")` today, so the incremental risk is bounded.) A **trust/consent gate** — especially for projects the user didn't author, and mandatory before any auto-run *triggers* — is deferred to Future Directions.

## Background — touchpoints to build on

Findings from codebase investigation (2026-06-17). Reuse these when the epic leaves discussion.

| # | Area | Where | Note |
|---|------|-------|------|
| 1 | Editor registry + routing | `src/renderer/editors/base/editorRegistry.ts`, `register-editors.ts`, `base/editor-matchers.ts` | Register `{ id:"dashboard", name:"Dashboard", hasContentHost:false, accepts, match, loadModule }`; add a matcher for `dashboard-descriptor.json5` / `*.dashboard.json5` (and `detectsContent` on `"type":"dashboard"`). |
| 2 | Descriptor-driven precedent | `src/renderer/editors/rest-client/`, `mcp-inspector/` | **Pattern B** (`hasContentHost:false`, MCP Inspector): own lifecycle, read the file in `restore()`, state in `this.state`. No `TextFileModel`. |
| 3 | Grid | `src/renderer/uikit/AVGrid/AVGrid.tsx`, `avGridTypes.ts` (`Column<R>`) | `columns`, `rows`, `getRowKey`, `onDoubleClick(row,col)`, `getContextMenuItems(selectedRows)`, `selected`/`setSelected`, `searchString`, `loading`. Filter/sort on by default. |
| 4 | **Command runner blueprint** | `src/main/mneme-service.ts` (also `snip-service.ts`) | No generic runner exists; every spawn is ad-hoc. `mneme-service` is the closest structural template: spawn, pipe stdout/stderr, `error`+`close` events, exit-code broadcast. Build the reusable runner on this. |
| 5 | Renderer node access | `src/renderer/scripting/ScriptContext.ts:39,137-166` (`customRequire`) | **Unrestricted** — a script can `require("child_process")` today. Bounds incremental risk; main+IPC runner still preferred. |
| 6 | **Single-file watch** | `src/renderer/core/utils/file-watcher.ts` (`FileWatcher`) | `new FileWatcher(rowsJsonPath, () => reload())` — watches one file, 300 ms debounce, `getTextContent()` to read. No changes needed. Example: `settings.ts:175`. |
| 7 | **Error toast** | `src/renderer/api/ui.ts:38` (`ui.notify(msg, type)`), `uikit/Notification/AlertsBar.tsx` | `ui.notify(stderr, "error")`. Caps at 3 toasts. |
| 8 | Toolbar + row menu | `base/PageToolbar.tsx`, `git-tree/GitTreeEditorView.tsx`; AVGrid `getContextMenuItems` | Toolbar children slot = descriptor buttons + Load/Refresh. Row menu built from descriptor `rowActions` with `selectedRows`. |
| 9 | Open / navigate | `src/shared/link-data.ts` (`createLinkData`), `api/events/AppEvents.ts` (`openRawLink`) | Backs the native `open` action: `app.events.openRawLink.sendAsync(createLinkData(path, { pageId }))`. Per project rule, **all navigation via `openRawLink`**. |
| 10 | Project config / trust | *(none exists)* | No `.persephone` / workspace-config concept and **no script-trust gate** anywhere. Descriptor self-contained; script paths resolve relative to the descriptor dir. v1's explicit-run posture avoids needing a gate. |
| 11 | JSON5 parsing | *(to add)* | Descriptor is JSON5 (comments). A JSON5 parser must be chosen. `rows.json` stays plain JSON. |
| 12 | Scaffolding entry points | folder context-menu + command surfaces *(to investigate)* | "Create Persephone project" / "Create Grid Dashboard" entry points to be located. |

## Open questions (for discussion)

- **Command runner location** — main+IPC (consistent, safer) vs renderer `child_process` (possible, simpler). Leaning main+IPC.
- **Passing selection to command actions** — argv `{field}` substitution, an env var with the selection JSON, or a temp file the script reads.
- **Native vs command actions** — external processes can't drive Persephone's UI, so navigation (double-click "open") is a **declarative native action** reading a row field; commands handle data + filesystem/external side effects. Confirm the split.
- **JSON5 vs JSON** — descriptor authored as JSON5 (comments = inline spec); `rows.json` plain JSON (machine-written). Scaffolded placeholders heavily commented. Which parser?
- **Row identity** — AVGrid needs `getRowKey`; require an `id` field in `rows.json` (or derive)?
- **Cross-platform "bash"** — Windows has no native bash; the descriptor names a full command so the author picks the interpreter (Git Bash / pwsh / python / node). Which shells do we document/recommend?
- **Trust/consent** — running commands from a project the user didn't author. Mitigated v1 by explicit-run; revisit for the future triggers work.

## Future Directions (NOT v1 — recorded so they're not lost)

- **Triggers** — file-watch is "just a configurable trigger that fires a script" (user, 2026-06-17). Generalize to a `triggers` descriptor section (watch source files / interval / on-open) → each runs the load (or another) command. **Requires the script-trust gate** before any auto-run.
- **More dashboard types** — timeline (events referencing documents, e.g. meeting transcripts) and other non-grid layouts; the command/action mechanism is designed once and reused.
- **Richer grid config** — per-row/per-value tooltips, status-column styling, grouping.
- **Side panels** — descriptor-driven secondary views alongside the grid.
- **Streaming / long-running commands** — progress UI and live output for slow load commands.
- **In-app JS option** — optionally allow a Persephone-native JS action (using `app`/`io`) in addition to external commands, for Persephone-specific automation. External commands remain the primary path.
- **Mid-run user interaction for running scripts (future, larger scope).** The *capability*, not any specific command set: today a command runs start-to-finish with no way to ask the user anything in the middle. But many real jobs need it — e.g. a toolbar action runs a python script that parses/downloads data and then must ask the user *which records to proceed with* or *whether to overwrite* before continuing. Because Persephone owns the spawned process's streams, it can mediate this: **the running script asks for user input and Persephone supplies it.**
  - **The need:** let a running external script request a UI interaction from Persephone (a choice, a confirmation, an input) and **pause for the answer**, then continue — over a channel Persephone controls.
  - **The command set is open / to be designed — NOT a copy of `interactive-script`.** We could define our own small, purpose-built vocabulary (e.g. "confirmation dialog", "select-option dialog", "text input", "progress", "open page"), or go further and **expose a broader slice of the Persephone API** to external scripts. Undecided.
  - **Inspiration only — the user's `interactive-script` VS Code extension** (`D:\projects\interactive-script\documentation\overview.md` + `api.md`) is an *example of the mechanism*, not a spec: a "magic line" on stdout (`[>-command-<]` + JSON) where plain stdout stays logs; request-response commands carry a GUID and the host writes the reply to the script's **stdin** keyed by that id; client libraries (JS/Python) hide it behind a `ui` object. Reference the approach, then design Persephone's own.
  - **Why Persephone fits well:** the *rendering* side largely exists — the scripting `ui` facade (`ui.notify`, dialogs), `AVGrid`, the alerts bar, and the MCP **`ui_push`** channel. The new work is mostly the **transport** (a channel between the running process and Persephone — stdio is the natural one since Persephone controls it: line-streaming stdout + writable stdin) + **client libraries** + the chosen command set mapped onto existing UI.
  - **Relationship to v1:** complementary, not a replacement. `rows.json` stays the dashboard's bulk-data contract (persisted, watched, cached); this is the *interaction* layer for running commands. **Forward-design constraint:** build the v1 command runner so it can later grow line-streaming stdout + writable stdin **without a rewrite**.
  - **Security:** interactive commands can prompt / open pages — still gated by the explicit-run posture, and folded into the future trust gate.

## Notes

### 2026-06-17 — epic created, refined to a file-based design, then set to In Discussion
- Created from the user's idea for a configurable, agent-authorable dashboard inside a `.persephone/` project folder. Generic by design — items are whatever the load command produces.
- **Architecture (user-driven):** dashboards run **external commands in any language** that write a plain **`rows.json`**; Persephone **watches that file** and reloads. Rationale: an agent/developer who knows nothing about Persephone can author and test the scripts standalone. The contract is two file formats + command registration. A generic **command runner** (with error notifications) is the foundational piece. An earlier in-app-JS / injected-`dashboard`-API idea is demoted to a Future Direction.
- **Scaffolding (user):** "Create Persephone project in this folder" + "Create Grid Dashboard" commands generate the `.persephone/` structure and **JSON5 self-documenting placeholders** (comments carry the spec).
- File-watch reframed: v1 watches the single **data** file (safe); watching **source** files to auto-run a command is the future `triggers` concept and needs a trust gate.
- Investigation (Explore ×2) mapped the touchpoints (table above) and confirmed **no** generic command runner (blueprint: `mneme-service.ts`), **unrestricted** `customRequire`, single-file `FileWatcher`, `ui.notify` toasts, and **no** project-config or script-trust infrastructure.
- **Set to In Discussion (per user):** no tasks are planned. The user will review and bring more ideas before any tasks are carved.
