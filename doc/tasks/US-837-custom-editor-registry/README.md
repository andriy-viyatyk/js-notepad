# US-837: Custom-editor registry — reactive `mask → trusted board` map

**Epic:** [EPIC-042 — Boards as Custom Editors](../../epics/EPIC-042.md) · **task 2 of the build order**
**Depends on:** [US-836](../US-836-board-manifest-file-association/README.md) (manifest `fileMasks` + `getBoardEditorAssociation` / `matchesFileMask` helpers — done)
**Status:** 📝 Planned — carved 2026-07-14, awaiting "let's implement"

## Goal

Add a reactive registry that enumerates **trusted** boards, reads each board's manifest, and
maps **file → associated board editors** using the US-836 helpers. It answers, synchronously,
"which trusted boards claim this file, and at what priority" — the single data source the later
resolution and switch-widget tasks consume. It reacts to trust changes (a trust/untrust flips
associations live, CE3/CE7) with **no filesystem watcher**.

This task also defines the **virtual editor id** contract (`board-editor:<boardRoot>`) as
shared helpers, so the construction/resolution/switch tasks all encode and parse the id the
same way.

Like US-836, this is **infrastructure**: the registry is built and reactive, but nothing in
file-open resolution or the switch widget consumes it yet (that is US-839, the crux task). The
only externally observable change is a new read-only `subscribePaths` method on `boardTrust`.

## Background

### The direct analog — `registeredTools` (EPIC-038)

`src/renderer/api/tools/registered-tools.ts` is the template to mirror almost exactly:
- A `TModel<State>` singleton over a `TGlobalState`.
- Constructor subscribes to `toolsTrust.subscribePaths(() => void this.refresh())` — an
  **in-memory** subscription, **not** a filesystem watcher.
- `ensureInitialized()` — idempotent; `await toolsTrust.load()` then `await this.refresh()`.
- `refresh()` iterates `toolsTrust.listPaths()`, reads each manifest, rebuilds the reactive
  state (always a **full** rebuild — cheap at registry scale, and a single manifest edit can
  change the merged outcome).
- Sync getters (`.tools`) + reactive hooks (`.useToolsets()`) + `dispose()` unsubscribes.

Our registry is the board-side equivalent: `boardTrust.listPaths()` + `readBoardManifest` +
`getBoardEditorAssociation` (US-836).

### `boardTrust` (`src/renderer/api/board-trust.ts`) — what it offers and what's missing

- `load()` — lazy read of `trustedBoards.txt` into reactive `TGlobalState`.
- `listPaths(): string[]` — trusted board-root paths, **original case** (sync; call `load()` first).
- `useTrustedPaths(): string[]` — reactive hook.
- `isTrusted(boardRoot)` — **ancestor-aware** (a board nested under a trusted folder is trusted).
- **Missing: a `subscribePaths(listener)` method.** `boardTrust`'s `state` is **private**, so the
  registry cannot subscribe from outside (unlike `toolsTrust`, which added `subscribePaths` for
  exactly this). **This task adds it**, mirroring `toolsTrust.subscribePaths` verbatim.

### How trusted paths map to boards (precedent)

Both `registeredTools.refresh()` and `BoardsSecondaryView` treat **each `listPaths()` entry as a
concrete root** and read its manifest directly — neither scans for nested boards under an ancestor.
The common trust paths (trust-on-open, auto-trust-on-create) register the **board's own root**, so
`listPaths()` holds individual board roots in practice. We follow that model: enumerate
`listPaths()`, read each root's manifest, keep the roots whose manifest yields a
`getBoardEditorAssociation` (i.e. declares usable `fileMasks`). See Concern 1 for the
inherited-trust edge case (a board trusted only via an ancestor folder).

### State primitive

`TOneState`/`TGlobalState` (`src/renderer/core/state/state.ts`) expose
`subscribe(listener)` / `subscribe(listener, selector)` returning an unsubscribe fn; `TModel`
(`src/renderer/core/state/model.ts`) wraps a state with `.get()/.use()/.update()`. `fpBasename`
and `fpNormalizeForCompare` live in `src/renderer/core/utils/file-path.ts`.

