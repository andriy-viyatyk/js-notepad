# US-598: Explorer — adopt + verify under new `SecondaryViews` infra

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 1b · **Status:** 🔍 Investigated (2026-06-02) — all concerns (A–E) user-confirmed; verification-only, awaiting manual smoke test.

## Goal

Verify the **Explorer** editor (file tree + search panels) works end-to-end and behavior-neutrally under the refactored `SecondaryViews` infrastructure (controlled component + `ISecondaryViewsState` + `IPageHost`), and resolve any Explorer-specific gap surfaced. This is the **first end-to-end validation** that the Phase-1a navigator refactor didn't regress a real, multi-panel editor.

**Likely zero production-code changes.** Explorer was already a secondary-view-system editor (since [EPIC-019](../../epics/EPIC-019.md)), and the foundation tasks (US-595 rename, US-596 controlled component, US-597 `IPageHost`) already carried it mechanically — the project compiles clean (`tsc --noEmit` EXIT 0) with Explorer fully wired. US-598's deliverable is therefore the **per-editor `.page` audit + a manual verification checklist**, not a migration. Any code change here is a bug-fix the smoke test forces out, not planned scope.

## Background

### Why this task is light

EPIC-029's plan (Linked Tasks note): *"Foundation tasks (US-595–597) necessarily touch every panel-contributing editor mechanically … the per-editor tasks then own each editor's specific adoption."* Explorer's "specific adoption" was essentially **already done by EPIC-019** (it pioneered the multi-panel `secondaryView: string[]` model). So unlike Archive (US-599) and Links (US-600), Explorer needs no structural rewrite — only confirmation that the mechanical foundation left it behaving identically.

### Explorer's exact touch-points with the new infra (verified 2026-06-02)

Every place Explorer reaches the host via `this.page` / `model.page`, mapped to the `IPageHost` member it now lands on (all **required** members — Explorer never touches the optional main-editor-nav group, consistent with it being a sidebar-only editor):

| Call site | New-infra API used | `IPageHost` | Behavior-neutral? |
|---|---|---|---|
| `ExplorerEditorModel.openSearch:107` | `this.page?.expandPanel("search")` | required | ✓ |
| `ExplorerEditorModel.closeSearch:115` | `this.page?.expandPanel("explorer")` | required | ✓ |
| `ExplorerEditorModel._selectAndReveal:143` | `this.page?.activePanel` (read) | required | ✓ |
| `ExplorerEditorModel.setPage:229` | param typed `IPageHost \| null` (US-597) | — | ✓ |
| `ExplorerEditorModel.restore:222` / `setPage:231` | sets `this.secondaryView` (pure state; host observes via slice-sub) | — | ✓ |
| `ExplorerSecondaryView.tsx:132` (Close-Panel ✕) | `model.page?.setSecondaryViewsState({ open: false })` | required | ⚠ see Concern B |
| `ExplorerSecondaryView.tsx:54`, `SearchSecondaryView.tsx:17` | `model.page?.id` | required | ✓ |

