# US-996: Establish the vanilla UIKit contracts and React baseline

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-054 — De-React Epic C1: Foundation and primitives](../../epics/EPIC-054.md)
**Created:** 2026-08-19

## Goal

Establish the shared contracts that every later C1 conversion consumes: subtree-slot filling and
React-compatible native event/attribute/ref forwarding. Update the UIKit authoring rules to make
those contracts normative, and capture the React MutationObserver baseline for the roadmap Rule 4
measurement before another C1 component conversion changes it.

This task does not convert a new component. It refactors the already-converted `PathInput` onto the
shared compatibility helpers so they have a real consumer, and it leaves `Panel`, `Text`, and every
other C1 component's public face and implementation otherwise untouched.

## Background

### Why this is a foundation task

EPIC-054 C1 converts eighteen foundation components behind their existing React-facing signatures.
The conversion is not just a DOM rewrite: the existing callers still pass React-shaped props while
the new view owns native DOM. The measured C1 surface contains:

- 20 components in scope; `Panel` and `Text` remain React-only legacy shims by decision;
- 16 components that spread `...rest`, carrying arbitrary attributes, `aria-*` values, and event
  handlers;
- 6 components that declare a forwarded `ref`;
- 9 public prop declarations involving `ReactNode` or `ReactElement`;
- 8 components that render `children`, plus 46 production named subtree-slot call sites;
- 18 C1 Emotion files, all of which later need the layered static-CSS contract.

Without a shared seam, each conversion would have to reproduce the same event wrapper, listener
bookkeeping, ref cleanup, slot disposal, and selection rules. The `PathInput` pilot already contains
the behavior-bearing versions of the first three pieces in
`src/renderer/uikit/PathInput/PathInputView.tsx`; US-996 extracts them rather than designing a
second implementation.

### Current PathInput compatibility code

`PathInputView` currently owns these mechanisms locally:

```ts
// synthetic-event adapter, currently local to PathInputView.tsx
function toPublicEvent(event: Event): React.SyntheticEvent<HTMLElement> { /* ... */ }

// applyRootProps(), currently also owns:
// - removal of attributes and listeners absent from the next props
// - onDoubleClick -> dblclick mapping
// - native listener wrappers that call toPublicEvent()

// setInputRef(), currently also owns:
// - object and callback ref assignment
// - callback-ref cleanup
// - nulling the previous ref before replacing it
```

The extracted helpers must preserve these behaviors. They are a React-compatibility boundary, so
their React references are type-only or confined to the event/ref surface; they are not a reason to
put React into the model or into the framework-neutral core contracts from US-995.

### Slot contract

`src/renderer/uikit/shared/slots.ts` owns `IconRef`, `SlotText`, `renderIcon`, and the development
warning for unknown icon names. A subtree slot is a different runtime problem and belongs in its
own `src/renderer/uikit/shared/fill-slot.ts` module so US-997 can rewrite the icon file without a
shared-task conflict:

```ts
export type SlotContent = string | Node | ReactNode;
export function fillSlot(host: HTMLElement, slot: SlotContent): () => void;
```

The dispatch is intentionally positional and does not attempt to recognize icon names. A string is
always text in a generic slot; an icon name is meaningful only to a prop explicitly named `icon`.
`fillSlot` uses `textContent` for strings, adopts a DOM `Node`, and uses `mountReact` only for the
remaining React-node case. Since `ReactNode` also includes numbers, arrays, fragments, and other
values that are not themselves `ReactElement`s, the helper wraps that arm in a React fragment before
calling the existing `mountReact` adapter. The returned disposer must unmount a temporary React root
and leave the host ready for the next value. `null`, `undefined`, and `false` clear the region and
return a no-op disposer; an empty string remains the string fast path.

`Story.previewChildren` remains React-only in C1. `LivePreview` still supplies it as
`componentProps.children`; a converted component's `fillSlot` call is the bridge that serves that
React node until the later component conversion removes the React arm.

The shared selection fragments remain in `selection-style.ts` for current React consumers. The
authoring guide records that a shared static fragment belongs in `uikit/shared/*.css`, under
`@layer uikit`, and migrates with its owning component. US-1000 creates the first such stylesheet
for `SelectableRow`; this task does not attempt to unify the six consumer-specific row selectors
or move Tree/ListBox/CategoryList/FolderItem across the React/vanilla boundary.

### Roadmap Rule 4 baseline

