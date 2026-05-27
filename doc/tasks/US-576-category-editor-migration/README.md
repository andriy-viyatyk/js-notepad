# US-576 — Category editor migration

> **EPIC-028 Phase C** · walkthrough 30 closure (last no-host editor) · **Status:** Investigation complete 2026-05-27, ready for implementation.
>
> **Risk profile:** Low-to-medium. Category is the **only no-host editor that is a tree-provider CONSUMER, not an owner** — it composes a sibling tree-provider host (Link / Explorer / Archive) found in `page.panelEditors` and renders a `CategoryView`. Its migration was pre-designed in **walkthrough 03 / N5 (RESOLVED 2026-05-19)**: the cross-editor reactivity moves from the model to the view, deleting the ad-hoc `onSecondaryEditorsChanged` duck-type hook, the `_providerVersion` counter, and a defensive 50ms `setTimeout` retry. The cross-cutting infrastructure (`V4_NO_HOST_EDITOR_IDS` set + `wrapLegacyForPage` `instanceof V4EditorModel` early-return) already exists from US-568; Category opts in with one line. The EX8 `instanceof` chain in `CategoryEditor.findTreeProviderHost` is **already complete** (US-570) — no change there. **Scope:** 3 files in `editors/category/` (1 modified class, 1 modified view, 1 new `index.tsx`) + `register-editors.ts` + 1 line in `PagesPersistenceModel.ts`.

## Goal

Migrate the Category (Folder View) editor from the legacy `EditorModel` base wrapped in `LegacyEditorAdapter` to a native v4 `EditorModel` subclass. Apply walkthrough 03 / N5: replace the model-side cross-editor reactivity (`onSecondaryEditorsChanged` / `_providerVersion` / `providerVersion`) with a view-level `page.state` subscription, and drop the defensive 50ms `setTimeout` retry. Add `"category-view"` to `V4_NO_HOST_EDITOR_IDS`, register a native v4 module, and retire the `v4Main` strangler toolbar lookup in the view. After US-576, Category is the **final** no-host editor migrated — closing the walkthrough-30 group.

## Background

### Today's surface

`src/renderer/editors/category/` — 3-file folder (no `index` file today):

| File | LOC | Role |
|------|-----|------|
| `CategoryEditorModel.ts` | 71 | Legacy `EditorModel` subclass (no-host, tree-provider consumer) |
| `CategoryEditor.tsx` | 192 | Page-main view (toolbar + `CategoryView`) **+** the legacy `EditorModule` default export |
| `FolderViewModeService.ts` | 78 | Per-folder view-mode persistence (`folderViewMode.json`) — **untouched** |

### Today's class shape (legacy base, `CategoryEditorModel.ts`)

```typescript
export interface CategoryEditorModelState extends IEditorState {
    type: "categoryPage";
}

export class CategoryEditorModel extends EditorModel<CategoryEditorModelState> {
    private _providerVersion = 0;                       // ← DELETE (N5)

    constructor(state?: TComponentState<CategoryEditorModelState>) {
        super(state ?? new TComponentState(getDefaultCategoryEditorModelState()));
        this.noLanguage = true;
        this.getIcon = () => React.createElement("span", { style: { ... } },
            React.createElement(FolderIcon));
    }

    get categoryPath(): string { /* decoded from tree-category:// link in filePath */ }
    get decodedLink(): ITreeProviderLink | null { /* decodeCategoryLink(filePath) */ }
    initFromLink(link: ITreeProviderLink): void { /* sets title + filePath (encoded link) */ }

    onSecondaryEditorsChanged(): void { this._providerVersion++; this.state.update((s) => s); }  // ← DELETE (N5)
    get providerVersion(): number { return this._providerVersion; }                              // ← DELETE (N5)
}
```

State shape — **minimal**:

- **`state.filePath: string`** — holds the **encoded `tree-category://` link** (set by `initFromLink`). This is the only meaningful persisted field; `categoryPath` / `decodedLink` derive from it.
- **`state.title: string`** — folder basename (set by `initFromLink`).
- **`state.type: "categoryPage"`** — discriminator (drives `deriveEditorId` → `"category-view"`, parser routing).
- No transient fields on the editor other than `_providerVersion` (which N5 deletes).

### Today's view shape (`CategoryEditor.tsx`)

The view is a **tree-provider consumer**, not an owner. It:

1. Reads `model.decodedLink` / `model.categoryPath` (from `filePath`).
2. Scans `page.secondaryEditors` for a tree-provider host matching the link's `type` + `url` via `findTreeProviderHost` (`isTreeProviderHost` is an **already-complete EX8 `instanceof` chain** over `LinkEditor | ExplorerEditor | ArchiveEditor` — US-570 landed this).
3. Reads the host's `treeProvider` + subscribes to its `selectionState` (manual `useEffect` subscription, because the host may be null on some renders — a hook-order guard already used in this file).
4. Renders `<CategoryView provider={...} ...>`.

