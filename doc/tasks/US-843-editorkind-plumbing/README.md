# US-843: Manifest `editorKind` + association plumbing

**Epic:** [EPIC-043 — Content-Host Boards](../../epics/EPIC-043.md) (task 1 of 5)
**Status:** Not started
**Depends on:** — (first task; nothing precedes it)
**Blocks:** US-844 (`BoardContentEditorModel`), US-845 (construction/switch), US-846 (bridge)

## Goal

Add a manifest **kind** discriminator, `editorKind: "simple" | "content-host"`, to `BoardManifest`
and carry it — normalized, trusted-only — through the association layer
(`BoardEditorAssociation` → `CustomEditorMatch`) so a later construction path can pick the board
**model** without re-reading the manifest. This task is **pure data-model plumbing**: it is inert
until US-845 consumes `CustomEditorMatch.editorKind`. Nothing about resolution, matching, priority,
or ids changes.

## Background

EPIC-042 already delivered the full manifest→association→registry chain for boards-as-editors.
US-843 threads one new field through the **existing** chain; it invents no new machinery.

The chain (all verified 2026-07-15):

1. **`BoardManifest`** (`src/renderer/editors/board/board-manifest.ts:22`) — the raw parsed manifest.
   Already carries the Custom Editor fields `fileMasks` / `editorPriority` / `editorName`
   (`:41`–`:54`).
2. **`getBoardEditorAssociation(manifest)`** (`board-manifest.ts:142`) — the **single source of
   truth** that maps a manifest to a validated `BoardEditorAssociation` (`:127`). It normalizes
   `fileMasks` (returns `null` if none), coerces `editorPriority` to a non-negative number, and
   trims `editorName`. This is where the new field is normalized.
3. **`BoardEditorAssociation`** (`board-manifest.ts:127`) — the validated association struct.
4. **`CustomEditorRegistry.refresh()`** (`custom-editor-registry.ts:90`) — enumerates trusted board
   roots, reads each manifest, calls `getBoardEditorAssociation`, and builds one
   **`CustomEditorMatch`** (`:46`) per file-associated board. This is where the normalized field is
   copied onto the match the rest of the app reads.
5. **`CustomEditorMatch`** (`custom-editor-registry.ts:46`) — the sync, reactive record consumed by
   resolution (`resolveEditorIdForFile`, `custom-editor-registry.ts:161`) and the switch widget
   (`useBoardsForFile`, `:134`). US-845 reads `editorKind` **from here**.

**Trust model (unchanged):** every Custom Editor field is honored **only for a trusted board** —
the trust gate lives in the registry (`refresh()` enumerates `boardTrust.listPaths()` only). Adding
`editorKind` inherits this automatically: it is only ever read from a manifest under a trusted root.
`editorKind` is NEVER a trust signal and is never stored anywhere but the manifest.

**Authoring guide:** the manifest Custom Editor fields are documented in
`assets/board-template/CLAUDE.md:54`–`:63` (and mirrored in `assets/mcp-res-boards.md`). This task
adds a short `editorKind` entry there so the field is discoverable, matching the epic's US-843 line
("authoring-guide doc"). The fuller narrative treatment (how a content-host board behaves) lands at
epic close-out via `/document` once US-844–847 make the field do something.

### Files that need NO changes (do not investigate)

- `resolveEditorIdForFile`, `getBoardsForFile`, `useBoardsForFile`, `matchesFileMask`,
  `normalizeFileMasks`, `boardEditorId`/`parseBoardEditorId`, `isBoardEditorId` — resolution,
  matching, and id logic are all untouched by a new kind field.
- `BoardEditorModel.ts`, `PagesLifecycleModel.ts`, `PagesPersistenceModel.ts`, `PageToolbar.tsx` —
  all construction/switch/persistence/UI consumers are **US-845+**, not this task.
- Any board-shim / bridge file — the bridge is US-846.

## Implementation plan

### Step 1 — Add `editorKind` to `BoardManifest`

**File:** `src/renderer/editors/board/board-manifest.ts`

Add the field to the `BoardManifest` interface, in the Custom Editor axis block (after
`editorName`, `:54`):

```ts
    /**
     * How Persephone sets this board up as a file editor (EPIC-043).
     * - absent / "simple": EPIC-042 behavior — the board gets a filePath (`getFilePath`) and
     *   reads/writes the file DIRECTLY via `readFile`/`writeFile`. No Persephone content host.
     * - "content-host": Persephone builds the board WITH a content host (owning the pipe,
     *   encoding, encryption, auto-save cache, and dirty state) and injects `persephone.host.*`.
     * Honored only when the board is TRUSTED, like every other Custom Editor field. Inert until
     * the construction path consumes it (US-845).
     */
    editorKind?: "simple" | "content-host";
```

### Step 2 — Add a normalized `editorKind` to `BoardEditorAssociation`

**File:** `src/renderer/editors/board/board-manifest.ts`

Add to the `BoardEditorAssociation` interface (`:127`), after `editorName` (`:134`):

```ts
    /** Normalized board editor kind. Any value other than "content-host" → "simple". */
    editorKind: "simple" | "content-host";
```

Note: **not optional** on the association — it is always resolved to a concrete value so consumers
never branch on `undefined`.

