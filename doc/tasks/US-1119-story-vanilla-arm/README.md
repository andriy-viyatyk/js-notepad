# US-1119: Storybook vanilla arm

**Status:** Planned  
**Priority:** High  
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)  
**Created:** 2026-08-26

## Goal

Add a vanilla `VanillaViewCtor<P>` arm to the Storybook `Story` contract and make
`LivePreview` select and mount that arm when present, while preserving the current React arm.
This task also converts exactly one zero-JSX pilot story (`ProgressBar`) so the arm is exercised;
the remaining story conversions belong to later EPIC-069 tasks.

## Background

### Scope fixed by EPIC-069

US-1119 is Task 1 in [EPIC-069 §E11-7](../../epics/EPIC-069.md). The epic has already verified
the scope: there are 45 registered stories (43 `.story.tsx` files and the existing `.story.ts`
files for `Checkbox` and `Label`), and the Storybook editor currently has six non-story `.tsx`
files. The 45-story count is also confirmed by the source tree and by the 45 entries imported into
`src/renderer/editors/storybook/storyRegistry.ts`.

The two existing `.story.ts` files are not vanilla precedents. Both import a React face and assign
it to `component` (`src/renderer/uikit/Checkbox/Checkbox.story.ts:1-14` and
`src/renderer/uikit/Label/Label.story.ts:1-18`); the extension is legal only because those files
contain no JSX. There is no current vanilla Storybook story to copy.

The epic explicitly keeps `Panel` and `Text` on the React arm: neither has a vanilla twin by the
C1 decision. This task must not create `PanelView` or `TextView`, alter their stories, or delete
any React-facing UIKit file. The Storybook editor's other five `.tsx` files are US-1125 work. The
only story file this task may change is the `ProgressBar` pilot described below.

### Current contract and render path

`src/renderer/editors/storybook/storyTypes.ts:19-35` defines `Story<P>` with data fields, editable
`PropDef[]`, optional `defaultProps`, the required React
`component: React.ComponentType<P>` at line 27, and
`previewChildren?: () => React.ReactNode` at lines 32-35.

`src/renderer/editors/storybook/LivePreview.tsx:9-68` is the only Storybook render site. It:

1. subscribes to `model.state.use()` for the selected story, prop values, and preview background;
2. returns a React `Panel`/`Text` empty state if `findStory()` returns nothing;
3. copies `propValues`, deletes empty-string enum values, and injects `background` when the story
   declares it through `STORYBOOK_MANAGED_PROPS` (`LivePreview.tsx:42-46`);
4. adds `previewChildren()` only when the story has no declared `children` prop
   (`LivePreview.tsx:48-50`); and
5. renders the current React `story.component` inside `EditorErrorBoundary` at lines 63-65.

`StorybookEditorModel.selectStory()` resets `propValues` to `buildInitialProps(story)`
(`src/renderer/editors/storybook/StorybookEditorModel.ts:39-47,59-67`), so a story switch supplies
the new view with the new story's initial values. `PropertyEditor.tsx:108-155` changes only values
whose names are in `story.props`; it does not need a new arm-specific path in this task.

The existing `src/renderer/uikit/shared/mount.tsx:5` contract is:

```ts
export type VanillaViewCtor<P> = new (props: P) => VanillaView<P>;
```

It requires a public constructor. `mountVanilla()` is the blessed React boundary: its stable,
module-scope `VanillaHost` (`mount.tsx:13-16`) owns constructor-keyed layout-effect mounting,
the initial-update guard, and disposal/detachment (`mount.tsx:17-88`). US-1119 must consume that
adapter rather than duplicate its lifecycle in `LivePreview`. `LivePreview` remains a React file;
US-1125 owns conversion of the Storybook editor around it.

### Vanilla lifecycle facts that constrain this task

The lifecycle in `src/renderer/uikit/shared/vanilla-view.ts` is explicit:

