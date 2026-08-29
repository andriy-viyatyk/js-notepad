# US-1039: Tree search clear does not restore expansion after a zero-match search

**Status:** Implemented 2026-08-29 — awaiting batched review

**Epic:** none — standalone bug fix

## Goal

Clearing a `TreeProviderView` search restores the tree's previous expansion state after a
*partially* matching search, but not after a search that matched **nothing**. Restore it in both
cases.

## Reproduction

Reported by the user in the MenuBar folder tree, but the code is shared by every
`TreeProviderView` consumer (Explorer secondary view, link-editor panels, boards, MenuBar folders).

1. Open a folder tree and expand some folders.
2. Press `Ctrl+F` to open the search input at the bottom of the tree.
3. Type text that matches **some** files. The tree filters.
4. Clear the search text → **the tree correctly restores** the previous expansion.
5. Now type text that matches **nothing**, so only the root folder remains visible.
6. Clear the search text → **BUG: only the root folder stays visible.** The folder content is not
   restored.

## What the investigation so far establishes

**It is not the display tree.** `TreeProviderViewModel.computeDisplayTree`
(`src/renderer/components/tree-provider/TreeProviderViewModel.ts:640-667`) returns `tree`
unchanged when `searchText` is empty — the only other arm is the `showLinks === false` directory
filter. The raw `tree` in state is never mutated by a search; only `displayTree` is recomputed
(`:606-629`, `:635-638`). So after a clear, `displayTree` is the full tree by construction.

**Therefore the defect is in the expansion-state restore, not the filtering.** The relevant
mechanism is the deep/shallow transition in `setSearchText` (`:604-629`):

- Crossing into deep (`text.length >= 3`) captures `savedExpandMap` from
  `this.treeModel?.getExpandedMap()`, clears `initialExpandMap`, and bumps `searchKey`.
- Crossing back out restores `initialExpandMap = savedExpandMap`, nulls `savedExpandMap`, and bumps
  `searchKey` again. `hideSearch` (`:586-602`) does the same on close.
- `searchKey` is what remounts the tree so the restored `initialExpandMap` is applied.

The leading hypothesis is that in the zero-match case the deep filter (`filterTreeDeep`) leaves a
display tree with no descendant nodes, so the remount that follows has nothing to apply the
expansion map to, and the subsequent restore does not trigger a further remount — `searchKey` and
the restored `displayTree` are written in the **same** state update (`:624-628`), so there is one
remount, not two. Verify this before fixing; it is a hypothesis, not a finding.

## Open question — is this pre-existing?

Not established, and it matters for the epic record:

- The search/clear block was last modified by `11795ce6` (**US-971**, imperative handle migration) —
  well before EPIC-058's shell work, and the logic is unchanged since.
- **US-1034 Slice B is not implicated.** MenuBar only hosts a `TreeProviderView`; it contains no
  filtering or expansion logic.
- **US-1037 converted `TreeProviderView`** to a vanilla view, including how `treeModel` is created
  and how a remount is expressed. If the restore depends on remount timing, US-1037 could have
  changed the behaviour even though the model code did not change. This needs an explicit check
  against a build from before US-1037.

## Implementation plan

1. Reproduce in the Explorer secondary-view tree (outside MenuBar) to confirm the defect is in the
   shared component, and against a pre-US-1037 build to settle whether it is a regression.
2. Instrument or step through the clear path: confirm `displayTree` is the full tree, then whether
   `initialExpandMap` holds the pre-search map at that moment, and whether the tree actually
   remounts and applies it.
3. Fix at the level the evidence points to. If the cause is the single combined state update,
   the fix is likely to make the restore its own remount or to apply the expansion map imperatively
   through the tree's handle rather than relying on an initial-mount prop.
4. Check the symmetrical paths: `hideSearch` (closing the search with `Esc`/the toggle) and clearing
   from a shallow (1-2 character) search, which never captures `savedExpandMap` at all.

## Acceptance criteria

- Clearing a zero-match search restores the previous expansion state, matching the partial-match
  behaviour.
- Closing the search entirely (`hideSearch`) restores it too, from both zero-match and partial-match
  states.
- Verified in at least two `TreeProviderView` consumers — the MenuBar folder tree and the Explorer
  secondary-view tree.
- The "is it a regression from US-1037" question is answered in this document.

## Files likely involved

