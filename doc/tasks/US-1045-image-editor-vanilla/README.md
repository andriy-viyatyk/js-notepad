# US-1045: Convert the image editor inside its PageToolbar shell

Parent epic: [EPIC-059: De-React Epic E1 — Editor foundations](../../epics/EPIC-059.md)

## Goal

Convert the image editor's three toolbar contributions to vanilla while retaining the existing
React `PageToolbar` shell, the existing `<ImageViewport>` façade/body, and the image module's React
`Component` registration. The conversion also collects this editor's `WithMenu` render-prop call
site by using `openMenu` directly.

This document is planning only. It does not implement the conversion, add tests, update the
dashboard or epic document, or create a commit.

## Background

### Epic shape and root cost

EPIC-059 decision E1-2 identifies six editors that render `PageToolbar` directly:

- `src/renderer/editors/archive/ArchiveEditorView.tsx:62`
- `src/renderer/editors/board-info/BoardInfoEditorView.tsx:75`
- `src/renderer/editors/image/ImageView.tsx:60`
- `src/renderer/editors/git-tree/GitTreeEditorView.tsx:178`
- `src/renderer/editors/video/VideoView.tsx:53`
- `src/renderer/editors/category/CategoryEditor.tsx:178`

`image` is the smallest of this middle shape. It proves that a React chrome shell can host vanilla
toolbar contributions while its body is already vanilla behind a React façade. E1-8 deliberately
leaves `editors/base` chrome React and drains it with its call sites, so `PageToolbar` must not be
converted in this task.

The resulting nesting is:

```text
React ImageView shell
└── React PageToolbar
    └── mountVanilla(ImageToolbarView)       vanilla toolbar contributions
└── <ImageViewport … />                      existing React façade/body
```

`mountVanilla` is a React component in the existing tree (`src/renderer/uikit/shared/mount.tsx`),
not a call to `createRoot`. Therefore the new toolbar adapter costs zero additional React roots.
`ImageViewport` is already a pure passthrough to `mountVanilla(ImageViewportView, props)` at
`src/renderer/uikit/ImageViewport/ImageViewport.tsx:276-278`; reaching past that public façade from
this still-React editor would not convert anything and is explicitly out of scope. Only
`mountReactHandle`/`fill-slot` create nested React roots; the new toolbar icon path must remain
DOM-native so it does not accidentally reintroduce one for `DrawIcon`.

The image editor must remain on the registry's React `Component` arm. It is not a candidate for the
vanilla `View` arm because its module still has a React shell that renders `PageToolbar`:

```ts
// src/renderer/editors/image/index.tsx:11-18 — remains unchanged
function ImageEditorComponent({ model }: { model: EditorModel }) {
    return <ImageView model={model as ImageEditor} />;
}

export const imageModule: EditorModule = {
    createEditor: () => /* existing model construction */,
    Component: ImageEditorComponent,
    // no View arm is added
};
```

`src/renderer/editors/index.ts` exports base, text, grid, markdown, and compare only; it does not
re-export `image`. The only `imageModule` registration is the dynamic `image` import in
`src/renderer/editors/register-editors.ts:164`. `ImageEditorComponent` has no other call site.

### Current image surface

`src/renderer/editors/image/ImageView.tsx` currently has two reactive reads:

```ts
const filePath = model.state.use((s) => s.filePath);
const url = model.state.use((s) => s.url);
const src = url || "";
const alt = filePath ? fpBasename(filePath) : "Image";
```

Both reads remain necessary in the finished React shell. `filePath` feeds the viewport's `alt`, and
`url` feeds its `src`; removing either subscription would stop the existing `<ImageViewport>` face
from receiving updated props. `ImageEditor.restore()` awaits the content pipe, then writes a blob
URL with `this.state.update((s) => { s.url = blobUrl; })`; the cache fallback can also write `url`
asynchronously. `url` is therefore not constructor-only data. The new toolbar view binds `url` on
the model itself for Save-button visibility; the shell does not retain a subscription merely for
that child.

The current body is exactly one viewport:

```tsx
<ImageViewport onModel={model.setImageModel} src={src} alt={alt} />
```

