# US-976: Below-threshold local state

## Status

**Status:** Planned
**Priority:** Medium
**Epic:** [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
**Depends on:** [US-970: Lift local `useState` into models](../US-970-lift-state-models/README.md), where the high-density model conversions establish the patterns
**Created:** 2026-08-16

## Goal

Handle the remaining below-threshold local state after US-970: existing model-backed surfaces,
small reusable UI components, shell data state, and the editor long tail. This task owns the
smaller groups without making US-970 an unbounded 84-file sweep.

## Background

The pinned US-970 scan is:

```text
rg -n --glob '*.tsx' --glob '!*.story.tsx' 'useState<|useState\(' src/renderer
```

It reports 174 non-story declarations across 84 files. US-970 owns the seven files with `>=4`
declarations (52 declarations). US-976 owns the remaining below-threshold `.tsx` surface: 122
declarations across 77 files before D7/D8 exclusions and explicit handoffs.

| Threshold | Files | Declarations | Treatment |
|---|---:|---:|---|
| `>=3` | 20 | 91 | Convert model-owned state after US-970 patterns are proven |
| `>=2` | 39 | 129 | Group by existing model/component owner |
| `<2` / single-state tail | remaining files | included in 122 | Convert only when state is model-owned; retain named D7/D8 cases |

The task must not convert state mechanically. D7 allows visual hover/focus, uncontrolled open,
and gesture anchors. D8 leaves DOM measurement, DOM lifecycle, and DOM mutation in views. The
`useOptionalState` adapter, `TruncatedText` overflow state, the non-TSX cache hooks, and the grid
visible-row repaint counters have explicit owners or exclusions in US-970.

## Implementation plan

### 1. Reconcile the handoff inventory

- Start from the US-970 completion scan and subtract the seven `>=4` files.
- Group candidates by behavioral owner, not by a blanket directory rewrite.
- Reuse existing models (`TreeProviderView`, `PageTab`, `NoteItemView`, grid/tree models) before
  creating a co-located `TComponentModel`.
- Keep a residual ledger for D7/D8 state and record the reason beside every retained declaration.

### 2. Convert existing model-backed and reusable surfaces

- Move model-owned data/selection/focus state in `FileList`, `FileGrid`, `GitTree`, `OpenTabsList`,
  `AsyncEditor`, and secondary-view loading into their existing or co-located models.
- Handle UIKit surfaces such as `CategoryList`, AVGrid filters, `OptionsFilterContent`, and
  `useFilters` according to Rule 8; retain `WithMenu` anchors, tooltip open state, overflow
  measurement, and drag/hover feedback when D7/D8 applies.
- Convert dialog form state, sidebar tabs/data, and other shell state only where it represents a
  durable interaction or async result rather than a DOM gesture.
- Preserve AVGrid's setter-shaped columns/focus contracts with small adapters. `CellFocus` is
  plain data; no DOM handle belongs in model state.

### 3. Convert the editor long tail by family

Work through browser/board, git/grid, link editor, REST client, MCP inspector, settings, tools,
mneme, markdown/video/notebook, and shared async/rendering surfaces. For each candidate:

- put drafts, data, selections, async results, and durable interaction state in the owning model;
- keep measured geometry, DOM refs, third-party handles, hover/focus, uncontrolled open, and gesture
  lifecycle local under D7/D8;
- preserve prop identity guards because `useComponentModel.setPropsInternal` runs during render;
- use field selectors and model `memo()` values rather than whole-state subscriptions or fresh
  derived arrays in selectors.

### 4. Coordinate cross-task boundaries

- The two grid repaint counters belong with US-971's AVGrid visible-row observable/imperative
  handle work; do not replace them with generic revision state here.
- Context/state ownership discovered in this sweep belongs to US-972, and effect relocation belongs
  to US-974. Keep this task's changes focused on state ownership and model methods.
- Do not convert editor React props, subtree slots, portals, or add a generic callback protocol.

### 5. Verify the handoff is closed

- Run the pinned scan, confirm the remaining declarations are either converted, named D7/D8
  exceptions, or explicitly owned by US-971/972/974/B/D.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Smoke-check representative list/grid/sidebar/dialog/editor interactions and async cleanup.
- Do not add unit tests; the project has no unit-test harness.

## Concerns / Open questions

### Small components do not automatically need models

One local state hook in a short presentational component may be clearer as a view concern. The
completion ledger must distinguish that deliberate choice from forgotten business state; a model
should be introduced when the state is durable, shared, async, or coupled to handlers/effects.

### Cross-task overlap needs explicit ownership

US-971 owns imperative handles and the grid visible-row binding; US-972 owns context; US-974 owns
general effect relocation. If a state move exposes one of those boundaries, record the handoff and
avoid duplicating infrastructure.

### State containers must remain Immer-safe

Use plain arrays/records or immutable replacement for model state. Do not introduce mutable `Set`
drafts without a separately approved `enableMapSet()` decision, and verify column/row helpers do
not mutate auto-frozen values in place.

There are no unresolved decisions blocking this planned follow-up; the threshold and handoffs are
defined by the reviewed US-970 boundary.

## Acceptance criteria

- [ ] The pinned scan and US-970 exclusions produce a complete US-976 candidate ledger.
- [ ] Model-owned below-threshold state is moved into existing/co-located models without changing
      public behavior or controlled component contracts.
- [ ] D7/D8 state is retained only with a named reason; no DOM refs or third-party handles are put
      into serializable business state.
- [ ] Grid counters, context, and effect work are handed to US-971/972/974 rather than duplicated.
- [ ] Field-level selectors, model memos, prop identity guards, and Immer-safe updates are used.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; smoke checks show no
      regression and no tests are added.

## Related

- [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
- [US-970: Lift local `useState` into models](../US-970-lift-state-models/README.md)
- [US-971: Imperative handles -> model methods / `ComponentQueue`](../../epics/EPIC-051.md)
- [De-React roadmap](../../de-react.md)
- [Model-view pattern](../../standards/model-view-pattern.md)
