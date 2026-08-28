# US-1172 — Strip the residual React paths

## Goal

Remove the last accidental React paths from otherwise-native UIKit code and delete the obsolete
React-only faces. The sanctioned Excalidraw island, Storybook `component:` arm, `EditorErrorBoundary`,
`mount.tsx`, and Epic F's React type surface remain deliberately untouched.

## Background

EPIC-073 E15-1 closing statements 3 and 4 require `PopoverView` and `DialogView` to be native
TypeScript views with no React fallback, while preserving popover resize and dialog focus behavior.
US-1166 through US-1171 already converted the editor bodies and retired the face renderers. The
measured 2026-08-28 scope proves these files are now the remaining residuals:

- `editors/base/EditorError.tsx` has zero importers; replace it with the existing
  `ui/app/NativeEditorErrorView` already used by `AsyncEditorView`.
- `uikit/Menu/WithMenu.tsx` has no renderers; only its two exports in `uikit/Menu/index.ts` remain.
- `uikit/shared/highlight.ts` has one dead React renderer (`highlight`) and one live native renderer
  (`highlightInto`); graph now uses only `highlightInto`.
- `PopoverView.tsx` is a native `VanillaView` with native `contentView` callers. Its React fragment
  and `Icon` resize branch are dead; its native `ResizeHandleIcon` branch is the behavior to keep.
- `DialogView.tsx` is a native `VanillaView`; all callers pass native DOM roots. Its
  `DialogCommitSignal` only existed to run `runFocusPass` after a React commit, so the native
  content write must call that focus pass directly.
- `Icon.tsx` has exactly one renderer, the dead Popover React branch. Native icon builders already
  exist in `theme/icons.ts`, including `ResizeHandleIcon.createElement()`.

