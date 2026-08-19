# US-989: `mountVanilla` / `mountReact`

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-053 - De-React Epic B: The reactive foundation and the boundary](../../epics/EPIC-053.md)
**Created:** 2026-08-19

## Goal

Add the two explicit boundary adapters that let React and vanilla views nest in either direction:

- `mountVanilla(ctor, props)` lets a React parent host a `VanillaView` without changing the
  parent's existing React tree or the view's props.
- `mountReact(host, element)` lets a vanilla view host a React element in a dedicated DOM host and
  returns an idempotent disposer for the React root.

The adapters must preserve the lifecycle guarantees established by US-986 and US-988: vanilla
mounting is explicit, prop updates happen through `VanillaView.update`, React roots unmount before
their host is detached, and a disposal error cannot skip DOM cleanup. This task adds the adapters
only. Storybook integration is US-990 and the PathInput conversion is US-991.

## Background

### Fixed public contracts

EPIC-053 B4 fixes these signatures; do not use the ambiguous `mountReact(element, host)` form from
the original roadmap:

```ts
// React parent hosts a vanilla child.
export function mountVanilla<P>(ctor: VanillaViewCtor<P>, props: P): React.ReactElement;

// Vanilla parent hosts a React child. The caller owns the host element.
export function mountReact(host: HTMLElement, element: React.ReactElement): () => void;
```

`VanillaViewCtor<P>` is the constructor form already established by US-986. Every concrete vanilla
view supplied to this adapter must declare a **public** constructor; a subclass that inherits
`VanillaView`'s protected constructor is not assignable to this public constructor type. Even a
view with no constructor arguments must write `constructor(props: Props) { super(props); }`.

```ts
export type VanillaViewCtor<P> = new (props: P) => VanillaView<P>;
```

The adapter module is a React boundary and may import React and `react-dom/client`. The existing
`VanillaView` remains the framework-neutral lifecycle base; it must not gain React imports or
adapter-specific lifecycle flags.

### Existing lifecycle contracts

`src/renderer/uikit/shared/vanilla-view.ts` currently guarantees:

- the constructor creates only a detached `root` and stores props;
- `mount()` builds child DOM and bindings once;
- `update(props)` stores props and invokes the update hook only after mount;
- `dispose()` is idempotent, disposes children and owned resources, and deliberately does not
  detach `root`;
- `bind()` and `listen()` guard callbacks after disposal.

The adapter therefore owns the DOM operation that the base deliberately leaves to its owner. The
React host owns the outer host `<div>`; `VanillaView` owns the inner `root` until the adapter
detaches it. The order is:

```text
React commit -> host.append(view.root) -> view.mount()
React prop commit -> view.update(props)
React unmount / constructor replacement -> view.dispose() -> view.root.remove()
```

`mountReact` is the inverse boundary. It creates a React root in the caller-provided host and
returns a disposer that calls `root.unmount()` exactly once. It never removes the host; the
vanilla owner created that host and remains responsible for its DOM placement.

### The important portal case

`src/renderer/uikit/Popover/Popover.tsx` portals its content to
`getOverlayLayer()` (`src/renderer/uikit/shared/overlayLayer.ts`), outside the local host. A
`mountReact` disposer must therefore unmount the React root, not merely remove the host element.
React unmounting is what removes portal content and releases the React subscriptions. The pilot's
vanilla `PathInput` will use this exact case when it hosts React `Input` and `Popover` children.

### Scope boundary

US-989 is infrastructure only. It does not widen the Story record, render a vanilla story, convert
`PathInput`, alter `TComponentModel`, or change any production component call site. The first
consumer is US-990; the first production-shaped nested use is US-991.

## Implementation Plan

### 1. Add the adapter module at the shared boundary

Create `src/renderer/uikit/shared/mount.tsx`. Import `React`, `useLayoutEffect`, `useRef`, and
`createRoot` from `react-dom/client`, and import `VanillaView`/`VanillaViewCtor` from
`./vanilla-view`.

