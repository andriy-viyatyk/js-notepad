# US-600: Links — finalize `IPageHost` membership + wire `editor.isMain`

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 1b · **Status:** ✅ Implemented (2026-06-02) — all concern resolutions applied (A relocate now, B/C/D/E as proposed); `tsc --noEmit` + `eslint` clean; pending manual smoke test.

## Goal

Migrate the **Link** editor (Categories / Tags / Hostnames panels) onto the finalized `SecondaryViews` API and, because Link is the editor that exercises the **full** `editor.page` surface (EPIC-029 Concern 2), use it to **finalize `IPageHost` membership**:

1. **Wire up `editor.isMain`** — replace the view-side `page.state.mainEditorId === editor.id` comparisons (and the model-side `page.mainEditorInstance === this` comparisons) with the derived `editor.isMain` getter US-597 introduced but left unused.
2. **Trim `IPageHost`** to exactly what editors reach through `editor.page` — remove `setMainEditor?` and `close?` (no `editor.page` caller anywhere; verified by grep).
3. **Relocate `NavigationState`** off the concrete `PageModel` (the deferred Concern A from US-598/599) — the last residual editor→`PageModel` type coupling.

Unlike US-598/599 (verification-only), **this task makes real edits.** All are behavior-neutral: `editor.isMain` is definitionally equal to the comparisons it replaces, and the trims/relocations are type-surface-only.

## Background

### Link's full `editor.page` surface (verified 2026-06-02)

| Member | Reached at | Disposition |
|---|---|---|
| `id` | `LinkBody:36`, `LinkTagsSecondaryView:188`, `LinkCategorySecondaryView:79` | `IPageHost` required ✓ |
| `state` | `CategoryEditor:66`, `LinkCategorySecondaryView:28`, `LinkTagsSecondaryView:180` | required ✓ |
| `secondaryViewsModel` (→ `.state`) | `LinkBody:39` | required ✓ |
| `panelEditors` | `CategoryEditor:71` | required ✓ |
| `expandPanel` | `LinkEditor:402` | required ✓ |
| `mainEditorInstance` | `LinkEditor:357,392` (→ collapse to `isMain`) | optional (still read by `EditorModel.isMain` + `TextEditorModel`) |
| `promoteSecondaryToMain` | `LinkCategorySecondaryView:46` | optional ✓ |

Link reaches **no** `setMainEditor` / `close` / `mainEditor` (unwrapped) / `switchMainEditor` through `editor.page`. The epic named Link "the editor that exercises the full surface," and it does — so its audit is what finalizes the contract.

### The `mainEditorId` / `mainEditorInstance` comparison sites

**View-side** (the two that compute "am I the page's main editor?" to switch a panel between its main-form and its standalone-secondary-form):
- `LinkCategorySecondaryView.tsx:28-29` — `const mainEditorId = useOptionalState(editor.page?.state, (s) => s.mainEditorId, null); const isMainEditor = mainEditorId === editor.id;`
- `LinkTagsSecondaryView.tsx:180-181` — identical pattern.

**Model-side** (LinkEditor lifecycle guards):
- `LinkEditor.ts:357` — `if (this.page?.mainEditorInstance === this) return;` (LK8 tags-slice: main handled by LK6).
- `LinkEditor.ts:392` — `if (this.page?.mainEditorInstance !== this) return;` (`setSidebarPanels` demote-safe no-op).

**Equivalence (why this is behavior-neutral):** `editor.isMain` (`EditorModel.ts:183`) returns `this.page?.mainEditorInstance === this`, and `mainEditorInstance` = `editors.find(e => e.id === _mainEditorId)`. With unique editor ids (always true in steady state, and `_mainEditorId` is assigned *before* the `state.mainEditorId` update in `set mainEditor`/`setMainEditor`), `mainEditorInstance === this` ⟺ `_mainEditorId === this.id` ⟺ `state.mainEditorId === editor.id`. So `isMain` is the identity-based form of the same predicate — strictly more correct, never different in practice.

