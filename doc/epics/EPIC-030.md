# EPIC-030: Git Integration — Git Tree + File Diff editors

## Status

**Status:** **✅ Completed** (2026-06-07) — v1 shipped (US-610–US-613); close-out `/review` + `/document` + `/userdoc` run as a single deferred pass. See the close-out note at the bottom. _History below preserved as-written from the design phase._ Design complete; v1 tasks carved as placeholders (**US-610–US-613**), each investigated + detailed (with any task-specific concerns) before implementation. **Decisions locked:** **simple-git** (CLI wrapper) for git access; **Monaco diff** for the File Diff editor (a *new* editor, **not** a reuse of Compare mode); both surfaces are standard **registered editors**; **git detection design resolved** (Concern 2, host-centric); **Git Tree component = `AVGrid` + SVG `BranchTreeCell`** (Concern 9); **opt-in via a "Git integration" setting, OFF by default** (Concern 4); **lane layout = ported VS Code swimlane algorithm** (Concern 6, MIT). **Initial scope LOCKED** (2026-06-06) — three deliverables: reusable Git Tree component, a *very simple* Git Tree editor (just the component), and a *simple* File Diff editor (Monaco diff + from/to dropdowns), behind the off-by-default setting. See **Initial Scope (v1)**. **All design concerns resolved** (2026-06-06); **v1 tasks carved (US-610–US-613)** and the epic moved to **Active** on the dashboard.
**Created:** 2026-06-06

## Overview

Bring Git into Persephone as first-class, read-first tooling for developers. Two new **registered editors**:

1. **Git Tree** — a full-tab editor (visually in the spirit of the "Get Extensions" app): a **branch tree** alongside a **commit list / history graph** for the repository. Opened by clicking the repo's **`.git` folder in the Explorer** tree.
2. **File Diff** — a per-file diff editor built on **Monaco's diff editor**, surfaced as an **editor switch** (e.g. *Text Editor / Preview / Diff* for a markdown file) whenever the file lives in a git repo. By default it shows the current **unstaged working-tree changes**; toolbar dropdowns let the user pick **any two commits** to diff the file between them.

The big idea: a developer working in Persephone can understand the state of a repo (branches, history) and inspect changes (working tree or any commit pair) without leaving the app — reusing the Monaco engine and the existing editor/Explorer infrastructure.

## Goals

- A **Git Tree** editor showing the repository's branches (tree) and commits (list/graph), opened from the `.git` folder in Explorer.
- A **File Diff** editor for text-based files that shows:
  - current **unstaged** working-tree changes for the file, and
  - the diff of a file between **any two selected commits** (toolbar from/to dropdowns).
- Use **Monaco's diff editor** for File Diff — a **brand-new editor**, *not* a reuse of the grouped-page Compare mode (`CompareEditor.tsx`).
- Use **simple-git** (a thin promise wrapper over the installed `git` CLI) from the **main process**, exposed to the renderer over IPC — following the existing `*-service.ts` + `*-ipc.ts` pattern.
- Detect git context **once, on the shared text-file host**, so every text-based editor (Monaco, Markdown, Mermaid, Grid, …) offers the File Diff switch with no per-editor code (Concern 2).

## Initial Scope (v1) — LOCKED (2026-06-06)

The **initial implementation is deliberately minimal — three deliverables, nothing more:**

1. **Git Tree component (reusable)** — `AVGrid` + SVG `BranchTreeCell` + the lane-layout pass (Concern 9 / Concern 6). The shared building block for both the editor and the File Diff popover.
2. **Git Tree editor** — *very simple:* essentially **just the Git Tree component** filling the editor body, opened from the `.git` Explorer node (Concern 2B). No branch-detail side panels, no commit-detail pane, no actions.
3. **File Diff editor** — *simple* Monaco diff with **two toolbar dropdowns** (`from` / `to`) to pick the compared revisions. **Default preselection:** `from` = the file's **staged blob if staged, otherwise its `HEAD` blob**; `to` = the **current editor content** (working tree, including unsaved edits) — i.e. "show my uncommitted changes" out of the box.

_Also part of v1:_ a **"Git integration" setting (off by default)** that gates all of the above — when off, Persephone runs exactly as today with zero git activity (D6 / Concern 4).

**Everything else is out of scope of the initial implementation.** Once these three ship, the epic may either **close** or **stay open** as a home for follow-on feature tasks — each new capability is its **own task, created later** when a concrete need is identified. The epic does not pre-commit to any of them.

