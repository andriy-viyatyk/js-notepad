# US-1265: Replace the three hand-rolled re-implementations of sanctioned helpers

Epic: [EPIC-080 — State, lifetime & scheduling core](../../epics/EPIC-080.md)

## Goal

Replace only the genuine helper re-implementations in the three named sites, while preserving
creation, reuse, DOM attachment, disposal, and surrounding model-handoff order. The investigation
finds that `InputDialogView` is a safe `KeyedList` conversion and `TreeProviderViewImpl` is a
`SubtreeSwap` conversion only with an explicit clear-before-create shape; `PageContentView` should
remain hand-written in this task.

## Background

### Current-source baseline and line drift

The line numbers in EPIC-080 were checked against the current working tree after US-1261 and
US-1266. The cited source is not treated as authoritative where its current behavior differs.

| Epic citation | Current location | Drift and verified meaning |
|---|---|---|
| `src/renderer/ui/dialogs/InputDialogView.ts:140-194` | `:141-190` (`syncButtons`: `:141-180`; `disposeButtons`: `:183-189`) | The method starts one line later and the current hand-written block ends four lines earlier. It still owns the same position-keyed button reconciliation. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:167-181` | `:167-181` | No line drift. `enterTreeArm` creates/mounts/inserts a `TreeView`; `leaveTreeArm` disposes, removes, clears the field, then clears the model handoff. |
| `src/renderer/ui/app/PageContentView.ts:125-182` | `:125-182` | The content block is at the cited lines. The compare block is now `:184-203`, outside the cited range. US-1261 removed the compare-only `generation` field and changed `queueMicrotask` to `afterDispatch`; `live` and the `sync()` guard remain. |

The worktree contains the landed/in-progress changes for earlier EPIC-080 tasks. This document uses
the current files as the implementation baseline and does not alter the dashboard or epic table.

### Sanctioned helper contracts

#### `KeyedList`

The implementation is `src/renderer/uikit/shared/keyed-list.ts:1-178`. It reconciles one dedicated
`Node` parent by unique keys:

- `update()` validates every key before mutation and rejects duplicate keys.
- Removed records run `options.remove(element, item)` **before** the helper detaches the element
  (`:66-67`); removal errors are captured, all removals are attempted, and creation is skipped if a
  removal failed.
- All removals complete before any missing record is created (`:75-87`). Existing records are
  reused by key, and order is corrected with a cursor without reinserting a node already at the
  cursor (`:91-105`).
- Every retained record is updated only after final DOM ordering (`:107-112`), and its stored item
  is then replaced.
- `clear()` and `dispose()` clear the record map, call `remove` before detaching each element, try
  every cleanup, and rethrow the first failure. `dispose()` is idempotent and prevents later updates.

The helper owns only the managed DOM nodes. A view created in a callback remains responsible for
its own `mount()`/`dispose()` lifecycle; a remove callback must dispose that view before returning so
the helper can perform its mandated detach afterward.

#### `SubtreeSwap`

The implementation is `src/renderer/uikit/shared/subtree-swap.ts:1-89`. It owns one active
`IOwnedView` branch in a dedicated parent:

- `set(key, create)` is a no-op after disposal or when the key is unchanged.
- For a new key, it creates the replacement first, requires a detached root, claims ownership, and
  inserts the replacement before the old root (`:24-48`). Only then does it dispose and detach the
  previous branch.
- `clear()` and `dispose()` dispose the active view and remove its root. `disposeBranch()` always
  detaches in `finally`, even when view disposal throws, and rethrows the first disposal error.
- The helper, rather than `VanillaView.dispose()`, owns removal of the managed root. This is the
  same contract described in `src/renderer/uikit/CLAUDE.md:606-615`.

This ordering is deliberate: a normal `set()` is replacement-before-retirement. A caller that must
retire a branch before creating its replacement must use `clear()` first, then a separate `set()`.

### Helper consumer census

The current renderer source has **39 existing `new KeyedList` sites** and **55 existing
`new SubtreeSwap` sites**, counted with `rg -n --glob '*.ts' --glob '*.tsx'`. The three named sites
currently instantiate neither helper. No helper signature change or helper extension is proposed,
so no existing consumer needs a signature migration. The count is recorded because changing either
helper to accommodate `PageContentView` would affect a broad existing consumer set.

### Site 1 — `InputDialogView` is a genuine `KeyedList` re-implementation

`src/renderer/ui/dialogs/InputDialogView.ts:32` stores `ButtonView` instances in
`Map<number, ButtonView>`. `syncButtons()` at `:141-180` removes indexes no longer present by
calling `buttonView.dispose()` and then `buttonView.root.remove()`, creates missing buttons,
updates retained buttons, and appends each root into its indexed position. `disposeButtons()` at
`:183-189` repeats dispose-then-remove for every retained button. This is the same stable-key
collection shape as `KeyedList`, with the existing key being the **numeric position**, not the
button label. Position keys must remain: labels may repeat or change, and each click handler reads
the current state at that position.

The helper's removal order exactly matches the current site: the `remove` callback disposes the
`ButtonView`, then `KeyedList` detaches its root. The helper's create callback must construct and
mount a detached `ButtonView`, as the current code does before appending it. The main observable
ordering difference is that `KeyedList` updates retained items after it has reconciled DOM order;
the current loop updates a retained button before the append/reorder check. With position keys,
retained roots are already in their position after stale suffix removal, and `ButtonView.update()`
only updates button props/content, so no connected-DOM dependency is present in the current code.
This should still be called out and manually checked during implementation.

The helper also improves failure behavior: unlike the current inline sequence, it detaches a record
even if its `remove` callback throws, attempts all record removals, and rethrows the first failure.
That is a sanctioned helper guarantee, not a reason to move disposal after detachment.

Before:

```ts
for (const [index, buttonView] of this.buttonViews) {
    if (index < buttons.length) continue;
    buttonView.dispose();
    buttonView.root.remove();
    this.buttonViews.delete(index);
}

