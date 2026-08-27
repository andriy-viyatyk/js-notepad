# US-1140 — Slot-content prop sweep

Epic: [EPIC-070 — De-React E12](../../epics/EPIC-070.md), task E12-7 #8.

## Goal

Make every public content prop whose native consumer already accepts a DOM node honest about that
contract by using the uikit-owned `SlotContent` type. Remove the two DOM-to-React laundering sites
in `CommitDiffPanel` and `GraphLegendPanel` without changing runtime behavior or removing any
React compatibility face.

## Background

`src/renderer/uikit/shared/fill-slot.ts:5` exports:

```ts
export type SlotContent = string | Node | React.ReactNode;
```

`fillSlot(host, slot)` at `src/renderer/uikit/shared/fill-slot.ts:83` handles the string, `Node`,
empty, and React arms. The decisive evidence for this task is therefore the consumer, not whether
the value originated in JSX. A value passed to `fillSlot` is a `SlotContent`; a value rendered as a
React child or passed to a React-only API is not widenable merely because a cast could make it type
check.

`SlotContent` is exported from `shared/fill-slot.ts`, but is not re-exported by
`src/renderer/uikit/index.ts` (the barrel exports `IconRef` and `SlotText` at lines 31–32). Existing
native-facing code imports it directly from `uikit/shared/fill-slot.ts`. The implementation should
use that established direct type import and should not add a barrel change as part of this task.

The consistent spelling recommended for this sweep is `SlotContent` for all values that are slot
content, including the Tree family’s current inline `React.ReactNode | Node` unions and the
ListBox/Tree callback return types. This resolves the `TreeItem.label` / `ListItem.label`
asymmetry in the type’s direction while giving the contract one uikit-owned name. `SlotText`
remains appropriate for tooltip APIs, which intentionally do not promise a DOM-node tooltip body.

## Investigation results

### Confirmed widenable contracts

The following 16 public/app contracts are currently React-only in their declaration (three are
inherited `children` properties) but reach a consumer that accepts or directly inserts a `Node`.
The Graph row is an additional editor-local content prop used by the laundering fix.