`src/renderer/uikit/ImageViewport/ImageViewportView.ts` is already the vanilla implementation and
`src/renderer/uikit/ImageViewport/ImageViewport.tsx:276-278` is a pure React compatibility face:

```tsx
export function ImageViewport(props: ImageViewportProps): React.ReactElement {
    return mountVanilla(ImageViewportView, props);
}
```

Keep the public `<ImageViewport onModel={model.setImageModel} src={src} alt={alt} />` call exactly
as the body. This task does not touch any `src/renderer/uikit/ImageViewport/*` file or reach past
the façade. Its model already owns zoom, pan, fit, image-load, resize, keyboard, and clipboard
state; no image-view conversion may duplicate that state.

### ImageEditor handlers and exports

The view calls five `ImageEditor` members from `src/renderer/editors/image/ImageEditor.ts`:

| Member | Source evidence and binding result |
|---|---|
| `setImageModel` | `:70-72`, an arrow property `(ImageViewportModel \| null) => void`; safe to pass directly as `<ImageViewport>`'s `onModel` (the façade forwards it unchanged). |
| `saveAsPng` | `:226`, an arrow property returning `Promise<void>` and already bound to the model. Keep the existing `() => void model.saveAsPng()` menu wrapper so the `MenuItem.onClick?: () => void` contract does not expose the promise. |
| `saveOriginal` | `:231-266`, an async arrow property returning `Promise<void>`; bound and safe to invoke from a menu wrapper for the same reason. |
| `openInDrawingEditor` | `:272` onward, an async arrow property; its event argument is intentionally unused, so it is safe to pass directly as the icon button's `onClick` handler. |
| `copyImageToClipboard` | `:268-270`, an arrow property returning `void`; safe to pass directly as the icon button's `onClick`. It delegates to the viewport model held by `setImageModel`. |

The file re-exports `ImageEditor` and the `ImageViewProps`/`ImageEditorState` types at its bottom.
No source outside `ImageView.tsx` imports `ImageView` or `ImageViewProps`; preserve those exports so
the file's public shape does not change even though its implementation becomes a shell.

### Toolbar icons

The three current buttons have these exact values:

| Button | `name` | `size` | `title` | Current icon | Vanilla value |
|---|---|---|---|---|---|
| Save | `image-save` | `sm` | `Save image…` | `SaveIcon` | `"save"` — present in `src/renderer/theme/icon-registry.ts:185` |
| Drawing | `image-open-draw` | `sm` | `Open in Drawing Editor` | `DrawIcon` | `DrawIcon.createElement?.()` — no registry name |
| Copy | `image-copy` | `sm` | `Copy Image to Clipboard (Ctrl+C)` | `CopyIcon` | `"copy"` — present in `src/renderer/theme/icon-registry.ts:155` |

`IconButtonView` accepts registry-name strings and resolves them through `createIconElement`, so
`save` and `copy` reproduce the existing icons without React. `DrawIcon` is defined in
`src/renderer/theme/language-icons.ts:211-218`, not `theme/icons.tsx`; `icon-registry.ts` explicitly
excludes `language-icons.ts`, and there is no `draw` registry entry. Do not add one. Use the
`MenuView.ts:41-44` precedent: call the component's optional `createElement`, throw if it is absent,
and pass the resulting SVG DOM node to the vanilla button.

`IconButtonView` currently types its icon as `IconRef` (`IconName | ReactNode`), while its underlying
`fillSlot` already supports `Node`. To pass the direct `DrawIcon` SVG without a React icon subtree,
make the narrow supporting change to `IconButtonProps` and `IconButtonView.updateIcon`: accept
`IconRef | Node`, and send a `Node` directly to `fillSlot`; retain the existing string and React
branches unchanged. This does not change the `ButtonView` API and does not add a React root.
Keep `IconRef` itself unchanged: `renderIcon(icon: IconRef)` returns a React node, so adding `Node`
there would allow a DOM value into a React-rendering path. The `IconRef | Node` widening is limited
to components whose icon path uses `fillSlot`, following the existing `DialogContent` precedent;
`ListItemView` keeps its separate direct-node parameter.

