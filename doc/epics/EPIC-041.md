# EPIC-041: Unified Focused/Unfocused List Selection

## Status

**Status:** Active
**Created:** 2026-07-13
**Completed:**

## Overview

The Explorer file-tree has a two-state selection that the user likes: when the list is **not
focused** a selected/hovered row shows a subtle **gray** background; when the list **is focused**
the selected row shows a **dark-blue** background with a **blue border** (default dark theme).
This behavior currently lives *only* inside the `Tree` primitive and is reachable *only* when a
consumer opts into `keyboardNav`. Every other selectable list in the app hand-rolls its own
selection styling with a different token and **no focused-vs-unfocused distinction at all**.

This epic extracts the Explorer selection behavior into a **single shared, focus-aware selection
style** and adopts it across the app's selectable lists so they all match: gray when the list is
blurred, dark-blue + blue border when the list is focused.

## Goals

- **One source of truth.** Extract the focused/unfocused selection visuals (currently hardcoded
  in `Tree.tsx`) into a shared style contract that `Tree`, `ListBox`/`ListItem`, and bespoke
  row renderers all consume, so they cannot drift apart again.
- **Focus-aware everywhere.** Every targeted list gains the two-state behavior — unfocused
  gray (`background.light` selected / `background.message` hover), focused
  `background.treeSelection` + `1px solid border.active` outline.
