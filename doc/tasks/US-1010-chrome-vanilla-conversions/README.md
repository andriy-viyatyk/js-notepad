# US-1010: `Toolbar`, `Splitter`, `Breadcrumb`, and `CollapsiblePanelStack` — vanilla chrome

**Status:** Implemented

**Priority:** High

**Epic:** [EPIC-055 — De-React Epic C2: Floating layer and composites](../../epics/EPIC-055.md)

**Created:** 2026-08-21

## Goal

Move `Toolbar`, `Splitter`, `Breadcrumb`, and `CollapsiblePanelStack` behind the established
`mountVanilla` boundary without changing their public React-facing props or their production call
sites. The converted roots should be native DOM views with layered CSS; temporary React content
slots remain available where the existing API intentionally accepts React children or portal
content.

This is four independent conversions. None owns a `TComponentModel`, a floating layer, or a
portal. `Toolbar` and `Splitter` do have local interaction state today, so that state moves into
their view instances rather than into a new model.

## Background

### Measured surface

The production JSX surface, excluding stories, is:

| Component | Production call sites | Stories | Current implementation | Main conversion concern |
|---|---:|---:|---|---|
| `Toolbar` | 2 | 1 | React component composed from `Panel`; no Emotion of its own | authored CSS must reproduce the `Panel` props it currently supplies; roving tabindex must follow slot mutations |
| `Splitter` | 19 | 1 | Emotion root plus two refs and `isDragging` state | native pointer capture, drag origin, clamping, and `data-dragging` |
| `Breadcrumb` | 6 | 1 | Emotion root plus memoized string segments | preserve direct `<span>` children, clip-start reversal, and click path calculation |
| `CollapsiblePanelStack` | 1 | 1 | Emotion root, marker children, previous-panel refs/effect, React content/header slots | native panel reconciliation while `children`, `buttons`, and `headerRef` remain React-facing |

The production callers are:

- `Toolbar`: `editors/storybook/StorybookEditorView.tsx:33` and
  `editors/compare/CompareEditor.tsx:60`.
- `Splitter`: 19 instances across browser, git-tree, MCP inspector, Storybook, REST client,
  script, link-editor, and sidebar surfaces. The exact list is obtained with the pinned scan below;
  no caller changes are planned.
- `Breadcrumb`: `editors/category/CategoryEditor.tsx:185`, two notebook branches in
  `editors/notebook/index.tsx:24,35`, and three link-editor branches in
  `editors/link-editor/index.tsx:69,81,90`.
- `CollapsiblePanelStack`: `ui/secondary-views/SecondaryViews.tsx:83`; its story is the only
  other caller. The production stack currently receives `alwaysRenderContent`, `height`, a
  `headerRef` callback for every panel, and a React `LazySecondaryView` as each panel's content.

All four have Storybook entries already. The stories must remain declarative callers of the same
public components; they are not replaced by special native demos in this task.

### Existing DOM and behavior contracts

`Toolbar` currently delegates its root to `Panel` with these values:

```tsx
<Panel
    direction={orientation === "horizontal" ? "row" : "column"}
    align={orientation === "horizontal" ? "center" : "stretch"}
    gap="sm"
    paddingX={orientation === "horizontal" ? "sm" : "xs"}
    paddingY={orientation === "horizontal" ? "xs" : "sm"}
    overflow="hidden"
    shrink={false}
    background={background}
    borderTop={borderTop}
    borderBottom={borderBottom}
    ...
/>
```

The native face must therefore emit the existing `data-type="toolbar"`,
`data-roving-host`, `data-orientation`, `data-direction`, `data-bg`, border, disabled, role, and
ARIA attributes and reproduce the Panel-derived flex layout. `Panel` has no vanilla face and is
not added as a new dependency just for this conversion. `Toolbar.css` is authored for this
component, as EPIC-055 C2-8 requires; it is not a mechanical extraction from Emotion.

