# US-1062 — Convert `LinksList` to `VirtualGridView`

Epic: [EPIC-062 — De-React Epic E4](../../epics/EPIC-062.md)  
Status: investigation and implementation plan only; no implementation is in scope.

## Goal

Convert `src/renderer/editors/link-editor/LinksList.tsx` from the React `RenderGrid` engine to
the vanilla `VirtualGridView` engine, including its private `LinksListRow` cell subtree. Preserve
the existing consumer call surface and keep the React face as a one-line `mountVanilla` adapter,
while applying E4-9's narrow model capability and E4-10's DOM icon-name migration and establishing
the recycled-cell parts record required by EPIC-062 E4-7.

The dashboard already contains the EPIC-062 / US-1062 entry. It is intentionally unchanged.

## Background

### Existing consumer and the React engine

`LinksList` currently imports `RenderGrid`/`RenderGridModel` and React-only cell parameter types
at `src/renderer/editors/link-editor/LinksList.tsx:1-4`. Its public props are declared at
`src/renderer/editors/link-editor/LinksList.tsx:171-212`; the component owns a grid model ref,
the measured width, and the favicon version at `LinksList.tsx:221-229`. The React grid is mounted at
`src/renderer/editors/link-editor/LinksList.tsx:292-302`.

The private `LinksListRow` is in the same file at `src/renderer/editors/link-editor/LinksList.tsx:22-168`
and has no other importer (the only `LinksListRow` definition/reference search is in that file).
Per EPIC-062 E4-4 it converts with the host in this task.

The current cell renderer returns a new React subtree when its coordinate is dirty or newly
visible (`src/renderer/editors/link-editor/LinksList.tsx:239-270`). The returned cell is an outer
`<div>` carrying the grid style, padding, flex alignment, and a nested row. `LinksListRow` then
renders a flex wrapper, a `Panel`, and a `ListItem` with the link icon, label, tooltip, trailing
actions, selection, click, context-menu, and drag behavior (`LinksList.tsx:122-168`).

### The vanilla engine and the actual cell call contract

`VirtualGridView` constructs `VirtualGridModel` with the pool acquire function and attaches the
model to the DOM in `src/renderer/uikit/VirtualGrid/VirtualGridView.ts:145-169,202-223`.
`VirtualGridModel` exposes `setOptions`, `update`, `scrollToRow`, `containerRef`,
`renderInfo`, and `onResize` through the vanilla options surface
(`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:85-108,120-180,242-312,434-450,626-687`).

EPIC-062 E4-9 defines the cross-fork boundary as a capability, not a concrete model class. Add
and export this interface from `src/renderer/uikit/VirtualGrid/types.ts` (and re-export it from
`src/renderer/uikit/VirtualGrid/index.ts`):

```ts
export interface GridModelCapability {
    update(rerender?: RerenderInfo): void;
    scrollToRow(row: number, rowAlign?: RowAlign): Promise<void>;
}
```

`VirtualGridModel.update`/`scrollToRow` satisfy it at
`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:434-450,650-667`; the React fork has the
same two signatures at `src/renderer/uikit/RenderGrid/RenderGridModel.ts:469-480,505-514`.
The callback and all stored refs therefore use `GridModelCapability | null`, so both grid forks
can remain behind the same narrow boundary without exposing either implementation class.

The engine's renderer type returns an `HTMLElement | undefined`, not a React node
(`src/renderer/uikit/VirtualGrid/types.ts:15,149-172`). `VirtualGrid/renderInfo.ts` calls it with
`row`, `col`, the six geometry fields in `style`, `key`, `renderInfo`, `recycle`, and
`previous` (`src/renderer/uikit/VirtualGrid/renderInfo.ts:354-415`). It reuses
`old.map[key]` for a clean coordinate; it calls the renderer only when the coordinate has no
previous element or the dirty set names its cell, row, column, or all cells
(`renderInfo.ts:354-390`).

This means the renderer must use:

```ts
const cell = p.previous ?? p.recycle?.() ?? document.createElement("div");
```

and must re-point the cell's complete owned state on every admission. `previous` is preferred to
`recycle()` because it preserves the element already attached at that coordinate
(`src/renderer/uikit/VirtualGrid/types.ts:156-168`). A geometry-only scroll normally does not
call the renderer for cells already covered by the render window; a favicon or selection change
must therefore explicitly mark the affected rows dirty.

The renderer is also a bound field, not a per-update closure. `ListBoxView.ts:52-56` documents the
reason: `VirtualGridModel.inputChanged()` compares `renderCell` by identity at
`VirtualGridModel.ts:370-389`; a fresh closure would make every visible cell dirty on each model
update. `LinksListView` must therefore define one `private renderCell: RenderCellFunc = ...`
field and pass `this.renderCell` to the grid. Every value that the old `useCallback` captured must
be read from `this.props`, the model, or the current `CellParts` record when that field runs.
Because the identity never changes, favicon, selection, drop-state, and link-data changes reach
the DOM only through an explicit `model.update({ rows })`/cell dirty set; they must never rely on
an incidental closure replacement.

The `previous` element is keyed by coordinate, not item identity: `key` remains `` `${row}_${col}`
`` at `VirtualGrid/renderInfo.ts:381-383`. After scrolling, `p.previous` at `(5, 0)` can be the
same element holding a different link. It must always be repointed completely; treating
`previous` as “unchanged item” is the exact masked defect this record prevents.

### Favicon defect and its explicit owner

`LinksList` calls `useFavicons(links)` at `src/renderer/editors/link-editor/LinksList.tsx:224` and
includes the returned `faviconVersion` only in the `renderCell` callback dependency list, with an
eslint comment at `LinksList.tsx:273-278` saying the value exists to force cell reconciliation.
There is no direct read of the version in the cell body.

