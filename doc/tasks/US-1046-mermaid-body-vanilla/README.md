# US-1046: Convert the mermaid editor body inside its TextChrome shell

Parent epic: [EPIC-059: De-React Epic E1 - Editor foundations](../../epics/EPIC-059.md)

This document is planning only. It does not implement the conversion, add tests, update the
dashboard or epic document, or create a commit.

## Goal

Convert the mermaid editor body from a React component to a `VanillaView` while retaining the React
`TextChrome` shell and its React toolbar contributions. Register the new vanilla body through the
`EditorModule.BodyView` arm so the registry's React normalization path is exercised by the notebook
embedded-body consumer without changing that consumer.

The finished body must preserve the current error, loading, viewport, focus-queue, image-model, and
embedded-height behavior. It must use `ImageViewportView` directly because the new parent is vanilla.

## Background

### Epic shape and React-root direction

EPIC-059 decisions E1-2 and E1-8 identify mermaid as the pilot for the deepest chrome shape: 14
editors render a React `TextChrome` around their body. `TextChrome` is deliberately not converted in
this task. The finished nesting is:

```text
React MermaidEditorView
`-- React TextChrome
    |-- React MermaidToolbarBits
    `-- mountVanilla(MermaidBodyView, ...)    vanilla body
```

`src/renderer/uikit/shared/mount.tsx:99-107` shows that `mountVanilla` returns a React component
(`VanillaHost`) rendered in the existing React tree. It does not call `createRoot`; the adapter
creates and mounts the vanilla view in its host. In contrast, `src/renderer/uikit/shared/fill-slot.ts`
detects a React-valued slot at `:43-46`, creates a slot container, and calls
`mountReactHandle` at `:104-111`; `mountReactHandle` calls `createRoot` at
`src/renderer/uikit/shared/mount.tsx:131-136`. Therefore a React shell hosting this vanilla body
does not add a React root, while a vanilla parent hosting a React face through `fillSlot` would add
one root per slot host.

This is the same boundary rule used by US-1045, with the parent direction reversed. US-1045's
`ImageView` remains React, so its existing `<ImageViewport>` compatibility face is idiomatic and
costs no extra root: `ImageViewport.tsx:276-278` is only `mountVanilla(ImageViewportView, props)`.
Here `MermaidBodyView` is vanilla. Calling `<ImageViewport>` from it would require a React-valued
slot or `mountReactHandle`, creating a real React root. The plan therefore imports and constructs
`ImageViewportView` directly. No file under `src/renderer/uikit/ImageViewport/` is changed.

### Registry normalization and the notebook proving consumer

`src/renderer/editors/base/editorRegistry.ts:316-323` normalizes a module that has `BodyView` but
no `Body` as follows:

```ts
const Ctor = module.BodyView;
module = {
    ...module,
    Body: (props: { model: EditorModel; editorConfig?: EditorConfig }): React.ReactElement =>
        mountVanilla(Ctor, props),
};
```

The synthesized React `Body` receives exactly `{ model, editorConfig }`. It does not receive
`imageModelSetter`. `MermaidBodyView` must consequently make that callback optional. This is safe:
the embedded notebook path has no mermaid toolbar and never needs the image viewport model for copy;
the full-page React shell supplies the callback for its `mermaid-copy` button.

`src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx:62-99` loads `module.Body` and
renders it as `<Body model={editor} editorConfig={editorConfig} />`. The call site already passes
only those two props. Because registry normalization supplies `Body` before the module is cached,
`NoteItemActiveEditor.tsx` needs no edit, no arm branch, and no widened type.

### Current mermaid body and state ownership

`src/renderer/editors/mermaid/MermaidBody.tsx:15-76` reads exactly three model fields:
`svgUrl`, `error`, and `loading`. `MermaidEditor` owns those fields and updates them in its existing
400 ms render pipeline (`MermaidEditor.ts:138-162`). The body should use a model-state subscription
with a selector for those same three fields; it should not introduce local rendered state.

The current root attributes are:

```tsx
<Panel
    name="mermaid-root"
    direction="column"
    flex={embedded ? undefined : true}
    overflow="hidden"
    position="relative"
    height={embedded ? maxH : 0}
>
```