## Out of scope (initial implementation)

Explicitly **not** built in v1 — each is a *candidate* future task, not a promise:

- Any **write/mutating** git operation — stage, unstage, commit, push, pull, fetch, branch, checkout, merge, rebase, revert, cherry-pick. **v1 is strictly read/inspect.**
- Branch/commit **context actions** in the Git Tree (checkout, create branch, diff-from-here, copy hash, …) and any **commit-detail / changed-files pane**.
- **Conflict-resolution** UI.
- **Status decorations** beyond the two detection touch-points already specified (the File Diff switch + the `.git` icon) — e.g. per-file dirty badges in Explorer, Monaco gutter diff markers.
- **Multi-repo** orchestration, remotes/credential management (beyond what the git CLI handles itself), submodule drill-in.
- **Bundling a git binary** — we rely on the user's installed git (Concern 4).
- **Git Tree entry point for worktrees / submodules** — the Explorer `.git` entry point (US-612) detects a real `.git` *directory* (HEAD + objects marker). Worktrees and submodules use a `.git` *file* (`gitdir:` pointer) and won't get the entry point. (The File Diff switch still works for files in them, since US-610 detection uses `rev-parse`.)
- Live **auto-refresh** on filesystem/repo changes — v1 may use manual / on-open refresh; reactive watching is a later refinement.

## Decided so far

| # | Decision | Date | Notes |
|---|----------|------|-------|
| D1 | Git access via **simple-git** (CLI wrapper), in the **main process** | 2026-06-06 | No native build against the Castlabs Electron fork; full git parity; mirrors VS Code's shell-out approach. |
| D2 | File Diff is a **new editor on Monaco's diff** — *not* a reuse of Compare mode | 2026-06-06 | `CompareEditor.tsx` stays untouched; File Diff builds its own `original`/`modified` sources from git (working tree vs `HEAD`, or any two commits via `git show <rev>:<path>`). |
| D3 | Both surfaces are **standard registered editors** | 2026-06-06 | File Diff surfaced via the editor **switch widget**; Git Tree surfaced by opening the `.git` Explorer node. No bespoke page modes. |
| D4 | **Git detection lives on the shared `TextFileModel` host** | 2026-06-06 | See Concern 2 — host-centric, detect-once, all text editors inherit the File Diff switch for free. |
| D5 | **Git Tree is a reusable `AVGrid` + `BranchTreeCell` (SVG) component** | 2026-06-06 | Fixed row height + lane width; full-width-draw + `overflow:hidden` clip; fed by a global lane-layout model. Reused verbatim in the File Diff commit-picker popover. See Concern 9. |
| D6 | **A "Git integration" setting gates everything — OFF by default** | 2026-06-06 | Keeps Persephone simple. When off: no detection, no git spawns, no Diff switch, no `.git` icon. On-enable probe reports git availability; runtime failures degrade gracefully. See Concern 4. |
| D7 | **Lane layout = ported VS Code swimlane algorithm** (MIT) | 2026-06-06 | `scmHistory.ts` `toISCMHistoryItemViewModelArray`; per-row `inputSwimlanes`/`outputSwimlanes`/node model; fed by `git log --topo-order --parents`. See Concern 6. |

## Background — existing patterns to build on

### The editor switch widget (host of the File Diff switch)

`SwitchWidget` (`src/renderer/editors/base/PageToolbar.tsx:60`) renders a `SegmentedControl` from `model.findCompatibleEditors()`. Every text editor implements that identically:

```ts
findCompatibleEditors() { return editorRegistry.findEditorsAccepting(this._host); }   // passes the HOST
```

`editorRegistry.findEditorsAccepting(host)` (`editorRegistry.ts:110`) calls each registered editor's `accepts({ host, language, fileName })`, **passing the host through**. Editor labels come from the registry `name` ("Text Editor", "Preview", "Grid (JSON)", …). This is the exact mechanism the File Diff switch plugs into.

### The shared text-file host

Each text editor (Markdown, Mermaid, Html, Grid, Todo, …) holds the **same** `TextFileModel` as `_host`, exposed via `contentHost`/`host`, and re-attached on every editor switch through `adoptHost()` (`MarkdownEditor.ts:202`). The host already owns file-level metadata (`filePath`, `encoding`, content). Git membership is the same category of fact — so it lives there (D4).

### Monaco diff is already proven (engine for D2)

`CompareEditor.tsx` drives `@monaco-editor/react`'s `<DiffEditor original modified language theme="custom-dark" />`. File Diff reuses the **engine/component**, not the Compare *feature* — it supplies both sides from git instead of from a grouped page.