Export only `VanillaViewCtor`, `mountVanilla`, and `mountReact` from this module. Do not add a
`src/renderer/uikit/shared/index.ts` or a re-export from `src/renderer/uikit/index.ts`; the current
shared modules are imported by direct path, and US-990/US-991 can consume this boundary directly.

### 2. Implement `mountVanilla` as a React-owned host

Define one module-level internal React host component, for example `VanillaHost`, in
`src/renderer/uikit/shared/mount.tsx`. `mountVanilla` must only create an element of that stable
component type:

```ts
export function mountVanilla<P>(ctor: VanillaViewCtor<P>, props: P): React.ReactElement {
    return React.createElement(VanillaHost as React.ComponentType<VanillaHostProps<P>>, {
        ctor,
        props,
    });
}
```

Never define `VanillaHost` inside `mountVanilla`: a new component type per call would make React
unmount and remount the vanilla view on every parent render. The host renders one plain `<div>` and
keeps no React state. The adapter's exact responsibilities are:

1. Keep the host DOM node in a ref.
2. On the layout effect for a constructor identity, construct `new ctor(props)`, append the view's
   detached `root` to the host, then call `view.mount()`. Appending before `mount()` is required so
   a mount hook can measure its attached DOM just as a React layout effect can. The constructor must
   receive the props from the committed render; no view is constructed during a speculative render.
3. On later committed prop changes, call `view.update(props)` in a layout effect. Track the view
   mounted by the mount effect and skip the update effect on that same first commit, because the
   constructor and mount already received identical props. The update effect must also be inert
   before the mount effect has created a view, so pre-mount updates are represented by the
   constructor's latest props rather than sent to a nonexistent DOM.
4. If the constructor identity changes, dispose and detach the old view before mounting the new
   constructor in the same host. A constructor is expected to be stable for a component's normal
   lifetime; replacement is defined so a changed story/branch cannot leak the old view.
5. On unmount, call `view.dispose()` before removing `view.root` from the host. Always remove the
   root in a `finally` path, and rethrow the first lifecycle error after detachment so a broken
   cleanup cannot leave a stale DOM subtree behind.

The before/after lifecycle shape is:

```tsx
// Before US-989: a vanilla child has no React boundary.
return <ReactOnlyComponent {...props} />;

// After US-989: the React parent owns the host; the vanilla view owns its inner root.
return mountVanilla(MyVanillaView, props);
```

The host carries no layout, position, z-index, transform, pointer-events, or styling contract.
The view's root remains the component DOM contract. The adapter must not use a portal for the
vanilla root, because the React parent owns where the host appears in its tree.

### 3. Implement `mountReact` as an idempotent React-root disposer

In the same `src/renderer/uikit/shared/mount.tsx`, implement:

```ts
const disposeReact = mountReact(host, <Input {...inputProps} />);
this.own(disposeReact);
```

`mountReact` must:

- call `createRoot(host)` once and render the supplied element;
- return a closure with a private disposed flag;
- call `root.unmount()` once on the first disposer call and ignore later calls;
- leave `host` attached and otherwise untouched;
- make no assumption that the React element renders only inside `host` (portals are valid).

The vanilla owner registers the returned disposer with `VanillaView.own()` from its `onMount`
hook. This is the existing US-986 resource-disposal path and guarantees React unmount runs during
the owner's depth-first disposal, before any adapter or structural helper detaches the host. The
adapter does not expose or require a second child-view type for React roots.

### 4. Preserve error and lifecycle ordering

The adapter must use `useLayoutEffect`, not a passive effect, for mount, prop update, and cleanup
ordering. The vanilla DOM must exist before the browser paints, and an update must not run after a
parent commit has visually exposed stale props.

For every cleanup path, use this order:

```ts
let firstError: unknown;
try {
    view.dispose(); // or root.unmount()
} catch (error) {
    firstError = error;
} finally {
    view.root.parentNode?.removeChild(view.root);
}
if (firstError !== undefined) throw firstError;
```