| Contract | Current declaration | Verified consumer | Planned type |
|---|---|---|---|
| `FileListProps.getTrailing` | `src/renderer/components/file-list/FileList.tsx:22` returns `ReactNode` | `FileListView.rowsFor` at `:139–155` calls it and stores the result as `IListBoxItem.trailing`; `ListBoxView.renderCell` passes that field to `ListItemView`, whose `setTrailing` calls `fillSlot` at `src/renderer/uikit/ListBox/ListItemView.ts:267` | `(item) => SlotContent` |
| `IListBoxItem.trailing` | `src/renderer/uikit/ListBox/types.ts:27` is `React.ReactNode` | `ListBoxView.itemProps` at `:369–382` forwards it to `ListItemView`; `setTrailing` at `ListItemView.ts:266–268` calls `fillSlot` | `SlotContent` |
| `ListItemProps.label` | `src/renderer/uikit/ListBox/ListItem.tsx:24` is `React.ReactNode` | `ListItemView.applyProps` at `ListItemView.ts:113–180` passes it to `setLabel`; non-string labels reach `fillSlot` at `:246–248` | `SlotContent` |
| `ListItemProps.trailing` | `src/renderer/uikit/ListBox/ListItem.tsx:44` is `React.ReactNode` | `ListItemView.setTrailing` at `ListItemView.ts:251–278` sends non-null custom trailing content to `fillSlot` at `:266–268` | `SlotContent` |
| `ISegment.label` | `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx:10` is `React.ReactNode` | `SegmentedControlView.buttonProps` at `:67–83` passes `segment.label` as `ButtonView.children`; `ButtonView.updateContent` accepts `SlotContent` and uses `fillSlot` at `src/renderer/uikit/Button/ButtonView.tsx:111–145` | `SlotContent` |
| `SelectableRowProps.children` | `src/renderer/uikit/SelectableRow/SelectableRow.tsx:14` is `React.ReactNode` | `SelectableRowView.updateContent` at `src/renderer/uikit/SelectableRow/SelectableRowView.ts:52–54` calls `fillSlot(this.root, children)` | `SlotContent` |
| `SplitButtonProps.children` | `src/renderer/uikit/SplitButton/SplitButton.ts:30` is `React.ReactNode` | `SplitButtonView.primaryProps` at `src/renderer/uikit/SplitButton/SplitButtonView.ts:93–102` passes it to `ButtonView.children`, whose slot implementation is at `ButtonView.tsx:111–145` | `SlotContent` |
| `TruncatedTextProps.children` | `src/renderer/uikit/TruncatedText/TruncatedText.tsx:11` is `React.ReactNode` | `TruncatedTextView.updateContent` at `src/renderer/uikit/TruncatedText/TruncatedTextView.tsx:72–75` calls `fillSlot(this.root, children)` | `SlotContent` |
| `CheckboxProps.children` | inherited `ReactNode` from `React.HTMLAttributes` through `src/renderer/uikit/Checkbox/Checkbox.tsx:7` | `CheckboxView.onMount/onUpdate` at `src/renderer/uikit/Checkbox/CheckboxView.tsx:24–38` call `updateChildren`; `updateChildren` at `:63–65` calls `fillSlot` | omit inherited `children`, redeclare `children?: SlotContent` |
| `ContentHostFooterProps.footerContributions` | `src/renderer/editors/base/ContentHostFooter.ts:10` is `ReactNode` | `ContentHostFooterView` narrows the view prop to `SlotContent` at `src/renderer/editors/base/ContentHostFooterView.ts:17–20`; `updateContributions` calls `fillSlot` at `:130–132` | `SlotContent` |
| `EditorToolbarProps.children` | `src/renderer/editors/base/EditorToolbar.ts:9` is `React.ReactNode` | `EditorToolbarViewProps` is already `SlotContent` at `src/renderer/editors/base/EditorToolbarView.ts:5–10`; `updateContent` calls `fillSlot` at `:54–56` | `SlotContent` |
| `BoardsTreeProps.renderTrailing` | `src/renderer/editors/board/BoardsTree.tsx:28` returns `React.ReactNode` | `BoardsTreeView` preserves the value at `src/renderer/editors/board/BoardsTreeView.ts:38–40` and supplies it to `TreeView.renderTrailing` at `:80–94`; `TreeView.itemProps` sends it to `TreeItemView` at `src/renderer/uikit/Tree/TreeView.ts:440–462`, whose `setTrailing` calls `fillSlot` at `TreeItemView.ts:334–348` | `(root) => SlotContent` |
| `ToolsTreeProps.renderTrailing` | `src/renderer/editors/tools/ToolsTree.tsx:29` returns `React.ReactNode` | `ToolsTreeView` forwards it at `src/renderer/editors/tools/ToolsTreeView.ts:41–44,71–84` to the same `TreeView.itemProps` → `TreeItemView.setTrailing` → `fillSlot` path | `(root) => SlotContent` |
| `ButtonProps.children` | inherited `ReactNode` through `src/renderer/uikit/Button/Button.tsx:7` | `ButtonViewProps` explicitly replaces that inherited field with `SlotContent` at `src/renderer/uikit/Button/ButtonView.tsx:11–13`; `ButtonView.updateContent` writes simple content or calls `fillSlot` at `:111–145` | omit inherited `children`, redeclare `children?: SlotContent` |
| `LabelProps.children` | inherited `ReactNode` through `src/renderer/uikit/Label/Label.ts:6–8` | `LabelView.renderText` at `src/renderer/uikit/Label/LabelView.tsx:63–90` calls `fillSlot(this.textElement, props.children)` at `:82` | omit inherited `children`, redeclare `children?: SlotContent` |
| `TagProps.children` | inherited `ReactNode` through `src/renderer/uikit/Tag/Tag.tsx:8–12` | `TagView.updateContent` creates a dedicated host and calls `fillSlot` at `src/renderer/uikit/Tag/TagView.tsx:85–97` | omit inherited `children`, redeclare `children?: SlotContent` |
| `LegendRowProps.icon` | `src/renderer/editors/graph/GraphLegendPanel.tsx:538` is `React.ReactNode` | `LegendRow` explicitly detects `icon instanceof Node` at `:545–560`, inserts it into `iconHost` at `:554`, and renders only the non-native arm as a React child at `:570` | `SlotContent` (or the equivalent `React.ReactNode | Node`; `SlotContent` is preferred) |

The three additional public findings are not speculative: `ButtonViewProps` already had to omit and
replace `ButtonProps.children`, while `LabelView` and `TagView` visibly call `fillSlot` on inherited
`children`. They belong in the same contract sweep even though the initial candidate list did not
name their declarations.

