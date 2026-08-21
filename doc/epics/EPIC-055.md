# EPIC-055: De-React Epic C2 — Floating layer and composites

## Status

**Status:** Active
**Created:** 2026-08-20
**Completed:**

## Overview

The second of four epics that make up the [de-React roadmap](../de-react.md)'s Epic C ("UIKit
conversion"). C1 shipped as [EPIC-054](EPIC-054.md) — the twenty foundation components, the
React-compatibility layer, the layered-CSS contract, the DOM icon path, and `@floating-ui/dom`
proven on `Tooltip`.

C2 is the **floating layer**: `Popover` is the root of every overlay in the product, `Menu` is
every context menu in the app, `Dialog` is every modal. On top of it sit the chrome and composite
widgets — `Notification`, `Progress`, `Toolbar`, `Splitter`, `Breadcrumb`,
`CollapsiblePanelStack`, `SplitButton`, `CategoryList`, `TagsInput`, `DateInput`, `Minimap`,
`ImageViewport`.

Two things make C2 different in kind from C1, not just in size:

- **It is the first epic that converts models.** C1 had zero `TComponentModel` instances and zero
  `effect()` call sites, so Epic B's `createComponentModelDriver` was never used. C2 has **four
  models and seven effects**, and the driver *throws* on a model that registered any — so the
  effect-shedding decision (EPIC-053 B13) stops being theory here.
- **It converts two React-only composition idioms**, the way C1-5 had to convert `Tooltip`'s
  `cloneElement`. `WithMenu` is a render prop; `Popover` returns `null` when closed. Neither has a
  vanilla equivalent, and both have to be replaced by an attachment API rather than ported.

## What the investigation at epic open established

The roadmap's Epic C section describes C2 in one paragraph written at the C-split. Measuring it
against the tree changed the scope. Each row states the roadmap's assumption and what measurement
showed; **the roadmap has been updated to carry these findings**, so this table is the record of
what changed and why.

| Roadmap assumption | What measurement showed |
|---|---|
| C2 is 18 components: the list ends `…`, `Minimap`, `ImageViewport`, `Progress` | **C2 is 15.** `Select`, `MultiSelect` and `Autocomplete` render `<ListBox>` / `<MultiListBox>`, which the roadmap assigns to **C3** — and `ListBox` in turn needs a vanilla `RenderGrid`, C3's centrepiece. See C2-1. |
| "C3 — blocked on C1, C2" and "C2 — blocked on C1" | **The real chain is `Popover → Menu → ListBox → Select`**, which crosses the C2/C3 line twice. `ListBox` and `Tree` both import `../Menu`; `Select` imports `../ListBox`. It is a chain, not a cycle — but it is not the chain the split assumed. |
| C2 is "~5,270 lines" | **4,104 production lines** in the 15 components (5,805 before the three move to C3). The roadmap's per-epic line estimates inherit the unreproducible §2 denominator, exactly as EPIC-054 Concern 5 warned. |
| C2 "carries the bulk of the `@floating-ui/react` → `@floating-ui/dom` move" | **True, and it finishes the `uikit/` half.** Only **two** `uikit/` files still import `@floating-ui/react` (`Popover/Popover.tsx`, `Popover/PopoverModel.ts`) plus a **type-only** `Placement` import in `Menu/WithMenu.tsx`. After C2 the dependency has exactly **two** importers left, both app-layer, both Epic D/E. |
| Epic B's model driver is the mechanism for converting a model | **The driver refuses every C2 model as it stands.** `createComponentModelDriver.mount()` throws `"… registered effects and cannot be driven by a vanilla lifecycle"` (`core/state/model.ts:296`). All four C2 models register effects. See C2-4. |
| `Panel`'s C2 consumers are `Autocomplete`, `Notification`, `Progress`, `Toolbar` (EPIC-054 C1-1) | **Three of the four are in scope** — `Autocomplete` leaves with C2-1. And `Toolbar` is the hard one: it has **no Emotion at all**, because its entire visual definition *is* a set of `Panel` props. Its stylesheet is written from scratch, not converted. |
| Story coverage is 38 of 44; the storyless ones belong to whichever epic owns the component | **12 of C2's 15 have a story.** `Minimap`, `ImageViewport` and `Progress` do not, and they are again the measurement-heavy ones. US-1009 and US-1012 write them before converting. |

## The surface, measured

All figures measured 2026-08-20 against the tree, stories excluded from production counts unless
stated. See the measurement note below.

