# EPIC-033: Configurable Dashboards (`.persephone` projects)

## Status

**Status:** 🧊 Frozen / superseded by [EPIC-034](EPIC-034.md) (2026-06-18)
**Created:** 2026-06-17

> **Frozen pending EPIC-034.** Its project / editor / trust / scaffolding infrastructure has been absorbed into [EPIC-034](EPIC-034.md) (Web Board), and a skinned Tabulator grid inside a Web Board reproduces the grid-dashboard behavior. **After EPIC-034 is implemented, this epic will be either deprecated (deleted) or fully rewritten** around whatever unique value remains (e.g. the zero-UI-code, config-driven grid path). The original design below is unchanged, kept for reference.

## Tasks

Placeholder breakdown (dependency-ordered, foundations first). **No details yet** — each task is investigated and written up (Goal → Background → Implementation Plan → Concerns → Acceptance) before implementation, per the task workflow.

| Task | Title |
|------|-------|
| US-699 | Generic command runner (main-process spawn service + IPC + renderer API + error-toast helper) |
| US-700 | `TDiskState` — reusable folder-backed, schema-validated, disposable disk-synced state primitive (atomic writes) |
| US-701 | Per-page loading indicator primitive (badge + circular progress + label; ~300 ms delay; transparent-overlay page lock) |
| US-702 | Project trust gate (per `.persephone`; `trustedProjects.txt`; untrusted UX + Trust confirmation) |
| US-703 | PersephoneDashboard editor + `.persephone` folder-click routing (sidebar list/switcher + main management view: create/delete) |
| US-704 | GridDashboard renderer — `AVGrid` bound to synced state (rows / columns / toolbar / rowActions) |
| US-705 | `config.json` — load + watch/recreate (`key` = mtime); `commands` globs; `events` |
| US-706 | Action execution — external scripts via command runner; action-reference shape (`sync`/`async`, `name`); `activeRow`/`selection` flush-before-spawn |
| US-707 | `.persy` in-app runtime — full `app`/`page`/`io`/`ai`/`ui` context + injected live `state` (`TDiskState`); TS association + `state` typings |
| US-708 | `onLoad` event — trust-gated auto-run on open |
| US-709 | Templates & scaffolding — `assets/.persephone/grid-dashboard-template/` + `library-service` copy with name substitution + per-dashboard `CLAUDE.md` |
| US-710 | Error logging — per-dashboard `ui.log` + clickable on-dashboard error indicator |
| US-711 | Dogfood reference dashboard — Persephone's own task board (`doc/active-work.md` + `doc/tasks/` + `doc/epics/`) |

## Overview

Introduce a **generic, configuration-driven Dashboard editor** to Persephone. Each dashboard is a **self-contained folder** under a project's `.persephone/` directory, holding its config, its authoring instructions (a per-dashboard `CLAUDE.md`), its scripts, and a **file-backed mirror of the dashboard's UI state**. The grid's rows/columns/toolbar live in that state folder and are **two-way synced** with the running React component: a script writes the state files and the UI updates live; the user changes the UI and it persists back to disk.

Actions (toolbar buttons, row clicks, context menu) run scripts of two kinds:
- **External scripts** (`node` / `python` / `bash` / `pwsh`) — ordinary programs that read/write the dashboard's state files. An agent or developer who knows nothing about Persephone can author and test them in a terminal.
- **`.persy` in-app scripts** — Persephone-native scripts that run **inside** the app with **full access to its API** (dialogs, navigation, `app`/`page`/`io`/`ui`) plus an injected live `state`. These handle actions that need user interaction mid-run — cleanly sidestepping any stdin/stdout interaction protocol.

The differentiator is **agent-authorability over a self-documenting folder contract** (config + `CLAUDE.md` + scripts + synced state). The grid itself reuses `AVGrid`.

## Goals

- A new **`dashboard`** editor type whose entire UI state (`{ rows, columns, toolbar, … }`) is a **two-way file-synced mirror** of the dashboard's `state/` folder; the grid reuses `AVGrid`.
- A **per-dashboard folder** convention: `.persephone/boards/<Dashboard Name>/` containing `config.json`, `CLAUDE.md`, `scripts/`, `state/`.
- A generic **command runner** (main process) — run an external script, capture stdout/stderr/exit code, **show an error notification on failure**. Reusable beyond dashboards.
- A reusable **per-page loading indicator** (badge + circular progress + label, slides from the top, optional transparent-overlay page lock, ~300 ms show-delay) shown while a script runs — a general primitive reusable beyond dashboards.
- **`.persy` in-app scripts** — run a Persephone-native script (TypeScript) with full API access **and an injected live `state`** for actions needing user interaction (no stdio protocol).
- A reusable **disk-backed state primitive** (`TDiskState` / `useOnDiskState`) built on `TOneState` (already zustand-backed) — model-layer / React-independent, **folder-backed**, **schema-validated**, **disposable** — that concentrates all two-way file↔state sync logic in one place.
- A **per-dashboard `CLAUDE.md`** so an agent can read the folder and author/configure scripts for that dashboard type without prior Persephone knowledge.
- A **PersephoneDashboard editor** opened on `.persephone` folder click (like `.git`/`.mneme`) — sidebar dashboard list/switcher + a main view that lists and manages (create/delete) dashboards.
- **Scaffolding** that copies a **bundled template** from `assets/.persephone/<type>-template/` (config + per-dashboard `CLAUDE.md` + sample scripts + seed state) into the project — following the existing `assets/script-library` approach.
- A **VS Code-style project-trust gate** (*"Do you trust this project?"*, per `.persephone` project) gating script execution — which makes the auto-run `onLoad` event safe.
- **Dogfood:** a reference dashboard rendering Persephone's own task board (`doc/active-work.md` + `doc/tasks/` + `doc/epics/`).

## Scope (finalized)

The agreed scope — enough to prove the full loop end-to-end:

- **Grid dashboard only** (`dashboardType: "grid-dashboard"`).
- **Per-dashboard folder** + **two-way state sync** between `state/` and the React component (sync nuances handled in the `TDiskState` task — see Decisions).
- **Actions run scripts:** external scripts via the command runner, or `.persy` in-app scripts. Surfaces in scope: **toolbar buttons, row `onClick`, `onDoubleClick`, and the row context-menu**.
- **Refresh + `onLoad`.** A toolbar action (e.g. `refresh.py`) re-runs the data-producing script; the **`onLoad`** event auto-runs its script on open **when the project is trusted**.
- **Error handling.** A failed external script (non-zero exit / stderr) surfaces as a `ui.notify(..., "error")` toast.
- **Trust gate (per `.persephone` project).** Untrusted → dashboards show *"Dashboards are not supported in untrusted projects"* + a **"Trust project"** button (confirmation dialog); trusted → dashboards render and scripts run.
- **Cross-platform scripts.** `config.json.commands` names the full command per script type; the author/Claude picks the interpreter (Windows: PowerShell, Git Bash, `python`, `node`).
- **Scaffolding** by copying a bundled template (`assets/.persephone/<type>-template/`) — including the self-documenting per-dashboard `CLAUDE.md` and a simple working example.

**Out of scope** (future extensions — see Future Directions): timeline & non-grid dashboard types, side panels, configurable tooltips, more event/trigger types (`onFolderWatch`, interval/timer, …), and `.svg`/`.ico` icon-file references.

## Design (working draft)

### Per-dashboard folder

```
.persephone/
  boards/
    Task List/                 ← folder name = board display name
      config.json              ← loaded once at init: { dashboardType, commands, events }
      CLAUDE.md                ← per-dashboard authoring guide for the agent
      ui.log                   ← error log (script / validation / action errors) — for Claude to review
      scripts/                 ← action scripts
        refresh.py             ←   external (any language)
        new_task.py
        markDone.persy         ←   in-app Persephone script (TypeScript; full API + state)
      state/                   ← two-way synced mirror; ONE FILE PER top-level property
        rows.json              ←   grid rows
        columns.json           ←   column defs
        toolbar.json           ←   toolbar items
        rowActions.json        ←   row onClick / onDoubleClick / context-menu actions
        selection.json         ←   selected row key(s) — scripts read this
        activeRow.json         ←   active (clicked) row key — flushed before onClick runs
        ...                    ←   (each first-level property = its own file; one logical `state` store)
```