## Implementation plan

### Step 1 — Add `subscribePaths` to `boardTrust`

**File:** `src/renderer/api/board-trust.ts` (new method on the `BoardTrust` class, after
`useTrustedPaths`)

```ts
/**
 * Subscribe to trusted-list changes (in-memory, NOT a filesystem watcher). The
 * custom-editor registry uses this to re-enumerate when a board is trusted / untrusted.
 * Returns an unsubscribe function. Read-only — cannot mutate trust.
 */
subscribePaths(listener: () => void): () => void {
    return this.state.subscribe(() => listener(), (s) => s.paths);
}
```

This is the **only** change to a trust-sensitive module: a pure read subscription over the
already-private state. No trust mutation, no new persistence, no `app`/script exposure.

### Step 2 — The virtual-id contract + the registry module

**New file:** `src/renderer/editors/board/custom-editor-registry.ts`

#### 2a. Virtual editor id helpers (shared contract)

A file-associated board is a distinct editor id `board-editor:<boardRoot>` in the merged
resolution/switch lists. Everything that encodes or parses that id uses these helpers — never a
raw string literal — so the id shape has one definition (used by US-839's `buildEditorById`,
`switchMainEditor`, and `SwitchWidget`).

```ts
/** Prefix marking a virtual custom-editor id. The remainder is the board root VERBATIM
 *  (original case, may contain ':' and '\\' on Windows — parse by prefix, never by split). */
export const BOARD_EDITOR_ID_PREFIX = "board-editor:";

/** Build the virtual editor id for a board acting as a custom editor. Carries the ORIGINAL-case
 *  root (BoardEditorModel needs the real path to load); do not normalize it into the id. */
export function boardEditorId(boardRoot: string): string {
    return BOARD_EDITOR_ID_PREFIX + boardRoot;
}

/** Extract the board root from a `board-editor:<root>` id, or null if it isn't one. */
export function parseBoardEditorId(editorId: string): string | null {
    return editorId.startsWith(BOARD_EDITOR_ID_PREFIX)
        ? editorId.slice(BOARD_EDITOR_ID_PREFIX.length)
        : null;
}
```

#### 2b. Types

```ts
/** A trusted, file-associated board resolved from its manifest. One per trusted board that
 *  declares usable `fileMasks`. */
export interface CustomEditorMatch {
    /** Virtual editor id: `board-editor:<boardRoot>` (original-case root). */
    editorId: string;
    /** Absolute board root, original case — what BoardEditorModel loads. */
    boardRoot: string;
    /** Switch-widget display name: editorName ?? manifest.name ?? basename(root). */
    name: string;
    /** Resolution priority (>= 0) from the manifest (US-836 `editorPriority`). */
    priority: number;
    /** The board's normalized glob masks (for matching + introspection). */
    fileMasks: string[];
}
```

Internal per-board entry stored in state = a `CustomEditorMatch` (no extra fields needed —
`fileMasks` on the entry lets `getBoardsForFile` match without re-reading the manifest).

#### 2c. The reactive registry (mirror `registeredTools`)

