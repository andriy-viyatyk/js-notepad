# US-1068 — Remove React roots from `PathInputView`

Epic: [EPIC-062 — De-React Epic E4](../../epics/EPIC-062.md)

Status: investigation and implementation plan only; no implementation is in scope.

## Goal

Remove the nested React input and popover-content roots from
`src/renderer/uikit/PathInput/PathInputView.tsx` while preserving the public `PathInput` face and
all existing autocomplete behavior. This is a shared UIKit boundary task sequenced immediately
before US-1064, which consumes `PathInputView` inside virtualized note cells.

## Background

### Current implementation and verified boundary

`src/renderer/uikit/PathInput/PathInputView.tsx` is a 362-line `VanillaView`, but it currently
mounts `PathInputBridge` through `mountReact` in `mountBridge()` and passes the React
`suggestionContent` element as `PopoverViewProps.children`. The bridge renders the `Input` face,
so the input itself is a React subtree; the ordinary `PopoverView` children path mounts another
React root when suggestions open. The vanilla `KeyedList` rows below the suggestion host are
already direct DOM and must remain so.

The public face at `src/renderer/uikit/PathInput/PathInput.tsx` is 11 lines and already delegates
through `mountVanilla(PathInputView, ...)`; it must remain unchanged. The behavior contract is in
`src/renderer/uikit/PathInput/PathInputModel.ts` (298 lines): controlled value updates,
path/separator/max-depth suggestion derivation, active-index keyboard navigation, folder versus
leaf selection, Escape/Enter/Tab handling, the 150 ms blur grace, and `setInputRef`/row-ref
ownership. `PathInput.css` remains the styling source.

This is not a private notebook conversion. The verified independent consumers outside the notebook
are:

| Consumer | Evidence and role |
|---|---|
| `src/renderer/editors/link-editor/EditLinkDialog.tsx:192-201` | Direct React `PathInput` category field. |
| `src/renderer/uikit/TagsInput/TagsInput.tsx` | Public React `TagsInput` boundary; its native `TagsInputView` creates a `PathInputView` at `TagsInputView.ts:106-114`. |
| `src/renderer/uikit/TagsInput/TagsInputView.ts:1-2,22,106-114` | Direct vanilla composition consumer with a live draft and add-tag blur behavior. |
| `src/renderer/editors/storybook/storyRegistry.ts:27` and `src/renderer/uikit/PathInput/PathInput.story.tsx` | Independent story/demo boundary exercising the public face and its commit callback. |

E4-4 therefore does not permit converting `PathInputView` only as part of US-1064. The shared
primitive must be safe for every caller before the notebook cell uses it.

### Shipped native popover precedents

Use the existing `PopoverView.contentView` seam, whose type is declared at
`src/renderer/uikit/Popover/PopoverView.tsx:27-31` and whose floating branch claims and mounts the
returned native view at `PopoverView.tsx:88-93`. The three direct precedents are:

- `src/renderer/uikit/Autocomplete/AutocompleteView.ts:299-317`: `AutocompleteContentView`
  adopts the popover host as its root so its header and list remain direct children.
- `src/renderer/uikit/Select/SelectView.ts:249-270`: `ListBoxView` creates its own root, so the
  factory appends that root to the supplied host before returning the view.
- `src/renderer/uikit/MultiSelect/MultiSelectView.ts:226-250`: the same append-and-return shape
  for `MultiListBoxView`.

`PathInput` has one suggestion-host root, so the implementation should use the Select/MultiSelect
shape: create a native suggestion-content view, append its root to the popover host in the
`contentView` factory, and return the owned view. It must not pass both `children` and `contentView`.

## Implementation Plan

### 1. Replace the React input bridge with `InputView`

Update `src/renderer/uikit/PathInput/PathInputView.tsx`:

- remove `PathInputBridge`, `propsState`, `suggestionContent`, `mountReact`, and the bridge-owned
  React `Input` import;
- create one `InputView` child with the current `value`, placeholder, size, disabled/read-only,
  autofocus, aria attributes, and direct model callbacks (`onInputChange`, `onInputFocus`,
  `onInputBlur`, and a native `KeyboardEvent` adapter for `onInputKeyDown`);
- pass `setInputRef` as the `InputView` ref callback so `PathInputModel.inputRef`, the external
  caller ref, autofocus caret placement, and popover anchoring continue to use the real input;
- append and mount the input view in the existing root, update it from `onUpdate`, and let
  `VanillaView` ownership dispose it before the model driver clears its refs; and
- preserve `applyRestProps`, root datasets, `PathInput.css`, and all public prop names.

Before → after:

```tsx
// Before: PathInputView.tsx — React bridge and React child content
private readonly suggestionContent: React.ReactElement = <div data-part="suggestion-host" />;

return {
    ...popoverProps,
    children: this.suggestionContent,
};
```

```ts
// After: PathInputView.tsx — native child ownership
this.inputView = this.child(new InputView(this.inputProps(props)));
this.root.append(this.inputView.root);
this.inputView.mount();
```

The exact `InputView` prop mapping must keep the model's direct string callback contract; do not
reintroduce React synthetic events or an input-specific reconciliation layer.

### 2. Move suggestion content to a native `contentView`

Keep the existing `KeyedList<PathSuggestion, string, HTMLDivElement>` and row event behavior, but
move its host and lifecycle into a private native suggestion-content view declared in
`src/renderer/uikit/PathInput/PathInputView.tsx`.
The view must own the `data-type="path-input"`, `data-part="suggestion-host"` root, maintain the
`suggestionHost`/row-element references, and preserve `rowMeta`, `setRowRef`, active-row updates,
scroll-into-view, and row listener disposal exactly as today.