The Save menu's two existing items are deliberately iconless:

```ts
items: [
    { label: "Save as .png", onClick: () => void model.saveAsPng() },
    { label: "Save original", onClick: () => void model.saveOriginal() },
]
```

Keep them iconless. Menu item icons have a different contract from button icons: `MenuView` passes
`item.icon` to `fillSlot`, whose string branch writes literal text. If a future menu item needs an
icon, pass a DOM node from `createIconElement(name)`, not the registry-name string.

### `WithMenu` removal-ledger call site

The current repository count is **13 `<WithMenu` tags across 10 files**. This image call site is
one of the removal-ledger entries described in `de-react.md`: replace the render-prop face with
`openMenu`; do not convert `WithMenu` itself in this task.

The full direct API in `src/renderer/uikit/Menu/attach-menu.ts` is:

```ts
export interface MenuAttachOptions {
    items: MenuItem[];
    placement?: Placement;
    offset?: [number, number];
    name?: string;
    onClose?: () => void;
}

export interface MenuHandle {
    update(options: MenuAttachOptions): void;
    dispose(): void;
}

export function openMenu(anchor: Element, options: MenuAttachOptions): MenuHandle;
```

`src/renderer/ui/tabs/PageTabView.ts:428-438` is the closest settled idiom: capture the anchor
element and focus target, build options, call `openMenu(anchor, options)` when no handle exists,
and otherwise call `handle.update(options)`. Its `onClose` clears the handle and restores focus.
`src/renderer/uikit/SplitButton/SplitButtonView.ts:142-151` additionally disposes the caller-owned
handle from `onDispose`. `ImageToolbarView` must do both: keep its `MenuHandle`, update it while the
menu is open, clear it from `onClose`, dispose it when the toolbar is disposed, and let
`openMenu` remove the menu root. Use the existing `WithMenu` defaults (`placement:
"bottom-start"`, `offset: [-4, 4]`, name `image-save-menu`) and restore the previously focused
element after a normal menu close.

## Implementation Plan

### 1. Add the vanilla image toolbar

Create `src/renderer/editors/image/ImageToolbarView.ts`.

Use direct imports from `src/renderer/uikit/Panel/panel-style.ts`,
`src/renderer/uikit/IconButton/IconButtonView.tsx`, `src/renderer/uikit/Menu/attach-menu.ts`,
`src/renderer/uikit/shared/vanilla-view.ts`, and the direct icon modules. The view should use a
panel row with centered children and the existing `sm` gap, then own three stable
`IconButtonView` children:

```ts
export interface ImageToolbarViewProps {
    model: ImageEditor;
}

export class ImageToolbarView extends VanillaView<ImageToolbarViewProps> {
    // model, saveButton, drawButton, copyButton, menuHandle, focusedBeforeMenu
    // are stable fields; child() registers the buttons but does not mount them.
}
```

Bind `model.state`'s `url` selector inside `ImageToolbarView` during `onMount` and use that binding
to call `applyUrl(url)`. `applyUrl` toggles the stable Save button's `hidden` state, and disposes an
open menu if the URL disappears. The toolbar therefore owns the Save gate; the React shell does not
pass `url` to this child.

Before, `ImageView.tsx` creates React buttons and a render-prop menu:

```tsx
<WithMenu name="image-save-menu" items={[/* two iconless save items */]}>
    {(setOpen) => (
        <IconButton
            name="image-save"
            size="sm"
            title="Save image…"
            onClick={(e) => setOpen(e.currentTarget)}
            icon={<SaveIcon />}
        />
    )}
</WithMenu>
<IconButton
    name="image-open-draw"
    size="sm"
    title="Open in Drawing Editor"
    onClick={model.openInDrawingEditor}
    icon={<DrawIcon />}
/>
<IconButton
    name="image-copy"
    size="sm"
    title="Copy Image to Clipboard (Ctrl+C)"
    onClick={model.copyImageToClipboard}
    icon={<CopyIcon />}
/>
```

After, `ImageToolbarView` should create the equivalent vanilla children and direct menu path:

```ts
this.saveButton = this.child(new IconButtonView({
    name: "image-save",
    size: "sm",
    title: "Save image…",
    onClick: this.onSaveClick,
    icon: "save",
}));
this.drawButton = this.child(new IconButtonView({
    name: "image-open-draw",
    size: "sm",
    title: "Open in Drawing Editor",
    onClick: props.model.openInDrawingEditor,
    icon: createDirectToolbarIcon(DrawIcon),
}));
this.copyButton = this.child(new IconButtonView({
    name: "image-copy",
    size: "sm",
    title: "Copy Image to Clipboard (Ctrl+C)",
    onClick: props.model.copyImageToClipboard,
    icon: "copy",
}));
```

The `createDirectToolbarIcon` helper must follow the `MenuView` guard and return a fresh
`DrawIcon.createElement?.()` SVG node. The two menu items must remain exactly the existing labels
and actions, with no `icon` property. `onSaveClick` must reject the absent-URL case, capture
`document.activeElement`, and call:

```ts
this.menuHandle = openMenu(event.currentTarget, {
    name: "image-save-menu",
    items: this.saveMenuItems(),
    placement: "bottom-start",
    offset: [-4, 4],
    onClose: this.onMenuClose,
});
```

If a handle already exists, update it with the same options instead of opening a second menu.
When the bound `url` becomes absent, hide the Save button and dispose any open handle. When it is
present, show the button and keep the menu options current. On every update use the incoming
`props`; `VanillaView.update()` has already assigned `this.props = props`, so `this.props` is never
the previous value. If the model prop itself changes, update all three handlers from the incoming
model rather than closing over the constructor model.

Mount all three children explicitly in `onMount` after appending their roots. `child()` establishes
ownership but does not mount. The children have the toolbar's lifetime, so this ownership is valid;
do not create and register a replacement Save button on every URL change because `VanillaView` has
no child-release API. Use the stable button and its `hidden` attribute instead.

### 2. Reduce `ImageView.tsx` to the React shell

Modify `src/renderer/editors/image/ImageView.tsx` only after the toolbar view exists. Replace the
React UIKit/menu/icon imports with `mountVanilla` and `ImageToolbarView`; retain the public
`ImageViewport` import and call. Keep `ImageViewProps`, the `ImageEditor` value re-export, and the
`ImageEditorState` type re-export.

Before, the file owns `rightActions` as React JSX and renders the React `ImageViewport` face:

```tsx
const rightActions = (
    <>
        {url && <WithMenu /* Save render prop */ />}
        <IconButton /* Drawing */ />
        <IconButton /* Copy */ />
    </>
);

return (
    <>
        <PageToolbar
            name="image-toolbar"
            model={model}
            borderBottom
            rightContributions={rightActions}
        />
        <ImageViewport onModel={model.setImageModel} src={src} alt={alt} />
    </>
);
```

After, preserve the two state subscriptions and exact fallback while mounting only the vanilla
toolbar contribution; keep the existing ImageViewport façade/body:

```tsx
const filePath = model.state.use((s) => s.filePath);
const url = model.state.use((s) => s.url);
const src = url || "";
const alt = filePath ? fpBasename(filePath) : "Image";

return (
    <>
        <PageToolbar
            name="image-toolbar"
            model={model}
            borderBottom
            rightContributions={mountVanilla(ImageToolbarView, { model })}
        />
        <ImageViewport onModel={model.setImageModel} src={src} alt={alt} />
    </>
);
```

The shell keeps both subscriptions: `filePath` is consumed by `alt`, and `url` is consumed by
`src`. The toolbar's own `url` binding handles Save visibility, so the shell's `url` subscription
is not retained for toolbar gating. The shell's `PageToolbar` remains the only React chrome
boundary; no `PageToolbar` or `editors/base` file is changed.

### 3. Add the narrow direct-DOM icon path to IconButtonView

Modify `src/renderer/uikit/IconButton/IconButton.tsx` and
`src/renderer/uikit/IconButton/IconButtonView.tsx` only to make the already-supported native
`fillSlot` arm type-safe for `DrawIcon`:

```ts
// Before
icon: IconRef;

// After
icon: IconRef | Node;
```