| Item | Measure |
|---|---|
| C2 components | **15** — `Popover`, `Menu`, `Dialog`, `Notification`, `Progress`, `Toolbar`, `Splitter`, `Breadcrumb`, `CollapsiblePanelStack`, `SplitButton`, `CategoryList`, `TagsInput`, `DateInput`, `Minimap`, `ImageViewport` |
| C2 lines | **4,104** production (excluding `index.ts` and stories). Largest: `Menu` 607, `Popover` 444, `ImageViewport` 400, `Notification` 350, `CategoryList` 324, `Minimap` 320, `Dialog` 313. Smallest: `DateInput` **28** |
| Moved to C3 | **3** components / **1,701** lines — `Select` 784, `Autocomplete` 532, `MultiSelect` 385 (C2-1) |
| Internal C2 dependencies | `Popover ← Menu`; `Menu/WithMenu ← SplitButton`. Plus the C1 edges: `IconButton ← {Dialog, Notification}`, `Input ← {Menu, DateInput}`, `Tag` + `PathInput` `← TagsInput`, `Button` + `IconButton ← SplitButton`, `Spinner` + `Text ← Progress` |
| Components importing no other `uikit/` component | **6** — `Popover`, `Splitter`, `Breadcrumb`, `CollapsiblePanelStack`, `Minimap`, `ImageViewport` |
| External JSX call sites (production, excl. stories) | `Splitter` **19** · `Dialog` **14** and `DialogContent` **14** · `WithMenu` **14** · `Popover` **6** · `Breadcrumb` **6** · `ImageViewport` 3 · `SplitButton` 3 · `TagsInput` 3 · `DateInput` 2 · `Toolbar` 2 · `CategoryList` 2 · `CollapsiblePanelStack` 1 · `Minimap` 1 · `Menu` 1 |
| Components with **no** direct external JSX call site | **2** — `Notification` (reached only through `AlertsBar`) and `Progress` (reached only through `api/ui.ts` and `ProgressOverlay`). Both are mounted once at the application root |
| `TComponentModel` models in C2 | **4** — `PopoverModel`, `MenuModel`, `MinimapModel`, `ImageViewportModel` |
| `effect()` call sites in C2 | **7** — `Popover` 2, `Menu` 3, `Minimap` 1, `ImageViewport` 1. **The driver rejects all four models until these are shed** (C2-4) |
| `memo()` call sites in C2 | **4** — `Popover` 2 (`placeRef`, `middleware`), `Menu` 2 (items normalisation, filtered rows). `memo` is a cache, not a lifecycle hook, and stays (roadmap §3.2) |
| Local `useState` in C2 | **5 files** — `Menu`, `TagsInput`, `Toolbar`, `Splitter`, `CategoryList` |
| Emotion importers in C2 | **14 files** across **13 components** (`Dialog` has two). `DateInput` and `Toolbar` have none |
| `styled` components in C2 | **30**, of which exactly **one** is prop-interpolated (`Progress/ProgressOverlay.tsx:42`, `PillSlot`) |
| Emotion `keyframes` in C2 | **2** — `Dialog`'s `pulse`, and `Notification`'s already-hand-written `@keyframes notification-slide-in` |
| Computed inline-style sites | **6** — `Popover:152`, `DialogContent:106`, `CollapsiblePanelStack:205` and `:240`, `Minimap:97`, `ImageViewport:374` |
| `...rest` spreading | **every component in scope** |
| `ref?: React.Ref` declarations | **5** — `Popover`, `Menu`, `Notification`, `AlertItem`, `DateInput` |
| `ReactNode` / `ReactElement` references | **13** — `CollapsiblePanelStack` 6, `Dialog` 3, `Popover` 1, `Menu` 1, `Breadcrumb` 1, `SplitButton` 1 |
| Components rendering `{children}` | **4** — `Popover`, `Dialog` (root and content), `Toolbar`, `SplitButton` |
| `renderIcon` consumers in C2 | **4** — `DialogContent`, `Notification`, `CategoryList`, `CollapsiblePanelStack` |
| `@floating-ui/react` importers | **5** total: `Popover/Popover.tsx`, `Popover/PopoverModel.ts`, `Menu/WithMenu.tsx` (type-only `Placement`), and two app-layer — `editors/browser/BrowserTabsPanel.tsx`, `ui/dialogs/poppers/showPopupMenu.tsx`. **Three leave in C2; two outlive Epic C** |
| Portal / overlay-layer consumers in C2 | **1** — `Popover` (`ReactDOM.createPortal` into `getOverlayLayer()`). `Dialog` does **not** portal; its host places it |
| `overlayRegistry` registrants | **1 today**, and it is app-layer (`showPopupMenu.tsx:146`). `Popover`, `Menu` and `Dialog` register nothing — pre-existing behaviour that C2 preserves rather than fixes (Concern 4) |
| Story coverage | **12 of 15**. Missing: `Minimap`, `ImageViewport`, `Progress` |
| Emotion importers, renderer-wide | **58** production — `uikit` 35, `components` 11, `ui` 10, `theme` 1, `editors` **0** |
| Rule 6 violations | **1** — `uikit/AVGrid/model/ContextMenuModel.tsx:3`, the documented C4 exemption. US-995's lint zone is live at `eslint.config.mjs:161` |