- the protected constructor creates only a detached root and stores props (`:49-52`);
- `mount()` marks the view mounted, calls `onMount()`, and returns the root (`:55-66`);
- `update()` stores props and calls `onUpdate()` only after mount (`:71-77`);
- `dispose()` disposes children and registered resources but deliberately does not remove the root
  (`:90-125`); the owner must detach it; and
- `bind()` is a three-argument, mount-or-later operation that applies the current value before
  subscribing and registers the unsubscribe through `own()` (`:197-216`). `own()` only appends to
  the disposer list (`:129-132`); there is no early-release API for subscriptions.

`mountVanilla` therefore already owns the required ordering: append the view root, call `mount()`,
forward later props through `update()`, and on constructor replacement call `dispose()` before
removing the outgoing root. Do not use `bind()` once per selected story; the React
`model.state.use()` already drives the adapter, and a per-selection vanilla binding would stack
subscriptions that cannot be released early.

### The slot rule and the one current provider

`rg` over all current story files finds exactly one `previewChildren` provider:
`src/renderer/uikit/Panel/Panel.story.tsx:53-59`. It returns a React `Fragment` containing four
`span` elements, including the `[hover-revealed]` span with
`data-visibility="parent-hover"`. No current provider returns an array.

The future vanilla field must be `previewChildren?: () => Node`, scoped to the vanilla Story arm
so a React story continues to return `React.ReactNode`. The current Panel provider remains
unchanged in US-1119 because Panel remains React. When a later vanilla container story needs the
same shape, its provider must return one persistent `HTMLElement` wrapper with
`display: contents`, containing the sibling elements. It must never return a `DocumentFragment` to
a slot.

That requirement is verified against `src/renderer/uikit/shared/fill-slot.ts:83-137`: for a native
slot it executes `host.append(slot as Node)` at line 137, and a fragment is emptied by the first
append. Slots are refilled unconditionally, as the `fillSlot()` calls in
`src/renderer/editors/base/PageToolbarView.ts:420-427` demonstrate. A persistent element wrapper
survives the second fill. The wrapper must be created once for the view/provider lifetime, not
recreated as a fresh node on each prop update.

### Error handling decision

`src/renderer/ui/app/EditorErrorBoundary.tsx:7-25` is load-bearing for the current React arm: a
descendant story render failure becomes an “Editor crashed” message instead of blanking the
preview. Keep that boundary around the React component exactly as the compatibility arm needs it.

For the vanilla arm, render `mountVanilla(story.view, vanillaProps)` inside a keyed
`EditorErrorBoundary`, with the boundary key set to `story.id`. `VanillaHost` already catches
mount failures, disposes and detaches failed views, forwards updates, and rethrows into the React
boundary (`src/renderer/uikit/shared/mount.tsx:17-88`). The `story.id` key is essential because
`EditorErrorBoundary` stores its error forever once `getDerivedStateFromError` runs
(`src/renderer/ui/app/EditorErrorBoundary.tsx:8-27`): a story switch gets a fresh boundary, while
a property edit keeps the existing view and boundary. This key is on the error boundary, not the
view host; keying the host on props would remount on every property edit.

The epic's synchronous-vanilla reasoning remains correct but is not needed as a second lifecycle
implementation. A `try/catch` around `new ctor(props)`, `view.mount()`, and `view.update(props)`
would be equivalent here because the caller owns those synchronous calls, unlike a catch around
`mountReact`, which cannot catch descendant React render failures. The blessed adapter already
rethrows the lifecycle failure at the React commit boundary, where `EditorErrorBoundary` can show
the existing “Editor crashed” state. No new error renderer is needed. Any new catch added around
adapter usage must use `errMessage(e, fallback?)` from `src/shared/utils.ts:12-22`.

### Unknown and ignored props decision