- **`config.json`** — read at init and **watched**: a change **recreates the dashboard** (React `key` = config's file mtime → full unmount/remount, disposing the old `TDiskState` and rebuilding from the new config). Everything *mutable* lives in `state/`, not here. Contains:
  - `dashboardType` — selects the renderer, e.g. `"grid-dashboard"`.
  - `commands` — how to run each script type: a glob (matched on the script's **extension/basename**, e.g. `*.py`) → command-template with a `{{script}}` placeholder, e.g. `{ "*.py": "python {{script}}", "*.js": "node {{script}}" }`. `{{script}}` is the **dashboard-folder-relative** path; the command runs with **cwd = the dashboard folder**. Defaults ship in the template; user/Claude can edit. The runner resolves an action's script *path* via the first matching glob.
  - `events` — map Persephone events to scripts (v1: `onLoad` only — see Events).
- **`CLAUDE.md`** — instructions for Claude on how to configure this dashboard and write its scripts (state file shapes, how actions are wired, icon tokens, etc.). Makes the folder self-documenting so an agent can extend it.
- **`scripts/`** — action implementations. External scripts (`.py`/`.js`/`.sh`/`.ps1`) run as OS processes; `.persy` scripts run in-app (full API + injected `state`).
- **`state/`** — the live, file-backed mirror of the dashboard component state (one file per top-level property).

**Paths & cwd (rule):** every path in `config.json` / `state/` (script refs, event scripts) is **relative to the dashboard folder** — *not* to the file it appears in — so `scripts/refresh.py` means the same thing in `config.json`, `toolbar.json`, or `rowActions.json`. Spawned external scripts run with **cwd = the dashboard folder**, so a script's own relative reads (`open("state/rows.json")`) resolve there too, and running it standalone in a terminal from that folder behaves identically to runtime.

### Opening & managing dashboards

A dedicated **PersephoneDashboard editor** opens when the user clicks the **`.persephone` folder** (mirroring the existing `.git` / `.mneme` folder-click editors):

- **Sidebar secondary view** — lists the project's dashboards; the user switches between them here.
- **Main view** — lists the dashboards with **management operations** (create, delete). Selecting a dashboard (from the sidebar or the list) renders that dashboard's grid in the main view.

So one editor is the home for a project's dashboards, and individual grid dashboards render inside it.

**Naming / create:** the dashboard's **display name = its folder name**. "Create" simply **attempts to create the folder**; if the OS rejects the name (illegal chars, too long, already exists), show an error and abort — no upfront sanitization. Rename = folder rename (same try-and-report).

### State mirror (two-way sync) — the core mechanism

The dashboard's UI state is the contract. (Almost) the full `GridDashboard` state lives in `state/` and is synchronized both directions:

```
 script writes state file ──▶ watcher fires ──▶ React state updates ──▶ grid re-renders
 user edits UI (resize/reorder/…) ──▶ debounced atomic write ──▶ state file updated
```

The state is split **one file per top-level property** (`rows.json`, `columns.json`, `toolbar.json`, …) so each slice syncs and re-renders independently — changing rows never refreshes the toolbar, and a script that disables a toolbar button never re-renders the grid. Illustrative combined shape (each top-level key is its own file):

```jsonc
{
  rows: [ /* row objects */ ],
  columns: [ { key: "status", name: "Status", width: 110, filterType: "options" }, /* … */ ],
  toolbar: [
    { type: "button", onClick: { action: "scripts/refresh.py", name: "Refreshing…" }, icon: "icons.refresh" },
    { type: "button", onClick: "scripts/markDone.persy", icon: "icons.check" },
  ],
  // … other persistable component state
}
```

So a script *configures and feeds* the dashboard purely by writing state files (set columns, set the toolbar, replace rows), and UI-side changes persist back. This generalizes the earlier "load command writes rows.json" idea: rows are just one slice of the synced state. Sync correctness is solved once by the `TDiskState` primitive (next).

### Reusable disk-backed state primitive (`TDiskState` / `useOnDiskState`)

The two-way sync is solved once as a reusable, **React-independent** primitive living in the model/class layer — not re-implemented per dashboard. Persephone already has the pieces and a proven pattern:

- **`TOneState<T>`** (`core/state/state.ts`) is the reactive primitive and is **already zustand-backed** internally (wraps `create<T>()` + a listeners array). It is **React-independent**: `get` / `set` / `update` / `subscribe` are plain methods; `.use()` is the only hook. So it lives happily in a model/class. (This reconciles "based on zustand and TOneState" — `TOneState` *is* the zustand store.)
- **The two-way disk-sync pattern already exists**, copy-pasted in `settings.ts` and `browser-search-history.ts`: load via `FileWatcher.getTextContent()` → `state.update()`; watch via `FileWatcher` with **echo-suppression** (a `skipNextFileChange` flag set before each save, checked/cleared in the change handler); save debounced 300 ms via `fs.saveDataFile`.

Proposal: **`TDiskState`** is a **folder-backed**, schema-validated, **disposable** store — *all* the sync logic lives here:

```ts
const state = new TDiskState("…/.persephone/boards/Task List/state", schema);
// React: state.use(s => s.toolbar);   models: state.get() / state.update(…) / state.set(…)
state.dispose();   // tears down every watcher
```

- **Folder-backed** — created with the `state/` folder path; owns **one file per top-level key**, watches the folder, loads on init, and persists each key **independently** on change (echo-suppressed via the proven `skipNextFileChange` pattern; per-key write = write-isolation).
- **Schema-validated** — created with a **JSON schema**; validates state loaded from disk **before applying**. **Invalid state is ignored** (the last valid value is kept), an error is **logged to console + the dashboard's `ui.log`** (see Errors & `ui.log`), and an **error indicator appears on the dashboard** which the user can click to **open the dev-tools console**. The schema also **defines the valid key set**.
- **Disposable** — `dispose()` tears down all watchers; the dashboard editor owns the lifecycle (create on open, dispose on close).
- **React-independent** (`extends TOneState`) — components bind via `.use(selector)`; models read/write synchronously. A thin **`useOnDiskState`** hook can instantiate-and-dispose one tied to a component's lifecycle.

Still part of this task: **atomic writes** (temp + `fs.rename` — none exists today) and debounce tuning. The single-file precedents (`settings.ts`, `browser-search-history.ts`) informed the watch + echo-suppression mechanics; `TDiskState` generalizes them to a folder.

For the dashboard, **`state` is a single `TDiskState`** holding all top-level properties (`{ rows, columns, toolbar, … }`), **persisted one file per top-level property**. React re-render stays granular via **selectors** (`state.use(s => s.toolbar)` re-renders only on toolbar change), and persistence/watching is **scoped per file** (writing `rows` doesn't rewrite `toolbar.json`, and vice-versa). So an update to one property never re-renders or re-saves another (rows change ≠ toolbar refresh; toolbar-button disable ≠ grid re-render). *(The single-store / multi-file persistence scheme is a `TDiskState`-task detail.)*

### Actions: two runtimes

A toolbar / row action references a script by relative path; the **extension picks the runtime**:

- **External** (`.py`/`.js`/`.sh`/`.ps1`) → spawned via the **command runner** (main process). The command line comes from `config.json.commands` (first glob matching the script path → its template, `{{script}}` substituted), so an action just references a script *path* and the project decides the interpreter/flags. The script reads/writes the dashboard's state files (e.g. `refresh.py` computes rows and writes them; the watcher updates the grid). Any language; testable standalone; no Persephone knowledge required. Non-zero exit → error toast.
- **`.persy` in-app** → executed by Persephone's existing **scripting engine** with the full context (`app`/`page`/`io`/`ai`/`ui`) **plus an injected `state`** — the dashboard's state exposed **directly as a `TDiskState`**, so the script reads via `state.get().rows` and mutates via `state.update(s => { s.rows = … })` (no file I/O, no serialization); changes propagate through `TDiskState` → grid re-render + debounced atomic write. Use `.persy` for actions needing **user interaction** (confirm/choose/prompt via the dialog APIs) or Persephone-specific effects (open a page). It runs in-app, so no stdin/stdout protocol is required. (External scripts reach the same state via the *files*; `.persy` via the live `TDiskState`.) `.persy` is associated with the **TypeScript** language in Monaco.

### Row actions & passing data to scripts

Row actions live in a `rowActions` state slice (like `toolbar`, so scripts can reconfigure them):

```jsonc
rowActions: {
  // an action ref is a path string, OR { action: <path>, name?: <progress label> }
  onClick:       { action: "scripts/open-document.py", name: "Opening document…" },
  onDoubleClick: "scripts/open.py",          // bare path → default progress label
  menu: [
    { label: "Mark Done", icon: "icons.check", script: "scripts/mark_done.py" },
    { label: "Delete",    icon: "icons.trash", script: { action: "scripts/delete.py", name: "Deleting…" } },
  ],
}
```

Every handler (`toolbar[].onClick`, `rowActions.onClick`/`onDoubleClick`, `menu[].script`, `events.*`) is an **action reference**: either a script *path* string, or `{ action: <path>, name?: <message>, kind?: "sync" | "async" }`. `name` is the **loading-indicator label** (default when omitted); `kind` controls **concurrency** (default **`async`**). Runtime is picked by extension (external via the command runner, or in-app `.persy`).

- **`async`** (default) — non-blocking; other interactions stay live and async actions may overlap (the author owns shared-write safety). Uses the delayed (~300 ms) loading badge.
- **`sync`** — **immediately** covers the dashboard with a transparent **overlay**, disabling all other interaction until the action completes (so sync actions can't overlap).

**Passing the row(s) — read it from synced state.** Selection and the active row are themselves state slices, so an action script just reads them — keeping ONE uniform contract (scripts only ever read/write state files):

- `state/selection.json` — selected row **key(s)** (multi-select array); the grid highlights from it.
- `state/activeRow.json` — the **active (clicked) row** key (+ `range` for range ops).

An action script reads `activeRow.json` (the row it fired on) and/or `selection.json` + `rows.json`, and operates on the resolved rows. Two points:

- **Active row, written before the script runs** — a clicked / double-clicked / right-clicked row isn't necessarily the current selection, so the interaction **updates `activeRow` (and `selection`) first**. For an **external** `onClick` / `onDoubleClick` / menu action, Persephone **flushes `activeRow.json` to disk and awaits that write *before* spawning the script**, so the script always reads the correct active row. (`.persy` reads the live `state`, so no flush is needed.) No `trigger.json` — the active row is just state.
- **Sync direction** — `selection` / `activeRow` sync **UI → disk** (and `activeRow` is flushed-before-spawn) and **disk → UI only on load** (restore), *not* live. So a script reading them never fights the user's live selection, and a stale write can't yank it mid-use. Truly ephemeral UI state — scroll, hover — is still not persisted.

**Effects flow back through state** — a script that changes data writes `state/rows.json` (or fires a refresh); the watcher updates the grid. It never "returns" rows.

**`.persy`** scripts read/mutate the same `state` via `state.get()` / `state.update()`, and can show dialogs / navigate.

*(Optional sugar, not the canonical path: a stdin JSON payload `{ event, row, selection }` and/or `{{row.field}}` arg templating, for authors who prefer a script that takes its input inline.)*

### Events

`config.json.events` maps a Persephone event to a script that runs when it fires. **v1: `onLoad` only** (more events — `onFolderWatch`, interval, … — are Future Directions).

- `onLoad` — when the dashboard opens (e.g. `scripts/dashboard-loaded.py`).

**Auto-run is gated by trust:** `onLoad` runs a script automatically on open, so it fires **only when the project is trusted** (see Trust gate). This is what makes the event safe to keep, while still being useful.

### Templates & scaffolding

Dashboard templates are **bundled assets**, authored and version-controlled in the repo, and **copied** into a project on demand — so the per-dashboard `CLAUDE.md`, sample scripts, and seed state have one maintained home.

- **Source:** `assets/.persephone/<dashboardType>-template/` (e.g. `assets/.persephone/grid-dashboard-template/`) — a complete template folder: `config.json` (with default `commands`), `CLAUDE.md`, `scripts/` (a simple working example), and a **seed `state/`** that ships **every initial slice file** (`rows.json`, `columns.json`, `toolbar.json`, `rowActions.json`). This is where we edit/store the per-type `CLAUDE.md`. The `GridDashboard` component has **no special seed logic** — it just renders whatever state files exist, so a freshly created dashboard immediately shows the example; if a slice is missing/empty it simply renders an **empty grid + empty toolbar**.
- **Mechanism:** follow the existing **`assets/script-library`** template approach (`src/renderer/api/library-service.ts`) for bundling + copying a template folder into the project (handles dev vs packaged asset paths).
- **Create / delete** via the PersephoneDashboard editor's main view: "Create" copies the matching `<type>-template/` into `.persephone/boards/<Name>/`, substituting the chosen name.
- A new dashboard **type** later is just a new template folder under `assets/.persephone/` + a renderer for that `dashboardType`.

### Command runner

A generic main-process service + IPC: `runCommand({ command, cwd, env, shell? }) → { stdout, stderr, exitCode }`, where `command` is a **full command-line string run through a shell** (npm `package.json`-`scripts` style — supports `&&`, pipes, inline args), blueprinted on `mneme-service.ts` (spawn → pipe stdout/stderr → `error`/`close` → exit code). Renderer API wrapper + an error-toast helper. **Reusable beyond dashboards.** For dashboards the command line is built from `config.json.commands` (glob → template, `{{script}}` substituted) and spawned with **cwd = the dashboard folder** (all paths dashboard-relative), so the runner stays generic and the *project* configures interpreters/flags. (Task US-699.)

### Loading indicator (reusable per-page)

A reusable **per-page loading indicator** — a small **badge (circular progress + label)** that slides in from the **top** — shown **automatically while a script is running** (action / refresh / `onLoad`). For an **`async`** action it's the badge alone, **delayed ~300 ms** so fast scripts don't flash it; a **`sync`** action additionally **locks the page** behind a transparent overlay shown **immediately** (no other interaction until it finishes). This is a general per-page primitive (candidate for UIKit), reusable beyond dashboards. Its **label comes from the action's `name`** (e.g. `"Opening document…"`); a default is used when omitted. It complements the optional author-driven `loading` state field: the automatic indicator covers the common "a script is running" case so authors needn't wire anything; the state field is for custom/long-running progress.

### Errors & `ui.log`

All dashboard errors — external-script **stderr / non-zero exit**, **state-validation** failures (`TDiskState`), and action errors — are:
- shown as a `ui.notify(..., "error")` **toast**,
- logged to the **dev-tools console**, and
- appended to a per-dashboard **`ui.log`** file (in the dashboard folder).

The on-dashboard **error indicator** is clickable → opens the dev-tools console (and/or `ui.log`). The persistent `ui.log` is the key piece for the agent-assist loop: **Claude can read it to review failures and help the user fix the offending script** — the whole point of a self-documenting, agent-authorable dashboard.

### Trust gate & security

External scripts run OS processes and **`.persy` scripts run in-app with the FULL Persephone API** — powerful. Persephone adopts a **VS Code-style trust gate**, **per `.persephone` project** (not per dashboard), remembered across sessions:

- **Untrusted:** dashboards do **not** render — each shows *"Dashboards are not supported in untrusted projects"* with a **"Trust project"** button that opens a confirmation dialog. No script runs.
- **Trusted:** dashboards render; manual actions run on click and the `onLoad` event fires.
- **Persistence:** trusted projects are stored as a line-delimited list of absolute `.persephone` folder paths in **`<appData>/persephone/data/trustedProjects.txt`** (via the same `fs` data-file helpers as `settings.ts`). The "Trust project" confirmation **appends** the project's `.persephone` path; on open, a dashboard is trusted iff its `.persephone` path is in the list.

A user-supplied command in `config.json.commands` needs **no extra check** beyond this one gate. (Scripts can already spawn via `require("child_process")` today, so the gate formalizes consent rather than closing a brand-new hole.)

## Background — touchpoints to build on

Findings from codebase investigation (2026-06-17). Reuse these when the epic leaves discussion.

| # | Area | Where | Note |
|---|------|-------|------|
| 1 | Editor + folder-click routing | `src/renderer/editors/base/editorRegistry.ts`, `register-editors.ts`; the `.git`/`.mneme` folder-click editors | A **PersephoneDashboard editor** opens on **`.persephone` folder click** (mirror the `.git`/`.mneme` pattern): sidebar list/switcher + main list+management; individual grid dashboards render inside it. |
| 2 | Descriptor-driven precedent | `src/renderer/editors/rest-client/`, `mcp-inspector/` | **Pattern B** (`hasContentHost:false`, MCP Inspector): own lifecycle, read folder/config in `restore()`, state in `this.state`. No `TextFileModel`. |
| 3 | Grid | `src/renderer/uikit/AVGrid/AVGrid.tsx`, `avGridTypes.ts` (`Column<R>`) | `columns`, `rows`, `getRowKey`, `onDoubleClick(row,col)`, `getContextMenuItems(selectedRows)`, `selected`/`setSelected`, `searchString`, `loading`. The synced state maps onto these props. |
| 4 | **Command runner blueprint** | `src/main/mneme-service.ts` (also `snip-service.ts`) | No generic runner exists; every spawn is ad-hoc. `mneme-service` is the closest structural template (spawn, pipe stdout/stderr, `error`+`close`, exit code). Build the reusable runner on this. |
| 5 | **`.persy` runtime + injected `state`** | `src/renderer/scripting/ScriptRunner.ts`, `ScriptContext.ts` (`SCRIPT_PREFIX` named-global injection), `transpile.ts`; `api/setup/configure-monaco.ts` | In-app scripts reuse the existing engine: full `app`/`page`/`io`/`ai`/`ui` context (TS via transpile). A dashboard-scoped runner adds a named global **`state`** — the dashboard's `TDiskState`, called directly (`get`/`update`/`set`). Associate `.persy` with the **TypeScript** language in Monaco; declare `state` as **`IState<…>`** (the interface `TOneState` implements) in the script typings. |
| 6 | **State watch / sync** | `src/renderer/core/utils/file-watcher.ts` (`FileWatcher`, `DirectoryWatcher`) | `FileWatcher(path, onChange)` per state file (300 ms debounce, `getTextContent()`). Needs echo-suppression + atomic writes layered on top. |
| 7 | **Error toast** | `src/renderer/api/ui.ts:38` (`ui.notify(msg, type)`), `uikit/Notification/AlertsBar.tsx` | `ui.notify(stderr, "error")`. Caps at 3 toasts. |
| 8 | Toolbar + row menu | `base/PageToolbar.tsx`, `git-tree/GitTreeEditorView.tsx`; AVGrid `getContextMenuItems` | Toolbar buttons rendered from the synced `toolbar` state; row menu from `rowActions` with `selectedRows`. |
| 9 | Open / navigate | `src/shared/link-data.ts` (`createLinkData`), `api/events/AppEvents.ts` (`openRawLink`) | `.persy` scripts open files via `openRawLink`. Per project rule, **all navigation via `openRawLink`**. |
| 10 | Icon tokens | `src/renderer/components/icons/`, `EditorIcon.tsx` | Publish a name→component allow-list (`icons.*`); a value matching no icon renders as the button's **text/title** (so **emoji** and plain labels like `"refresh"` just work); (future) `.svg`/`.ico` file reference. |
| 11 | Project config / trust | *(none exists — to build)*; `src/renderer/api/settings.ts` (data-file helpers) | No `.persephone` / workspace-config concept and **no script-trust gate** anywhere — this epic introduces a VS Code-style **per-project** trust gate, persisted as a line-delimited path list in `<appData>/persephone/data/trustedProjects.txt` (via `fs` data-file helpers). Folder self-contained; script paths resolve relative to the dashboard folder. |
| 12 | JSON | *(plain JSON)* | `config.json` + state files are plain JSON; `CLAUDE.md` carries the human/agent spec (no JSON5 needed). |
| 13 | Scaffolding source + copy | **`assets/.persephone/<type>-template/`** (bundled templates) | **Follow the `assets/script-library` approach** (`src/renderer/api/library-service.ts`) for bundling + copying a template into the project. Create/delete via the PersephoneDashboard editor's main view. |
| 14 | **Reactive state primitive** | `src/renderer/core/state/state.ts` (`TOneState` — `get`/`set`/`update`/`subscribe`/`.use()`); `model.ts` (`TModel`, `useModel`) | `TOneState` is **zustand-backed** (`create<T>()` + listeners) and React-independent. `TDiskState` extends it; `state` is exposed to scripts **directly** (`get`/`update`/`set`) — no Proxy. |
| 15 | **Two-way disk-sync precedent** | `src/renderer/api/settings.ts` (load + `FileWatcher` + echo-suppressed debounced save); also `editors/browser/browser-search-history.ts`, `api/menu-folders.ts` | The exact pattern to generalize into `TDiskState`. **No atomic write today** (`fs.write` / `saveDataFile` overwrite); `fs.rename` exists for temp+rename. |

## Decisions (resolved 2026-06-17)

- **config vs state split** — `config.json` is **loaded once** at dashboard init (`dashboardType`, `commands`, `events`). **Everything mutable is state** (rows, columns, toolbar buttons, rowActions, selection, focus).
- **`.persy` format/routing** — `.persy` is associated with the **TypeScript** language in Monaco (TS editing/highlighting + Persephone script typings).
- **Action surfaces** — **in scope:** row `onClick` **and** context-menu actions (plus `onDoubleClick`), not just toolbar.
- **`.persy` injected `state`** — **no Proxy.** Expose the dashboard `state` **directly as a `TDiskState`**; scripts use its real methods (read `state.get().rows`; mutate `state.update(s => { s.rows = … })` via immer; replace `state.set(value)`; observe `state.subscribe(...)`). The method set is **documented for Claude** in the per-dashboard `CLAUDE.md` (+ a `state` TS declaration for IntelliSense). Avoids the in-place-mutation trap a Proxy would hide.
- **`config.json.commands`** — defaults ship in the template; the user/Claude edit freely. Arbitrary commands are allowed; **no extra trust check** beyond the single "Do you trust this project?" gate.
- **`config.json.events`** — start with **`onLoad`** only.
- **Untrusted projects** — every dashboard renders *"Dashboards are not supported in untrusted projects"* + a **"Trust project"** button (confirmation dialog). No script runs and the grid does not render until trusted.
- **Command runner location** — **main process** spawns commands (over IPC).
- **Open / routing** — a dedicated **PersephoneDashboard editor**, opened on **`.persephone` folder click** (like `.git` / `.mneme`); sidebar = dashboard list/switcher, main view = list + management (create / delete). See "Opening & managing dashboards".
- **Asset path / copy** — follow the existing **`assets/script-library`** template mechanism (`library-service.ts`) for bundling + copying a template into the project.
- **Icon tokens** — publish a **list of Persephone icons** (`icons.*`); a value matching no icon falls back to rendering the **string as the button title/text** (so **emoji** and plain labels like `"refresh"` work); (future) a reference to a **`.svg`/`.ico`** file.
- **Trust gate** — **per `.persephone` project** (not per dashboard). Trusted paths persisted line-delimited in `<appData>/persephone/data/trustedProjects.txt`; "Trust project" appends after confirmation. (Resolves cold-review #5.)
- **Paths & working directory** — all script/event paths in config & state are **dashboard-folder-relative** (independent of the file they appear in); spawned scripts use **cwd = the dashboard folder**; `commands` globs match the extension/basename. (Resolves cold-review #2.)
- **Seed & loading** — seed (initial `state/` files + sample `scripts/`) ships in the **template** and is copied on create; the component has **no special seed logic** (renders existing state). An automatic **per-page loading indicator** (badge + circular progress, ~300 ms show-delay, optional overlay lock) shows while a script runs, labelled by the action's `name`; an optional `loading` state field → AVGrid `loading` prop remains for custom progress; nothing loaded yet → empty grid + empty toolbar. (Resolves cold-review #3.)
- **Action reference shape** — every handler (toolbar/onClick/onDoubleClick/menu/events) is `string | { action: <path>, name?: <message>, kind?: "sync"|"async" }`; `name` = loading-indicator label, `kind` = concurrency (default `async`).
- **Concurrency (action `kind`)** — default **`async`** (non-blocking, may overlap, delayed badge); **`sync`** immediately locks the dashboard with a transparent overlay until done (no overlap). Default revisitable. (Resolves cold-review concurrency question.)
- **Name ↔ folder** — display name = folder name; "Create" tries to create the folder and **shows an error if invalid/duplicate** (filesystem validates; no upfront sanitization). Rename = folder rename. (Resolves cold-review name↔folder.)
- **`config.json` reload** — `config.json` is watched; a change recreates the dashboard via a React `key` = config mtime (full remount, disposing/rebuilding `TDiskState`). (Resolves cold-review config-reload.)
- **Active row & no `trigger.json`** — the clicked row is the **`activeRow`** state slice; for external actions Persephone **flushes `activeRow.json` to disk before spawning** so the script reads the right row; `.persy` uses live `state`. No `trigger.json`. (Resolves cold-review trigger.json.)
- **`state` typings** — `.persy` Monaco typings declare the injected `state` as **`IState<…>`** (the interface `TOneState` implements) → full method IntelliSense. (Resolves cold-review state-typings.)
- **`TDiskState` (folder-backed, schema-validated, disposable)** — `new TDiskState(stateFolderPath, schema)`: watches the folder, one file per top-level key, validates on load, ignores invalid state, `dispose()`s its watchers. Schema **defines the key set** → fixed/schema-driven (no dynamic discovery). Resolves cold-review #4 + validation.
- **Error logging (`ui.log`)** — all dashboard errors (script stderr/exit, state-validation, action errors) are surfaced as a toast + console log, appended to a per-dashboard **`ui.log`** file, and flagged by a clickable on-dashboard error indicator (→ dev-tools / log). The log lets Claude review failures and help fix them.

**Deferred to the `TDiskState` task (implementation / testing):** atomic temp+`fs.rename` writes, conflict handling (UI edit vs script edit), debounce tuning, and possible one-way-first (disk→UI) phasing. (The `TDiskState` API, folder-backed watching, schema validation + invalid-state handling, and disposal are now **specified** — see Design → TDiskState primitive.) These remaining items are implementation details, not blockers.

## Open concerns & questions (from cold review — 2026-06-17, to resolve)

Raised by a fresh-eyes review of this doc. The architecture is sound and all technical foundations were verified; these are **completeness/clarity gaps to resolve before tasks are carved** (not redesigns). Grouped; checkboxes for tracking.

### Must-fix (contradictions / gaps)

- [x] **`state` Proxy mutation semantics** — **RESOLVED (user, 2026-06-17): drop the Proxy.** Expose the dashboard `state` **directly as a `TDiskState`**; scripts use `state.get()` (read), `state.update(s => { s.rows = … })` (immer draft), `state.set(...)` (replace). No silent in-place-mutation trap. The methods are **documented for Claude** in the per-dashboard `CLAUDE.md` (+ a `state` TS declaration). Consequence: `state` is **one store** persisted one-file-per-top-level-property; re-render isolation via selectors (see TDiskState primitive). *(Design → Actions / Decisions → `.persy` injected `state`)*
- [x] **Relative-path base** — **RESOLVED (user, 2026-06-17):** all paths in `config.json` / `state/` are **relative to the dashboard folder** (regardless of which file they appear in); spawned scripts run with **cwd = the dashboard folder**; the `commands` glob matches the script's **extension/basename** (`*.py`); `{{script}}` substitutes the dashboard-relative path. State-mirror example fixed to `scripts/...`. Runtime == standalone terminal run from that folder. *(Design → State mirror / config.json `commands` / Command runner)*
- [x] **Seed-state + loading contract** — **RESOLVED (user, 2026-06-17):** the **seed = the template's `state/` files + `scripts/`** (a simple working example) copied on create; the `GridDashboard` component has **no special seed logic** — it renders whatever state files exist, so a new dashboard shows content immediately (no blank-before-first-script). An **automatic per-page loading indicator** (see Design → Loading indicator) shows while a script runs, so authors needn't wire anything; an optional `loading` state field → AVGrid's `loading` prop remains for custom progress. If nothing is loaded yet (missing/empty state), render an **empty grid + empty toolbar** — no placeholder/spinner. *(Design → Templates / Loading indicator)*
- [x] **Slice / watcher ownership model** — **RESOLVED (user, 2026-06-17):** all logic lives in **`TDiskState`** — created with the `state/` **folder path** + a **JSON schema**; it watches the folder, owns one file per top-level key, validates on load, and is **Disposable** (the editor disposes it on close). The **schema defines the key set** → **fixed/schema-driven** per `dashboardType`; unknown/stray files are ignored (no dynamic discovery). `selection` / `activeRow` (UI→disk, disk→UI-on-load; `activeRow` flushed before an external action spawns) are thin per-key behaviors layered on top. *(Design → TDiskState primitive)*
- [x] **Trust-gate persistence** — **RESOLVED (user, 2026-06-17):** trusted projects stored as a line-delimited list of absolute `.persephone` folder paths in **`<appData>/persephone/data/trustedProjects.txt`** (via the same `fs` data-file helpers as `settings.ts`). "Trust project" appends the path after confirmation; a dashboard is trusted iff its `.persephone` path is listed. Shared by all dashboards in the project. *(Design → Trust gate / Background row 11)*

### Other open questions

- [x] **Concurrency** — **RESOLVED (user, 2026-06-17):** per-action `kind: "sync" | "async"` (default **`async`**). `async` = non-blocking, may overlap (author owns shared-write safety). `sync` = immediate transparent-overlay page lock, no other interaction until done (so sync actions can't overlap). Default is revisitable.
- [x] **Dashboard name ↔ folder** — **RESOLVED (user, 2026-06-17):** display name = folder name; "Create" just **attempts to create the folder** and **shows an error if the name is invalid/duplicate** (let the filesystem validate — no upfront sanitization). Rename = folder rename (same try-and-report).
- [x] **`config.json` reload** — **RESOLVED (user, 2026-06-17):** `config.json` is **watched**; on change the dashboard **fully recreates** via a React `key` = config's file mtime (unmount → dispose old `TDiskState` → remount fresh). No reopen needed — supports the agent-authoring loop.
- [x] **`trigger.json`** — **DROPPED (user, 2026-06-17):** no `trigger.json`. The clicked row is the **`activeRow`** state slice; Persephone **flushes `activeRow.json` to disk before** spawning an external `onClick`/action so it reads the right row (`.persy` uses live `state`). Removes the lifetime/race question.
- [x] **`.persy` `state` typings** — **RESOLVED (user, 2026-06-17):** declare the injected `state` as **`IState<…>`** (the interface `TOneState` implements) in the **`.persy`** Monaco typings — `get`/`update`/`set`/`subscribe`/`.use` IntelliSense, alongside the existing `app`/`page`/`io`/`ai` typings.
- [x] **icon value fallback** — **RESOLVED (user, 2026-06-17):** match the value against the built-in `icons.*` dictionary; **on no match, render the string as the button's title/text** — so an **emoji** renders as-is and a plain label like `"refresh"` shows as text. One rule covers icon / emoji / text.

### Implementation caveats (verified against code — keep in mind)

- **`library-service.ts`** copies *only if files don't already exist* (no overwrite), and the **"substitute the chosen name"** step is **net-new logic** — "follow the `script-library` approach" understates this. *(Templates / Background row 13)*
- **Folder-click routing** is ~3 touchpoints, not "mirror the pattern": a folder-name check in `FileTreeProvider` + a new `persephone-folder://`-style link scheme & parser + editor registration. Also `mcp-inspector` (our cited Pattern-B model) does **not** override `restore()`; the dashboard editor will need a real `restore()` to read the folder. *(Background rows 1–2)*

## Future Directions (beyond the current scope — design guidance for future extensions)

Explicitly out of the finalized scope. Kept here so the implementation **leaves room** for them — design with these in mind, don't build them now.

- **More trigger/event types** — beyond `onLoad`: `onFolderWatch` (watch source globs), interval/timer, on-row-change, etc. All auto-run, so all stay behind the trust gate.
- **More dashboard types** — timeline (events referencing documents, e.g. meeting transcripts) and other non-grid layouts; the folder + state-mirror + action mechanism is designed once and reused (`dashboardType` selects the renderer).
- **Richer grid config** — per-row/per-value tooltips, status-column styling, grouping.
- **Side panels** — extra synced views alongside the grid.
- **`.svg`/`.ico` icon references** — beyond the built-in icon list + emoji.
- **Stdin/stdout interaction for *external* scripts (lower priority — `.persy` largely supersedes it).** If a non-`.persy` external script ever needs mid-run user interaction, Persephone could mediate it over the process's stdio (it owns those streams). The *capability* is the point, not a command set. Inspiration only — the user's `interactive-script` VS Code extension (`D:\projects\interactive-script\documentation\overview.md` + `api.md`) demonstrates one mechanism (a magic line on stdout + GUID-correlated replies written to stdin, hidden behind a JS/Python client `ui` object). **For most interactive needs, write a `.persy` script instead** — it runs in-app with the full API and needs no protocol.

## Notes

### 2026-06-17 — epic created, iterated to a per-dashboard folder + state-mirror model, then open questions resolved
- Created from the user's idea for a configurable, agent-authorable dashboard inside a `.persephone/` project folder. Generic by design.
- **Iterations (user-driven):** external commands (any language) writing data Persephone watches → a per-dashboard **folder** (`config.json` + `CLAUDE.md` + `scripts/` + `state/`) with a **two-way synced** state mirror → **granular state files** (one per top-level property, own watcher + `TDiskState` slice) → two action runtimes (**external** via the command runner; **`.persy`** in-app with full API + injected `state`) → `config.json` carries `commands` + `events` → a **per-project trust gate** keeps the auto-run `onLoad` safe → templates bundled in `assets/.persephone/` → row actions + selection/activeRow carried as state slices.
- **Reusable sync primitive:** `TDiskState`/`useOnDiskState` built on `TOneState` (zustand-backed, React-independent); extracts the proven `settings.ts` load/watch/echo-suppressed-save pattern and adds atomic writes (temp + `fs.rename`).
- **Open questions resolved (this pass):** config = load-once / everything-else = state; `.persy` = TypeScript in Monaco; row click + context-menu **in scope**; `.persy` `state` exposed directly as a `TDiskState` (no Proxy — `get`/`update`/`set`); `commands` defaults in template, no extra trust check; events = **`onLoad`** only; untrusted projects render a "not supported" message + Trust button; command runner in **main**; a **PersephoneDashboard editor** on `.persephone` folder click with sidebar list + main management view; asset copy follows the **`script-library`** approach; icon tokens = built-in list + emoji (+ `.svg`/`.ico` later); trust gate **per project**. Two-way-sync nuances deferred to the `TDiskState` task.
- Investigation (Explore ×3) confirmed the touchpoints (table above): **no** generic command runner (blueprint `mneme-service.ts`), the existing **ScriptRunner** backs `.persy`, `TOneState` is zustand-backed + React-independent, the `settings.ts` disk-sync precedent (with echo-suppression; no atomic write — `fs.rename` exists), single-file/dir **watchers**, `ui.notify` toasts, and **no** project-config or script-trust infrastructure.
- **Cold review (2026-06-17):** a fresh-eyes, no-context review confirmed the architecture is sound and all technical foundations exist (verified `TOneState`/zustand, `FileWatcher`, `settings.ts` echo-suppression, `mneme-service` spawn, `library-service` copy). It surfaced completeness/clarity gaps — recorded under **Open concerns & questions (from cold review)** for the user to resolve before tasks are carved.
- **Drop the `state` Proxy (user, 2026-06-17):** expose the dashboard `state` directly as a `TDiskState`; scripts use `state.get()` / `state.update(draft => …)` / `state.set()` (documented for Claude + a TS declaration). Resolves the in-place-mutation ambiguity (cold-review must-fix #1). The dashboard is one `state` store persisted one-file-per-top-level-property — granular files kept for write/watch isolation; re-render isolation via selectors.
- **Path base consolidated (user, 2026-06-17):** all config/state paths are **dashboard-folder-relative** (independent of the file they're in); spawned external scripts get **cwd = the dashboard folder**; `commands` globs match extension/basename; `{{script}}` is the relative path. Resolves cold-review #2; makes runtime identical to running the script standalone from the dashboard folder.
- **Seed & loading resolved (user, 2026-06-17):** the seed state files + scripts live in the `assets` template and are copied on create; nothing seed-specific in the `GridDashboard` component (it renders existing state). Optional loading via a state field → AVGrid `loading`; nothing loaded → empty grid + empty toolbar. Resolves cold-review #3.
- **Per-page loading indicator (user, 2026-06-17):** a reusable per-page indicator — badge with circular progress + label, slides from the top, optional transparent-overlay page lock — shown automatically while a script runs, with a ~300 ms show-delay so fast scripts don't flash it. General primitive (candidate UIKit), reusable beyond dashboards.
- **Configurable progress message (user, 2026-06-17):** an action can be `{ action: "scripts/open-document.py", name: "Opening document…" }` — `name` is the loading-indicator label; a bare-string path is still allowed (default label). Applies to all handlers (toolbar/onClick/onDoubleClick/menu/events).
- **`TDiskState` concretized (user, 2026-06-17):** all sync logic concentrated in `TDiskState` — `new TDiskState(stateFolderPath, schema)`, folder-backed (one file per top-level key), starts watching on create, **Disposable** (disposes watchers), schema-**validates** loaded state before apply, **ignores invalid** state with a console error + a clickable on-dashboard error indicator (→ dev tools). Schema defines the key set → fixed/schema-driven. Resolves cold-review #4; validation no longer deferred.
- **Per-dashboard `ui.log` (user, 2026-06-17):** all errors (script stderr/exit, `TDiskState` validation, action errors) are appended to `.persephone/boards/<Name>/ui.log` (alongside the toast + console + clickable error indicator), so Claude can review failures and assist the user with fixes — closing the agent-authoring/repair loop.
- **Trust-gate persistence (user, 2026-06-17):** trusted projects stored line-delimited (absolute `.persephone` paths) in `<appData>/persephone/data/trustedProjects.txt` (via `fs` data-file helpers, like `settings.ts`); "Trust project" appends after confirmation; trusted iff listed. Resolves cold-review #5.
- **Action concurrency `kind` (user, 2026-06-17):** actions carry `kind: "sync" | "async"` (default async, revisitable). `sync` immediately covers the dashboard with a transparent overlay and blocks all interaction until done; `async` is non-blocking (delayed badge, may overlap). Resolves cold-review concurrency question.
- **Name↔folder (user, 2026-06-17):** display name = folder name; on create, just try to make the folder and show an error if the name is invalid/duplicate (let the filesystem validate). Resolves cold-review name↔folder question.
- **config.json reload (user, 2026-06-17):** watch `config.json`; on change recreate the dashboard via React `key` = file mtime (full remount, disposing/rebuilding `TDiskState`). No reopen needed; supports the agent-authoring loop. Resolves cold-review config-reload.
- **Active row; `trigger.json` dropped (user, 2026-06-17):** the clicked row is the `activeRow` state slice; for an external action Persephone flushes `activeRow.json` to disk **before spawning** so it reads the right row (`.persy` uses live `state`). No `trigger.json`. Resolves cold-review trigger.json question.
- **`state` typings (user, 2026-06-17):** declare the injected `state` as `IState<…>` (the interface `TOneState` implements) in the `.persy` Monaco typings → IntelliSense for `get`/`update`/`set`/`subscribe`. Resolves cold-review state-typings.
- **Icon fallback (user, 2026-06-17):** match the icon value against the `icons.*` dictionary; on no match, render the string as the button's title/text (so emoji and plain labels like `"refresh"` work). Resolves cold-review icon-fallback — the last cold-review item.
- **Still In Discussion (per user):** no tasks planned. The user is iterating the vision.
