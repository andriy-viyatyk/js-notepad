# US-1282: Retire the `headerRef` callback protocol and rename the element prop to `headerHost`

**Status:** Implemented — awaiting human verification
**Epic:** none (De-React package 8 residue — see [backlog.md](../backlog.md))
**Created:** 2026-09-03

## Goal

Delete the unreachable React callback-ref protocol in `CollapsiblePanelStackView`, and rename the
surviving `headerRef` element prop to `headerHost` across the 35 secondary-view sites, so the name
describes the host-passing mechanism that is actually in use.

The implementation is complete. The callback protocol and its bookkeeping are gone, and all
element-valued `headerRef` sites now use `headerHost`; the remaining runtime header/collapse check
is still pending.

## Background

`de-react-refactoring-2.md` §1.7 records "43 uses of the `(el | null)` unmount convention", and the
backlog entry for package 8 repeats it. **That count conflates two different things**, verified
against source on 2026-09-03:

| Kind | Count | Where |
|---|---|---|
| React callback-ref protocol `(el: HTMLDivElement \| null) => void` | 8 | `uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` only |
| Plain element prop `headerRef: HTMLDivElement \| null` | 35 | `ui/secondary-views/**` + 14 editor secondary views |

### The callback protocol is unreachable

Before implementation, `CollapsiblePanelProps.headerRef` (`CollapsiblePanelStackView.ts:26`) had
**no supplier**. The only
producer of `CollapsiblePanelProps` in the repo is `SecondaryViewsView.toPanelDescriptor`
(`ui/secondary-views/SecondaryViewsView.ts:171-181`), which returns exactly five fields —
`id`, `name`, `alwaysRenderContent`, `children`, `childrenFactory` — and never `headerRef`. So
`panel.headerRef` is permanently `undefined`, which makes all of this dead:

- `:26` — the `CollapsiblePanelProps.headerRef` declaration
- `:56` — the `PanelRecord.headerRef` field
- `:187-191` — `oldRef`, `refChanged`, the `oldRef?.(null)` unmount call, the record assignment.
  `refChanged` is `undefined !== undefined` → always `false`.
- `:236` — `if (refChanged) record.headerRef?.(record.header)` — unreachable
- `:270` — `record.headerRef?.(null)` in `removePanel`

One line is **inert rather than dead** and needs care: `:197`

```ts
const showChevron = !panel.headerRef && !panel.childrenFactory && !panel.buttons;
```

`!panel.headerRef` is always `true`, so dropping that term preserves behaviour exactly. (In the one
live call path `childrenFactory` is always set, so `showChevron` is already always `false`; the term
removal is still behaviour-preserving for any future caller that omits `childrenFactory`.)

`CollapsiblePanelProps` is re-exported from `uikit/index.ts:7`, but uikit is internal to this repo —
it is not published, and boards are sandboxed HTML/scripts that do not import it. No external
consumer can be relying on the prop.

### The other 35 sites are host-passing, not drilling

Before implementation, `secondary-view-registry.ts:13` declared `headerRef: HTMLDivElement | null` —
an **element**, not a
callback. `SecondaryViewsView` receives the header element from `childrenFactory(header, isOpen)`,
stores it as `record.headerElement` (`:189`), and hands it down as `headerRef` in `lazyViewProps`
(`:206`). Each secondary view then passes it one hop into its own header
(`ExplorerSecondaryView.ts:67` → `createSideBarPanelHeader`), where
`SideBarPanelHeaderDom.update` consumes it at `SideBarPanelHeaderView.ts:124-127`.

This is the same conclusion EPIC-082's US-1273 reached for `toolbarPortalRef`: **the mechanism was
already host-passing and only the React vocabulary was wrong.** It is not pass-through drilling —
the 35 sites are ~17 sibling leaf views x 2 lifecycle methods (`onMount` + `onUpdate`), each
consuming the host one hop below. So there is no structural change to make here, only a rename.

## Implementation plan

### 1. Delete the dead callback protocol

`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts`

- [x] Delete the `headerRef?: (el: HTMLDivElement | null) => void;` line from
      `CollapsiblePanelProps` (`:26`).
- [x] Delete `headerRef?: (element: HTMLDivElement | null) => void;` from `PanelRecord` (`:56`).
- [x] In `updateHeader` (`:186`), delete the `oldRef` / `refChanged` block:

```ts
// before
const oldRef = record.headerRef;
const refChanged = oldRef !== panel.headerRef;
if (refChanged) {
    oldRef?.(null);
    record.headerRef = panel.headerRef;
}
// after — nothing
```

- [x] `:197` — drop the always-true term:

```ts
// before
const showChevron = !panel.headerRef && !panel.childrenFactory && !panel.buttons;
// after
const showChevron = !panel.childrenFactory && !panel.buttons;
```