The typed answer belongs in the contract: make `PropDef` generic (`PropDef<P>`) and type every
definition name as `keyof P & string`. `Story<P>` then uses `props: PropDef<P>[]`. A converted story
should adopt its concrete component/view props type, such as `ProgressBarProps`, so a control name
that is not part of `P` fails at the declaration site. Current stories intentionally use bare
`Story` with the default `P = Record<string, unknown>` (`src/renderer/uikit/Checkbox/Checkbox.story.ts:4`),
so `keyof P` is currently just `string`; US-1120 onward adopts concrete `P` one story at a time.

As a planning probe, this generic change was applied temporarily to `storyTypes.ts` and
`npm run typecheck` was run before restoring the file. It reported zero current story failures.
That result is not an implementation change: current bare `Story` declarations remain permissive;
the concrete generic is adopted as each story converts, and any future failure identifies a bogus
control declaration to fix.

The implementation may retain a defensive runtime check for keys that still appear in
`componentProps`, but it must not replace the preview. An unexpected key should produce a
`console.warn` naming the key and the story, then the preview should render anyway. The normal key
set is already produced by `buildInitialProps()` and the model reset on selection
(`src/renderer/editors/storybook/StorybookEditorModel.ts:58-64`), plus intentionally supplied
`defaultProps`, managed `background`, and generated `children`. `defaultProps` must remain allowed
because `src/renderer/uikit/Checkbox/Checkbox.story.ts:14-16` supplies an `onChange` callback that
is not an editable `PropDef`.

An ignored declared prop is not converted into a thrown runtime error. The generic `VanillaView<P>`
contract cannot detect that centrally: `P` is erased and `update()` returns `void`
(`vanilla-view.ts:71-77`). The concrete `Story<P>` typing catches the declaration mismatch; the
manual property sweep remains the behavioral check that a converted view actually applies every
control. This avoids making a cosmetic gap fatal inside a visual harness while still making the
typed story declaration honest.

### Baseline that cannot be recovered later

The epic's verified concern 1 says to capture the React implementation before any story converts.
The baseline is DOM, not a screenshot and not a whole-app React-root count. The Persephone MCP
server is disconnected in this session, so the procedure below is recorded but not run.

Run it immediately before US-1120 starts, against the same build and a stable app window:

1. Use `browser_snapshot({ pageId: "app" })` and click the Storybook tool, then wait for
   `[data-name="storybook-component-list"]` and
   `[data-name="storybook-live-preview"]`. The Storybook tool is registered by
   `src/renderer/ui/sidebar/tools-editors-registry.ts:171-175` and opens the singleton through
   `PagesLifecycleModel.showStorybookPage()` at `src/renderer/api/pages/PagesLifecycleModel.ts:792-795`.
2. Set the Storybook background to `light` if it is not already light. Do not edit any property
   controls, hover a story, open an overlay, or click inside the preview. Each story selection must
   start from the model's reset values; `selectStory()` performs that reset.
3. Take a fresh app snapshot before each click. Use the component-browser row ref for the next
   story in registry order; the driver supplies the story `id` from that order, so do not read the
   selected story back from the DOM. Refs can become stale after selection, so never reuse an old
   ref. After each click, wait for the preview to settle (use `browser_wait_for` selector/time as
   needed; at least one render turn for React state and effects).
4. Immediately after each selection, run `browser_evaluate` against `pageId: "app"` with this
   function and save its returned object as one JSON record, using the driver's already-known story
   `id` and name as metadata:

   ```js
   () => {
       const preview = document.querySelector('[data-name="storybook-live-preview"]');
       if (!preview) throw new Error("Storybook preview is unavailable");
       return {
           previewOuterHTML: preview.outerHTML,
       };
   }
   ```

   Save each record under `doc/tasks/US-1119-story-vanilla-arm/baseline/` as
   `<ordinal>-<story-id>.json`, adding the known registry `id`, source extension, and capture
   timestamp outside the evaluated object. `previewOuterHTML` is the authoritative “before” DOM,
   including adapter hosts and the actual component descendants. Preserve records even if a story
   currently shows an error; record the visible error as part of that story's DOM rather than
   silently omitting it.
