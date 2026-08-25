# US-1093: Textarea native events

Epic: [EPIC-066 — Delete the synthetic-event round trip](../../epics/EPIC-066.md)

## Goal

Make the shared `TextareaProps` event handlers native `ClipboardEvent` and `KeyboardEvent` callbacks,
remove the pilot view's two `toPublicEvent()` allocations and casts, and update the four handler
assignments whose explicit or contextual parameter types are nominally React-shaped. Establish the
mechanical seam rule for the other 26 sites before US-1094 through US-1098 proceed.

The deliverable is the seam decision as much as the small code change: the one shared prop contract
is native because `Textarea.tsx` is only a `mountVanilla(TextareaView, props)` pass-through. No
React boundary adapter or union was needed. The pilot is implemented, including the required
`TextareaView.tsx` → `TextareaView.ts` rename and caller retyping.

## Background

EPIC-066 measured the programme contract before this task: converted-view props are typed with React
event types, so vanilla listeners wrap an event they already have and callers unwrap it again. The
pilot is intentionally `Textarea` because its two wraps include clipboard handling. E8-11 corrects
the earlier "React-faced" premise: `Textarea.tsx` is a pass-through whose entire component body is
`mountVanilla(TextareaView, props)`, so React never creates the event for either JSX or vanilla
callers. The event type is nominal at every caller and can become native in the shared prop.

The comments in `src/renderer/uikit/shared/react-compat.ts:20-26` explain that
`KeyboardEvent.key` and `ClipboardEvent.clipboardData` brand-check their receiver; a facade made
with `Object.create(event)` would throw without the Proxy's receiver forwarding. That is evidence
to remove the facade from this path, not a reason to preserve a React event type: the browser's
native listener already receives the correctly branded event.

The relevant declarations are in `src/renderer/uikit/Textarea/Textarea.tsx`:

```ts
// Current shared shape
onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
onPaste?: React.ClipboardEventHandler<HTMLDivElement>;
```

`src/renderer/uikit/Textarea/TextareaView.tsx` imports that type, installs native `paste` and
`keydown` listeners, and currently converts both events:

```ts
// Current view contract and handlers
const publicEvent = toPublicEvent(event) as React.ClipboardEvent<HTMLDivElement>;
this.props.onPaste?.(publicEvent);
// ...
const publicEvent = toPublicEvent(event) as React.KeyboardEvent<HTMLDivElement>;
this.props.onKeyDown?.(publicEvent);
```

The view's internal behavior is ordered around the caller hook. Paste calls `onPaste` first, checks
the native event's `defaultPrevented`, then reads `clipboardData.getData("text/plain")` for normal
insertion. Keydown calls `onKeyDown` first, checks `defaultPrevented`, then suppresses Enter in
`singleLine` mode. Those ordering and cancellation semantics are part of the implementation
contract.

### Caller census — verified against all of `src/renderer`

The search found 15 JSX `<Textarea>` instances (including the story) and five vanilla
`new TextareaView(...)` constructions. Only the following callers supply the two handlers in this
task:

| File and line | Prop | Caller form | What the handler reads or calls |
|---|---|---|---|
| `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx:103` | `onKeyDown` | JSX attribute | `key`, `shiftKey`, `preventDefault()`; then `model.runSearch()` |
| `src/renderer/editors/rest-client/RequestBuilder.tsx:291` | `onKeyDown` | JSX attribute | `key`, `preventDefault()`; then `vm.sendRequest()` |
| `src/renderer/editors/rest-client/RequestBuilder.tsx:292` | `onPaste` | JSX attribute | `clipboardData.getData("text")`, `preventDefault()` for cURL/fetch text, then `vm.pasteRequest(text)` |
| `src/renderer/editors/video/VideoView.tsx:60` | `onKeyDown` | JSX attribute | `key`, `shiftKey`, `ctrlKey`, `altKey`, `preventDefault()`; then `model.submitUrl(inputText)` |

