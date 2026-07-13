# US-831: Bespoke-row retrofits

**Epic:** [EPIC-041 — Unified Focused/Unfocused List Selection](../../epics/EPIC-041.md)
**Depends on:** US-829 (shared foundation, done), US-830 (shared-primitive consumers, done)
**Status:** Implemented — pending visual verification (typecheck + lint green)

## Goal

Give the last five selectable lists — the ones that **hand-roll** their own row selection and do
not ride a shared primitive — the same focus-aware Explorer selection as the rest of the app:
subtle **gray** when the list is blurred (`background.light` selected / `background.message`
hover), **dark-blue + blue outline** when the list is focused (`background.treeSelection` +
`border.active`). This closes out EPIC-041.

## Target surfaces (the epic's remaining 5)

| # | Surface | Row file | Container file | Row today | Container today |
|---|---------|----------|----------------|-----------|-----------------|
| 1 | App menu — left folder list | `ui/sidebar/FolderItem.tsx` (styled row) | `ui/sidebar/MenuBar.tsx:511-523` (ListBox, `renderItem`) | `background.selection` (loud) | ListBox, not focus-aware |
| 6 | Notebook — Tags panel | `editors/notebook/TagsListView.tsx:180-256` (`renderItem` div) | same file `:260-268` (ListBox) | inline `background.selection` | ListBox, not focus-aware |
| 7 | ToDo — Todo panel (lists + tags) | `editors/todo/components/TodoListPanel.tsx:51-79` (`RowShell`) | same file `:231` (`todo-lists-body` Panel) | `background.light` + `misc.blue` text | plain scroll Panel |
| 9 | MCP Inspector — Resources panel | `editors/mcp-inspector/ResourcesPanel.tsx:56-70,87-101` (per-row `Panel`) | same file `:52` (list Panel) | `Panel background="light"` + `borderColor="active"` | plain scroll Panel |
| 2/3 | Links — Tags panel / Hostnames panel | `uikit/CategoryList/CategoryList.tsx` (`[data-part="row"]`) | same file (`Root` is the scroll container) | **text-only** `misc.blue` (no bg) | not focusable |

`#2` (Tags) and `#3` (Hostnames) are the same primitive, `CategoryList`, used by
`link-editor/panels/LinkTagsPanel.tsx` and `LinkHostnamesPanel.tsx`. Retrofitting the primitive
covers both. Those are the **only** two `CategoryList` consumers (verified by grep — plus its
Storybook story).

## Background

### The mechanism (recap of US-829 — unchanged here)

Selection is pure CSS `:focus-within`, gated by a container `data-focus-selection` attribute + a
focusable container (`tabIndex=0`). No JS focus state. The **row** owns the blurred gray base; the
**focused blue override** applies under `[data-focus-selection]:focus-within`. Clicking a
non-focusable child of a `tabIndex=0` container focuses that container (click-focus delegation) —
this is exactly how Explorer works, and how US-830's surfaces work.

### The shared fragments (already exist — `uikit/shared/selection-style.ts`)

| Export | Applied on | What it does |
|--------|-----------|--------------|
| `rowSelectionBase` (CSSObject) | the **row's** own styled block (`&`) | `&[data-active]:not([data-selected])` → `background.message`; `&[data-selected]` → `background.light` |
| `focusSelectionOverride(rowSelector)` | the **container's** styled block | `&[data-focus-selection]:focus-within ${rowSelector}[data-selected]` → blue bg + text + outline; `[data-active]` → outline. Use when rows are **descendants** of the styled container. |
| `rowFocusSelectionOverride(rowMatch)` | the **row's** own styled block (`&`) | `[data-focus-selection]:focus-within &${rowMatch}[data-selected]` → blue; `[data-active]` → outline. Use when the row primitive is **standalone** (no styled container of its own). |

