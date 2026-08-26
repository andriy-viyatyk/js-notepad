# US-1112: Convert the image editor to the vanilla View arm

## Goal

Convert the `image` editor from the React `EditorModule.Component` arm to the
framework-free `EditorModule.View` arm. Opening an image editor must retain the
existing toolbar and image viewport behavior while reducing its live React-root
count from one to zero.

This is the pilot task of [EPIC-068](../../epics/EPIC-068.md), E10. It is an
epic task, so its dashboard entry remains unchecked and this task does not run
`/review`.

## Background

### Current image surface

`src/renderer/editors/image/index.tsx` currently registers `Component:
ImageEditorComponent`. The wrapper casts the generic `EditorModel` to
`ImageEditor` and renders `ImageView`.

`src/renderer/editors/image/ImageView.tsx` is the complete React surface. It
reads `model.state.use((s) => s.filePath)` and `model.state.use((s) => s.url)`,
derives `src = url || ""` and `alt = filePath ? fpBasename(filePath) :
"Image"`, then renders a fragment containing:

- `PageToolbar` with `name="image-toolbar"`, `borderBottom`, and
  `mountVanilla(ImageToolbarView, { model })` in `rightContributions`.
- `ImageViewport` with `onModel={model.setImageModel}`, the derived `src`, and
  `alt`.

`src/renderer/editors/image/ImageEditor.ts` owns the image state and commands;
`src/renderer/editors/image/ImageToolbarView.ts` is already a native view and
must remain unchanged. `src/renderer/uikit/ImageViewport/ImageViewportView.ts`
is also already a native view with `ImageViewportProps` (`src`, optional `alt`,
optional `onModel`) and must be used directly by the converted editor view.

### Verified conversion and layout pattern

The `EditorModule` union in
`src/renderer/editors/base/editorRegistry.ts` requires a `View` constructor
when `Component` is absent. `RenderEditorView` obtains that constructor from
the module, and `AsyncEditorView.renderEditor()` creates it, appends its
`root` to `editorHost`, and calls `mount()`.

The layout chain is verified in
`src/renderer/ui/app/PageContentView.ts`, `src/renderer/ui/app/Pages.css`,
`src/renderer/ui/app/RenderEditorView.ts`, and
`src/renderer/ui/app/AsyncEditorView.ts`:

```text
.page-editor-container (flex: 1 1 auto; display: flex; flex-direction: column)
  └─ RenderEditorView.root (display: contents)
       └─ AsyncEditorView.root / editorHost (display: contents)
            └─ editor View.root
```

The old React fragment contributed `PageToolbar` and `ImageViewport` directly
to the column flex container through those transparent adapter hosts. A real
wrapper root would become one flex item and change the layout contract. The
converted image view must therefore use a stable `span` root with
`style.display = "contents"`, matching the local `createContentsRoot()`
pattern verified in the seven converted indexes that actually define it:
`draw`, `graph`, `grid`, `html`, `link-editor`, `log-view`, and `markdown`.

The load-bearing rule is structural: an editor view that composes one chrome
view adopts that chrome's real root with `super(props, chrome.root)`, as
`svg/index.ts` does; an editor view that contributes multiple siblings directly
to the page column needs a `display: contents` root. `image` is the second
kind because it has no chrome view to adopt. This preserves the fragment's
direct-child layout while satisfying `VanillaView`'s stable-root contract.

The direct native children should be `PageToolbarView` and
`ImageViewportView`. `PageToolbarViewProps` in
`src/renderer/editors/base/PageToolbarView.ts` already types both
`children` and `rightContributions` as `SlotContent`, so the native
`ImageToolbarView.root` can be supplied directly; no prop widening is needed.

### Reference registrations

The existing converted editor indexes establish the registration shape:

```typescript
export const svgModule: EditorModule = {
    createEditor: () => /* ... */,
    View: SvgEditorView,
    BodyView: SvgBodyView,
};

export const htmlModule: EditorModule = {
    createEditor: () => /* ... */,
    View: HtmlEditorView,
    BodyView: HtmlBodyView,
};

export const logViewModule: EditorModule = {
    createEditor: () => /* ... */,
    View: LogViewEditorView,
};
```

