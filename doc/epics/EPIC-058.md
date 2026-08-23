# EPIC-058: De-React Epic D — Shell and shared components

## Status

**Status:** Active
**Created:** 2026-08-22
**Completed:** —

## Overview

Convert `src/renderer/ui/` (tabs, sidebar, dialogs, secondary views, MainPage) and
`src/renderer/components/` (icons, page-manager, file-search, tree-provider, file-list, file-grid,
git-tree) to vanilla views, then **flip the application root**. After this epic React survives only
inside unconverted editors, mounted through `mountReact`.

This is the epic where the two most visible dependencies stop mattering: **Emotion is left with four
importers app-wide** (from 21 today), and **`react-dom/server` leaves the renderer bundle entirely**.
Neither is uninstalled here — that is Epic F — but after Epic D both are residue rather than
architecture.

Epic D is the fourth conversion epic. Epic C's four sub-epics ([EPIC-054](completed.md),
[EPIC-055](EPIC-055.md), [EPIC-056](EPIC-056.md), [EPIC-057](EPIC-057.md)) emptied `uikit/`, so every
primitive this epic's call sites need already exists as a vanilla view behind a React face.

## What the investigation at epic open established

Five things, and the first two are the reason this epic is smaller than its line count suggests.

**1. There is not one React context in Epic D's surface.** Zero `createContext`, zero `useContext`
across 96 files. Context is the boundary hazard that has no vanilla analogue and no cheap workaround;
its complete absence here is the single biggest de-risking fact in the epic. Every cross-component
dependency in the shell already runs through models and the `app.*` object model.

**2. Epic P already drained the local state.** Seven `useState` occurrences in 9,192 lines of `.tsx`.
The remaining hook population is `useCallback` (84) and `useMemo` (34) — React-specific performance
bookkeeping that does not convert to anything, it simply disappears. `useEffect` (24) and `useRef`
(11) map onto the existing view lifecycle.

**3. The real boundary work is portals, and there are exactly four hosts.** Three convert freely
because both sides are ours: `page-manager/AppPageManager.tsx`, `page-manager/PageManager.tsx` and
`tree-provider/CategoryView.tsx`. The fourth is a published contract — see D4.

**4. `react-dom/server` has one importer, and its cause is measurable.**
`components/icons/file-icon-markup.tsx` needs `renderToStaticMarkup` for exactly three cases, and all
three are JSX-bodied icon components. 115 of the app's icons already carry a DOM builder; 54 do not.
Converting those 54 removes the last reason the renderer imports a server renderer. See D2 and D3.

**5. React error boundaries are the one React feature with no vanilla replacement**, and the thing
`EditorErrorBoundary` guards — editors — stays React until Epic E ends. It survives this epic by
design. See D5.

## The surface, measured

Measured at `c9453d3a` (`Complete EPIC-057`), from the repository root.

| Area | Files | Lines | `.tsx` files | `.tsx` lines |
|---|---:|---:|---:|---:|
| `ui/` | 47 | 6,402 | 37 | 5,930 |
| `components/` | 49 | 8,133 | 20 | 3,262 |
| **Total** | **96** | **14,535** | **57** | **9,192** |

The `.tsx` figure is the conversion surface; the remaining 5,343 lines are `.ts` models, registries
and helpers that are already React-free. The roadmap's §2 estimate for these two folders was
5,738 + 3,478 = **9,216** lines against a measured **9,192** — within 24 lines, the third inherited
figure in this programme to survive a re-measure.

### By unit

| Unit | Files | Lines | Note |
|---|---:|---:|---|
| `components/tree-provider/` | 14 | 3,560 | Largest unit; 1,921 lines already in `.ts` models |
| `ui/dialogs/` | 19 | 2,233 | One host plus 13 dialogs plus the popper path |
| `components/git-tree/` | 16 | 2,112 | Mostly `.ts` after C4; `GitTree.tsx` (514) is the React remnant |
| `ui/sidebar/` | 13 | 2,110 | `MenuBar.tsx` (583) is the largest file in `ui/` after `PageTab` |
| `ui/tabs/` | 3 | 829 | `PageTab.tsx` is 611 lines |
| `components/file-search/` | 3 | 783 | A `RenderGrid` consumer |
| `components/icons/` | 6 | 754 | Plus `theme/language-icons.tsx` (641) — see D2 |
| `ui/app/` | 6 | 720 | MainPage, Pages, AsyncEditor, RenderEditor, EditorErrorBoundary |
| `components/page-manager/` | 4 | 534 | Two of the four portal hosts |
| `ui/secondary-views/` | 6 | 510 | The registry contract — see D4 |
| `components/file-list/` | 2 | 242 | |
| `components/file-grid/` | 3 | 132 | Already on `uikit/DataGrid` after US-1022 |

### What leaves with this epic

| Surface | Now | After Epic D |
|---|---:|---|
| Emotion importers, renderer-wide | 21 | **4** — `theme/GlobalStyles.tsx`, `core/state/view.tsx`, `uikit/RenderGrid/RenderGrid.tsx`, `uikit/Tree/Tree.story.tsx` |
| `react-dom/server` importers | 1 | **0** |
| `@floating-ui/react` importers | 2 | 1 (`editors/browser/BrowserTabsPanel.tsx` — Epic E) |
| React portal hosts | 4 | 1, and only as a compatibility arm (D4) |
| `uikit/RenderGrid` app-layer importers | 12 | 10 (D8) |
| `<Panel` tags outside `editors/` | 71 | 0 |
| React roots created at startup | 1 | 0 (D9) |

## Decisions

### D1 — Epic D stays one epic, ordered leaves-first, with the root flip last