**The numbers that shape the epic.** Four models and seven effects means C2 is where the vanilla
model lifecycle is exercised for the first time, and where B13's decision gets paid for. Fourteen
Emotion files against fifteen components means styling is again the bulk of the diff — but with
only one prop-interpolated `styled` and six computed-style sites, it is again mostly
character-for-character attribute-selector work. And **two components have no external call site at
all** because they are mounted once at the application root, which makes them the cheapest overlay
conversions in the epic and a useful rehearsal for Epic D's root flip.

> **Measurement note.** Counting *import paths* undercounts every component in this library,
> because `uikit/index.ts` is a barrel and most app code imports from it — a path-based scan
> reported `Minimap` as having zero consumers when it has one
> (`editors/markdown/MarkdownBody.tsx`, via the barrel). The counts above are **JSX-tag counts for
> the exported identifier**, taken over `.tsx` with the component's own folder and all
> `*.story.tsx` excluded and subtracted explicitly. Treat every number here as checkable, and
> re-check rather than inherit — EPIC-054's audit is the reason that sentence is in this document.

## Decisions

**C2-1 — `Select`, `MultiSelect` and `Autocomplete` move from C2 to C3.** *(User decision,
2026-08-20.)*

All three render a C3 component in their dropdown: `Select/Select.tsx:153` renders `<ListBox>`,
`MultiSelect/MultiSelect.tsx:141` renders `<MultiListBox>`, `Autocomplete/Autocomplete.tsx:145`
renders `<ListBox>`. `ListBox` in turn imports `../RenderGrid` and `../Menu`. So the true
dependency order is:

```
Popover  →  Menu  →  ListBox / MultiListBox  →  Select / MultiSelect / Autocomplete
 (C2)       (C2)      (C3, on RenderGrid)              (was C2, now C3)
```

Two alternatives were considered and rejected. **Keeping them in C2 with the React `ListBox` hosted
through `fillSlot`'s `ReactNode` arm** would work — it is the same bridge tax `PathInput` paid — but
the host wiring would then be written twice, once against the React `ListBoxModel` and again in C3
against the vanilla one, and `SelectModel` is already coupled to `ListBoxModel`'s internal
scroll-on-`activeIndex` behaviour (`SelectModel.ts:573-574`), which is precisely the wiring that
changes. **Pulling `ListBox` and `MultiListBox` down into C2** would drag `RenderGrid` (2,323 lines,
the av-grid `render/` absorption) with them, which is most of C3.

**Consequences recorded in the roadmap:** C2 is 15 components / 4,104 lines; C3 becomes 7
components — `RenderGrid`, `ListBox`, `MultiListBox`, `Tree`, `Select`, `MultiSelect`,
`Autocomplete` — and its internal order is fixed by the same chain. C4 is unaffected: it needs
`Select` (`AVGrid/CellSelect.tsx`) and still sits after C3.

**C2-2 — Nothing in this epic changes a React call site.** Roadmap Rule 2, restated because C2's
call sites are more exposed than C1's: 14 app-layer dialogs, 14 `WithMenu` triggers, 19 `Splitter`
instances. Every component keeps its exact props, its exact `data-*` output, its exact DOM shape and
its exact class names. `Popover` keeps emitting `data-type="popover"` and the `scroll-container`
class; `Menu` keeps `data-type="menu"` and `data-type="menu-row"` with `data-id`. API cleanup is
Epic F's (roadmap open decision #3).

Two of these attributes are **load-bearing behaviour, not just addressing**: `Menu.tsx:173` passes
`outsideClickIgnoreSelector='[data-type="menu"]'` so a submenu click does not close its parent, and
`PopoverModel.ts:256` skips outside-clicks landing on `[data-type="tooltip"]`. A renamed attribute
here is a silently-closing overlay, not a failed selector.

**C2-3 — `Popover` becomes a vanilla floating root on `@floating-ui/dom`, and the React-specific
hazards are deleted rather than ported.**

Today `Popover.tsx` is shaped by React constraints the vanilla version does not have. The file says
so itself: `useFloating` "must run unconditionally on every render — it owns React refs
internally. It cannot live in the model class" (`:71-72`); and `PopoverModel.setFloating`'s comment
records that calling `setPositionReference` during render "triggers floating-ui's internal setState
in the same component → infinite re-render loop" (`:115-118`), which is why a `useEffect` defers it.

In `@floating-ui/dom` the whole shape collapses to `computePosition(reference, floating, options)`
plus `autoUpdate(reference, floating, update)` — the same library core `attachTooltip` already uses
(EPIC-054 C1-5). `useMergeRefs` disappears with the refs. The three-way ref merge, the deferred
position reference and the render-abort risk are not requirements to reproduce; they are React costs
to stop paying.

Two contracts the conversion must keep exactly:

- **No DOM when closed.** `Popover` returns `null` unless `open && placeRef` (`:127`). Consumers
  rely on it — `Menu` mounts its rows only while open, and `PathInputView` already treats the
  popover as absent between opens. The vanilla view therefore builds and disposes its floating
  subtree on the open transition rather than hiding it, which is what `SubtreeSwap` is for.