The actual changed value is the module-level `memoryCache` entry in
`src/renderer/components/icons/favicon-cache.ts:11`. `saveFavicon()` stores the downloaded file
path under the hostname and calls `notifyListeners(hostname)` at `favicon-cache.ts:120-137`; the
listener map is invoked and cleared at `favicon-cache.ts:209-217`. A disk hit also populates the
same map in `getFaviconPath()` at `favicon-cache.ts:63-81`. `useFavicons()` subscribes once per
hostname and increments its React-only version on disk completion or `onFaviconReady` at
`favicon-cache.ts:162-203`.

`TreeProviderItemIcon` reads that changed map synchronously through `getFaviconPathSync()` when
its parent renders (`src/renderer/components/icons/TreeProviderItemIcon.tsx:71-94`). The existing
DOM equivalent, `createTreeProviderItemIconElement`, makes the same synchronous lookup at
`src/renderer/components/icons/icon-elements.ts:82-110`; there is also a separate native
`onFaviconReady(hostname, callback)` subscription API at `favicon-cache.ts:140-160`.

The vanilla owner must therefore subscribe by hostname and repaint only affected rows:

1. Derive unique non-empty hostnames from `links` using the verified `getHostname()` rules
   (`src/renderer/components/icons/favicon-cache.ts:45-56`), and maintain hostname → row
   indices for the current array.
2. For each hostname, call `getFaviconPath(hostname)` as `useFavicons` does for the asynchronous
   disk-cache path. When it resolves with a path, call `grid.model.update({ rows: affectedRows })`;
   do not use `{ all: true }`. Also register `onFaviconReady(hostname, callback)` for pending
   fetches; that callback performs the same affected-row update.
3. Rebuild the hostname subscriptions and row index map when `links` changes, disposing old
   unsubscribe functions and ignoring stale disk promises after disposal or repointing. Both
   completion paths must be row-scoped.
4. The cell renderer must rebuild/re-point the icon using
   `createTreeProviderItemIconElement(link)`, so the next affected-row admission sees the new
   `memoryCache` path. File-type, folder, git, mneme, and board rows must be repainted through the
   same row index mapping only when their hostname subscription says they changed.

This is the explicit owner of the old React version signal. A blanket repaint would reproduce the
masked defect's trigger without preserving its row-level scope.

### E4-7 cell-parts record

`CellPool.release()` only pushes the detached element into its array and does not reset children,
classes, attributes, or listeners (`src/renderer/uikit/VirtualGrid/CellPool.ts:8-20,47-83`). The
type contract repeats that the next occupant receives the previous occupant's complete DOM state
(`src/renderer/uikit/VirtualGrid/types.ts:139-147`).

US-1062 adopts the shipped `src/renderer/uikit/ListBox/ListBoxView.ts` pattern. Its `CellRecord`
comment explicitly documents the policy and warns not to clear released elements
(`ListBoxView.ts:30-45`). The bound `renderCell` field is passed by identity
(`ListBoxView.ts:52-56,281`); `record.index = p.row` and `applyCellStyle` are rewritten on every
admission, `view.update(...)` is a total current-row write, and a view is recreated only when the
cell kind changes (`ListBoxView.ts:297-343`). A `Set` retains every created view
(`ListBoxView.ts:71-75`), `releaseCell` is used only for kind changes/teardown
(`ListBoxView.ts:324,410-423`), and listeners are installed once and resolve the active record
(`ListBoxView.ts:391-423`). This is the complete E4-7 precedent that US-1063/1064/1065 should
copy, including its warning: do not “helpfully” clear elements in `CellPool.release()`.

LinksList uses the same record policy, with two genuine additions: a tooltip attachment whose
content is owned by the overlay rather than the pooled cell, and native drag listeners that read
the current link/props through the record. Its `CellParts` record must name every owned reference:

```ts
interface CellParts {
    cell: HTMLElement;
    rowWrapper: HTMLElement;
    rowView: ListItemView;
    actionsHost: HTMLElement;
    additionalIconHost: HTMLElement;
    additionalIcon?: IconName;
    editButton?: IconButtonView;
    deleteButton?: IconButtonView;
    tooltip?: TooltipAttachment;
    link: ILink;
    selected: boolean;
    dropTarget: boolean;
    isDragging: boolean;
    searchText: string;
    dragSourceId?: string;
    onDragStartOverride?: LinksListProps["onDragStartOverride"];
    allTags?: string[];
    imageProxy?: TorProxyInfo | null;
    onSelect?: LinksListProps["onSelect"];
    onEdit?: LinksListProps["onEdit"];
    onDelete?: LinksListProps["onDelete"];
    onDoubleClick?: LinksListProps["onDoubleClick"];
    onContextMenu?: LinksListProps["onContextMenu"];
    onToggleTag?: LinksListProps["onToggleTag"];
    onDragEnter?: LinksListProps["onItemDragEnter"];
    onDragOver?: LinksListProps["onItemDragOver"];
    onDragLeave?: LinksListProps["onItemDragLeave"];
    onDrop?: LinksListProps["onItemDrop"];
}
```

This is the complete ownership record, not a cache of only changed values. The
`WeakMap<HTMLElement, CellParts>` is the listener/view's live indirection: listeners installed
when `cell` is first admitted read the current record, while each later admission overwrites
`link`, selection/drop/drag booleans, search text, every optional callback, `dragSourceId`,
`allTags`, `imageProxy`, both icon/action hosts, the button references (including clearing absent
buttons), tooltip content/attachment, and geometry style. A field being equal to its former value
is not a reason to skip the assignment; the former value belonged to a different row. The
`additionalIconHost` is the explicit DOM boundary for the E4-10 registry-name conversion; it
must not be populated by inspecting a React element.

The record must also own the `ListItemView` for the cell, and a `Set<ListItemView>` must retain all
created views so the grid's pool cannot hide them from disposal. A view is updated in place on
repoint; it is disposed only when the LinksList view is disposed or when the row implementation's
kind genuinely changes. Do not dispose it on cell eviction: that would reintroduce the Monaco-style
churn EPIC-062 E4-6 is measuring.


### Prop-by-prop mapping: `RenderGrid` → `VirtualGrid`

The exact old prop set is visible at `src/renderer/editors/link-editor/LinksList.tsx:292-303`.
The target options are `VirtualGridOptions` at
`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:85-108`; the model and view are separate
objects, so the table distinguishes the view callback from the model option.