5. Verify that all 45 records exist, including `Panel`, `Text`, `Checkbox`, and `Label`. Do not
   query the virtualized component-browser row to identify the selected story; the driver already
   knows the id. Do not replace the records with `browser_snapshot` output: the accessibility tree
   omits some DOM and `textContent` includes hidden subtrees. Do not run the procedure in this
   session; the required MCP connection is unavailable.

## Implementation Plan

### 1. Make `Story` a type-level one-of union

Modify `src/renderer/editors/storybook/storyTypes.ts`:

- import `VanillaViewCtor` as a type from `../../uikit/shared/mount`;
- make `PropDef` generic with `P = Record<string, unknown>` and type every variant's `name` as
  `keyof P & string`;
- factor the common metadata (`id`, `name`, `section`, `props`, and `defaultProps`) into a shared
  base type if useful;
- define a React arm with required `component: React.ComponentType<P>`, forbidden `view?: never`,
  and `previewChildren?: () => React.ReactNode`;
- define a vanilla arm with required `view: VanillaViewCtor<P>`, forbidden `component?: never`,
  and `previewChildren?: () => Node`; and
- export `Story<P>` as the union of those two arms, preserving the existing default generic and
  using `props: PropDef<P>[]`.

This is the chosen discriminated/one-of design. Exactly one arm is required for typed story
definitions, so future conversion removes `component` when adding `view`; it never keeps two
parallel implementations in one story object. Existing React stories remain valid without edits,
and future vanilla stories can be `.story.ts` files without importing React merely for the
contract.

The runtime registry can still contain malformed values because existing stories use declaration
casts such as `component: Panel as any`. `LivePreview` must therefore check the actual values too:
neither arm and both arms are invalid configuration, neither is a fallback to an empty preview,
and both must not silently prefer `view`. Surface either case in the same preview error state.

Before → after contract shape:

```ts
// Current: every Story must have the React arm.
component: React.ComponentType<P>;
previewChildren?: () => React.ReactNode;

// Planned: exactly one arm; the child callback follows that arm.
type Story<P> =
    | {
        /* common fields */
        props: PropDef<P>[];
        component: React.ComponentType<P>;
        view?: never;
        previewChildren?: () => React.ReactNode;
      }
    | {
        /* common fields */
        props: PropDef<P>[];
        component?: never;
        view: VanillaViewCtor<P>;
        previewChildren?: () => Node;
      };
```

### 2. Keep one prop-preparation path and select the arm in `LivePreview`

Modify `src/renderer/editors/storybook/LivePreview.tsx` while keeping the file `.tsx` and keeping
the outer React `Panel` layout and the React `EditorErrorBoundary` path:

1. Preserve missing-story handling and the existing cleanup of empty enum values.
2. Preserve managed-value injection. If a defensive runtime scan finds a key outside the prepared
   story set, warn with the story id and key but continue rendering; the typed `PropDef<P>` check,
   not a runtime gate, is the contract enforcement.
3. For a React arm, keep the current `{...componentProps}` render inside `EditorErrorBoundary`, and
   add React `previewChildren` exactly as today.
4. For a vanilla arm, call its `previewChildren()` only when there is no declared `children` prop,
   put the returned `Node` in the vanilla props copy, and never pass a React node to the constructor.
5. Render the vanilla arm through the existing `mountVanilla(story.view, vanillaProps)` boundary,
   inside an `EditorErrorBoundary` keyed by `story.id`. Do not create a local host, constructor,
   layout effect, update guard, or disposal path in `LivePreview`; the audited module-scope
   `VanillaHost` owns those details (`src/renderer/uikit/shared/mount.tsx:13-88`).
6. Keep the boundary key tied only to story identity. A story change must create a fresh boundary so
   a prior lifecycle error cannot poison the next story; an ordinary prop/background update must
   retain the same boundary and let `VanillaHost` call `view.update(props)`. This is not a changing
   key on the view host and must not remount on every property edit.

