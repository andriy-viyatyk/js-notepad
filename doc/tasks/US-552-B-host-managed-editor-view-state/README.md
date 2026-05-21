# US-552-B — Host-managed editor view state (cross-switch persistence)

**Epic:** [EPIC-028: Unified Editor Architecture](../../epics/EPIC-028.md)
**Related:** [US-552: Grid editor migration](../US-552-grid-editor-migration/README.md), walkthrough 21 / GR4
**Phase:** B-style cross-cutting (discovered during US-552 implementation)
**Status:** Pending detailed investigation. Document carries problem + proposed approach only — full implementation plan, mockup updates, and concerns resolution come from the deep-investigation pass.

## Problem

Text-bearing editors carry per-host view state on top of the host's content — Grid has column widths / order / sort / filters, Link has sort order, Todo has filter chips, RestClient has request history, Notebook has note-level selection, etc. In legacy these settings lived in editor-specific host-keyed cache files (e.g., `<host.id>-grid-page.json`), so the view state survived across in-session editor swaps (e.g., user toggles Monaco ↔ Grid while configuring data, columns stay put).

Walkthrough 21 / GR4 collapsed Grid's cache file into `EditorDescriptor.state` ("fold into descriptor — eliminate per-editor cache file"). The trade-off was missed in the resolution: the descriptor lives on the **editor instance**, not the host. When the user switches Grid → Monaco, the Grid editor is disposed by `PageModel.setMainEditor` (it doesn't contribute panels); switching back creates a fresh `GridEditor` with `defaultGridEditorState`. **Columns, filters, sort, CSV options all reset on every in-session switch.**

This regressed legacy UX. The user explicitly flagged it as confusing — common workflow is "configure grid columns → flip to raw JSON to verify content → flip back to Grid → continue editing." Today flipping back wipes the configuration.

The same gap will appear in every Tier-5 editor with view state on top of host content: Link (US-555), Todo + RestClient (US-556), Notebook (US-557). A one-off Grid-specific fix would force each migration to invent its own cross-switch persistence.

## Proposed approach

Add a generic editor-view-state slot to `IContentHost`, backed by a `Record<editorId, unknown>` map on the host's persistent state. Each editor reads/writes its own slot synchronously; the map rides the host's descriptor so it survives editor switches (host outlives the editor) and app restarts (descriptor → `openFiles.txt`).

### `IContentHost` contract

```ts
interface IContentHost {
    // ... existing methods ...
    /** Read this editor's view-state slot. Undefined when the host hasn't
     *  seen that editor before (fresh open, first activation). */
    getEditorState<T>(editorId: string): T | undefined;
    /** Persist this editor's view-state slot. Stored on the host's persistent
     *  state — survives editor switches AND app restarts via the host
     *  descriptor in `openFiles.txt`. */
    setEditorState<T>(editorId: string, value: T): void;
}
```

### `TextFileModel` implementation

```ts
interface TextFileEditorModelState extends IEditorState {
    // ... existing fields ...
    editorSettings?: Record<string, unknown>;
}

class TextFileModel /* ... */ implements IContentHost {
    getEditorState<T>(editorId: string): T | undefined {
        return this.state.get().editorSettings?.[editorId] as T | undefined;
    }
    setEditorState<T>(editorId: string, value: T): void {
        this.state.update((s) => {
            s.editorSettings = { ...(s.editorSettings ?? {}), [editorId]: value };
        });
    }
}
```

### Per-editor wiring (template for every text-bearing migration)

```ts
// Each editor declares its own settings shape.
interface GridViewSettings {
    columns: Column[];
    filters: TFilter[];
    search: string;
    sortColumn: TSortColumn | undefined;
    csvDelimiter: string;
    csvWithColumns: boolean;
    focus: CellFocus | undefined;
}

// In adoptHost():
//   1. Seed editor state from host's saved settings (sync, no flicker).
//   2. Subscribe to editor state changes; mirror into host's slot.
private _settingsUnsub: (() => void) | null = null;

adoptHost(host: TextFileModel): void {
    // ... existing subscriptions ...

    const saved = host.getEditorState<GridViewSettings>(this.editorId);
    if (saved) {
        this.state.update((s) => {
            if (saved.columns) s.columns = saved.columns;
            // … apply each persisted field …
        });
    }

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
}

// In extractContentHost() / dispose() — release the subscription.
```

