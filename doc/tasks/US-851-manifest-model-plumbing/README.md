# US-851: Manifest + base-model plumbing for declared secondary views

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md)
**Status:** 📝 Planned — ready to implement

## Goal

Lay the data-model foundation for board secondary views: let a board **declare** one or more secondary views in `board-manifest.json`, carry those declarations on the base `BoardEditorModel`, and derive the `board-secondary:<viewId>` sidebar panel-id list the shell already knows how to render. This is pure plumbing — **no bridge wiring, no iframe rendering, no runtime control** (those are US-852 / US-853 / US-854). After this task, opening a board with declared secondary views populates `state.secondaryViewDefs` and `state.secondaryView`, but nothing renders yet.

## Background

### What already exists (verified 2026-07-15)

- **Manifest module** — `src/renderer/editors/board/board-manifest.ts` holds `BoardManifest` (optional additive fields need **no** `schemaVersion` bump), `readBoardManifest()` (returns `null` on missing/malformed, never throws), and the Custom-Editor reader `getBoardEditorAssociation()` (gated on `fileMasks`). Secondary views must be read by a **separate, `fileMasks`-independent** reader (EPIC-044 O1 — secondary views are general board functionality, not tied to the custom-editor axis).
- **Base board model** — `src/renderer/editors/board/BoardEditorModel.ts`:
  - `BoardEditorState` (line 17) already declares `secondaryView?: string[]` (line 48) — the base `EditorModel` panel-contribution seam — **but nothing ever populates it**.
  - `initFromBoardRoot()` (line 203) and `restore()` (line 222) are the two entry paths; **both funnel through `refreshBoards()`** (line 235), which currently only calls `isBoardFolder()` (a cheap existence check that does **not** parse the manifest).
  - `selectBoard()` (line 252) sets `selectedBoard` / `iconKey` / `reloadToken`.
- **Base panel seam** — `src/renderer/editors/base/EditorModel.ts`: `get/set secondaryView` (line 173-179) reads/writes `state.secondaryView`; `contributesPanels()` (line 182) returns `(state.secondaryView?.length ?? 0) > 0`; `beforeNavigateAway()` (line 135) clears `secondaryView` (this is what gives boards Pattern-A teardown for free — D8, no override needed).
- **Persistence** — base `EditorModel.getRestoreData()` (line 341) serializes the **whole** `state` object into `EditorDescriptor.state`. So a new `BoardEditorState` field like `secondaryViewDefs` **persists automatically**. On restore, `board-view` is in `NO_HOST_EDITOR_IDS` (`PagesPersistenceModel.ts:31`) → `Object.assign(state, d.state)` (line 134); content-host boards take the `d.host` branch (line 85) and reconstruct via `applyRestoreData` → both copy `secondaryViewDefs` back. `BoardContentEditorModel.restore()` calls `super.restore()` (line 136), so content-host boards inherit the seed path with no extra work.

### Canonical names (from EPIC-044 — authoritative)

| Concept | Name | Where |
|---------|------|-------|
| Manifest field | `secondaryViews: SecondaryViewDecl[]` | `board-manifest.ts` |
| View declaration shape | `SecondaryViewDecl = { id: string; html?: string; title?: string; icon?: string }` | `board-manifest.ts` |
| Runtime set (model state) | `secondaryViewDefs?: SecondaryViewDecl[]` | `BoardEditorState` |
| Derived panel-id list (existing) | `secondaryView?: string[]` | `BoardEditorState` (already present) |
| Shared-state store (added, unused in this task) | `sharedState?: Record<string, unknown>` | `BoardEditorState` |
| Restorable-keys declaration (added, unused in this task) | `sharedStateRestorableKeys?: string[]` | `BoardEditorState` |
| Panel-id family | `board-secondary:<viewId>` | new `board-secondary.ts` |

## Implementation plan

### Step 1 — Manifest: `SecondaryViewDecl` type, field, and a `fileMasks`-independent reader

**File:** `src/renderer/editors/board/board-manifest.ts`

1a. Add the exported view-declaration interface (place it above `BoardManifest`):

