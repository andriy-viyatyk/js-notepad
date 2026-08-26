# US-1124: The floating-layer stories

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)
**Created:** 2026-08-26

## Goal

Move the five floating-layer Storybook demos to the typed vanilla `view` arm, preserving their
controls, sample data, layout, interactions, and story metadata. Ensure every overlay, attachment,
positioner, listener, timer, and story-owned global-state operation is retired with the demo.

## Background

US-1122 and US-1123 established the conversion shape: the story-local React wrapper becomes a
story-local `VanillaView`, its former hook state becomes plain fields, real UIKit components become
owned child views, and child DOM is created in `onMount()`. The constructor creates only the stable
demo root. `SubtreeSwap` is used where an open overlay is structurally conditional so closing it
disposes the outgoing view rather than merely hiding it.

The five current stories and their native targets are:

| Story | Wrapper context | Native target / ownership |
|---|---|---|
| `src/renderer/uikit/Popover/Popover.story.tsx` | Anchor button, open state, placement/content controls, optional ignored sibling, long content | `PopoverView`, with a native content view supplied through `contentView`; the demo owns the conditional `PopoverView` subtree and its anchor `ButtonView` |
| `src/renderer/uikit/Menu/Menu.story.tsx` | Static menu data selected by `variant`, render-prop trigger, placement and offsets | `MenuView`, opened as an owned conditional child and explicitly disposed on close and demo disposal |
| `src/renderer/uikit/Dialog/Dialog.story.tsx` | Open state, two controlled form values, background panel, optional icon/header button, sizing and focus controls | `DialogView` plus `DialogContentView`, a local native body view, and an optional `IconButtonView`; the complete open branch is disposed on close |
| `src/renderer/uikit/Progress/Progress.story.tsx` | Completion log, lock set, direct timers, delayed promises, and six controls | `ProgressOverlayView` mounted in the demo; the wrapper continues to call the public progress APIs and cancels its own pending work/state on disposal |
| `src/renderer/uikit/Tooltip/Tooltip.story.tsx` | Tooltip content and floating options | `attachTooltip` attached to an owned `ButtonView`; the returned `TooltipAttachment` is explicitly disposed |

The original Progress story does not render a `Progress` component: `component` is `ProgressDemo`,
which renders only the controls/log and drives the application-root overlay through
`notifyProgress`, `showProgress`, `createProgress`, `addScreenLock`, and `removeScreenLock`.
`ProgressOverlayView` is therefore the correct native component child for the conversion: it covers
the notification, blocking-progress, and locked projections, but not the wrapper controls, promise
timing, changing labels, or completion log, all of which remain in `ProgressDemoView`.

Before → after story declaration:

```ts
// Before
export const popoverStory: Story = {
    component: PopoverDemo as any,
    props: [/* existing definitions */],
};

// After
class PopoverDemoView extends VanillaView<PopoverDemoProps> { /* native demo context */ }

export const popoverStory: Story<PopoverDemoProps> = {
    view: PopoverDemoView,
    props: [/* the same definitions and values */],
};
```

## Implementation Plan

### 1. Convert Popover

Rename `src/renderer/uikit/Popover/Popover.story.tsx` to `.story.ts`. Define local
`PopoverDemoView` and a local native content view. Build the outer column/row panels, the owned
anchor `ButtonView`, and the optional `data-test-ignore="true"` sibling in `onMount()`.

Use a `SubtreeSwap` in the demo for the open `PopoverView` branch. Its `contentView` factory creates
the native content view against the supplied host; the content view appends one persistent panel and
updates its placement, optional resizable text, and 30-item long-content list in its own region.
Keep a non-owning reference only to forward content props while the branch is open; the swap owns
and disposes the `PopoverView`, its `PopoverFloatingView`, `autoUpdate` cleanup, document listeners,
resize listeners, portal root, and native content child. Rebuild the branch on close/reopen and
dispose the outgoing branch. Update the existing branch for non-structural controls.

### 2. Convert Menu

Rename `src/renderer/uikit/Menu/Menu.story.tsx` to `.story.ts`. Preserve `SMALL_ITEMS`,
`SUBMENU_ITEMS`, `FRUITS`, `LARGE_ITEMS`, and all alert handlers verbatim. Build the outer layout,
variant text, and an owned `ButtonView` in `onMount()`. Use an owned `SubtreeSwap` to create and
mount a `MenuView` only while open; close and demo disposal clear the swap and restore focus.

Keep the wrapper stateless in the sense of the original `MenuDemo`: the click handler opens an
owned conditional `MenuView`, and close/disposal clears it and restores the previously focused
element. Prop updates update the active menu’s items, placement, and offset; no React render-prop
or JSX child is recreated.

