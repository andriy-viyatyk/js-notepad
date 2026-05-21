# US-552-B — Host-managed editor view state (cross-switch persistence)

**Epic:** [EPIC-028: Unified Editor Architecture](../../epics/EPIC-028.md)
**Related:** [US-552: Grid editor migration](../US-552-grid-editor-migration/README.md), walkthrough 21 / GR4 + GR6, walkthrough 22 / PV2 + PV6, walkthrough 23 / LV3, walkthrough 24 / LK3, walkthrough 25 / TD3, walkthrough 26 / RC3, walkthrough 29 / NB3
**Phase:** B-style cross-cutting (discovered during US-552 implementation)
**Status:** Ready for implementation (deep investigation pass complete 2026-05-21).

## Goal

Add a generic editor-view-state slot to `IContentHost` so that view-config state (Grid columns / Link sort / Todo filters / RestClient selection / Notebook expanded panel / Markdown compact mode / Mermaid lightMode) survives the in-session editor swap that today's per-editor descriptor model drops on the floor. Retrofit `GridEditor` as the first consumer; amend the EPIC-028 walkthroughs and mockups so the same template is the canonical answer for every text-bearing editor that migrates after Grid (US-553 LogView, US-554 Preview group, US-555 Link, US-556 Todo + RestClient, US-557 Notebook).

## Background

### The problem walkthrough 21 / GR4 missed

Text-bearing editors carry per-host view state on top of the host's content — Grid has column widths / order / sort / filters, Link has sort + selected category, Todo has selected list + filter chips, RestClient has selected request id, Notebook has expanded panel + selected category, Markdown has compact mode, Mermaid has lightMode override. In legacy these settings lived in editor-specific host-keyed cache files (e.g., `<host.id>-grid-page.json`, `<host.id>-link-editor.txt`), so the view state survived across in-session editor swaps. Workflow: user configures Grid columns → toggles to Monaco to verify raw JSON → toggles back to Grid → keeps working with the same columns.

Walkthrough 21 / GR4 collapsed Grid's cache file into `EditorDescriptor.state` ("fold into descriptor — eliminate per-editor cache file"). The trade-off was missed in the resolution: the descriptor lives on the **editor instance**, not the host. When the user switches Grid → Monaco, the Grid editor is disposed by `PageModel.setMainEditor`; switching back creates a fresh `GridEditor` with `defaultGridEditorState`. **Columns, filters, sort, CSV options all reset on every in-session switch.** GR6 confirmed the reset by mistake — it claimed "matches today's observable behavior" because GR6 reasoned about post-EPIC-028 instances in isolation and missed that today's cache file gives the cross-switch survival the user actually relies on.

The same gap will appear in every Tier-5 editor with view state on top of host content: LogView's per-entry items state (LV3), Markdown's compactMode (PV2), Mermaid's lightMode (PV6), Link's leftPanelWidth + selectedCategory/Tag/Hostname (LK3), Todo's leftPanelWidth + selectedList/Tag (TD3), RestClient's leftPanelWidth + selectedRequestId (RC3), Notebook's leftPanelWidth + expandedPanel + selectedCategory/Tag (NB3). The "fold into descriptor" resolution that GR4 picked has been mechanically copied across LV3/PV2/PV6/LK3/TD3/RC3/NB3; without correction, every editor migration after Grid will inherit the same cross-switch regression.

### Why host-state, not a new cache file

Three options were considered:

| | (a) Per-editor cache file (legacy) | (b) Editor descriptor.state (US-552 / GR4 / etc.) | (c) Host editorSettings slot (this proposal) |
|---|---|---|---|
| Survives editor switches | ✅ | ❌ | ✅ |
| Survives app restarts | ✅ | ✅ | ✅ |
| Sync read on adoption (no flicker) | ❌ async load | ✅ sync (applyRestoreData) | ✅ sync (host.getEditorState) |
| Extra disk I/O cadence | yes — one cache file per editor | no | no — rides host descriptor |
| New cache files on disk | yes | no | no |
| Touches `TextFileModel` shape | no | no | yes (one generic field) |
| Keyed per-host automatically | yes (id in filename) | yes (descriptor's identity) | yes (descriptor's identity) |
| Cross-window transfer atomic | yes via M5 cache-file continuity | yes via M5 descriptor | yes via M5 descriptor |

