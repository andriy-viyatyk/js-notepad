# US-830: Shared-primitive consumers — adopt the focus-aware selection

**Epic:** [EPIC-041 — Unified Focused/Unfocused List Selection](../../epics/EPIC-041.md)
**Depends on:** [US-829](../US-829-shared-selection-style/README.md) (implemented)
**Status:** Implemented — pending visual verification (typecheck + lint green)

## Goal

Flip the six selectable lists that already render through a **shared primitive** (`Tree` or
`ListBox`/`ListItem`) onto the focus-aware selection look built in US-829: subtle **gray** when the
list is blurred, **dark-blue + blue outline** when the list is focused. Two of them are `Tree`
consumers (a one-prop opt-in); four use `ListItem` (two inside `ListBox`, two standalone). This
task also completes the `ListItem` side of the primitive so a **standalone** `ListItem` (used
outside `ListBox`) is fully self-contained.

Target surfaces (from the epic's numbering):

| # | Surface | Primitive today | Change |
|---|---------|-----------------|--------|
| 4 | Rest Client — request tree | `Tree` (keyboardNav **off**) | add `focusSelection` |
| 5 | Notebook — Categories panel | `Tree` (keyboardNav **off**) | add `focusSelection` |
| 8 | MCP Inspector — Tools panel | `ListBox` default rows, `selectionStyle="accent"` | → `selectionStyle="focus"` |
| 10 | Storybook — left panel | `ListBox` default rows, `selectionStyle="accent"` | → `selectionStyle="focus"` |
| 11 | Links editor — main view "List" mode | `ListItem` inside `RenderGrid` (`accent`) | → `focus` + focusable container |
| 12 | Links editor — pinned panel | `ListItem` inside a `.map` (`accent`) | → `focus` + focusable container |

Bespoke `.map` rows (App menu, Notebook Tags, ToDo, MCP Resources, Links Tags/Hostnames category
lists) are **out of scope** — they are US-831.

## Background

### What US-829 already delivered (the foundation)

`src/renderer/uikit/shared/selection-style.ts` is the single source of truth:

- **`rowSelectionBase`** (CSSObject) — blurred-state row backgrounds, spread on a *row* styled
  block: `[data-selected]` → `background.light`, `[data-active]:not([data-selected])` →
  `background.message`. Already consumed by `TreeItem` and by `ListItem`'s new
  `selectionStyle="focus"` mode.
- **`focusSelectionOverride(rowSelector)`** (CSSObject) — the focused (`:focus-within`) blue
  override, **container-hosted**: `&[data-focus-selection]:focus-within <rowSelector>[data-selected]`
  → `background.treeSelection` + `text.selection` + `1px solid border.active`, and `…[data-active]`
  → the outline. Consumed by the `Tree` root and (currently) the `ListBox` root.

`Tree` gained a `focusSelection?: boolean` prop; when `keyboardNav || focusSelection` it emits
`data-focus-selection` on the root and makes it a tab stop (`tabIndex=0`). `ListItem` gained
`selectionStyle="focus"` (gray base via `rowSelectionBase`, no default trailing icon), and `ListBox`
emits `data-focus-selection` + is focusable when `selectionStyle === "focus"`.

**Verified state of the primitives (post-US-829):**
- `Tree.tsx:99` destructures `focusSelection`; `:174` `focusAware = keyboardNav || focusSelection`;
  `:272,290,312` emit `data-focus-selection={focusAware || undefined}`; `:314`
  `tabIndex={focusAware ? 0 : -1}`. **So #4/#5 need only pass `focusSelection`.**
- `ListItem.tsx:102-104` has the `'&[data-selection-style="focus"]': { ...rowSelectionBase }` rule
  (gray base only — **no focused blue override on the row**). `:147` suppresses the default trailing
  icon in focus mode.
- `ListBox.tsx:30` spreads `focusSelectionOverride('[data-type="list-item"]')` on the root; `:194`
  `focusAware = keyboardNav || selectionStyle === "focus"`; `:202` emits
  `data-focus-selection={selectionStyle === "focus" || undefined}`; `:204`
  `tabIndex={focusAware ? 0 : -1}`.

### The gap this task must close: `ListItem` outside `ListBox`

Surfaces #11 and #12 render `ListItem` **without** a `ListBox` — #11 inside a `RenderGrid` cell
(`LinksList.tsx`), #12 inside a `.map` (`PinnedLinksPanel.tsx`). US-829 put the blue focused
override on the **container** (`ListBox` root). With no `ListBox` in the tree, `selectionStyle="focus"`
today would paint only the gray base and **never turn blue when focused**.

**Resolution — make the override row-hosted for `ListItem`.** Add an *ancestor-scoped* variant of
the override to `ListItem`'s own styled block:
`[data-focus-selection]:focus-within &[data-selection-style="focus"][data-selected]` → blue. Because
the selector matches whenever the row sits inside **any** focused-within `[data-focus-selection]`
ancestor, a standalone `ListItem selectionStyle="focus"` becomes fully self-contained — its
container only needs two attributes (`data-focus-selection` + `tabIndex=0`), no Emotion, which a
plain `Panel` can carry via its `...rest` pass-through (`tabIndex`/`data-*` are allowed;
`style`/`className` are not — Rule 7).

Once `ListItem` self-hosts the override, the container-hosted spread on the **`ListBox`** root
(US-829) is redundant for `ListBox` (its default rows are `ListItem`s that now self-host) and is
removed, leaving one mechanism for the `ListItem` family. `focusSelectionOverride` (container form)
remains in use by **`Tree`** — `Tree` keeps its container-hosted override because its rows are
`TreeItem`s (base only) and may be consumer-rendered via `renderItem`.

### Why the focus actually lands (epic concern C1 — largely resolved)

`:focus-within` only fires if focus enters the list container. Clicking a non-focusable child of a
`tabIndex=0` element focuses that element (standard click-focus delegation) — exactly how Explorer
works today. Per-surface:

- **#4 / #5 (sidebar secondary views):** identical to the **Explorer** tree, which is a sidebar
  secondary view using the very same `Tree` focusability and shows the blue focused state today. So
  the sidebar focus guard (`core/utils/focus-utils.ts` `isFocusInSidebar`) does **not** block
  focus from landing inside a sidebar tree — Explorer is the living proof. #4/#5 inherit this.
- **#8 / #10:** rendered in the **editor body** (the editor's own left panel), not the app sidebar
  — no focus guard involved.
- **#11 / #12:** rendered in the **editor body** (main list area / editor-side pinned panel) — no
  focus guard involved.

So C1 is only a real risk for genuinely sidebar-hosted lists, and those (#4/#5) mirror Explorer. No
surface in US-830 introduces a new focus-landing problem.

### Files & exact anchors (verified)

| # | File | Anchor |
|---|------|--------|
| 4 | `src/renderer/editors/rest-client/RestClientShared.tsx` | `<Tree>` at `:591-604` (inside `RequestTree`); rows are `TreeItem`s via `renderItem` |
| 5 | `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.tsx` | `<Tree>` at `:64-75` |
| 8 | `src/renderer/editors/mcp-inspector/ToolsPanel.tsx` | `<ListBox>` at `:107-116` (`variant="browse" selectionStyle="accent" keyboardNav`) |
| 10 | `src/renderer/editors/storybook/ComponentBrowser.tsx` | `<ListBox>` at `:39-47` (`variant="browse" selectionStyle="accent"`) |
| 11 | `src/renderer/editors/link-editor/LinksList.tsx` | row `<ListItem>` at `:116-134` (`variant="browse" selectionStyle="accent" showSelectionIcon={false}`); returns `<RenderGrid>` at `:229-240` |
| 12 | `src/renderer/editors/link-editor/PinnedLinksPanel.tsx` | row `<ListItem>` at `:101-121`; scroll container `<Panel name="pinned-links-list">` at `:257-265` |

**`LinksList` has three consumers** (all render link rows):
`LinkItemList.tsx:146` (the #11 list mode), `panels/LinkHostnamesNavigationPanel.tsx:134`, and
`panels/LinkTagsSecondaryView.tsx:134`. Putting the change **inside `LinksList`** unifies all three
at once — the two panel consumers are also link lists and benefit from the same look (consistent
with the epic's intent). No per-consumer wiring needed.

## Design decision

1. **`Tree` consumers (#4, #5):** pass `focusSelection` — one prop, zero risk (no shipped `Tree`
   uses it yet; Explorer keeps working via `keyboardNav`).
2. **`ListBox` consumers (#8, #10):** switch `selectionStyle` `"accent"` → `"focus"`. `ListBox`
   already emits `data-focus-selection` + is focusable in focus mode.
3. **Standalone `ListItem` (#11, #12):** (a) add the **row-hosted** focused override to `ListItem`'s
   focus mode so the row is self-contained; (b) switch the rows to `selectionStyle="focus"`;
   (c) mark the surrounding container focusable (`tabIndex={0}` + `data-focus-selection`), which a
   `Panel` carries via `...rest`.
4. **`ListBox` cleanup:** remove the now-redundant container-hosted override from the `ListBox`
   root (single mechanism for the `ListItem` family).

`variant="browse"` is required for focus mode (its `:hover` = gray `background.message`, matching the
blurred hover). All four `ListItem` targets already use `variant="browse"`. ✔

## Implementation plan

### Step 1 — `selection-style.ts`: add the row-hosted override

`src/renderer/uikit/shared/selection-style.ts` — add a sibling to `focusSelectionOverride`:

```ts
/**
 * Row-hosted variant of the focused override, for a row primitive used WITHOUT a
 * focus-aware container of its own (e.g. `ListItem` rendered outside `ListBox`, inside a
 * `RenderGrid` cell or a `.map`). Applied on the ROW's own styled block. The selector
 * matches whenever the row sits inside any focused-within `[data-focus-selection]` ancestor,
 * so the container only needs `data-focus-selection` + `tabIndex=0` (no Emotion).
 *
 * `rowMatch` narrows the rule to the row's own selector (e.g. the focus-mode attribute), so
 * it does not fight the blurred base painted by `rowSelectionBase`.
 */
export function rowFocusSelectionOverride(rowMatch: string): CSSObject {
    return {
        [`[data-focus-selection]:focus-within &${rowMatch}[data-selected]`]: {
            backgroundColor: color.background.treeSelection,
            color: color.text.selection,
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },
        [`[data-focus-selection]:focus-within &${rowMatch}[data-active]`]: {
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },
    };
}
```

### Step 2 — `ListItem`: self-host the focused override

`src/renderer/uikit/ListBox/ListItem.tsx`

**2a.** Widen the import (line 7):
```ts
import { rowSelectionBase, rowFocusSelectionOverride } from "../shared/selection-style";
```
**2b.** In the `Root` styled block, add the override next to the existing focus base rule
(after `:104`). The base rule (`'&[data-selection-style="focus"]': { ...rowSelectionBase }`) stays
as-is; add at the top level of the object:
```ts
        // Focused (blue) override for standalone focus rows — matches when the row sits in any
        // focused-within [data-focus-selection] container (works with or without a ListBox).
        ...rowFocusSelectionOverride('[data-selection-style="focus"]'),
```

### Step 3 — `ListBox`: drop the now-redundant container override

`src/renderer/uikit/ListBox/ListBox.tsx`

**3a.** Remove the spread at `:30`
(`...focusSelectionOverride('[data-type="list-item"]'),`) and its comment. **Keep** the
`data-focus-selection` emission (`:202`) and `focusAware`/`tabIndex` (`:194,204`) — the container
still flags + focuses itself; `ListItem` now paints the blue.

**3b.** Remove the now-unused import of `focusSelectionOverride` (line 13). *(Verify with lint —
if any other reference remains, keep it.)*

### Step 4 — #4 Rest Client tree

`src/renderer/editors/rest-client/RestClientShared.tsx` — add `focusSelection` to the `<Tree>`
(`:591`), e.g. after `defaultExpandAll` (`:603`):
```tsx
            defaultExpandAll
            focusSelection
```

### Step 5 — #5 Notebook Categories

`src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.tsx` — add `focusSelection`
to the `<Tree>` (`:64-75`), after `defaultExpandAll` (`:74`):
```tsx
                    defaultExpandAll
                    focusSelection
```

### Step 6 — #8 MCP Tools

`src/renderer/editors/mcp-inspector/ToolsPanel.tsx:113` — change:
```tsx
                        selectionStyle="accent"
```
to:
```tsx
                        selectionStyle="focus"
```
Keep `variant="browse"` and `keyboardNav`. (Focus lands when a tool is clicked; selecting the
detail form to the right blurs the list → the selected tool row goes gray, as intended.)

### Step 7 — #10 Storybook

`src/renderer/editors/storybook/ComponentBrowser.tsx:45` — change
`selectionStyle="accent"` → `selectionStyle="focus"`. (No `keyboardNav`; focus mode makes the
`ListBox` focusable on its own.)

### Step 8 — #11 Links list mode (all `LinksList` consumers)

`src/renderer/editors/link-editor/LinksList.tsx`

**8a.** Row (`LinksListRow`, `:116-134`) — change `selectionStyle="accent"` →
`selectionStyle="focus"`. Keep `variant="browse"`, `showSelectionIcon={false}`.

**8b.** Wrap the returned `<RenderGrid>` (`:229-240`) in a focusable, flagged `Panel` so the row's
`:focus-within` override can fire. `Panel` carries `tabIndex`/`data-*` through `...rest`:
```tsx
    return (
        <Panel
            name="links-list-focus-scope"
            direction="column"
            flex={1}
            minWidth={0}
            minHeight={0}
            overflow="hidden"
            tabIndex={0}
            data-focus-selection=""
        >
            <RenderGrid
                ref={gridRef}
                rowCount={links.length}
                columnCount={1}
                rowHeight={ROW_HEIGHT}
                columnWidth={columnWidth}
                renderCell={renderCell}
                fitToWidth
                onResize={handleResize}
            />
        </Panel>
    );
```
`Panel` is already imported (`:4`). Verify the grid still fills + scrolls after wrapping (see C-L
below).

### Step 9 — #12 Links pinned panel

`src/renderer/editors/link-editor/PinnedLinksPanel.tsx`

**9a.** Row (`PinnedItem`, `:101-121`) — change `selectionStyle="accent"` →
`selectionStyle="focus"`. Keep `variant="browse"`, `showSelectionIcon={false}`.

**9b.** Make the scrolling list container focusable + flagged — the `<Panel name="pinned-links-list">`
(`:257-265`). Add:
```tsx
            <Panel
                name="pinned-links-list"
                direction="column"
                overflowY="auto"
                overflowX="hidden"
                paddingY="xs"
                flex={1}
                height={0}
                tabIndex={0}
                data-focus-selection=""
            >
```

### Step 10 — Verify

- `npm run typecheck` (`tsc --noEmit`) and `npm run lint` clean.
- Visual verification per the epic's **US-830** checklist (all six surfaces + one light theme /
  one non-default dark theme). See the epic.

## Concerns / open questions

| # | Concern | Resolution |
|---|---------|------------|
| C1 (epic) | **Will focus land in the list?** | Resolved above: #4/#5 mirror Explorer (proven sidebar tree); #8/#10/#11/#12 are editor-body lists (no sidebar guard). Confirm during visual verification. |
| C3 (epic) | **Lists go gray-when-unfocused instead of loud accent.** | Intended (user named these as Explorer-style targets). #8/#10/#11/#12 currently show loud `background.selection` at all times → become gray/blue two-state. |
| C-A | **US-829 tweak.** Steps 2–3 modify `ListItem`/`ListBox` (US-829 files). Justified: they complete the `ListItem` side so a standalone row works, and remove a redundant rule. No shipped consumer uses `ListBox`/`ListItem` focus mode yet, so re-verify only the Storybook `focus` story + MCP Tools (#8) once. |
| C-B | **`LinksList` change is broad.** It flips **all three** `LinksList` consumers (list mode #11, Hostnames-nav panel, Tags-secondary panel) to focus selection. This is desired unification, but two of them are sidebar panels — visually verify those two as well (not just list mode). If a consumer must keep `accent`, add an optional `selectionStyle` prop to `LinksList` instead of hardcoding; default `"focus"`. |
| C-L | **`LinksList` layout after wrapping.** `LinksList` currently returns `<RenderGrid>` as its root; #11 inserts a `Panel` between the parent and the grid. Verify the grid still fills width/height and scrolls (the `onResize`/`fitToWidth` path measures the grid's own box, which is now the `Panel`'s child). The `Panel` must fill its slot (`flex={1}`, `minHeight/minWidth={0}`, `overflow="hidden"`). |
| C-D | **`revealChildrenOnHover` interplay (#11).** The per-row `<Panel revealChildrenOnHover>` (edit/delete buttons) reveals on `:hover`/`:focus-within` of that inner Panel. The new focusable wrapper is an *ancestor* of that Panel, so focusing the wrapper does **not** make the inner Panel `:focus-within` → buttons still reveal on hover only. No change expected; confirm visually. |
| C-E | **`keyboardNav` + no `activeIndex` (#8).** MCP Tools passes `keyboardNav` but no `activeIndex`/`onActiveChange` (pre-existing). The focused active-row *outline* only appears with `data-active`; without it, only the selected-row blue shows. Acceptable — not in scope to wire keyboard cursor here. |
| C-T | **`data-focus-selection` value.** Emitted as `data-focus-selection=""` (empty string) on `Panel` — matches the `[data-focus-selection]` attribute selector. `Tree`/`ListBox` emit `… || undefined` (attribute present/absent); the empty-string form is equivalent for matching. |

## Acceptance criteria

- [ ] `selection-style.ts` exports `rowFocusSelectionOverride(rowMatch)`.
- [ ] `ListItem` `selectionStyle="focus"` shows the blue focused override when inside **any**
  focused-within `[data-focus-selection]` container (no `ListBox` required); the redundant
  container override is removed from `ListBox` (single mechanism for the `ListItem` family).
- [ ] #4 Rest Client tree and #5 Notebook Categories show gray-when-blurred / blue+outline-when-
  focused (matching Explorer), with drag/drop unaffected.
- [ ] #8 MCP Tools and #10 Storybook use `selectionStyle="focus"` (no chevron; gray→blue two-state).
- [ ] #11 Links list mode and #12 Links pinned show the two-state selection; the containers become
  focusable and the grid/list still scrolls and fills correctly.
- [ ] `npm run lint` + typecheck clean.
- [ ] Epic's US-830 visual checklist passes (incl. one light + one non-default dark theme).

## Files changed

| File | Change |
|------|--------|
| `src/renderer/uikit/shared/selection-style.ts` | Add `rowFocusSelectionOverride(rowMatch)` (row-hosted override). |
| `src/renderer/uikit/ListBox/ListItem.tsx` | Spread `rowFocusSelectionOverride('[data-selection-style="focus"]')` into `Root` (self-contained blue override). |
| `src/renderer/uikit/ListBox/ListBox.tsx` | Remove redundant `focusSelectionOverride` spread + import; keep `data-focus-selection` + focusability. |
| `src/renderer/editors/rest-client/RestClientShared.tsx` | `<Tree focusSelection>` (#4). |
| `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.tsx` | `<Tree focusSelection>` (#5). |
| `src/renderer/editors/mcp-inspector/ToolsPanel.tsx` | `selectionStyle="accent"` → `"focus"` (#8). |
| `src/renderer/editors/storybook/ComponentBrowser.tsx` | `selectionStyle="accent"` → `"focus"` (#10). |
| `src/renderer/editors/link-editor/LinksList.tsx` | Row → `selectionStyle="focus"`; wrap `RenderGrid` in a focusable `data-focus-selection` `Panel` (#11, all 3 consumers). |
| `src/renderer/editors/link-editor/PinnedLinksPanel.tsx` | Row → `selectionStyle="focus"`; scroll `Panel` gets `tabIndex={0}` + `data-focus-selection` (#12). |

## Files that need NO changes

- `src/renderer/uikit/Tree/Tree.tsx`, `TreeItem.tsx`, `types.ts` — `focusSelection` already exists
  (US-829); #4/#5 only pass the prop.
- `src/renderer/theme/color.ts` / `theme/themes/*` — all tokens already exist.
- `src/renderer/uikit/ListBox/types.ts`, `ListBox.story.tsx` — `"focus"` already in the type/story
  (US-829).
- `src/renderer/editors/link-editor/LinkItemList.tsx`, `LinkBody.tsx`,
  `panels/LinkHostnamesNavigationPanel.tsx`, `panels/LinkTagsSecondaryView.tsx` — inherit the
  `LinksList` change automatically; no edits.
- `RenderGrid` — used as-is; the focusable wrapper is a sibling `Panel`, not a `RenderGrid` change.