`Splitter` keeps a real `div[data-type="splitter"]` root. Pointerdown prevents the browser default,
captures the pointer, and stores the coordinate and controlled `value` at drag start. Pointermove
uses the captured origin, `side`, `orientation`, `min`, and `max` to clamp the next value and calls
`onChange` continuously. Pointerup and pointercancel release capture and clear
`data-dragging`. Disabled splitters keep the current `data-disabled`, `pointer-events: none`, and
non-draggable behavior.

`Breadcrumb` emits one root and a flat sequence of direct spans:

```text
div[data-type="breadcrumb"][data-size][data-clip-start?]
  span[data-part="root"][data-current?]
  span[data-part="separator"]
  span[data-part="segment"][data-current?]
  ...
```

The root chip clears the value, intermediate segments select the prefix through that segment, and
the leaf is current and not clickable. `splitWithSeparators(value, separators)` remains the source
of segment boundaries; `separators[0]` remains the join separator. In `clipStart` mode the DOM
sequence is reversed so CSS `row-reverse` keeps the visual root-to-leaf order while overflow clips
the root side. The `&[data-clip-start] > span` selector makes direct spans a structural contract.

`CollapsiblePanel` remains a React marker component. It renders no DOM; the stack reads its
`id`, `name`, `title`, `icon`, `buttons`, `headerRef`, `alwaysRenderContent`, and `children`
descriptor from the incoming React elements. This preserves all existing JSX callers while the
stack owns the actual native panel roots.

The native stack must preserve this shape:

```text
div.collapsible-panel-stack-root[data-type="collapsible-panel-stack"]
  div[data-type="collapsible-panel"][data-state="open|closed"]
    div[data-part="header"]
      svg?                        // chevron, only when !headerRef && !buttons
      svg?                        // optional registry icon; no placeholder when absent
      #text                       // panel.title, a bare text node
      span[data-part="header-spacer"] // only when buttons exists
      span[data-part="header-buttons"] // only when buttons exists
    div[data-part="content"]
      span[data-part="react-slot"]? // internal fillSlot host; display: contents
        ...panel React content
```

The stack's header and panel rules currently rely on direct-child selectors for panel sizing and
the open header stripe, on `& > svg` for icon sizing, and on the established `data-part` names for
header/content behavior. The converted CSS must keep those relationships. The
`data-part="content"` and `data-part="header-buttons"` elements remain ordinary layout boxes;
only the internal `fillSlot` React container is `display: contents`. This keeps the button group as
one header flex item and preserves the content region's `flex: 1`, column layout, overflow, and
background. The header's chevron must be replaced in place when open state changes so it remains a
direct SVG child before the optional icon; an absent icon creates no placeholder element.

### Existing conversion infrastructure

The public `.tsx` files will become thin `mountVanilla` faces, following `PathInput` and the C2
conversions. Each new view uses `VanillaView` and the existing `applyRestProps`, `fillSlot`, and
`createIconElement` helpers where appropriate:

- `ToolbarView` uses a React slot for `children`, because toolbar callers supply arbitrary React
  controls. Its native root owns layout, roving behavior, and residual attributes/listeners.
- `SplitterView` and `BreadcrumbView` own their complete child DOM and need no nested React root.
- `CollapsiblePanelStackView` uses a keyed native panel collection. Each panel's content and
  `buttons` region is a `fillSlot` region, while the header itself remains native so
  `headerRef` can target the exact DOM node and the chevrons/icons remain direct children.

`fillSlot` reuses a React root for React-to-React updates and removes its layout-transparent host
before deferred unmount. The view must never write directly into a slot host after `fillSlot` owns
it. Native views still detach only what they own; `VanillaView.dispose()` leaves each root attached
for its adapter or structural helper to detach.

## Implementation plan

### 1. Establish the four native faces and keep public signatures unchanged

- Add `ToolbarView.tsx`, `SplitterView.ts`, `BreadcrumbView.ts`, and
  `CollapsiblePanelStackView.tsx` beside their existing public components. The two `.tsx` views
  inspect React elements or render a React fragment into a bridge; the pure DOM views remain `.ts`.
- Change each public component to return `mountVanilla(ComponentView, props)` while retaining the
  current exported component and prop types, barrel exports, story IDs, and call-site imports.
