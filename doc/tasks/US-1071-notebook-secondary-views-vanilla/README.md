# US-1071 — Notebook secondary views on the vanilla arm

## Goal

Convert the notebook editor's `notebook-categories` and `notebook-tags` secondary-view
providers to public `VanillaView<SecondaryViewProps>` classes and register both with
`arm: "vanilla"`. Remove the notebook-only React projections they replace while preserving
selection, filtering, counts, category drag/drop, header behavior, and panel lifetime semantics.

The secondary goal is to close the notebook editor's remaining secondary-view `.tsx` files. After
this task, the exact `.tsx` list directly under `src/renderer/editors/notebook` should be only
`index.tsx` and `NotebookBody.tsx`. `NotebookBody.tsx` must remain: it is still imported by
`index.tsx` and is the React-facing `mountVanilla(NotebookBodyView, props)` adapter added by
EPIC-062, not a dead duplicate of `NotebookBodyView.ts`.

## Background

### Verified current surface

The two registrations in `src/renderer/editors/register-editors.ts` currently retain the React
default because neither definition has an `arm` field:

```ts
secondaryViewRegistry.register({
    id: "notebook-categories",
    label: "Categories",
    loadComponent: () => import("./notebook/panels/NotebookCategoriesSecondaryView"),
});

secondaryViewRegistry.register({
    id: "notebook-tags",
    label: "Tags",
    loadComponent: () => import("./notebook/panels/NotebookTagsSecondaryView"),
});
```

The root-level `.tsx` inventory from `Get-ChildItem src/renderer/editors/notebook -Filter *.tsx`
is currently:

| File | Lines | Finding |
|---|---:|---|
| `category-tree.tsx` | 82 | Shared only by the categories panel at runtime and `NotebookEditor.ts` for its `CategoryItem` type and category handlers; no other React caller exists. |
| `index.tsx` | 125 | Remains the notebook editor module's React boundary. |
| `NotebookBody.tsx` | 12 | Remains imported by `index.tsx`; thin `mountVanilla` adapter over `NotebookBodyView`. |
| `TagsListView.tsx` | 273 | Imported only by `NotebookTagsSecondaryView.tsx`; contains the remaining notebook list hooks and JSX row projection. |

The two panel files are nested under `panels/` and are 80 lines (`NotebookCategoriesSecondaryView.tsx`)
and 34 lines (`NotebookTagsSecondaryView.tsx`). Both use a type guard, `SideBarPanelHeader`, and
React JSX. The categories body uses `useMemo` and three `useCallback` projections over
`editor.state`; the tags body uses `useState`, `useEffect`, and `useMemo` through `TagsListView`.
Those hooks are conversion residue and are absorbed into view fields, explicit state subscriptions,
and existing vanilla child views; they are not a separate state-management task.

### Existing patterns and verified precedents

`src/renderer/editors/explorer/SearchSecondaryView.ts` is the authoritative provider shape. It has
a public constructor, extends `VanillaView<SecondaryViewProps>`, creates its body/header handle in
the lifecycle-aware native path, mounts children in `onMount()`, forwards all new props in
`onUpdate()`, and disposes both body and header. The notebook providers should follow that shape
but must obey `src/renderer/uikit/CLAUDE.md`'s stricter rule that constructors do not create child
DOM, install listeners, or start subscriptions; create the `TreeView`/`CategoryListView` children
from `onMount()`.

The host contract in `SecondaryViewsView` uses `alwaysRenderContent: true`, publishes `headerRef`
after the panel is created, and routes vanilla content through `LazySecondaryViewView`. Therefore:

- Call `createSideBarPanelHeader` from `SideBarPanelHeaderView.ts` with `props.headerRef`, then
  call its `update()` on every provider update. Do not cache the header element or use
  `createPortal`; the header handle tracks and re-parents a late or changed ref.
- Treat `expanded` as an input even though these two panels have no header action buttons. A
  collapsed panel remains mounted; `onUpdate()` must continue updating the body/header projection
  and must not dispose or skip the child merely because `expanded === false`.
- Depend on US-1069's already-in-flight DOM icon arm. Neither registration has an icon override.
  `SecondaryViewProps` currently names that native field `iconElement?: Node`,
  `SecondaryViewsView.lazyViewProps()` passes `record.iconElement`, and
  `SideBarPanelHeaderDomProps.icon` is `Node | undefined`. The providers must pass
  `props.iconElement` rather than a React `EditorIcon` element; there is no registry-name arm to
  validate in this native header path.