### 3. Convert Dialog

Rename `src/renderer/uikit/Dialog/Dialog.story.tsx` to `.story.ts`. Define local public-constructor
demo/branch/body views. The demo fields are `open`, `first`, and `second`, matching the actual
source hooks; the Escape, backdrop, Cancel, Save, and input handlers update those fields and push
props to the existing native children.

Build the 520px outer panel, trigger row, bordered background panel, background input, and dialog
branch in `onMount()`. The branch owns `DialogView`, `DialogContentView`, a native body view with
both form inputs and action buttons, and the optional header `IconButtonView`. Claim children in
dialog-to-content-to-body order for correct disposal, mount body/content before the dialog slot is
mounted, and use a swap/release path for close and for structural `showIcon`/`showHeaderButtons`
changes. Width/height/min/max, position, and autofocus changes update the live branch.

Widen `DialogContentProps.headerButtons` to `React.ReactNode | Node` so the native header button is
passed as a DOM node without a caller cast, following the UIKit public-prop rule.

### 4. Convert Progress

Rename `src/renderer/uikit/Progress/Progress.story.tsx` to `.story.ts`. Define
`ProgressDemoView` with plain log, timer, lock, pending-wait, and notification-id fields. Mount a
`ProgressOverlayView` child alongside the control/log panel so the story directly exercises the
native overlay projection while retaining the original global progress API calls.

Track every story-created timeout and delayed wait. On disposal clear direct timers, resolve/cancel
pending waits so `showProgress`/`createProgress` settle and remove their model items, remove tracked
locks, and remove the exact notification entries created by this demo. Dispose the overlay child
with the demo, and ignore completion callbacks after disposal. Render the newest-first five-entry
log with the same text and controls as the React wrapper.

### 5. Convert Tooltip

Rename `src/renderer/uikit/Tooltip/Tooltip.story.tsx` to `.story.ts`. Build the outer text/panel
layout and an owned `ButtonView({ children: "Hover me" })` in `onMount()`. Call
`attachTooltip(button.root, options)` only after the anchor exists and is mounted; retain the
attachment in a field, call `update()` when story props change, and register `dispose()` with
`this.own(...)`. The attachment’s disposal releases show/hide timers, floating portal DOM,
`autoUpdate`, document/global registry subscriptions, and trigger listeners without detaching the
button. Rich content is a native panel/text subtree passed as a `Node`; plain mode passes the exact
string `Hello from Tooltip`.

### 6. Touch the story registry

Touch `src/renderer/editors/storybook/storyRegistry.ts` after the five renames so its extensionless
imports resolve the new `.story.ts` modules and Vite drops stale `.tsx` specifier state. Preserve
import order, registry order, and all unrelated entries.

### 7. Verify source and behavior

- Compare `id`, `name`, `section`, every PropDef field/value, and every `defaultProps` value with the
  five original files.
- Check that each wrapper’s fields, sample arrays, static text, layout attributes, live derivations,
  and handlers have a caller and are not dead definitions.
- Manually exercise: Popover “Open popover” and close/outside click (plus ignore sibling, long
  content, match width, resize); Menu “Open menu” for all variants and submenu/search paths;
  Dialog “Open dialog”, typing, Tab/Escape/backdrop, optional header controls, Cancel/Save;
  Progress Notify/Slow resolve/Slow reject/Update label/Timed lock/Precedence overlap; Tooltip
  hover/focus with both content modes and disabled/delay/placement changes.
