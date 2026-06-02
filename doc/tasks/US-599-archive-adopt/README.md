# US-599: Archive — adopt + verify under new `SecondaryViews` infra

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 1b · **Status:** 🔍 Investigated (2026-06-02) — plan + concerns below; awaiting "let's implement".

## Goal

Verify the **Archive** editor (the `archive-tree` panel + its archive-root main view) works end-to-end and behavior-neutrally under the refactored `SecondaryViews` infrastructure (controlled component + `ISecondaryViewsState` + `IPageHost`), and resolve any Archive-specific gap surfaced. Archive is the **navigation-survival stress test** of the refactor: unlike Explorer's no-op survival, Archive keeps or drops its panel on every main-editor swap (EPIC-029 Concern 3), so this task exercises the `secondaryView` slice-subscription → detach/dispose plumbing that US-596/597 relocated.

**Likely zero production-code changes.** Archive already used the secondary-view system pre-EPIC-029, and the foundation tasks (US-595 rename, US-596 controlled component, US-597 `IPageHost`) carried it mechanically — the project compiles clean (`tsc --noEmit` EXIT 0) with Archive fully wired. US-599's deliverable is the **per-editor `.page` audit + a manual verification checklist**, not a migration. Any code change here is a bug-fix the smoke test forces out.

## Background

### Archive is a dual-view editor (the key difference from Explorer)

One `ArchiveEditor` instance (`editorId = "archive-view"`) plays **two roles** simultaneously:
- **Main view** — `ArchiveEditorView.tsx` renders the archive tree in the page's content area (registered in `editorRegistry` via `register-editors.ts:271`). This is what you see when you open a `.zip`/`.epub`/etc.
- **Secondary view** — `ArchiveSecondaryView.tsx` renders the same tree as the `archive-tree` sidebar panel (registered in `secondaryViewRegistry` via `register-editors.ts:9`). This is what you see after you navigate *into* the archive (open a file from it): the archive demotes from main to a sidebar panel so you can keep browsing.

Both views read the **same** `archiveModel.treeProvider` (`ArchiveTreeProvider`) and `selectionState`; both emit `openRawLink` with `sourceId: model.id`. This is EPIC-029's "editor = model, main + secondary are two views over it" design — **already implemented**, not a target. US-599 does not touch the dual-view shape (visual parity is the epic's rule).

### Open path (verified 2026-06-02)

`PagesLifecycleModel._openZipArchive` (`:551`): de-dups by `archiveUrl`; else `buildEditorById("archive-view", filePath)` → `ArchiveEditorView.newEditorModel` → `new ArchiveEditor(...)` + `initFromArchive` (creates the `ArchiveTreeProvider`, sets title). Then `wrap(legacy)` = `attachEditorToPage` (`:58`), which **returns an `EditorModel` input unchanged** — so the panel receives the *real* `ArchiveEditor` and the `model as ArchiveEditor` cast in `ArchiveSecondaryView:15` is sound (no adapter indirection). Finally `page.attach(adapter)` + `setMainEditorId` + `ensureSecondaryViewsModel()` (sidebar exists from open). `.asar` archives take a separate Explorer-backed path (`_openAsarArchive`), unaffected here.

### Archive's exact touch-points with the new infra

Every place Archive reaches the host, mapped to the `IPageHost` member it lands on:

| Call site | New-infra API used | `IPageHost` | Behavior-neutral? |
|---|---|---|---|
| `ArchiveEditor.onMainEditorChanged:114` | `this.page?.activePanel` (read) | required | ✓ |
| `ArchiveEditor.onMainEditorChanged:117` | `this.page?.expandPanel("archive-tree")` | required | ✓ |
| `ArchiveEditor.setPage:85` | param typed `IPageHost \| null` (US-597) | — | ✓ |
| `ArchiveEditor.restore:80` / `setPage:87` | sets `this.secondaryView = ["archive-tree"]` (pure state; host observes) | — | ✓ |
| `ArchiveSecondaryView.tsx:33`, `ArchiveEditorView.tsx:27` | `model.page?.id` | required | ✓ |
| `ArchiveSecondaryView.tsx:37` | `archiveModel === archiveModel.page?.mainEditor` (gates close-button) | **optional** read | ⚠ see Concern B |
| `ArchiveSecondaryView.tsx:51` (Close ✕) | `archiveModel.page?.removeSecondaryView(archiveModel)` | required | ✓ |