- Keep `CollapsiblePanel` as the marker component and keep its exported props type. The native
  stack may use React element inspection to read marker descriptors, but it must not render a
  second marker subtree or change the public `children` contract.
- Give each native root a private class omitted from its public props (`toolbar-root`,
  `splitter-root`, `breadcrumb-root`, and `collapsible-panel-stack-root`) so residual `data-*`
  props cannot disable the component's stylesheet. Continue emitting the existing `data-type`,
  applicable `data-name`, state, and addressing attributes for automation and inspection. `Toolbar`
  has no `name` prop and therefore does not promise a `data-name` marker; a residual `data-name`
  remains an ordinary caller attribute.
- Destructure every component-owned prop before `applyRestProps`. `applyRestProps` handles
  attributes and `on*` listeners only; it must not receive layout values, callbacks that drive
  native behavior, React marker descriptors, or React children.
- Preserve each existing rest-prop ordering contract. In particular, current JSX places residual
  props after component-owned attributes on these roots, so a caller's residual attribute can
  override a data marker; the private class is the stable CSS hook, not a reason to silently change
  that public precedence.

### 2. Convert `Toolbar` with authored CSS and a slot-aware roving tabindex implementation

- Add `src/renderer/uikit/Toolbar/Toolbar.css` under `@layer uikit`. Reproduce the exact Panel
  subset currently supplied by `Toolbar`: flex display/box sizing, horizontal versus vertical
  direction, alignment, token-based gap and padding, hidden overflow, no-shrink behavior,
  background variants, top/bottom borders, disabled opacity/pointer behavior, and the toolbar's
  existing data attributes. Use `--space-*`, `--gap-*`, and `--color-*` variables rather than
  importing `Panel` or hardcoded theme values.
- Import `Toolbar.css` directly from the native view/public face so a direct vanilla mount does
  not depend on `Panel.tsx`'s stylesheet import. Do not add `Panel` as a native abstraction.
- Move `activeIdx`, `collectStops`, arrow/Home/End navigation, nested `[data-roving-host]`
  delegation, and focus tracking into `ToolbarView`. Use native `KeyboardEvent` and `FocusEvent`
  handlers and preserve the current `preventDefault()` and wrapping behavior.
- Observe `root` child-list mutations with `{ childList: true, subtree: true }` and schedule one
  guarded synchronization pass after React commits. Do not observe attributes: the view writes
  `tabIndex`, and excluding attributes prevents a mutation loop. Also collect stops at keydown,
  focusin, and toolbar prop updates. This replaces the current no-deps `useLayoutEffect`, which
  re-runs on every React render; a one-time native binding alone would leave tab stops stale when a
  toolbar child is added or removed.
- Attach the root's native `keydown` and capture-phase `focusin` listeners through the view's
  lifecycle. `Toolbar` destructures `onKeyDown` and `onFocusCapture`, so they never enter
  `...rest`: the native listener must always run roving logic first and then invoke the matching
  caller callback once. Keep those two props out of `applyRestProps` and preserve the nested-widget
  escape rule.
- Mount the React children directly into `this.root` with `mountReactHandle`, not with `fillSlot`.
  `collectStops` intentionally iterates `root.children`; a `fillSlot` host would become the one
  direct child and collapse the entire toolbar to one tab stop even though `display: contents`
  preserves its visual layout. React owns the root child list, and the view owns only root behavior.

### 3. Convert `Splitter` as a native pointer-capture view

- Add `src/renderer/uikit/Splitter/Splitter.css` under `@layer uikit`, preserving the current
  orientation, six-pixel thickness, cursor, background, hover/drag background, border placement,
  disabled, and box-sizing rules. Scope all selectors from `.splitter-root` and retain the
  `data-name`, `data-side`, `data-orientation`, `data-border`, `data-bg`, `data-bg-hover`,
  `data-disabled`, and `data-dragging` vocabulary.
- Store `startCoord`, `startValue`, and drag state as private view fields. On native pointerdown,
  call `preventDefault`, set pointer capture, and snapshot the current `value`. On pointermove,
  ignore events without capture, compute `delta` with the existing orientation/sign rule, clamp
  to the current `min`/`max`, and call `onChange`. On pointerup/cancel release capture and clear
  the dragging marker.
