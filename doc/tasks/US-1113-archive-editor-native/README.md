# US-1113: Convert the `archive` editor to the vanilla View arm

Parent epic: [EPIC-068: De-React Epic E10 — the `PageToolbar` editor group](../../epics/EPIC-068.md)

## Goal

Convert the `archive` editor from the React `EditorModule.Component` arm to the
framework-free `EditorModule.View` arm. Preserve archive browsing, navigation,
toolbar actions, and the empty-state message while making the main archive editor
open with zero live React roots instead of one.

This is an epic task. Its dashboard entry already exists under EPIC-068 and stays
unchecked; this task does not run `/review`, `/document`, or `/userdoc`.

## Background

### Current registration and surface

`src/renderer/editors/archive/index.tsx:7-9` defines `ArchiveEditorComponent`,
which casts the generic `EditorModel` and renders `ArchiveEditorView`. The module
registers that function as `Component` at `:11-20`; it has no `View` arm.

`src/renderer/editors/archive/ArchiveEditorView.tsx:18-35` is the complete React
surface. It reads `model.treeProvider`, derives `pageId` from `model.page?.id`
or `model.id`, stores the imperative `TreeProviderViewModel` in a ref, and
defines the item-click, collapse-all, and refresh handlers. There are **no**
`state.use(...)` calls in this file. The exhaustive state-use audit is therefore:

| React read | State field that must be bound | Result |
|---|---|---|
| `state.use(...)` in `ArchiveEditorView.tsx` | None | No archive-view state binding is needed for a migrated `state.use` read. |

The view does read the mutable `ArchiveEditor.treeProvider` field at `:19`, the
page id at `:20`, and the model id in the click callback at `:25`; the native
callbacks should read the current validated model rather than capture a stale
React closure. `ArchiveEditor.treeProvider` is initialized before the main view
is mounted on all three paths: direct file opening awaits
`model.initFromArchive(filePath)` inside the async factory at
`src/renderer/editors/archive/index.tsx:15-18` (the provider assignment is
complete before the model is returned); general file opening then awaits
`editor.restore()` in `src/renderer/api/pages/PagesLifecycleModel.ts:167-202`;
and session restore awaits `editor.restore()` in
`src/renderer/api/pages/PagesPersistenceModel.ts:146-164`. The archive-specific
open path then attaches the prepared editor at
`PagesLifecycleModel.ts:443-465`.

The two existing model/view files are already native and are not part of this
conversion. `src/renderer/editors/archive/ArchiveEditor.ts:35-55` owns the
archive model and provider, while
`src/renderer/editors/archive/ArchiveSecondaryView.ts:16-73` already constructs,
claims, mounts, and binds a native `TreeProviderViewImpl`.

### Root and layout decision

The React surface has exactly one outer Panel in either branch:

- The no-provider branch is the Panel at
  `ArchiveEditorView.tsx:36-47`, with column direction, flex growth, hidden
  overflow, default background, xl padding, and a light Text message.
- The loaded branch is the Panel at `:50-87`, named `archive-root`, with column
  direction, flex growth, hidden overflow, and default background. Its direct
  children are `PageToolbar` and `TreeProviderView`.

This makes archive the **single-root** case. The native view must adopt one
stable Panel root created with `createPanelElement` from
`src/renderer/uikit/Panel/panel-style.ts:349-356`, rather than add a local
`createContentsRoot()` helper. A `display: contents` root is required for an
editor such as image that contributes multiple siblings directly to the page
column; the image pilot documents that shape at
`doc/tasks/US-1112-image-editor-native/README.md:58-71`. Archive instead keeps
the toolbar and tree inside its one Panel flex item.

The page layout confirms why this distinction matters:
`src/renderer/ui/app/PageContentView.ts:134-150` puts the editor below
`.page-editor-container`, and `src/renderer/ui/app/Pages.css:1-3` makes that
container a column flex layout. `RenderEditorView` and `AsyncEditorView` already
use transparent adapter roots (`RenderEditorView.ts:15-24` and
`AsyncEditorView.ts:37-41`), while `AsyncEditorView.ts:98-125` appends and mounts
the registered native editor view. A normal Panel root is therefore the
intended single page-column item and preserves the existing background, flex,
overflow, and padding behavior.

### Tree-provider path and React-root result

