# US-619: Allow multiple secondary-view panels of the same type (composite panel keys)

**Epic:** [EPIC-031 — Git Functionality Enhancements (incremental)](../../epics/EPIC-031.md)
**Status:** ✅ Completed (2026-06-09) — user-tested; `/review` (1 must-fix + 2 suggestions applied) + `/document` + `/userdoc` done; marked `[x]`. Stays listed under EPIC-031.

---

## Goal

Let the sidebar render **every** secondary view that the page's models expose, with no restriction on panel-id uniqueness. Today two models contributing the same panel id (two open git repos, each contributing `"git-changes"`) collide: only one panel renders. After this task, opening repo A's then repo B's `.git` shows **two** independent "Changes" panels — one per repo — each titled `[<repoName>] Changes`. Dedup stays where it belongs: at the **model** level (re-clicking the same repo reuses its existing model — already implemented), not at the render level.

## Background

### The wrong-layer restriction

The whole sidebar assumes **a panel id is unique within a page**. That assumption is baked into three places:

1. **`SecondaryViews.tsx`** (`seenPanelIds` dedup, ~line 64–71) — defensively drops any panel whose `panelId` was already seen. Pure render-layer restriction.
2. **`CollapsiblePanelStack.tsx`** (`key={panel.id}`, line 183; `isOpen = activePanel === panel.id`, line 180) — React keys + the single-`activePanel` accordion both key off the bare panel id.
3. **`activePanel` is a single bare panel-id string** (`SecondaryViewsModel.state.activePanel`, `PageModel`/`BrowserPanelHost`, persistence). The accordion expands "the panel whose id === activePanel". With two `"git-changes"` panels the id can't disambiguate them.

#1 is just wrong and should be removed. #2/#3 are the real structural constraint: the accordion needs a **unique identity per rendered panel** to track which one is expanded.

### Model-level dedup already exists

`navigatePageTo` (`PagesLifecycleModel.ts`) scans `page.editors` for `matchesNavigationTarget?.(target, filePath)` **before** creating a new editor. `GitTreeEditorModel.matchesNavigationTarget` matches a `git-tree` target whose decoded `repoRoot` equals its own — so re-clicking the same repo's `.git` promotes/refreshes the existing instance instead of stacking a duplicate. **No change needed there.** Different repos correctly do *not* match (different `repoRoot`), so both models coexist — which is exactly what surfaces the render-layer bug.

### The fix: identity = `(model.id, panelId)`, owned by the sidebar

A rendered panel's unique identity is the **composite** of its owning model id and its panel-type id. The **model keeps declaring the panel type** (`secondaryView = ["git-changes"]`); the **sidebar composes** the unique key. No model encodes instance identity into its panel id.

- Composite key string: `` `${editorId}::${panelId}` ``. Editor ids are UUIDs and panel ids are kebab-case — neither contains `::`, so it is an unambiguous separator.
- `activePanel` stores the **composite** key. The model-facing API (`expandPanel(panelId)`, `onPanelExpanded(panelId)`, the `panelExpanded` event payload) keeps using the **bare** panel id, so no model or event subscriber changes.
- The registry lookup keeps using the **bare** panel id (it is already a separate variable in the render loop), so the single registered `GitChangesSecondaryView` still resolves for every instance.

### Key files (verified during investigation)

| File | Role in this change |
|------|--------------------|
| `src/renderer/ui/secondary-views/SecondaryViews.tsx` | Render loop; `seenPanelIds` dedup; passes `id`/`activePanel` to the stack. **Shared by Pages.tsx AND BrowserSecondaryViews** — one fix covers the browser. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx` | Generic accordion; keys by `panel.id`, single `activePanel`. **No change** — it already works on whatever id string it's given (composite). UIKit stays panel-key-agnostic. |
| `src/renderer/ui/secondary-views/SecondaryViewsModel.ts` | Holds `activePanel: string`. No type change (still a string; now holds composite). |
| `src/renderer/api/pages/PageModel.ts` | `expandPanel`, `setSecondaryViewsState` (owner lookup + `onPanelExpanded` + `panelExpanded.send`), `detach` reset rule, `activePanel` getter/setter, seed. |
| `src/renderer/editors/browser/BrowserPanelHost.ts` | Mirrors PageModel's `expandPanel`/`setSecondaryViewsState`; needs the same treatment. |
| `src/renderer/api/pages/IPageHost.ts` | Add `activePanelId` (bare) to the contract. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Restore validity check for `sidebar.activePanel` (now composite). |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts` | `this.page?.activePanel === "explorer"` comparison. |
| `src/renderer/editors/archive/ArchiveEditor.ts` | `this.page?.activePanel === "archive-tree"` comparison. |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | Add `get repoName()`. **No panel-id change.** |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | Header `[<repoName>] Changes`. |

