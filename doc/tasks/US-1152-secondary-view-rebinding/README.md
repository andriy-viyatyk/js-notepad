# US-1152 — Secondary-view state bindings survive editor replacement

**Status:** Open · **Epic:** none (pre-existing defects surfaced by EPIC-071 close review)

## Goal

Make the affected secondary-view components replace their editor/page subscriptions when
their model identity changes, so a reused view tracks the current editor and no longer
retains callbacks from an old editor. Also make the link category panel recover when its
provider is unavailable at first mount and becomes available later.

## Background

EPIC-071's close review records these as pre-existing Finding 1, Finding 2, and Finding 9,
not regressions introduced by the conversion. The EPIC-071 commit changed
`LinkCategoryPanel.ts` only for the tooltip implementation; its diff contains no binding
lifecycle change, and the other five listed source files were not changed by that commit.
The current source confirms the same structural defect: each affected view installs a
binding from the initial model, while its `onUpdate()` accepts a replacement model or
re-runs the binding helper without releasing the previous subscription.

### Scope count

The review material describes this as five findings and six files. The source-level
reconciliation is:

1. Link category retargeting: `LinkCategoryPanelView`'s editor-state binding and
   `LinkCategorySecondaryView`'s page/host header bindings — two files, one end-to-end
   category finding.
2. Mneme tree model/page rebinding — one file.
3. Link tags navigation rebinding — the `LinkTagsNavigationPanelView` class in one file.
4. Link tags category-list rebinding — one file.
5. Link hostname navigation rebinding — one file.

Thus there are five behavioral findings, six affected files, six affected view classes,
and eight affected `bind()` calls. The six files and current source ranges are:

| Finding | File and verified current range | Binding(s) |
|---|---|---|
| Category | `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts:47-60` | editor state at `:47` |
| Category | `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.ts:51-64` | page state at `:57`, host state at `:60` |
| Mneme | `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts:77-82,94-127` | model state at `:94`, page state at `:112` |
| Tags navigation | `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts:61-78` | editor state at `:61` in `LinkTagsNavigationPanelView` |
| Tags list | `src/renderer/editors/link-editor/panels/LinkTagsPanel.ts:27-40` | editor state at `:32` |
| Hostnames navigation | `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts:51-73` | editor state at `:56` |

`LinkTagsSecondaryView.ts:238-287` is the outer secondary view. It has no direct
`bind()` call; its `onUpdate()` forwards the replacement `LinkEditor` to the navigation
child. The binding cited at `:61-78` belongs to the file's separate
`LinkTagsNavigationPanelView` class. `LinkHostnamesSecondaryView.ts` likewise forwards
the model to `LinkHostnamesNavigationPanelView` and has no binding of its own.

### Why `bind()` cannot currently be used for replacement

`src/renderer/uikit/shared/vanilla-view.ts:213-233` currently returns `void`. It applies
the selected state immediately, subscribes to the state, and passes the unsubscribe to
`this.own()` at `:232`. `own()` appends cleanup to the final `disposers` list at
`:144-148`; it has no early-release operation. `releaseChild()` at `:190-202` only
retires owned child views and cannot release an individual binding.

The current state primitive returns a callable unsubscribe from `IState.subscribe()`
(`src/renderer/core/state/state.ts:7-16`), and `TOneState` removes the matching listener
when that function is called (`:74-96`). Existing replaceable-view code uses the same
explicit-handle pattern. For example, `NotebookTagsSecondaryView` stores a
`stateUnsubscribe`, calls it before replacing the editor at
`src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts:48-58`, and guards
the callback by editor identity at `:90-95`.

### Design decision: candidate (A)

Implement a releasable `bind()` by making it return an idempotent `() => void` release
handle. Use a private release-aware ownership helper inside `VanillaView` so the handle is
registered for final disposal but removes its own entry from `disposers` when released
early. Ordinary views retain exactly their current final-disposal behavior, while repeated
rebindings do not accumulate dead disposer closures.

Candidate (B), adding explicit `state.subscribe()`-style fields and lifetime policy to
each affected view, would duplicate that policy in six files. Candidate (A) is the
smaller shared contract change and keeps ownership centralized in `VanillaView`.

