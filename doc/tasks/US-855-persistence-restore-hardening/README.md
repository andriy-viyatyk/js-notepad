# US-855: Board Secondary Views — persistence & restore hardening

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md)
**Status:** Planned — awaiting review (do NOT implement until the user says "let's implement")

## Goal

Guarantee that a board's declared secondary views (`secondaryViewDefs`) and the
restorable subset of its shared state (`sharedState`) survive **app restart** and
**board reload** for both plain (`board-view`) and content-host boards, and fix the
one real gap this epic left open: a **busy plain board re-promoted after navigate-away
comes back with no secondary panels** because its derived panel list was cleared and
never re-derived.

## Background

The persistence/restore machinery for secondary views was almost entirely built by
US-851 → US-854. This task is **mostly verification with one focused code fix**. The
investigation below records exactly why each path already works, so the implementation
is a small, well-understood change rather than a broad sweep.

### Canonical fields (from the epic)

| Field | Meaning |
|-------|---------|
| `BoardEditorState.secondaryViewDefs?: SecondaryViewDecl[]` | Runtime set — seeded from the manifest on first load, replaced by `setSecondaryViews`. **Source of truth.** Persisted as a plain state field. |
| `BoardEditorState.secondaryView?: string[]` | **Derived** panel-id list (`board-secondary:<id>` per def) that `contributesPanels()` reads. Recomputed by `deriveSecondaryPanels()`. |
| `BoardEditorState.sharedState?: Record<string, unknown>` | Full in-memory shared state. Only the declared restorable subset is persisted. |
| `BoardEditorState.sharedStateRestorableKeys?: string[]` | Keys declared via `persephone.state.init(defaults, { restorableKeys })`. |

### How each persistence/restore path already works (verified 2026-07-15)

**Restart — save.** `BoardEditorModel.getRestoreData()` (`BoardEditorModel.ts:245`)
calls `super.getRestoreData()`, which returns `{ editorId, id, state: <whole state by
reference> }` — so `secondaryViewDefs`, `secondaryView`, and `sharedStateRestorableKeys`
are all carried in `data.state`. The override then pins `editorId = "board-view"` and
replaces `data.state = { ...data.state, sharedState: <filtered> }`, where `sharedState`
is the restorable-key subset only (D9). `BoardContentEditorModel.getRestoreData()`
(`BoardContentEditorModel.ts:162`) layers `data.host` on top. So both board kinds persist
the view defs + the restorable shared-state subset.

**Restart — restore.** Two branches in `PagesPersistenceModel.restorePage`
(`PagesPersistenceModel.ts`):
- Plain `board-view` → `NO_HOST_EDITOR_IDS` branch (line 128): `Object.assign(s, d.state)`
  copies `secondaryViewDefs` / `sharedState` / `sharedStateRestorableKeys` back onto the
  fresh state, then `restore()` runs.
- Content-host (`d.editorId === "board-view" && d.host`, line 85): the state is spread
  into the constructor, `applyRestoreData` stashes `_pendingHost`, then `restore()` runs
  (`super.restore()` handles the board bits, then the host is rebuilt).

  Both then call `BoardEditorModel.restore()` → `refreshBoards()` → `seedSecondaryViews()`.

**Restore precedence (persisted wins over manifest).** `seedSecondaryViews()`
(`BoardEditorModel.ts:326`) only reads the manifest **when `secondaryViewDefs ===
undefined`**. After restore the field is defined (even `[]`), so the manifest seed is
skipped and the persisted set wins — then `deriveSecondaryPanels()` recomputes
`secondaryView` from it (so any stale persisted `secondaryView` is overwritten by a fresh,
consistent derivation).

**`activePanel` restore validation.** `restorePage` (line 183–191) parses the persisted
`activePanel` with `parsePanelKey` (splits on the **first** `::`, so a composite
`<instanceUUID>::board-secondary:<viewId>` yields `panelId = "board-secondary:<viewId>"`
— the single inner colon is preserved) and validates `page.editors.some(e => e.id ===
editorId && e.secondaryView?.includes(panelId))`. Because `restore()` is awaited before
this runs, `secondaryView` is already re-derived, so a board panel that still exists
validates and a removed one falls back to `"explorer"`.