The actual implementation must preserve a thrown `undefined` error as well (use an explicit
boolean when capturing an error). If `view.mount()` fails after the root was appended, dispose the
view if possible, remove the root in the cleanup path, and rethrow the initialization error. If
`root.unmount()` fails, the disposer remains permanently inert and does not retry a broken React
root.

### 5. Keep all existing consumers unchanged

Do not modify these files in US-989:

- `src/renderer/editors/storybook/storyTypes.ts` and `src/renderer/editors/storybook/LivePreview.tsx`
  - the optional `vanillaComponent` field and side-by-side pane belong to US-990;
- `src/renderer/uikit/PathInput/PathInput.tsx` and `src/renderer/uikit/PathInput/PathInputModel.ts`
  - the nested adapter use and model effect decomposition belong to US-991;
- `src/renderer/core/state/model.ts`
  - US-988 already supplies the model driver;
- `src/renderer/uikit/shared/vanilla-view.ts`
  - US-986 already supplies the lifecycle and ownership contract;
- `src/renderer/renderer.tsx`
  - no global bootstrap or root change is required;
- `src/renderer/uikit/index.ts`
  - no shared barrel is introduced for this boundary.

### 6. Verify the boundary with focused smoke checks

No unit-test harness or test dependency is introduced. Verify the adapter in proportion to its
boundary risk:

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- a temporary/manual vanilla view smoke check that confirms constructor, mount, prop update,
  disposal, constructor replacement, and idempotent disposal ordering;
- a temporary/manual React-child smoke check that calls `mountReact` from a `VanillaView`, renders
  a portal child into `getOverlayLayer()`, disposes the parent, and confirms both the local React
  subtree and portal subtree are gone;
- a rapid mount/unmount check to confirm no React root or overlay node remains;
- a nested-root commit check: unmount a React parent containing `mountVanilla`, where the vanilla
  view owns a `mountReact` child, while another React root is committing. Record whether React
  warns about synchronously unmounting one root during another root's commit. If it warns, defer
  the child `root.unmount()` with `queueMicrotask` and detach the host only after that disposer has
  completed; do not add that deferral before measuring because it weakens the required
  unmount-before-detach ordering.

The Storybook side-by-side check and StrictMode check are US-990 responsibilities. The renderer
currently renders `<RootComponent />` without `React.StrictMode`; this task does not silently claim
StrictMode coverage. If StrictMode is enabled later, adapter cleanup must be re-verified before
relying on it as a boundary guarantee.

## Concerns / Decisions

1. **Outer host versus vanilla root.** The adapter intentionally has two elements: React owns the
   outer host and the view owns its stable inner root. This is required because React cannot return
   an already-created `VanillaView.root` as the result of a normal component render. The extra host
   is unstyled and is not part of the vanilla component's semantic DOM contract.

2. **Prop updates are commit-timed.** `VanillaView.update()` is not called during React render.
   The initial props are stored by the constructor, the root is appended and mounted in a layout
   effect, and the update effect skips that mounting commit before pumping later props after commit.
   This avoids render-phase DOM writes and keeps the pre-mount contract from US-986 intact. A
   changed constructor identity is a deliberate replacement boundary, not an in-place update.

3. **StrictMode is not an acceptance requirement for this task.** The application does not enable
   StrictMode, and US-990 owns the decision to exercise the story preview under it. The adapter
   implementation must still make cleanup idempotent, but this task does not claim that React's
   development double-invocation behavior has been verified.

4. **Portals make `root.remove()` insufficient.** A `mountReact` disposer must call
   `root.unmount()` even when the local host is about to be removed. The PathInput pilot's
   Popover is the named regression case; its content lives in `getOverlayLayer()`, not beneath the
   React root host.

5. **React-root ownership uses `VanillaView.own()`.** `mountReact` returns the fixed function
   required by the public contract, not an `IOwnedView`. The vanilla caller registers that function
   with `own()` during `onMount`, which gives it the same depth-first disposal guarantee without
   inventing a second ownership interface or pretending a React root is a `VanillaView`.