`src/renderer/editors/markdown/index.ts` follows the same pattern with
`View: MarkdownEditorView` and `BodyView: MarkdownBodyView`. Their top-level
views publicly construct child views, claim them with `this.child(...)`, mount
each child in `onMount()`, and update children in `onUpdate()`.

## Implementation Plan

The plan is limited to the image editor's two current React files. No model,
toolbar, UIKit viewport, parent layout, dashboard, or test-harness changes are
required.

### 1. Replace the React image surface with a native editor view

Rename `src/renderer/editors/image/ImageView.tsx` to
`src/renderer/editors/image/ImageView.ts` and replace its React function with
an `ImageEditorView` class.

- Import `PageToolbarView` directly from `../base/PageToolbarView`,
  `ImageViewportView` directly from
  `../../uikit/ImageViewport/ImageViewportView`, `VanillaView` from
  `../../uikit/shared/vanilla-view`, and the existing `ImageToolbarView` and
  `ImageEditor` definitions.
- Keep `ImageViewProps` as `{ model: ImageEditor }` for the retained
  compatibility export, and define `ImageEditorView extends
  VanillaView<{ model: EditorModel }>` so it satisfies the `EditorModule.View`
  constructor type. Validate the generic model with an `instanceof ImageEditor`
  guard, as the existing `svg`, `html`, `log-view`, and `markdown` editor views
  do.
- In the constructor, create only a stable `span` root whose
  `style.display` is `"contents"`, and store the validated model. Do not create
  child DOM, listeners, subscriptions, timers, or measurements in the
  constructor.
- Add the eighth local copy of `createContentsRoot()` in this file. Do not
  extract a shared helper: the seven existing copies are intentionally outside
  this pilot's scope. Record helper deduplication as a candidate for US-1118.
- In `onMount()`, construct `ImageToolbarView`, `PageToolbarView`, and
  `ImageViewportView`; claim each with `this.child(...)`; append their roots in
  the original order (page toolbar, then viewport); mount the image toolbar
  and page toolbar in one arbitrary but stable order, then mount the viewport
  and install the state binding in step 2. `fillSlot()`'s native arm only
  appends the supplied `Node`, so it neither inspects nor requires the
  contribution view to be mounted first.
- `VanillaView.update()` stores props but does not call `onUpdate()` before the
  view is mounted. Because these children are constructed in `onMount()`, no
  defensive pre-mount child guards are needed; the implementer should not add
  null-checking for that unreachable lifecycle state.
- In `onUpdate()`, validate/store the incoming model and update the existing
  toolbar and viewport children without reconstructing or remounting them.
  Preserve `name: "image-toolbar"`, `borderBottom: true`, and the
  `rightContributions` relationship.
- No custom `onDispose()` step is required: child lifetime is fully owned by
  `this.child(...)`, and the `VanillaView` base disposes registered children
  before registered resources. The base `dispose()` deliberately leaves root
  detachment to the parent/adapter, so do not invent separate child teardown or
  root-removal logic here.

### 2. Replace React's implicit image-state rerender with an explicit binding

`ImageView` selected both `filePath` and `url` using `state.use()`. The vanilla
view must explicitly declare both fields and push their derived values into the
already-mounted viewport. Use one compound `bind()` from `onMount()`, matching
the child-prop binding pattern verified in `uikit/MultiListBox/MultiListBoxView.ts`:

```typescript
this.bind(
    this.model.state,
    (state) => ({ filePath: state.filePath, url: state.url }),
    ({ filePath, url }) => {
        this.viewport.update(this.viewportProps(filePath, url));
    },
);
```

The apply callback must call `ImageViewportView.update()` with
`src: url || ""`, `alt: filePath ? fpBasename(filePath) : "Image"`, and
`onModel: this.model.setImageModel`. `bind()` applies immediately and then
subscribes, so both the initial values and every later `filePath`/`url` state
write are covered. Do not rely on `onUpdate()` for this: model-state writes do
not cause a vanilla editor view's `onUpdate()` to run.