- Update all ARIA values and residual attributes on every prop update. A `value` update during a
  drag changes the next reported result only; the drag origin remains the pointerdown snapshot,
  matching the current refs.
- Register listeners and any capture cleanup with `own()`/`listen()` so disposal releases a
  captured pointer and no callback reaches a disposed view. The native drag listeners are
  authoritative and remain installed even when residual `onPointerDown`, `onPointerMove`,
  `onPointerUp`, or `onPointerCancel` props are present; `applyRestProps` adds those caller
  listeners rather than replacing the drag behavior. This is an intentional semantic hardening:
  all 19 production callers were checked and none supplies a pointer handler.

### 4. Convert `Breadcrumb` with an owned span region

- Add `src/renderer/uikit/Breadcrumb/Breadcrumb.css` under `@layer uikit`, preserving size,
  separator, current-state, hover, color, clip-start, `row-reverse`, overflow, and direct-child
  `> span` rules. Keep `data-part="root"`, `separator`, and `segment` unchanged.
- Build the direct span sequence from the same `splitWithSeparators` helper and defaults as the
  React face. Use `replaceChildren` only for the root's own fully-owned span region; no React slot
  or structural helper owns those nodes, and the spans are not focusable. Rebuild on `value`,
  `separators`, `separatorContent`, `trailingParentSeparator`, `rootLabel`, or `clipStart` changes.
- Attach native click handlers to the root and each clickable span, calling `onChange("")` for the
  root and the same prefix/join-separator calculation for intermediate segments. Never attach a
  handler to the current leaf. Keep residual root event listeners separate through
  `applyRestProps`.
- Preserve `data-current` presence semantics, `data-size`, `data-clip-start`, `data-name`, and
  the existing ability for residual attributes to coexist with the component-owned root.

### 5. Convert `CollapsiblePanelStack` with keyed native panel records and React slot regions

- Add `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css` under `@layer uikit`.
  Translate the current Emotion block without flattening selector relationships:
  `root > panel`, `root > panel[data-state] > header`, header direct-child SVG sizing,
  header/content `data-part` selectors, the `:has([data-type="sidebar-show-main"]:hover)` hover
  guard, and the pointer-events allowlist for portalled labels and controls.
- Reproduce the current stack root sizing with number-to-pixel conversion and clear each sizing
  property when its prop becomes `undefined`. Do not reintroduce the old
  `style={isOpen ? undefined : { display: "none" }}` trap: explicitly set `display` on an
  always-rendered content region and remove it when the panel becomes open.
- Parse the incoming `CollapsiblePanel` marker elements into panel descriptors and reconcile them
  by `id` with `KeyedList`. Validate duplicate IDs before mutating the DOM; remove records and
  release their slots/ref callbacks, create missing detached panel roots, reconcile order with
  minimal moves, then update every retained/new record. A panel record owns its header, content
  host, button host, icon, fill-slot cleanups, and `headerRef` lifecycle.
- Keep panel roots direct children of the stack root. Keep header and content direct children of
  each panel root. Use `fillSlot` only inside the real `data-part="content"` and
  `data-part="header-buttons"` hosts. Those two hosts remain ordinary boxes: the content host
  carries the stack's flex/overflow/background rules, and the header-buttons host remains one flex
  item and keeps its click handler that stops propagation. Only each host's internal React
  container is `display: contents`.
- Render the chevron and optional `IconName` with `createIconElement` as bare direct SVG children.
  The chevron is omitted when `headerRef` or `buttons` is present, exactly as today, and is
  replaced in place between `chevron-down` and `chevron-right` when open state changes. Keep the
  order chevron → optional panel icon → bare title text. Do not use `renderIcon` or a React icon
  node in the native header; an undefined icon produces no element.
- Invoke each panel's `headerRef` with the stable native header after it is attached, invoke the
  previous callback with `null` before replacing/removing it, and clear all refs during disposal.
  This is required by `SideBarPanelHeader`, which portals its title, icon, badge, actions, and
  show-main zone into this exact element.