### Explorer file tree (host of the Git Tree entry point)

`FileTreeProvider.list()` (`src/renderer/content/tree-providers/FileTreeProvider.ts`) builds `ILink` items with `isDirectory`, `tags`, `imgSrc`, and a **`target`** field documented as *"Preferred editor target for opening this link (e.g. 'image-view', 'monaco')."* `getNavigationUrl(item)` decides what opening the node does (folders → `encodeCategoryLink` to navigate into them). Both are the hooks the `.git` → Git Tree behavior uses.

### Main-process service + IPC pattern (engine for D1)

`src/main/` services (`search-service.ts`, `cdp-service.ts`, …) register `ipcMain` handlers; channel + type definitions live in a shared `src/ipc/*-ipc.ts`; results can stream per item. `git-service.ts` + `git-ipc.ts` follow this exactly — `simple-git` runs in main, the renderer calls through typed IPC.

## Proposed shape (sketch — refine during UI discussion)

- **`src/main/git-service.ts`** — wraps `simple-git`; exposes `revparseToplevel(dir)`, `currentBranch(root)`, `log` (paginated), `branches`, `show(rev, path)`, working-tree + commit-pair `diff`. Registers `ipcMain` handlers.
- **`src/ipc/git-ipc.ts`** — channel names + request/response/stream types shared by main & renderer.
- **renderer git API** — a thin wrapper (likely `src/renderer/api/`) the host + editors call; owns the **directory-keyed detection cache**.
- **File Diff editor** — `src/renderer/editors/file-diff/` (id `file-diff`, name `Diff`), `hasContentHost: true`, registered with a git-aware `accepts()` (Concern 2). Monaco diff body + commit from/to dropdowns.
- **Git Tree editor** — `src/renderer/editors/git-tree/` (id `git-tree`, name `Git Tree`): branch tree + commit list/graph, built on the reusable **Git Tree component** (`AVGrid` + `BranchTreeCell`, Concern 9). Page-level layout/columns are **Concern 1**.
- **Git Tree component** — `src/renderer/.../GitTree` (placement TBD): `AVGrid` + SVG `BranchTreeCell` + global lane-layout model. Reused by both the Git Tree editor and the File Diff commit-picker popover (Concern 9).

## Concerns / Open Questions (discussion agenda)

**Quick status:**

| # | Concern | Status |
|---|---------|--------|
| 1 | Git Tree editor layout | ✅ RESOLVED for v1 — just the component (2026-06-06) |
| 2 | Git detection (File Diff switch + `.git` icon/open) | ✅ RESOLVED — host-centric (2026-06-06) |
| 3 | File Diff / Git Tree form factor | ✅ RESOLVED — standard registered editors (2026-06-06) |
| 4 | `git` CLI dependency + enablement | ✅ RESOLVED — opt-in setting, off by default (2026-06-06) |
| 5 | Commit-pair selection (File Diff) | ✅ RESOLVED for v1 — from/to dropdowns + default (2026-06-06) |
| 6 | History graph — lane-assignment algorithm | ✅ RESOLVED — port VS Code swimlane algorithm (2026-06-06) |
| 7 | Large-repo performance (log pagination, lazy loading) | 🟡 v1 = simple capped load; pagination deferred |
| 8 | Read-only first vs eventual write operations (scope) | ✅ RESOLVED — v1 strictly read-only (2026-06-06) |
| 9 | Git Tree component (AVGrid + BranchTreeCell) | ✅ RESOLVED — AVGrid + SVG cell (2026-06-06) |

---

### Concern 1 — Git Tree editor layout

**Status: ✅ RESOLVED for v1 (2026-06-06) — the editor is just the component.** v1 mounts the Git Tree component to fill the editor body, opened from the `.git` Explorer node. No side panels, no separate branch pane, no commit-detail pane. A minimal toolbar is acceptable only if actually needed (e.g. a refresh action). Richer layout (branch sidebar, details pane, branch-filtered history, `SecondaryViews` reuse) is **deferred** to a possible follow-on task.

### Concern 2 — Git detection (RESOLVED, host-centric)

**Status: ✅ RESOLVED (2026-06-06).** Two detections, two entry points, both grounded in existing mechanisms.

> **Gated by the "Git integration" setting (D6 / Concern 4).** Everything below runs **only when the setting is on**. Off (the default) → none of this detection happens; zero git spawns.

#### (A) File Diff switch — "is this file in a repo?"