```ts
/**
 * One secondary (sidebar) view a board declares (EPIC-044). `id` is the stable,
 * author-supplied view key (must NOT contain "::", the sidebar composite-key
 * separator). `html` is the board-relative entry file (defaults to the main
 * entry, "index.html", so one file can serve every view and branch on
 * `persephone.view`). `title` / `icon` label the sidebar panel.
 */
export interface SecondaryViewDecl {
    id: string;
    html?: string;
    title?: string;
    icon?: string;
}
```

1b. Add the optional field to `BoardManifest` (after the Custom-Editor block, ~line 64). It is additive and metadata-independent of `fileMasks`:

```ts
    /**
     * Secondary (sidebar) views this board contributes (EPIC-044). Independent of
     * `fileMasks` / the custom-editor axis — a plain board can declare them too.
     * Read via `readBoardSecondaryViews` (NOT `getBoardEditorAssociation`).
     */
    secondaryViews?: SecondaryViewDecl[];
```

1c. Add the reader — separate from `getBoardEditorAssociation`, pure, forgiving, and it **rejects ids containing `::`** and empty ids, de-dupes by id, trims optional strings:

```ts
/**
 * Extract the declared secondary views from a manifest. Independent of `fileMasks`
 * (EPIC-044 O1). Forgiving: drops non-object entries, entries with a missing/empty
 * `id`, ids containing "::" (the `<editorId>::<panelId>` composite-key separator),
 * and duplicate ids (first wins). Non-array / absent → []. Never throws.
 */
export function readBoardSecondaryViews(
    manifest: BoardManifest | null | undefined,
): SecondaryViewDecl[] {
    const raw = manifest?.secondaryViews;
    if (!Array.isArray(raw)) return [];
    const out: SecondaryViewDecl[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const d = entry as SecondaryViewDecl;
        const id = typeof d.id === "string" ? d.id.trim() : "";
        if (!id || id.includes("::") || seen.has(id)) continue;
        seen.add(id);
        const html = typeof d.html === "string" && d.html.trim() ? d.html.trim() : undefined;
        const title = typeof d.title === "string" && d.title.trim() ? d.title.trim() : undefined;
        const icon = typeof d.icon === "string" && d.icon.trim() ? d.icon.trim() : undefined;
        out.push({ id, html, title, icon });
    }
    return out;
}
```

### Step 2 — Panel-id helpers (new module)

**File (new):** `src/renderer/editors/board/board-secondary.ts`

The `board-secondary:<viewId>` scheme is consumed by US-853's prefix-aware registry; give it a single home now (mirrors `boardEditorId` / `parseBoardEditorId` in `custom-editor-registry.ts`):

```ts
/** Panel-id prefix for a board's declared secondary views (EPIC-044). Each declared
 *  view maps to `board-secondary:<viewId>`; the sidebar composite key is
 *  `<editorId>::board-secondary:<viewId>`. */
export const BOARD_SECONDARY_PREFIX = "board-secondary:";

/** Build the sidebar panel id for a board secondary view id. */
export function boardSecondaryPanelId(viewId: string): string {
    return BOARD_SECONDARY_PREFIX + viewId;
}

/** True iff `panelId` belongs to the board-secondary family. */
export function isBoardSecondaryPanelId(panelId: string): boolean {
    return panelId.startsWith(BOARD_SECONDARY_PREFIX);
}

/** Extract the view id from a `board-secondary:<viewId>` panel id, or null. */
export function parseBoardSecondaryPanelId(panelId: string): string | null {
    return isBoardSecondaryPanelId(panelId)
        ? panelId.slice(BOARD_SECONDARY_PREFIX.length)
        : null;
}
```

### Step 3 — `BoardEditorState`: add the three fields

**File:** `src/renderer/editors/board/BoardEditorModel.ts` (interface at line 17)

Extend the existing `secondaryView?` doc-comment region with the new fields. `secondaryView` stays as-is; add `secondaryViewDefs`, `sharedState`, `sharedStateRestorableKeys`:

