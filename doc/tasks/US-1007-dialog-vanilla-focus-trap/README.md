# US-1007: `Dialog` and `DialogContent` — vanilla focus trap and backdrop

**Status:** Implemented

**Priority:** Critical

**Epic:** [EPIC-055 — De-React Epic C2: Floating layer and composites](../../epics/EPIC-055.md)

**Created:** 2026-08-21

## Goal

Replace the UIKit `Dialog` and `DialogContent` implementations with `VanillaView` adapters while
preserving their public props, placement, DOM contract, focus trap, backdrop handling, sizing,
icons, close button, and arbitrary React children. The dialog remains in its caller-owned React
location; this task does not add a portal or change any application dialog call site.

## Background

### Current surface

`src/renderer/uikit/Dialog/Dialog.tsx` currently owns the full-screen dialog root and uses a
`useLayoutEffect` for two responsibilities:

- capture the active element, focus the first visible focusable descendant (or the dialog root),
  and restore the previous element on unmount;
- rerun the initial focus behavior if `autoFocus` changes.

The root's `onKeyDown` callback runs the caller first, then traps `Tab` within the dialog. The
root's `onClick` callback runs the caller first, then calls `onBackdropClick` only when the event
target is the root itself. `getFocusable()` is already a plain DOM function and can move to the
vanilla view unchanged, including its `offsetParent` visibility check and exact selector.

`src/renderer/uikit/Dialog/DialogContent.tsx` currently renders a flex-column root, an optional
header, the title, an optional leading `IconRef`, optional `headerButtons`, an `IconButton` close
action, and arbitrary `children`. It constructs a fresh sizing object on every render and passes
it through `style`; the vanilla view must explicitly clear each old sizing property when the
corresponding prop becomes `undefined`.

There are 14 production `<Dialog>` and 14 production `<DialogContent>` sites, all paired. The
production callers are the 13 files under `src/renderer/ui/dialogs/` plus
`src/renderer/editors/link-editor/EditLinkDialog.tsx`. The story is the only additional caller.
The production icon inputs are registry names except for `TorInfoDialog.tsx`, whose `TorIcon` is
a React node. `headerButtons` is exercised by the story and has no production caller. No caller
passes `position="right"` in the current production scan, but the story exposes it and the view
must preserve it.

### Existing composition and lifecycle infrastructure

- `src/renderer/uikit/shared/vanilla-view.ts` provides stable roots, FIFO disposal, child
  ownership, guarded state bindings, and the constructor/mount/update contract.
- `src/renderer/uikit/shared/mount.tsx` provides the module-level `mountVanilla` host, while
  `src/renderer/uikit/shared/fill-slot.ts` provides the existing narrow React bridge. A converted
  Dialog can retain its `children: ReactNode` API through `fillSlot` while its own shell and
  interaction logic are native.
- `src/renderer/uikit/shared/react-compat.ts` provides `applyRestProps`, `bindRef`, and
  `toPublicEvent`. Dialog callbacks must use the public-event facade so `event.key`,
  `event.defaultPrevented`, and `preventDefault()` retain their React-facing behavior.
- `src/renderer/uikit/IconButton/IconButtonView.tsx` is already a vanilla view. The native
  `DialogContentView` should own its close-button child directly rather than mounting a second
  React `IconButton` subtree.
- `createIconElement()` in `uikit/shared/slots.ts` is the DOM path for registry names. A React
  node such as `TorIcon` remains on the transitional React slot arm; no new icon descriptor or
  registry entry is introduced.

`Dialog` is not a floating component and does not use `getOverlayLayer()`. `Dialogs.tsx` continues
to place it through the normal React tree, and `Poppers.tsx` is unrelated. This task must not
change `Dialogs.tsx`, `showDialog`, dialog result handling, or the app's host placement.

### DOM and style contract

The observable contract to preserve is:

```text
div[data-type="dialog"][data-name?][data-position="center|right"]
  tabindex="-1"
  span[data-part="react-slot"]          // DialogView's children bridge, display: contents
    div[style="display: contents"]      // VanillaHost for DialogContentView
      div[data-type="dialog-content"][data-name?][data-has-header?]
        div?                             // native header, only when header content exists
          icon svg or React icon?
          span?                           // title box / ellipsis region
          header buttons?
          button[data-type="icon-button"]? // converted close button
        body children
```