The icon audit is explicit. `NotebookEditor` extends `TextHostEditorModel` without overriding its
inherited `noLanguage = false`, `getIconElement`, or `getIcon`. Its `untitledName()` is
`untitled.note.json`; for a notebook title, `createEditorIconElement()` first finds no
`getIconElement()` result, then takes the `!source.noLanguage` branch and calls
`createFileTypeIconElement({ language, fileName: title })`. The language/file-name resolver maps
`*.note.json` to `NotebookIcon`, so the header receives that DOM element. The category tree's
built-in `TreeItemView` chevrons use `chevron-down` and `chevron-right`; both are entries in
`src/renderer/theme/icon-registry.ts`. The tags drill-in/back controls use `chevron-right` and
`chevron-left`; both are also registered. No other glyph is created by either provider.

EPIC-062 is the close notebook precedent. `NotebookBodyView.ts` directly owns the notebook body,
state subscription, virtual grid, expanded overlay, and `NoteItemView` children. `NoteItemView.ts`
likewise owns its DOM and native child views. Neither file needs to change for this task. The
current `NotebookBody.tsx` is intentionally the remaining React-facing shim:

```tsx
export function NotebookBody(props: NotebookBodyProps): React.ReactElement {
    return mountVanilla(NotebookBodyView, props);
}
```

### Shared projections

`category-tree.tsx` has no other React importer. Its only runtime consumer is the categories panel;
`NotebookEditor.ts` imports `CategoryItem` and calls `categoryItemClick`, `getCategoryDragData`,
and `categoryTraitDrop`. Convert the file to `category-tree.ts` without changing that public data
shape or the category sorting, slash-path nesting, root `All` item, or count lookup.

The current rich label is React JSX:

```tsx
function renderLabel(name: string, size: number | undefined): React.ReactNode {
    return (
        <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                {name}
            </span>
            {size !== undefined && (
                <span style={{ marginLeft: 4, fontSize: 12, color: color.text.light }}>
                    {size}
                </span>
            )}
        </span>
    );
}
```

The native replacement should create the equivalent label node with `createPanelElement` and
`createTextElement` (including truncation, small count text, and the light text color). Before
converting this helper, widen the Tree slot declarations minimally so the type matches the already
correct runtime: add `Node` to `ITreeItem.label` and `TreeProps.renderTrailing`, then mirror that
union in `TreeItemProps.label`/`trailing`, `TreeItemView.setLabel`/`setTrailing`, and
`SectionItemProps.label`. `SectionItemView` consumes the widened `SectionItemProps`; `ListItem` is
not in this type path and must not be changed. This is a strict `React.ReactNode | Node` widening,
not a change to `IconRef`, `SlotText`, or `fill-slot.ts`, and it also gives US-1070's link-category
count a typed direct-DOM `renderTrailing` arm. After the widening, pass the node through the
existing Tree label slot; `fillSlot()` appends it without a React root.

`TagsListView.tsx` has only one importer and duplicates the already-vanilla
`src/renderer/uikit/CategoryList/CategoryListView.ts` projection. The two implementations were
checked for the relevant behavior: simple tags and separator groups are sorted by name, grouped
parents expose children, the parent/back row is selected correctly, `getCount` receives the root,
parent, or full child value, and external values re-synchronise the expanded parent. Reuse
`CategoryListView` directly from the vanilla tags provider and delete the notebook duplicate; do
not create a second bespoke list view. Its existing `CategoryList.css` supplies the native row,
count, chevron, sticky parent, and focus-selection styling.

## Implementation Plan

1. **Move both registrations to the vanilla arm.** Modify only the two notebook entries in
   `src/renderer/editors/register-editors.ts`; retain their literal dynamic imports, ids, labels,
   and import paths. The non-obvious change is:

   ```ts
   // Before
   label: "Categories",
   loadComponent: () => import("./notebook/panels/NotebookCategoriesSecondaryView"),

   // After
   label: "Categories",
   arm: "vanilla",
   loadComponent: () => import("./notebook/panels/NotebookCategoriesSecondaryView"),
   ```

   Apply the same `arm: "vanilla"` insertion to `notebook-tags`. Do not modify the registry
   contract, `SecondaryViewsView`, `LazySecondaryViewView`, or US-1069's icon work in this task.

