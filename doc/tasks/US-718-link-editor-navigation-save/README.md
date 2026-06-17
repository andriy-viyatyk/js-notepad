# US-718: LinkEditor — no spurious save prompt on navigation; modified editor survives any navigation

## Goal

Stop the "Do you want to save changes?" dialog from appearing when a modified Link editor navigates to one of its own links (the editor is not being closed — it stays on the page as a sidebar panel). Make a **modified** Link editor survive **any** navigation (own or external) so unsaved work is never lost, and surface the Collections-panel **Save** button whenever the editor is modified.

## Background

A Link editor's own-link click (in the Collections / Tags / Hostnames panel) navigates the *same page* (`pageId` is threaded through `openLinkFromPanel`). The target opens as the new main editor, and the Link editor **demotes to a sidebar panel** — it is not released.

Two independent mechanisms run during navigation, at different times:

| Mechanism | Location | Fires |
|---|---|---|
| Save prompt | `PagesLifecycleModel.navigatePageTo` → `oldEditor.confirmRelease()` (`:716–720`) | *before* the new editor is built |
| Panel survival | `PageModel.setMainEditor` → `LinkEditor.beforeNavigateAway` / `onMainEditorChanged` → `_isOpenedFromMe(newModel)` | *after* |

**The bug:** `confirmRelease()` fires *before* the system knows the editor will survive. `LinkEditor.modified` delegates to its `TextFileModel` host, so a dirty collection always trips the dialog — even though nothing is being discarded.

`_isOpenedFromMe` already decides survival from `newModel.getNavigationSourceId()` (= `sourceLink.sourceId`): own id, `link-category`, `link-tag`, `link-hostname`. The prompt gate has `options.sourceLink` in scope, so the same decision is computable there with no new plumbing.

## Design

**Option A + "modified always survives".** Unify survival into one predicate (`modified || own-source`) applied at **both** the prompt gate and the survival hooks. Because `modified ⟹ survives` and the prompt only fires `when modified`, the prompt becomes structurally unreachable during navigation; it still fires on a genuine **close** (separate `confirmRelease(closing)` path).

This also closes a data-loss gap: a modified Link editor + *external* navigation previously evicted the panel; now it survives until saved.

**UX trade-off (accepted):** a modified Collections panel lingers in the sidebar after navigating to unrelated content. It is dismissed by saving (then a later external nav evicts it) or by closing the panel (which prompts).

## Implementation plan

1. **`src/renderer/editors/base/EditorModel.ts`** — add a generic hook:
   ```ts
   /** Will this editor remain on the page across the incoming navigation
    *  (e.g. demote to a sidebar panel)? When true, the navigation save-prompt
    *  is skipped — nothing is being released. Base: false. */
   survivesNavigation(_sourceLink?: ILinkData): boolean { return false; }
   ```
   Add `import type { ILinkData } from "../../../shared/link-data";` if not present.

2. **`src/renderer/api/pages/PagesLifecycleModel.ts`** (`:716–720`) — gate the prompt:
   ```ts
   const oldEditor = page.mainEditor;
   if (oldEditor && !oldEditor.survivesNavigation(options?.sourceLink)) {
       const released = await oldEditor.confirmRelease();
       if (!released) return false;
   }
   ```

3. **`src/renderer/editors/link-editor/LinkEditor.ts`**
   - Extract the own-source predicate to one place:
     ```ts
     private isOwnNavigationSourceId(sourceId?: string): boolean {
         if (!sourceId) return false;
         if (sourceId === this.id) return true;
         return sourceId === "link-category" || sourceId === "link-tag" || sourceId === "link-hostname";
     }
     private _isOpenedFromMe(model: EditorModel): boolean {
         return this.isOwnNavigationSourceId(model.getNavigationSourceId());
     }
     ```
   - Override the new hook:
     ```ts
     survivesNavigation(sourceLink?: ILinkData): boolean {
         return this.modified || this.isOwnNavigationSourceId(sourceLink?.sourceId);
     }
     ```
   - Modified survives any navigation in both survival hooks:
     ```ts
     beforeNavigateAway(newModel: EditorModel): void {
         if (this.modified || this._isOpenedFromMe(newModel)) return;
         this.secondaryView = undefined;
     }
     onMainEditorChanged(newMainEditor: EditorModel | null): void {
         if (newMainEditor === this) return;
         if (newMainEditor === null) return;
         if (!this.contributesPanels()) return;
         if (!this.modified && !this._isOpenedFromMe(newMainEditor)) {
             this.secondaryView = undefined;
             return;
         }
         this.secondaryView = LINK_PANELS;
     }
     ```

4. **`src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.tsx`** — show **Save** whenever modified (not only when demoted); keep "Show links" gated on `!isMainEditor`:
   ```tsx
   const actions = (modified || !isMainEditor) && (
       <>
           {modified && (<IconButton ... Save ... />)}
           {!isMainEditor && (<IconButton ... Show links ... />)}
       </>
   );
   ```

## Acceptance criteria

- Modify a Link editor, click one of its own links → page navigates, **no** save dialog, Collections panel stays.
- Modify a Link editor, open an unrelated file (Explorer click) → **no** save dialog, Collections panel **survives** (modified work preserved).
- Save the modified Link editor, then open an unrelated file → panel is evicted (clean-up works).
- Close the Link editor's tab while modified → save dialog **does** appear (close path unchanged).
- Non-Link editors: navigation save prompt behavior unchanged (`survivesNavigation` default `false`).
- Save button visible in the Collections panel whenever the editor is modified, whether main or demoted.

## Files changed

| File | Change |
|---|---|
| `src/renderer/editors/base/EditorModel.ts` | new `survivesNavigation()` hook (default false) |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | gate `confirmRelease` on `survivesNavigation(sourceLink)` |
| `src/renderer/editors/link-editor/LinkEditor.ts` | shared own-source predicate; `survivesNavigation`; modified survives any nav |
| `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.tsx` | Save button visible whenever modified |