| Current prop | Evidence | Vanilla equivalent / decision |
|---|---|---|
| `onModel` | `LinksList.tsx:293-296` receives a `RenderGridModel` and forwards it to `onGridModel`. | No same-named option. Use `VirtualGridView.onView` (`VirtualGridView.ts:34-55,202-223`) and forward `view.model` through the exported `GridModelCapability` interface; neither concrete model class crosses the boundary. |
| `rowCount={links.length}` | `LinksList.tsx:297` | Same `VirtualGridOptions.rowCount`; it accepts a number or thunk (`VirtualGridModel.ts:88-90`). |
| `columnCount={1}` | `LinksList.tsx:298` | Same `columnCount` option (`VirtualGridModel.ts:90`). |
| `rowHeight={ROW_HEIGHT}` | `LinksList.tsx:299`; `ROW_HEIGHT = 24` at line 14 | Same `rowHeight: ElementLength` option (`VirtualGridModel.ts:91`; `types.ts:29-30`). |
| `columnWidth={columnWidth}` | `LinksList.tsx:230,300`; callback returns `gridWidth ?? 400` | Same `columnWidth: ElementLength` option (`VirtualGridModel.ts:92`). Move `gridWidth` to a view field. Keep the callback stable because `VirtualGridModel.inputChanged()` compares function identity at `VirtualGridModel.ts:370-389`; the resize handler must explicitly request geometry after changing the field. |
| `renderCell` | `LinksList.tsx:232-279` returns `ReactNode` | Same-named option, but the target callback returns an `HTMLElement` and receives `previous`/`recycle` (`VirtualGrid/types.ts:149-172`). Replace JSX with the cell-parts renderer. |
| `fitToWidth` | `LinksList.tsx:302` | Same option (`VirtualGridModel.ts:102`). Both forks fit callback-produced lengths through `buildLengthArray` (`RenderGrid/renderInfo.ts:97-117`; `VirtualGrid/renderInfo.ts:134-152`). The vanilla fork additionally treats percentage widths as fitted when calculating inner width (`VirtualGrid/renderInfo.ts:155-176,233-256`). Existing list precedent is stable `columnWidth = () => "100%"` in `ListBoxView.ts:47,273-284`; if the old measured-number callback is retained, verify the resize update explicitly. |
| `onResize={handleResize}` | `LinksList.tsx:226-228,303`; old callback is scheduled by `RenderGridModel.onFrameResize` at `RenderGridModel.ts:217-242` | Same `onResize?: (size: RenderSizeOptional) => void` option (`VirtualGridModel.ts:105-107,279-310`). The vanilla handler becomes a field/method, not React state. If percentage width is adopted, this internal prop can be dropped because the callback is no longer needed. |

Before → after:

```tsx
// Before: LinksList.tsx:281-304
<Panel ... tabIndex={0} data-focus-selection="">
    <RenderGrid
        onModel={(grid) => {
            gridRef.current = grid;
            onGridModel?.(grid);
        }}
        rowCount={links.length}
        columnCount={1}
        rowHeight={ROW_HEIGHT}
        columnWidth={columnWidth}
        renderCell={renderCell}
        fitToWidth
        onResize={handleResize}
    />
</Panel>
```

```tsx
// After: same public component signature, thin React face
export function LinksList(props: LinksListProps): React.ReactElement {
    return mountVanilla(LinksListView, props);
}
```

The vanilla view owns the panel DOM, `VirtualGridView`, the `onView` → `onGridModel` notification,
favicon subscriptions, cell-parts map, and prop-driven updates. The React face must not recreate the
grid or renderer on ordinary parent renders. The shape is the one used by
`src/renderer/editors/shared/MonacoEditorHost.tsx:1-9`.

### React-facing `LinksListProps`: every prop and its vanilla destination

The public interface at `LinksList.tsx:171-212` keeps every prop name and callback behavior for
the six boundary files. E4-9 narrows only the model value to `GridModelCapability`, and E4-10
converts only the React-valued icon producer to `IconName`; `mountVanilla` passes the same props
object to the vanilla view and no field is renamed.

| Prop | Type at public face | Vanilla destination |
|---|---|---|
| `links` | `ILink[]` | Current array; row lookup by `p.row`, count, favicon hostname → row map, icon and tooltip data. |
| `selectedId` | `string?` | Admission computes `getId(link) === selectedId` and updates `ListItemView.selected`. |
| `selectedIds` | `ReadonlySet<string>?` | Uses membership when present; otherwise the `selectedId` arm applies. |
| `getId` | `(link: ILink) => string` | Stored/defaulted to `defaultGetId`; used for selection and drop-target matching on every admission. |
| `searchText` | `string?` | Row label update; native string highlighting, with directory styling handled separately. |
| `onSelect` | `(link, e?: React.MouseEvent) => void?` | Native row click is adapted to the public event shape; action buttons call it with only the link after stopping propagation, matching `LinksList.tsx:104-122`. |
| `onEdit` | `(link) => void?` | Repointed into the trailing edit `IconButtonView`; absence removes that button and becomes the double-click fallback. |
| `onDelete` | `(link, skipConfirm) => void?` | Repointed into the delete `IconButtonView`; native click reads `ctrlKey` after stopping propagation. |
| `onDoubleClick` | `(link) => void?` | Native `dblclick`; if absent, calls `onEdit(link)` as at `LinksList.tsx:76-78`. |
| `onContextMenu` | `(e: React.MouseEvent, link) => void?` | Native context-menu listener through `toPublicEvent` and current-record link lookup. |
| `getAdditionalIcon` | `(link) => IconName?` after E4-10 | Evaluated on every admission; the caller returns the registry name `"pin-filled"`, and the view calls `createIconElement(name, { width: 16, height: 16 })` into `additionalIconHost`. This is the DOM-capable string arm of the established `IconRef`/`IconName` path, not a React slot (`src/renderer/uikit/shared/slots.ts:1-6,46-59`; `src/renderer/theme/icon-registry.ts:191-244`; `src/renderer/components/icons/icon-elements.ts:6,82-110`). |
| `dragSourceId` | `string?` | Controls native `draggable` and the current trait payload's `sourceId`. |
| `onDragStartOverride` | `(link, e: React.DragEvent) => boolean?` | Native `dragstart` through the public-event adapter before trait payload construction; true skips payload and dimming. |
| `allTags` | `string[]?` | Repointed into the tooltip for the current link. |
| `onToggleTag` | `(link, tag) => void?` | Repointed into tooltip tag controls. |
| `imageProxy` | `TorProxyInfo \| null?` | Repointed into tooltip preview resolution (`LinkTooltip.tsx:24-27`). |
| `onGridModel` | `(GridModelCapability \| null) => void?` after E4-9 | Called from `VirtualGridView.onView` with `view.model` and `null` on disposal. Consumers use only `update(rerender?)` and `scrollToRow(row, align)`, so both model forks satisfy the stable capability. |
| `onItemDragEnter` | `(link, e: React.DragEvent) => void?` | Native row `dragenter` through the adapter and current record. |
| `onItemDragOver` | `(link, e: React.DragEvent) => void?` | Native row `dragover` through the adapter and current record. |
| `onItemDragLeave` | `(link, e: React.DragEvent) => void?` | Native row `dragleave` through the adapter and current record. |
| `onItemDrop` | `(link, e: React.DragEvent) => void?` | Native row `drop` through the adapter and current record. |
| `dropTargetId` | `string \| null?` | Admission computes drop state and updates `ListItemView.dropActive`. |

