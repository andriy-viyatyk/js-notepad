# EPIC-063 — De-React Epic E5: delete the React secondary-view contract

**Status:** Complete
**Created:** 2026-08-25
**Completed:** 2026-08-25
**Roadmap:** [de-react.md](../de-react.md) §7 "Epic E"
**Predecessors:** [EPIC-059](EPIC-059.md) (E1 — seams), [EPIC-060](EPIC-060.md) (E2 — editor bodies),
[EPIC-061](EPIC-061.md) (E3 — the Monaco wrapper), [EPIC-062](completed.md) (E4 — the `RenderGrid` cell contract)

---

## The closing property

`ReactSecondaryViewDefinition` **is deleted from the tree.** Concretely:

- `ui/secondary-views/secondary-view-registry.ts` loses its `arm` discriminator and its
  `React.ComponentType` union member — a registration takes a `VanillaViewCtor<SecondaryViewProps>`
  and nothing else, and the file stops importing React.
- `ui/secondary-views/LazySecondaryView.tsx` (71 lines) is deleted; `LazySecondaryViewView.ts` is
  the only loader.
- `ui/secondary-views/SideBarPanelHeader.tsx` (97 lines) is deleted, and with it the
  `createPortal` header seam; `SideBarPanelHeaderView.ts` is the only header.
- `ui/secondary-views/SecondaryViewsView.ts` stops importing React — both
  `React.createElement` calls (the `LazySecondaryView` child and the `EditorIcon` fallback) are gone.
- `components/icons/EditorIcon.tsx` is deleted. Its **only** importer in `src/` is that
  `resolveIcon` fallback (E5-2), so the contract's removal collects it.

That is compiler-checkable: after close, `grep -rn "arm:" src/renderer/ui/secondary-views/` returns
nothing and the registry's `loadComponent` has one return type.

---

## E5-1 — A shared contract does exist, and E4's "line count from here on" is again wrong

EPIC-061 concluded E4 onward would be scoped by line count. [EPIC-062 E4-1](completed.md) corrected
it once — the contract was real, it was just owned by `uikit/` rather than `editors/` — and then
*repeated the same prediction* for E5: "Line count is the axis from E5 onward — no shared contract
remains to scope by."

**That is wrong for the second consecutive epic, and in the same way.** E4-1's own generalisation is
the thing that catches it: *"no contract left" is a claim about the whole import graph, not about one
folder.* The claim was checked against `editors/` and `uikit/` again, and the surviving contract is
in the third place — `ui/`:

```ts
type ReactSecondaryViewDefinition = {
    loadComponent: () => Promise<{ default: React.ComponentType<SecondaryViewProps> }>;
    arm?: "react";
};
```

Same shape as `EditorModule.Body`, the Monaco wrapper and `RenderCellFunc`: **one type whose
deletion is the epic's definition of done**, and every provider registered through it is pinned to
React by the registry rather than by its own content. EPIC-059 E1-1 named this seam as one of the
four the editors jointly depend on; E1 built the vanilla arm beside it and converted one provider
(`search`) as the proving consumer. The React arm has stood untouched since.