Future per-editor migrations (US-555 Link, US-556 Todo + RestClient, US-557 Notebook) follow the same template: declare a settings interface, add the two-step seed+subscribe block in `adoptHost`.

### Why this over the alternatives

| | Host-keyed cache file (legacy) | Host's persisted state (this proposal) |
|---|---|---|
| Survives editor switches | ✅ | ✅ |
| Survives app restarts | ✅ | ✅ |
| Sync read on adoption (no flicker) | ❌ async load | ✅ sync |
| Extra disk I/O cadence | yes — one cache file per editor | no — rides host descriptor |
| New cache files on disk | yes | no |
| Touches `TextFileModel` shape | no | yes (one generic field) |
| Keyed per-host automatically | yes (id in filename) | yes (id is the descriptor's identity) |

The host-state approach is synchronous, has a single I/O path, and avoids the legacy "Grid mounts blank → cache loads → settings populate" race. The trade-off is adding one generic field to `TextFileModel.state`. Worth it for the simpler runtime.

### Implementation steps (high-level — finalize during deep investigation)

1. **Add the contract on `IContentHost`** — extend `src/renderer/editors/base/v4/IContentHost.ts` with `getEditorState<T>(editorId)` and `setEditorState<T>(editorId, value)`.
2. **Implement on `TextFileModel`** — `src/renderer/editors/text/TextEditorModel.ts`: add `editorSettings?: Record<string, unknown>` to `TextFileEditorModelState`; implement the two methods backed by `state.update`.
3. **Retrofit `GridEditor` as the first consumer** (mandatory within this task — without it, the current cross-switch regression stays unfixed):
   - Declare `interface GridViewSettings` covering `columns`, `filters`, `search`, `sortColumn`, `csvDelimiter`, `csvWithColumns`, `focus`.
   - In `adoptHost(host)`: read `host.getEditorState<GridViewSettings>(this.editorId)`; if present, apply each field to `this.state`.
   - Add a `_settingsUnsub` subscription on `this.state` that writes the projection back via `host.setEditorState`.
   - Tear down `_settingsUnsub` in `extractContentHost` (when the host migrates to a new editor) and in `dispose` (when the editor closes for good).
   - Drop the same fields from `GridEditor.getRestoreData()` — the editor descriptor's `state` slot collapses to identity-only (`title`, `modified`, `secondaryEditor`). The previously-persisted descriptor fields are still readable on first launch post-US-552-B; either ignore them or one-shot promote them into the host slot during `applyRestoreData`.
4. **Update EPIC-028 mockups** — `mockups/IContentHost.ts` and `mockups/TextFileModel.ts` reflect the new contract so the design phase stays canonical for downstream task planning.
5. **Amend walkthrough 21 / GR4** — `EPIC-028-editor-architecture/walkthroughs/21-grid.md` and `concerns.md`: add a third option to GR4 ("fold into HOST's persisted state, not the editor's descriptor") and mark it as the chosen resolution superseding option (a).
6. **Acceptance verification on Grid** — the criteria below run against the retrofitted Grid before this task closes.

| File | Change |
|------|--------|
| `src/renderer/editors/base/v4/IContentHost.ts` | Add `getEditorState` / `setEditorState` to the interface. |
| `src/renderer/editors/text/TextEditorModel.ts` | Add `editorSettings?: Record<string, unknown>` to state; implement the two methods. |
| `src/renderer/editors/grid/GridEditor.ts` | Retrofit Grid (Step 3 above). Mandatory within this task. |
| `doc/epics/EPIC-028-editor-architecture/mockups/IContentHost.ts` | Mockup update. |
| `doc/epics/EPIC-028-editor-architecture/mockups/TextFileModel.ts` | Mockup update. |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/21-grid.md` | GR4 amendment. |
| `doc/epics/EPIC-028-editor-architecture/concerns.md` | GR4 amendment. |
| (future tasks) | Same template repeats in US-555 / US-556 / US-557 for Link / Todo / RestClient / Notebook view-state slots — out of scope for US-552-B. |

## Open questions for detailed investigation

1. **Per-editor settings shape ownership** — does each editor own its `XxxViewSettings` interface, or does `IContentHost` carry a discriminated union? Probably per-editor; the host treats the value as `unknown`.
2. **Cross-format Grid sharing** — should `grid-json` / `grid-csv` / `grid-jsonl` share one settings slot or three? Today's columns differ per format (JSON header rows vs CSV header rows). Likely three slots (one per registry id).
3. **NoteItemEditModel** — second `IContentHost` implementation (US-557). Does it carry its own `editorSettings` map, or skip it (notebook editors are special)? Decide during the Notebook migration.
4. **Schema versioning** — `editorSettings` is freeform `Record<string, unknown>`. If a future editor changes its settings shape, how do we handle the migration? Probably each editor validates on read and falls back to defaults on shape mismatch.
5. **Persistence size budget** — settings ride the host descriptor in `openFiles.txt`. Walkthrough 04 / M9 set a ~50KB-per-page budget. Grid settings are small (<5KB worst case); Link / RestClient could be larger if they store filter trees or request bodies. Audit total payload after multiple editors land.
6. **Walkthrough 21 / GR4 update** — the original resolution chose option (a) "fold into descriptor, eliminate cache file." This task amends GR4 with a third option: "fold into HOST's persisted state, not the editor's descriptor." Update `concerns.md` (resolved-section addendum) and the walkthrough's mockup adjustments accordingly.
7. **Mockup updates** — `mockups/IContentHost.ts` and `mockups/TextFileModel.ts` need to gain the two methods + `editorSettings` field so the design phase stays canonical for downstream task planning.
8. **Where the editor settings field lives in the host descriptor** — alongside `content`, `language`, `filePath`, etc., as a sibling key in `HostDescriptor.state`. Trivial, but worth confirming during investigation.
9. **Mock cleanup in the editor's `getRestoreData`** — once host-managed, `GridEditor.getRestoreData()` returns only identity (`title` / `modified` / `secondaryEditor`). Same for other migrated editors. Reframes the "editor descriptor" as pure identity + host pointer.

## Acceptance criteria (preliminary — finalize during investigation)

1. Open a `.csv` file; reorder columns; resize a column; toggle a filter; pick a sort. Switch to Monaco; switch back. **Column order, widths, filter, sort all restored.**
2. Same as #1 but restart Persephone between Monaco switch and Grid switch. Settings still survive.
3. Open two `.csv` files. Configure columns differently in each. Switch each back and forth. Settings stay separate per host.
4. Open a `.csv`, configure columns, close the page. Reopen the same file. Settings restored (host descriptor re-read on open-file flow).
5. Existing pre-US-552-B sessions (Grid settings in `EditorDescriptor.state`) restore harmlessly — settings either ignored or one-shot promoted to host slot.
6. Per-editor: same matrix once Link / Todo / RestClient migrate and adopt the template.

## Status

**Pending detailed investigation.** The investigation will:

- Read all consumers of `TextFileModel.state` to check that adding `editorSettings` doesn't collide.
- Re-read mockups (`mockups/IContentHost.ts`, `mockups/TextFileModel.ts`) and propose specific updates.
- Re-open walkthrough 21 / GR4 to amend the resolution with the third option.
- Walk the per-editor template against Link (US-555), Todo (US-556), RestClient (US-556), Notebook (US-557) to confirm the contract carries cleanly across each — same exercise GR4 originally did, but now with the new mechanism.
- Resolve the open questions above.
- Produce a full task document (Goal / Background / Implementation plan / Files changed / Concerns / Acceptance criteria).

The deep-investigation pass should land **before** US-555 starts so the new mechanism is in place when later editors migrate.