Change `IconButtonView.updateIcon` to accept `IconRef | Node`. Preserve its existing string branch
(`isIconName` → `createIconElement`) and React branch; add only the native branch that passes a
`Node` to `fillSlot`. The direct SVG must use `fillSlot`'s node arm, never `renderIcon` or a React
element. This is why the Draw button remains a vanilla contribution with zero nested React roots.
Do not add `draw` to `src/renderer/theme/icon-registry.ts`, modify `language-icons.ts`, or broaden
`ButtonView`.

### 4. Audit the conversion

Verify the following after implementation:

- `ImageView.tsx` contains only the React shell, the two state subscriptions needed by the existing
  `<ImageViewport>` façade, the exact `filePath ? fpBasename(filePath) : "Image"` fallback, and its
  preserved exports.
- `ImageToolbarView` uses the exact three names, sizes, titles, callbacks, and icon values; Save is
  hidden without `url`, appears after asynchronous restore, and its two items remain iconless.
- `DrawIcon` is created through its direct DOM builder with the missing-builder guard; no `draw`
  registry entry is added.
- `openMenu` receives the clicked button's `currentTarget`, the default placement/offset and
  `image-save-menu` name, returns a stored `MenuHandle`, updates while open, and is disposed by
  both close and view disposal. Focus restoration matches `WithMenu`.
- `<ImageViewport>` remains the body call and receives `setImageModel`, `src`, and `alt`; no
  `ImageViewport` source file changes and no zoom/pan/fit state is duplicated.
- The image module still has `Component:` and no `View:`; `editors/index.ts`,
  `register-editors.ts`, `ImageEditor.ts`, `PageToolbar.tsx`, and the base chrome are unchanged.
- The current removal-ledger baseline of 13 tags across 10 files drops by one image call site;
  `WithMenu.tsx` itself is not converted here.
- No hardcoded colors, Emotion, new inline layout styles, `require("path")`, `require("fs")`, or
  hand-rolled caught-unknown error formatting is introduced. New files are UTF-8 and preserve the
  user-visible ellipsis in `Save image…`.
- No unit tests are added. Run the repository's requested type/lint/build gates only when the
  later implementation is made.

### Files that need NO changes

- `src/renderer/editors/image/index.tsx` — retains `ImageEditorComponent` and `Component:`; do not
  add `View:`.
- `src/renderer/editors/image/ImageEditor.ts` — model methods and async restore behavior are the
  established contract.
- `src/renderer/uikit/ImageViewport/*` — the existing vanilla implementation, React façade, model,
  raster helper, CSS, and all viewport behavior are already settled and untouched.
- `src/renderer/editors/index.ts` — image is not re-exported and needs no export change.
- `src/renderer/editors/register-editors.ts` — the dynamic `image-view` registration remains.
- `src/renderer/editors/base/PageToolbar.tsx` and `src/renderer/editors/base/*` chrome — E1-8
  explicitly keeps this React and drains it with call sites.
- `src/renderer/theme/icon-registry.ts` and `src/renderer/theme/language-icons.ts` — no `draw`
  registry entry or language-icon change is warranted.
- `src/renderer/uikit/Menu/WithMenu.tsx` — only this image call site is collected.
- `src/renderer/uikit/Menu/MenuView.ts` and `src/renderer/uikit/Menu/attach-menu.ts` — use their
  settled contracts; do not modify them.
- All other current `<WithMenu` call sites — the measured count is 13 tags across 10 files before
  this task; later tasks collect the remaining sites.

## Concerns

1. `url` is asynchronous. A constructor-only toolbar would leave Save hidden after
   `ImageEditor.restore()` writes the blob URL. Bind `url` in `ImageToolbarView`; separately keep the
   shell's `url` subscription because the existing `<ImageViewport>` consumes the derived `src`.

2. `IconButtonView`'s old public icon type does not include DOM `Node`, although `fillSlot` supports
   it. The narrow `IconRef | Node` change is required for the direct `DrawIcon.createElement?.()`
   path. Passing `"draw"` would resolve to an empty unknown-registry icon, while passing
   `<DrawIcon />` would create a React subtree inside the icon slot.