`embedded` is derived from `editorConfig.maxEditorHeight !== undefined`. This is prop-dependent.
The vanilla constructor may use `createPanelElement`, but `onUpdate(props)` must call
`applyPanelAttributes(this.root, resolvePanelAttributes(...))` with the incoming `props`, because
`VanillaView.update()` assigns `this.props = props` before it calls `onUpdate(props)` and therefore
`this.props` is not the previous props object.

The body currently has three mutually exclusive content outcomes in its ternary:

```tsx
loading && !svgUrl ? <Panel ...><Spinner /></Panel>
    : svgUrl ? <ImageViewport ... />
    : null
```

Use `SubtreeSwap` from `src/renderer/uikit/shared/subtree-swap.ts` for these full-loading,
viewport, and empty arms. The swap factory must explicitly mount every returned view. `SubtreeSwap`
claims ownership, disposes the old view, and removes its root; `VanillaView.dispose()` itself
deliberately does not detach roots.

The error panel is rendered by a separate `error &&` expression in the current component and can
coexist with a stale `svgUrl` after a later render fails, so it must not be folded into the content
swap. Keep a stable error panel/text pair and toggle its `hidden` state and text. This preserves the
current independent error behavior without rebuilding DOM on every state notification.

The loading overlay is also not a fourth content arm. When `loading && svgUrl` is true, the current
React output contains both the viewport and the absolute overlay spinner. Keep a stable overlay
panel with a mounted `SpinnerView`, and toggle `hidden` independently. The overlay is therefore an
independently toggled sibling of the content `SubtreeSwap`, not a swap arm.

The required UIKit factories and view have been verified:

- `src/renderer/uikit/Panel/panel-style.ts:342-349` exports `createPanelElement`; its update pair
  is `applyPanelAttributes` plus `resolvePanelAttributes` at `:303-340`.
- `src/renderer/uikit/Text/text-style.ts:100-108` exports `createTextElement`.
- `src/renderer/uikit/Spinner/SpinnerView.tsx:6-25` exports `SpinnerView`; it creates the existing
  progress icon and owns its residual listeners.

### Image model callback and toolbar

`MermaidEditorView` in `src/renderer/editors/mermaid/index.tsx:114-132` keeps a React
`useRef<ImageViewportModel | null>` and passes a setter to the body. `MermaidToolbarBits` reads the
same ref at `:21-26` and calls `imageModel.current?.copyToClipboard()` at `:102-108`.

The ref should remain. The shell is a functional React component, so a plain local field would be
recreated on render and a plain field is not a cleaner replacement without changing the shell into a
class or lifting the reference into model state. The existing toolbar prop contract already accepts
the stable ref, and keeping the React shell means `MermaidToolbarBits` needs no change.

The callback is optional on the vanilla body. `ImageViewportView` already accepts optional
`onModel` through `ImageViewportProps` and forwards the model on mount/dispose. The full-page shell
passes the setter; registry normalization for notebook embeds does not.

### URL ownership and exports

`src/renderer/editors/mermaid/render-mermaid.ts:93-127` serializes the SVG into a
`data:image/svg+xml,${encodeURIComponent(...)}` data URL. It does not call `URL.createObjectURL`.
The only `svgUrl` writer is `MermaidEditor.ts:148-154`, and the body only passes the value to the
viewport. There is no mermaid object URL to revoke, and the body must not add ownership or cleanup
for it. `MermaidEditor.exportPng()` may render a temporary data URL for rasterization, but that is
model/export work and is also not body-owned.

`rg` confirms that `MermaidBody` is imported only by `src/renderer/editors/mermaid/index.tsx` and
that `MermaidBodyProps` has no outside import. `src/renderer/editors/index.ts` exports base, text,
grid, markdown, and compare only; it does not re-export mermaid. This permits replacing the
React-only `MermaidBody.tsx` file with `MermaidBodyView.ts` without a compatibility face or barrel
change.

## Implementation Plan

### 1. Replace the React body with `MermaidBodyView`

Replace `src/renderer/editors/mermaid/MermaidBody.tsx` with
`src/renderer/editors/mermaid/MermaidBodyView.ts`. Use direct imports for the Panel/Text style
factories, `SpinnerView`, `ImageViewportView`, `ImageViewportProps`/`ImageViewportModel` types,
`SubtreeSwap`, and `VanillaView`. Do not import from the broad UIKit barrel and do not use Emotion or
new inline layout styles.

