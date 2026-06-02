# US-597: `IPageHost` typing for `editor.page` (+ derived `editor.isMain`)

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 1a · **Status:** ✅ Implemented (2026-06-02) — `tsc --noEmit` + `eslint` clean; pending manual smoke test.

## Goal

Widen `editor.page` from the concrete `PageModel` to an **`IPageHost`** interface, so an editor's owner can be a `PageModel` today and a `BrowserPanelHost` (US-601) later. Introduce a derived **`editor.isMain`** getter (default impl) that views/models can read instead of comparing `page.state.mainEditorId` to ids.

**No behavior change.** PageModel stays the only host. `PageModel implements IPageHost`; every existing call through `editor.page` keeps working — page-only (main-editor-navigation) members become **optional** on the interface and their few call sites get optional-chaining (`?.`). This is the type/decoupling foundation that US-598–US-601 build on; it does **not** rewrite any view logic (the Link/Archive view `mainEditorId`→`isMain` rewrite is **US-600**; the Browser host is **US-601**).

## Background

### Current shape (verified 2026-06-02)

`EditorModel.page` is typed `PageModel | null` (`EditorModel.ts:60`), set via `setPage(page: PageModel | null)` (`:87`). The text host `TextFileModel` (in `TextEditorModel.ts`) carries its **own** `page: PageModel | null` (`:72`) + `setPage` (`:78`); editors forward into it via `host.setPage(this.page)`.

`PageModel` already exposes — as concrete members — everything the audit below needs; defining `IPageHost` as a structural subset and declaring `class PageModel implements IPageHost` should typecheck with **no PageModel body changes** (verify with `tsc`).

> **US-595 rename note:** the secondary-view family was already renamed (US-595). Use the **current** names: `secondaryViewsModel`, `setSecondaryViewsState`, `removeSecondaryView`, `expandPanel`, `secondaryView`. The EPIC-029 `IPageHost` draft predates the rename and uses old names (`removeSecondaryEditor`, etc.) — this doc supersedes it.

### `editor.page` usage audit (every member reached through `editor.page` / host `page`)

Grep across `editors/` + `ui/` (excludes the scripting `page` global and `ListItem.page` in `OpenTabsList`, which are unrelated). Members fall into **required** (every host, incl. Browser, has these) vs **optional** (main-editor navigation — a Browser host omits these):

| Member | Reached at | IPageHost |
|---|---|---|
| `id` | `SearchSecondaryView:17`, `ExplorerSecondaryView:54`, `ArchiveEditorView:27`, `ArchiveSecondaryView:33`, `VideoEditor` (×4), `LinkBody:36`, `LinkCategorySecondaryView:79`, `LinkTagsSecondaryView:188`, `BrowserEditor:140/171` | **required** |
| `state` (`TOneState<IPageState>`) | `CategoryEditor:66`, `LinkCategorySecondaryView:28`, `LinkTagsSecondaryView:180` (`useOptionalState(editor.page?.state, …)`) | **required** |
| `panelEditors` | `VideoEditor:285`, `CategoryEditor:71` | **required** |
| `activePanel` (read) | `ExplorerEditorModel:142`, `ArchiveEditor:113` | **required** |
| `expandPanel(id)` | `ExplorerEditorModel:106/114`, `ArchiveEditor:116`, `LinkEditor:401` | **required** |
| `setSecondaryViewsState(patch)` | `ExplorerSecondaryView:132` (panel close button) | **required** |
| `secondaryViewsModel` | `LinkBody:40` (`page?.secondaryViewsModel?.state`) | **required** |
| `canOpenNavigator(pipe?, filePath?)` | `PageToolbar:45` | **required** |
| `toggleNavigator(pipe?, filePath?)` | `PageToolbar:52` | **required** |
| `removeSecondaryView(editor)` | `ArchiveSecondaryView:51` | **required** |
| `getTransient` / `setTransient` | `VideoEditor:333/348` | **required** |
| `mainEditor` | `ArchiveSecondaryView:37` (`archiveModel === archiveModel.page?.mainEditor`) | **optional** |
| `mainEditorInstance` | `LinkEditor:356/391`, `TextEditorModel:137/141/146` | **optional** |
| `promoteSecondaryToMain(editor)` | `LinkCategorySecondaryView:46` | **optional** |
| `switchMainEditor(id)` | `PageToolbar:84` | **optional** |
| `setMainEditor` / `close` | *(not reached via `editor.page` today — only via concrete `PageModel` from `pagesModel`)* | optional (forward-compat) |