The epic's named interaction is one hover that opens a `Button` tooltip. The baseline must be taken
from the current React `Button`/`Tooltip` implementation before US-999 converts either one. Because
the tooltip is portaled to `#persephone-overlay-layer` under `document.body`, observing only the
Storybook preview would miss the important mutations. The baseline procedure observes both the
`[data-type="live-preview"]` subtree and `#persephone-overlay-layer` with identical options, resets
the counter after the trigger is ready and immediately before the hover, waits for the configured
show delay, and records the resulting mutation count and options in EPIC-054's Notes.

This is a historical baseline, not a React-versus-vanilla side-by-side comparison. Once C1
converts the tooltip/button cluster, the same procedure is repeated by US-999 for the after-number.

## Implementation plan

### 1. Add `SlotContent` and `fillSlot` to `uikit/shared/fill-slot.ts`

- Add `SlotContent = string | Node | ReactNode` and `fillSlot(host, slot)`.
- Clear the host before installing a new non-React value. Use `textContent` for strings and
  append/adopt a DOM node directly.
- Add a small render-capable sibling to the existing `mountReact` disposer API in `mount.tsx` (for
  example, a private/public `mountReactHandle` with `render()` and `dispose()`). Keep `mountReact`
  itself source-compatible for PathInput. When the previous and next slot values are both in the
  React arm, reuse that handle and call `render()`; do not unmount and recreate a React root.
- When the slot changes between React and non-React arms, or when the host is disposed, schedule the
  old root's `unmount()` in a microtask so a vanilla `onUpdate` reached from `mountVanilla`'s layout
  effect does not synchronously unmount a nested root during its parent's React commit. The handle
  identity must guard the deferred cleanup from unmounting a newer root that now owns the host.
- Return a generation-safe disposer for every call. It must be idempotent, must not let a stale
  disposer clear a later slot value, and must leave no stale child from the previous value.
- Treat `null`, `undefined`, and `false` as an empty slot; an empty string remains the string fast
  path and simply leaves the host empty. Do not add a callback slot,
  descriptor object, generic icon resolver, or serialization protocol.
- Keep the helper as a direct `uikit/shared` import. Do not add a new public component to the UIKit
  barrel merely to expose this internal conversion seam.

### 2. Extract the React-compatibility helpers

Create one shared module, `src/renderer/uikit/shared/react-compat.ts`, containing:

```ts
toPublicEvent(event: Event): React.SyntheticEvent<HTMLElement>;
applyRestProps(root: HTMLElement, rest: Record<string, unknown>, previous?: RestPropsState): RestPropsState;
bindRef<T extends Element>(element: T | null, ref: React.Ref<T> | undefined, previous?: RefState<T>): RefState<T>;
```

The exact bookkeeping types may remain module-local except where `PathInputView` needs to retain
them between updates. The implementation must:

- preserve the current synthetic-event shape (`nativeEvent`, live `target`/`currentTarget`,
  `preventDefault`, `isDefaultPrevented`, `stopPropagation`, `isPropagationStopped`, `persist`, and
  `isPersistent`);
- map `onDoubleClick` to the native `dblclick` event and map other `onX` props to their lowercase
  native event names;
- remove an old listener before installing its replacement, and remove listeners/attributes that
  disappear from the next prop set;
- treat `null`, `undefined`, and `false` as absent attributes, `true` as an empty boolean attribute,
  and other values as string attributes;
- retain the current behavior that non-function `onX` values are not installed as listeners;
- assign object refs and invoke callback refs, call callback cleanup when React 19 supplies one,
  null the previous ref before replacement, and clear the ref on disposal.

`applyRestProps` receives only the residual DOM props after the component has removed its model,
state, children, `ref`, and other reserved props. Component-owned `data-type` and state attributes
must be written by the view after residual forwarding so callers cannot overwrite the required root
contract accidentally.

### 3. Refactor `PathInputView` onto the helpers

Modify `src/renderer/uikit/PathInput/PathInputView.tsx` only where the extracted behavior replaces
the local implementation:

- remove the local `toPublicEvent`, forwarded-attribute set, forwarded-listener map, and their
  cleanup code;
- retain `applyRootProps` as the component-specific projection for `data-type`, `data-name`,
  disabled/read-only state, and the props that must not reach the root; delegate residual forwarding
  to `applyRestProps` and retain the previous bookkeeping between updates. This deliberately
  reverses the current order: residual props are applied first and the required component-owned
  attributes are written afterward, so a stray caller-supplied `data-type` can no longer win. That
  hardening is the one intentional PathInput DOM difference; the public signature and all intended
  `data-*` output remain unchanged;
