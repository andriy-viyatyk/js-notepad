# US-1180 — remove storybook's React arm

**Epic:** [EPIC-074 — De-React Epic F: React confined](../../epics/EPIC-074.md) (task F-g)
**Status:** Ready to implement
**Created:** 2026-08-28

## Goal

Delete the `component:` (React) arm of the storybook story contract and the five files that exist
only to feed it. `Story<P>` collapses from a two-arm discriminated union to a single shape, and the
storybook's React root disappears.

## Background — this is dead weight, not a capability

**Storybook does not need React.** The arm exists because two uikit components were never converted,
and it is a closed loop with nothing outside it: `Panel.story.tsx` exists to demo `Panel.tsx`;
`Panel.tsx` survives because a story renders it; `LivePreview`'s `component:` path exists because
those two stories use it; `EditorErrorBoundary.tsx` exists because `LivePreview` wraps React stories
in it; and `mountReactHandle` keeps a React root inside `uikit/` because `LivePreview` calls it.

**`Panel` and `Text` have zero application consumers.** They are reachable only through
`uikit/index.ts` (`:12-13`, `:34-35`) and their own stories. Their real implementations were never
React: `Panel/panel-style.ts` (349 lines, `createPanelElement`) has **~150 consumers** and
`Text/text-style.ts` (`createTextElement`) has **~120**, all importing the style module by direct
path, never through the barrel. `Panel.tsx` (152 lines) and `Text.tsx` (65) destructure props and
hand them to those same native resolvers.

`Panel.tsx:11-14` already documents itself as terminal:

> *"Legacy, app-facing React layout shim. New vanilla views should use their own semantic container
> and stylesheet rather than introducing a vanilla Panel abstraction."*

So **no vanilla `Panel`/`Text` replacement is to be written** — that is the standing guidance, not an
omission. Deleting these faces creates no follow-on work and lowers no component count; they were
never live components.

**Nobody authors React stories:** 43 stories are `.story.ts` using the `view:` arm; **2** are
`.story.tsx`, and they are these two components' own.

## Implementation plan

### Step 1 — collapse the story contract in `src/renderer/editors/storybook/storyTypes.ts`

Replace the two-arm union (`:38-50`) with the single vanilla shape. Before:

```ts
export type Story<P = Record<string, unknown>> =
    | (StoryBase<P> & { component: ComponentType<P>; view?: never; previewChildren?: () => ReactNode })
    | (StoryBase<P> & { component?: never; view: VanillaViewCtor<P>; previewChildren?: () => Node });
```

After — one shape, no union:

```ts
export interface Story<P = Record<string, unknown>> extends StoryBase<P> {
    /** The vanilla view constructor to render. */
    view: VanillaViewCtor<P>;
    /** Optional sample children for layout containers. */
    previewChildren?: () => Node;
}
```

Drop `import type { ComponentType, ReactNode } from "react"` (`:1`) entirely. **Keep**
`VanillaViewCtor` (`:2`), `STORYBOOK_MANAGED_PROPS`, `PropDef`, `IconPresetId`, `StoryBase` and
`AnyStory` unchanged — including `AnyStory`'s `no-explicit-any` suppression and its comment, which
is still accurate (the registry is still heterogeneous and still invariant in `P`).

**`previewChildren` stays.** It is not React-only: `uikit/SelectableRow/SelectableRow.story.ts` uses
it, and `story-props.ts:42-44` calls it. Only its `ReactNode` return arm goes.

### Step 2 — strip the React path from `src/renderer/editors/storybook/LivePreview.ts`

Remove:

- `import React from "react"` (`:1`) and `import { EditorErrorBoundary } …` (`:2`)
- `mountReactHandle` and `MountedReactRoot` from the `:4` import — **keep `VanillaView` from
  `"../../uikit/shared/vanilla-view"` (`:5`)**, and keep `createPanelElement` / `createTextElement`
- `hasStoryComponent()` (`:42-44`)
- the `reactHost` and `reactHandle` fields (`:56-57` area)
- `mountReactStory()` (`:161-173`) and `reactElement()` (`:175-183`)
- the `"react"` member of `type PreviewArm` (`:13`), leaving `"vanilla" | "error"`
- the react branch in `clearActiveContent()` (`:216+`) that disposes the handle and removes the host

Simplify the arm-selection block (`:94-125`). The old logic validated *exactly one of* `component`
or `view` via `component === view`; with one arm the check becomes a missing-`view` guard. Keep the
error message informative — a story object arriving without `view` is now a malformed story, so
something like `Story "<id>" must declare a view.` and route it through the existing
`replaceWithMessage`. Then `nextArm` is always `"vanilla"` and the `if/else` around
`mountVanillaStory` / `mountReactStory` collapses to the vanilla call.

**Preserve the existing error-handling structure.** `clearActiveContent()` returns a cleanup error
that every caller threads into `showError`, and the `arm = "error"` short-circuit at `:110` prevents
re-entrant rebuilds. Do not restructure that; only remove the react limb.

### Step 3 — delete five files

| File | Note |
|---|---|
| `src/renderer/uikit/Panel/Panel.story.tsx` | the only user of `React.Fragment` in the codebase (`:53`) |
| `src/renderer/uikit/Text/Text.story.tsx` | — |
| `src/renderer/uikit/Panel/Panel.tsx` | 152 lines |
| `src/renderer/uikit/Text/Text.tsx` | 65 lines; **it re-exports types from `text-style`** (`:8`) — see step 4 |
| `src/renderer/ui/app/EditorErrorBoundary.tsx` | 29 lines; only consumer is `LivePreview` |