- Keep the previous-panel history as view fields. When an external `activePanel` prop changes,
  record the old active ID before applying the new state. Clicking the active header returns to
  the previous still-present panel, otherwise falls back to the first different panel; clicking a
  different header calls `setActivePanel(id)`.
- For `alwaysRenderContent`, keep the content slot mounted and toggle `display: none`; otherwise
  create/remove the content region with the open branch. Preserve the production secondary-view
  behavior: `alwaysRenderContent` keeps `LazySecondaryView` mounted so its header portal remains
  alive while collapsed.

### 6. Update registration/docs only where the new owners require it

- Keep all four existing story files and public barrel exports. No production caller, story prop,
  or `CollapsiblePanel` marker syntax changes are planned.
- Register no new Storybook story; all four already exist and will exercise the converted faces.
- Add the four view files and four component stylesheets to the task diff. Update
  `doc/active-work.md` with a linked US-1010 entry and change the EPIC-055 linked-task row from
  `Planned` to `Implemented` only when implementation begins/completes, following the epic task
  workflow.
- Update `doc/architecture/key-files.md` only if the conversion introduces a new subsystem owner;
  ordinary component-local `*View.ts`/`*View.tsx` and `*.css` files follow existing UIKit
  conventions and do not need standalone index rows.

## Concerns / Open questions

1. **Toolbar children are still React, so roving synchronization needs a deterministic commit
   boundary.** `useRovingTabIndex` currently relies on a no-deps layout effect, which happens after
   every render. The native view mounts children directly into its root with `mountReactHandle`, so
   `root.children` still contains the actual toolbar controls rather than a `fillSlot` wrapper. The
   plan chooses a `MutationObserver` plus focus/key collection rather than a timing delay. The
   observer watches child-list mutations, including subtree mutations, but not attributes because
   the view's `tabIndex` writes must not trigger it. Verify initial and subsequent `Spacer`,
   `SegmentedControl`, nested `Toolbar`, and button changes without a mutation loop.

2. **The stack's React marker descriptors are an intentional compatibility seam.** A native view
   cannot receive a plain `CollapsiblePanel` object from React, so it must inspect React elements to
   obtain panel definitions. This keeps the existing public API and the one production caller, but
   means `CollapsiblePanelStackView.tsx` remains coupled to React's element descriptor shape until
   Epic F removes the React-facing API. Do not invent a new public descriptor or force
   `SecondaryViews` to change in this task.

3. **`headerRef` callback lifecycle is load-bearing for secondary views.** The stack's header is
   also the target of `SideBarPanelHeader`'s portal. A callback that is invoked only on creation,
   or never receives `null` on removal, leaves stale portal content or stale `headerRefs.current`
   entries. Test panel reorder, active-panel changes, and a secondary view disappearing while its
   header portal is mounted.

4. **Direct-child selectors are the highest CSS migration risk in this task.** Before editing any
   component, scan its existing Emotion/CSS and all direct borrowed styles for `>`, `:empty`,
   `:nth-child`, `+`, and `~`. The relevant contracts are Breadcrumb's `> span`, the stack's
   `root > panel` and `panel > header`, and the stack's `header > svg`. The final DOM must keep
   these relationships; a `display: contents` bridge is allowed only inside a slot region and
   must not be inserted between a selector's required direct elements.

5. **Layer demotion must be checked against real app ancestors, not just stories.** The converted
   styles move from Emotion's unlayered rules to `@layer uikit`. Search editor-local CSS, shell CSS,
   and Emotion selectors for `data-type="toolbar"`, `splitter`, `breadcrumb`,
   `collapsible-panel`, their `data-part` descendants, and generic selectors that reach into
   toolbar children or sidebar headers. At minimum verify Storybook, Compare, Category, Notebook,
   Link Editor, browser, git-tree, MCP inspector, and the secondary-view sidebar in both themes.

