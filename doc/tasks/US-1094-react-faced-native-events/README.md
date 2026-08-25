# US-1094: React-faced native events

Epic: [EPIC-066 — Delete the synthetic-event round trip](../../epics/EPIC-066.md)

## Goal

Retype the remaining React-faced UIKit event props as native DOM event callbacks, remove the
`toPublicEvent()` wraps and casts from `DialogView`, `ToolbarView`, `NotificationView`, and
`TreeItem`, and update every live caller whose handler parameter is still React-shaped. The task is
implemented, including the three required `.tsx` → `.ts` renames and the atomic Dialog caller edits.

The E8-11 seam rule is already settled: `Dialog.tsx`, `Toolbar.tsx`, `Notification.tsx`, and
`TreeItem.tsx` are `mountVanilla(View, props)` pass-throughs. React never creates these events for
any caller, including JSX callers, so the React event types on these props are nominal. The
implementation must use native event contracts directly: no unions, normalising accessors,
boundary adapters, or casts asserting a native event is a React event.

## Background

EPIC-066 E8-8 assigns this task the four remaining React-faced views and the callers of the
retyped props. The correction under E8-8 makes the prop, rather than the folder, the atomic seam:
retyping `DialogProps.onKeyDown` breaks its callers in the same compile because the prop is
currently inherited from `React.HTMLAttributes<HTMLDivElement>`. E8-12 establishes that green
`npm run typecheck` and clean `npm run lint` are completion conditions, and any `.tsx` to `.ts`
rename is required.

The inherited and declared prop shapes are different:

- `src/renderer/uikit/Dialog/Dialog.tsx:11-12` inherits `onKeyDown` and `onClick`; both must be
  added to the `Omit` list and redeclared as native callbacks.
- `src/renderer/uikit/Toolbar/Toolbar.tsx:7-8` inherits `onKeyDown` and `onFocusCapture`; both
  must be added to the `Omit` list and redeclared as native callbacks.
- `src/renderer/uikit/Notification/Notification.tsx:20` already declares `onClick`; only its
  callback parameter type changes.
- `src/renderer/uikit/Tree/TreeItem.tsx:61` declares `onChevronClick` as a React mouse callback;
  it must become native and the dead `onChevronClickNative` bridge must be removed.

The view listeners already receive native events. `DialogView.onKeyDown` and
`ToolbarView.onKeyDown` are declared with native `KeyboardEvent` parameters at
`DialogView.tsx:182` and `ToolbarView.tsx:149`. `TreeView.ts:467-468` already supplies a native
mouse callback to `TreeItemView`, and `TreeModel.onChevronClick` at `TreeModel.ts:377-380` reads
only native `stopPropagation()`.

### Verified caller census

The census below records callback assignments, their source form, and every event member used by
the handler or its immediately invoked dialog model. `nativeEvent` is present only in the current
Dialog wrappers as the lossy React-to-native unwrap; it is removed rather than replaced with an
adapter. No caller reads `persist`, `isPropagationStopped`, or `isDefaultPrevented`.

#### `DialogProps.onKeyDown`

There are 13 `src/renderer/ui/dialogs/*DialogView.ts` assignments named in EPIC-066, plus one
additional live assignment in `src/renderer/editors/link-editor/EditLinkDialogView.ts:341` that
must also be changed for the typecheck. All 14 are vanilla `new DialogView(...)` callers. The
current wrapper reads only the React-only `event.nativeEvent`; after the change it passes
`event` directly. The native members read by each downstream `handleKeyDown` are:

| File and line | Caller form | Members read after direct native handoff | Current React-only read to remove |
|---|---|---|---|
| `src/renderer/ui/dialogs/CommitDialogView.ts:103` | vanilla | `key`, `ctrlKey`, `metaKey`, `preventDefault()` | `nativeEvent` |
| `src/renderer/ui/dialogs/ConfirmationDialogView.ts:51` | vanilla | `key`, `preventDefault()` | `nativeEvent` |
| `src/renderer/ui/dialogs/CreateBoardDialogView.ts:118` | vanilla | `key`, `preventDefault()` | `nativeEvent` plus lossy cast |
| `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts:103` | vanilla | `key`, `preventDefault()` | `nativeEvent` plus lossy cast |
| `src/renderer/ui/dialogs/InputDialogView.ts:87` | vanilla | `key`, `preventDefault()` | `nativeEvent` plus lossy cast |
| `src/renderer/ui/dialogs/LibrarySetupDialogView.ts:111` | vanilla | `key`, `preventDefault()` | `nativeEvent` |
| `src/renderer/ui/dialogs/NamespaceCollisionDialogView.ts:68` | vanilla | `key`, `preventDefault()` | `nativeEvent` plus lossy cast |
| `src/renderer/ui/dialogs/OpenUrlDialogView.ts:87` | vanilla | `key`, `ctrlKey`, `preventDefault()` | `nativeEvent` plus lossy cast |
| `src/renderer/ui/dialogs/PasswordDialogView.ts:114` | vanilla | `key`, `preventDefault()` | `nativeEvent` plus lossy cast |
| `src/renderer/ui/dialogs/RegisterToolsetDialogView.ts:71` | vanilla | `key`, `preventDefault()` | `nativeEvent` plus lossy cast |
| `src/renderer/ui/dialogs/TextDialogView.ts:53` | vanilla | `key`, `preventDefault()` | `nativeEvent` |
| `src/renderer/ui/dialogs/TorInfoDialogView.ts:141` | vanilla | `key`, `preventDefault()` | `nativeEvent` |
| `src/renderer/ui/dialogs/TrustBoardDialogView.ts:70` | vanilla | `key`, `preventDefault()` | `nativeEvent` plus lossy cast |
| `src/renderer/editors/link-editor/EditLinkDialogView.ts:341` | vanilla | `defaultPrevented`, `key`, `ctrlKey`, `metaKey`, `preventDefault()` | `nativeEvent` |

The supplied 13 dialog model signatures all accept native `KeyboardEvent`, either directly in the
model (`handleKeyDown = (event: KeyboardEvent)`) or through the local view-model intersection
signature. The additional `EditLinkDialogModel.handleKeyDown` is also explicitly native at
`src/renderer/editors/link-editor/EditLinkDialog.ts:37-45`.

The JSX story is another live `DialogProps.onKeyDown` assignment:
`src/renderer/uikit/Dialog/Dialog.story.tsx:36` supplies the handler at `:77`. It reads only
`key` and `preventDefault()`, both native members, so its parameter annotation must change from
`React.KeyboardEvent<HTMLDivElement>` to `KeyboardEvent`.

`DialogProps.onClick` has no live callback assignment. The only non-story Dialog consumers are the
14 `DialogView` constructions above, and none supplies `onClick`; the story supplies
`onBackdropClick`, not `onClick`. `DialogView.onClick` itself reads native `defaultPrevented` and
`target` before invoking the optional backdrop callback.

#### `ToolbarProps.onKeyDown` and `ToolbarProps.onFocusCapture`

No caller supplies either callback. The live JSX instances are the story spread at
`src/renderer/uikit/Toolbar/Toolbar.story.tsx:14` and the Storybook toolbar at
`src/renderer/editors/storybook/StorybookEditorView.tsx:33`; neither passes these props. There are
no `new ToolbarView(...)` callers. Internally, `ToolbarView.onKeyDown` reads native `target`,
`closest()`, `contains()`, `orientation`, `key`, and `preventDefault()`; `onFocusIn` reads native
`target` and the row containment relationship before invoking `onFocusCapture`. No React-only
member is required.

#### `NotificationProps.onClick`

| File and line | Caller form | Members read |
|---|---|---|
| `src/renderer/uikit/Notification/Notification.story.tsx:42-45` | JSX attribute | none; callback takes no event parameter |
| `src/renderer/uikit/Notification/AlertItemView.ts:35` | vanilla `NotificationView` construction | none; callback takes no event parameter |
| `src/renderer/uikit/Notification/AlertItemView.ts:65` | vanilla `NotificationView.update()` | none; callback takes no event parameter |

The view will pass the native `MouseEvent` unchanged. Its close-button callback separately reads
native `stopPropagation()` at `NotificationView.tsx:49-52`; that is not a React-only member.

#### `TreeItemProps.onChevronClick`

There are no live callers of the public React `TreeItem` component or its `onChevronClick` prop
(zero). `TreeView.ts:467-468` bypasses that public arm and passes the native callback directly to
the row view. The current `TreeItem.tsx:82-94` destructure, `toPublicEvent()` call, double cast,
and `onChevronClickNative` prop are therefore a dead bridge. The correct result is one native
`onChevronClick?: (event: MouseEvent) => void` prop, passed through `mountVanilla(TreeItemView,
props)` and consumed by `TreeItemView.ts:250`; do not preserve the dead React arm.

