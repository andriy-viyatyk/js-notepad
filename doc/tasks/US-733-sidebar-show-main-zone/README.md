# US-733: Sidebar panel header — standardized "Show main view" zone-button

## Goal

Replace the ad-hoc "bring my main editor view to the page" icon-buttons that several
sidebar secondary-view panels render in their header `actions` with a single,
**standardized, always-visible zone-button** owned by the shared `SideBarPanelHeader`.
The zone sits at the **right edge** of the panel header, is **separated by a vertical
divider**, has a **distinct (lighter) background**, a **chevron-right icon**, and a
**hover effect** (background + icon color shift) so it reads as a recognizable button —
not another flat header glyph.

## Background

### The shared header

`src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` is the one header every sidebar
panel renders. It portals `icon` + truncating title group + an optional `actions` node
into the panel-stack header element (`[data-part="header"]`). Layout (left→right):

```
[icon]  [ title group — flex:1, min-width:0, truncates ]  [ actions — flex-shrink:0 ]
```

The header element is styled in `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx`:

- `[data-part="header"]`: `display:flex; align-items:center; gap:4; padding:2px 4px 2px 8px;
  min-height:27; background:color.background.dark; &:hover{ background:color.background.light }`,
  `cursor:pointer`, and an **onClick that toggles the panel** (line ~210).
- Click-through rule (lines ~120–130): label primitives portalled into the header get
  `pointer-events:none` so clicks fall through to the header's toggle; **interactive
  controls must re-assert `pointer-events:auto`** via an allowlist that currently matches
  `[data-type="button"]`, `[data-type="icon-button"]`, `[data-type="tag"][data-clickable]`.
  **A new zone element must carry a `data-type` added to this allowlist**, or it silently
  loses clicks. It must also `stopPropagation()` so clicking it doesn't toggle the panel.

`SideBarPanelHeader.tsx` lives under `src/renderer/ui/` → the **application-chrome
exception** to UIKit Rule 7 applies, so a local Emotion `styled` element for the zone is
permitted here (it must still use UIKit primitives for any sub-controls and `color.ts`
tokens — no hardcoded colors).

### The current "bring to main" buttons (to be replaced by the zone)

All four render an `IconButton` in their `actions` slot. Three gate visibility on
`isMainEditor` (read via `useOptionalState(model.page?.state, () => model.isMain, false)`)
— **this is exactly the "hides when already main" behavior the task removes.**

| Panel | File | Icon today | onClick | Visibility today |
|-------|------|-----------|---------|------------------|
| Boards | `editors/board/BoardListSecondaryView.tsx` (~L41–99) | `ChevronRightIcon` | `if(!isMainEditor) page.promoteSecondaryToMain(model); selectBoard(undefined)` | `!isMainEditor \|\| selectedBoard` |
| Branches & Tags | `editors/git-tree/GitBranchesSecondaryView.tsx` (~L163–177) | `GitIcon` | `model.showGitTree()` (fires `openRawLink` w/ `git-tree://`, nav-reuse) | always visible |
| Collections (Links) | `editors/link-editor/panels/LinkCategorySecondaryView.tsx` (~L51–80) | `ChevronRightIcon` | `page.promoteSecondaryToMain(editor)` | `!isMainEditor` (Save button independent, stays) |
| Mneme tree | `editors/mneme-root/MnemeTreeSecondaryView.tsx` (~L59–70) | `ChevronRightIcon` | `page.promoteSecondaryToMain(model)` | `!isMainEditor` |

`promoteSecondaryToMain(model)` (`api/pages/PageModel.ts` ~L425) **toggles**: it promotes
the editor to main, but if it's *already* main it calls `setMainEditor(null)` (demote).

### Theme tokens (verified present in `color.ts`)

- `color.background.overlay` / `color.background.overlayHover` — raised-surface bg + its hover
- `color.background.dark` (header bar bg) / `color.background.light` (header hover bg)
- `color.icon.light` (muted) / `color.icon.default` (brighter) — icon resting/hover
- `color.border.light` — the vertical divider