### Existing DOM-capable declarations to normalize, not widen

These contracts already admit `Node`; they should use `SlotContent` so the sweep does not leave a
third inline spelling behind:

- `src/renderer/uikit/ListBox/types.ts:142` — `ListBoxProps.renderItem` currently returns
  `React.ReactNode | Node`. `ListBoxView.renderCell` at `:345–363` branches on `node instanceof Node`
  and otherwise calls `fillSlot` with the React arm.
- `src/renderer/uikit/ListBox/types.ts:148` — `emptyMessage` is currently `SlotText | Node`, which
  is structurally the same accepted set as `SlotContent`; `ListBoxView.fillMessage` calls
  `fillSlot` at `:256–270`.
- `src/renderer/uikit/Tree/TreeItem.ts:27,69` — `label` and `trailing` already use
  `React.ReactNode | Node`; `TreeItemView.setLabel` and `setTrailing` call `fillSlot` at
  `src/renderer/uikit/Tree/TreeItemView.ts:318–348`.
- `src/renderer/uikit/Tree/types.ts:20` — `ITreeItem.label` is already the same union and is
  passed by `TreeView.itemProps` at `TreeView.ts:448–462` to `TreeItemView`.
- `src/renderer/uikit/Tree/types.ts:177,200` — `TreeProps.renderTrailing` and `renderItem` already
  return the same union. `renderTrailing` reaches `TreeItemView.setTrailing`; `renderItem` reaches
  `TreeView.renderCell` at `TreeView.ts:414–425`, which handles `Node` directly or via `fillSlot`.
- `src/renderer/uikit/Tree/SectionItem.ts:16` — `label` already has the union. The distinct Tree
  section view, not the flat ListBox section view, calls `fillSlot` at
  `src/renderer/uikit/Tree/SectionItemView.ts:68–95`.
- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts:10,15` — panel `children` and
  `buttons` already have the union; `CollapsiblePanelStackView` calls `fillSlot` for content at
  `:191–208` and for buttons at `:160–168`.
- `src/renderer/uikit/Dialog/DialogContent.ts:20` — `headerButtons` already has the union;
  `DialogContentView.hasSlot` / `syncHeaderButtons` at
  `src/renderer/uikit/Dialog/DialogContentView.ts:29,204–222` call `fillSlot`.
- `src/renderer/editors/board/BoardsTreeView.ts:12` and
  `src/renderer/editors/tools/ToolsTreeView.ts:15` — the view-facing callback types already have
  the union and should follow their public shims to `SlotContent`.

`IListBoxItem.label` at `src/renderer/uikit/ListBox/types.ts:18` is intentionally a `string`: the
default flat-list row’s search/highlight contract is string-based, and `ListBoxView` passes it to
the separate `SectionItemView` or the default row accordingly. It is not widened by this task.

### Rejected or out-of-scope React-only contracts

The two listed candidates below fail the consumer test and remain narrow:

| Contract | Proof that widening would lie |
|---|---|
| `PanelProps.children` at `src/renderer/uikit/Panel/Panel.tsx:8` | `Panel` is a React layout shim and renders `{children}` directly in JSX at `:124–150`, specifically `:149`; it does not call `fillSlot` and a DOM `Node` is not a valid React child. |
| `PopoverProps.children` at `src/renderer/uikit/Popover/PopoverModel.ts:76` | Ordinary popover children are mounted through `mountReactHandle` at `src/renderer/uikit/Popover/PopoverView.tsx:90–101`; `renderChildren` returns a React fragment at `:236`, `return <>{this.props.children}{resizeHandle}</>`. More decisively, `PopoverView` throws at `:56–57` when `contentView` and `children` are both supplied: `if (props.contentView && props.children != null) { throw new Error("PopoverView cannot receive both contentView and children."); }`. The two arms are explicitly mutually exclusive, and `contentView` is the native arm; widening `children` would create a second native path and make that guard ambiguous about which arm owns a DOM node. |

The following nearby React contracts were checked to prevent a false positive but are not part of
the slot sweep: `ToolbarProps.children` is rendered inside a `mountReactHandle` at
`src/renderer/uikit/Toolbar/ToolbarView.ts:41–60`; `TextProps.children` is a JSX child at
`src/renderer/uikit/Text/Text.tsx:45–63`; `TooltipProps.children` is a required
`ReactElement` cloned at `src/renderer/uikit/Tooltip/Tooltip.tsx:7–16,52–75`; and
`WithMenuProps.children` is a render prop returning a `ReactElement` at
`src/renderer/uikit/Menu/WithMenu.tsx:15–18,68–71`. They are React APIs, not under-declared native
slots. `Breadcrumb` and the input-like controls also destructure or ignore inherited `children`
without sending them to a slot, so they are not content contracts to widen.

The explicit non-goals remain unchanged: `ui/app/EditorErrorBoundary.tsx:4` stays
`children: ReactNode` because it is a React error boundary; `src/renderer/components/page-manager/`
is owned by US-1134; and `src/renderer/theme/icons.tsx` plus
`src/renderer/uikit/shared/slots.ts` are owned by US-1136. `TextChromeViewProps` is already
`SlotContent` at `src/renderer/editors/base/TextChromeView.ts:20–23`.

## Implementation plan

1. **Use the shared alias in slot contracts.** Import `type SlotContent` directly from
   `uikit/shared/fill-slot.ts`. Update the 16 confirmed declarations above, including omitting and
   redeclaring inherited `children` in `Button.tsx`, `Checkbox.tsx`, `Label.ts`, and `Tag.tsx`.
   Update the matching view method parameters: `ListItemView.setLabel` and `setTrailing`,
   `SelectableRowView.updateContent`, `TruncatedTextView.updateContent`,
   `CheckboxView.updateChildren`, `TreeItemView.setLabel`, `TreeItemView.setTrailing`, and
   `DialogContentView.hasSlot` / `syncHeaderButtons`. Keep the ListBox/Tree item and callback
   unions behaviorally identical while replacing their spelling with `SlotContent`; do not alter
   `CollapsiblePanelStackProps.children`, which is the stack's React child shape rather than a panel
   content slot. After each public widening, remove redundant view-side Omit/redeclare seams:
   `ButtonViewProps` becomes `ButtonProps` instead of omitting and redeclaring `children`. Check
   `CollapsiblePanelStackView.tsx:12`, `DialogContentView`, and `SplitButtonView` explicitly rather
   than assuming a seam: the stack line omits `CollapsiblePanelStackProps.children` but does not
   redeclare it, and that public field remains React-only; removing it would change the view's
   rest-prop behavior, so leave it unchanged. `SplitButtonView.ts` consumes `SplitButtonProps`
   directly, and `DialogContentView.tsx` only has method signatures to normalize.

2. **Make TruncatedText’s widening truthful.** Once `TruncatedTextView.updateContent` accepts
   `SlotContent`, rename `getTextFromReactChildren` to reflect that it accepts slot content and add
   the minimal native arm before the existing React handling:
   `if (children instanceof Node) return children.textContent ?? "";`. The helper currently extracts
   strings, numbers, arrays, and React element children at `TruncatedTextView.tsx:10–18`; the new
   line makes the overflow tooltip derive plain text from a legal DOM-node argument. This is a
   deliberate, minimal behavior addition required to make the public widening honest, not scope
   creep. Keep the visible content path through `fillSlot` unchanged; `textContent` is appropriate
   because the tooltip needs descendant text, not DOM markup.

3. **Widen the two editor shims that feed Tree slots.** Change `BoardsTreeProps.renderTrailing` and
   `ToolsTreeProps.renderTrailing` to return `SlotContent`; update their already-node-capable view
   callback annotations to the alias. `TreeView` and `TreeItemView` already perform the native-node
   branch and must not be behaviorally refactored.

4. **Delete the Git laundering cast.** In
   `src/renderer/editors/git-tree/CommitDiffPanel.ts:321–329`, replace the casted assignment with
   `getTrailing: this.getTrailing`. The producer at `:348–358` returns `Node | null`, and the
   receiving path is `FileListView.rowsFor` → `IListBoxItem.trailing` → `ListItemView.setTrailing`
   → `fillSlot`; the widened declaration makes this assignment honest.

5. **Delete the Graph laundering helper.** In
   `src/renderer/editors/graph/GraphLegendPanel.tsx`, remove `asReactNode` at `:21–23` and pass the
   six `createLevelIconElement` / `createShapeIconElement` results directly at `:439,449,460,474,484,495`.
   Change `LegendRowProps.icon` at `:538` to `SlotContent`. Preserve `LegendRow`’s explicit
   `instanceof Node` branch and dedicated host at `:545–570`; only the type and call-site casts are
   removed.

### Before → after snippets

Public slot declarations:

```ts
// Before: FileList.ts:22
getTrailing?: (item: FileListItem) => ReactNode;