(c) wins on the sync read + no-disk-bloat + cross-switch axes simultaneously. The cost is adding one generic field to `TextFileModel.state`. Worth it: one cross-cutting field replaces five+ per-editor cache files across the Tier 5 editors.

### What the contract looks like

```ts
interface IContentHost {
    // ... existing methods ...

    /** Read this editor's view-state slot. Undefined when the host hasn't
     *  seen that editor before (fresh open, first activation). */
    getEditorState<T>(editorId: string): T | undefined;

    /** Persist this editor's view-state slot. Stored on the host's persistent
     *  state — survives editor switches AND app restarts via the host
     *  descriptor in `openFiles.txt`. Per-editor-id keyed; each editor
     *  declares its own settings shape and reads / writes its own slot. */
    setEditorState<T>(editorId: string, value: T): void;
}
```

`TextFileModel` is the only implementer that persists for this task. `NoteItemEditModel` (the second `IContentHost` implementer added in US-557) inherits the interface but defaults the methods to no-op for US-552-B; its real implementation backed by `notebook.data.state[noteId].editorSettings` lands inside walkthrough 29 / US-557 (decided per NB8's per-note state pattern).

### Cross-format Grid sharing

The slot key is `editorId` (e.g., `"grid-json"` / `"grid-csv"` / `"grid-jsonl"`) — three distinct slots for the three Grid registrations. Sharing across the variants doesn't make sense (csvDelimiter is meaningless for grid-json; columns generated from CSV headers don't apply to JSON arrays). Switching between Grid variants on the same host is exotic — if it ever happens the variants get independent slots, the user reconfigures each independently. Same key shape for any future "same editor, different format" sibling group.

## Implementation plan

### Step 1 — Contract on `IContentHost`

File: `src/renderer/editors/base/v4/IContentHost.ts`.

Add two methods to the `IContentHost` interface:

```ts
export interface IContentHost {
    // ... existing fields (id, state, changeContent, changeLanguage,
    //                     setStorage, dispose, getDescriptor, handleKeyDown) ...

    /** Read this editor's view-state slot. Undefined when the host hasn't
     *  seen that editor before. Sync — backed by host state, no I/O. */
    getEditorState<T>(editorId: string): T | undefined;

    /** Persist this editor's view-state slot. Sync. Rides the host
     *  descriptor in `openFiles.txt`, survives editor switches AND app
     *  restarts. */
    setEditorState<T>(editorId: string, value: T): void;
}
```

### Step 2 — Implement on `TextFileModel`

File: `src/renderer/editors/text/TextEditorModel.ts`.

Extend the state shape:

```ts
export interface TextFileEditorModelState extends IEditorState {
    // ... existing fields ...
    /** Generic per-editor view-state map. Editor-keyed; opaque values
     *  owned by each editor's settings interface. */
    editorSettings?: Record<string, unknown>;
}
```

Implement the two methods on the class:

```ts
getEditorState<T>(editorId: string): T | undefined {
    return this.state.get().editorSettings?.[editorId] as T | undefined;
}

setEditorState<T>(editorId: string, value: T): void {
    this.state.update((s) => {
        s.editorSettings = { ...(s.editorSettings ?? {}), [editorId]: value };
    });
}
```

Include `editorSettings` in the descriptor serialization (`TextFileModel.getDescriptor()` — the `metadata` Record at the top of the method gets one more conditional line):

```ts
if (s.editorSettings !== undefined) metadata.editorSettings = s.editorSettings;
```