- **Reuse existing tokens.** The design tokens already exist in `color.ts`
  (`background.treeSelection` was literally added for "focused list/tree selected-row
  background" and is currently used only by `Tree`). No new tokens are expected.
- **No regression to Explorer.** The Explorer tree is the reference; its look and behavior must
  be pixel-identical after the `Tree` refactor.

## Target surfaces (the user's list)

| # | Surface | File(s) | Primitive today | Selected bg today | Focus state today |
|---|---------|---------|-----------------|-------------------|-------------------|
| — | **Explorer tree (REFERENCE)** | `editors/explorer/ExplorerSecondaryView.tsx` → `components/tree-provider/TreeProviderView.tsx` → `uikit/Tree/Tree.tsx` + `TreeItem.tsx` | `Tree` (`keyboardNav` on) | gray `background.light` blurred → blue `background.treeSelection` + `border.active` focused | **Yes** (the target) |
| 1 | App menu — left panel list | `ui/sidebar/MenuBar.tsx:389-404,511-523` → `ui/sidebar/FolderItem.tsx:24-30,59-61` | `ListBox` + bespoke `FolderItem` row | `background.selection` (loud accent) | No |
| 2 | Links editor — Tags panel | `editors/link-editor/panels/LinkTagsPanel.tsx:28-34` → `uikit/CategoryList/CategoryList.tsx:66-72` | shared `CategoryList` | **none** — text-only `misc.blue` | No |
| 3 | Links editor — Hostnames panel | `editors/link-editor/panels/LinkHostnamesPanel.tsx:28-37` → same `CategoryList` | shared `CategoryList` | **none** — text-only `misc.blue` | No |
| 4 | Rest Client — request tree | `editors/rest-client/panels/RestPanelSecondaryView.tsx:54` → `RestClientShared.tsx:344-606` → `uikit/Tree/TreeItem.tsx` | `Tree` (`keyboardNav` **off**) | gray `background.light` | No (keyboardNav off) |
| 5 | Notebook — Categories panel | `editors/notebook/panels/NotebookCategoriesSecondaryView.tsx:64-75` + `category-tree.tsx` | `Tree` (`keyboardNav` **off**) | gray `background.light` | No (keyboardNav off) |
| 6 | Notebook — Tags panel | `editors/notebook/panels/NotebookTagsSecondaryView.tsx` → `TagsListView.tsx:180-256,193-194,260-268` | `ListBox` + custom `renderItem` | inline `background.selection` | No |
| 7 | ToDo — Todo panel | `editors/todo/components/TodoListPanel.tsx:51-79,242,292` (+ `panels/TodoSecondaryView.tsx`) | bespoke `RowShell` + `.map` | `background.light` + `misc.blue` text | No |
| 8 | MCP Inspector — Tools panel | `editors/mcp-inspector/ToolsPanel.tsx:107-116` | `ListBox` (default rows, `selectionStyle="accent"`) | `background.selection` | No |
| 9 | MCP Inspector — Resources panel | `editors/mcp-inspector/ResourcesPanel.tsx:53-72,84-103` | bespoke `Panel` per row + `.map` | `background.light` (Panel `background="light"`) | No |
| 10 | Storybook — left panel | `editors/storybook/ComponentBrowser.tsx:39-47` (+ `StorybookEditorView.tsx`) | `ListBox` (default rows, `selectionStyle="accent"`) | `background.selection` | No |
| 11 | Links editor — main view, "List" mode | `editors/link-editor/LinkBody.tsx:148-149` → `LinkItemList.tsx:146` → `LinksList.tsx:116-134,209,230-240` | `RenderGrid` + `ListItem` (`accent`) | `background.selection` | No |
| 12 | Links editor — pinned panel | `editors/link-editor/PinnedLinksPanel.tsx:31-152,101-121,266-276` | `.map` + `ListItem` (`accent`) | `background.selection` | No |

## Background — how the reference works (verified)

### The mechanism (CSS `:focus-within`, gated by a container attribute)

There is **no JS focus state, no `data-focused` prop**. The Explorer tree's two-state selection is:

1. `uikit/Tree/TreeItem.tsx:96-108` paints the **base (unfocused)** row:
   ```ts
   "&[data-active]:not([data-selected])": { backgroundColor: color.background.message }, // hover
   "&[data-selected]":                     { backgroundColor: color.background.light },   // selected (gray)
   ```
2. `uikit/Tree/Tree.tsx:42-51` **overrides** it when the container is focused — but only for trees
   that opted into `keyboardNav`:
   ```ts
   '&[data-keyboard-nav]:focus-within [data-type="tree-item"][data-selected]': {
       backgroundColor: color.background.treeSelection,
       color: color.text.selection,
       outline: `1px solid ${color.border.active}`,
       outlineOffset: -1,
   },
   '&[data-keyboard-nav]:focus-within [data-type="tree-item"][data-active]': {
       outline: `1px solid ${color.border.active}`,
       outlineOffset: -1,
   },
   ```
3. `Tree.tsx:314` sets `data-keyboard-nav={keyboardNav || undefined}` and `:316` sets
   `tabIndex={keyboardNav ? 0 : -1}` on the root `<div data-type="tree">`, so the container is
   focusable and `:focus-within` can match. `TreeProviderView.tsx:351` passes `keyboardNav`, which
   is why Explorer lights up and the other Tree consumers (Rest Client, Notebook Categories) do
   not.

**Consequence:** today the focus-aware styling is *bundled with* keyboard navigation (arrow keys).
A consumer cannot get the focus styling without also enabling arrow-key navigation. The foundation
task should **decouple** these (see C2).

### The tokens (already exist — `src/renderer/theme/color.ts`)

| Role | Token | CSS var | Dark value |
|------|-------|---------|-----------|
| Unfocused selected bg (gray) | `color.background.light` | `--color-bg-light` | `#313131` |
| Unfocused hover/active bg (gray) | `color.background.message` | `--color-bg-message` | `#313131` |
| **Focused selected bg (blue)** | `color.background.treeSelection` | `--color-bg-tree-selection` | `#04395e` |
| **Focused selection border (blue)** | `color.border.active` | `--color-border-active` | `#007acc` |
| Focused selected text | `color.text.selection` | `--color-text-selection` | `#ffffff` |
| Loud accent bg (current non-Explorer default) | `color.background.selection` | `--color-bg-selection` | `#0078d4` |

`background.treeSelection` is defined per-theme in all 10 themes (`src/renderer/theme/themes/`),
so the focused look is already theme-correct. No new tokens are expected.

### The three primitives and how selection differs

- **`Tree` / `TreeItem`** (`uikit/Tree/`) — the only one with focus-awareness (above), gated on
  `keyboardNav`. Consumers: Explorer (#—), Rest Client tree (#4), Notebook Categories (#5).
- **`ListBox` / `ListItem`** (`uikit/ListBox/`) — `ListItem.tsx:85-95`: `selectionStyle="accent"`
  → `background.selection`; `variant="browse"` hover → `background.message`; `variant="select"`
  hover → `background.selection`. **No `:focus-within` rule at all.** Consumers using default
  rows: MCP Tools (#8), Storybook (#10). Consumers using `ListItem` outside `ListBox`: Link
  list-mode (#11, in `RenderGrid`), Link pinned (#12, in a `.map`). Consumers that wrap `ListBox`
  but replace the row via `renderItem` (bypassing `ListItem` CSS): App menu `FolderItem` (#1),
  Notebook Tags `TagsListView` (#6).
- **Bespoke `.map` rows** — no shared primitive: ToDo `RowShell` (#7), MCP Resources per-row
  `Panel` (#9), Links `CategoryList` (#2, #3 — text-only selection, no background today).

(`AVGrid` re-implements its own focus-within selection with the `color.grid.selectionColor.*`
family; it is **out of scope** for this epic — no targeted surface uses it.)

## Architecture — target design

1. **Shared selection-style fragment (US-829).** Create one shared Emotion `css` fragment / data-
   attribute contract — proposed `src/renderer/uikit/shared/selection-style.ts` — that encodes the
   full behavior in one place:
   - a **container** marker (proposed attribute `data-focus-selection`, independent of
     `keyboardNav`) plus a focusable container (`tabIndex=0` when the row set is non-empty);
   - **row** rules: `[data-selected]` → `background.light`; `[data-active]:not([data-selected])`
     → `background.message`; under `[data-focus-selection]:focus-within`, `[data-selected]` →
     `background.treeSelection` + `color.text.selection` + `1px solid border.active` (offset -1),
     and `[data-active]` → the same outline.

   Then:
   - **`Tree`/`TreeItem`** are refactored to consume the shared fragment with **no visual change**
     (Explorer is the regression guard). `data-keyboard-nav` continues to imply focus-selection
     for back-compat, but the styling is expressed through the shared fragment.
   - **`ListItem`** gains a focus-aware selection mode (proposed `selectionStyle="focus"`), and
     **`ListBox`** exposes an opt-in (proposed `focusSelection` prop) that sets the container
     `data-focus-selection` + makes the list focusable, so any `ListBox` consumer gets the
     Explorer look by flipping one prop.
   - For `ListItem` used **outside** `ListBox` (#11, #12), the fragment is applied via the same
     `selectionStyle="focus"` and the surrounding container is made focusable at the call site.

2. **Shared-primitive consumers — prop flips (US-830).** Sites already on a shared primitive only
   need to opt in:
   - Tree: Rest Client request tree (#4), Notebook Categories (#5) — enable focus-selection.
   - ListBox / ListItem: MCP Tools (#8), Storybook (#10), Link list-mode (#11), Link pinned (#12)
     — switch to the focus-aware selection style + ensure the container is focusable.

3. **Bespoke-row retrofits (US-831).** Rows that hand-roll selection adopt the shared fragment /
   data-attributes and a focusable container:
   - App menu `FolderItem` (#1), Notebook Tags `TagsListView` `renderItem` (#6),
     ToDo `RowShell` (#7), MCP Resources per-row `Panel` (#9),
     Links `CategoryList` Tags + Hostnames (#2, #3 — gains a real focus-aware **background**,
     replacing today's text-only blue).

## Linked Tasks (in implementation order)

| # | Task | Title | Depends on | Status |
|---|------|-------|-----------|--------|
| 1 | [US-829](../tasks/US-829-shared-selection-style/README.md) | Shared focus-aware selection style — extract the Explorer/`Tree` two-state selection into one shared fragment (`uikit/shared/selection-style.ts`); refactor `Tree`/`TreeItem` onto it with **zero visual change**; add focus-aware selection to `ListItem` (`selectionStyle="focus"`) + a `Tree` `focusSelection` opt-in; decouple focus-styling from `keyboardNav`; confirm tokens (no new ones) | — | Implemented — pending visual verification |
| 2 | [US-830](../tasks/US-830-shared-primitive-consumers/README.md) | Shared-primitive consumers — enable focus-selection on the Tree consumers (Rest Client tree #4, Notebook Categories #5) and switch the ListBox/`ListItem` consumers (MCP Tools #8, Storybook #10, Link list-mode #11, Link pinned #12) to the focus-aware style; wire each container to be focusable | US-829 | Implemented — pending visual verification |
| 3 | US-831 | Bespoke-row retrofits — apply the shared contract to the hand-rolled rows: App menu `FolderItem` #1, Notebook Tags `TagsListView` #6, ToDo `RowShell` #7, MCP Resources `Panel` rows #9, Links `CategoryList` Tags+Hostnames #2/#3 (adds a focus-aware background) | US-829 | Planned |

### Order rationale
- US-829 is the pure foundation — no site changes to user-visible lists yet, but it must not
  regress Explorer. Everything else depends on it.
- US-830 is low-risk prop flips on already-shared primitives once the foundation lands.
- US-831 is the bulk of the manual work (five hand-rolled row renderers), split out because each
  needs individual retrofitting and visual verification.

## Visual verification (screens to check after each task)

For every screen below, verify the same four states unless noted:
(a) **unfocused-selected** = subtle gray (`background.light`); (b) **focused-selected** = dark-blue
(`background.treeSelection`) + blue border (`border.active`); (c) **hover** an unselected row =
gray (`background.message`); (d) clicking away / focusing another widget flips a selected row from
blue back to gray. "Focused" means the list itself holds focus (click into it or Tab to it).

### US-829 — foundation (regression guard)
The only user-visible surface that changes is the reference; it must **not** change.
- [ ] **Explorer panel** (sidebar → Explorer file tree) — all four states above **pixel-identical
  to before**, plus drag-a-file (`data-dragging` dimming) and drop-target highlight
  (`data-drop-active`) unchanged, and arrow-key navigation still works.
- [ ] Smoke-check that a Tree consumer and a ListBox consumer still render selection at all
  (e.g. **Rest Client request tree** and **MCP Inspector → Tools**) — full behavior is verified in
  US-830.

### US-830 — shared-primitive consumers
- [ ] **Rest Client — request tree** (open a `.rest.json` collection → left "Requests" panel).
- [ ] **Notebook — Categories panel** (open a notebook → Categories secondary view).
- [ ] **MCP Inspector — Tools panel** (open MCP Inspector → left Tools list).
- [ ] **Storybook — left panel** (open Storybook → component list on the left).
- [ ] **Links editor — main view in "List" mode** (open a `.links` file → switch view mode to
  "List" → select a link row in the main area).
- [ ] **Links editor — pinned panel** (Links editor → the pinned-links panel → select a pinned row).

### US-831 — bespoke-row retrofits
- [ ] **App menu — left panel list** (open the App menu → the folder list in the left panel).
      *Note (C3): this list is loud-accent today and should become gray-when-unfocused.*
- [ ] **Notebook — Tags panel** (notebook → Tags secondary view).
- [ ] **ToDo — Todo panel** (open a ToDo editor → the Todo list / lists+tags panel).
- [ ] **MCP Inspector — Resources panel** (MCP Inspector → left Resources list, incl. resource
      templates).
- [ ] **Links editor — Tags panel** (Links editor → Tags secondary view).
      *Note (C4): text-only today → should gain a selected background.*
- [ ] **Links editor — Hostnames panel** (Links editor → Hostnames secondary view).
      *Note (C4): text-only today → should gain a selected background.*

### Cross-cutting (do once, at the end)
- [ ] Repeat a couple of the above in a **light theme** and a **non-default dark theme** (e.g.
  abyss or monokai) — the focused blue differs per theme (C8).

## Concerns / Open questions (resolve before implementation)

| # | Concern | Notes / recommendation |
|---|---------|------------------------|
| C1 | **Does focus actually land in these lists?** `:focus-within` only works if focus stays inside the list container. Explorer works because its Tree container is `tabIndex=0` and keeps focus. Sidebar panels have a focus guard (`core/utils/focus-utils.ts` `isFocusInSidebar`) that deliberately prevents sidebar clicks from stealing editor focus — so clicking a row may **not** move focus into the list, leaving it perpetually "unfocused". **This is the central risk.** US-829 must define how each container becomes focusable and confirm (per surface in US-830/831) that clicking/keyboarding a row yields `:focus-within`. Recommendation: make the list container focusable (`tabIndex=0`) and focus it on row activation, without violating the sidebar→editor focus guard. |
| C2 | **Decouple focus-styling from keyboard navigation?** Today focus styling is gated on `data-keyboard-nav`, which also enables arrow-key nav. Recommendation: introduce a separate `data-focus-selection` marker so a list can be focus-*styled* without necessarily enabling full keyboard nav — but keep `keyboardNav` implying focus-selection for back-compat. Confirm this split (vs. simply turning `keyboardNav` on everywhere). |
| C3 | **Unfocused token = `background.light` (gray), not `background.selection` (loud accent)?** Several lists (App menu #1, MCP Tools #8, Storybook #10, Notebook Tags #6, both Link surfaces #11/#12) currently show the **loud** `background.selection` at all times. The Explorer look replaces that with subtle gray when blurred + blue when focused. Confirm the user wants these lists to go **quieter when unfocused** (matching Explorer) rather than staying loud-accent. *(User request implies yes — they explicitly named these as targets for the Explorer-style selection.)* |
| C4 | **Links Tags/Hostnames (#2/#3) gain a background.** `CategoryList` selection is **text-only** today (`misc.blue`, no bg). Adopting the shared style gives them a real selected **background** (gray/blue). Confirm this visual change is wanted. *(User explicitly listed Tags + Hostnames as wanting the accent-blue selection → yes.)* |
| C5 | **`ListItem` outside `ListBox` (#11 `RenderGrid`, #12 `.map`).** The focus-aware `ListItem` style must work regardless of container. Ensure `selectionStyle="focus"` is self-contained on the row (the `:focus-within` scope is the nearest focusable ancestor marked `data-focus-selection`), and mark/ focus the `RenderGrid` (LinksList) and the pinned `Panel` containers accordingly. |
| C6 | **Regression guard for Explorer.** The `Tree`/`TreeItem` refactor (US-829) is the highest-risk change because Explorer, Rest Client, and Notebook Categories all render through it. Verify Explorer is pixel-identical (unfocused gray, focused blue+border, hover, drag/drop-active states all unchanged) before US-829 is considered done. |
| C7 | **MCP Resources per-row `Panel` (#9).** The row is a `Panel` with `background`/`borderColor` props, not a raw div — retrofitting may mean bypassing `Panel`'s background prop and applying the shared row fragment directly, or extending `Panel` to accept a selection state. Decide during US-831. |
| C8 | **Themes.** All 10 themes already define `--color-bg-tree-selection`; no theme file edits expected. Verify the focused look in at least one light theme and one non-default dark theme (e.g. abyss/monokai) since the blue differs per theme. |

## Notes

### 2026-07-13
- Epic created from the user's request to spread the Explorer file-tree's focused/unfocused
  selection to other selectable lists (App menu, Links Tags/Hostnames/List-mode/pinned, Rest
  Client tree, Notebook Categories/Tags, ToDo, MCP Tools/Resources, Storybook).
- Investigation (verified against source) found selection is fragmented across **3 primitives**
  (`Tree`, `ListBox`, bespoke `.map`) and **3 selected-bg tokens** (`background.light`,
  `background.selection`, `misc.blue` text-only), and that **no list except the Explorer tree has
  any focused-vs-unfocused distinction**. The `background.treeSelection` token was added for
  exactly this focused-row purpose but is currently used only by `Tree`.
- Split into 3 tasks: foundation (extract shared style + wire into `Tree` + `ListBox`/`ListItem`)
  → shared-primitive prop flips → bespoke-row retrofits.
- Key open decisions flagged for the user: C1 (will focus actually land in sidebar lists, given
  the sidebar focus guard — the central technical risk), C2 (decouple focus-styling from
  keyboard-nav), C3 (lists go quieter/gray when unfocused instead of loud-accent), C4 (Links
  Tags/Hostnames gain a background). C3/C4 look like a "yes" from the request but should be
  confirmed. Per-task documents to be written as each task starts (US-829 first).
- Epic moved to **Active**; **US-829 investigated and documented**
  ([task doc](../tasks/US-829-shared-selection-style/README.md)). Design decided: keep the
  Explorer row-owns-base / container-owns-`:focus-within`-override split, but move both halves
  into a shared `uikit/shared/selection-style.ts` (`rowSelectionBase` + `focusSelectionOverride`)
  and switch the container gate from `data-keyboard-nav` to a decoupled `data-focus-selection`
  (C2). `Tree` gains a `focusSelection` prop; `ListItem`/`ListBox` gain `selectionStyle="focus"`
  (gray base, pairs with `variant="browse"`). No new tokens. Explorer is the live regression
  guard — the Tree edits are behavior-identical for `keyboardNav` consumers.
- **US-830 implemented** ([task doc](../tasks/US-830-shared-primitive-consumers/README.md); typecheck +
  lint green; pending visual verification). Key design refinement: the blue focused override for the
  `ListItem` family moved from the **container** (`ListBox` root, US-829) to a **row-hosted** rule on
  `ListItem` itself (new `rowFocusSelectionOverride` in `selection-style.ts`, matching
  `[data-focus-selection]:focus-within &`). This makes a standalone `ListItem` (used outside `ListBox`
  — Link list-mode #11 via `RenderGrid`, Link pinned #12 via `.map`) fully self-contained: its
  container needs only `data-focus-selection` + `tabIndex=0` (carried by a plain `Panel` via `...rest`,
  no Emotion — Rule 7 clean). The redundant container override was removed from `ListBox`; `Tree` keeps
  its container-hosted `focusSelectionOverride` (its rows are `TreeItem`s, possibly consumer-rendered).
  #4/#5 are one-prop `focusSelection` opt-ins; #8/#10 flip `selectionStyle` `accent`→`focus`. The
  `LinksList` change unifies all three of its consumers (list-mode + Hostnames-nav + Tags-secondary
  link lists), not just list-mode. C1 (focus landing) downgraded: #4/#5 mirror the proven Explorer
  sidebar tree; #8/#10/#11/#12 live in the editor body (no sidebar focus guard).
