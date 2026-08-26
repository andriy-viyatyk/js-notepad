# US-1099 — Native editor toolbar and dead AsyncEditor removal

## Goal

Convert the bottom editor-chrome leaf, `EditorToolbar`, to a native
`EditorToolbarView` while preserving its React face and public props, and delete
the unreferenced React twin `ui/app/AsyncEditor.tsx`. The six current
`EditorToolbar` consumers remain React in this task; no parent is converted
alongside the leaf.

This is the first implementation task of [EPIC-067](../../epics/EPIC-067.md),
and follows the epic's leaf-first ordering while making the React-root cost of
the compatibility boundary explicit.

## Background

### Current `EditorToolbar` contract and callers

`src/renderer/editors/base/EditorToolbar.tsx` is 36 lines and imports only
React and the React `Panel` face. Its `EditorToolbarProps` contract is:

```ts
export interface EditorToolbarProps {
    name?: string;
    borderTop?: boolean;
    borderBottom?: boolean;
    children?: React.ReactNode;
}
```

Today it renders one `Panel` with the following fixed layout props and defaults
the name to `"editor-toolbar"`:

```tsx
<Panel
    name={name ?? "editor-toolbar"}
    direction="row"
    align="center"
    gap="sm"
    overflow="hidden"
    background="dark"
    paddingX="sm"
    paddingY="xs"
    shrink={false}
    borderTop={borderTop}
    borderBottom={borderBottom}
    hideWhenEmpty
>
    {children}
</Panel>
```

The complete direct JSX caller set, verified with a renderer-wide search, is:

| Caller | Current use | `EditorToolbar` output name |
|---|---|---|
| `src/renderer/editors/base/PageToolbar.tsx:34-40` | Shared page toolbar; its children include the navigation button, optional contributions, `Spacer`, and `SwitchWidget` | Caller-provided `name` or the default `editor-toolbar` |
| `src/renderer/editors/base/ContentHostFooter.tsx:24-31` | Shared text-host footer | `text-chrome-footer` |
| `src/renderer/editors/text/ScriptPanel.tsx:388-438` | Script controls toolbar, only while the script panel is open | Default `editor-toolbar` |
| `src/renderer/editors/browser/BrowserView.tsx:420-528` | Browser navigation/address toolbar | Default `editor-toolbar` |
| `src/renderer/editors/mcp-inspector/McpInspectorView.tsx:107-193` | MCP connection toolbar | Default `editor-toolbar` |
| `src/renderer/editors/mneme-config/MnemeConfigView.tsx:60-102` | Mneme status toolbar | Default `editor-toolbar` |

No direct caller was missed. `src/renderer/editors/base/index.ts:28-29` is
only the face and prop-type barrel export, not a render site. `PageToolbar` and
`ContentHostFooter` also have callers elsewhere, but those are indirect users
of this same six-file direct-consumer set and do not require edits here.

All six callers remain React. The new face must therefore keep the exact
`EditorToolbarProps` shape, including `children?: React.ReactNode`, and return
`mountVanilla(EditorToolbarView, props)`. This leaves one implementation while
Rule 2 keeps every caller compiling untouched.

The required face transformation is:

```tsx
// Before: src/renderer/editors/base/EditorToolbar.tsx
export function EditorToolbar({
    name,
    borderTop,
    borderBottom,
    children,
}: EditorToolbarProps) {
    return <Panel /* fixed layout props */>{children}</Panel>;
}
```

```tsx
// After: src/renderer/editors/base/EditorToolbar.tsx
import { mountVanilla } from "../../uikit/shared/mount";
import { EditorToolbarView } from "./EditorToolbarView";

export function EditorToolbar(props: EditorToolbarProps): React.ReactElement {
    return mountVanilla(EditorToolbarView, props);
}
```

`EditorToolbarView` is the only place that constructs the panel and owns its
slot. The interface remains on the face so existing imports and all six JSX
callers retain their current type contract.