Change `popoverProps()` to provide:

```ts
contentView: (host) => {
    const content = new PathSuggestionContentView(this.suggestionProps());
    host.append(content.root);
    this.suggestionContentView = content;
    return content;
},
```

Update the native content view when model state or props change, clear the bare reference when the
popover closes and disposes its floating branch, and never mount a React element through
`PopoverView`. Follow `SelectView`'s append-before-return ownership shape, not
`AutocompleteView`'s host-adopting shape, because the suggestion view owns its own root.

### 3. Preserve all model and public-face semantics

Do not change `src/renderer/uikit/PathInput/PathInputModel.ts`, `PathInput.tsx`, `PathInput.css`,
or the public `PathInputProps` type. Verify the direct view still preserves:

- controlled value and suggestion updates;
- separator and max-depth filtering;
- folder selection keeping focus and appending the separator;
- leaf selection committing once and closing;
- ArrowUp/ArrowDown active-index wrap, Enter, Tab, and Escape behavior;
- the 150 ms blur grace that allows suggestion-row clicks and Tab fall-through;
- disabled/read-only suppression and aria state;
- external input refs and autofocus caret-at-end behavior; and
- `KeyedList` path identity, active-row scrolling, native mouse handlers, and row cleanup.

### 4. Verify every independent consumer

Run the existing development/manual verification without adding unit tests or a harness:

1. In `EditLinkDialog.tsx`, edit a category, select a folder/leaf, blur, press Escape, and verify
   the dialog model receives the same values and commit behavior.
2. In `TagsInputView.ts`, add tags by typing, selecting suggestions, pressing Enter/Tab, and
   blurring; verify draft clearing and duplicate prevention remain unchanged.
3. Open the `PathInput` story through `storyRegistry.ts`, exercise all path sets, separators,
   max-depth, disabled/read-only, autofocus, and last-commit display.
4. Inspect the DOM while closed and open: the input and suggestion branch contain no React root,
   `data-reactroot`, `mountReact` bridge, or React child branch; `PopoverView` uses only
   `contentView` for suggestions.

## Concerns / Open questions

1. **Popover ownership shape is load-bearing.** `PathInput`'s suggestion view owns one detached
   root, so its `contentView` factory must append that root before returning, as in `SelectView`;
   returning it without append would render an empty dropdown. The implementation must also clear
   the bare reference after the floating branch disposes it.

2. **Input ref identity is a compatibility boundary.** `InputView` owns the actual input element
   and already supports `ref?: React.Ref<HTMLInputElement>`. `PathInputView` must continue routing
   that ref through `setInputRef`, because the model's popover anchor and 150 ms blur check use the
   same element.

3. **No behavior decision is unresolved.** The public face, model, CSS, and four consumers remain
   unchanged; only the two nested React rendering paths are replaced with the shipped native
   composition seams.

## Acceptance Criteria

- [ ] `PathInputView.tsx` contains no `mountReact`, `PathInputBridge`, JSX rendering, or React
  `PopoverView.children` path at runtime; its React-facing type compatibility remains intact.
- [ ] The input is an owned `InputView` with identical value, events, ref, autofocus, aria,
  disabled/read-only, and size behavior.
- [ ] Suggestions use `PopoverView.contentView` and a native suggestion view; the existing
  `KeyedList` row identity, active state, keyboard navigation, mouse behavior, and cleanup remain.
- [ ] `PathInputProps`, `PathInputModel.ts`, `PathInput.tsx`, and `PathInput.css` are unchanged.
- [ ] The link dialog, `TagsInput`, `TagsInputView`, and storybook consumer behaviors are manually
  verified, including the 150 ms blur grace and commit/cancel semantics.
- [ ] Open and closed DOM inspection finds no React root below `PathInputView` or its suggestion
  popover.
- [ ] No unit tests or test harnesses are added, and this task folder remains in the tree.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/uikit/PathInput/PathInputView.tsx` | Replace the React input bridge and React popover children with `InputView` and a native suggestion `contentView`; preserve all public/model behavior. |

### Files that need no changes

| File | Reason |
|---|---|
| `src/renderer/uikit/PathInput/PathInput.tsx` | The public React face already delegates through `mountVanilla` and remains unchanged. |
| `src/renderer/uikit/PathInput/PathInputModel.ts` | Existing suggestion, keyboard, blur, selection, and ref behavior is the contract being preserved. |
| `src/renderer/uikit/PathInput/PathInput.css` | Existing styles apply to the same root and suggestion data attributes. |
| `src/renderer/uikit/Input/InputView.tsx` | Existing native input primitive already supports direct callbacks and external refs. |
| `src/renderer/uikit/Popover/PopoverView.tsx` | Existing `contentView` ownership seam is consumed, not changed. |
| `src/renderer/uikit/Autocomplete/AutocompleteView.ts` | Native content-view precedent only. |
| `src/renderer/uikit/Select/SelectView.ts` | Native append-before-return content-view precedent only. |
| `src/renderer/uikit/MultiSelect/MultiSelectView.ts` | Native append-before-return content-view precedent only. |
| `src/renderer/editors/link-editor/EditLinkDialog.tsx` | Consumer behavior remains unchanged. |
| `src/renderer/uikit/TagsInput/TagsInput.tsx` | Public consumer remains unchanged. |
| `src/renderer/uikit/TagsInput/TagsInputView.ts` | Direct consumer remains unchanged. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Story registration remains unchanged. |
| `Tests or test harnesses` | None; project rules exclude them. |