Survival/reaction hooks (on `EditorModel`, **called by the Page**, never on `IPageHost` — Concern 3); Archive's are **non-trivial** (the whole reason this task exists):
- `beforeNavigateAway` (`:98`) — keep `secondaryView` iff the incoming main editor was opened from this archive (`getNavigationSourceId() === this.id`); else clear it. **NOT a no-op** (Explorer's is).
- `onMainEditorChanged` (`:108`) — if the new main came from this archive: set `selectionState`, reveal if `archive-tree` active, `expandPanel("archive-tree")`; else `secondaryView = undefined` → self-evict.
- `onPanelExpanded` (`:124`) — reveal the current entry when `archive-tree` becomes active.

The self-eviction (`secondaryView = undefined`) is consumed by the `attach()` slice-subscription → `onEditorPanelsChanged` (`PageModel.ts:300`) → `detach` + deferred `dispose`. This is the path US-596/597 relocated; **re-verifying it end-to-end is the heart of US-599.**

### Files confirmed clean of stale naming

Grep of `editors/archive/` for `PageNavigator` / `secondaryEditor` / `ensurePageNavigatorModel` / `pageNavigatorModel` / `IPanelHost` → swept by US-595. Archive uses the current names (`secondaryView`, `removeSecondaryView`, `expandPanel`, `activePanel`).

## Implementation Plan

> Expected outcome: **no source edits** — a verification pass ending in marked acceptance criteria and (only if the smoke test fails) a scoped bug-fix. Order: (1) re-confirm baseline build, (2) run the manual checklist, (3) fix any regression, (4) re-verify.

### Step 1 — Baseline build (done during investigation)
`npx tsc --noEmit` → EXIT 0 (clean), no source changes since the foundation commits. No further build action unless Step 3 fires.

### Step 2 — Manual verification checklist (the deliverable)
Run `npm start` and confirm each behaves exactly as pre-refactor. Use a real archive (`.zip` and an `.epub` for the nested-folder case):

1. **Open archive** — open a `.zip` → archive tree renders as the **main** view; the sidebar (`archive-tree` panel) is present (`ensureSecondaryViewsModel` on open). Collapse-All / Refresh in the main toolbar work.
2. **De-dup** — open the same archive again → focuses the existing page, no duplicate (`_openZipArchive` archiveUrl match).
3. **Navigate into archive (survival)** — double-click a file inside the archive → it opens as the new main editor, and the archive **demotes to the `archive-tree` sidebar panel** (survives because `sourceId === archiveModel.id`). The opened entry is highlighted + revealed in the panel tree.
4. **Reveal-on-expand** — switch the sidebar to another panel and back to `archive-tree` → current entry re-reveals (`onPanelExpanded`).
5. **Navigate to an unrelated file (self-evict)** — from the archive panel context, open a file *not* from this archive (e.g. via a different tab/explorer) → the archive panel **drops** (`onMainEditorChanged` → `secondaryView = undefined` → detach + dispose). Confirm no orphan panel and no console error.
6. **Close panel ✕** — when the archive is a sidebar panel (not main), the header ✕ shows and removes it (`removeSecondaryView` → detach + dispose). When the archive **is** the main view, the ✕ is hidden (`!isActivePagePanel`, Concern B).
7. **Nested folders (.epub)** — expand/collapse nested archive folders; click entries open correctly with `bang!entry` pipe paths.
8. **Persistence / restart** — (a) an archive-root page (archive as main) restores on restart; (b) a page where you navigated into a file (archive demoted to panel) restores with both the file as main *and* the archive panel present. Tree expansion is **not** persisted (Concern E) — re-derives fresh; acceptable.

### Step 3 — Fix regressions (only if Step 2 fails)
Scope any fix to `editors/archive/` (model + the two views). Do **not** absorb the cross-editor `NavigationState` relocation (Concern A).

### Step 4 — Re-verify
Re-run `tsc --noEmit` + `npm run lint` if Step 3 touched code.

## Concerns / Open Questions

### Concern A — `NavigationState` imported from concrete `PageModel`. **Defer (not Archive-specific) — matches US-598 Concern A.**
`ArchiveEditor.ts:12` imports `type NavigationState` from `PageModel` (for `selectionState`). Type-only, zero runtime coupling, shared by 4 editors (Explorer/Archive/Link/Category). Same disposition as US-598: leave for US-599; relocate as a one-line shared-type move at US-600 or epic close-out (US-607). Recorded so the cross-cutting move isn't lost.

### Concern B — `isActivePagePanel` is a strict-equality against the **optional** `page.mainEditor`. **Keep; note forward-compat.**
`ArchiveSecondaryView:37`: `const isActivePagePanel = archiveModel === archiveModel.page?.mainEditor;`. `mainEditor` is **optional** on `IPageHost` (main-editor-nav group). On the Phase-1 `PageModel` host it's always present and returns the unwrapped `EditorOrHost`; `ArchiveEditor` has no content host, so `unwrapToHost` returns the archive editor itself → the equality is correct and the close-button gating is unchanged. **Forward-compat note:** a host that *omits* `mainEditor` (a future Browser host, US-601) makes `page?.mainEditor` `undefined`, so `isActivePagePanel` is always `false` → the close ✕ would always render. That is harmless (Archive isn't expected to be hosted by the Browser empty-page host), and correct for any host without a main editor. No change for US-599; flag for US-601 if Archive ever mounts in a non-Page host.