US-830 established the split: `ListItem` hosts `rowSelectionBase` + `rowFocusSelectionOverride`
(self-contained rows); `Tree`/`TreeItem` and any single-file container+rows use
`focusSelectionOverride` (container-hosted). US-831 reuses **both** patterns unchanged — no new
fragment functions.

### The Rule 7 problem, and the new `SelectableRow` primitive

Three of the five surfaces (#6, #7, #9) render their rows in **editor code** (`editors/…`), where
Rule 7 forbids Emotion / `styled` / `style=`/`className=` on UIKit components. But `:focus-within`
cannot be expressed with inline `style` (no pseudo-selectors). So these editor rows cannot host the
focus CSS themselves.

The other two are exempt and host the CSS directly:
- **#1 FolderItem** lives in `ui/sidebar/` — the **application-chrome exception** to Rule 7 (see
  `uikit/CLAUDE.md`), so it may keep using `styled`.
- **#2/3 CategoryList** lives in `uikit/` — Emotion is the norm inside UIKit.

For the three editor surfaces, the sanctioned Rule 7 answer is *"extend a UIKit primitive, don't
style around it."* This task adds one small primitive:

**`uikit/SelectableRow/SelectableRow.tsx`** — a layout-neutral `<div>` that paints the shared
focus-aware selection (base + row-hosted override) and nothing else. Editor rows wrap their
existing content in it and pass `selected` / `active`; the focus CSS lives inside UIKit where it
belongs. It composes `rowSelectionBase` + `rowFocusSelectionOverride("")` verbatim, so it cannot
drift from `ListItem`/`Tree`.

```tsx
// uikit/SelectableRow/SelectableRow.tsx
import React, { forwardRef } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { rowSelectionBase, rowFocusSelectionOverride } from "../shared/selection-style";

export interface SelectableRowProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name`. Never used for styling. */
    name?: string;
    /** True when this row is the current selection. */
    selected?: boolean;
    /** True when this row is the keyboard-active / highlighted row. */
    active?: boolean;
    children: React.ReactNode;
}

const Root = styled.div(
    {
        display: "flex",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        cursor: "pointer",
        color: color.text.default,
        // blurred base: [data-active]:not([data-selected]) → message; [data-selected] → light
        ...rowSelectionBase,
        // mouse hover (no data-active wiring) → message
        "&:hover:not([data-selected]):not([data-active])": {
            backgroundColor: color.background.message,
        },
        // focused override, hosted on the row: needs any [data-focus-selection]:focus-within ancestor
        ...rowFocusSelectionOverride(""),
    },
    { label: "SelectableRow" },
);

