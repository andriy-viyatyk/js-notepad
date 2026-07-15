# US-854: `persephone.setSecondaryViews` dynamic control

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md)
**Status:** Planned — implementation-ready

## Goal

Let a board declare or replace its full set of secondary (sidebar) views **at runtime**, from any frame, via `persephone.setSecondaryViews([...])`. Passing views attaches/updates their sidebar panels live; passing `[]` removes them all and closes the now-empty board sidebar. This is the runtime counterpart to the manifest `secondaryViews` seed (US-851): both write `state.secondaryViewDefs` on the shared board model, from which the derived panel-id list (`state.secondaryView`) is recomputed and the shell reacts.

## Background

US-851–US-853 already built everything this task rides on. The **only new user-facing surface** is one shim method + its wire message + a model mutator; the sidebar reconciliation is already reactive.

| Piece | Where | State for US-854 |
|-------|-------|------------------|
| Manifest seed → `secondaryViewDefs` → derived `secondaryView` (panel-id list) | `BoardEditorModel.seedSecondaryViews()` / `deriveSecondaryPanels()` (`BoardEditorModel.ts:326`,`:339`) | **Reuse.** `deriveSecondaryPanels()` is the single recompute; `setSecondaryViews` writes defs then calls it. |
| Manifest reader + validation (drops non-object / empty-id / `::`-containing / duplicate ids) | `readBoardSecondaryViews()` (`board-manifest.ts:202`) | **Refactor.** Extract the pure `normalizeSecondaryViews(raw)`; runtime input must get the **same** validation. |
| Board→host-frame post channel (`board:setState`/`board:mergeState`/`board:stateInit`) handled per-frame in `BoardWebview.onMessage` | `board-shim.ts:730` (`state.*`), `BoardWebview.tsx:219` (`onMessage`), `board-bridge-channels.ts:179` (`BoardToHostMsg`) | **Extend.** Add `board:setSecondaryViews`, exactly mirroring the `board:setState` path — `window.parent.postMessage`, **not** the main `MessagePort`, so `board-bridge.ts` (main) needs no change. |
| Live sidebar reconciliation: `PageModel.attach()` subscribes to the editor's `secondaryView` slice → `onEditorPanelsChanged()` bumps `hasSidebar`, runs `_enforceMandatoryOpen()` | `PageModel.ts:272`,`:371`,`:646` | **Reuse unchanged.** Adding views force-opens + expands the first panel; the page keeps an editor-with-a-sidebar alive on navigate-away — boards opt out of that by force-clearing (see C1). |
| Navigate-away disposal: `setMainEditor` disposes the old main **unless** it `contributesPanels()` (demote to sidebar) or `keepAliveOnNavigation()`; base `EditorModel.beforeNavigateAway` clears the *derived* `secondaryView` | `PageModel.ts:398`,`:414`; `EditorModel.ts:135` | **Board override added.** The board force-clears `secondaryViewDefs` (+ derived) in its own `beforeNavigateAway` so it is always disposed, never demoted to a lingering sidebar (D8, per your direction). |
| Generic panel component renders from `secondaryViewDefs` reactively (`state.use` selects defs) | `BoardSecondaryView.tsx` | **No change.** Adds/removes/relabels of panels flow through unchanged; each view's `BoardWebview` mounts (`isMain=false`) / unmounts (per-sink `disposeBoardPort`, US-853/D10) automatically. |
| `setSecondaryViews` lives on the **base** model, so every board (plain `board-view` + content-host) inherits it (O1/D1) | `BoardEditorModel` (base) | **New method here.** |

**Why "from any frame" is free.** Each `BoardWebview` (main and every secondary) attaches its own `window` message listener that only handles posts from *its own* `contentWindow` (`e.source`/`e.origin` gate, `BoardWebview.tsx:228`). All frames share one `model.id` → one `BoardEditorModel`. So a `setSecondaryViews` call in any frame is handled by that frame's `BoardWebview` and mutates the one shared model — the same convergence that makes `persephone.state.*` work across frames.

## Implementation plan

### Step 1 — Wire message (`src/ipc/board-bridge-channels.ts`)

Extend the `BoardToHostMsg.__persephone` union and add a `views` field. This module is dependency-free (only type-only imports), so it **cannot** import `SecondaryViewDecl` from `board-manifest.ts` (which imports `fs`). Inline the structurally-identical shape and note it mirrors `SecondaryViewDecl`.