6. **Toolbar's authored CSS must be compared with Panel output, not with an old stylesheet.** The
   old Toolbar has no Emotion definition of its own: its appearance comes from `Panel` inline
   layout plus `Panel.css`. Record the before/after computed values for direction, alignment, gap,
   padding, overflow, shrink, background, borders, and disabled state in the Toolbar story and in
   one real editor toolbar. This is especially important for the right-side `Spacer` and editor
   switch controls.

7. **`CollapsiblePanelStack` slot updates must not recreate stable panel roots unnecessarily.**
   Secondary views can re-render with fresh marker elements and fresh inline `headerRef` callbacks
   even when their IDs and content are unchanged. Key reconciliation must retain the panel/header
   roots and update only the affected `fillSlot` regions and attributes. Otherwise header portals,
   focus, and scroll position can be lost on unrelated parent renders.

8. **The stack's content and button slots can contain nested React roots.** `fillSlot` must remain
   the sole writer to each slot host, and disposal must release React containers before the panel
   root is detached. Verify that closing a panel, removing a panel, and disposing the whole stack do
   not produce nested-root warnings or leave portal content attached to a removed header.

9. **Residual attributes can override data markers, but CSS must remain addressable.** These public
    prop types omit `className`, while their inherited HTML attributes still permit arbitrary
    `data-*` values. Use private root classes for stylesheet ownership and preserve the existing
    data attributes for the UI-element contract. Do not “fix” the public residual precedence by
    changing caller props in this task; API cleanup belongs to Epic F.

10. **Pointer/focus event ordering changes at a native root.** Splitter's and Toolbar's native
    listeners can run at a different point relative to handlers inside React slot roots than the
    old delegated React handlers. This is particularly relevant to `preventDefault`, propagation,
    and nested roving widgets. Verify the existing Storybook controls and the production toolbar
    callers; do not broaden the event facade or change unrelated React-compat behavior here.

11. **No new model is appropriate.** `Toolbar`'s active stop index and `Splitter`'s drag origin are
    ephemeral view interaction state, not business data; `Breadcrumb` is derived entirely from
    props; and the stack's previous-panel ID is local navigation history. Keep them as native view
    fields. Do not create a `TComponentModel` merely to satisfy the model/view vocabulary.

## Acceptance criteria

- [x] `Toolbar`, `Splitter`, `Breadcrumb`, and `CollapsiblePanelStack` retain their exported names,
      prop types, story IDs, and all existing production call sites; each public face is a thin
      `mountVanilla` adapter.
- [x] The four native roots preserve their existing `data-type`, applicable `data-name`, ARIA,
      state, and `data-part` contracts (Toolbar has no declared `name` prop), while private class
      hooks prevent residual attributes from disabling component-owned CSS.
- [x] `Toolbar.css` is authored under `@layer uikit` and reproduces the current Panel-derived
      layout and theme behavior, including the right-edge spacer/editor-switch alignment in both
      orientations and themes.
- [x] Toolbar roving tabindex preserves nested `[data-roving-host]` behavior, arrow/Home/End
      navigation, focus tracking, disabled handling, and updates after direct React-root children
      are added, removed, or replaced without an attribute-observer mutation loop; roving runs
      before `onKeyDown`/`onFocusCapture` callbacks exactly once.
- [x] Splitter preserves pointer capture, drag origin, orientation/sign math, min/max clamping,
      continuous `onChange`, pointerup/cancel cleanup, disabled behavior, ARIA values including
      conditional removal of `aria-valuemin`/`aria-valuemax`, and `data-name`/`data-side`/
      `data-dragging` styling. Native drag listeners remain authoritative while residual pointer
      callbacks, if supplied, are additive; no production caller currently supplies them.
- [x] Breadcrumb preserves the exact segment split/join behavior, root/intermediate/leaf click
      semantics, `data-current` presence, clip-start DOM reversal, direct span structure, and
      residual attributes/listeners.
- [x] CollapsiblePanelStack reconciles panel IDs without unnecessary root replacement, validates
      duplicate IDs before DOM mutation, preserves previous-panel fallback behavior, and keeps
      panel roots/header/content direct-child relationships required by the CSS.
