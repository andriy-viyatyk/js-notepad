# EPIC-051: De-React Epic P — Preparation (React-side)

## Status

**Status:** Active
**Created:** 2026-08-16

## Overview

The first epic of the [de-React roadmap](../de-react.md) (§7, "Epic P"). It writes **no vanilla
code at all**: every task is an ordinary React refactor that leaves the app on React, is verifiable
the same day, and shrinks the surface every later epic has to convert.

The property worth holding on to is that **every item is an improvement on its own terms**.
Framework-neutral component APIs, state in models instead of views, imperative handles replaced by
model methods, and one portal host are all things this codebase should have regardless of which
rendering library it uses. Scheduling this epic is therefore not a commitment to the rest of the
roadmap — it is the cheapest way to buy the option.

## The surface, measured

Counted on the branch at epic open (`src/renderer`, excluding `*.story.tsx` where noted):

| Item | Measure | In scope here |
|---|---|---|
| `ReactNode` / `ReactElement` props | 109 files — 46 `uikit`, 46 `editors`, 9 `components`, 6 `ui`, 1 `theme`, 1 `core` | **63** (all but `editors`, `theme`, `core` — see D1) |
| Local `useState` declarations | 201 declarations across 83 non-story `.tsx` files | all |
| `useImperativeHandle` | 9 files | all |
| `forwardRef` | 33 files — 27 `uikit`, 3 `editors`, 1 each `components` / `ui` / `theme` | all |
| `createContext` | 5 files | all |
| `createPortal` | 12 call sites in 10 files — 5 to `document.body`, 5 to a caller-supplied node | the 5 body portals (D6) |
| `useEffect` | 175 call sites — 55 `editors`, 21 `uikit`, 11 `ui`, 6 `components` files | all, with judgement (D8) |
| Emotion imports | 79 files | inventory only |

**The epic's measured number** (roadmap Rule 4): this table, re-counted at close. `ReactNode` props
outside `editors/` → 0. Imperative handles → 0. `createContext` → 0. Body portals → 1 shared host.

## Goals

- No component in `uikit/`, `ui/` or `components/` accepts a React type in its public props.
- No view holds state that a model should hold, so a later conversion is a pure rendering
  translation with nothing to excavate first.
- No caller commands a view through a React ref; commands go through the model or `ComponentQueue`,
  both of which are already React-free.
- One portal host, so React and vanilla eventually target the same layer element.
- The app stays on React throughout, ships after every task, and is no slower.

## Decisions

**D1 — Editors are out of scope for the slot work.** The 46 `editors/` files that declare
`ReactNode` props are internal to lazily-imported editors that nothing outside the editor consumes.
Converting them now would be redone anyway in Epic E, where each editor converts as a unit. The 63
files in `uikit/`, `ui/` and `components/` are exactly the surface Epics C and D must cross, and
those get done here. (User decision, 2026-08-16.)

