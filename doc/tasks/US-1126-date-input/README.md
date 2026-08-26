# US-1126: DateInput

**Status:** Complete  
**Priority:** High  
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)  
**Created:** 2026-08-26

## Goal

Convert the `DateInput` Storybook demo to the vanilla `view` arm and preserve its controlled ISO
date behavior and displayed context. Add a compositional `DateInputView` so the deliberate
`DateInput` seam remains available for a future themed calendar, while retaining the React face
for the existing Mneme editor caller.

## Background

`src/renderer/uikit/DateInput/DateInput.tsx` is currently a thin React face that mounts
`InputView` with `type: "date"`; its public `DateInputProps` replaces the native event API with a
string `value`/`onChange` API for ISO `YYYY-MM-DD` dates. The component comment explicitly makes
the wrapper the future themed-calendar seam. `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx`
is the only remaining application caller and is outside this task's scope.

The story-local `DateInputDemo` has one `useState` value and one `useEffect` that resets it when
`initialValue` changes. Its rendered context is a column Panel containing the date input, a
`Value: ...` Text, and a light explanatory Text with an inline code element. US-1122 establishes
that this wrapper becomes a local `VanillaView`, with state as a plain field and child DOM built in
`onMount()`. `createPanelElement` and `createTextElement` preserve the existing native styling and
attributes without reintroducing React composition.

The epic's §E11-4 decision offers pointing the story directly at `InputView` or creating a
`DateInputView`, and recommends the latter. The recommendation holds against the current code:
`DateInput.tsx` is itself the adaptation boundary, so pointing the story at `InputView` would
discard that boundary and require its callers to change when a themed calendar arrives. A
`DateInputView` that owns and mounts an `InputView` child keeps the boundary in the DateInput
folder, with the exact `type: "date"` and ISO string API.

## Implementation Plan

### 1. Add the compositional vanilla face

Create `src/renderer/uikit/DateInput/DateInputView.ts` with a public constructor that creates only
the stable `display: contents` wrapper root. Set its root `data-type="date-input"`; import
`Input.css` because a direct vanilla view must load the borrowed stylesheet itself. In `onMount()`
create, claim, append, and mount one `InputView`. Convert `DateInputProps` to `InputProps` by
forwarding all allowed props and forcing `type: "date"`, `value`, and `onChange`. In `onUpdate()`
push the same converted props to the existing child. Let `VanillaView` dispose the child and clear
the field reference in `onDispose()`.

Before:

```tsx
export function DateInput({ value, onChange, ref, ...rest }: DateInputProps): React.ReactElement {
    return mountVanilla(InputView, { ...rest, ref, type: "date", value, onChange });
}
```

After:

```ts
export class DateInputView extends VanillaView<DateInputProps> {
    protected onMount(): void {
        const input = this.child(new InputView(this.inputProps(this.props)));
        this.root.append(input.root);
        input.mount();
    }

    private inputProps(props: DateInputProps): InputProps {
        return { ...props, type: "date" };
    }
}
```

### 2. Keep the React face as a single delegation

Modify `src/renderer/uikit/DateInput/DateInput.tsx` to import `DateInputView` and delegate the
unchanged `DateInputProps` object with `mountVanilla(DateInputView, props)`. Do not delete the face:
the Mneme editor still renders `<DateInput>` and must continue to receive the same native date
control and ISO callback behavior. The face becomes collectable after that editor converts in a
later Epic E task, not in US-1126.

### 3. Convert the story and invalidate the renamed importer

Rename `src/renderer/uikit/DateInput/DateInput.story.tsx` to
`src/renderer/uikit/DateInput/DateInput.story.ts`. Declare the demo `VanillaView` locally, type
the export as `Story<DemoProps>`, and replace its React state with a `value` field plus an
`initialValue` identity guard. Build the Panel, `DateInputView` child, value readout, explanatory
Text, and code node in `onMount()`; update the field, readout, and child on prop changes or input
events. The child must be claimed and mounted exactly once and owned by the demo.