Use the existing `toPublicEvent(Event)` adapter, which preserves `nativeEvent`, target/currentTarget,
propagation methods, and WebIDL receiver behavior (`src/renderer/uikit/shared/react-compat.ts:1-55`).
`CategoryViewImpl` already uses the same native-listener → React callback conversion at
`src/renderer/components/tree-provider/CategoryViewImpl.ts:220-236`.

### `onGridModel`: caller inventory and the E4-9 capability boundary

The old callback is declared as `RenderGridModel | null` at `LinksList.tsx:201-202` and receives
that model at `LinksList.tsx:292-296`. E4-9 changes only the exposed type: define and export
`GridModelCapability` in `src/renderer/uikit/VirtualGrid/types.ts`, then use
`GridModelCapability | null` for the callback and stored refs. It names exactly the two methods
the callers use:

```ts
export interface GridModelCapability {
    update(rerender?: RerenderInfo): void;
    scrollToRow(row: number, rowAlign?: RowAlign): Promise<void>;
}
```

The signatures are verified identical on both forks:
`VirtualGridModel.ts:434-450,650-667` and `RenderGridModel.ts:469-480,505-514`. This preserves
Rule 2 without a concrete-class repoint or exception; it also gives US-1066 a stable boundary
when the tiles and remaining link-editor consumers convert. If either signature diverges during
implementation, stop and report it rather than widening this interface or casting.

Verified callers and uses:

| File and lines | Current use | After conversion |
|---|---|---|
| `src/renderer/components/tree-provider/CategoryViewModel.ts:70-77` | Defines `CategoryItemsRendererProps.onGridModel` across the category renderer boundary. | Repoints once to `GridModelCapability`; it does not name either concrete fork. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts:90,351,377-387` | Stores the model, flushes pending `update({ all: true })`, calls `scrollToRow(0)` on view-mode change, and clears it on bridge disposal. | Stores `GridModelCapability`; both used methods remain available. |
| `src/renderer/editors/category/CategoryEditor.tsx:116-140` | Copies `itemProps.onGridModel` into `commonProps` and passes it to `LinksList` in list mode. | JSX remains untouched; inferred callback type follows the category boundary. |
| `src/renderer/editors/link-editor/LinkItemList.tsx:26,43-53,146-160` | Stores the callback value, gives it to `model.setGridModel`, and requests `update({ all: true })` on links/selection changes. | Stores `GridModelCapability`; shared link-source/editor field types repoint once. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.tsx:26,80-88,134-142` | Stores the model and calls `scrollToRow(row, "nearest")` for selected-link changes. | Ref becomes `GridModelCapability`; no concrete model import. |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx:26,80-88,134-142` | Same storage and `scrollToRow(row, "nearest")` behavior for tag-filtered links. | Same capability type. |

Additional shared downstream users are verified: `LinkEditor.gridModel` and `setGridModel` are
typed as `RenderGridModel` at `src/renderer/editors/link-editor/LinkEditor.ts:111,369-373`;
`LinkBody.tsx:35-38` calls `model.gridModel?.update({ all: true })`; and `LinkItemTiles.tsx:26-39,146`
stores/passes the same model even though its conversion is US-1066. These declarations also
repoint to `GridModelCapability` now, so the later conversion does not churn the boundary.

**E4-9 decision:** this is not a Rule 2 break. The React-facing callback name and lifecycle remain
unchanged, while the concrete model type is replaced by the narrow structural capability that
both forks satisfy. No `as unknown as RenderGridModel`, adapter, or concrete `VirtualGridModel`
type is permitted.


### Highlight form

The current row imports the React `highlight` function and constructs a React `<span style={{ fontWeight: 500 }}>`
for directory labels at `src/renderer/editors/link-editor/LinksList.tsx:80-88`. The React
implementation remains at `src/renderer/uikit/shared/highlight.ts:17-26`.

A non-React arm already exists: `highlightInto(host, text, searchText, extraClassName)` at
`highlight.ts:28-103`. It performs the same tokenization, `highlighted-text` class, and NBSP
promotion, but owns the host with `replaceChildren`. The converted row must use this DOM form,
directly or through `ListItemView`'s string-label path: `ListItemView.setLabel` calls
`highlightInto` for string labels at `src/renderer/uikit/ListBox/ListItemView.ts:145-171`. Do not
pass the old React label node to a slot.

For directories, preserve the old bold label arm with a stable row/label state attribute or an
application row hook while still passing the plain title string through the native highlighter.
The file row must pass the search text through the same native path. This keeps the directory
boldness and the React/non-React highlighting behavior without a React root in the cell.

### Panel and focus scope

The old outer element is `Panel name="links-list-focus-scope" direction="column" flex={1}
minWidth={0} minHeight={0} overflow="hidden" tabIndex={0} data-focus-selection=""` at
`src/renderer/editors/link-editor/LinksList.tsx:282-291`.

`createPanelElement` can reproduce the Panel styling and data contract for the style props:
`PanelStyleProps` includes `name`, direction, flex, min/max dimensions, and overflow at
`src/renderer/uikit/Panel/panel-style.ts:15-66`; `resolvePanelAttributes` maps those into
attributes/styles at `panel-style.ts:196-255`; `applyPanelAttributes` writes `data-type="panel"`,
`data-name`, direction, classes, and styles at `panel-style.ts:306-340`; and the factory creates
the element at `panel-style.ts:342-349`.

It cannot reproduce arbitrary React HTML attributes because `createPanelElement` accepts only
`PanelStyleProps` and children. In particular, `tabIndex` and `data-focus-selection` are absent
from that interface and are not written by `applyPanelAttributes`. The vanilla view must therefore
create the outer panel with the exact style props, then explicitly write:

```ts
const focusScope = createPanelElement({
    name: "links-list-focus-scope",
    direction: "column",
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
});
focusScope.tabIndex = 0;
focusScope.setAttribute("data-focus-selection", "");
```

The inner `link-row-wrapper` Panel can use the same factory with
`revealChildrenOnHover`, flex, minWidth, overflow, and position from
`LinksList.tsx:130-137`. Import the borrowed `Panel.css` explicitly in the direct vanilla view,
as required by `src/renderer/uikit/CLAUDE.md`'s direct-view stylesheet rule.

### Hook residue: one lift and one translation

Every hook in the old file has a verified destination:

| Old hook | Evidence | Vanilla destination |
|---|---|---|
| `useState(false)` for `isDragging` | `LinksList.tsx:57,69,72-74` | A transient field in `CellParts` (or the row view's current drag flag). The installed `dragstart` handler sets the current cell opacity/state; `dragend` clears it. Admission must always reset the flag to false before applying the new row, because a pooled cell may have been released mid-drag. The override arm must not set it. |
| Row `useCallback(handleDragStart)` | `LinksList.tsx:59-70` | One native listener installed once per cell, whose callback looks up the `CellParts` record and reads its current link, source ID, override, and liveness. It calls `setTraitDragData` after the override returns false. |
| Row `useCallback(handleDragEnd)` | `LinksList.tsx:72-74` | One native `dragend` listener installed once per cell; it clears the record's drag state and opacity. |
| `useRef<RenderGridModel>` `gridRef` | `LinksList.tsx:222,293-295` | Remove this unused intermediate ref from the vanilla view. Keep a direct `grid`/`VirtualGridView` field and invoke `onGridModel` from the view's `onView` callback. |
| `useState<number \| undefined>` `gridWidth` | `LinksList.tsx:223,226-230` | A view field only if the old measured-number width callback is retained. Update it from `onResize` and explicitly call the model's dirty/recompute method; do not recreate the renderer or use a React state update. The simpler verified list shape is a stable `() => "100%"` column width, which removes this field and the internal resize callback. |
| Parent `useCallback(handleResize)` | `LinksList.tsx:226-228` | A bound view method/field, or removed with the percentage-width choice. |
| Parent `useCallback(columnWidth)` | `LinksList.tsx:230` | A stable view field/function. It must not be recreated per prop update because `VirtualGridModel.inputChanged` compares function identity. |
| Parent `useCallback(renderCell)` | `LinksList.tsx:232-279` | A stable `RenderCellFunc` field on `LinksListView`. Prop changes are applied by the view before invoking it; data changes call `grid.model.update` with the narrow dirty set required by the changed data. |
| `useFavicons` hook | `LinksList.tsx:224` | Native hostname subscriptions described above; no React version counter remains. |
| Parent `useRef` and all hook imports | `LinksList.tsx:1,222-224` | Remove the React hook imports from the face. The face imports React only for the public types/element and `mountVanilla`; the view owns the imperative fields. |

### Drag-and-drop path

`doc/architecture/trait-system.md` says the trait system provides typed serialization over native
HTML5 drag-and-drop; it explicitly says all application drag-and-drop is native, not React-DnD
(`trait-system.md:5-17`). The source helper serializes a payload into `DataTransfer` at
`trait-system.md:136-153`, and the drop helpers inspect native `dataTransfer` at
`trait-system.md:155-169`.

There is no separate trait-aware vanilla row abstraction for this LinksList path. The source row's
`dragSourceId`, `onDragStartOverride`, and four item drop callbacks are raw DOM listeners. The
existing React `ListItem` already uses native handlers in its vanilla `ListItemView`:
`ListItemDragProps` is typed with native `DragEvent` callbacks at
`src/renderer/uikit/ListBox/types.ts:36-47`, and listeners are installed on the row at
`src/renderer/uikit/ListBox/ListItemView.ts:74-92`. Reuse that native path or install the same
delegated listeners on the cell record; do not introduce a new trait-system adapter.

The source behavior remains exact:

```ts
if (!dragSourceId) {
    event.preventDefault();
    return;
}
event.stopPropagation();
if (onDragStartOverride?.(link, publicEvent)) return;
setTraitDragData(event.dataTransfer, TraitTypeId.ILink, {
    items: [link],
    sourceId: dragSourceId,
});
record.isDragging = true;
```

The override is the application-owned native OS handoff. Returning true means it already handled
the gesture and the row must not write a trait payload or enter the dimmed state
(`LinksList.tsx:59-70`; `trait-system.md`, “Dragging files out to the OS”). The drop callbacks
remain policy owners: they decide whether to prevent default/stop propagation and what payload to
accept, exactly as the public prop documentation states at `LinksList.tsx:203-210`. The consumer's
existing drag-enter counter remains its responsibility; the row must not add a second policy layer.


## Implementation plan

1. **Split the React face from the native implementation.**
   - Add `src/renderer/editors/link-editor/LinksListView.ts` containing a public-constructor
     `VanillaView<LinksListProps>`. Keep the stable root and all imperative state there.
   - Reduce `src/renderer/editors/link-editor/LinksList.tsx` to the public `LinksListProps` declaration
     and the Monaco-shaped one-liner:
     `return mountVanilla(LinksListView, props);`.
   - Keep the public prop names, optionality, callback shapes, and default ID behavior exactly as
     currently declared, except for the E4-9 `onGridModel` type narrowing to the exported
     `GridModelCapability` and the E4-10 `getAdditionalIcon` conversion to `IconName`.
   - Import direct DOM helpers rather than the React barrel: `VirtualGridView`,
     `applyCellStyle`, `ListItemView`, `IconButtonView`, `createPanelElement`,
     `createTreeProviderItemIconElement`, `highlightInto`/the native ListItem label path,
     `attachTooltip` as needed, and `toPublicEvent`. Import the borrowed Panel/ListItem/IconButton
     CSS explicitly in the direct view.

2. **Build the stable LinksList shell and grid.**
   - Create the focus-scope Panel with `createPanelElement` and then explicitly set
     `tabIndex = 0` and `data-focus-selection`, because the helper does not accept arbitrary HTML
     attributes (`panel-style.ts:15-66,342-349).
   - Append a `VirtualGridView` with `rowCount` derived from the current links, `columnCount: 1`,
     `rowHeight: ROW_HEIGHT`, `fitToWidth: true`, a stable renderer, and the chosen width strategy.
     Prefer the verified list precedent `columnWidth: () => "100%"`; this makes the old width state
     and internal `onResize` unnecessary while preserving the one-column fit behavior. If source
     compatibility requires the old measured-number width, retain a stable callback and explicitly
     call `grid.model.update({ all: true })` after `onResize` changes its backing field.
   - Claim/own the grid and every `ListItemView`/`IconButtonView` created for pooled cells. Dispose
     the grid before the row-view set, and make listeners inert before disposal, matching the
     ownership order in `ListBoxView.ts:101-114`.
   - Define `private renderCell: RenderCellFunc = (p) => ...` once as a bound field and pass
     `this.renderCell` to `VirtualGridView`; never create it inside `update`, `setProps`, or a
     props-to-options helper. At call time it reads current values from `this.props`, the model,
     and `CellParts`. Its stable identity is mandatory because
     `VirtualGridModel.inputChanged()` compares `renderCell` by identity
     (`VirtualGridModel.ts:370-389`; `ListBoxView.ts:52-56`).