Three reactivity mechanisms drive the host re-scan **today** — all three are the N5 target for removal/replacement:

- `model.state.use()` (line 70) — subscribes to model state.
- `useMemo(..., [page, link, model.providerVersion])` (line 76) — re-scans when `providerVersion` bumps.
- `useEffect` retry: `setTimeout(() => model.onSecondaryEditorsChanged(), 50)` (lines 99–105) — defensive re-scan when the provider hasn't resolved yet (sibling editors restore asynchronously).

The view also carries the **`v4Main` strangler accommodation** (line 122): `pagesModel.findPage(model.id)?.mainEditorV4 ?? null` → conditional `<PageToolbar>` vs `<EditorToolbar>` (`renderToolbar` helper). This retires in this migration (mirrors AR-IMPL6 / IM-IMPL9 / PD-IMPL9).

### Walkthrough 03 / N5 — RESOLVED 2026-05-19 (the design for this task)

> **N5 — Replacement for `onSecondaryEditorsChanged` duck-type hook.** Decision: **option (a-view)** — CategoryEditor's *view* subscribes to `page.state` via `.use()`. No model-side wiring.
>
> What goes away:
> - `CategoryEditorModel.onSecondaryEditorsChanged()` — deleted.
> - `CategoryEditorModel._providerVersion` field + `providerVersion` getter — deleted.
> - The defensive 50ms `setTimeout(() => model.onSecondaryEditorsChanged(), 50)` retry — deleted.
> - `PageModel._notifyMainEditorOfSecondaryChange()` — **already removed** by the unified-array refactor (walkthrough 01).
>
> The view's `useMemo` keys on the page-state version; the scan source switches from `page.secondaryEditors` to `page.panelEditors`.

**Confirmed during this investigation:** `PageModel` has NO current caller of `onSecondaryEditorsChanged` — the only invocation today is the view's own 50ms `setTimeout`. So the model method + counter form a self-contained loop that N5 replaces with a `page.state` subscription. (`page.secondaryEditors` is already a compat shim aliased to `page.panelEditors` — `PageModel.ts:200–204` — so switching the scan source is a no-op behaviorally, but uses the canonical getter.)

### Walkthrough-30 closure note — ⚠️ correction needed (CT-IMPL6)

The walkthrough-30 closure table (`30-no-host-group.md:1245`) describes Category as:

> Aggregator editor — composes links from multiple `LinkEditor` siblings into one category-tree view; **potentially has `treeProvider` (EX8 chain candidate)**.

This is **incorrect** and superseded by this investigation: Category does **NOT** own a `treeProvider` and is **NOT** an EX8 chain member — it is the EX8 chain's sole **consumer** (it reads a sibling host's `treeProvider`). Per the `feedback_cross_cutting_design_amendments` memory, amend this line in the same pass — see Step 6.

### Today's construction & restore paths

1. **Open via `tree-category://` link** (the only open path):
   - `parsers.ts:70` sets `data.target = "category-view"` for `tree-category://` hrefs.
   - `resolvers.ts:56` creates a placeholder file pipe (CategoryEditor resolves its provider from siblings, not the pipe).
   - `open-handler.ts:51` → `openFile(filePath, pipe, { target: "category-view", sourceLink })`.
   - `PagesLifecycleModel.openFile` → `createEditorFromFile(filePath, pipe, "category-view")` → `newEditorModelByTarget(filePath, "category-view")` → legacy `editorRegistry.getById("category-view").loadModule()` → `module.newEditorModel(filePath)` (decodes link + `initFromLink`) → `editor.restore()` → `addPage(wrap(editor))`.
   - `wrap(editor)` = `wrapLegacyForPage` → **`instanceof V4EditorModel` early-return (PD-IMPL16)** returns the v4 instance directly — no adapter. **This already works** for the post-migration v4 CategoryEditorModel cast as legacy.

2. **Session restore** (`PagesPersistenceModel.restorePage`):
   - Pre-US-576 saves carry `editorId: "category-view"` (via `deriveEditorId({type:"categoryPage"})` — `LegacyEditorAdapter.ts:339–347`). **Descriptor-shape-stable — no migration shim.**
   - Post-migration, with `"category-view"` in `V4_NO_HOST_EDITOR_IDS`, the generic v4-native no-host restore branch (PD-IMPL11, `PagesPersistenceModel.ts:163–182`) fires: `v4Registry.createEditor("category-view", d.id)` → `Object.assign(s, d.state)` copies `filePath` + `title` + `type` → `applyRestoreData` (no-op) → `restore()` (no-op). `decodedLink` / `categoryPath` derive from the restored `filePath`. The sibling tree-provider host restores as a separate editor on the same page; the view's `page.state` subscription re-runs the scan once it attaches.

