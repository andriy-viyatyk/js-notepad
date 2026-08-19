# US-990: Storybook vanilla render path

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-053 - De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19

## Goal

Teach the Storybook editor to render an optional vanilla view beside its existing React story
using `mountVanilla`. A story continues to have one shared set of editable props; when it supplies
both implementations, the harness shows the two component roots side by side for visual and DOM
parity checks.

This task changes only the Storybook metadata and preview. It does not convert a production
component or add a vanilla story implementation; the first real paired story is the US-991
PathInput pilot.

## Background

### Current Storybook surface

`src/renderer/editors/storybook/storyTypes.ts` defines `Story<P>` with mostly framework-neutral
data:

- `id`, `name`, `section`;
- the serializable `PropDef` union;
- `defaultProps`.

The two React-shaped fields are `component: React.ComponentType<P>` and
`previewChildren?: () => React.ReactNode`. There are 39 registered stories in
`storyRegistry.ts`; no story currently has a vanilla implementation, and only
`Panel.story.tsx` uses `previewChildren`.

`LivePreview.tsx` has the only Storybook render call. It reads `propValues` and the selected story,
removes empty enum values, injects managed `background`, optionally builds React preview children,
and renders the story component inside the preview panel.

US-989 established the direct boundary import:

```ts
mountVanilla(ctor, props)
```

`mountVanilla` owns a stable module-level React host component, constructs the vanilla view only in
a committed layout effect, forwards committed props through `update`, and replaces a view when
the constructor identity changes. The Storybook preview must consume that contract rather than
duplicating lifecycle or DOM ownership logic.

### Fixed metadata shape

Do not widen `component` into a union. A union can render only one implementation, while the
purpose of this harness is side-by-side comparison. Add a second optional field:

```ts
/** Vanilla view constructor for the same component. When present, the preview
 * renders it beside the React version with the same editable props. */
vanillaComponent?: VanillaViewCtor<P>;
```

`VanillaViewCtor<P>` is imported as a type from `uikit/shared/mount`. Concrete vanilla views must
follow US-989's public-constructor contract. Because `Story` defaults to
`P = Record<string, unknown>` and construct-signature parameters are contravariant under
`strictFunctionTypes`, a concrete props constructor will generally need a declaration-site cast
when the story is written. The existing React story pattern is the model:

```ts
component: PathInputDemo as React.ComponentType<Record<string, unknown>>,
vanillaComponent: PathInputView as VanillaViewCtor<Record<string, unknown>>,
```

The cast should use a local demo/view props alias so the two types remain comparable. If a concrete
view props interface is not comparable to the broad story record (for example, an interface based
on `React.HTMLAttributes`), use `as unknown as VanillaViewCtor<Record<string, unknown>>`, never
`as any`. `VanillaViewCtor` itself remains strict.

`previewChildren` remains React-only. It is a temporary compatibility boundary for rich subtree
content, which Epic P D4 defers to Epic C. The first paired stories are leaf or self-contained
components and must not rely on `previewChildren` to construct the vanilla side.

## Implementation plan

### 1. Add the optional vanilla constructor to Story metadata

Modify `src/renderer/editors/storybook/storyTypes.ts`:

- import `VanillaViewCtor` from `../../uikit/shared/mount` as a type-only dependency;
- keep `component: React.ComponentType<P>` required and unchanged;
- add `vanillaComponent?: VanillaViewCtor<P>` beside `component`;
- keep `previewChildren` unchanged and explicitly React-typed.

Do not change `PropDef`, `defaultProps`, `StorybookEditorModel`, `ComponentBrowser`,
`PropertyEditor`, or the story registry. Existing stories remain valid without the optional field.

### 2. Preserve the existing prop preparation for both panes

Refactor `src/renderer/editors/storybook/LivePreview.tsx` only as needed to prepare the shared
serializable props once:

1. Start with `model.state.use()` and the existing missing-story panel unchanged.
2. Copy `propValues` and remove empty-string enum values as today.
3. Inject the managed `background` value when the story declares that prop as today.
4. Create two distinct props objects from that prepared object. They must not share a mutable object
   reference: `previewChildren` is added only to the React-side copy, so the vanilla constructor
   can never receive a React node through a shared props object.
5. If the story has no declared `children` prop and
   has `previewChildren`, add the returned React node only to the React props object.
6. Keep the vanilla-side copy limited to the prepared serializable values without calling
   `previewChildren`; never pass a
   React subtree to a `VanillaView` constructor.