`ChevronRightIcon` is exported from `src/renderer/theme/icons.tsx` (already used by 3 of the 4 panels).

## Implementation plan

### 1. Add the zone to the shared header — `SideBarPanelHeader.tsx`

- Add three props to `SideBarPanelHeaderProps`:
  - `onShowMain?: () => void` — when provided, render the zone-button at the far right.
  - `showMainTitle?: string` — tooltip text (default e.g. `"Show in main view"`).
  - `showMainActive?: boolean` — `true` when this editor is already the page's main view.
    Drives the "selected" indicator (blue chevron) on the zone. Consumers pass `isMainEditor`.
- Add a local Emotion `styled.button` `ShowMainZone` (chrome exception allows it here):
  - `align-self: stretch` so it fills the full header height (parent is `align-items:center`).
  - Negative margins to bleed to the header's top/bottom/right edges and cancel the header
    padding: `margin: -2px -4px -2px 0` (header padding is `2px 4px 2px 8px`).
  - `border-left: 1px solid ${color.border.light}` — the vertical divider.
  - `padding: 0 var(spacing)`; centered flex; `& > svg { width:14; height:14 }`.
  - **Match the header bar** (C-3): resting `background: color.background.dark` (same as
    the header), hover `&:hover { background: color.background.light }` (same as the header's
    hover). Because the zone paints its own `background.dark`, the header's hover-lightening
    does **not** bleed onto it — so hovering the header lightens only the header, zone stays dark.
  - Icon color still shifts on hover: resting `color: color.icon.light`, `&:hover { color: color.icon.default }`.
  - **Selected indicator (when already main):** set `data-active` on the zone from
    `showMainActive`, and make the chevron **blue** in that state —
    `'&[data-active], &[data-active]:hover { color: color.misc.blue }'` (active color wins over
    the hover shift). This is the same blue the open panel header already uses for its active
    indicator (`color.misc.blue`), so the zone's "selected" state matches the panel chrome.
    Click is still a no-op when active (C-1) — the blue is purely a status cue.
  - Carry **`data-type="sidebar-show-main"`** (and `data-name`, and `data-active` when active)
    on the button.
  - onClick: `(e) => { e.stopPropagation(); onShowMain(); }`.
  - Icon: always `ChevronRightIcon` (uniform across panels — the standardization point).
- Render order in the portal: `{icon}` → title group → `{actions && (…)}` → **zone last**
  (rightmost, after any remaining `actions` buttons). Wrap with a UIKit `Tooltip` using
  `showMainTitle` (or pass a native `title` — pick Tooltip for consistency with other chrome).

### 2. Wire the zone into the header element — `CollapsiblePanelStack.tsx`

Two edits to the `[data-part="header"]` styling:

- **Click-through:** add `[data-type="sidebar-show-main"]` to the `pointer-events:auto`
  allowlist selector (the rule at ~L129 alongside `button` / `icon-button` / clickable `tag`).
  Without this the zone is covered by the click-through `pointer-events:none` rule and loses
  its clicks.
- **Mutual-exclusion hover (C-3):** change the header hover rule (currently
  `'& [data-part="header"]:hover': { backgroundColor: color.background.light }`) to **not**
  fire when the zone is the hovered element:
  ```
  '& [data-part="header"]:hover:not(:has([data-type="sidebar-show-main"]:hover))':
      { backgroundColor: color.background.light }
  ```
  So hovering the zone lightens only the zone (header stays `dark`), and hovering the header
  lightens only the header (zone stays `dark`, painted by its own bg). `:has()` is supported
  in the bundled Chromium; for panels with no zone, `:has()` matches nothing and the rule
  behaves exactly as today (fully backward compatible).

### 3. Retrofit the four consumers

