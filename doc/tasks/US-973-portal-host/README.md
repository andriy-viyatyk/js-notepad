# US-973: Route `document.body` portals through one host

## Status

**Status:** Implemented — reviewed as part of EPIC-051 close-out

**Priority:** Medium

**Epic:** [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
**Created:** 2026-08-18

## Goal

Route the three real global overlay portals through one shared overlay-layer element and remove
the two inert outer portals around grid option popovers. Keep the portal content, positioning,
dismissal, pointer interaction, and overlay suppression behavior unchanged while giving the later
React/vanilla migration one stable host.

## Background

EPIC-051 D6 distinguishes two kinds of portals:

- Five body-targeted portal expressions were identified, but only three produce a DOM root that
  needs retargeting: `Popover`, `Tooltip`, and `GraphTooltip`. `ColumnsOptions` and `CsvOptions`
  each put a single `<Popover>` inside an outer body portal; the outer portal is inert because
  `Popover` returns `null` or portals its own root.
- The remaining caller-owned portals target a DOM node deliberately owned by another component.
  They are already equivalent to an explicit `appendChild` target and remain unchanged:
  `PageManager`, `AppPageManager`, `CategoryView`, `NotebookBody`, and `SideBarPanelHeader`.

The existing `src/renderer/uikit/shared/overlayRegistry.ts` is adjacent infrastructure, but it
does not own a DOM element. It registers the actual floated roots so page-level tooltips can be
suppressed while a popover or menu is open. Moving those roots under a common host does not change
the registry contract: `register`, `unregister`, and `isSuppressed(trigger)` continue to operate
on the real overlay root and its `contains()` relationship.

### Measured inventory

The epic table says 12 `createPortal` call sites in 10 files. The current source scan finds 10
executable calls in 10 files and five explanatory comment matches across three files:
`PageManager.tsx:22`, `PageManager.tsx:30`, `AppPageManager.tsx:30`, `AppPageManager.tsx:50`,
and `secondary-view-registry.ts:12`. Five executable calls mention `document.body`, but two are
inert outer wrappers. The three real body portal roots and the two wrapper deletions are the
complete US-973 scope:

| File | Overlay | Current target | Required target |
|---|---|---|---|
| `src/renderer/uikit/Popover/Popover.tsx` | floating popovers and menus | `document.body` | shared overlay layer |
| `src/renderer/uikit/Tooltip/Tooltip.tsx` | delayed/focused tooltip | `document.body` | shared overlay layer |
| `src/renderer/editors/graph/GraphTooltip.tsx` | graph node details | `document.body` | shared overlay layer |
| `src/renderer/editors/grid/components/ColumnsOptions.tsx` | outer wrapper around columns Popover | `document.body` (inert) | delete outer portal; return Popover directly |
| `src/renderer/editors/grid/components/CsvOptions.tsx` | outer wrapper around CSV Popover | `document.body` (inert) | delete outer portal; return Popover directly |

The five caller-owned executable portal sites are `PageManager`, `AppPageManager`, `CategoryView`,
`NotebookBody`, and `SideBarPanelHeader`; they are explicitly out of scope. After this task there
will be eight executable portal calls: three using the shared host and five using caller-owned
targets. There is no direct body portal in the dialog or progress systems: those render inside the
normal React root.

## Implementation plan

### 1. Add a React-free shared host helper

- Create `src/renderer/uikit/shared/overlayLayer.ts`.
- Export an idempotent `getOverlayLayer()` that returns one
  `HTMLDivElement` under `document.body`, reuses an existing element by its stable id, and repairs
  the cached reference if the host was removed or the document was recreated.
- Mark the element with a stable id and `data-type="overlay-layer"` for DOM inspection and future
  vanilla consumers. The helper must not create a React root or require a React context.
- Each of the three real body portal components calls the idempotent helper when it needs a target;
  no bootstrap change is needed. The document root already exists before any overlay can mount.
- Do not append a new host per overlay instance and do not remove the shared host when an individual
  overlay closes. Its lifetime is the renderer window's lifetime.

### 2. Keep the host structurally transparent

- The helper must append an unstyled, default `position: static` element. Do not add host CSS or
  inline styles. In particular, the host must not carry `position: fixed`, `z-index`, `transform`,
  `filter`, `contain`, `will-change`, or `opacity < 1`.
- Keep the existing `position: fixed`, z-index, floating-ui styles, and pointer behavior on each
  overlay root. A static host with fixed-position children has no content height and introduces no
  full-screen click shield; the existing Popover root remains interactive without a new
  `pointer-events` rule.
- Use one host element even when multiple overlays are mounted at once. DOM order and equal-z-index
  paint order remain the same because the host is appended after `#root` and creates no stacking
  context.

### 3. Route the three real body portals

- In each of the three real portal files, replace only the portal target:

  | File | Before | After |
  |---|---|---|
  | `src/renderer/uikit/Popover/Popover.tsx` | `document.body` | `getOverlayLayer()` |
  | `src/renderer/uikit/Tooltip/Tooltip.tsx` | `document.body` | `getOverlayLayer()` |
  | `src/renderer/editors/graph/GraphTooltip.tsx` | `document.body` | `getOverlayLayer()` |

  ```tsx
  // before
  document.body
  // after
  getOverlayLayer()
  ```
- Preserve the current portal keys, root elements, refs, `data-type`/`data-name` attributes,
  floating-ui reference and floating refs, layout measurement, and all component state.
- Keep `Popover` as the owner of outside-click and Escape handling. `ColumnsOptions` and `CsvOptions`
  must continue to wrap their content in Popover and must not gain separate dismissal logic.
- Leave `overlayRegistry.ts` unchanged unless implementation reveals a concrete target assumption.
  Its DOM-root registration and `contains()` behavior should work unchanged when the root is nested
  below the shared host.

### 4. Delete the two inert grid-option wrappers

- In `src/renderer/editors/grid/components/ColumnsOptions.tsx`, remove the `react-dom` import and
  return the existing `<Popover>...</Popover>` directly:

  ```tsx
  // before
  return ReactDOM.createPortal(
      <Popover>...</Popover>,
      document.body,
  );

  // after
  return <Popover>...</Popover>;
  ```

- Apply the same change to `src/renderer/editors/grid/components/CsvOptions.tsx`. Do not move the
  Popover's own target here; it will use the shared host through `Popover.tsx`.
- Preserve every Popover prop, grid model callback, option control, local input state, and close
  path. This removes two no-op outer portal calls and leaves one real Popover portal for each view.

### 5. Verify the boundary and migration count

- Re-scan `src/renderer` for executable `createPortal` calls. Eight executable calls should remain:
  three targeting `getOverlayLayer()` and five targeting caller-owned refs/placeholders. The five
  known comments and unrelated `document.body.appendChild` uses are not portal matches.
- Confirm no second overlay host is created during hot reload, popover replacement, tooltip
  singleton handoff, or opening both grid option views in sequence.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`. Do not add unit tests; the project
  has no unit-test harness and this task is best verified through the existing smoke path.

## Concerns / Open questions

### The host must not change stacking order

The current roots carry different z-indexes: Popover 1000, Tooltip 1100, and GraphTooltip 10;
other application surfaces have their own stacking values. A host with `position: fixed` plus a
z-index, transform, or other stacking-context trigger would flatten those relationships and could
put a graph tooltip above a dialog or make a popover fall behind app chrome. In fact, `position:
fixed` is prohibited even without the other properties: it creates a stacking context and changes
the containing-block behavior for fixed descendants. The implementation must keep the host at the
browser-default static position with no styling, then verify the relative order visually,
especially graph tooltip versus dialog and tooltip versus popover.

### Pointer-events must pass through the host

Because the host is shared, it must not intercept clicks in empty overlay space. Its direct overlay
children need explicit pointer interaction while the host remains transparent. Verify popover
buttons, resizable handles, graph-tooltip links/buttons, and grid option controls, plus click-outside
dismissal on the underlying page.

### Floating-ui and measurement must see the same viewport

All three real roots use viewport-oriented positioning or measure their own portal root after mount
(`useFloating` or `GraphTooltip`'s `useLayoutEffect`). The static host must not introduce a
transform, `contain`, or other containing block that changes `position: fixed` or
`getBoundingClientRect()` results. Check edge placement, flip/shift, graph tooltip viewport
clamping, and popover resize after the move.

### Overlay registry behavior is indirect but load-bearing

Context-menu roots register with `overlayRegistry`; tooltips outside a registered root are
suppressed, while tooltips inside that root remain allowed. Since the registry stores the actual
root rather than the old body target, no registry change is expected, but verify both sides of the
`contains()` rule after moving the root under the host.

### Host creation and ownership

The helper is intentionally React-free so Epic B can target the same element from vanilla views.
The renderer bootstrap owns host creation and the host is persistent for the window lifetime; no
overlay component may remove it. If the application ever supports multiple renderer roots in one
document, the stable-id/reuse behavior must still guarantee one host rather than one per root.

There are no unresolved design decisions blocking implementation. The only implementation-sensitive
points are preserving stacking semantics, deleting the two inert wrappers, and keeping the five
caller-owned portals out of the migration.

## Acceptance criteria

- [ ] One stable, React-free overlay host is created under `document.body`; repeated helper calls
      reuse it and no overlay creates or removes its own host.
- [ ] `Popover`, `Tooltip`, and `GraphTooltip` portal to the shared host; the outer
      `ColumnsOptions` and `CsvOptions` portals are deleted, and no executable body-targeted
      `createPortal` remains in `src/renderer`.
- [ ] The five caller-owned portal sites remain unchanged and still target their supplied DOM nodes
      or stable page placeholders.
- [ ] The host is an unstyled static element: it has no `position` other than the browser default
      `static`, no z-index, transform, filter, contain, will-change, or opacity below 1.
- [ ] All three overlay families remain interactive and dismissible as before, including Popover
      menus and both grid option views; no host click shield or pointer-events override is added.
- [ ] Existing fixed positioning, floating-ui flip/shift, graph tooltip clamping, popover resize,
      and z-index ordering remain visually correct; the static host adds no stacking context.
- [ ] `overlayRegistry` still suppresses page tooltips outside registered overlay roots while
      allowing tooltips within an overlay subtree.
- [ ] The shared host is one stable DOM element in both light and dark themes and has no visual or
      theme-specific styling of its own.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- [ ] No unit-test harness, generic portal context, or second overlay abstraction is introduced.

## Files Changed Summary

| File | Change |
|---|---|
| `src/renderer/uikit/shared/overlayLayer.ts` | Create the React-free idempotent host helper |
| `src/renderer/uikit/Popover/Popover.tsx` | Route the real Popover portal to the shared host |
| `src/renderer/uikit/Tooltip/Tooltip.tsx` | Route the Tooltip portal to the shared host |
| `src/renderer/editors/graph/GraphTooltip.tsx` | Route the GraphTooltip portal to the shared host |
| `src/renderer/editors/grid/components/ColumnsOptions.tsx` | Delete the inert outer portal |
| `src/renderer/editors/grid/components/CsvOptions.tsx` | Delete the inert outer portal |
| `doc/active-work.md` | Link US-973 from the dashboard |
| `doc/epics/EPIC-051.md` | Link and summarize the narrowed task |

## Files Explicitly Not Changed

- `src/renderer.tsx` — no bootstrap pre-creation is needed; the helper is idempotent at each real
  portal site.
- `src/renderer/theme/GlobalStyles.tsx` — the host has no CSS or inline styling.
- `src/renderer/uikit/shared/overlayRegistry.ts` — it tracks actual overlay roots, not their parent.
- `src/renderer/components/page-manager/PageManager.tsx`
- `src/renderer/components/page-manager/AppPageManager.tsx`
- `src/renderer/components/tree-provider/CategoryView.tsx`
- `src/renderer/editors/notebook/NotebookBody.tsx`
- `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx`
  These five files own caller-supplied portal targets and remain unchanged.

## Related

- [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
- [US-968: Neutral slots - UIKit containers and floating layer](../US-968-neutral-slots-containers-floating/README.md)
- [US-972: React context -> explicit model references](../US-972-explicit-model-references/README.md)
- [De-React roadmap](../../de-react.md)
- [Overlay registry](../../../src/renderer/uikit/shared/overlayRegistry.ts)