- Confirm every created overlay, child view, attachment, portal, positioner, listener, timer, lock,
  and pending operation has an explicit disposal path.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`. Do not add tests or a harness.

## Concerns

1. **Progress target — resolved.** There is no `Progress.tsx`; the story’s `component` is the
   control/log wrapper, while `ProgressOverlayView` is the native view mounted by the application.
   The converted demo therefore keeps a `ProgressDemoView` wrapper and owns a
   `ProgressOverlayView` child. This preserves both the controls/API behavior and the visual overlay
   projection; pointing the story directly at `ProgressOverlayView` would silently delete all six
   controls, promise sequencing, locks, and completion logging.
2. **Tooltip target — resolved.** There is no `TooltipView`; `attachTooltip(element, options)` is
   the vanilla API. The demo owns a mounted `ButtonView` as the anchor, calls `attachTooltip` from
   `onMount()` after mounting the button, forwards option updates, and disposes the returned
   `TooltipAttachment` in its own disposal path.
3. **Floating lifecycle — resolved.** Popover, Menu, and Dialog use conditional native branches
   that are disposed on close; Tooltip’s attachment owns portal/positioning/listener cleanup;
   Progress clears demo timers/state and disposes its overlay view. No overlay is left mounted
   merely because its root is detached.
4. **DOM-valued header slot — resolved.** `DialogContentProps.headerButtons` is widened to
   `React.ReactNode | Node`, allowing the owned `IconButtonView.root` to enter `fillSlot` without
   `as any` or a call-site cast.
5. **Progress helper timers — resolved within the story API.** The story cannot cancel the private
   timer inside `notifyProgress`, so it records the exact notification id synchronously and removes
   that state entry on disposal. Pending waits are cancellable by the demo, which causes
   `showProgress` and `createProgress`’s `finally` cleanup to run immediately; direct timers and
   locks are cleared explicitly.
6. **Known benign DOM differences.** The `display: contents` adapter relocation, Panel boolean
   attribute spelling, and removal of React slot/root markers remain expected per EPIC-069
   §E11-10. Progress additionally gains the deliberately owned native overlay child because the
   original wrapper drove the application-root overlay indirectly.

## Acceptance Criteria

- [x] All five story files are renamed from `.story.tsx` to `.story.ts` and use a typed vanilla
      `view` arm with the demo wrapper’s prop type.
- [x] Every original control, default, sample value, layout context, handler, and interaction path
      is preserved; each real component is delegated to a mounted native child view or attachment.
- [x] Popover/Dialog close their outgoing branches; Menu/Tooltip/Progress release all floating
      resources and story-created timers, locks, listeners, and portal roots.
- [x] Progress explicitly retains the control/log wrapper and mounts `ProgressOverlayView`; Tooltip
      explicitly uses an anchor element and disposes `attachTooltip`’s returned attachment.
- [x] `id`, `name`, `section`, every PropDef value, and every `defaultProps` value are unchanged.
- [x] `storyRegistry.ts` is touched for the renamed import graph; no Storybook infrastructure,
      unrelated story, dashboard, or epic document is changed.
- [x] The only UIKit public-prop widening is `DialogContentProps.headerButtons: React.ReactNode | Node`.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.
- [x] No unit tests, harness, commit, Panel/Text change, or React-face deletion is introduced.

## Verification Results

Source-level review confirmed that Popover’s anchor button and conditional swap own the popover
branch/content view; Menu’s trigger owns a conditional `MenuView` and focus restoration; Dialog’s
branch owns the dialog/content/body/header-button chain and rebuilds structural options; Progress
owns `ProgressOverlayView`, direct timers, cancellable waits, locks, and notification entries; and
Tooltip owns the anchor button plus the returned `TooltipAttachment`. The five metadata blocks retain
the original ids, names, sections, PropDefs, options, labels, bounds, steps, and defaults. The
interaction paths are recorded above for the requested manual sweep; no verification harness was
added. `npm run typecheck` passed, `npm run lint` passed, and `npm run build-prod` passed.

## Files Changed Summary

| File | Change |
|---|---|
| `doc/tasks/US-1124-floating-layer-stories/README.md` | Task plan, resolved Progress/Tooltip decisions, lifecycle account, acceptance criteria, and verification results. |
| `src/renderer/uikit/Popover/Popover.story.ts` | Local vanilla Popover demo with owned conditional floating content. |
| `src/renderer/uikit/Menu/Menu.story.ts` | Local vanilla Menu demo preserving static variants and owned `MenuView` lifecycle. |
| `src/renderer/uikit/Dialog/Dialog.story.ts` | Local vanilla Dialog demo with owned native form branch and four demo concerns represented by its state/handlers. |
| `src/renderer/uikit/Progress/Progress.story.ts` | Local vanilla controls/log wrapper with owned `ProgressOverlayView` and cleanup. |
| `src/renderer/uikit/Tooltip/Tooltip.story.ts` | Local vanilla anchor demo using `attachTooltip` and explicit disposal. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Touch for renamed story module resolution. |
| `src/renderer/uikit/Dialog/DialogContent.tsx` | Widen `headerButtons` to accept a native `Node` without a caller cast. |
| `src/renderer/uikit/Dialog/DialogContentView.tsx` | Carry the widened node-capable header slot through its private helper. |
| `src/renderer/uikit/*/*.story.tsx` for the five listed stories | Removed by rename. |
| `src/renderer/editors/storybook/storyTypes.ts`, `story-props.ts`, `LivePreview.tsx`, `Panel`, `Text`, `doc/active-work.md`, `doc/epics/EPIC-069.md` | No changes. |