The viewport's existing `ImageViewportView.onUpdate()` already changes the
native `img.src` only when `src` changes and updates `alt`; the editor view
must delegate to that behavior rather than touching viewport DOM.

### 3. Move the module registration and exports to `index.ts`

Rename `src/renderer/editors/image/index.tsx` to
`src/renderer/editors/image/index.ts`.

- Remove `ImageEditorComponent` and its JSX.
- Import `ImageEditorView` from `./ImageView` and register `View:
  ImageEditorView` in `imageModule`; remove `Component` entirely so the module
  satisfies the vanilla arm of `EditorModule`.
- Preserve `createEditor` and `newEditorModel` and their existing
  `TComponentState` initialization exactly.
- Preserve every existing index export: `ImageEditor`,
  `getDefaultImageEditorState`, `ImageEditorState`, `ImageEditorModel`, and
  `ImageEditorModelState`. The `ImageEditorModel` alias is runtime-load-bearing
  even though its use is dynamic: `src/renderer/api/pages/PagesLifecycleModel.ts:813`
  dynamically imports the image index and line 827 checks
  `imgModule.ImageEditorModel` for blob caching.

### 4. Preserve the verified file-level exports and audit the gate

The whole-repository source audit found no imports of `ImageView` or
`ImageViewProps`, and no import of `ImageEditorModelState` through the image
index. The two scripting consumers import `ImageEditor` directly from
`src/renderer/editors/image/ImageEditor.ts`. The only image-index alias
consumer is the `ImageEditorModel` check described above. Retain the old
`ImageView.tsx` value/type re-exports under their equivalent names in
`ImageView.ts`; no importer is broken by the extension rename.

After implementation, verify all of the following with source search and the
real editor path:

- `imageModule` has `View: ImageEditorView` and no `Component`.
- The old React function and React imports are gone from `ImageView.ts`.
- The image editor's old `<PageToolbar` JSX call is gone; the native view uses
  `PageToolbarView` directly.
- The live editor contributes no `[data-react-root]` and no
  `[data-part="react-slot"]` elements.
- `filePath` and `url` changes update the existing viewport, including the
  initial empty source and the later URL produced by `ImageEditor.restore()`.

The `.tsx` to `.ts` renames are expected to appear as delete-plus-add in Git,
not necessarily as renames, because EPIC-068 E10-5.8 records that these files
are rewritten during conversion.

### Before → after shape

```tsx
// Before: src/renderer/editors/image/ImageView.tsx
export function ImageView({ model }: ImageViewProps) {
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
}
```

```typescript
// After: src/renderer/editors/image/ImageView.ts
export class ImageEditorView extends VanillaView<{ model: EditorModel }> {
    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
        this.model = requireImageModel(props.model);
    }

    protected onMount(): void {
        this.toolbar = this.child(new ImageToolbarView({ model: this.model }));
        this.pageToolbar = this.child(new PageToolbarView({
            name: "image-toolbar",
            model: this.model,
            borderBottom: true,
            rightContributions: this.toolbar.root,
        }));
        this.viewport = this.child(new ImageViewportView(this.viewportProps()));
        this.root.append(this.pageToolbar.root, this.viewport.root);
        this.pageToolbar.mount();
        this.toolbar.mount();
        this.viewport.mount();
        this.bind(
            this.model.state,
            (state) => ({ filePath: state.filePath, url: state.url }),
            ({ filePath, url }) => this.viewport.update(this.viewportProps(filePath, url)),
        );
    }
}
```

The after snippet shows the required structure and binding; the implementation
must also include typed child fields, `onUpdate()`, `createContentsRoot()` as a
local helper, `requireImageModel()`, `viewportProps()`, and the retained
exports. No custom `onDispose()` is needed.

## Concerns / Open Questions

### Resolved: state updates must be pushed to the viewport

This is the task's §6.1 masked-defect risk. React's `state.use()` tracks both
`filePath` and `url`; `VanillaView` has no implicit render pass. The explicit
compound `bind()` is therefore mandatory, and its callback must call
`ImageViewportView.update()` with both derived fields. The existing
`ImageToolbarView` separately binds `url` for save-button visibility; that
binding is retained and does not replace the viewport binding.

