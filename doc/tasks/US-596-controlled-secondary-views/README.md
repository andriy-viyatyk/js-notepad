# US-596: `ISecondaryViewsState` + controlled `SecondaryViews` component

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 1a · **Status:** ✅ Implemented (2026-06-02) — `tsc --noEmit` + `eslint` clean; pending manual smoke test.

## Goal

Make `SecondaryViews` a **controlled component** and unify the three loose layout fields into one owner-held state object:

1. Introduce `ISecondaryViewsState { open; width; activePanel }` — folding the `activePanel` that today lives loose on `PageModel` into `SecondaryViewsModel` (which today holds only `{ open, width }`).
2. Re-type `SecondaryViews` to take `views` + `state` + `setState` props instead of `page: PageModel`. Move the container `Panel` + `Splitter` (today in `Pages.tsx`) **into** the component so it is self-contained and mountable anywhere.
3. The owner (PageModel) provides `setState`, which **carries the side effects**: `setState({ activePanel })` notifies the owning editor's `onPanelExpanded` and fires `panelExpanded`; `setState({ open })` fires `secondaryViewsToggled`; `setState({ width })` clamps and updates.

**No behavior change.** Persephone must compile and run; Explorer/Archive/Link sidebars must open, toggle, resize, expand/collapse, and persist exactly as before. `editor.page` stays typed as concrete `PageModel` here — widening to `IPageHost` is **US-597**. Browser/other-editor adoption is later phases. This task keeps **PageModel as the only owner** (EPIC-029 Concern 1).

## Background

### What the code does today (verified 2026-06-02)

**`SecondaryViews.tsx`** (`src/renderer/ui/secondary-views/SecondaryViews.tsx`) takes `page: PageModel` and is **partly uncontrolled**:
- `page.state.use()` → `version` for re-render on attach/detach/panel-flips.
- `panelEditors = page.panelEditors`.
- Holds a **local** `activePanel` mirror: `useState(page.activePanel)` + a `useEffect` that re-syncs from `page.activePanel` whenever it or `version` changes; `handleSetActivePanel` writes through `page.setActivePanel(panelId)` **and** the local mirror.
- Renders a single `<Panel name="secondary-views-root" height="100%">` wrapping a `<CollapsiblePanelStack activePanel setActivePanel>` whose children come from `panelEditors.flatMap(...)` reading each `model.state.get().secondaryView` and looking up `secondaryViewRegistry.get(panelId)`; each panel renders `<LazySecondaryView model editorId headerRef>` and exposes a `headerRef` (portal target). The `headerRefs` ref + `setHeaderRefsVersion` machinery is unrelated to this task and stays.

**The container + splitter live in `Pages.tsx`**, not the component:
- `SecondaryViewsWrapper({ page })` — `page.state.use(s => s.hasSidebar)`; returns `null` if no sidebar; else renders `SecondaryViewsContent`.
- `SecondaryViewsContent({ page })` — `const navModel = page.ensureSecondaryViewsModel(); const { open, width } = navModel.state.use(); if (!open) return null;` then renders the outer `<Panel name="secondary-views-container" width={width} shrink={false} height="100%">` containing `<SecondaryViews page={page} />`, followed by a `<Splitter ... value={width} onChange={navModel.setWidth} side="before" min={120} />`.

**`SecondaryViewsModel.ts`** holds `SecondaryViewsState { open: boolean; width: number }` (default `open:true`, `width:240`). Methods: `setStateQuiet({open?,width?})` (no subscription fire — used by restore), `setWidth(w)` (clamps `Math.max(120,w)`), `toggle()` / `close()` (mutate `open` **and** `secondaryViewsToggled.send(...)`), `dispose`. It imports `secondaryViewsToggled`.

**`activePanel` lives loose on `PageModel`** as a plain field `activePanel = "explorer"` (`PageModel.ts:79`). Surfaces:
- `setActivePanel(panel)` (`:402`) — sets the field, bumps `state.version`, finds the owning editor via `editors.find(e => e.secondaryView?.includes(panel))`, calls `owner.onPanelExpanded(panel)`, fires `panelExpanded.send({pageId, panelId})`.
- `expandPanel(panelId)` (`:413`) — validates then delegates to `setActivePanel`.
- `detach()` adjust (`:220-223`) — `if (panels?.includes(this.activePanel) || this.activePanel === editor.id) this.activePanel = "explorer";`
- `getDescriptor()` (`:516-531`) — when `secondaryViewsModel` exists, writes `sidebar: { open, width, activePanel: this.activePanel }`.
- Read by **editors**: `ArchiveEditor.ts:113` (`this.page?.activePanel === "archive-tree"`), `ExplorerEditorModel.ts:142` (`this.page?.activePanel === "explorer"`).

