# US-994: Retire the Storybook side-by-side preview

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-053 — De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19
**Implemented:** 2026-08-19

## Goal

Remove the paired React/vanilla preview added by US-990 and return `LivePreview` to a single
preview pane, while keeping the pane-level error boundary that US-990 introduced.

This lands **before** US-991 so the pilot is never written against the paired harness.

## Background

### Why the pane is being removed

US-990 added `Story.vanillaComponent` and a split preview so a story could show a React
implementation and a vanilla implementation side by side with one shared prop set. B5 justified it
on the grounds that side-by-side-with-identical-props is the epic's verification method, and Epic
C's for all 44 components.

That premise does not survive the conversion pattern the epic actually uses. Rule 2 requires a
converted component to keep its React-facing signature, so `PathInput.tsx` becomes a thin
`mountVanilla(PathInputView, props)` delegate. From that moment:

- the story's `component` renders the React face, which renders the vanilla view;
- the story's `vanillaComponent` renders the same vanilla view directly.

Both panes therefore produce **identical DOM from identical code**. The only difference is whether
the view was constructed by the adapter or by a vanilla parent. There is no visual or behavioural
delta to compare, and the epic's Rule 4 mutation counts would necessarily come out equal because
they would be counting the same DOM writes twice.

Nothing in Epic C changes this. A converted component replaces its React implementation rather than
keeping it, so no later conversion has a React version left to sit in the second pane either.

### What replaces it

Verification of a converted component is the ordinary story: the single pane renders the React
face, which is the vanilla view, exercised through the same props and controls as before. That is
what a production caller gets, so it is the right thing to look at.

Epic B's measured number does not depend on the split pane. It moves from *two panes at once* to
*two points in time* — measure the interaction on the React implementation before US-991's view
conversion, and on the vanilla implementation after. See US-991 for the procedure.

### Current state

`src/renderer/editors/storybook/storyTypes.ts`:

- line 2: `import type { VanillaViewCtor } from "../../uikit/shared/mount";`
- line 30: `vanillaComponent?: VanillaViewCtor<P>;`

`src/renderer/editors/storybook/LivePreview.tsx` currently:

- prepares `sharedProps`, then splits it into `reactProps` (which may receive `previewChildren`)
  and `vanillaProps`;
- returns the original single `Panel` when `story.vanillaComponent` is absent;
- otherwise returns a row split with `storybook-preview-react` and `storybook-preview-vanilla`
  panes, the vanilla one wrapped in `EditorErrorBoundary` around `mountVanilla(...)`.

No story in `ALL_STORIES` sets `vanillaComponent`, so removing the field changes no story file.

## Implementation plan

### 1. Remove the vanilla metadata field

Modify `src/renderer/editors/storybook/storyTypes.ts`:

- delete the `vanillaComponent?: VanillaViewCtor<P>` field and its doc comment;
- delete the now-unused `VanillaViewCtor` type import.

`component`, `previewChildren`, `PropDef`, `defaultProps`, and every existing story stay exactly as
they are.

### 2. Return `LivePreview` to a single pane, keeping the error boundary

Modify `src/renderer/editors/storybook/LivePreview.tsx`:

- delete the split-pane branch, both pane wrappers, and the `mountVanilla` import;
- delete `vanillaProps` and collapse `sharedProps`/`reactProps` back to one `componentProps`
  object. The two-copy split existed only to keep `previewChildren` away from a vanilla
  constructor; with no vanilla pane it has no purpose;
- keep the single `Panel` with `name="storybook-live-preview"`, `data-type="live-preview"`, `flex`,
  `overflow="auto"`, `align="center"`, `justify="center"`, `padding="xl"`, and `background`;
- **keep `EditorErrorBoundary`**, now wrapping the single `<Component {...componentProps} />`.

The result should be the pre-US-990 file plus the error boundary, and nothing else.

### 3. Do not remove the error boundary