For each: **remove** the show-main `IconButton` from `actions`, **remove** the
`isMainEditor`-based *visibility* gating of that button, and pass `onShowMain`,
`showMainActive={isMainEditor}` (+ optional `showMainTitle`) to `SideBarPanelHeader`. Keep
all *other* action buttons in `actions`. Each panel keeps its `isMainEditor` value
(`useOptionalState(model.page?.state, () => model.isMain, false)`) — now used for the no-op
guard **and** the `showMainActive` indicator instead of for visibility. Git Branches doesn't
read `isMainEditor` today; add that computation so it can pass `showMainActive`.

- **Boards** (`BoardListSecondaryView.tsx`): `onShowMain={() => { if (!isMainEditor)
  boardModel.page?.promoteSecondaryToMain?.(boardModel); boardModel.selectBoard(undefined); }}`.
  Drop `showBack`/the `ChevronRightIcon` button. Keep `isMainEditor` only for the guard.
- **Branches & Tags** (`GitBranchesSecondaryView.tsx`): `onShowMain={() => model.showGitTree()}`,
  `showMainTitle="Show Git Tree"`. Remove the `git-branches-show-tree` `IconButton` (and its
  `GitIcon` import if now unused). Keep sort-alpha / close / other buttons in `actions`.
  Note: this **changes the glyph from `GitIcon` to the standard chevron** — intended for consistency.
- **Collections** (`LinkCategorySecondaryView.tsx`): `onShowMain` guarded promote (see C-1).
  Keep the Save `IconButton` in `actions` (it's gated by `modified`, unrelated to this zone).
- **Mneme** (`MnemeTreeSecondaryView.tsx`): `onShowMain` guarded promote, `showMainTitle="Open Mneme search"`.

### 4. Verify

`npm run lint`; open each of the four panels in the app; confirm the zone is always
visible (including when that editor is already the main view), divider + lighter bg +
hover are correct, and clicking promotes/navigates to the main view without toggling the
panel collapse.

## Concerns / Open questions — all RESOLVED

- **C-1 — Already-main behavior → RESOLVED: no-op.** Clicking the zone while the editor is
  already the main view does **nothing** (idempotent). Implement via the `if (!isMainEditor)
  promote()` guard: Boards already does this; apply the same guard to Collections and Mneme.
  Git Branches uses `showGitTree()`/nav-reuse, which already just focuses the existing tree.

- **C-2 — Uniform chevron → RESOLVED: uniform.** All four panels use the same
  `ChevronRightIcon`. Branches & Tags drops its `GitIcon` (and the import if now unused). No
  per-panel icon override.

- **C-3 — Zone background → RESOLVED: match the header.** Zone bg = `color.background.dark`
  (header bar), zone hover = `color.background.light` (header hover). Header and zone are
  mutually exclusive on hover (step 2): only the hovered region lightens; the other stays dark.

- **C-4 — Scope → RESOLVED: standalone task (no epic).** The Boards panel touch is incidental
  and does not pull the task under EPIC-034's deferred-review model.

- **C-5 — Other panels → RESOLVED: change all four.** The zone is added to exactly the four
  panels that have a "show main" affordance today (Boards, Branches & Tags, Collections, Mneme).
  Panels with no such button (Explorer/Search/Changes/Diff/Archive/Tags/Hostnames) are untouched.

## Acceptance criteria

- [ ] The four panels (Boards, Branches & Tags, Collections, Mneme) show a distinct,
      always-visible zone-button at the right edge of the header.
- [ ] The zone has a left vertical divider, a lighter/distinct background, a chevron-right
      icon, and a hover effect (background + icon color change).
- [ ] The zone is visible even when that editor is already the main view (no more hiding).
- [ ] When that editor **is** the main view, the chevron is **blue** (`color.misc.blue`) as a
      selected/status cue, and clicking is a **no-op**.
- [ ] Clicking the zone when not main brings the editor's main view onto the page, and does
      **not** toggle the panel's collapse state.
- [ ] No other header actions (Save on Collections; sort/close on Branches; etc.) are lost.
- [ ] `npm run lint` passes; no hardcoded colors; tokens from `color.ts` only.