**Identity comparisons** (`page === model.page`, `pageModel !== model.page`) at `GridBody:65`, `MarkdownBody:49`, `TextChrome:49/130`, `BrowserEditor:277` need no change — the compared value is a concrete `PageModel`, which is assignable to `IPageHost`.

**Scripting `page` global (NOT `editor.page`) — exclude:** `NotebookEditor.ts:193`, `NoteItemEditModel.ts:299`, `ScriptPanel.tsx:37` (`page.content`). Confirmed unrelated.

### The two friction points the widening creates

1. **`pagesModel.focusPage(this.model.page)`** (`TextFileActionsModel.ts:105`). `focusPage(page: PageModel)` (`PagesNavigationModel.ts:46`) wants a concrete `PageModel`; after widening, `this.model.page` is `IPageHost`. → resolve with a localized `as PageModel` cast (we know it's a PageModel in Phase 1).
2. **Optional-member calls** must gain `?.`: `editor.page?.promoteSecondaryToMain(editor)` → `?.(editor)` (`LinkCategorySecondaryView:46`); `model.page?.switchMainEditor(newEditorId)` → `?.(…)` (`PageToolbar:84`). Optional-property *reads* (`mainEditor`, `mainEditorInstance`) need no extra `?.` — they already sit behind `page?.`.

### The `setPage` ripple (mechanical, every editor)

`EditorModel.page`/`setPage` widen to `IPageHost`. Because editors forward `host.setPage(this.page)`, the host's `page`/`setPage` (`TextFileModel`) must widen too. The ~14 subclass `setPage` overrides (`MonacoEditor`, `GridEditor`, `MarkdownEditor`, `MermaidEditor`, `SvgEditor`, `HtmlEditor`, `GraphEditor`, `LogViewEditor`, `RestClientEditor`, `NotebookEditor`, `TodoEditor`, `DrawEditor`, `LinkEditor`, `ArchiveEditor`, `ExplorerEditorModel`) each do `super.setPage(page); this._host?.setPage(page);`. TS method-parameter **bivariance** means leaving them as `PageModel | null` would still compile — but we **widen them all to `IPageHost | null`** for honesty and consistency (Concern A).

## Implementation Plan

> Order: (1) define `IPageHost`, (2) re-type base `EditorModel` + host `TextFileModel`, (3) widen the subclass `setPage` overrides, (4) `PageModel implements IPageHost`, (5) add `editor.isMain`, (6) fix the two friction call sites + cast, (7) `tsc --noEmit` + eslint and sweep any residual "not assignable to PageModel".

### Step 1 — Define `IPageHost`

New file `src/renderer/api/pages/IPageHost.ts`:

```ts
import type { TOneState } from "../../core/state/state";
import type { EditorModel, EditorOrHost } from "../../editors/base";
import type { IContentPipe } from "../types/io.pipe";
import type { ISecondaryViewsState, SecondaryViewsModel } from "../../ui/secondary-views/SecondaryViewsModel";
import type { IPageState } from "./PageModel";

/** The editor↔owner contract that `EditorModel.page` is typed as. `PageModel`
 *  implements it in full; a future `BrowserPanelHost` (US-601) implements the
 *  required members and omits the optional main-editor-navigation group. */
export interface IPageHost {
    // identity + reactive page state
    readonly id: string;
    readonly state: TOneState<IPageState>;

    // panels / sidebar — every host has panels
    panelEditors: EditorModel[];
    activePanel: string;
    expandPanel(panelId: string): void;
    setActivePanel(panel: string): void;
    setSecondaryViewsState(patch: Partial<ISecondaryViewsState>): void;
    secondaryViewsModel: SecondaryViewsModel | null;
    canOpenNavigator(pipe?: IContentPipe | null, filePath?: string): boolean;
    toggleNavigator(pipe?: IContentPipe | null, filePath?: string): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeSecondaryView(editor: any): Promise<void>;

    // transient store (survives navigation, cleared on close)
    getTransient<T>(key: string): T | undefined;
    setTransient(key: string, value: unknown): void;

    // ── OPTIONAL — main-editor navigation (a Browser host omits these) ──
    mainEditor?: EditorOrHost | null;
    mainEditorInstance?: EditorModel | null;
    setMainEditor?(editor: EditorModel | null): Promise<void>;
    switchMainEditor?(newEditorId: string): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promoteSecondaryToMain?(editor: any): Promise<void>;
    close?(): Promise<boolean>;
}
```

> `removeSecondaryView`/`promoteSecondaryToMain` keep the `any` param to match `PageModel`'s legacy-compat shim signatures (avoids a variance mismatch on `implements`). `IPageState` is imported type-only from `PageModel.ts` — a type-only circular import, which TS resolves fine; if it ever bites, lift `IPageState` into `IPageHost.ts` or a `page-types.ts`.

### Step 2 — Re-type base `EditorModel` + host `TextFileModel`

`src/renderer/editors/base/EditorModel.ts`:
- Replace `import type { PageModel } from "../../api/pages/PageModel";` (`:10`) with `import type { IPageHost } from "../../api/pages/IPageHost";`.
- `page: PageModel | null = null;` (`:60`) → `page: IPageHost | null = null;`.
- `setPage(page: PageModel | null)` (`:87`) → `setPage(page: IPageHost | null)`.

`src/renderer/editors/text/TextEditorModel.ts` (class `TextFileModel`):
- `page: PageModel | null = null;` (`:72`) → `IPageHost | null`.
- `setPage(page: PageModel | null)` (`:78`) → `IPageHost | null`.
- Add `import type { IPageHost }`; drop the `PageModel` type import if it becomes unused (verify — it may still be referenced elsewhere in the file).

### Step 3 — Widen the subclass `setPage` overrides

For each of the ~14 files (`MonacoEditor.ts:289`, `GridEditor.ts:437`, `MarkdownEditor.ts:249`, `MermaidEditor.ts:275`, `SvgEditor.ts:190`, `HtmlEditor.ts:190`, `GraphEditor.ts:371`, `LogViewEditor.ts:272`, `RestClientEditor.ts:328`, `NotebookEditor.ts:378`, `TodoEditor.ts:287`, `DrawEditor.ts:278`, `LinkEditor.ts:379`, `ArchiveEditor.ts:84`, `ExplorerEditorModel.ts:228`):
- `setPage(page: PageModel | null)` → `setPage(page: IPageHost | null)`.
- Add `import type { IPageHost } from "../../api/pages/IPageHost";`; remove the now-unused `PageModel` import **only if** the file doesn't reference `PageModel` elsewhere (grep each — several import `PageModel` solely for this signature).
- Bodies (`super.setPage(page); this._host?.setPage(page);`) are unchanged.

### Step 4 — `PageModel implements IPageHost`

`src/renderer/api/pages/PageModel.ts`:
- `export class PageModel implements IPageHost {` + `import type { IPageHost } from "./IPageHost";`.
- Make **no** member changes — the audit confirms PageModel already provides every required member with a compatible signature and every optional member concretely. `tsc` will flag any gap; if one appears, reconcile the signature on the interface side (don't change behavior).

### Step 5 — Add derived `editor.isMain`

`src/renderer/editors/base/EditorModel.ts`, near the standard getters (`:172+`):

```ts
/** True if this editor is its host's main (content-area) editor. Default
 *  derivation; a Browser host's embedded Link editor will hardcode this in
 *  US-601. Note: this getter is NOT reactive on its own — a view that must
 *  re-render on promote/demote subscribes to `editor.page?.state` (US-600). */
get isMain(): boolean {
    return this.page?.mainEditorInstance === this;
}
```

`mainEditorInstance` is optional on `IPageHost`, so `this.page?.mainEditorInstance` is `EditorModel | null | undefined`; `=== this` yields a clean boolean. **US-597 only introduces the getter** — it does not yet replace any `mainEditorId` read in the Link/Archive views (US-600 owns that, including its subscription strategy).

### Step 6 — Fix the friction call sites

- `LinkCategorySecondaryView.tsx:46`: `editor.page?.promoteSecondaryToMain(editor);` → `editor.page?.promoteSecondaryToMain?.(editor);`
- `PageToolbar.tsx:84`: `void model.page?.switchMainEditor(newEditorId);` → `void model.page?.switchMainEditor?.(newEditorId);`
- `TextFileActionsModel.ts:105`: `if (this.model.page) pagesModel.focusPage(this.model.page);` → `pagesModel.focusPage(this.model.page as PageModel);` (keep the `if`; add a short comment that the host is always a `PageModel` in Phase 1).

### Step 7 — Verify

`npx tsc --noEmit` + `npx eslint` on the changed files. The only expected residual errors after Steps 1–6 are further "Type 'IPageHost' is not assignable to 'PageModel'" at spots not yet found — for each, either add `?.` (optional-member call) or a localized `as PageModel` cast where the value is handed to a `PageModel`-typed API, and record it in the Files Changed table.

## Concerns / Open Questions

### Concern A — widen the subclass `setPage` overrides, or rely on bivariance? **Decision: widen all.**
TS method-parameter bivariance means a subclass `setPage(page: PageModel | null)` overriding the new `setPage(page: IPageHost | null)` base **compiles unchanged** — so doing nothing is zero compile-risk. But it leaves the override's declared type narrower than reality (a non-`PageModel` `IPageHost` could be passed and the body would mis-assume `PageModel`). The epic explicitly anticipates foundation tasks "touch every panel-contributing editor mechanically (… `editor.page` type)". **Widen all overrides to `IPageHost | null`** for an honest, consistent surface; the bodies are untouched, so behavior is identical.

### Concern B — `IPageHost` surface is larger than the EPIC-029 draft. **Resolved by the audit.**
The draft listed only `{id, panelEditors, activePanel, expandPanel, attach, removeSecondaryEditor, getTransient, setTransient}` + optional nav. The real audit adds **required** `state`, `secondaryViewsModel`, `setSecondaryViewsState`, `setActivePanel`, `canOpenNavigator`, `toggleNavigator`, and uses the **post-US-595** name `removeSecondaryView`. `attach` is **not** included — it's never reached via `editor.page` (PageModel-internal only). This doc's Step 1 list is authoritative; the epic draft is superseded.

**Three more members surfaced during implementation** (the grep audit missed them because the access target was a local `page` variable, not a literal `.page` chain) — all confirmed reached through `editor.page`, all added to the final `IPageHost`:
- `hasSidebar: boolean` (required) — `TextFileActionsModel.openSearchInNavPanel` (`page?.hasSidebar`).
- `ensureSecondaryViewsModel(): SecondaryViewsModel` (required) — `TextFileActionsModel.openSearchInNavPanel` (`page?.ensureSecondaryViewsModel()`).
- `pinned?: boolean` (**optional** — an embedded Browser host isn't a pinnable tab) — `PageWrapper.pinned` (`this.model.page?.pinned ?? false`).

### Concern C — `editor.isMain` is non-reactive by itself. **In scope boundary.**
A plain getter doesn't notify React. The Link views today get reactivity from `useOptionalState(editor.page?.state, s => s.mainEditorId, …)` — that subscription stays untouched here. **US-597 only adds the getter**; replacing the views' `mainEditorId` reads with `editor.isMain` (and choosing how those views stay reactive — e.g. keep subscribing to `page.state` for the signal while reading `editor.isMain` for the value) is **US-600**. Keeping it out of US-597 preserves "no behavior change".

### Concern D — provisional membership finalized at US-600. **Accepted.**
EPIC-029 Concern 2's governing principle: shape a minimal `IPageHost` now, finalize required/optional split during the LinkEditor migration (US-600). The required/optional split here (sidebar+identity+transient required; main-editor-nav optional) is the working hypothesis; US-600 may move a member if the Link editor's full exercise demands it.

### Concern E — `focusPage` cast vs. widening its contract. **Decision: localized cast.**
`PagesNavigationModel.focusPage(page: PageModel)` forwards to an `onFocus` subscription consumed by UI that expects a concrete `PageModel`. Widening `focusPage` to `IPageHost` would ripple into those subscribers for no Phase-1 benefit (the host is always a `PageModel` now). Use a single documented `as PageModel` cast at `TextFileActionsModel.ts:105`.

## Acceptance Criteria

- [x] `npx tsc --noEmit` and `npm run lint` pass with zero errors.
- [x] `IPageHost` is defined in `src/renderer/api/pages/IPageHost.ts` with the audited required/optional split; `class PageModel implements IPageHost` compiles with **no** PageModel member changes.
- [x] `EditorModel.page` and `TextFileModel.page` (+ their `setPage`) are typed `IPageHost | null`; all subclass `setPage` overrides widened to `IPageHost | null`.
- [x] `editor.isMain` getter exists on `EditorModel` (default `this.page?.mainEditorInstance === this`); no view's `mainEditorId` read was changed (that's US-600).
- [x] Optional-member calls use `?.` (`promoteSecondaryToMain`, `switchMainEditor`); `focusPage` call site casts `as PageModel`.
- [ ] App launches; Explorer / Archive (`.zip`) / Link / Video / Notebook / Todo / Rest Client editors all open, edit, and persist; sidebar toggle/resize/expand and the Link "Open as main editor" / Archive panel-close buttons behave exactly as before. *(manual)*

## Files Changed (summary)

| Area | File | Change |
|---|---|---|
| New interface | `api/pages/IPageHost.ts` | **NEW** — `IPageHost` (required core + optional main-editor-nav) |
| Owner | `api/pages/PageModel.ts` | `implements IPageHost` + import; no member changes |
| Base editor | `editors/base/EditorModel.ts` | `page`/`setPage` → `IPageHost`; swap `PageModel` import for `IPageHost`; add `isMain` getter |
| Text host | `editors/text/TextEditorModel.ts` | `page`/`setPage` → `IPageHost`; import swap |
| Editor subclasses (×15) | `MonacoEditor`/`GridEditor`/`MarkdownEditor`/`MermaidEditor`/`SvgEditor`/`HtmlEditor`/`GraphEditor`/`LogViewEditor`/`RestClientEditor`/`NotebookEditor`/`TodoEditor`/`DrawEditor`/`LinkEditor`/`ArchiveEditor`/`ExplorerEditorModel` | `setPage` override → `IPageHost`; import swap (Concern A) |
| Friction: optional-call | `link-editor/panels/LinkCategorySecondaryView.tsx` | `promoteSecondaryToMain?.(editor)` |
| Friction: optional-call | `editors/base/PageToolbar.tsx` | `switchMainEditor?.(newEditorId)` |
| Friction: cast | `editors/text/TextFileActionsModel.ts` | `focusPage(this.model.page as PageModel)` (Concern E) |

**No change:** the view-side `mainEditorId` reads in `LinkCategorySecondaryView`/`LinkTagsSecondaryView` (US-600); `ArchiveSecondaryView` `mainEditor`/`removeSecondaryView` (optional reads compile as-is); identity comparisons in `GridBody`/`MarkdownBody`/`TextChrome`/`BrowserEditor`; the scripting `page` global; `SecondaryViews.tsx`/`SecondaryViewsModel.ts` (US-596 done); panel string IDs; `secondaryViewRegistry`; `assets/editor-types/`.