The renderer contains **162 actual `this.bind(...)` invocation sites** across the current
`.ts`/`.tsx` source. The only extra search match is the illustrative `this.bind(...)` in
`vanilla-view.ts:209`, not an invocation. No current caller reads a return value, and
there is no `super.bind()` override or existing keyed-bind API. Changing the protected
return type from `void` to `() => void` therefore does not disturb the 162 existing
callers; the six affected view classes will be the first callers to retain the handle.
A keyed variant is not needed for this task: each replacement site has a small, explicit
number of bindings, and a returned handle makes the source identity and release point
visible at the call site.

## Implementation Plan

### 1. Add an early-release handle to `VanillaView.bind()`

Modify only `src/renderer/uikit/shared/vanilla-view.ts`, method `VanillaView.bind()`.
Keep the mount/active checks, immediate selected-value application, selector behavior,
and final ownership. Route the raw unsubscribe through a private release-aware ownership
helper so it can be called once explicitly, removed from `disposers`, and remain safe for
final disposal.

Before:

```ts
protected bind<T, R>(
    state: IState<T>,
    selector: (state: T) => R,
    apply: (value: R) => void,
): void {
    // checks and immediate apply remain
    const unsubscribe = state.subscribe(guardedApply, selector);
    this.own(unsubscribe);
}
```

After:

```ts
protected bind<T, R>(
    state: IState<T>,
    selector: (state: T) => R,
    apply: (value: R) => void,
): () => void {
    // existing checks and immediate apply remain
    const unsubscribe = state.subscribe(guardedApply, selector);
    return this.ownReleasable(unsubscribe);
}
```

The private `ownReleasable()` helper must preserve `own()`'s protected signature and
remove its wrapper from `disposers` before invoking the underlying cleanup. Its cleanup
must be idempotent, and final `dispose()` must remain safe after an early release. Do not
change `IState`, `TOneState`, `own()`, or `releaseChild()`. The returned function must
remove only this binding and must not mark the view disposed.

The helper's planned shape is:

```ts
private ownReleasable(dispose: Cleanup): Cleanup {
    this.assertActive();
    let released = false;
    const release: Cleanup = () => {
        if (released) return;
        released = true;
        const index = this.disposers.indexOf(release);
        if (index !== -1) this.disposers.splice(index, 1);
        dispose();
    };
    this.disposers.push(release);
    return release;
}
```

### 2. Fix the link category finding, including a late provider

Change these two files:

- `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts`
- `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.ts`

#### `LinkCategoryPanelView`

The replaceable identity is `LinkCategoryPanelProps.vm`, compared by `LinkEditor`
object identity. Retain the handle returned by `bind()` for the current editor state.
On a different `vm`, release the old handle before binding the new editor.

The existing `onMount()` returns at line 40 when `this.props.vm.treeProvider` is null,
so it installs neither the tree nor the state binding. Replace that one-shot setup with
an idempotent `syncTree(editor, provider)` path that is called from both the binding
callback and `onUpdate()`. Keep the binding selector purely over state; do not put
`editor.treeProvider` in it because `treeProvider` is a lazy getter over the plain
`_host` field (`src/renderer/editors/link-editor/LinkEditor.ts:174-180`), not reactive
state. A plain-field value in a state selector is not observed by `bind()`.

The late-provider path works because `LinkEditor.onHostAttached()` at
`src/renderer/editors/link-editor/LinkEditor.ts:232-233` calls `loadData()`, whose
`state.update()` at `:342-355` assigns a fresh `s.data` object and fresh `links` array
at `:350-353`. `TOneState` therefore sees the existing state projection change
(`compareSelection` compares arrays by identity at
`src/renderer/core/state/state.ts:28-38`), the binding callback re-runs, and
`syncTree()` re-reads `editor.treeProvider`. `onUpdate()` performs the same check for a
prop update even when the selected projection is unchanged. This is an implicit
dependency: if `loadData()` ever stops writing the state projection, late-provider
recovery will silently stop working and needs an explicit availability signal.

When the provider is present, create and mount `TreeProviderViewImpl` if absent, or
update it with `treeProps(provider)` if already present. When it is absent after a
previous tree existed, release that child and clear `treeProviderView`; do not leave a
tree for the old host visible. Keep `treeProps()` reading the current `this.props.vm`.
The binding callback must capture the bound editor and ignore a callback already in
flight after an identity change.

Before:

```ts
protected onMount(): void {
    const provider = this.props.vm.treeProvider;
    if (!provider) return;
    // create tree, then bind this.props.vm.state once
}

protected onUpdate(props: LinkCategoryPanelProps): void {
    const provider = props.vm.treeProvider;
    if (provider) this.treeProviderView?.update(this.treeProps(provider));
}
```

After:

```ts
protected onMount(): void {
    this.bindEditorState(this.props.vm);
    this.syncTree(this.props.vm);
}

protected onUpdate(props: LinkCategoryPanelProps): void {
    if (props.vm !== this.boundEditor) this.bindEditorState(props.vm);
    this.syncTree(props.vm);
}
```

The exact helper may use the selected projection already present at lines 49-53, but
must retain the returned handle and must call `syncTree()` for both model-state changes
and provider availability changes.

#### `LinkCategorySecondaryView`

The replaceable identity is `SecondaryViewProps.model` narrowed to a `LinkEditor`,
compared by object identity. Its header has two independent replaceable sources:
`editor.page?.state` selected by `editor.isMain`, and `editor.host?.state` selected by
`state.modified`. Retain one release handle for each. On a new editor, release both
handles before installing bindings for the new page and host; if the new editor has no
page or host source, leave that handle empty. Also compare the actual page/host state
source identities so a source replacement on the same editor releases the old source.
Capture the editor in each callback and ignore an already-dispatched callback that no
longer matches `this.editor`.

The existing `onUpdate()` already updates `this.editor`, the child panel, and the
header at lines 67-73. Extend it with this rebind step. Header refresh on page-main or
host-modified changes is the same stale-binding defect, not a separate header defect:
`updateHeader()` and `SideBarPanelHeaderHandle.update()` already provide the required
rendering path. Prop changes such as `headerRef`, `iconElement`, and `expanded` still
flow through the existing `onUpdate()` call.

Before:

```ts
if (editor.page?.state) {
    this.bind(editor.page.state, () => editor.isMain, () => this.updateHeader());
}
if (editor.host) {
    this.bind(editor.host.state, (state) => state.modified, () => this.updateHeader());
}
```

After:

```ts
this.pageBinding?.();
this.hostBinding?.();
this.pageBinding = editor.page?.state
    ? this.bind(editor.page.state, () => editor.isMain, () => {
        if (this.editor === editor) this.updateHeader();
    })
    : undefined;
this.hostBinding = editor.host
    ? this.bind(editor.host.state, (state) => state.modified, () => {
        if (this.editor === editor) this.updateHeader();
    })
    : undefined;
```

Use the existing `editor.page?.state` source rather than adding a new page or host
subscription API.

### 3. Fix `MnemeTreeSecondaryView` model and page rebinding

Change `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts` only. The model
identity is `SecondaryViewProps.model` cast to `MnemeRootEditorModel`, compared by
object identity at `onUpdate():75`. The model binding source is `model.state`; the
page binding source is `model.page?.state`. These are the exact identities that change
when `onUpdate()` replaces `mnemeModel`.

Retain `modelStateBinding` and `pageStateBinding` fields of type `(() => void) | undefined`.
`bindModelState(model)` must release the previous model handle before assigning the
handle returned by `bind()`. `bindPageState(model)` must release the previous page
handle even when the new model has no page, then bind only when `model.page?.state`
exists. Keep the existing identity guards at lines 104-105 and 116-117 as protection
against a callback already in progress. The existing `onUpdate()` ordering—assign the
new model, rebind both sources, then update the header—should remain.

Before:

```ts
private bindModelState(model: MnemeRootEditorModel): void {
    this.bind(model.state, selector, (state) => {
        if (this.mnemeModel !== model) return;
        this.applyModelState(state);
    });
}
```

After:

```ts
private bindModelState(model: MnemeRootEditorModel): void {
    this.modelStateBinding?.();
    this.modelStateBinding = this.bind(model.state, selector, (state) => {
        if (this.mnemeModel !== model) return;
        this.applyModelState(state);
    });
}
```

Apply the same release-before-bind shape to `bindPageState()`, including the no-page
case. Do not render `mneme-root`, inspect Mneme content, or add a customer-data-based
runtime verification step; this task is verified for that view through source review
and static checks only.

### 4. Fix tags and hostname navigation bindings

Change these three files:

- `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts`
- `src/renderer/editors/link-editor/panels/LinkTagsPanel.ts`
- `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts`

For `LinkTagsNavigationPanelView` and `LinkHostnamesNavigationPanelView`, the
replaceable identity is the `LinkEditor` object passed as the view props. For
`LinkTagsPanelView`, it is `LinkTagsPanelProps.vm`. Each must retain the handle for
its editor-state binding, release it before binding a different editor, and capture
the editor in the callback so an old callback cannot apply current props to the new
view. Their existing `onUpdate()` snapshot/child-update behavior remains and is run
after the rebind.

The tags navigation file has two levels: its outer `LinkTagsSecondaryView` already
forwards the replacement at lines 268-273, while `LinkTagsNavigationPanelView` at
lines 61-78 owns the stale binding. Update the latter and leave the outer forwarding
contract intact. `LinkTagsPanelView` receives the replacement from that navigation
view at line 77 and must rebind its own independent `vm.state` subscription.

Before:

```ts
this.bind(this.props.state, selector, this.applyState);

protected onUpdate(editor: LinkEditor): void {
    this.categoryPanel?.update({ vm: editor });
    this.applyState(this.snapshot(editor));
}
```

After:

```ts
this.editorBinding = this.bind(editor.state, selector, (state) => {
    if (this.boundEditor !== editor) return;
    this.applyState(state);
});

protected onUpdate(editor: LinkEditor): void {
    if (editor !== this.boundEditor) this.bindEditorState(editor);
    this.categoryPanel?.update({ vm: editor });
    this.applyState(this.snapshot(editor));
}
```

Use the corresponding `state`/`vm` prop and `categoryList` target in the tags panel
and the `categoryList`/bottom-list targets in the hostname panel. Do not recreate
the child views merely to change editor identity; their existing `update()` paths
are the intended reuse mechanism.

### 5. Verification

No unit tests or test harnesses are to be added or run; this project does not use them.
After implementation, run the repository's existing static checks:

- `npm run typecheck`
- `npm run lint`
- `npm run build-prod`

The static review must confirm that all eight affected bindings retain and release a
handle, that all six affected view classes compare the identity listed above, and that
the returned `bind()` handle is idempotent and remains owned for final disposal.

**Correction from the implementation pass (2026-08-29) — step 1 as written would pass
without exercising the defect.** Measured live: **switching tabs between two link editors does
not reuse the category panel.** Three open link editors produced three distinct
`[data-name="link-category-panel"]` elements; tagging the visible panel with a `data-probe`
attribute and switching pages showed a *different* element with no tag, so each editor gets its
own panel and no `onUpdate()` retarget occurs. The panel does track the active tab correctly
(2 tree rows on editor A, 4 on editor B, 2 again on returning to A), but that is per-editor
rendering, not rebinding.

The retarget path is therefore **LK7 within-links navigation** — the same page keeping its
secondary view while `beforeNavigateAway` lets the editor survive and `onUpdate()` receives a
different `LinkEditor` (`LinkEditor.ts:238-247`). That is the path the runtime steps below must
drive; "open two link editors and switch tabs" does not reach it. Driving it programmatically
was attempted and abandoned: it needs a link inside one `.link.json` whose href points at
another `.link.json`, then a real click on that tree row, and the reopened probe file did not
pick up its rewritten content within the pass. **The retarget path has no runtime evidence yet.**

Four findings can be verified through the normal running application without rendering
Mneme content:

1. Link category: exercise the existing secondary-view reuse path with two link
   editors. Change category/link selection in the second editor and confirm the tree
   follows it; change the first editor afterward and confirm it does not update the
   reused view. Start with a link editor whose provider is initially unavailable, then
   complete host/provider setup and confirm the category tree appears and subsequently
   tracks selection. Demote/promote the current editor and toggle host modified state
   to confirm the category header follows the current page/host.
2. Link tags navigation: after retargeting, change selected tag and link data in the
   second editor and confirm both the category list and bottom links list update from
   that editor; changes in the first editor must be inert.
3. Link tags list: independently confirm the `CategoryListView` items/value and count
   callback follow the replacement `LinkEditor`, with no old-editor update reaching it.
4. Hostnames navigation: change selected hostname, link data, and selected link in the
   replacement editor and confirm the hostname list and bottom links list follow it;
   old-editor changes must not affect the panel.