- route the input's external ref through `bindRef` while continuing to update
  `PathInputModel.inputRef` for the model's DOM commands;
- preserve the current `Input`/`Popover` React bridges, keyed suggestion list, native row event
  behavior, model-driver lifecycle, and public `PathInput` signature;
- leave `PathInput.tsx`, `PathInputModel.ts`, `suggestions.ts`, and the story behavior unchanged
  unless type-only import changes are required.

The refactor is the first real consumer check for the helpers. It must not be used to broaden the
PathInput API, change event types, move model logic into the view, or convert another component.

### 4. Amend the UIKit authoring guide

Update `src/renderer/uikit/CLAUDE.md`:

- amend **UIKit authoring Rule 7** so converted components use one co-located `Component.css` under `@layer uikit`,
  scoped from the required `[data-type]` root, while unconverted components may remain on Emotion;
- document the shared stylesheet rule: shared fragments such as selection styling live in
  `uikit/shared/*.css`, and consumers migrate to that stylesheet with their owning component;
- extend **UIKit authoring Rule 9** with the prop-removal rule: every `onUpdate` must both set current attributes,
  listeners, refs, and state projections and clear anything removed from the prior props;
- document that `fillSlot` is the only generic subtree-slot bridge, strings mean text, and a
  temporary React root is disposed before a slot is refilled or discarded;
- document that `applyRestProps`, `toPublicEvent`, and `bindRef` are the shared compatibility seam,
  and that converted views must not silently drop `...rest`, native event semantics, or refs.

### 5. Capture and record the React roadmap Rule 4 baseline

Before US-999 or any other C1 conversion changes `Button`/`Tooltip`:

1. Open the `Button` story in Storybook and set a non-empty `title` with the tooltip enabled.
2. Identify the live-preview button and ensure `#persephone-overlay-layer` exists or let the hover
   create it.
3. Install one `MutationObserver` over both the live-preview subtree and overlay layer, using
   `{ subtree: true, childList: true, attributes: true, characterData: true }` for both.
4. Reset the counter immediately before one hover, wait through the tooltip show delay until the
   tooltip is visible, then disconnect and record the mutation count. Do not include setup or
   tooltip-opening mutations from before the reset.
5. Record the exact count, observer options, story values, and procedure in EPIC-054's Notes. The
   count is the immutable React baseline; US-999 owns the matching after-number.

### 6. Verify the foundation through the PathInput story

- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Open the PathInput story and exercise controlled value updates, disabled/read-only state,
  forwarded attributes, click/double-click handlers, focus/blur, callback/object refs, suggestion
  creation/removal/reordering, keyboard navigation, and disposal of the nested React Popover.
- Confirm no stale attribute or listener survives removal from the next props and no React root is
  left in the overlay layer after unmount.
- Confirm no shared selection stylesheet is introduced or imported by this task; its first static
  consumer is US-1000's `SelectableRow` conversion.
- Do not add a unit-test harness; this repository's verification path is typecheck, lint, and the
  Storybook smoke check plus the explicit baseline measurement.

## Concerns / Open questions

1. **Residual prop removal is the main correctness hazard.** React silently removes a DOM attribute
   or listener when a prop disappears; direct DOM code does not. `applyRestProps` must retain the
   previous bookkeeping and remove absent keys before applying the next set. The helper should not
   attempt to own component-specific state attributes; the view writes those explicitly and clears
   them when their source prop is absent.

2. **Reserved attributes versus arbitrary `...rest`.** `data-type` and component state attributes
   are part of the UIKit DOM contract. The helper must receive only residual props, and the view must
   write required attributes after forwarding, so a caller's accidental `data-type` cannot corrupt
   the root identity. This is a deliberate hardening boundary, not a public prop removal.

3. **Synthetic event compatibility is intentionally narrow.** The helper preserves the shape that
   existing PathInput callers receive; it does not recreate React's event pooling, plugin system,
   propagation phases, or every internal SyntheticEvent field. Native `Event`/`MouseEvent` objects
   remain the source of truth, and `toPublicEvent` is only for unchanged React-facing callbacks.

4. **Callback-ref cleanup must not double-run.** React 19 callback refs may return a cleanup function.
   `bindRef` must call that cleanup exactly once before replacement/unmount, then call a callback ref
   with `null` only when appropriate. Object refs must be nulled when the element leaves the view.
   The helper must also tolerate an unchanged `(element, ref)` pair without churn.