**Restore** (`PagesPersistenceModel.ts:133-145`): `nav = page.ensureSecondaryViewsModel(); nav.setStateQuiet({open,width}); ... page.activePanel = valid ? panel : "explorer";`.

**Toggle entry** (toolbar): `PageToolbar.tsx:52` → `model.page?.toggleNavigator(...)` → `PageModel.toggleNavigator()` (`:448`): if a sidebar/Explorer already exists → `ensureSecondaryViewsModel().toggle()`; else creates an `ExplorerEditor`, attaches, `ensureSecondaryViewsModel()`, then `secondaryViewsToggled.send({pageId, isOpen:true})`.

**Event subscribers** (must keep working unchanged): `LinkBody.tsx:53` subscribes `secondaryViewsToggled`; `LinkBody.tsx:57` subscribes `panelExpanded`.

**Reactivity glue:** `ensureSecondaryViewsModel()` (`:431`) lazily creates the model and subscribes `navModel.state` → bump `page.state.version` (so nav changes ride the page-state channel), and sets `state.hasSidebar = true`.

### Confirmed scope facts

- `SecondaryViewsState` is referenced **only** inside `SecondaryViewsModel.ts` — renaming it to `ISecondaryViewsState` is self-contained (verified by repo-wide grep).
- `SecondaryViewsModel.setWidth` has exactly **one** caller: the `Pages.tsx` splitter `onChange` (replaced by the in-component splitter → `setState({width})`).
- `SecondaryViewsModel.toggle` has one caller (`PageModel.toggleNavigator:451`); `close` has **no** callers. Both can be retired once the toggle path routes through the owner `setState`.
- `setActivePanel` callers: `SecondaryViews` (replaced by `setState`) and `PageModel.expandPanel`. `expandPanel` callers: `ArchiveEditor`/`ExplorerEditorModel` via `editor.page?.expandPanel` paths (kept).

## Implementation Plan

> Order: (1) state type + model, (2) PageModel owner `setState` + `activePanel` getter/setter, (3) toggle/restore wiring, (4) the controlled component, (5) the `Pages.tsx` mount. Run `tsc --noEmit` + eslint at the end.

### Step 1 — `ISecondaryViewsState` + make `SecondaryViewsModel` a pure state holder

`src/renderer/ui/secondary-views/SecondaryViewsModel.ts`:

- Rename `interface SecondaryViewsState` → **`ISecondaryViewsState`** and add `activePanel: string;`:
  ```ts
  export interface ISecondaryViewsState {
      open: boolean;
      width: number;
      activePanel: string;
  }
  ```
- Constructor default: `{ open: true, width: DEFAULT_WIDTH, activePanel: "explorer" }`.
- `setStateQuiet(s: Partial<ISecondaryViewsState>)` — extend to merge `activePanel` too (keep the no-subscription semantics for restore + ensure-seed).
- **Remove** `setWidth`, `toggle`, `close`, the `secondaryViewsToggled` import, **and the `constructor(private readonly pageId: string)` arg** (Concern E — now dead, since the model no longer fires events). The model becomes a parameterless pure layout-state container; all mutation with side effects now goes through the owner's `setSecondaryViewsState` (Step 2). Keep `state`, `setStateQuiet`, `dispose`, and `DEFAULT_WIDTH`.

### Step 2 — PageModel: owner-provided `setSecondaryViewsState` + fold `activePanel` into the model

`src/renderer/api/pages/PageModel.ts`:

- Replace the plain field `activePanel = "explorer"` (`:79`) with a private seed + getter/setter that delegate to the model (so the field's value survives before the model is lazily created, and `page.activePanel` reads stay identical for `ArchiveEditor`/`ExplorerEditorModel`):
  ```ts
  private _activePanel = "explorer";

  get activePanel(): string {
      return this.secondaryViewsModel?.state.get().activePanel ?? this._activePanel;
  }
  /** Quiet setter — no events. Used by detach-adjust and restore. */
  set activePanel(value: string) {
      this._activePanel = value;
      this.secondaryViewsModel?.setStateQuiet({ activePanel: value });
  }
  ```
  > Do **not** call `ensureSecondaryViewsModel()` from the setter — that would create a sidebar (and flip `hasSidebar`) during a detach that is removing the last panel. The seed field covers the no-model case.
- In `ensureSecondaryViewsModel()` (`:431`), seed the new model's `activePanel` from the current value so it carries over:
  ```ts
  this.secondaryViewsModel = new SecondaryViewsModel();
  this.secondaryViewsModel.setStateQuiet({ activePanel: this._activePanel });
  ```
- Add the **owner-provided controlled `setState`** (bound arrow so it can be passed as a prop). It is the single side-effecting entry point:
  ```ts
  setSecondaryViewsState = (patch: Partial<ISecondaryViewsState>): void => {
      const nav = this.ensureSecondaryViewsModel();
      const prev = nav.state.get();
      nav.state.update((s) => {
          if (patch.open !== undefined) s.open = patch.open;
          if (patch.width !== undefined) s.width = Math.max(120, patch.width);
          if (patch.activePanel !== undefined) s.activePanel = patch.activePanel;
      });
      if (patch.activePanel !== undefined && patch.activePanel !== prev.activePanel) {
          this._activePanel = patch.activePanel;
          const owner = this.editors.find((e) => e.secondaryView?.includes(patch.activePanel));
          owner?.onPanelExpanded(patch.activePanel);
          panelExpanded.send({ pageId: this.id, panelId: patch.activePanel });
      }
      if (patch.open !== undefined && patch.open !== prev.open) {
          secondaryViewsToggled.send({ pageId: this.id, isOpen: patch.open });
      }
  };
  ```
- Rewrite `setActivePanel(panel)` (`:402`) to delegate: `this.setSecondaryViewsState({ activePanel: panel });` (keeps `expandPanel` working). The old body (version bump + onPanelExpanded + panelExpanded.send) is now inside `setSecondaryViewsState`; the `state.version++` bump is no longer needed there because `nav.state.update` already bumps `page.state.version` via the `ensureSecondaryViewsModel` subscription.
- Import `ISecondaryViewsState` from `../../ui/secondary-views/SecondaryViewsModel` (alongside the existing `SecondaryViewsModel` import at `:5`). Keep the `panelExpanded` / `secondaryViewsToggled` imports (`:8`).

### Step 3 — route `toggleNavigator` through the owner `setState`

`src/renderer/api/pages/PageModel.ts` `toggleNavigator()` (`:448-473`):

- Existing-sidebar branch: replace `this.ensureSecondaryViewsModel().toggle();` with
  `this.setSecondaryViewsState({ open: !this.ensureSecondaryViewsModel().state.get().open });`
- New-Explorer branch: replace the trailing `secondaryViewsToggled.send({ pageId: this.id, isOpen: true })` (`:472`) with `this.setSecondaryViewsState({ open: true });` after `ensureSecondaryViewsModel()`. (See Concern A on the "already-open" nuance.)

Restore (`PagesPersistenceModel.ts:133-145`) needs **no change** — `nav.setStateQuiet({open,width})` plus `page.activePanel = ...` (now the quiet setter) still works; optionally fold into one `setStateQuiet({open,width,activePanel})` call for clarity.

### Step 4 — controlled `SecondaryViews` component

`src/renderer/ui/secondary-views/SecondaryViews.tsx`:

- New props (drop `page`):
  ```ts
  import type { EditorModel } from "../../editors/base/EditorModel";
  import type { ISecondaryViewsState } from "./SecondaryViewsModel";

  interface SecondaryViewsProps {
      views: EditorModel[];
      state: ISecondaryViewsState;
      setState: (patch: Partial<ISecondaryViewsState>) => void;
  }
  ```
- Remove `page.state.use()`, the local `activePanel` `useState` + sync `useEffect`, and `handleSetActivePanel`'s page coupling. **The component must end with zero `*.use()` store subscriptions** — it is fully controlled by its props (Concern D). Keep the `headerRefs` ref + `setHeaderRef`/`setHeaderRefsVersion` machinery unchanged (local transient UI state for portal targets, not a store subscription).
- Gate on `open` and render the container `Panel` + `Splitter` **inside** the component (moved from `Pages.tsx`). Use one `Panel` carrying `width` (merging today's outer `secondary-views-container` and inner `secondary-views-root`):
  ```tsx
  if (!state.open) return null;
  return (
      <>
          <Panel
              name="secondary-views-container"
              direction="column"
              width={state.width}
              shrink={false}
              overflow="hidden"
              height="100%"
              background="default"
          >
              <CollapsiblePanelStack
                  name="secondary-views-stack"
                  activePanel={state.activePanel}
                  setActivePanel={(id) => setState({ activePanel: id })}
                  height="100%"
              >
                  {views.flatMap((model) => { /* unchanged body, iterate `views` */ })}
              </CollapsiblePanelStack>
          </Panel>
          <Splitter
              name="secondary-views-splitter"
              orientation="vertical"
              value={state.width}
              onChange={(w) => setState({ width: w })}
              side="before"
              min={120}
              border="after"
              background="default"
              hoverBackground="light"
          />
      </>
  );
  ```
  The `flatMap` body that maps `model.secondaryView` → `<CollapsiblePanel>` + `<LazySecondaryView>` is copied verbatim, iterating the `views` prop instead of `panelEditors`.

### Step 5 — thin the `Pages.tsx` mount

`src/renderer/ui/app/Pages.tsx`:

- `SecondaryViewsWrapper` — unchanged (`hasSidebar` gate stays a page-host concern).
- `SecondaryViewsContent` becomes:
  ```tsx
  function SecondaryViewsContent({ page }: { page: PageModel }) {
      const nav = page.ensureSecondaryViewsModel();
      const state = nav.state.use();              // open/width/activePanel
      page.state.use((s) => s.version);           // re-render when panelEditors change
      return (
          <SecondaryViews
              views={page.panelEditors}
              state={state}
              setState={page.setSecondaryViewsState}
          />
      );
  }
  ```
  Remove the `Panel`/`Splitter`/`if (!open) return null` (now inside the component) and the `Splitter`/`Panel` imports if they become unused in this file (verify — `Panel`/`Splitter` may still be used elsewhere in `Pages.tsx`; today they are imported at `:2`).

## Concerns / Open Questions

### Concern A — `toggleNavigator` new-Explorer branch "already open" nuance. **Decision: accept.**
Today the new-Explorer branch fires `secondaryViewsToggled isOpen:true` **unconditionally**. After Step 3 it routes through `setSecondaryViewsState({open:true})`, which only fires the event when `open` actually changed; a freshly-ensured model defaults `open:true`, so the event may not re-fire. The only subscriber is `LinkBody` (refreshes `expandedPanel`), and a freshly-created Explorer page has no Link editor, so the suppressed redundant event is inert. If a regression appears, fire `secondaryViewsToggled.send({pageId, isOpen:true})` explicitly in that branch. Accept the routed version.

### Concern B — `activePanel` before the model exists. **Resolved by the seed field.**
`page.activePanel` is read (`ArchiveEditor`, `ExplorerEditorModel`) and written (detach-adjust) in paths where the sidebar usually exists, but not guaranteed. The `_activePanel` seed makes the getter total and the quiet setter side-effect-free, and `ensureSecondaryViewsModel` seeds the model from it — so no read returns stale/undefined and no write spuriously creates a sidebar. Verified against detach-adjust (`PageModel.ts:220-223`) and restore (`PagesPersistenceModel.ts:144`).

### Concern C — keep `editor.page: PageModel`. **In scope boundary.**
This task does **not** touch `EditorModel.page`'s type, `IPageHost`, or `editor.isMain` — that is US-597. `setSecondaryViewsState`/`activePanel` reads via `editor.page?.…` keep working against the concrete `PageModel`.

### Concern D — `SecondaryViews` subscribes to nothing (design principle). **Decided.**
`SecondaryViews` is **purely presentational/controlled**: it reads `views`, `state`, and `setState` from props and subscribes to **no** store (`page.state`, `nav.state`, or any editor's state). All reactivity is the **parent's** concern. `SecondaryViewsContent` (and any future host, e.g. the Browser) owns the subscriptions and passes a fresh `views` array down:
- `nav.state.use()` → drives `state` (open/width/activePanel).
- `page.state.use(s => s.version)` → re-derives `views = page.panelEditors` on panel-list attach/detach (a `page.state`-driven snapshot). Without it, attaching/detaching a panel editor would not flow a new `views` array down.

So the only `.get()` left inside the component is the non-reactive, render-time read of each passed-in `model.state.get().secondaryView` to expand panel IDs — it is **not** a subscription, and re-render is driven entirely by the parent handing down a new `views` reference (or a new `state`). Covered in Step 5; the component itself has zero `*.use()` calls (only local `useRef`/`useState` for portal header refs).

**Why a child subscription is unnecessary (and would be redundant).** Two kinds of "editor change" must trigger a re-render, and `page.state.version` already catches both:
1. *The set of panel-contributing editors changes* (attach/detach) — `attach()`/`detach()` bump `s.version++`.
2. *A model flips its own `secondaryView` array while staying attached* (e.g. `[]`→`["archive-tree"]`, or adds a second panel) — `PageModel.attach()` (`PageModel.ts:193-196`) subscribes to **every** attached editor's `secondaryView` slice and `onEditorPanelsChanged` (`PageModel.ts:284-288`) bumps `s.version++` on each flip.

So the host has already centralized the per-editor slice subscription and re-emits it as a single `page.state.version` signal. The parent rides that one channel, recomputes `page.panelEditors` (a fresh array each call), and passes a new `views` down. A subscription inside `SecondaryViews` would duplicate the host's existing one.

**Caveat for later phases:** this works *because the owner subscribes to its editors' slices*. When the Browser becomes a host (US-601), `BrowserPanelHost` must do the same — subscribe to its editors' `secondaryView` changes and re-emit so its own `SecondaryViews` mount re-renders. That is a host responsibility, consistent with "parent owns subscriptions."

### Concern E — drop `pageId` from `SecondaryViewsModel`. **✅ DECIDED (2026-06-02): drop it.**
Once `toggle`/`close` leave the model (Step 1), nothing inside `SecondaryViewsModel` uses `pageId` — it existed only to stamp the `secondaryViewsToggled` event, which now fires from `PageModel.setSecondaryViewsState` using `this.id`. Remove the `constructor(private readonly pageId: string)` arg entirely; the model becomes a parameterless pure state holder. Update the one call site to `new SecondaryViewsModel()` (Step 2). If a secondary **view** ever needs the page id, it reaches it through its model's owner — `model.page?.id` — never through the layout model.

## Acceptance Criteria

- [x] `tsc --noEmit` and `npm run lint` pass with zero errors.
- [x] `SecondaryViews` takes `views` / `state` / `setState` only — no `page` prop; repo-wide grep confirms no `<SecondaryViews page=` remains.
- [x] `ISecondaryViewsState` is defined and exported from `SecondaryViewsModel.ts` with `{ open, width, activePanel }`; the old `SecondaryViewsState` name is gone.
- [ ] App launches; Explorer, Archive (with a `.zip`), and a Link editor show their sidebar panels. *(manual)*
- [ ] Toggling the sidebar (toolbar button), resizing it (splitter), and expanding/collapsing panels behave identically to before. *(manual)*
- [ ] `LinkBody` panel-expand/toggle reactions still fire (open a Link editor, expand a category panel → its body reacts). *(manual)*
- [ ] Close + reopen the app: `open`/`width`/`activePanel` restore from the page descriptor as before. *(manual)*
- [x] No `setWidth`/`toggle`/`close` left on `SecondaryViewsModel`; `secondaryViewsToggled`/`panelExpanded` now fire only from `PageModel.setSecondaryViewsState` (+ the `toggleNavigator` route).

## Files Changed (summary)

| Area | File | Change |
|---|---|---|
| State type + model | `ui/secondary-views/SecondaryViewsModel.ts` | `SecondaryViewsState`→`ISecondaryViewsState` (+`activePanel`); pure state holder; drop `setWidth`/`toggle`/`close` + event import |
| Owner | `api/pages/PageModel.ts` | `activePanel` field → getter/setter + `_activePanel` seed; `setSecondaryViewsState`; `setActivePanel` delegates; `ensureSecondaryViewsModel` seeds activePanel; `toggleNavigator` routes through setState; import `ISecondaryViewsState` |
| Component | `ui/secondary-views/SecondaryViews.tsx` | controlled props (`views`/`state`/`setState`); container `Panel` + `Splitter` moved in; drop local `activePanel` state + `page` coupling |
| Mount | `ui/app/Pages.tsx` | `SecondaryViewsContent` thinned to pass props; remove in-file `Panel`/`Splitter`/open-gate |
| Restore (optional) | `api/pages/PagesPersistenceModel.ts` | optionally fold `activePanel` into one `setStateQuiet` call (no behavior change) |

**No change:** `EditorModel.page` type / `IPageHost` (US-597); panel string IDs; `panelExpanded` event shape; `secondaryViewRegistry` / `LazySecondaryView`; the 6 panel view components; `ArchiveEditor`/`ExplorerEditorModel` `activePanel` reads (API preserved); scripting type defs; `assets/editor-types/`.