The render shape changes from:

```tsx
<EditorErrorBoundary>
    <Component {...componentProps} />
</EditorErrorBoundary>
```

to the arm-specific behavior:

```tsx
// React arm: unchanged compatibility boundary, reset per story.
<EditorErrorBoundary key={story.id}><Component {...reactProps} /></EditorErrorBoundary>

// Vanilla arm: the audited boundary owns the native lifecycle.
<EditorErrorBoundary key={story.id}>
    {mountVanilla(story.view, vanillaProps)}
</EditorErrorBoundary>
```

Do not use a changing React `key` as the lifecycle mechanism, do not leave the outgoing view
mounted, and do not create a `VanillaView` in render. The host must append before mounting because
future views may measure their attached root; a view that measures itself must not use a
`display: contents` root. This task does not add a `bind()` subscription or a Storybook-specific
model.

### 3. Preserve the future `previewChildren` migration shape

The current Panel story has no change in US-1119; the ProgressBar pilot has no children provider.
Record the following contract for US-1120 onward:

```ts
// Current Panel story; remains React-only in this task.
previewChildren: () => React.createElement(React.Fragment, null, childA, childB),

// Future vanilla story counterpart; the slot receives an element, never a fragment.
let childrenRoot: HTMLSpanElement | undefined;
previewChildren: () => {
    if (!childrenRoot) {
        childrenRoot = document.createElement("span");
        childrenRoot.style.display = "contents";
        childrenRoot.append(childA, childB);
    }
    return childrenRoot;
},
```

The future provider must preserve the four Panel demo spans and the
`data-visibility="parent-hover"` hook. `fillSlot()` must receive the persistent wrapper element;
never pass a `DocumentFragment`, even when multiple sibling nodes are needed. If a later view
needs to refill the slot, reuse the same element and let `fillSlot()` own the host transition.

### 4. Exercise the arm with the ProgressBar pilot

Convert exactly one story in this task: `src/renderer/uikit/ProgressBar/ProgressBar.story.tsx`.
It is a 17-line, zero-JSX story, and `src/renderer/uikit/ProgressBar/ProgressBarView.tsx` already
provides the vanilla constructor. Change the story to use the typed `ProgressBarProps` generic,
point `view` at `ProgressBarView`, remove its React `component` arm, and preserve all six declared
controls. `value` must be changed through the property editor and observed updating the existing
fill; the pilot is specifically the first committed proof that prop updates do not remount.

Before implementing the pilot, capture the 45-story React DOM baseline above. After the pilot,
manually sweep its controls, switch away and back, and verify the view root and any listeners are
not duplicated. Then run `npm run typecheck` and `npm run lint`. Do not add a unit test or test
harness. US-1120 owns the remaining nine zero-JSX stories in the epic's pilot batch; `Panel` remains
the deliberate React survivor, so its story is not converted. The EPIC-069 Task 2 description must
be read with this sequencing correction when that task begins.

## Concerns / Decisions

1. **Exactly one Story arm — resolved.** Use the discriminated one-of union. The current contract
   has a required React `component` and no vanilla arm; a union lets existing stories compile while
   making each future conversion an explicit arm replacement. Runtime checks remain necessary for
   casted registry data: neither and both are configuration errors shown in the preview.

2. **Unknown and ignored props — resolved.** `PropDef<P>` names are typed as `keyof P & string`,
   catching a control/component mismatch when a converting story adopts its concrete props type.
   Current bare `Story` declarations remain permissive because their default `P` is
   `Record<string, unknown>`. A defensive runtime scan may warn about an unexpected key, but must
   still render the preview. An ignored declared prop is checked behaviorally by the manual sweep;
   it is not turned into a fatal runtime throw inside this visual harness.