export const SelectableRow = forwardRef<HTMLDivElement, SelectableRowProps>(
    function SelectableRow({ name, selected, active, children, ...rest }, ref) {
        return (
            <Root
                ref={ref}
                data-type="selectable-row"
                data-name={name}
                data-selected={selected || undefined}
                data-active={active || undefined}
                {...rest}
            >
                {children}
            </Root>
        );
    },
);
```

- `display:flex; width:100%; height:100%` lets it fill a virtualized ListBox row (fixed height
  from `RenderGrid`) and collapse to content in a plain `.map` list. The single child provides the
  actual layout (a `Panel` or plain `<div>`); give that child `flex={1}` / `minWidth={0}` where it
  must stretch.
- `rowFocusSelectionOverride("")` (empty `rowMatch`) matches the row whenever it sits inside **any**
  focused-within `[data-focus-selection]` ancestor — the container only needs
  `data-focus-selection` + `tabIndex=0`.
- Colors: blurred selected text stays default (like Explorer); focused selected text becomes
  `text.selection` (white) via the override. This intentionally drops the pre-existing
  `misc.blue` selected-text on ToDo (#7) and CategoryList (#2/3) — see C-TEXT.

### Container wiring per surface

| Surface | Container becomes focus-aware by… |
|---------|-----------------------------------|
| #1 App menu | ListBox `menubar-folders` gets `selectionStyle="focus"` — ListBox already emits `data-focus-selection` + `tabIndex=0` for that value (`ListBox.tsx:201-202`), even when a custom `renderItem` is used (the prop gates the **container**, independent of the row). |
| #6 Notebook Tags | ListBox `notebook-tags-listbox` gets `selectionStyle="focus"` (same mechanism). |
| #7 ToDo | `todo-lists-body` Panel (`TodoListPanel.tsx:231`) gets `tabIndex={0}` + `data-focus-selection=""` (pass through Panel's `...rest`). |
| #9 MCP Resources | the resources list Panel (`ResourcesPanel.tsx:52`) gets `tabIndex={0}` + `data-focus-selection=""`. |
| #2/3 CategoryList | `CategoryList`'s own `Root` (the scroll container) gets `tabIndex={0}` + `data-focus-selection` and hosts `focusSelectionOverride('[data-part="row"]')` (container-hosted — rows are `[data-part="row"]` descendants). |

Passing `tabIndex` / `data-*` through `Panel` is confirmed to work: `Panel` spreads `...rest` and
its props type only omits `style`/`className` (US-830 relied on this for the Links surfaces).

### Focus-landing (C1) analysis

All five containers become `tabIndex=0` with non-focusable rows, so a row click delegates focus to
the container → `:focus-within` matches. #6, #7, #2/3 are **sidebar secondary views** — the same
placement as US-830's Notebook Categories (#5) and Rest Client tree (#4), which were confirmed to
work despite the sidebar focus guard (`isFocusInSidebar` prevents stealing *editor* focus; it does
not stop focus landing *within* the sidebar list). #9 is an **editor-body** panel (no guard at
all). #1 is inside the App-menu overlay (its content div is already `tabIndex=0`; the ListBox adds
its own focusable root). No new focus risk beyond what US-830 already validated.

## Design decision (summary)

- **Add one primitive, `SelectableRow`** (UIKit) — the Rule-7-clean home for the focus CSS that the
  three editor surfaces (#6, #7, #9) need. It reuses the US-829 fragments verbatim.
- **#1 FolderItem** and **#2/3 CategoryList** host the fragments directly (chrome / UIKit — Emotion
  allowed); no `SelectableRow` needed there.
- **No new tokens, no new fragment functions, no theme edits.**
- **Loud → quiet (C3):** #1 and #6 currently show the loud `background.selection` at all times; they
  become gray-when-blurred / blue-when-focused like Explorer.
- **Text-only → real background (C4):** #2/3 gain a selected **background** (gray/blue), replacing
  today's `misc.blue` text-only selection.

## Implementation plan

### Step 1 — Create the `SelectableRow` primitive

1. Create `src/renderer/uikit/SelectableRow/SelectableRow.tsx` with the code in the Background
   section above.
2. Create `src/renderer/uikit/SelectableRow/index.ts`:
   ```ts
   export { SelectableRow } from "./SelectableRow";
   export type { SelectableRowProps } from "./SelectableRow";
   ```
3. Add to `src/renderer/uikit/index.ts` (next to the `CategoryList` / `ListItem` exports, ~line 84):
   ```ts
   export { SelectableRow } from "./SelectableRow";
   export type { SelectableRowProps } from "./SelectableRow";
   ```
4. *(Optional, nice-to-have)* add a `SelectableRow.story.tsx` mirroring `ListItem`/`CategoryList`
   stories so the Storybook editor shows it. Not required for the task.

### Step 2 — #1 App menu (`FolderItem` + `MenuBar`)

**`ui/sidebar/FolderItem.tsx`** — in the `Root` styled block:
- Add the import: `import { rowSelectionBase, rowFocusSelectionOverride } from "../../uikit/shared/selection-style";`
- Replace the two selection rules:
  ```ts
  // BEFORE
  "&:hover": { backgroundColor: color.background.default },
  "&[data-selected]": {
      backgroundColor: color.background.selection,
      color: color.text.selection,
  },
  // AFTER
  ...rowSelectionBase,                                   // [data-selected] → light
  "&:hover:not([data-selected])": { backgroundColor: color.background.message },
  ...rowFocusSelectionOverride('[data-type="folder-item"]'),
  ```
- Leave the `[data-dragging]`, `[data-drag-over]`, `.selected-icon`, `.item-text` rules unchanged.
  The `&[data-selected] .selected-icon { color: icon.selection }` rule stays (icon stays visible on
  both gray and blue).

**`ui/sidebar/MenuBar.tsx`** — on the `menubar-folders` ListBox (`:511`), add
`selectionStyle="focus"`. No other change (it already uses `variant`-less browse rendering via
`renderItem`).

### Step 3 — #6 Notebook Tags (`TagsListView`)

**`editors/notebook/TagsListView.tsx`**:
- Import `SelectableRow`: `import { SelectableRow } from "../../uikit/SelectableRow";` (drop the
  now-unused `color` import if nothing else uses it — verify; the chevrons use no color).
- In `renderItem`, replace the outer `<div data-selected … style={{… backgroundColor … color …}}>`
  with `<SelectableRow selected={ctx.selected} active={ctx.active}>` wrapping a plain layout `<div>`
  that keeps the flex/padding (the plain `<div style>` is allowed — not a UIKit component):
  ```tsx
  return (
      <SelectableRow selected={ctx.selected} active={ctx.active}>
          <div style={{
              display: "flex", alignItems: "center", width: "100%", height: "100%",
              boxSizing: "border-box", paddingLeft: 8, paddingRight: 8, flex: 1, minWidth: 0,
          }}>
              {/* chevron / name / count spans unchanged */}
          </div>
      </SelectableRow>
  );
  ```
  Remove the `backgroundColor` / `color` inline props (SelectableRow owns them now).
- On the `<ListBox<TagItem>>` (`:260`), add `selectionStyle="focus"`.

### Step 4 — #7 ToDo (`TodoListPanel` `RowShell`)

**`editors/todo/components/TodoListPanel.tsx`**:
- Import `SelectableRow`.
- Rewrite `RowShell` to drop the local `useState(hovered)` + inline bg/text and delegate to
  `SelectableRow`:
  ```tsx
  function RowShell({ selected, onClick, children, revealOnHover }: RowShellProps) {
      return (
          <SelectableRow selected={selected} onClick={onClick}>
              <Panel
                  direction="row" align="center" gap="xs" paddingX="sm"
                  minHeight={28} flex={1} minWidth={0}
                  revealChildrenOnHover={revealOnHover}
              >
                  {children}
              </Panel>
          </SelectableRow>
      );
  }
  ```
- The old row set `fontSize: 13` on the wrapper and `color: misc.blue` for selected text. Preserve
  the 13px on the name text by adding `fontSize: 13` to `NAME_STYLE`. The `misc.blue` selected text
  is intentionally dropped (see C-TEXT).
- Add `tabIndex={0}` + `data-focus-selection=""` to the `todo-lists-body` Panel (`:231`).
- Verify `useState` is still imported/used elsewhere in the file (it is — for the new-list / rename
  inputs), so no import churn beyond `RowShell`.

### Step 5 — #9 MCP Resources (`ResourcesPanel`)

**`editors/mcp-inspector/ResourcesPanel.tsx`**:
- Import `SelectableRow`.
- The resources `.map` (`:53`) and templates `.map` (`:84`): wrap each row `Panel` in
  `SelectableRow selected={isSelected}` and **remove** the selection props from the inner `Panel`
  (`background={isSelected ? "light" : undefined}` and the dynamic
  `borderColor={isSelected ? "active" : "subtle"}` → keep a static `borderColor="subtle"`), keeping
  everything else (paddings, `borderBottom`, `onClick`, `title`, the two `Text` lines). Move
  `onClick` and `title` onto `SelectableRow` (or keep on the Panel — either works; prefer
  `SelectableRow` so the whole row is the click/selection surface). Add `flex={1} minWidth={0}` to
  the inner Panel so it fills the flex row.
  ```tsx
  <SelectableRow key={r.uri} selected={isSelected} onClick={() => model.selectResource(r.uri)}>
      <Panel direction="column" paddingX="lg" paddingY="sm" gap="xs"
             borderBottom borderColor="subtle" title={r.uri} flex={1} minWidth={0}>
          <Text size="sm" color="default" truncate>{r.name}</Text>
          <Text size="xs" color="primary" truncate>{r.uri}</Text>
      </Panel>
  </SelectableRow>
  ```
- Add `tabIndex={0}` + `data-focus-selection=""` to the list Panel (`:52`,
  `direction="column" flex={1} overflow="auto"`).

### Step 6 — #2/3 Links Tags & Hostnames (`CategoryList`)

**`uikit/CategoryList/CategoryList.tsx`**:
- Import `focusSelectionOverride`: `import { focusSelectionOverride } from "../shared/selection-style";`
- In the `Root` styled block, rewrite the `[data-part="row"]` selection rules and add the
  container-hosted override:
  ```ts
  '& [data-part="row"]': {
      // …existing display/padding/cursor/color…
      "&:hover:not([data-selected])": {
          backgroundColor: color.background.message,   // was: color.background.light on plain :hover
      },
      "&[data-selected]": {
          backgroundColor: color.background.light,     // was: color.misc.blue text only, no bg
      },
  },
  // …after the row block, at Root level:
  ...focusSelectionOverride('[data-part="row"]'),
  ```
  Drop the `color: color.misc.blue` from the selected rule (focused text handled by the override;
  blurred selected text stays default — see C-TEXT).
- Make `Root` focusable + opt-in: on the two `<Root … {...rest}>` JSX sites (the drilled-in return
  `:222` and the top-level return `:262`) add `tabIndex={0}` and `data-focus-selection=""`. (Root
  already carries `data-type="category-list"`.)
- Leave the sticky back-header rule `[data-part="row"][data-state="open"]` as-is — it is a header,
  not a normal selectable row (see C-STICKY).

### Step 7 — Verify

- `npm run typecheck` (`tsc --noEmit`) — expect clean.
- `npx eslint` on every changed file — expect clean.
- Do **not** run `/review`, `/document`, `/userdoc` (epic deferred-review model — they run once at
  epic close). Do not check the dashboard box (stays `[ ]`).

## Concerns / open questions

| # | Concern | Resolution |
|---|---------|------------|
| C-NEW | **New primitive vs. reuse `ListItem`.** #6/#7/#9 could theoretically be forced onto `ListItem selectionStyle="focus"`, but their rows have bespoke layouts (two-line MCP row, ToDo hover-actions, Tag chevrons). | Add the minimal, layout-neutral `SelectableRow` instead — smaller diff, keeps each row's existing structure, and is reusable. Confirmed the epic wants "adopt the shared fragment", not a specific primitive. |
| C-TEXT | **Dropping `misc.blue` selected text** on ToDo (#7) and CategoryList (#2/3). | Intentional unification: Explorer's blurred selected text is default color, focused is `text.selection` (white). Matches the epic goal. Flag for the user in case they want to keep blue text when blurred. |
| C3 | **#1 App menu + #6 Notebook Tags go quieter (gray) when unfocused** instead of loud `background.selection`. | Intended (epic C3). The user listed these as Explorer-style targets. |
| C4 | **#2/3 gain a background** (were text-only). | Intended (epic C4). |
| C-STICKY | **CategoryList drilled-in sticky "back" header** is a `[data-part="row"]` with `data-state="open"` and its own `background.default`. When it is the selected parent, its header background wins over the selection background. | Leave as-is — it functions as a header, not a selectable list row. Minor; note for visual check. |
| C7 | **MCP Resources row is a `Panel`** with border props, not a raw div. | Resolved by wrapping in `SelectableRow` and stripping the Panel's selection props (keep a static `borderColor="subtle"` + `borderBottom`). No `Panel` extension needed. |
| C-ACTIVE | **`active` (keyboard) state** — none of these five containers wire an `activeIndex`, so the `[data-active]` outline branch is dormant; hover uses `:hover`. | Acceptable — matches how `ListItem`/`FolderItem` behave without keyboard nav. Full arrow-key nav is out of scope for this epic. |
| C-TAB | **New `tabIndex=0` containers add tab stops** (ToDo panel, MCP resources list, CategoryList). | Explorer already does this; acceptable. The ListBox surfaces (#1/#6) were already `tabIndex=-1` and become `0` via `selectionStyle="focus"` — same as US-830's ListBox surfaces. |
| C1 | **Does focus land in these lists?** | Yes — see the focus-landing analysis; all mirror US-830-validated placements. |
| C8 | **Themes.** | No theme edits; verify the focused blue in one light + one non-default dark theme at epic close. |

## Acceptance criteria

For each of the six screens (App menu folders, Notebook Tags, ToDo lists+tags, MCP Resources incl.
templates, Links Tags, Links Hostnames), verify the four states:
- (a) **unfocused-selected** → subtle gray (`background.light`);
- (b) **focused-selected** → dark-blue (`background.treeSelection`) + blue outline (`border.active`);
- (c) **hover** an unselected row → gray (`background.message`);
- (d) focusing away flips a selected row from blue back to gray.

Plus:
- App menu (#1) and Notebook Tags (#6) are no longer loud-accent when unfocused.
- Links Tags/Hostnames (#2/3) now show a selected **background** (not just blue text).
- ToDo (#7) drill/rename/delete, MCP Resources (#9) select + read, and Tags/Category drill-in all
  still behave exactly as before.
- `npm run typecheck` and `eslint` clean.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/uikit/SelectableRow/SelectableRow.tsx` | **NEW** — focus-aware selectable row primitive |
| `src/renderer/uikit/SelectableRow/index.ts` | **NEW** — barrel export |
| `src/renderer/uikit/index.ts` | export `SelectableRow` + `SelectableRowProps` |
| `src/renderer/ui/sidebar/FolderItem.tsx` | Root: shared base + row-hosted focus override; gray hover (#1) |
| `src/renderer/ui/sidebar/MenuBar.tsx` | `menubar-folders` ListBox → `selectionStyle="focus"` (#1) |
| `src/renderer/editors/notebook/TagsListView.tsx` | `renderItem` → `SelectableRow`; ListBox `selectionStyle="focus"` (#6) |
| `src/renderer/editors/todo/components/TodoListPanel.tsx` | `RowShell` → `SelectableRow`; `todo-lists-body` focusable; NAME_STYLE fontSize (#7) |
| `src/renderer/editors/mcp-inspector/ResourcesPanel.tsx` | resource + template rows → `SelectableRow`; list Panel focusable (#9) |
| `src/renderer/uikit/CategoryList/CategoryList.tsx` | `[data-part="row"]` base + container override; Root focusable (#2/3) |

*(Optional)* `src/renderer/uikit/SelectableRow/SelectableRow.story.tsx` + a `storyRegistry.ts` entry.

## Files that need NO changes

- `uikit/shared/selection-style.ts` — reused verbatim (no new fragments).
- `uikit/ListBox/ListBox.tsx`, `ListItem.tsx` — `selectionStyle="focus"` container gating already
  works for `renderItem` consumers (`data-focus-selection` + `tabIndex` set on the Root regardless
  of custom rows).
- `theme/color.ts` + `theme/themes/*` — no new tokens.
- `link-editor/panels/LinkTagsPanel.tsx`, `LinkHostnamesPanel.tsx` — unchanged; the `CategoryList`
  primitive edit flows through to both.
- `notebook/panels/NotebookTagsSecondaryView.tsx`, `todo/panels/TodoSecondaryView.tsx` — unchanged
  wrappers; the retrofit is inside the row components they mount.