Before (`board-bridge-channels.ts:179`):
```ts
export interface BoardToHostMsg {
    __persephone:
        | "board:interact"
        | "board:error"
        | "board:busy"
        | "board:setContent"
        | "board:save"
        | "board:setState"
        | "board:mergeState"
        | "board:stateInit";
```
After:
```ts
export interface BoardToHostMsg {
    __persephone:
        | "board:interact"
        | "board:error"
        | "board:busy"
        | "board:setContent"
        | "board:save"
        | "board:setState"
        | "board:mergeState"
        | "board:stateInit"
        | "board:setSecondaryViews"; // persephone.setSecondaryViews — replace the board's views (EPIC-044)
```
Add near the other `board:*` payload fields (after `restorableKeys?`):
```ts
    /** `board:setSecondaryViews` payload — the full replacement view set.
     *  Structurally mirrors `SecondaryViewDecl` (this module stays dependency-free,
     *  so it can't import that type); normalized renderer-side by `normalizeSecondaryViews`. */
    views?: Array<{ id: string; html?: string; title?: string; icon?: string }>;
```

### Step 2 — Shim method (`src/board-shim.ts`)

Add `setSecondaryViews` to the `window.persephone` object literal, next to `view` / `state` (a top-level method, not under `state`). Fire-and-forget over the host-frame channel, exactly like `state.set`.

Insert after the `view: viewRole,` property (`board-shim.ts:600`):
```ts
    /** Replace this board's full set of secondary (sidebar) views at runtime (EPIC-044).
     *  Each view: `{ id, html?, title?, icon? }` — `html` defaults to the main entry, so one
     *  file can serve every view (branch on `persephone.view`). `[]` removes them all. Available
     *  on every frame (main + secondary); the change is authoritative on the Persephone side. */
    setSecondaryViews(views: Array<{ id: string; html?: string; title?: string; icon?: string }>): void {
        try {
            window.parent.postMessage(
                { __persephone: "board:setSecondaryViews", views: Array.isArray(views) ? views : [] },
                hostPostTarget,
            );
        } catch {
            // parent gone
        }
    },
```

### Step 3 — Extract the shared normalizer (`src/renderer/editors/board/board-manifest.ts`)

`readBoardSecondaryViews` currently inlines the validation loop. Extract the loop into a pure `normalizeSecondaryViews(raw: unknown)` so runtime input (`setSecondaryViews`) gets **identical** validation (drop non-object, empty/`::`-containing/duplicate ids; trim `html`/`title`/`icon`). `readBoardSecondaryViews` then delegates.

Before (`board-manifest.ts:202`):
```ts
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
After:
```ts
/**
 * Normalize a raw secondary-views value into validated decls. Forgiving: drops
 * non-object entries, entries with a missing/empty `id`, ids containing "::" (the
 * `<editorId>::<panelId>` composite-key separator), and duplicate ids (first wins);
 * trims `html`/`title`/`icon` (empty → undefined). Non-array / absent → []. Never throws.
 * Shared by the manifest seed (`readBoardSecondaryViews`) and the runtime
 * `persephone.setSecondaryViews` path (`BoardEditorModel.setSecondaryViews`).
 */