The native view's slot-facing type is intentionally wider than the React
face's type:

```ts
// src/renderer/editors/base/EditorToolbarView.ts
import type { SlotContent } from "../../uikit/shared/fill-slot";

export interface EditorToolbarViewProps {
    name?: string;
    borderTop?: boolean;
    borderBottom?: boolean;
    children?: SlotContent;
}
```

`EditorToolbarProps` remains React-facing and unchanged. `SlotContent` is the
neutral seam type already exported by `fill-slot.ts`, so later native callers
can supply DOM nodes without widening a React contract or typing the native
view with `React.ReactNode`.

### Native Panel equivalence

`src/renderer/uikit/Panel/panel-style.ts` defines `createPanelElement` and the
related `resolvePanelAttributes` / `applyPanelAttributes` helpers. The helper
supports every prop currently passed by `EditorToolbar`:

| Existing `Panel` prop | Native helper support | Verified behavior |
|---|---|---|
| `direction="row"` | `PanelStyleProps.direction` | `resolvePanelAttributes` and `applyPanelAttributes` set the panel direction and `Panel.css` applies flex direction |
| `align="center"` | `PanelStyleProps.align` | Resolves to `align-items: center` |
| `gap="sm"` | `PanelStyleProps.gap` | Resolves through the shared gap tokens |
| `overflow="hidden"` | `PanelStyleProps.overflow` | Writes the overflow style |
| `background="dark"` | `PanelStyleProps.background` | Writes `data-bg="dark"`; `Panel.css` supplies the theme background |
| `paddingX="sm"` | `PanelStyleProps.paddingX` | Resolves the left and right spacing |
| `paddingY="xs"` | `PanelStyleProps.paddingY` | Resolves the top and bottom spacing |
| `shrink={false}` | `PanelStyleProps.shrink` | Resolves `flex-shrink: 0` |
| `borderTop` / `borderBottom` | `PanelStyleProps.borderTop` / `.borderBottom` | Writes the corresponding state attributes and CSS borders |
| `hideWhenEmpty` | `PanelStyleProps.hideWhenEmpty` | Writes `data-hide-when-empty`; the existing `:empty` rule plus the planned slot-aware rule in `Panel.css` hide an empty panel |
| `name` | `PanelStyleProps.name` | Writes `data-name` on the `data-type="panel"` root |

There is no missing native equivalent. The native view must use the existing
helper and import its existing stylesheet transitively through `panel-style.ts`;
the only CSS change is the library-owned slot-aware enhancement documented
below, not a view-local shim or markup compensation.

The `data-name` contract is preserved exactly. The current default is
`data-name="editor-toolbar"`; the verified override is
`data-name="text-chrome-footer"` in `ContentHostFooter`. The view must update
the same root attribute when props change. `data-name` is the addressing handle
described by [the UI element contract](../../architecture/ui-element-contract.md),
not a styling hook.

### `fillSlot` and the React-root consequence

`src/renderer/uikit/shared/fill-slot.ts` has two arms:

1. `isReactEmpty(slot)` treats only `null`/`undefined` and `false` as empty.
2. `needsReactRoot(slot)` then takes the non-React arm for strings and DOM
   `Node` values. That arm clears the host and writes the string or node, or
   leaves it empty for `null`/`false`; it creates no React root.
3. Every other non-empty value, including a React element, fragment/array, or
   `true`, takes the React arm. The arm creates a `span[data-part="react-slot"]`
   with `display: contents`, wraps the value in a React Fragment, and calls
   `mountReactHandle`. `mountReactHandle` calls `createRoot`, marks the host
   `data-react-root`, and reuses that root for later React-to-React updates.

The React face must pass `props.children` to `fillSlot`; `mountVanilla` itself
does not create another root. The six verified consumers pass JSX/React-shaped
children, not strings or DOM nodes, so the predicted delta is one nested root
for each mounted `EditorToolbar` instance:

| Direct consumer | Predicted root delta from this conversion |
|---|---:|
| `PageToolbar` | +1 per mounted `PageToolbar` |
| `ContentHostFooter` | +1 per mounted footer |
| `ScriptPanel` | +1 while the open script panel is mounted |
| `BrowserView` | +1 per mounted browser toolbar |
| `McpInspectorView` | +1 per mounted MCP toolbar |
| `MnemeConfigView` | +1 per mounted Mneme toolbar |

This is a relocation boundary, not six roots per child: all React-shaped
children of one toolbar share the one `mountReactHandle` root. React-to-React
updates reuse it; a transition to a string, DOM node, or empty value disposes
it.

For the measured EPIC-067 text-host baseline, a normally rendered `TextChrome`
has one outer editor root plus the existing footer child slot root (2 total).
After this task, its `PageToolbar` and `ContentHostFooter` each add one toolbar
slot root, while the existing footer button slot root remains present under
that subtree: the predicted count is 4 while `ScriptPanel` is closed, and 5
when the open script panel is mounted. Direct `EditorToolbar` users with a
single outer editor root (`BrowserView`, `McpInspectorView`, and
`MnemeConfigView`) are predicted to move from 1 to 2. These are predictions
for this intermediate task. This is the epic's intermediate peak, not a
regression caused by this task's ordering: Rule 1 keeps the parents React, so
the same peak occurs whichever end of the chrome chain is converted first, and
it drains only as the 14 callers convert in US-1104 through US-1107. Later
native parent/child conversions must be measured separately and must not be
netted into this task's result.

### `hideWhenEmpty` is not automatic through a React slot

`Panel.css` implements the prop as:

```css
.panel-root[data-hide-when-empty]:empty { display: none; }
```

That behavior works for the current JSX `Panel` because React inserts only the
actual rendered children. It does **not** automatically survive an
unconditional compatibility slot: the React arm of `fillSlot` inserts the
`data-part="react-slot"` container before React commits its content. A React
fragment, `true`, or a component that renders `null` can therefore leave a
non-empty panel host even though the toolbar has no visible content. This is a
visible empty-toolbar-row regression, not merely a root-count detail.

The fix belongs in `Panel.css`, because `hideWhenEmpty` is the Panel feature
and CSS re-evaluates after React commits without an observer or timing
assumption. Add this rule beside the existing rule at `Panel.css:67`:

```css
.panel-root[data-hide-when-empty]:empty,
.panel-root[data-hide-when-empty]:has(> [data-part="react-slot"]:empty):not(:has(> :not([data-part="react-slot"]))) { display: none; }
```

The direct-child guard means that a panel is considered empty through the
compatibility arm only when its only child is an empty React-slot wrapper. The
existing `.panel-root[hidden]` rule at `Panel.css:86` is unrelated to this fix
and remains for other native views; `EditorToolbarView` must not synchronize
`root.hidden` or introduce a MutationObserver. The `fillSlot` host must remain owned
by `fillSlot`—do not run its previous cleanup before an update or write around
it with `replaceChildren`/`append`.

The four selector cases were checked against the actual `fillSlot` DOM shape
before adding the plan:

| Case | DOM state | Result |
|---|---|---|
| React slot renders `null` | `span[data-part="react-slot"]` is present and `:empty`; no other direct child | Hidden |
| React slot renders real content | The slot wrapper has a rendered child, so it is not `:empty` | Visible |
| React slot renders only text | The wrapper has a text child; CSS `:empty` counts text nodes | Visible |
| Empty slot plus a non-slot direct child | `:has(> :not([data-part="react-slot"]))` is true, so the guard excludes the selector | Visible |

