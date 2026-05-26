# US-570 — Archive editor migration

> **EPIC-028 Phase C** · walkthrough 30 closure (umbrella note — Archive deferred for first-principles investigation) · **Status:** Investigation complete 2026-05-26, ready for implementation.
>
> **Risk profile:** Medium. Archive is the **first NO-HOST editor that is ALSO sidebar-owning** — it combines the no-host page-mainEditor shape established by Browser / PDF / Image (US-558/568/569) with the sidebar-owning navigation-survival overrides established by Link (US-555). The cross-cutting infrastructure (`V4_NO_HOST_EDITOR_IDS` set + `wrapLegacyForPage` `instanceof V4EditorModel` early-return) already exists from US-568; Archive opts in with one line. The migration-specific work is the four lifecycle overrides (`beforeNavigateAway` LK7 / `onMainEditorChanged` LK8 / `onPanelExpanded` / `setPage`), the `treeProvider` + two reactive `TOneState` carriers, and **completing the EX8 `instanceof` chain** that US-567 left partial (drop the duck-type fallback in `CategoryEditor.findTreeProviderHost`). **Scope:** 5 files in `editors/archive/` (1 new class file, 2 modified views, 1 new `index.tsx`, 1 deleted `index.ts`) + `register-editors.ts` + 3 single-/few-line edits in `PagesPersistenceModel.ts`, `PagesLifecycleModel.ts`, `CategoryEditor.tsx`.

## Goal

Migrate the Archive viewer from a legacy `EditorModel` (constructed via the legacy `EditorModule` factories and wrapped in `LegacyEditorAdapter`) to a native v4 `EditorModel` subclass. Preserve Archive's dual-view shape (the page-main tree view in `ArchiveEditorView.tsx` + the sidebar panel in `ArchiveSecondaryEditor.tsx`), its `ArchiveTreeProvider` ownership, the `selectionState` / `revealVersion` reactive carriers, and the four navigation-survival lifecycle overrides byte-for-byte. Add `"archive-view"` to `V4_NO_HOST_EDITOR_IDS` (US-568 infrastructure opt-in), register a native v4 module, and **complete the EX8 typed `instanceof` chain** — replacing the duck-type fallback in `CategoryEditor.findTreeProviderHost` with `instanceof ArchiveEditor` (the cleanup US-567 EX-IMPL2 deferred).

After US-570, Archive joins Browser, PDF, and Image as the fourth member of `V4_NO_HOST_EDITOR_IDS`, and the three-editor `treeProvider` chain (Link + Explorer + Archive) is fully typed — no duck-typing remains in `findTreeProviderHost`.

## Background

### Today's surface

`src/renderer/editors/archive/` — 4-file folder:

| File | LOC | Role |
|------|-----|------|
| `ArchiveEditorModel.ts` | 138 | Legacy `EditorModel` subclass (no-host, sidebar-owning) |
| `ArchiveEditorView.tsx` | 98 | Page-main tree view (toolbar + `TreeProviderView`) |
| `ArchiveSecondaryEditor.tsx` | 72 | Sidebar panel (tree + portal header close button) |
| `index.ts` | 26 | Legacy `EditorModule` factory bundle |

### Today's class shape (legacy base, `ArchiveEditorModel.ts`)

```typescript
export interface ArchiveEditorModelState extends IEditorState {
    type: "archiveFile";
    /** Archive source URL (path to the archive file). */
    archiveUrl: string;
}

export class ArchiveEditorModel extends EditorModel<ArchiveEditorModelState> {
    treeProvider: ArchiveTreeProvider | null = null;
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });
    readonly revealVersion = new TOneState({ version: 0 });

    constructor(state?: TComponentState<ArchiveEditorModelState>) {
        super(state ?? new TComponentState(getDefaultArchiveEditorModelState()));
        this.noLanguage = true;
        this.getIcon = () => React.createElement(ArchiveIcon, { width: 16, height: 16 });
    }

    async initFromArchive(archiveUrl: string): Promise<void> { /* creates ArchiveTreeProvider, sets title + archiveUrl */ }
    async restore(): Promise<void> { /* recreate provider from persisted archiveUrl; publish secondaryEditor if page available */ }
    setPage(page): void { /* super + publish ["archive-tree"] when page + provider available */ }
    beforeNavigateAway(newModel): void { /* keep panel if newModel opened from this archive, else clear */ }
    onMainEditorChanged(newMainEditor): void { /* update selectionState + bump revealVersion + expandPanel when navigating within archive */ }
    onPanelExpanded(panelId): void { /* bump revealVersion when "archive-tree" panel becomes active */ }
    private _isOpenedFromThisArchive(model): boolean { return model.state.get().sourceLink?.sourceId === this.id; }
    async dispose(): Promise<void> { this.treeProvider = null; await super.dispose(); }
    applyRestoreData(data): void { /* super + read archiveUrl */ }
    getRestoreData(): Partial<S> { /* super + archiveUrl */ }
}
```

State (2 visible fields):