```ts
interface CustomEditorRegistryState {
    /** Every trusted, file-associated board, in trusted-list (registration) order. */
    entries: CustomEditorMatch[];
}

class CustomEditorRegistry extends TModel<CustomEditorRegistryState> {
    private initialized = false;
    private pathsSub: (() => void) | undefined;

    constructor() {
        super(new TGlobalState({ entries: [] }));
        // In-memory reactive subscription (NOT a filesystem watcher): re-enumerate on any
        // trust/untrust — this is what makes an untrust drop the association live (CE3/CE7).
        this.pathsSub = boardTrust.subscribePaths(() => { void this.refresh(); });
    }

    /** Idempotent: load the trusted list then enumerate. Call before reading state. */
    async ensureInitialized(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        await boardTrust.load();
        await this.refresh();
    }

    /** Re-read every trusted board's manifest and rebuild the reactive state. Full rebuild
     *  (cheap at registry scale; a manifest edit can change masks/priority). No `root` hint
     *  needed — enumerate all, matching the registeredTools model. */
    async refresh(): Promise<void> {
        const roots = boardTrust.listPaths();
        const entries: CustomEditorMatch[] = [];
        for (const root of roots) {
            const manifest = await readBoardManifest(root);
            const assoc = getBoardEditorAssociation(manifest);
            if (!assoc) continue; // no fileMasks → not a custom editor
            const name =
                assoc.editorName ||
                (manifest && typeof manifest.name === "string" && manifest.name.trim()) ||
                fpBasename(root);
            entries.push({
                editorId: boardEditorId(root),
                boardRoot: root,
                name,
                priority: assoc.editorPriority,
                fileMasks: assoc.fileMasks,
            });
        }
        this.state.update((s) => { s.entries = entries; });
    }

    /** All file-associated boards (sync, non-reactive). */
    get entries(): CustomEditorMatch[] {
        return this.state.get().entries;
    }

    /**
     * Boards claiming `fileName`, in trusted-list order (SYNC — safe for resolveId). Matches the
     * BASENAME against each board's masks (a mask like "*.drawio" must not match a directory
     * segment). Returns [] before `ensureInitialized()` completes → graceful built-in fallback.
     * Local-file gating (CE4: hide the option for https/archive) is the CALLER's job, not here.
     */
    getBoardsForFile(fileName: string): CustomEditorMatch[] {
        if (!fileName) return [];
        const base = fpBasename(fileName);
        return this.state
            .get()
            .entries.filter((e) => e.fileMasks.some((m) => matchesFileMask(base, m)));
    }

    /** Reactive variant for the switch widget — re-renders when trust/masks change. */
    useBoardsForFile(fileName: string): CustomEditorMatch[] {
        return this.state.use((s) => {
            if (!fileName) return [];
            const base = fpBasename(fileName);
            return s.entries.filter((e) => e.fileMasks.some((m) => matchesFileMask(base, m)));
        });
    }

    dispose(): void {
        this.pathsSub?.();
        this.pathsSub = undefined;
    }
}

export const customEditorRegistry = new CustomEditorRegistry();
```

Imports: `TModel` from `../../core/state/model`; `TGlobalState` from `../../core/state/state`;
`fpBasename` from `../../core/utils/file-path`; `boardTrust` from `../../api/board-trust`;
`readBoardManifest`, `getBoardEditorAssociation`, `matchesFileMask` from `./board-manifest`.

### Step 3 — No wiring into resolution / switch this task

`getBoardsForFile` / `useBoardsForFile` / the id helpers exist and are exported, but **nothing
calls them yet**. US-839 (the crux) wires them into `resolveId`/`resolve`, `buildEditorById`,
`switchMainEditor`, and `SwitchWidget`, and decides where `ensureInitialized()` is invoked at
bootstrap (see Concern 2). Keeping the seam unwired here matches US-836's inert-until-consumed
approach and keeps this task independently verifiable.

### Step 4 — No changes needed (documented so the implementer doesn't chase them)

- `board-manifest.ts` — consumed read-only; already has the helpers (US-836). No change.
- `register-editors.ts` / `editorRegistry.ts` / `editor-matchers.ts` — the static registry is
  **not** touched (CE6: two separate registries, merged at query time by US-839).
- `BoardEditorModel.ts` — the `filePath` plumbing is US-838; the dynamic `editorId` change is
  US-839 (the crux). Not here.
- Board authoring guide / `mcp-res-boards.md` — no doc surface changes this task (no new manifest
  fields; US-836 already documented `fileMasks`).

## Concerns / open questions