Verified callers of `expandPanel` (all pass **bare** ids, all single-instance panels — so resolving "the editor that owns this bare id" is unambiguous): Explorer (`"search"`/`"explorer"`), Archive (`"archive-tree"`), Link (`"link-category"`), Notebook (`"notebook-categories"`), Rest (`"rest-panel"`), Todo (`"todo-panel"`), `PagesLifecycleModel` (`"link-category"`). `git-changes` has **no** `expandPanel` caller.

Verified `panelExpanded` subscribers (`LinkBody.tsx:31`, `NotebookBody.tsx:38`) read `event.panelId` and map by **bare** id → the event payload MUST stay bare.

## Implementation plan

### Step 1 — `panel-key.ts` helper (new)

`src/renderer/ui/secondary-views/panel-key.ts`:

```ts
const SEP = "::";
/** Compose a rendered-panel's unique key from its owning editor id + panel-type id. */
export function panelKey(editorId: string, panelId: string): string {
    return `${editorId}${SEP}${panelId}`;
}
/** Split a composite key. A bare id (no separator — legacy/seed value like
 *  "explorer") parses to { editorId: "", panelId: <bare> }. */
export function parsePanelKey(key: string): { editorId: string; panelId: string } {
    const i = key.indexOf(SEP);
    if (i < 0) return { editorId: "", panelId: key };
    return { editorId: key.slice(0, i), panelId: key.slice(i + SEP.length) };
}
/** The bare panel-type id of a composite key (or the key itself if bare). */
export function panelIdOf(key: string): string {
    return parsePanelKey(key).panelId;
}
```

### Step 2 — `SecondaryViews.tsx`: render all + composite id + seed resolution

- **Remove** the `seenPanelIds` dedup block entirely (render every `(model, panelId)` pair). Keep returning `null` for an unregistered `panelId` (`!def`).
- For each pair compute `const key = panelKey(model.id, panelId)`. Pass `id={key}` to `<CollapsiblePanel>`. `refKey` (already `${model.id}-${panelId}`) stays the React key + header-ref key. Registry lookup stays on bare `panelId`.
- **Seed/legacy resolution:** before passing `activePanel` to `<CollapsiblePanelStack>`, resolve a bare value to its composite so the default `"explorer"` (and any pre-US-619 persisted bare id) still expands the right panel:
  ```ts
  // collect rendered { key, panelId } first; then:
  let active = state.activePanel;
  if (!active.includes("::")) {
      const hit = rendered.find((p) => p.panelId === active);
      if (hit) active = hit.key;
  }
  ```
  Pass `active` to the stack. `setActivePanel={(id) => setState({ activePanel: id })}` is unchanged — the stack toggles with the composite `panel.id`, so `state.activePanel` becomes composite after any interaction.

### Step 3 — `PageModel.ts`

- **`expandPanel(panelId)`** — accept bare (resolve owner) or composite (use as-is):
  ```ts
  expandPanel(panelId: string): void {
      if (!panelId) return;
      if (panelId.includes("::")) { this.setActivePanel(panelId); return; }
      const owner = this.editors.find((e) => e.secondaryView?.includes(panelId));
      if (!owner) return;
      this.setActivePanel(panelKey(owner.id, panelId));
  }
  ```
- **`setSecondaryViewsState`** — derive the bare panel id + owner from the composite for the side effects:
  ```ts
  if (patch.activePanel !== undefined && patch.activePanel !== prev.activePanel) {
      this._activePanel = patch.activePanel;
      const { editorId, panelId } = parsePanelKey(patch.activePanel);
      const owner = this.editors.find((e) => e.id === editorId)
          ?? this.editors.find((e) => e.secondaryView?.includes(panelId));
      owner?.onPanelExpanded(panelId);                                  // bare
      panelExpanded.send({ pageId: this.id, panelId });                // bare
  }
  ```
- **`detach`** — reset `activePanel` to `"explorer"` when the detached editor owned the active panel:
  ```ts
  if (parsePanelKey(this.activePanel).editorId === editor.id) {
      this.activePanel = "explorer";
  }
  ```
  (Replaces the old `panels?.includes(this.activePanel) || this.activePanel === editor.id` check — the composite editorId covers both cases.)
- **Add** `get activePanelId(): string { return panelIdOf(this.activePanel); }`.
- The `_activePanel = "explorer"` seed and the `ensureSecondaryViewsModel` seed stay bare (resolved at render in Step 2).

### Step 4 — `BrowserPanelHost.ts`

Mirror Step 3 for its single-editor host:
- `expandPanel` — composite passthrough, else `panelKey(this._editor.id, panelId)`.
- `setSecondaryViewsState` — `parsePanelKey` → `this._editor?.onPanelExpanded(panelId)` (bare) + `panelExpanded.send({ panelId })` (bare).
- Add `get activePanelId()`.
- `_activePanel = "link-category"` seed stays bare (resolved at render by the shared `SecondaryViews`).

### Step 5 — `IPageHost.ts`

Add `activePanelId: string;` to the contract (both `PageModel` and `BrowserPanelHost` implement it).