### Step 3 — Normalize `editorKind` in `getBoardEditorAssociation`

**File:** `src/renderer/editors/board/board-manifest.ts` (`:142`)

Before the `return`, resolve the kind defensively (only the exact string `"content-host"` opts in;
anything else — absent, typo, wrong type — is `"simple"`):

**Before** (`:154`–`:158`):

```ts
    return {
        fileMasks,
        editorPriority,
        editorName: name || undefined,
    };
```

**After:**

```ts
    const editorKind = manifest.editorKind === "content-host" ? "content-host" : "simple";
    return {
        fileMasks,
        editorPriority,
        editorName: name || undefined,
        editorKind,
    };
```

### Step 4 — Add `editorKind` to `CustomEditorMatch` and populate it in `refresh()`

**File:** `src/renderer/editors/board/custom-editor-registry.ts`

(a) Add the field to the `CustomEditorMatch` interface (`:46`), after `fileMasks` (`:56`):

```ts
    /** Board editor kind (US-843): "simple" (EPIC-042, direct file I/O) or "content-host"
     *  (EPIC-043, Persephone owns the content host). Consumed by the construction path (US-845). */
    editorKind: "simple" | "content-host";
```

(b) Populate it in `refresh()` (`custom-editor-registry.ts:101`) from the already-computed `assoc`:

**Before:**

```ts
            entries.push({
                editorId: boardEditorId(root),
                boardRoot: root,
                name,
                priority: assoc.editorPriority,
                fileMasks: assoc.fileMasks,
            });
```

**After:**

```ts
            entries.push({
                editorId: boardEditorId(root),
                boardRoot: root,
                name,
                priority: assoc.editorPriority,
                fileMasks: assoc.fileMasks,
                editorKind: assoc.editorKind,
            });
```

### Step 5 — Document `editorKind` in the board authoring guide

**File:** `assets/board-template/CLAUDE.md`

In the Custom Editor fields list (after the `editorName` bullet, `:63`), add:

```md
- `editorKind` (optional) — how Persephone backs this editor. Omit or `"simple"` (default) →
  the board gets the file path via `persephone.getFilePath()` and reads/writes it directly with
  `persephone.readFile()` / `writeFile()`. `"content-host"` → Persephone owns the file (pipe,
  encoding, encryption, auto-save, dirty tracking) and the board works through
  `persephone.host.getContent()` / `setContent()` instead. Content-host boards also edit
  non-local files (`https://`, inside archives, encrypted). See *Content-host editors* below.
```

Keep the added prose ticket-free (no `US-XXX` / `EPIC-XXX`) per the consumer-facing doc rule. Do
**not** write the *"Content-host editors below"* section yet — the `persephone.host.*` surface does
not exist until US-846; that section is authored when the bridge ships (or at close-out). For this
task the bullet may end at *"reads/writes it directly … `setContent()` instead."* and drop the
forward reference if the section isn't present yet. (`assets/mcp-res-boards.md` gets its parallel
mention at epic close-out via `/document`, alongside the fuller narrative.)

## Concerns

- **Inertness is the point.** Nothing in this task changes behavior — a content-host manifest will
  still build a plain EPIC-042 `BoardEditorModel` until US-845 branches on `editorKind`. That is
  intentional and expected; do not attempt to wire construction here.
- **Defensive default.** `getBoardEditorAssociation` must treat any non-`"content-host"` value
  (absent, wrong type, typo like `"contenthost"`) as `"simple"`. A malformed manifest must never
  make a board a content-host editor by accident.
- **No new resolution semantics.** `editorKind` must **not** influence `fileMasks` matching,
  `editorPriority`, or `resolveEditorIdForFile` in this task. (The kind-aware gate lifting is
  US-845's MEDIUM-3 work; keep it out of here.)
- **Trusted-only comes free.** Because `editorKind` is read only inside `refresh()` (which
  enumerates trusted roots) and `getBoardEditorAssociation` (called only from there and from
  construction over a trusted board), no extra trust check is needed.

## Acceptance criteria

1. `BoardManifest.editorKind?: "simple" | "content-host"` exists and is documented.
2. `BoardEditorAssociation.editorKind` is a required `"simple" | "content-host"`, resolved in
   `getBoardEditorAssociation` — exactly `"content-host"` opts in; every other input → `"simple"`.
3. `CustomEditorMatch.editorKind` is a required field, populated in `refresh()` from the
   association.
4. Existing EPIC-042 manifests (no `editorKind`) resolve to `editorKind: "simple"` on their match —
   zero behavior change for existing boards.
5. `assets/board-template/CLAUDE.md` documents the `editorKind` field (ticket-free).
6. `npm run lint` passes; the project type-checks (no consumer yet reads the new required fields, so
   no downstream break).

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/board/board-manifest.ts` | Add `editorKind?` to `BoardManifest`; add required `editorKind` to `BoardEditorAssociation`; normalize it in `getBoardEditorAssociation`. |
| `src/renderer/editors/board/custom-editor-registry.ts` | Add required `editorKind` to `CustomEditorMatch`; populate it in `refresh()` from `assoc.editorKind`. |
| `assets/board-template/CLAUDE.md` | Document the optional `editorKind` manifest field (ticket-free). |