The old import at `ArchiveEditorView.tsx:2` comes from the compatibility barrel.
That barrel's `TreeProviderView` is only a React function that calls
`mountVanilla(TreeProviderViewImpl, props)` at
`src/renderer/components/tree-provider/TreeProviderView.tsx:1-17`.
The converted archive view should use `TreeProviderViewImpl` directly, matching
the already-native archive secondary view at
`src/renderer/editors/archive/ArchiveSecondaryView.ts:40-69`.

The actual path is `TreeProviderViewModel`, not `CategoryViewImpl`:

- `TreeProviderViewImpl` constructs a native `TreeView` in
  `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:170-175`,
  claims it, and mounts it. Its state projection is already an explicit
  `bind()` at `:110-121`, and it constructs native search/message controls at
  `:185-230` and `:257-274`.
- Its model props and callbacks are the archive-compatible provider path at
  `TreeProviderViewImpl.ts:276-325`; `onModel` receives the
  `TreeProviderViewModel` through `TreeProviderViewModel.setTreeModel`.
- `TreeProviderViewImpl.ts:1-2` uses React only as a type import, and the file
  has no `mountReactHandle` call. Its only archive-facing imperative methods
  are exposed by `TreeProviderViewModel` at `TreeProviderViewModel.ts:290-302`
  (`setTreeModel`, `collapseAll`) and `:306-399` (`buildTree`).
- The React root at `CategoryViewImpl.ts:299-307` is specifically created for
  its `renderItems` prop. Archive never enters that path: its old JSX passes
  `provider`, click callbacks, and `onModel` to `TreeProviderView` at
  `ArchiveEditorView.tsx:81-86`, with no category `renderItems` prop.

Consequently, direct `TreeProviderViewImpl` composition retains no
`mountReactHandle` root. The archive editor's intended live measurement is
`0` `[data-react-root]` elements and `0` `[data-part="react-slot"]` elements;
the latter is also protected by using one persistent `display: contents` span
for the two toolbar buttons instead of a React fragment.

### Native replacements

Every React primitive in the old surface has a direct native equivalent:

| Old site | Native replacement |
|---|---|
| `Panel` at `ArchiveEditorView.tsx:38-47` | The stable editor root from `createPanelElement`; append `createTextElement("No archive loaded.", { color: "light" })` during `onMount()`. |
| `Panel` at `:51-57` | The same stable root, with `applyPanelAttributes`/`resolvePanelAttributes` used to preserve the loaded `archive-root` attributes. |
| `PageToolbar` at `:58-80` | `new PageToolbarView(...)` from `../base/PageToolbarView`, with `borderBottom: true`, `name: "archive-toolbar"`, and a persistent `display: contents` button host as `rightContributions`. |
| Collapse `<IconButton>` at `:64-70` | `new IconButtonView({ name: "archive-collapse-all", size: "sm", title: "Collapse All", icon: "collapse-all", onClick: ... })`. |
| Refresh `<IconButton>` at `:71-77` | `new IconButtonView({ name: "archive-refresh", size: "sm", title: "Refresh", icon: "refresh", onClick: ... })`. |
| `TreeProviderView` at `:81-86` | `new TreeProviderViewImpl({ provider, onModel, onItemClick, onItemDoubleClick })`. |

`PageToolbarViewProps` already declares both `children` and
`rightContributions` as `SlotContent` at
`src/renderer/editors/base/PageToolbarView.ts:20-28`, so no prop widening is
needed. `PageToolbarView` creates `page-toolbar-right` as a
`display: contents` span at `src/renderer/editors/base/PageToolbarView.ts:68-72`
and inserts that host into the row at `:385-406`; there is no separate
right-host stylesheet, while `EditorToolbarView.ts:12-25` establishes the row
direction and gap. Use the same persistent `display: contents` span locally,
append both button roots to it, and pass that span as `rightContributions`.
`fillSlot` accepts a `Node` arm at `src/renderer/uikit/shared/fill-slot.ts:43-49`
and re-appends it without creating a React root at `:125-140`. The span
survives repeated `fillSlot` calls; a `DocumentFragment` must not be used
because appending it moves its children out and empties the fragment. The
native IconButton path is available at
`src/renderer/uikit/IconButton/IconButtonView.tsx:16-54`, and its stylesheet is
imported by the view itself at `:9-12`.