### `deriveEditorId({ type: "categoryPage" })` → `"category-view"`

Confirmed via `deriveEditorId` (`LegacyEditorAdapter.ts:339–347`): non-text editors resolve by the legacy registry def whose `editorType` matches — `category-view`'s def has `editorType: "categoryPage"`. Pre-US-576 saves already carry `editorId: "category-view"`. No restore migration needed.

### What Category HAS that prior no-host editors lacked

- **It is a tree-provider CONSUMER** — reads a sibling host's `treeProvider` from `page.panelEditors`. Unique among editors. The N5 view-subscription is the mechanism that keeps the scan fresh as siblings join/leave.

### What Category does NOT have

- **No `CONTENT_HOST_TRAIT`** — no-host editor.
- **No owned `treeProvider`** — corrects the walkthrough-30 closure note (CT-IMPL6).
- **No sidebar panel of its own** — Category does NOT contribute a `secondaryEditor`; it is purely a page-main view that reads siblings' panels. (Contrast Archive US-570, which owns `["archive-tree"]`.)
- **No navigation-survival overrides** — no `beforeNavigateAway` / `onMainEditorChanged` / `onPanelExpanded` / `setPage` overrides. (Category is a leaf main editor.)
- **No scripting facade** — `page.asCategory()` does not exist; Category stays non-script-manipulable. (Verified: no `asCategory` anywhere in `scripting/`.)
- **No persistence overrides** — base `getRestoreData` (serializes full state incl. `filePath`) + the no-host `Object.assign` restore branch carry everything. Mirrors Storybook (SB-C2) / About (US-573).
- **No queue events** — no `ComponentQueue` dispatch; the bare two-generic class form suffices.
- **No singleton id** — unlike Settings/About/Storybook/MCP, Category is per-folder (a fresh `id` per page).

---

## Implementation plan

### Step 1 — Re-parent `CategoryEditorModel.ts` to the v4 base (in place; keep the class name)

**File:** `src/renderer/editors/category/CategoryEditorModel.ts`

Keep the class name `CategoryEditorModel` (CT-IMPL1 — same "keep the name" decision as MCP MC-C1 / Storybook SB-C1; renaming to `CategoryEditor` would collide with the existing `CategoryEditor.tsx` view name). Re-parent in place — no rename, no compatibility alias.

**Imports** — before → after:

```typescript
// Before
import { EditorModel, getDefaultEditorModelState } from "../base";
import type { IEditorState } from "../../../shared/types";

// After
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
} from "../base/v4/EditorModel";
```

(Keep `React`, `TComponentState`, `FolderIcon`, `fpBasename`, and the `tree-provider-link` imports.)

**State interface** — extend `EditorStateBase` (not `IEditorState`):

```typescript
export interface CategoryEditorModelState extends EditorStateBase {
    type: "categoryPage";
}
```

**Default state** — replace the legacy `getDefaultEditorModelState()` spread with explicit minimal fields (mirrors Storybook):

```typescript
export function getDefaultCategoryEditorModelState(): CategoryEditorModelState {
    return {
        id: crypto.randomUUID(),
        title: "",
        modified: false,
        type: "categoryPage",
        filePath: "",
    };
}
```

**Class** — extend the v4 base, add `editorId`, and DELETE the three N5 members:

```typescript
export class CategoryEditorModel extends V4EditorModel<CategoryEditorModelState> {
    /** v4 editor identity. Matches the legacy registry id so v4
     *  `EditorDescriptor.editorId` and pre-US-576 saved descriptors
     *  (`deriveEditorId({type:"categoryPage"}) === "category-view"`) agree. */
    readonly editorId = "category-view";

    noLanguage = true;

    constructor(state?: TComponentState<CategoryEditorModelState>) {
        super(state ?? new TComponentState(getDefaultCategoryEditorModelState()));
        this.getIcon = () => React.createElement(
            "span",
            { style: { display: "inline-block", transform: "translate(-2px, -3px)" } },
            React.createElement(FolderIcon),
        );
    }

    get categoryPath(): string { /* unchanged */ }
    get decodedLink(): ITreeProviderLink | null { /* unchanged */ }
    initFromLink(link: ITreeProviderLink): void { /* unchanged */ }

    // DELETED (N5): _providerVersion field, onSecondaryEditorsChanged(), providerVersion getter.
}
```