5. **Slot replacement owns a React root, but not the host.** `fillSlot` may mount React content into
   a dedicated region. A React-to-React update must reuse the existing root with `render()`; only an
   arm change or disposal schedules an unmount. That unmount is deferred to a microtask when reached
   during a parent commit, and the generation guard must prevent it from touching a replacement root.
   The caller owns the host element and decides when the entire view detaches it. A DOM Node slot is
   adopted, not cloned, and the helper must not invent a generic callback or descriptor protocol.

6. **The baseline is irreversible after conversion.** Once US-999 converts the Button/Tooltip
   interaction, a later attempt to measure "before" from the same checkout is not a valid React
   baseline. Capture the number before touching those components, observe the overlay host as well as
   the Storybook pane, and record the exact procedure rather than only a bare integer.

7. **No unit-test harness exists.** The helpers are shared and important, but adding a test framework
   here would expand the task beyond the project's verification model. PathInput is the first
   behavior-bearing consumer; typecheck/lint, the Storybook smoke path, and the baseline measurement
   are the agreed checks. A future pure-DOM test harness can be introduced separately if needed.

## Acceptance criteria

- [ ] `SlotContent` and `fillSlot` exist in `uikit/shared/fill-slot.ts`; strings use `textContent`, DOM
      nodes are adopted, React nodes (including fragments/arrays) use `mountReact`, and every disposer is idempotent and cleans
      the prior slot value without a callback or icon-descriptor protocol.
- [ ] React-to-React slot updates reuse one mounted root; arm changes and disposal defer unmount
      safely off the parent commit, and stale disposers cannot clear a newer slot value.
- [ ] `toPublicEvent`, `applyRestProps`, and `bindRef` are extracted into
      `uikit/shared/react-compat.ts`; PathInput uses them, and its public props, DOM contract,
      synthetic event behavior, listener replacement/removal, and object/callback ref behavior are
      unchanged except for the documented hardening that component-owned attributes are written
      after residual props.
- [ ] Removed residual props clear old attributes/listeners, component-owned `data-type` and state
      attributes remain authoritative, and no compatibility helper leaves a subscription, listener,
      ref, or nested React root alive after disposal.
- [ ] `uikit/CLAUDE.md` documents the layered CSS transition, shared stylesheet ownership,
      `fillSlot`, the React-compatibility helpers, and the rule that `onUpdate` clears removed props.
- [ ] The React roadmap Rule 4 baseline is recorded in EPIC-054's Notes for one Button-tooltip hover,
      including the exact count, story values, observer options, reset point, and coverage of both
      `[data-type="live-preview"]` and `#persephone-overlay-layer`.
- [ ] The PathInput Storybook smoke check covers forwarding, refs, keyboard/mouse behavior, stale
      prop removal, and nested Popover disposal; `npm run typecheck`, `npm run lint`, and
      `git diff --check` pass.
- [ ] No additional UIKit component is converted, no story API is widened, no unit-test harness is
      added, and `Story.previewChildren` remains served by the transitional React arm of
      `fillSlot`.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/shared/fill-slot.ts` | New subtree-slot contract, using a render-capable mount handle |
| `src/renderer/uikit/shared/react-compat.ts` | New synthetic-event, residual-prop, and ref helpers |
| `src/renderer/uikit/shared/mount.tsx` | Add the render-capable React mount handle while preserving `mountReact` |
| `src/renderer/uikit/PathInput/PathInputView.tsx` | Extract local compatibility logic onto shared helpers |
| `src/renderer/uikit/CLAUDE.md` | Document CSS, slot, compatibility, and prop-removal contracts |
| `doc/epics/EPIC-054.md` | Link the task and record the React roadmap Rule 4 baseline after measurement |
| `doc/active-work.md` | Link US-996 under EPIC-054 |
| `doc/tasks/US-996-vanilla-uikit-contracts/README.md` | This investigation and implementation plan |

No `uikit/index.ts` export is required for the internal helper modules. Later converted components
should import them directly from `uikit/shared/`; existing public React faces continue to be exported
from the UIKit barrel.

## Related work

- [EPIC-054 — De-React Epic C1](../../epics/EPIC-054.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [Model/view pattern](../../standards/model-view-pattern.md)
- [PathInput pilot](../US-991-pathinput-pilot/README.md)
- [US-995 — UIKit import boundary](../US-995-uikit-boundary-lint/README.md)
- US-997 — planned DOM icon path and dual-face icon factories