3. `ImageToolbarView` must keep stable child instances. `child()` disposes lifetime-matched
   children but cannot release a child early; URL changes should toggle the existing Save button's
   `hidden` attribute rather than create/remove registered children.

4. `openMenu` is caller-owned. `MenuHandle.dispose()` removes the menu view/root, but
   `VanillaView.dispose()` itself deliberately does not detach a view's root. The toolbar owns the
   handle and must dispose it; `mountVanilla` removes the toolbar root after its view is disposed.

5. `VanillaView.update()` assigns `this.props` before `onUpdate(props)`. Any model/url comparison
   that needs previous values must use explicit fields, not `this.props` as a previous-props read.

6. The two icon contracts must not be conflated. `IconButtonView` may resolve a name string, but
   `MenuView` menu items need actual DOM nodes. The two Save items intentionally have no icons, so
   there is no menu-icon conversion in this task.

7. The React `Component` arm is intentional. Adding `View: ImageViewportView` or a wrapper view to
   the module would violate E1-2 and bypass the required PageToolbar-shell pilot. The body itself is
   already vanilla behind `<ImageViewport>` and is not touched in this task.

## Acceptance Criteria

- `ImageView.tsx` remains the module's React face and renders the unchanged `PageToolbar` contract;
  its toolbar contributions are `mountVanilla(ImageToolbarView, { model })`, while its body remains
  `<ImageViewport onModel={model.setImageModel} src={src} alt={alt} />`.
- The exact reactive reads, `src = url || ""`, and `alt = filePath ? fpBasename(filePath) :
  "Image"` behavior remain intact, including updates after asynchronous restore.
- `ImageToolbarView` reproduces all three button names, `sm` sizes, titles, callbacks, and icon
  semantics. `save` and `copy` use registry-name strings; Draw uses a guarded direct SVG builder and
  no registry change.
- The Save button is absent from layout when `url` is absent, becomes available when `url` arrives,
  and its two items remain exactly `Save as .png` and `Save original` with no icons.
- The Save menu uses `openMenu(anchor, options)` with the clicked button as anchor, stores and
  updates the returned `MenuHandle`, uses `image-save-menu`, `bottom-start`, `[-4, 4]`, restores
  focus on close, and disposes on toolbar disposal.
- `IconButtonProps`/`IconButtonView` accept a native `Node` icon without introducing a React root;
  the existing registry-name and React icon paths continue to work. `ButtonView` is unchanged.
- `<ImageViewport>` and every file under `src/renderer/uikit/ImageViewport/*` remain untouched;
  the façade already mounts `ImageViewportView`, owns all zoom/pan/fit state, and receives the
  directly passed `setImageModel` arrow property.
- `imageModule` still registers only `Component:`; no `View:` arm, registry routing, or re-export
  change is made. `ImageView`/`ImageViewProps` exports remain available from their existing file.
- The measured current baseline is recorded as 13 `<WithMenu` tags across 10 files, and this task
  removes exactly the image call site without converting `WithMenu` itself.
- No unit tests, dashboard/epic edits, implementation outside the listed files, or commit are made
  by this planning task. Files are UTF-8 and project coding standards are preserved.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/image/ImageView.tsx` | Retain the React `PageToolbar`, both state subscriptions needed by the existing `<ImageViewport>` call, exact `src`/`alt` derivation, and preserved exports; replace only the React toolbar contributions with `mountVanilla(ImageToolbarView, { model })`. |
| `src/renderer/editors/image/ImageToolbarView.ts` | New vanilla row containing the three owned `IconButtonView` instances, a model-bound async-URL Save gate, direct `DrawIcon` DOM construction, and caller-owned Save `MenuHandle` lifecycle. |
| `src/renderer/uikit/IconButton/IconButton.tsx` | Narrowly allow `Node` in the IconButton icon prop so direct DOM icon builders are type-safe. |
| `src/renderer/uikit/IconButton/IconButtonView.tsx` | Pass native `Node` icons through `fillSlot`'s DOM arm while preserving string/React icon behavior. |

No other files are planned to change; see the explicit NO-change list above.