export function normalizeSecondaryViews(raw: unknown): SecondaryViewDecl[] {
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

/**
 * Extract the declared secondary views from a manifest. Independent of `fileMasks`
 * (EPIC-044 O1). Delegates to `normalizeSecondaryViews`.
 */
export function readBoardSecondaryViews(
    manifest: BoardManifest | null | undefined,
): SecondaryViewDecl[] {
    return normalizeSecondaryViews(manifest?.secondaryViews);
}
```

### Step 4 — Model mutator (`src/renderer/editors/board/BoardEditorModel.ts`)

Add `setSecondaryViews` to the base model. Import `normalizeSecondaryViews` (extend the existing `board-manifest` import). Place it right after `seedSecondaryViews()` / `deriveSecondaryPanels()` (`BoardEditorModel.ts:335`).

Import change (`BoardEditorModel.ts:11`):
```ts
import { isBoardFolder, normalizeSecondaryViews, readBoardManifest, readBoardSecondaryViews, type SecondaryViewDecl } from "./board-manifest";
```
New method (after `deriveSecondaryPanels()`):
```ts
    /** Replace the declared secondary views at runtime (`persephone.setSecondaryViews`, US-854).
     *  Writes `state.secondaryViewDefs` (validated) then recomputes `state.secondaryView`; the
     *  page's slice subscription reconciles the sidebar panels live. `[]` removes them all. */
    setSecondaryViews(views: unknown): void {
        const defs = normalizeSecondaryViews(views);
        this.state.update((s) => { s.secondaryViewDefs = defs; });
        this.deriveSecondaryPanels();
    }
```

Also add an explicit `beforeNavigateAway` override (place it near the existing navigation overrides `keepAliveOnNavigation`/`survivesNavigation`, `BoardEditorModel.ts:195`). Import `EditorModel`'s type is already present (the class extends it). This is the C1 resolution — a Persephone-side forced clear so a board is never demoted to a lingering sidebar.
```ts
    /** Boards never linger on the page as sidebar-panel contributors (EPIC-044 / D8).
     *  When the page navigates its main view away it KEEPS an editor that still
     *  contributes a sidebar (demote-to-sidebar) — we opt out by force-clearing the
     *  declared secondary views here, so `contributesPanels()` is false and the page
     *  disposes this board. Forced at the Persephone side: the board is never told it is
     *  navigating away, and this guarantee doesn't depend on board cooperation.
     *  (A busy board still survives via `keepAliveOnNavigation()` as an invisible process
     *  handle — now with no visible sidebar; re-derivation on re-promotion is US-855.) */
    override beforeNavigateAway(newModel: EditorModel): void {
        this.state.update((s) => { s.secondaryViewDefs = undefined; });
        super.beforeNavigateAway(newModel); // clears the derived state.secondaryView
    }
```
`EditorModel` is already imported at `BoardEditorModel.ts:3` (`import { EditorModel, type EditorStateBase } from "../base/EditorModel";`), so the parameter type needs no new import.

### Step 5 — Handle the post in `BoardWebview` (`src/renderer/editors/board/BoardWebview.tsx`)

Extend the local `d` message type and add the branch in `onMessage` (`BoardWebview.tsx:219`–`256`), mirroring the `board:setState` branch.

Type widening (add to the inline `d` cast, `BoardWebview.tsx:220`):
```ts
            const d = e.data as
                {
                    __persephone?: string; message?: string; busy?: boolean; content?: string;
                    state?: Record<string, unknown>; partial?: Record<string, unknown>;
                    defaults?: Record<string, unknown>; restorableKeys?: string[];
                    views?: unknown;
                }
                | undefined;
```
New branch (after the `board:stateInit` branch, `BoardWebview.tsx:255`):
```ts
            } else if (d.__persephone === "board:setSecondaryViews") {
                model.setSecondaryViews(d.views);
            }