### Concern C — Navigation survival is the real test surface (EPIC-029 Concern 3). **No logic change; verify hard.**
Concern 3 resolved "survival hooks unchanged" at the *design* level. US-599 must confirm it at the *behavioral* level, because US-596/597 relocated the `activePanel`/`expandPanel`/`setSecondaryViewsState` plumbing and the detach/dispose flow that self-eviction rides. Checklist items 3 + 5 are the keep-path and the drop-path; both must match pre-refactor exactly. This is the one area where a regression is plausible despite a clean compile.

### Concern D — `setTimeout(…, 0)` before `expandPanel` / `revealVersion` bump. **Keep — intentional ordering (matches US-598 Concern C).**
`onMainEditorChanged:117` defers `expandPanel("archive-tree")`, and `onPanelExpanded:128` defers the `revealVersion` bump, both via `setTimeout(0)`. The defer lets the `secondaryView` slice-subscription re-derive `panelEditors` (and the view mount/ref settle) before the expand/reveal acts. Pre-existing, behavior-neutral; documented so it isn't "simplified" away. (`ArchiveSecondaryView` additionally wraps `revealItem` in `requestAnimationFrame` — same intent at the view layer.)

### Concern E — Persistence: only `archiveUrl` is saved; tree expansion is not. **In scope to verify; no change.**
`getRestoreData` (`:154`) persists `archiveUrl` only; `restore` (`:69`) recreates the `ArchiveTreeProvider` and re-derives `secondaryView = ["archive-tree"]` when a page is present. There is no `treeState` equivalent (unlike Explorer), so expansion always resets on restart — pre-existing and acceptable (Concern 7 reset-to-default also applies to the renamed `secondaryView` key). Verify both restart cases in Step 2.8.

### Out of scope (noted, not fixed here)
- The dual `TreeProviderView` + near-identical click handlers in `ArchiveEditorView` (main) and `ArchiveSecondaryView` (panel) are intentional per the two-views model; not a US-599 refactor target (the epic is relocation, with visual parity).
- `secondary-views.md` doc drift (the stale `page.secondaryViews[]` / `onSecondaryViewsChanged` description) belongs to the epic close-out doc pass (US-607).

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `npm run lint` pass (trivially green if no code changed).
- [ ] All 8 manual checklist items in Step 2 behave identically to pre-refactor, **especially** the survival keep-path (item 3) and self-evict drop-path (item 5). *(manual)*
- [ ] Close-✕ visibility gating (hidden when Archive is main, shown when it's a panel) confirmed (Concern B).
- [ ] No new Archive-specific coupling to concrete `PageModel`; any regression fix stays inside `editors/archive/`.
- [ ] `NavigationState` relocation explicitly deferred (Concern A), not bundled here.

## Files Changed (summary)

| Area | File | Change |
|---|---|---|
| — | *(none expected)* | US-599 is verification-only; Archive already compiles + renders under the new infra. |

**Conditional (only if Step 2 surfaces a regression):** a scoped fix in `editors/archive/ArchiveEditor.ts`, `ArchiveSecondaryView.tsx`, or `ArchiveEditorView.tsx`.

**Explicitly NOT changed:** `NavigationState` import location (Concern A — cross-editor, deferred); the `setTimeout(0)` / `requestAnimationFrame` ordering (Concern D); the dual main/secondary view shape; `secondary-views.md` doc drift (US-607); `SecondaryViews.tsx` / `SecondaryViewsModel.ts` / `PageModel` host members (US-596/597 done); the `archive-tree` / `archive-view` IDs and their registry registrations; `_openZipArchive` / `attachEditorToPage` open path.
