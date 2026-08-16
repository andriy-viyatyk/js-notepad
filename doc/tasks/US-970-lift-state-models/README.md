# US-970: Lift local `useState` into models

## Status

**Status:** Implemented — smoke-tested, pending epic review
**Priority:** High
**Epic:** [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
**Depends on:** None; the state layer and `TComponentModel` are already available
**Created:** 2026-08-16

## Goal

Move model-owned local React state into the framework-neutral `TComponentState` held by
`TComponentModel`. After this task, the later vanilla conversion sees state, handlers, and
derived behavior through the existing model boundary instead of excavating state from render
functions.

This is a finite Rule 8 task, not a mechanical ban on every `useState` call. It owns the seven
non-story components with at least four local state declarations (52 declarations total). The
below-threshold tail is handed to [US-976: Below-threshold local state](../US-976-below-threshold-state/README.md).
EPIC-051 D7 keeps visual-only hover/focus feedback, uncontrolled open state, and gesture anchors
in the view; D8 keeps DOM measurement and DOM mutation in the view. Those retained cases must be
named and justified rather than silently counted as migrated.

## Background

The project already has the required neutral state machinery:

- `TOneState` / `TComponentState` expose `get`, `update`, `subscribe`, and React `use` without
  making the state shape React-specific.
- `TComponentModel` owns `state`, props, refs, handlers, `effect()`, `memo()`, and lifecycle.
- `useComponentModel` is the current React adapter. A later vanilla view can drive the same model
  through `setPropsInternal`, `_initInternal`, and `onUnmountInternal`.
- `doc/standards/model-view-pattern.md` and `src/renderer/uikit/CLAUDE.md` set the migration
  threshold at more than 4-5 state hooks, several callbacks, a long component body, or coupled
  effects. For this task the operational cutoff is **four or more declarations**: it captures the
  seven high-density components without turning the task into a directory-wide judgment call.

### Current measurement

The EPIC-051 opening table records 201 non-story declarations across 83 `.tsx` files. The review
scan of the current branch finds 174 declarations across 84 non-story `.tsx` files. The difference
is a snapshot/method discrepancy; this task pins the completion scan to the same command:

```text
rg -n --glob '*.tsx' --glob '!*.story.tsx' 'useState<|useState\(' src/renderer
```

Story files remain excluded by D10. The completion result must report the seven converted files,
the named D7/D8 exclusions, and the below-threshold handoff rather than treating every remaining
hook as an omission.

| Area | Files | Current declarations | Treatment |
|---|---:|---:|---|
| `editors/` | 58 | 133 | Convert model-owned editor state; editor ownership does not exempt state, only React-bearing props under D1 |
| `uikit/` | 12 | 15 | The two-declaration delta from the earlier scan is reconciled by the pinned regex; only the seven ≥4 files are in US-970 |
| `ui/` | 10 | 18 | Lift shell/dialog/secondary-view data and async state; retain DOM-only transient state |
| `components/` | 4 | 8 | Move list/grid data and external-store bindings to existing/new models |
| **Total** | **84** | **174** | Stories excluded; `.ts` hook/cache helpers recorded separately below |

Threshold reconciliation on the same scan:

| Threshold | Files | Declarations | US-970 treatment |
|---|---:|---:|---|
| `>= 4` | 7 | 52 | **In scope** |
| `>= 3` | 20 | 91 | US-976 handoff unless one of the seven is being touched for compatibility |
| `>= 2` | 39 | 129 | US-976 handoff |

The highest-density files are:

| Priority | File | Declarations | Initial ownership judgment |
|---|---|---:|---|
| 1 | `src/renderer/editors/graph/GraphDetailPanel.tsx` | 17 | Split the panel, link editor, and property editor state into model-owned slices; resize/focus behavior needs careful preservation |
| 1 | `src/renderer/editors/graph/GraphLegendPanel.tsx` | 8 | Move expansion, active tab, plain-data checked values, filter, and descriptions; keep hover/focus feedback transient |
| 1 | `src/renderer/editors/notebook/ExpandedNoteView.tsx` | 6 | Move category/tag editing state into a co-located model; preserve prop synchronization |
| 1 | `src/renderer/editors/graph/GraphBody.tsx` | 6 | Move panel/result/request state; keep toolbar hover/focus state in the view |
| 1 | `src/renderer/editors/env-vars/EnvVarsBody.tsx` | 6 | Move draft/profile rows, columns, focus, and warning state; preserve profile reseeding guards |
| 1 | `src/renderer/editors/mneme-config/RootsPanel.tsx` | 5 | Move expansion and include/ignore drafts/config state; preserve cancel/apply semantics |
| 1 | `src/renderer/editors/markdown/CodeBlock.tsx` | 4 | Move diagram result/error and copy status for the two code-block surfaces without merging their lifetimes |

The remaining tail is concentrated in file/grid/git wrappers, secondary views and dialogs,
AVGrid filters, category/menu/tooltip primitives, and editor-specific panels for browser, board,
git, link, markdown, MCP inspector, REST client, video, notebook, and settings. The implementation
must use the source inventory rather than assuming every two-state component needs a new model.

### State categories found during investigation

1. **Model-owned data and interaction state.** Examples include graph tabs and edits, env-var
   rows, note tag drafts, REST response tabs, selected results, grid columns, async load results,
   dialog form values, and sidebar data. These belong in `TComponentState`.
2. **Existing model state that is still held locally.** `TreeProviderView`, `PageTab`, and
   `NoteItemView` already use `useComponentModel`; their model classes should absorb only the
   model-owned declarations while their visual hover/focus/drag state remains local under D7.
3. **DOM/view transient state.** Hover/focus feedback, uncontrolled menu open state, drag/gesture
   lifecycle, overflow/position measurements, and DOM/API capture need to remain view-owned or
   become model refs/commands. They must not be put into serializable business state merely to
   remove a hook.
4. **Force-render counters.** `GridBody.tsx`, `grid/index.tsx`, and `SecondaryViews.tsx` use
   state as a repaint signal. These are not domain values; replace them with the existing
   observable state/subscription or model update path, not a `tick` field in a model.

The following named declarations are outside this task's seven-file threshold or `.tsx` surface:

- `src/renderer/core/state/state.ts:138` — `useOptionalState` is the React adapter for the state
  primitive. It belongs to the Epic B/D `mountReact` boundary, not to a component model here.
- `src/renderer/uikit/TruncatedText/TruncatedText.tsx` — its two declarations are D8 overflow
  measurement state and remain view-owned.
- `src/renderer/editors/grid/GridBody.tsx:78` and `src/renderer/editors/grid/index.tsx:23` —
  visible-row repaint counters are below the cutoff and overlap US-971's AVGrid handle work.
- `src/renderer/ui/secondary-views/SecondaryViews.tsx:33` — `setHeaderRefsVersion` is a D8 DOM
  lifecycle repaint for a caller-owned portal target; it remains local and is not replaced by an
  artificial observable.
- The five other `.ts` hook/cache declarations (`uikit/AVGrid/useResolveOptions.ts`, the favicon
  and board icon/usage caches, and `editors/link-editor/pipe-image-src.ts`) are reusable hooks over
  module-level caches. They require a separate external-store decision and are recorded for later
  work rather than moved into a component model.

All other below-threshold `.tsx` candidates are handed to US-976. This makes the residual ledger a
policy check: `>=4` is US-970, `<4` is US-976, and named D7/D8/adapter cases remain in the view.

## Implementation plan

### 1. Establish the migration ledger and model pattern

- Re-run the inventory with `rg` over `src/renderer`, excluding `*.story.tsx`, and classify every
  declaration as model-owned, D7 transient, D8 DOM/view state, external-store repaint signal, or
  follow-up hook/cache state.
- For a complex component, add a co-located `*Model.ts` with a typed state interface and default
  state, extend `TComponentModel<State, Props>`, and construct it with `useComponentModel`.
- Move setters and callbacks that interpret state into arrow-function model methods. The view
  should subscribe only to the fields it renders and bind model methods directly.
- Use `state.update` for draft/collection edits and explicit model methods for invariants. Do not
  expose raw `React.Dispatch` setters as the model API unless a child contract genuinely requires
  a functional updater. For AVGrid's `setFocus`-shaped contract, the adapter is the one-line
  `value => model.state.set({ ...model.state.get(), focus: value })` equivalent appropriate to
  the model state; do not build a general React setter abstraction.
- Keep props-to-state synchronization explicit and guarded. `useComponentModel` calls
  `setPropsInternal` in the render body, and `setPropsInternal` evaluates model effects there, so
  prop-to-state seeding belongs in `setProps` with an identity guard on the source entity, never
  in an unguarded effect. A model default value is not a license to reset user edits on every
  parent render, and a synchronous cross-model `state.set` from an evaluated effect is forbidden.
- Subscribe with field selectors (`model.state.use(s => s.field)`), not `model.state.use()` for
  large states. Selectors must return stored values: `compareSelection` compares arrays, `Set`,
  and derived objects by reference in the relevant cases, so fresh filtered arrays belong in a
  model `memo()` rather than inside `use(...)`.
- Store GraphLegendPanel checked values as `string[]` (or a `Record<string, true>`), never as a
  mutable `Set` in model state. `TOneState.update` uses Immer without `enableMapSet()`, so
  `draft.checkedLevels.add(id)` would throw at runtime. Replace arrays immutably and derive a
  `Set` with `memo()` only where lookup semantics are needed. Before moving any `Column<R>[]`,
  confirm its update paths do not mutate frozen Immer results in place; the known GraphDetailPanel
  and EnvVarsBody row paths are already map/filter/spread based.
- Move refs, async cleanup, and model-level effects only when they are part of the stateful
  component behavior. DOM measurement/focus effects remain in the view under D8; broad effect
  migration belongs to US-974.

### 2. Convert the high-density editor state first

- `graph/GraphDetailPanel.tsx`: introduce model ownership for expanded/active tabs, dirty flags,
  panel size, edit drafts/errors, and the link/property table rows, columns, dirty flags, focus,
  and status. Keep nested table APIs compatible with AVGrid's controlled columns/focus contract.
  Preserve the existing selection-driven resets, external highlight cleanup, resize bounds, and
  the rule that dirty panels cannot switch tabs or collapse.
- `graph/GraphLegendPanel.tsx`: move expanded state, active tab, checked level/shape sets,
  selection filter, and descriptions/debounce coordination. Keep `hovered` and `focusWithin` as
  view-only visual state and preserve editor highlight/description updates and timer cleanup.
- `graph/GraphBody.tsx`: move toolbar panel, expand/collapse request counters, and selected result
  index. Keep `toolbarHovered` and `toolbarFocusWithin` local, preserve editor callback wiring,
  panel dirty coordination, search keyboard cycling, and request ordering.
- `env-vars/EnvVarsBody.tsx`: move namespace/profile drafts, variable rows/columns/focus, and
  warning state into a model or the owning existing model. Preserve the reseed guard that
  distinguishes an external profile update from the component's own edit echo.
- `notebook/ExpandedNoteView.tsx`: create a co-located model for category/tag edit modes and
  drafts. Preserve cancel-on-undefined blur, note/tag callbacks, focus restoration, and the
  existing `NoteItemActiveEditor` model boundary.
- `mneme-config/RootsPanel.tsx`: move expansion, include/ignore draft arrays and text, and
  apply/cancel transitions. Do not change the async root-config API or the distinction between
  effective config and an in-progress draft.
- `markdown/CodeBlock.tsx`: separate diagram rendering state from copy-button state for the two
  component surfaces. Preserve async cancellation/error handling and the short-lived copied
  feedback timer.

### 3. Hand off the below-threshold surfaces

- Do not modify `FileList`, `FileGrid`, `GitTree`, sidebar/secondary-view surfaces, dialogs,
  AVGrid filters, or the editor long tail under US-970 solely to remove one-to-three hooks. Their
  model-backed and reusable-surface work moves to US-976, where the smaller components can be
  grouped by owner and the remaining 122 declarations can be reviewed against one explicit rule.
- Do not include `Menu`, `Tooltip`, `Splitter`, `TagsInput`, or `Toolbar` in the US-970 work list
  when their state is D7/D8. Their retained state is a reviewed outcome, not an unfinished
  conversion.
- `GridBody` and `grid/index` repaint counters are handed to US-971's AVGrid handle work. The
  correct future fix is to publish visible-row count as observable model data and have the footer
  bind to it, not to rename the counter as model `revision` state.
- `SecondaryViews.setHeaderRefsVersion` is explicitly retained as D8. It re-renders solely when a
  caller-owned DOM portal target becomes available; the component intentionally subscribes to no
  store, and Epic D can append to the target directly.

### 4. Verify this finite task

- Re-run the pinned declaration scan and confirm the seven `>=4` files are the only implementation
  targets. Record the seven model conversions, the GraphLegendPanel plain-array decision, and the
  named D7/D8/adapter exclusions.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Smoke-check graph panel tab/dirty/resize flows, graph legend filtering and descriptions,
  env-var/profile edits, note category/tag edits, mneme root apply/cancel, diagram rendering and
  copy feedback, including all model reset, selector, and async cancellation paths.
- Do not add unit tests; this project has no unit-test harness and the existing smoke checks are
  the intended verification for this refactor.

## Concerns / Open questions

### The scope is intentionally bounded

US-970 is limited to the seven files with `>=4` local state declarations (52 declarations). The
39 files at `>=2` and the remaining lower-density candidates are tracked by US-976; they are not
completion omissions here. This keeps the task reviewable and avoids overlapping broad sweeps
with US-971, US-972, and US-974.

### D7 state must not be over-converted

Hover/focus feedback, uncontrolled open state, and gesture anchors are explicitly allowed in the
view. Dragging/drag-over flags and toolbar visibility need the same treatment when they only style
the current gesture. Moving them into a model would make the model DOM/gesture-aware and would be
reversed by a vanilla view. The implementation must list retained names and reasons.

### Immer does not support mutable Set drafts here

`TOneState.update` uses Immer, and this repository does not call `enableMapSet()`. GraphLegendPanel
therefore stores `checkedLevels` and `checkedShapes` as immutable `string[]` values. Model methods
replace arrays with `filter`, spread, or a new value; a memoized `Set` is allowed only as a derived
lookup. Calling `.add()` on a drafted `Set` is a runtime failure even though typecheck and lint
pass. The same review applies to `Column<R>[]`: verify that AVGrid and column helpers replace
arrays/objects rather than mutating an Immer-frozen result in place.

### Prop synchronization can overwrite drafts

Several components seed local state from props and then edit it (`ExpandedNoteView`, `RootsPanel`,
graph panels, env vars, REST panels). `useComponentModel` calls `setPropsInternal` in the render
body on every render, and `setPropsInternal` evaluates registered effects there. The migration
therefore uses `setProps` with an identity guard on the source entity for synchronous seeding. A
model must not reset a draft merely because its parent rendered, and a model effect must not
synchronously write another component's state during render-phase evaluation; async results are
safe because they land in a later tick.

### Subscription granularity is part of the conversion

Views subscribe to stored fields with selectors (`model.state.use(s => s.field)`), not to the whole
state object. Derived arrays or filtered objects must be exposed through `model.memo()` because
`compareSelection` treats arrays, `Set`, and other non-plain values by reference; a fresh derived
array inside a selector defeats field-level subscription and re-renders on every notification.

### Controlled AVGrid contracts are setter-shaped

Grid columns and focus are passed to AVGrid with functional-updater semantics. `CellFocus` is plain
serializable data, not a DOM handle, so it may live in model state. Preserve the existing
`SetStateAction` callback contract with a small adapter to the model's current state rather than
exposing a general `React.Dispatch` model API or capturing stale state.

### Async and third-party lifetimes are not ordinary state

The seven in-scope files combine async rendering, editor callbacks, and nested table controls.
Move durable result/error/data ownership to models, but keep cancellation, DOM attachment, and
third-party cleanup aligned with the current mount/unmount lifecycle. US-974 owns a general effect
migration; this task must not duplicate that work.

### Force-render counters have named owners

The two grid counters are deferred to US-971's AVGrid handle work. The correct future fix publishes
visible-row count as observable model data and has the footer bind to it; renaming the counter as
model `revision` would preserve the React repaint hack. `setHeaderRefsVersion` is explicitly a D8
DOM lifecycle case: there is no owning model or store by design, and Epic D can append to the
caller-owned portal target directly.

### Named adapter and measurement exclusions

`state.ts:138` (`useOptionalState`) is the React adapter for the state primitive and belongs to the
Epic B/D `mountReact` boundary. `TruncatedText`'s two declarations are D8 overflow measurement.
The five non-TSX hook/cache states (`useResolveOptions`, favicon/board caches, board usage, and
`usePipeImageSrc`) require a separate external-store decision. These are recorded exclusions, not
unreviewed omissions.

There are no unresolved user decisions blocking implementation. The threshold, plain-array Set
decision, grid-counter handoff, and D8 portal-ref exception are resolved in this document.

## Acceptance criteria

- [x] The pinned `rg` scan established a 174-declaration baseline, with the seven `>=4`
      components identified as the finite US-970 scope; lower-density declarations are linked to
      US-976 rather than treated as omissions. The post-conversion residual scan reports 126
      declarations, consisting of the 122 below-threshold declarations plus the four retained
      GraphBody/GraphLegendPanel D7 visual-state declarations.
- [x] Model-owned state in the seven in-scope files is held by `TComponentState` through a
      co-located `TComponentModel`; views use field selectors and bind model methods.
- [x] `GraphLegendPanel` stores checked values as immutable arrays (or records), never mutable
      `Set` drafts; any Set lookup is derived through `memo()`.
- [x] Column and row/focus state moved into models remains safe under Immer auto-freeze; all
      update paths replace arrays/objects rather than mutating frozen results.
- [x] D7/D8 exceptions (hover/focus, uncontrolled open, gesture anchors, DOM measurements/refs,
      `useOptionalState`, `TruncatedText`, and the named hook/cache adapters) remain behaviorally
      local and are listed in the task ledger.
- [x] The grid repaint counters are explicitly handed to US-971, while
      `SecondaryViews.setHeaderRefsVersion` remains a documented D8 exception; neither is
      renamed into generic model revision state here.
- [x] Prop-to-state synchronization uses identity-guarded `setProps` seeding and no synchronous
      cross-model state writes from render-phase model effects.
- [x] No editor React prop/subtree conversion, generic slot protocol, or portal-host work is
      introduced; those remain owned by the other EPIC-051 tasks.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- [x] Manual smoke checks cover the seven high-density flows and their model reset, selector,
      async cancellation, and controlled-grid paths.
- [x] No unit-test harness or tests are added.

## Files to create or modify

The implementation is limited to the seven `>=4` candidates and their co-located models, plus
documentation and compatibility edits required by those models:

- `src/renderer/editors/graph/GraphDetailPanel.tsx` and its model(s)
- `src/renderer/editors/graph/GraphLegendPanel.tsx` and model
- `src/renderer/editors/graph/GraphBody.tsx` and model
- `src/renderer/editors/env-vars/EnvVarsBody.tsx` and model
- `src/renderer/editors/notebook/ExpandedNoteView.tsx` and model
- `src/renderer/editors/mneme-config/RootsPanel.tsx` and model
- `src/renderer/editors/markdown/CodeBlock.tsx` and model(s)
- `src/renderer/editors/graph/GraphDetailPanel.tsx` and its model(s)
- `src/renderer/editors/graph/GraphLegendPanel.tsx` and its model
- `src/renderer/editors/notebook/ExpandedNoteView.tsx` and its model
- `src/renderer/editors/graph/GraphBody.tsx` and its model
- `src/renderer/editors/env-vars/EnvVarsBody.tsx` and its model
- `src/renderer/editors/mneme-config/RootsPanel.tsx` and its model
- `src/renderer/editors/markdown/CodeBlock.tsx` and its model(s)
- Any direct compatibility caller edits needed to preserve these seven components' existing
  props, AVGrid contracts, and model lifecycle
- `doc/active-work.md`
- `doc/epics/EPIC-051.md`

## Related

- [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
- [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md)
- [US-969: Neutral slots - `ui/` and `components/`](../US-969-neutral-slots-shell/README.md)
- [US-976: Below-threshold local state](../US-976-below-threshold-state/README.md)
- [De-React roadmap](../../de-react.md)
- [Model-view pattern](../../standards/model-view-pattern.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