Before, the file is a React component with hook subscriptions and a React viewport face:

```tsx
export function MermaidBody({ model, imageModelSetter, editorConfig = {} }: MermaidBodyProps) {
    const { svgUrl, error, loading } = model.state.use((s) => ({
        svgUrl: s.svgUrl,
        error: s.error,
        loading: s.loading,
    }));

    model.typedQueue.use(() => {
        // no-op
    });

    return (
        <Panel ...>
            {error && <Panel ...><Text color="warning" preWrap>{error}</Text></Panel>}
            {loading && svgUrl && <Panel ...><Spinner /></Panel>}
            {loading && !svgUrl ? <Panel ...><Spinner /></Panel>
                : svgUrl ? <ImageViewport onModel={imageModelSetter} src={svgUrl} alt="Mermaid Diagram" />
                : null}
        </Panel>
    );
}
```

After, make the body a stable-root view. The props retain the optional callback needed by the React
shell but tolerate the registry's synthesized `{ model, editorConfig }` props:

```ts
export interface MermaidBodyViewProps {
    model: MermaidEditor;
    editorConfig?: EditorConfig;
    imageModelSetter?: (model: ImageViewportModel | null) => void;
}

export class MermaidBodyView extends VanillaView<MermaidBodyViewProps> {
    // stable error panel/text, overlay panel/spinner, content swap, and active viewport view
}
```

Construct the root with the exact existing `mermaid-root` attributes. Keep the error panel and
overlay panel as stable DOM nodes. The overlay contains one `SpinnerView` child; call
`this.child(...)` to register it and explicitly call `.mount()` in `onMount()` after appending its
root. `child()` establishes lifetime ownership but does not mount a child, and these children have
the parent's lifetime so that ownership is valid.

Use a content swap keyed by `"loading" | "viewport"` and `null`:

```ts
const contentKey = loading && !svgUrl
    ? "loading"
    : svgUrl
        ? "viewport"
        : null;
```

The loading factory returns a mounted vanilla panel view whose root has `flex`, centered alignment,
and `background: "default"`, containing a mounted `SpinnerView`. The viewport factory directly
constructs and mounts:

```ts
new ImageViewportView({
    onModel: this.imageModelSetter,
    src: svgUrl,
    alt: "Mermaid Diagram",
})
```

Keep a reference to the active `ImageViewportView` so a changed `svgUrl` updates the existing
viewport when the swap key remains `"viewport"`; `SubtreeSwap.set()` intentionally does nothing
when its key is unchanged. When the callback or model changes, update the active viewport with the
incoming props as well. Do not create a replacement registered child on each URL change; the
vanilla base has no child-release API.

Update the stable error panel from the incoming projection: set the warning text's `textContent`
and set `errorPanel.hidden = !error`. Update the stable overlay with
`overlayPanel.hidden = !(loading && !!svgUrl)`. These two independent toggles preserve the current
possibility of error plus content and viewport plus loading overlay.

### 2. Translate React subscriptions and lifecycle to vanilla lifecycle

In `MermaidBodyView.onMount()`:

1. Mount the overlay's `SpinnerView`.
2. Apply the current `{ svgUrl, error, loading }` projection before subscribing, matching the
   immediate initial render behavior.
3. Subscribe to `model.state` with a selector that returns exactly those three fields and apply the
   projection on changes. Own the unsubscribe and support replacing the model in `onUpdate`.
4. Replace the React hook drain with the programmatic queue subscription:

   ```ts
   this.queueSubscription = this.model.typedQueue.subscribe(() => {
       // PV8: deliberate no-op; drain the focus queue to keep its lifecycle clean.
   });
   this.own(() => this.queueSubscription?.());
   ```

   `ComponentQueue.subscribe()` at `src/renderer/core/state/ComponentQueue.ts:33-45` synchronously
   drains queued events, routes future events, and returns the unsubscribe function. Do not retain
   `typedQueue.use()` in the vanilla file.
5. Own `contentSwap.dispose()` so active viewport/loading branches dispose before the body is
   removed. Do not detach `this.root` in `onDispose`; the `mountVanilla` adapter owns that removal.

Before, focus events are consumed by a React hook:

```tsx
model.typedQueue.use(() => {
    // no-op
});
```