6. **Errors must not leak DOM.** Cleanup is best-effort across the complete local cleanup path:
   disposal/unmount is attempted, the managed vanilla root is detached in `finally`, and the first
   error is rethrown after cleanup. The host itself remains React-owned for `mountVanilla`, and
   `mountReact` never detaches a host it does not own.

7. **No model or state subscription belongs here.** The adapter is a lifecycle and DOM boundary.
   It must not call `createComponentModelDriver`, `state.subscribe`, `bind`, or
   `ComponentQueue`; those belong to the view/model that it hosts.

## Acceptance Criteria

- [ ] `src/renderer/uikit/shared/mount.tsx` exports the fixed `VanillaViewCtor`, `mountVanilla`,
      and `mountReact` contracts; no ambiguous argument order is introduced.
- [ ] `mountVanilla` renders a plain React-owned host, constructs the vanilla view only for a
      committed mount, appends the detached view root before calling `mount()` once, and removes it
      after `dispose()` on unmount or constructor replacement.
- [ ] `VanillaViewCtor<P>` requires and documents a public concrete-view constructor; inherited
      protected constructors are not passed to the adapter.
- [ ] Vanilla prop updates are forwarded through `VanillaView.update(props)` in commit/layout
      timing, with no redundant update call on the mount commit; no pre-mount update hook or
      render-phase DOM update is introduced.
- [ ] `mountReact` creates one React root in the caller's host, renders the supplied element, and
      returns an idempotent disposer that calls `root.unmount()` exactly once without detaching the
      host.
- [ ] A React child that portals to `getOverlayLayer()` is fully removed by the disposer before
      the vanilla owner or structural helper detaches its host.
- [ ] Mount, replacement, unmount, and disposal errors do not leave the managed vanilla root
      attached; the first error is rethrown after required cleanup, including an `undefined` throw.
- [ ] No adapter-specific ownership marker, lifecycle flag, model driver, or React import is added
      to `src/renderer/uikit/shared/vanilla-view.ts`.
- [ ] No Storybook, PathInput, production component, global bootstrap, or barrel-export changes
      are made; those belong to US-990/US-991 or later work.
- [ ] The implementation passes `npm run typecheck`, `npm run lint`, and `git diff --check`.
- [ ] No unit-test harness or test dependency is introduced; the focused lifecycle and portal
      smoke checks, including nested-root unmount during another React commit, are recorded for the
      implementation handoff.

## Related Work

- [EPIC-053 - De-React Epic B](../../epics/EPIC-053.md)
- [US-986 - Vanilla view lifecycle and `bind()`](../US-986-vanilla-view-lifecycle/README.md)
- [US-987 - Keyed-list and subtree-swap helpers](../US-987-structural-helpers/README.md)
- [US-988 - Model driver](../US-988-model-driver/README.md)
- US-990 - Storybook vanilla render path *(planned)*
- US-991 - Pilot - one component converted end to end *(planned)*
- [Model-view pattern](../../standards/model-view-pattern.md)

## Files Changed

| File | Change |
|---|---|
| `src/renderer/uikit/shared/mount.tsx` | New two-way React/vanilla boundary adapters and constructor type |
| `src/renderer/uikit/shared/vanilla-view.ts` | No change; existing `VanillaView`, `IOwnedView`, and `own()` contract is consumed as-is |
| `src/renderer/core/state/model.ts` | No change; US-988's model driver is consumed by the later pilot, not by the adapter |
| `src/renderer/editors/storybook/storyTypes.ts` | No change; optional vanilla story metadata is US-990 |
| `src/renderer/editors/storybook/LivePreview.tsx` | No change; the second preview pane is US-990 |
| `src/renderer/uikit/PathInput/PathInput.tsx` | No change; nested `mountReact` use is US-991 |
| `src/renderer/uikit/PathInput/PathInputModel.ts` | No change; effect decomposition is US-991 |
| `src/renderer/uikit/index.ts` | No change; shared adapter is imported by direct path |
| `doc/active-work.md` | Link US-989 under EPIC-053 |
| `doc/epics/EPIC-053.md` | Link US-989 in the task table |