// After
getTrailing?: (item: FileListItem) => SlotContent;
```

```ts
// Before: ListItem.tsx:24,44
label: React.ReactNode;
trailing?: React.ReactNode;

// After
label: SlotContent;
trailing?: SlotContent;
```

Inherited children must be removed from the HTML attribute base before widening:

```ts
// Before: Button.tsx:7 and ButtonView.tsx:11–13
extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "onKeyDown">
export type ButtonViewProps = Omit<ButtonProps, "children"> & {
    children?: SlotContent;
};

// After: the public prop owns the contract, and the view reuses it
extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "onKeyDown" | "children">

children?: SlotContent;
export type ButtonViewProps = ButtonProps;
```

```ts
// Before: CommitDiffPanel.ts:325
getTrailing: this.getTrailing as unknown as FileListProps["getTrailing"],

// After
getTrailing: this.getTrailing,
```

```ts
// Before: GraphLegendPanel.tsx:21–22 and a call site
function asReactNode(element: Node): React.ReactNode {
    return element as unknown as React.ReactNode;
}
icon={asReactNode(createLevelIconElement("root", 14))}

// After
icon: SlotContent;
icon={createLevelIconElement("root", 14)}
```

No React face is deleted, no view is converted, and no `fillSlot` runtime branch is changed.

## Concerns / open questions

- **Type alias surface:** `SlotContent` is a named export from `shared/fill-slot.ts`, not the
  `uikit/index.ts` barrel. Direct imports are already used by `ButtonView`, `InputView`,
  `DialogContent`, and editor base views. If a future extraction needs consumers to name the type
  without a deep import, that is a separate public-barrel decision; this task does not alter the
  barrel.
- **TruncatedText tooltip text:** `fillSlot` can render a `Node`, and the renamed slot-content text
  helper will use `children.textContent ?? ""` for that arm. This is a deliberate minimal behavior
  addition required to prevent a legal native value from silently producing an empty overflow
  tooltip; it does not convert or clone the node.
- **View-prop Omit seams:** `ButtonViewProps` has a genuine redundant Omit/redeclare pair and will
  reuse `ButtonProps` after the public widening. `CollapsiblePanelStackView.tsx:12` omits the
  stack-level `children` field but does not redeclare it; that field remains publicly `ReactNode` by
  design, and removing the omission would alter which value reaches `applyRestProps`. No such seam
  exists in `DialogContentView.tsx` or `SplitButtonView.ts`.
- **Single-use DOM nodes:** the existing `Tree`, `ListBox`, and icon comments already document that
  DOM nodes are attached, not cloned. The widening must not cache or clone returned nodes, and must
  preserve the existing identity gates in `ListItemView`, `TreeItemView`, and the board/tool tree
  views.
- **Concurrent work:** do not touch `src/renderer/theme/icons.tsx`,
  `src/renderer/uikit/shared/slots.ts`, or `src/renderer/components/page-manager/`. The icon and
  page contracts are US-1136 and US-1134 work, respectively.
- **Scope:** this is widening and type-alias normalization only. Do not convert React faces, remove
  `Toolbar`, `Panel`, `Popover`, `Text`, `Tooltip`, or `WithMenu`, and do not add tests or a test
  harness.

## Acceptance criteria

- [ ] Every confirmed contract in the investigation table accepts `SlotContent` (or a callback
      returning it), including the three newly found inherited `children` contracts.
- [ ] The ListBox and Tree families use `SlotContent` consistently for their already-node-capable
      label, trailing, `renderItem`, `renderTrailing`, section, and empty-message contracts.
- [ ] `ButtonViewProps` reuses the widened `ButtonProps` contract instead of repeating an
      Omit/redeclare; the checked `CollapsiblePanelStackView`, `DialogContentView`, and
      `SplitButtonView` cases have the documented no-change or normalization treatment.
- [ ] `TruncatedTextView` renames its text helper and returns `children.textContent ?? ""` for a
      native `Node`, so the widened prop does not silently degrade tooltip text.
- [ ] `CommitDiffPanel.ts:325` contains no cast; `this.getTrailing` assigns directly to
      `FileListProps.getTrailing`.
- [ ] `GraphLegendPanel.tsx` contains no `asReactNode` helper and exactly zero `asReactNode(` call
      sites; the six icon expressions pass their DOM results directly.
- [ ] `Panel.children`, `Popover.children`, `Toolbar.children`, `Text.children`, tooltip trigger
      children, `WithMenu.children`, `EditorErrorBoundary.children`, and the concurrent page/icon
      contracts remain unchanged for their documented React or ownership reasons.
- [ ] Runtime behavior is unchanged for existing callers; no view conversion, React-face deletion,
      dashboard entry, unit test, or test harness is added.
- [ ] The implementation passes `tsc --noEmit`, `npm run lint`, and `npm run build-prod`.

### Files requiring no changes

- `src/renderer/theme/icons.tsx` — US-1136.
- `src/renderer/uikit/shared/slots.ts` — US-1136 and explicit task boundary.
- `src/renderer/components/page-manager/` — US-1134.
- `src/renderer/ui/app/EditorErrorBoundary.tsx` — terminal React boundary.
- `src/renderer/uikit/Panel/Panel.tsx` — JSX child consumer; rejected.
- `src/renderer/uikit/Popover/PopoverModel.ts` and `PopoverView.tsx` — React children arm;
  `contentView` is the native seam.
- `src/renderer/uikit/Toolbar/Toolbar.ts` and `ToolbarView.ts` — nested React-root contract.
- `src/renderer/uikit/Text/Text.tsx` — direct JSX child consumer.
- `src/renderer/uikit/Tooltip/Tooltip.tsx` and `src/renderer/uikit/Menu/WithMenu.tsx` — React-only
  element/render-prop contracts.

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/components/file-list/FileList.tsx` | Use `SlotContent` for `getTrailing`. |
| `src/renderer/editors/git-tree/CommitDiffPanel.ts` | Delete the `getTrailing` double cast. |
| `src/renderer/editors/graph/GraphLegendPanel.tsx` | Widen `LegendRowProps.icon`; delete `asReactNode` and six calls. |
| `src/renderer/editors/base/ContentHostFooter.ts` | Use `SlotContent` for `footerContributions`. |
| `src/renderer/editors/base/EditorToolbar.ts` | Use `SlotContent` for `children`. |
| `src/renderer/editors/board/BoardsTree.tsx`, `BoardsTreeView.ts` | Use `SlotContent` for trailing callback types. |
| `src/renderer/editors/tools/ToolsTree.tsx`, `ToolsTreeView.ts` | Use `SlotContent` for trailing callback types. |
| `src/renderer/uikit/Button/Button.tsx`, `ButtonView.tsx` | Omit inherited `children`; redeclare it publicly as `SlotContent`, then remove the view-side Omit/redeclare duplicate. |
| `src/renderer/uikit/Checkbox/Checkbox.tsx`, `CheckboxView.tsx` | Widen public children and `updateChildren`. |
| `src/renderer/uikit/Label/Label.ts`, `LabelView.tsx` | Widen inherited children consumed by `fillSlot`. |
| `src/renderer/uikit/Tag/Tag.tsx` | Omit inherited `children`; redeclare it as `SlotContent`. |
| `src/renderer/uikit/ListBox/ListItem.tsx`, `ListItemView.ts`, `types.ts` | Widen label/trailing contracts and use the alias in the ListBox slot family. |
| `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx` | Use `SlotContent` for `ISegment.label`. |
| `src/renderer/uikit/SelectableRow/SelectableRow.tsx`, `SelectableRowView.tsx` | Widen children and the view method signature. |
| `src/renderer/uikit/SplitButton/SplitButton.ts` | Omit inherited `children`; redeclare it as `SlotContent`. |
| `src/renderer/uikit/TruncatedText/TruncatedText.tsx`, `TruncatedTextView.tsx` | Widen children, rename the text helper, and derive native tooltip text from `Node.textContent`. |
| `src/renderer/uikit/Tree/TreeItem.ts`, `TreeItemView.ts`, `SectionItem.ts`, `SectionItemView.ts`, `types.ts` | Normalize existing DOM-capable label/trailing/render contracts and view signatures to `SlotContent`. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts` | Normalize existing panel `children`/`buttons` slot unions to `SlotContent`; leave stack `children` unchanged. |
| `src/renderer/uikit/Dialog/DialogContent.ts`, `DialogContentView.tsx` | Normalize existing `headerButtons` union and its `hasSlot`/`syncHeaderButtons` signatures to `SlotContent`. |