```

### Step 6 — Epic + dashboard bookkeeping (at implementation time, not now)

- `doc/epics/EPIC-044.md`: add US-854 to the "Implemented so far" line; mark the US-854 task-breakdown row ✅.
- `doc/active-work.md`: the US-854 entry is linked to this doc.

## Concerns

- **C1 — A board must not linger on the page via its sidebar on navigate-away (resolved).** There is **no auto-close** mechanism in Persephone. Sidebar visibility is tied to editor lifecycle: when a page navigates its main view to another editor, the page **keeps the old editor alive** if it still contributes a sidebar (demote-to-sidebar), and disposes it otherwise (`setMainEditor`, `PageModel.ts:414`). We have decided a **board must not stay** on the page. **Resolution:** the board model force-clears its secondary views before navigate-away — an explicit `BoardEditorModel.beforeNavigateAway` override (Step 4) that sets `secondaryViewDefs = undefined` and (via `super`) the derived `secondaryView`, so `contributesPanels()` is false and the page disposes the board. Forced on the Persephone side (the board is never told it navigated away, and the guarantee doesn't depend on board cooperation). The base `EditorModel.beforeNavigateAway` already clears the *derived* list; the override additionally clears the *defs* (US-854's new source of truth) and makes the board-specific guarantee explicit. This is the correct model — the earlier draft's "auto-close the empty sidebar in `PageModel`" idea is dropped; no `PageModel` change is made. **Deliberate simplification:** a future enhancement could let a board keep itself on the page by keeping a secondary view visible (board-controlled visibility / Pattern B survival — already out of scope in the epic). For now, boards always clear on navigate-away.
- **C1b — `setSecondaryViews([])` while the board stays the main editor (accepted).** Distinct from navigate-away: a board that removes all its views at runtime *while remaining active* simply contributes no panels; the sidebar reflects the current (empty) panel set with no special-case close (consistent with the no-auto-close model). This is atypical board behavior and needs no handling; a board that is finishing typically navigates away (C1) or is closed.
- **C2 — Changing an existing view's `html` at runtime does not remount its frame (accepted).** The panel's `BoardWebview` is keyed by `${viewId}__${reloadToken}` (US-853), so replacing a view whose `id` is unchanged but whose `html` differs keeps the old iframe. `id` is the stable identity; to change a view's entry file, use a new `id` (or reload the board). v1 accepts this — runtime `html` swaps for an unchanged id are not a real use case; title/icon relabels DO apply live (they flow through `secondaryViewDefs`, read reactively by `BoardSecondaryView`).
- **C3 — No main-process change.** `board:setSecondaryViews` rides the board→host-frame `window.parent.postMessage` channel (like `board:setState`), consumed in `BoardWebview.onMessage`, not the main `MessagePort`. `board-bridge.ts` / `board-protocol-service.ts` are untouched — verified against the `board:setState` precedent.
- **C4 — `secondaryViewDefs` persistence interaction with US-851 seed (deferred to US-855).** A runtime-set def array persists via the normal board-state save (it's a `BoardEditorState` field). On restore, US-851's `seedSecondaryViews()` only seeds from the manifest when `secondaryViewDefs === undefined`, so a persisted runtime set wins. US-855 owns verifying restore precedence + reload survival end-to-end; US-854 relies on it, adds no persistence code beyond the already-persisted `secondaryViewDefs`.
- **C5 — Validation parity.** Runtime input and manifest input share `normalizeSecondaryViews` (Step 3), so a runtime view id containing `::`, a duplicate id, or a non-object entry is dropped identically — no way for `setSecondaryViews` to inject a malformed panel id into the composite sidebar key.

## Acceptance criteria

- `persephone.setSecondaryViews([{ id, html?, title?, icon? }, …])` from **any** frame (main or a secondary view) attaches/updates the board's sidebar panels live — a new view appears as a new panel with its declared title, its iframe loading the declared `html` (or `index.html`).
- `persephone.setSecondaryViews([])` removes all the board's secondary panels.
- Adding views to a board that had none force-opens the sidebar and expands the first panel; the state channel (`persephone.state.*`) keeps working across the newly-added frames.
- Navigating a board's main view away **disposes the board** — it is never demoted to a lingering sidebar contributor (the board force-clears its secondary views in `beforeNavigateAway`). A busy board still survives (invisible process handle, US-799) but with no visible sidebar.
- Runtime view decls get the same validation as manifest decls (bad ids / duplicates / non-objects dropped); a `::`-containing id can never reach the composite sidebar key.
- Removing a secondary panel at runtime tears down only that frame's port/jobs (per-sink reaping, US-853) — the main frame's automation target, CDP registration, and spawned processes are unaffected.
- `npx tsc --noEmit` and `npx eslint` on all changed files are clean.

## Files changed

| File | Change |
|------|--------|
| `src/ipc/board-bridge-channels.ts` | Add `"board:setSecondaryViews"` to `BoardToHostMsg.__persephone` + a `views?` field (structural mirror of `SecondaryViewDecl`). |
| `src/board-shim.ts` | Add `persephone.setSecondaryViews(views)` — fire-and-forget `board:setSecondaryViews` over the host-frame channel. |
| `src/renderer/editors/board/board-manifest.ts` | Extract pure `normalizeSecondaryViews(raw)`; `readBoardSecondaryViews` delegates to it. |
| `src/renderer/editors/board/BoardEditorModel.ts` | Import `normalizeSecondaryViews`; add `setSecondaryViews(views)` (writes `secondaryViewDefs`, recomputes `secondaryView`) + `beforeNavigateAway` override force-clearing the views so the board is disposed on navigate-away (C1). |
| `src/renderer/editors/board/BoardWebview.tsx` | Widen `onMessage` `d` type (`views?`) + add the `board:setSecondaryViews` branch → `model.setSecondaryViews`. |
| `doc/epics/EPIC-044.md` | (At implementation) mark US-854 done. |
| `doc/active-work.md` | (At implementation) US-854 entry linked here. |

## Files NOT changed (verified — don't re-investigate)

- `src/renderer/editors/board/BoardSecondaryView.tsx` — renders from `secondaryViewDefs` via `state.use` already; add/remove/relabel flows through reactively.
- `src/renderer/ui/secondary-views/SecondaryViews.tsx`, `LazySecondaryView.tsx`, `secondary-view-registry.ts` — the `board-secondary:*` prefix registration + live `secondaryView` enumeration are already in place (US-853).
- `src/renderer/editors/board/board-secondary.ts` — panel-id encode/decode unchanged.
- `src/main/board-bridge.ts`, `src/main/board-protocol-service.ts` — no main-process involvement (post rides the host-frame channel, not the port). See C3.
- `src/renderer/api/pages/PageModel.ts` — the demote-to-sidebar-vs-dispose logic and the mandatory-open enforcement are reused unchanged; the board opts out of demotion by clearing its views in `beforeNavigateAway` (C1). No auto-close is added.
- Persistence code (`shared/persistence.ts`, `PagesPersistenceModel.ts`) — `secondaryViewDefs` already persists as a board-state field; restore precedence is US-855.