**Reactivity** (US-597 Concern C): `isMain` is a plain getter (non-reactive). The views currently get re-renders by subscribing to `editor.page?.state` and selecting `mainEditorId`. `useOptionalState` subscribes to the **whole** state and recomputes the selector on every change, updating local state only when the selected value changes (`state.ts:148-150`). So the faithful rewrite keeps the `page.state` subscription but returns `isMain` from the selector:
```ts
const isMainEditor = useOptionalState(editor.page?.state, () => editor.isMain, false);
```
On a `mainEditorId` flip, `editor.isMain` flips → re-render; on unrelated `version` bumps, the boolean is unchanged → React bails. Equivalent re-render behavior to today, value read from the canonical getter. (`_mainEditorId` is current when the subscriber fires, so `isMain` is consistent.)

### `NavigationState` coupling (deferred Concern A from US-598 + US-599)

`NavigationState` (`{ selectedHref: string | null }`) is **defined in** `PageModel.ts:24` but used **only by editors**: `ExplorerEditorModel:56`, `ArchiveEditor:46`, `LinkEditor:130`, and `CategoryEditor`'s `ITreeProviderHost` duck-type (`:26`). `PageModel` itself does not consume it. It is a tree-selection shape, not page state — its home in `PageModel` is the last residual editor→concrete-`PageModel` type import. US-598/599 deferred the move to here.

### Files confirmed clean of stale naming

Grep of `editors/link-editor/` for `PageNavigator` / `secondaryEditor` / `ensurePageNavigatorModel` / `IPanelHost` → swept by US-595. Link uses current names (`secondaryView`, `expandPanel`, `secondaryViewsModel`).

## Implementation Plan

> Order: (1) wire `isMain` in the two views, (2) collapse the two model-side comparisons, (3) trim `IPageHost`, (4) relocate `NavigationState`, (5) `tsc --noEmit` + `eslint`, (6) manual smoke test. Steps 3–4 are independent of 1–2 and can be staged separately if preferred.

### Step 1 — Wire `editor.isMain` in the two Link secondary views

`src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.tsx` (`:27-29`):
```ts
// before
// Subscribe to mainEditorId so we re-render on promote/demote toggle.
const mainEditorId = useOptionalState(editor.page?.state, (s) => s.mainEditorId, null);
const isMainEditor = mainEditorId === editor.id;
// after
// Subscribe to page.state for the re-render signal; read the canonical value
// from editor.isMain (US-600 / EPIC-029 Concern 2b).
const isMainEditor = useOptionalState(editor.page?.state, () => editor.isMain, false);
```
`src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx` (`:180-181`): identical replacement. (`useOptionalState` import already present in both.)

### Step 2 — Collapse the model-side comparisons in `LinkEditor.ts`

- `:357` — `if (this.page?.mainEditorInstance === this) return; // main; LK6 handles` → `if (this.isMain) return; // main; LK6 handles`
- `:392` — `if (this.page?.mainEditorInstance !== this) return; // demote-safe no-op` → `if (!this.isMain) return; // demote-safe no-op`

No other change in `LinkEditor`. (Keeps `import type { IPageHost }`; `mainEditorInstance` is no longer referenced directly here but remains an `IPageHost` member for `TextEditorModel` + the `isMain` getter.)

### Step 3 — Finalize (trim) `IPageHost`

`src/renderer/api/pages/IPageHost.ts` — remove the two optional members no editor reaches via `editor.page`:
```ts
// remove these two lines (PageModel keeps them as concrete methods; they are
// only called via the concrete `pagesModel`, never through `editor.page`):
setMainEditor?(editor: EditorModel | null): Promise<void>;
close?(): Promise<boolean>;
```
Keep `mainEditor?`, `mainEditorInstance?`, `switchMainEditor?`, `promoteSecondaryToMain?` (each has a live `editor.page?.…` caller — Archive close-button gate, Archive/`isMain`/Text reads, PageToolbar switch, Link promote). `PageModel` is unaffected (it still declares all of them concretely; `implements IPageHost` only requires a superset). Update the doc-comment to record membership as **final** (no longer "provisional").

### Step 4 — Relocate `NavigationState`

- **New file** `src/renderer/editors/base/navigation-state.ts`:
  ```ts
  /** Tree-selection shape shared by the tree-provider editors (Explorer,
   *  Archive, Link) and read by CategoryEditor's ITreeProviderHost duck-type.
   *  Relocated off PageModel in US-600 (EPIC-029) to drop the last residual
   *  editor→concrete-PageModel type coupling. */
  export interface NavigationState {
      selectedHref: string | null;
  }
  ```