2. **Widen the Tree DOM-compatible slot declarations.** Modify only the shared Tree declarations
   and their direct mirrors needed for the compiler to accept the existing `fillSlot()` Node arm:
   `src/renderer/uikit/Tree/types.ts` (`ITreeItem.label` and `TreeProps.renderTrailing`),
   `src/renderer/uikit/Tree/TreeItem.tsx` (`TreeItemProps.label` and `trailing`),
   `src/renderer/uikit/Tree/TreeItemView.ts` (`setLabel` and `setTrailing` parameters), and
   `src/renderer/uikit/Tree/SectionItem.tsx` (`SectionItemProps.label`). Keep each union as
   `React.ReactNode | Node`; do not restructure `slots.ts`, touch `IconRef`/`SlotText`, or modify
   `ListItem`. The imported widened type is sufficient for `SectionItemView.ts`; no separate
   implementation change is planned there unless the compiler identifies one. This strict
   widening preserves every existing React caller and provides the direct-DOM arm needed by this
   task and US-1070.

   Run typecheck after this isolated widening. If the compiler reports a dependency beyond these
   Tree declarations and their direct mirrors, stop and record the exact file rather than widening
   another shared slot speculatively.

3. **Convert `category-tree.tsx` to `category-tree.ts`.** Remove the runtime React import and
   replace `renderLabel()` with a DOM helper. Preserve `CategoryItem`, `CategoriesMap`,
   `buildChildren()`, and `buildCategoryTreeItems()`'s exact value construction and sorting. The
   resulting items must remain accepted by the existing direct `TreeView` path, with no
   `renderItem` React slot and no React root for a label or count.

   The resulting projection should be equivalent to:

   ```ts
   // After: native label projection (shape abbreviated only for the snippet)
   function createCategoryLabel(name: string, size: number | undefined): ITreeItem["label"] {
       const label = createPanelElement({
           name: "notebook-category-label",
           direction: "row",
           align: "center",
           flex: true,
           width: 0,
           overflow: "hidden",
           gap: "sm",
       });
       label.append(createTextElement(name, { truncate: true }));
       if (size !== undefined) {
           const count = createTextElement(String(size), { color: "light", size: "sm" });
           count.style.flexShrink = "0";
           label.append(count);
       }
       return label;
   }
   ```

   The implementation must use the existing token/style helpers and the verified `Node` arm of
   `fillSlot`; it must not recreate the old React inline-style tree.

4. **Convert `NotebookCategoriesSecondaryView.tsx` to a vanilla provider.** Rename it to
   `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts` and export a default
   class extending `VanillaView<SecondaryViewProps>` with a public constructor. The constructor may
   create only the stable body root; `onMount()` must create and mount the `TreeView<CategoryItem>`.

   Preserve the current `NotebookEditor` guard and wire the same projection into `TreeView`:
   `categories` plus `categoriesSize` rebuild the items through
   `buildCategoryTreeItems(state.categories, editor.getCategorySize)`, `selectedCategory` drives
   `isSelected`, `categoryItemClick` handles selection, and `getCategoryDragData`,
   `TraitTypeId.NotebookCategory`, `acceptsDrop`, `canTraitDrop`, and `categoryTraitDrop` retain the
   existing trait behavior. Keep `defaultExpandAll` and `focusSelection`.

   Own the tree and its subscription with the vanilla lifecycle. On a state notification, update
   the tree props rather than replacing its root. On model identity changes, retire/rebuild the
   child safely, matching the explicit disposal requirements of `VanillaView`; ordinary header
   changes must not rebuild the tree. Update the `SideBarPanelHeaderHandle` in both `onMount()` and
   `onUpdate()`, including `headerRef`, native icon, title `Categories`, and the current
   `expanded` input. There are no actions to render, so collapsed state changes the stack only and
   never unmounts the body.

5. **Remove the duplicate React tags list.** Delete
   `src/renderer/editors/notebook/TagsListView.tsx` after changing its sole importer. Its
   `useState`/`useEffect`/`useMemo` behavior is absorbed by the already-vanilla
   `CategoryListView`'s `expandedFromProps`, row projection, `KeyedList`, and native click
   handlers. Do not preserve a React-facing signature because the importer audit found no other
   React caller.