3. **Install explicit favicon ownership.**
   - On mount and whenever `links` changes, derive hostname → row-index sets with `getHostname`.
   - Call `getFaviconPath(hostname)` for the disk-cache completion path and subscribe with
     `onFaviconReady` for pending fetches; retain all unsubscription functions and a generation
     guard in the view.
   - On either completion for one hostname, repaint only its affected rows using
     `grid.model.update({ rows })`. Rebuild the row index map/subscriptions before a callback can
     reach a new link array; ignore stale disk promises and dispose subscriptions on teardown.
     `renderInfo.ts:354-390` ignores a dirty row outside the current render window, so this is
     harmless: no off-window cell is painted, and it will read the now-populated favicon cache
     when it later enters the window. No off-window `CellParts` or DOM bookkeeping is required;
     only the current links' hostname-to-row index map remains for the narrow dirty request.
   - Use `createTreeProviderItemIconElement` on every cell admission. Do not carry the React
     `faviconVersion` counter into the native view and do not repaint all rows for one favicon.

4. **Implement the E4-7 cell record and total admission write.**
   - Keep `private readonly cells = new WeakMap<HTMLElement, CellParts>()` and a
     `Set<ListItemView | IconButtonView>` (or equivalent owned-view set) so detached pooled cells
     remain disposable.
   - Adopt the complete `ListBoxView` policy (`ListBoxView.ts:30-45,52-56,71-75,297-343,391-423`):
     in the stable `renderCell` field, select `p.previous ?? p.recycle?.() ?? document.createElement`,
     get/create the record, install listeners only during record creation, then assign every current
     link/prop/callback field and call `applyCellStyle` on every admission. `p.previous` means the
     same `(row, col)` coordinate, not the same link; because `key` is `` `${row}_${col}` ``
     (`VirtualGrid/renderInfo.ts:381-383`), always repoint the record and its views even when the
     coordinate already has an element.
   - Build the cell's outer wrapper with the old `boxSizing`, horizontal padding, flex display, and
     stretch alignment. Build the row wrapper with the old flex/min-width/opacity behavior and a
     Panel element with the exact `link-row-wrapper` props.
   - Keep the `ListItemView` root and its slot hosts alive across scroll. Update its full prop set
     every admission, including false/undefined arms: `selected`, `dropActive`,
     `searchText`, `iconElement`, plain label, tooltip, trailing element, draggable/drag handlers,
     click/double-click/context-menu handlers, and all optional callbacks.
   - On disposal, dispose all retained row/button views and tooltip attachments; never dispose a
     row view merely because its cell was released into `CellPool`.

5. **Convert the row's visual and action subtree without a per-cell React root.**
   - Use `createTreeProviderItemIconElement(link)` for the leading icon.
   - Use `ListItemView`'s native string-label → `highlightInto` path and a stable directory
     state/style hook for the old 500-weight folder label.
   - Create native trailing action buttons with `IconButtonView`, using DOM icon builders for
     Rename/Delete, `hideUntilParentHover`, and native click handlers that stop propagation,
     call `onSelect(link)`, then call edit/delete. Always update/remove both buttons when the
     current row lacks the corresponding callback.
   - Keep `LinkTooltipContent`'s React stateful tag editor out of the virtualized cell itself. The
     existing `attachTooltip` path creates its content under the overlay only when shown
     (`src/renderer/uikit/Tooltip/attach-tooltip.ts:79-190`); if that temporary React slot is
     retained, it must be the overlay boundary, not a child of the pooled cell. Repoint its link,
     tags, toggle callback, and Tor proxy on every admission, and dispose it on teardown.
   - Apply E4-10's data conversion: `getAdditionalIcon` returns the registry `IconName` arm,
     the live caller returns `"pin-filled"`, and the view calls `createIconElement` with the
     existing 16px props. Never route this producer through `fillSlot` or inspect React elements.