The adapter hosts are implementation boundaries and must remain `display: contents`; they must
not create flex/grid gaps or visible layout boxes. The component-owned `data-type`,
`data-position`, `data-has-header`, `data-name`, and `tabindex` values remain unchanged. The
The Dialog root remains the full absolute backdrop layer. The DialogContent root is a descendant
through the two layout-transparent hosts, so the center/right selectors must not use a direct-child
combinator.

The current Emotion declarations translate to `Dialog/Dialog.css` under `@layer uikit`:

- `persephone-dialog-pulse` replaces Emotion's generated `pulse` name;
- the Dialog root keeps absolute full-viewport positioning, `z-index: 100`, transparent
  background, outline reset, and the 0.1 second scale animation;
- center keeps flex centering, border, large radius, and shadow on the content descendant;
- right keeps the content descendant absolute on the right with top/right/bottom, minimum width,
  and a left border. The selectors must be descendant selectors, not `>`, because the two
  layout-transparent hosts remain DOM elements after conversion;
- DialogContent keeps the flex-column, relative, themed background, and hidden overflow;
- header, title box, spacing, border, background, ellipsis, and shrink behavior keep their current
  order and specificity.

Use the established token custom properties and fallbacks rather than hardcoded theme colors.
Keep `data-type` as the inspection/addressing contract. Add private `dialog-shell` and
`dialog-content-shell` classes in the two view constructors and key `Dialog.css` from those
classes. `className` is omitted from both public prop types, so residual props cannot disable the
style hooks. Apply component-owned `data-position` after residual forwarding so the geometry
selector cannot be silently changed by an arbitrary `data-position` attribute; retain the
attribute for inspection and automation.

## Implementation plan

### 1. Capture the React behavior and caller inventory before editing

- Re-run the 14 production caller scan and keep the exact list in this document or the task
  diff if callers change before implementation.
- Before translating Emotion, scan Dialog's selectors for `>`, `:empty`, `:nth-child`, `+`, and
  `~`. The two bridge hosts make the existing `& > [data-type='dialog-content']` selectors no
  longer match, so both center/right rules must become descendant selectors and be checked against
  the actual post-conversion DOM.
- Capture a Storybook `Dialog` snapshot with the default centered dialog, then repeat with the
  right position, icon, header button, sizing controls, `autoFocus` disabled, and both themes.
- Record the current focus sequence manually: trigger focus → open → initial focus, Tab and
  Shift+Tab wrap, empty-focusable fallback, Escape handled by the caller, backdrop click, content
  click, and focus restoration after close. The converted implementation must compare these
  behaviors, not only the static HTML.
- Do not modify application callers, `Dialog.story.tsx`, `Dialogs.tsx`, or `Poppers.tsx` merely to
  make the conversion compile.

### 2. Make the public faces thin `mountVanilla` adapters

Change `Dialog.tsx` and `DialogContent.tsx` to preserve their exported prop types and return
`mountVanilla` with the corresponding view props. Pass React 19 `ref` explicitly to the view so
the root receives the same callback/object-ref behavior as the current React component.

Create public-constructor view classes in the Dialog folder:

- `DialogView` extends `VanillaView<DialogViewProps>` and owns the stable root, root attributes,
  rest props, native click/keydown listeners, focus bookkeeping, and the children bridge.
- `DialogContentView` extends `VanillaView<DialogContentViewProps>` and owns the header/body DOM,
  sizing writes, title/icon/header-button slots, and the converted `IconButtonView` close child.

Do not introduce a model or `TComponentModel`; Dialog has no business state and its existing
hooks are view lifecycle behavior. Keep the public prop signatures React-shaped, including
`ReactNode` children, `IconRef`, `headerButtons`, and React event callback types.

### 3. Port Dialog root behavior without changing its placement

In `DialogView`:

- build only the stable root in the constructor; append no child DOM before mount;
- on mount, apply residual props and component-owned attributes, bind the caller's ref, and
  install native `click` and `keydown` listeners with the same caller-first ordering as React;
- when the root receives a click, call `onClick` first and then call `onBackdropClick` only when
  `event.target === root` and the event was not prevented;
- when the root receives a keydown, call the public `onKeyDown` first, stop if its event was
  prevented, then reproduce the exact `Tab` trap using the existing `getFocusable` function;
- preserve `tabIndex={-1}`, `data-type="dialog"`, `data-name`, and `data-position`, including
  removal of stale optional attributes on update;
