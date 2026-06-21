# US-745: `board-manifest.json` — board identity file

**Epic:** [EPIC-035 — Boards Anywhere](../../epics/EPIC-035.md)
**Status:** Planned (doc ready — awaiting "let's implement")

## Goal

Introduce **`board-manifest.json`** as the canonical "this folder is a board" marker: define its schema + a small read/write/detect utility, write it into every newly-created board, and **require it for a folder to be recognized as a board** — a subfolder of `boards/` with no manifest is no longer listed. This is the **foundation** for board portability (US-746, which generalizes a board's *location*) and Explorer recognition (US-749). Trust is never stored in the manifest (EPIC-035 C2).

## Background

### How boards are created today

`BoardEditorModel.createBoard()` / `createDemoBoard()` (`src/renderer/editors/board/BoardEditorModel.ts:294-301`) both funnel into the private `createFromTemplate()` (`:305-324`):

```ts
private async createFromTemplate(name: string, template: string): Promise<void> {
    const dir = fpJoin(this.state.get().persephonePath, "boards", name);
    if (await fs.exists(dir)) {
        throw new Error(`A board named "${name}" already exists.`);
    }
    try {
        await scaffoldBoard(dir, template);
    } catch (err) {
        // Template missing / copy failed — still produce a usable (empty) board.
        await fs.mkdir(dir);
        ui.notify(`Board created, but the template could not be copied: ${...}`, "warning");
    }
    await this.refreshBoards();
    this.selectBoard(name);
}
```

`scaffoldBoard(destDir, template)` (`src/renderer/editors/board/board-scaffold.ts:21-29`) **recursively copies** a bundled template folder into the new board, then copies the shared `board-base.css`:

```ts
export async function scaffoldBoard(destDir: string, template = "board-template"): Promise<void> {
    const appRoot = await api.getAppRootPath();
    const assetsRoot = fpJoin(appRoot, "assets");
    await copyDirInto(fpJoin(assetsRoot, template), destDir);
    await fs.copyFile(fpJoin(assetsRoot, "board-base.css"), fpJoin(destDir, "board-base.css"));
}
```

Because the copy is recursive and unconditional, **any file added to a template folder is automatically copied into new boards** — that is how US-745 ships the manifest on the happy path.

### Template asset folders (hand-maintained, shipped via `forge.config.ts` `extraResource`)

```
assets/board-template/   →  app.js, index.html, scripts/hello.js, CLAUDE.md
assets/demo-board/        →  app.js, index.html, style.css, icon.svg
```

These are **source assets, not build artifacts** — adding a file here is correct and expected (unlike `assets/editor-types/`, which is generated and must not be hand-edited).

### How boards are enumerated today (changed by this task)

`BoardEditorModel.refreshBoards()` (`:196-222`) lists **every subdirectory** of `<persephonePath>/boards` as a board — it does not look for a manifest. US-745 **changes this**: a subfolder is a board **iff** it carries a `board-manifest.json` (Step 4). US-746 later generalizes the *location* (boards outside `boards/`); the manifest-presence rule established here is what makes that possible.

### `fs` API (renderer Object Model — `src/renderer/api/fs.ts`)

- `fs.readFile(path): Promise<ITextFile>` → `ITextFile.content` is the decoded text (`:272`, field confirmed at `:56-137`). Throws if the file is missing.
- `fs.write(path, content): Promise<void>` → writes UTF-8 text, auto-creating parent dirs (`:289`).
- `fs.exists(path): Promise<boolean>` (`:318`).

Use `app.fs` only — never `require("fs")` (coding-style rule). Paths via `fpJoin` from `core/utils/file-path` — never `require("path")`.

### Icon resolution (already shipped — US-744; unchanged)

`board-icon-cache.ts` probes `icon.svg` / `icon.png` / `icon.ico` (first match wins) in the board folder. This stays the icon mechanism — the manifest has **no** `icon` field. A board declares its icon by dropping an `icon.*` file, which is simple and already works.

## Implementation plan

### Step 1 — New module: `src/renderer/editors/board/board-manifest.ts`

The schema + constants + read/write/detect helpers. Schema kept minimal (`schemaVersion`, optional `name`, optional `icon`); `fileExtensions` is **reserved** (documented in a comment, not added as a field, so its absence can't be mistaken for "supported but empty").

```ts
import { fs } from "../../api/fs";
import { fpJoin } from "../../core/utils/file-path";

/** File name of the board-identity manifest, at the board folder root. */
export const BOARD_MANIFEST_FILE = "board-manifest.json";

/** Current manifest schema version. Bump on a breaking shape change. */
export const BOARD_MANIFEST_SCHEMA_VERSION = 1;

/**
 * Board-identity manifest (EPIC-035 / US-745). Its presence is what marks a folder
 * as a board (it gates enumeration; consumed further in US-746 / US-749).
 *
 * v1 holds `schemaVersion` + optional **descriptive metadata** (name, description,
 * author, repository) — surfaced to humans/agents, but **no behavior-driving fields**.
 * Trust is NEVER stored here (a received board must not be able to self-trust —
 * EPIC-035 C2); trust lives in the app-side registry.
 *
 * Reserved for a future epic: `fileExtensions?: string[]` — registers the board as
 * the editor for matching files (the "Custom Editor" axis). Not part of v1.
 */
export interface BoardManifest {
    /** Schema version of this manifest. */
    schemaVersion: number;
    /** Optional display-name override. Falls back to the board folder name. */
    name?: string;
    /** Optional free-text description. Metadata only — does not drive behavior. */
    description?: string;
    /** Optional author / owner. Metadata only. */
    author?: string;
    /** Optional source-repository URL. Metadata only. */
    repository?: string;
}

/** Absolute path to a board's manifest. */
export function boardManifestPath(boardRoot: string): string {
    return fpJoin(boardRoot, BOARD_MANIFEST_FILE);
}

/** A fresh, minimal manifest. */
export function defaultBoardManifest(): BoardManifest {
    return { schemaVersion: BOARD_MANIFEST_SCHEMA_VERSION };
}

/** True iff the folder carries a `board-manifest.json`. Cheap existence check —
 *  does not parse. (Enumeration/Explorer gating consume this in US-746/US-749.) */
export async function isBoardFolder(boardRoot: string): Promise<boolean> {
    return fs.exists(boardManifestPath(boardRoot));
}

/** Read + parse a board's manifest. Returns null if absent or unparseable — callers
 *  treat a malformed/missing manifest as "no metadata", never throw. A manifest with
 *  an unknown (higher) schemaVersion is still returned (best-effort forward-compat). */
export async function readBoardManifest(boardRoot: string): Promise<BoardManifest | null> {
    const p = boardManifestPath(boardRoot);
    try {
        if (!(await fs.exists(p))) return null;
        const file = await fs.readFile(p);
        const parsed = JSON.parse(file.content);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed as BoardManifest;
    } catch {
        return null;
    }
}

/** Write a manifest (2-space JSON + trailing newline for human-editability). */
export async function writeBoardManifest(boardRoot: string, manifest: BoardManifest): Promise<void> {
    await fs.write(boardManifestPath(boardRoot), JSON.stringify(manifest, null, 2) + "\n");
}

/** Write a default manifest only if the folder doesn't already have one. Used by the
 *  create flow so every new board — including the template-copy-failure fallback —
 *  is a valid, identifiable board. No-op when the template already supplied one. */
export async function ensureBoardManifest(boardRoot: string): Promise<void> {
    if (await isBoardFolder(boardRoot)) return;
    await writeBoardManifest(boardRoot, defaultBoardManifest());
}
```

### Step 2 — Add the manifest to the blank template

New file **`assets/board-template/board-manifest.json`**:

```json
{
  "schemaVersion": 1,
  "description": "",
  "author": "",
  "repository": ""
}
```

The descriptive keys ship **empty** so an author/agent sees them and can fill them in — none affect behavior. Name-agnostic on purpose: the display name is the board **folder** name (user-chosen at create time), so the template carries **no** `name` key to substitute — consistent with the existing template philosophy.

### Step 3 — Add the manifest to the demo template

New file **`assets/demo-board/board-manifest.json`** — populated, to model the metadata for authors:

```json
{
  "schemaVersion": 1,
  "description": "Self-documenting demo board showcasing the persephone bridge, theming, and capabilities.",
  "author": "Persephone",
  "repository": "https://github.com/andriy-viyatyk/persephone"
}
```

No `icon` field — `assets/demo-board/icon.svg` already exists and the probe finds it. No `name` field — same reasoning as Step 2 (the user names the demo board on create).

### Step 4 — Gate enumeration on the manifest

In `BoardEditorModel.refreshBoards()` (`src/renderer/editors/board/BoardEditorModel.ts:196-222`), filter the `boards/` subdirectories to those that carry a manifest. Add the import:

```ts
import { isBoardFolder } from "./board-manifest";
```

Before → after of the enumeration body:

```ts
        if (await fs.exists(boardsDir)) {
            const entries = await fs.listDirWithTypes(boardsDir);
-           boards = entries
-               .filter((e) => e.isDirectory)
-               .map((e) => e.name)
-               .sort((a, b) => a.localeCompare(b));
+           const dirs = entries.filter((e) => e.isDirectory).map((e) => e.name);
+           // A folder is a board only if it carries board-manifest.json.
+           const isBoard = await Promise.all(dirs.map((n) => isBoardFolder(fpJoin(boardsDir, n))));
+           boards = dirs.filter((_, i) => isBoard[i]).sort((a, b) => a.localeCompare(b));
        }
```

### Step 5 — Guarantee a manifest on every create path

In `BoardEditorModel.createFromTemplate()` (`src/renderer/editors/board/BoardEditorModel.ts:305-324`), call `ensureBoardManifest(dir)` **after** the try/catch and **before** `refreshBoards()`. This covers both paths: the happy path (template already includes the manifest → no-op) and the fallback path (empty `mkdir` → writes a default), so a board is **always** valid even when the template copy fails.

Add the import:

```ts
import { ensureBoardManifest } from "./board-manifest";
```

Before → after of the tail of `createFromTemplate`:

```ts
        } catch (err) {
            // Template missing / copy failed — still produce a usable (empty) board.
            await fs.mkdir(dir);
            ui.notify(`Board created, but the template could not be copied: ${...}`, "warning");
        }
+       // Guarantee the board-identity manifest exists regardless of which path ran
+       // above (template copy or empty fallback) — a board is identified by it.
+       await ensureBoardManifest(dir);
        await this.refreshBoards();
        this.selectBoard(name);
```

### Step 6 — Backfill manifests for the existing local boards

The local project at `D:\projects\persephone\.persephone\boards` holds **11** boards that predate the manifest; once Step 4 lands they'd drop off the list. Write `board-manifest.json` (`{ "schemaVersion": 1 }`) into each:

`Chart.js`, `Demo`, `Dialog`, `Flatpickr`, `Mermaid`, `SortableJS`, `Split.js`, `Tabulator`, `Tippy.js`, `Tom Select`, `marked + highlight.js`

This folder is gitignored — a local-only one-time fix, not a committed change. (These are the only boards that exist anywhere; there is no other compatibility surface to worry about.)

### Step 7 — Document the manifest in the board authoring guide

Update **`assets/board-template/CLAUDE.md`** (copied into every board — the canonical reference a board-author agent reads) to describe `board-manifest.json`: what it is (the board-identity file — a folder is a board iff it has one), its fields (`schemaVersion`; optional descriptive metadata `name`/`description`/`author`/`repository` — nothing that drives behavior), that it must **not** carry trust, that hand-editing `name` overrides the folder-name display, and that the board icon stays a dropped `icon.*` file (not a manifest field). Keep it **ticket-free** (no `US-`/`EPIC-` ids — consumer-facing doc rule).

## Concerns / resolved decisions

- **Q1 — Does US-745 gate enumeration on the manifest?** Yes (user, 2026-06-21). `refreshBoards` lists a `boards/` subfolder only if it has a `board-manifest.json`; manifest-less folders are not boards. No backward-compatibility hedging — the manifest is simply required, and the only existing boards (this project's local set) are backfilled in Step 6. US-746 then generalizes *location*. ✅ decided.
- **Q2 — Why no `name` in the template manifests?** The display name is the folder name (user-chosen at create). A static `name` would override it for every copy. Manifests ship name-agnostic; `name` is for a user/agent to add deliberately later. ✅ decided.
- **Q3 — `icon` field in the manifest?** No (user, 2026-06-21). Dropped. The existing `icon.svg`/`png`/`ico` file-probe (US-744) is simple and works; the manifest carries no `icon` field. ✅ decided.
- **Q4 — Module location (renderer-local vs `src/shared`).** Placed renderer-local (`editors/board/board-manifest.ts`) because only renderer code creates/reads boards in v1. If US-749 (Explorer) or US-750 (MCP/main) later needs it in the main process, promote to `src/shared` then. ✅ decided, revisit-if-needed flagged.
- **Q7 — General-purpose metadata fields.** The manifest may carry descriptive fields — `name`, `description`, `author`, `repository` — pure metadata for humans/agents, **never** driving board behavior (behavior-driving fields like `fileExtensions` are the Custom Editor successor epic). The blank template ships them empty for discoverability; the demo ships them populated. The rare template-copy-failure fallback writes the minimal valid manifest (`{ schemaVersion }` via `defaultBoardManifest`) — the descriptive keys are optional, so their absence there is harmless. ✅ decided (user, 2026-06-21).
- **Q5 — Forward-compat on `schemaVersion`.** `readBoardManifest` returns a manifest even if `schemaVersion` is higher than known (best-effort), and returns `null` only for missing/unparseable files. No hard version rejection in v1. ✅ decided.
- **Existing local boards.** The 11 boards in `D:\projects\persephone\.persephone\boards` predate the manifest and would vanish once enumeration requires it — backfilled in Step 6 (gitignored, local-only). They are the only boards that exist anywhere, so this is the entire migration.

## Acceptance criteria

1. Creating a **blank** board produces a valid `board-manifest.json` at the board root (`schemaVersion: 1` plus the empty `description`/`author`/`repository` keys from the template).
2. Creating a **demo** board likewise produces a valid `board-manifest.json`.
3. When the template copy fails (fallback path), the board still gets a default manifest via `ensureBoardManifest`.
4. `readBoardManifest` round-trips a written manifest, returns `null` for a missing/malformed file; `isBoardFolder` is `true` iff the manifest exists.
5. A `boards/` subfolder **without** a `board-manifest.json` is **not** listed; a folder **with** one is. The 11 backfilled local boards all still appear and open.
6. `assets/board-template/CLAUDE.md` documents the manifest (ticket-free).
7. `npx tsc --noEmit` is clean; `npm run lint` passes for the new/changed files.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/editors/board/board-manifest.ts` | **New** — schema type, constants, `read`/`write`/`isBoardFolder`/`ensureBoardManifest` helpers |
| `assets/board-template/board-manifest.json` | **New** — `{ "schemaVersion": 1 }` |
| `assets/demo-board/board-manifest.json` | **New** — `{ "schemaVersion": 1 }` |
| `src/renderer/editors/board/BoardEditorModel.ts` | `refreshBoards` filters to manifest-bearing folders; `createFromTemplate` calls `ensureBoardManifest(dir)`; imports `isBoardFolder` + `ensureBoardManifest` |
| `.persephone/boards/*/board-manifest.json` *(local, gitignored)* | Backfill the 11 existing local boards (one-time) |
| `assets/board-template/CLAUDE.md` | Document `board-manifest.json` (ticket-free) |

### Files that need NO changes (verified)

- `board-scaffold.ts` — recursive copy already carries the new template file; no edit needed.
- `BoardEditorState` — still keyed by board folder name; shape unchanged.
- `board-icon-cache.ts` — unchanged; icons stay a file-probe (`icon.svg`/`png`/`ico`), no manifest field.
- `project-trust.ts`, `parsers.ts`, `resolvers.ts`, Explorer — untouched (later tasks).