`createPanelElement` imports `Panel.css` directly at
`src/renderer/uikit/Panel/panel-style.ts:1-4`; `createTextElement` imports
`Text.css` through `src/renderer/uikit/Text/text-style.ts:1-2` and applies the
native text attributes at `:79-107`. No new archive stylesheet is required.

### Export/import audit

The source audit found the following load-bearing edges:

| Export or module edge | Verified importer/use | Plan |
|---|---|---|
| `archiveModule` | Dynamic registry loader `src/renderer/editors/register-editors.ts:163-166` loads `./archive` for `archive-view`. | Preserve the extensionless dynamic import and module export. |
| `ArchiveEditor` from the archive barrel | `src/renderer/editors/category/CategoryEditor.tsx:22,34-40` uses it for the `instanceof` tree-provider-host check. | Preserve the value export from `index.ts`. |
| `ArchiveEditor` / `ArchiveEditorState` from `./ArchiveEditor` | `ArchiveSecondaryView.ts:14-15` imports the model type; the converted view also needs the class guard. | Do not change `ArchiveEditor.ts`; preserve the index re-exports. |
| `makeArchiveEditor` | Only `archive/index.tsx:3,16` imports it; no external importer was found. | Keep the factory export in the renamed view file unless the implementation moves it without changing behavior. |
| `getDefaultArchiveEditorState`, `ArchiveEditorModel`, `ArchiveEditorModelState` | No external source importer was found. | Preserve all existing public index exports for compatibility and future dynamic consumers. |
| `ArchiveEditorView` | No external source importer was found; the registry consumes `View` through the module object. | Export the native class under `ArchiveEditorView`; retain the file's compatibility exports only where they remain meaningful. |

`ArchiveSecondaryView` is registered independently by
`src/renderer/editors/register-editors.ts:12-16`, so converting the main editor
must not modify that file or the secondary view.

## Implementation Plan

### 1. Replace the React archive surface with a native view

- Rename `src/renderer/editors/archive/ArchiveEditorView.tsx` to
  `src/renderer/editors/archive/ArchiveEditorView.ts` and remove React imports,
  JSX, hooks, and the React `ArchiveEditorView` function.
- Define a public `ArchiveEditorView extends
  VanillaView<{ model: EditorModel }>` and validate the generic model with an
  `instanceof ArchiveEditor` helper, following the constructor contract used by
  `src/renderer/editors/image/ImageView.ts:20-34`.
- In the constructor create only one stable Panel root. Do not construct child
  views, install listeners, bind state, or start work in the constructor. The
  root must be a `createPanelElement` result, not `createContentsRoot()`.
- In `onMount()`, apply the loaded or empty Panel attributes, then preserve the
  existing two branches. For no provider, append the native Text message and
  stop. For a provider, construct and claim exactly two `IconButtonView`s,
  one `PageToolbarView`, and one `TreeProviderViewImpl` with `this.child(...)`.
- Create one persistent local `display: contents` span for the two button
  roots, append both roots to that span, and pass the same span to
  `PageToolbarView.rightContributions` on mount and every update. This preserves
  direct button children of the toolbar's right slot across its unconditional
  `fillSlot` calls. Append the page-toolbar root before the tree root, then
  mount each claimed child exactly once. The tree's `onModel` callback stores
  the `TreeProviderViewModel` used by collapse and refresh.
- Use class methods that preserve the old behavior: item clicks and double
  clicks call `app.events.openRawLink.sendAsync(createLinkData(...))` with the
  current provider navigation URL, current page id fallback, and
  `sourceId: this.model.id`; collapse calls `treeModel?.collapseAll()` and
  refresh calls `void treeModel?.buildTree()`.
- Do not add a custom `onDispose()`. The base `VanillaView` disposes all
  children claimed with `this.child(...)`; `VanillaView.ts:71-80` also makes
  pre-mount `onUpdate()` guards unnecessary.

### 2. Preserve the empty and loaded Panel projections

- Keep the loaded attributes from `ArchiveEditorView.tsx:51-57` exactly:
  `name: "archive-root"`, `direction: "column"`, `flex: 1`,
  `overflow: "hidden"`, and `background: "default"`.