**The standing check this yields** (the third time this programme has needed it, after E2's
page-manager mis-read and E3-6's Monaco-churn mis-attribution): *a claim that no contract remains is
not evidence until the whole import graph has been searched for one.* Predicting the axis of the
next epic from the folder the current one happened to touch has now failed twice. **E6 onward is
scoped when E6 opens, by searching for a contract first** — and §E5-8 records the two candidates
already visible, so that search starts with a list rather than a guess.

### Measured surface at epic open (2026-08-25)

| | Count | Lines |
|---|---:|---:|
| Secondary-view registrations (`register` + `registerPrefix`) | **14** | — |
| …on the vanilla arm already (`search`, E1's pilot) | 1 | 162 |
| …**on the React arm — this epic's work list** | **13** | **1,633** |
| Editors owning them | 9 | — |
| React host faces deleted at close | 3 | **236** |
| `editors/` `.tsx` total (context) | 145 | 23,235 |

The 13 providers, by owning editor:

| Editor | Panel ids | Provider lines | Sibling panel `.tsx` dragged in |
|---|---|---:|---|
| `explorer` | `explorer`, `boards` | 613 | `board/BoardsTree.tsx`, `tools/ToolsTree.tsx` |
| `link-editor` | `link-category`, `link-tags`, `link-hostnames` | 274 | `LinkCategoryPanel`, `LinkTagsPanel`, `LinkHostnamesNavigationPanel` (313) |
| `git-tree` | `git-changes` | 185 | `GitChangesView.tsx`, `GitRefsView.tsx` |
| `file-diff` | `git-diff-revisions` | 142 | `components/git-tree` React leaves (`GitTree.tsx`, `GitStatusBadge.tsx`, `RefBadge.tsx`) |
| `mneme-root` | `mneme-tree` | 114 | — |
| `notebook` | `notebook-categories`, `notebook-tags` | 114 | `category-tree.tsx`, `TagsListView.tsx` |
| `board` | `board-secondary:*` (prefix family) | 68 | `BoardWebview.tsx` (read-only import) |
| `archive` | `archive-tree` | 65 | — |
| `rest-client` | `rest-panel` | 58 | `RestClientShared.tsx` |

Most of what these panels *render* is already vanilla — `uikit/Tree`, `uikit/Panel`,
`uikit/IconButton`, `components/tree-provider`'s `TreeProviderViewImpl.ts`, `components/git-tree`'s
`GitTreeView.ts`. The conversions are therefore mostly re-expressing a JSX projection against views
that already exist, not building new ones. That is why a 1,633-line epic is scoped as one epic
rather than three.

---

## E5-2 — The vanilla arm has a latent defect that this epic detonates

`SideBarPanelHeaderView.ts:15-27` carries this narrowing, with a development-mode warning:

```ts
/** Narrow a registry-resolved icon to the DOM arm used by vanilla headers. */
if (typeof icon === "string" && isIconName(icon)) return icon;
if (icon !== undefined && isDevelopment) {
    console.warn(
        `[SideBarPanelHeaderView] Cannot render icon for vanilla secondary panel "${panelId}": `
        + "SecondaryViewsView.resolveIcon returned a React EditorIcon fallback which the vanilla header cannot render.",
    );
}
```

`SecondaryViewsView.resolveIcon` falls back to `React.createElement(EditorIcon, …)` whenever a
registration has no `icon` override. The vanilla header cannot render a React element, so such a
panel shows **no icon at all**.

**Nothing shows the bug today** because the one vanilla provider, `search`, is one of only two
registrations that *does* override its icon — `search` and `boards` are the whole list.
**Twelve of the 13 React providers have no override**, so the first conversion task that touches one
of them makes that panel lose its glyph, and the epic as a whole would strip twelve.

This is E4-15's shape once more (behaviour with no compile-time equivalent and no declaration site)
except that here it *was* declared — as a `console.warn` nobody had a reason to trigger. **It is
therefore task one, before any provider converts.** The fix is small because the DOM arm already
exists: `components/icons/icon-elements.ts` exports `createEditorIconElement`, which
`ui/tabs/PageTabView.ts` has used since Epic D. `resolveIcon` points at that instead, the warning
and the narrowing go, and `EditorIcon.tsx` loses its last importer.

**A per-icon check the conversions must not skip.** The React providers pass JSX elements rather than
registry names — `icon={<SearchIcon />}`, `icon={<MemoryIcon color={MEMORY_ICON_COLOR} />}` — and
that is *why* each one costs a React root (E5-3). A vanilla conversion must pass an `IconName` the
registry actually knows, or a `createIconElement(name, props)` node where the icon takes props.
Verify registry coverage for each glyph as its provider converts; an unknown name warns in dev and
renders an empty `svg`, which is a silent visual regression of exactly the kind §6.1 describes.

---

## E5-3 — The measured number (Rule 4): React roots in the sidebar

The countable unit is **`[data-react-root]`**, and getting to that was itself a correction — see the
methodology note below. It marks the host of every vanilla-to-React island, set by
`mountReactHandle` (`uikit/shared/mount.tsx`). `fillSlot`'s `display: contents` span
(`[data-part="react-slot"]`) is one such host, so the two markers overlap rather than adding up: a
slot-created root carries both. A React-arm panel produces one root for its body and its header
actions produce one per JSX icon.

**Methodology correction (2026-08-25), the programme's third.** This epic opened measuring
`[data-part="react-slot"]` alone, which counts only roots `fillSlot` creates. A root created by a
direct `mountReactHandle` call had **no marker at all** and was invisible to the query — so a sidebar
containing a live React subtree could measure zero. US-1072 surfaced it: the converted
`board-secondary` panel reported `slots: 0` while demonstrably hosting a `BoardWebview` React island
with a live iframe. Fixed by marking the host in `mountReactHandle` itself, which makes every React
root in the app countable from the DOM rather than only the ones that happen to arrive through a
slot. It joins EPIC-060's page-manager mis-read and EPIC-061 E3-6's Monaco-churn mis-attribution as
the third time a Rule 4 number was wrong about *what it was counting* rather than about the code —
and the first where the fix was to make the thing measurable instead of re-reading the source.

**Baseline, measured live 2026-08-25** with the Explorer panel and one `board-secondary:lists` panel
open:

| Scope | React roots |
|---|---:|
| Whole renderer (`[data-part="react-slot"]`, pre-correction) | **78** |
| Sidebar (`[data-name="secondary-views-container"]`) | **6** |
| — `explorer` panel subtree | 5 |
| — of which: the four header `IconButton` glyphs | 4 |
| — `board-secondary:lists` panel | 1 |

The sidebar total of 6 survives the metric correction, but its composition was recorded wrongly: the
board panel's one root was read as its React panel body, and post-conversion re-measurement shows the
5 Explorer roots carry **both** markers while the board's is the unmarked `BoardWebview` island. The
number was right; the attribution was not — which is the same lesson, one level down.

**Target at close: 0 in the sidebar for these panels.** The four icon roots are included
deliberately and the reason matters, because it is the mis-attribution trap this programme keeps
falling into: they look like they belong to `uikit/shared/slots.ts`'s `IconRef = IconName |
ReactNode` (E5-8), not to this contract. They do not. `IconButtonView` already takes the DOM arm
when handed a *name* — `fillSlot(host, createIconElement(...))` — and only falls back to a React root
when the **call site** hands it an element. The call sites are the providers this epic converts, so
these roots go with them, while the `IconRef` type itself survives untouched for E6.

Re-measure with the same panels open and the same expression. The whole-renderer figure is recorded
for context only; 78 is dominated by surfaces this epic does not touch and is **not** a target.

**One named exception, decided at US-1072's plan review.** A `board-secondary:*` panel keeps **one**
React root after this epic closes: `BoardWebview`, the board iframe host. It is a root the board
*editor* owns — `BoardEditorView.tsx` mounts it for the main view too — so taking it would cross the
main-editor boundary Rule 1 protects, exactly as `SecondaryViews.tsx` does in E5-4. The converted
provider mounts it behind an explicit `mountReactHandle` compatibility island. The close-out
measurement must therefore be taken with a board panel's contribution *named*, not counted as a
failure to reach zero.

---

## E5-4 — Explicit non-goal: `SecondaryViews.tsx` survives this epic

`ui/secondary-views/SecondaryViews.tsx` (17 lines) is the *host*'s React face — a `mountVanilla`
shim over `SecondaryViewsView`. It is not part of the provider contract and it is **not** deleted
here.

Its only consumer is the browser editor: `editors/browser/BrowserSecondaryViews.tsx` renders the
sidebar host for the bookmarks surfaces, reached from `BookmarksDrawer.tsx` and `BrowserView.tsx`
(1,692 lines of `.tsx` across the editor). Deleting the face means converting that editor, and
**Rule 1 forbids converting a component and its parent in the same change.** It is listed in the
removal ledger under "React faces on converted UIKit components" and goes when the browser editor
converts.

Stating this at open avoids the epic drifting into a second editor to chase a 17-line file.

---

## E5-5 — Task breakdown

Ordered so each task ships (Rule 3) and no task converts both sides of a boundary (Rule 1). The
icon arm leads because every later task depends on it (E5-2); the contract deletion trails because it
cannot compile until the last provider converts; the two largest providers sit late, once the
pattern is established on the small ones.

| Task | Scope | Lines |
|---|---|---:|
| US-1069 | The icon DOM arm — `resolveIcon` → `createEditorIconElement`, drop the narrowing and its warning | ~40 |
| US-1070 | `link-editor`'s three providers + their panels | 587 |
| US-1071 | `notebook`'s two providers + `category-tree`, `TagsListView` — closes the notebook's last `.tsx` | ~300 |
| US-1072 | The three thin ones: `archive-tree`, `rest-panel`, `board-secondary:*` | ~450 |
| US-1073 | The git pair: `git-changes` and `git-diff-revisions` + the `components/git-tree` React leaves | ~450 |
| US-1074 | `mneme-tree` | 114 |
| US-1075 | `explorer`'s two: `explorer` and `boards` + `BoardsTree`, `ToolsTree` | 613+ |
| US-1076 | Delete the contract — registry single-armed, three `.tsx` files and `EditorIcon.tsx` removed, React import gone from `SecondaryViewsView.ts`; re-measure E5-3 | −304 |

**Two corrections the task documents forced on this table** (both found during plan review, both
recorded because the estimate is otherwise misleading):

- **US-1072 is more than twice its wrapper size.** The ~191 figure counted only the three provider
  files. `RestPanelSecondaryView.tsx` is 58 lines, but the thing it renders — `RequestTree`, exported
  from `RestClientShared.tsx:344` — is its exclusive consumer's work and comes with it. That is
  legitimate rather than scope creep: `RequestTree` has exactly one importer in `src/`, so taking it
  crosses no boundary. `SplitDetailPanel` in the same file stays React, because `RestClientBody.tsx`
  still owns it (Rule 2).
- **US-1070 restores three behaviours, it does not only translate.** `LinkCategoryPanel.tsx:123`
  passes a rich `getLabel` that `TreeProviderViewModel.ts:83` declares and **nothing consumes** — so
  the link Categories panel silently lost its per-category count and its rich link tooltip when the
  tree provider was converted in an earlier epic. Search highlighting was *not* lost (`treeProps()`
  forwards `searchText`). The count is restorable through the existing forwarded `renderTrailing`
  seam, and the tooltip through a forwarded `getTooltip`, following the in-editor precedent at
  `LinksListView.ts:258,350`. It is in scope because this conversion deletes the last trace of the
  intent: after US-1070 nothing in the tree would record that those behaviours were ever meant to
  exist. A §6.1 masked defect, found by reading the plan rather than the screen.

Each conversion task follows the seam E1 built and `explorer/SearchSecondaryView.ts` demonstrates: a
`VanillaView<SecondaryViewProps>` default export, `arm: "vanilla"` on its registration, its header
built with `SideBarPanelHeaderView` against the `headerRef` element rather than `createPortal`.

---

## E5-9 — Progress and live results

Recorded as tasks land, because the Rule 4 measurement is only meaningful per panel.

**US-1069 — the icon DOM arm. Done.** The fix needed one more step than E5-2 predicted, and the
prediction's shape is the interesting part. Pointing `resolveIcon` at `createEditorIconElement` was
not sufficient: that function's `noLanguage` branch returns `{ kind: "react" }` whenever an editor's
`getIcon()` yields a React element, and **six of the nine editors owning secondary panels do exactly
that** (explorer, archive, git-tree, mneme-root, board, file-diff). So the first cut still dropped
the glyph for most of the work list — and, having deleted the `console.warn`, dropped it *silently*.
Resolved by giving `EditorModel` an optional `getIconElement?: () => Element | undefined`, implemented
on those six from each icon's existing `.createElement` builder (`createBoardGlyphElement` for the
board), with `createEditorIconElement` preferring it. The dev-mode error is **kept**, moved to
`SecondaryViewsView.warnIfVanillaIconIsMissing`, and commented for removal once no producer returns
React — the warning is what surfaced this, so it stays loud while a React arm exists.
`ui/tabs/PageTabView.ts` gets the DOM arm for free and needed no change.

**US-1070 — the three link panels. Done, and measured live.** `hosts: 3` vanilla panel hosts, with
**0 React roots** each for `link-tags` and `link-hostnames`. Counts render in all three
(`Alpha 4`, `Beta 4`; `even 6`, `extra 6`, `odd 6`; `example0.com 3`…), which is the E5-5 restoration
working rather than merely compiling.

Two honest caveats:

- `link-category` still shows **2** React roots — one per category count. `renderTrailing` is typed
  `React.ReactNode`, so the restored count had to be a React element and `fillSlot` gave it a root.
  This is the cost of restoring the behaviour *before* the slot type could express it in DOM, and it
  is exactly why US-1071's widening was chosen over an `as unknown as` cast: the cast would have
  produced the same roots with nothing recording why. Folded into US-1071 to finish.
- The restored rich link tooltip is wired through the forwarded `getTooltip` but is **hover-gated and
  not live-verified**; it will still cost one React root per shown tooltip while `LinkTooltip.tsx`
  stays React, matching the precedent at `LinksListView.ts:258,350`.

Also collected: `panels/LinkHostnamesPanel.tsx` was left with zero importers by the conversion and is
**deleted**; the dead `getLabel` prop declared at `TreeProviderViewModel.ts:83` is **removed**, per
`uikit/CLAUDE.md:236` ("never add `getLabel`/`getValue`/`getIcon` accessor props — removed at point
of conversion").

**US-1071 — the two notebook panels. Done, and measured live.** Both render with counts and
**0 React roots** (`Categories`: All 13, cat 2, deep 2, …; `Tags`: All 13, dev 1, done 1, release 4,
uat 3), so the nested category tree's DOM label *and* its count come from the widened slot rather
than a React root. `TagsListView.tsx` was deleted — the vanilla `uikit/CategoryList/CategoryListView.ts`
already expressed its grouping/drill/count/selection projection, so the notebook duplicate had zero
importers left. `category-tree.tsx` and both providers are now `.ts`.

The widening reached exactly the Tree slots, their mirrors (`TreeItem.tsx`, `SectionItem.tsx`,
`TreeItemView.ts`, `types.ts`) and `TreeProviderViewModel`'s `renderTrailing` — no further. And it
closed US-1070's caveat: `link-category` now measures **0** React roots with its counts intact, down
from 2.

One correction applied on top of the delivered work: the widening broke `Tree.story.tsx:293`, which
renders `ctx.item.label` as a JSX child, and that was reported back as out-of-scope with a red
typecheck. It is not out of scope — Rule 3 says `main` is releasable after every task. Fixed with a
local `reactLabel()` narrowing in the story (`label instanceof Node ? null : label`), which is the
right shape: a React harness renders the React arm, and Rule 6 exempts stories from library purity
anyway.

**US-1072 — the three thin panels. Done, and measured live.** `rest-panel` renders its request rows
(`GET Get users`, `POST …`, `DELETE …`) with **0 React roots**; the React `RequestTree` projection is
deleted, which is legitimate because it had exactly one importer. `board-secondary:lists` renders its
declaration title ("Lists & Tags") with its iframe alive and **exactly one** React root — the
`BoardWebview` island named as this epic's standing exception in E5-3. `archive-tree` was initially build-verified only and has since been
**confirmed live**: opened against `release/persephone-2.0.5-win.zip` it renders **0 React roots**,
24 tree rows and the real entry list with its folder glyphs.

The board iframe remount was implemented as explicit handle recreation on a
`${viewId}__${reloadToken}` identity change rather than by relying on a `key` at the root of a React
root — the option I asked for at plan review, because the key-at-root behaviour would have to be
re-verified on every React upgrade and its failure mode is silent (Reload stops reloading, with no
error).

This is also the task that exposed the Rule 4 metric flaw above: its `slots: 0` report for a panel
demonstrably hosting a live React iframe is what made the missing marker visible.

**US-1073 — the git pair. Done, measured live at the header.** All four live panel instances
(`git-changes` and `git-diff-revisions`, one per owning page) measure **0 React roots** under the
corrected selector. The shared header extension landed here as `title: string | Node` plus a generic
`badge?: Node` with caller-owned badge lifetime, and it works: the Git panel's header renders its
repo badge and changed-file count (`persephone`, `(66)`) as DOM. All three `components/git-tree`
React faces (`GitTree.tsx`, `GitStatusBadge.tsx`, `RefBadge.tsx`) survive as the importer audit
required, with the converted panels importing `GitTreeView` / `FileGridView` directly, so no
compatibility root was introduced.

Verified: panels mount, header badge and count render, the file grids are constructed in the DOM
(`git-changes-unstaged:file-grid` with its `data-grid` internals present under
`alwaysRenderContent`). **Not verified:** the expanded list rendering and any git interaction — the
panel was a collapsed 32px header strip throughout, and this environment's panels were collapsed.

*A measurement trap I walked into here and should not repeat:* `textContent` includes hidden text, so
the panel appeared to read "Git is unavailable." while that host was `display: none` and the real
visible content was the badge and count. `git.probe()` returned installed 2.55.0 and `git.enabled` was
true — there was never a fault. Read visibility (`offsetParent`), not `textContent`, when asserting
what a converted panel shows.

**US-1074 — `mneme-tree`. Done, build-verified only, deliberately.** The conversion consumed
US-1073's shared `badge?: Node` API **unchanged**, which is the useful signal: the badge was designed
generically for a second caller and served one without modification, so the two tasks did not need
two badge paths.

Live verification was **declined rather than skipped**. This panel needs an open Mneme root, and every
registered root on this machine is a customer work folder (`EverGreen/web-wiki`, `EverGreen/wiki`,
`EverGreen/worklog`). Opening one would pull that content into an agent transcript, which the
organization's standing rule forbids; registering a throwaway root instead would mutate the user's
knowledge-base config and trigger indexing for a shallow smoke check. So this panel's live exercise
is owed and recorded in E5-7, not quietly counted as done.

**US-1075 — the Explorer pair. Stages 1 and 3 done; Stage 2 in flight.** This task needed its plan
re-shaped twice, and both re-shapings are the record worth keeping.

*At plan review*, Stage 3 proposed `BoardsTree.tsx` exporting both the React `BoardsTree` **and** a
separate `BoardsTreeView` that reimplements the same tree — described in the document as "a separate
implementation path". Rejected: two live implementations of one component with identical props
diverge the first time someone updates only one, which is Rule 7's failure exactly. The repo already
had the answer in five places (`LinksList.tsx`, `NotebookBody.tsx`, `GitTree.tsx`,
`SecondaryViews.tsx`, `TreeProviderView`) — a single `VanillaView` with the React function reduced to
a `mountVanilla` shim. That satisfies Rule 2 *more* strongly than duplication: the three surviving
React callers (`BoardToolbar.tsx`, `TrustedBoardsListView.tsx`, `TrustedToolsListView.tsx`) compile
**and behave** unchanged, because one behaviour is all that is left. Landed that way, plus a minimal
`TreeProps.getTrailingVisibility` addition.

*Mid-implementation*, the single-thread attempt went silent for 30 minutes and was aborted **having
deleted `BoardsSecondaryView.tsx` without writing its replacement** — a red build, Rule 3 violated.
Recovered by restoring the file from git and confirming only the `explorer` registration had been
flipped, so Stage 1 stood alone coherently. Two process changes came out of it: the remaining work is
delegated one stage per thread, and the brief now requires typechecking *incrementally* rather than
once at the end, so an abandoned thread leaves a compiling tree.

The stage order was also **reversed** — trees (3) before the Boards panel (2) — so the panel consumes
the native tree views directly and the temporary React islands the plan specified for Stage 2 never
had to be written and thrown away.

**Stage 1 result, live:** the Explorer panel renders 9 tree rows and 7 header buttons at **0 React
roots**, and the sidebar as a whole measured **0** with those panels open. The four JSX-icon roots
that made up most of the E5-3 baseline are gone, and they were only ever roots because the call site
passed `icon={<SearchIcon />}` where a registry name would do — which is the E5-3 prediction
confirmed at the one place it was actually load-bearing.

**US-1075 Stage 2 — the Boards panel. Done.** Renders its header, its Boards/Tools segmented control
and its empty-state message at **0 React roots**, consuming `BoardsTreeView` / `ToolsTreeView`
directly rather than the shims. No uikit primitive lacked a vanilla arm — including the
`SplitButton` flagged as a risk at plan review. **Not verified:** the panel against a folder that
actually contains boards; the empty-state path is the one exercised.

**US-1076 — the contract is deleted. The closing property is met.** Verified by grep rather than by
report:

- `grep -rn "arm:" src/renderer/ui/secondary-views/` → nothing. `SecondaryViewDefinition` is one
  shape whose `loadComponent` returns `{ default: VanillaViewCtor<SecondaryViewProps> }`.
- `LazySecondaryView.tsx`, `SideBarPanelHeader.tsx` (with its `createPortal` seam) and
  `components/icons/EditorIcon.tsx` are **gone**. `SideBarPanelHeader.css` survives, now owned by the
  vanilla header.
- `secondary-view-registry.ts` and `SecondaryViewsView.ts` contain **no `react` import**.
- The redundant `arm: "vanilla"` is stripped from all 14 registrations.
- Two narrowings fell out: `SecondaryViewProps.icon?: IconRef` is deleted (`iconElement?: Node`
  survives, name left alone to avoid churn across six providers), and the registry's per-panel
  override narrowed from `IconRef` to `IconName` — only a registry name was ever passed.

`typecheck`, `lint` and `build-prod` all pass.

### Rule 4, final

| Scope | At open | At close |
|---|---:|---:|
| Sidebar React roots, panels open | 6 | **0** |

Measured with the corrected `[data-part="react-slot"], [data-react-root]` selector, Explorer and Git
panels open. **The whole-renderer figure is deliberately not carried into this table.** The 78
recorded at open used the pre-correction selector and a different set of open pages, so the 23 now
observed is not a comparable number and claiming it as an epic result would be the same
apples-to-oranges error E5-3's methodology note exists to prevent.

Current selector after US-1223: the native slot term is `[data-part="children-slot"]`; retain `[data-react-root]` as the live-root marker.

`editors/` is now **124 `.tsx` / 19,903 lines**, from 145 / 23,235 at open — but note that spans
US-1069…US-1076 plus the deletions they collected, not conversion alone.

**A dev-loop note worth keeping.** Renaming a converted file `.tsx` → `.ts` leaves the Vite dev
server resolving the old specifier, and every affected panel renders `Failed to fetch dynamically
imported module …SecondaryView.tsx`. A renderer reload does **not** clear it; touching the importer
(`register-editors.ts`) does. The failure looks exactly like a broken conversion, so check for it
before debugging the view — and note that the panel still measures **0 React roots** while showing
nothing but that error, which is why a root count must never be reported without also asserting the
panel rendered content.

---

## E5-6 — Concerns

1. **`board-secondary:*` is a prefix family, not one panel.** `BoardSecondaryView` reads
   `props.panelId` to decide which of a board's declared views it is, and re-renders when the
   board's manifest changes (`board:setSecondaryViews`). `LazySecondaryViewView.onUpdate` already
   handles a changed `panelId` by retiring and reloading, but the *identity* case here is one ctor
   serving many ids — verify the reload path does not thrash when a board declares several views.
2. **`expanded` is a real input, not decoration.** Panels stay mounted while collapsed
   (`alwaysRenderContent`), and providers drop header actions when `expanded === false`. A vanilla
   view must honour it in `onUpdate`, not only at mount.
3. **`headerRef` arrives late and can change.** It is published by `publishHeader` after the panel
   is created, so it is `null` on the first `onUpdate` for at least one pass.
   `SideBarPanelHeaderView` already tracks `currentHeader` and re-parents; conversions must route
   through it rather than caching the element.
4. **`components/git-tree` is shared.** `GitTree.tsx` and its badges are consumed by more than the
   `file-diff` panel. US-1073 must check for other importers before converting a leaf, or take the
   leaf and leave the React face (Rule 2) until the other callers are gone.
5. **107 `useState` across `editors/`** (EPIC-059 E1-7) is absorbed per conversion, not lifted
   separately. These providers are among the denser users of it — `ExplorerSecondaryView` and
   `BoardsSecondaryView` in particular.

---

## E5-7 — Not verified live *(settled at close)*

**Closed at epic end.** `/review` found only barrel-import violations in four touched files
(`git-refs-tree.ts:18`, `BoardsTree.tsx:2`, `RestRequestTreeView.ts:4`, `ToolsTree.tsx:2`), all fixed;
no architecture concerns. Developer docs updated in `CLAUDE.md`,
`doc/architecture/{editors,key-files,overview,secondary-views}.md` and
`doc/standards/{editor-guide,model-view-pattern}.md`. **No `/docs` change was needed** — this epic
changed no user-visible behaviour or API, which is the correct outcome for a conversion epic and worth
stating rather than leaving as a silent omission.

**Still owed, and explicitly not claimed as done:**

- `mneme-tree` — build-verified only. Declined rather than skipped: every registered Mneme root on
  this machine is a customer work folder, and opening one would pull that content into an agent
  transcript. The cheap path is the user opening a root and the panel being measured — reading the
  content is never necessary, only counting roots and asserting a non-empty tree.
- The **Boards panel against a folder that contains boards** — only the empty-state path was
  exercised.
- The **Git panel expanded** — every live instance was a collapsed 32px header strip, so the file
  lists and any git interaction are unexercised.
- Carried forward from earlier epics and still owed: the six interactive log-view dialogs; and in the
  notebook, title/comment editing, toolbar language and kind switching (`NoteItemToolbarView`), search
  highlighting, script actions, and drag and drop. US-1068's live exercise is the notebook
  category/tag editors, which **this epic did convert** — so one notebook session now closes both.

### Post-close defect — E4-15 recurred, and the epic's own later work had already avoided it

**Reported by the user after close:** the Rest client secondary view's tree rendered **100px tall**
instead of filling the panel.

Cause, and it is EPIC-062's E4-15 exactly: `RestRequestTreeView`'s root was a bare
`document.createElement("div")` with no styling. The React `RequestTree` it replaced returned
`<Tree>` **directly** and contributed no DOM of its own, so the tree had been a flex child of
`rest-panel-pane`. The converted view inserted an unstyled block box between them —
`display: block; flex: 0 1 auto; height: 100px` — and since the pane is a definite-height flex column
while `TreeView` sizes itself with `flex: 1`, that resolved against an auto-height block to the
virtual grid's 100px fallback. The panel root itself measured a correct 934px throughout, which is
why nothing upstream looked wrong.

Fixed with `display: contents` on that root, plus a comment naming the class. Verified live: tree and
grid now both 934px, matching the panel, still at 0 React roots.

**The instructive part is the distribution of the bug.** A sweep of all 14 providers shows every one
of them builds its root with `createPanelElement` (properly styled), and of the three tree views this
epic wrote, `BoardsTreeView` and `ToolsTreeView` — both authored in US-1075 Stage 3, *after* the
`display: contents` requirement had been stressed in their brief — set it correctly. Only
`RestRequestTreeView`, written earlier in US-1072, did not. So the defect tracks *when in the epic the
code was written*, not who wrote it or how complex it was.

Two things follow. First, `display: contents` on a converted view whose React original rendered no
wrapper is not a tip, it is a **checklist item** for every conversion, and belongs in the brief from
the first task rather than being learned mid-epic. Second, **build-verified is not verified**: this
panel compiled, linted, built, and measured 0 React roots while being visibly broken. The root-count
metric says nothing about layout, and the only check that would have caught this is comparing a
converted body's measured height against its container's — which is cheap, and is now worth doing for
every converted panel rather than only the ones a user happens to open.

**That height sweep, run after the fix**, on every panel that could be expanded: `rest-panel`
934/934 (was 100), `link-category` 902/902 with its tree and virtual grid both at 902,
`notebook-categories` 934/934 likewise, `archive-tree` 1030 with 24 rows when measured earlier.
Innermost grid height equals host height in every case — the rest panel was the only offender.

### Post-close defect 2 — the notebook Categories labels were invisible

**Reported by the user after close:** the notebook Categories tree showed only the count on each row;
the category names were missing.

Cause, measured: `createCategoryLabel` in `category-tree.ts` built its row with
`createPanelElement({ flex: true, width: 0, … })`. The Tree's `.label` host is a plain **block**, so
`flex-grow: 1` on that element is inert while the explicit `width: 0` applies outright — the label div
measured **0px**. Inside it the name span (`flex: 0 1 auto`, `overflow: hidden`) shrank to 0 and was
clipped away, while the count span carried `flex-shrink: 0` with `overflow: visible` and so kept its
7px and stayed painted. Hence "only counts". The React original wrapped its parts in a
`display: flex; width: 100%; min-width: 0` span precisely to avoid this.

Fixed to `width: "100%"`, `minWidth: 0`, no `flex`, with the name span given `flex: 1 1 auto;
min-width: 0` so it takes the remaining width and ellipsizes while the count stays shrink-proof.
Verified live: name widths 199/187/168/149/187px across the first five rows, counts right-aligned at
natural width. A sweep of the epic's other label builders (`RestRequestTreeView.createLabel`,
`BoardsTreeView`, `ToolsTreeView`, `GitRefsView`, `git-refs-tree.ts`, both explorer views) found no
other `width: 0`; the rest-tree labels measure 275/222/50px and are correct.

**This one was mine to catch and I did not.** The `flex: true, width: 0` combination was written out
in the US-1071 plan snippet I reviewed. I spent that review on the `as unknown as` cast in the same
function — a real finding — and read straight past the geometry two lines above it. The lesson is
narrow and worth stating: when a conversion replaces React **inline styles**, the translated geometry
is load-bearing and needs checking property by property against the original, because nothing else
will check it. `tsc` cannot see it, lint cannot see it, and the React-root count cannot see it. Both
post-close defects in this epic were inline-style translations, and neither was visible to any
automated gate.

### Follow-ups this epic created

- **The trusted-sidebar React islands can go.** `ui/sidebar/TrustedBoardsListView.tsx` and
  `TrustedToolsListView.tsx` are already `VanillaView`s that mount a React island *solely* because
  `BoardsTree` / `ToolsTree` were React. US-1075 Stage 3 gave both a vanilla view, so the islands are
  now removable. Deliberately out of scope here (Rule 1 — different surface).
- **`LinkTooltip.tsx` is the last React root in a converted link panel.** The restored rich tooltip
  renders through it, so it costs one root per shown tooltip, matching `LinksListView.ts:258,350`.

## E5-7a — Original not-verified-live list *(superseded above)*

Testing owed by earlier epics that this epic's surface overlaps, so it can be closed cheaply while
the panels are already open: the notebook's category/tag autocomplete, title/comment editing,
toolbar language and kind switching (`NoteItemToolbarView`), search highlighting, script actions and
drag-and-drop; US-1068's live exercise (the category/tag editors); the six interactive log-view
dialogs. Recorded so it is not re-discovered as new.

---

## E5-8 — Contract candidates for E6 *(recorded, not scoped)*

So the E6 search starts from a list rather than a prediction (E5-1):

1. **`uikit/shared/slots.ts`** — `IconRef = IconName | ReactNode` and `SlotText = string |
   ReactNode`. Every uikit component taking an icon or text slot accepts React through it, and
   `renderIcon` returns a `ReactNode`. This is the `RenderCellFunc` shape at the widest point in the
   tree, and it is the reason `fillSlot`/`mount.tsx` exist at all. Deleting the `ReactNode` member
   is what finally removes `createRoot` from `uikit/`.
2. **`editors/base` chrome** — `<TextChrome>` across 14 call sites plus `ContentHostFooter.tsx` and
   `IContentHost.ts`. EPIC-059 E1-8 fixed this as deliberately **last** in Epic E: converting it
   early costs React roots rather than saving them.

`EditorErrorBoundary` (a React class component) stays until the last React editor subtree it
protects is gone — it has no vanilla equivalent and `window.onerror` is not one.