- **`state.archiveUrl: string`** — path to the archive file; reactive; the only persisted field unique to Archive.
- **`state.type: "archiveFile"`** — discriminator (used by `_openZipArchive`'s dedup check at `PagesLifecycleModel.ts:640`, by `deriveEditorId`, and by `newEditorModelFromState` routing).
- **`state.secondaryEditor?: string[]`** — inherited; carries `["archive-tree"]` when the panel is published.

Reactive carriers (NOT persisted — transient):

- **`treeProvider: ArchiveTreeProvider | null`** — owned by the model (unlike Explorer's view-managed provider; Archive constructs it in `initFromArchive` / `restore`). Read by both views.
- **`selectionState: TOneState<NavigationState>`** — highlights the current entry in the tree.
- **`revealVersion: TOneState<{ version }>`** — reactive counter; when bumped the view calls `revealItem(selectedHref)`.

### Today's two views

**Main view (`ArchiveEditorView.tsx`)** — the page's main content. Renders the toolbar (Collapse All + Refresh) over a `TreeProviderView`. Carries the same `v4Main` strangler accommodation as Image/PDF (`pagesModel.findPage(model.id)?.mainEditorV4 ?? null` → conditional `PageToolbar` vs `EditorToolbar`) — retires in this migration.

**Sidebar panel (`ArchiveSecondaryEditor.tsx`)** — the navigator panel. Renders `TreeProviderView` with selection highlight + a reveal `useEffect` keyed on `revealVersion`. Portals a header (`"Archive"` label + close button) into `headerRef`. Casts `model as ArchiveEditorModel` (line 15) — becomes `as ArchiveEditor`.

### Today's registration (`register-editors.ts:621–634` + `:738–742`)

```typescript
// Main editor (standalone — ZIP, RAR, 7z, TAR)
editorRegistry.register({
    id: "archive-view",
    name: "Archive",
    editorType: "archiveFile",
    category: "standalone",
    acceptFile: (fileName) => fileName && isArchiveFile(fileName) ? 100 : -1,
    loadModule: async () => (await import("./archive/index")).default,
});

// Sidebar panel
secondaryEditorRegistry.register({
    id: "archive-tree",
    label: "Archive",
    loadComponent: () => import("./archive/ArchiveSecondaryEditor"),
});
```

The legacy main-editor registration is bridged into the v4 registry by the mirror loop (`register-editors.ts:818`) with a throwing `createEditor` stub (standalone category) — replaced by the real v4 module in US-570. The `archive-tree` secondary registration stays unchanged (the import path `./archive/ArchiveSecondaryEditor` is unaffected by the migration).

### Today's construction sites

Archive is constructed via three paths:

1. **`PagesLifecycleModel._openZipArchive(filePath)`** (`PagesLifecycleModel.ts:635–665`) — the **dedicated archive-open path**. Loads the archive module, `module.newEditorModel(filePath)` → `new ArchiveEditorModel()` + `await model.initFromArchive(filePath)`, then `wrap(legacy)` → `page.attach(adapter)` → `setMainEditorId` → `ensurePageNavigatorModel`, then manually fires `(legacy as ...).secondaryEditor = ["archive-tree"]` (line 660) to publish the panel. Does NOT call `restore()` (state already built by `initFromArchive`).
2. **`PagesLifecycleModel.openFile` / `createEditorFromFile` → `newEditorModel(filePath)`** — generic file-open. `editorRegistry.resolve(filePath)` matches `.zip`/`.rar`/etc → `archive-view` def → `module.newEditorModel(filePath)` (same factory as path 1). `createEditorFromFile` calls `editor.restore()` (recreates provider if absent), then `openFile` does `addPage(wrap(editor))`.
3. **`PagesPersistenceModel.restorePage` legacy fallback** — `desc.editors.map(...)` falls past `if (d.host)`, past the Explorer branch, AND past the `V4_NO_HOST_EDITOR_IDS` check (Archive not yet in the set) → legacy fallback → `newEditorModelFromState` → archive module's `newEditorModelFromState` → `new ArchiveEditorModel()` + `applyRestoreData` → wrapped in `LegacyEditorAdapter`. **After US-570**, `"archive-view"` is in the set → the generic v4-native no-host restore branch (US-568 PD-IMPL11) fires → no adapter wrap.

After US-570:

- Path 1 (`_openZipArchive`) — `module.newEditorModel(filePath)` returns a v4 `ArchiveEditor` cast as legacy (with `treeProvider` built by `initFromArchive`). `wrap()` early-returns (PD-IMPL16). `page.attach(adapter)` calls `setPage`, which publishes `["archive-tree"]` — so the manual line 660 becomes redundant (AR-IMPL7).
- Path 2 (`openFile`) — `newEditorModel` returns a v4 `ArchiveEditor` cast as legacy; `createEditorFromFile` calls `restore()` (page null at that point → publication deferred to `attach`→`setPage`); `wrap()` early-returns; `addPage`→`attach`→`setPage` publishes.
- Path 3 (`restorePage`) — generic v4-native no-host branch: `v4Registry.createEditor("archive-view", d.id)` → seed state from `d.state` (carries `archiveUrl` + `type`) → `applyRestoreData` → `restore()` (rebuilds provider) → `attach`→`setPage` publishes.

### Walkthrough 30 closure umbrella note (2026-05-20)

The walkthrough 30 closure table (`30-no-host-group.md:1239`) defers Archive for first-principles investigation:

> **Archive** — **Sidebar-owning no-host editor** — has `treeProvider` (per EX8's chain); per walkthrough 02 / S8 already has the `beforeNavigateAway` override (Archive demote-on-navigate). **Closest in shape to Link.**

Archive resolves against the standardized NH set (Browser/PDF/Image no-host template) **plus** the sidebar-owning overrides Link (US-555) established, **plus** the EX8 chain completion US-567 deferred. The AR-IMPL concerns below ARE the first-principles investigation.

### Implementation-time context (post-US-569)

- **US-548 (PageModel adapter layer) landed**: `page.attach(editor)` wires the `secondaryEditor` slice subscription (`PageModel.ts:232–251`). **Order inside `attach`: `editor.setPage(this)` runs at line 235, BEFORE the slice subscription is wired at line 242.** The trailing `state.update(s => { s.version++ })` at line 247 forces the initial navigator render — so a `setPage`-time publication is visible even though the slice-sub didn't catch it (AR-IMPL7).
- **US-555 (Link editor migration) landed**: First v4-native sidebar-OWNING-mainEditor. `LinkEditor.beforeNavigateAway` (LK7) + `onMainEditorChanged` (LK8) are the reference for Archive's identical overrides. `LinkEditor` exposes a typed `treeProvider` getter (`LinkEditor.ts:226`) — first v4 member of the EX8 chain.
- **US-567 (Explorer editor migration) landed**: Second EX8 chain member (`instanceof ExplorerEditor`). Left a **one-line cleanup for US-570** (EX-IMPL2): the duck-type fallback in `CategoryEditor.findTreeProviderHost` (`CategoryEditor.tsx:35–40`) stays until Archive migrates. Also established the v4-native restore precedent and the "keep the explicit `beforeNavigateAway` override" finding (EX-IMPL1) — relevant because Archive's `beforeNavigateAway` is NOT a no-op (it conditionally keeps the panel).
- **US-568 (PDF editor migration) landed**: The no-host migration template + the cross-cutting infrastructure: `V4_NO_HOST_EDITOR_IDS` set (`PagesPersistenceModel.ts:54`) + `wrapLegacyForPage` `instanceof V4EditorModel` early-return (`PagesLifecycleModel.ts:76`). Archive opts in with one line.
- **US-569 (Image editor migration) landed**: Most recent no-host migration; reference for the `ArchiveEditor.ts` / `ArchiveEditorView.tsx` / `index.tsx` file split + the preserved-legacy-module-cast-as-v4 bridge pattern.
- **`deriveEditorId({ type: "archiveFile" })` returns `"archive-view"`** — confirmed via `LegacyEditorAdapter.ts:343–346` (legacy registry lookup by `editorType`). Pre-US-570 saves already carry `editorId: "archive-view"`. Descriptor-shape stable across the migration — **no restore migration shim needed**.

### What Archive HAS that prior no-host editors lacked

Unlike Browser / PDF / Image (leaf editors), Archive is sidebar-owning:

- **Owns a `secondaryEditor` panel** (`"archive-tree"`) — first NO-HOST editor with a sidebar panel.
- **`beforeNavigateAway` (LK7)** — conditionally keeps the panel (Archive demote-on-navigate). NOT a no-op (contrast Explorer's no-op override, EX-IMPL1).
- **`onMainEditorChanged` (LK8)** — updates `selectionState` + reveal + expand when navigating to an entry opened from this archive.
- **`onPanelExpanded`** — reveal-on-expand.
- **`setPage` override** — publishes the panel when the page context arrives.
- **`treeProvider` + `selectionState`** — the two members the EX8 `instanceof` chain reads.

### What Archive does NOT have

- **No `CONTENT_HOST_TRAIT`** — no-host editor (no `TextFileModel` to wrap).
- **No HS1 host slot** — no `IContentHost` to ride on; selection / reveal state lives on the editor (transient, not persisted) — mirrors Explorer (EX-IMPL7).
- **No scripting facade** — `page.asArchive()` doesn't exist; Archive stays non-script-manipulable.
- **No queue events worth typing** — base `ComponentQueueEvent` default suffices (reveal bridge runs on `revealVersion` TOneState, not the queue) — mirrors Explorer (EX-IMPL3).
- **No `findCompatibleEditors` / switch-widget visibility** — `hasContentHost: false` keeps Archive out of the switch widget.
- **No automation hooks** — Browser's `instanceof BrowserEditor` automation checks have no Archive analogue.

---

## Implementation plan

### Step 1 — Create `ArchiveEditor.ts` (v4 native class)

**File:** `src/renderer/editors/archive/ArchiveEditor.ts` (NEW, ~150 LOC). Extracts the class out of `ArchiveEditorModel.ts` (which is deleted — see Step 5).

```typescript
import { createElement, type ReactNode } from "react";
import { TComponentState, TOneState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence-v4";
import type { ArchiveTreeProvider } from "../../content/tree-providers/ArchiveTreeProvider";
import { fpBasename } from "../../core/utils/file-path";
import { ArchiveIcon } from "../../theme/icons";
import type { PageModel, NavigationState } from "../../api/pages/PageModel";

/**
 * EPIC-028 / US-570 — native v4 Archive editor. NO-HOST editor (no
 * `CONTENT_HOST_TRAIT`) AND sidebar-owning — Archive owns its state directly,
 * owns an `ArchiveTreeProvider`, and contributes the `"archive-tree"` panel.
 *
 * Closest sibling: LinkEditor (US-555) — same sidebar-owning navigation-survival
 * overrides (LK7 `beforeNavigateAway` + LK8 `onMainEditorChanged`). Shares the
 * no-host page-mainEditor shape with PdfEditor (US-568) / ImageEditor (US-569) /
 * BrowserEditor (US-558).
 *
 * Design rationale: doc/tasks/US-570-archive-editor-migration/README.md.
 */

export interface ArchiveEditorState extends EditorStateBase {
    /** Discriminator — preserved for `_openZipArchive` dedup, `deriveEditorId`,
     *  and pre-US-570 saved descriptors (AR-IMPL3). */
    type: "archiveFile";
    /** Archive source URL (path to the archive file). */
    archiveUrl: string;
}

export const defaultArchiveEditorState: ArchiveEditorState = {
    id: "",
    title: "",
    modified: false,
    type: "archiveFile",
    archiveUrl: "",
};

export function getDefaultArchiveEditorState(): ArchiveEditorState {
    return { ...defaultArchiveEditorState, id: crypto.randomUUID() };
}

export class ArchiveEditor extends V4EditorModel<ArchiveEditorState> {
    /** v4 editor identity. Matches the legacy registry id so v4
     *  EditorDescriptor.editorId and pre-US-570 saved descriptors
     *  (deriveEditorId({type:"archiveFile"}) === "archive-view") agree. */
    readonly editorId = "archive-view";

    noLanguage = true;

    /** Tree provider for browsing archive contents. Owned by this model.
     *  Public field (mirror Explorer EX-IMPL5) — read by both views AND by the
     *  EX8 `instanceof` chain in CategoryEditor. */
    treeProvider: ArchiveTreeProvider | null = null;

    /** Selection state — highlights current entry in the archive tree. */
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });

    /** Reveal request — reactive counter. When bumped, the view calls
     *  revealItem(selectedHref). */
    readonly revealVersion = new TOneState({ version: 0 });

    constructor(state: TComponentState<ArchiveEditorState>) {
        super(state);
        this.getIcon = () => createElement(ArchiveIcon, { width: 16, height: 16 });
    }

    /** Initialize from archive path. Creates ArchiveTreeProvider and sets title. */
    async initFromArchive(archiveUrl: string): Promise<void> {
        const { ArchiveTreeProvider } = await import(
            "../../content/tree-providers/ArchiveTreeProvider"
        );
        this.treeProvider = new ArchiveTreeProvider(archiveUrl);
        this.state.update((s) => {
            s.title = fpBasename(archiveUrl);
            s.archiveUrl = archiveUrl;
        });
    }

    async restore(): Promise<void> {
        await super.restore();
        const archiveUrl = this.state.get().archiveUrl;
        if (archiveUrl && !this.treeProvider) {
            const { ArchiveTreeProvider } = await import(
                "../../content/tree-providers/ArchiveTreeProvider"
            );
            this.treeProvider = new ArchiveTreeProvider(archiveUrl);
        }
        // Direct-open path may already have `page`; navigation/restore paths
        // publish via setPage() once attached (AR-IMPL7).
        if (this.treeProvider && this.page) {
            this.secondaryEditor = ["archive-tree"];
        }
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        if (page && this.treeProvider && !this.secondaryEditor?.length) {
            this.secondaryEditor = ["archive-tree"];
        }
    }

    beforeNavigateAway(newModel: V4EditorModel): void {
        if (this._isOpenedFromThisArchive(newModel)) return;
        this.secondaryEditor = undefined;
    }

    onMainEditorChanged(newMainEditor: V4EditorModel | null): void {
        if (!newMainEditor || newMainEditor === this) return;
        if (this._isOpenedFromThisArchive(newMainEditor)) {
            const url = (newMainEditor.state.get() as { sourceLink?: { url?: string } })
                .sourceLink?.url ?? null;
            this.selectionState.update((s) => { s.selectedHref = url; });
            if (url && this.page?.activePanel === "archive-tree") {
                this.revealVersion.update((s) => { s.version++; });
            }
            setTimeout(() => this.page?.expandPanel("archive-tree"), 0);
        } else {
            this.secondaryEditor = undefined;
        }
    }

    onPanelExpanded(panelId: string): void {
        if (panelId === "archive-tree") {
            const href = this.selectionState.get().selectedHref;
            if (href) {
                setTimeout(() => this.revealVersion.update((s) => { s.version++; }), 0);
            }
        }
    }

    private _isOpenedFromThisArchive(model: V4EditorModel): boolean {
        return (model.state.get() as { sourceLink?: { sourceId?: string } })
            .sourceLink?.sourceId === this.id;
    }

    async dispose(): Promise<void> {
        this.treeProvider = null;
        await super.dispose();
    }

    applyRestoreData(data: RestoreData<ArchiveEditorState>): void {
        super.applyRestoreData(data);
        if (data.archiveUrl) {
            this.state.update((s) => { s.archiveUrl = data.archiveUrl!; });
        }
    }

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                archiveUrl: s.archiveUrl,
            } as unknown as Record<string, unknown>,
        };
    }
}
```

**Notes:**

- The `sourceLink` reads use inline structural casts (`as { sourceLink?: ... }`) because `sourceLink` lives on the legacy `IEditorState` surface, not on the v4-native `ArchiveEditorState`. `EditorStateBase` already spreads `Omit<Partial<IEditorState>, ...>`, so `sourceLink` IS present in the widened type — the casts are defensive narrowing, matching how `onMainEditorChanged` reads cross-editor state (the `newMainEditor` is any editor type). Keep them.
- `selectionState` / `revealVersion` are transient (not persisted) — matches legacy + Explorer (EX-IMPL7).

### Step 2 — Reduce `ArchiveEditorView.tsx` to view-only + preserved legacy module

**File:** `src/renderer/editors/archive/ArchiveEditorView.tsx` (~110 LOC after change).

Two changes to the view + add the preserved legacy `EditorModule` (moved here from `index.ts`, mirroring `ImageView.tsx` / `PdfView.tsx`):

1. **Retire the `v4Main` lookup (AR-IMPL6):** post-migration `model` IS the v4 ArchiveEditor — render `<PageToolbar model={model} ...>` directly; drop the `pagesModel.findPage` lookup + the `EditorToolbar` fallback branch + their imports.
2. **Type the prop as `ArchiveEditor`** (was `ArchiveEditorModel`).

```tsx
import { useCallback, useRef } from "react";
import { TreeProviderView, TreeProviderViewRef } from "../../components/tree-provider";
import { PageToolbar } from "../base/v4";
import { TComponentState } from "../../core/state/state";
import { Panel } from "../../uikit/Panel";
import { IconButton } from "../../uikit/IconButton";
import { Text } from "../../uikit/Text";
import { CollapseAllIcon, RefreshIcon } from "../../theme/icons";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import type { EditorModel } from "../base";
import { EditorModule } from "../types";
import type { EditorType, IEditorState } from "../../../shared/types";
import {
    ArchiveEditor,
    getDefaultArchiveEditorState,
    type ArchiveEditorState,
} from "./ArchiveEditor";

export function ArchiveEditorView({ model }: { model: ArchiveEditor }) {
    const provider = model.treeProvider;
    const pageId = model.page?.id ?? model.id;
    const treeRef = useRef<TreeProviderViewRef>(null);

    const handleItemClick = useCallback((item: ITreeProviderItem) => {
        const url = provider?.getNavigationUrl(item) ?? item.href;
        app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: model.id }));
    }, [provider, pageId, model.id]);

    const handleCollapseAll = useCallback(() => { treeRef.current?.collapseAll(); }, []);
    const handleRefresh = useCallback(() => { treeRef.current?.refresh(); }, []);

    if (!provider) {
        return (
            <Panel direction="column" flex={1} overflow="hidden" background="default" padding="xl">
                <Text color="light">No archive loaded.</Text>
            </Panel>
        );
    }

    return (
        <Panel name="archive-root" direction="column" flex={1} overflow="hidden" background="default">
            <PageToolbar
                name="archive-toolbar"
                model={model}
                borderBottom
                rightContributions={
                    <>
                        <IconButton name="archive-collapse-all" size="sm" title="Collapse All"
                            icon={<CollapseAllIcon />} onClick={handleCollapseAll} />
                        <IconButton name="archive-refresh" size="sm" title="Refresh"
                            icon={<RefreshIcon />} onClick={handleRefresh} />
                    </>
                }
            />
            <TreeProviderView
                ref={treeRef}
                provider={provider}
                onItemClick={handleItemClick}
                onItemDoubleClick={handleItemClick}
            />
        </Panel>
    );
}

// ============================================================================
// EditorModule — legacy shape preserved for the LegacyEditorAdapter safety-net
// path (file-open flow + `_openZipArchive`). The `as unknown as EditorModel`
// casts bridge the v4 ArchiveEditor to the legacy EditorModel typing the legacy
// factories expect; the runtime instance is the v4 class either way. Mirrors
// `ImageView.tsx` (US-569). `wrapLegacyForPage`'s `instanceof V4EditorModel`
// early-return (US-568 PD-IMPL16) detects the v4 instance and skips the wrap.
// US-559 retires this block.

function makeArchiveEditor(): ArchiveEditor {
    return new ArchiveEditor(new TComponentState(getDefaultArchiveEditorState()));
}

const archiveEditorModule: EditorModule = {
    Editor: ArchiveEditorView as unknown as EditorModule["Editor"],
    newEditorModel: async (filePath?: string) => {
        const model = makeArchiveEditor();
        if (filePath) await model.initFromArchive(filePath);
        return model as unknown as EditorModel;
    },
    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "archiveFile") return null;
        return makeArchiveEditor() as unknown as EditorModel;
    },
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const model = new ArchiveEditor(new TComponentState({
            ...getDefaultArchiveEditorState(),
            ...(state as Partial<ArchiveEditorState>),
        }));
        model.applyRestoreData(state as RestoreData<ArchiveEditorState>);
        return model as unknown as EditorModel;
    },
};

export default archiveEditorModule;
export { ArchiveEditor };
export type { ArchiveEditorState };
```

(Add the `RestoreData` import from `../base/v4/EditorModel` for the `newEditorModelFromState` cast.)

### Step 3 — Update `ArchiveSecondaryEditor.tsx` (type cast only)

**File:** `src/renderer/editors/archive/ArchiveSecondaryEditor.tsx` (lines 9, 15).

Mechanical — mirror US-567's Explorer secondary-editor change:

```typescript
// Before
import type { ArchiveEditorModel } from "./ArchiveEditorModel";
const archiveModel = model as ArchiveEditorModel;

// After
import type { ArchiveEditor } from "./ArchiveEditor";
const archiveModel = model as ArchiveEditor;
```

No other changes. The component still:
- Reads `archiveModel.treeProvider`, `archiveModel.selectionState.use()`, `archiveModel.revealVersion.use()`.
- Calls `archiveModel.page?.removeSecondaryEditor(archiveModel)` for the close button.
- Compares `archiveModel === archiveModel.page?.mainEditor` for the close-button visibility (AR-IMPL8 — confirm `page.mainEditor` returns the v4 ArchiveEditor directly post-migration, since it's no longer adapter-wrapped).

### Step 4 — Create `index.tsx` (v4 EditorModule + re-exports)

**File:** `src/renderer/editors/archive/index.tsx` (NEW, ~45 LOC). Replaces the deleted `index.ts`.

```tsx
import { TComponentState } from "../../core/state/state";
import { ArchiveEditor, getDefaultArchiveEditorState } from "./ArchiveEditor";
import { ArchiveEditorView } from "./ArchiveEditorView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-570 — native Archive editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native ArchiveEditor instance.
 *
 * Archive is NO-HOST (no `CONTENT_HOST_TRAIT`) and sidebar-owning. `Component`
 * is the page-main tree view (`ArchiveEditorView`); the sidebar panel
 * (`ArchiveSecondaryEditor`) stays registered separately in the
 * secondaryEditorRegistry. No `<TextChrome>` wrap.
 */

function ArchiveEditorComponent({ model }: { model: V4EditorModel }) {
    return <ArchiveEditorView model={model as ArchiveEditor} />;
}

export const archiveModule: EditorModule = {
    createEditor: () =>
        new ArchiveEditor(new TComponentState(getDefaultArchiveEditorState())),
    Component: ArchiveEditorComponent,
};

export { ArchiveEditor, getDefaultArchiveEditorState };
export type { ArchiveEditorState } from "./ArchiveEditor";
// Compatibility aliases — retire under US-559 cleanup. Keep
// `ArchiveEditorModel` / `ArchiveEditorModelState` names usable from any stale
// imports (mirrors US-569 Image alias pattern).
export { ArchiveEditor as ArchiveEditorModel } from "./ArchiveEditor";
export type { ArchiveEditorState as ArchiveEditorModelState } from "./ArchiveEditor";
// Legacy EditorModule default-export — consumed by the legacy `editorRegistry`
// `loadModule` callback (file-open + `_openZipArchive` + LegacyEditorAdapter
// safety-net path).
export { default } from "./ArchiveEditorView";
```

### Step 5 — Delete `ArchiveEditorModel.ts` and `index.ts`

**Files:**
- `src/renderer/editors/archive/ArchiveEditorModel.ts` (DELETE — class moved to `ArchiveEditor.ts`).
- `src/renderer/editors/archive/index.ts` (DELETE — folded into `index.tsx`).

The legacy `index.ts` exported `default` (the `archiveEditorModule`). The new `index.tsx` re-exports the equivalent (`export { default } from "./ArchiveEditorView"`). TypeScript resolves `import "./archive/index"` and `import "./archive"` to `index.tsx`.

### Step 6 — Update `register-editors.ts` — add v4 block (legacy block unchanged)

**File:** `src/renderer/editors/register-editors.ts`

**Edit 1 (legacy registration, line 631–633):** The `loadModule` already imports `./archive/index` — which now resolves to `index.tsx`. **No path change needed** (unlike Image, which renamed its view file; Archive's `index` re-export keeps the import target stable). Optionally update the inline comment to note the migration.

**Edit 2 (add v4 registration):** After the Image v4 registration block (`v4EditorRegistry.register({ id: "image-view", ... })` at line ~1333–1350), add:

```typescript
// US-570 — replace the legacy bare-adapter mirror for archive-view with a
// native v4 module. Archive is NO-HOST (no `CONTENT_HOST_TRAIT`) AND
// sidebar-owning. The `accepts` predicate delegates to the legacy registry's
// `acceptFile` (returns 100 for archive extensions). `hasContentHost: false`
// keeps Archive out of the switch widget. Today's `_openZipArchive` /
// `openFile` still construct via the LEGACY registry's `module.newEditorModel`
// (which now returns a v4 ArchiveEditor cast as legacy via `ArchiveEditorView`'s
// preserved module); `wrapLegacyForPage`'s `instanceof V4EditorModel`
// early-return (US-568 PD-IMPL16) skips the adapter wrap.
v4EditorRegistry.register({
    id: "archive-view",
    name: "Archive",
    hasContentHost: false,
    accepts: (input) => {
        const legacy = editorRegistry.getById("archive-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { archiveModule } = await import("./archive");
        return archiveModule;
    },
});
```

**The `archive-tree` secondary registration (line 738–742) stays unchanged** — the import path `./archive/ArchiveSecondaryEditor` is unaffected.

### Step 7 — Add `"archive-view"` to `V4_NO_HOST_EDITOR_IDS`

**File:** `src/renderer/api/pages/PagesPersistenceModel.ts:54–58`

```typescript
// After
const V4_NO_HOST_EDITOR_IDS = new Set([
    "browser-view", // US-558 (retroactive — see US-568 PD-IMPL11)
    "pdf-view",     // US-568
    "image-view",   // US-569
    "archive-view", // US-570 (this PR)
]);
```

Also remove the `- US-570 Archive → "archive-view"` line from the JSDoc comment block above the set (lines 43–49), since the item is now in the set itself. (Note: the current JSDoc lists US-571–US-576 but NOT US-570 — verify and adjust; if US-570 isn't listed there, no JSDoc edit needed beyond optionally noting the new member.)

**No other changes to this file** — the generic restore branch (PD-IMPL11) already seeds state from `d.state` (carrying `archiveUrl` + `type`), calls `applyRestoreData`, then `restore()`. The subsequent `page.attach(editor)` (line 200–202) calls `setPage`, which publishes `["archive-tree"]`.

### Step 8 — Simplify `_openZipArchive` (remove redundant manual panel publish)

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts:651–665`

After migration, `page.attach(adapter)` calls `setPage`, which publishes `["archive-tree"]` (AR-IMPL7). The manual line 658–660 becomes redundant. Remove it; keep the rest verbatim.

```typescript
// Before
const page = new PageModel();
const adapter = wrap(legacy);
page.attach(adapter);
page.setMainEditorId(adapter.id);
page.ensurePageNavigatorModel();

// Trigger the legacy editor's secondaryEditor setter so it registers
// its panel via the compat shim on PageModel.
(legacy as unknown as { secondaryEditor: string[] }).secondaryEditor = ["archive-tree"];

this.addPage(adapter, page);

// After
const page = new PageModel();
const adapter = wrap(legacy);
page.attach(adapter); // v4 setPage() publishes ["archive-tree"] (US-570 AR-IMPL7)
page.setMainEditorId(adapter.id);
page.ensurePageNavigatorModel();

this.addPage(adapter, page);
```

**Conservative alternative (AR-IMPL7):** if smoke-testing shows the panel doesn't appear (e.g., a timing edge in the `attach`→`setPage`→`version++` render), keep the manual line — it's idempotent against the v4 setter (re-sets the same array; the now-wired slice-sub fires `onEditorPanelsChanged`, which re-confirms the panel). The line is harmless either way; removal is the cleaner end state.

### Step 9 — Complete the EX8 `instanceof` chain in `CategoryEditor`

**File:** `src/renderer/editors/category/CategoryEditor.tsx:18–40`

Drop the duck-type fallback (US-567 EX-IMPL2's deferred cleanup); add `instanceof ArchiveEditor`:

```typescript
// Before
import { LinkEditor } from "../link-editor/LinkEditor";
import { ExplorerEditor } from "../explorer";
// ...
function isTreeProviderHost(editor: EditorModel): editor is EditorModel & ITreeProviderHost {
    if (editor instanceof LinkEditor) return true;
    if (editor instanceof ExplorerEditor) return true;
    // Legacy Archive — duck-typed fallback until US-570 lands.
    return "treeProvider" in editor && "selectionState" in editor;
}

// After
import { LinkEditor } from "../link-editor/LinkEditor";
import { ExplorerEditor } from "../explorer";
import { ArchiveEditor } from "../archive";
// ...
// EPIC-028 / US-570 — EX8 chain complete. All three treeProvider hosts
// (Link + Explorer + Archive) match by `instanceof`; no duck-typing remains.
function isTreeProviderHost(editor: EditorModel): editor is EditorModel & ITreeProviderHost {
    return (
        editor instanceof LinkEditor ||
        editor instanceof ExplorerEditor ||
        editor instanceof ArchiveEditor
    );
}
```

Also update the block comment at lines 22–28 to note the chain is now complete (drop the "legacy Archive still uses the duck-type fallback / US-570 drops the fallback" wording).

**Type-compat check (AR-IMPL9):** `ITreeProviderHost` requires `treeProvider: ITreeProvider | null` + `selectionState: TOneState<NavigationState>`. `ArchiveEditor.treeProvider` is `ArchiveTreeProvider | null` (assignable to `ITreeProvider | null` — `ArchiveTreeProvider implements ITreeProvider`). `ArchiveEditor.selectionState` is `TOneState<NavigationState>`. Both match — the `instanceof` narrows cleanly with no cast.

### Step 10 — (Optional) Add MCP `create_page` hint for `archive-view`

**File:** `src/renderer/api/mcp-handler.ts:157–167`

Archive-view is a standalone editor; `create_page` already rejects it with the generic hint. For consistency with `pdf-view` / `image-view`, optionally add:

```typescript
"archive-view": 'Use execute_script with: await app.pages.openFile("/path/to/archive.zip")',
```

Low priority — the generic fallback hint already works. Include only if doing a consistency pass.

### Step 11 — Dashboard update

**File:** `doc/active-work.md` — promote the US-570 entry (line 42) from the unlinked placeholder to the linked form with the verified note pattern (mirrors US-569).

---

## Concerns (AR-IMPL retrospective — added 2026-05-26 during investigation)

### AR-IMPL1 — Class shape: `ArchiveEditor extends V4EditorModel<ArchiveEditorState>` (two generics, base defaults for R + E)

Archive has no queue events — the reveal bridge runs on `revealVersion` (TOneState counter consumed by `ArchiveSecondaryEditor`'s `useEffect`), not the ComponentQueue. Use the bare two-generic form; the third generic defaults to `ComponentQueueEvent`. Matches PDF (PD-IMPL1) / Image (IM-IMPL1) / Explorer (EX-IMPL3) "no third generic" decision.

### AR-IMPL2 — `editorId = "archive-view"` — deliberate alignment with legacy registry id

`deriveEditorId({ type: "archiveFile" })` returns `"archive-view"` (`LegacyEditorAdapter.ts:343–346`). **Pre-US-570 saves already carry `editorId: "archive-view"`** (the LegacyEditorAdapter wraps with that id). Descriptor-shape-stable — **no restore migration shim needed**. (Verified identical to Image's IM-IMPL2 reasoning.)

### AR-IMPL3 — State shape: 2 fields (discriminator + archiveUrl) + inherited `secondaryEditor`

```typescript
export interface ArchiveEditorState extends EditorStateBase {
    type: "archiveFile";   // discriminator — kept (S10 carve-out)
    archiveUrl: string;    // the only Archive-unique persisted field
}
```

`type` is consumed by `_openZipArchive`'s dedup check (`PagesLifecycleModel.ts:640`), `deriveEditorId`, and pre-US-570 descriptors. `archiveUrl` drives provider reconstruction in `restore()`. `secondaryEditor` is inherited and carries `["archive-tree"]` when published — it persists in the descriptor (harmless; `setPage`/`restore` re-publish on restore regardless).

### AR-IMPL4 — Four navigation-survival overrides preserved verbatim (Link parity)

Archive is the **closest no-host editor to Link** (walkthrough 30 §closure). The four overrides map 1:1 onto the v4 base hooks (all defined at `EditorModel.ts:116–164`):

| Override | v4 base default | Archive behavior |
|----------|-----------------|------------------|
| `setPage(page)` | sets `this.page` | super + publish `["archive-tree"]` when page + provider ready |
| `beforeNavigateAway(newModel)` | **clears `secondaryEditor`** | keep panel IF `newModel` opened from this archive, else clear |
| `onMainEditorChanged(newMain)` | no-op | update `selectionState` + reveal + `expandPanel` when navigating within archive |
| `onPanelExpanded(panelId)` | no-op | bump `revealVersion` when `"archive-tree"` becomes active |

**Critical (mirrors EX-IMPL1):** the v4 base `beforeNavigateAway` default CLEARS `secondaryEditor`. Archive's override is NOT a no-op — it conditionally KEEPS the panel (the demote-on-navigate logic). It must be preserved; relying on the base default would unconditionally drop Archive's panel on every navigation, breaking the "drill into a `.zip` entry, archive tree stays in the sidebar" UX.

### AR-IMPL5 — `treeProvider` is a public mutable field (mirror Explorer EX-IMPL5), NOT a getter

Unlike Link (lazy-constructs its provider behind a getter), Archive constructs `ArchiveTreeProvider` eagerly in `initFromArchive` / `restore` and assigns the public field. The EX8 chain only requires `treeProvider` to be reachable — public field works. Keep it public; no getter wrapper.

### AR-IMPL6 — `ArchiveEditorView` retires the `v4Main` lookup (mirror IM-IMPL9 / PD-IMPL9)

Today's `ArchiveEditorView.tsx:36` reads `pagesModel.findPage(model.id)?.mainEditorV4 ?? null` then conditionally renders `<PageToolbar model={v4Main}>` vs `<EditorToolbar>`. Post-migration `model` IS the v4 ArchiveEditor — render `<PageToolbar model={model}>` directly. Drops the `pagesModel` + `EditorToolbar` imports.

### AR-IMPL7 — ⚠️ Panel publication timing: `setPage` runs BEFORE the slice-sub is wired inside `attach`

Reading `PageModel.attach` (`PageModel.ts:232–251`): `editor.setPage(this)` is called at line 235, BEFORE the `secondaryEditor` slice subscription is wired at line 242. So Archive's `setPage`-time publication of `["archive-tree"]` does NOT trigger `onEditorPanelsChanged` via the slice-sub. **However**, the trailing `state.update(s => { s.version++; s.hasSidebar })` at line 247 forces the navigator to re-render, and `PageNavigator` reads `page.panelEditors` (derived from `contributesPanels()`, which reads the now-set `secondaryEditor`). So the panel appears on first render.

Subsequent changes (e.g., `beforeNavigateAway` clearing the panel) DO hit the wired slice-sub → `onEditorPanelsChanged` → detach. So the lifecycle is correct end-to-end.

**Consequence for `_openZipArchive`:** the manual `secondaryEditor = ["archive-tree"]` line (today's `PagesLifecycleModel.ts:660`, which existed to trigger the legacy compat shim) becomes redundant — `attach`→`setPage`→`version++` already publishes + renders. Step 8 removes it. **Conservative fallback documented in Step 8** if testing reveals a render-timing edge.

This is the same lifecycle Explorer relies on (EX-IMPL6), with one difference: Explorer's MAIN publication happens in `restore()` AFTER `attach` (so its slice-sub catches it), whereas Archive publishes in `setPage` DURING `attach` (so the `version++` render covers it). Both produce a visible panel on first render; both wire the slice-sub for later changes.

### AR-IMPL8 — `page.mainEditor` returns the v4 ArchiveEditor directly post-migration

`ArchiveSecondaryEditor.tsx:37` computes `isActivePagePanel = archiveModel === archiveModel.page?.mainEditor`. `PageModel.mainEditor` is `unwrapAdapter(this.mainEditorV4)` (`PageModel.ts:150`). Post-migration, `mainEditorV4` IS the v4 ArchiveEditor (no adapter), and `unwrapAdapter` returns non-adapter editors as-is. So `archiveModel === page.mainEditor` holds when Archive is the page's main editor (the close button is hidden in that case — correct, since you can't close the panel of the page you're viewing). **No change needed** — but verify during smoke test #5.

### AR-IMPL9 — EX8 chain type-compat: `ArchiveTreeProvider` satisfies `ITreeProvider`

`ITreeProviderHost.treeProvider` is typed `ITreeProvider | null`. `ArchiveEditor.treeProvider` is `ArchiveTreeProvider | null`. `ArchiveTreeProvider` declares `readonly type = "archive"` + `sourceUrl` + `getNavigationUrl` and implements `ITreeProvider` (`ArchiveTreeProvider.ts:25`). The `instanceof ArchiveEditor` narrowing in `isTreeProviderHost` assigns cleanly with no cast — the editor's `treeProvider` field type is a subtype of the interface's. (Contrast the old duck-type, which produced an `EditorModel & ITreeProviderHost` intersection via property-existence — the `instanceof` form is strictly tighter.)

### AR-IMPL10 — `restore()` provider rebuild + `secondaryEditor` publish are both idempotent across paths

Three open/restore paths exercise `restore()` / `setPage()` differently:

| Path | `initFromArchive`? | `restore()` called? | provider source | publish via |
|------|-------------------|---------------------|-----------------|-------------|
| `_openZipArchive` | yes (before attach) | no | `initFromArchive` | `setPage` (during attach) |
| `openFile` / `createEditorFromFile` | yes (in `newEditorModel`) | yes (page null) | `initFromArchive` (already set) | `setPage` (during `addPage`→`attach`) |
| `restorePage` (generic no-host) | no | yes (page null) | `restore()` rebuild from `archiveUrl` | `setPage` (during attach loop) |

In every path the provider is non-null by the time `setPage` runs, so the panel publishes. The `if (this.treeProvider && this.page)` guard in `restore()` is effectively dead in v4 flows (page is null during `restore()` because attach happens after) — kept verbatim for legacy parity + defense.

### AR-IMPL11 — Compatibility aliases for `ArchiveEditorModel` / `ArchiveEditorModelState`

Per Image (IM-IMPL19) / Explorer (EX-IMPL8) precedent, `index.tsx` ships `export { ArchiveEditor as ArchiveEditorModel }` + the state-type alias. Grep confirms **no external runtime consumers** of the `ArchiveEditorModel` class name (only doc-comment references in `base/EditorModel.ts`, `LinkEditor.ts`, `io.link-data.d.ts`). The aliases cover any stale TypeScript imports; US-559 retires them.

### AR-IMPL14 — ⚠️ Bugfix (found during user testing): navigation-survival `sourceLink` resolution must check BOTH editor state and content host

**Discovered:** Clicking a file in the Archive sidebar panel opened it as the page's main editor but **dropped the Archive panel** from the PageNavigator. The same pre-existing bug affected Link panels — but only for links opening in a **no-host / legacy non-text editor** (e.g. the audio/video player); links opening in Monaco kept their panels.

**Root cause:** `navigatePageTo` writes `sourceLink` onto the legacy editor's `state` BEFORE `wrap()`. The location of that `sourceLink` then depends on the new main editor's topology:

| New main editor | `sourceLink` lives on | `contentHost` |
|-----------------|-----------------------|---------------|
| v4-native text (Monaco/Grid) | content host's state (the adopted `TextFileModel`); the editor's OWN state is fresh | non-null (the host) |
| no-host (PDF/Image/Browser/Archive) + legacy non-text adapter (Player) | the editor's OWN state | null |

`ArchiveEditor._isOpenedFromThisArchive` (preserved verbatim from the legacy model) read `model.state` only → missed Monaco (sourceLink on the host) → cleared the panel. `LinkEditor._isOpenedFromMe` (US-555) read `model.contentHost` only → missed the Player (no content host) → cleared the panels. Each check covered exactly one topology.

**Resolution:** Added `EditorModel.getNavigationSourceId()` to the v4 base — it reads `sourceLink.sourceId` from the editor's own state first, then falls back to `contentHost.state`. Both `ArchiveEditor._isOpenedFromThisArchive` and `LinkEditor._isOpenedFromMe` now call it, so navigation survival works regardless of the target editor's topology. Fixes Archive→text and Link→player; preserves Archive→player and Link→Monaco.

This is a pre-existing bug (predates US-570 — the legacy Archive model had the same `model.state`-only read). Fixed in-task because the Archive migration is the natural place and the shared base method removes the duplicated divergent logic.

### AR-IMPL15 — Bugfix (found during user testing): Explorer panel must always render first in the PageNavigator

**Discovered:** With a Link editor open, clicking the "File Explorer" toolbar button showed the Explorer panel **last**, below the three Link panels. Original design: Explorer is always the first (top) panel.

**Root cause:** `PageNavigator` renders panels by iterating `page.panelEditors` in `page.editors[]` attach order. The Explorer editor is **lazily attached** (via `toggleNavigator`) AFTER the content editor that owns the page — so it lands last in `editors[]` and its panel rendered last. Pre-EPIC-028, secondary editors lived in a separate ordered structure with Explorer pinned first; the unified-`editors[]` migration (US-548) lost that ordering.

**Resolution:** `PageModel.panelEditors` getter now stable-sorts the explorer-contributing editor to the front (`Array.sort` is stable, so every other editor keeps its attach order). Centralized in the getter so any panel-rendering consumer inherits the rule; the other two `panelEditors` consumers (`findSecondaryEditor` lookup + `secondaryEditors` shim) are order-insensitive.

Like AR-IMPL14, this is a pre-existing regression from the unified-array migration, fixed in-task because it surfaced during Archive/Link panel testing.

### AR-IMPL12 — No walkthrough amendment required; EX8 chain completes as originally designed

Walkthrough 30 closure explicitly deferred Archive for first-principles investigation (these AR-IMPL concerns ARE that investigation) — no mockup change. The EX8 chain was DESIGNED as a full `instanceof` chain over Link + Archive + Explorer (`30-no-host-group.md:1208`); US-567 made it temporarily partial (EX-IMPL2) pending Archive; US-570 completes it exactly as the walkthrough specified. **No amendment** — this task realizes the original design.

### AR-IMPL13 — Constructor flips to required `(state)` — factories build state

The legacy ctor accepted an optional `state?` (defaulting internally). The v4 ctor requires `(state: TComponentState<ArchiveEditorState>)` (EPIC-028 convention, matching Image/Explorer). The preserved legacy module factories (`newEditorModel` / `newEmptyEditorModel` / `newEditorModelFromState`) build the default state and pass it in — so the no-arg `new ArchiveEditorModel()` callsites inside the factory are replaced by `makeArchiveEditor()` (a local helper). No external caller constructs Archive directly (all go through the registry / module factories), so the signature flip is contained.

---

## Acceptance criteria

### Phase 1 — Static verification (read code; check 20 points)

**Archive class (10 points):**

1. `ArchiveEditor` extends `V4EditorModel<ArchiveEditorState>` from `editors/base/v4/EditorModel`.
2. `editorId === "archive-view"` is declared.
3. Constructor signature is `(state: TComponentState<ArchiveEditorState>)`.
4. `ArchiveEditorState` extends `EditorStateBase` (NOT `IEditorState`) with `type: "archiveFile"` + `archiveUrl: string`.
5. `getRestoreData()` returns `EditorDescriptor` (NOT `Partial<S>`); body has no `as any`.
6. `applyRestoreData(data)` reads typed `data.archiveUrl`.
7. All four lifecycle overrides present: `setPage` (publishes `["archive-tree"]`), `beforeNavigateAway` (conditional keep), `onMainEditorChanged` (select+reveal+expand), `onPanelExpanded` (reveal).
8. `treeProvider` is a public mutable field; `selectionState` + `revealVersion` are `readonly TOneState`.
9. `initFromArchive` + `restore()` both build `ArchiveTreeProvider` from `archiveUrl`.
10. `dispose()` nulls `treeProvider` then calls `super.dispose()`.

**Views (3 points):**

11. `ArchiveEditorView` renders `<PageToolbar model={model}>` directly (no `v4Main` lookup, no `EditorToolbar` fallback); prop typed `model: ArchiveEditor`.
12. `ArchiveEditorView.tsx` exports `archiveEditorModule` (legacy EditorModule) as default; factories construct v4 `ArchiveEditor` cast as legacy.
13. `ArchiveSecondaryEditor.tsx` casts `model as ArchiveEditor` (import from `./ArchiveEditor`).

**Module + deletions (3 points):**

14. `archive/index.tsx` exports `archiveModule` (v4 EditorModule, `createEditor` → `new ArchiveEditor(...)`, `Component` → `ArchiveEditorView`) + `ArchiveEditorModel`/`ArchiveEditorModelState` aliases + `export { default } from "./ArchiveEditorView"`.
15. `archive/ArchiveEditorModel.ts` is deleted.
16. `archive/index.ts` is deleted.

**Registration + persistence + EX8 (4 points):**

17. `register-editors.ts` has a v4 registration for `archive-view` (`hasContentHost: false`, `accepts` delegating to legacy `acceptFile`, `loadModule` → `archiveModule`). Legacy block + `archive-tree` secondary registration unchanged.
18. `PagesPersistenceModel.ts` `V4_NO_HOST_EDITOR_IDS` has 4 entries including `"archive-view"`.
19. `PagesLifecycleModel._openZipArchive` no longer manually sets `secondaryEditor` (or keeps it per the conservative fallback — Step 8).
20. `CategoryEditor.findTreeProviderHost` matches all three editors via `instanceof` (Link + Explorer + Archive); duck-type fallback removed; `ArchiveEditor` imported from `../archive`.

**Build / lint:**

21. `npm run typecheck` clean vs the US-569 baseline (commit `5dd6e39`) — no new errors in touched files.
22. `npm run lint` clean vs the US-569 baseline — no new findings in touched files.

### Phase 2 — Smoke tests (user runs in a dev build)

1. **Open a ZIP archive:** menu → "Open File" → select `.zip` → new page opens; archive tree renders in the main view; **the "Archive" sidebar panel appears**. `page.mainEditorV4 instanceof ArchiveEditor === true`.
2. **Open RAR / 7z / TAR:** repeat for each supported format — tree renders, panel appears.
3. **Browse the tree:** expand folders, Collapse All button, Refresh button — all work in the main view.
4. **Drill into an entry → archive panel survives navigation:** double-click a file entry inside the archive → the file opens as the page's main editor; **the Archive tree stays in the sidebar** (`beforeNavigateAway` keep-branch — AR-IMPL4); the opened entry is highlighted + revealed in the tree (`onMainEditorChanged`).
5. **Sidebar panel close button:** when viewing an archive entry (Archive is sidebar-only, not page-main), the panel header shows a Close button; clicking it removes the Archive panel (`removeSecondaryEditor`). When Archive IS the page-main editor, the Close button is hidden (AR-IMPL8).
6. **Navigate AWAY from the archive (unrelated file):** open an unrelated file in the same page (not from the archive) → Archive panel detaches (`beforeNavigateAway` clear-branch / `onMainEditorChanged` else-branch).
7. **Panel expand reveals current entry:** collapse the sidebar, navigate within the archive, re-expand the Archive panel → the current entry is revealed (`onPanelExpanded`).
8. **Survive app restart:** open a ZIP → close + relaunch → archive page restores; tree renders; `archiveUrl` preserved; `page.mainEditorV4 instanceof ArchiveEditor === true` (generic v4-native no-host restore branch — US-568 PD-IMPL11 + the `"archive-view"` opt-in).
9. **Dedup:** open the same archive twice → the second open focuses the existing page (`_openZipArchive` dedup on `type === "archiveFile" && archiveUrl === filePath` — AR-IMPL3).
10. **Category editor + archive tree (EX8 chain):** open a page whose Category view resolves an archive-sourced tree provider → Category finds the Archive's `treeProvider` via the new `instanceof ArchiveEditor` chain (AR-IMPL9). Items render with correct tree structure.
11. **Backwards-compat:** a pre-US-570 `openFiles0.json` with an Archive descriptor (saved via LegacyEditorAdapter) restores as v4 `ArchiveEditor` (editorId already `"archive-view"`; the new set member catches it). No regression.
12. **Concurrent editors restore:** a session with an Archive page + a PDF page + an Image page + a Monaco page all restore correctly (Archive/PDF/Image via the generic no-host branch; Monaco via the host branch).

### Phase 3 — Dashboard update

Mark US-570 with the verified note pattern in `doc/active-work.md`. Task stays unchecked (`[ ]`) per the epic-task deferred-review model — `/review`, `/document`, `/userdoc` run at EPIC-028 close.

---

## Files Changed

| File | Action | Why |
|------|--------|-----|
| `src/renderer/editors/archive/ArchiveEditor.ts` | Create | v4 native class + state interface + defaults (extracted from `ArchiveEditorModel.ts`) |
| `src/renderer/editors/archive/ArchiveEditorView.tsx` | Modify | Retire `v4Main` lookup; render `<PageToolbar model={model}>`; prop typed `ArchiveEditor`; ADD preserved legacy `archiveEditorModule` default export (constructs v4 cast as legacy) |
| `src/renderer/editors/archive/ArchiveSecondaryEditor.tsx` | Modify | Type cast `as ArchiveEditor`; import from `./ArchiveEditor` |
| `src/renderer/editors/archive/index.tsx` | Create | v4 `archiveModule` EditorModule + compatibility aliases + legacy default re-export |
| `src/renderer/editors/archive/ArchiveEditorModel.ts` | Delete | Class moved to `ArchiveEditor.ts` |
| `src/renderer/editors/archive/index.ts` | Delete | Folded into `index.tsx` |
| `src/renderer/editors/register-editors.ts` | Modify | Add v4 `archive-view` registration. Legacy block + `archive-tree` secondary registration unchanged |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Modify | Add `"archive-view"` to `V4_NO_HOST_EDITOR_IDS` (4th member); trim JSDoc if it lists US-570 |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Modify | `_openZipArchive`: remove redundant manual `secondaryEditor` publish (Step 8) — v4 `setPage` handles it. `wrapLegacyForPage` early-return (PD-IMPL16) already covers Archive |
| `src/renderer/editors/category/CategoryEditor.tsx` | Modify | Complete EX8 chain — add `instanceof ArchiveEditor`, drop duck-type fallback |
| `src/renderer/editors/base/v4/EditorModel.ts` | Modify | **Bugfix (AR-IMPL14)** — add `getNavigationSourceId()` (reads `sourceLink.sourceId` from own state OR content host) |
| `src/renderer/editors/link-editor/LinkEditor.ts` | Modify | **Bugfix (AR-IMPL14)** — `_isOpenedFromMe` uses `getNavigationSourceId()` so links opening in a no-host/player editor keep the Link panels |
| `src/renderer/api/pages/PageModel.ts` | Modify | **Bugfix (AR-IMPL15)** — `panelEditors` stable-sorts the Explorer-contributing editor first so the Explorer panel always renders on top |
| `src/renderer/api/mcp-handler.ts` | Modify (optional) | Add `archive-view` create_page hint (consistency — Step 10) |
| `doc/active-work.md` | Modify | Promote US-570 entry to linked task form with verified note |
| `doc/tasks/US-570-archive-editor-migration/README.md` | Create | This task document |

**Total:** 3 created, 6–7 modified, 2 deleted. **One new source class file** (`ArchiveEditor.ts`) + one new `index.tsx`; two deletions (`ArchiveEditorModel.ts`, `index.ts`). One single-line persistence opt-in; one lifecycle simplification; one EX8 chain completion.

## Files NOT changing

- `src/renderer/content/tree-providers/ArchiveTreeProvider.ts` — provider unchanged; implements `ITreeProvider`; consumed by both views + the EX8 chain.
- `src/renderer/content/transformers/ArchiveTransformer.ts` + `src/renderer/api/archive-service.ts` — archive I/O unchanged.
- `src/renderer/components/tree-provider/*` — `TreeProviderView` / `TreeProviderViewRef` unchanged.
- `src/renderer/ui/navigation/secondary-editor-registry.ts` — interface unchanged; `archive-tree` registration unchanged.
- `src/renderer/ui/navigation/PageNavigator.tsx` — resolves panel model via `page.panelEditors`; v4 ArchiveEditor passes through directly (`PageModel.ts:179–184`).
- `src/renderer/editors/base/v4/EditorModel.ts` — all four lifecycle hooks already defined (no change for the migration itself). NOTE: one method added post-implementation — `getNavigationSourceId()` (AR-IMPL14 bugfix).
- `src/renderer/api/pages/PagesPersistenceModel.ts` (the rest) — generic v4-native no-host restore branch (PD-IMPL11) already in place; only set membership grows.
- `src/renderer/api/pages/PagesLifecycleModel.ts` (the rest) — `wrapLegacyForPage` early-return (PD-IMPL16) already covers Archive; `createEditorFromFile` / `openFile` work unchanged.
- `src/shared/types.ts` — `EditorType` / `EditorView` unions still include `archiveFile` / `archive-view` (S10 carve-out — discriminators retained during strangler).
- `src/renderer/content/resolvers.ts` / `parsers.ts` — archive-path (`!`-bang) routing unchanged.
- `src/main/*` — Archive is a renderer-only concern.
- `doc/epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md` — no amendment (AR-IMPL12 — EX8 chain completes as originally designed).
- `doc/architecture/*` — document update deferred to EPIC-028 `/document` pass at close.
- `doc/tasks/completed.md` — task moves here only when EPIC-028 closes (deferred-review model).

---

## Cross-task notes

- **Archive is the fourth consumer of US-568's cross-cutting infrastructure** (after PDF, Image, Browser-retroactive). One-line opt-in to `V4_NO_HOST_EDITOR_IDS` (Step 7) + the `wrapLegacyForPage` early-return (PD-IMPL16) already in place. No new cross-cutting infrastructure introduced.
- **Archive completes the EX8 `instanceof` chain** that US-567 EX-IMPL2 left partial. After US-570, `CategoryEditor.findTreeProviderHost` has zero duck-typing — all three tree-provider hosts (Link text-bearing + Explorer secondary-only + Archive no-host sidebar-owning) match by `instanceof`. This was the last deferred cleanup from the Explorer migration.
- **Archive is the first NO-HOST sidebar-owning editor** — it validates that the sidebar-owning lifecycle (LK7/LK8 overrides + `secondaryEditor` publication) composes cleanly with the no-host page-mainEditor shape. Future no-host migrations (US-571 Video / US-572 Settings / US-573 About / US-574 MCP Inspector / US-575 Storybook / US-576 Category) are all leaf editors (no sidebar) — Archive is the only sidebar-owning member of the no-host group.
- **US-559 path:** post-US-570, the only remaining `LegacyEditorAdapter` producers are the truly-legacy editors (Video pre-US-571, Settings pre-US-572, About pre-US-573, MCP pre-US-574, Storybook pre-US-575, Category pre-US-576) + the `BrowserWebviewModel.ts` legacy-wrap sites + `restoreSidebarLegacy`.
- **`/review` / `/document` / `/userdoc` deferred** to EPIC-028 close per the epic-task workflow. `[ ]` stays unchecked even after implementation + smoke testing.
- **No follow-up task spawned by US-570** — all Archive concerns resolve in-task.