- Keep the no-provider attributes from `:38-45` exactly, including xl padding,
  but append the native text element during `onMount()` so constructor work
  remains limited to the stable root.
- If the implementation supports an already-mounted model changing provider,
  update the existing root attributes without replacing the root. Normal open
  and restore paths have the provider ready before mount as documented above;
  do not solve this by creating children in `onUpdate()` or by adding a second
  ownership path.

### 3. Register the native View arm and retain exports

Rename `src/renderer/editors/archive/index.tsx` to
`src/renderer/editors/archive/index.ts`.

```tsx
// Before: src/renderer/editors/archive/index.tsx:7-18
function ArchiveEditorComponent({ model }: { model: EditorModel }) {
    return <ArchiveEditorView model={model as ArchiveEditor} />;
}

export const archiveModule: EditorModule = {
    createEditor: () => new ArchiveEditor(/* existing state */),
    Component: ArchiveEditorComponent,
    newEditorModel: async (filePath) => { /* existing factory */ },
};
```

```ts
// After: src/renderer/editors/archive/index.ts
export const archiveModule: EditorModule = {
    createEditor: () =>
        new ArchiveEditor(new TComponentState(getDefaultArchiveEditorState())),
    View: ArchiveEditorView,
    newEditorModel: async (filePath?: string) => {
        const model = makeArchiveEditor();
        if (filePath) await model.initFromArchive(filePath);
        return model as unknown as EditorModel;
    },
};
```

- Remove `ArchiveEditorComponent` and all JSX from the index.
- Preserve `createEditor`, `newEditorModel`, `makeArchiveEditor`, and the
  existing `ArchiveEditor`, `getDefaultArchiveEditorState`,
  `ArchiveEditorState`, `ArchiveEditorModel`, and `ArchiveEditorModelState`
  exports. Do not alter the model construction or archive initialization.
- Keep the dynamic registry edge at `register-editors.ts:165` unchanged.

### 4. Verify the conversion boundary

- Source-check that `archiveModule` has `View: ArchiveEditorView` and no
  `Component`, and that both archive files are `.ts` with no JSX or React hook
  imports.
- Source-check that the old `TreeProviderView` compatibility face,
  `mountReactHandle`, `mountReact`, and `fillSlot` React-valued contributions
  are not used by the converted archive view.
- Confirm the tree path is `TreeProviderViewImpl` → `TreeProviderViewModel` →
  native `TreeView`, not `CategoryViewImpl`; the category `renderItems` root at
  `CategoryViewImpl.ts:300` must remain out of this task.
- Open an archive through the real file-open path and inspect the editor
  subtree for zero `[data-react-root]` and zero `[data-part="react-slot"]`.
  Confirm the archive tree loads, item single/double click navigation retains
  `sourceId`, Collapse All and Refresh remain functional, and the no-provider
  message still renders when applicable.
- Run the existing type/lint checks proportionate to the changed TypeScript;
  do not add unit tests, a test harness, or a new measurement tool.

## Concerns

### Resolved: archive does not use the `CategoryViewImpl` React island

`CategoryViewImpl.ts:278-355` owns the folder-content renderer and creates its
React root only at `:299-307` for `props.renderItems`. Archive's old surface
passes the generic tree-provider props at `ArchiveEditorView.tsx:81-86`, and
the direct replacement is `TreeProviderViewImpl`, whose implementation has no
`mountReactHandle`. The zero-root claim therefore remains valid for archive.

### Resolved: no archive-view `bind()` is required

The old archive surface contains no `state.use(...)` selector to migrate. Its
tree provider owns and binds its own internal state (`TreeProviderViewImpl.ts:
110-121`), while archive navigation and reveal state are consumed by the
already-native `ArchiveSecondaryView.ts:60-69`. Adding a speculative binding to
`archiveUrl` would introduce a new lifecycle/reconciliation path rather than
replace an old React subscription; the implementation should bind no archive
state unless a concrete state-backed read is introduced.

### Resolved: use the Panel root, not `display: contents`

The old React component contributes one outer Panel in both branches, not a
fragment of page-column siblings. Adopting its native Panel root preserves the
single flex item and its styling. A local `createContentsRoot()` would discard
that outer Panel's layout contract and is not part of this task.

### Resolved: toolbar contributions must be a native Node