### JSX and extension census

The files that are UIKit view shims and contain no JSX after this task must be renamed with `git
mv` (or a filesystem rename only if `.git` cannot be written):

- `src/renderer/uikit/Toolbar/ToolbarView.tsx` → `src/renderer/uikit/Toolbar/ToolbarView.ts`.
  It uses `React.createElement` at `:46` and `:60`, but no JSX syntax.
- `src/renderer/uikit/Notification/NotificationView.tsx` →
  `src/renderer/uikit/Notification/NotificationView.ts`. It constructs DOM directly and has no
  JSX.
- `src/renderer/uikit/Tree/TreeItem.tsx` → `src/renderer/uikit/Tree/TreeItem.ts`. It has no JSX;
  after the bridge removal it retains only React type contracts such as `React.ReactNode`.

`src/renderer/uikit/Dialog/DialogView.tsx` must remain `.tsx`: `renderChildren()` contains a
fragment and `DialogCommitSignal` JSX at `:160-166`. The pass-through files
`Dialog.tsx`, `Toolbar.tsx`, and `Notification.tsx` remain React-facing component files, following
the established Textarea precedent, even though their bodies are `mountVanilla` pass-throughs.

### Rest-prop verification

Retyping inherited props requires adding them to the `Omit` lists, but it does not alter rest-prop
handling. `DialogView.applyProps()` destructures `onKeyDown` and `onClick` at `:130-131` before
`...rest` and calls `applyRestProps` only with the remainder at `:142`. `ToolbarView.applyProps()`
destructures `onKeyDown` and `onFocusCapture` at `:78-79` before `...rest` and calls
`applyRestProps` at `:88`. `NotificationView.applyProps()` already removes `onClick` at `:110`
before `applyRestProps` at `:131`. `TreeItemView.applyProps()` removes its callback(s) before
`applyRestProps` at `:193`; after the native-arm collapse it will remove only `onChevronClick`.

Nothing changes about residual attributes/listeners, and `src/renderer/uikit/shared/react-compat.ts`
must remain unchanged. `applyRestProps`, `clearRestListeners`, and `bindRef` are E8-7 non-goals.

## Implementation Plan and Result

- [x] **Retype `DialogProps` and remove both Dialog wraps.** In
      `src/renderer/uikit/Dialog/Dialog.tsx`, add the inherited event names to the `Omit` list and
      redeclare them as native callbacks:

      ```ts
      // Before
      extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "children">

      // After
      extends Omit<
          React.HTMLAttributes<HTMLDivElement>,
          "style" | "className" | "children" | "onKeyDown" | "onClick"
      > {
          onKeyDown?: (event: KeyboardEvent) => void;
          onClick?: (event: MouseEvent) => void;
      }
      ```

      In `src/renderer/uikit/Dialog/DialogView.tsx`, remove the `toPublicEvent` import and pass
      the existing native `event` directly to `this.props.onKeyDown` and `this.props.onClick`.
      Keep the native cancellation and backdrop logic in the same order. Do not remove the
      existing `as DialogProps & { className?: string }` casts in dialog callers; those are class
      name compatibility casts, not event assertions.

- [x] **Retype `ToolbarProps` and remove both Toolbar wraps.** In
      `src/renderer/uikit/Toolbar/Toolbar.tsx`, add `onKeyDown` and `onFocusCapture` to the
      inherited `Omit` list and redeclare them:

      ```ts
      // Before
      extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className">

      // After
      extends Omit<
          React.HTMLAttributes<HTMLDivElement>,
          "style" | "className" | "onKeyDown" | "onFocusCapture"
      > {
          onKeyDown?: (event: KeyboardEvent) => void;
          onFocusCapture?: (event: FocusEvent) => void;
      }
      ```

      In `src/renderer/uikit/Toolbar/ToolbarView.tsx`, remove `toPublicEvent` and call both
      callbacks with the native `KeyboardEvent` / `FocusEvent`. Preserve roving-tabindex ordering:
      the internal keyboard behavior runs before the caller callback, and focus bookkeeping runs
      before `onFocusCapture`.

- [x] **Retype Notification's declared prop and remove its wrap.** In
      `src/renderer/uikit/Notification/Notification.tsx`, change the existing declaration:

      ```ts
      // Before
      onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;

      // After
      onClick?: (event: MouseEvent) => void;
      ```

      In `src/renderer/uikit/Notification/NotificationView.tsx`, remove `toPublicEvent` and pass
      the native click event directly. Keep the close-button `stopPropagation()` behavior and the
      `onClick` exclusion from `applyRestProps` unchanged.