Note `noLanguage = true` moves to a class field (the v4 base declares `noLanguage = false`) — set it as a field initializer or in the constructor; keep as a field for clarity (mirrors Storybook). NO `getRestoreData` / `applyRestoreData` / `restore` / `dispose` overrides (CT-IMPL3).

### Step 2 — Apply N5 + retire `v4Main` in `CategoryEditor.tsx`

**File:** `src/renderer/editors/category/CategoryEditor.tsx`

**2a — Reactivity (N5).** Replace `model.state.use()` + the `providerVersion`-keyed `useMemo` + the 50ms `setTimeout` retry with a `page.state` subscription via **`useOptionalState`** (`core/state/state.ts:138`) — the project's purpose-built hook for subscribing to a nullable state (its docstring: *"Use this instead of `state?.use()` which is a conditional hook and violates React rules."* — it always calls `useState` + `useEffect` for a stable hook count and returns the default when the state is null). `PageModel.state` is a `TOneState<IPageState>` whose `version` field (`PageModel.ts:54`) bumps on `attach` / `detach` / `onEditorPanelsChanged` / `expandPanel` — exactly the sibling-membership events the scan cares about:

```tsx
// Before (lines ~69–105)
model.state.use();
const host = useMemo(() => {
    if (!page || !link) return null;
    return findTreeProviderHost(page.secondaryEditors, link.type, link.url);
}, [page, link, model.providerVersion]);
// ...
// Retry provider resolution after mount
useEffect(() => {
    if (!provider && link) {
        const timer = setTimeout(() => model.onSecondaryEditorsChanged(), 50);
        return () => clearTimeout(timer);
    }
}, [provider, link, model]);

// After — N5: re-scan when sibling editors join/leave page.editors[].
const pageVersion = useOptionalState(page?.state, (s) => s.version, 0);

const host = useMemo(() => {
    if (!page || !link) return null;
    return findTreeProviderHost(page.panelEditors, link.type, link.url);
}, [page, link, pageVersion]);
// (the 50ms setTimeout useEffect is DELETED entirely)
```

Add `useOptionalState` to the `core/state/state` import. Switch the scan source `page.secondaryEditors` → `page.panelEditors` (N5; canonical getter).

**2a-bis — Collapse the existing `host.selectionState` subscription to `useOptionalState` too (in-pass consistency).** The view already hand-rolls a nullable-state subscription for the host's selection (lines 83–89: `useState` + `useEffect` guarding `host` null). That is precisely what `useOptionalState` exists for — replace it:

```tsx
// Before
const [selectedHref, setSelectedHref] = useState<string | null>(null);
useEffect(() => {
    if (!host) { setSelectedHref(null); return; }
    const sel = host.selectionState;
    setSelectedHref(sel.get().selectedHref);
    return sel.subscribe(() => setSelectedHref(sel.get().selectedHref));
}, [host]);

// After
const selectedHref = useOptionalState(host?.selectionState, (s) => s.selectedHref, null);
```

Both subscriptions now use the same idiom; no manual `useEffect`/`useState` plumbing remains for either nullable state.

**2b — Retire `v4Main` toolbar lookup (CT-IMPL4).** Post-migration `model` IS the v4 CategoryEditorModel — render `<PageToolbar model={model}>` directly:

```tsx
// Before
const v4Main = pagesModel.findPage(model.id)?.mainEditorV4 ?? null;
const renderToolbar = (children?: ReactNode) =>
    v4Main
        ? <PageToolbar name="category-toolbar" model={v4Main} borderBottom rightContributions={children} />
        : <EditorToolbar borderBottom>{children}</EditorToolbar>;

// After
const renderToolbar = (children?: ReactNode) => (
    <PageToolbar name="category-toolbar" model={model} borderBottom rightContributions={children} />
);
```

Drop the now-unused imports: `pagesModel` (`../../api/pages`), `EditorToolbar` (`../base/EditorToolbar`). Keep `PageToolbar` (`../base/v4`).

**2c — Legacy `EditorModule` shim casts.** Post-migration the factories return a v4 `CategoryEditorModel` typed as legacy. Add `as unknown as EditorModel` casts and seed state in `newEditorModelFromState` directly (since the v4 base `applyRestoreData` is a no-op — the old `model.applyRestoreData(state)` would silently drop `filePath`):