After, they are consumed by the explicit non-React subscription:

```ts
this.queueSubscription = this.model.typedQueue.subscribe(() => {
    // no-op
});
```

### 3. Recompute prop-dependent root attributes and model/callback updates

Add a small helper that maps `EditorConfig` to the existing root attributes. In the constructor,
pass it to `createPanelElement`. In every `onUpdate(props)` call, pass the incoming config through
`resolvePanelAttributes` and `applyPanelAttributes`:

```ts
protected onUpdate(props: MermaidBodyViewProps): void {
    applyPanelAttributes(this.root, resolvePanelAttributes(rootProps(props.editorConfig)));
    this.imageModelSetter = props.imageModelSetter;
    // replace model subscriptions if props.model changed, then re-apply the current projection
}
```

The recomputed values must remain exactly:

```ts
flex: embedded ? undefined : true,
height: embedded ? maxH : 0,
```

where `embedded` is based on `props.editorConfig?.maxEditorHeight !== undefined`. Do not read
`this.props` as the old config or old model in `onUpdate`; the base has already assigned the new
props. If the model changes, unsubscribe the old state and queue handlers, assign the incoming model,
subscribe the new model, and apply its current projection. If only the callback/config changes,
re-apply the current projection so an active viewport receives the new callback.

### 4. Keep the React shell and register the BodyView arm

Modify `src/renderer/editors/mermaid/index.tsx` only where the body is mounted and the module arms
are declared. Add `mountVanilla` and `MermaidBodyView` imports. Retain all toolbar code, its
`useRef<ImageViewportModel | null>`, the React `TextChrome`, and the `MermaidToolbarBits` props.

Before, the shell and module use the React body and an explicit embedded React wrapper:

```tsx
<TextChrome ...>
    <MermaidBody
        model={mermaid}
        imageModelSetter={(r) => { imageModel.current = r; }}
    />
</TextChrome>
```

```ts
function MermaidEmbeddedBody({ model, editorConfig }: { ... }) {
    return <MermaidBody model={model as MermaidEditor}
        editorConfig={editorConfig} imageModelSetter={() => {}} />;
}

export const mermaidModule: EditorModule = {
    createEditor: ...,
    Component: MermaidEditorView,
    Body: MermaidEmbeddedBody,
};
```

After, mount the vanilla body in the React shell and expose only `BodyView`:

```tsx
<TextChrome ...>
    {mountVanilla(MermaidBodyView, {
        model: mermaid,
        imageModelSetter: (r) => { imageModel.current = r; },
    })}
</TextChrome>
```

```ts
export const mermaidModule: EditorModule = {
    createEditor: ...,
    Component: MermaidEditorView,
    BodyView: MermaidBodyView,
};
```

Delete `MermaidEmbeddedBody`; registry normalization will synthesize its React `Body` for
`NoteItemActiveEditor` and pass no image-model callback. Do not add a `View` arm for the whole
mermaid editor: its page-level shell remains React and the task is specifically the `BodyView` arm.

### Files that need NO changes

- `src/renderer/editors/base/TextChrome.tsx` and the other `src/renderer/editors/base/*` chrome
  files - E1-8 keeps slot-bearing chrome React until its call sites drain.
- `src/renderer/editors/base/editorRegistry.ts` - its existing `BodyView` normalization already
  passes `{ model, editorConfig }` and must remain the single adapter location.
- `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` - the existing two-prop
  `Body` render is already compatible with the normalized wrapper.
- `src/renderer/uikit/shared/mount.tsx`, `fill-slot.ts`, and `subtree-swap.ts` - their settled
  lifecycle/root-cost contracts are consumed, not changed.
- Every file under `src/renderer/uikit/ImageViewport/` - use `ImageViewportView` directly, with no
  UIKit conversion or duplicate zoom/pan/fit model.
- `src/renderer/editors/mermaid/MermaidEditor.ts` and `render-mermaid.ts` - the model owns state and
  data-URL production; the body must not revoke or otherwise own `svgUrl`.
- `src/renderer/editors/index.ts` and `src/renderer/editors/register-editors.ts` - mermaid is
  dynamically registered and is not re-exported from the editors barrel.
- The `MermaidToolbarBits` implementation in `src/renderer/editors/mermaid/index.tsx` - retain the
  existing ref-based copy path and all five toolbar buttons.