6. **Convert `NotebookTagsSecondaryView.tsx` to a vanilla provider.** Rename it to
   `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts` and export a default
   `VanillaView<SecondaryViewProps>` class. In `onMount()`, create and mount one owned
   `CategoryListView` with the mapped props:

   ```ts
   // Before
   <TagsListView
       tags={state.tags}
       value={state.selectedTag}
       onChange={editor.setSelectedTag}
       getCount={editor.getTagSize}
   />

   // After
   new CategoryListView({
       items: state.tags,
       value: state.selectedTag,
       onChange: editor.setSelectedTag,
       getCount: editor.getTagSize,
   })
   ```

   Map `tags` to `items`, retain the default `:` separator and `All` root label, and forward new
   state projections through `list.update()` rather than constructing a new list for every state
   change. Preserve the `NotebookEditor` guard and dispose the list and header handle. Update the
   header on every provider update with the late/changing `headerRef`, native icon, title `Tags`,
   and `expanded`; do not dispose the body when collapsed.

7. **Verify the post-conversion notebook inventory and importer graph.** After the renames/deletion,
   run `Get-ChildItem src/renderer/editors/notebook -File -Filter *.tsx | Sort-Object Name` and
   record/verify exactly:

   ```text
   index.tsx
   NotebookBody.tsx
   ```

   Re-run `rg` for `category-tree`, `TagsListView`, and `NotebookBody`. `NotebookBody.tsx` must
   remain imported by `src/renderer/editors/notebook/index.tsx`; no deletion is planned. Confirm
   that neither converted provider imports React, `SideBarPanelHeader.tsx`, `createPortal`, or a
   React `renderItem` projection.

8. **Verify behavior before handoff.** Run the project's typecheck, lint, and production build
   commands. Manually exercise a notebook with categories and tags: initial render, selecting
   root/leaf/parent values, category expansion, tag drill-in/back navigation, count updates,
   category trait drag/drop, collapsed-to-expanded panel transitions, late header publication,
   panel reopening/removal, and notebook note editing after switching panels. Inspect the sidebar
   for `[data-part="react-slot"]` under these two panels; the converted body/header paths should
   not create React roots.

## Concerns

- **US-1069 sequencing:** both registrations rely on the predecessor's DOM editor-icon fallback
  because neither has an icon override. The current native path is `SecondaryViewProps.iconElement`
  → `LazySecondaryViewView` → `SideBarPanelHeaderDomProps.icon: Node | undefined`; pass that field
  directly and do not change `resolveIcons`, add an override, or reintroduce the React `EditorIcon`
  fallback here.
- **Tree label typing:** the runtime Node arm was already correct, but the declaration was narrow.
  Widen the Tree label/trailing slots and their direct mirrors as Implementation Plan step 2; do
  not hide the mismatch with `as unknown as`. Verify the resulting label and count are direct DOM
  children and that no `react-slot` is created. `ListItem` is outside this dependency path.
- **Late header and collapsed panels:** `headerRef` can be `null` on the first update and can later
  change. Always call the header handle's `update()` with the latest ref. `expanded` is not a mount
  condition; these providers have no actions to drop, so they remain mounted and continue receiving
  state/header updates while collapsed.
- **Child ownership:** panel-record views are repeatedly created and retired by the secondary-view
  host. Use explicit child disposal/removal for a replaced tree/list and header disposal; do not
  assume `VanillaView.dispose()` detaches a root or use append-only ownership for a child whose
  lifetime can change.
- **Behavioral parity of the tags reuse:** `CategoryListView` is already vanilla and its verified
  grouping/drill/count/selection projection matches `TagsListView`. The implementation should
  keep this reuse; if a difference is found during the required manual pass, fix the mapping in
  the notebook provider rather than reintroducing a React list.
- **Scope boundary:** `NotebookBody.tsx`, `NotebookBodyView.ts`, `NoteItemView.ts`, the notebook
  editor model, the secondary-view host/loader, the React header face, and the dashboard/epic docs
  are not part of this task. The dashboard already lists US-1071, and this document must not add a
  second entry.

## Acceptance Criteria

- `notebook-categories` and `notebook-tags` in
  `src/renderer/editors/register-editors.ts` both retain their literal dynamic imports and have
  `arm: "vanilla"`.
- `NotebookCategoriesSecondaryView.ts` and `NotebookTagsSecondaryView.ts` each default-export a
  public `VanillaView<SecondaryViewProps>` class and do not import React, `SideBarPanelHeader.tsx`,
  or `createPortal`.
- The categories provider preserves the exact category projection, selection callbacks, default
  expansion/focus behavior, trait drag data, drop predicates, and drop handler using direct
  `TreeView`/UIKit DOM views.
