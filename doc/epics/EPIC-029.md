# EPIC-029: Standalone PageNavigator — a reusable panel-host for sidebars

## Status

**Status:** Design complete — all 8 concerns resolved. 13 implementation tasks placeholdered (US-595–US-607; see [Linked Tasks](#linked-tasks-implementation-order) and the dashboard), each investigated + detailed per-task before implementation. Implementation not yet started.
**Created:** 2026-06-01

## Overview

Extract the `PageNavigator` sidebar so it is no longer bound to `PageModel`, and make it the single mechanism every screen uses to render side panels. Today the navigator is hard-wired to a page: it takes `page: PageModel`, and editors/views reach their owner through `editor.page` typed as the concrete `PageModel`. Only Explorer, Archive, and Link use it; the Browser empty page and the Notebook / Todo / Rest Client / MCP Inspector / Storybook editors each hand-roll their own `<Panel>`+`<Splitter>` side panels.

The end state has two parts: (1) the component (renamed `PageNavigator` → **`SecondaryViews`**) becomes a **controlled component** — its parent passes the panel-contributing models (`views`) plus a controlled `ISecondaryViewsState` (`open`/`width`/`activePanel`) and a `setState`; it can be mounted anywhere (page sidebar **or** inside an editor's body, e.g. the Browser empty page). (2) `editor.page` is widened from the concrete `PageModel` to an **`IPageHost`** interface, so an editor's owner can be a Page, a Browser, or a future host.

> **Naming note:** the component is `PageNavigator` in today's code; this epic renames it (and its family) to `SecondaryViews` (Concern 8). This document uses **`SecondaryViews`** when describing the target design and **`PageNavigator`** when describing current code.

## Goals

- `SecondaryViews` (the renamed `PageNavigator`) becomes a **controlled component** — `views` + `ISecondaryViewsState` + `setState` props — no longer bound to `PageModel` (Concern 1).
- `editor.page` is widened from `PageModel` to an `IPageHost` interface; `PageModel` is one implementer, the Browser another. No behavior change for existing pages (Concern 2).
- **Rename `secondaryEditor` → `secondaryView` through *all* code** (and docs), including the persisted state field. A navigator panel is a *view* over an `EditorModel`, not an editor; the misnomer is a constant source of confusion. This is a committed deliverable of the epic, not optional cleanup (see Concern 7 for the persisted-key decision).
- The Browser hosts `SecondaryViews` inside its empty/blank page, driven by its own `bookmarks.linkEditor` — replacing the bespoke `BlankPageLinks` chrome. The Browser orchestrates both the navigator and the Link editor to render its empty page.
- `SecondaryViews` becomes mandatory/automatic for the Link editor: when a Link editor is open, its panels render in it with no in-editor panel duplication.
- Other side-panel editors (Notebook, Todo, Rest Client; MCP Inspector and Storybook decided per their own migration tasks) render their side panels through `SecondaryViews` instead of hand-rolled splitter layouts.

## Non-Goals

- New panel *types* or new editors. This is a relocation/decoupling refactor.
- Changing the look of existing panels. Visual parity is the target.
- Generalizing the navigator to right-side or tabbed panels at the epic level. If a specific editor (e.g. MCP Inspector, Storybook) needs it, that's decided in that editor's own migration task (Concern 5).

## Conceptual model & terminology

The intended mental model (confirmed 2026-06-01):

- **An editor *is* its `EditorModel`.** Everything else is a *view* over that model.
- A model has two view slots: a **main view** (rendered as the page's main editor) and one or more **secondary views** (rendered as panels inside `PageNavigator`).
- Both views hold the same `EditorModel` and may implement any editor-specific behavior. The model is the single source of truth; views are projections.
- `PageNavigator` is **just the host that renders an editor's secondary views**. It has no editor-specific knowledge. It provides each secondary view a panel with a header *container ref*; the view renders its own title/buttons into that container via React portals. Actions like "Open as main editor" belong to the view, not the navigator.

**This is already the live architecture, not a target.** `PageNavigator.tsx` only renders `CollapsiblePanel`s, exposes each header as a `headerRef`, lazy-loads the registered view (`LazySecondaryEditor`), and passes `{ model, headerRef }`. The view (e.g. `LinkCategorySecondaryEditor.tsx`) renders its header — including the "Open as main editor" `IconButton` — and portals it via `createPortal(headerContent, headerRef)`. The navigator mentions no button and no editor type. So the "dumb portal host + view-owned headers" design is in place today.

**The mismatch with this model** (the actual decoupling work):
- **Naming.** The term used throughout is `secondaryEditor`, but the thing is a *view*. Rename to `secondaryView` across the API surface: the `secondaryEditor` state field, `contributesPanels`/`panelEditors` derivations, `secondaryEditorRegistry` + `secondary-editor-registry.ts` + `SecondaryEditorProps`, `LazySecondaryEditor`, `addSecondaryEditor` shims, and all registrations. Scope: ~579 occurrences across 52 files (~16 source files carry the meaningful references; remainder are docs + generated graphs). See Concern 7.

**Not a PageNavigator concern, but still a typing fix:** a secondary view calling `editor.page?.promoteSecondaryToMain(editor)` (the "Open as main editor" handler in `LinkCategorySecondaryEditor.tsx:46`) is fine — it lives inside the Link editor's *own* view, which is allowed full model/host access; PageNavigator never sees it. The call stays in the view. What *does* change (decided 2026-06-01): `editor.page` is re-typed from concrete `PageModel` to an `IPageHost` interface, because an owner can be a Page **or** a Browser. Page-only members become optional and are called with optional chaining (`editor.page?.promoteSecondaryToMain?.(editor)`). See "Host contracts" below and Concern 2.

## Current Situation (analysis)

### Three pieces hide behind "PageNavigator"

| Piece | File | Role | Coupling today |
|---|---|---|---|
| `PageNavigator` (component) | `src/renderer/ui/navigation/PageNavigator.tsx` | Renders the collapsible panel stack | Takes `page: PageModel` |
| `PageNavigatorModel` | `src/renderer/ui/navigation/PageNavigatorModel.ts` | Pure layout state `{open, width}` | **Already standalone** (only needs a `pageId` string for one event) |
| `NavigationContent` (mount) | `src/renderer/ui/app/Pages.tsx:48` | Places navigator + splitter in the page layout | Takes `page: PageModel` |

The **rendering layer is already page-agnostic**: each panel is rendered generically via `LazySecondaryEditor`, which looks the panel ID up in `secondaryEditorRegistry`, dynamically imports the component, and passes `{ model, headerRef }` (portal-based header). The registry + lazy-load + portal mechanism need no change.

### PageNavigator's actual read surface (thin)

From `PageNavigator.tsx:15-84` — the entire coupling of the component itself:

- `page.state.use()` → a `version` counter for re-render
- `page.panelEditors` → `EditorModel[]` (`PageModel.ts:139` = `editors.filter(e => e.contributesPanels())`, explorer sorted first)
- `page.activePanel` (string) + `page.setActivePanel(id)`

`NavigationContent` (`Pages.tsx:48-78`) additionally uses `page.state.use(s => s.hasSidebar)`, `page.ensurePageNavigatorModel()`, `navModel.state.use()` → `{open, width}`, and `navModel.setWidth`.

### The real coupling lives *under* the component — and it is the editor↔owner boundary, not the navigator

**Already decoupled (no work needed):** the `secondaryEditor` setter (`EditorModel.ts:145`) is a *pure state mutation* — its own comment reads "no side effects on `page`". A model simply declares *"these are my panels"* in its state; `PageModel.attach()` **observes** that slice (`onEditorPanelsChanged`, `PageModel.ts:284`) and reacts. `addSecondaryEditor` / `removeSecondaryEditorWithoutDispose` are now compat shims (`PageModel.ts:234`). So PageNavigator already neither adds nor removes panels — EPIC-028 made panel contribution a state declaration the host observes. *(An earlier draft of this epic wrongly claimed the setter calls `this.page?.addSecondaryEditor` — that described the pre-EPIC-028 architecture doc, not the live code.)*

**Views reach their owner through `editor.page` — and that is allowed.** Secondary views call owner methods through `editor.page` (today typed `PageModel | null`, `EditorModel.ts:60`). These calls live **inside the editors' own views/models**, not in `PageNavigator` — a view is entitled to act on its model and its model's owner — so they are not a *navigator* concern. But the static *type* `PageModel` is wrong for the new design: an editor's owner can be a Page **or** a Browser (or future host). **Decision (2026-06-01):** widen `editor.page` to an `IPageHost` interface (see below). Page-specific members become optional and are called with optional chaining, e.g. `editor.page?.promoteSecondaryToMain?.(editor)`.

**Navigation lifecycle** (`beforeNavigateAway`, `onMainEditorChanged`, panel-survival) remains owner machinery driven by main-editor changes — relevant to page hosts, inert for static panels (see Concern 3).

### Host contracts: controlled `SecondaryViews` props + `IPageHost` (`editor.page`)

The decoupling produces **two** distinct shapes — keep them separate:

**1. `SecondaryViews` component props.** The component is *controlled*, so it needs **no host interface** (an earlier draft proposed an `IPanelHost` here; Concern 1 dissolved it into props):

```ts
interface ISecondaryViewsState { open: boolean; width: number; activePanel: string; }

function SecondaryViews(props: {
    views: EditorModel[];                                      // = owner.panelEditors
    state: ISecondaryViewsState;                               // owner-held
    setState: (patch: Partial<ISecondaryViewsState>) => void;  // owner-provided; carries side effects
}): JSX.Element;
```

**2. `IPageHost`** — the **editor↔owner** contract that `editor.page` is typed as. `PageModel` implements it in full; a `BrowserPanelHost` implements the required members and omits the optional main-editor-navigation group. Membership is **provisional**, finalized at the LinkEditor migration (Concern 2).

```ts
interface IPageHost {
    readonly id: string;
    panelEditors: EditorModel[];        // read by some editors (Video, Category); also fed to SecondaryViews as `views`
    activePanel: string;                // read by some views (Archive, Explorer); read-through to owner's ISecondaryViewsState
    expandPanel(id: string): void;
    // membership + transient
    attach(e: EditorModel): void;
    removeSecondaryEditor(e: EditorModel): void;
    getTransient<T>(k: string): T | undefined;
    setTransient(k: string, v: unknown): void;

    // ── PROVISIONAL — navigator visibility (Concern 2a). Visibility is host-derived
    //    (show iff ≥1 secondary view); `ensurePageNavigatorModel` removed; the
    //    Explorer-only-closeable rule stays internal to PageModel. These survive
    //    only if the toolbar button still queries the host — settle at LinkEditor migration.
    hasSidebar?: boolean;
    canOpenNavigator?(...): boolean;

    // ── OPTIONAL — main-editor navigation (a Browser host omits these) ──
    mainEditorInstance?: EditorModel | null;
    setMainEditor?(e: EditorModel | null): Promise<void>;
    switchMainEditor?(id: string): Promise<void>;
    promoteSecondaryToMain?(e: EditorModel): Promise<void>;   // call: editor.page?.promoteSecondaryToMain?.(editor)
    close?(): Promise<boolean>;
}
// `mainEditorId` (Concern 2b) is NOT a member — views read a derived `editor.isMain` on the
// model instead (Page: mainEditorInstance===this; Browser: true for the embedded Link editor).
```

Phase 1 widens `editor.page` to `IPageHost`, converts page-only call sites to optional chaining, and audits each editor for correct use.

**Audit — every member reached through `.page`** (grep across `editors/` + `ui/navigation/`), which drove the split above:

| Group | Members | Disposition |
|---|---|---|
| Navigator render | `setActivePanel` + reactive `state` (version) → `SecondaryViews` controlled props (`setState`/`state`, Concern 1); `panelEditors` + `activePanel` (read) → also `IPageHost` (the owner produces them) | split |
| Panel/identity | `id`, `expandPanel` | `IPageHost` required |
| Navigator layout | `pageNavigatorModel`, `ensurePageNavigatorModel`, `hasSidebar`, `canOpenNavigator`, `toggleNavigator` | mostly dissolves (Concern 2a): `ensure…` removed, `toggle…`→`setState`, `hasSidebar`/`canOpenNavigator` provisional-optional |
| Membership | `attach`, `removeSecondaryEditor` | `IPageHost` required |
| Transient | `getTransient`, `setTransient` | `IPageHost` required |
| Main-editor nav | `mainEditor(Instance)`, `setMainEditor`, `switchMainEditor`, `promoteSecondaryToMain`, `close`, `editors` | `IPageHost` **optional** |
| `state.mainEditorId` | (read by Link view) | replaced by derived `editor.isMain` (Concern 2b) — not on host iface |

**False positives excluded:** `page.content` at `NotebookEditor.ts:193`, `NoteItemEditModel.ts:299`, `ScriptPanel.tsx:37` is the **scripting `page` global**, not `editor.page`. The per-editor review must disambiguate the two `page`s.

### Browser empty page today

The Browser is itself a `mainEditor` on its own `PageModel`. Its blank-tab UI is hand-rolled in `BrowserView.tsx:278-300` (`BlankPageLinks`): renders `LinkBreadcrumbBits` + `LinkActionBits` + `LinkBody` directly from `model.bookmarks.linkEditor` (a `LinkEditor` the browser owns privately). It does **not** use the navigator or the registry. This is the duplication this epic removes.

### Other side-panel editors (survey)

None use the secondary-editor system; each renders its panel inline with its own `<Panel>`+`<Splitter>` and own width state:

| Editor | Panel shape | Fit for a left-stack navigator |
|---|---|---|
| Notebook (`NotebookBody.tsx:150-258`) | Left collapsible stack (tags + category tree), ~110 lines | ✅ Clean fit |
| Todo (`TodoBody.tsx` + `TodoListPanel.tsx`, ~380 lines) | Single left panel (lists + tags) | ✅ Fit |
| Rest Client (`RestClientBody.tsx:71-100`) | Single left request tree, ~67 lines | ✅ Fit |
| MCP Inspector (`McpInspectorView.tsx`) | **Tabbed** (SegmentedControl), not a left stack | ⚠️ Different paradigm — needs design |
| Storybook (`StorybookEditorView.tsx:54-78`) | Left **and** right panels | ⚠️ Navigator is single left stack; right "property editor" doesn't fit |

### Verdict

The component is ~90% there; the subsystem under it is not. Realizing the vision means: making `SecondaryViews` a controlled component (props, not a host interface — Concern 1), widening `editor.page` to `IPageHost` (Concern 2), and the `secondaryEditor`→`secondaryView` / `PageNavigator`→`SecondaryViews` rename (Concerns 7 & 8) — not rewriting the navigator. Views' internal use of `editor.page` is otherwise left as-is.

## Proposed Phases

> Increasing scope; the epic can stop after any phase and still have shipped value.
>
> **Current focus (2026-06-01):** the **epic core** — Phase 1 (PageNavigator → `SecondaryViews` refactor) plus migrating the **existing** secondary-view editors (Explorer, Links, Archive). Browser adoption (Phase 2) and other-editor migrations (Phase 3) follow.
>
> **Per-editor principle:** every editor migration is its **own task**; editor-specific concerns are resolved during that task's investigation, and an editor's view may change a bit to fit `SecondaryViews` where needed (Concern 5). Mirrors EPIC-028's per-editor task model.

### Phase 1 — Core: navigator refactor + existing secondary-view editors

**1a. Decouple the navigator (foundation, no behavior change):**

- Make `SecondaryViews` a **controlled component**: props `views` (= `host.panelEditors`) + `state: ISecondaryViewsState` + `setState`. It depends on no host interface (Concern 1). Move the container + splitter into the component so it is self-contained and mountable anywhere.
- Unify `open`/`width`/`activePanel` into one owner-held `ISecondaryViewsState` (in `SecondaryViewsModel`). Wire side effects into the owner's `setState` (`onPanelExpanded` notify, `secondaryViewsToggled` fire). Removes the split-ownership smell (Concern 1).
- Define `IPageHost` (the `editor.page` contract, required/optional split above) and re-type `EditorModel.page` from `PageModel` → `IPageHost` (`EditorModel.ts:60`). Convert page-only call sites to optional chaining (e.g. `editor.page?.promoteSecondaryToMain?.(editor)`).
- **Audit every editor model + view** for `.page` usage: classify each accessed member as required vs optional, disambiguate the scripting `page` global from `editor.page`, and confirm optional members are only ever called optionally (Concern 2).
- Rename `secondaryEditor` → `secondaryView` across the API surface (state field, registry, props, shims, registrations) and `PageNavigator` → `SecondaryViews` family (Concerns 7 & 8).
- PageModel remains the only host. Pure refactor, testable against existing pages.

**1b. Migrate the existing secondary-view editors** (Explorer, Links, Archive) onto the new API — each its own task:

- These three already use the secondary-view system, so they validate the refactor end-to-end.
- The **Links** migration is the forcing function that finalizes `IPageHost` membership and the derived `isMain` (Concern 2).
- No EPIC-028 coordination needed — EPIC-028 shipped in v4.0.1; this epic builds on its final state (Concern 6).

### Phase 2 — Browser adopts the navigator (vision bullets 1–3)

- Add `BrowserPanelHost` (an `IPageHost` owner) holding the browser's `bookmarks.linkEditor` (and future panels), plus its own `ISecondaryViewsState`.
- Replace `BlankPageLinks` with a mounted `<SecondaryViews views={host.panelEditors} state={…} setState={…} />` inside the empty-page area; the Browser orchestrates the navigator + Link editor.
- Make the Link panels mandatory/auto-shown for the Link editor in this context (no in-editor panel duplication).
- Persistence: browser `ISecondaryViewsState` (`open`/`width`/`activePanel`) lives in **browser state**, not the page sidebar cache (Concern 4, resolved).

### Phase 3 — Migrate other editors (vision bullet 4)

- Notebook → Todo → Rest Client as registered secondary views (clean fits) — **each its own task**. Deletes substantial duplicated splitter/width code.
- No special static-panel mechanism needed (Concern 3): these editors rely on the base `EditorModel` hook defaults; survival hooks are only ever called by a navigating Page host.
- MCP Inspector (tabbed) and Storybook (dual-panel): decided in their own migration tasks (may change the view, or skip migration) — not an epic-level decision (Concern 5).

## Concerns / Open Questions

> Discussed one by one and resolved before the relevant phase starts. Each concern is its own subsection below; update its **Status** line as decisions land.

**Quick status:**

| # | Concern | Status |
|---|---------|--------|
| 1 | `activePanel` / navigator state | ✅ decided |
| 2 | `editor.page` → `IPageHost` | ✅ resolved (provisional membership) |
| 3 | Navigation survival vs static panels | ✅ resolved (no logic change) |
| 4 | Persistence boundaries | ✅ resolved |
| 5 | MCP Inspector / Storybook fit | ✅ resolved (per-editor task) |
| 6 | EPIC-028 sequencing | ✅ resolved (EPIC-028 shipped) |
| 7 | `secondaryEditor` → `secondaryView` rename | ✅ decided (persisted key: reset-to-default) |
| 8 | `PageNavigator` → `SecondaryViews` naming | ✅ decided (`SecondaryViews`) |

---

### Concern 1 — `activePanel` location / navigator state

**Status: ✅ DECIDED (2026-06-01).** Open detail: is `setState` a partial-merge `(p: Partial<ISecondaryViewsState>) => void` (preferred) or full-replace?

Unify the three layout fields into one owner-held object and make `SecondaryViews` a **controlled component**:

```ts
interface ISecondaryViewsState { open: boolean; width: number; activePanel: string; }
<SecondaryViews views={host.panelEditors} state={secondaryViewsState} setState={setSecondaryViewsState} />
```

- `open`/`width` (today on `PageNavigatorModel`) and `activePanel` (today loose on `PageModel`) collapse into `ISecondaryViewsState`, owned by the parent (Page / Browser). `SecondaryViewsModel` holds it.
- **Consequence:** `IPanelHost` mostly dissolves — the component depends only on its props (`views` + `state` + `setState`), not on any host interface. (`IPageHost`, the editor↔owner contract in Concern 2, is unaffected.) This supersedes the earlier "navigator depends on `IPanelHost`" framing.
- **`setState` carries the side effects** (owner-provided): `setState({ activePanel })` still notifies the owning view's `onPanelExpanded` and fires `panelExpanded`; `setState({ open })` still fires `secondaryViewsToggled`. The component stays dumb.
- **Ripple:** `secondaryViewsToggled` now fires from the owner's `setState` path rather than a model method — equivalent behavior, relocated (LinkEditor/LinkBody subscribers unchanged). Partially resolves Concern 4.

---

### Concern 2 — `editor.page` type → `IPageHost`

**Status: ✅ shape DECIDED (Phase 1); membership provisional, finalized at LinkEditor migration.**

`editor.page` is re-typed from concrete `PageModel` to an `IPageHost` interface so an owner can be a Page, a Browser, or a future host. Page-specific members (main-editor navigation: `promoteSecondaryToMain`, `setMainEditor`, `switchMainEditor`, `close`, `mainEditorInstance`) are **optional** and called with optional chaining (`editor.page?.promoteSecondaryToMain?.(editor)`); a Browser host omits them. Draft interface + member audit are in "Host contracts" above.

**Governing principle:** shape a *minimal* initial `IPageHost` now; finalize its exact required/optional membership during the **LinkEditor migration** (the editor that exercises the full surface). Treat the navigator-layout group and `mainEditorId` as provisional.

**(a) Navigator-layout group → mostly dissolves into host-internal logic (resolved).** Navigator visibility is *derived*, not commanded — the host shows the navigator iff it has ≥1 secondary view — so **`ensurePageNavigatorModel` is removed**. The "closeable when only Explorer is present" rule is Page-specific (Explorer is Page-managed) and stays internal to `PageModel`, not in `IPageHost`. `toggleNavigator` becomes `setState({ open })` (Concern 1). `hasSidebar`/`canOpenNavigator` are **provisional** — kept only if the toolbar navigator button still needs to query the host.

**(b) `mainEditorId` → expose a derived `isMain` on the model (resolved).** Instead of the view reading raw `host.state.mainEditorId` and comparing ids, the **model** exposes `isMain` (= "does my host treat me as its main content?"): Page host → `page.mainEditorInstance === this`; Browser host → `true` for the embedded Link editor. The view reads `editor.isMain`, so `mainEditorId` need not be a required `IPageHost` member. Fallback if deriving is fiddly: required + no-op + Browser hardcode.

---

### Concern 3 — Navigation survival vs static panels

**Status: ✅ RESOLVED (2026-06-01) — no change to current logic.**

`beforeNavigateAway` / `onMainEditorChanged` are **editor-side hooks on `EditorModel`** (defaults at `EditorModel.ts:122` / `:128`; overridden only by `ExplorerEditorModel`, `ArchiveEditor`, `LinkEditor`). The **Page is the sole caller** — `setMainEditor` invokes `beforeNavigateAway` (`PageModel.ts:313`) and `notifyMainEditorChanged` invokes `onMainEditorChanged` (`PageModel.ts:379`, fired from `setMainEditor` at `:328`; promote/demote routes through `setMainEditor`). No other call site exists.

**Resolution:** nothing changes.
- These hooks are **not** part of `IPageHost` — the host *calls* them on its editors, it doesn't expose them.
- A **non-navigating host (Browser / embedded)** has no main-editor-swap flow, so it simply **never calls them** — dormant for static panels, nothing to opt out of.
- A **Pattern-B static panel on a Page** (e.g. Notebook-as-main with a side panel) relies on the **base default** (`beforeNavigateAway` clears its panel), which is already correct — editor and panel disappear together. No override needed.

So "static" is not a new registration flavor or flag — it just means *"hosted by an owner that doesn't swap a main editor"* (or relies on the default). The hooks stay as optional-override methods with good defaults; the Page calls them, editors react if needed, the Browser never calls them.

---

### Concern 4 — Persistence boundaries

**Status: ✅ RESOLVED (2026-06-01).**

Each owner keeps its own `ISecondaryViewsState` and is responsible for saving/restoring it. **Page** persists it in its descriptor (today `PageModel.getDescriptor().sidebar`). **Browser** persists it in its own browser state. No shared/global persistence — the state travels with whoever owns the `SecondaryViews` mount. Follows directly from Concern 1 (state is owner-held).

---

### Concern 5 — MCP Inspector / Storybook fit (and per-editor concerns generally)

**Status: ✅ RESOLVED (2026-06-01) — deferred to per-editor migration tasks.**

Editor-specific fit (MCP Inspector's tabbed `SegmentedControl`, Storybook's dual left+right panels, and any other editor's quirks) is **not** decided up front in this epic. Each editor migration is planned as **its own task**, and editor-specific concerns are resolved during that task's investigation. Changing an editor's view a bit (to fit the `SecondaryViews` model) is acceptable where needed. Whether MCP Inspector / Storybook are migrated at all — or left as-is — is a per-task decision, not an epic-level one.

---

### Concern 6 — Relationship to EPIC-028 (sequencing)

**Status: ✅ RESOLVED (2026-06-01) — EPIC-028 is complete; no sequencing constraint.**

[EPIC-028](EPIC-028.md) shipped in **v4.0.1** (closed 2026-05-29; recorded in [`completed.md`](completed.md)). *(The standalone `EPIC-028.md` Status line still read "in progress" — that was stale and has been corrected.)* It already delivered the single-`EditorModel` hierarchy, the secondary-editor system, and `PageModel.editors[]` / `panelEditors` / `contributesPanels()` — i.e. **all of this epic's analysis was done against the finished post-EPIC-028 code.** Consequence: there is no in-flight churn to coordinate around. EPIC-029 builds directly on the final state; the renames (Concerns 7 & 8) run independently — US-582 (V4-prefix cleanup) is already done, so there is no naming pass to fold into.

---

### Concern 7 — `secondaryEditor` → `secondaryView` rename

**Status: ✅ DECIDED. (EPIC-028 coordination no longer applies — Concern 6 resolved.)**

Committed goal: rename through *all* code (~579 hits / 52 files; ~16 meaningful source files + docs + generated graphs). **Decision:** option (a) — rename the **persisted** `secondaryEditor` field on `IEditorState` (`src/shared/types.ts`) too. (Rejected option (b): keeping the on-disk key while renaming only the in-memory API — leaves the misnomer in the persistence format.) Since EPIC-028 already shipped (v4.0.1), this is no longer a same-time-as-US-582 coordination question — EPIC-029 does the rename independently. **Persisted-key migration (DECIDED 2026-06-01): accept reset-to-default.** On load, a saved editor state with the old `secondaryEditor` key (and no `secondaryView`) simply yields no `secondaryView` → the editor re-derives its panel list on first open. No read-shim. It's low-stakes layout state, so the one-time reset is acceptable.

---

### Concern 8 — Component + family naming: `PageNavigator` → `SecondaryViews`

**Status: ✅ DECIDED (2026-06-01) — component name is `SecondaryViews`.**

"Page" was misleading (no longer page-bound) and "Navigator" oversold it (it renders a stack of views, it doesn't navigate). The component is named **`SecondaryViews`** (the `SecondaryViewStack` alternative was not chosen). Deliberately **not** "SecondaryPanels" — we distinguish a *secondary view* (the registered content component) from a *panel* (the `CollapsiblePanel` chrome slot it renders into); "Panels" would reintroduce the misnomer. The whole family aligns to the `secondaryView` vocabulary — cascade to rename together:

| Today | Proposed |
|---|---|
| `PageNavigator` (component) | `SecondaryViews` |
| `PageNavigatorModel` (open/width layout) | `SecondaryViewsModel` |
| `pageNavigatorModel` (field on `PageModel`) | `secondaryViewsModel` |
| `ensurePageNavigatorModel()` | `ensureSecondaryViewsModel()` |
| `pageNavigatorToggled` (event) | `secondaryViewsToggled` |
| `NavigationWrapper` / `NavigationContent` (`Pages.tsx`) | `SecondaryViewsWrapper` / `SecondaryViewsContent` |
| folder `ui/navigation/` | `ui/secondary-views/` |
| doc `architecture/secondary-editors.md` | `secondary-views.md` |

Folds into the Concern 7 rename pass (same files; EPIC-028 complete, so no coordination).

## Linked Tasks (implementation order)

Placeholders — title + scope only. Each gets its own deep-investigation pass and detailed task document immediately before implementation (per the project's task-creation workflow). **Every task leaves Persephone compiling and runnable**, with all editor types still opening/editing/persisting; tasks are sequenced so no step leaves the app broken.

Foundation tasks (US-595–597) necessarily touch every panel-contributing editor mechanically (shared base-class field + `editor.page` type); the per-editor tasks then own each editor's *specific* adoption.

| ID | Title | Phase | Scope (one line) |
|----|-------|-------|------------------|
| US-595 | Rename pass: `secondaryEditor`→`secondaryView` + `PageNavigator`→`SecondaryViews` family | 1a | Mechanical, no behavior change. Includes persisted-key reset-to-default (Concern 7). |
| US-596 | `ISecondaryViewsState` + controlled `SecondaryViews` component | 1a | Unify `open`/`width`/`activePanel`; container+splitter into the component; owner-provided `setState` carries side effects (`onPanelExpanded`, `secondaryViewsToggled`). PageModel as owner (Concern 1). |
| US-597 | `IPageHost` typing for `editor.page` | 1a | Define `IPageHost` (+ `IPanelHost` if useful); re-type `EditorModel.page`; optional members + optional chaining; introduce derived `editor.isMain` (default); `.page` usage audit (Concern 2). |
| US-598 | Explorer — adopt + verify under new infra | 1b | Explorer/search panels, `expandPanel` via new state; handle specifics from investigation. |
| US-599 | Archive — adopt + verify under new infra | 1b | `archive-tree` panel; survival hooks unchanged (Concern 3). |
| US-600 | Links — finalize `IPageHost` membership + `isMain` | 1b | Category/tags/hostnames panels; replace in-view `mainEditorId`/`editor.page` reads with `isMain`; the editor that exercises the full surface (Concern 2). |
| US-601 | Browser adopts `SecondaryViews` in its empty page | 2 | `BrowserPanelHost` + mount `SecondaryViews`; retire `BlankPageLinks`; Link panels mandatory there; browser-state persistence (Concern 4). |
| US-602 | Notebook → `SecondaryViews` | 3 | Migrate the tags/category side panel; delete bespoke splitter/width code. |
| US-603 | Todo → `SecondaryViews` | 3 | Migrate the lists/tags side panel. |
| US-604 | Rest Client → `SecondaryViews` | 3 | Migrate the request-tree side panel. |
| US-605 | MCP Inspector — evaluate (migrate with view change, or skip) | 3 | Tabbed `SegmentedControl` doesn't fit a left stack; per-task decision (Concern 5). |
| US-606 | Storybook — evaluate (migrate with view change, or skip) | 3 | Dual left+right panels; per-task decision (Concern 5). |
| US-607 | Epic close-out — `/review` + `/document` + `/userdoc`; move to `completed.md` | 4 | May split into audit / dev-doc / user-doc like EPIC-028 if scope warrants. |

**Stop points:** the epic delivers value at the end of Phase 1b (navigator fully refactored + existing editors migrated), again after Phase 2 (Browser), and again after each Phase 3 editor — it can pause at any of these.

## Notes

### 2026-06-01 — implementation plan: 13 placeholder tasks (US-595–US-607)
- Concern 7 persisted-key detail decided: **accept reset-to-default** (no read-shim).
- Carved the epic into 13 ordered placeholder tasks across Phases 1a/1b/2/3/4 (US-595–US-607), each leaving Persephone compiling & runnable. Foundation (595–597) → existing editors Explorer/Archive/Links (598–600) → Browser (601) → Notebook/Todo/Rest + MCP/Storybook eval (602–606) → close-out (607). Recorded in Linked Tasks and on the dashboard. Tasks are placeholders; each gets its own investigation + detailed doc before implementation.

### 2026-06-01 — decided Concern 8: component name is `SecondaryViews`
- User confirmed `SecondaryViews` (over the `SecondaryViewStack` alternative). Family rename cascade stands. Marked Concern 8 decided.

### 2026-06-01 — resolved Concern 6: EPIC-028 is complete (no sequencing constraint)
- User noted EPIC-028 is finished and not on the dashboard. Verified: it's in `completed.md` (US-582/583/584/585 all `[x]`) and closed in commit `4b8a2b5`, shipped v4.0.1 (closed 2026-05-29).
- The "in progress" I'd cited came from a **stale Status line in `EPIC-028.md`** itself — corrected that doc to ✅ COMPLETE with a pointer to `completed.md`.
- Concern 6 resolved: all EPIC-029 analysis was already done against the finished post-EPIC-028 code, so there's no churn to coordinate. Concern 7 sequencing closes too (US-582 done). New small open detail on Concern 7: the renamed *persisted* key now needs its own migration handling (one-time read-shim or accept reset-to-default), since EPIC-028's cut-over is already past.

### 2026-06-01 — resolved Concern 5 + scope steer: core first, per-editor tasks
- Concern 5 (MCP/Storybook fit) deferred to per-editor migration tasks; editor-specific concerns resolved during each task's investigation; views may change a bit; migrating those two at all is a per-task call.
- Added the per-editor-task principle to the Phases intro (mirrors EPIC-028).
- Scope steer recorded: epic **core** = Phase 1 navigator refactor + migrating the existing secondary-view editors (Explorer, Links, Archive). Split Phase 1 into 1a (navigator refactor) + 1b (existing-editor migration). Browser (Phase 2) and other-editor migrations (Phase 3) follow.

### 2026-06-01 — resolved Concern 4: each owner persists its own state
- Page keeps its `ISecondaryViewsState` in its descriptor; Browser keeps its own in browser state. No shared/global persistence — follows from Concern 1 (owner-held state). Updated the Phase 2 persistence bullet.

### 2026-06-01 — resolved Concern 3: survival hooks unchanged
- Confirmed `beforeNavigateAway`/`onMainEditorChanged` live on `EditorModel` (defaults + ExplorerEditorModel/ArchiveEditor/LinkEditor overrides) and are called **only** by `PageModel` during a main-editor swap (`setMainEditor`/`notifyMainEditorChanged`).
- Resolution: no logic change. Hooks aren't part of `IPageHost`; non-navigating hosts (Browser/embedded) never call them; Pattern-B static panels on a Page rely on the correct base default. "Static" needs no new registration flavor. Updated the Phase 3 bullet that previously assumed one.

### 2026-06-01 — resolved Concern 2 sub-questions (a) navigator-layout, (b) mainEditorId
- Governing principle agreed: shape a minimal initial `IPageHost`; finalize required/optional membership during the LinkEditor migration (the editor that exercises the full surface).
- (a) Navigator-layout group mostly dissolves: visibility is host-*derived* (show iff ≥1 secondary view) so `ensurePageNavigatorModel` is removed; the Explorer-only-closeable rule stays internal to `PageModel`; `toggleNavigator`→`setState({open})`; `hasSidebar`/`canOpenNavigator` provisional-optional.
- (b) `mainEditorId` replaced by a derived `editor.isMain` on the model (Page: `mainEditorInstance===this`; Browser: `true` for the embedded Link editor). View reads `editor.isMain`; `mainEditorId` need not be a required host member. Fallback: required + no-op + Browser hardcode.
- Updated Concern 2, the `IPageHost` draft, and the audit table.

### 2026-06-01 — decision (Concern 1): controlled `SecondaryViews` with unified `ISecondaryViewsState`
- User: `activePanel` is navigator state owned by the parent. Define `ISecondaryViewsState { open, width, activePanel }`; pass `<SecondaryViews state={...} setState={...} />` so the parent controls it and the component can still request changes.
- Accepted and refined: `SecondaryViews` becomes a controlled component (`views` + `state` + `setState`); **`IPanelHost` mostly dissolves** (no host interface needed by the component). Side effects (`onPanelExpanded`, `secondaryViewsToggled`) live in the owner's `setState`. Container + splitter move into the component. Partially resolves Concern 4 (each owner persists its own state).
- Updated Concern 1 (decided), the Host-contracts section, Phase 1, and Concern 4.

### 2026-06-01 — proposal: rename `PageNavigator` → `SecondaryViews` (component + family)
- User proposed renaming `PageNavigator` (suggested `SecondaryViews` / `SecondaryPanels`).
- Recommended `SecondaryViews` and a consistent family rename (model, field, event, wrappers, folder, doc) — recorded as Concern 8. Advised against "SecondaryPanels" to preserve the view-vs-panel distinction. Folds into the Concern 7 rename pass. Pending: confirm `SecondaryViews` vs `SecondaryViewStack`.

### 2026-06-01 — decision: `secondaryEditor` → `secondaryView` is a committed full rename
- User asked to rename through *all* code to remove the misnomer (a panel is a *view*, not an editor). Elevated from a Phase-1 sub-bullet to a first-class Goal.
- Concern 7 resolved to option (a): rename the **persisted** `secondaryEditor` field too (not just the in-memory API), leaning on EPIC-028's planned old-session-data cut-over (US-559) so no migration shim is needed.
- Left open: coordinating the rename with EPIC-028 (which churns the same symbols; US-582 was a naming pass) so symbols aren't renamed twice — ties to Concern 6 sequencing.

### 2026-06-01 — conceptual model: editor = model, panels = secondary *views*
- Agreed framing: an editor *is* its `EditorModel`; the main editor and the navigator panels are both *views* over that model, each with full model access.
- Confirmed the "dumb portal host + view-owned headers" design is **already implemented**: `PageNavigator` exposes a `headerRef` per panel and lazy-loads the registered view with `{ model, headerRef }`; the view (e.g. `LinkCategorySecondaryEditor.tsx`) renders its own header — including the "Open as main editor" button — and portals it via `createPortal(headerContent, headerRef)`. Navigator has no editor-specific knowledge.
- One mismatch is real decoupling work: rename `secondaryEditor` → `secondaryView` (Concern 7). View handlers calling `editor.page` are *not* a navigator concern — see the same-day correction below.
- Added a "Conceptual model & terminology" section; folded the rename into Phase 1 and Concern 7.

### 2026-06-01 — concern discussion: panel add/remove vs activate-as-main (superseded same day — see correction below)
- Reviewed coupling point #1. Found the original wording (setter calls `this.page?.addSecondaryEditor`) was copied from the stale pre-EPIC-028 `secondary-editors.md`; the live setter is a pure state mutation the host observes. Panel add/remove is **already decoupled** from the navigator — corrected in the analysis. *(This finding stands.)*
- Initially framed the "Open as main editor" call (`editor.page?.promoteSecondaryToMain(editor)`) as a "leak" to fix in Phase 1 via a new `EditorModel.activateAsMain()` + `IPageHost`. **This framing was reversed the same day** — see next entry.

### 2026-06-01 — correction: view→`editor.page` calls are NOT a navigator concern
- User clarified: a secondary view calling `editor.page?.promoteSecondaryToMain(editor)` is fine — it lives inside the Link editor's *own* view, which is entitled to act on its model and the model's owner. `PageNavigator` never sees it.
- **Revised decision:** Phase 1's host abstraction is just `IPanelHost` (render contract). No `activateAsMain()` indirection — the view keeps calling its owner directly. *(Later refined: `IPanelHost` itself dissolved into controlled props — see the Concern 1 controlled-component decision above; the no-`activateAsMain` part stands.)*

### 2026-06-01 — decision: `editor.page` becomes `IPageHost` (required + optional members)
- User confirmed `editor.page: PageModel` should become `editor.page: IPageHost`, since the owner can be a Page, a Browser, or future host. The call stays in the view but uses optional chaining for page-only members: `editor.page?.promoteSecondaryToMain?.(...)`.
- Ran an audit of every member reached through `.page` across `editors/` + `ui/navigation/`. Grouped into required (panel render, identity, navigator layout, membership, transient) vs optional (main-editor navigation). Flagged `page.content` hits as the scripting `page` global, not `editor.page`.
- Drafted `IPanelHost` + `IPageHost extends IPanelHost` with the required/optional split. Recorded in "Host contracts"; folded into Phase 1 (re-type `editor.page`, convert call sites to `?.`, per-editor audit). Concern 2 marked decided; two sub-questions (navigator-layout required-vs-optional; `mainEditorId` required-vs-optional) left open. Updated the analysis, Phase 1, Verdict, and Concern 2 accordingly. *(Later refined: `IPanelHost` dissolved into controlled props and `IPageHost` no longer extends it — see the Concern 1 decision; the two sub-questions were resolved in Concern 2.)*

### 2026-06-01 — epic created
- Triggered by a vision to reuse `PageNavigator` inside the Browser empty page (driven by the browser's bookmarks Link editor), make it mandatory for the Link editor, and standardize side panels across Notebook / Todo / Rest Client (and possibly MCP Inspector / Storybook) on it.
- Created from a current-situation analysis of `PageNavigator.tsx`, `PageNavigatorModel.ts`, `Pages.tsx` mount, `PageModel` panel surface, `EditorModel.secondaryEditor`, the Link panel components, `BrowserView.tsx` empty page, and a survey of the other side-panel editors.
- Phases and concerns recorded as a discussion starting point — to be refined collaboratively before any task is created.