buttons.forEach((label, index) => {
    let buttonView = this.buttonViews.get(index);
    if (!buttonView) {
        buttonView = new ButtonView({ /* position-capturing onClick, children: label */ });
        buttonView.mount();
        this.buttonViews.set(index, buttonView);
    } else {
        buttonView.update({ /* position-capturing onClick, children: label */ });
    }
    if (this.buttonsPanel.children[index] !== buttonView.root) {
        this.buttonsPanel.append(buttonView.root);
    }
});
```

After (planned shape):

```ts
type DialogButton = { index: number; label: string };

private readonly buttonList: KeyedList<DialogButton, number, HTMLButtonElement>;
private readonly buttonViews = new Map<HTMLButtonElement, ButtonView>();

// Construct after buttonsPanel is available.
this.buttonList = new KeyedList(this.buttonsPanel, {
    keyOf: (button) => button.index,
    create: (button) => {
        const view = new ButtonView(this.buttonProps(button.index, button.label));
        view.mount();
        this.buttonViews.set(view.root, view);
        return view.root;
    },
    update: (element, button) =>
        this.buttonViews.get(element)?.update(this.buttonProps(button.index, button.label)),
    remove: (element) => {
        this.buttonViews.get(element)?.dispose();
        this.buttonViews.delete(element);
    },
});