- [x] **Collapse TreeItem's dead dual arm into one native prop.** In
      `src/renderer/uikit/Tree/TreeItem.tsx`, change `onChevronClick` to
      `(event: MouseEvent) => void`, remove the `toPublicEvent` import, delete the destructure and
      `nativeCallback` wrapper, and make the pass-through direct:

      ```ts
      // Before
      const { onChevronClick, ...viewProps } = props;
      const nativeCallback = onChevronClick
          ? (event: MouseEvent): void => {
                onChevronClick(toPublicEvent(event) as unknown as React.MouseEvent<HTMLButtonElement>);
            }
          : undefined;
      return mountVanilla(TreeItemView, {
          ...viewProps,
          onChevronClickNative: nativeCallback,
      } as TreeItemViewProps);

      // After
      return mountVanilla(TreeItemView, props);
      ```

      In `src/renderer/uikit/Tree/TreeItemView.ts`, remove `onChevronClickNative` from
      `TreeItemViewProps`, destructure only `onChevronClick`, and invoke it at the native button
      listener. In `src/renderer/uikit/Tree/TreeView.ts:467-468`, rename the supplied property to
      `onChevronClick`; retain the direct native `MouseEvent` and row index closure. This deletes
      the dead public React arm rather than preserving two rivals rejected by E8-3.

- [x] **Fix every Dialog keyboard caller atomically with the prop change.** In each of the 13
      `src/renderer/ui/dialogs/*DialogView.ts` files listed in the census, replace
      `model.handleKeyDown(event.nativeEvent)` and
      `model.handleKeyDown(event.nativeEvent as KeyboardEvent)` with
      `model.handleKeyDown(event)`, removing all associated lossy casts. Apply the same direct
      handoff to `src/renderer/editors/link-editor/EditLinkDialogView.ts:341`; this 14th caller is
      required by the compile even though it is outside the supplied `ui/dialogs` list. Verify the
      existing native `KeyboardEvent` signatures in the corresponding models remain unchanged.

      In `src/renderer/uikit/Dialog/Dialog.story.tsx:36`, change the explicit handler parameter
      from `React.KeyboardEvent<HTMLDivElement>` to native `KeyboardEvent`. The story handler's
      `key` and `preventDefault()` reads remain unchanged. Do not add parameters or adapters to
      the Notification callers, because their callbacks read no event members; Toolbar has no
      callback caller to update.

- [x] **Rename the no-JSX view shims with `git mv`.** Rename exactly these files:

      ```text
      src/renderer/uikit/Toolbar/ToolbarView.tsx
          → src/renderer/uikit/Toolbar/ToolbarView.ts
      src/renderer/uikit/Notification/NotificationView.tsx
          → src/renderer/uikit/Notification/NotificationView.ts
      src/renderer/uikit/Tree/TreeItem.tsx
          → src/renderer/uikit/Tree/TreeItem.ts
      ```

      Use extensionless imports as they are currently written; update only imports that the
      compiler proves require adjustment. `ToolbarView.ts` keeps its genuine React bridge for
      `mountReactHandle` / `React.createElement`; `NotificationView.ts` and `TreeItem.ts` may use
      type-only React imports for their remaining React value contracts. Keep
      `DialogView.tsx`, which still contains JSX, and do not rename the React-facing pass-through
      files `Dialog.tsx`, `Toolbar.tsx`, or `Notification.tsx`.

- [x] **Verify rest-prop and compatibility boundaries.** Confirm after the type edits that
      `DialogView.applyProps`, `ToolbarView.applyProps`, `NotificationView.applyProps`, and
      `TreeItemView.applyProps` still remove their owned callbacks before `...rest`, and that no
      retyped callback reaches `applyRestProps`. Leave
      `src/renderer/uikit/shared/react-compat.ts` byte-for-byte unchanged; do not modify
      `applyRestProps`, `clearRestListeners`, or `bindRef`.

- [x] **Run completion checks without adding tests.** Run `npm run typecheck` (`tsc --noEmit`) and
      `npm run lint`; both must be green before implementation is considered complete. Do not add
      unit tests, test harnesses, or other test infrastructure. If a `.tsx` to `.ts` rename causes
      the documented Vite `Failed to fetch dynamically imported module` HMR failure, touch the
      importer and verify from a cold restart as required by `CLAUDE.md` §7 and EPIC-066 E8-12.
      Do not commit and do not modify `doc/active-work.md`; US-1094 is already listed there.

