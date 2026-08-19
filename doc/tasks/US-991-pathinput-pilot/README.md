# US-991: PathInput pilot — one component converted end to end

**Status:** Planned
**Priority:** High
**Epic:** [EPIC-053 — De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19

## Goal

Convert `PathInput` end to end behind its existing React-facing props, and prove the Epic B
primitives against a real component. The existing React face becomes a thin `mountVanilla`
delegate, so every current caller and the existing Storybook story keep working unchanged while the
component itself is a vanilla view.

This is the Epic B pilot, not a general conversion of `Input`, `Popover`, `Panel`, or the
Storybook editor. The vanilla view hosts the existing React `Input` and `Popover` through
`mountReact`, so the task exercises both directions of the boundary without changing their
callers.

## Background

### The component being converted

`src/renderer/uikit/PathInput/` contains a 159-line React view, a 292-line model, and a pure
suggestion helper. The public component is used from four production files and from its existing
Storybook story:

- `uikit/TagsInput/TagsInput.tsx`
- `editors/link-editor/EditLinkDialog.tsx`
- `editors/notebook/NoteItemView.tsx`
- `editors/notebook/ExpandedNoteView.tsx`
- `uikit/PathInput/PathInput.story.tsx`

No caller should change. `PathInputProps` remains controlled (`value`, `onChange`, `paths`, and
the current blur/keyboard/accessibility contract), and the React 19 `ref` behavior continues to
target the underlying `<input>` rather than the wrapper root.

The current view owns two Emotion blocks: the `PathInput` root and the suggestion row. The pilot
must move those rules to `PathInput.css` under US-983's `@layer uikit`, `[data-type="path-input"]`
scope, color variables, and numeric design-token variables. `Input` and `Popover` remain their
existing React implementations and retain their own styling.

### Model and effect surface

`PathInputModel` currently uses `useComponentModel` and has four `effect()` registrations:

| Current effect | Vanilla replacement |
|---|---|
| Resize `rowRefs` when `suggestions.value` changes | `applySuggestions(next)` |
| Reset `activeIndex` when `suggestions.value` changes | the same `applySuggestions(next)` path |
| Scroll the active row into view | `setActiveIndex(index)`, with the existing row reference |
| Put the caret at the end for `autoFocus` | explicit mount/ref completion after the input exists |

The model's `suggestions` is currently a pull-based `memo()`. Because the vanilla driver rejects
models that register effects, the pilot must make this one memo an explicitly stored field with a
dependency guard in the model's prop-update path. The guard must still use the four current inputs
(`value`, `paths`, `separator`, and `maxDepth`) and must not recompute suggestions on unrelated
prop updates.

The model is framework-free at runtime but not fully React-free in its type surface: its props
interface currently extends `React.HTMLAttributes<HTMLDivElement>`. The two event-only React
types (`React.MouseEvent` and `React.KeyboardEvent`) must widen to native event inputs. The React
view adapter passes `nativeEvent` to those methods; the vanilla view passes the browser event
directly. `suggestions.ts` is already pure and should remain unchanged.

**Two model changes go beyond the epic's expected two and must be recorded as findings.** EPIC-053
predicts exactly two: the event types widening, and the memo becoming an explicit field. It also
says anything beyond those two is a finding worth recording, because the epic's premise is that
models cross the boundary nearly untouched. This pilot adds:

- **Row references move from index identity to path identity.** `rowRefs` is an index array today
  (`PathInputModel.ts:74`, `:80`, `:257`, `:278`); `KeyedList` preserves nodes by
  `PathSuggestion.path`, so an index-held reference can point at the wrong row after a reorder.
- **The 150 ms blur grace timer becomes cancellable.** `onInputBlur` (`PathInputModel.ts:141-153`)
  discards its `setTimeout` handle, so nothing can cancel it. Tracking and clearing it in
  `dispose()` is a latent-bug fix — today a pending blur commit can call the caller's `onBlur`
  after the component is gone — and therefore a small behaviour change, not a refactor.

Record both in EPIC-053's Notes alongside the measured number.

### The boundary shape

US-988 provides `createComponentModelDriver`, which pumps props, mounts the model once, and
disposes it without evaluating React-era effects. US-989 provides:

```ts
mountVanilla(ctor, props);       // React parent → vanilla view
mountReact(host, element);      // vanilla owner → React subtree, returns a disposer
```

US-986's `VanillaView` owns a stable root and disposal registry; US-987's `KeyedList` is the
identity-preserving replacement for the current `suggestions.map(...)`. The keyed container must
use `PathSuggestion.path` as its `PropertyKey`, never the array index, so reordering does not
replace a focused or transitioning row.

`Popover` portals its visible root to `getOverlayLayer()`. The vanilla view therefore cannot treat
its root subtree as the whole component: it must mount and dispose the React `Popover` root, and
the suggestion list must be managed inside a host element rendered within that portalled popover.
Unmounting the React root is what removes the overlay content.

### Storybook measurement

The current story is a stateful `PathInputDemo` over `DemoProps` (`pathSet`, `separator`,
`maxDepth`, `placeholder`, disabled/read-only, size, and auto-focus), not a direct `PathInputProps`
story. **It needs no change.** Once `PathInput.tsx` delegates to `mountVanilla`, the existing story
already renders the vanilla view through the same React face a production caller uses, which is
exactly what should be looked at. US-994 removes the paired-pane harness for this reason; do not
add a Storybook-only vanilla demo wrapper or a `vanillaComponent` field.

The pilot still owns Epic B's measured number, but it is a **before/after** measurement rather than
a simultaneous one: DOM mutations for one named interaction, a single `ArrowDown` while the
suggestion popover is open, counted on today's React implementation *before* step 3 converts the
view, and on the vanilla implementation *after*. Use a `MutationObserver` on the preview pane with
the same observer options, the same reset point, and the same interaction both times, and record
both counts in EPIC-053's Notes. This is a repeatable mutation-observation measurement, not
production instrumentation.

Take the React measurement first, before any view code is written. It cannot be recovered once the
React implementation is gone.

## Implementation plan

### 1. Refactor `PathInputModel` to have no registered effects

Modify `src/renderer/uikit/PathInput/PathInputModel.ts` while keeping its public props and state
semantics:

- Replace the `suggestions = this.memo(...)` field with a stored `suggestions: PathSuggestion[]`
  field and a private dependency snapshot. Recompute only when `value`, `paths`, `separator`, or
  `maxDepth` changes by identity/value in the same way the current memo dependencies do.
- Add `applySuggestions(next)` as the single suggestion-transition method. It updates the stored
  list, removes stale keyed row references, and resets `activeIndex` to `null` when the suggestion
  result changes. It must not recreate unchanged row elements.
- Replace the index-based row reference array with a path-keyed map (or equivalent keyed lookup),
  and expose `setRowRef(path, element)` for the keyed-list create/update/remove callbacks. The
  active index is still the public interaction state; use `suggestions[activeIndex]?.path` to find
  the row for scrolling. This prevents a reorder from making an index-held DOM reference point at
  the wrong path.
- Add `setActiveIndex(index)` and route `onRowMouseEnter`, ArrowDown, and ArrowUp through it. It
  updates state and calls `scrollIntoView({ block: "nearest" })` on the keyed active row when one
  exists. Preserve the current wraparound and empty-list behavior.
- Remove all four `this.effect(...)` registrations. `init()` may remain as the explicit mount-time
  hook for the auto-focus/caret behavior, but it must register no effect and must be safe when the
  input ref has not been delivered yet.
- Widen `onRowMouseDown` and `onInputKeyDown` to native event-compatible inputs. Preserve the
  existing `preventDefault`, key handling, selection, blur, and open/close semantics.
- Track and clear the 150ms blur grace timer in `dispose()` so a disposed view cannot later write
  state or call the caller's `onBlur` callback.

The model must pass `createComponentModelDriver`'s zero-registered-effects check and must still
behave identically through `useComponentModel` while the React wrapper remains in place.

### 2. Create the vanilla PathInput view and React-child bridges

Add `src/renderer/uikit/PathInput/PathInputView.tsx` with a public-constructor
`PathInputView extends VanillaView<PathInputViewProps>` (where the internal view props add the
React input-ref field without changing the exported `PathInputProps`). The constructor creates the
model driver and stores no DOM children; `mount()` builds the DOM.

The view should:

- use `createComponentModelDriver` with `PathInputModel` and `defaultPathInputState`;
- retain `data-type="path-input"`, `data-name`, `data-state`, `data-disabled`, and
  `data-readonly` on the stable root, and forward the existing non-model HTML attributes to that
  root without reintroducing public `style` or `className` support;
- mount one stable module-level React bridge into the root. The bridge renders the existing
  `Input` and `Popover` components; it does not duplicate their markup or styling. Its event
  wrappers pass native events to the model;
- **handle the external ref explicitly.** `PathInput`'s `ref` targets the inner `<input>` and four
  production callers depend on it. Because `mountVanilla` nests the view props one level inside its
  host component's own props, React does not intercept `ref` — it arrives as ordinary data, and the
  view is responsible for all of it: an object ref versus a callback ref; a ref whose identity
  changes between `update()` calls (detach the old, attach the new); a React 19 callback ref that
  returns a cleanup function; and clearing it on `dispose()`. Hand the same element to
  `model.setInputRef`;
- give the `Popover` a dedicated suggestion-host element as its child. That host is inside the
  portalled popover and is the only container managed by `KeyedList`. When the portal closes, the
  host callback must dispose the old list and clear its row references; when it opens, the list is
  recreated against the new host and reconciled from the current model suggestions;
- **give the bridge exactly one update path.** `mountReact` intentionally renders one element and
  returns only a disposer, so the bridge needs its own way to observe change. Use the existing
  state primitives rather than a bespoke emitter: the bridge subscribes to `model.state.use()` for
  `open` and `activeIndex`, and to a view-owned `TComponentState<PathInputProps>` that the view
  pumps from its `update()` hook for the controlled props. `compareSelection` then does the
  bail-out for free. Do not widen `mountReact` or add a general adapter update API here;
- **do not drive the same fact from both sides.** Because the bridge subscribes to model state
  itself, `bind()` is used only for DOM the bridge does not own: row `data-active` and the
  active-row `scrollIntoView`. Popover visibility and `aria-expanded` come from the bridge's own
  render, not from a binding that also pokes it. Two update paths for one fact is the failure mode
  this bullet exists to prevent;
- register the React-root disposer and keyed-list cleanup with the view's ownership registry so
  disposal unmounts the React `Popover` (including its `getOverlayLayer()` portal) before the
  adapter removes the vanilla root. Cleanup must be idempotent even if the portal callback already
  disposed the keyed list;
- call the model driver in the explicit mount/update/dispose order. A view prop update pumps the
  model and updates root attributes, suggestion rows, and the React bridge without reconstructing
  the view or either child root;
- preserve `autoFocus`: the input remains `autoFocus`-controlled and the caret is placed at the
  end after the actual input ref is available, including when the nested React commit occurs after
  `mount()` returns.

Use `document.createElement` and `textContent` for the vanilla row structure. Do not use
`innerHTML`, React children as row data, or a second popover implementation.

### 3. Replace the React view with the unchanged public adapter

Modify `src/renderer/uikit/PathInput/PathInput.tsx`:

- remove the Emotion root/row definitions, `useComponentModel`, state selector, callback ref
  merger, and JSX suggestion map;
- keep the exported `PathInputProps` type and the React 19 `ref` signature unchanged;
- render `mountVanilla(PathInputView, { ...props, ref })`, with the constructor receiving a
  public props shape and the model receiving the ref-free `PathInputProps` subset;
- do not change `TagsInput`, `EditLinkDialog`, `NoteItemView`, `ExpandedNoteView`, or any other
  production caller;
- preserve the existing direct type exports from `PathInput.tsx` and `PathInput/index.ts`.

The React adapter must add no key and must not recreate the vanilla view for ordinary prop edits.
Constructor identity is stable; lifecycle replacement remains owned by `mountVanilla`.

### 4. Move PathInput styling to the co-located stylesheet

Add `src/renderer/uikit/PathInput/PathInput.css` and **import it from `PathInputView.tsx`** — the
file that actually creates the DOM. Importing it from `PathInput.tsx` instead would leave any
direct vanilla construction of `PathInputView` styled only by coincidence, because the stylesheet
would arrive through a module the vanilla path never loads. Translate the two Emotion blocks
exactly:

- scope every selector from `[data-type="path-input"]`;
- use `var(--color-...)` for `text.default`, `text.light`, `text.selection`, `text.strong`,
  `background.selection`, and all other colors;
- use `var(--space-md)` for row horizontal padding and `var(--size-control-sm)` for the current
  24px suggestion-row height; do not reintroduce numeric token literals;
- preserve flex sizing, cursor, ellipsis, active-state colors, disabled opacity/pointer behavior,
  and the prefix/separator descendant selectors;
- give the keyed suggestion row a stable `data-part` (for example `suggestion-row`) and use that
  established part selector instead of an Emotion class;
- keep the stylesheet in `@layer uikit`, with no global selector outside the required root scope.

The stylesheet must not style `Input` internals or `Popover` internals; those remain owned by their
existing React components. Verify that the extra bridge/host nodes do not change the root's flex
layout or outside-click selector behavior.

### 5. Leave the Storybook story alone

`src/renderer/uikit/PathInput/PathInput.story.tsx` should need **no edit**. `PathInputDemo` renders
`PathInput`, which after step 3 is the vanilla view, so the existing controls, defaults, and
last-commit display exercise the converted component as-is.

Do not add a `VanillaPathInputDemo`, a `vanillaComponent` field, or a declaration-site constructor
cast. US-994 removed that harness surface because both panes would have rendered identical DOM from
identical code.

If the story does turn out to need an edit, that is a finding: it means the conversion did not
preserve the React-facing contract, and the reason belongs in EPIC-053's Notes rather than in a
story-side workaround.

### 6. Verify behavior and record Epic B's measured number

Run `npm run typecheck`, `npm run lint`, and `git diff --check`. Perform the following focused
smoke checks in the Storybook PathInput story:

- **Before step 3**, with the suggestion popover open on today's React implementation, measure
  exactly one ArrowDown with a `MutationObserver` on the preview pane, after initial mutations have
  been cleared. Record the count, the observer options, and the reset point.
- React-only callers and the converted story render with no console errors or development warnings;
- the preview accepts typing, focus/blur, Escape, Enter, Tab, ArrowUp, ArrowDown, mouse hover, and
  suggestion selection with the same value/open/active behavior as before the conversion;
- changing every Storybook prop updates the preview without reconstructing the vanilla view, while
  switching away from the story disposes the view and removes its portalled popover;
- reordering/filtering paths preserves keyed row identity and active-row scrolling; duplicate or
  removed paths do not leave stale row references;
- disabled/read-only states, `data-type="path-input"`, `outsideClickIgnoreSelector`, `autoFocus`,
  accessibility attributes, and the external input ref remain correct;
- inspect light and dark themes and compare the converted CSS result with the pre-conversion
  appearance, especially active suggestion, prefix/separator, disabled, and compact-size states;
- **after the conversion**, repeat the ArrowDown measurement with identical observer options and
  reset point, and record both counts and the procedure in `doc/epics/EPIC-053.md` Notes.

No unit-test harness or test dependency is introduced. If the two counts differ, record the reason
(for example React reconciliation batching versus direct DOM writes) rather than silently changing
the interaction or adding a generic batching primitive.

## Concerns / Open questions

1. **`mountReact` has no update method — resolved by letting the bridge subscribe.**
   The adapter intentionally renders a stable React element once. PathInput still needs controlled
   input props, popover visibility, anchor refs, and current rows to change. Rather than a bespoke
   notification channel, the module-level bridge subscribes to state it can already read:
   `model.state.use()` for `open` and `activeIndex`, and a view-owned
   `TComponentState<PathInputProps>` pumped from the view's `update()` hook for the controlled
   props. That keeps both React children stable across commits, reuses `compareSelection` for the
   bail-out, and leaves exactly one update path per fact. Do not define the bridge component inside
   `mount()`, and do not widen the general adapter API for this one pilot.

2. **The portalled popover has a different DOM owner — resolved by a dedicated host and cascade
   disposal.** The keyed list owns only the host's direct row children; React owns the Popover root
   and the shared overlay layer. The view must unmount the React root before its vanilla root is
   detached, and must not infer ownership from DOM containment. The `data-type="path-input"`
   selector remains on the vanilla root because Popover's outside-click ignore rule depends on it.

3. **The Storybook story needs no vanilla counterpart — resolved by US-994.** An earlier plan added
   a story-only `VanillaPathInputDemo` to fill US-990's second pane. That pane is gone: once the
   React face delegates to `mountVanilla`, both panes would render identical DOM from identical
   code, so the comparison could not show a difference and the two mutation counts would
   necessarily be equal. The measured number moves to a before/after measurement instead, and the
   existing `PathInputDemo` is the verification surface.

4. **Suggestion memo conversion can create render-phase writes — a transient constraint.** While
   step 1 has landed and step 3 has not, `PathInputModel` is still pumped by `useComponentModel`,
   whose `setPropsInternal` runs during React rendering. In that window `applySuggestions` must
   preserve the memo dependency guard, avoid DOM work, and reset `activeIndex` without creating a
   loop or a cross-component update warning; verify it with path/value changes in the story. After
   step 3 the model is driven by `createComponentModelDriver` from a layout effect and no
   render-phase pump exists for this model at all, so do not design a permanent guard against a
   constraint that disappears at the end of the task.

5. **Model row references change from index identity to path identity.** The old effect used an
   index array, while `KeyedList` deliberately preserves nodes by `PathSuggestion.path`. The model
   must use the active index only to resolve the current path, and the view's keyed callbacks must
   clear refs when a path is removed. A stale index must never scroll a row belonging to a different
   path.

6. **Nested React commit timing and auto-focus.** `createRoot().render()` may commit the child
   bridge after `PathInputView.mount()` returns. Auto-focus/caret placement and the Popover anchor
   therefore must be completed from the child ref/layout completion path, not assumed to be ready at
   the moment `mountReact` returns. This is a pilot-specific ordering check; do not add a general
   scheduler to `VanillaView`.

7. **Controlled input versus direct DOM updates.** The vanilla view must not silently turn the
   controlled `value` prop into an uncontrolled field. Every external prop pump must reach the
   stable React Input bridge, while native input events continue to call the existing `onChange`
   callback. Verify rapid typing and parent-driven value changes, including switching Storybook
   props while the input is focused.

8. **MutationObserver counts are a proxy, not a private DOM-write counter.** React may batch or
   combine mutations differently from synchronous vanilla bindings, and observer delivery is
   asynchronous. Keep the interaction, observer options, reset point, and reporting format fixed;
   report the counts as mutation records and explain any batching difference in the Epic Notes.

9. **The model remains React-shaped in types.** Keeping `PathInputProps`' HTML attribute extension
   is consistent with the epic's measured B12 boundary; the runtime model has no React behavior,
   and only its two event parameters widen to native events. Do not broaden US-991 into a public
   prop-type redesign or change the caller contract while converting the view.

## Acceptance criteria

- [ ] `PathInput`'s existing public props, four production callers, Storybook controls, accessibility
      attributes, and underlying-input ref behavior remain compatible.
- [ ] `PathInputModel` registers zero `effect()` callbacks; its suggestion recompute guard,
      `applySuggestions`, path-keyed row references, `setActiveIndex`, native event handling, and
      blur-timer disposal preserve current behavior.
- [ ] `PathInputView` is a public-constructor `VanillaView` driven by
      `createComponentModelDriver`, with a stable root and no React-era model effects.
- [ ] The vanilla view hosts the existing React `Input` and `Popover` through `mountReact`; the
      bridge is module-level and stable, and ordinary prop/state updates do not recreate either
      nested React root.
- [ ] `KeyedList` uses `PathSuggestion.path`, preserves unchanged row identity, updates active
      state, clears removed row refs, and keeps `scrollIntoView({ block: "nearest" })` behavior.
- [ ] The Popover portal opens, positions against the real input, ignores clicks inside the
      `[data-type="path-input"]` root, and is fully removed on view/story disposal.
- [ ] `PathInput.css` replaces both Emotion blocks with `@layer uikit` rules scoped from the
      `path-input` root, using color and design-token variables and stable `data-part` selectors.
- [ ] `PathInput.story.tsx` is unchanged, and the existing story exercises the converted component
      through the unchanged React face.
- [ ] Storybook smoke checks cover typing, keyboard/mouse selection, focus/blur, disabled/
      read-only, auto-focus, path changes/reordering, theme appearance, and portal disposal with no
      console errors or warnings.
- [ ] The ArrowDown-with-open-popover MutationObserver measurement is taken on the React
      implementation before the view conversion and on the vanilla implementation after, and both
      counts and the method are recorded in EPIC-053 Notes.
- [ ] The two model changes beyond the epic's predicted two — path-keyed row references and the
      cancellable blur timer — are recorded as findings in EPIC-053 Notes.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; no unit-test harness,
      package dependency, unrelated caller migration, or general adapter redesign is introduced.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/PathInput/PathInputModel.ts` | Remove effects/memo dependency, add explicit suggestion/application and keyed-row methods, native event types, and timer cleanup |
| `src/renderer/uikit/PathInput/PathInputView.tsx` | New vanilla PathInput view, stable React child bridge, model driver, bindings, and keyed rows |
| `src/renderer/uikit/PathInput/PathInput.tsx` | Preserve the public React signature while delegating to `mountVanilla` |
| `src/renderer/uikit/PathInput/PathInput.css` | New scoped plain CSS replacement for the two Emotion blocks |
| `src/renderer/uikit/PathInput/PathInput.story.tsx` | No change expected; an edit here is a finding, not a step |
| `doc/epics/EPIC-053.md` | Record the pilot's measured mutation counts and implementation note |
| `doc/active-work.md` | Link US-991 under EPIC-053 |
| `doc/tasks/US-991-pathinput-pilot/README.md` | This investigation and implementation plan |

## Related work

- [EPIC-053 — De-React Epic B](../../epics/EPIC-053.md)
- [US-986 — Vanilla view lifecycle and `bind()`](../US-986-vanilla-view-lifecycle/README.md)
- [US-987 — Keyed-list and subtree-swap helpers](../US-987-structural-helpers/README.md)
- [US-988 — Model driver](../US-988-model-driver/README.md)
- [US-989 — `mountVanilla` / `mountReact`](../US-989-boundary-adapters/README.md)
- [US-990 — Storybook vanilla render path](../US-990-storybook-vanilla-render/README.md)
- [US-994 — Retire the Storybook side-by-side preview](../US-994-retire-side-by-side-preview/README.md)
- [US-983 — Emotion-to-CSS conventions](../US-983-emotion-to-css-conventions/README.md)
- [Model-view pattern](../../standards/model-view-pattern.md)