This is **four JSX handler assignments across three JSX Textarea instances, and zero vanilla
handler assignments**. The five vanilla constructions were also checked and do not pass either
handler: `src/renderer/ui/dialogs/CommitDialogView.ts:57`,
`src/renderer/ui/dialogs/OpenUrlDialogView.ts:34`,
`src/renderer/editors/notebook/NoteItemView.ts:315`,
`src/renderer/editors/notebook/ExpandedNoteView.ts:265`, and
`src/renderer/editors/link-editor/EditLinkDialogView.ts:240`.

The JSX handlers use only members supplied by native events. None reads `nativeEvent`,
`isDefaultPrevented`, `isPropagationStopped`, `persist`, or another React-only facade member. The
native event therefore serves the measured in-repository callers without a union, a normalising
accessor, or a boundary cast. `preventDefault()` is the same native cancellation operation that
`TextareaView` checks. The required caller edits are two explicit parameter changes in
`RequestBuilder.tsx`, one import/annotation change in `MnemeRootEditorView.tsx`, and no expected
source change in `VideoView.tsx` because its parameter is inferred.

The other EPIC-066 concerns are carried forward at their owning sites: the
`contextMenuPromise` expando, `PageTabView`'s ctrl-click cast, and the dialog overlap are not in
this pilot's files; later tasks must preserve the expando and verify the interaction rather than
copying a cast. The Textarea callbacks are synchronous and do not retain a public event after their
handler returns. No Textarea caller uses `persist()` or `isPersistent()`. The expected extra grep
match for `toPublicEvent` remains its definition/generic compatibility use in `react-compat.ts`,
not a new pilot view call site.

### Clipboard verification

There are two relevant reads, and both are native-compatible:

1. `RequestBuilder`'s live JSX paste handler at `src/renderer/editors/rest-client/RequestBuilder.tsx:161-170`
   reads `e.clipboardData.getData("text")` to detect `fetch(...)` or `curl` input.
2. `TextareaView.handlePaste` at `src/renderer/uikit/Textarea/TextareaView.tsx:196` reads
   `(event as ClipboardEvent).clipboardData?.getData("text/plain")` for ordinary insertion.

A browser `ClipboardEvent` has the branded `clipboardData` WebIDL accessor and returns a native
`DataTransfer` with `getData()`. It serves both reads directly. `RequestBuilder` currently reaches
the native object only because the Proxy re-resolves the accessor; changing the prop and handler
parameter to native removes that extra hop while retaining the branded receiver.

## Implementation Plan and Result

- [x] **Retype the shared event props in `src/renderer/uikit/Textarea/Textarea.tsx`.** Replace the
      React handler aliases with one native prop shape shared by the React pass-through and the
      vanilla view:

  ```ts
  // After: one native contract for both faces and all callers
  onKeyDown?: (event: KeyboardEvent) => void;
  onPaste?: (event: ClipboardEvent) => void;
  ```

  Do not add `TextareaViewProps`, a `ReactEvent | NativeEvent` union, a normalising accessor, or a
  boundary adapter. The `Textarea` function remains the verified pass-through:

  ```ts
  export function Textarea(props: TextareaProps): React.ReactElement {
      return mountVanilla(TextareaView, props);
  }
  ```

- [x] **Update the three affected caller files' handler parameter types.** In
      `src/renderer/editors/rest-client/RequestBuilder.tsx:152`, change
      `(e: React.KeyboardEvent)` to `(e: KeyboardEvent)`; at `:162`, change
      `(e: React.ClipboardEvent)` to `(e: ClipboardEvent)`. In
      `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx`, remove `type KeyboardEvent` from
      the React import at line 1 and change the handler annotation at line 73 from
      `KeyboardEvent<HTMLDivElement>` to the DOM `KeyboardEvent`. `VideoView.tsx:60` is inferred and
      should require no source edit; include it in typecheck verification and touch it only if the
      compiler proves otherwise. Verify every member read before changing a parameter type; the
      census found only native members.