## Concerns

1. **React-only unwraps are an explicit removal decision.** The 14 vanilla Dialog wrappers
   currently read `event.nativeEvent`; this is the only React-only event member found in the
   callers. It is not a retained protocol: each wrapper will pass the native event directly, and
   the native dialog models already accept `KeyboardEvent`. No caller reads `persist`,
   `isPropagationStopped`, or `isDefaultPrevented`, so no compatibility decision remains for those
   members.

2. **The additional Link Editor caller cannot be deferred.**
   `EditLinkDialogView.ts:341` is a live `DialogView.onKeyDown` assignment and its model reads
   native `defaultPrevented`, `key`, `ctrlKey`, `metaKey`, and `preventDefault()`. Leaving its
   `nativeEvent` unwrap would fail the same typecheck that retypes `DialogProps.onKeyDown`.

3. **TreeItem's React callback has no live caller.** The zero-caller result makes
   `onChevronClickNative` a dead compatibility arm. Delete it and use one native prop for both
   `TreeItemView` and the existing `TreeView` native path; preserving the dead arm would violate
   E8-3's rejection of two-arm contracts.

4. **The renames are structural requirements.** `ToolbarView.tsx`, `NotificationView.tsx`, and
   `TreeItem.tsx` contain no JSX and must become `.ts`; `DialogView.tsx` contains real JSX and must
   remain `.tsx`. The no-JSX pass-through files are deliberately not renamed because they remain
   React-facing component boundaries, matching the completed Textarea precedent.

5. **Rest-prop behavior is not part of this task.** The owned callbacks are already destructured
   before `applyRestProps`, so changing inherited type declarations does not change residual
   listener handling. `react-compat.ts`, `applyRestProps`, `clearRestListeners`, and `bindRef` stay
   untouched as E8-7 non-goals.

6. **HMR after a rename is operational, not a new seam.** A stale Vite module graph may require
   touching an importer and a cold restart; it must not motivate a boundary adapter or a retained
   React event type.

## Acceptance Criteria

- [x] `DialogProps` has native `KeyboardEvent` / `MouseEvent` callbacks explicitly redeclared after
      adding `onKeyDown` / `onClick` to its `Omit` list; `ToolbarProps` similarly redeclares native
      `KeyboardEvent` / `FocusEvent` callbacks after adding both inherited names to `Omit`.
- [x] `NotificationProps.onClick` and `TreeItemProps.onChevronClick` are native callbacks, with no
      union, normalising accessor, boundary adapter, or native-to-React cast.
- [x] All specified wraps and casts are removed from the four view seams, including the TreeItem
      double cast; `TreeItemView` and `TreeView` share one native `onChevronClick` prop.
- [x] All 14 vanilla Dialog keyboard callers and the Dialog story pass native events directly; no
      caller retains a `.nativeEvent` unwrap or a lossy `KeyboardEvent` cast. Every downstream
      model signature accepts native `KeyboardEvent`.
- [x] The caller census remains accurate: Toolbar has zero live assignments for its two retyped
      callbacks, Notification has two event-agnostic vanilla callbacks plus the story's
      conditional form, and public TreeItem `onChevronClick` has zero live callers.
- [x] `ToolbarView.ts`, `NotificationView.ts`, and `TreeItem.ts` replace their `.tsx` files;
      `DialogView.tsx` remains because it contains JSX. The renames use `git mv` where possible.
- [x] `DialogView.applyProps`, `ToolbarView.applyProps`, `NotificationView.applyProps`, and
      `TreeItemView.applyProps` continue to remove owned callbacks before `applyRestProps`; no
      change is made to `src/renderer/uikit/shared/react-compat.ts` or its E8-7 helpers.
- [x] `npm run typecheck` is green and `npm run lint` is clean. No unit tests or test harnesses are
      added, no dashboard entry is changed, and no commit is created.

## Files Changed Summary