### Resolved: use `display: contents` for the new root

`PageContentView` mounts the editor below `.page-editor-container`, whose CSS
is a column flex layout. `RenderEditorView` and `AsyncEditorView` already make
their adapter roots transparent, and the React image surface is a fragment.
The converted editor root must therefore also be transparent so the toolbar
and viewport remain sibling flex items with the same sizing behavior. This
matches the verified local `createContentsRoot()` pattern in `draw`, `graph`,
`grid`, `html`, `link-editor`, `log-view`, and `markdown`; `svg` is deliberately
excluded because it adopts its single `TextChromeView` root with
`super(props, chrome.root)`. A normal wrapper root would insert a new flex
item.

### Resolved: no new React bridge or prop widening

Both rendered children already have native views. `PageToolbarView` accepts
native `SlotContent`, and `ImageViewportView` accepts pure data props. The
conversion must not use `mountReact`, `mountReactHandle`, or the React
compatibility `PageToolbar`/`ImageViewport` faces, and it must not modify
`PageToolbarViewProps`.

### Resolved: public re-exports and extension rename

The source audit found no importer for `ImageView` or `ImageViewProps`, and no
importer for the old file's `ImageEditorState` re-export. It found the runtime
`ImageEditorModel` consumer at
`src/renderer/api/pages/PagesLifecycleModel.ts:827`; therefore `index.ts` must
keep that alias. Keep all existing index exports and retain the old file's
equivalent value/type re-exports in `ImageView.ts` while renaming both `.tsx`
files to `.ts`. The extensionless dynamic import at line 813 remains unchanged.

## Acceptance Criteria

- `src/renderer/editors/image/index.ts` exists and registers
  `View: ImageEditorView` with no `Component` property.
- `src/renderer/editors/image/ImageView.ts` exists, exports the native image
  editor view, contains no JSX or React hooks, and retains the old file's
  compatibility export names.
- The native view creates one `display: contents` root, owns and mounts
  `PageToolbarView`, `ImageToolbarView`, and `ImageViewportView` exactly once,
  and preserves toolbar-before-viewport order and existing props.
- A compound `bind()` tracks both `ImageEditorState.filePath` and
  `ImageEditorState.url` and updates the existing viewport with the exact old
  `src`/`alt` derivation on initial mount and on every state change.
- The importer audit remains valid: `PagesLifecycleModel.ts:827` continues to
  receive `ImageEditorModel`, and no removed React-surface export has an
  in-repo importer.
- `ImageEditor.ts`, `ImageToolbarView.ts`, `ImageViewportView.ts`,
  `PageToolbarView.ts`, and the parent mounting/layout files are unchanged.
- No tests or test harnesses are added; no dashboard duplicate is added; no
  commit is created.
- When opened through the real editor path, the image editor contributes
  `0` elements matching `[data-react-root]` and `0` matching
  `[data-part="react-slot"]`; the image updates after its URL becomes
  available, toolbar actions remain functional, and viewport zoom/pan/copy
  behavior remains intact.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/image/ImageView.tsx` → `src/renderer/editors/image/ImageView.ts` | Replace the React fragment with `ImageEditorView`; add explicit state binding. |
| `src/renderer/editors/image/index.tsx` → `src/renderer/editors/image/index.ts` | Register the `View` arm, remove the React wrapper, preserve model construction and exports. |

Files that need no changes: `src/renderer/editors/image/ImageEditor.ts`,
`src/renderer/editors/image/ImageToolbarView.ts`,
`src/renderer/uikit/ImageViewport/ImageViewportView.ts`,
`src/renderer/uikit/ImageViewport/ImageViewport.tsx`,
`src/renderer/editors/base/PageToolbarView.ts`,
`src/renderer/ui/app/PageContentView.ts`,
`src/renderer/ui/app/Pages.css`,
`src/renderer/ui/app/RenderEditorView.ts`,
`src/renderer/ui/app/AsyncEditorView.ts`, and `doc/active-work.md`.