`MnemeTreeSecondaryView` is the one finding that must not be runtime-rendered: opening
it would render customer Mneme content. Verify it through the handle bookkeeping,
identity guards, `npm run typecheck`, `npm run lint`, and `npm run build-prod` only.

## Concerns

- The returned-handle API is intentionally the only shared-surface change. Do not add a
  keyed variant or migrate the other 162 callers; their bindings are view-lifetime
  bindings and are unaffected by this task.
- `own()` never removes entries from `disposers`, so a plain release wrapper would leave
  one dead closure per rebind in each view. This plan explicitly chooses the bounded
  alternative: `ownReleasable()` removes its wrapper from `disposers` when the handle is
  released, while retaining it for final disposal when it is not released early.
- Releasing an old handle must happen before installing the replacement. The callback
  identity guard remains necessary because `TOneState.stateChanged()` iterates the
  current listener array with `forEach()` (`src/renderer/core/state/state.ts:52-54`),
  while unsubscribe reassigns the listener array with `filter()` (`:84-86`). A dispatch
  already in flight therefore iterates the old array and can still invoke a just-released
  callback; the guard is required to reject that callback.
- `LinkCategoryPanelView` must bind even when the initial provider is null. Its current
  early return is why a later provider is never checked; merely adding a provider check
  to the current `onUpdate()` is insufficient when no tree/binding was installed. The
  recovery depends on `onHostAttached()` → `loadData()` → `state.update()` changing the
  state projection; if that implicit trigger is removed later, an explicit availability
  signal will be needed.
- The category header's page/host refresh is part of the same stale-source lifecycle
  defect. No separate header component change is required.
- `initialTreeState` in `MnemeTreeSecondaryView` is a constructor-time tree expansion
  snapshot and is outside this task's subscription fix. Do not change it unless an
  implementation discovers a binding-related type or lifecycle issue.
- Runtime verification covers four findings. Mneme source may be read, but no step may
  open, render, inspect, or otherwise collect Mneme customer content.

## Acceptance Criteria

- `VanillaView.bind()` returns an idempotent release handle while preserving immediate
  apply and final `own()` disposal for existing callers.
- The six affected source files contain the planned fixes at the methods/ranges listed
  above; no implementation is made in any Mneme content or customer-data directory.
- The category panel rebinds from one `LinkEditor` to another, releases the old editor
  state source, and creates/rechecks its tree when `treeProvider` changes from null to
  available.
- The category secondary header releases and replaces its page and host state sources;
  page-main and host-modified changes refresh the current header.
- The Mneme secondary view releases its prior model and page bindings before each
  `mnemeModel` replacement, including when the replacement has no page.
- Tags navigation, tags category list, and hostname navigation all track the current
  `LinkEditor` after `onUpdate()` and ignore old-editor state changes.
- The old source for every affected binding has no active subscription after replacement,
  final disposal remains safe after an early release, and early releases remove their
  disposer entries rather than accumulating dead closures.
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass. No unit tests or
  test harnesses are introduced.
- Runtime evidence is recorded for the four non-Mneme findings; Mneme is verified only
  through source and static checks because rendering it is prohibited.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | Return an idempotent early-release handle from `VanillaView.bind()` while retaining final ownership. |
| `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts` | Rebind the current editor state and recheck/reconcile the tree provider. |
| `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.ts` | Rebind current editor page/host header sources. |
| `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts` | Release and replace model/page handles on `mnemeModel` identity change. |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts` | Rebind `LinkTagsNavigationPanelView`'s editor state; preserve outer forwarding. |
| `src/renderer/editors/link-editor/panels/LinkTagsPanel.ts` | Rebind the category list's editor state. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts` | Rebind hostname navigation's editor state. |

### Files that need no changes

`src/renderer/editors/link-editor/panels/LinkHostnamesSecondaryView.ts`,
`src/renderer/ui/secondary-views/SecondaryViewsView.ts`,
`src/renderer/ui/secondary-views/LazySecondaryViewView.ts`,
`src/renderer/ui/secondary-views/secondary-view-registry.ts`,
`src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts`,
`src/renderer/editors/link-editor/LinkEditor.ts`,
`src/renderer/core/state/state.ts`, and `doc/active-work.md` already provide the
forwarding, state, header, provider, and tracking behavior required by this plan.