`theme/icons.tsx` and `core/state/view.tsx` are also excluded: the first is the icon set itself
(Epic D's job), the second is the `Views` registry whose vanilla form is Epic B's job.

**D2 — Icons become names, backed by a registry that maps to today's React components.** The 114
icon components in `theme/icons.tsx` are built by `createIcon(size)(<path/>)`; a registry keyed by
kebab-case name (`"close"`, `"more-vert"`) mapping to the existing `SvgIconComponent` is a pure
addition — no icon is rewritten. The registry record is the single source of truth and
`IconName` is derived from its keys. In Epic D the registry's **values** become SVG markup while
its **keys and every call site stay untouched**. That is what makes the name form worth the
up-front task: it is the one representation that survives both migrations unchanged, and it is
serializable, so scripts and JSON descriptors can name an icon. `language-icons.tsx`, the
prop-taking components/icons resolvers, and the icon factories/types are excluded. (User decision,
2026-08-16.)

**D3 — Slot props keep a union with the React type until the last React caller is gone.**
`icon?: IconRef` where `type IconRef = IconName | ReactNode`. Roadmap Rule 2 preserves the
React-facing signature, so existing icon call sites keep compiling and get migrated to names
incrementally rather than in one commit. The `| ReactNode` arm is deleted in Epic C or F, not here.

**D4 — `children` and subtree slots are not converted in Epic P.** Container composition is the
boundary case that `mountVanilla` / `mountReact` exist to solve (roadmap §5, Epic B). Changing
`children` or its disguises to a callback now would be building half of that adapter in the wrong
epic. Icon props use `IconRef`; text-bearing props use plain strings (with `SlotText` as a
documentation alias). Subtree props — `trailing`, `startSlot`, `endSlot`, `headerButtons`,
`buttons`, `header`, `headerAction`, and `extraElement` — are deferred to Epic C.

**D5 — Render callbacks stay callbacks during Epic P.** `renderItem`, `getTooltip`,
`TCellFormater`, `RenderFlexCellFunc` and friends remain caller-supplied React callbacks in this
epic. Their eventual neutral return types depend on whether each callback emits text or a subtree,
so they are resolved with the owning component during US-966 through US-969 or Epic C rather than
through a generic callback protocol.

**D6 — Only the five `document.body` portals get a host.** `Popover`, `Tooltip`, `GraphTooltip`,
`ColumnsOptions` and `CsvOptions` portal to `document.body` and want a shared overlay layer. The
other five (`PageManager`, `AppPageManager`, `CategoryView`'s `toolbarPortalRef`, `NotebookBody`'s
`overlayRef`, `SideBarPanelHeader`) portal into a node the caller already owns — that is already
"appendChild to a given element" and needs no host. They are left alone.

**D7 — UIKit Rule 2's allowed transient state stays in the view.** `isHovered`, `isFocused`,
uncontrolled `isOpen` and a gesture anchor are visual-only and belong to whichever object owns the
DOM. Lifting them into models would be churn that a vanilla view immediately reverses.

**D8 — Effects that measure or mutate the DOM stay in the view.** `TComponentModel.effect()` is
React-free and is the right home for subscriptions, async loads and model-to-model wiring. An effect
that reads `getBoundingClientRect` or focuses an element is view work by definition and moving it
would make the model DOM-aware — the opposite of the epic's point.

**D9 — `useCallback` and `useMemo` are explicitly not prep work.** 422 and 118 call sites; they
exist only to tame reconciliation and disappear during conversion. No task schedules them
(roadmap §7).

**D10 — `*.story.tsx` files are excluded from the `useState` and `useEffect` tasks.** A story is a
harness for a component, not a component. 118 of the 201 `useState` declarations are in stories.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-965](../tasks/US-965-icon-registry-slots/README.md) | Icon name registry + neutral slot types (foundation) | Implemented — pending review |
| [US-966](../tasks/US-966-neutral-slots-primitives/README.md) | Neutral slots: UIKit primitives and inputs | Implemented - pending review |
| [US-967](../tasks/US-967-neutral-slots-list-data/README.md) | Neutral slots: UIKit list and data components | Active |
| [US-968](../tasks/US-968-neutral-slots-containers-floating/README.md) | Neutral slots: UIKit containers and floating layer | Planned |
| [US-969](../tasks/US-969-neutral-slots-shell/README.md) | Neutral slots: `ui/` and `components/` | Implemented — pending review |
| [US-970](../tasks/US-970-lift-state-models/README.md) | Lift local `useState` into models | Implemented — pending review |
| [US-976](../tasks/US-976-below-threshold-state/README.md) | Below-threshold local state | Planned |
| US-971 | Imperative handles → model methods / `ComponentQueue` | Planned |
| US-972 | React context → explicit model references | Planned |
| US-973 | Route `document.body` portals through one host | Planned |
| US-974 | Move logic from `useEffect` into `TComponentModel.effect()` | Planned |
| US-975 | Emotion usage inventory | Planned |

### Ordering

**US-965 is strictly first** — US-966 through US-969 all consume the types and registry it
introduces. Those four then run leaf-first in the listed order, because a list component's slot
props are satisfied by the primitives converted before it, and the shell (US-969) is satisfied by
both.

The remaining six are independent of each other and of the slot chain, and can be scheduled
whenever convenient. Two soft preferences: **US-970 before US-974**, since both sweep the same
files and lifting state first often removes the effect that synchronized it; and **US-975 early**,
because it is cheap to produce and de-risks Epic A's estimate before Epic A is scheduled.

### Task notes

**US-965 — Icon name registry + neutral slot types.** Add `theme/icon-registry.ts`
(single-source-of-truth name→`SvgIconComponent` record, derived `IconName`, and `getIcon(name)`) and
`uikit/shared/slots.ts` (`IconRef`, `SlotText`, and `renderIcon(icon, props?)`). Adopt in
`IconButton` only, as the proof that the shape works. Unknown string names warn in development and
render nothing; subtree composition waits for the mount-adapter contract. Everything else in the
epic builds on this file.

**US-966 — UIKit primitives and inputs.** `Button` (`title`, `icon`), `IconButton`, `Input`
(`startSlot`, `endSlot`), `RadioGroup` (`label`, `icon`), `Notification` (its `SEVERITY_ICON` map),
`SplitButton`, `Tag`, `Checkbox`.