Survival/reaction hooks live on `EditorModel` and are **called by the Page** (never exposed on `IPageHost` — EPIC-029 Concern 3); Explorer overrides three, all unchanged by the refactor:
- `beforeNavigateAway` (`:154`) — **no-op** (Explorer always survives a main-editor swap; it's sidebar-only).
- `onMainEditorChanged` (`:159`) — highlight + reveal the new main file if under `rootPath`.
- `onPanelExpanded` (`:173`) — reveal current file when the `"explorer"` panel becomes active.

### How Explorer renders under the new component

`Pages.tsx` mounts `<SecondaryViewsWrapper>` (gated on `page.state.hasSidebar`) → `<SecondaryViewsContent>` → controlled `<SecondaryViews views={page.panelEditors} state={nav.state} setState={page.setSecondaryViewsState} />`. `SecondaryViews.tsx` reads each view's `secondaryView` string array, looks each panel ID up in `secondaryViewRegistry`, and lazy-loads the component (`explorer` → `ExplorerSecondaryView`, `search` → `SearchSecondaryView`, registered in `register-editors.ts:15-25`). `panelEditors` (`PageModel.ts:155`) stable-sorts the Explorer-contributing editor first. **No Explorer-side change needed for any of this.**

### Files confirmed clean of stale naming

Grep of `editors/explorer/` for `PageNavigator` / `secondaryEditor` / `ensurePageNavigatorModel` / `pageNavigatorModel` / `IPanelHost` → **no matches** (US-595 swept it). The legacy "closeable only when Explorer is present" navigator rule no longer exists in code (grep `canOpenNavigator|closeable|only.*Explorer` finds only `PageModel.canOpenNavigator`, which is the generic open-gate, plus unrelated `fileExplorer` event names) — it dissolved during Phase 1a per EPIC-029 Concern 2a, as designed.

## Implementation Plan

> Expected outcome: **no source edits** — a verification pass that ends in marking acceptance criteria and (only if the smoke test fails) a scoped bug-fix. Order: (1) re-confirm baseline build, (2) run the manual checklist, (3) fix any regression the checklist surfaces, (4) re-verify.

### Step 1 — Baseline build (done during investigation)
`npx tsc --noEmit` → EXIT 0 (clean). Working tree clean; foundation commits `b314ad1` (US-595), `8e7007d` (port), `f29e009` (US-596+597) present. No further build action unless Step 3 fires.

### Step 2 — Manual verification checklist (the deliverable)
Run the app (`npm start`) and confirm each behaves exactly as pre-refactor:

1. **Open Explorer** — open a folder (or use the NavPanel toolbar button on a text editor whose file has a folder). Sidebar appears with the Explorer panel; tree renders from `rootPath`.
2. **Tree nav** — single/double-click a file opens it in the main area (`openRawLink` with `sourceId: "explorer"`); selection highlights.
3. **Reveal-on-navigate** — opening a file (from anywhere) that lives under `rootPath` highlights + reveals it in the tree (`onMainEditorChanged` → `_selectAndReveal`).
4. **Reveal-on-expand** — collapse the sidebar to a different panel, re-activate Explorer → current file re-reveals (`onPanelExpanded`).
5. **Search open** — header 🔍 (or context-menu "Search in Folder") adds the `search` panel and expands it (`openSearch` → `secondaryView = ["explorer","search"]` → `expandPanel("search")`); results click opens with line reveal.
6. **Search close** — Search panel ✕ removes it and re-expands Explorer (`closeSearch`).
7. **Header actions** — Up / Collapse-All / Refresh / Make-Root (context menu) all work; Up disabled at drive root.
8. **Close-Panel ✕** (Explorer header) — confirm intended behavior (Concern B): the sidebar closes.
9. **Toggle from toolbar** — NavPanel button on a text editor toggles the sidebar open/closed (`toggleNavigator`); re-opening preserves tree state.
10. **Sidebar-only page** — an Explorer page with no main editor still shows the sidebar (Concern D); width-resize via splitter persists.
11. **Persistence / restart** — expand some tree nodes, open Search, restart the app → `rootPath`, tree expansion, selection, and the Search panel restore (`getRestoreData` / `applyRestoreData` / `restore`). A legacy session saved with the old `secondaryEditor` key simply re-derives panels on open (Concern 7 reset-to-default) — acceptable.

### Step 3 — Fix regressions (only if Step 2 fails)
Scope any fix to `editors/explorer/` (model + the two views). Do **not** absorb the cross-editor `NavigationState` relocation here (Concern A).

### Step 4 — Re-verify
Re-run `tsc --noEmit` + `npm run lint` if Step 3 touched code; otherwise they are already green.

## Concerns / Open Questions

### Concern A — `NavigationState` is imported from the concrete `PageModel`. **✅ Confirmed defer (user, 2026-06-02) — not Explorer-specific.**
`ExplorerEditorModel.ts:11` does `import type { NavigationState } from "../../api/pages/PageModel"` (for `selectionState: TOneState<NavigationState>`). This is a residual *type* coupling to the concrete `PageModel` that EPIC-029's decoupling spirit dislikes — **but** it is shared identically by **four** editors (Explorer `:56`, Archive `ArchiveEditor.ts:46`, Link `LinkEditor.ts:130`, Category `CategoryEditor.tsx:26`) and is type-only (zero runtime coupling — no `PageModel` value is imported). Relocating it to a neutral home (e.g. `api/pages/page-types.ts`) would touch files owned by US-599/US-600 and is pure churn with no behavior gain. **Decision: leave for US-598;** if we want it decoupled, do it as a one-line shared-type move at epic close-out (US-607) or fold into US-600 (which already finalizes the `IPageHost`/`isMain` surface). Flagged so the cross-cutting move is recorded, per the "amend the design within the pass" practice.

### Concern B — Close-Panel ✕ now closes the **whole sidebar**. **✅ Confirmed (user, 2026-06-02) — keep.**
`ExplorerSecondaryView` header ✕ calls `model.page?.setSecondaryViewsState({ open: false })` (the US-596 build-break fix that replaced the removed `SecondaryViewsModel.close()`). This hides the entire `SecondaryViews` sidebar (the `PageNavigator`), not just the Explorer panel. **User confirmed this is the intended behavior — closing the Explorer panel closes the navigator entirely; keep it for now.** Still smoke-tested in Step 2.8 as a no-regression check.

### Concern C — `setTimeout(…, 0)` before `expandPanel` in open/closeSearch. **Keep — intentional ordering.**
`openSearch`/`closeSearch` mutate `this.secondaryView` (the panel-list array) and then defer `this.page?.expandPanel(...)` by a `setTimeout(0)`. The defer is required: `expandPanel` (`PageModel.ts:449`) guards on `editors.some(e => e.secondaryView?.includes(panelId))`, so the slice-subscription that re-derives `panelEditors` must land first. This is pre-existing, behavior-neutral, and survives the refactor unchanged. Documented here so a future reader does not "simplify" it away.

### Concern D — Sidebar-only Explorer page (no main editor). **✅ Confirmed intent (user, 2026-06-02) — Explorer is sidebar-only; still verify render.**
Explorer pages can have `mainEditorId: null` (`PageModel` comment `:67` — "explorer-only"). The `<SecondaryViewsWrapper>` mount is gated on `page.state.hasSidebar`, not on a main editor, and `hasSidebar` (`PageModel.ts:191`) is true when any editor contributes panels. So a main-less Explorer page still renders the sidebar. Confirm in Step 2.10 (and that closing then re-toggling the navigator on such a page works via `toggleNavigator`).

### Concern E — Persistence round-trip + legacy `_`-prefixed keys. **In scope to verify; no change.**
`getRestoreData` (`:184`) persists `rootPath`/`treeState`/`selectedHref`/`searchState`; `restore` (`:220`) + `setPage` (`:229`) re-derive `secondaryView` from `searchState`. The EX3 backward-compat reads of legacy `_treeState`/`_selectedHref`/`_searchState` (`applyRestoreData:208-217`) are **pre-EPIC-029** and orthogonal — leave untouched. Verify the restart round-trip in Step 2.11; the Concern-7 reset-to-default for the renamed persisted `secondaryView` key is the accepted, low-stakes behavior.

### Out of scope (noted, not fixed here)
`doc/architecture/secondary-views.md` §12 still describes a pre-EPIC-028 `page.secondaryViews[]` array + `onSecondaryViewsChanged()` that no longer exist (it's `editors[]` + `panelEditors` getter now). Doc drift — belongs to the epic close-out doc pass (US-607), not this task.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `npm run lint` pass (trivially green if no code changed).
- [ ] All 11 manual checklist items in Step 2 behave identically to pre-refactor. *(manual)*
- [ ] No new Explorer-specific coupling to concrete `PageModel` is introduced; any regression fix stays inside `editors/explorer/`.
- [ ] Concern B (Close-Panel semantics) confirmed correct, or fixed with a one-line note.
- [ ] `NavigationState` relocation explicitly deferred (Concern A), not bundled here.

## Files Changed (summary)

| Area | File | Change |
|---|---|---|
| — | *(none expected)* | US-598 is verification-only; Explorer already compiles + renders under the new infra. |

**Conditional (only if Step 2 surfaces a regression):** a scoped fix in `editors/explorer/ExplorerEditorModel.ts`, `ExplorerSecondaryView.tsx`, or `SearchSecondaryView.tsx`.

**Explicitly NOT changed:** `NavigationState` import location (Concern A — cross-editor, deferred); the `setTimeout(0)` ordering (Concern C); EX3 legacy `_`-prefixed restore reads (Concern E); `secondary-views.md` §12 doc drift (US-607); `SecondaryViews.tsx` / `SecondaryViewsModel.ts` / `PageModel` host members (US-596/597 done); panel string IDs (`"explorer"`, `"search"`) and their `secondaryViewRegistry` registrations.