```tsx
const categoryEditorModule: EditorModule = {
    Editor: CategoryEditor as unknown as EditorModule["Editor"],
    newEditorModel: async (filePath?: string) => {
        const { CategoryEditorModel } = await import("./CategoryEditorModel");
        const { decodeCategoryLink } = await import("../../content/tree-providers/tree-provider-link");
        const model = new CategoryEditorModel();
        if (filePath) {
            const link = decodeCategoryLink(filePath);
            if (link) model.initFromLink(link);
        }
        return model as unknown as EditorModel;
    },
    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "categoryPage") return null;
        const { CategoryEditorModel } = await import("./CategoryEditorModel");
        return new CategoryEditorModel() as unknown as EditorModel;
    },
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const { CategoryEditorModel, getDefaultCategoryEditorModelState } =
            await import("./CategoryEditorModel");
        return new CategoryEditorModel(new TComponentState({
            ...getDefaultCategoryEditorModelState(),
            ...(state as Partial<CategoryEditorModelState>),
        })) as unknown as EditorModel;
    },
};
```

Add the EPIC-028/US-576 comment block above the module (mirror Storybook lines 83–92). `TComponentState` is already imported (line 4). Import `CategoryEditorModelState` type from `./CategoryEditorModel` for the cast. The `CategoryEditor` named export + `default` export stay.

### Step 3 — Create `index.tsx` (v4 EditorModule + re-exports)

**File:** `src/renderer/editors/category/index.tsx` (NEW — the folder has no index today). Mirror `storybook/index.tsx` exactly:

```tsx
import { TComponentState } from "../../core/state/state";
import {
    CategoryEditorModel,
    getDefaultCategoryEditorModelState,
} from "./CategoryEditorModel";
import { CategoryEditor } from "./CategoryEditor";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-576 — native Category (Folder View) editor module. Registered
 * with the v4 `editorRegistry` in `register-editors.ts`; consumed by
 * `RenderEditor` when the page's `mainEditorV4` is a v4-native
 * CategoryEditorModel instance.
 *
 * Category is NO-HOST (no `CONTENT_HOST_TRAIT`) and a tree-provider CONSUMER —
 * it reads a sibling host's `treeProvider` from `page.panelEditors`. It owns no
 * `treeProvider` and contributes no panel. No `<TextChrome>` wrap.
 */

function CategoryEditorComponent({ model }: { model: V4EditorModel }) {
    return <CategoryEditor model={model as CategoryEditorModel} />;
}

export const categoryModule: EditorModule = {
    createEditor: () =>
        new CategoryEditorModel(new TComponentState(getDefaultCategoryEditorModelState())),
    Component: CategoryEditorComponent,
};

export {
    CategoryEditorModel,
    getDefaultCategoryEditorModelState,
} from "./CategoryEditorModel";
export type { CategoryEditorModelState } from "./CategoryEditorModel";
// Legacy EditorModule default-export — consumed by the legacy `editorRegistry`
// `loadModule` (which imports `./category/CategoryEditor` directly).
export { default as categoryEditorModule, default } from "./CategoryEditor";
```

### Step 4 — Register the native v4 module in `register-editors.ts`

**File:** `src/renderer/editors/register-editors.ts`