- **The floating root is not the view's logical root.** It is portalled into `getOverlayLayer()`,
  which lives on `document.body`. `applyRestProps` and `bindRef` from C1-10 were written for a
  single root element, so the task must state explicitly which node receives forwarded rest props,
  the caller's `ref` and `data-name` — it is the floated root, matching today's `mergedRefs`.

**`PathInput` is rewired in the same task.** `PathInputView.tsx:5,92` mounts the React `<Popover>`
inside a vanilla view through its bridge. Once `PopoverView` exists, the pilot composes it with
`this.child(...)` instead, which removes the last React root from the one component Epic B
converted. This is a deliberate second relaxation of roadmap §6 Rule 1 (never convert a component
and its parent in the same change), on the same grounds C1 accepted the first for
`SegmentedControl`: both sides stay behind unchanged signatures and the boundary is internal to one
task's review.

**C2-4 — The four models shed their seven `effect()` calls before the driver takes them, and the
shedding is a separate, React-verified step inside the owning task.**

`uikit/CLAUDE.md` Rule 9 already states the rule ("A vanilla-driven model uses
`createComponentModelDriver` and registers no `TComponentModel.effect()` entries"), and
`createComponentModelDriver.mount()` enforces it by throwing. EPIC-053 B13 is the reasoning. C2 is
the first epic where it costs anything. The seven sites, classified by deps:

| # | Site | Deps | Shape | Replacement |
|---|---|---|---|---|
| 1 | `PopoverModel.ts:237` | `[props.open]` | props | close consequence — reset `manualSize` where `open` is handled |
| 2 | `PopoverModel.ts:250` | `[props.open, props.outsideClickIgnoreSelector]` | props, returns cleanup | the view's open/close path plus the disposal registry |
| 3 | `MenuModel.ts:251` | `[props.open, props.items]` | props | close consequence — reset search / hover / submenu |
| 4 | `MenuModel.ts:278` | `[props.open, this.showSearch]` | props + derived getter | open consequence — focus the search input or the list |
| 5 | `MenuModel.ts:293` | `[state.hoveredId]` | state | `setHoveredId(id)` performs the scroll-into-view |
| 6 | `MinimapModel.ts:194` | `[props.scrollContainer]` | props | `setProps` comparing `oldProps.scrollContainer` |
| 7 | `ImageViewport.tsx:307` | `[props.src]` | props, returns cleanup | `setProps` on `src` change; the timeout cleanup moves to the registry |

**Six of the seven are prop-deps** — B13's dominant shape, replaced by `setProps` plus an `oldProps`
comparison. Only #5 is state-deps, and it is the classic "the method that changes the state performs
the consequence". **None** hits B13's undecided fourth row (deps on a `memo()` or on another model's
state) — that gap was resolved in the pilot and does not recur here.

Shedding lands as its own step, verified on React, before the same task converts the component.
Keeping it a separate commit matters for review: a shedding diff is a behaviour-preserving refactor
and a conversion diff is not, and reading them merged is how a behaviour change gets waved through.

**C2-5 — `Menu` gains an imperative attachment API; `WithMenu` keeps its render-prop React face on
top of it.**

`WithMenu` is `children: (setOpen: (anchor: Element | null) => void) => React.ReactElement`
(`WithMenu.tsx:18`), with 14 external call sites. A render prop is React by construction: there is
no vanilla value a caller can return from it. This is structurally the same problem C1-5 solved for
`Tooltip`'s `cloneElement`, and it gets the same answer:

```ts
// uikit/Menu/attach-menu.ts
export interface MenuAttachOptions {
    items: MenuItem[];
    placement?: Placement;      // @floating-ui/dom
    offset?: [number, number];  // default [-4, 4] — WithMenu's current default
    name?: string;
    onClose?: () => void;
}
/** Open a menu anchored at `anchor`. Returns a handle; the caller owns disposal. */
export function openMenu(anchor: Element, options: MenuAttachOptions): MenuHandle;
```