**Reload survival.** `reloadBoard()` bumps `state.reloadToken`; `BoardEditorView`
(`BoardEditorView.tsx:71`) and `BoardSecondaryView` (`BoardSecondaryView.tsx:48`) key their
`BoardWebview` on `reloadToken`, so only the **iframe** remounts — the **model** instance
(holding `secondaryViewDefs` + `sharedState`) is untouched. On remount, `handleLoad`
(`BoardWebview.tsx:190`) re-seeds the frame with the model's current `sharedState` +
`sharedStateSeq`, and (for content-host) the host content. So reload preserves everything
by construction.

**Shared-state `init` merge on restore.** After restore sets `sharedState` from the
persisted subset, the frame loads and the board calls `persephone.state.init(defaults,
{ restorableKeys })` → `initSharedState()` (`BoardEditorModel.ts:180`), which is
fill-missing (restored values win, defaults fill gaps) and records `restorableKeys`. So a
restored `selected` survives and any new default keys are filled.

### The one real gap — busy re-promotion (the seam US-854 flagged)

Only **plain** boards can be busy (`BoardContentEditorModel.keepAliveOnNavigation()` is
`false`). A busy plain board survives navigate-away as an invisible ownership handle
(`keepAliveOnNavigation()` true, US-799). On navigate-away, US-854's
`BoardEditorModel.beforeNavigateAway` override (`BoardEditorModel.ts:363`) clears **both**
`secondaryViewDefs` and (via `super`) the derived `secondaryView`. When the user later
navigates back to the same board, `PagesLifecycleModel` reuses the surviving instance
(`matchesNavigationTarget` → `setMainEditor(existing)` →
`existing.onNavigationReuse?.()`, `PagesLifecycleModel.ts:801–807`). But
`BoardEditorModel` implements **no** `onNavigationReuse`, and `secondaryViewDefs` was
wiped — so the re-promoted board shows **no** secondary panels.

**Root cause:** clearing `secondaryViewDefs` in `beforeNavigateAway` was over-eager.
Disposal of a *non-busy* board on navigate-away only needs the **derived** `secondaryView`
cleared (which makes `contributesPanels()` false → `setMainEditor` disposes it,
`PageModel.ts:414–422`) — the base `EditorModel.beforeNavigateAway` (`EditorModel.ts:135`)
already does exactly that. Wiping the underlying defs adds nothing for the disposed
non-busy board (its model is thrown away) and destroys the source of truth for the
*surviving* busy board.

### Related code (for the implementer — no changes needed here)

| Piece | Location | Note |
|-------|----------|------|
| Base `beforeNavigateAway` clears derived `secondaryView` | `editors/base/EditorModel.ts:135` | Sufficient for Pattern-A disposal. |
| `setMainEditor` survival/dispose decision | `api/pages/PageModel.ts:398–448` | `!contributesPanels() && !keepAliveOnNavigation()` → detach+dispose. |
| Navigation reuse invokes `onNavigationReuse` | `api/pages/PagesLifecycleModel.ts:801–807, 833` | Fires after re-promotion. |
| `matchesNavigationTarget` (board reuse match) | `editors/board/BoardEditorModel.ts:209` | Matches same `persephone-board://` root. |
| `deriveSecondaryPanels` / `seedSecondaryViews` | `editors/board/BoardEditorModel.ts:326–344` | Re-derive / guarded manifest re-seed. |
| `restorePage` drops demoted-busy board descriptors | `api/pages/PagesPersistenceModel.ts:76` | A busy board persisted while demoted never resurrects (busy is transient). |

## Implementation plan

The only production change is in **`src/renderer/editors/board/BoardEditorModel.ts`**.

### Step 1 — Stop wiping `secondaryViewDefs` on navigate-away; delete the US-854 override

The base `EditorModel.beforeNavigateAway` already clears the derived `secondaryView`
(making `contributesPanels()` false so a non-busy board is disposed — the Pattern-A
guarantee, forced at the Persephone side). Removing the board override **preserves that
guarantee** while keeping `secondaryViewDefs` (the source of truth) intact for a surviving
busy board.

