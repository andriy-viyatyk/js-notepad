# US-836: Board manifest — `fileMasks` + `editorPriority` + editor identity

**Epic:** [EPIC-042 — Boards as Custom Editors](../../epics/EPIC-042.md) · **task 1 of the build order** (foundation; no dependencies)
**Status:** 📝 Planned — carved 2026-07-14, awaiting "let's implement"

## Goal

Extend the board-identity manifest (`board-manifest.json`) with the three behavior-driving
fields the Custom Editor axis needs — `fileMasks`, `editorPriority`, `editorName` —
plus a small **read + normalize** accessor and a **mask matcher** so every later task consumes
clean, validated association data and matches files identically. Update the board authoring
guide to document the new fields.

> **`fileMasks`, not `fileExtensions`.** A custom editor must be able to register for
> **compound / mask** patterns like `*.grid.json` or `*.drawio`, not only a bare extension.
> The field holds **glob masks** matched against the filename (`*` = any run, `?` = one char).
> A bare extension (`".drawio"` / `"drawio"`) is accepted and coerced to `*.drawio`.

This is a pure **data-model + docs** task. It wires nothing into resolution or the switch
widget yet (that is the later "Custom-editor registry" and "Resolution + switch" tasks). The
new fields are inert until those tasks read them.

## Background

### What exists today

- **`src/renderer/editors/board/board-manifest.ts`** — the whole manifest module:
  - `BoardManifest` interface: `schemaVersion` (required) + optional `name` / `description` /
    `author` / `repository`. A comment (lines 18–20) already **reserves** `fileExtensions?: string[]`
    for "the Custom Editor axis. Not part of v1." — **we implement it as `fileMasks` instead** (a
    file-mask field is strictly more expressive; the reserved name is superseded, not honored).
  - `BOARD_MANIFEST_SCHEMA_VERSION = 1`.
  - `readBoardManifest(boardRoot)` — reads + `JSON.parse`s, returns `null` on missing/malformed,
    **best-effort cast** `parsed as BoardManifest` (no field validation today).
  - `writeBoardManifest`, `ensureBoardManifest`, `defaultBoardManifest`, `isBoardFolder`,
    `boardManifestPath`.
- **`src/renderer/editors/base/editor-matchers.ts`** — the numeric priority ladder the CE1
  decision slots `editorPriority` into. `acceptFile` returns a number; the highest claimant
  wins file-open resolution:
  - `monaco` = `0` (floor / fallback for all files)
  - `grid-json` / `grid-csv` / `grid-jsonl` / `log-view` / specialized-json / `rest-client` /
    link / file-grid = `20`
  - `draw-view` (`.excalidraw`) = `50`
  - `pdf-view` / `image-view` / `archive-view` / `video-view` = `100`
  - `category-view` (`tree-category://`) = `200`
  - Two matching styles already coexist here: `matchesExtension(fileName, exts)` =
    `lower.endsWith(ext)` (e.g. `".pdf"`), and `matchesPattern(fileName, /\.grid\.json$/i)` — a
    **regex** for compound suffixes. So the built-ins already prove the compound-suffix case; our
    `fileMasks` matcher generalizes it (a glob mask → a case-insensitive RegExp) so a board can
    express `*.grid.json` declaratively. The later registry compares a **mask match** (boolean)
    then applies `editorPriority` on this same numeric ladder.
- **`assets/board-template/CLAUDE.md`** — the board authoring guide (copied into every new
  board). Its "Board identity: `board-manifest.json`" section (lines 8–28) documents the current
  fields and states the manifest "never controls behavior". This task adds the new optional,
  behavior-driving fields to that section.

### Design decisions this task implements (from EPIC-042)

- **CE1** — `editorPriority?: number` places the board on the ladder above. A board with
  `fileMasks` is **always** a switch option; `editorPriority` only decides whether it also
  becomes the **default** open editor. Omitted/`0` → switch-only, built-in default unchanged.
  For `.drawio` (no built-in claimant) any value `> 0` (e.g. `100`) makes the board the default.
- **CE5** — the display name for the switch widget is `editorName` (falls back to board `name`,
  then folder name).
- Trust gating (CE3) and registry reactivity (CE7) are **not** this task — they belong to the
  registry task. This task only defines and normalizes the fields.

## Implementation plan

### Step 1 — Extend the `BoardManifest` interface

**File:** `src/renderer/editors/board/board-manifest.ts`

