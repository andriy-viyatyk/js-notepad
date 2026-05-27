# US-579: Notebook inner per-note migration (EPIC-028 Phase D)

> **Status:** Investigated + **implemented 2026-05-27** (approach A + A1, per user sign-off). Phases 1–3 landed; `tsc`/`lint` clean on touched files. Awaiting manual testing. Phase 5 (`asNotebook` facade) + IPM9 (walkthrough amendment) deferred.
> **Walkthrough:** [`doc/epics/EPIC-028-editor-architecture/walkthroughs/29-notebook.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/29-notebook.md) §NB6 + §NB7 (originally RESOLVED in design 2026-05-20; **deferred to US-579 by US-557 outer-only amendment 2026-05-24**). The walkthrough's NB6/NB7/Closure claims need amending — see IPM9.
> **Predecessor:** [US-557 — Notebook outer editor migration](../US-557-notebook-editor-migration/README.md) — **LANDED.** The v4 `NotebookEditor` exists; this task migrates the inner per-note dispatch.
> **Risk profile:** Cross-cutting. Touches the per-note dispatch subsystem and `NoteItemEditModel`. The host-abstraction decision (IPM2) controls whether it also touches all 12 Tier-5 modules.

---

## Goal

Replace the Notebook's **inner per-note editor dispatch** — today a legacy `AsyncEditor` → legacy registry → `ContentViewModel` path — with **v4 `EditorModel` instances embedded one-per-note**, each wrapping the per-note `NoteItemEditModel` as its content host and rendering chrome-free via a new `EditorModule.Body` slot. A per-note switch widget drives the standard three-phase switch scoped to the note (not the page).

Concretely, after this task:
1. A note rendered as one of the **language-gated** editors (Grid for json/csv/jsonl, Markdown for markdown, Svg for svg, Html for html, Mermaid for mmd) is a real **v4 editor instance** wrapping `NoteItemEditModel`, not a legacy `ContentViewModel` acquired via `acquireViewModel`.
2. `NoteItemEditModel` sheds its legacy content-view-model machinery (`_vmHost`, `acquireViewModel*`, `prepareViewModel`, `releaseViewModel`).
3. The per-note view switch runs the same `switchFrom` → `restore` three-phase used at the page level, scoped to `NoteItemViewModel`.

### Embeddable set (scoping — confirmed with user 2026-05-27)

A note has a **Monaco language but no filename/extension**, so the per-note editor choice is gated **by language only**. The embeddable set is therefore small and fixed:

| Language | Embeddable editor |
|---|---|
| (any) | `monaco` — default, kept via `MiniTextEditor` (IPM6) |
| json / jsonl | `grid-json` / `grid-jsonl` |
| csv | `grid-csv` |
| markdown | `md-view` |
| html | `html-view` |
| mermaid | `mermaid-view` |

> **SVG is NOT embeddable in notes** (verified 2026-05-27): `svg-view.validForLanguage` is `xml` and its `switchOption` matches only `.svg` **filenames** — with no filename (note context) it returns `-1`. The `svg` module still gets a `Body` export + embedded sizing fix, but it's dead code for notes (harmless; would only matter if SVG became language-gated).

Extension-gated editors — **SVG (`.svg`), Todo (`.todo.json`), Link (`.link.json`), RestClient (`.rest.json`), Graph (`.graph.json`), Draw (`.excalidraw`), Log (`.log`), Notebook (`.note.json`)** — can NEVER appear in a note and are **out of scope**: they need no `Body` export, no host-shim verification, and no explicit "not allowed" list. The existing `editorRegistry.getSwitchOptions(language, /* fileName */ undefined)` query (which `NoteItemToolbar` already uses today) returns exactly the table above because each editor's `switchOption(language, undefined)` returns `-1` when it requires a filename it doesn't get. This makes IPM5's `allowsEmbedded` flag unnecessary.

**Out of scope (corrected — see IPM3/IPM9):** wholesale deletion of `ContentViewModelHost` / `ContentViewModel` / `AsyncEditor` / `useContentViewModel` / the preserved-sibling legacy `XxxView`+`XxxViewModel` files. Those have **live consumers beyond the per-note path** (the `asNotebook` scripting facade, `TextFileModel._vmHost`, and `TextEditorView → ActiveEditor`). US-579 removes the *per-note* consumer; full subsystem deletion is gated on US-559. The Monaco-note path decision (keep `MiniTextEditor` vs. embed a content-sized v4 Monaco) is IPM6.

---

## Reality vs. walkthrough (read this first)

Walkthrough 29 was written 2026-05-20 against an idealized design. The landed Phase-B/C code differs in ways that **change this task's shape**:

1. **`TextFileModel` (`editors/text/TextEditorModel.ts`) is NOT a v4 editor.** It still extends the **legacy** `EditorModel` (`../base/EditorModel`) and is the single shared `IContentHost` that every v4 editor wraps. It still owns `_vmHost = new ContentViewModelHost()` and `acquireViewModel*`. The v4 host primitives (`getDescriptor` / `setStorage` / `getEditorState` / `setEditorState` / static `fromDescriptor`) were bolted on alongside the legacy surface.
2. **All 12 Tier-5 v4 editors couple to the *concrete* `TextFileModel`, uniformly.** Each holds `private _host: TextFileModel | null`, its `restore()` hardcodes `TextFileModel.fromDescriptor(...) ?? newTextFileModel("")`, its `adoptHost(host: TextFileModel)` / `saveState()` / `confirmRelease()` / `setPage()` / `getNavigatorTarget()` call TextFileModel-specific members (`host.io.saveState`, `host.confirmRelease`, `host.setPage`, `host.pipe`), and a file-local `isLegacyTextFileHost(host)` guard checks `host.type === "textFile"`. The v4 `IContentHost` interface is NOT what they actually program against.
3. **`restore()` is idempotent over a pre-set `_host`.** Every editor guards host construction with `if (!this._host)` and host realization with `if (!host.state.get().restored)`. **This is the key enabler:** an embedded editor can be realized by setting its host first (`adoptHost`) and then calling `restore()`, which skips construction and runs only the adopt + initial-content-realize steps. No new framework primitive (`EditorConstructorArgs.initialHost`) is needed — the walkthrough's NB7 proposal is moot.
4. **The legacy content-view subsystem is still alive with non-per-note consumers.** `acquireViewModel` is called by (a) the per-note path [US-579 target], (b) `PageWrapper.asNotebook()` at `scripting/api-wrapper/PageWrapper.ts:205` (`model.acquireViewModel("notebook-view")` → legacy `NotebookViewModel`), and (c) `useContentViewModel` rendered through `AsyncEditor`. `TextEditorView → ActiveEditor → AsyncEditor` is the top-level legacy fallback. So walkthrough 29's "**`ContentViewModelHost.ts` deletes entirely from the codebase after NB6**" is **false today** and must be amended (IPM9).

---

## Background

### Today's per-note dispatch

`NotebookBody.tsx` renders one `NoteItemView` per note (`notebookModel={editor}` — the v4 `NotebookEditor`). Each `NoteItemView` (and the full-screen `ExpandedNoteView`) wraps `<NoteItemActiveEditor model={vm.editModel}>` inside an `EditorConfigProvider` (collapsed: `maxEditorHeight = NOTE_EDITOR_MAX_HEIGHT` 400px, `hideMinimap`, `compact`; expanded: `fillContainer`). `NoteItemActiveEditor`:

```tsx
// monaco → MiniTextEditor (note-specific simplified Monaco, content-sized auto-height)
// anything else → <AsyncEditor getEditorModule={legacyRegistry.getById(editor).loadModule} model={noteItemEditModel} cacheKey={editor}>
```

`AsyncEditor` loads the **legacy** module, whose `Editor` component calls `useContentViewModel(noteItemEditModel, editorId)` → `noteItemEditModel.acquireViewModel(editorId)` → a legacy `ContentViewModel` (e.g. `GridViewModel`, `MarkdownViewModel`). That legacy `XxxView` + `XxxViewModel` pair is the **preserved sibling** kept alive since US-554.

### Today's `NoteItemEditModel` (`note-editor/NoteItemEditModel.ts`, ~375 LOC)

Implements the **legacy** `IContentHost`. Holds:
- `readonly type = "textFile" as const` — **already passes** every editor's `isLegacyTextFileHost` guard.
- `state: TComponentState<{ content; language; editor }>`.
- `editor: NoteEditorModel` — a Monaco-specific sub-model (selection state, content-height measurement via `onDidContentSizeChange`, find-match highlight decorations). Drives `MiniTextEditor`.
- `_vmHost = new ContentViewModelHost()` + `acquireViewModel` / `acquireViewModelSync` / `prepareViewModel` / `releaseViewModel`.
- `stateStorage: { getState, setState }` backed by `notebookModel.getNoteState/setNoteState` (per-note state lives **inside the notebook JSON**, `data.state[noteId]`, NOT a cache file — NB8).
- `changeContent` / `changeEditor` / `changeLanguage` (propagate to `notebookModel.updateNote*`), `runScript` (runs against the notebook's `pageModel`), `syncFromNote`, portal-ref setters, compatibility getters (`noLanguage`, `getIcon`, `filePath`, `title`, `encrypted`, `decrypted`).

It does **NOT** have: `getEditorState<T>` / `setEditorState<T>` (the HS1 slot accessors v4 editors call in `adoptHost`), `setPage`, `confirmRelease`, `io`, `pipe`, `getDescriptor`, `setStorage`.

### `NotebookSource` contract (`notebookTypes.ts`)

`type NotebookSource = NotebookViewModel | NotebookEditor`. Members consumed by `NoteItemEditModel`: `getNoteState` / `setNoteState` (string name/value), `getNoteHeight` / `setNoteHeight`, `updateNoteContent` / `updateNoteEditor` / `updateNoteLanguage`, `removeComment`, `pageModel` (the notebook's `TextFileModel`, for script context). All exist on the v4 `NotebookEditor`.

### The IPM3 audit — what each v4 editor calls on its host

Every editor is structurally identical. The **only** members called on `_host` that are NOT plain `IContentHost` (`id`, `state.{content,language}`, `changeContent`, `changeLanguage`, `getEditorState`, `setEditorState`, `setStorage`, `dispose`, `getDescriptor`):

| Member called on host | Where | Per-note treatment for `NoteItemEditModel` |
|---|---|---|
| `host.type === "textFile"` (via `isLegacyTextFileHost`) | `switchFrom` guard, all 12 | **Keep** `type = "textFile"` on `NoteItemEditModel` (already present) — guard passes unchanged. |
| `TextFileModel.fromDescriptor(...)` / `newTextFileModel("")` | `restore()`, all 12 | **Never reached** for embedded editors — `adoptHost` pre-sets `_host`, so `restore()`'s `if (!this._host)` skips construction. |
| `if (!host.state.get().restored) await host.restore()` | `restore()`, all 12 | Add `restored: true` to `NoteItemEditModel.state` → guard skips; `NoteItemEditModel` needs no `restore()`. |
| `host.setPage(page)` | `adoptHost`/`setPage`, all 12 | Embedded editor's `page` is `null` (not page-attached) → `adoptHost`'s `if (this.page) host.setPage(...)` never fires. Add a no-op `setPage()` to `NoteItemEditModel` for safety. |
| `host.io.saveState()` | `saveState()`, all 12 | Embedded editor's `saveState()` is never called by the page persistence loop (it's not a `page.mainEditor`). Add a no-op `io = { saveState: async () => {} }` shim defensively. |
| `host.confirmRelease(closing)` | `confirmRelease()`, all 12 | Add `confirmRelease() → true` to `NoteItemEditModel` (notebook owns the note lifecycle). |
| `host.pipe` , `host.state.get().filePath` | `getNavigatorTarget()`, all 12 | Not invoked in note context (no per-note NavPanel). `pipe` undefined + `filePath` undefined → returns `{}`/null harmlessly. Add `pipe = null`. |
| `host.getEditorState<T>(editorId)` / `host.setEditorState<T>(editorId, v)` | `adoptHost`, Grid/Markdown/Log/Mermaid/Graph/Draw/Link/Todo/RestClient | **Implement** on `NoteItemEditModel`, backed by `data.state[noteId].editorSettings[editorId]` (per NB3-amended/NB8; survives across windows in the JSON). Requires a new object slot + `NotebookEditor` accessors. |
| `host.state.get().{title,id,encrypted}` (read) , `host.state.update(s => s.editor = editorId)` (write) | `adoptHost`, several | Widen `NoteItemEditModel.state` to a superset: `{ content, language, editor, id?, title?, filePath?, encrypted?: false, restored?: true, temp?: false }`. Reads are defensive (`if (host.state.get().id) ...`); safe defaults suffice. |
| `host.actions.runScriptWith(text, lang)` | MonacoEditor only | **Out of scope** — Monaco notes keep `MiniTextEditor` (IPM6/A1), never embedding a v4 MonacoEditor, so `host.actions` is never hit. Per-note run stays on `NoteItemToolbar` → `noteItem.runScript`. |
| `host.stateStorage.getState(host.id,...)` / `setState` | RestClient response-cache only | **Out of scope** — RestClient is extension-gated (`.rest.json`), never embeddable in a note. |

> Only the **embeddable** editors matter: Grid, Markdown, Svg, Html, Mermaid. Their host surface is exactly the common rows above (`type`, `setPage`, `io.saveState`, `confirmRelease`, `pipe`/`filePath`, `getEditorState`/`setEditorState`, widened state). The two specials (Monaco `actions`, RestClient `stateStorage`) fall outside the embeddable set.

**Conclusion:** with approach (A) below, the 5 embeddable editor classes need **zero edits to their `.ts` class** — only a one-line `Body` export in their `index.tsx`. The work concentrates in `NoteItemEditModel`, the per-note dispatch, and the `EditorModule.Body` slot.

### Body components already exist

Every v4 module already renders `<TextChrome><XxxBody model={editor}/></TextChrome>`, and `XxxBody` is a chrome-free file: `MonacoBody`, `GridBody`, `LogBody`, `MarkdownBody`, `SvgBody`, `HtmlBody`, `MermaidBody`, `GraphBody`, `DrawBody`, `LinkBody`, `TodoBody`, `RestClientBody`. They are **not** currently exported from `index.tsx`. Exposing each via a new `EditorModule.Body` slot is a one-line-per-module change.

---

## Concerns / Open questions

### IPM1 — `EditorModule.Body` contract shape — **RESOLVED**

Add `Body?: React.ComponentType<{ model: EditorModel }>` to `EditorModule` (`base/v4/editorRegistry.ts`), same signature as `Component`. Each module sets `Body: XxxBody`. The per-note renderer renders `module.Body` (no `<TextChrome>`). Rejected the `embedded: true` flag variant — the Bodies already render chrome-free; no branch needed. Per-note sizing/minimap differences flow through the existing `EditorConfigContext`, not a module flag.

### IPM2 — Host abstraction: duck-type vs. interface-widen — **RECOMMEND (A); needs user sign-off**

The 12 editors program against concrete `TextFileModel`, not `IContentHost` (IPM3). Two ways to let them wrap a `NoteItemEditModel`:

- **(A) Duck-type `NoteItemEditModel` to the TextFileModel surface (RECOMMENDED).** Keep `type = "textFile"`; add the small shim surface from the IPM3 table (`setPage` no-op, `io.saveState` no-op, `confirmRelease`→true, `pipe = null`, `getEditorState`/`setEditorState`, `restored: true`, widened state). **Editor diff ≈ zero.** Lowest risk; keeps user testing scoped to the notebook screen (matches the team's scoped-migration preference). Downside: `NoteItemEditModel` carries a slightly larger "pretend to be a text file" surface.
- **(B) Widen every editor to `adoptHost(host: IContentHost)` + a real shared host interface.** Refactor all 12 editors' `restore`/`adoptHost`/`saveState`/`confirmRelease`/`setPage`/`getNavigatorTarget` to call only interface methods, and add those methods (`io`, `confirmRelease`, `setPage`, `pipe`, `getNavigatorTarget` inputs) to a shared base both `TextFileModel` and `NoteItemEditModel` implement. This is the walkthrough's NB7 vision but is a large, 12-file, high-risk change that re-tests every top-level editor. **Defer to US-559** (strangler retirement, where `TextFileModel` itself moves to the v4 base).

**Recommendation: ship US-579 on (A).** Treat (B) as US-559 cleanup. Confirm with user before implementing.

### IPM3 — TextFileModel-only method audit — **DONE** (table above)

Built from reading all 12 editor classes (`MonacoEditor`, `GridEditor`, `LogViewEditor`, `MarkdownEditor`, `SvgEditor`, `HtmlEditor`, `MermaidEditor`, `GraphEditor`, `DrawEditor`, `LinkEditor`, `TodoEditor`, `RestClientEditor`). The surface is uniform; the only per-editor specials are Monaco's `host.actions.runScriptWith` and RestClient's `host.stateStorage` response cache — both handled per the table.

### IPM4 — Embed + per-note switch mechanism — **RESOLVED**

**Embed (mount):**
```ts
const module = await v4EditorRegistry.loadModule(editorId);   // private; add a public getModule or reuse createEditor
const editor = module.createEditor();
editor.adoptHost(noteItemEditModel as unknown as TextFileModel); // sets _host + wires subscriptions
await editor.restore();   // _host pre-set → skips construction; restored:true → skips host.restore(); runs initial realize (reparseRows/loadData/render)
```
`adoptHost` is public on every editor (used by `wrapLegacyForPage`); `restore()`'s guards make the second `adoptHost` call (inside restore) safely re-entrant. Add one public registry helper (e.g. expose `loadModule` or add `getModule(id)`) since today `loadModule` is private and `createEditor(id)` doesn't return the module (we need `module.Body`).

**Per-note switch (NB7):**
```ts
switchNoteEditor = async (newId: EditorView) => {
    const old = this._embeddedEditor;
    if (!old || old.editorId === newId) return;
    const module = await v4EditorRegistry.loadModule(newId);
    const next = module.createEditor();
    next.switchFrom(old);          // CONTENT_HOST_TRAIT.extractContentHost() hands the NoteItemEditModel over; type==="textFile" guard passes
    await next.restore();          // re-adopt + initial realize
    this._embeddedEditor = next;
    await old.dispose();           // old editor drops subs; does NOT dispose the host (it was extracted)
    this.props.notebookModel.updateNoteEditor(this.props.note.id, newId);
    this.forceUpdate();
};
```

### IPM5 — Editor eligibility / exclude notebook — **RESOLVED (no flag needed)**

Originally proposed an `allowsEmbedded` flag. **Dropped** — superseded by the language-gated scoping (see "Embeddable set"). The per-note switch keeps using the existing **legacy** `editorRegistry.getSwitchOptions(language, /* fileName */ undefined)` (already used by `NoteItemToolbar` today). With no filename, every extension-gated editor — including `notebook-view` (`.note.json`), Todo, Link, RestClient, Graph, Draw, Log — returns `switchOption(...) === -1` and is excluded automatically. The resolved ids (`grid-json`/`grid-csv`/`grid-jsonl`/`md-view`/`svg-view`/`html-view`/`mermaid-view`/`monaco`) all have v4 modules. No `EditorDefinition` change.

### IPM6 — Monaco notes: keep `MiniTextEditor` or embed v4 Monaco? — **RECOMMEND keep `MiniTextEditor` for the first cut**

The v4 `MonacoEditor`/`MonacoBody` is built to **fill** the page. The per-note Monaco needs **content-sized auto-height** (collapsed, capped at 400px) and minimal chrome — exactly what `MiniTextEditor` + `NoteEditorModel` provide today (via `onDidContentSizeChange` → `persistContentHeight` → `setNoteHeight`, and find-match highlight decorations driven by `EditorConfigContext.highlightText`).

- **(A1) RECOMMENDED first cut:** Route only **non-monaco** notes through v4 embedded editors. Keep `MiniTextEditor` + `NoteEditorModel` for `editor === "monaco"`. This removes the per-note `acquireViewModel`/`ContentViewModel` consumer (the goal) while preserving the delicate Monaco auto-height behavior. `NoteItemEditModel` keeps `editor: NoteEditorModel` and `persistContentHeight`; it sheds only `_vmHost`/`acquireViewModel*`. **Net: ~290 LOC NoteItemEditModel** (not the 70 the walkthrough promised — that requires A2).
- **(A2) Full NB6:** Teach `MonacoBody`/`MonacoEditor` a content-sized embedded mode (read `EditorConfigContext.{fillContainer,maxEditorHeight}`, report height back), then embed a v4 MonacoEditor per note and delete `MiniTextEditor` + `NoteEditorModel`. Larger, touches the most-used editor; **propose as a US-579 follow-up** once A1 is validated.

**Recommendation: A1.** Surface A2 as a documented follow-up. (This also avoids Monaco's `host.actions.runScriptWith` coupling entirely — see IPM3.)

### IPM7 — `getEditorState`/`setEditorState` backing — **RESOLVED**

Add to `NoteItemEditModel`:
```ts
getEditorState<T>(editorId: string): T | undefined  // reads data.state[noteId].editorSettings?.[editorId]
setEditorState<T>(editorId: string, value: T): void  // writes it
```
Back with two new `NotebookEditor` methods (`getNoteEditorSettings(noteId, editorId)` / `setNoteEditorSettings(noteId, editorId, value)`) that read/write `data.state[noteId].editorSettings` (an object slot alongside `contentHeight`). Per NB8 this lives in the notebook JSON, so per-note Grid columns etc. survive window transfer. Mirrors the HS1 contract `TextFileModel` already implements, different backing store.

### IPM8 — Deletion scope (corrected) — **RESOLVED**

US-579 **can** delete from `NoteItemEditModel`: `_vmHost`, `acquireViewModel`, `acquireViewModelSync`, `prepareViewModel`, `releaseViewModel`, the `ContentViewModelHost`/`ContentViewModel` imports. With A1, `NoteEditorModel` + portal refs + `editor` field STAY (Monaco path).

US-579 **cannot** delete (live non-per-note consumers remain): `ContentViewModelHost.ts`, `ContentViewModel.ts`, `useContentViewModel.ts`, `AsyncEditor.tsx`, the preserved-sibling legacy `XxxView`+`XxxViewModel` files, and `TextFileModel._vmHost`/`acquireViewModel*`. Reasons: `PageWrapper.asNotebook()` (`acquireViewModel("notebook-view")`), `TextEditorView → ActiveEditor → AsyncEditor`, and the legacy `NotebookViewModel` instantiated by the scripting facade. **Optional US-579 sub-task:** migrate `NotebookEditorFacade`/`asNotebook()` to wrap the v4 `NotebookEditor` directly (mirrors `asTodo`/`asLink`), removing the scripting `acquireViewModel` consumer. `NotebookViewModel` deletion still waits on US-559 (the `ActiveEditor`/`AsyncEditor` retirement). Recommend including the `asNotebook` facade migration here; defer all file deletions to US-559.

### IPM9 — Amend walkthrough 29 in this pass — **TODO during implementation**

Per the team rule (amend design docs when an investigation supersedes a resolved concern): update walkthrough 29's NB6/NB7/Closure to (a) drop the `EditorConstructorArgs.initialHost` mechanism in favor of `adoptHost`+`restore` idempotency, (b) correct "`ContentViewModelHost.ts` deletes entirely after NB6" → "per-note consumer removed; full deletion gated on US-559", (c) note the A1 (keep `MiniTextEditor`) vs A2 split. Do this within the US-579 PR.

---

## Implementation plan

> Assumes approach (A) + first-cut (A1), pending user sign-off on IPM2/IPM6.

### Phase 1 — Framework primitives
1. `base/v4/editorRegistry.ts`: add `Body?: React.ComponentType<{ model: EditorModel }>` to `EditorModule`; add a public `getModule(id): Promise<EditorModule>` (or expose `loadModule`) so the per-note renderer can read `module.Body` + `module.createEditor`. (No `allowsEmbedded` — IPM5.)
2. The **5 embeddable** modules' `index.tsx` only — `grid/`, `markdown/`, `svg/`, `html/`, `mermaid/` — add `Body: XxxBody` to the exported module object. (Other modules untouched; they never embed.)

### Phase 2 — `NoteItemEditModel` as a v4-editor-compatible host
Edit `note-editor/NoteItemEditModel.ts`:
- Delete `_vmHost`, `acquireViewModel`, `acquireViewModelSync`, `prepareViewModel`, `releaseViewModel`, and the `ContentViewModelHost`/`ContentViewModel` imports.
- Widen `NoteItemEditState` → `{ content; language; editor; id?; title?; filePath?; encrypted?; restored?; temp? }` with safe defaults (`encrypted:false, restored:true, temp:false`).
- Add: `setPage(): void` (no-op), `confirmRelease(): Promise<boolean>` → true, `io = { saveState: async () => {} }`, `pipe = null`, `getDescriptor(): HostDescriptor` → `{ kind: "noteItem", state: { noteId } }`, `setStorage(): void` (no-op), `getEditorState<T>` / `setEditorState<T>` (IPM7).
- Keep (A1): `editor: NoteEditorModel`, `persistContentHeight`, portal-ref setters, `changeContent/changeEditor/changeLanguage`, `runScript`, `syncFromNote`, `stateStorage`, `type = "textFile"`.

### Phase 3 — Per-note dispatch rewrite
- `NoteItemViewModel.ts`: add `_embeddedEditor: V4EditorModel | null` + `embeddedEditor` getter (lazy-create via `createEmbeddedEditor(note.content.editor)` — see IPM4) + `switchNoteEditor` (IPM4) + dispose `_embeddedEditor` in `dispose()`. Keep `editModel` (the `NoteItemEditModel`).
- `NoteItemActiveEditor.tsx`: for `editor === "monaco"` → `<MiniTextEditor model={editModel}/>` (unchanged, A1). For anything else → render the embedded v4 editor's `module.Body model={embeddedEditor}` (replacing the `AsyncEditor` branch). Drive (re)creation off `note.content.editor`.
- `NoteItemToolbar.tsx`: **keep** the existing `editorRegistry.getSwitchOptions(language, undefined)` `SegmentedControl` (it already yields the correct language-gated set — IPM5); just route its `onChange` to `vm.switchNoteEditor` (which now performs the v4 three-phase switch) instead of `model.changeEditor`. Keep the language menu + run buttons (run still calls `editModel.runScript` — A1 keeps Monaco script-run off the embedded path). Drop the `editorToolbarRefFirst/Last` portal slots (v4 Bodies own their own toolbar contributions, but in embedded mode they render none — confirm during impl).

### Phase 4 — Notebook backing for per-note editor settings
- `NotebookEditor.ts`: add `getNoteEditorSettings(noteId, editorId)` / `setNoteEditorSettings(noteId, editorId, value)` over `data.state[noteId].editorSettings`. Confirm the debounced serialize picks up the mutation.
- `notebookTypes.ts`: extend `NoteItemState` with `editorSettings?: Record<string, unknown>`; add the two methods to the `NotebookSource` members consumed by `NoteItemEditModel` (and to `NotebookViewModel` for contract parity, or narrow `NoteItemEditModel` to require only `NotebookEditor`).

### Phase 5 — (Optional, recommended) `asNotebook` facade migration
- Rewrite `NotebookEditorFacade` to wrap the v4 `NotebookEditor` (mirror `asTodo`/`asLink`); update `PageWrapper.asNotebook()` to drop `acquireViewModel("notebook-view")`. Removes the scripting consumer of `acquireViewModel`.

### Phase 6 — Docs + verification
- IPM9 walkthrough 29 amendments.
- `npx tsc --noEmit` (touched files clean) + `npm run lint`.
- Manual test plan in Acceptance criteria.

---

## Acceptance criteria

1. A note set to **Grid** renders a v4 `GridEditor` wrapping its `NoteItemEditModel`; column widths / sort / filters persist across notebook reopen (stored in `data.state[noteId].editorSettings["grid-json"]`) and survive cross-window transfer.
2. A note set to **Markdown / Svg / Html / Mermaid** renders + (where relevant) search-highlights via the v4 editor's Body.
3. The per-note **switch widget** lists exactly the language-gated set via `getSwitchOptions(language, undefined)` (no Todo/Link/RestClient/Graph/Draw/Log/Notebook), and switching runs the three-phase `switchFrom`→`restore` (per-note content preserved).
4. **Monaco notes** (A1): still render via `MiniTextEditor`; auto-height + search highlight unchanged; scroll position stable on virtualized remount.
5. `NoteItemEditModel` no longer references `ContentViewModelHost` / `acquireViewModel*` — grep returns zero hits in `note-editor/`.
6. Per-note **script run** (run / run-all buttons) still executes against the notebook page and groups output with the notebook.
7. NO regression in the **outer** NotebookEditor (US-557 behavior: search, category tree, tags, expand-note, the three drag-trait systems).
8. (If Phase 5 done) `page.asNotebook()` scripting API still works; `PageWrapper.asNotebook` no longer calls `acquireViewModel`.
9. `tsc --noEmit` + `npm run lint` clean on touched files.

---

## Files Changed (preliminary)

| Group | Files | Change |
|---|---|---|
| Framework | `base/v4/editorRegistry.ts` | `EditorModule.Body`, public module accessor (no `allowsEmbedded`) |
| Modules (×5) | `grid/`, `markdown/`, `svg/`, `html/`, `mermaid/` `index.tsx` | export `Body: XxxBody` (one line each) |
| Notebook inner | `note-editor/NoteItemEditModel.ts` | drop content-view machinery; add host-shim surface + `getEditorState`/`setEditorState` (~−80/+60 LOC) |
| Notebook inner | `note-editor/NoteItemActiveEditor.tsx` | route non-monaco → embedded v4 Body; keep MiniTextEditor for monaco |
| Notebook inner | `NoteItemViewModel.ts` | `_embeddedEditor` + `switchNoteEditor` + dispose |
| Notebook inner | `note-editor/NoteItemToolbar.tsx` | switch widget off `findCompatibleEditors` |
| Notebook outer | `NotebookEditor.ts`, `notebookTypes.ts` | per-note `editorSettings` accessors + type |
| Scripting (opt.) | `NotebookEditorFacade`, `PageWrapper.ts` | facade → v4 NotebookEditor |
| Docs | walkthrough `29-notebook.md` | IPM9 amendments |

**NOT changed (A1):** the 5 embeddable editor classes (`GridEditor.ts`, `MarkdownEditor.ts`, `SvgEditor.ts`, `HtmlEditor.ts`, `MermaidEditor.ts`) — zero edits, only their `index.tsx` gains a `Body` export. The 7 extension-gated editor classes (Todo/Link/RestClient/Graph/Draw/Log/Monaco) — fully untouched. `MiniTextEditor.tsx`, `NoteEditorModel`. **NOT deleted (gated on US-559):** `ContentViewModelHost.ts`, `ContentViewModel.ts`, `useContentViewModel.ts`, `AsyncEditor.tsx`, preserved-sibling legacy `XxxView`/`XxxViewModel`, `NotebookViewModel.ts`, `TextFileModel._vmHost`.

---

## Notes for the investigator
- Re-verify the IPM3 audit if more editors landed since 2026-05-27.
- The A1/A2 (IPM6) and approach A/B (IPM2) decisions gate scope — get user sign-off before implementing.
- `restore()` idempotency (the embed enabler) hinges on each editor's `if (!this._host)` + `if (!restored)` guards. Spot-check any editor added after this date for the same guards before embedding it.