**Legacy registration (lines 637–651) UNCHANGED** — its `loadModule` imports `./category/CategoryEditor` (the view file's default export), which still resolves to the preserved legacy `categoryEditorModule`.

Add a v4 block **after the storybook v4 block** (which sits after the mcp-view v4 block, ~line 1490). Mirror the Storybook v4 registration:

```typescript
// EPIC-028 / US-576 — replace the legacy bare-adapter mirror for category-view
// with a native v4 module. Category is NO-HOST (no `CONTENT_HOST_TRAIT`) and a
// tree-provider CONSUMER (reads a sibling host's provider from
// `page.panelEditors`). `hasContentHost: false` keeps it out of the switch
// widget. Opened via `tree-category://` links (target="category-view"); the
// legacy registry's `module.newEditorModel(filePath)` decodes the link and
// returns a v4 CategoryEditorModel cast as legacy. `wrapLegacyForPage`'s
// `instanceof V4EditorModel` early-return (US-568 PD-IMPL16) skips the adapter.
v4EditorRegistry.register({
    id: "category-view",
    name: "Folder View",
    hasContentHost: false,
    accepts: (input) => {
        if (input.fileName?.startsWith("tree-category://")) return 200;
        return -1;
    },
    loadModule: async () => {
        const { categoryModule } = await import("./category");
        return categoryModule;
    },
});
```

### Step 5 — Add `"category-view"` to `V4_NO_HOST_EDITOR_IDS`

**File:** `src/renderer/api/pages/PagesPersistenceModel.ts`

```typescript
// After (lines 49–59)
const V4_NO_HOST_EDITOR_IDS = new Set([
    "browser-view", // US-558 (retroactive — see US-568 PD-IMPL11)
    "pdf-view",     // US-568
    "image-view",   // US-569
    "archive-view", // US-570 (first no-host sidebar-owning editor)
    "video-view",   // US-571
    "settings-view", // US-572
    "about-view",    // US-573
    "mcp-view",      // US-574
    "storybook-view", // US-575
    "category-view",  // US-576 (this PR — last no-host editor; closes walkthrough 30)
]);
```

Also remove the `- US-576 Category → "category-view"` line from the JSDoc "Append to this set…" comment block (lines 43–44) — the set is now complete.

### Step 6 — Amend the walkthrough-30 closure note (CT-IMPL6)

**File:** `doc/epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md:1245`

Correct the Category row — it is a tree-provider **consumer**, not an owner:

```markdown
# Before
| Category | `src/renderer/editors/category/` | Aggregator editor — composes links from multiple `LinkEditor` siblings into one category-tree view; potentially has `treeProvider` (EX8 chain candidate). |

# After
| Category | `src/renderer/editors/category/` | No-host EditorModel — **consumes** a sibling tree-provider host (Link / Explorer / Archive) found in `page.panelEditors` and renders a `CategoryView`. Owns NO `treeProvider`; the sole EX8-chain **consumer**, not a member. Migration realizes walkthrough 03 / N5 (view subscribes to `page.state`; model-side `onSecondaryEditorsChanged` / `_providerVersion` deleted). See US-576. |
```

Per the `feedback_cross_cutting_design_amendments` memory, this amendment lands in the same investigation/implementation pass.

### Step 7 — Dashboard update

**File:** `doc/active-work.md` — promote the US-576 entry (line 48) from the unlinked placeholder to the linked form with the verified-note pattern (mirrors US-575). Stays `[ ]` (epic-deferred review).

---

## Concerns (CT-IMPL retrospective — added 2026-05-27 during investigation)

### CT-IMPL1 — Keep the class name `CategoryEditorModel` (do NOT rename to `CategoryEditor`)

The v4 naming convention renames model classes to `<X>Editor` — but `CategoryEditor` is already taken by the **view component** (`CategoryEditor.tsx`). Renaming the model would collide. Follow the MCP MC-C1 / Storybook SB-C1 "keep the name" precedent: re-parent `CategoryEditorModel` in place, no rename, no compatibility alias. (Explorer/Archive renamed because their view files were `*SecondaryEditor.tsx` / `*View.tsx` — no collision; Category's view owns the bare `CategoryEditor` name.)

### CT-IMPL2 — N5 view subscription: `useOptionalState`, not `page.state.use()` or a hand-rolled subscription

The walkthrough N5 text says "view subscribes to `page.state` via `.use()`". But `page` (`model.page`) is nullable on early renders, and a conditional `page?.state.use()` violates the rules of hooks. The project already has the exact tool for this: **`useOptionalState(state, selector, defaultValue)`** (`core/state/state.ts:138`) — its docstring says *"Use this instead of `state?.use()` which is a conditional hook and violates React rules."* It always calls `useState` + `useEffect` (stable hook count) and returns `defaultValue` when the state is null. It is already used elsewhere for the same situation (e.g. `PageTab.tsx:530`).

Use `const pageVersion = useOptionalState(page?.state, (s) => s.version, 0);` and key the host `useMemo` on `pageVersion`. `IPageState.version` (`PageModel.ts:54`) bumps on `attach` / `detach` / `onEditorPanelsChanged` / `expandPanel` — the precise sibling-membership events that change the scan result.

**Bonus (Step 2a-bis):** the view's *existing* `host.selectionState` subscription (a hand-rolled `useState` + `useEffect` null-guard, lines 83–89) is the same pattern and collapses to `useOptionalState(host?.selectionState, (s) => s.selectedHref, null)`. Fold it in this pass — no manual subscription plumbing remains for either nullable state.

(This supersedes the earlier draft's hand-rolled `useEffect`/`useState` subscription — `useOptionalState` is the canonical idiom, surfaced during review.)

### CT-IMPL3 — No persistence overrides (mirrors Storybook SB-C2 / About)

Base `getRestoreData` (`EditorModel.ts:309`) serializes the full state — including `filePath` (the encoded `tree-category://` link), `title`, and `type`. The no-host restore branch (PD-IMPL11) does `Object.assign(s, d.state)` + `applyRestoreData` (no-op) + `restore()` (no-op). `decodedLink` / `categoryPath` derive from the restored `filePath`. So Category needs NO `getRestoreData` / `applyRestoreData` / `restore` / `dispose` overrides. **Caveat (Step 2c):** the *legacy* `newEditorModelFromState` factory previously relied on `applyRestoreData(state)` to set `filePath`; since the v4 base `applyRestoreData` is a no-op, that factory must seed state via the constructor spread instead. (This factory is dead on the restore path post-migration — restore uses the generic branch — but the contract fix keeps it correct if called.)

### CT-IMPL4 — Retire the `v4Main` toolbar lookup (mirrors AR-IMPL6 / IM-IMPL9 / PD-IMPL9)

Today's `pagesModel.findPage(model.id)?.mainEditorV4 ?? null` + conditional `PageToolbar`/`EditorToolbar` was a strangler accommodation for when Category could be either adapter-wrapped or v4. Post-migration `model` IS the v4 editor — render `<PageToolbar model={model}>` directly; drop the `pagesModel` + `EditorToolbar` imports.

### CT-IMPL5 — EX8 `instanceof` chain already complete (no change)

`CategoryEditor.findTreeProviderHost` / `isTreeProviderHost` were finalized to the typed `instanceof LinkEditor | ExplorerEditor | ArchiveEditor` chain by US-570 (the duck-type fallback is already gone). US-576 touches the *reactivity* around the scan (N5), not the chain itself. No change to `isTreeProviderHost`.

### CT-IMPL6 — Walkthrough-30 closure note misdescribes Category (amend in-pass)

The closure table calls Category an "aggregator … potentially has `treeProvider` (EX8 chain candidate)". First-principles reading shows Category **owns no `treeProvider`** and is the EX8 chain's sole **consumer**. Step 6 amends the note in the same pass (per `feedback_cross_cutting_design_amendments`).

### CT-IMPL7 — `page.secondaryEditors` → `page.panelEditors` is behaviorally inert

`PageModel.secondaryEditors` is a compat shim returning `this.panelEditors` (`PageModel.ts:200–204`). Switching the scan source to `page.panelEditors` is the canonical N5 form and changes nothing at runtime, but removes one more reader of the to-be-retired shim (US-559).

### CT-IMPL8 — `folderViewModeService` untouched

The per-folder view-mode persistence (`FolderViewModeService.ts` → `folderViewMode.json`) is independent of the editor base class — the view calls `folderViewModeService.getViewMode/setViewMode(categoryPath)` directly. No change. (Its state lives in its own data file, not in the editor descriptor — correct; mirrors the HS1 "per-item state goes to a cache file" guidance.)

---

## Acceptance criteria

### Phase 1 — Static verification (read code)

1. `CategoryEditorModel` extends `V4EditorModel<CategoryEditorModelState>` from `editors/base/v4/EditorModel`.
2. `editorId = "category-view"` is declared.
3. State interface extends `EditorStateBase` (NOT `IEditorState`).
4. `_providerVersion`, `onSecondaryEditorsChanged()`, and the `providerVersion` getter are **deleted** (N5).
5. No `getRestoreData` / `applyRestoreData` / `restore` / `dispose` overrides on the model.
6. `getDefaultCategoryEditorModelState` returns explicit minimal fields (no legacy `getDefaultEditorModelState` spread).
7. `CategoryEditor.tsx` view subscribes to `page.state` via `useOptionalState(page?.state, (s) => s.version, 0)` and keys the host `useMemo` on that `pageVersion` (NOT `model.providerVersion`). The `host.selectionState` subscription also uses `useOptionalState` (no hand-rolled `useEffect`/`useState` for either nullable state).
8. The 50ms `setTimeout(() => model.onSecondaryEditorsChanged(), 50)` retry `useEffect` is gone.
9. The host scan source is `page.panelEditors` (NOT `page.secondaryEditors`).
10. `renderToolbar` renders `<PageToolbar model={model}>` directly; `pagesModel` + `EditorToolbar` imports are dropped.
11. The legacy `categoryEditorModule` factories return `... as unknown as EditorModel`; `Editor` is cast `as unknown as EditorModule["Editor"]`; `newEditorModelFromState` seeds state via the constructor spread.
12. `category/index.tsx` exists with `categoryModule` (v4) + re-exports + legacy default re-export.
13. `register-editors.ts` has a v4 `category-view` registration; the legacy registration is unchanged.
14. `"category-view"` is in `V4_NO_HOST_EDITOR_IDS`; the JSDoc "append" line for US-576 is removed.
15. `30-no-host-group.md` Category row is corrected (consumer, not owner).
16. `isTreeProviderHost` is unchanged (EX8 chain already complete).

### Phase 2 — Smoke tests (user runs a dev build)

1. **Open a folder via a category link:** in a Links (`.link.json`) editor or Explorer/Archive sidebar, click a category/folder → a Folder View page opens with the `CategoryView` rendered; items show with the correct tree structure.
2. **Provider resolves from a sibling:** confirm the Folder View finds its tree provider (the sidebar Link/Explorer/Archive panel) — items render rather than the "Please select a category in the Navigation Panel." placeholder.
3. **Selection sync:** click an item in the Folder View → the sibling host's selection highlights it; double-click → the file opens (navigates within the page).
4. **View mode persists:** switch list/grid view mode → reopen the same folder → the mode is restored (`folderViewMode.json`).
5. **Late-attaching sibling:** open a session where the sibling host restores slightly after the Category editor → the Folder View populates once the sibling attaches (N5 `page.state` subscription replaces the old 50ms retry). No empty-forever state.
6. **Survive app restart:** with a Folder View page open, close + relaunch → the page restores (the `tree-category://` link in `filePath` round-trips; the sibling host restores; the view re-scans).
7. **Toolbar:** the Folder View toolbar (search portal + view-mode controls) renders via `PageToolbar` — no regression vs. today.

### Phase 3 — Dashboard update

Mark US-576 with the verified-note pattern in `doc/active-work.md`. Stays `[ ]` per the epic-task deferred-review model — `/review` runs at EPIC-028 close.

---

## Files Changed

| File | Action | Why |
|------|--------|-----|
| `src/renderer/editors/category/CategoryEditorModel.ts` | Modify | Re-parent to v4 base; add `editorId`; delete N5 members (`_providerVersion` / `onSecondaryEditorsChanged` / `providerVersion`); explicit default state |
| `src/renderer/editors/category/CategoryEditor.tsx` | Modify | N5 view (page.state subscription, drop providerVersion + 50ms retry, scan `panelEditors`); retire `v4Main` toolbar lookup; legacy module shim casts + state-seed |
| `src/renderer/editors/category/index.tsx` | Create | v4 `categoryModule` + re-exports + legacy default re-export |
| `src/renderer/editors/register-editors.ts` | Modify | Add v4 `category-view` registration (legacy block unchanged) |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Modify | Add `"category-view"` to `V4_NO_HOST_EDITOR_IDS`; drop US-576 JSDoc line |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md` | Modify | Correct the Category closure-table row (consumer, not owner) — CT-IMPL6 |
| `doc/active-work.md` | Modify | Promote US-576 to the linked, described entry |
| `doc/tasks/US-576-category-editor-migration/README.md` | Create | This task document |

**Total:** 2 created, 6 modified, 0 deleted. **Zero deleted source files** (the model re-parents in place; the folder gains an `index.tsx`).

## Files NOT changing

- `src/renderer/editors/category/FolderViewModeService.ts` — view-mode persistence is base-class-independent (CT-IMPL8).
- `src/renderer/components/tree-provider/*` (`CategoryView`, `CategoryViewModel`, `TreeProviderView`) — the view renders these unchanged.
- `src/renderer/editors/category/CategoryEditor.tsx` `isTreeProviderHost` / `findTreeProviderHost` — EX8 chain already complete (US-570) — CT-IMPL5.
- `src/renderer/content/parsers.ts` / `resolvers.ts` / `open-handler.ts` — the `tree-category://` open flow is unchanged (target="category-view" still routes through the legacy registry's `newEditorModel`, which now returns a v4 instance).
- `src/renderer/api/pages/PagesLifecycleModel.ts` — Category has no dedicated lifecycle launcher (unlike Archive's `_openZipArchive` or the singleton `show*Page` methods); it flows through the generic `openFile` → `createEditorFromFile` → `newEditorModelByTarget` path, which already early-returns the v4 instance via `wrap()`. No change.
- `src/renderer/scripting/*` — Category has no facade; not script-addressable.
- `src/renderer/api/mcp-handler.ts` — no Category `create_page` hint (opened via links, not a standalone MCP page).
- `src/shared/types.ts` / `assets/editor-types/common.d.ts` — `"categoryPage"` / `"category-view"` already present.
- `src/renderer/editors/base/v4/EditorModel.ts` — base class unchanged.
- `src/main/*` — Category is renderer-only.
- `doc/tasks/completed.md` — task moves here only when EPIC-028 closes (deferred-review model).

---

## Cross-task notes

- **Walkthrough amendment** required for the walkthrough-30 closure table (Category row) per CT-IMPL6 — applied in this pass.
- **`doc/architecture/secondary-editors.md:406`** references `CategoryEditorModel.onSecondaryEditorsChanged()` (the deleted N5 hook). Stale after this task; the `/document` pass at EPIC-028 close updates it.
- **`/review` / `/document` / `/userdoc` deferred** to EPIC-028 close per the epic-task workflow. `[ ]` stays unchecked even after implementation + smoke testing.
- **US-576 closes the walkthrough-30 no-host group** — Browser (558), PDF (568), Image (569), Archive (570), Video (571), Settings (572), About (573), MCP (574), Storybook (575), **Category (576)**. After this, the remaining EPIC-028 work is Phase D cleanup (US-559: strangler-fig retirement).