Add three optional fields and rewrite the reservation comment (it currently says these are "not
part of v1"). Keep `schemaVersion` at `1` — these are **additive optional** fields, not a
breaking shape change, so no version bump.

```ts
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

    // ── Custom Editor axis (EPIC-042) — acted upon only when the board is TRUSTED ──
    /**
     * File masks this board is the editor for, matched against the file NAME (basename).
     * Globs: `*` = any run of chars, `?` = one char. Examples: "*.drawio", "*.grid.json".
     * `normalizeFileMasks` lowercases/trims and coerces a bare extension ("drawio",
     * ".DRAWIO") into a suffix mask ("*.drawio"). Empty/absent → not a file-associated editor.
     */
    fileMasks?: string[];
    /**
     * File-open resolution priority on Persephone's editor ladder (monaco 0 / grid 20 /
     * draw 50 / viewers 100 / category 200). The board becomes the DEFAULT editor for its
     * masks when this exceeds the best built-in claimant's priority for the file.
     * Omitted/0 → switch-option-only; the built-in default is unchanged. A board is always
     * a switch option regardless of this value.
     */
    editorPriority?: number;
    /**
     * Display name shown on the editor-switch widget for this board. Falls back to `name`,
     * then the board folder name.
     */
    editorName?: string;
}
```

Also update the module-header JSDoc (lines 10–21): remove the "Reserved for a future epic:
`fileExtensions`" paragraph and replace with a one-line note that the Custom Editor fields
(`fileMasks` / `editorPriority` / `editorName`) are now live but **only honored for trusted
boards** (the gate is applied by the consumer, EPIC-042 registry task, not here).

### Step 2 — Add a mask normalizer, a mask matcher, and a parsed-association accessor

**File:** `src/renderer/editors/board/board-manifest.ts` (append after `readBoardManifest`)

The raw manifest is user/agent-authored JSON — masks may be un-dotted, mixed-case, or non-array
garbage. Provide one normalizer, one matcher, and one high-level accessor so **every** downstream
consumer (registry, resolution, switch) shares identical parsing/matching and never re-implements it.

```ts
/**
 * Normalize a raw `fileMasks` value into lowercase, trimmed, de-duplicated glob masks.
 * A bare extension (no wildcard) is coerced to a suffix mask: "drawio" / ".DRAWIO" →
 * "*.drawio"; an explicit glob ("*.grid.json") is kept as-is. Non-string / empty entries
 * are dropped. Non-array input → [].
 */
export function normalizeFileMasks(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const entry of raw) {
        if (typeof entry !== "string") continue;
        let mask = entry.trim().toLowerCase();
        if (!mask) continue;
        // Forgiving: a bare extension (no glob char) becomes a "*.<ext>" suffix mask.
        if (!mask.includes("*") && !mask.includes("?")) {
            if (!mask.startsWith(".")) mask = "." + mask;
            mask = "*" + mask;
        }
        if (!out.includes(mask)) out.push(mask);
    }
    return out;
}

/** Compile a single glob mask into a case-insensitive, whole-name RegExp.
 *  `*` → any run, `?` → one char; every other glob char is literal. */
function maskToRegExp(mask: string): RegExp {
    // Escape regex specials EXCEPT the glob wildcards `*` and `?`, then expand those.
    const escaped = mask.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${body}$`, "i");
}

/** True iff `fileName` (a basename — caller strips the directory) matches the glob mask.
 *  `mask` is assumed already normalized (lowercase) by `normalizeFileMasks`. */
export function matchesFileMask(fileName: string, mask: string): boolean {
    return maskToRegExp(mask).test(fileName);
}

/** A board's parsed, validated file-editor association (Custom Editor axis). */
export interface BoardEditorAssociation {
    /** Normalized, lowercase glob masks (e.g. "*.drawio", "*.grid.json"). Guaranteed non-empty. */
    fileMasks: string[];
    /** Resolution priority (>= 0). Non-finite / negative input → 0. */
    editorPriority: number;
    /** Optional switch-widget display name (trimmed; empty → undefined). */
    editorName?: string;
}

/**
 * Extract the file-editor association from a manifest, or null if the board declares no
 * usable `fileMasks`. Pure — does NOT check trust (the caller gates on trust). This is the
 * single source of truth for how a manifest maps to an editor association.
 */