3. **Error boundary — resolved.** Retain `EditorErrorBoundary` for both arms, keying it by
   `story.id` so a throwing story cannot poison later selections. `mountVanilla` already rethrows
   synchronous lifecycle failures into that boundary, so no local catch or duplicate lifecycle is
   needed. A synchronous native constructor, mount, or update could be caught equivalently here
   because this caller owns it; the ledger's non-equivalence warning remains correct for descendant
   React rendering failures. The catch is simply unnecessary when the audited adapter is used.

4. **`previewChildren` — resolved for the contract, deferred for providers.** The union gives the
   React arm `() => React.ReactNode` and the vanilla arm `() => Node`. The only current provider is
   Panel's React fragment and it is unchanged. Future vanilla providers return a persistent
   `display: contents` element, never a `DocumentFragment`, because `fillSlot` appends and slots
   refill unconditionally.

5. **Persistent children and disposal — resolved.** A native preview is not allowed to leave an
   inactive story mounted. Story selection disposes the outgoing view and detaches its root before
   mounting the replacement, so timers, observers, media, and overlay ownership cannot survive a
   switch. This is the same persistent-child consequence recorded after EPIC-068.

6. **Pilot sequencing — resolved.** US-1119 converts exactly
   `src/renderer/uikit/ProgressBar/ProgressBar.story.tsx` to the existing `ProgressBarView`, using
   concrete `ProgressBarProps`. This exercises the new arm and its `value` update path without a
   test harness. US-1120 owns the remaining nine zero-JSX files in the pilot batch, with `Panel`
   deliberately remaining React; this sequencing must be reconciled with EPIC-069 Task 2.

7. **Stale Vite specifier — recorded for US-1120+.** A `.tsx` → `.ts` story rename leaves Vite
   resolving the stale extensionless importer until the importer is touched. The importer is
   `src/renderer/editors/storybook/storyRegistry.ts`, which imports all stories. US-1120 must touch
   that importer after the story renames; `build-prod` is unaffected. US-1119 renames none.

8. **Ported derivations and state subscriptions — recorded.** US-1119 ports no `useMemo` or
   `useCallback` and does not introduce a vanilla `bind()`. Future story/view ports must verify
   that every derivation has a live caller, and a service subscription beside a React hook must
   share one projection with that hook. A state source that changes over a view's life needs a
   replaceable subscription field with both subscribe and immediate-apply halves; `own()` is not
   an early-release mechanism.

9. **Measuring stories and layout — recorded for US-1123.** `LivePreview`'s outer Panel currently
   uses `align="center" justify="center"` on **both** of its panels — the empty state at
   `LivePreview.tsx:15-27` (align/justify at `:20-21`) and, the one that matters here, the
   story-hosting panel at `:53-66` (align/justify at `:58-59`). A future measuring view such as
   `Tree`, `DataGrid`, `VirtualGrid`, `ImageViewport`, or `Minimap` can therefore receive a
   shrink-to-fit centered flex item. That compounds with the standing rule that a
   `display: contents` element has no box and cannot fire `ResizeObserver`; US-1123 must explicitly
   choose an attached measurable root/layout host before relying on measurements.

10. **Scope remains narrow.** `Panel.tsx`, `Text.tsx`, all stories other than the ProgressBar
   pilot, the five other
   Storybook-editor `.tsx` files, `EditorErrorBoundary.tsx`, `vanilla-view.ts`, `fill-slot.ts`,
   `PageToolbarView.ts`, and `storyRegistry.ts` are not implementation targets in US-1119. The
   existing dashboard entry is already present under EPIC-069 and is intentionally not edited.

## Acceptance Criteria

- [ ] `Story<P>` has a required React arm or a required vanilla `view: VanillaViewCtor<P>` arm,
      never neither or both at the type level.
- [ ] `PropDef<P>` uses `name: keyof P & string`; concrete props adoption is documented as
      per-story work for US-1120 onward.
- [ ] `previewChildren` is React-node typed only on the React arm and `Node` typed only on the
      vanilla arm; no current provider is changed.