- The Tree slot widening is limited to `ITreeItem.label`, `TreeProps.renderTrailing`, the matching
  `TreeItemProps` fields, `TreeItemView.setLabel`/`setTrailing`, and `SectionItemProps.label`;
  `ListItem`, `IconRef`, `SlotText`, and `fill-slot.ts` are unchanged.
- `category-tree.ts` preserves the existing `CategoryItem` API and category nesting/sorting/counts,
  but its labels are native DOM nodes and do not use JSX, `style` React props, or a React slot.
- `TagsListView.tsx` is gone; its sole notebook caller uses the existing vanilla
  `CategoryListView` and preserves tag grouping, `:` drill-in/back behavior, selection, root label,
  and counts. No React hook remains in the converted notebook secondary-view path.
- Both headers are built with `createSideBarPanelHeader` against the latest `headerRef`, including
  `null` and ref changes; they pass `iconElement`, and the native notebook fallback resolves via
  the non-language file-type arm to `NotebookIcon`. All explicit chevrons are covered by the
  verified DOM/icon paths listed in Background.
- `expanded === false` leaves both bodies mounted and does not leave stale header content; updates
  continue to be processed while the panels are collapsed.
- The root-level notebook `.tsx` inventory is exactly `index.tsx` and `NotebookBody.tsx`.
  `NotebookBody.tsx` remains imported by `src/renderer/editors/notebook/index.tsx` and remains the
  `NotebookBodyView` mount adapter.
- No changes are made to `NotebookBody.tsx`, `NotebookBodyView.ts`, `NoteItemView.ts`,
  `NotebookEditor.ts`, the existing vanilla `CategoryListView`/`TreeView` behavior, the shared
  secondary-view host/header infrastructure, `doc/active-work.md`, or `doc/epics/EPIC-063.md`.
- Typecheck, lint, production build, manual notebook interaction checks, and the sidebar
  `react-slot` inspection pass without a regression. This planning task itself implements no
  source behavior and creates no commit.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/register-editors.ts` | Add `arm: "vanilla"` to the two notebook secondary-view registrations. |
| `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.tsx` → `.ts` | Replace the React provider with a `VanillaView` that owns `TreeView` and the native header handle. |
| `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.tsx` → `.ts` | Replace the React provider with a `VanillaView` that owns `CategoryListView` and the native header handle. |
| `src/renderer/editors/notebook/category-tree.tsx` → `.ts` | Replace JSX labels with direct DOM label nodes while preserving the shared `CategoryItem` builder API. |
| `src/renderer/editors/notebook/TagsListView.tsx` | Delete the duplicate React list; reuse existing vanilla `CategoryListView`. |
| `src/renderer/editors/notebook/index.tsx` | No change; continues importing the `NotebookBody` adapter. |
| `src/renderer/editors/notebook/NotebookBody.tsx` | No change; still the live React-facing `mountVanilla` boundary. |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | No change; EPIC-062 vanilla body precedent remains the owner. |
| `src/renderer/editors/notebook/NoteItemView.ts` | No change; EPIC-062 vanilla note-row precedent remains the child implementation. |
| `src/renderer/editors/notebook/NotebookEditor.ts` | No change; existing category types and callbacks remain the provider API. |
| `src/renderer/uikit/CategoryList/CategoryListView.ts` | No change; reused directly for the tags projection. |
| `src/renderer/uikit/Tree/types.ts` | Widen `ITreeItem.label` and `TreeProps.renderTrailing` from React-only slots to `React.ReactNode | Node`. |
| `src/renderer/uikit/Tree/TreeItem.tsx` | Mirror the strict `Node` widening on `TreeItemProps.label` and `trailing`. |
| `src/renderer/uikit/Tree/TreeItemView.ts` | Mirror the widening on `setLabel` and `setTrailing`; retain the existing `fillSlot` DOM arm. |
| `src/renderer/uikit/Tree/SectionItem.tsx` | Mirror the strict `Node` widening on `SectionItemProps.label`. |
| `src/renderer/uikit/Tree/TreeView.ts`, `src/renderer/uikit/Tree/SectionItemView.ts`, `src/renderer/uikit/Panel/panel-style.ts`, `src/renderer/core/traits/**` | No behavior/source change planned; they consume the widened types or existing vanilla paths as-is. |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts`, `SecondaryViewsView.ts`, `LazySecondaryViewView.ts` | No change; the providers consume the existing native header/host contract and US-1069's DOM icon arm. |
| `doc/active-work.md`, `doc/epics/EPIC-063.md` | No change; US-1071 is already listed and the user explicitly excluded a dashboard entry. |