1. **Nested boards are not supported — by design, not a v1 limitation.** Every board is expected
   to live in its **own separate folder**, never nested inside another board. The existing
   ancestor-aware/inherited-trust handling exists only so nesting doesn't *crash* the app — it is
   not a supported topology. Accordingly, `refresh()` reads manifests for the exact roots in
   `listPaths()` and does **no** subtree discovery: a board trusted only via a bulk-trusted
   **ancestor folder** (its own root not individually in `listPaths()`) is not enumerated as a
   custom editor, and that is the intended behavior. This matches `registeredTools` and the Boards
   sidebar (both iterate `listPaths()` directly) and the real trust paths (trust-on-open /
   auto-trust-on-create register the board's own root). **No "discover boards under a trusted
   ancestor" feature is planned** — do not add a filesystem walk. Flagged so US-839 doesn't assume
   nested custom editors exist.
2. **Sync resolution vs. async init (the timing seam for US-839). ✅ agreed (user, 2026-07-14):
   eager bootstrap init.** `getBoardsForFile` is sync so `resolveId` (sync) can call it, but the
   entries are only populated after the async `ensureInitialized()`. If a file opens before init
   completes, `getBoardsForFile` returns `[]` and the built-in editor wins — acceptable graceful
   degradation, but US-839 must call `customEditorRegistry.ensureInitialized()` **eagerly at app
   bootstrap** (not lazily on first file open) so associations are warm. **Candidate hook:**
   `src/renderer/editors/register-editors.ts` — a side-effect module already imported at app entry
   (`index.tsx:5`); a module-scope `void customEditorRegistry.ensureInitialized()` there fires at
   startup. (MainPage's mount effect is an alternative.) This task only guarantees the sync/async
   split; the bootstrap wiring lands in US-839.
3. **Trust subscription fires refresh even with no consumers.** The constructor subscribes
   immediately (like `registeredTools`), so a trust change triggers `refresh()` regardless of
   whether anything reads the registry. This is cheap (a few manifest reads) and matches the
   precedent; the singleton is process-lived and never disposed in practice (`dispose()` exists
   for symmetry/testing).
4. **Priority + tie-break belong to US-839, not here.** Entries carry the raw `priority`; the
   CE2 tie-break (built-ins first, then trusted-list order among boards) is applied when merging
   with the static registry at resolution time. `getBoardsForFile` returns boards in trusted-list
   order (stable input for that tie-break) and does **not** sort by priority.
5. **No unit tests.** Persephone has no unit-test harness — do not add one. Verify via
   `npm run lint` + typecheck; sanity-check reactivity by hand if desired (trust a board with
   `fileMasks`, confirm `getBoardsForFile` returns it; untrust, confirm it drops).
6. **Original-case root in the id; normalized only for matching.** `boardEditorId` carries the
   root verbatim (BoardEditorModel loads the real path). Any dedup/compare against trust state
   uses `fpNormalizeForCompare` — but `listPaths()` entries are already unique roots, so no dedup
   is needed in `refresh()`.

## Acceptance criteria

- `boardTrust.subscribePaths(listener)` exists, returns an unsubscribe fn, and is a pure read
  subscription (no trust mutation).
- `custom-editor-registry.ts` exports `BOARD_EDITOR_ID_PREFIX`, `boardEditorId`,
  `parseBoardEditorId`, `CustomEditorMatch`, and the `customEditorRegistry` singleton with
  `ensureInitialized`, `refresh`, `entries`, `getBoardsForFile`, `useBoardsForFile`, `dispose`.
- `boardEditorId(root)` / `parseBoardEditorId` round-trip a Windows path with a drive `:` intact
  (e.g. `C:\boards\drawio`).
- After `ensureInitialized()`, a trusted board with `fileMasks: ["*.drawio"]` appears in
  `getBoardsForFile("x.drawio")` with `priority` and `name` from its manifest; a non-associated
  trusted board (no `fileMasks`) does not.
- Un-trusting that board (via `boardTrust.untrust`) causes the subscription to `refresh()` and the
  board to drop out of `getBoardsForFile` / `useBoardsForFile` without a restart.
- Nothing in file-open resolution or the switch widget behaves differently yet (registry unwired).
- `npm run lint` + typecheck clean.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/board-trust.ts` | Add read-only `subscribePaths(listener)` (mirrors `toolsTrust.subscribePaths`). |
| `src/renderer/editors/board/custom-editor-registry.ts` | **New.** Virtual-id helpers (`BOARD_EDITOR_ID_PREFIX` / `boardEditorId` / `parseBoardEditorId`) + reactive `customEditorRegistry` (`ensureInitialized` / `refresh` / `getBoardsForFile` / `useBoardsForFile`), reacting to `boardTrust.subscribePaths`. |

_No test files — Persephone has no unit-test harness (verify via lint + typecheck)._