- [x] **Convert `src/renderer/uikit/Textarea/TextareaView.tsx` to
      `src/renderer/uikit/Textarea/TextareaView.ts`.** This is required: after removing the React
      event import and casts, the file contains no JSX and no direct React import. Change the
      `VanillaView` generic and constructor/update/application signatures to
      `TextareaProps`, remove `toPublicEvent` and the React import, and make the two listener
      methods receive native `ClipboardEvent` / `KeyboardEvent` values:

  ```ts
  // Before
  private readonly handlePaste = (event: Event): void => {
      const publicEvent = toPublicEvent(event) as React.ClipboardEvent<HTMLDivElement>;
      this.props.onPaste?.(publicEvent);
      // ... (event as ClipboardEvent).clipboardData ...
  };

  // After
  private readonly handlePaste = (event: ClipboardEvent): void => {
      this.props.onPaste?.(event);
      // ... event.clipboardData ...
  };
  ```

  Apply the same direct-native change to `handleKeyDown`: call the native callback, then use
  `event.defaultPrevented` and `event.key` without a cast. Keep `applyRestProps`,
  `clearRestListeners`, and `bindRef` untouched; they are explicit EPIC-066 E8-7 non-goals.

- [x] **Recheck import resolution after the rename.** The known Vite failure mode is
      `Failed to fetch dynamically imported module` after a `.tsx` → `.ts` conversion until the
      importer is touched; touch the importer if that diagnostic appears. The current census found
      direct static imports of `TextareaView` in `Textarea.tsx`, `CommitDialogView.ts`,
      `OpenUrlDialogView.ts`, `NoteItemView.ts`, `ExpandedNoteView.ts`, and
      `EditLinkDialogView.ts`; no dynamic `TextareaView` importer was found.

- [x] **Verify without adding tests or harnesses.** Run the project's typecheck (`tsc --noEmit`,
      available as `npm run typecheck`) and `npm run lint`. Manually verify the measured boundary
      behavior if a renderer session is available: Enter submits the Mneme, REST, and video inputs
      as before; REST cURL/fetch paste is intercepted; ordinary paste inserts text; and a caller's
      `preventDefault()` still suppresses Textarea's internal action. This project has no unit-test
      or test-harness workflow, so none is to be added.

### Rule for US-1094 through US-1098

For every later wrap site, census the prop's actual JSX and vanilla callers, then check whether the
React face is `mountVanilla(View, props)`. If it is, the React event types are nominal: retype the
shared prop to the native DOM event, delete the wrap and cast, and update each caller's handler
parameter type only after verifying every member it reads exists on the native event. Do not add a
union, normalising accessor, or boundary adapter. This is the rule for all five formerly
"React-faced" views; none renders real JSX or receives real SyntheticEvents. Reserve a boundary
adapter only for a future face that actually renders JSX and receives real SyntheticEvents. Preserve
real event expandos/protocols (such as `contextMenuPromise`) by reading them directly from the native
event, and remove caller-side `.nativeEvent` unwraps.

## Concerns

1. **The React-faced premise is resolved by E8-11.** `Textarea.tsx` is a pass-through to
   `mountVanilla(TextareaView, props)`, as are the other four views named by the epic. React never
   creates these events, including for JSX callers; the React event aliases have only described the
   prop nominally. Retype the one shared `TextareaProps` contract to native events and update the
   measured caller parameter annotations. There is no boundary adapter to preserve and no union to
   reject beyond this direct native rule.

2. **Caller type edits must follow evidence.** The four assignments read only native members:
   `RequestBuilder.tsx` needs two explicit parameter changes, `MnemeRootEditorView.tsx` needs its
   React `KeyboardEvent` import/DOM annotation removed, and `VideoView.tsx`'s parameter is inferred
   and should need no edit. Do not preserve a React-only declaration merely because the caller is
   written in JSX.