- [x] `headerRef` receives the stable native header and receives `null` when a panel is removed or
      disposed; the secondary-view title/action portal, show-main zone, chevron/icon sizing, and
      pointer-events click-through rules still work.
- [x] `buttons` and `children` React slots use `fillSlot` only in their owned regions; the
      `data-part="content"` and `data-part="header-buttons"` hosts remain real layout boxes while
      only internal React containers are layout-transparent; no phantom flex item or nested-root
      warning occurs, and always-rendered closed panel content is explicitly hidden and restored.
- [x] All four stylesheets are layered, token-based, directly imported by the owning native path,
      and preserve the current cascade ordering/specificity. No converted subtree relies on an
      accidental Emotion import or on a generic unscoped selector.
- [x] Storybook verification and real-app smoke checks cover Toolbar, Splitter, Breadcrumb, and
      the secondary-view stack in light and dark themes, including toolbar right alignment,
      splitter drag, breadcrumb navigation/clip-start, panel switching/history, portal header
      content, panel removal, and disposal.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; the final diff contains no
      production caller rewrites or unrelated component conversions.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Toolbar/Toolbar.tsx` | Thin public `mountVanilla` face; preserve `ToolbarProps` and exports |
| `src/renderer/uikit/Toolbar/ToolbarView.tsx` | Native root, Panel-derived attributes, direct React children root, roving tabindex, and residual props |
| `src/renderer/uikit/Toolbar/Toolbar.css` | Authored layered toolbar layout/theme CSS |
| `src/renderer/uikit/Splitter/Splitter.tsx` | Thin public `mountVanilla` face |
| `src/renderer/uikit/Splitter/SplitterView.ts` | Native pointer-capture drag view and prop projection |
| `src/renderer/uikit/Splitter/Splitter.css` | Layered splitter orientation, drag, border, and theme CSS |
| `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx` | Thin public `mountVanilla` face |
| `src/renderer/uikit/Breadcrumb/BreadcrumbView.ts` | Native direct-span breadcrumb and click projection |
| `src/renderer/uikit/Breadcrumb/Breadcrumb.css` | Layered breadcrumb/clip-start CSS |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx` | Thin public face plus unchanged `CollapsiblePanel` marker |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.tsx` | Native keyed panel records, React slots, header refs, history, and state projection |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css` | Layered stack/panel/header/content CSS |
| `doc/active-work.md` | Link US-1010 under EPIC-055 |
| `doc/epics/EPIC-055.md` | Link the US-1010 task document and update status when implementation begins/completes |

No changes are planned for the four existing story files, production callers, `Panel.tsx`,
`Panel.css`, the model layer, `src/renderer/uikit/index.ts` exports, or package dependencies.

## Verification commands

```powershell
# Surface reconciliation
rg -n '<Toolbar|<Splitter|<Breadcrumb|<CollapsiblePanelStack' src/renderer --glob '*.tsx' --glob '!**/*.story.tsx'

# Structural-selector audit before and after conversion (narrowed to selector forms)
rg -n -e "'&" -e '>\s*\[data-' -e '>\s*span' -e ':empty' -e ':nth-child' -e '\s[+~]\s' src/renderer/uikit/Toolbar src/renderer/uikit/Splitter src/renderer/uikit/Breadcrumb src/renderer/uikit/CollapsiblePanelStack --glob '*.tsx' --glob '*.css'

npm run typecheck
npm run lint
git diff --check
```

The final visual pass must compare the old React-rendered baseline captured before implementation
with the native result in the same Storybook stories and real callers. A story-only pass is not
enough for the stack portal, editor-toolbar right alignment, or the 19 splitter placements.

## Related work

- [EPIC-055 — De-React Epic C2](../../epics/EPIC-055.md)
- [US-983 — Emotion-to-CSS conventions](../US-983-emotion-to-css-conventions/README.md)
- [US-992 — vanilla view authoring](../US-992-vanilla-view-authoring/README.md)
- [US-987 — structural helpers](../US-987-structural-helpers/README.md)
- [US-999 — Button cluster](../US-999-button-cluster/README.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [UI element contract](../../architecture/ui-element-contract.md)