- **State home:** the shared `TextFileModel` host carries `gitRepo: { root: string; branch: string } | null` in its `state` (`null` = checked, not a repo; `undefined` = not yet checked). Same model that owns `filePath`/`encoding` (D4).
- **Trigger:** `TextFileModel` runs detection when `filePath` resolves or changes — **file-backed only** (untitled buffers skip → no Diff switch). Not on keystroke.
- **Mechanism:** `git rev-parse --show-toplevel` (run with `cwd` = the file's directory) via main-process `git-service.ts`, behind a **directory-keyed cache** in the renderer git API. First file in a folder spawns git; every other file in that repo is a cache hit. **Not** a hand-rolled walk for a `.git` folder — `rev-parse` correctly handles submodules, worktrees, and bare repos (where `.git` is a *file*, not a directory). Optional second call `git rev-parse --abbrev-ref HEAD` for the branch label.
- **Offer the switch — zero per-editor code:** register the File Diff editor with a host-aware predicate. Because every text editor's `findCompatibleEditors()` calls `findEditorsAccepting(this._host)`, and that passes the host into each `accepts()`, all text editors inherit the switch automatically:
  ```ts
  // register-editors.ts — id: "file-diff", name: "Diff"
  accepts: (input) => input.host?.state.get().gitRepo ? 25 : -1,
  ```
- **Reactivity (the one wrinkle):** `SwitchWidget` (`PageToolbar.tsx:60`) subscribes only to `model.state`, but `gitRepo` lives on `host.state`. Add a host subscription so the widget re-renders when async detection lands:
  ```ts
  model.contentHost?.state.use((s) => (s as { gitRepo?: unknown }).gitRepo);
  ```
- **Survives switches:** the host is inherited via `adoptHost`, so detection runs **once** — switching Monaco → Preview → Diff never re-detects. The File Diff editor itself reuses the same host for the repo root + repo-relative path.
- **Gating rule (per user):** offered whenever the file is **in a repo, regardless of changes**. The "no changes yet" case is handled inside the editor (both diff sides identical), never by hiding the switch.

#### (B) Git Tree entry point — the `.git` folder in Explorer

- **Real-`.git` detection (chosen: marker heuristic, no git spawn in the tree):** in `FileTreeProvider.list()`, when a directory entry is named `.git`, confirm it's a real git dir with cheap synchronous `existsSync` checks — `join(path, "HEAD")` **and** `join(path, "objects")` present. Distinguishes a real repo from a coincidentally-named folder without spawning git per listing. (`FileTreeProvider` already uses `nodefs` directly — fits.)
- **Open behavior:** mark the verified item with `target: "git-tree"` and override `getNavigationUrl()` so the `.git` item resolves to a URL that opens the **Git Tree editor**, instead of `encodeCategoryLink` (which would navigate *into* the folder).
- **Icon (chosen: add an `icon` hint to `ILink`):** `ILink` has no icon field today (folders use a default icon; files key off extension/`imgSrc`). Add an optional `icon`/`iconId` hint on `ILink`, set it on the verified `.git` item, and map it to a git icon in the Explorer tree node. (Alternative considered: special-case `.git` in the renderer — rejected as less reusable.)

> Both micro-choices (marker heuristic over git spawn; `icon` hint over renderer special-case) are finalizable during the relevant task but recorded here as the intended approach.

### Concern 3 — File Diff / Git Tree form factor (RESOLVED)

**Status: ✅ RESOLVED (2026-06-06).** Both are **standard registered editors** (`editorRegistry.register`), not bespoke page modes:

- **File Diff** — surfaced through the existing **editor switch widget** (like Markdown's Preview). A `hasContentHost: true` editor sharing the text-file host; selected via `SegmentedControl` → `switchMainEditor("file-diff")`. It does **not** reuse `CompareEditor` (D2) and is **not** a `pagesModel` Compare-style mode.
- **Git Tree** — opened by navigating the `.git` Explorer node to it (Concern 2B). Form factor is settled; its internal UI is Concern 1.

### Concern 4 — `git` CLI dependency + enablement

**Status: ✅ RESOLVED (2026-06-06) — opt-in setting, off by default.**

A Persephone setting **"Git integration"** (boolean, in `settings.ts` + the Settings editor page), **OFF by default** to keep the app simple. The toggle **gates all git behavior** — Concern 2's detection (File Diff switch *and* the `.git` Explorer icon/redirect), the editors, everything. When off, Persephone runs exactly as today: no `rev-parse` on file open, no `.git` marker checks in Explorer, no git spawns at all.

- **On enable:** run an availability probe (`git --version` via `git-service`) on the settings page and show the result inline ("Git X.Y detected" or "git not found on PATH — install git or fix PATH"). The user may leave the toggle on even if the probe fails (git might be installed later / PATH fixed next launch) — the probe is a **UX confirmation, not the sole gate**.
- **Enabled but git fails (missing at enable-time, or removed/PATH-broken at runtime):** degrade gracefully, no errors thrown at the user —
  - **File Diff switch:** not shown. Falls out of the existing design for free: detection's `rev-parse` fails → `host.state.gitRepo` stays null → `file-diff.accepts()` returns -1.
  - **Git Tree editor:** renders an **error message** in the editor body instead of the Git Tree component (e.g. "Git is unavailable — check your installation").
  - **Explorer `.git` icon/redirect:** simply doesn't activate (detection gated/failing).
- **Runtime failures degrade identically** to the enable-time-missing case — every git call site tolerates failure rather than relying only on the enable probe.

### Concern 5 — Commit-pair selection (File Diff)

**Status: ✅ RESOLVED for v1 (2026-06-06).** Two toolbar dropdowns, `from` and `to`. **Default:** `from` = the file's **staged blob if staged, otherwise its `HEAD` blob**; `to` = the **current editor/working-tree content** (incl. unsaved edits) — the "uncommitted changes" view. `from` is the base (left), `to` is the modified (right). Each dropdown picks a revision and surfaces the commit list via the Git Tree component in a popover (D5 / Concern 9), plus the special endpoints **"Working tree (current)"**, **"Staged"**, and **"HEAD"**. Handing a commit pair from the Git Tree *editor* to a File Diff is a **post-v1** nicety, not required for v1.

### Concern 6 — History graph: lane-assignment algorithm

**Status: ✅ RESOLVED (2026-06-06) — port the VS Code swimlane algorithm (MIT).**

Adapt VS Code's commit-graph layout from [`scmHistory.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/scm/browser/scmHistory.ts) (`toISCMHistoryItemViewModelArray`, **MIT** — attribute in source). It is exactly our shape: one commit per row, with `inputSwimlanes`/`outputSwimlanes` arrays = the per-row layout model `BranchTreeCell` paints.

**Why this over alternatives:** mhutchie/vscode-git-graph has **no OSS license** (can't fork); `@gitgraph/core` is for *authoring* graphs, not laying out a real DAG; `dagre`/`d3-dag` produce general layered diagrams, not compact vertical lanes. The VS Code swimlane model is MIT and a near-drop-in.

**Algorithm (newest→oldest):** maintain `swimlanes: { id: commitHash, color }[]`, each lane reserving the next commit expected in its column. Per commit C: node column = first input lane with `id === C.hash` (append if a new tip); build `outputSwimlanes` from input by — replacing C's lane with its **first parent** (keeps color), **dropping other lanes reserving C** (merge-in collapses), and adding lanes for **extra parents** (reuse a lane already reserving that parent, else a new lane with the next palette color). Root commit drops its lane. Row model = `{ node:{column,color,hash}, inputSwimlanes, outputSwimlanes, refs }`.

**Render:** `BranchTreeCell` diffs input vs output columns → vertical `<line>` where a lane's column is unchanged, the node `<circle>`, diagonal `<path>` where a lane's column changes (branch-out below the node, merge-in above).

**Colors:** ref-based (HEAD/branch/tag → registered color) else a small cycling palette in `color.ts`; first parent keeps the lane color, extra parents get fresh ones.

**Inputs / perf:** feed `git log --topo-order --parents --pretty=…` (so a parent never precedes all its children). Compute the pass **once** over the capped commit window (Concern 7) → per-row models the virtualized cells just read; no per-cell computation.

### Concern 7 — Large-repo performance

**Status: 🟡 v1 = simple capped load; pagination deferred.** For the simple v1, load a **bounded recent history** (a sane cap, e.g. the last N commits) in one `git log` call — no incremental pagination or streaming. True lazy-load/pagination (page size, load-more, streaming over IPC like `search-service`) and any heavy lane-layout optimization are **post-v1** refinements. The cheap per-directory detection cache (Concern 2A) is unaffected.

### Concern 8 — Read-only first vs write operations

**Status: ✅ RESOLVED (2026-06-06) — v1 is strictly read/inspect-only.** No mutating git operations in the initial implementation (see Out of scope). Write operations, if ever wanted, are individual post-v1 tasks.

### Concern 9 — Git Tree component (rendering) — RESOLVED

**Status: ✅ RESOLVED (2026-06-06).**

The branch/commit history is a **reusable component** = `AVGrid` + a custom `BranchTreeCell` graph column, fed by a precomputed lane-layout model. The **same component** serves the Git Tree editor (full size) and the File Diff commit-picker popover (compact).

- **Grid:** `AVGrid` (`uikit/AVGrid`). Commits are rows; columns = one dedicated graph column (`cellRenderer = BranchTreeCell`) + normal columns ("comment", "committed by", "time", short hash, refs). AVGrid is virtualized (built on `RenderGrid`), so large histories scroll cheaply. Each cell receives `RenderCellParams { row, col, style, renderInfo }` — the graph cell knows its **row index** (→ that row's layout slice) and its **pixel box**.
- **Cell renderer = SVG** (chosen over canvas). Per row the `BranchTreeCell` paints, at fixed coordinates: vertical `<line>`s for pass-through lanes, a `<circle>` node at `(nodeLane × laneWidth, rowHeight/2)` (clickable → commit selection, used by the popover), and `<path>` connectors for edges entering/leaving within the row. SVG over canvas for: HiDPI crispness with no `devicePixelRatio` handling, theme colors, declarative re-render under virtualization, and free node hit-testing. Canvas stays a perf fallback (Concern 7) if SVG proves heavy on huge repos.
- **Fixed row height** (an AVGrid property) + **fixed lane width** → predictable top (`0`) / center (`rowHeight/2`) / bottom (`rowHeight`) y-points and lane x-coordinates (`laneIndex × laneWidth`), so per-row SVG slices stack into continuous lanes.
- **Column width:** draw each row's SVG at a **constant `requiredWidth = maxLanes × laneWidth + padding`** (from the layout pass), *independent of the cell box*; the cell wrapper is `overflow: hidden`. Set `requiredWidth` as the graph column's initial width and keep it **resizable** — shrinking just slides the clip edge (hides the deepest right-side lanes first; node + nearest lanes stay visible), never rescales the graph. Optional later refinement: grow the width if loading more history raises `maxLanes`, unless the user manually resized.
- **Lane colors:** add a small git-lane palette to `color.ts` (+ all theme defs) — no hardcoded colors.
- **The hard part is upstream and render-agnostic:** the global **lane-assignment pass** (Concern 6) produces the per-row layout model; `BranchTreeCell` is a dumb painter of one row's slice. Swapping SVG↔canvas later would not touch the layout model.

## Linked Tasks

Placeholders — title + scope only. Each gets its own **deep-investigation pass + detailed task document** (and any task-specific concerns discussed) immediately before implementation, per the project's task-creation workflow. **Every task leaves Persephone compiling & runnable**, behind the off-by-default "Git integration" setting. Sequenced so foundation lands first.

| ID | Title | Scope (one line) |
|----|-------|------------------|
| US-610 | Git service + IPC + "Git integration" setting + host detection | `git-service.ts` (simple-git) + `git-ipc.ts`; off-by-default settings toggle + on-enable `git --version` probe (Concern 4); `rev-parse --show-toplevel` detection (dir-cached) → `TextFileModel.state.gitRepo`; File Diff switch offered via `file-diff.accepts({host})`; `SwitchWidget` host-state subscription (Concern 2). **Foundation for all others.** |
| US-611 | Git Tree component (AVGrid + SVG `BranchTreeCell` + swimlane layout) | Reusable `AVGrid` + SVG `BranchTreeCell` (Concern 9); port the VS Code swimlane lane-layout pass (D7 / Concern 6) over `git log --topo-order --parents`; lane palette added to `color.ts`. Reused by US-612 and US-613. |
| US-612 | Git Tree editor + Explorer `.git` entry point | Register `git-tree`; mount the component to fill the editor (Concern 1); `FileTreeProvider` `.git` marker detection + icon hint + `getNavigationUrl` redirect (Concern 2B); error-message body when git unavailable (Concern 4). |
| US-613 | File Diff editor | Register `file-diff` (new Monaco-diff editor, D2); `from`/`to` toolbar dropdowns (reuse the Git Tree component in a popover); default `from` = staged-or-`HEAD` blob, `to` = current editor content (Concern 5). |

**Order / dependencies:** US-610 (foundation) → US-611 (component) → US-612 + US-613 (both consume the component; US-613's dropdowns reuse it in a popover). Post-v1 features are **separate tasks created on demand**; the epic may close after v1 or stay open as their home. Epic close-out (`/review`, `/document`, `/userdoc`) runs per the deferred-review model when the user decides to close.

## Notes

### 2026-06-07 — epic closed; v1 shipped (US-610–US-613)
- All four v1 tasks implemented, tested, committed, and pushed (commits `471be9a..1b9860f` on `upcoming-v4.0.3`). The three v1 deliverables landed as scoped: the reusable Git Tree component, the (just-the-component) Git Tree editor opened from the `.git` Explorer node, and the simple File Diff ("Git Diff") editor — all behind the off-by-default "Git integration" setting.
- **Close-out (deferred-review model):** `/review`, `/document`, `/userdoc` run once over the whole epic rather than per task.
  - **`/review`:** clean against architecture rules (folder placement, dynamic imports, no hardcoded colors, editor-types sync, model-view, disposal/Tooltip fixes). One must-fix raised — `styled.*` used in `components/git-tree/` (`GitTree.tsx`, `BranchTreeCell.tsx`), which `coding-style.md:109` reserves for `uikit/`/`ui/`. **Disposition: accepted** as consistent with existing `components/` precedent (`tree-provider/`, `file-search/`, `icons/` all use `styled.*`); `BranchTreeCell` is an SVG painter with no UIKit-prop equivalent. The coding-style rule was left **unchanged** — reconciling the rule with the `components/` layer reality is a possible future cleanup, not a v1 blocker. Non-blocking suggestions logged (palette lookup by name, `ILink.icon` string vs union, per-session probe caching).
  - **`/document`:** updated `editors.md` (catalog + host-state-driven switch offer), `folder-structure.md` (`git-tree/` KEEP folder + `git-service.ts` + `git-ipc.ts`), `state-management.md` (host-centric git detection), `overview.md` (KEEP-folder enumerations), and `CLAUDE.md` (Key Files git cluster).
  - **`/userdoc`:** updated `docs/whats-new.md` (v4.0.3 entries), `docs/editors.md` (Git Tree / Git Diff / Git Integration setting sections + switching table), `docs/index.md` (feature bullet).
- **Scope held:** v1 is strictly read/inspect — no mutating git operations. Post-v1 features (write ops, branch/commit actions, detail panes, status decorations, multi-repo, auto-refresh) remain individual tasks created on demand.
- Moved the epic block (tasks `[x]`) to [`/doc/epics/completed.md`](completed.md) and removed it from the dashboard.

### 2026-06-06 — carved v1 tasks (US-610–US-613); epic → Active
- Design is complete (all concerns resolved). Carved the v1 implementation into four placeholder tasks: **US-610** (git service + IPC + setting + detection), **US-611** (Git Tree component + swimlane layout), **US-612** (Git Tree editor + Explorer `.git`), **US-613** (File Diff editor). Title + scope only — each gets its own deep investigation + detailed doc (and any task-specific concerns) before implementation.
- Moved the epic from **Planned → Active** on the dashboard with the four tasks as `[ ]` sub-items. Status set to Active.

### 2026-06-06 — resolved Concern 6: port VS Code's swimlane algorithm (MIT)
- Researched reusable implementations. **mhutchie/vscode-git-graph has no OSS license** (author confirms it can't be forked) → off-limits. `@gitgraph/core` is for authoring graphs, not laying out a real DAG; `dagre`/`d3-dag` produce general layered diagrams, not compact lanes.
- Decision: **port VS Code's commit-graph swimlane layout** ([`scmHistory.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/scm/browser/scmHistory.ts), `toISCMHistoryItemViewModelArray`, **MIT** — attribute in source). Its `inputSwimlanes`/`outputSwimlanes` per-commit model *is* the per-row layout `BranchTreeCell` needs — a near-drop-in for the Concern 9 design.
- Recorded the algorithm, render mapping, color rule, and `git log --topo-order --parents` input. Added decision D7. **This closes the last open design concern — the epic is design-complete and ready to carve v1 tasks.**

### 2026-06-06 — resolved Concern 4: opt-in "Git integration" setting (off by default)
- User decision: add a Persephone setting **"Git integration"**, **off by default**, to keep the app simple. The toggle gates *all* git behavior (Concern 2 detection, the File Diff switch, the `.git` Explorer icon/redirect) — when off, no git spawns at all.
- On enable, run an availability probe (`git --version`) on the settings page and report the result. If git is unavailable the user may still leave it on, but behavior degrades gracefully: the File Diff switch is not shown (detection fails → `gitRepo` null → `accepts()` -1), and the Git Tree editor renders an error message instead of the component. Runtime failures (git removed after enabling) degrade identically — the enable-time probe is UX confirmation, not the sole gate.
- Added decision D6; marked Concern 4 resolved; gated Concern 2 on the toggle; folded the setting into Initial Scope and Linked Tasks task 1. **Only Concern 6 (lane algorithm) remains open.**

### 2026-06-06 — locked the initial scope (v1) to three deliverables
- User fixed the epic's initial scope: (1) reusable Git Tree component, (2) a *very simple* Git Tree editor that is essentially just the component (opened from `.git`), (3) a *simple* File Diff editor — Monaco diff with two toolbar from/to dropdowns, default `from` = staged-or-`HEAD` blob, `to` = current editor content.
- Everything else is **out of scope of the initial implementation** (write ops, branch/commit actions, detail panes, status decorations, multi-repo, auto-refresh, …). After v1 the epic may close or stay open; further features become individual tasks created on demand — no pre-commitment.
- Added **Initial Scope (v1)** + **Out of scope** sections. Resolved Concern 1 (editor = just the component), Concern 5 (from/to dropdowns + default), Concern 8 (strictly read-only) for v1; set Concern 7 to a simple capped-load stance. Remaining design gates before carving tasks: Concern 6 (lane algorithm) + Concern 4 (git-missing). Sketched the v1 task shape in Linked Tasks.

### 2026-06-06 — resolved Concern 9: Git Tree component (AVGrid + SVG BranchTreeCell)
- Decided the history component is a reusable `AVGrid` with a custom `BranchTreeCell` graph column, reused verbatim in both the Git Tree editor and the File Diff commit-picker popover.
- Cell renderer is **SVG** (over canvas) — HiDPI-crisp, themeable, declarative under virtualization, clickable nodes. Fixed row height (AVGrid prop) + fixed lane width; draw each row at a constant `requiredWidth` and clip via `overflow: hidden`; column initial width = `requiredWidth`, resizable. Lane colors go into `color.ts`.
- Going **graph-from-day-one** (not linear-first). The render-agnostic hard part — the global lane-assignment pass over `git log --parents` producing the per-row layout model — is folded into Concern 6 (now 🟡 partial: rendering decided, algorithm TBD). Added decision D5; updated the Proposed-shape section and concern-status table.

### 2026-06-06 — resolved Concern 2 (detection) + Concern 3 (form factor); named the two editors
- Renamed the two planned editors to **Git Tree** (branch/commit tree, opened from the `.git` Explorer node) and **File Diff** (per-file Monaco-diff editor via the switch widget).
- **Concern 3 resolved:** both are standard registered editors. File Diff is a *new* editor on Monaco's diff (D2) surfaced via the editor switch widget — explicitly **not** a reuse of `CompareEditor`/Compare mode, and not a bespoke page mode.
- **Concern 2 resolved (host-centric, D4):** git state lives on the shared `TextFileModel` host as `gitRepo`, detected once on `filePath` resolve via `git rev-parse --show-toplevel` (dir-cached, through `git-service`). File Diff's registry `accepts({host})` reads `host.state.gitRepo`, so **all** text editors inherit the switch for free (they all call `findEditorsAccepting(this._host)`). One reactivity addition: `SwitchWidget` must also subscribe to `contentHost.state` so it re-renders when async detection completes. Gated on *in a repo regardless of changes*.
- **`.git` in Explorer:** `FileTreeProvider.list()` verifies a real `.git` via a `HEAD`+`objects` marker heuristic (no git spawn), sets `target: "git-tree"` + an icon hint on the item, and `getNavigationUrl()` redirects it to open the Git Tree editor. Chosen micro-decisions: marker heuristic over git spawn; an `icon` hint on `ILink` over a renderer special-case.

### 2026-06-06 — epic created as a draft
- Triggered by a vision for Git in Persephone: a Git Tree editor (branch tree + commit list/graph, "Get Extensions"-style) and a File Diff editor for text files (unstaged working-tree changes + any-two-commit diffs).
- Decisions locked up front: **simple-git** in the main process (D1) and **Monaco diff** for File Diff (D2). Rationale for simple-git over `nodegit`/`isomorphic-git`: no native build against the Castlabs Electron fork, full git parity, matches VS Code's shell-out model, and Persephone already has the main-process service + IPC pattern.
- Seeded the open concerns as the discussion agenda.
