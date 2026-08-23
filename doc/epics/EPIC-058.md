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
| `ui/dialogs/` | 19 | 2,233 | One host plus 15 dialogs plus the popper path |
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
createPortal"*, and **10 files in `editors/` implement against it** (`archive`, `board`, `explorer`
×3, `file-diff`, `git-tree`, `link-editor` ×3). Rule 2 forbids breaking them. The resolution costs
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
| [US-1025](../tasks/US-1025-icon-dom-builders/README.md) | Icon DOM builders — 54 language icon bodies + `BoardGlyph`; `react-dom/server` out | Planned |
| [US-1026](../tasks/US-1026-components-icons-vanilla-views/README.md) | `components/icons/` vanilla DOM views | Implemented |
| [US-1027](../tasks/US-1027-file-list-grid/README.md) | `components/file-list/` + `components/file-grid/` | Implemented |
| [US-1028](../tasks/US-1028-file-search/README.md) | `components/file-search/` (first `RenderGrid` collection) | Implemented |
| [US-1029](../tasks/US-1029-tree-provider/README.md) | Tree primitive seams for tree-provider | Planned |
| [US-1037](../tasks/US-1037-tree-provider-view/README.md) | `components/tree-provider/TreeProviderView` | Planned |
| [US-1038](../tasks/US-1038-category-view/README.md) | `components/tree-provider/CategoryView` | Planned |
| US-1030 | `components/git-tree/` React remnants | Planned |
| US-1031 | `components/page-manager/` (portal hosts → `appendChild`) | Planned |
| US-1032 | `ui/dialogs/` host, 15 dialogs, and the popper path | Planned |
| US-1033 | `ui/secondary-views/` host and the registry contract | Planned |
| US-1034 | `ui/sidebar/` and `MenuBar` | Planned |
| US-1035 | `ui/tabs/` | Planned |
| US-1036 | `ui/app/` and the root flip | Planned |

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

2. **`ui/dialogs/` is 15 dialogs behind one host.** They are individually simple, but the task is
   wide, and a dialog that is only reachable from an error path (`NamespaceCollisionDialog`,
   `TrustBoardDialog`, `PasswordDialog`) is a dialog nobody will smoke-test by accident. The task plan
   needs an explicit route to each of the 15.

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