Include `editorSettings` in the descriptor restoration (`TextFileModel.applyRestoreData` — one more line inside the `state.update` block):

```ts
if (data.editorSettings !== undefined) s.editorSettings = data.editorSettings;
```

The default value is undefined; freshly-opened files have no `editorSettings` field on their state.

### Step 3 — Retrofit `GridEditor` as the first consumer (mandatory within this task)

File: `src/renderer/editors/grid/GridEditor.ts`.

#### 3a. Declare the settings shape

```ts
interface GridViewSettings {
    columns: Column[];
    filters: TFilter[];
    search: string;
    sortColumn: TSortColumn | undefined;
    csvDelimiter: string;
    csvWithColumns: boolean;
    focus: CellFocus | undefined;
}
```

(Settings interfaces stay file-private — each editor's slot value shape is its own concern.)

#### 3b. Add the subscription field

```ts
private _settingsUnsub: (() => void) | null = null;
private _pendingLegacySettings: GridViewSettings | null = null;
```

#### 3c. Seed + mirror in `adoptHost`

After the existing four `_hostStateUnsub` / `_hostContentUnsub` / `_hostEncryptionUnsub` / `_csvOptionsUnsub` subscriptions, add a fifth-place seed + mirror block. Read `host.getEditorState`, write each present field to editor state, then subscribe editor state and mirror back.

```ts
private adoptHost(host: TextFileModel): void {
    // ... existing tear-down + subscriptions ...

    // First, promote legacy-shape fields from descriptor (one-shot migration
    // for pre-US-552-B sessions that still carry Grid settings on the
    // editor's own descriptor). Pre-empts the host slot read below.
    if (this._pendingLegacySettings && !host.getEditorState(this.editorId)) {
        host.setEditorState<GridViewSettings>(
            this.editorId,
            this._pendingLegacySettings,
        );
    }
    this._pendingLegacySettings = null;

    // Seed editor state from host slot (no flicker — sync read).
    const saved = host.getEditorState<GridViewSettings>(this.editorId);
    if (saved) {
        this.state.update((s) => {
            if (saved.columns !== undefined) s.columns = saved.columns;
            if (saved.filters !== undefined) s.filters = saved.filters;
            if (saved.search !== undefined) s.search = saved.search;
            if (saved.sortColumn !== undefined) s.sortColumn = saved.sortColumn;
            if (saved.csvDelimiter !== undefined) s.csvDelimiter = saved.csvDelimiter;
            if (saved.csvWithColumns !== undefined) s.csvWithColumns = saved.csvWithColumns;
            if (saved.focus !== undefined) s.focus = saved.focus;
        });
    }

    // Mirror editor state changes back to the host slot. Full-state
    // subscription is fine — each emission writes one small object into
    // host.state.editorSettings; downstream descriptorChanged debounces.
    this._settingsUnsub = this.state.subscribe(() => {
        const s = this.state.get();
        host.setEditorState<GridViewSettings>(this.editorId, {
            columns: s.columns,
            filters: s.filters,
            search: s.search,
            sortColumn: s.sortColumn,
            csvDelimiter: s.csvDelimiter,
            csvWithColumns: s.csvWithColumns,
            focus: s.focus,
        });
    });

    // ... existing title / id propagation ...
}
```

#### 3d. Stash legacy fields in `applyRestoreData`

For sessions opened before US-552-B lands, GridEditor's descriptor still carries `columns` / `filters` / etc. directly on `EditorDescriptor.state`. Detect them and stash for one-shot promotion in `adoptHost`:

```ts
applyRestoreData(data: RestoreData<GridEditorState>): void {
    this.state.update((cur) => {
        if (data.title !== undefined) cur.title = data.title;
        if (data.modified !== undefined) cur.modified = data.modified;
        if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        // NOTE: columns / focus / search / filters / sortColumn / csvDelimiter
        // / csvWithColumns NO LONGER applied to editor.state here — they come
        // from host.getEditorState in adoptHost(). Legacy descriptors that
        // still carry them are picked up below.
    });

    // One-shot migration for pre-US-552-B sessions: collect legacy descriptor
    // fields and stash for adoptHost to promote into host slot.
    const hasLegacy =
        data.columns !== undefined ||
        data.filters !== undefined ||
        data.search !== undefined ||
        data.sortColumn !== undefined ||
        data.csvDelimiter !== undefined ||
        data.csvWithColumns !== undefined ||
        data.focus !== undefined;
    if (hasLegacy) {
        this._pendingLegacySettings = {
            columns: data.columns ?? [],
            filters: data.filters ?? [],
            search: data.search ?? "",
            sortColumn: data.sortColumn,
            csvDelimiter: data.csvDelimiter ?? ",",
            csvWithColumns: data.csvWithColumns ?? false,
            focus: data.focus,
        };
    }

    if (data.host) this._pendingHost = data.host;
}
```

#### 3e. Drop view-config from `getRestoreData`

GridEditor's descriptor collapses to identity-only (`title` / `modified` / `secondaryEditor`); the view-config rides `host.editorSettings[this.editorId]` via the host descriptor.

```ts
getRestoreData(): EditorDescriptor {
    const s = this.state.get();
    return {
        editorId: this.editorId,
        id: s.id,
        state: {
            title: s.title,
            modified: s.modified,
            secondaryEditor: s.secondaryEditor,
            // columns / focus / search / filters / sortColumn /
            // csvDelimiter / csvWithColumns — REMOVED. Owned by
            // host.editorSettings[this.editorId] via host descriptor.
            // rows + error — stripped (view-derived, MO5 pattern).
        } as Record<string, unknown>,
        host: this._host?.getDescriptor(),
    };
}
```

#### 3f. Tear down in `extractContentHost` (trait closure)

In the constructor's `CONTENT_HOST_TRAIT` closure, add `_settingsUnsub` to the unsubscribe block:

```ts
const trait: IContentHostTrait = {
    extractContentHost: (): IContentHost => {
        const host = this._host;
        if (!host) throw new Error("Host already extracted from GridEditor");
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._hostEncryptionUnsub?.();
        this._csvOptionsUnsub?.();
        this._settingsUnsub?.();   // NEW
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._hostEncryptionUnsub = null;
        this._csvOptionsUnsub = null;
        this._settingsUnsub = null;  // NEW
        this._host = null;
        return host as unknown as IContentHost;
    },
};
```

#### 3g. Tear down in `dispose`

```ts
async dispose(): Promise<void> {
    this._hostStateUnsub?.();
    this._hostContentUnsub?.();
    this._hostEncryptionUnsub?.();
    this._csvOptionsUnsub?.();
    this._settingsUnsub?.();   // NEW
    this._hostStateUnsub = null;
    this._hostContentUnsub = null;
    this._hostEncryptionUnsub = null;
    this._csvOptionsUnsub = null;
    this._settingsUnsub = null;  // NEW
    if (this._host) {
        await this._host.dispose();
        this._host = null;
    }
    await super.dispose();
}
```

#### 3h. `defaultGridEditorState` stays unchanged

The defaults already match what an unsaved Grid would look like; the seed-from-host path overwrites only when a saved slot exists.

### Step 4 — Mockup updates

#### 4a. `doc/epics/EPIC-028-editor-architecture/mockups/IContentHost.ts`

Add the two methods to the `IContentHost` interface block. Add a corresponding section in the trailing comments explaining the editor-keyed slot model and the cross-switch survival guarantee.

#### 4b. `doc/epics/EPIC-028-editor-architecture/mockups/TextFileModel.ts`

Add `editorSettings?: Record<string, unknown>` to `TextFileHostState`. Add the `getEditorState` / `setEditorState` method implementations to the class body. Update the `getRestoreData` / `applyRestoreData` blocks to round-trip the new field. Update the "What's gone" / "What stays" comment block to include `editorSettings`.

### Step 5 — Walkthrough amendments

The amendments are addenda inside each affected concern's resolution column, not full rewrites. Each one points to the new HS1 concern (Step 6).

#### 5a. Walkthrough 21 / GR4 — Grid state persistence

Original resolution: "fold into `EditorDescriptor.state`". Amended addendum: superseded 2026-05-21 by HS1 — Grid state folds into `host.editorSettings[this.editorId]`, not the editor descriptor.

#### 5b. Walkthrough 21 / GR6 — Search / filter state survival

Original resolution: "switchFrom only carries the host between editors — each editor's own state slice is independent by construction." Amended addendum: superseded 2026-05-21 by HS1 — view-config DOES survive switchFrom by riding the host slot. The original GR6 wording also mis-stated "today's observable behavior" — today the per-editor `<host.id>-grid-page.json` cache file IS the cross-switch survival mechanism, and the user explicitly noticed the regression.

#### 5c. Walkthrough 22 / PV2 — Markdown editor state

Original resolution: "persist `compactMode` only on `EditorDescriptor.state`." Amended addendum: persisted slice rides `host.editorSettings["md-view"]`, not the editor descriptor.

#### 5d. Walkthrough 22 / PV6 — Mermaid lightMode persistence

Original resolution: "PERSIST per-editor on `MermaidEditorState`." Amended addendum: persisted slice rides `host.editorSettings["mermaid-view"]`, not the editor descriptor. Same first-construct default behavior (`isCurrentThemeDark()`).

#### 5e. Walkthrough 23 / LV3 — LogView itemsState location

Original resolution: "fold into `EditorDescriptor.state.itemsState`." Amended addendum: folds into `host.editorSettings["log-view"]`. LogView's pages (well-known mcp-ui-log) rarely switch in practice, but the canonical pattern applies for uniformity with the other Tier 5 editors.

#### 5f. Walkthrough 24 / LK3 — Link selection-state cache

Original resolution: "fold into `EditorDescriptor.state`." Amended addendum: folds into `host.editorSettings["link-view"]`. `leftPanelWidth` + `expandedPanel` + `selectedCategory/Tag/Hostname` ride the host slot.

#### 5g. Walkthrough 25 / TD3 — Todo selection-state cache

Original resolution: "fold into `EditorDescriptor.state`." Amended addendum: folds into `host.editorSettings["todo-view"]`. `leftPanelWidth` + `selectedList` + `selectedTag` ride the host slot.

#### 5h. Walkthrough 26 / RC3 — RestClient selection-state cache

Original resolution: "fold into `EditorDescriptor.state`." Amended addendum: folds into `host.editorSettings["rest-client"]`. `leftPanelWidth` + `selectedRequestId` ride the host slot.

#### 5i. Walkthrough 29 / NB3 — Notebook descriptor consolidation

Original resolution: "fold UI selection state into `EditorDescriptor.state`." Amended addendum: folds into `host.editorSettings["note-view"]` (or the final Notebook editor id). `leftPanelWidth` + `expandedPanel` + `selectedCategory/Tag` ride the host slot. NoteItemEditModel's IContentHost implementation gains its own backing per US-557 / NB8 (`notebook.data.state[noteId].editorSettings`).

#### 5j. Walkthrough 27 / RestClient response cache (RC7) stays as-is

RC7 keeps the dedicated response-cache file (`<host.id>:rest-client-responses`) because response payloads can be MB-scale and would blow M9's 50KB-per-page budget. The new host slot is for small UI/view-config state, not bulk payload. RC7's "split cache-file consolidation by scale" pattern survives HS1.

### Step 6 — Concerns log entries

File: `doc/epics/EPIC-028-editor-architecture/concerns.md`.

Add a new HS series (Host State) below the GR series:

| # | Date raised | Concern | Source / context | Status | Resolution |
|---|-------------|---------|------------------|--------|------------|
| HS1 | 2026-05-21 | Editor view-state survival across in-session editor switches — discovered during US-552 implementation. Walkthrough 21 / GR4 (and the GR4-derived resolutions LV3/LK3/TD3/RC3/NB3/PV2/PV6) fold Tier 5 view-config into `EditorDescriptor.state`, which dies with the editor instance on switch-out. Per-editor cache file (today's pattern) survives via M5 continuity but adds disk I/O cadence; descriptor.state survives restart but not switch. Need a third option. | US-552 implementation; user noticed Grid columns reset on Monaco↔Grid switch. | **Resolved 2026-05-21** | Option (b). Add `getEditorState<T>(editorId)` / `setEditorState<T>(editorId, value)` to `IContentHost`; back on `TextFileModel.state.editorSettings: Record<string, unknown>`. Each editor declares its own settings interface, seeds editor state from host slot in `adoptHost` (sync, no flicker), mirrors editor state back to the slot via a `state.subscribe` mirror. Host slot rides host descriptor → `openFiles.txt` (cross-restart survival) AND outlives the editor (cross-switch survival). Supersedes GR4 + GR6 + PV2 + PV6 + LV3 + LK3 + TD3 + RC3 + NB3 — see Step 5 amendments. Bulk payload state (RC7 response cache, future per-editor MB-scale data) keeps its dedicated cache file — host slot is for ≤ 5KB-per-editor view-config only. NoteItemEditModel inherits the contract with no-op defaults; real implementation lands in US-557 / NB6 + NB8 backed by `notebook.data.state[noteId].editorSettings`. |

### Step 7 — Acceptance verification on Grid (the in-task consumer)

Implementation considered complete when **all** of the following pass:

1. Open a `.csv` file; reorder columns; resize a column; toggle a filter; pick a sort. Switch to Monaco; switch back. **Column order, widths, filter, sort all restored** (the regression user noticed during US-552 implementation).
2. Same as #1 but restart Persephone between Monaco switch and Grid switch — settings still survive.
3. Open two `.csv` files in separate tabs. Configure columns differently in each. Switch each back and forth. **Settings stay separate per host.**
4. Open a `.csv`, configure columns, close the page. Reopen the same file via Explorer. **Settings restored from the host descriptor on open-file flow.**
5. **Pre-US-552-B legacy session migration**: take a session save from before this task lands (Grid configured, descriptor carries `columns` / `filters` / etc. directly). Open Persephone — settings restore via the one-shot legacy-promotion path in `applyRestoreData` → `_pendingLegacySettings` → `adoptHost`. After first save, the next session-restore reads from the host slot directly (legacy fields no longer in the descriptor).
6. Open a `.json` file as `grid-json`; configure columns. Switch to Monaco. Switch to `grid-csv` (manual switch widget pick — exotic but legal). **`grid-csv` shows defaults** (different slot key); switch back to `grid-json` shows the original config.
7. Per-editor: same matrix once Link / Todo / RestClient / Notebook migrate and adopt the template (out of scope here — verified inside US-555 / US-556 / US-557).

## Files changed

### Real code

| File | Change |
|------|--------|
| `src/renderer/editors/base/v4/IContentHost.ts` | Add `getEditorState<T>(editorId)` / `setEditorState<T>(editorId, value)` to the interface; doc comment for each. |
| `src/renderer/editors/text/TextEditorModel.ts` | Add `editorSettings?: Record<string, unknown>` to `TextFileEditorModelState`; implement the two methods; round-trip via `getDescriptor` + `applyRestoreData`. |
| `src/renderer/editors/grid/GridEditor.ts` | Declare `GridViewSettings`; add `_settingsUnsub` + `_pendingLegacySettings` fields; seed + mirror in `adoptHost`; drop view-config from `getRestoreData`; stash legacy fields in `applyRestoreData`; tear down subscription in `extractContentHost` trait + `dispose`. |

### Documentation (design phase)

| File | Change |
|------|--------|
| `doc/epics/EPIC-028-editor-architecture/mockups/IContentHost.ts` | Add `getEditorState` / `setEditorState` methods + doc-comment block explaining the editor-keyed slot model. |
| `doc/epics/EPIC-028-editor-architecture/mockups/TextFileModel.ts` | Add `editorSettings?` to `TextFileHostState`; method implementations; round-trip in `getRestoreData`/`applyRestoreData`. |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/21-grid.md` | Amend GR4 + GR6 resolution rows with "superseded 2026-05-21 by HS1" addendum. |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md` | Amend PV2 + PV6 resolution rows with HS1 addendum. |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/23-log-view.md` | Amend LV3 resolution row with HS1 addendum. |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/24-link.md` | Amend LK3 resolution row with HS1 addendum. |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/25-todo.md` | Amend TD3 resolution row with HS1 addendum. |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/26-rest-client.md` | Amend RC3 resolution row with HS1 addendum. RC7 (response cache) stays untouched. |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/29-notebook.md` | Amend NB3 resolution row with HS1 addendum. Note NoteItemEditModel implementation deferred to US-557 per NB6 / NB8. |
| `doc/epics/EPIC-028-editor-architecture/concerns.md` | Add HS1 row capturing the issue + design + resolution; cross-link from GR4/GR6/PV2/PV6/LV3/LK3/TD3/RC3/NB3 resolution columns. |

### Files that need NO changes

- `src/renderer/api/pages/PagesPersistenceModel.ts` — descriptor save/restore is opaque to the host's state shape; `editorSettings` rides under `desc.host.state` automatically.
- `src/renderer/api/pages/PagesLifecycleModel.ts` — `wrapLegacyForPage` builds the v4 editor over a legacy `TextFileModel`; the new methods are no-op-safe (editorSettings undefined returns undefined; setEditorState writes to the host state).
- `src/renderer/editors/base/v4/EditorModel.ts` — no base-class change; the contract is on `IContentHost`, not on the editor.
- `src/renderer/editors/grid/GridBody.tsx` — view reads editor state slices via `state.use` as today; no host-slot awareness.
- `src/renderer/editors/grid/index.tsx` — view composition unchanged.
- `src/renderer/scripting/api-wrapper/GridEditorFacade.ts` — facade reads editor state directly; sync access pattern preserved.
- All other Tier 5 editor source files — their migrations land in their own tasks (US-553 LogView, US-554 Preview group, US-555 Link, US-556 Todo + RestClient, US-557 Notebook); each follows the GridEditor template established here.

## Concerns

### HS1 — Resolved 2026-05-21

Documented in Step 6's concerns log entry. Carried forward into the walkthrough amendments (Step 5).

### NoteItemEditModel out-of-scope clarification

`NoteItemEditModel` (US-557 / NB6) is the second `IContentHost` implementer. For US-552-B it inherits the new methods with no-op defaults (returns `undefined` from `getEditorState`; ignores `setEditorState` writes). The real implementation backed by `notebook.data.state[noteId].editorSettings` lands inside US-557 per NB8 — same template, different storage backing. The IContentHost interface contract is the cross-cutting piece; per-implementer backing decisions are per-host concerns.

### Persistence-size budget validation

Host slot rides `openFiles.txt` via the host descriptor. M9 budget is ~50KB-per-page worst case. Per-editor slot worst case:

- Grid: columns array (5-30 entries × ~5 fields × ~20 bytes) ≈ 3KB; filters / focus / sort ≈ <1KB. Total ~4KB worst.
- Markdown / Mermaid: 1 boolean each, <100 bytes.
- LogView: itemsState — per-entry slot for embedded grid columns; ≤ 1KB typical, ~50KB worst plausible (50 entries × 1KB each). LV3's prior analysis applies; within budget.
- Link / Todo / RestClient / Notebook: leftPanelWidth (number) + selection strings (~50 bytes), <500 bytes each.

Total across all editors that have touched the host: bounded by editor count. Even if all 9 Tier-5 editors have a slot (impossible in practice — a single file would never go through all 9), worst case ~10KB. Well inside M9's 50KB budget.

### Subscription firing-rate (`state.subscribe` on full state)

GridEditor's mirror subscription fires on every editor.state mutation, including row reparse and CSV-options changes that aren't part of `GridViewSettings`. Each fire writes one small object into `host.state.editorSettings`. The downstream `_hostStateUnsub` then fires `descriptorChanged`, which the window-level persistence debounces at 500ms (P3). Net cost: one shallow object allocation per state mutation, batched into 500ms debounce windows for the actual disk write. Acceptable; no need for slice subscriptions.

If profiling shows hot-path waste during scripting-heavy Grid mutations, switch to `state.subscribe(handler, selector)` with the seven-field slice — but defer until evidence appears.

### Backwards compatibility — pre-US-552-B sessions

Step 3d's `_pendingLegacySettings` migration covers existing sessions that still carry Grid view-config on the editor descriptor. After first save post-US-552-B, the next session restore reads from the host slot directly (the descriptor no longer carries the legacy fields). One-shot, mercy migration — no schema versioning bump.

Future editors (US-553 → US-557) following the template inherit the same legacy-stash pattern in their own `applyRestoreData` overrides. The pattern: if `data.<viewConfigField>` is present at restore time, collect into `_pendingLegacySettings` and promote during `adoptHost`.

### `editorSettings` schema evolution per editor

The interface stores `Record<string, unknown>`. Each editor reads its slot with its own settings shape and is responsible for validating on read (defaults applied per-field with `=== undefined` guards, as Step 3c shows). If an editor changes its settings shape between versions, the editor's seed-from-host code in `adoptHost` falls back to defaults for missing/changed fields — no schema-version field needed on the slot itself.

### Switch-in via `switchFrom` flow

`switchFrom` adopts the host extracted via `CONTENT_HOST_TRAIT.extractContentHost()`. The host already has its `editorSettings` map populated from the previous editor's mirror subscription. The new editor's `adoptHost` reads its own slot (different `editorId` for different editor) — empty if first switch into that editor type, populated if the same editor type was active earlier in the session.

The previous editor's `extractContentHost` tears down its own `_settingsUnsub` — the host slot stays put (host outlives the editor); the new editor's `adoptHost` seeds + subscribes its own slot independently.

## Acceptance criteria

Final pass when all of:

- **Step 1** — `IContentHost.ts` carries `getEditorState` / `setEditorState`; doc-comment present.
- **Step 2** — `TextEditorModel.ts` carries `editorSettings?`; methods implemented; descriptor round-trips.
- **Step 3** — `GridEditor.ts` carries `_settingsUnsub` + `_pendingLegacySettings`; seed + mirror in `adoptHost`; legacy-stash in `applyRestoreData`; view-config removed from `getRestoreData`; tear-down in `extractContentHost` + `dispose`.
- **Step 4** — Mockups updated with the new contract.
- **Step 5** — All eight walkthrough resolution columns (GR4 / GR6 / PV2 / PV6 / LV3 / LK3 / TD3 / RC3 / NB3) carry HS1 superseded-by addendum.
- **Step 6** — `concerns.md` has HS1 row.
- **Step 7** — All seven verification scenarios pass.

Standard task-completion checklist:

- `npm run lint` — clean (no new warnings).
- Manual: scenarios 1-6 above.
- Sample legacy session test (scenario 5) — open a session.json from before this task; verify columns restore via one-shot promotion.

## Status

**Investigation complete 2026-05-21.** Implementation ready when user requests. Per CLAUDE.md task workflow, agent waits for "let's implement" before changing any code.

Per CLAUDE.md epic deferred-review model: review / document / userdoc passes run at EPIC-028 close, not after this single task. Mark `[ ]` in `doc/active-work.md` until then.