Delete the override (`BoardEditorModel.ts:355–366`):

```ts
// BEFORE
/** Boards never linger on the page as sidebar-panel contributors (EPIC-044 / D8).
 *  ... */
override beforeNavigateAway(newModel: EditorModel): void {
    this.state.update((s) => { s.secondaryViewDefs = undefined; });
    super.beforeNavigateAway(newModel); // clears the derived state.secondaryView
}
```

```ts
// AFTER — deleted. Base EditorModel.beforeNavigateAway clears the derived
// `secondaryView`, which is all Pattern-A disposal needs; `secondaryViewDefs`
// is retained so a surviving busy board can re-derive on re-promotion.
```

If `EditorModel` ends up otherwise unused in the file after this deletion, drop it from
the import on line 3 (it is currently referenced only by this override's signature —
**verify** whether any other member still references the `EditorModel` type before
removing the import).

### Step 2 — Re-derive panels when a surviving board is re-promoted

Add an `onNavigationReuse()` override next to `setSecondaryViews` (after
`BoardEditorModel.ts:353`):

```ts
/** A busy board that survived navigate-away (US-799) had its derived `secondaryView`
 *  cleared by the base `beforeNavigateAway` while demoted. On re-promotion the page
 *  reuses this instance (PagesLifecycleModel → matchesNavigationTarget), so re-derive
 *  the panel-id list from the RETAINED `secondaryViewDefs` — the board comes back with
 *  exactly the views it had (manifest- or runtime-declared), no manifest re-read, no
 *  race with the remounting frame's own `setSecondaryViews`. (EPIC-044 / US-855.) */
override onNavigationReuse(): void {
    this.deriveSecondaryPanels();
}
```

`deriveSecondaryPanels()` reads the retained `secondaryViewDefs` (`[]` → `secondaryView =
undefined`; populated → the `board-secondary:<id>` list), so a board with no views stays
panel-less and one with views gets them back immediately (sync). The remounted frame
re-seeds shared state via `handleLoad`, and a board that declares views at runtime
re-calls `setSecondaryViews` when its script re-runs — both consistent with the re-derived
set.

### Step 3 — Update epic tracking

- `doc/epics/EPIC-044.md`: add US-855 to "Implemented so far"; mark the US-855 task-row
  `✅` and tighten its crux to the verified reality (persistence/reload work by
  construction; the code change is the busy-re-promotion seam fix — delete the
  `beforeNavigateAway` defs-wipe, add `onNavigationReuse` re-derive). Keep it ticket-free
  where the doc is architecture-style; the task-breakdown table may keep task ids.
- `doc/active-work.md`: link the US-855 entry to this document.

## Concerns / decisions

- **C1 — Does deleting US-854's `beforeNavigateAway` override regress the user's
  "force-clear at the Persephone side" requirement?** No. The user's requirement was that
  a board must **not linger as a visible sidebar contributor** when navigated away, forced
  by Persephone (not board cooperation). The base `EditorModel.beforeNavigateAway`
  (Persephone code) clears the derived `secondaryView`, so `contributesPanels()` is false
  and a non-busy board is disposed — identical observable behavior to US-854. We only stop
  *also* wiping the underlying `secondaryViewDefs`, which mattered solely for the surviving
  busy handle. **Resolution:** delete the override; the guarantee is preserved by the base.

- **C2 — Why re-derive (`deriveSecondaryPanels`) instead of re-seed
  (`seedSecondaryViews`) in `onNavigationReuse`?** Re-derive uses the **retained** defs, so
  it restores the exact set the board last had — including runtime `setSecondaryViews`
  state — synchronously and without re-reading the manifest. `seedSecondaryViews` would
  (a) only recover the manifest set (defs are no longer undefined, so its guard skips the
  manifest read anyway — making it equivalent but async) and, in the rejected Approach Y
  where defs *are* wiped, (b) race the remounting frame's script re-calling
  `setSecondaryViews` (TOCTOU in the `=== undefined` guard). **Resolution:** re-derive from
  retained defs (Approach X).