A vanilla caller calls `openMenu` from its own click handler — which is what
`ui/dialogs/poppers/showPopupMenu.tsx` already does at the app layer, imperatively, and is the
existence proof that the imperative shape is the natural one here. `WithMenu`'s React face keeps its
render prop, its `useState` anchor and its focus restore, and drives `openMenu` from an effect; its
15 call sites do not move. Epic F deletes the render-prop face (roadmap open decision #3).

`WithMenu`'s type-only `Placement` import moves from `@floating-ui/react` to `@floating-ui/dom` in
the same task, which is what leaves `uikit/` free of the React binding.

**C2-6 — `Menu` is self-recursive, and the vanilla view owns its submenu as a child view.**
`Menu.tsx:224-228` renders `<Menu>` for `subMenuItem`. In vanilla a `MenuView` constructs a child
`MenuView` for the open submenu and owns it through `SubtreeSwap` keyed on the submenu item's
identity, so opening a sibling submenu disposes the previous branch and its listeners. This is the
first recursive vanilla view in the codebase, and the disposal ordering — child before parent, which
`VanillaView.dispose()` guarantees — is what keeps a submenu's outside-click listener from
outliving its parent.

**C2-7 — The two root-mounted overlays keep their React faces, and `src/renderer/index.tsx` does not
change.** `AlertsBar` and `ProgressOverlay` are rendered directly by the application root
(`index.tsx:14-15`). Their `mountVanilla` faces preserve that, so the root flip stays Epic D's work.
Both are driven by a `TGlobalState` with no props, which makes them the epic's cleanest
demonstration of `bind` against global state: `AlertsBar` is a `KeyedList` over `state.alerts` with a
per-alert height measurement (view-owned DOM measurement, exactly as C1 settled for
`TruncatedText`), and `ProgressOverlay` is a three-way `SubtreeSwap` over
notification / progress / locked.

**C2-8 — Emotion to CSS continues C1's contract, with three cases C1 did not have.** One
`ComponentName.css` per component, wrapped in `@layer uikit`, selectors keyed on the same `data-*`
attributes the Emotion rules use today, every colour read as a `var(--*)` reference with a fallback.
C1's conversions were attribute-selector Emotion that converted character-for-character; C2 adds:

- **`Progress`'s `PillSlot`** — the epic's only prop-interpolated `styled` component
  (`ProgressOverlay.tsx:42`). Emotion generated a class per prop value; the vanilla view writes
  `element.style.top` directly. The same applies to the other five computed-style sites.
- **Two `@keyframes`.** `Dialog`'s `pulse` is an Emotion `keyframes` template and moves into
  `Dialog.css`; `Notification`'s is already a hand-written `@keyframes` string and moves as-is.
- **`Toolbar` has no Emotion to convert.** Its appearance is entirely `Panel` props — `direction`,
  `align`, `gap`, `paddingX/Y`, `overflow`, `shrink`, `background`, `borderTop/Bottom`
  (`Toolbar.tsx:150-166`). `Toolbar.css` is therefore *authored*, not extracted, and the task must
  diff the rendered result against the Panel-produced one rather than against a stylesheet.

`Panel` leaves `Toolbar`, `Notification` and `Progress` in this epic — the consequence EPIC-054 C1-1
recorded in advance. After the C2 in-scope conversions, those three consumers are gone;
`Autocomplete` remains the one UIKit consumer and is a C3 consumer outside this epic. The
remaining Panel work therefore drains through C3, D, and E.

**C2-9 — The measured number (roadmap Rule 4): one click that opens a context menu.** `Menu` is the
highest-traffic overlay in the product — every context menu in the app goes through it — which makes
it the honest subject. DOM writes are counted with EPIC-053's `MutationObserver` method, over
**both** `[data-type="live-preview"]` and `#persephone-overlay-layer` with identical options, reset
point and interaction on both runs, because `Popover` portals out of the preview pane exactly as
`Tooltip` did (C1-8's trap).

**US-1005 takes the React baseline** — before any conversion lands, because it cannot be recovered
afterwards. **US-1006 takes the after-number**, the first point at which both `Popover` and `Menu`
are vanilla, and records both figures in this epic's Notes. Per Rule 4 the epic cannot close without
both.

Four secondary counts close alongside it:

| Count | Open | Target at close |
|---|---:|---:|
| `@emotion` importers in `uikit/` | 35 | 21 |
| `@floating-ui/react` importers in `uikit/` | 3 | 0 |
| `@floating-ui/react` importers, renderer-wide | 5 | 2 (both app-layer, Epics D and E) |
| `Panel` consumers inside `uikit/` | 3 | 1 after C2 (`Autocomplete` remains in C3) |

## Goals

- Convert the floating layer — `Popover`, `Menu`, `Dialog` — to vanilla behind unchanged
  React-facing signatures, so C3, C4 and Epic D inherit a vanilla overlay foundation.
- Retire `@floating-ui/react` from `uikit/` entirely, leaving only the two app-layer importers that
  Epics D and E convert.
- Prove the vanilla model lifecycle: shed the seven `effect()` calls and drive four models through
  `createComponentModelDriver`, which no epic has yet done.
- Replace the two remaining React-only composition idioms — `WithMenu`'s render prop and `Popover`'s
  conditional `null` — with attachment and subtree ownership, and record the pattern for Epics D
  and E.
- Convert the chrome and composite widgets, and finish `Panel`'s eviction from `uikit/`.
- Give `Minimap`, `ImageViewport` and `Progress` their first stories, before converting them.
- Produce Rule 4's measured number with a genuine React baseline.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-1005 | [`Popover` — vanilla floating root on `@floating-ui/dom`, and the Rule 4 React baseline](../tasks/US-1005-popover-vanilla-floating-root/README.md) | Implemented |
| US-1006 | [`Menu` and `WithMenu` — `openMenu` attachment, recursive submenus, and the Rule 4 after-number](../tasks/US-1006-menu-vanilla-recursive/README.md) | Implemented |
| US-1007 | [`Dialog` and `DialogContent` — focus trap and backdrop](../tasks/US-1007-dialog-vanilla-focus-trap/README.md) | Implemented |
| US-1008 | [`Notification`, `AlertItem`, and `AlertsBar` — vanilla root-mounted alerts](../tasks/US-1008-notification-vanilla-alerts/README.md) | Implemented |
| US-1009 | [`Progress` — `ProgressOverlay`, its first story, and `Panel`'s eviction](../tasks/US-1009-progress-vanilla-overlay/README.md) | Implemented |
| US-1010 | [`Toolbar`, `Splitter`, `Breadcrumb`, `CollapsiblePanelStack` — vanilla chrome](../tasks/US-1010-chrome-vanilla-conversions/README.md) | Implemented |
| US-1011 | `SplitButton`, `TagsInput`, `DateInput`, `CategoryList` | Planned |
| US-1012 | `Minimap` and `ImageViewport` — canvas views and their first stories | Planned |

Task documents are written before implementation, per
[CLAUDE.md](../../CLAUDE.md)'s task-creation workflow — this epic doc is the design, not the spec.
When each is created, its row and its dashboard entry become links to
`doc/tasks/US-XXX-short-name/README.md`.

### Ordering

Three constraints bind the epic; everything else is parallel.

**US-1005 first.** `Popover` is the floor: `Menu` renders it, and C3's dropdown family will need it
too. It also takes the Rule 4 React baseline, which stops being possible the moment `Popover` or
`Menu` converts.

**US-1005 → US-1006 → US-1011.** `Menu` renders `Popover`; `SplitButton` composes `Menu/WithMenu`.
US-1011's other three components (`TagsInput`, `DateInput`, `CategoryList`) depend only on C1 output
and could move earlier if `SplitButton` is split out.

**US-1007, US-1008, US-1009, US-1010 and US-1012 are independent** of each other and of the floating
chain. `Dialog` does not portal and does not use `Popover`; `Notification` and `Progress` are
root-mounted; `Splitter`, `Breadcrumb`, `CollapsiblePanelStack`, `Minimap` and `ImageViewport`
import nothing from `uikit/` beyond tokens.

**The slip item is US-1012.** `Minimap` (1 call site) and `ImageViewport` (3) are the
measurement-heavy canvas views, they are the two that need stories written first, and nothing in
C2, C3 or C4 depends on them. If the epic runs long, they are what defers — the way US-1003
(`Panel`) was C1's designated slip item.

### Verification

Every conversion task verifies the same way, and each task's acceptance criteria state it
explicitly:

- `npm run typecheck`, `npm run lint`, `git diff --check`;
- open the component's story in the Storybook editor and exercise every prop control;
- **capture `browser_snapshot` before and after the conversion and diff the `data-*` output** — the
  `data-name` contract ([ui-element-contract.md](../architecture/ui-element-contract.md)) is what
  makes the two DOM trees comparable, and C2-2 promises they are identical.

Four exceptions, all because the story is not the real exposure:

- **`Menu` needs an app-level pass.** Its story is one menu; its production surface is 15 `WithMenu`
  triggers plus every context menu in the app (`components/file-grid`, `file-list`, `git-tree`,
  `tree-provider`, `editors/browser`, `draw`, `image`, `notebook`, `rest-client`, `settings`,
  `ui/sidebar/MenuBar`, `ui/tabs/PageTab`). US-1006 smoke-tests submenus, the search header,
  keyboard navigation and Escape / outside-click across a representative set.
- **`Dialog` needs an app-level pass** over the 14 `ui/dialogs/` consumers, focused on the focus
  trap, focus restore and Escape.
- **`Notification` and `Progress` have no story to convert against** for `AlertsBar` /
  `ProgressOverlay` — they are root-mounted. US-1008 and US-1009 verify by triggering alerts and
  progress through `api/ui.ts` in the running app; US-1009 also writes the `Progress` story.
- **`Minimap` and `ImageViewport`** get their stories written in US-1012 *before* conversion, so the
  before / after snapshot diff is possible at all.

### Task notes

**US-1005 — `Popover`.** The epic's foundation task, per C2-3. Shed the two effects (C2-4 #1, #2);
replace `useFloating` / `useMergeRefs` / the deferred `setPositionReference` with `computePosition`
+ `autoUpdate` from `@floating-ui/dom`; build and dispose the floating subtree on the open
transition rather than hiding it; keep `data-type="popover"`, `data-placement`, `data-resizable`,
`data-resized`, `data-scroll` and the `scroll-container` class exactly as they are; `Popover.css` in
`@layer uikit`. State explicitly which node takes forwarded rest props, the caller's `ref` and
`data-name` — it is the floated root, not the view's logical root. Rewire `PathInputView` to compose
`PopoverView` as a child. **Take the Rule 4 React baseline first** (C2-9), before anything else in
this task changes.

**US-1006 — `Menu` and `WithMenu`.** Shed the three effects (C2-4 #3–#5); add
`uikit/Menu/attach-menu.ts` with `openMenu` (C2-5); convert `MenuView` with a recursive child
`MenuView` under a `SubtreeSwap` keyed on the submenu item (C2-6); move `WithMenu`'s `Placement`
import to `@floating-ui/dom`, which empties `@floating-ui/react` out of `uikit/`. `Menu` composes a
converted `Input` for its search header, so this is the first C2 view composing a C1 view — use
`this.child(new InputView(...))` per C1-10's convention, not `mountReact`. **Takes the Rule 4
after-number** and records both figures in the Notes.

**US-1007 — `Dialog` and `DialogContent`.** Two Emotion files; `pulse` becomes a `@keyframes` in
`Dialog.css`; the focus trap (`Dialog.tsx:98-140`) becomes explicit view code — `getFocusable` is
already a plain DOM function and carries over unchanged. `DialogContent` composes `IconButton`
(converted in C1) and calls `renderIcon` (`:111`), which becomes `createIconElement`. Its
`style={sizing}` (`:106`) becomes an explicit style write that **clears as well as sets**. `Dialog`
does not portal; keep it that way — the dialog host owns placement.

**US-1008 — `Notification`.** Three files. `AlertItem` is the leaf and declares a `ref` that must
survive (C1-10); `Notification` calls `renderIcon` for the severity icon (`:136`) and composes
`IconButton`, `Panel` and `Text` — `Panel` goes, per C2-8; `AlertsBar` is a `KeyedList` over
`alertsBarModel.state.alerts` with the alert-height measurement kept in the view. `AlertsBar` keeps
its React face so `index.tsx` does not change (C2-7). The existing `@keyframes
notification-slide-in` string moves into `Notification.css` unchanged.

**US-1009 — `Progress`.** `ProgressOverlay` renders one of three modes from a `TGlobalState`
(`progressState`) and nothing else — a `SubtreeSwap` over notification / progress / locked. Drops
`Panel`; `Spinner` stays (converted in C1); `Text` becomes semantic classes per C1-1. `PillSlot`'s
prop-interpolated Emotion becomes an explicit `style.top` write (C2-8). **Write the `Progress` story
first** — it is the only verification surface, and `createProgress` / `showProgress` /
`notifyProgress` / `addScreenLock` are reached from `api/ui.ts`, so the story has to drive them.

**US-1010 — `Toolbar`, `Splitter`, `Breadcrumb`, `CollapsiblePanelStack`.** The chrome group: no
models, no floating, four independent conversions. Three specifics:

- **`Toolbar.css` is authored, not extracted** (C2-8), and its roving-tabindex hook has a real trap.
  `useRovingTabIndex`'s `useLayoutEffect` has **no dependency array** (`Toolbar.tsx:66`), so it
  re-collects tab stops on *every* render — including renders caused by a parent adding or removing
  a toolbar button. A vanilla `onUpdate` fires only when the Toolbar's own props change, and children
  arrive through a slot, so the stops can go stale. The task must pick an explicit trigger — a
  `MutationObserver` on `root.children`, or collecting at `focusin` / keydown time — and say which.
- **`Splitter` is the epic's highest-traffic component** (19 call sites) and is a pointer-drag widget
  with two `useRef`s; the drag origin is view state, not model state.
- **`CollapsiblePanelStack` has the most `ReactNode` props in scope (6)** and the
  `style={isOpen ? undefined : { display: "none" }}` site (`:240`) — the exact
  clear-as-well-as-set trap EPIC-054 Concern 1 named.

**US-1011 — `SplitButton`, `TagsInput`, `DateInput`, `CategoryList`.** Composites over already-
converted parts. `DateInput` is 28 lines of pure composition over `Input` and should be the cheapest
conversion in the programme. `TagsInput` composes `PathInput` (Epic B) and `Tag` (C1).
`SplitButton` composes `Button`, `IconButton` and `Menu/WithMenu` — so it lands after US-1006 and
should use `openMenu` rather than the render-prop face. `CategoryList` consumes
`shared/selection-style` and moves to the shared `selection-style.css` from US-996, and calls
`renderIcon` twice.

**US-1012 — `Minimap` and `ImageViewport`.** The two canvas / measurement views, and the epic's slip
item. Both are `TComponentModel`s with one prop-deps effect each (C2-4 #6, #7); `ImageViewport`'s
returns a cleanup, so it exercises the disposal registry. `ImageViewport` also owns
`image-raster.ts`, which is already framework-free and does not move. Write both stories before
converting — neither has one, and without them there is no before / after DOM diff.

## Concerns / Open questions

1. **`Menu` is the riskiest single conversion in the programme so far.** Every context menu in the
   application goes through it, it has no automated test, and its failure modes are silent: a menu
   that closes on its own submenu click, a keyboard path that stops working, a listener that outlives
   its menu. The `outsideClickIgnoreSelector='[data-type="menu"]'` coupling (C2-2) and the recursive
   child ownership (C2-6) are the two places that break. US-1006's app-level pass is not optional,
   and it is the one place in this epic where verification cost is comparable to conversion cost.

2. **C1's React-compat helpers assume the component has one root; three C2 components do not.**
   `applyRestProps`, `bindRef` and `toPublicEvent` were extracted from `PathInputView`, which has a
   single root element. `Popover` has a logical root and a *portalled floating root*; `Dialog` has a
   backdrop root and a content root; `WithMenu` has no root of its own at all. US-1005 is the first
   to hit this and should record whether the helpers needed extending or only careful targeting — if
   they need extending, that lands once, in US-1005, not three times.

3. **Effect-shedding is a refactor whose cost is not in its diff.** Six of the seven sites are
   prop-deps replacements, which read as mechanical but change *when* work happens: an effect ran
   during the prop pump after a deps comparison, and a `setProps` branch runs on every pump unless it
   guards. Rule 9 already requires the identity guard; the risk is that a shed effect starts firing
   on every update and nobody notices, because the consequence is idempotent. Each shedding step
   should name the guard it added.

4. **The `overlayRegistry` gap is pre-existing and C2 should not silently close it.** Only
   `showPopupMenu` registers with it today; `Popover`, `Menu` and `Dialog` do not, so tooltips are
   not suppressed under a UIKit-level popover or dialog. Registering them would be a behaviour
   *improvement* and therefore a C2-2 violation. Recommendation: leave it alone and file it in the
   backlog — but the conversion tasks are exactly where someone "fixes" it by accident.

5. **`Notification` and `Progress` have no story and no external call site, which makes them
   invisible to both verification routes.** US-1008 and US-1009 fall back to driving `api/ui.ts` in
   the running app. That is weaker than the rest of the epic's verification and worth stating in the
   task rather than discovering at review.

6. **The roadmap's C3 estimate is now wrong in the other direction.** C2-1 moves 1,701 lines into
   C3, which the roadmap sizes at "4 components / ~5,938 lines". C3 is now 7 components and, on the
   same measurement basis, larger than the split anticipated. **C3's scoping must re-measure** rather
   than inherit — and whether the dropdown family deserves its own epic is worth asking when C3
   opens, not now.

7. **`@floating-ui/react` still outlives Epic C**, as EPIC-054 Concern 4 predicted. C2 empties it out
   of `uikit/`, but `editors/browser/BrowserTabsPanel.tsx` and
   `ui/dialogs/poppers/showPopupMenu.tsx` keep it until Epics E and D. The roadmap's "third-party
   coupling" table has been corrected to say so.

## Notes

### 2026-08-20

- Epic opened as C2 of the roadmap's four-way Epic C split. The next free epic number is
  **EPIC-056**; the next free task number is **US-1013**.
- **C2-1 was decided at open** *(user decision)*: `Select`, `MultiSelect` and `Autocomplete` move to
  C3, because all three render `ListBox` / `MultiListBox` and the roadmap's "C3 blocked on C2"
  ordering could not hold for them. C2 is 15 components / 4,104 lines; C3 becomes 7 components. The
  alternatives — hosting the React `ListBox` through `fillSlot`, or pulling `ListBox` and
  `RenderGrid` down into C2 — were rejected as double-wiring and as merging most of C3 respectively.
- **C2 runs as one epic** *(user decision)*, ~8 tasks, rather than splitting the floating layer from
  the standalone widgets. The floating chain is the only real dependency, and the independent
  components can be deferred individually if the epic runs long (US-1012 is the designated slip
  item).
- **C2 is the first epic to use Epic B's model driver.** C1 used none of it — zero models, zero
  effects. C2 has four models and seven effects, and the driver's own guard makes shedding a
  precondition rather than a preference (C2-4).
- **The path-based dependency scan undercounts every barrel-exported component.** The first pass
  reported `Minimap` with zero consumers; it has one, imported through `uikit/index.ts`. Every count
  in this document is identifier-based with the component's own folder and stories excluded
  explicitly. This is the same class of measurement error EPIC-054's audit found, in a new place.
- **US-1005's Popover shell hook was corrected before US-1006.** Residual `data-type="menu"` can
  override the Popover addressing marker, so the shell now uses the non-overridable `popover-shell`
  class while `data-type` remains the submenu outside-click and automation contract.

### 2026-08-21

- **Selector-depth guard for remaining C2 conversions.** Converting a React subtree can add
  layout-transparent DOM hosts while preserving visual boxes. Before translating each component's
  Emotion rules, scan for `>`, `:empty`, `:nth-child`, `+`, and `~` selectors and state what each
  selector matches after the new host depth is present. C2 has already encountered this class in
  Panel's `:empty` rule, Popover's overridable marker (fixed in `4afe8bac`), and Dialog's direct
  child selectors; `CollapsiblePanelStack.tsx:79,85,88,115` is the next named case for US-1010.