private syncButtons(buttons: string[]): void {
    this.buttonList.update(buttons.map((label, index) => ({ label, index })));
}
```

The actual implementation should preserve the current inline `onClick` body and its
`this.model.state.get().buttons?.[index] ?? label` fallback. Register `this.buttonList.dispose()`
with `this.own()` at the existing `onMount()` cleanup point (`:104`), replacing
`disposeButtons()`. Do not key by label and do not add button views with `this.child()`: the list's
remove callback is the existing per-button lifetime boundary, and double ownership would violate
`claimViewOwnership()`.

### Site 2 — `TreeProviderViewImpl` is a genuine one-branch `SubtreeSwap` shape, with ordering work

`src/renderer/components/tree-provider/TreeProviderViewImpl.ts:147-181` has one conditional
`TreeView` branch. `applyState()` leaves the branch when the provider has an error/empty result or
when `state.searchKey` changes, and enters it when no tree is present. `enterTreeArm()` creates a
detached `TreeView`, registers it as a parent child, inserts it before `searchPanel`, mounts it, and
then calls `this.model.setTreeModel(view.model)`. `leaveTreeArm()` performs the opposite lifetime
boundary: `TreeView.dispose()`, root removal, field clearing, and finally
`this.model.setTreeModel(null)`.

The current order is load-bearing. `TreeView` disposal releases the grid, row views, and tree model
driver (`src/renderer/uikit/Tree/TreeView.ts:105-119`); the provider deliberately clears the model's
tree handoff only after that child is released (`TreeProviderViewImpl.ts:75-83`). The helper's
default `set()` order would create, insert, and potentially mount the new branch while the old
tree model is still installed, then dispose the old branch. That is not equivalent.

Therefore this is not a blind `set(newKey)` conversion. The safe plan is to replace the hand-written
manager with `SubtreeSwap<number>` but preserve the existing two-phase order:

1. `leaveTreeArm()` calls `treeSwap.clear()` first; the helper disposes the old `TreeView` before
   detaching its root. In a `finally` block, clear `treeView` and call `setTreeModel(null)` so those
   bookkeeping steps still happen if disposal reports an error.
2. `enterTreeArm()` calls `treeSwap.set(state.searchKey, factory)` only after the old branch and
   model handoff are gone. The factory creates the `TreeView` but does not mount it; after `set()`
   has inserted the detached root, the caller mounts it and then calls `setTreeModel(view.model)` in
   the same order as today.
3. Construct the swap once and register `treeSwap.dispose()` with the owner before the existing
   driver cleanup registration, so the active tree is released before
   `this.model.setTreeModel(null)` and before driver disposal. The tree is no longer registered with
   `this.child()` because `SubtreeSwap` claims ownership itself.

Before:

```ts
const view = this.child(new TreeView<TreeProviderNode>(this.treeProps(tNodes, state)));
this.treeView = view;
this.root.insertBefore(view.root, this.searchPanel ?? null);
view.mount();
this.model.setTreeModel(view.model);

// ...
this.treeView.dispose();
this.treeView.root.remove();
this.treeView = undefined;
this.model.setTreeModel(null);
```

After (planned ordering-preserving shape):

```ts
private readonly treeSwap: SubtreeSwap<number>;

// In the constructor, before dynamic search/message panels are created:
const treeHost = document.createElement("div");
treeHost.dataset.part = "tree-host";
treeHost.style.display = "contents";
this.root.append(treeHost);
this.treeSwap = new SubtreeSwap(treeHost);
// Register this before the existing driver and setTreeModel cleanups.
this.own(() => this.treeSwap.dispose());

private enterTreeArm(tNodes: Traited<TreeProviderNode[]>, state: ProviderState): void {
    let created: TreeView<TreeProviderNode> | undefined;
    this.treeSwap.set(state.searchKey, () => {
        created = new TreeView<TreeProviderNode>(this.treeProps(tNodes, state));
        return created;
    });
    if (!created) return;
    this.treeView = created;
    created.mount();
    this.model.setTreeModel(created.model);
}