`PageToolbarView` accepts `SlotContent`, but `fillSlot` treats non-string,
non-`Node` values as React content and `PageToolbarView.onUpdate()` re-fills
`rightHost` unconditionally at `src/renderer/editors/base/PageToolbarView.ts:
420-427`. Never pass a `DocumentFragment` to a slot: the first append moves its
children out and leaves it empty, so the next unconditional refill removes the
buttons permanently. Use a persistent node — here a local `display: contents`
span — that remains the owner of both button roots and can be appended again.
This is a general EPIC-068 rule for every future multi-node contribution: a slot
value must survive being appended more than once. The persistent node keeps the
contribution slot and the entire archive editor free of nested React roots.

### Non-goals and protected files

- Do not modify `src/renderer/editors/archive/ArchiveEditor.ts` or
  `src/renderer/editors/archive/ArchiveSecondaryView.ts`.
- Do not modify `TreeProviderViewImpl`, `TreeProviderViewModel`,
  `CategoryViewImpl`, `PageToolbarView`, or any UIKit primitive; all required
  native arms already exist.
- Do not convert the secondary archive panel, the `CategoryViewImpl` path, or
  the `PageToolbar` implementation itself.
- Do not add tests or a test harness, change the dashboard, run completion
  workflows, or create a commit.

## Acceptance Criteria

- `src/renderer/editors/archive/index.ts` exists, registers
  `View: ArchiveEditorView`, has no `Component`, and preserves the existing
  factory and index exports.
- `src/renderer/editors/archive/ArchiveEditorView.ts` is a public native
  `VanillaView` with no JSX, React hooks, `mountReactHandle`, or React-valued
  toolbar contribution.
- The view owns one stable native Panel root. It preserves the loaded
  `archive-root` and no-provider Panel projections, and does not add a local
  `display: contents` root.
- The loaded branch claims and mounts one `PageToolbarView`, two native
  `IconButtonView`s, and one `TreeProviderViewImpl`; the toolbar precedes the
  tree and the two buttons are supplied through one persistent local
  `display: contents` span that is safe across repeated slot refills.
- The native tree path reaches `TreeProviderViewModel` and native `TreeView`,
  never `CategoryViewImpl`; no `mountReactHandle` root is created for archive.
- The exhaustive old-view state-use inventory remains explicit: there were no
  `state.use(...)` reads in `ArchiveEditorView.tsx`, so no such read is lost.
- Archive item navigation, collapse-all, refresh, provider-empty messaging,
  and model/page/source id behavior remain equivalent to the old React surface.
- A real archive editor reports `0` `[data-react-root]` and `0`
  `[data-part="react-slot"]` elements in its editor subtree.
- `ArchiveEditor.ts`, `ArchiveSecondaryView.ts`, the dashboard, and unrelated
  tree-provider/category files are unchanged. No tests, harness, or commit is
  created.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/archive/ArchiveEditorView.tsx` → `src/renderer/editors/archive/ArchiveEditorView.ts` | Replace the React surface with the native Panel-rooted `ArchiveEditorView`; compose native toolbar buttons and `TreeProviderViewImpl`; preserve exports and behavior. |
| `src/renderer/editors/archive/index.tsx` → `src/renderer/editors/archive/index.ts` | Remove `Component`, register `View: ArchiveEditorView`, and preserve model factory and public exports. |

Files that need no changes: `src/renderer/editors/archive/ArchiveEditor.ts`,
`src/renderer/editors/archive/ArchiveSecondaryView.ts`,
`src/renderer/components/tree-provider/TreeProviderViewImpl.ts`,
`src/renderer/components/tree-provider/TreeProviderViewModel.ts`,
`src/renderer/components/tree-provider/CategoryViewImpl.ts`,
`src/renderer/editors/base/PageToolbarView.ts`,
`src/renderer/uikit/Panel/panel-style.ts`,
`src/renderer/uikit/IconButton/IconButtonView.tsx`,
`src/renderer/uikit/Text/text-style.ts`,
`src/renderer/ui/app/PageContentView.ts`,
`src/renderer/ui/app/Pages.css`,
`src/renderer/ui/app/RenderEditorView.ts`,
`src/renderer/ui/app/AsyncEditorView.ts`,
`src/renderer/editors/register-editors.ts`, and `doc/active-work.md`.