- **Remove** the `export interface NavigationState { … }` block from `PageModel.ts:24-27`; add `import type { NavigationState } from "../../editors/base/navigation-state";` **only if** `PageModel` references it (it does not today — confirm with `tsc`; if unreferenced, no import needed). Re-export from `PageModel` is **not** added (callers move to the new path).
- **Update the 4 importers** to `import type { NavigationState } from "<rel>/editors/base/navigation-state";`:
  - `editors/explorer/ExplorerEditorModel.ts:11`
  - `editors/archive/ArchiveEditor.ts:12`
  - `editors/link-editor/LinkEditor.ts:12`
  - `editors/category/CategoryEditor.tsx:13`

> Pure type-only import swap, zero runtime change. Touches Explorer/Archive (already smoke-tested) but only their import lines — no re-test of those editors needed.

### Step 5 — Verify
`npx tsc --noEmit` + `npx eslint` on the changed files. Expected clean; the only plausible error is a missed `mainEditorId`/`NavigationState` reference, fixed in place.

### Step 6 — Manual smoke test (Link is the survival + promote/demote stress case)
Run `npm start` with a `.link.json` collection:
1. **Open Link collection** — opens as main; left Category/Tags/Hostnames panels render in-body (`LinkBody`, sidebar closed).
2. **Toggle navigator open** — panels move into the `SecondaryViews` sidebar (`setSidebarPanels(true)` → `secondaryView = LINK_PANELS`); the previously-expanded panel is active.
3. **"Open as main editor" (Categories panel ✕/swap)** — `promoteSecondaryToMain` swaps the Category view to main; header label flips ("Categories" ↔ "Links"); confirm the `isMain`-driven header + body switch is immediate (this is the reactivity path from Step 1).
4. **Demote back** — toggle again; panel returns to standalone-secondary form (Tags shows the links list; `link-hostnames` correctly dropped per LK8).
5. **Navigate within links** — click a link (category/tag source) → opens in main, Link panels **survive** as sidebar (`beforeNavigateAway`/`onMainEditorChanged` keep-path via `_isOpenedFromMe`).
6. **Navigate externally** — open an unrelated file → Link panels **drop** (self-evict).
7. **Tags zero-cross** — delete the last tag while demoted → `link-tags` panel disappears (LK8 slice-sub), `link-category` remains.
8. **Category sibling page** — open a `tree-category://` link from the collection → `CategoryEditor` finds the Link host via `panelEditors` scan and renders; selection highlights sync.
9. **Persistence / restart** — restart with the collection open (as main, and in the demoted-with-a-file-as-main case) → restores; panels re-derive.

## Concerns / Open Questions

### Concern A — Relocate `NavigationState` now (US-600), or keep deferring? **Recommend: do it now.**
US-598/599 deferred the move to "US-600 or close-out." US-600 is the typing-finalization task and already edits the `editor.page` type surface, so this is its natural home — finishing the editor↔`PageModel` decoupling in the same pass the contract is finalized. It is a pure type-only import swap (Step 4); the Explorer/Archive touch is one import line each, needing no behavioral re-test. **Open sub-decision:** the target path — proposed `editors/base/navigation-state.ts` (all consumers are editors; no import cycle). Alternatives: `api/pages/navigation-state.ts` (keeps it near pages) or fold into `IPageHost.ts` (rejected — it's not a host concern). If you'd rather keep deferring to US-607, drop Step 4 and this stays a Links-only task.

### Concern B — `isMain` reactivity rewrite. **Decision: `useOptionalState(page?.state, () => editor.isMain, false)`.**
The selector ignores its `s` arg and reads `editor.isMain`; `useOptionalState` recomputes it on every `page.state` change and re-renders only when the boolean flips (`state.ts` impl confirmed). Equivalent re-render cadence to today's `mainEditorId` selection. The two-line form (`useOptionalState(page?.state, (s) => s.mainEditorId, null);` for the subscription + `const isMainEditor = editor.isMain;`) is behaviorally identical but leaves a throwaway call; the one-line form is preferred. Verified consistent because `_mainEditorId` is set before the `state.mainEditorId` update, so `isMain` reads the new value when the subscriber fires.

### Concern C — Trim `setMainEditor?`/`close?` from `IPageHost`. **Decision: trim.**
Grep confirms neither is reached through `editor.page` anywhere (only via the concrete `pagesModel`). `IPageHost` is the editor↔owner contract, so it should advertise only what editors reach; trimming honors EPIC-029's "minimal interface, finalized at the LinkEditor migration." `PageModel` keeps both as concrete methods — `implements IPageHost` is a superset, so no PageModel change and `tsc` stays green. Low risk; reversible.

### Concern D — `IPageState.mainEditorId` stays. **Clarification, no change.**
US-600 removes the **views'** id-comparison, not the reactive **field**. `state.mainEditorId` still drives `PageContent` re-render (`Pages.tsx:68`), `PageTab` (`:521`), and now also serves as the change signal the Link views subscribe to (their selector reads `isMain`, but the field's bump is what fires the subscription). Removing the field is out of scope and would break unrelated UI.