The two implementations therefore receive the same editable `propValues` and managed values.
The only deliberate difference is the React-only preview-child compatibility field.

### 3. Render one pane or two without changing the normal story path

In `LivePreview.tsx`:

- when `story.vanillaComponent` is absent, retain the current single preview pane and render the
  React component exactly as today;
- when it is present, render a row split using existing `Panel` primitives, with one named pane for
  the React implementation and one for the vanilla implementation;
- give both panes the same alignment, padding, overflow, and sizing props as the current single
  preview (`flex`, `overflow="auto"`, `align="center"`, `justify="center"`, `padding="xl"`),
  with equal flex basis and a per-pane overflow boundary so a tall vanilla preview cannot distort
  the React pane;
- render the React implementation with `<Component {...reactProps} />`;
- render the vanilla implementation with
  `mountVanilla(story.vanillaComponent, vanillaProps)`;
- keep the outer preview's `data-name="storybook-live-preview"`, `data-type="live-preview"`,
  background, overflow, and sizing contract;
- name the wrappers `storybook-preview-react` and `storybook-preview-vanilla` (with matching
  `data-type` values) so MCP and DOM inspection can address each pane;
- keep the pane wrappers layout-only; the `data-name`/`data-type` attributes are inspection
  contract, not styling hooks that a component conversion would have to preserve.

The preview must not define a React host component inside `LivePreview` or create a `VanillaView`
itself. `mountVanilla`'s module-level host type is what keeps a vanilla instance stable across
ordinary Storybook state updates.

The before/after shape is:

```tsx
// Existing story: one React implementation, unchanged.
<Component {...reactProps} />

// Paired story: the same prepared values drive two implementations.
<ReactPreviewPane><Component {...reactProps} /></ReactPreviewPane>
<VanillaPreviewPane>{mountVanilla(story.vanillaComponent, vanillaProps)}</VanillaPreviewPane>
```

Do not add a Storybook-specific model, state subscription, portal host, or adapter lifecycle flag.

### 4. Keep the component browser and property editor data-only

Verify that `ComponentBrowser.tsx`, `PropertyEditor.tsx`, `StorybookEditorModel.ts`,
`storyRegistry.ts`, and all existing story files need no changes. Story selection and prop editing
already update `propValues`; `LivePreview` is the only consumer that needs to fan those values out
to two implementations.

Do not add a vanilla implementation to a production component as part of this task. US-991 will
add `PathInput`'s paired story data after its vanilla view exists.

### 5. Verify the side-by-side boundary

No unit-test harness or test dependency is introduced. Run:

- `npm run typecheck`
- `npm run lint`
- `git diff --check`

Perform a focused manual check with a temporary local story fixture (or the first US-991 paired
story):

- the existing React-only stories still render one preview pane;
- a paired story renders one React pane and one vanilla pane at the same time;
- changing every editable prop updates both implementations from the same values;
- switching stories disposes the old vanilla view and does not leave its root or overlay content;
- repeated prop updates do not reconstruct the vanilla view when its constructor is unchanged;
- changing the preview background updates both panes consistently;
- compare the component roots, identified by their own `data-name`/`data-type`, while ignoring the
  adapter host and Storybook pane wrappers;
- if a paired story has a Popover portal, verify that Storybook story switching removes the portal
  through the adapter's disposal path.

The renderer currently does not enable `React.StrictMode`. Do not silently change the global
renderer or claim StrictMode coverage in this task; rapid story switching and prop updates are the
relevant harness checks here.

## Concerns / decisions

1. **A vanilla story does not exist yet.** The current registry has no `vanillaComponent`, so the
   new branch is type-checked but cannot be exercised by the committed Storybook catalog until
   US-991 supplies the first paired PathInput story. A temporary local fixture is the smallest
   verification aid and must not become a second production component implementation.

2. **`previewChildren` cannot cross the boundary.** It returns `ReactNode`, so passing it to a
   vanilla constructor would make the metadata React-shaped in practice. The task keeps it on the
   React props copy only. A future paired container story must wait for Epic C's subtree-slot
   contract rather than inventing a callback or DOM serialization protocol here.

3. **Story changes must use the adapter's constructor boundary.** Selecting a different story may
   change `vanillaComponent`; `mountVanilla` must receive the new constructor and dispose the old
   view before replacing it. Ordinary property edits must retain the constructor identity and call
   `VanillaView.update` rather than remount. The preview must not use a changing React `key` to
   implement either behavior because that would bypass the adapter's explicit lifecycle contract.

