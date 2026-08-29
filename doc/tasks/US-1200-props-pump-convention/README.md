# US-1200 — Write the convention: `update()` is configuration, callbacks are fields

## Goal

Record the house convention established by the US-1199 pilot: `update(props)` carries
construction-time configuration, children own live-data subscriptions, and update-path callbacks
are stable fields. Make selector comparison semantics and dynamic-child ownership explicit before
the remaining EPIC-076 conversions use the convention.

## Background

EPIC-076 B-1 defines the closing property as construction-time configuration in `update(props)` and
live-data subscriptions in the child (`doc/epics/EPIC-076.md:24-27`). B-3 leaves type narrowing and
full-DOM rebuilds outside this epic (`doc/epics/EPIC-076.md:108-123`). US-1199 is the authoritative
pilot record: `PageContentView` owns `{ pageId }` and subscribes to `pagesModel`, while the former
`PageTabsView` bare subscriptions were the real unfiltered-dispatch defect.

The convention also records the pilot's correction to EPIC-076. The former `PagesView.ts:18`
whole-state selector was already reference-gated on all five `OpenFilesState` fields by
`compareSelection`; making the fields explicit had no runtime effect. A wide selector is not a
defect until the state shape and comparison semantics are verified.

## Implementation Plan

1. **Document configuration versus live data.** Add the full convention to
   `doc/standards/model-view-pattern.md`, using
   `src/renderer/ui/app/PageContentView.ts` as the reference: `{ pageId }` is configuration and
   the child subscribes to `pagesModel` itself. State that `update(props)` is rare and that live
   data uses a shared-model binding or targeted setter.

2. **Document stable callback fields.** Cite
   `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:327-399` for bound fields and
   `src/renderer/uikit/DataGrid/DataGridView.ts:10-32` for the identity-churn rationale. Include
   the construction-time menu/toolbar descriptor exception and keep it limited to descriptors that
   are built once.

3. **Document selector authoring from the implementation.** Cite
   `src/renderer/core/state/state.ts:18-40` and `:74-95`: selector subscriptions use
   `compareSelection`, plain objects recurse, and arrays/Maps/Sets/Dates/RegExps compare by
   identity, while a bare subscription has no gate. Prohibit fresh array selectors, direct readers
   to derive mapped values in the apply callback as `PagesView.managerProps()` does, preserve the
   small model-owned whole-state exception from EPIC-076 B-2 correction 2, and record the stored
   `encrypted` versus derived encryption getter hazard with the invariant at
   `src/renderer/editors/text/TextEditorModel.ts:276`.

4. **Document dynamic-child ownership.** Read and cite
   `src/renderer/uikit/shared/keyed-list.ts` and
   `src/renderer/uikit/shared/subtree-swap.ts` as the only sanctioned list and conditional-child
   patterns. Cite `src/renderer/editors/notebook/NotebookBodyView.ts:262-284` for idempotent root
   attachment and identify full-DOM clear-and-rebuild in an update path as the anti-pattern.

5. **Document the update contract and rejected option.** Explain that `update(props)` carries
   configuration, that type-level narrowing is deferred while roughly 400 callers still pass data,
   and that R2 step 4's shallow-equality gate in `doc/de-react-refactoring.md` is rejected because
   it is “a crutch, not the fix,” masks remaining call sites, and could satisfy epic checks for the
   wrong reason.

6. **Add the UIKit summary and tracking.** Add a short pointer to the full convention in
   `src/renderer/uikit/CLAUDE.md`, create this task document, and replace the plain-text US-1200
   dashboard entry in `doc/active-work.md` with a linked `[ ]` entry. Keep all source files
   unchanged and keep the epic task unchecked.

### Before → after documentation shape

Before, the standards contained separate lifecycle, binding, and selector notes, including an
array selector example and a recommendation to put derived arrays in `memo()`:

```ts
this.bind(this.driver.model.state, (state) => [state.isOpen, state.selectedIndex], apply);
// and: put derived arrays or objects in a model memo rather than allocating in the selector
```

After, the standards use a plain-object selector and point all update-path guidance at the single
convention section:

```ts
this.bind(
    this.driver.model.state,
    (state) => ({ isOpen: state.isOpen, selectedIndex: state.selectedIndex }),
    apply,
);
// Map arrays in apply, and use a child binding or targeted setter for live data.
```

## Concerns

- **Selector semantics:** A fresh plain object is safe only because `compareSelection` recursively
  compares plain-object fields. A fresh array is never safe in a selector because it is compared by
  identity. These are implementation facts cited in the standard, not assumptions about shallow
  equality.
- **Wide selectors:** The convention must not turn “narrow selectors” into a mechanical cleanup.
  Whole-state selectors on small model-owned state remain valid; only hot, global, frequently
  dispatched state requires scrutiny.
- **Derived values:** Replacing a derived getter with a stored projection can silently go stale.
  The encryption example is documented with the write-path invariant that currently keeps
  `state.encrypted` aligned with content.
- **Scope:** This task changes documentation only. It does not add an equality gate, narrow the
  type system, repair full-DOM rebuilds, add tests, or change any file under `src/`.

## Acceptance Criteria

- [x] `doc/standards/model-view-pattern.md` contains the full convention and cites every required
      source and EPIC-076 correction.
- [x] The convention says props configure at construction, live data uses child bindings or
      targeted setters, and `update(props)` carries configuration rather than live data.
- [x] Callback fields, the DataGrid rationale, and the construction-time descriptor exception are
      documented without permitting update-path identity churn.
- [x] Selector rules cover `compareSelection`, fresh-array failure, safe direct references and
      plain objects, bare subscriptions, the small-model exception, the PagesView pilot correction,
      and the stored-versus-derived encryption hazard.
- [x] `KeyedList` and `SubtreeSwap` are documented as the only sanctioned dynamic-child patterns,
      with the notebook idempotency guard and full-rebuild anti-pattern.
- [x] The deferred type-system narrowing and rejected R2.4 equality gate are recorded with their
      reasons.
- [x] `src/renderer/uikit/CLAUDE.md` contains only a concise summary and link to the full treatment.
- [x] `doc/active-work.md` links US-1200 to this document and keeps it `[ ]` under EPIC-076.
- [x] No source file under `src/` changed; no tests or test harnesses were added; no commit was
      created.

## Files Changed Summary

| File | Change |
|---|---|
| `doc/tasks/US-1200-props-pump-convention/README.md` | This investigation, convention scope, and acceptance record. |
| `doc/standards/model-view-pattern.md` | Full props-pump convention; corrected selector examples and guidance. |
| `src/renderer/uikit/CLAUDE.md` | Short UIKit summary and link to the full convention. |
| `doc/active-work.md` | Linked unchecked US-1200 dashboard entry. |

### Files explicitly requiring no changes

| File or area | Reason |
|---|---|
| `src/` source files | This is documentation only; referenced source is evidence, not a target. |
| `src/renderer/core/state/state.ts` | Selector behavior is documented from the existing implementation. |
| `src/renderer/uikit/shared/vanilla-view.ts` | The proposed equality gate is explicitly rejected. |
| `src/renderer/uikit/shared/keyed-list.ts` | Existing structural helper is documented, not changed. |
| `src/renderer/uikit/shared/subtree-swap.ts` | Existing structural helper is documented, not changed. |
| `doc/epics/EPIC-076.md` | The task links to and follows the epic; it does not restate or edit it. |
| `doc/de-react-refactoring.md` | R2.4 is recorded as rejected; the proposal document is not changed. |
| `doc/tasks/US-1199-app-shell-hot-path/README.md` | The pilot record is evidence and remains unchanged. |