### Concern E — Membership is now FINAL (Link exercised the full surface). **Record.**
After Steps 1–3 the `IPageHost` optional group is exactly `{ mainEditor?, mainEditorInstance?, switchMainEditor?, promoteSecondaryToMain? }` — every one with a live `editor.page?.…` caller; required core unchanged from US-597. No member needed a required↔optional flip, validating the US-597 provisional split. Update `IPageHost.ts` + EPIC-029 Concern 2 status from "provisional" to "final".

### Out of scope (noted, not fixed here)
- The Browser host (`BrowserPanelHost`) that will hardcode `isMain = true` for its embedded Link editor and omit the optional nav group — **US-601**.
- `secondary-views.md` doc drift (stale `page.secondaryViews[]` / `onSecondaryViewsChanged`) — epic close-out **US-607**.
- LinkEditor's broader internals (HS1 host-slot, LK4/LK5 serialize-back, tree provider) — unrelated to the navigator decoupling; untouched.

## Acceptance Criteria

- [x] `npx tsc --noEmit` and `npm run lint` pass with zero errors.
- [x] `LinkCategorySecondaryView` and `LinkTagsSecondaryView` read `editor.isMain` (no `mainEditorId === editor.id` comparison remains in views); `LinkEditor.ts:357/392` use `this.isMain`.
- [x] `IPageHost` no longer declares `setMainEditor?` / `close?`; the four remaining optional members each still have a live `editor.page` caller; `PageModel implements IPageHost` compiles unchanged.
- [x] `NavigationState` is defined outside `PageModel` (`editors/base/navigation-state.ts`); all 4 editor importers updated; no source imports it from `PageModel` (Concern A — approved, relocated now).
- [ ] All 9 manual smoke-test items behave identically to pre-task, **especially** promote/demote header+body switch (item 3) and survival keep/drop (items 5–6). *(manual)*

## Files Changed (summary)

| Area | File | Change |
|---|---|---|
| View: isMain | `link-editor/panels/LinkCategorySecondaryView.tsx` | `mainEditorId === id` → `useOptionalState(page?.state, () => editor.isMain, false)` |
| View: isMain | `link-editor/panels/LinkTagsSecondaryView.tsx` | same |
| Model: isMain | `link-editor/LinkEditor.ts` | `:357`/`:392` `mainEditorInstance === this` → `this.isMain` |
| Contract trim | `api/pages/IPageHost.ts` | remove `setMainEditor?` + `close?`; mark membership final |
| Type relocate | `editors/base/navigation-state.ts` | **NEW** — `NavigationState` *(Concern A)* |
| Type relocate | `api/pages/PageModel.ts` | remove `NavigationState` definition *(Concern A)* |
| Type relocate | `editors/{explorer/ExplorerEditorModel,archive/ArchiveEditor,link-editor/LinkEditor}.ts`, `editors/category/CategoryEditor.tsx` | import `NavigationState` from new path *(Concern A)* |
| Doc | `doc/epics/EPIC-029.md` | Concern 2 status provisional → final |

**Explicitly NOT changed:** `IPageState.mainEditorId` field (Concern D); the four surviving optional `IPageHost` members; `PageModel`'s concrete `setMainEditor`/`close`; LinkEditor internals beyond the two guards; Explorer/Archive behavior (only their `NavigationState` import line moves); `SecondaryViews.tsx` / `SecondaryViewsModel.ts`; panel string IDs + registrations.