Epic C was split four ways because 14,671 lines of interdependent primitives could not be reviewed as
one unit. Epic D is 9,192 `.tsx` lines with a **flat** dependency graph: `components/` are leaves the
shell consumes, and the shell's own five folders barely reference each other. Fourteen tasks in one epic
is the same review granularity C3 and C4 ran at.

The decisive argument against splitting is D9: the root flip is a single atomic event that must land
in the same epic as `MainPage`, and any split boundary that separates them leaves the programme in a
state where the shell is vanilla but still mounted through React for no reason.

### D2 — `theme/`'s icon files are in scope, and the icon task is measured in icon bodies

The roadmap never assigned `theme/` to an epic. Its icon files belong here, because
`components/icons/` is their only consumer and the shell is what renders them.

The measurement that defines the task:

| File | Icons | String-bodied (has DOM builder) | JSX-bodied (no DOM builder) |
|---|---:|---:|---:|
| `theme/icons.tsx` | 115 | **115** | 0 |
| `theme/language-icons.tsx` | 54 | 0 | **54** |

`createIconWithViewBox` (`theme/icons.tsx:137`) attaches `createElement` **only when the icon body is
a string**. So `createIconElement` works for all 115 app icons and returns an empty `<svg>` plus a
dev-only `console.warn` for all 54 language icons. This was found the hard way in US-1022, where the
DOM path looked available and was not.

Converting the 54 bodies from JSX to string literals is mechanical and is the whole task. The language
icons stay **out** of `icon-registry.ts`'s `ICONS` map (116 entries): they are keyed by file
extension, not by icon name, and `IconName` should keep meaning "an app icon you can name".

### D3 — `react-dom/server` leaves the renderer bundle in this epic, and that is an acceptance criterion

`file-icon-markup.tsx` calls `renderToStaticMarkup` in three of its four branches: a language icon
component, `BoardGlyph`, and `DefaultIcon`. D2 gives the first and third a DOM builder; `BoardGlyph`
(23 lines, `editors/board/BoardGlyph.tsx`) needs one too. It is in scope despite living in `editors/`
— it is an icon, `components/icons/` already imports it, and leaving it would keep a server renderer
in the bundle for 23 lines.

The check is `grep -rn "react-dom/server" src` returning nothing, plus its absence from the built
renderer chunk. This matters beyond tidiness: US-1022 recorded `react-dom/server` as the obstacle to
de-Reacting `components/icons/`, and this is where the obstacle is removed rather than routed around.

### D4 — portals become `appendChild`, and the secondary-view registry keeps its React arm

A portal is React's answer to "render into a DOM node you do not own". In a vanilla view that is
`appendChild`, so three of the four hosts get simpler.

The fourth cannot. `ui/secondary-views/secondary-view-registry.ts:12` documents its panel-header slot
as *"Portal target for the panel header. Render title, buttons, etc. into this element via
createPortal"*, and **14 files in `editors/` implement against it** (`archive`, `board`, `explorer`
×3, `file-diff`, `git-tree`, `link-editor` ×3, `mneme-root`, `notebook` ×2, `rest-client`). Rule 2
forbids breaking them. The resolution costs
nothing, because the contract is already a DOM element: the vanilla host exposes the same element,
editors keep portalling into it, and Epic E retires the React arm one editor at a time as it converts
them.

### D5 — `EditorErrorBoundary` survives Epic D, and goes on the removal ledger

`componentDidCatch` has no vanilla equivalent — not as a limitation of our design but of the platform:
there is no way to catch a descendant's render failure when there is no render phase. What it guards
is `AsyncEditor`'s editor subtree plus `editors/storybook/LivePreview.tsx`, and editors are React
until Epic E finishes. A vanilla shell hosting React editors still needs it.

So it stays, unconverted, as a React island inside a vanilla `ui/app/`. **Do not** substitute
`window.onerror` or a try/catch around `mountReact` — neither catches what a boundary catches, and a
substitute that looks like a replacement is worse than a documented survivor. Add a ledger row in
`de-react.md`: collectable once Epic E converts the last React editor.

### D6 — Emotion effectively dies in this epic, and Epic F only uninstalls it