This is the one piece of US-990 that must survive, and it matters more after US-991, not less.
Once `PathInput` is vanilla-backed, an exception thrown inside a vanilla view's `mount()` or
`update()` propagates out of `mountVanilla`'s layout effect. The only other boundary in the render
path is `AsyncEditor.tsx:58`, which wraps the whole editor — so without a preview-level boundary a
single mistake in a view under construction blanks the Storybook editor, property panel included,
and costs a reopen. Epic C's 44 conversions are developed in this harness.

Keeping it means keeping the `editors/` → `ui/app/` import that US-990 introduced. That is
currently the only import in that direction in the tree, and it is accepted deliberately rather
than by oversight. If a later task establishes a shared home for the boundary component, move it
then; do not duplicate it here.

### 4. Leave the adapters untouched

`src/renderer/uikit/shared/mount.tsx` does not change. `mountVanilla` loses its only current caller
and gains its real one in US-991, when `PathInput.tsx` delegates to it. Do not delete, deprecate, or
narrow either adapter — US-989 remains the epic's deliverable.

### 5. Verify

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- open the Storybook editor and confirm every story renders in one pane, prop editing works, the
  background control works, and switching stories is clean.

## Concerns / decisions

1. **This reverses part of B5, not all of it.** The reversed part is "the harness renders both
   versions at once" and the `vanillaComponent` field it justified. What stands is the rest of B5:
   `Story` is framework-neutral data apart from `component` and `previewChildren`, `previewChildren`
   remains React-only pending Epic C's subtree-slot question, and `LivePreview` remains the single
   render call. Record the reversal in the epic with its reason so Epic C does not rediscover the
   idea and rebuild it.

2. **US-990 is not reverted wholesale.** Its work was not wasted: it proved `mountVanilla` renders
   and disposes correctly from a React parent before any production caller depended on it, and it
   added the error boundary. Only the paired-pane surface goes.

3. **The Rule 4 measurement is unaffected.** It becomes a before/after measurement in US-991 rather
   than a simultaneous one. Two real implementations are still counted; they are simply counted at
   two points in time. No harness support is required for that.

4. **No story file changes.** No story sets `vanillaComponent`, so the field can be deleted without
   touching `storyRegistry.ts` or any `*.story.tsx`. Confirm this with a search rather than
   assuming it.

## Acceptance criteria

- [x] `Story<P>` no longer declares `vanillaComponent`, and `storyTypes.ts` no longer imports
      `VanillaViewCtor`.
- [x] `LivePreview.tsx` renders exactly one preview pane for every story, with the original
      `data-name`/`data-type`, background, alignment, padding, and overflow contract.
- [x] `EditorErrorBoundary` still wraps the rendered story component.
- [x] `LivePreview.tsx` no longer imports `mountVanilla` and no longer builds two prop objects.
- [x] `src/renderer/uikit/shared/mount.tsx`, `vanilla-view.ts`, `keyed-list.ts`, and
      `subtree-swap.ts` are unchanged; both adapters remain exported.
- [x] No story file, `storyRegistry.ts`, `ComponentBrowser.tsx`, `PropertyEditor.tsx`, or
      `StorybookEditorModel.ts` changes.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- [x] EPIC-053 records B5's partial reversal and updates the US-990/US-991 task notes and ordering.

## Files changed

| File | Change |
|---|---|
| `src/renderer/editors/storybook/storyTypes.ts` | Remove `vanillaComponent` and the `VanillaViewCtor` import |
| `src/renderer/editors/storybook/LivePreview.tsx` | Single pane, one prop object, error boundary retained |
| `doc/epics/EPIC-053.md` | Record B5's partial reversal; update task table, ordering, and notes |
| `doc/active-work.md` | Link US-994 under EPIC-053 |
| `doc/tasks/US-994-retire-side-by-side-preview/README.md` | This plan |

## Related work

- [EPIC-053 — De-React Epic B](../../epics/EPIC-053.md)
- [US-989 — `mountVanilla` / `mountReact`](../US-989-boundary-adapters/README.md)
- [US-990 — Storybook vanilla render path](../US-990-storybook-vanilla-render/README.md)
- [US-991 — PathInput pilot](../US-991-pathinput-pilot/README.md)