```ts
    /** Sidebar panel contributions — DERIVED from `secondaryViewDefs`
     *  (`board-secondary:<id>` per declared view). Read by `contributesPanels()`. */
    secondaryView?: string[];
    /** Declared secondary views (EPIC-044): seeded from the manifest on first load
     *  (a persisted set wins — D6), replaced at runtime by `setSecondaryViews` (US-854).
     *  `secondaryView` is derived from this. Persists as part of the board state. */
    secondaryViewDefs?: SecondaryViewDecl[];
    /** Shared-state channel store (EPIC-044 / D1) — the single in-memory state object
     *  mirrored into every board frame via `persephone.state.*`. Populated in US-852;
     *  declared here so the field exists. Only `sharedStateRestorableKeys` are persisted
     *  (opt-in, D9 — the US-852 `getRestoreData` override, NOT the base full-state dump). */
    sharedState?: Record<string, unknown>;
    /** Keys of `sharedState` the board declared persistable via `persephone.state.init`
     *  (EPIC-044 / D9). Populated in US-852. */
    sharedStateRestorableKeys?: string[];
```

Add the import at the top (line 11 region, alongside `isBoardFolder`):

```ts
import { isBoardFolder, readBoardManifest, readBoardSecondaryViews, type SecondaryViewDecl } from "./board-manifest";
import { boardSecondaryPanelId } from "./board-secondary";
```

> **Persistence note for the implementer:** the base `EditorModel.getRestoreData()` serializes the *whole* `state`. In US-851 nothing populates `sharedState`, so it persists as `undefined` (harmless). Do **not** rely on that full-state dump for `sharedState` once US-852 populates it — US-852 adds a `getRestoreData()` override that persists only `pick(sharedState, sharedStateRestorableKeys)`. `secondaryViewDefs` is small and *is* meant to persist in full via the base dump.

### Step 4 — Seed + derive on the base model

**File:** `src/renderer/editors/board/BoardEditorModel.ts`

Add two private helpers, and call the seeder from `refreshBoards()` (the shared async path both `initFromBoardRoot` and `restore` already invoke — cleaner than duplicating the derive in three methods; the epic crux lists `selectBoard`/`initFromBoardRoot`/`restore` but they all converge on `refreshBoards`).

4a. Add helpers (e.g. just below `refreshBoards`):

```ts
/** Seed `secondaryViewDefs` from the manifest on FIRST load only — a persisted /
 *  restored set wins (D6 / US-855 restore precedence) — then derive the panel-id list.
 *  Idempotent: once `secondaryViewDefs` is defined it is never re-seeded here. */
private async seedSecondaryViews(): Promise<void> {
    const boardRoot = this.state.get().boardRoot;
    if (!boardRoot) return;
    if (this.state.get().secondaryViewDefs === undefined) {
        const manifest = await readBoardManifest(boardRoot);
        const defs = readBoardSecondaryViews(manifest);
        this.state.update((s) => { s.secondaryViewDefs = defs; });
    }
    this.deriveSecondaryPanels();
}

/** Recompute `state.secondaryView` (the derived panel-id list `contributesPanels()`
 *  reads) from `state.secondaryViewDefs`. Undefined when there are no defs. */
protected deriveSecondaryPanels(): void {
    this.state.update((s) => {
        const defs = s.secondaryViewDefs ?? [];
        s.secondaryView = defs.length ? defs.map((d) => boardSecondaryPanelId(d.id)) : undefined;
    });
}
```