- **C3 — Manifest edits to `secondaryViews` don't take effect on reload.** By design (D6):
  the manifest only *seeds* on first load; the persisted/runtime set then wins, and
  `reloadBoard` deliberately preserves the model (so `secondaryViewDefs` survives). This
  matches how manifest `fileMasks` changes also require a full re-open, not a reload. A
  board that wants dynamic views uses `persephone.setSecondaryViews`. **Resolution:**
  accept as consistent, documented behavior; out of scope for US-855. (If the user wants
  reload to re-read the manifest, that is a separate enhancement.)

- **C4 — Content-host boards and `onNavigationReuse`.** Content-host boards never survive
  navigation (`keepAliveOnNavigation()` / `survivesNavigation()` both `false`) and open via
  file navigation, not `persephone-board://`, so the reuse path does not fire for them. The
  inherited `onNavigationReuse` is therefore a harmless no-op for them. **Resolution:** put
  the override on the base `BoardEditorModel`; no `BoardContentEditorModel` change.

## Acceptance criteria

1. **Restart — plain board.** A trusted board declaring `secondaryViews` in its manifest,
   opened and left open, still shows its secondary panel(s) with the correct title/icon
   after an app restart.
2. **Restart — restorable shared state.** A board that calls `persephone.state.init(defaults,
   { restorableKeys: ["selected"] })` and sets `selected` persists **only** `selected`
   across restart (undeclared keys are absent from `openFiles.txt`); after restart
   `persephone.state.get()` returns the restored `selected`, with defaults filling any new
   keys.
3. **Restart — content-host board.** A content-host board (e.g. the US-857 Todo board)
   restores its file content (via `d.host`) **and** its secondary views + restorable shared
   state together.
4. **Restore precedence.** With a persisted `secondaryViewDefs`, the persisted set is used
   (the manifest is not re-read); `secondaryView` is re-derived consistently.
5. **`activePanel` restore.** If a board secondary panel was the active sidebar panel at
   shutdown and still exists, it is restored as active; if it no longer exists, the sidebar
   falls back to `"explorer"` (no crash, no dangling composite key).
6. **Reload.** `reloadBoard` (manual Reload / `board_refresh`) remounts the iframe(s) but
   preserves `secondaryViewDefs` and `sharedState`; panels and shared state persist across
   the reload.
7. **Busy re-promotion (the fix).** A **busy plain board** with secondary views that is
   navigated away (surviving as an invisible handle) and then re-opened to the **same**
   board comes back **with its secondary panels restored** (re-derived from the retained
   defs). A non-busy board is still disposed on navigate-away (no lingering sidebar).
8. Typecheck (`npx tsc --noEmit`) and lint (`npx eslint`) are clean.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/board/BoardEditorModel.ts` | Delete the US-854 `beforeNavigateAway` override (revert to base, which clears only the derived `secondaryView`); add an `onNavigationReuse()` override that calls `deriveSecondaryPanels()`. Drop the now-unused `EditorModel` import **only if** nothing else references the type. |
| `doc/epics/EPIC-044.md` | Add US-855 to "Implemented so far"; mark the task row `✅` and tighten its crux. |
| `doc/active-work.md` | Link the US-855 dashboard entry to this document. |

## Files NOT changed (verified sufficient — do not re-investigate)

- `src/renderer/api/pages/PagesPersistenceModel.ts` — both restore branches already copy
  the view/shared-state fields and validate `activePanel` correctly.
- `src/renderer/editors/board/BoardContentEditorModel.ts` — `getRestoreData` already layers
  `d.host` over the base (which now carries the view defs + restorable shared state);
  content-host boards don't hit the reuse path.
- `src/renderer/editors/board/BoardWebview.tsx` — `handleLoad` already re-seeds shared state
  + host content on (re)mount; reload survival is by construction.
- `src/renderer/editors/board/BoardSecondaryView.tsx`, `board-secondary.ts`,
  `ui/secondary-views/panel-key.ts`, `secondary-view-registry.ts` — render path + composite
  key parsing already handle the `board-secondary:*` family correctly.
- `src/renderer/editors/base/EditorModel.ts` — base `beforeNavigateAway` /
  `onNavigationReuse` hook signatures are already in place.
- `src/shared/persistence.ts` — freeform `EditorDescriptor.state` needs no schema change
  (additive optional fields).