6. **Translate raw drag/click/context event handling.**
   - Install native listeners once on each stable row/cell and resolve the current `CellParts` from
     the WeakMap. Use `toPublicEvent` for the public React event callback signatures.
   - Preserve the exact drag-start order: prevent default when no source ID; stop propagation;
     call the override; otherwise write `TraitTypeId.ILink` payload with `setTraitDragData` and
     set the current record's dimmed state. Clear it on native `dragend`.
   - Forward row enter/over/leave/drop untouched after adding the current link. Consumers keep
     ownership of acceptance policy and drag-enter counters.

7. **Repoint the model capability boundary once.**
   - Export `GridModelCapability` from `src/renderer/uikit/VirtualGrid/types.ts` and
     `src/renderer/uikit/VirtualGrid/index.ts`.
   - Change the internal `onGridModel`/stored-grid declarations in `CategoryViewModel.ts`,
     `CategoryViewImpl.ts`, `LinkEditor.ts`, `LinkItemList.tsx`, both link navigation panels,
     `LinkBody.tsx`, and `LinkItemTiles.tsx` to the capability. Leave JSX props and all six named
     consumer call sites behaviorally untouched; only their type imports/refs change.
   - Do not cast either concrete model to the other. If either fork fails the two-method interface,
     stop and report the signature mismatch rather than widening the capability.

8. **Record and manually verify the engine transition.**
   - Confirm DOM structure/data attributes, focus behavior, row selection/drop styling, action
     buttons, tooltip behavior, raw drag policy, favicon appearance after async readiness, and
     pooled-cell re-pointing while scrolling.
   - Confirm the two model methods used by each caller satisfy `GridModelCapability` on both forks
     and that no old `RenderGrid` import remains in the converted LinksList path.
   - This project has no unit-test suite; do not add tests or a test harness. Verification is
     source/compiler/manual behavior verification only.


### Verified precedents

`src/renderer/components/file-search/FileSearchView.ts` directly constructs `VirtualGridView`,
uses a stable `renderCell` field, `applyCellStyle`, a `WeakMap<HTMLElement, CellRecord>`,
native delegated listeners, and a separate set for owned views at `FileSearchView.ts:25-50,64-76,
236-343`. It also subscribes to native icon changes and repaints the grid narrowly at
`FileSearchView.ts:49-52,78-82,120-126`. Its cell renderer uses `previous ?? recycle()` and
rewrites the full record at `FileSearchView.ts:284-343`.

The requested `src/renderer/components/tree-provider/TreeProviderViewModel.ts` was read in full.
It does not instantiate `VirtualGridView` itself: its only VirtualGrid import is the `RowAlign`
type at line 5, used by the tree controller's `revealItem` contract at lines 128-133. The actual
native tree view is `TreeProviderViewImpl.ts`, which uses native `TreeView` and direct icon elements,
including a subscription to icon changes at `TreeProviderViewImpl.ts:65-89,124-145,329-362`. This
is useful confirmation of the native event/icon ownership style, but `FileSearchView.ts` and
`ListBoxView.ts` are the direct VirtualGrid cell-recycling precedents.



## Concerns

### 1. E4-9 capability boundary keeps Rule 2 intact

The concrete `RenderGridModel`/`VirtualGridModel` classes are intentionally not exposed through
`onGridModel`. The exported `GridModelCapability` names only `update(rerender?)` and
`scrollToRow(row, align)`, which every inventoried caller uses and both forks satisfy
(`src/renderer/uikit/VirtualGrid/types.ts` planned interface;
`VirtualGridModel.ts:434-450,650-667`; `RenderGridModel.ts:469-480,505-514`). This is the honest
fork-parity boundary and avoids a US-1066 type churn. The interface must not be widened to paper
over a signature mismatch, and no `as unknown as RenderGridModel` cast or adapter is allowed.

### 2. E4-10 converts `getAdditionalIcon` as Epic P residue

The public prop intentionally returns arbitrary `React.ReactNode` at
`LinksList.tsx:188-189`, and the live `LinkItemList` caller returns a React pin icon at
`LinkItemList.tsx:141-143`. Epic P item 1 explicitly classifies React-valued props as residue that
must become data or neutral slots; E4-10 therefore changes this prop to the established registry
name arm, `getAdditionalIcon?: (link: ILink) => IconName | undefined`, and changes the one caller
to return `"pin-filled"` or `undefined`. The view uses `createIconElement("pin-filled", { width: 16,
height: 16 })`, whose DOM builder is the existing `IconName`/`IconRef` path
(`src/renderer/uikit/shared/slots.ts:1-6,46-59`; `src/renderer/theme/icon-registry.ts:191-244`).
No React root, temporary slot, React-element inspection, or new conversion contract is needed.

### 3. Tooltip content is an overlay boundary, not a cell boundary

`LinkTooltipContent` is stateful (`src/renderer/editors/link-editor/LinkTooltip.tsx:24-46`) and
has no direct-DOM counterpart in the searched source. `attachTooltip` creates the floating root
under the overlay layer only when the tooltip opens and fills its content host there
(`src/renderer/uikit/Tooltip/attach-tooltip.ts:79-190`). Keeping this temporary React content is
compatible with the no-React-cell goal only if it remains in the overlay; mounting it as a child of
each pooled cell is not acceptable. Its link, tags, callback, and Tor image proxy must be repointed
on each admission and its attachment disposed at view teardown.

### 4. Measured width versus stable percentage width