export function getBoardEditorAssociation(
    manifest: BoardManifest | null | undefined,
): BoardEditorAssociation | null {
    if (!manifest) return null;
    const fileMasks = normalizeFileMasks(manifest.fileMasks);
    if (fileMasks.length === 0) return null;
    const rawPriority = manifest.editorPriority;
    const editorPriority =
        typeof rawPriority === "number" && Number.isFinite(rawPriority) && rawPriority > 0
            ? rawPriority
            : 0;
    const name = typeof manifest.editorName === "string" ? manifest.editorName.trim() : "";
    return {
        fileMasks,
        editorPriority,
        editorName: name || undefined,
    };
}
```

**Do NOT** change `readBoardManifest`'s cast/return contract — later tasks call
`readBoardManifest(root)` then `getBoardEditorAssociation(manifest)`. Keeping them separate
preserves the "malformed → null metadata, never throw" behavior.

### Step 3 — Update the board authoring guide

**File:** `assets/board-template/CLAUDE.md`, "Board identity: `board-manifest.json`" section
(lines 8–28).

- Extend the example JSON with the new optional fields (commented as the Custom Editor axis).
- Add bullet docs:
  - `fileMasks` (optional) — glob masks (matched against the file name) this board edits, e.g.
    `["*.drawio"]` or `["*.grid.json"]`. `*` = any run, `?` = one char; a bare extension
    (`".drawio"`) is accepted and treated as `*.drawio`. Only honored when the board is
    **trusted**. Makes the board appear in the editor **switch** for matching files.
  - `editorPriority` (optional) — number; makes the board the **default** editor for its
    masks when it outranks the built-in editor. Omit/`0` → switch-only.
  - `editorName` (optional) — label shown on the switch widget (falls back to `name`).
- Soften the current absolute "it never controls behavior" line — descriptive metadata still
  doesn't, but these three fields **do** (trusted-only). Keep the "no secrets / no trust flags"
  warning.

> This guide is **consumer-facing** — keep it **ticket-free** (no `US-`/`EPIC-` ids), per the
> `/document` rules.

### Step 4 — No changes needed (documented so the implementer doesn't chase them)

- `defaultBoardManifest()` / `ensureBoardManifest()` — new fields are optional; a fresh board is
  not a custom editor by default. **Leave as-is.**
- The board scaffold / `tool-template` — a scaffolded board is not a custom editor by default.
- `editor-matchers.ts` — **read-only reference** for the ladder shape. Not modified here; the
  registry task compares a board's `matchesFileMask` result + `editorPriority` against these numbers.
- `mcp-res-boards.md` / `demo-board/` — the agent-facing lifecycle guide and demo don't cover the
  manifest field reference; leave for the epic close-out `/document` pass unless drift appears.

## Concerns / open questions

1. **Priority collisions with built-ins (informational, not this task).** `getBoardEditorAssociation`
   returns the raw priority; the CE2 tie-break (built-ins-first, then trusted-list order) is applied
   by the **resolution task**, not here. This task must not bake tie-break logic into the accessor.
2. **Masks match on the basename, and all matching lives in one helper.** `matchesFileMask` tests a
   **file name** (the caller strips the directory) so a mask like `*.drawio` isn't accidentally
   matched by a directory segment. Every consumer must call `normalizeFileMasks` + `matchesFileMask`
   rather than re-implement glob logic — flagged so behavior never drifts across the registry,
   resolution, and switch tasks.
3. **Compound / mask patterns are a first-class requirement (resolved).** `fileMasks` must support
   compound suffixes like `*.grid.json` and arbitrary globs — not just a single extension. This is
   why the field is masks (glob → RegExp), not a plain-extension `endsWith`. A bare extension is
   still accepted (coerced to `*.<ext>`), so simple cases like `.drawio` stay trivial. **Overlap with
   a built-in mask** (e.g. a board claiming `*.grid.json`, which `grid-json` also matches at
   priority 20) is legitimate — the winner is decided later by `editorPriority` + the CE2 tie-break,
   not forbidden here.
4. **Schema version stays `1`.** Additive optional fields don't break older readers (they ignore
   unknown fields), and `readBoardManifest` already returns unknown-higher-version manifests
   best-effort. No migration needed.
5. **No unit tests.** Persephone has **no unit-test harness** — do not add one. Verify the helpers
   via `npm run lint` + the project typecheck, plus a throwaway scratch script exercising the edge
   cases (bare-extension→`*.ext`, mixed-case, dupes, explicit glob preserved, compound `*.grid.json`
   match/no-match, `?` wildcard, negative/NaN priority → 0, empty → null) if you want a quick
   confidence check. No test files are committed.

## Acceptance criteria

- `BoardManifest` has `fileMasks?: string[]`, `editorPriority?: number`, `editorName?: string`;
  the "reserved for a future epic" comment is gone.
- `normalizeFileMasks`, `matchesFileMask`, and `getBoardEditorAssociation` exist, are exported, and
  behave per the edge cases in Concern 5 (bare-extension→`*.ext`, lowercased, de-duped, explicit glob
  preserved, compound `*.grid.json` matches `data.grid.json` but not `data.json`, `?` = one char,
  non-array→`[]`, no-masks→`null`, negative/NaN priority→`0`).
- `readBoardManifest`'s existing contract (null on missing/malformed, never throws) is unchanged.
- `assets/board-template/CLAUDE.md` documents the three new fields (trusted-only note, `fileMasks`
  glob semantics) and is ticket-free.
- `npm run lint` passes; `npx tsc --noEmit` (or the project's typecheck) is clean.
- Nothing in resolution / the switch widget behaves differently yet (fields are inert this task).

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/editors/board/board-manifest.ts` | Add `fileMasks` / `editorPriority` / `editorName` to `BoardManifest`; rewrite reservation JSDoc; add `normalizeFileMasks`, `maskToRegExp` (internal), `matchesFileMask`, `BoardEditorAssociation`, `getBoardEditorAssociation`. |
| `assets/board-template/CLAUDE.md` | Document the three new manifest fields (trusted-only; `fileMasks` glob semantics) in the identity section. |

_No test files — Persephone has no unit-test harness (verify via lint + typecheck)._
