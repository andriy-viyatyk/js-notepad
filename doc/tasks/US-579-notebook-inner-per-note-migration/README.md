# US-579: Notebook inner per-note migration (EPIC-028 Phase D)

> **Status:** Investigation skeleton — a full investigation pass is required immediately before implementation (codebase will have evolved by the time this lands).
> **Walkthrough:** [`doc/epics/EPIC-028-editor-architecture/walkthroughs/29-notebook.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/29-notebook.md) §NB6 + §NB7 (originally RESOLVED in design 2026-05-20 with full-scope NotebookEditor migration; **deferred to US-579 by US-557 outer-only amendment 2026-05-24**).
> **Predecessor:** [US-557 — Notebook outer editor migration](../US-557-notebook-editor-migration/README.md) (must land first).
> **Risk profile:** Cross-cutting framework change touching the v4 `EditorModel` contract, all 11 Tier-5 modules, and the entire notebook per-note dispatch subsystem.

---

## Goal

Migrate the **inner per-note dispatch** of the Notebook editor from the legacy content-view-model subsystem to v4 `EditorModel` + v4 `IContentHost`. Three things land together:

1. **NoteItemEditModel decomposition (NB6)** — slim down from ~375 LOC to ~70 LOC. Delete `_vmHost: ContentViewModelHost` field; delete `acquireViewModel` / `acquireViewModelSync` / `prepareViewModel` / `releaseViewModel` methods; delete `editor: NoteEditorModel` (Monaco-specific sub-class); delete portal refs; delete compatibility properties. Implement v4 `IContentHost` interface (`getEditorState` / `setEditorState` / `setStorage` / `dispose` / `getDescriptor`).
2. **Per-note embedded EditorModel + switch widget (NB7)** — each note's `NoteItemView` holds an `embeddedEditor: EditorModel` instance (Monaco / Grid / Markdown / Mermaid / SVG / HTML / etc.) wrapping the per-note `NoteItemEditModel` as `IContentHost`. Per-note switch widget invokes the standard three-phase switch protocol scoped to the `NoteItemViewModel` (vs. PageModel today). **First and only consumer of `switchEditorViaContentHost` at a second-level owner.**
3. **`ContentViewModelHost.ts` deletes entirely from the codebase** — last consumer dissolves. Net the codebase loses ~135 LOC of ref-counting infrastructure.

Also retires the parallel-track legacy view + VM pairs preserved by US-554–US-565 — they were preserved specifically for this moment; after this task they can be deleted alongside `LegacyEditorAdapter` in US-559 (or as part of this task's cleanup pass).

---

## Background

### Why this is its own task (cost summary from US-557 NB-IMPL1)

US-557 deferred NB6/NB7 because the inner migration requires designing several **new framework contracts** and auditing 11 Tier-5 editors for TextFileModel-only method dependencies:

1. **`EditorModule.Body` slot** — nested editors render WITHOUT TextChrome. Today's `module.Component` wraps the body in TextChrome; for embedded use we need just the body. New optional slot on the `EditorModule` interface; each of the 11 v4 modules exports one.
2. **`EditorConstructorArgs.initialHost` primitive** — top-level page-owned editors construct without `initialHost` and create their TextFileModel inside `restore()` (standard path). Per-note embedded editors construct WITH `initialHost: noteItemEditModel` and skip the host-construction branch.
3. **`adoptHost(host: TextFileModel)` widening to `adoptHost(host: IContentHost)`** — Tier-5 editors today expect `TextFileModel` specifically. Many call TextFileModel-only methods (`host.script`, `host.io.saveState`, `host.confirmRelease`, `host.setPage`, `host.setEditorOverlayRef`, `host.setEditorToolbarRefFirst`, `host.pipe`, etc.) that NoteItemEditModel doesn't have.

### Audit needed during investigation pass

Before implementation, audit each of the 11 Tier-5 v4 editors for TextFileModel-only methods. Tally per editor what needs to be:
- (a) No-op'd in the per-note path (e.g., `confirmRelease` — notebook owns lifecycle; not called per-note).
- (b) Implemented on NoteItemEditModel (e.g., `setPage` — possibly a propagate-up to notebook).
- (c) Made conditional on the host kind (`instanceof TextFileModel`) — e.g., `host.script` access in MonacoEditor; the script panel doesn't render under per-note context.

Tier-5 editors to audit:
1. MonacoEditor (US-551)
2. GridEditor (US-552)
3. LogViewEditor (US-553)
4. MarkdownEditor (US-554)
5. SvgEditor (US-560)
6. HtmlEditor (US-561)
7. MermaidEditor (US-562)
8. GraphEditor (US-564)
9. DrawEditor (US-565)
10. LinkEditor (US-555)
11. TodoEditor (US-556)
12. RestClientEditor (US-563)
13. NotebookEditor (US-557) — note: a note is NOT itself embeddable inside a note, so NotebookEditor stays excluded from the embed set.

### Today's `NoteItemActiveEditor` dispatch

Legacy path:
```typescript
const def = editorRegistry.getById(editor);    // legacy registry
return def.loadModule();                       // returns { Editor: <body>, createViewModel, ... }
// rendered via <AsyncEditor model={NoteItemEditModel}>
```

Under v4 dispatch:
```typescript
const def = v4EditorRegistry.getById(editor);  // v4 registry
const module = await def.loadModule();         // returns { createEditor, Component, Body }
const editor = module.createEditor({ initialHost: noteItemEditModel });
await editor.restore();
// rendered via <module.Body model={editor}>
// switching: editor.switchFrom(oldEditor) — three-phase scoped to NoteItemViewModel
```

### Today's `NoteEditorModel` (Monaco-specific sub-class)

Today's `note-editor/NoteItemEditModel.ts` defines `NoteEditorModel extends TModel<NoteEditorState>` — manages selection state, content height, highlight decorations, mounting via `handleEditorDidMount`. This is **Monaco-specific** machinery that doesn't belong on the per-note IContentHost.

Under US-579, this entire sub-class deletes. Its responsibilities relocate:
- Selection state → embedded MonacoEditor (which already tracks selection via `hasTextSelection`).
- Content height → either on `NoteItemEditModel` directly OR on the embedded editor's state, depending on whether height is editor-specific or note-specific.
- Highlight decorations → embedded MonacoEditor's decoration machinery.

---

## Concerns / Open questions

### IPM1 — `EditorModule.Body` contract shape

**Question:** What's the right contract for `Body`?

**Option (a):** `Body?: React.ComponentType<{ model: EditorModel }>` — same signature as `Component`. Body is just the body without chrome.

**Option (b):** Separate `EmbeddedComponent?: React.ComponentType<{ model: EditorModel; embedded: true }>` — explicit boolean flag the editor can branch on if it needs to render differently when embedded.

**Recommendation:** (a) — Body is conceptually "the editor content without chrome." Each v4 module already exports a `XxxBody` component (we already have `TodoBody`, `MonacoBody`, `RestClientBody`, etc.) — exposing it through the module is a one-line addition per module.

### IPM2 — `EditorConstructorArgs.initialHost` mechanism

**Question:** Should `initialHost` be passed via constructor args or via a separate method?

**Option (a):** Constructor args — `module.createEditor({ initialHost: noteItemEditModel })`. Each v4 module's `createEditor` factory accepts the optional arg. Cleaner; keeps host adoption at the only place it makes sense (construction time).

**Option (b):** Existing `adoptHost(host)` method — `const editor = module.createEditor(); editor.adoptHost(noteItemEditModel);`. Mirrors `wrapLegacyForPage` exactly. Smaller framework diff (no `EditorConstructorArgs` type addition); reuses what already exists.

**Recommendation:** (b) — `adoptHost` is the existing pattern. The 11 Tier-5 editors all expose `adoptHost(host: TextFileModel)` already; widening the parameter type to `IContentHost` is the minimum-diff path. No new constructor-args type needed. **This deviates from walkthrough §NB7's `EditorConstructorArgs.initialHost` proposal** but matches today's established `wrapLegacyForPage` pattern.

### IPM3 — Auditing TextFileModel-only method usage per Tier-5 editor

Each Tier-5 editor calls some subset of TextFileModel-only methods. Build a per-editor table:

| Editor | TextFileModel-only methods called | Per-note treatment |
|--------|-----------------------------------|--------------------|
| Monaco | `host.script`, `host.runScript`, `host.setEditorOverlayRef`, `host.confirmRelease`, `host.io.saveState`, `host.setPage` | (TBD during investigation) |
| Grid | (TBD) | (TBD) |
| LogView | (TBD) | (TBD) |
| Markdown | (TBD) | (TBD) |
| Svg / Html / Mermaid | (TBD) | (TBD) |
| Graph / Draw | (TBD) | (TBD) |
| Link / Todo / RestClient | (TBD) | (TBD) |

This table drives the per-editor refactor scope. **Build this during the investigation pass immediately before implementation.**

### IPM4 — Per-note three-phase switch protocol

When user switches a note's view (Monaco → Grid), the per-note `NoteItemViewModel` invokes:

```typescript
switchNoteEditor = async (newEditorId: EditorView) => {
    const oldEditor = this.embeddedEditor;
    if (oldEditor.editorId === newEditorId) return;

    const def = v4EditorRegistry.getById(newEditorId);
    if (!def) return;
    const module = await def.loadModule();
    const newEditor = module.createEditor();
    newEditor.switchFrom(oldEditor);   // standard three-phase: extracts NoteItemEditModel via CONTENT_HOST_TRAIT
    await newEditor.restore();

    this._embeddedEditor = newEditor;
    await oldEditor.dispose();

    // Propagate the new editor type back to the note's persisted data
    this.props.notebookEditor.updateNoteEditor(this.props.note.id, newEditorId);

    this.forceUpdate();
};
```

**Subtlety:** the `switchFrom` mechanism uses `CONTENT_HOST_TRAIT.extractContentHost()` — works identically for TextFileModel and NoteItemEditModel since both implement v4 IContentHost.

### IPM5 — Notebook is NOT embeddable inside a notebook (exclude)

`v4EditorRegistry.findEditorsAccepting(noteItemEditModel)` filters out `notebook-view`. Either:
- Add a per-editor `allowsEmbedded?: boolean` field on `EditorDefinition` (default `true`; NotebookEditor sets `false`).
- Or special-case in `findEditorsAccepting`'s NoteItemEditModel branch.

**Recommendation:** Add `allowsEmbedded?: boolean` to the `EditorDefinition` interface. Defaults to true. NotebookEditor's registration sets it to false. Cleaner than a special-case branch.

### IPM6 — `data.state[id].contentHeight` migration

Today's per-note content height (from Monaco's `onDidContentSizeChange`) persists via `NoteEditorModel.persistContentHeight(height)` → `notebookEditor.setNoteHeight(noteId, height)` → `data.state[id].contentHeight`.

Under v4:
- `NoteEditorModel` sub-class deletes (per walkthrough NB6).
- Height is editor-specific (only Monaco / Mini Monaco knows about it); other embeddable editors (Grid, Markdown, etc.) don't expose content height.
- Resolution: an embedded MonacoEditor with a per-note flag/embedded-mode reports height via a queue event the NoteItemViewModel subscribes to, OR via a callback prop.

Audit: which embeddable editors today report content height to the notebook? Looking at `RenderFlexGrid.getInitialRowHeight` in `NotebookEditor.tsx:89`, the value comes from `vm.getNoteHeight(note.id)`. Today only the Monaco path inside `MiniTextEditor.tsx` writes this. So height persistence is a Monaco-only concern; under v4 it lives on MonacoEditor's embedded path.

### IPM7 — Retire preserved-sibling legacy views + VMs

After US-579, the following preserved-legacy-view artifacts can retire (or live until US-559):

| Editor | Legacy view | Legacy VM |
|--------|-------------|-----------|
| Monaco | `MonacoView.tsx`? (check — Monaco's preservation pattern varies) | `TextViewModel.ts`? |
| Grid | `GridView.tsx` | `GridViewModel.ts` |
| LogView | `LogView.tsx` | `LogViewModel.ts` |
| Markdown | `MarkdownView.tsx` | `MarkdownViewModel.ts` |
| Svg | `SvgView.tsx` | `SvgViewModel.ts` |
| Html | `HtmlView.tsx` | `HtmlViewModel.ts` |
| Mermaid | `MermaidView.tsx` | `MermaidViewModel.ts` |
| Graph | `GraphView.tsx` | `GraphViewModel.ts` |
| Draw | `DrawView.tsx` | `DrawViewModel.ts` |
| Link | `LinkView.tsx` | `LinkViewModel.ts` |
| Todo | `TodoView.tsx` | `TodoViewModel.ts` |
| RestClient | `RestClientView.tsx` | `RestClientViewModel.ts` |
| Notebook | `NotebookView.tsx` | `NotebookViewModel.ts` |

**Decision:** Defer retirement to US-559 (strangler-fig cleanup). US-579's scope is the inner per-note migration; deleting 13 preserved files belongs with the broader legacy retirement.

### IPM8 — Investigation pass mandatory before implementation

Because of the cross-cutting framework changes and per-editor audit needed, **a full investigation pass is mandatory immediately before US-579 implementation begins**. This task's README is a skeleton; the investigation pass will:
- Build the per-editor TextFileModel-only method audit table (IPM3).
- Confirm the `EditorModule.Body` + `adoptHost(IContentHost)` design decisions (IPM1 / IPM2) against the codebase state at that time.
- Verify no new consumers have appeared between US-557 and US-579 (e.g., new editors added; new `acquireViewModelSync` call sites).
- Produce a phase-by-phase implementation plan.

---

## Implementation plan (high-level — full plan delivered by investigation pass)

### Phase 1 — Framework primitives

1. Add `Body?: React.ComponentType<{ model: EditorModel }>` to `EditorModule` interface in `src/renderer/editors/base/v4/editorRegistry.ts`.
2. Add `allowsEmbedded?: boolean` to `EditorDefinition` interface (defaults to true).
3. Widen `adoptHost` signature on each Tier-5 v4 editor: `adoptHost(host: TextFileModel)` → `adoptHost(host: IContentHost)`. Each editor narrows internally where needed via `instanceof TextFileModel` (TextFileModel-only method access guarded behind the narrowing).

### Phase 2 — Per-editor audit + refactor

For each of 12 embeddable Tier-5 editors (excluding Notebook):
- Audit TextFileModel-only method calls (IPM3 table).
- Refactor each TextFileModel-only call to be conditional on host kind OR no-op in the per-note path OR implement equivalent on NoteItemEditModel.
- Export the editor's `Body` component from its `module` definition.
- Verify v4 module's `accepts(input: AcceptanceInput)` correctly handles per-note context (where `host` is a NoteItemEditModel, not a TextFileModel).

### Phase 3 — NoteItemEditModel decomposition (NB6)

Edit `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts`:
- Delete `_vmHost: ContentViewModelHost` field.
- Delete `acquireViewModel` / `acquireViewModelSync` / `prepareViewModel` / `releaseViewModel` methods.
- Delete `editor: NoteEditorModel` field + the entire `NoteEditorModel` sub-class.
- Delete portal refs (`editorToolbarRefFirst/Last`, `editorFooterRefLast`) + their setters.
- Delete compatibility props (`noLanguage`, `getIcon`, `filePath`, `title`, `encrypted`, `decrypted`).
- Delete `type = "textFile" as const` discriminator.
- Implement v4 `IContentHost`:
  - `setStorage(_storage)` — no-op (stateStorage is already backed by notebook.data.state[id]).
  - `dispose()` — no I/O to flush; embedded EditorModel handles its own dispose separately.
  - `getDescriptor()` — returns minimal `{ kind: "noteItem", state: { noteId } }` for interface completeness.
  - `getEditorState<T>(editorId)` / `setEditorState<T>(editorId, value)` — backed by `notebook.data.state[noteId]` via `notebookEditor.getNoteState` / `setNoteState`.
- Result: ~70 LOC.

### Phase 4 — Per-note dispatch rewrite (NB7)

Rewrite `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx`:
- Lookup the v4 module for the note's preferred editor.
- Construct via `module.createEditor()` + `editor.adoptHost(noteItemEditModel)`.
- Render `module.Body` (NOT `module.Component` — no chrome).

Update `src/renderer/editors/notebook/NoteItemViewModel.ts`:
- Add `_embeddedEditor: EditorModel | null` field + `embeddedEditor` getter.
- Add `switchNoteEditor(newEditorId)` method invoking the three-phase switch (IPM4).
- Update `dispose()` to dispose `_embeddedEditor`.

### Phase 5 — Per-note switch widget

Replace today's `<SegmentedControl>` in `NoteItemToolbar.tsx` with a switch widget that reads `embeddedEditor.findCompatibleEditors()` for options and calls `vm.switchNoteEditor` on change.

### Phase 6 — Cleanup

- Delete `src/renderer/editors/base/ContentViewModelHost.ts` (last consumer dissolved).
- Delete `src/renderer/editors/base/ContentViewModel.ts` (if no remaining consumers; verify via grep).
- Delete `src/renderer/editors/base/useContentViewModel.ts` (if no remaining consumers; verify via grep).
- Remove the `TEXT_CONTENT_VIEW_BRIDGE_IDS` machinery from `register-editors.ts` (set is empty by this point).

### Phase 7 — Verification

1. `npx tsc --noEmit` + `npm run lint` — clean.
2. Manual test plan: exercise per-note editor switching for every embeddable Tier-5 editor; verify per-note state preservation; verify cross-window notebook transfer; verify search across notes still works.

---

## Acceptance criteria

1. **`ContentViewModelHost.ts` deleted from the codebase** — grep returns zero hits.
2. **NoteItemEditModel ~70 LOC** (down from ~375). Compatibility properties + content-view-model machinery + NoteEditorModel sub-class all removed.
3. **Per-note Monaco editor works** — open a notebook, click on a note with monaco view, edit content; saves to JSON within 300ms.
4. **Per-note Grid editor works** — switch a note to Grid view via the switch widget; columns persist via `data.state[noteId][grid-page]` (existing HS1-shaped mechanism).
5. **Per-note Markdown view works** — switch a note to Markdown; preview renders; search highlights work.
6. **Per-note Mermaid / Svg / Html views work** — switch and render.
7. **Per-note switch widget shows correct compatible editors** — based on `embeddedEditor.findCompatibleEditors()`; respects `allowsEmbedded` flag (notebook excluded).
8. **Per-note state preservation** — column widths / scroll positions / search state survive notebook reopen because they live in `notebook.data.state[noteId]`.
9. **Cross-window notebook transfer** — move a notebook with per-note state to another window; state survives.
10. **NO regression in outer NotebookEditor** — outer search / category tree / tags / expand-note / drag-drop all work as US-557 left them.
11. **`acquireViewModelSync` consumer count = 0** — grep returns no callsites in the codebase (LV9's "(also touched by walkthrough 29)" deferred work is now done).

---

## Files Changed (preliminary — full list from investigation pass)

| File group | Files | Estimated change |
|------------|-------|------------------|
| Framework | `editorRegistry.ts` (EditorModule + EditorDefinition interfaces) | +20 LOC |
| Tier-5 editors (11–12 modules) | Each `XxxEditor.ts` + `index.tsx` | per-editor audit-driven; ~50–100 LOC each |
| Notebook inner | `NoteItemEditModel.ts` (~70 LOC down from ~375), `NoteItemActiveEditor.tsx` (rewrite), `NoteItemViewModel.ts` (+ embeddedEditor machinery), `NoteItemToolbar.tsx` (switch widget) | net −300 / +200 LOC |
| Cleanup | `ContentViewModelHost.ts` (DELETED), `ContentViewModel.ts` (?DELETED), `useContentViewModel.ts` (?DELETED) | −150 LOC |
| Registry | `register-editors.ts` (TEXT_CONTENT_VIEW_BRIDGE_IDS removal) | −20 LOC |

**Estimated net diff:** small overall; large file-touch count.

---

## Notes for the investigator (read before starting)

- US-557 outer-only landed first; that PR establishes the v4 NotebookEditor. This task starts from there.
- The audit table (IPM3) is the single most important deliverable of the investigation pass.
- The `EditorConstructorArgs.initialHost` walkthrough proposal is rejected by the US-557 NB-IMPL1 analysis (see IPM2 recommendation). Confirm or overrule during investigation.
- The 12 preserved-sibling legacy view + VM pairs (from US-554 through US-565) are NOT deleted by this task — they retire alongside `LegacyEditorAdapter` in US-559.
- The walkthrough §NB6 / §NB7 sections were AMENDED 2026-05-24 to defer to this task — read them in their amended form before starting.