The old component stores a measured width only to make its one column fit
(`LinksList.tsx:223-230,300-303`). The vanilla engine and ListBox precedent support a stable
percentage callback, and `VirtualGrid/renderInfo.ts` has explicit percentage-fit semantics. The
plan selects `columnWidth: () => "100%"` as the default resolution, eliminating the old state and
internal resize callback. If visual comparison finds a difference caused by the old 400px bootstrap,
the fallback is a stable measured-number callback plus an explicit model update after `onResize`;
never recreate the renderer per resize.

### 5. Cell reuse and state completeness

A recycled cell can carry a prior row's selected/drop state, action buttons, tooltip attachment,
drag dimming, icon, title, listeners, or label children. Every one must be rewritten or removed on
admission, including optional values that are absent on the new row. A clean-coordinate
`previous` update must preserve the element and its owned views; a pooled `recycle` admission must
reuse the same named parts. This is the pilot's reusable contract for US-1063–US-1065.

### 6. No tests

Per `CLAUDE.md` this project uses no unit tests. Do not write tests, test harnesses, or propose a
unit-test migration. Acceptance is based on source/compiler checks and manual runtime inspection
of the listed behaviors.


## Acceptance criteria

- `src/renderer/editors/link-editor/LinksList.tsx` keeps the exported prop names and callback
  behavior, with the explicit E4-9 `GridModelCapability` and E4-10 `IconName` type migrations;
  its component body is only the thin `mountVanilla` face.
- A native `LinksListView` owns the focus-scope panel, `VirtualGridView`, favicon subscriptions,
  cell map, row-view ownership, and prop updates; no `RenderGrid` or `RenderGridModel` import
  remains in the LinksList implementation.
- The outer DOM reproduces `data-type="panel"`, `data-name="links-list-focus-scope"`,
  `data-direction="column"`, flex/min-size/overflow behavior, `tabindex="0"`, and the empty
  `data-focus-selection` attribute.
- The grid uses one 24px row and one column, fits the width, returns DOM cells, applies the six
  geometry styles and old 4px horizontal cell padding, and uses a stable renderer identity.
- The renderer uses `previous ?? recycle()`, has a `WeakMap` cell-parts record, installs listeners
  once per pooled cell, retains created row/button views for disposal, and rewrites every owned
  field on every admission. Scrolling does not dispose/recreate a row view merely because it is
  evicted.
- Selection, multi-selection, custom IDs, search highlighting, directory boldness, drop-target
  state, folder/file/mneme/git/board icons, action-button visibility, Ctrl-delete behavior,
  double-click fallback, context-menu forwarding, and click propagation match the current row.
- Favicon readiness changes the cache path and repaints only rows mapped to that hostname; a
  favicon loaded after initial render becomes visible without a blanket repaint. Dirty rows outside
  the render window are harmless and render from the populated cache when they enter the window;
  stale disk promises cannot reach a disposed/repointed view.
- Drag start writes the same `ILink` trait payload unless the native OS override returns true;
  no payload/dim state is written on the override path. Raw row drop callbacks receive the same
  public event shape and retain consumer-owned acceptance policy.
- The tooltip is attached to the overlay, not mounted as a React root in a virtualized cell; its
  content is updated for the current row and disposed with the view. `getAdditionalIcon` uses the
  registry-name descriptor and does not silently lose the live pin icon.
- All six boundary/type consumers compile against `GridModelCapability`; neither concrete model
  class crosses the boundary, and no unsafe cast is used.
- The shared model callers' two used methods are verified against both forks: `update` and
  `scrollToRow`. No dashboard entry is added or duplicated.
- Verification contains no unit tests or test harnesses, in accordance with project rules.

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/editors/link-editor/LinksList.tsx` | Preserve public prop names/behavior, apply the E4-9/E4-10 type migrations, and replace the 307-line React implementation with the thin `mountVanilla` face. |
| `src/renderer/editors/link-editor/LinksListView.ts` | New native view: shell, grid, cell-parts renderer, row/action views, favicon ownership, tooltip boundary, and native event forwarding. |
| `src/renderer/uikit/VirtualGrid/types.ts` | Add and export the cross-fork `GridModelCapability` interface. |
| `src/renderer/uikit/VirtualGrid/index.ts` | Re-export `GridModelCapability`. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Repoint the category renderer's grid callback type to `GridModelCapability`. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Repoint stored grid model/callback types and retain the existing narrow repaint/scroll behavior. |
| `src/renderer/editors/link-editor/LinkEditor.ts` | Repoint the shared stored grid model/setter type to `GridModelCapability`. |
| `src/renderer/editors/link-editor/LinkItemList.tsx` | Repoint the model ref to `GridModelCapability` and change the live additional-icon producer to the `"pin-filled"` registry name; JSX list usage remains unchanged. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.tsx` | Type-only/ref update for `scrollToRow`; JSX usage remains unchanged. |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx` | Type-only/ref update for `scrollToRow`; JSX usage remains unchanged. |
| `src/renderer/editors/link-editor/LinkBody.tsx` | Repoint the shared model import/type; repaint behavior is unchanged. |
| `src/renderer/editors/link-editor/LinkItemTiles.tsx` | Repoint the shared model import/type now; do not convert its grid/cell body in US-1062. |
| `src/renderer/uikit/Panel/Panel.css` / `src/renderer/uikit/ListBox/ListItem.css` / `src/renderer/uikit/IconButton/IconButton.css` | No semantic changes; direct vanilla imports may be added where needed so borrowed styles load in the native bundle. |
| `src/renderer/editors/category/CategoryEditor.tsx` | No change; it continues passing the same `onGridModel` prop through JSX. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | No change; its VirtualGrid import is only the unrelated `RowAlign` type precedent. |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` / `VirtualGridModel.ts` / `CellPool.ts` | No engine changes; the task consumes their existing contracts. |
| `src/renderer/uikit/RenderGrid/RenderGrid.tsx` / `RenderGridModel.ts` | No changes; the React engine is the source being left behind. |
| `doc/active-work.md` | No change; the US-1062 dashboard entry already exists. |
| `doc/epics/EPIC-062.md` | No change for this task document; epic tracking remains authoritative. |
| Tests or test harnesses | No changes; prohibited by project instructions. |