Preserve `id`, `name`, `section`, every PropDef entry and value, and the absence of
`defaultProps` verbatim. Touch `src/renderer/editors/storybook/storyRegistry.ts` after the rename
so Vite drops the stale `.tsx` resolution while preserving registry order and all entries.

### 4. Verify

- Source-check the exact ISO `type: "date"` adaptation, `value`/`onChange` forwarding, controlled
  reset, value display, explanatory text, metadata, PropDefs, and caller count.
- Confirm the DateInput and demo constructors do not create or touch child DOM; all child creation
  and mounting occurs in `onMount()`.
- Confirm only the new task document, DateInput view/face/story, and story registry change.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`. Do not add tests or a harness.

## Concerns

1. **View seam:** Resolved in favor of `DateInputView`. It keeps future themed-calendar work
   localized and avoids call-site churn, while composing the existing `InputView` today.
2. **DOM shape:** The view root uses `display: contents`, so it adds no layout box; the known
   adapter-wrapper relocation is expected. The real input remains an `InputView` root with the
   same date type and native Input stylesheet.
3. **React caller lifetime:** `DateInput.tsx` must remain because
   `MnemeRootEditorView.tsx` is explicitly deferred. Its two JSX instances must compile and behave
   identically through the new delegation.
4. **Scope:** Do not edit `MnemeRootEditorView.tsx`, `doc/active-work.md`, `doc/epics/EPIC-069.md`,
   converted stories, `Panel`, `Text`, Storybook infrastructure other than the registry touch,
   tests, or a verification harness.

## Verification Results

- Source audit passed: `DateInputView` is a story-independent `VanillaView` seam that creates and
  mounts one `InputView` child in `onMount()`, forces `type: "date"`, and forwards the ISO
  `value`/`onChange` pair. The story is local, typed as `Story<DateInputDemoViewProps>`, preserves
  all metadata and PropDefs, resets controlled state on `initialValue` changes, and preserves the
  value readout and explanatory text.
- `DateInput.tsx` still has exactly one application caller file:
  `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx`. That caller was not changed; its two
  `<DateInput>` instances continue to receive the same native date control and ISO callbacks
  through the delegating face.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build-prod` — passed.

## Acceptance Criteria

- [x] `DateInputView.ts` exists as a public-constructor `VanillaView` composing one mounted
      `InputView` child, with child DOM built only in `onMount()`.
- [x] `DateInputView` preserves `type="date"`, the ISO string `value`/`onChange` API, and all
      other `DateInputProps` forwarding.
- [x] `DateInput.tsx` remains, delegates to `mountVanilla(DateInputView, props)`, and the
      `MnemeRootEditorView.tsx` caller is unchanged and compatible.
- [x] `DateInput.story.ts` is a local vanilla demo with `Story<DateInputDemoViewProps>`, preserving the Panel,
      value display, explanatory text, controlled updates, metadata, PropDefs, and defaults.
- [x] `storyRegistry.ts` is touched after the rename; registry order and unrelated entries remain
      unchanged.
- [x] Only the scoped files and this task document change; no tests, harness, dashboard/epic edit,
      commit, or unrelated UIKit face deletion is added.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.

## Files Changed Summary

| File | Change |
|---|---|
| `doc/tasks/US-1126-date-input/README.md` | Task plan, resolved seam decision, and verification record. |
| `src/renderer/uikit/DateInput/DateInputView.ts` | New vanilla DateInput seam composing `InputView`. |
| `src/renderer/uikit/DateInput/DateInput.tsx` | Delegate the React face to `DateInputView`; retain its public props. |
| `src/renderer/uikit/DateInput/DateInput.story.ts` | Story-local vanilla demo replacing the React wrapper. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Touch after the story extension rename. |
| `src/renderer/uikit/DateInput/DateInput.story.tsx` | Removed by rename. |

Files intentionally not changed: `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx`,
`doc/active-work.md`, `doc/epics/EPIC-069.md`, the 42 previously converted stories, `Panel`,
`Text`, `storyTypes.ts`, `story-props.ts`, `LivePreview.tsx`, tests, and verification harnesses.