17 of the 21 remaining Emotion importers are in Epic D's surface — `ui/` 10, `components/` 7. The four
survivors each have a named owner: `uikit/RenderGrid/RenderGrid.tsx` (removal ledger, Epic E),
`uikit/Tree/Tree.story.tsx` (a story harness), `theme/GlobalStyles.tsx` (Epic A's remit) and
`core/state/view.tsx` (the React boundary helper itself, which dies in Epic F).

Worth stating explicitly so the epic's close is not mistaken for the dependency's removal, and so
nobody attempts the uninstall here and finds four blockers.

### D7 — `@floating-ui/react` is not uninstalled here, but Epic D's importer is free to convert

`ui/dialogs/poppers/showPopupMenu.tsx:5` imports `VirtualElement` — **a type, nothing else**. It
becomes an import from `@floating-ui/dom`, which the whole of `uikit/` already uses. That is the
entire cost.

The dependency still cannot be uninstalled: `editors/browser/BrowserTabsPanel.tsx` calls `useFloating`
for real. Recorded so the win is not claimed twice, and so Epic E inherits the uninstall as a one-file
job.

### D8 — Epic D collects 2 of `RenderGrid`'s 12 app-layer importers, not all 12

`components/file-search/FileSearch.tsx` uses `RenderGrid` and `RenderGridModel` as values. The
tree-provider split deliberately retains `CategoryViewModel`'s `RenderGridModel` type callback for
the editor-owned `LinksList`/`LinksTiles` bridge, so `CategoryViewModel` remains an importer. The
thin `CategoryView` face stops importing `RenderGrid` directly, and `TreeProviderViewModel`'s
`RowAlign` type is repointed to `uikit/VirtualGrid`. The other nine importers are in `editors/`.

Therefore Epic D's count is 12 → 10. The removal-ledger row stays open into Epic E; none of the
tree-provider tasks is licensed to convert the editor-owned `LinksList`/`LinksTiles` grid.

### D9 — the root flip is 41 lines, and it is the last task

`src/renderer.tsx` is a React component whose entire body is an async bootstrap followed by
`setContent(<cont.default />)`. Once `MainPage` is a vanilla view, `RootComponent` becomes
`await bootstrap(); mount(container)` and the app creates **no** React root at startup.

Doing it earlier would mean `mountReact(MainPage)` — a boundary crossing added and then removed inside
the same epic. So `ui/app/` and the flip are one task, and it is the last one.

### D10 — `Panel` is not collectable in Epic D

71 `<Panel` tags live in Epic D's surface, against 636 in `editors/`. Each task converts its own call
sites onto whatever the vanilla equivalent is at that point; the `uikit/Panel/` ledger row stays open
until Epic E finishes. Stated because "the last `ui/` Panel call site" is a tempting but wrong close
condition.

## Goals

- Convert 57 `.tsx` files / 9,192 lines in `ui/` and `components/` to vanilla views, behind unchanged
  React-facing signatures where any React caller remains (Rule 2).
- Flip the application root: no React root is created at startup.
- Remove the last `react-dom/server` importer from the renderer bundle.
- Reduce Emotion importers from 21 to 4, each with a named owner.
- Convert 54 language icons to string bodies so the whole icon set has a DOM builder.
- Convert three of the four React portal hosts, and keep the fourth as a documented compatibility arm
  for 10 editor files.
- Leave `EditorErrorBoundary` as the epic's one deliberate React survivor, recorded on the ledger.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-1025](../tasks/US-1025-icon-dom-builders/README.md) | Icon DOM builders — 54 language icon bodies + `BoardGlyph`; `react-dom/server` out | Implemented |
| [US-1026](../tasks/US-1026-components-icons-vanilla-views/README.md) | `components/icons/` vanilla DOM views | Implemented |
| [US-1027](../tasks/US-1027-file-list-grid/README.md) | `components/file-list/` + `components/file-grid/` | Implemented |
| [US-1028](../tasks/US-1028-file-search/README.md) | `components/file-search/` (first `RenderGrid` collection) | Implemented |
| [US-1029](../tasks/US-1029-tree-provider/README.md) | Tree primitive seams for tree-provider | Implemented |
| [US-1037](../tasks/US-1037-tree-provider-view/README.md) | `components/tree-provider/TreeProviderView` | Implemented |
| [US-1038](../tasks/US-1038-category-view/README.md) | `components/tree-provider/CategoryView` | Implemented |
| [US-1030](../tasks/US-1030-git-tree-vanilla/README.md) | `components/git-tree/` vanilla GitTree view | Implemented |
| [US-1031](../tasks/US-1031-page-manager-append-child/README.md) | `components/page-manager/` portal hosts → `appendChild` | Implemented |
| [US-1032](../tasks/US-1032-dialogs-vanilla/README.md) | `ui/dialogs/` host, 13 dialogs, and the popper path | Implemented |
| [US-1033](../tasks/US-1033-secondary-views-vanilla/README.md) | `ui/secondary-views/` host and the registry contract | Implemented |
| [US-1034](../tasks/US-1034-sidebar-menubar/README.md) | `ui/sidebar/` and `MenuBar` (two slices: shared Tools & Editors, then the MenuBar shell) | Implemented |
| [US-1035](../tasks/US-1035-tabs-vanilla/README.md) | `ui/tabs/` | Implemented |
| [US-1036](../tasks/US-1036-app-root-flip/README.md) | `ui/app/` and the root flip | Implemented |

### Ordering

US-1025 first: it is the enabling change, it is measurable on its own, and US-1026 depends on it.
US-1027's package prerequisite is **met**: `av-grid@2.2.4` widened `CellRenderer` and
`HeaderRenderer` from `string | HTMLElement | null | undefined` to `string | Element | null |
undefined`, was published on 2026-08-22 and is pinned exactly in `package.json`. US-1027 consumes
that release rather than casting or wrapping SVG/IMG icon elements. With that done,
the `components/` leaves can proceed in any order — they are independent, and US-1027 is the cheapest
place to establish the epic's pattern. US-1029 is now the additive Tree seam and must land first;
US-1037 and US-1038 then convert the two tree-provider surfaces independently. CategoryView
intentionally keeps its editor-owned `RenderGridModel` bridge, so D8 counts ten remaining
importers, not nine. Then the shell, where `ui/dialogs/` and
`ui/secondary-views/` are the two with external contracts and should be done while attention is
fresh. US-1036 is last by D9.

### Verification

Per task:

- `npm run typecheck`, `npm run lint`, `npm run build-prod`.
- Rule 4's interaction-cost measurement on the converted unit, per §6 of the roadmap — the abort
  criterion is a measured gain under ~2×, and it cannot be evaluated on units that were never
  measured.
- The unit's own smoke pass in the running app. Epic D is app chrome: a broken tab strip or dialog
  host is not something a build catches.

At epic close:

- `grep -rn "react-dom/server" src` → nothing, and the symbol is absent from the built renderer.
- Emotion importers renderer-wide → 4, matching the list in D6 exactly.
- `createContext` / `useContext` in `ui/` and `components/` → still zero.
- No React root created at startup; `createRoot` appears only in `uikit/shared/mount.tsx`.
- The removal ledger in `de-react.md` carries the `EditorErrorBoundary` row and the updated
  `RenderGrid` / `Panel` rows.

## Concerns / Open questions

1. **`PageTab.tsx` is 611 lines and `MenuBar.tsx` is 583** — the two largest files in the epic, both
   dense with pointer, drag and keyboard handling. These are where the masked-defect class (§6.1, "it
   fixes itself when I interact with it") is most likely to appear, because a missed subscription in a
   tab strip is repaired by the next click the user makes anyway.

2. **`ui/dialogs/` is 13 dialogs behind one host, plus the `AppPopupMenu` popup path.** They are individually simple, but the task is
   wide, and a dialog that is only reachable from an error path (`NamespaceCollisionDialog`,
   `TrustBoardDialog`, `PasswordDialog`) is a dialog nobody will smoke-test by accident. The task plan
   needs an explicit route to each of the 13 dialogs plus `AppPopupMenu`.

3. **The secondary-view registry contract (D4) is the epic's one outward-facing change**, and its 10
   editor implementers are not converted here. If the compatibility arm turns out to need more than
   exposing the same element, that is a signal the host's design is wrong — not a licence to change
   the registry's shape and fix 10 editor files in Epic D.

4. **`tree-provider/` is 3,560 lines with 1,921 already in models**, which sounds ideal and hides a
   risk: `TreeProviderViewModel.ts` alone is 1,156 lines and `CategoryViewModel.ts` is 765, so the
   view conversion is small but its contract with the models is broad. Expect the task to spend most
   of its effort reading models it does not change.

5. **D5 leaves a React island inside a vanilla shell**, which is a shape this programme has not built
   before: previously React contained vanilla, not the reverse. `mountReact` exists and `AsyncEditor`
   is the only place it is needed, but the first task to do it should verify the disposal path rather
   than assume it.

6. **`favicon-cache.ts` (265 lines) and the system-icon IPC path** are async caches that feed icons.
   US-1022 already found that pooled-cell consumers cannot key a cache on the element they are given.
   The icon tasks should settle how a vanilla view subscribes to a cache fill before US-1029 and
   US-1030 need it, not after.

## Notes

### 2026-08-23 — US-1036 implementation note: the root is flipped

**The application creates no React root of its own.** `src/renderer.tsx` is now
`const mount = await bootstrap(); mount(container)` with no React import, and `createRoot` appears
**only** in `uikit/shared/mount.tsx`. `src/renderer/index.tsx` exports `mount(container)` instead of a
default `AppContent` element, preserving the old child order: global-styles host, MainPage, Dialogs,
ProgressOverlay, AlertsBar, Poppers.

**Emotion importers renderer-wide are now exactly D6's four** — `theme/GlobalStyles.tsx`,
`core/state/view.tsx`, `uikit/RenderGrid/RenderGrid.tsx`, `uikit/Tree/Tree.story.tsx`. No file under
`src/renderer/uikit/` was modified by the conversion itself.

**`#root`'s geometry moved out of Emotion, and that was a review finding rather than a tidy-up.**
`GlobalStyles` owned `#root` entirely — `position: absolute`, the 2px insets, `display: flex`,
`flex-direction: column`, `overflow: hidden`. `mountReactHandle` calls `root.render()` with **no**
`flushSync` (`mount.tsx:135-136`), so a React-mounted `GlobalStyles` commits *after* the current task,
while `PageTabsView.onMount` measures `scrollWidth`/`clientWidth` synchronously at `:111`. The shell
would therefore have measured an unstyled `#root` on first paint and been silently corrected by the
`ResizeObserver` at `:89` — §6.1's masked-defect class exactly. Resolved by moving those rules to a
static `theme/root.css` imported at entry beside `style-layers.css`, which removes the ordering
dependency instead of papering over it with `flushSync`. **DOM order is not commit order**, and that
distinction is the transferable lesson.

**Every non-visual compatibility host appended to `#root` carries `display: contents`**, because
`#root` is a flex column and a bare host div would become a layout item — the same reason
`VanillaHost` does it (`mount.tsx:89`).

**One startup React root remains, and it is the sanctioned one.** `index.tsx` initially mounted
`AlertsBar`, which is *only* a React face over `mountVanilla(AlertsBarView, {})` — so the flip was
creating a React root purely to wrap a vanilla view, precisely what D9 exists to remove.
`AlertsBarView` is now exported (a one-word additive change with a single immediate consumer) and
instantiated directly. Startup React roots: **2 → 1**, and the survivor is `GlobalStyles`, whose owner
D6 names.

**The residual React-root population, measured live.** 25 roots with a browser page and four tabs
open: **1** startup shell root (GlobalStyles), **3** editor islands
(`pages-container`, `page-editor-container`, one panel), and **21** `react-slot` icon slots inside
`icon-button`s, page tabs and one input `end-slot`. So after Epic D the residual React population is
dominated by **icons**, not by structure — the direct consequence of `IconRef = IconName | ReactNode`
and the React-element icons in `tools-editors-registry.ts`. Epic E and F should plan around that
rather than around the shell.

**Editor-island disposal** reuses US-1031's `PageSlot` discipline rather than a new variant: detach the
React host from the page DOM first, then queue the retained handle's `dispose()`, guarded by the view's
live/generation state. The retained handle's `render()` is used for ordinary updates — recreating the
root would destroy Monaco's cursor, scroll, undo history and folding. `EditorErrorBoundary` survives as
a React class component per D5 with only its Emotion moved out, the same treatment US-1033 gave
`SideBarPanelHeader`.

**Verified live** (HMR, then a cold `npm start`): `#root` resolves to `flex`/`absolute`/`column` from
the static CSS; six children, every non-visual host `display: contents`; all three
`-webkit-app-region` rules correct (header `drag`, header `button` `no-drag`, `.status-indicators`
`no-drag`); page switch preserves the editor container, moves `data-active` and restores; a dialog
opens and closes through the flipped host with the React-root count identical before and after. The
user confirmed on a cold start: no flash of unstyled content, correct rounded-corner geometry, pinned
tabs restored, the title bar drags the window while tabs and header buttons do not, and editors, the
menu and a sidebar panel all work.

Rule 4 measurement: **PENDING**.

**A sixth defect of the same family, reported by the user after the flip.** Clicking the language icon
on an **inactive** pinned tab opened the language menu. The intended design is that a pinned tab is
icon-width precisely because its buttons do **not** fire until the tab is active — the first click
activates, a second click reveals. The original expressed this in the handler, not in CSS
(pre-conversion `PageTab.tsx:549-558`): `pagesModel.showPage(page.id)` then
`if (tabModel.isActive) setOpen(...)`, where `isActive` was a value captured in that render's closure.

The converted handler kept the same shape but read `this.isActive` — a **mutable field** — after
calling `showPage`, which notifies synchronously and runs the view's own active-state binding, flipping
the field to `true` mid-handler. So the guard always passed. Fixed by capturing `wasActive` before the
mutation.

**That is the third instance in this epic of one hazard**, after `PinnedRailView`'s oscillating drag
(US-1034 concern 4a) and `PageTabsView` resolving the active tab from a sibling's not-yet-written
`data-active` (US-1035 concern 2a). The generalisation for Epic E: **a React handler closure captures
per-render constants; a vanilla view's fields are mutable and shared with the synchronous notification
path.** Any read of `this.*` after a store mutation in the same handler is suspect, and no build gate
detects it. The rest of `PageTabView` was audited afterwards — `closeClick` and `handleClick` read
before mutating, so this was the only remaining instance.

### 2026-08-23 — US-1025 was already implemented; D3's bundle criterion is NOT met

**No new work was done for US-1025 — its status was simply stale.** The task landed in `cf57125a`
("Implement US-1025 icon DOM builders") and was never marked. Verified against the code:

- `theme/language-icons.tsx` is now `theme/language-icons.ts` — 233 lines, **54** icons built through
  `createIconWithViewBox`, and **zero** JSX (`grep -c "<svg" → 0`), so all 54 now carry a
  `createElement` DOM builder. That was the whole of D2's measurement.
- `components/icons/file-icon-markup.tsx` no longer exists.
- `BoardGlyph` has its DOM arm as `editors/board/board-glyph-element.ts`
  (`createBoardGlyphElement`), consumed by `components/icons/icon-elements.ts:3,44-46`.
  `BoardGlyph.tsx` itself survives as a React component for its remaining React callers, which is
  correct — D3 required the *DOM builder*, not the component's removal.
- `grep -rn "react-dom/server" src` → **nothing**, and `renderToStaticMarkup` appears **0** times in
  `src/`.

**But D3's second check fails, and this matters for epic close.** D3 states the criterion as the grep
"plus its absence from the built renderer chunk". `renderToStaticMarkup` still appears **4 times** in
`dist/assets/index-*.js`, alongside `renderToString` and `renderToReadableStream` — the assembled
exports of React's server-browser build.

The cause is **not** Persephone's code. No file under `src/` imports it, and no dependency references
`react-dom/server`, `react-dom-server` or `server.browser` by path anywhere in `node_modules`. It
therefore enters through `react-dom`'s own packaging rather than through an import we control, which
means **no amount of application-level work removes it** — and no icon task ever could have.

Recorded as an open epic-close item rather than chased here, because it is a packaging/bundler
question that belongs with Epic F (where React and Emotion are actually uninstalled), not with the
icon work. Two consequences worth stating:

1. **D3's acceptance criterion as written cannot be met by this epic.** It should be restated as the
   source-level grep, which *is* met, with the bundle question handed to Epic F.
2. **The bundle half of the check is exactly the kind that gets reported as passing by anyone who only
   greps source.** The source grep and the bundle grep disagree, and the epic asserted them as one
   criterion.

### 2026-08-23 — US-1035 implementation note

`ui/tabs/` is converted. `PageTab.tsx` goes 611 → a `mountVanilla` face; `PageTabs.tsx` likewise.
**Emotion importers in `ui/tabs/` went 2 → 0.** No file under `src/renderer/uikit/` and no file in
`ui/app/` was modified. Zero `<Panel>` sites existed here, so D10 is untouched by this task.

**One property was worth a whole review finding on its own: `-webkit-app-region`.**
`PageTab.tsx:46` carried `WebkitAppRegion: "no-drag"`, and `MainPage.tsx:43` makes the title bar a
drag region that each tab carves itself out of. Emitted as camelCase-derived `webkit-app-region` it is
silently ignored, and dragging a tab drags the **window**. It survived, but see below — the property
being correct was not sufficient.

**Five defects were found after the build gates were green.** All five are in this task's own new
code, none is detectable by typecheck, lint or build-prod, and four of the five came from a single
approved behaviour change.

*The pinned tooltip trigger escaped its tab.* The conversion appended
`[data-part="pinned-tooltip-trigger"]` unconditionally; the original rendered it only for
`pinned && filePath`. It is `position: absolute; inset: 0`, and a pinned tab's root is
`position: sticky` — which is what gave it a containing block. An **unpinned** tab's root was
unpositioned, so the trigger resolved against `.app-header` (`position: relative`) and covered the
entire 1548px title bar. Being `-webkit-app-region: none` and on top, it swallowed every tab grab and
the header's `drag` region won: no tab could be reordered and the whole window dragged. Fixed by
tracking the element's presence with the same condition as its tooltip, plus `position: relative` on
the tab root so an absolute child can never escape again.

**The methodological lesson is that one.** The computed `-webkit-app-region` on the tab root read
`no-drag`, and that was taken as evidence the drag path was correct. It was not: the property was
right and the *element the pointer actually hit* was wrong. A computed value on the element you
expect to be hit is not evidence about hit-testing.

*Four more from promoting one latent path to a hot path.* Concern 2 made active identity a
scroll-into-view trigger, because the original effect re-ran on `pages.length` only and therefore
silently skipped the scroll on a same-length activation. The change is right, but it moved a path that
previously ran only on tab add/remove onto **every tab click**, and each of its untested assumptions
failed in turn:

1. `scrollToActive` resolved the target by querying `[data-active]`. Each `PageTabView` writes its own
   `data-active` from its own binding, so the strip's sync still saw the **outgoing** tab — clicking a
   far-right tab scrolled the bar left, and vice versa. Now resolved by page id through the strip's
   `KeyedList`, which has no ordering dependency. Same family as US-1034's concern 4a: a read racing a
   sibling's update.
2. `inline: "center"` re-centred the strip on every activation, including already-visible tabs.
3. `inline: "nearest"` parked the tab **behind** the sticky pinned block, because it aligns to the
   scrollport's left edge. `"center"` had accidentally cleared the pinned tabs, which is why this was
   latent. `scrollIntoView` cannot express "align to the left edge minus a sticky inset", so the
   scroll is now computed directly.
4. That computation used `offsetLeft` (whose `offsetParent` is `.app-header`, not the wrapper) and
   summed `pinnedTabWidth + 2` for the inset (the layout `width`, excluding each tab's 1px borders and
   2px padding — ~4px short per tab). Both fixed by measuring client rects against the wrapper's own
   box and reading the **last pinned tab's right edge** for the inset.

**Verified by measurement, not by asking.** With 19 pages created to force 23 tabs into a 1235px port:
activating the last tab lands it flush at `1149→1235`; activating the first unpinned tab puts its left
edge at `142`, exactly the measured pinned inset; activating an already-visible tab leaves `scrollLeft`
unchanged. Test pages were then closed and the original tab set restored. Also verified live: the
strip and tabs render, `-webkit-app-region` computes `no-drag`, pinned tabs keep inline
`left: 0/46/92px`, embedded controls keep their own `data-type="icon-button"`, every `data-part` hook
survives, icon and composite close icon route through `fillSlot`, tab activation moves `data-active`
with the tab DOM nodes **reused**, and the tab context menu carries its full item set.

The user confirmed at the machine: tab drag-reorder (after the trigger fix), drag-out to a new window,
drag **between** two windows, tab scrolling including the close-the-last-tab case, and the pinned-tab
tooltip.

Rule 4 measurement: **PENDING**.

**Deliberate behaviour changes**, recorded so a later report is attributable: activation now triggers
scroll-into-view (previously only a tab count change did), and the scroll is minimal-and-only-if-needed
rather than always-centre — including for the add/remove case.

### 2026-08-23 — US-1034 implementation note (both slices)

`ui/sidebar/` is fully converted across two commits. **Emotion importers in `ui/sidebar/` went 4 → 0.**
`ui/app/MainPage.tsx` and `editors/tools-hub/ToolsHubView.tsx` are untouched, so every external caller
keeps its exact props. `MenuBar.tsx` went 586 → 8 lines.

**The task was split** because 2,110 lines with two independent smoke surfaces could not be reviewed as
one diff. Slice A is exactly the set with external `ToolsHubView` callers, so it is testable from the
Tools Hub without the MenuBar existing; Slice B is the shell. One task document, two commits, each
leaving the tree building and the app working.

**A narrow UIKit exception was authorized**, against the epic's usual "no UIKit changes in a shell
task" stance: three additive fields in `uikit/ListBox` (`rowClass`, `trailingElement`, `drag`),
+70/-1 across four files. The bar was **an immediate consumer in the same task**, and here there were
two — `BuiltinEditorsList` and `MenuBar`'s folder list, both `renderItem` consumers. Contrast US-1033,
where the proposed seam would have had zero. This continues the direction recorded at
`uikit/MultiListBox/MultiListBoxView.ts:23-31`: US-1014's obligation is discharged by **eliminating**
`renderItem` consumers (US-1016 added `checkbox: true` to `ListItem` rather than widening the hatch),
not by teaching `renderItem` to return a `Node`. Both lists are now ordinary `ListItem`s.

**Three findings worth carrying into the remaining shell tasks.**

*Never override a row's `data-type`.* The first Slice A attempt did, and every rule in `ListItem.css`
is keyed on `[data-type="list-item"]` — more than twenty of them. The override detaches a row from all
of them; the compensating 46 lines added to `ListItem.css` re-implemented about seven, silently losing
`[data-selection-style="focus"]` active/selected styling, `[data-drop-active]` styling (which the same
slice's new row drag depends on), the `browse`-variant hover nuance and the check-slot rules. It also
put two app-specific strings into a UIKit stylesheet, one with zero consumers. Replaced with an
additive class; `ListItem.css` is untouched. Verified live afterwards: a selected MenuBar folder row
computes `background-color: rgb(49,49,49)` from the focus-selection rule.

*Mutable per-row records must not be read after a synchronous store write.* Recorded as task-document
concern 4a. `PinnedRailView.onDragOver` read `record.rowData.index` **after** calling `movePin`, which
persists synchronously and therefore re-runs `refresh()`/`updateRow` and replaces `record.rowData`
mid-handler. The sentinel then held the hovered item's post-move index instead of the position the
dragged item had moved to, so dragging the last pin over the first made the first two rows swap 3-4
times per second indefinitely. The React original was immune only because `index` was a per-render
closure constant. This is a conversion hazard with **no React analogue** and nothing in typecheck,
lint or build-prod detects it. Found by the user dragging a row, not by any automated check.

*The React-root population is one per row icon, not zero.* Measured, not assumed: removing the
`renderItem` hatch eliminated the per-row **wrapper** root, but `tools-editors-registry.ts` supplies
React-element icons, so each row keeps exactly one slot at its icon. Zero for wrapper, label and
trailing button. Owner: **US-1025**, whose runtime-coloured browser/profile icons may need more than
its 54 language-icon conversion.

**D10 note.** `SideBarPanelHeader`'s two `<Panel>`s (US-1033) still stand, and `ScriptLibraryPanel`
keeps its deliberate `data-type="script-library-panel"` override on its own outer `Panel` — that one is
a `Panel` attribute, not a `ListItem` row, and `Panel.tsx` applies `{...rest}` after its generated
attributes (`:126-145`), so the override is intentional and is reapplied explicitly in native code.
Verified live retaining `panel-root` and `data-direction="column"`.

**Verified live** (running app, after a full restart): Slice A — panel and all three tabs; 11
`BuiltinEditorsList` rows at `data-type="list-item"` with `renderItem` gone; 9 draggable `PinnedRail`
rows; both editor-owned React tree arms (`BoardsTree` 25 rows, `ToolsTree` 3) mount and re-mount; a
Boards revisit identical at 25 rows / 82 slots, so the retained React root is reused not leaked;
closing the menu drops doc-wide slots 155 → 57. Slice B — open/close classes; folder rows as
`ListItem` + `rowClass`; the focus-selection background; 4 static folders non-draggable vs 14 dynamic
draggable; all four content panes; the script-library `data-type` override; a dynamic folder tree at 15
rows; Escape close; the folder context menu with its full item set including the dynamically imported
"Open Terminal here". The user confirmed at the machine: pinned-row drag reorder (after the fix),
folder drag reorder, Ctrl+F search routing, the open animation and first-open focus, and app-bar menu
resizing via the splitter.

Rule 4 measurement: **PENDING** for both slices.

**HMR is unreliable for batches this size.** Slice A's changes left the renderer blank — window alive,
main-process MCP responding, renderer MCP timing out — and a full `npm start` restart rendered
correctly with no code change. Treat a wedged renderer after a large multi-file conversion as an HMR
artifact until a fresh load reproduces it, and always reload before smoke-testing a batch.

**One bug found during testing was traced out of scope:** clearing a tree search after a *zero-match*
search does not restore expansion state. `computeDisplayTree` returns `tree` unchanged for empty search
text and the raw tree is never mutated, so the display tree is restored by construction and the defect
is in the expansion restore (`savedExpandMap`/`initialExpandMap`/`searchKey`). The block was last
touched by `11795ce6` (US-971). Filed as **US-1039**, standalone, with the open question of whether
US-1037's view conversion changed remount timing.

### 2026-08-23 — US-1033 implementation note

`SecondaryViews.tsx` is now a React face over a native `SecondaryViewsView`; the published
`SecondaryViewProps` registry, its `loadComponent` React arm, `LazySecondaryView` and all 14 editor
callers are untouched. `SideBarPanelHeader.tsx` lost only its Emotion `styled.button`, which moved to
`SideBarPanelHeader.css` in `@layer app`.

**Two scope decisions worth carrying forward.**

The plan originally converted `SideBarPanelHeader`'s two `<Panel>` wrappers to plain flex `div`s.
`CollapsiblePanelStack.css:50-54` sets `pointer-events: none` on `[data-type="panel"]` inside a panel
header, which is what makes a click on the panel title fall through to the header and toggle it. Plain
`div`s would have silently blocked that — typecheck, lint and build-prod all stay green. Both `<Panel>`s
were kept, verified live at `pointer-events: none`. Since `uikit/Panel/Panel.tsx` is now a 152-line
React face over `resolvePanelAttributes` and imports no Emotion, keeping them costs D6 nothing. **This
unit therefore does not reach D10's "`<Panel>` tags outside `editors/` → 0"** — two remain, owned by
the React component D4 keeps alive, and Epic E collects them when it converts the header for real.

The native arm was **dropped entirely**: no `secondary-view-native-registry.ts`, no `nativeContent`
arm on `CollapsiblePanelStack`. Every current `loadComponent` returns a React component and this task
converts no editor panel, so the registry would have been an empty map and the stack change would have
served zero call sites. US-1032's `dialog-view-registry.ts` was justified by 13 native views
registering into it in the same task; an empty registry is not that pattern. The full design —
native-first lookup, append-once `nativeContent` (with the `fill-slot.ts:125-140` reattachment
evidence), and host-owned disposal because `CollapsiblePanelStackView.removePanel` never disposes
anything — is recorded in the task document's Concerns for Epic E's first editor-panel conversion.
No file under `src/renderer/uikit/` was modified.

**Verified live** (app running from the source tree): host composition and persisted width; header
portals populated on every panel, so the two-pass `headerRef` publication works; `pointer-events: none`
on the title group with an actual header click flipping open/closed; panel content DOM nodes surviving
an owner `setState` round-trip, so `onUpdate` reconciles without recreating records; a page switch away
and back leaving all header portals populated with no stray or duplicated hosts and the inactive host
hidden; every computed style of the migrated show-main button matching the old Emotion declaration
against real theme variables. Splitter drag and sidebar close/reopen were confirmed by the user at the
machine — synthetic pointer events cannot drive `SplitterView`, which requires real pointer capture
(`SplitterView.ts:93`, `:103`).

Rule 4 measurement: **PENDING** — no before/after interaction count is recorded for a sidebar panel
switch.

**D4's caller count was stale** and is corrected in this commit: 14 files in `editors/` implement
against `headerRef`, not 10. The four the original enumeration missed are `mneme-root`, `notebook` (two
panels) and `rest-client`. Note that a bare `grep -rln SideBarPanelHeader src/renderer/editors` returns
16 — `GitChangesView.tsx:46` and `GitRefsView.tsx:23` mention it only in comments.

### 2026-08-23 — US-1031 implementation note

Rule 4 measurement: **PENDING**. The active app-page switch and browser-tab switch require the
running application and live MCP observation roots; no baseline or post-conversion number is
recorded without those live measurements. The corresponding live smoke checks are also pending for
the same reason.

### 2026-08-23 — US-1028 implementation note

US-1028 now has a native `FileSearchView` and `VirtualGrid` cell renderer, with progress-only
state bindings separated from `resultsVersion` repainting. The Rule 4 React-before/vanilla-after
measurement remains pending: the Persephone MCP was unavailable while the conversion was made,
so no interaction count is recorded here until the same settled FileSearch action can be measured
live on both sides.

### 2026-08-22 — epic drafted

Scoped after [EPIC-057](EPIC-057.md) closed. Fourteen tasks, ten decisions, and the surface measured at
`c9453d3a`. Three findings changed the shape of the epic relative to the roadmap's two-line sketch:

**`theme/` had no owner.** The roadmap's §2 table lists `theme/` as 4 `.tsx` files / 2,441 lines
"mostly icon SVG components" and no epic claims it. D2 claims its icon files, because the icon work is
unavoidably shared between `theme/` and `components/icons/` and splitting it across epics would leave
the icon set half-convertible.

**The icon task has an exact size, and it is not a line count.** 115 of 169 icons already have DOM
builders; the 54 that do not are precisely `language-icons.tsx`, precisely because
`createIconWithViewBox` only attaches `createElement` for a string body. That single asymmetry is what
forces `react-dom/server` into the renderer, and it is why D3 can state an epic-level acceptance
criterion that a grep can check.

**Zero contexts, seven `useState`.** The measurement worth carrying forward: Epic P's value shows up
here, not in Epic P. The hazards in this epic are structural (portals, the error boundary, the root
flip), not stateful — which is the opposite of what the roadmap predicted for the shell.

### 2026-08-22 — av-grid 2.2.4: the renderer element arm widens to `Element`

US-1027 was written expecting av-grid's element arm to be usable for an icon cell. It was not, for a
reason no amount of prose would have caught: `CellRenderer` and `HeaderRenderer` declared that arm as
`HTMLElement`, and an `<svg>` built with `createElementNS` is an **`SVGElement`** — a *sibling* of
`HTMLElement` in TypeScript's DOM types, not a subtype. US-1026's `createFileIconElement` returns
`Element` precisely because its branches produce an `<svg>`, an `<img>` or a board glyph. So the one
thing a consumer most often wants to put in a cell was the one thing the type rejected, and the only
routes through were a cast that lies about the interface, or the wrapper span US-1026 spent a whole
concern avoiding.

Fixed upstream and published as **2.2.4**; Persephone is re-pinned exactly, and `typecheck`, `lint`
and `build-prod` are green on it. Four things worth keeping.

**This is C4-10's fourth invocation and the cheapest yet — two type lines, no runtime change.**
`DataCell` appends what it is handed (`el.appendChild(rendered)`) and `HeaderCell` does the same;
neither touches an `HTMLElement`-only member, so nothing else had to move. The library's own
doc-comment already promised "a DOM element", which makes this the type catching up with its
documented contract rather than a new capability. `Column.editor` stays `HTMLElement | CellEditor`
deliberately — an editor is focused and read for its value, and `EditingModel` narrows on
`instanceof HTMLElement`.

**`HeaderRenderer` widened in the same release although nothing needs it yet.** Same declaration,
same defect, and a header icon is as ordinary as a cell icon; leaving it asymmetric would have bought
a second release for the identical reason.

**The tests pin a type, so they had to be shown to fail as types.** All three compile only with the
widening — verified by reverting `types.ts` and watching `tsc` reject each one, which is the only
honest discriminator for a change with no runtime behaviour. Two also assert `namespaceURI`, because
an `<svg>` parsed out of a *string* lands in the HTML namespace and is indistinguishable by `tagName`
alone. The third pins that a renderer returning the **same node** keeps it across a repaint: the
element branch has no `written` guard, so a per-row element cache is the supported way to keep one
node alive, not an accident for a later optimisation to remove.

**Process note for the rest of Epic D.** This epic's opening investigation did not predict an
upstream dependency; it read the element arm as sufficient, and US-1027 is now the epic's only task
with one. Two consecutive task documents asserted that a *type* was fine when it was not — US-1026
on `getIcon`'s "arbitrary `ReactNode`", US-1027 on the element arm. The cheap habit that catches both:
compile a throwaway snippet against the real signature before writing a claim about it into a plan.