3. **Clipboard brand checks are the pilot's runtime risk.** Do not replace the native
   `ClipboardEvent` with `Object.create(event)` or another structural clone. Pass the browser event
   through unchanged so both `clipboardData` reads retain their WebIDL receiver.

4. **Rename and stale module resolution.** The `.tsx` → `.ts` rename is mandatory because the view
   has no JSX after this task, not an optional cleanup. If Vite reports the documented dynamic-import
   fetch error, touch the importer before treating it as an implementation failure.

5. **Scope discipline.** Do not modify `src/renderer/uikit/shared/react-compat.ts` in this task;
   its remaining `applyRestProps`, `clearRestListeners`, and `bindRef` surface is owned by the epic's
   later close. Do not change `Textarea.css`, `Textarea/index.ts`, or the five vanilla callers. The
   three JSX caller files are in scope only for the verified handler parameter edits. Do not add a
   dashboard entry; US-1093 is already listed under EPIC-066 in `doc/active-work.md`.

## Acceptance Criteria

- [x] `src/renderer/uikit/Textarea/TextareaView.ts` exists and the old `.tsx` file is removed;
      `TextareaView.ts` contains no `import ... from "react"` and no React-event cast.
- [x] `TextareaView`'s `onKeyDown` and `onPaste` props are native `KeyboardEvent` and
      `ClipboardEvent` callbacks, with no union or normalising accessor.
- [x] `TextareaProps` uses native `KeyboardEvent` and `ClipboardEvent` callbacks, and all four
      measured JSX handler assignments remain type-correct after the specified caller parameter
      edits. No boundary adapter or cast is added.
- [x] Paste callback ordering, `preventDefault()` cancellation, ordinary `text/plain` insertion,
      and single-line Enter suppression remain unchanged. The REST handler still reads clipboard
      text through the native `ClipboardEvent`.
- [x] `src/renderer/uikit/shared/react-compat.ts` is unchanged, and the explicit E8-7 helpers remain
      available.
- [x] `tsc --noEmit` / `npm run typecheck` succeeds and `npm run lint` is clean. No unit tests or
      test harnesses are added.
- [x] No dashboard entry is added or changed.

## Files Changed Summary

| File | Status | Change |
|---|---|---|
| `src/renderer/uikit/Textarea/Textarea.tsx` | Modify | Retype shared `onKeyDown` and `onPaste` props as native callbacks; keep the pass-through unchanged. |
| `src/renderer/uikit/Textarea/TextareaView.tsx` | Rename/delete | Replace with `src/renderer/uikit/Textarea/TextareaView.ts`; use native event callbacks and remove the facade/casts. |
| `src/renderer/editors/rest-client/RequestBuilder.tsx` | Modify | Retype the explicit keyboard and clipboard handler parameters as native events. |
| `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx` | Modify | Remove the React `KeyboardEvent` type import and use the DOM event type. |
| `src/renderer/editors/video/VideoView.tsx` | Verify / conditional | Its handler parameter is inferred; edit only if typecheck unexpectedly requires it. |
| `src/renderer/uikit/shared/react-compat.ts` | No change | Read for the brand-check contract; `toPublicEvent`, `applyRestProps`, `clearRestListeners`, and `bindRef` are not modified here. |

### Files explicitly requiring no changes

- `src/renderer/uikit/Textarea/Textarea.css`
- `src/renderer/uikit/Textarea/index.ts`
- `src/renderer/ui/dialogs/CommitDialogView.ts`
- `src/renderer/ui/dialogs/OpenUrlDialogView.ts`
- `src/renderer/editors/notebook/NoteItemView.ts`
- `src/renderer/editors/notebook/ExpandedNoteView.ts`
- `src/renderer/editors/link-editor/EditLinkDialogView.ts`