The five investigated runtime arms are also dead. `fill-slot.ts` is called by native views with
strings, numbers, DOM nodes/fragments, or native arrays; the two live React consumers named by the
epic (the Excalidraw island and Storybook's `component:` arm) do not call `fillSlot`. The ListBox
and Tree custom-render stories return `Node`, application callers do not supply a React custom row,
Toolbar callers supply native nodes/strings, and TruncatedText's text extraction receives native
slot values. Therefore the runtime arms can be removed. The `SlotContent = string | Node |
React.ReactNode` alias remains intentionally, including its type-only React import, for Epic F's
separate type-surface work.

## Implementation Plan

- [x] Delete `src/renderer/editors/base/EditorError.tsx`. Do not touch
   `src/renderer/ui/app/EditorErrorBoundary.tsx`; Storybook's `component:` arm still requires it.
- [x] Delete `src/renderer/uikit/Menu/WithMenu.tsx` and remove its re-export lines from
   `src/renderer/uikit/Menu/index.ts` and `src/renderer/uikit/index.ts`. `openMenu()` and `MenuHandle`
   from `attach-menu.ts` remain.
- [x] Rename `src/renderer/uikit/Popover/PopoverView.tsx` to
   `src/renderer/uikit/Popover/PopoverView.ts`. Remove the React root, fragment renderer, and
   `Icon` import. Require the already-used native `contentView` path, keep
   `updateNativeResizeHandle()` and `ResizeHandleIcon.createElement()`, and keep all positioning,
   dismissal, and resize listeners registered once through `listen()`/`own()`.
- [x] Rename `src/renderer/uikit/Dialog/DialogView.tsx` to
   `src/renderer/uikit/Dialog/DialogView.ts`. Remove `DialogCommitSignal`, JSX, and the runtime
   React import. Fill the native children slot and invoke `runFocusPass()` after the native write
   on mount and update. Keep the existing focus trap, ref behavior, and focus restoration.
- [x] Delete `src/renderer/uikit/Icon/Icon.tsx`; verify the native resize icon remains supplied by
   `ResizeHandleIcon.createElement()` in `PopoverView.ts`.
- [x] Remove the dead React branch from `src/renderer/uikit/shared/highlight.ts`, including
   `highlight`, `highlightRecursive`, and the runtime React import. Keep `highlightInto` and its
   native implementation unchanged.
- [x] Remove the investigated runtime arms:
   - `src/renderer/uikit/shared/fill-slot.ts`: remove React-root state/container creation and keep
     native text, number, boolean-empty, node, fragment, and native-array writes. Retain the
     `SlotContent` React type alias as a type-only dependency for Epic F.
   - `src/renderer/uikit/ListBox/ListBoxView.ts`: pass the proven-native custom-row result directly
     to `fillSlot`; retain the `React.CSSProperties` type use only as Epic F scope.
   - `src/renderer/uikit/Toolbar/ToolbarView.ts`: replace the root React mount/update with one
     `fillSlot` cleanup-owned native child write.
   - `src/renderer/uikit/Tree/TreeView.ts`: pass the proven-native custom-row result directly to
     `fillSlot`; retain the `React.CSSProperties` type use only as Epic F scope.
   - `src/renderer/uikit/TruncatedText/TruncatedTextView.ts`: remove `React.isValidElement` and
     retain native string/number/node/array text extraction.

Before → after for the two behavior-sensitive branches:

```ts
// PopoverView.tsx
if (this.props.contentView) mountNativeContent();
else this.reactRoot = mountReactHandle(this.root, this.renderChildren());
// → mount the contentView and updateNativeResizeHandle(); no React fallback
```

```ts
// DialogView.tsx
nativeChildren ? fillSlot(host, nativeChildren) : fillSlot(host, renderChildren(children));
// → fillSlot(host, nativeChildren); runFocusPass();
```

## Concerns

- `PopoverView` has both a dead React resize fragment and a live native resize handle. The native
  handle must remain; a root count would not detect losing the resize affordance.
- `bind()` and `listen()` register cleanup through `own()` and have no early-release API. No
  repeatedly-called method may register either resource. The existing mount-only registrations
  remain mount-only.
- No new wrapper element is needed. If a future edit introduces one, it must receive explicit size
  styles; a bare `div` is `display: block; height: 0`.
- `Panel.tsx`, `Text.tsx`, `EditorErrorBoundary.tsx`, `uikit/shared/mount.tsx`,
  `editors/draw/ExcalidrawIsland.tsx`, `theme/GlobalStyles.tsx`, `index.tsx`, all React type-only
  imports, and `doc/active-work.md` require no changes in this task.
- Overlay presence must be checked with `getBoundingClientRect()`. Do not use `offsetParent` for
  popover/dialog visibility or geometry: `position: fixed` elements have `offsetParent === null`,
  which caused two false negatives in US-1168.

## Acceptance Criteria

- `src/renderer/uikit/Popover/PopoverView.ts` and `src/renderer/uikit/Dialog/DialogView.ts` exist
  as `.ts`, contain no direct `react` import, and contain no React runtime branch.
- `EditorError.tsx`, `WithMenu.tsx`, and `Icon.tsx` are deleted. Grepping the module paths
  `editors/base/EditorError`, `uikit/Menu/WithMenu`, and `uikit/Icon/Icon` finds no imports.
- `PopoverView` uses the native resize handle and `DialogView` runs its focus pass after native
  children are written.
- The actual remaining non-story `src/renderer` `.tsx` files are:
  `content/tree-context-menus.tsx`, `editors/draw/ExcalidrawIsland.tsx`,
  `index.tsx`, `theme/GlobalStyles.tsx`, `ui/app/EditorErrorBoundary.tsx`,
  `ui/dialogs/poppers/grid-context-menu.tsx`, `uikit/Panel/Panel.tsx`,
  `uikit/shared/mount.tsx`, and `uikit/Text/Text.tsx`.
- Human presence checks:
  - Open the UIKit Popover story, open the popover, confirm its
    `getBoundingClientRect()` is on-screen and positioned against the trigger, then drag the
    visible resize handle and confirm the measured width/height changes. Also exercise native
    callers: the board toolbar board-switcher, browser compact-tab hover preview, browser
    downloads popup and URL suggestions, and grid CSV/columns options (including a grid filter
    popover where available).
  - Open the UIKit Dialog story with autofocus enabled, click `Open dialog`, confirm by focus
    inspection that the first input receives focus after the content is mounted, then click `Save`
    and confirm the dialog closes. Measure the dialog rectangle with `getBoundingClientRect()`.
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass. No unit tests or test harnesses
  are added.

## Files Changed Summary

| Path | Change |
|---|---|
| `src/renderer/editors/base/EditorError.tsx` | Delete; zero importers, native error view is already in use |
| `src/renderer/uikit/Menu/WithMenu.tsx` | Delete; zero renderers |
| `src/renderer/uikit/Menu/index.ts`, `src/renderer/uikit/index.ts` | Remove obsolete `WithMenu` exports |
| `src/renderer/uikit/Popover/PopoverView.tsx` → `PopoverView.ts` | Remove React fallback; retain native content, positioning, and resize handle |
| `src/renderer/uikit/Dialog/DialogView.tsx` → `DialogView.ts` | Remove commit signal/JSX; run native focus pass |
| `src/renderer/uikit/Icon/Icon.tsx` | Delete; sole renderer was the dead Popover branch |
| `src/renderer/uikit/shared/highlight.ts` | Delete dead React renderer; keep `highlightInto` |
| `src/renderer/uikit/shared/fill-slot.ts` | Remove React runtime arm; retain React type alias |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Remove React fragment custom-row arm |
| `src/renderer/uikit/Toolbar/ToolbarView.ts` | Replace React child root with native slot fill |
| `src/renderer/uikit/Tree/TreeView.ts` | Remove React fragment custom-row arm |
| `src/renderer/uikit/TruncatedText/TruncatedTextView.ts` | Remove React element text arm |

---

## Verification record (2026-08-28)

**Gates:** `npm run typecheck`, `npm run lint`, `npm run build-prod` — all pass.

**Deleted:** `editors/base/EditorError.tsx` (zero importers once the three bodies converted),
`uikit/Menu/WithMenu.tsx` (no renderers; only the two barrel re-exports), `uikit/Icon/Icon.tsx`
(sole renderer was `PopoverView`'s React branch).
**Renamed:** `PopoverView.tsx` → `.ts`, `DialogView.tsx` → `.ts`, both with no `react` import and no
React branch. **Changed:** `highlight.ts` (React branch removed — zero consumers after US-1170),
`fill-slot.ts` and the ListBox/Toolbar/Tree/TruncatedText views (all five investigated React arms
found dead; the `SlotContent` **type** alias deliberately left for Epic F per C13).

**Measured:** JSX markers **10** total across 9 non-story `.tsx`; React *runtime* users **14**;
react importers **84** (from 116 at epic start).

**Live pass, after a cold dev-server restart.** The `fill-slot` React-arm removal touches app-wide
slot machinery, so the smoke test was deliberately broad: 6/6 tabs with text, 18/18 tree items with
text, 36/36 buttons with content, 1 React root, nothing crashed.

**Closing statement 3, popover half:**

| Check | Result |
|---|---|
| Popover opens (file-diff revision picker) | **462×286 at (280,71)**, `position: fixed`, on screen |
| React roots inside the popover | **0** (was 4 JSX markers) |
| Content renders | commit table with `Date / Comment / Commit` headers and rows |
| Geometry measured with | `getBoundingClientRect()` — **not** `offsetParent`, which is `null` for `position: fixed` |

**The resize affordance could not be exercised, and the reason is worth recording.** `PopoverView`'s
resize handle is gated on a `resizable` prop, and the **only** place in the tree that sets it on a
popover is `uikit/Popover/Popover.story.ts`. No application caller enables it. So the "and resizes"
half of closing statement 3 is reachable *only* through the storybook Popover story — that is where a
human must check it, and it also means the resizable code path has no application consumer at all,
which Epic F may want to know.

**Not verified — recorded as unverified rather than replaced (C9a):**

- **Popover resize** — see above; storybook Popover story is the only route.
- **Dialog open → commit → focus pass.** `DialogCommitSignal` was replaced with a native scheduled
  focus pass; no dialog was opened, so neither the commit nor the focus behaviour was observed. This
  is the highest-value remaining human check in the epic.
- **The board, browser and grid popover call sites** — `PopoverView` has live native callers in all
  three (hover preview, downloads popup, column options). Only the file-diff picker was exercised.
- **`TruncatedText` / `Toolbar` / `ListBox` slot arms** — the removed branches were proven dead by
  source analysis, and tree/button/tab content renders, but no truncation or toolbar overflow case
  was specifically driven.