- No CSS file, `Panel`, `Text`, `Spinner`, `ImageViewport`, `TextChrome`, or menu component needs a
  source change.

## Concerns

All task questions are resolved by the current source:

1. `NoteItemActiveEditor.tsx` truly needs no edit. Registry normalization creates the missing React
   `Body` and passes only the two props that its existing call already supplies. The optional
   `imageModelSetter` is specifically required because normalization omits it.
2. The loading overlay is an independently toggled sibling, not a fourth `SubtreeSwap` arm. It is
   rendered when `loading && svgUrl`, while the viewport is rendered whenever `svgUrl` is present;
   those predicates overlap. The content swap is only full-loading (`loading && !svgUrl`), viewport
   (`svgUrl`), or empty.
3. The error panel is also kept outside that content swap because the current JSX has an independent
   `error &&` sibling and `MermaidEditor` does not clear `svgUrl` in its catch path. Stable hidden
   DOM preserves both this behavior and the no-fresh-node-per-update rule.
4. The React `useRef` is the correct bridge while the shell and toolbar remain React. Replacing it
   with a plain field would require a different shell/toolbar contract and gives no root or lifecycle
   benefit.
5. `svgUrl` is an encoded data URL, not an object URL. No `URL.revokeObjectURL` belongs in the body,
   and no model/export ownership should be moved into the view.
6. No new caught-unknown handling, colors, path/fs access, Emotion, inline layout styles, or unit
   tests are needed. Any implementation-time errors must follow the repository's `errMessage`/
   `guard` standard, but this body conversion adds no catch block.

## Acceptance Criteria

- `src/renderer/editors/mermaid/MermaidBody.tsx` is replaced by a UTF-8
  `src/renderer/editors/mermaid/MermaidBodyView.ts` `VanillaView`; no React hooks or JSX remain in
  the body implementation.
- The mermaid module keeps a React `Component` for `MermaidEditorView`/`TextChrome`, mounts
  `MermaidBodyView` with `mountVanilla`, and exposes `BodyView` rather than an explicit `Body` wrapper.
- Registry normalization supplies the notebook path's React `Body` with exactly `{ model,
  editorConfig }`; `NoteItemActiveEditor.tsx` remains unchanged and the optional callback is
  tolerated.
- The body reads `svgUrl`, `error`, and `loading` reactively and preserves all current output:
  independent error panel, full-panel spinner for loading without an SVG, viewport for an SVG, and
  overlay spinner for loading with an SVG.
- `SubtreeSwap` manages only the mutually exclusive full-loading/viewport/empty content branches;
  the overlay remains independently hidden/shown and can coexist with the viewport.
- `ImageViewportView` is constructed directly with `src`, `alt`, and the optional `onModel` callback;
  `<ImageViewport>` is not used in the vanilla parent and no UIKit ImageViewport file changes.
- `ComponentQueue.subscribe(() => {})` replaces the React `typedQueue.use(() => {})` no-op, drains
  queued focus events, and is unsubscribed with the view lifecycle.
- Root `flex` and `height` are recomputed from the incoming `editorConfig.maxEditorHeight` on every
  update, including transitions between embedded and full-page modes.
- Stable error/overlay/spinner/view resources are reused or disposed through ownership; no fresh
  registered child is created per state update, and the body does not detach its own root.
- The toolbar's `useRef` and `MermaidToolbarBits` copy path remain unchanged in behavior; no plain
  field or toolbar contract change is introduced.
- No unit tests, dashboard/epic edits, commits, or unrelated file changes are made by this planning
  task. New documentation and any later implementation files remain UTF-8 and contain no accidental
  non-ASCII corruption.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/mermaid/index.tsx` | Keep the React `TextChrome`/toolbar shell; replace the React body and explicit `Body` wrapper with `mountVanilla(MermaidBodyView, ...)` and the `BodyView` module arm. |
| `src/renderer/editors/mermaid/MermaidBody.tsx` | Remove the React body component; it has no external consumers or barrel re-export. |
| `src/renderer/editors/mermaid/MermaidBodyView.ts` | New vanilla body view with direct `ImageViewportView`, state/queue subscriptions, stable error and overlay DOM, `SubtreeSwap` content branches, and prop-dependent root updates. |

No other files are planned to change; see the explicit NO-change list above.