**US-967 — UIKit list and data components.** `ListBox` (`ListItem`'s `icon` / `label` / `tooltip` /
`trailing`, `SectionItem.label`, and `types.ts`'s `emptyMessage` / `getTooltip` / `renderItem`),
`MultiListBox` (`selectAllLabel`, `emptyMessage`), `MultiSelectModel`, `AutocompleteModel`
(`header`, `headerAction`, `emptyMessage`, `startSlot`, `endSlot`), `CategoryList.rootLabel`,
`Breadcrumb` (`rootLabel`, `separatorContent`), `Tree`, `SelectableRow`.

**US-968 — UIKit containers and floating layer.** `DialogContent` (`title`, `icon`,
`headerButtons`), `CollapsiblePanelStack` (`title`, `icon`, `buttons`), `PopoverModel`,
`WithMenu`'s render prop, `RenderGridModel` (`extraElement`, `extraElementTop`) and
`AVGridModel.extraElement`. Per D4, the `children` props on `Dialog`, `Panel` and `Popover` are
left as they are.

**US-969 — Shell.** The 15 files in `ui/` and `components/` that declare React types:
`EditorErrorBoundary`, `LazySecondaryView`, `secondary-view-registry`, `SideBarPanelHeader`,
`FolderItem`, `tools-editors-registry`, `FileGrid`, `FileList`, `git-refs-tree`, `EditorIcon`,
`AppPageManager`, `PageManager`, `CategoryView`, `CategoryViewModel`, `TreeProviderViewModel`.
Note that three of those are `Model`/registry files holding React types in *data* — the highest-value
ones to neutralize.

**US-970 — Lift `useState` into models.** The task is now bounded to the seven files with
`>=4` declarations (52 declarations): `graph/GraphDetailPanel.tsx` (17),
`graph/GraphLegendPanel.tsx` (8), `notebook/ExpandedNoteView.tsx` (6), `graph/GraphBody.tsx`
(6), `env-vars/EnvVarsBody.tsx` (6), `mneme-config/RootsPanel.tsx` (5), and
`markdown/CodeBlock.tsx` (4). D7/D8 govern what stays; the below-threshold tail is US-976.

The detailed [US-970 task document](../tasks/US-970-lift-state-models/README.md) remeasures the
current branch at 174 declarations across 84 non-story `.tsx` files, limits the task to the seven
`>=4` files, and hands the below-threshold tail to [US-976](../tasks/US-976-below-threshold-state/README.md).

**US-971 — Imperative handles.** 9 `useImperativeHandle` files (`AVGrid`, `Tree`, `ListBox`,
`RenderGrid`, `Textarea`, `ImageViewport`, `FileList`, `LinksList`, `MarkdownBlock`) plus the 33
`forwardRef` files. An imperative handle is a model method written in the wrong place: the caller
wants to command the view. Moved onto the model, or onto `ComponentQueue` when it is a one-shot
command like scroll-to-row or focus, it survives the migration untouched. `forwardRef` used purely
to pass a DOM ref through a wrapper is not a handle and only needs the React 19 ref-as-prop form.

**US-972 — Context.** `EditorConfigContext`, `LogViewContext`, `AVGrid/filters/useFilters`,
`AVGrid/useAVGridContext`, `uikit/shared/highlight`. Each becomes a model passed down explicitly or
resolved from the editor. Small, but each one blocks whichever component depends on it.

**US-973 — Portal host.** Introduce the shared overlay-layer helper and adopt it in the five body
portals (D6). It should sit beside `uikit/shared/overlayRegistry.ts`, which already tracks overlay
roots for tooltip suppression and is the natural owner of the layer element.

**US-974 — Effects into the model.** 175 call sites. `effect(callback, depsFactory)` already exists
and is React-free, so each move is same-day and behaviour-neutral. D8 governs what stays.

**US-975 — Emotion inventory.** Split the 79 Emotion files into "static style object" (mechanical
to convert) and "dynamic, prop-driven" (needs roadmap open decision #4). Output is a table in
`doc/`, not code.

## Notes

### 2026-08-16

- Epic opened from the roadmap. IDs assigned: EPIC-051, tasks US-965 … US-975.
- Roadmap Rule 5 ("no new React") does **not** apply yet — it starts with Epic A. New UIKit
  components written during this epic are ordinary React components that follow D2–D5.
- None of the roadmap's six open decisions block any task here. That is deliberate: Epic P was
  designed to be schedulable before the shape of the migration is settled.
- Per the epic deferred-review model, `/review`, `/document` and `/userdoc` run once at epic close,
  not per task.