| File | Status | Change |
|---|---|---|
| `src/renderer/uikit/Dialog/Dialog.tsx` | Modify | Add inherited `onKeyDown` / `onClick` to `Omit`; redeclare native callbacks. |
| `src/renderer/uikit/Dialog/DialogView.tsx` | Modify | Remove both `toPublicEvent` calls and pass native events directly; retain JSX. |
| `src/renderer/uikit/Dialog/Dialog.story.tsx` | Modify | Retype the explicit story keydown parameter as native `KeyboardEvent`. |
| `src/renderer/uikit/Toolbar/Toolbar.tsx` | Modify | Add inherited `onKeyDown` / `onFocusCapture` to `Omit`; redeclare native callbacks. |
| `src/renderer/uikit/Toolbar/ToolbarView.tsx` → `ToolbarView.ts` | Rename/modify | Remove event wrapping/casts; preserve the React child bridge without JSX. |
| `src/renderer/uikit/Notification/Notification.tsx` | Modify | Retype declared `onClick` as native `MouseEvent`. |
| `src/renderer/uikit/Notification/NotificationView.tsx` → `NotificationView.ts` | Rename/modify | Pass native click events directly and remove the cast. |
| `src/renderer/uikit/Tree/TreeItem.tsx` → `TreeItem.ts` | Rename/modify | Retype the public callback, remove the dead adapter, and pass props through directly. |
| `src/renderer/uikit/Tree/TreeItemView.ts` | Modify | Collapse `onChevronClickNative` into the single native `onChevronClick` prop. |
| `src/renderer/uikit/Tree/TreeView.ts` | Modify | Supply `onChevronClick` directly with the existing native callback. |
| `src/renderer/ui/dialogs/CommitDialogView.ts` | Modify | Replace the Dialog `.nativeEvent` handoff with the direct native event. |
| `src/renderer/ui/dialogs/ConfirmationDialogView.ts` | Modify | Replace the Dialog `.nativeEvent` handoff with the direct native event. |
| `src/renderer/ui/dialogs/CreateBoardDialogView.ts` | Modify | Replace the Dialog unwrap and lossy cast with the direct native event. |
| `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts` | Modify | Replace the Dialog unwrap and lossy cast with the direct native event. |
| `src/renderer/ui/dialogs/InputDialogView.ts` | Modify | Replace the Dialog unwrap and lossy cast with the direct native event. |
| `src/renderer/ui/dialogs/LibrarySetupDialogView.ts` | Modify | Replace the Dialog `.nativeEvent` handoff with the direct native event. |
| `src/renderer/ui/dialogs/NamespaceCollisionDialogView.ts` | Modify | Replace the Dialog unwrap and lossy cast with the direct native event. |
| `src/renderer/ui/dialogs/OpenUrlDialogView.ts` | Modify | Replace the Dialog unwrap and lossy cast with the direct native event. |
| `src/renderer/ui/dialogs/PasswordDialogView.ts` | Modify | Replace the Dialog unwrap and lossy cast with the direct native event. |
| `src/renderer/ui/dialogs/RegisterToolsetDialogView.ts` | Modify | Replace the Dialog unwrap and lossy cast with the direct native event. |
| `src/renderer/ui/dialogs/TextDialogView.ts` | Modify | Replace the Dialog `.nativeEvent` handoff with the direct native event. |
| `src/renderer/ui/dialogs/TorInfoDialogView.ts` | Modify | Replace the Dialog `.nativeEvent` handoff with the direct native event. |
| `src/renderer/ui/dialogs/TrustBoardDialogView.ts` | Modify | Replace the Dialog unwrap and lossy cast with the direct native event. |
| `src/renderer/editors/link-editor/EditLinkDialogView.ts` | Modify | Fix the additional live Dialog keyboard caller atomically. |
| `src/renderer/uikit/shared/react-compat.ts` | No change | E8-7 non-goal; helpers and rest-prop compatibility remain unchanged. |

### Files explicitly requiring no changes

- The `mountVanilla` function bodies in `src/renderer/uikit/Dialog/Dialog.tsx`,
  `src/renderer/uikit/Toolbar/Toolbar.tsx`, and
  `src/renderer/uikit/Notification/Notification.tsx` (their prop declarations are modified above)
- `src/renderer/uikit/Notification/Notification.story.tsx` callback bodies (they read no event)
- `src/renderer/uikit/Notification/AlertItemView.ts` callback bodies (they read no event)
- `src/renderer/uikit/Toolbar/Toolbar.story.tsx` and `src/renderer/editors/storybook/StorybookEditorView.tsx`
  event props (neither supplies `onKeyDown` nor `onFocusCapture`)
- `src/renderer/uikit/Dialog/DialogContentView.tsx`
- `src/renderer/uikit/shared/react-compat.ts`
- `doc/active-work.md`