private leaveTreeArm(): void {
    if (!this.treeView) return;
    try {
        this.treeSwap.clear();
    } finally {
        this.treeView = undefined;
        this.model.setTreeModel(null);
    }
}
```

The final code must insert the new root before `searchPanel` as the current `insertBefore` does.
Because `SubtreeSwap` appends to its parent, create one permanent raw `div` tree host in
`TreeProviderViewImpl`, set `treeHost.style.display = "contents"`, append that host before any
search/message arm is created, and pass the host to `SubtreeSwap`. The host is a structural boundary,
not `TreeView`'s internal grid host. `display: contents` keeps the `TreeView` root in the provider's
flex formatting context while making the host's extra DOM level layout-transparent.

This host choice is source-verified: `TreeProviderView.css` styles only the provider root, search
panel, and error/empty panels, with no direct-child selector; a repository search found no other
selector or code query that requires the `TreeView` root to be a direct provider child. The host
therefore preserves the current visual/sibling boundary while giving `SubtreeSwap` the dedicated
parent it requires.

No `SubtreeSwap` signature change is needed. Its 55 existing consumers retain replacement-before-
disposal semantics; only this call site uses `clear()` followed by `set()` to retain its stronger
teardown-before-create invariant.

## Implementation Plan

### 1. Implement the `InputDialogView` conversion

- Update `src/renderer/ui/dialogs/InputDialogView.ts` to import `KeyedList` directly from
  `../../uikit/shared/keyed-list`.
- Replace the numeric-index-to-view map with a `KeyedList` whose items carry `{ index, label }`,
  keyed by `index`; retain an element-to-`ButtonView` map solely for lifecycle and update lookup.
- Move the current button-props/onClick construction into the list's `create` callback and retain
  the existing callback's state reads and index semantics.
- Keep `ButtonView.mount()` in `create`, before the helper attaches the root.
- Keep `ButtonView.dispose()` in `remove`; let `KeyedList` detach afterward.
- Change `syncButtons()` to map the current `string[]` to indexed records and call one
  `buttonList.update()`.
- Replace the `this.own(() => this.disposeButtons())` registration at `onMount():104` with the
  list disposal registration. Remove the now-unused `disposeButtons()` method.
- Do not change dialog model behavior, input/radio bindings, focus scheduling, or button click
  result construction.

### 2. Implement the ordering-preserving `TreeProviderViewImpl` conversion

- Update `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` to import `SubtreeSwap`
  directly from `../../uikit/shared/subtree-swap`.
- Add one permanent `treeHost` (`display: contents`) and one `SubtreeSwap<number>` using that host.
  Append the host before any dynamic search/message panel, and do not allow the swap to manage the
  whole provider root because that root also contains those panels.
- Register the swap's disposal at construction in the same owner phase as the existing driver
  cleanup, before driver disposal and before the final `setTreeModel(null)` cleanup.
- Remove `this.child(new TreeView(...))` for this branch; the swap owns the active tree view.
- Preserve `applyState()`'s `searchKey` gate and `this.searchKey` bookkeeping.
- Implement `leaveTreeArm()` as helper clear → field/model bookkeeping in `finally`; preserve
  disposal-before-model-detach and disposal-before-root-detach ordering.
- Implement `enterTreeArm()` as helper set with a detached, unmounted factory result, then mount the
  captured view and publish its model only after the helper has attached the root.
- Verify the host remains layout-transparent and that the provider root's only dynamic siblings are
  the tree host, search panel, and message panel. Do not alter `SubtreeSwap` for this site.

### 3. Explicitly defer `PageContentView`

- Make no implementation change to `src/renderer/ui/app/PageContentView.ts` in US-1265.
- Keep `syncContent()`'s manual content branch manager (`:125-182`): it manages raw wrapper roots
  with two different shapes (`empty-page-root` versus `page-editor-container`, with an optional
  `ornament-page-area`) and nests `RenderEditorView` inside the editor container. `KeyedList` is a
  keyed collection helper and does not model this one raw conditional wrapper.
- Keep `clearContent()`'s order: dispose `RenderEditorView`, remove its root in `finally`, then
  remove the containing `contentRoot` (`:167-182`). Do not replace it with a helper that cannot
  represent the wrapper owner without introducing a new view abstraction.
- Keep `updateCompare()`/`clearCompare()` (`:184-203`) manual. `clearCompare()` removes the compare
  root immediately and schedules the captured `CompareEditor.dispose()` through `afterDispatch`.
  This is the US-1261 contract: every captured retired view is disposed FIFO, while root removal
  precedes disposal during a state dispatch.
- Do not replace compare retirement with `SubtreeSwap`, whose contract inserts a replacement before
  disposing the old branch and detaches after disposal. Doing so would change the Monaco-sensitive
  detach-before-deferred-dispose order. Extending `SubtreeSwap` with another disposal mode would
  require reconsidering all 55 consumers and is outside this task.
- Do not remove `live`, change the `sync()` guard, touch `PageModel.deferEditorCleanup`,
  `pendingCleanupPromises`, `drainDeferredEditorCleanup`, or edit
  `src/ipc/renderer/renderer-events.ts`.

### 4. Verify behavior without tests

This project has no unit-test or test-harness workflow for this task. Run the project typecheck,
lint, and production build after implementation, then manually exercise the relevant flows:

- Input dialog: initial buttons, label-only updates, suffix removal, repeated labels, and closing
  while a button is present; verify removed buttons dispose before their roots detach.
- Tree provider: normal tree entry, error/empty transitions, deep/shallow search-key transitions,
  search panel open/close, and provider disposal; verify the old tree is disposed and its model
  handoff cleared before the replacement is created.
- Page content: compare enter/exit twice quickly, ordinary editor replacement, empty-page display,
  and page switching; verify US-1261's detach-before-`afterDispatch` compare disposal remains.

## Concerns

### PageContentView should be deferred and the task should shrink

The epic's blanket claim that all three sites can adopt sanctioned helpers is not supported by the
current contracts. `InputDialogView` is a direct keyed-list replacement. `TreeProviderViewImpl`
needs a caller-level clear-before-set restructuring to preserve its model-handoff order. The two
`PageContentView` patterns are different:

- The content branch is a raw DOM wrapper plus a nested editor view, not a direct keyed collection or
  one helper-owned `IOwnedView` root.
- The compare branch is structurally one conditional child, but US-1261 deliberately established
  root removal before deferred disposal. `SubtreeSwap` guarantees the reverse at retirement.

Consequently, US-1265 should split/shrink to the Input and tree sites. A future PageContent task can
first design a dedicated content-branch owner and decide whether a separate deferred-retirement
helper operation is warranted. It must count and review all 55 current `SubtreeSwap` consumers before
changing that helper's contract. No helper extension is recommended here.

### Tree swap host and disposal-phase ordering

`SubtreeSwap` appends to its `parent`; the current tree manager inserts before `searchPanel` in a
shared provider root. The planned `display: contents` host supplies a stable dedicated parent at
that exact boundary, and the source contains no direct-child selector/query that would make the
extra structural level observable. The conversion must also account for the fact that a
swap registered with `own()` is disposed in the owner's store phase, whereas the current `TreeView`
is a `child()` disposed in the child phase. The verified provider invariant is that tree/search
children release before the model driver. `removeSearch()` only removes and disposes its own
search controls and does not access the tree, so disposing those controls before the swap is not a
cross-component ordering dependency.

### KeyedList update timing

`KeyedList` calls retained-record updates after order reconciliation, while the current button loop
updates during its append pass. The intended button key is the numeric position, and `ButtonView`
prop updates are DOM-local, so the timing difference appears safe. It must remain an explicit manual
check rather than an unverified assumption.

### Error behavior

Both sanctioned helpers contain disposal errors and continue cleanup. The current Input and tree
sites do not uniformly use `finally` around all bookkeeping. The planned conversions must preserve
the existing public error propagation while ensuring roots and model handoffs cannot remain stale
after an error. This is a deliberate robustness change only at the helper's established disposal
boundary; it must not be used to reorder normal successful teardown.

### Hard exclusions

The following files and mechanisms are outside this task and must remain unchanged:

- `src/renderer/core/state/listener-list.ts`, `src/renderer/core/state/dispatch.ts`, and
  `src/renderer/uikit/shared/vanilla-view.ts` — prior epic mechanisms are consumed as-is.
- `src/renderer/uikit/shared/keyed-list.ts` and `src/renderer/uikit/shared/subtree-swap.ts` — no
  helper API extension or semantic change is planned.
- `src/renderer/ui/app/PageContentView.ts` — explicitly deferred after current-source review.
- `src/renderer/api/pages/PageModel.ts` — retain `deferEditorCleanup`,
  `pendingCleanupPromises`, and `drainDeferredEditorCleanup`.
- `src/ipc/renderer/renderer-events.ts` — the separate IPC listener list remains deferred.
- `doc/active-work.md` and `doc/epics/EPIC-080.md` — no dashboard or epic-table changes.

## Acceptance Criteria

- [ ] `InputDialogView` uses `KeyedList` with numeric position keys, preserves button reuse and
  click-result semantics, disposes each removed `ButtonView` before helper detachment, and disposes
  the list from the existing owner lifecycle.
- [ ] `TreeProviderViewImpl` uses `SubtreeSwap<number>` with the permanent `display: contents`
  host at the current tree boundary; old tree disposal, root detachment, `treeView` bookkeeping,
  and `setTreeModel(null)` complete before a replacement is created.
- [ ] `SubtreeSwap.set()` is not used as a blind replacement for the tree branch; the caller uses
  `clear()` before `set()` and retains the verified host/phase ordering.
- [ ] `PageContentView` remains unchanged in this task: its content wrapper lifecycle and
  compare-root-removal-before-`afterDispatch` disposal are preserved.
- [ ] No `live`, `generation`, or `inert` flag is retired; `PageContentView.live` and its `sync()`
  guard remain.
- [ ] `PageModel.deferEditorCleanup`, `pendingCleanupPromises`, and
  `drainDeferredEditorCleanup` remain untouched, as does `src/ipc/renderer/renderer-events.ts`.
- [ ] No change is made to either helper signature or behavior, so all 39 current `KeyedList` and
  55 current `SubtreeSwap` consumers remain source-compatible.
- [ ] No unit tests or test harnesses are added; typecheck, lint, production build, and the manual
  Input/tree/Page behavior checks are recorded after implementation.
- [ ] The dashboard and epic document remain unchanged.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/ui/dialogs/InputDialogView.ts` | Replace the position-keyed manual button reconciliation with `KeyedList`; retain button props, mount order, and dispose-before-detach removal. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | Adopt `SubtreeSwap<number>` with a permanent layout-transparent host and clear-before-set ordering that preserves `TreeView` disposal and `setTreeModel` handoff. |
| `src/renderer/ui/app/PageContentView.ts` | No change; defer both manual branch managers because their wrapper and detach/deferred-dispose contracts do not fit the sanctioned helpers. |
| `src/renderer/uikit/shared/keyed-list.ts` | No change; existing remove-before-detach and disposal behavior is the required contract. |
| `src/renderer/uikit/shared/subtree-swap.ts` | No change; existing replacement-before-disposal behavior is required by its 55 consumers. |
| `doc/tasks/US-1265-sanctioned-helpers/README.md` | This investigation and implementation plan. |

Files that need **no changes** in US-1265:

- `src/renderer/core/state/listener-list.ts`
- `src/renderer/core/state/dispatch.ts`
- `src/renderer/uikit/shared/vanilla-view.ts`
- `src/renderer/core/utils/DisposableStore.ts`
- `src/renderer/ui/app/PageContentView.ts`
- `src/renderer/api/pages/PageModel.ts`
- `src/ipc/renderer/renderer-events.ts`
- `src/renderer/uikit/shared/keyed-list.ts`
- `src/renderer/uikit/shared/subtree-swap.ts`
- `src/renderer/uikit/Button/ButtonView.ts`
- `src/renderer/uikit/Input/InputView.ts`
- `src/renderer/components/tree-provider/TreeProviderView.css`
- `src/renderer/ui/app/Pages.css`
- `src/renderer/ui/app/RenderEditorView.ts`
- `src/renderer/editors/compare/CompareEditor.ts`
- `doc/active-work.md`
- `doc/epics/EPIC-080.md`