- forward all residual attributes/listeners through `applyRestProps`, excluding component-owned
  controls (`name`, `position`, `onBackdropClick`, `autoFocus`, `children`, `onKeyDown`,
  `onClick`, and `ref`). Keep the current residual-prop precedence unless the selected private
  style hook is specifically intended to prevent a style-marker override;
- capture `document.activeElement` on mount before autofocus. Focus the first visible focusable
  descendant when `autoFocus` is true, otherwise leave focus unchanged; if none exists, focus the
  root. On disposal, restore the captured element only when it is still in the document;
- apply autofocus once per mounted Dialog. The six production `autoFocus={false}` callers use a
  literal, and the remaining callers use the default; no production caller toggles it. Do not
  reproduce React's effect-rerun quirk when the prop changes, because its cleanup would recapture
  focus from inside the dialog and corrupt the restore target;
- render the children bridge with `fillSlot`, including a module-scope `DialogCommitSignal` whose
  `useLayoutEffect` invokes a view callback after the nested React subtree commits. The callback
  runs the idempotent autofocus pass after focusable children exist; it is not a timer or retry
  loop. Reset its `focusApplied` flag only for a newly mounted view.

The view must remain in the normal React tree. The adapter removes the view root after
`dispose()`; the view itself should not create a portal or call `getOverlayLayer()`.

### 4. Port DialogContent's native structure and converted close button

In `DialogContentView`:

- create the root, header, title box, and any slot hosts in the mount hook; do not create an
  empty icon or header-button flex item when that prop is absent;
- emit `data-type="dialog-content"`, `data-name`, and `data-has-header` exactly as today;
- compute `hasHeader` from `title !== undefined || icon !== undefined || onClose !== undefined ||
  headerButtons !== undefined`, preserving an empty-string title as a visible header;