4. **The adapter adds wrapper DOM.** The comparison target is each implementation's own root, not
   the outer `Panel` or the host `<div>` required by React. The acceptance check should compare
   component semantics and `data-name` trees within those roots; requiring whole-pane DOM identity
   would incorrectly measure harness plumbing.

5. **Constructor typing and existing story casts.** Most current stories use `Story` with the
   default `Record<string, unknown>` props and cast demo components accordingly. Every future
   `vanillaComponent` declaration needs the corresponding `VanillaViewCtor<Record<string,
   unknown>>` cast at the declaration site. A local view-props alias keeps the cast comparable;
   `as unknown as` is acceptable when an HTML-attribute-based interface requires it, but `any` is
   not. Do not weaken `VanillaViewCtor` or make constructors optional.

6. **StrictMode is deliberately out of scope.** The app has no StrictMode or React Fast Refresh
   path today, and US-989 keeps the adapter cleanup idempotent. This task should not add a global
   mode solely to exercise a future vanilla story. If the harness later enables StrictMode, its
   mount/unmount behavior must be rechecked before relying on the preview as a boundary test.

7. **Vanilla lifecycle errors use a pane-level boundary — resolved.** `mountVanilla` lifecycle
   errors are caught by the existing `EditorErrorBoundary` around only the vanilla pane. This
   preserves the property editor and React pane during iterative vanilla-view development. No
   second local error-boundary implementation is introduced.

## Acceptance criteria

- [ ] `Story<P>` keeps the required React `component` and gains an optional
      `vanillaComponent?: VanillaViewCtor<P>` field.
- [ ] `previewChildren` remains a React-only field and is never passed to a vanilla constructor.
- [ ] React-only stories retain the current single-pane rendering and prop preparation behavior.
- [ ] A story supplying both implementations renders React and vanilla panes side by side through
      `mountVanilla`, with one shared editable prop state.
- [ ] The split is a row with two layout-identical, equal-flex panes, each having its own overflow
      boundary and addressable `data-name`/`data-type` wrapper.
- [ ] Property edits, managed background injection, and story selection reach both implementations
      without reconstructing the vanilla view for ordinary prop changes.
- [ ] A constructor change disposes the previous vanilla view through `mountVanilla`; no stale
      vanilla root or portal remains after story switching.
- [ ] `ComponentBrowser`, `PropertyEditor`, `StorybookEditorModel`, `storyRegistry`, and existing
      story definitions require no changes for the optional metadata field.
- [ ] The component roots, rather than adapter/pane wrappers, can be compared by their existing
      `data-name`/`data-type` contract.
- [x] Vanilla lifecycle errors are isolated to the vanilla pane by the existing
      `EditorErrorBoundary`; no new error-boundary primitive is introduced.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
- [ ] No unit-test harness, production component conversion, global StrictMode change, or new
      Storybook-specific lifecycle primitive is introduced.

## Related work

- [EPIC-053 - De-React Epic B](../../epics/EPIC-053.md)
- [US-989 - `mountVanilla` / `mountReact`](../US-989-boundary-adapters/README.md)
- US-991 - Pilot - one component converted end to end *(planned)*
- US-992 - Authoring rules for vanilla views *(planned)*

## Files changed

| File | Change |
|---|---|
| `src/renderer/editors/storybook/storyTypes.ts` | Add the optional typed vanilla constructor metadata |
| `src/renderer/editors/storybook/LivePreview.tsx` | Fan shared props to one React pane or a React/vanilla split pane |
| `src/renderer/uikit/shared/mount.tsx` | No change; consume US-989's adapter |
| `src/renderer/editors/storybook/ComponentBrowser.tsx` | No change; story list remains data-only |
| `src/renderer/editors/storybook/PropertyEditor.tsx` | No change; existing prop editor feeds shared state |
| `src/renderer/editors/storybook/StorybookEditorModel.ts` | No change; existing story/prop state is sufficient |
| `src/renderer/editors/storybook/storyRegistry.ts` | No change; paired metadata is optional |
| `src/renderer/uikit/PathInput/PathInput.story.tsx` | No change here; US-991 adds the paired pilot |
| `doc/active-work.md` | Link US-990 under EPIC-053 |
| `doc/epics/EPIC-053.md` | Link US-990 in the task table |
