# US-567 — Explorer editor migration

> **EPIC-028 Phase C** · walkthrough 30 §3 (EX1–EX10) · **Status:** Investigation complete 2026-05-25, ready for implementation.
>
> **Risk profile:** Low-to-medium. Three architectural firsts: (1) **first secondary-only `EditorModel` migrated to v4 native** — not in `editorRegistry`, never sits in the main-editor slot; (2) **second consumer of `onMainEditorChanged` (LK8)** after Link, but in a different membership pattern (sidebar-ONLY vs Link's sidebar-OWNING-mainEditor); (3) **second v4-native consumer of typed `treeProvider` accessor** after Link (Archive joins later in US-570). Touches 4 source files in `editors/explorer/` + 4 page-lifecycle/persistence files. Zero new files; one rename (`ExplorerEditorModel` → `ExplorerEditor` per v4 naming convention).

## Goal

Migrate the file Explorer (file-tree + search panels) from the legacy `EditorModel` base wrapped in `LegacyEditorAdapter` to a native v4 `EditorModel` subclass. Explorer is the **only** EditorModel constructed outside the registry — it has no `accepts()` predicate, no switch-widget visibility, and never appears in the main-editor slot. The migration aligns Explorer's constructor with EPIC-028's `(state)` factory convention, drops two `as any` casts in the persistence path via typed nested-state extras, and folds the direct-construction site (`PageModel.createExplorer`) into `PagesLifecycleModel.addEmptyPageWithNavPanel`. Preserves the secondary-editor registrations (`explorer`, `search`) and their React components (`ExplorerSecondaryEditor.tsx`, `SearchSecondaryEditor.tsx`) byte-for-byte except for a single `rawModel as ExplorerEditorModel` rename.

## Background

### Today's surface

`src/renderer/editors/explorer/` — 4-file folder:

| File | LOC | Role |
|------|-----|------|
| `ExplorerEditorModel.ts` | 206 | Legacy `EditorModel` subclass (secondary-only) |
| `ExplorerSecondaryEditor.tsx` | 155 | Renders the file tree in the navigator panel |
| `SearchSecondaryEditor.tsx` | 57 | Renders the search panel |
| `index.ts` | 2 | Exports |

### Today's class shape (legacy base)

```typescript
export class ExplorerEditorModel extends EditorModel<ExplorerEditorModelState> {
    treeProvider: ITreeProvider | null = null;
    treeState: TreeProviderViewSavedState | undefined = undefined;
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });
    readonly revealVersion = new TOneState({ version: 0 });
    searchState: FileSearchState | undefined = undefined;

    constructor(rootPath?: string) {
        super(new TComponentState(getDefaultExplorerEditorModelState()));
        this.noLanguage = true;
        this.skipSave = true;
        if (rootPath) {
            this.state.update((s) => { s.rootPath = rootPath; });
        }
    }
    // ... 12 methods, including no-op beforeNavigateAway override
}
```

State (3 visible fields + 4 sidecar carriers):

- **`state.rootPath: string`** — visible/reactive.
- **`state.type: "fileExplorer"`** — discriminator (used by `findExplorer`, `_openAsarArchive`, persistence migration).
- **`treeState: TreeProviderViewSavedState | undefined`** — private field; persisted via `_treeState` underscore-key.
- **`selectionState: TOneState<NavigationState>`** — reactive; persisted via `_selectedHref` underscore-key.
- **`searchState: FileSearchState | undefined`** — private field; persisted via `_searchState` underscore-key.
- **`revealVersion: TOneState<{ version: number }>`** — transient counter (not persisted).
- **`treeProvider: ITreeProvider | null`** — view-managed (assigned from `ExplorerSecondaryEditor.tsx:36`).

### Today's persistence path

`getRestoreData()` returns `Partial<ExplorerEditorModelState>` with two `as any` casts that attach underscore-prefixed extras:

```typescript
getRestoreData(): Partial<ExplorerEditorModelState> {
    const data: any = { // eslint-disable-line
        ...super.getRestoreData(),
        rootPath: this.rootPath,
    };
    if (this.treeState) data._treeState = this.treeState;
    const selectedHref = this.selectionState.get().selectedHref;
    if (selectedHref) data._selectedHref = selectedHref;
    if (this.searchState) data._searchState = this.searchState;
    return data;
}
```

### Today's construction sites

1. **`PageModel.createExplorer(rootPath)`** at `PageModel.ts:493` — wraps `new ExplorerEditorModel(rootPath)` in `LegacyEditorAdapter`, then `page.attach(adapter)`.
2. **`PageModel.toggleNavigator()`** at `PageModel.ts:537` — `await this.createExplorer(rootPath)` (lazy creation when user toggles the navigator).
3. **`PagesLifecycleModel.addEmptyPageWithNavPanel(folderPath)`** at `PagesLifecycleModel.ts:420` — `await page.createExplorer(folderPath)` (folder-open flow).
4. **`PagesLifecycleModel.newEditorModelFromState(state)`** at `PagesLifecycleModel.ts:331` — `if (state.type === "fileExplorer") return new ExplorerEditorModel()` (restore path; rootPath flows in via `applyRestoreData`).
5. **`PagesPersistenceModel.restoreSidebarLegacy(...)`** at `PagesPersistenceModel.ts:289–328` — pre-v3 rootPath shape migration creates a legacy-style `{ pageState: { type: "fileExplorer", rootPath } }` descriptor that flows through `restoreLegacyEditor` → `newEditorModelFromState`.

All five sites currently produce a `LegacyEditorAdapter`-wrapped Explorer. After migration, sites 1 + 3 inline a `new ExplorerEditor(state)` directly (no adapter); sites 2 + 4 + 5 thread the new construction shape through.

### Walkthrough 30 §3 — EX1–EX10 resolutions (2026-05-20)

| Concern | Decision | Realized as |
|---------|----------|-------------|
| **EX1** — secondary-only EditorModel shape | (a) Confirm — unified-array (A8) supports it natively via the visibility criterion `(editor.id === _mainEditorId) \|\| editor.contributesPanels()` | No code change beyond v4 base-class extension |
| **EX2** — constructor signature | (a) Flip to `(state: TComponentState<S>)` — matches EPIC-028 factory convention | Rewrite `ExplorerEditor` ctor; callers wrap `rootPath` into state |
| **EX3** — state slice partitioning | (c) Drop underscore-prefix; typed nested shape on `EditorDescriptor.state` | Add typed optional fields `treeState?` / `selectedHref?` / `searchState?` on persistence shape; drop two `as any` casts |
| **EX4** — persistence shape | (a) Persistence shape ≠ runtime shape — runtime keeps private fields + TOneStates; `getRestoreData()` is the typed bridge | Implemented via EX3 — typed merge in `getRestoreData()` |
| **EX5** — `beforeNavigateAway` no-op + `onMainEditorChanged` highlight | (a) + (c) Drop the no-op override (base default suffices); reframe LK7 + LK8 as separable hooks — Explorer is second LK8 consumer but NOT LK7 | **⚠️ AMENDED 2026-05-25 — see EX-IMPL1 below.** The v4 base default actually CLEARS `secondaryEditor`; Explorer MUST keep the no-op override. |
| **EX6** — `setPage` override fits N1 lifecycle | (a) Preserve verbatim — `setPage(page)` mutates `secondaryEditor`; slice subscription handles attach/detach | Keep the override; verify slice-sub timing |
| **EX7** — Close button keeps sidebar-wide gesture | (b) Today's behavior preserved (close button calls `pageNavigatorModel?.close()`); N4 per-panel close affordance is a separate concern | No change to `ExplorerSecondaryEditor.tsx:132` |
| **EX8** — Typed `treeProvider` accessor across three editors | (a) Full migration — `findTreeProviderHost` becomes `instanceof` chain over `LinkEditor → ArchiveEditor → ExplorerEditor` | **AMENDED 2026-05-25 — see EX-IMPL2 below.** Archive (US-570) not yet v4-native; partial chain only. |
| **EX9** — Multi-panel array form `["explorer", "search"]` | (a) Preserve verbatim — `secondaryEditor: string \| string[] \| undefined` is part of EPIC-028; Explorer is the canonical multi-panel example | Keep `openSearch` / `closeSearch` setting the array |
| **EX10** — Direct construction → inline | (a) Per EW5 — inline `new ExplorerEditor(state)` into `addEmptyPageWithNavPanel`; delete `PageModel.createExplorer` | Delete method; inline at single caller |

### Implementation-time context (post-walkthrough)

- **US-548 (PageModel adapter layer) landed**: `page.attach(editor)` + slice-subscription lifecycle is in place. The v4 `secondaryEditor` setter is pure (no `addSecondaryEditor` side effect); panel attach/detach flows through `onEditorPanelsChanged` (`PageModel.ts:340`).
- **US-555 (Link editor migration) landed**: `LinkEditor` extends v4 base directly; exposes typed `treeProvider` getter at `LinkEditor.ts:226`. First v4-native consumer of the EX8 chain.
- **US-558 (Browser editor migration) landed**: Browser uses construct-then-`adoptHost` for the embedded LinkEditor; deferred the `EditorConstructorArgs.initialHost` primitive to US-579. Pattern reference for Explorer's `(state)` factory.
- **US-566 (Compare editor migration) verified 2026-05-25**: Last `[ ]`-but-implemented Phase C task before this one. No leftover Compare-mode work touches Explorer.
- **`findTreeProviderHost` lives in `src/renderer/editors/category/CategoryEditor.tsx:33`** — duck-typed today (`"treeProvider" in editor && "selectionState" in editor`). Catches all three (Link v4 + Explorer legacy + Archive legacy) via property existence. The EX8 instanceof refactor must keep Archive's legacy path working.

---

## Implementation plan

### Step 1 — Rewrite `ExplorerEditorModel.ts` as v4-native `ExplorerEditor`

**File:** `src/renderer/editors/explorer/ExplorerEditorModel.ts` (legacy filename retained — class renames; default export stays accessible via `index.ts` re-export).

Class rename: `ExplorerEditorModel` → `ExplorerEditor` (matches v4 convention from `LinkEditor`, `GridEditor`, `BrowserEditor`, etc.). The file name stays `ExplorerEditorModel.ts` to keep the diff focused; rename later under US-559 cleanup if desired.

**Body changes:**

1. Replace base import `from "../base"` with v4 import `from "../base/v4/EditorModel"`.
2. Extend `EditorModel<ExplorerEditorState, void, ExplorerQueueEvent>` (three generics; minimal queue event `{ type: "focus" }` per EX1 calibration with Tier-5 editors — see EX-IMPL3 for the queue-event decision rationale).
3. Add `readonly editorId = "explorer"` — required by v4 base. Even though Explorer is not in `editorRegistry`, the discriminator is consumed by persistence (`EditorDescriptor.editorId`) and by `findExplorer` lookup.
4. Constructor signature flips to `(state: TComponentState<ExplorerEditorState>)`:

   ```typescript
   constructor(state: TComponentState<ExplorerEditorState>) {
       super(state);
       this.noLanguage = true;
       this.skipSave = true;
   }
   ```

   Callers bake `rootPath` into `state` before construction. Drop the inline `state.update` in ctor body.
5. State extension — typed optional extras per EX3 (c):

   ```typescript
   export interface ExplorerEditorState extends EditorStateBase {
       type: "fileExplorer";
       rootPath: string;
       // Typed persistence extras (EX3) — replace today's _treeState / _selectedHref / _searchState underscore keys.
       treeState?: TreeProviderViewSavedState;
       selectedHref?: string | null;
       searchState?: FileSearchState;
   }
   ```

   Note `EditorStateBase` (v4) instead of `IEditorState` (legacy). The runtime carriers stay as today (private `treeState` / `searchState`; reactive `selectionState` + `revealVersion` TOneStates) — only the descriptor shape changes.
6. **Keep the explicit `beforeNavigateAway` no-op override** — see EX-IMPL1.
7. Drop both `as any` casts in `getRestoreData()` and `applyRestoreData()`:

   ```typescript
   getRestoreData(): EditorDescriptor {
       return {
           editorId: this.editorId,
           id: this.state.get().id,
           state: {
               ...this.state.get(),
               rootPath: this.rootPath,
               treeState: this.treeState,
               selectedHref: this.selectionState.get().selectedHref ?? undefined,
               searchState: this.searchState,
           } as unknown as Record<string, unknown>,
       };
   }

   applyRestoreData(data: RestoreData<ExplorerEditorState>): void {
       super.applyRestoreData(data);
       if (data.rootPath) {
           this.state.update((s) => { s.rootPath = data.rootPath!; });
       }
       if (data.treeState) this.treeState = data.treeState;
       if (data.selectedHref) this.selectionState.set({ selectedHref: data.selectedHref });
       if (data.searchState) this.searchState = data.searchState;
   }
   ```
8. Return type of `getRestoreData()` changes from `Partial<S>` to `EditorDescriptor` (v4 envelope, mechanical wrap per NH8 / P6 precedent).
9. Update `restore()` and `setPage()` overrides — body unchanged, type signature picks up v4 base; the `secondaryEditor` setter mutates state and the slice subscription on `PageModel` (wired in `attach()`) drives panel publication.
10. `dispose()` — call `super.dispose()` from v4 base (drains queue); the existing `this.treeProvider?.dispose()` cleanup stays.

**Before → after (constructor):**

```typescript
// Before
constructor(rootPath?: string) {
    super(new TComponentState(getDefaultExplorerEditorModelState()));
    this.noLanguage = true;
    this.skipSave = true;
    if (rootPath) {
        this.state.update((s) => { s.rootPath = rootPath; });
    }
}

// After
constructor(state: TComponentState<ExplorerEditorState>) {
    super(state);
    this.noLanguage = true;
    this.skipSave = true;
}
```

**Before → after (extends clause):**

```typescript
// Before
import { EditorModel, getDefaultEditorModelState } from "../base";
export class ExplorerEditorModel extends EditorModel<ExplorerEditorModelState>

// After
import { EditorModel as V4EditorModel, type EditorStateBase, type RestoreData } from "../base/v4/EditorModel";
import type { ComponentQueueEvent } from "../../core/state/ComponentQueue";
import type { EditorDescriptor } from "../../../shared/persistence-v4";

export type ExplorerQueueEvent = ComponentQueueEvent;  // minimal — placeholder for future focus / refresh events

export class ExplorerEditor extends V4EditorModel<ExplorerEditorState, void, ExplorerQueueEvent>
```

### Step 2 — Update `index.ts` re-export

**File:** `src/renderer/editors/explorer/index.ts`

```typescript
// Before
export { ExplorerEditorModel, getDefaultExplorerEditorModelState } from "./ExplorerEditorModel";
export type { ExplorerEditorModelState } from "./ExplorerEditorModel";

// After
export { ExplorerEditor, getDefaultExplorerEditorState } from "./ExplorerEditorModel";
export type { ExplorerEditorState } from "./ExplorerEditorModel";
// Compatibility alias — retire under US-559 cleanup.
export { ExplorerEditor as ExplorerEditorModel } from "./ExplorerEditorModel";
export type { ExplorerEditorState as ExplorerEditorModelState } from "./ExplorerEditorModel";
```

The alias bridges the rename without forcing a sweep through legacy callsites that already import the old name (e.g., `PagesPersistenceModel.ts:296`'s string check on `pageState.type === "fileExplorer"` is unaffected; the type alias keeps stale TypeScript imports compiling). US-559 cleanup retires the alias.

### Step 3 — Update Explorer view components

**Files:**
- `src/renderer/editors/explorer/ExplorerSecondaryEditor.tsx` (line 11, 24)
- `src/renderer/editors/explorer/SearchSecondaryEditor.tsx` (line 7, 15)

Mechanical:

```typescript
// Before
import type { ExplorerEditorModel } from "./ExplorerEditorModel";
const model = rawModel as ExplorerEditorModel;

// After
import type { ExplorerEditor } from "./ExplorerEditorModel";
const model = rawModel as ExplorerEditor;
```

No other changes. The view continues to:
- Read `state.rootPath` reactively via `model.state.use()`.
- Mutate `model.treeProvider` directly (public field; see EX-IMPL5 for the choice not to wrap in a getter/setter).
- Subscribe to `model.selectionState` + `model.revealVersion` via `.use()`.
- Call `model.setSelectedHref` / `model.setTreeState` / `model.makeRoot` / `model.navigateUp` / `model.openSearch` / `model.closeSearch`.
- Render header content into the portal at `headerRef`.

### Step 4 — Inline construction site in `PagesLifecycleModel.addEmptyPageWithNavPanel`

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts:420–425`

```typescript
// Before
addEmptyPageWithNavPanel = async (folderPath: string): Promise<PageModel> => {
    const page = new PageModel();
    await page.createExplorer(folderPath);
    page.ensurePageNavigatorModel();
    return this.addPage(null, page);
};

// After
addEmptyPageWithNavPanel = async (folderPath: string): Promise<PageModel> => {
    const page = new PageModel();
    const { ExplorerEditor, getDefaultExplorerEditorState } = await import("../../editors/explorer");
    const state = new TComponentState({
        ...getDefaultExplorerEditorState(),
        rootPath: folderPath,
    });
    const explorer = new ExplorerEditor(state);
    page.attach(explorer);
    await explorer.restore();
    page.ensurePageNavigatorModel();
    return this.addPage(null, page);
};
```

Order matters: `page.attach(explorer)` BEFORE `explorer.restore()` so the slice subscription is wired before `restore()` mutates `secondaryEditor`. (LinkEditor follows the same order — see US-555 pattern.)

### Step 5 — Update the restore branch in `PagesLifecycleModel.newEditorModelFromState`

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts:331–334`

```typescript
// Before
if (state.type === "fileExplorer") {
    const { ExplorerEditorModel } = await import("../../editors/explorer");
    return new ExplorerEditorModel();
}
```

This site returns a **legacy** `EditorModel` — but post-migration, Explorer is v4. There's no legacy editor to return.

**Resolution:** Move Explorer construction OUT of `newEditorModelFromState` entirely. The legacy-restore path that calls this method (`restoreSidebarLegacy` in `PagesPersistenceModel.ts:289–328`) needs a separate Explorer-aware branch — see Step 6.

```typescript
// After — delete the branch entirely
if (state.type === "fileExplorer") {
    throw new Error(
        "newEditorModelFromState: Explorer migrated to v4-native (US-567). Construct via ExplorerEditor directly.",
    );
}
```

The throw is a safety net — every Explorer construction site is updated in this PR; no legacy code path should hit this branch post-migration.

### Step 6 — Update Explorer restore handling in `PagesPersistenceModel`

**File:** `src/renderer/api/pages/PagesPersistenceModel.ts`

Two paths touch Explorer restore:

**Path A — v4 restore (`restorePage`, line ~100):** Iterates `desc.editors[]`. For each editor descriptor, calls `newEditorModelFromState(legacyState)` then wraps in `LegacyEditorAdapter`. Add a pre-branch for Explorer:

```typescript
// Inside the Promise.all map at line ~100, BEFORE the legacy restore branch:
if (d.editorId === "explorer") {
    const { ExplorerEditor, getDefaultExplorerEditorState } = await import("../../editors/explorer");
    const explorerState = new TComponentState({
        ...getDefaultExplorerEditorState(),
        ...(d.state as Partial<ExplorerEditorState>),
        id: d.id,
    });
    const explorer = new ExplorerEditor(explorerState);
    explorer.applyRestoreData(d.state as RestoreData<ExplorerEditorState>);
    await explorer.restore();
    return explorer;  // v4-native — no LegacyEditorAdapter wrap
}
```

**Path B — v3 sidebar legacy restore (`restoreSidebarLegacy`, line 289–328):** Pre-v3 rootPath shape migration. Today's code synthesizes a `{ pageState: { type: "fileExplorer", rootPath } }` descriptor and routes it through `restoreLegacyEditor → newEditorModelFromState`. Post-migration, this path needs to construct `ExplorerEditor` directly:

```typescript
// Inside restoreSidebarLegacy, replace the descriptor loop body for Explorer:
for (const desc of descriptors) {
    if (desc.pageState.type === "fileExplorer") {
        const { ExplorerEditor, getDefaultExplorerEditorState } = await import("../../editors/explorer");
        const state = new TComponentState({
            ...getDefaultExplorerEditorState(),
            ...(desc.pageState as Partial<ExplorerEditorState>),
            id: desc.pageState.id ?? crypto.randomUUID(),
        });
        const explorer = new ExplorerEditor(state);
        explorer.applyRestoreData(desc.pageState as RestoreData<ExplorerEditorState>);
        await explorer.restore();
        page.attach(explorer);
        continue;  // skip the LegacyEditorAdapter branch
    }
    // ... existing legacy path for non-Explorer secondary editors ...
}
```

Also update line 138 in `restorePage`:

```typescript
// Before
const valid =
    panel === "explorer" ||
    panel === "search" ||
    page.editors.some((e) => e.secondaryEditor?.includes(panel));

// After — unchanged; the "explorer" / "search" string literals still valid.
```

### Step 7 — Delete `PageModel.createExplorer` + update `toggleNavigator`

**File:** `src/renderer/api/pages/PageModel.ts:492–500` + `:537`

Delete the `createExplorer` method (EX10). The single in-PageModel caller is `toggleNavigator` at line 537 — replace with inline construction:

```typescript
// Before (PageModel.ts:521–540)
async toggleNavigator(pipe?: IContentPipe | null, filePath?: string): Promise<void> {
    const existing = this.findExplorer();
    if (existing) {
        this.ensurePageNavigatorModel();
        pageNavigatorToggled.send({ pageId: this.id, isOpen: true });
        return;
    }
    let rootPath = "";
    if (pipe?.provider.type === "file" && pipe.provider.sourceUrl) {
        rootPath = fpDirname(pipe.provider.sourceUrl);
    } else if (filePath) {
        rootPath = fpDirname(filePath);
    }
    if (!rootPath) return;

    await this.createExplorer(rootPath);
    this.ensurePageNavigatorModel();
    pageNavigatorToggled.send({ pageId: this.id, isOpen: true });
}

// After
async toggleNavigator(pipe?: IContentPipe | null, filePath?: string): Promise<void> {
    const existing = this.findExplorer();
    if (existing) {
        this.ensurePageNavigatorModel();
        pageNavigatorToggled.send({ pageId: this.id, isOpen: true });
        return;
    }
    let rootPath = "";
    if (pipe?.provider.type === "file" && pipe.provider.sourceUrl) {
        rootPath = fpDirname(pipe.provider.sourceUrl);
    } else if (filePath) {
        rootPath = fpDirname(filePath);
    }
    if (!rootPath) return;

    const { ExplorerEditor, getDefaultExplorerEditorState } = await import("../../editors/explorer");
    const state = new TComponentState({
        ...getDefaultExplorerEditorState(),
        rootPath,
    });
    const explorer = new ExplorerEditor(state);
    this.attach(explorer);
    await explorer.restore();

    this.ensurePageNavigatorModel();
    pageNavigatorToggled.send({ pageId: this.id, isOpen: true });
}
```

Also update `findExplorer` at `PageModel.ts:485–490` — the current check `(m.state.get() as { type?: string }).type === "fileExplorer"` continues to work (Explorer's state still carries `type: "fileExplorer"` per EX3 — it's the discriminator, not just a legacy artifact). No change needed beyond ensuring `unwrapAdapter(adapter)` returns the right thing for v4-native Explorer:

```typescript
findExplorer(): EditorModel | undefined {
    const v4 = this.editors.find(
        (m) => (m.state.get() as { type?: string }).type === "fileExplorer",
    );
    return unwrapAdapter(v4 ?? null) ?? undefined;
}
```

`unwrapAdapter` already handles the v4-native case correctly: if `v4` is not a `LegacyEditorAdapter`, it returns the editor itself cast as `LegacyEditorModel`. Legacy `instanceof ExplorerEditorModel` checks (if any exist outside this folder) keep working via the `ExplorerEditorModel` compatibility alias from Step 2.

### Step 8 — Apply EX8 partial — typed `instanceof` chain in `CategoryEditor.findTreeProviderHost`

**File:** `src/renderer/editors/category/CategoryEditor.tsx:24–46`

Today's duck-type works across all three editors (Link v4 + Archive legacy + Explorer legacy). After migration, Explorer becomes v4-native — and the EX8 walkthrough recommends a typed `instanceof` chain. But Archive (US-570) is still legacy.

**Partial migration (EX-IMPL2):** Adopt the `instanceof` form for the two v4-native editors (Link + Explorer) AND keep the duck-type fallback for the still-legacy Archive:

```typescript
// Before
function isTreeProviderHost(editor: EditorModel): editor is EditorModel & ITreeProviderHost {
    return "treeProvider" in editor && "selectionState" in editor;
}

// After
import { LinkEditor } from "../link-editor/LinkEditor";
import { ExplorerEditor } from "../explorer";

function isTreeProviderHost(editor: EditorModel): editor is EditorModel & ITreeProviderHost {
    if (editor instanceof LinkEditor) return true;
    if (editor instanceof ExplorerEditor) return true;
    // Legacy Archive — still on duck-typing until US-570 lands.
    return "treeProvider" in editor && "selectionState" in editor;
}
```

US-570 (Archive editor migration) will complete the chain — converting the fallback duck-type to `editor instanceof ArchiveEditor`.

### Step 9 — Pre-v3 rootPath migration shape (`PagesPersistenceModel.ts:289–308`)

The pre-v3 migration synthesizes a descriptor with `type: "fileExplorer"` + `rootPath` to bootstrap Explorer for old session files. This descriptor flows through Step 6's restoreSidebarLegacy path. No shape change needed — Step 6 already handles `type === "fileExplorer"` descriptors and routes them to `ExplorerEditor` directly.

Verify the migration code at line 299–308 emits a descriptor with the shape that `applyRestoreData` understands (`rootPath`, optionally `_treeState` / `_selectedHref` / `_searchState` from old caches). Today's `applyRestoreData` reads both new-format (`treeState`) AND old-format (`_treeState`) — the new ExplorerEditor.applyRestoreData should also tolerate both during the transition window:

```typescript
applyRestoreData(data: RestoreData<ExplorerEditorState>): void {
    super.applyRestoreData(data);
    if (data.rootPath) {
        this.state.update((s) => { s.rootPath = data.rootPath!; });
    }
    // EX3 typed extras — new format.
    if (data.treeState) this.treeState = data.treeState;
    if (data.selectedHref) this.selectionState.set({ selectedHref: data.selectedHref });
    if (data.searchState) this.searchState = data.searchState;
    // Pre-EPIC-028 underscore-prefixed extras — read for backward compat;
    // first save after upgrade writes the new shape. Retire under US-559.
    const extra = data as Partial<ExplorerEditorState> & {
        _treeState?: TreeProviderViewSavedState;
        _selectedHref?: string;
        _searchState?: FileSearchState;
    };
    if (extra._treeState && !data.treeState) this.treeState = extra._treeState;
    if (extra._selectedHref && !data.selectedHref) {
        this.selectionState.set({ selectedHref: extra._selectedHref });
    }
    if (extra._searchState && !data.searchState) this.searchState = extra._searchState;
}
```

The dual-read keeps existing user installs from losing their tree expansion / file selection / search state on first upgrade. The next save writes the typed shape; the underscore-prefixed branches go dead after one save round-trip.

### Step 10 — Dashboard update

**File:** `doc/active-work.md`

Move US-567 entry from the plain-text form to the linked form:

```markdown
# Before
- [ ] US-567: Explorer editor migration — walkthrough 30 §3 (EX1–EX10; secondary-only `EditorModel` — not in `editorRegistry`; second consumer of LK8 / LK9 hooks)

# After
- [ ] [US-567: Explorer editor migration](tasks/US-567-explorer-editor-migration/README.md) — *(investigation complete 2026-05-25, ready for implementation)* walkthrough 30 §3 (EX1–EX10 RESOLVED in design; EX-IMPL1–EX-IMPLn retrospective added during investigation). **First secondary-only `EditorModel` migrated to v4 native** — not in `editorRegistry`. Second consumer of LK8 (`onMainEditorChanged`) but NOT LK7 (`beforeNavigateAway`) — Explorer is sidebar-ONLY, not sidebar-OWNING-mainEditor. EX-IMPL1 — v4 base default CLEARS `secondaryEditor`; Explorer KEEPS the no-op override (corrects EX5 (a)'s "drop the override" claim). EX-IMPL2 — EX8 instanceof chain partial: LinkEditor + ExplorerEditor on instanceof; Archive stays duck-typed until US-570 lands. EX3 (c) drops two `as any` casts via typed nested `EditorDescriptor.state` extras. EX10 deletes `PageModel.createExplorer` + inlines construction into `addEmptyPageWithNavPanel` + `toggleNavigator`. Zero new files; one class rename (`ExplorerEditorModel` → `ExplorerEditor`) with compatibility alias.
```

---

## Concerns (EX-IMPL retrospective — added 2026-05-25 during investigation)

### EX-IMPL1 — ⚠️ v4 base `beforeNavigateAway` default CLEARS `secondaryEditor`; Explorer MUST keep no-op override (corrects EX5 (a))

**Discovered:** Reading `src/renderer/editors/base/v4/EditorModel.ts:151–153`:

```typescript
beforeNavigateAway(_newModel: EditorModel): void {
    this.secondaryEditor = undefined;
}
```

The v4 base default clears `secondaryEditor`, which triggers the slice subscription on PageModel → visibility criterion → detach + dispose. Walkthrough EX5 (a) claimed "drop the override entirely — base class default is no-op anyway" — this is **incorrect**. The legacy base default also clears (same behavior); the walkthrough text appears to have misread or pre-dated the base implementation.

**Resolution — keep the explicit no-op override** with an explanatory comment:

```typescript
/** Explorer ALWAYS survives navigation — it's a sidebar-only EditorModel.
 *  The v4 base default clears `secondaryEditor` (which would trigger detach
 *  + dispose via the slice subscription); override to a no-op so Explorer
 *  stays attached when the main editor changes. EX-IMPL1 amends EX5 (a)'s
 *  "drop the override" claim. */
beforeNavigateAway(_newModel: V4EditorModel): void {
    // No-op: Explorer always stays.
}
```

This preserves today's behavior verbatim. EX5's reframing of LK7 + LK8 as separable hooks still stands — Explorer is the second LK8 consumer, NOT a LK7 consumer (LK7 is sidebar-OWNING-mainEditor-specific).

**Walkthrough amendment:** Per the `feedback_cross_cutting_design_amendments` memory, this finding amends walkthrough 30 §3 EX5 in the SAME investigation pass. Add an amendment paragraph to EX5 noting that the "base class default suffices" claim was wrong; keep the EX5 reframing of LK7 + LK8 as separable hooks (that part is correct). Apply the amendment to `doc/epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md`.

### EX-IMPL2 — EX8 instanceof chain is partial during the strangler window (Archive still legacy)

EX8 (a) calls for a typed `instanceof` chain over `LinkEditor → ArchiveEditor → ExplorerEditor` in `findTreeProviderHost` (`CategoryEditor.tsx:33`). But Archive (US-570) hasn't migrated yet.

**Resolution — partial chain (hybrid):** Add `instanceof LinkEditor` + `instanceof ExplorerEditor` checks alongside the existing duck-type fallback. The duck-type catches legacy Archive (and any other future tree-provider host that hasn't migrated). US-570 (Archive) will drop the duck-type fallback when it lands.

```typescript
function isTreeProviderHost(editor: EditorModel): editor is EditorModel & ITreeProviderHost {
    if (editor instanceof LinkEditor) return true;
    if (editor instanceof ExplorerEditor) return true;
    return "treeProvider" in editor && "selectionState" in editor;
}
```

The hybrid form avoids forcing US-570 ahead of US-568/569/571–576 and keeps Category lookups correct in the meantime.

### EX-IMPL3 — `ExplorerQueueEvent` — minimal or no third generic?

EX1 confirms Explorer is the canonical secondary-only multi-panel example. The third generic on v4 `EditorModel<S, R, E>` defaults to `ComponentQueueEvent` (the base union type). Explorer doesn't actively dispatch focus / refresh events through the queue today — `revealVersion` (TOneState counter) drives the only reactive view bridge.

**Resolution:** Use the bare `ComponentQueueEvent` default (omit the third generic). Explorer's reveal bridge stays on `revealVersion` (today's pattern). If a future feature wants queue-driven focus restoration after main-editor swap, add `ExplorerQueueEvent = { type: "focus" }` then — YAGNI for this migration.

```typescript
export class ExplorerEditor extends V4EditorModel<ExplorerEditorState> {
    // Third generic defaults to ComponentQueueEvent — no event dispatch today.
}
```

Rejected the walkthrough's NH1-style minimal-queue calibration because Explorer's secondary-only nature means the chrome-level focus restoration patterns (TC8) don't apply — there's no `<TextChrome>` wrapping Explorer.

### EX-IMPL4 — `editorId = "explorer"` collides with `secondaryEditorRegistry.id = "explorer"`

Both the secondary editor registration AND the editor's `editorId` use the string `"explorer"`. This is intentional today (the legacy code identifies Explorer's panel as `"explorer"`), but it's worth flagging that the two are now in distinct registries:

- `secondaryEditorRegistry.id = "explorer"` — the panel component lookup key (register-editors.ts:731).
- `editor.editorId = "explorer"` — the v4 editor identity (used in persistence `EditorDescriptor.editorId`).

No conflict at runtime; they're in different lookup maps. But code-readers may briefly wonder. Add a one-line comment on the `editorId` declaration noting the deliberate alignment:

```typescript
/** v4 editor identity. Deliberately equal to the secondary-editor registration
 *  id so persistence (`EditorDescriptor.editorId`) reads the same string as
 *  the panel-component lookup. Explorer is NOT in `editorRegistry`. */
readonly editorId = "explorer";
```

### EX-IMPL5 — Keep `treeProvider` as public mutable field, not getter/setter

EX8's typed-accessor recipe (from LK9) wraps `treeProvider` in a getter for hosts that lazy-construct it (Link does — see `LinkEditor.ts:226`). Explorer's `treeProvider` is **view-managed**: `ExplorerSecondaryEditor.tsx:36` calls `model.treeProvider = new FileTreeProvider(rootPath)` from inside a `useMemo`.

**Resolution — keep as public mutable field.** Wrapping in a getter would force the view to call a setter; the lazy-construct pattern (Link's) doesn't apply since Explorer's tree provider depends on view-supplied configuration (`FileTreeProvider`'s constructor takes `rootPath`, which the view sources from reactive `model.state.use()`).

The instanceof chain in `findTreeProviderHost` only requires `treeProvider` to be reachable — public field works. No EX8 typed-accessor pattern needs to change.

```typescript
/** File tree data source. Created lazily by the view layer. View assigns
 *  this when `rootPath` becomes available; reads see whatever the view set.
 *  EX-IMPL5 — public field, NOT a getter (Link uses a getter because its
 *  tree provider is constructible without view-supplied configuration). */
treeProvider: ITreeProvider | null = null;
```

### EX-IMPL6 — `secondaryEditor` setter is now pure under v4 (no `addSecondaryEditor` call)

Legacy `EditorModel.secondaryEditor` setter side-effects: calls `page?.addSecondaryEditor(this)` or `page?.removeSecondaryEditorWithoutDispose(this)`. The v4 setter is **pure** — it only mutates state; the slice subscription on `PageModel.attach()` drives panel publication.

**Implications for Explorer:**

- `openSearch()` does `this.secondaryEditor = ["explorer", "search"]` — slice sub fires, no detach (Explorer still contributes panels), `onEditorPanelsChanged` bumps `state.version`.
- `closeSearch()` does `this.secondaryEditor = ["explorer"]` — same, still has panels.
- `setPage(page)` initialization does `this.secondaryEditor = this.searchState ? ["explorer", "search"] : ["explorer"]` — slice sub fires; if Explorer is already attached, this is a no-op detach-wise.
- `restore()` does the same secondaryEditor initialization — same flow.

**No behavioral change required**, but the lifecycle wiring is different: the v4 path relies on Explorer being `page.attach()`-ed BEFORE the setter is called, otherwise the slice subscription isn't wired and the panel publication is silent. All construction sites (Step 4 + Step 6 + Step 7) follow the order: `new ExplorerEditor(state)` → `page.attach(explorer)` → `await explorer.restore()`. The `restore()` mutation hits a wired slice subscription.

### EX-IMPL7 — `revealVersion` + `selectionState` TOneStates ride on the editor, not host

Unlike text-bearing Tier-5 editors (which fold per-window UI state into `host.editorSettings[editorId]` via HS1), Explorer has no `IContentHost`. Selection state, reveal counter, tree expansion, and search state all live on the editor instance. This is correct — there's no host to ride on. EX3 (c) typed-extras handles the persistence path.

**No HS1 application.** Explorer is the **second editor without an HS1 slot** under EPIC-028 (after Compare, which isn't an EditorModel at all). Browser is also without HS1 — but Browser's `bookmarksWidth` got promoted from transient to persisted as the sixth instance of the `leftPanelWidth`-equivalent silent-fix pattern (NH3). Explorer has no equivalent — `treeState` is already persisted; `searchState` is already persisted; `selectedHref` is already persisted. No incidental fix opportunity.

### EX-IMPL8 — Compatibility alias for `ExplorerEditorModel` name across the codebase

The class rename (`ExplorerEditorModel` → `ExplorerEditor`) may have external consumers. Confirmed callers via grep:

- `src/renderer/api/pages/PageModel.ts:486` — uses `findExplorer()` (no class name)
- `src/renderer/api/pages/PagesLifecycleModel.ts:332` — `import("../../editors/explorer")` then `new ExplorerEditorModel()` — Step 5 deletes this branch
- `src/renderer/editors/category/CategoryEditor.tsx` — uses duck-type today; Step 8 adds `import { ExplorerEditor }` (new name)
- `doc/architecture/secondary-editors.md` — documentation; update in a `/document` pass after task close

No external runtime consumers of the class name beyond the construction sites. The `index.ts` alias from Step 2 (`export { ExplorerEditor as ExplorerEditorModel }`) covers any stale TypeScript imports outside these files.

### EX-IMPL9 — Persistence write — does `EditorDescriptor.state.type = "fileExplorer"` survive `getRestoreData()`?

The legacy `getRestoreData()` returned `Partial<ExplorerEditorModelState>` directly (state-shape) — the `type: "fileExplorer"` field carried through naturally. The v4 `getRestoreData()` returns `EditorDescriptor` with the state nested under `state`:

```typescript
{
    editorId: "explorer",
    id: this.state.get().id,
    state: { ...this.state.get(), rootPath, treeState?, selectedHref?, searchState? },
}
```

The spread of `this.state.get()` includes `type: "fileExplorer"` (it's in the default state). So `EditorDescriptor.state.type === "fileExplorer"` survives — `findExplorer` lookups by `state.type` continue to work. **No additional plumbing needed.**

Verified by reading `PagesPersistenceModel.ts:100`'s legacy restore path — `(d.state as Partial<IEditorState>).type` is the same field; the v4 descriptor preserves it.

### EX-IMPL10 — Bootstrap restore ordering: panel publication BEFORE main editor attach?

When a page restores with both Explorer (secondary) AND a main editor, the unified-array restore at `PagesPersistenceModel.ts:97–121` iterates `desc.editors[]` and attaches each via `page.attach(editor)`. Order is descriptor-order (which Explorer's persisted position determines).

**Concern:** If Explorer is restored AFTER the main editor, does the main editor's `onMainEditorChanged` notification fire on Explorer's `selectionState`? Reading the v4 flow:

- `page.attach(monaco)` — adds Monaco; slice sub wired; Monaco is NOT yet mainEditor.
- `page.attach(explorer)` — adds Explorer; slice sub wired.
- `page.setMainEditorId(monaco.id)` — sets Monaco as main → triggers `onMainEditorChanged` on all OTHER editors. Explorer's `onMainEditorChanged(monaco)` fires; checks if Monaco's filePath is inside `rootPath`; calls `_selectAndReveal(filePath)` if matches.

**Resolution:** Explorer's `onMainEditorChanged` reads `newMainEditor.state.get().filePath`. As long as `setMainEditorId` is called AFTER both attach calls (today's pattern at `PagesPersistenceModel.ts:127`), the flow works. No change needed.

But the **timing of `revealVersion` bump matters** for the panel-expansion case — if the user has the `"explorer"` panel active at restore, the reveal happens via Explorer's `onPanelExpanded("explorer")` which reads `selectionState.selectedHref`. That, in turn, is set by `applyRestoreData(data._selectedHref)` BEFORE `restore()` runs. So the read-after-write order is correct.

Marked DO-NOT-CHANGE.

---

## Acceptance criteria

### Phase 1 — Static verification (read code; check 18 points)

1. `ExplorerEditor` extends `V4EditorModel<ExplorerEditorState>` from `editors/base/v4/EditorModel`.
2. `editorId = "explorer"` is declared.
3. Constructor signature is `(state: TComponentState<ExplorerEditorState>)`.
4. State interface extends `EditorStateBase` (NOT `IEditorState`).
5. State interface has typed `treeState?` / `selectedHref?` / `searchState?` fields.
6. `getRestoreData()` returns `EditorDescriptor` (NOT `Partial<S>`).
7. `getRestoreData()` body has no `as any` casts.
8. `applyRestoreData(data)` reads from typed `data.treeState` / `data.selectedHref` / `data.searchState` PLUS keeps the underscore-prefixed branches for backward compat.
9. `beforeNavigateAway` no-op override is present (EX-IMPL1).
10. `restore()` + `setPage()` continue to publish `secondaryEditor = ["explorer"]` array (EX9).
11. `PagesLifecycleModel.addEmptyPageWithNavPanel` constructs `ExplorerEditor` directly + calls `page.attach(explorer)` BEFORE `explorer.restore()`.
12. `PagesLifecycleModel.newEditorModelFromState` branch on `type === "fileExplorer"` is gone (or throws as a safety net).
13. `PagesPersistenceModel.restorePage` has an Explorer pre-branch that constructs `ExplorerEditor` directly (no `LegacyEditorAdapter` wrap).
14. `PagesPersistenceModel.restoreSidebarLegacy` has an Explorer branch that constructs `ExplorerEditor` directly.
15. `PageModel.createExplorer` method is deleted.
16. `PageModel.toggleNavigator` inlines Explorer construction (no call to deleted method).
17. `CategoryEditor.findTreeProviderHost` has `instanceof LinkEditor` + `instanceof ExplorerEditor` checks with duck-type fallback for Archive.
18. `walkthroughs/30-no-host-group.md` has an EX5 amendment paragraph documenting the EX-IMPL1 base-default discovery.

### Phase 2 — Smoke tests (user runs in a dev build)

1. **Open a folder:** menu → "Open Folder" (or sidebar tree). New page opens with file tree visible. Explorer panel shows folder structure.
2. **Navigate the tree:** click items, expand folders, double-click a file — file opens in main editor. Explorer highlights the selected file.
3. **Search panel:** click the "Search" button in Explorer header → search panel appears alongside file tree (`["explorer", "search"]` panel array). Run a search; results appear; click result → file opens.
4. **Close search:** click "Close Search" in search panel header → search panel disappears; Explorer stays.
5. **Close navigator:** click "Close Panel" in Explorer header → ENTIRE sidebar panel closes (EX7 (b) — sidebar-wide gesture). Page remains.
6. **Toggle navigator:** click the NavPanel button on the page toolbar → sidebar opens with Explorer panel (lazy-creates Explorer with rootPath derived from current main editor's file).
7. **Survive navigation:** with Explorer + Monaco active, double-click a different file in Explorer → Monaco swaps content; Explorer stays. Confirm Explorer is NOT detached (EX-IMPL1).
8. **Survive app restart:** close + relaunch. Confirm: tree expansion state, current file highlight, search state (if open) all restore. (EX3 typed extras.)
9. **Pre-v3 migration:** if a user has an old session file with `rootPath` on `PageSidebarSavedState` instead of an `ExplorerEditorModel` descriptor, confirm: Explorer reconstructs on first launch post-upgrade with `rootPath` preserved.
10. **Multi-panel + Category editor:** open a page with a Category view (`category-view` editor). Confirm Category finds the Explorer's tree provider via the new `instanceof` chain — items render with proper tree structure. (EX-IMPL2.)

### Phase 3 — Dashboard update

Mark US-567 with the verified note pattern in `doc/active-work.md`. Task stays unchecked (`[ ]`) per epic-task deferred-review model — `/review` runs at EPIC-028 close.

---

## Files Changed

| File | Action | Why |
|------|--------|-----|
| `src/renderer/editors/explorer/ExplorerEditorModel.ts` | Rewrite | v4 base; new constructor; typed extras; preserved `beforeNavigateAway` no-op (EX-IMPL1) |
| `src/renderer/editors/explorer/index.ts` | Modify | Export new `ExplorerEditor` name + compatibility alias |
| `src/renderer/editors/explorer/ExplorerSecondaryEditor.tsx` | Modify | Type cast `as ExplorerEditor` (was `as ExplorerEditorModel`); import update |
| `src/renderer/editors/explorer/SearchSecondaryEditor.tsx` | Modify | Type cast + import update |
| `src/renderer/api/pages/PageModel.ts` | Modify | Delete `createExplorer` method; inline construction in `toggleNavigator` |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Modify | Inline construction in `addEmptyPageWithNavPanel`; delete Explorer branch from `newEditorModelFromState` (or replace with throw) |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Modify | Add v4-native Explorer branch in `restorePage` (line ~100); add Explorer branch in `restoreSidebarLegacy` (line ~315) |
| `src/renderer/editors/category/CategoryEditor.tsx` | Modify | Partial `instanceof` chain (EX-IMPL2) — keep duck-type fallback for Archive |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md` | Modify | Add EX5 amendment paragraph for EX-IMPL1 |
| `doc/active-work.md` | Modify | Update US-567 entry with linked task + verified note |
| `doc/tasks/US-567-explorer-editor-migration/README.md` | Create | This task document |

**Total:** 1 created, 10 modified, 0 deleted. **Zero new source files** (the rewrite happens in place in `ExplorerEditorModel.ts`).

## Files NOT changing

- `src/renderer/editors/register-editors.ts` — Explorer's secondary-editor registrations stay (EX9). Explorer is NOT in `editorRegistry`.
- `src/renderer/ui/navigation/secondary-editor-registry.ts` — interface stays; Explorer view components implement `SecondaryEditorProps` as today.
- `src/renderer/components/tree-provider/*` — tree provider components untouched.
- `src/renderer/components/file-search/*` — file search components untouched.
- `src/renderer/ui/sidebar/MenuBar.tsx:341` — `addEmptyPageWithNavPanel` caller; unchanged (the lifecycle method's signature is the same).
- `src/renderer/api/pages/PagesPersistenceModel.ts:299–308` — pre-v3 rootPath migration shape (creates legacy-style `{ pageState }` descriptor) — works as-is; Step 6's branch in `restoreSidebarLegacy` consumes it correctly.
- `src/renderer/editors/archive/*` — Archive stays legacy until US-570.
- `src/renderer/api/pages/PagesQueryModel.ts` — no Explorer-specific query helpers needed.
- `src/renderer/editors/base/v4/EditorModel.ts` — base class unchanged (EX-IMPL1 amends walkthrough text, not source).
- `src/main/*` — Explorer is a renderer-only concern.
- All Tier-5 text-bearing editor files (`MonacoEditor.ts`, `LinkEditor.ts`, etc.) — Explorer is no-host; doesn't touch text-bearing infra.
- `doc/tasks/completed.md` — task moves here only when EPIC-028 closes (deferred-review model).

---

## Cross-task notes

- **Walkthrough amendment** required for EX5 per EX-IMPL1. Apply as part of this task (in-pass amendment per the `feedback_cross_cutting_design_amendments` memory).
- **EX-IMPL2 partial chain** — leaves a one-line cleanup for US-570 (Archive): replace the duck-type fallback in `findTreeProviderHost` with `instanceof ArchiveEditor`. Note in US-570's eventual task doc.
- **`/document` + `/userdoc` deferred** to EPIC-028 close per the epic-task workflow. `doc/architecture/secondary-editors.md` references `ExplorerEditorModel` / `createExplorer` — those updates wait for the epic-close documentation pass.
- **No `/review` until EPIC-028 close** — `[ ]` checkbox stays unchecked even after implementation + smoke testing.