- write `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, and `maxHeight` directly to
  `root.style`, appending `px` to numbers and passing strings through. Every update must clear a
  property that was set by the previous props but is now absent;
- drive those writes from one `SIZING` field map/list rather than six unrelated branches. Reuse
  the existing `cssLength` helper from `InputView.tsx` (export it for this shared conversion
  rather than writing a second number-to-pixel helper), and call `style.removeProperty()` for
  missing values;
- render the title as text content in the title box, preserving nowrap/ellipsis behavior;
- route both icon arms through `fillSlot`: pass `createIconElement()` as a native `Node` for a
  registry name and the React node directly for the React arm. Transitioning between the two arms
  must release the previous root without clearing the next arm;
- compose `IconButtonView` for the close action with `size="sm"`, `icon="close"`,
  `aria-label="Close"`, and the current `onClose`. Own it with `SubtreeSwap<"close">` over the
  header: its detached factory constructs the child and the view mounts it only after `set()` has
  attached the root. An unchanged key is updated directly; adding/removing `onClose` uses the
  swap's clear/set transition, so the button is present only when defined and cannot be
  double-owned;
- preserve `headerButtons` as a React-node slot. It is story-only today, but it remains a public
  subtree slot and must not be deleted or narrowed in this task;
- preserve that `headerButtons` slot through `fillSlot`, so the React arm gets the same
  detach-before-deferred-unmount behavior as the other slot bridges;
- render arbitrary `children` through `fillSlot` on a dedicated layout-transparent body host. The
  bridge is the compatibility boundary for the 14 unchanged callers; it must not become a public
  slot API or a reason to mount the whole Dialog through React again;
- register every bridge, slot cleanup, close-button child, and ref cleanup with the view's
  ownership/disposal rules. Detach a bridge host before any deferred nested-root unmount so a
  parent React commit cannot synchronously unmount a nested root in the middle of its own commit.

### 5. Translate the two Emotion blocks to `Dialog.css`

Create `src/renderer/uikit/Dialog/Dialog.css`, import it from the converted public face, and put
all rules under `@layer uikit`. Root the selectors at `.dialog-shell` and
`.dialog-content-shell`, with descendant selectors for the content geometry. Preserve the source
order of the center/right content selectors:
they have equal or competing specificity and must continue to win in the same cases. In
particular, verify:

- center content has the default border/radius/shadow;
- right content has the right-edge geometry and left border;
- DialogContent's header border/background and title ellipsis remain unchanged;
- the pulse animation has the stable `persephone-dialog-pulse` name and no Emotion runtime
  dependency remains in either Dialog source file;
- CSS uses the existing `--color-*`, `--radius-*`, `--space-*`, and `--font-*` variables with
  fallbacks, and no new hardcoded theme color is introduced;
- the chosen private root style hooks cannot be overwritten by residual `data-*` props, while
  `data-type` and `data-name` remain available for snapshots and automation.

### 6. Verify focus, nested React content, and all public variants

Use the Storybook dialog and representative application dialogs, including at minimum:

- a simple confirmation dialog and the `autoFocus={false}` input/password/open-URL flows;
- `TorInfoDialog`'s React-node `TorIcon` arm;
- `TextDialog`'s editor/body subtree;
- `CommitDialog` and `EditLinkDialog` with multiple inputs and buttons;
- the story's right-position, header icon, header-button, sizing, backdrop, and both-theme cases.
- the `autoFocus={false}` flows whose inner `Input`/`Textarea` carries its own `autoFocus` (for
  example `OpenUrlDialog.tsx:61` and `CommitDialog.tsx:194`), because that focus path belongs to
  `InputView`/`TextareaView`, not the Dialog focus pass;

For each, verify that both center and right geometry retain their border/radius/shadow or
right-edge placement in light and dark themes. Verify that content remains interactive, `Tab`/`Shift+Tab` never escapes while the
dialog is active, caller `onKeyDown` can consume the event, backdrop clicks close only when the
backdrop itself is clicked, content clicks do not close, Escape remains owned by the caller, and
focus returns to the pre-dialog element after close. Capture `browser_snapshot` output and compare
the `data-type`, `data-name`, `data-position`, and `data-has-header` contract before and after the
conversion, including the existing converted IconButton data-parts. Confirm there is no portal or
overlay-layer insertion.

Finally run `npm run typecheck`, `npm run lint`, and `git diff --check`.

## Concerns / Open questions

1. **Nested React roots are required by the unchanged `ReactNode` API.** Dialog children include
   arbitrary UIKit/editor trees, while DialogContent also has `headerButtons`, a React-node icon
   arm, and arbitrary children. Use `fillSlot` for all three React arms so its existing
   layout-transparent host and detach-before-deferred-unmount behavior are reused. Do not widen
   public props or create a generic slot protocol.

2. **Autofocus must wait for the nested subtree's commit.** `mountVanilla` attaches the Dialog
   root before `mount()`, but the first `fillSlot` React render is scheduled and its descendants
   are not available to `getFocusable()` during `onMount()`. Include a module-scope
   `DialogCommitSignal` in the children fragment; its `useLayoutEffect` calls an idempotent
   `runFocusPass` after each bridge commit. The view's `focusApplied` guard makes this a single
   focus pass, with no timer, retry loop, or global document listener.

3. **Native callback ordering remains compatible through the bridge host.** React's bridge root is
   a descendant of the Dialog root, so child React handlers still bubble to the root's native
   listener after the child has had a chance to call `preventDefault()` or `stopPropagation()`.
   The root listener must call each public callback once through `toPublicEvent`, then inspect the
   real event's `defaultPrevented` state. Verify this once with the story's nested inputs.

4. **The style hook is resolved with private classes.** Current Dialog JSX spreads residual props
   after component-owned data attributes, although the 14 measured callers pass no conflicting
   `data-type`. The views therefore add `dialog-shell` and `dialog-content-shell`, and the CSS is
   rooted there. `data-type`, `data-name`, `data-position`, and `data-has-header` remain the
   inspection contract; `data-position` is written after residual forwarding so it remains
   authoritative for geometry.

5. **Conditional close-button ownership uses `SubtreeSwap`.** `onClose` is stable at current call
   sites but is a public prop. Use `SubtreeSwap<"close">`; an unchanged key updates the retained
   `IconButtonView`, while clear/set constructs detached roots and mounts them only after attach.
   This enforces single ownership and prevents leaks or double disposal if the prop changes.

6. **Sizing writes must clear old values.** React clears removed style keys on each render. Use one
   six-field sizing list and the existing `InputView.cssLength` helper (exported for reuse), then
   call `removeProperty()` when a value is absent. Test each property through set → change →
   `undefined`, including numeric and string values.

7. **Dialog remains intentionally outside the floating layer.** It does not register with
   `overlayRegistry`, does not use `getOverlayLayer()`, and does not gain tooltip suppression in
   this task. Those would be behavior changes outside C2-2; preserve the existing placement and
   leave any overlay-registry improvement for a separately scoped decision.

8. **The Storybook header-button and React-icon paths are low-production-pressure paths.**
   `headerButtons` has only the story caller, while `TorIcon` is the sole production React-node
   icon. Keep both because they are part of the public API, but verify them explicitly rather than
   allowing the registry-name happy path to stand in for the full slot contract.

## Acceptance criteria

- [x] `Dialog` and `DialogContent` are thin `mountVanilla` faces with unchanged public prop types,
      refs, React-node children, icon arms, header buttons, and event callbacks.
- [x] `DialogView` and `DialogContentView` have public constructors, no `TComponentModel`, and
      follow the established constructor/mount/update/dispose ownership rules.
- [x] The dialog remains in its caller-owned React tree; no portal, overlay-layer registration,
      caller migration, or `showDialog`/`Dialogs.tsx` change is introduced.
- [x] The root/backdrop contract, center/right geometry, `data-*` attributes, rest-prop behavior,
      focus capture/restore, autofocus, Tab/Shift+Tab trap, caller-first key/click behavior, and
      backdrop-only close behavior match the React implementation.
- [x] Both center and right positions retain their border/radius/shadow or right-edge geometry in
      light and dark themes; the converted CSS uses descendant selectors that still match through
      the DialogView bridge host and VanillaHost.
- [x] DialogContent preserves header presence, title fallback/ellipsis, icon and header-button
      ordering, converted close-button behavior, arbitrary children, and all six sizing properties;
      removed sizing props clear their old inline values.
- [x] Registry icons use `createIconElement`; React-node icon/header/children arms use the existing
      narrow bridge without a new slot descriptor or public API.
- [x] `Dialog.css` is in `@layer uikit`, uses stable `persephone-dialog-pulse`, preserves Emotion
      selector order/specificity and token fallbacks, and leaves no Emotion import in the converted
      Dialog implementation.
- [x] Autofocus is driven by the module-scope React commit signal after children exist, while
      `autoFocus={false}` dialogs still allow their inner Input/Textarea autofocus path to run.
- [x] Storybook and representative application dialogs work in light and dark themes, with
      content interactive and focus restored after close; snapshots show the expected
  `data-type`/`data-name` contract (plus the existing converted IconButton data-parts) and no
  overlay-layer portal.
- [x] The 14 production caller files and story compile without JSX changes, and
      `npm run typecheck`, `npm run lint`, and `git diff --check` pass.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Dialog/Dialog.tsx` | Thin public `mountVanilla` face; preserve `DialogProps` |