`display: contents` changes layout participation, not the DOM child
relationship used by `:empty` or `:has()`, so it does not change these results.
Selector support is also confirmed for this build: `package.json` and the
installed Electron package pin CastLabs Electron `43.0.0+wvcus`, the installed
`electron-to-chromium` mapping resolves Electron `43.0` to Chromium `150`, and
the repository already ships `:has()` selectors in
`src/renderer/theme/GlobalStyles.tsx` and
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css`.

### Deleting `AsyncEditor.tsx`

`src/renderer/ui/app/AsyncEditor.tsx` is a 64-line React implementation of the
live native `src/renderer/ui/app/AsyncEditorView.ts`. The live path is
`RenderEditorView.ts` → `AsyncEditorView`; the React twin is not part of that
path. A repository search for `AsyncEditor` excluding the distinct
`AsyncEditorView` name found only the three declarations in the file itself
(`AsyncEditorProps`, `AsyncEditor`, and `AsyncEditorComponent`) plus the barrel
re-export at `src/renderer/ui/app/index.ts:4`. The scoped search covered
`src/`, `qa/`, `scripts/`, and `boards-assets`; `stories/` is absent in this
checkout. There is no real importer.

`AsyncEditorView.ts` must remain untouched. The barrel change removes only
`AsyncEditor`, `AsyncEditorProps`, and `AsyncEditorComponent`; its `MainPage`,
`Pages`, and `RenderEditor` exports stay.

The barrel transformation is likewise narrow:

```ts
// Before: src/renderer/ui/app/index.ts
export { AsyncEditor, AsyncEditorProps, AsyncEditorComponent } from './AsyncEditor';
```

```ts
// After: src/renderer/ui/app/index.ts
export { MainPage } from './MainPage';
export { Pages } from './Pages';
export { RenderEditor } from './RenderEditor';
```

The three existing non-dead exports remain exactly as they are; the deleted
file is not replaced by another React implementation.

## Implementation Plan

- [x] Add `src/renderer/editors/base/EditorToolbarView.ts` as a
  `VanillaView` whose constructor creates the panel with
  `createPanelElement`. Use the exact fixed layout props listed above and
  preserve the default and caller-supplied `name` values.
- [x] Give the view `EditorToolbarViewProps` with
  `children?: SlotContent`; keep the public React face's
  `EditorToolbarProps.children?: React.ReactNode` unchanged. Use `fillSlot`
  for the child content, update panel attributes in place on prop updates,
  reuse the slot root across React updates, and release the slot during
  disposal. Preserve the native view lifecycle/ownership rules: child DOM and
  bindings belong in `mount()` / `onMount()`, and cleanup must be owned by the
  view.
- [x] Extend `src/renderer/uikit/Panel/Panel.css` beside the existing
  `data-hide-when-empty:empty` rule with the exact slot-aware `:has()` selector
  above. Verify the four documented DOM cases and do not add a view-local
  visibility observer or `root.hidden` synchronization.
- [x] Reduce `src/renderer/editors/base/EditorToolbar.tsx` to the existing
  `EditorToolbarProps` interface and a thin `mountVanilla(EditorToolbarView,
  props)` face. Do not modify any of the six React caller files. Do not add a
  second toolbar implementation.
- [x] Delete `src/renderer/ui/app/AsyncEditor.tsx` and edit only
  `src/renderer/ui/app/index.ts` to remove its three named exports. Do not
  change `AsyncEditorView.ts` or the barrel's other exports.
- [ ] Run the project's type/lint gates after implementation, then manually
  inspect the toolbar DOM: `data-type="panel"`, preserved `data-name`, panel
  attributes/styles, empty-row hiding, and `data-react-root` counts. The
  measured intermediate root result must match the per-consumer predictions
  above; do not claim the later EPIC-067 reductions here.

## Concerns

1. **The intermediate root peak is expected and bounded.** Because Rule 1
   keeps every parent React component in place, this task adds one
   compatibility root per active toolbar instance. The existing footer's
   nested button slot is relocated, not removed. This is the epic-wide peak
   described above, not an ordering-specific regression. Acceptance evidence
   must distinguish `data-react-root` from the broader
   `data-part="react-slot"` marker as required by EPIC-067 Rule 4.
2. **`hideWhenEmpty` is resolved in the shared Panel stylesheet.** The native
   helper supports the prop, but its original selector requires a genuinely
   empty panel. The slot-aware `:has()` rule belongs beside that Panel rule and
   handles React commit timing declaratively; no view-local observer,
   `root.hidden` synchronization, or unrelated CSS workaround is acceptable.
3. **`fillSlot` owns its host.** The implementation must call it again for
   updates without pre-running the old cleanup and must not directly mutate the
   slot host behind its back. Cleanup must happen once during view disposal.
4. **No parent conversion belongs here.** `PageToolbar`, `ContentHostFooter`,
   `ScriptPanel`, `BrowserView`, `McpInspectorView`, and `MnemeConfigView` all
   remain React. This task does not address their state subscriptions, their
   own native conversions, or the later `TextChrome` contract deletion.
5. **The dead-file removal must stay narrow.** `AsyncEditorView.ts` is live and
   remains the sole async editor implementation in this path. Only the dead
   file and its three barrel names are in scope.

## Acceptance Criteria

- [ ] `src/renderer/editors/base/EditorToolbarView.ts` is the sole toolbar
  implementation and extends `VanillaView`.
- [ ] `EditorToolbar.tsx` retains the exact `EditorToolbarProps` shape,
  including `children?: React.ReactNode`, and is only a
  `mountVanilla(EditorToolbarView, props)` compatibility face.
- [ ] All six verified direct callers compile and remain unchanged; no
  additional direct `EditorToolbar` caller exists.
- [ ] The native root uses `createPanelElement` and preserves every current
  layout prop, `data-type="panel"`, the default `data-name="editor-toolbar"`,
  and overrides such as `data-name="text-chrome-footer"`.
- [ ] `src/renderer/uikit/Panel/Panel.css` contains the exact slot-aware
  `:has()` rule beside the existing `:empty` rule. Its verified behavior is:
  React `null` slot → hidden; real content → visible; text-only slot →
  visible; empty slot plus a non-slot child → visible. No view-local observer
  or `root.hidden` synchronization is added.
- [ ] Root measurements show the predicted +1 nested `data-react-root` for
  each active direct consumer instance, with React-to-React updates reusing
  that root.
- [ ] `AsyncEditor.tsx` is deleted; `ui/app/index.ts` no longer exports
  `AsyncEditor`, `AsyncEditorProps`, or `AsyncEditorComponent`, while its
  other exports are unchanged.
- [ ] `AsyncEditorView.ts` and all six React callers are unchanged.
- [ ] No unit tests or test harnesses are added, and no commit is created.

### Files that need NO changes

- `src/renderer/editors/base/PageToolbar.tsx`
- `src/renderer/editors/base/ContentHostFooter.tsx`
- `src/renderer/editors/text/ScriptPanel.tsx`
- `src/renderer/editors/browser/BrowserView.tsx`
- `src/renderer/editors/mcp-inspector/McpInspectorView.tsx`
- `src/renderer/editors/mneme-config/MnemeConfigView.tsx`
- `src/renderer/editors/base/index.ts`
- `src/renderer/editors/base/TextChrome.tsx`
- `src/renderer/ui/app/AsyncEditorView.ts`
- `doc/epics/EPIC-067.md`
- `doc/active-work.md`

### Files Changed

| File | Change |
|---|---|
| `src/renderer/editors/base/EditorToolbarView.ts` | Add the native `VanillaView` implementation and slot/lifecycle handling |
| `src/renderer/editors/base/EditorToolbar.tsx` | Keep the public React face and replace its JSX implementation with `mountVanilla` |
| `src/renderer/uikit/Panel/Panel.css` | Extend Panel's `hideWhenEmpty` selector for an empty compatibility React-slot wrapper |
| `src/renderer/ui/app/AsyncEditor.tsx` | Delete the unreferenced React twin |
| `src/renderer/ui/app/index.ts` | Remove only the three dead `AsyncEditor` exports |
| `doc/tasks/US-1099-editor-toolbar-native/README.md` | This investigation and implementation plan |