- [x] `:236` — delete `if (refChanged) record.headerRef?.(record.header);`
- [x] `:270` — delete `record.headerRef?.(null);` from `removePanel`

### 2. Rename the element prop `headerRef` to `headerHost`

Mechanical, 35 occurrences across 17 files. Rename the **declarations** first, then let `tsc` find
every call site.

Declarations:

- [x] `src/renderer/ui/secondary-views/secondary-view-registry.ts:13` — in `SecondaryViewProps`.
      Its doc comment already says "Header host element owned by the panel stack", so it needs no
      wording change once the field name agrees with it.
- [x] `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts:8` — in
      `SideBarPanelHeaderDomProps`, plus the two reads at `:124-127`. The private `currentHeader`
      field name is already correct and stays.

Suppliers / consumers (2 occurrences each unless noted — `onMount` and `onUpdate`):

- [x] `src/renderer/ui/secondary-views/SecondaryViewsView.ts:206` (1)
- [x] `src/renderer/editors/archive/ArchiveSecondaryView.ts`
- [x] `src/renderer/editors/board/BoardSecondaryView.ts`
- [x] `src/renderer/editors/explorer/BoardsSecondaryView.ts`
- [x] `src/renderer/editors/explorer/ExplorerSecondaryView.ts`
- [x] `src/renderer/editors/explorer/SearchSecondaryView.ts`
- [x] `src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.ts`
- [x] `src/renderer/editors/git-tree/GitPanelSecondaryView.ts`
- [x] `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.ts`
- [x] `src/renderer/editors/link-editor/panels/LinkHostnamesSecondaryView.ts`
- [x] `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts`
- [x] `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts`
- [x] `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts` (3)
- [x] `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts` (3)
- [x] `src/renderer/editors/rest-client/panels/RestPanelSecondaryView.ts`

Verify with `grep -rn "headerRef" src/` — it must return **zero** hits when done.

### 3. Documentation

- [x] `doc/architecture/secondary-views.md` — if it documents `headerRef`, rename it and note that
      the panel stack owns the header element and passes it to the panel component.
- [x] `doc/tasks/backlog.md` — remove the "43 uses of the `(el | null)` unmount convention" claim
      from the package 8 entry and replace it with the corrected split from this document.

## Files that need NO changes

- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css` — no selector depends on the ref.
- `src/renderer/uikit/index.ts` — re-exports the type, not the field; the rename is internal to it.
- Every `components/tree-provider/**` file — its portal refs went with US-1273; the `{ current: T }`
  ref boxes (`components/git-tree/GitTreeView.ts:204,242`) are a separate package 8 item and are
  **out of scope** here.

## Concerns

1. **Was the callback prop really unreachable?** Before implementation, `grep -rn "headerRef" src/`
   returned 43 hits, and none outside `CollapsiblePanelStackView` assigned a *function* to it. The only
   `CollapsiblePanelProps` producer is `toPanelDescriptor:171-181`. If implementation finds a
   supplier this document missed, **stop and report** rather than deleting.
2. **The chevron.** `:197` is the only behavioural line in step 1. Confirm after the change that a
   panel supplying neither `childrenFactory` nor `buttons` still renders its chevron — no such panel
   exists today, so this is a code-reading check, not a UI check.
3. **Rename churn vs. value.** 35 mechanical sites for a naming fix. The justification is that
   `Ref` names a React protocol this codebase has now removed everywhere else, so the last use of
   the word is actively misleading. If the churn is unwanted, step 1 (deleting the dead protocol)
   stands on its own and step 2 can be dropped.

## Acceptance criteria

- [x] `grep -rn "headerRef" src/` returns zero hits.
- [x] `CollapsiblePanelStackView` has no `(el | null)` callback field, and no `refChanged` logic.
- [x] `npm run typecheck`, `npm run lint`, `npm run build-prod` all pass.
- [ ] Runtime: the sidebar opens; each panel header renders its icon, title, and action buttons;
      collapsing and expanding panels still moves the header actions correctly. Check at least
      Explorer, Git, and a notebook panel (the three-occurrence files).
- [x] `doc/tasks/backlog.md`'s package 8 entry no longer claims 43 callback-ref uses.

## Files changed

| File | Change |
|---|---|
| `uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` | Delete 8 dead callback-protocol occurrences + the always-true chevron term |
| `ui/secondary-views/secondary-view-registry.ts` | `headerRef` to `headerHost` (declaration) |
| `ui/secondary-views/SideBarPanelHeaderView.ts` | `headerRef` to `headerHost` (declaration + 2 reads) |
| `ui/secondary-views/SecondaryViewsView.ts` | `headerRef` to `headerHost` (1 supplier site) |
| 14 editor `*SecondaryView.ts` files | `headerRef` to `headerHost` (31 sites) |
| `doc/architecture/secondary-views.md` | Rename in prose if referenced |
| `doc/tasks/backlog.md` | Correct the §1.7 claim |