| `src/renderer/uikit/Dialog/DialogContent.tsx` | Thin public `mountVanilla` face; preserve `DialogContentProps` |
| `src/renderer/uikit/Dialog/DialogView.tsx` | New native dialog root, focus trap, backdrop handling, refs, commit signal, and child bridge |
| `src/renderer/uikit/Dialog/DialogContentView.tsx` | New native header/content/sizing view, icon slots, and close-button ownership |
| `src/renderer/uikit/Dialog/Dialog.css` | Layered Dialog and DialogContent styles plus stable pulse keyframe |
| `src/renderer/uikit/Input/InputView.tsx` | Export the existing `cssLength` helper for DialogContent sizing reuse |
| `src/renderer/uikit/Dialog/index.ts` | Only if direct view/type re-exports are required; keep public exports unchanged |
| `doc/active-work.md` | Link US-1007 under EPIC-055 |
| `doc/epics/EPIC-055.md` | Link the US-1007 task document and update status only when implementation begins/completes |

No production Dialog caller, Storybook story, `Dialogs.tsx`, `Poppers.tsx`, overlay registry,
package dependency, or public prop is intentionally changed.

## Related work

- [EPIC-055 — De-React Epic C2](../../epics/EPIC-055.md)
- [US-1005 — Popover vanilla floating root](../US-1005-popover-vanilla-floating-root/README.md)
- [US-1006 — Menu and WithMenu vanilla attachment](../US-1006-menu-vanilla-recursive/README.md)
- [US-996 — Vanilla UIKit contracts and React compatibility](../US-996-vanilla-uikit-contracts/README.md)
- [US-987 — KeyedList and SubtreeSwap](../US-987-structural-helpers/README.md)
- [US-992 — Vanilla UIKit authoring guide](../US-992-vanilla-view-authoring/README.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