### Step 4 — barrels

`src/renderer/uikit/Panel/index.ts` and `src/renderer/uikit/Text/index.ts` export **only** the
deleted faces, so both files become empty — **delete them both.** No consumer imports through
either barrel; every `panel-style` / `text-style` consumer uses the direct path.

Then in `src/renderer/uikit/index.ts` delete lines `12`, `13`, `34` and `35`
(`Panel`, `PanelProps`, `Text`, `TextProps`).

**Check before deleting `Text.tsx`:** `Text.tsx:8` re-exports `TextColor`, `TextElementAttributes`,
`TextSize`, `TextStyleProps`, `TextVariant` from `./text-style`. Those types are declared in
`text-style.ts` and consumers should already import them from there — verify with a grep, and if any
file reaches them through `Text` or the `uikit` barrel, repoint it to `./Text/text-style` rather than
keeping the face alive.

### Step 5 — story registry

In `src/renderer/editors/storybook/storyRegistry.ts` remove the `panelStory` import (`:12`), the
`textStory` import (`:27`), and both identifiers from the arrays at `:68` and `:70`.

### Step 6 — the error-boundary CSS stays, but rename it

`src/renderer/ui/app/EditorErrorBoundary.css` is imported by
`src/renderer/ui/app/NativeEditorErrorView.ts:3`, which is the **live** native error surface — so the
stylesheet must not be deleted. With the boundary gone the filename is misleading: rename it to
`NativeEditorErrorView.css` and update that one import. Do not change any rule inside it.

## Files that need NO changes

- `src/renderer/uikit/Panel/panel-style.ts`, `Panel.css`, `Text/text-style.ts`, `Text.css` — the real
  implementations, with ~150 and ~120 consumers. **Do not touch these.**
- `src/renderer/ui/app/NativeEditorErrorView.ts` — only its CSS import path changes (step 6).
- `src/renderer/editors/storybook/story-props.ts` — `previewChildren` survives; its only mentions of
  "component" (`:27`, `:33`) are prose about story-declared props, not the React arm.
- The other 43 `*.story.ts` files — all already on the `view:` arm.
- `src/renderer/uikit/shared/mount.tsx` — `mountReactHandle` stays here; F-h moves it.

## Concerns

1. **`Story` stops being a union, which changes how it type-checks.** Any story object that relied on
   the union's `component?: never` exclusivity now just fails to supply `view`. Confirm `typecheck`
   surfaces a clear error for a malformed story rather than silently widening — if `AnyStory`'s `any`
   parameter swallows it, note that in the reply rather than working around it.
2. **`previewChildren` must keep working for `SelectableRow.story.ts`.** Verify that story still
   renders its sample children, not just that it compiles.
3. **Do not write a vanilla `Panel` or `Text`.** Explicitly out of scope per `Panel.tsx:11-14`.
   If a story or view seems to need one, use a semantic container plus `createPanelElement`.
4. **This removes storybook's ability to render React stories permanently.** That is intended and
   decided (EPIC-074 F-5, decision 1). Do not leave a stub, a commented-out branch, or a TODO.

## Acceptance criteria

1. The five files in step 3 and the two barrels in step 4 are deleted.
2. `grep -rn "from \"react\"" src/renderer/editors/storybook/ src/renderer/uikit/Panel/ src/renderer/uikit/Text/ src/renderer/ui/app/` returns nothing.
3. `find src -name '*.story.tsx'` returns nothing; `find src/renderer/uikit -name '*.tsx'` returns
   only `shared/mount.tsx`.
4. `storyTypes.ts` imports no React and `Story` is a single interface.
5. `npm run typecheck`, `npm run lint`, `npm run build-prod` all pass.
6. **Presence checks:**
   - Open the storybook editor. The component browser lists stories, and **41 remain** after the two
     React ones are gone (43 `view:` stories today, minus none — confirm the actual count and report
     it rather than asserting mine).
   - Select at least three stories including `SelectableRow` (for `previewChildren`) and confirm each
     renders a live preview, not an error message.
   - Trigger the malformed-story path is **not** required, but confirm the "Select a component"
     initial message still appears before any selection.
   - `document.querySelectorAll("[data-react-root]").length` is **0** with the storybook open.
   - An editor that fails to load still shows the native error surface (`NativeEditorErrorView`) with
     its styling intact after the CSS rename.

## Files changed

| File | Change |
|---|---|
| `editors/storybook/storyTypes.ts` | union collapsed to one interface; React imports dropped |
| `editors/storybook/LivePreview.ts` | React arm, host, handle, two methods and the `"react"` arm removed |
| `editors/storybook/storyRegistry.ts` | two imports and two array entries removed |
| `uikit/Panel/Panel.tsx`, `Panel.story.tsx`, `index.ts` | deleted |
| `uikit/Text/Text.tsx`, `Text.story.tsx`, `index.ts` | deleted |
| `ui/app/EditorErrorBoundary.tsx` | deleted |
| `ui/app/EditorErrorBoundary.css` → `NativeEditorErrorView.css` | renamed; one import updated |
| `uikit/index.ts` | four export lines removed |