(`deriveSecondaryPanels` is `protected` so US-854's `setSecondaryViews` can reuse it.)

4b. Wire into `refreshBoards()` — seed when the board is valid, clear the derived panels when it is not:

**Before** (line 235-248):
```ts
    async refreshBoards(): Promise<void> {
        const boardRoot = this.state.get().boardRoot;
        if (!boardRoot) return;
        invalidateBoardIcon(boardRoot);
        let valid = false;
        try {
            valid = await isBoardFolder(boardRoot);
        } catch {
            valid = false;
        }
        this.state.update((s) => {
            if (!valid) s.selectedBoard = undefined;
        });
    }
```

**After:**
```ts
    async refreshBoards(): Promise<void> {
        const boardRoot = this.state.get().boardRoot;
        if (!boardRoot) return;
        invalidateBoardIcon(boardRoot);
        let valid = false;
        try {
            valid = await isBoardFolder(boardRoot);
        } catch {
            valid = false;
        }
        this.state.update((s) => {
            if (!valid) s.selectedBoard = undefined;
        });
        // Seed/derive the declared secondary views (EPIC-044). Only when the board
        // resolves; a missing board contributes no panels.
        if (valid) {
            await this.seedSecondaryViews();
        } else {
            this.state.update((s) => { s.secondaryView = undefined; });
        }
    }
```

No change needed in `initFromBoardRoot` / `restore` / `selectBoard` — they already call `refreshBoards`. `BoardContentEditorModel` inherits the whole path (`restore()` → `super.restore()` → `refreshBoards`).

## Files NOT changed (so the implementer doesn't chase them)

- `src/renderer/editors/base/EditorModel.ts` — the `secondaryView` getter/setter, `contributesPanels()`, `beforeNavigateAway()` (Pattern-A teardown), and `getRestoreData()` already do exactly what we need. **No change.**
- `src/renderer/editors/board/BoardContentEditorModel.ts` — inherits seeding via `super.restore()`; no override needed in this task.
- `src/renderer/api/pages/PagesPersistenceModel.ts` — `secondaryViewDefs` round-trips through the existing `board-view` (`Object.assign`) and content-host (`applyRestoreData`) branches automatically. Restore *verification* is US-855's job, not a change here.
- Any rendering / registry / shim / bridge file — **out of scope**; this task produces state only, no UI.
- `board-manifest.ts` `getBoardEditorAssociation` / `normalizeFileMasks` — untouched; the new reader is independent.

## Concerns / open questions

All EPIC-044 open questions (O1–O8) are resolved. Task-local notes:

- **Deviation from the crux wording (accepted):** the epic lists seeding "in `selectBoard`/`initFromBoardRoot`/`restore`". We centralize in `refreshBoards()` because both entry paths already converge there — same effect, no duplication. Documented above so it's not read as a miss.
- **Manifest edits to `secondaryViews` are picked up only on first load** (seed-when-undefined), not on manual Refresh/Reload of an already-open board. This matches existing board behavior (files need a reload; icon refresh is explicit). Dynamic change is US-854 (`setSecondaryViews`); reload-time re-read hardening is US-855. Not a defect for this task.
- **`secondaryViewDefs = []`** is set (not left undefined) once a valid board with no declared views loads, so `contributesPanels()` is deterministically false and the seed guard is stable. An empty array persists trivially.

## Acceptance criteria

- `board-manifest.json` may carry an optional `secondaryViews: [{ id, html?, title?, icon? }]`; `readBoardSecondaryViews` parses it, dropping malformed/empty/`::`-containing/duplicate ids, and is independent of `fileMasks`.
- Opening a board (plain `board-view` or content-host) whose manifest declares N valid secondary views populates `state.secondaryViewDefs` (length N) and `state.secondaryView` (`["board-secondary:<id>", …]`); `contributesPanels()` returns true. A board with no declared views has `secondaryViewDefs = []` and `secondaryView` undefined; `contributesPanels()` is false.
- `secondaryViewDefs` survives an app restart for both board kinds (verified end-to-end in US-855; in this task, confirm the field is included in `getRestoreData()` output and reapplied).
- A persisted `secondaryViewDefs` is **not** overwritten by the manifest on restore (seed guard: `secondaryViewDefs === undefined`).
- `sharedState` / `sharedStateRestorableKeys` fields exist on `BoardEditorState` (unused this task).
- `npm run typecheck` and `npx eslint` clean; no behavior change for boards that declare no secondary views.

## Files changed summary

| File | Change |
|------|--------|
| `src/renderer/editors/board/board-manifest.ts` | Add `SecondaryViewDecl` interface, optional `BoardManifest.secondaryViews` field, and `readBoardSecondaryViews()` reader (fileMasks-independent, id-validated). |
| `src/renderer/editors/board/board-secondary.ts` | **New.** `BOARD_SECONDARY_PREFIX` + `boardSecondaryPanelId` / `isBoardSecondaryPanelId` / `parseBoardSecondaryPanelId` helpers. |
| `src/renderer/editors/board/BoardEditorModel.ts` | Add `secondaryViewDefs` / `sharedState` / `sharedStateRestorableKeys` to `BoardEditorState`; add `seedSecondaryViews()` + `deriveSecondaryPanels()`; wire seeding into `refreshBoards()`; new imports. |