### Step 6 — `PagesPersistenceModel.ts` restore validity

`sidebar.activePanel` may now be composite. Validate by parsed panel id, and require the named editor to still exist:
```ts
const panel = desc.sidebar.activePanel;
const { editorId, panelId } = parsePanelKey(panel);
const valid =
    panelId === "explorer" ||
    panelId === "search" ||
    (editorId
        ? page.editors.some((e) => e.id === editorId && e.secondaryView?.includes(panelId))
        : page.editors.some((e) => e.secondaryView?.includes(panelId)));
page.activePanel = valid ? panel : "explorer";
```
(`getDescriptor` already stores `activePanel: this.activePanel` verbatim — composite is stored as-is; editor ids are stable across restore, so the composite re-validates.)

### Step 7 — model-side comparisons → `activePanelId`

- `ExplorerEditorModel.ts:143` → `if (href && this.page?.activePanelId === "explorer")`.
- `ArchiveEditor.ts:114` → `if (url && this.page?.activePanelId === "archive-tree")`.

### Step 8 — repo name in the Changes header

- `GitTreeEditorModel.ts` — add the basename getter (reuse the logic `initFromRepoRoot` uses for the title):
  ```ts
  get repoName(): string {
      const root = this.state.get().repoRoot;
      return root.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Git";
  }
  ```
- `GitChangesSecondaryView.tsx` — header changes from `Changes` to `[{model.repoName}] Changes` (the body already has `model: GitTreeEditorModel`). The repo name must react to `repoRoot`; it is set once at open and never changes for a given instance, so reading it directly in render is fine (no extra subscription needed).

### Step 9 — verify

`npm run lint` + `tsc` clean. User retests all editors with secondary views (Explorer, Explorer+Search, Archive, Link collection, Link tags, Notebook, Rest, Todo, Browser bookmarks, Git Tree single + **two** repos, Git Diff File History).

## Concerns / open questions

1. **`CollapsiblePanelStack` stays bare-id-agnostic — confirmed correct.** It only ever compares `activePanel === panel.id` and keys by `panel.id`; feeding it composite strings on both sides needs no change. Its internal "toggle back to previous panel" logic (`previousPanelRef`) also works on whatever id strings it's given. **No UIKit edit** — keeps the panel-key convention out of the shared library, where it doesn't belong.

2. **Seed value `"explorer"` resolution.** The default `activePanel` seed is bare `"explorer"`. Step 2 resolves a bare value to its composite at render time, so the Explorer panel is expanded by default exactly as today. After the first user toggle, `state.activePanel` becomes composite. This keeps **zero migration** for the seed and for pre-US-619 persisted bare ids.

3. **Persistence fidelity for the multi-instance case.** We persist the **composite** `activePanel`. Because editor ids are stable across restore (persisted in `editor.state.id`), the exact repo's Changes panel that was expanded re-expands correctly. The only loss-of-fidelity edge is if an editor id is *not* restored (e.g. the page no longer has that editor) — then the validity check falls back to `"explorer"`, which is the safe default. **No new persistence format/version bump** — `activePanel` is still just a string.

4. **`expandPanel` owner resolution for multi-owner panels.** `expandPanel(bareId)` resolves to the *first* editor owning that bare id. The only multi-owner panel (`git-changes`) has **no** `expandPanel` caller, so this is never ambiguous in practice. Documented so a future multi-owner panel that *does* call `expandPanel` knows to pass the composite (which `expandPanel` already accepts as a passthrough).

5. **`activePanel === editor.id` legacy branch in `detach`.** The old code also reset when `activePanel === editor.id` (an editor id used directly as an active-panel value). No current code path sets `activePanel` to a raw editor id; the new `parsePanelKey(activePanel).editorId === editor.id` check subsumes the intended behavior (reset when the active panel belonged to the detached editor). Flagged in case a hidden path relied on the literal-id form — none found in the grep sweep.

6. **`panelExpanded` / `onPanelExpanded` stay bare — confirmed required.** `LinkBody`/`NotebookBody` map `event.panelId` by bare id; Explorer/Archive `onPanelExpanded` compare bare ids. The plan emits bare ids to both, so subscribers and overrides are untouched.

7. **No change to `matchesNavigationTarget` / same-repo dedup.** Re-clicking one repo's `.git` still reuses its model (model-level dedup). This task only removes the *render-level* restriction.

## Acceptance criteria

- Opening repo A's `.git`, then repo B's `.git`, shows **two** "Changes" panels in the sidebar (one per repo), each titled `[<repoName>] Changes`, each independently expandable/collapsible.
- Re-clicking a repo's `.git` does **not** add a second panel for that repo (model-level singleton still holds).
- The Git Diff "File History" panel and every other secondary view (Explorer, Explorer+Search, Archive, Link, Link tags, Notebook, Rest, Todo, Browser bookmarks) behave exactly as before — default expansion, click-to-expand, reveal-on-active, persistence across restart all unchanged.
- `npm run lint` + `tsc` clean.