- [ ] Runtime malformed stories declaring neither or both arms render a visible configuration
      error instead of selecting an arbitrary arm or blanking the preview.
- [ ] `LivePreview.tsx` prefers `view` when present through `mountVanilla`, and otherwise preserves
      the current React `EditorErrorBoundary` render path.
- [ ] `EditorErrorBoundary` is keyed by `story.id`, so story changes reset a prior error while
      property edits do not remount the vanilla view.
- [ ] `mountVanilla` owns constructor, append/mount, update, disposal, and detachment; no duplicate
      lifecycle implementation exists in `LivePreview.tsx`.
- [ ] Constructor, mount, update, and disposal failures reach the keyed existing error boundary;
      no new pane error renderer or local lifecycle catch is introduced.
- [ ] Unexpected runtime keys produce a named `console.warn` and the preview still renders, while
      intentional `defaultProps` callback keys remain allowed.
- [ ] The ProgressBar pilot uses concrete `ProgressBarProps`, removes its React arm, points at
      `ProgressBarView`, and proves its `value` control updates without remounting.
- [ ] No `DocumentFragment` is passed to a slot; the future vanilla counterpart is documented as a
      persistent `display: contents` element.
- [ ] Only `ProgressBar.story.tsx` is converted; no story is renamed; `Panel` and `Text` receive no
      vanilla twin; no other Storybook editor file changes.
- [ ] The 45-record DOM baseline procedure is documented and remains unrun in this session because
      the Persephone MCP server is disconnected.
- [ ] No unit tests, test harnesses, dashboard edits, commits, or unrelated UIKit React-face
      deletions are introduced.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/editors/storybook/storyTypes.ts` | Add `VanillaViewCtor` and the exactly-one-arm `Story` union; make `previewChildren` arm-specific. |
| `src/renderer/editors/storybook/LivePreview.tsx` | Validate prepared props, prefer the vanilla arm through `mountVanilla`, and retain the keyed React error boundary. |
| `doc/tasks/US-1119-story-vanilla-arm/README.md` | This investigation, decisions, implementation plan, and unrecoverable baseline procedure. |
| `src/renderer/editors/storybook/storyRegistry.ts` | **No change in US-1119.** Touch after future `.tsx` → `.ts` story renames in US-1120+. |
| `src/renderer/editors/storybook/StorybookEditorModel.ts` | **No change.** Existing story selection resets initial props. |
| `src/renderer/editors/storybook/PropertyEditor.tsx` | **No change.** Existing declared controls continue to write `propValues`. |
| `src/renderer/editors/storybook/ComponentBrowser.tsx` | **No change.** Existing 45-story browser remains the baseline driver. |
| `src/renderer/editors/storybook/StorybookEditorView.tsx` | **No change.** The editor remains React until US-1125. |
| `src/renderer/uikit/shared/vanilla-view.ts` | **No change.** Consume its existing lifecycle; do not add a binding release API or prop schema here. |
| `src/renderer/uikit/shared/fill-slot.ts` | **No change.** Its append/refill behavior is the reason future providers must return persistent elements. |
| `src/renderer/editors/base/PageToolbarView.ts` | **No change.** Its unconditional slot refill is the verified standing pattern. |
| `src/renderer/ui/app/EditorErrorBoundary.tsx` | **No change.** Retained and keyed by story identity for both story arms. |
| `src/renderer/uikit/Panel/Panel.tsx` and `src/renderer/uikit/Text/Text.tsx` | **No change.** Neither receives a vanilla twin. |
| `src/renderer/uikit/ProgressBar/ProgressBar.story.tsx` | Convert the one zero-JSX pilot to `Story<ProgressBarProps>` with `view: ProgressBarView`. |
| `src/renderer/uikit/Panel/Panel.story.tsx` and all other story files | **No change.** US-1119 converts no story other than the ProgressBar pilot. |
| `doc/active-work.md` and `doc/epics/EPIC-069.md` | **No change.** The dashboard entry and authoritative epic task table already exist. |