| File | Why |
|---|---|
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | `setSearchText`, `hideSearch`, `computeDisplayTree`, `getExpandedPaths`, `savedExpandMap`/`initialExpandMap`/`searchKey` |
| `src/renderer/components/tree-provider/TreeProviderView*` | How `searchKey` becomes a remount and how `initialExpandMap` is applied |
| `src/renderer/uikit/Tree/TreeModel.ts` | `getExpandedMap` and the expansion state the restore writes back |

## Findings (2026-08-29) — the hypothesis was wrong, and so was the title

**The remount hypothesis is refuted.** The document proposed that the zero-match display tree
leaves nothing to apply the expansion map to, and that `searchKey` + `displayTree` landing in one
state update yields one remount instead of two. Tested directly: a **single** input event jumping
from `""` straight to a deep zero-match term — no shallow phase at all — still failed to restore.
`savedExpandMap` was therefore captured while the tree was fully expanded, and the restore still
produced a root-only tree. The capture is fine; **applying it is where the value is lost.**

**Root cause.** `TreeModel` resolves expansion in three tiers (`TreeModel.ts:196-204`):
explicit toggle (`state.expanded`) wins, then the `defaultExpandedValues` hint, then
`defaultExpandAll`. But `getExpandedMap()` returns **`{ ...state.expanded }` only**
(`TreeModel.ts:623`) — the explicit toggles. **A tree whose expansion came from the hint has an
empty `state.expanded`**, which is every restored or freshly-built tree the user has not clicked
in yet. `setSearchText` saved that raw map, so `savedExpandMap` was `{}`, and clearing restored
nothing.

**The codebase had already met this exact hazard and fixed it in one place only.** `buildTree`
carries a seven-line comment saying *"getExpandedMap returns only state.expanded, which is empty
for hint-only expansions"* and merges hint ∪ state for the refresh path
(`TreeProviderViewModel.ts:310-327`), with `expandedResolver` (`:543-548`) as the reusable rule.
The search-capture path never adopted it. The fix reuses `expandedResolver` rather than restating
the merge.

**The title's premise is wrong: this is not about zero matches.** `savedExpandMap` is captured on
the crossing *into* deep search, before that search's filtering reaches the model — so the captured
map is identical whether the term later matches everything or nothing. Partial vs zero cannot
affect the restore. The reported asymmetry is far better explained by **how the tree got
expanded**: clicking folders creates explicit toggles (captured correctly), whereas a
restored/persisted expansion is hint-only (captured as `{}`). The user's working "partial" case
was almost certainly a tree they had clicked in; the failing case a tree they had not.

**Is it a US-1037 regression? No — pre-existing.** Answered by archaeology, not by building an old
binary (stated plainly because the plan asked for a pre-US-1037 build and I did not produce one).
The defective line and `getExpandedMap`'s semantics both predate US-1037, which converted the
*view*; nothing in the fix touches remounting. The `:310-317` comment proves the class was known
before that epic.

## Verification

Live, on the Explorer secondary view, measuring the scroll container's **`scrollHeight`** rather
than rendered rows:

| path | before | during search | after restore |
|---|---|---|---|
| clear a deep zero-match search | 944px | collapsed | **944px — exact** |
| close the search (`hideSearch`) | 944px | collapsed | **944px — exact** |
| shallow (1-2 char) search, then clear | 944px | collapsed | **944px — exact** |

`typecheck`, `lint`, `build-prod` green; 0 React roots.

**Two instrument corrections, both of which produced false results first.**
1. **Counting `[role="treeitem"]` counts *rendered* rows in a virtualised list.** It reported
   41 vs 42 for identical expansion states and made the fix look one row short. `scrollHeight` on
   the scroll container measures total content and is the correct metric.
2. **A null-vs-null comparison passed as "restored exactly".** When a selector missed, both
   readings were `null` and the equality assertion went green. Same failure shape as US-1041: an
   assertion must first prove the measurement *and* the stimulus actually happened — every probe
   here carries a `filterRan` guard for that reason.

**Not verified: the second consumer.** The acceptance criteria ask for MenuBar folders as well as
Explorer. The fix is in the shared `TreeProviderViewModel`, which every consumer routes through,
but only the Explorer tree was exercised. Recorded rather than implied.

**A note on cost:** reproducing this degraded the user's Explorer into a state with no search box
and no way to expand the root (its chevron is hidden at level 0 by design). A renderer reload
restored it fully, confirming expansion is persisted — which is itself the evidence that the
baseline expansion was hint-driven, i.e. exactly the condition that triggers the bug.
