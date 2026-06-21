# US-751: Sidebar "Tools & Editors" — Custom Boards & Editors tab + board management

**Epic:** [EPIC-035 — Boards Anywhere](../../epics/EPIC-035.md) · **Status:** Implemented — awaiting user testing

## Goal

Restructure the sidebar **"Tools & Editors"** panel into a pinned-on-top + tabbed-below
layout, and add a second tab — **"Custom Boards & Editors"** — that lists every
**trusted board**, grouped by its containing folder. Boards become **pinnable** (so they
appear in the Pinned region and in the header "add new page" dropdown alongside pinned
editors) and gain a **Remove** action that un-trusts the board **without deleting its folder
from disk**.

## Background

### Where this lives

"Tools & Editors" is **not** a secondary-view panel — it is one of the static left-list
entries inside the **MenuBar** (the hamburger sidebar):

- `src/renderer/ui/sidebar/MenuBar.tsx` — sidebar host; `staticFolders` includes
  `toolsEditorsId = "tools-editors"`; `renderRightList()` renders
  `<ToolsEditorsPanel onClose={onClose} />` for that id.
- `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx` — **the panel we restructure.** Today it
  is a single `ListBox` with two inline section markers: **"Pinned"** (draggable rows) and
  **"All Editors & Tools"** (unpinned, alpha-sorted). Rows are `CreatableItem`s; each row has
  a hover pin/unpin `IconButton`.
- `src/renderer/ui/sidebar/tools-editors-registry.ts` — `CreatableItem`
  (`{ id, label, icon?, create(), category }`), the static editor/tool list, and
  `getCreatableItems(browserProfiles)`. `DEFAULT_PINNED_EDITORS` is the default pin set.

### Pinning model (existing)

- Persisted in the **`pinned-editors`** settings key (`string[]` of `CreatableItem.id`),
  default `["script-js","script-ts","draw-view","grid-json","grid-csv","browser"]`
  (`settings.ts`). Read reactively via `settings.use("pinned-editors")`.
- Pin / unpin / reorder are direct `settings.get`/`settings.set` calls inside
  `ToolsEditorsPanel.tsx` (`handlePin` / `handleUnpin` / `handleMove`). Reorder uses a
  module-level `draggingPinnedEditorIndex` + a `dragOrderRef` for live drag.

### Header "add new page" dropdown (existing)

- `src/renderer/ui/tabs/PageTabs.tsx` — the `SplitButton` to the right of the tab strip.
  `addPageMenuItems` (a `useMemo`) maps `pinned-editors` → `MenuItem[]` (label + icon +
  `onClick: item.create`), then appends a **"Show All…"** item that calls
  `app.window.openMenuBar("tools-editors")`.

### Board trust registry (US-747 — what we read/mutate)

- `src/renderer/api/board-trust.ts` — singleton `boardTrust`. State = `{ paths: string[] }`
  (absolute board-root folders, original case). Backed by
  `<userData>/data/trustedBoards.txt`, one path per line. **Trust is never in the manifest or
  any in-board file (EPIC-035 C2).** Not exposed on `app` / any script `.d.ts`.
  - `load()` (lazy), `isTrusted(root)`, `useIsTrusted(root)` (reactive),
    `trust(root)`, **`untrust(root)`** (already implemented, comment cites US-751).
  - **Gap:** no public way to *enumerate* the list. We add one (see Step 4).

### Board identity / display

- `src/renderer/editors/board/board-manifest.ts` — `isBoardFolder(root)` (existence check),
  `readBoardManifest(root): BoardManifest | null` (`name?` is the display-name override,
  falls back to folder basename).
- `src/renderer/editors/board/board-icon-cache.ts` — `useBoardIcon(root)` +
  `getBoardIconPathSync(root)`; render via `<BoardGlyph boardRoot={root} />` (board's own
  `icon.{svg,png,ico}` or default glyph). This is the **pattern to mirror** for an
  async-resolve/sync-read board *name* cache.
- `src/renderer/content/persephone-board-link.ts` — `encodePersephoneBoardLink(root)`.

### Opening a board

- `src/renderer/api/boards.ts` — **`app.boards.openBoard(boardRoot)`** (US-750): guards
  `isBoardFolder` and **throws** if the folder is gone, then
  `app.openRawLink(encodePersephoneBoardLink(root))`.
- **The sidebar opens boards via the raw link directly**, *not* `openBoard` — see "Opening a
  board (sidebar)" below. The open pipeline (`initFromBoardRoot`) shows
  `BoardNotFoundView` ("Board not found") for a missing/non-board folder
  (`BoardEditorView.tsx`), which is exactly the desired UX for a stale trusted entry
  (resolves C751-2). `openBoard`'s guard is for the script/MCP API (a clear error for
  agents), where throwing is preferable.

### Patterns to reuse

- **Tabs:** `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx`
  (`items: ISegment[]`, controlled `value`/`onChange`). No tabbed sidebar panel exists yet —
  SegmentedControl is the right primitive.
- **Grouped list + section headers:** the existing `ToolsEditorsPanel` ListBox +
  `SectionMarker` pattern (a `{ kind:"section", label }` row, `section` trait → header).
- **Per-row context menu:** `ListBox` supports `getContextMenu?: (item, index) => MenuItem[]`
  (`uikit/ListBox/types.ts`) — used for the board "Remove" action. (`FileList` exposes the
  same prop if a flat list is preferred, but boards need folder grouping, so ListBox fits.)

## Recommended design

### Layout

`ToolsEditorsPanel` becomes a **column** of three regions:

```
┌──────────────────────────────────────┐
│ Pinned                                │  region 1 — flex, max-height: 50%, own scroll
│   📜 Script (JS)            [unpin]   │  (pinned editors, then pinned boards)
│   🟦 dev-clock              [unpin]   │
├──────────────────────────────────────┤
│ [ Editors & Tools ][ Custom Boards… ] │  region 2 — SegmentedControl (fixed height)
├──────────────────────────────────────┤
│ (active tab content — fills, scrolls) │  region 3 — flex={1}, own scroll
│  Tab 1: unpinned editors (current)    │
│  Tab 2: trusted boards, grouped:      │
│    D:\proj\persephone\.persephone\…   │
│        Board A          [pin] (⋮)     │
│        Board B          [pin] (⋮)     │
│    D:\js-notepad-notes\boards         │
│        dev-clock        [pin] (⋮)     │
└──────────────────────────────────────┘
```

- The **Pinned** region grows with its content up to `maxHeight: 50%` then scrolls
  internally. When empty, it collapses (no header, zero height).
- Region 3 fills the rest and scrolls independently.
- This is application chrome (`src/renderer/ui/`), so the chrome Emotion exception (UIKit
  Rule 7) applies — local `styled.div` for the three-region column + scroll containers is
  fine; primitives (`SegmentedControl`, `ListBox`, `IconButton`, `BoardGlyph`) stay UIKit.

### Pinning model — one unified list (resolved C751-1)

Pinned editors and pinned boards live in **one ordered list** so they interleave freely and
reorder across the type boundary (this also resolves C751-3). A small **wrapper type**
discriminates the two kinds:

```ts
// src/renderer/ui/sidebar/pinned-items.ts (new)
export type PinnedRef =
    | { kind: "editor"; id: string }     // a CreatableItem.id
    | { kind: "board"; root: string };   // an absolute board root
```

**Persistence:** keep the **existing `pinned-editors` settings key** (`string[]`) and overload
its entries — no migration, existing pins keep working:

- editor → the bare id, e.g. `"script-js"` (unchanged).
- board → `"board:" + absoluteRoot`, e.g. `"board:D:\\js-notepad-notes\\boards\\dev-clock"`.

`encodePin(ref)` / `decodePin(s)` convert between the union and the stored string (editor ids
never contain `":"`, so the `board:` prefix is unambiguous). A single `usePinnedRefs()` reads
`settings.use("pinned-editors")`, decodes it, and resolves each ref to a renderable row
(editor via `getCreatableItems` lookup; board via `BoardGlyph` + `fpBasename(root)`). Reorder /
pin / unpin operate on this one string array, so the Pinned region is **one list with one
index space** across both kinds.

> Optional cosmetic follow-up: rename the key to `pinned-items` with a one-time migration.
> Not done here — overloading the existing key avoids the migration entirely.

### Board display name

The display name is the board's **folder name** — `fpBasename(root)` — extracted
synchronously from the path that already keys the item. No manifest read, no cache, no async.
(The manifest's optional `name` override is intentionally not used here, matching the existing
project board switcher, which also labels boards by folder name. Resolved C751-4.)

## Implementation plan

### Step 1 — unified pinned-item wrapper
- Create `src/renderer/ui/sidebar/pinned-items.ts`: the `PinnedRef` union, `encodePin` /
  `decodePin`, and a `usePinnedRefs()` hook that reads `settings.use("pinned-editors")` and
  decodes it. No new settings key — the existing `pinned-editors` key now holds both bare
  editor ids and `board:<root>` entries (see "Pinning model").

### Step 2 — restructure `ToolsEditorsPanel.tsx`
- Wrap content in a chrome `styled.div` column with the three regions above.
- **Pinned region:** a scroll container (`maxHeight: 50%`, `overflowY: auto`) holding **one**
  `ListBox` driven by `usePinnedRefs()`. The `renderItem` switches on `ref.kind`: editor →
  existing `PinnedRow`; board → new `PinnedBoardRow` (`BoardGlyph` + `fpBasename(root)` + unpin
  button; click → `app.openRawLink(encodePersephoneBoardLink(root))`). Reorder operates on
  the single decoded string array. Hide the region entirely when the list is empty.
- **Tabs:** a `SegmentedControl` with `value` held in local `useState`
  (`"editors" | "boards"`), segments **"Editors & Tools"** and **"Custom Boards & Editors"**.
- **Region 3:** render the active tab:
  - **Editors tab** — the current **unpinned** editors `ListBox` (drop the now-moved "Pinned"
    section marker; keep the "All Editors & Tools" content; pin buttons still add to
    `pinned-editors`).
  - **Boards tab** — new `<TrustedBoardsList />` (Step 4).
- Pin/unpin/reorder all read-modify-write the one `pinned-editors` array via the
  `encodePin`/`decodePin` helpers (a board pin appends `"board:" + root`).

### Step 3 — expose the trusted list (recent.ts-style global model)
- `src/renderer/api/board-trust.ts` is **already** a `recent.ts` / `downloads.ts`-style global
  model: a singleton (`export const boardTrust`) with a `TGlobalState` (which extends
  `TOneState`) inside, subscribable via `state.use()`, plus a `load()` method. We only add the
  reactive list accessor — no new model, no auto-load magic:
  - `useTrustedPaths(): string[]` → `return this.state.use((s) => s.paths)` — React
    subscription, mirrors `recent.useFiles()`.
  - `listPaths(): string[]` → `this.state.get().paths` — sync, non-reactive convenience.
  - Keep `load()` / `isTrusted()` / `trust()` / `untrust()` as-is.
- **Consumers call `boardTrust.load()` when they need the list** — the boards tab
  (`TrustedBoardsList`) calls `void boardTrust.load()` in a mount effect, then reads
  `useTrustedPaths()`. The singleton's `TGlobalState` is shared, so any number of consumers
  see the same list; `load()` is idempotent and `trust`/`untrust` re-`load()` before writing,
  so concurrent use is race-safe.

### Step 4 — `TrustedBoardsList` (the boards tab body)
- New component in `src/renderer/ui/sidebar/` (e.g. `TrustedBoardsList.tsx`).
- On mount: `useEffect(() => { void boardTrust.load(); }, [])`.
- Read `boardTrust.useTrustedPaths()` + `usePinnedRefs()` (to show the pin state per row).
- Group paths by `fpDirname(root)`; sort folders, then boards within each folder by display
  name. Build a `ListBox` item array of `{ kind:"section", label: folderPath }` markers +
  board rows (mirror the editors-panel `RowSource`/`SectionMarker` shape).
- **Board row:** `BoardGlyph` + `fpBasename(root)` + hover pin/unpin button. Click →
  `app.openRawLink(encodePersephoneBoardLink(root))` (so a stale entry opens "Board not
  found" rather than throwing). Right-click via ListBox `getContextMenu` → **"Remove"**
  (untrust). No stale-path validation — all trusted paths render identically (C751-2).
- Empty state: "No trusted boards yet" (`Text size="sm" color="light"`).

### Step 5 — Remove (untrust) action
- "Remove" `MenuItem` → `await boardTrust.untrust(root)`; also strip `"board:" + root` from
  the `pinned-editors` array if present. **Never** touch the board folder on disk. No confirm
  dialog (non-destructive — re-trust on next open); a `app.ui.notify` toast is enough.

### Step 6 — header dropdown (`PageTabs.tsx`)
- Extend `addPageMenuItems`: decode `pinned-editors` via `usePinnedRefs()` and map **each**
  ref to a `MenuItem` in stored order — editors as today (label + icon + `item.create`),
  boards via `fpBasename(root)` + a board glyph icon,
  `onClick: () => app.openRawLink(encodePersephoneBoardLink(root))`. Keep the trailing
  "Show All…" item. (Consider it opening directly to the boards tab — see **C751-6**.)

## Concerns / open questions

- **C751-1 — Pinned region: one unified list. ✅ Resolved.** The Pinned region is a single
  `ListBox` holding both pinned editors and pinned boards, backed by the overloaded
  `pinned-editors` array + the `PinnedRef` wrapper. Lifted into its own `maxHeight:50%`
  scroll region above the tabs.

- **C751-2 — Stale trusted paths. ✅ Resolved.** No extra logic. All trusted paths render
  identically (no `isBoardFolder` validation, no greying). The row opens via the raw
  `persephone-board://` link, so a moved/deleted board opens the **"Board not found"** view
  (`BoardNotFoundView`); the user then removes it via the row's **Remove** context menu.

- **C751-3 — Cross-type pin ordering / board reorder. ✅ Resolved by C751-1.** One list →
  one index space, so editors and boards reorder freely across the type boundary with the
  existing drag mechanism (now operating on the unified `pinned-editors` array).

- **C751-4 — Board display name. ✅ Resolved.** No cache, no manifest read. The display name
  is `fpBasename(root)` (the board's folder name), extracted synchronously from the path that
  already keys each item — same as the existing project board switcher.

- **C751-5 — Confirm on Remove? ✅ Resolved.** No confirmation. Remove only drops the board
  from the trusted list (and from pins) — the folder stays on disk and the user can reopen it
  anytime. A toast ("Removed from trusted boards") confirms the action.

- **C751-6 — "Show All…" target. ✅ Resolved.** Keep one "Show All…" → opens the MenuBar to
  the **Editors** tab; the Boards tab is one segment-click away. No separate "Browse Boards…"
  item.

- **C751-7 — `boardTrust.load()` ownership. ✅ Resolved.** `board-trust` is already the
  `recent.ts` / `downloads.ts` global-model pattern — a singleton with a `TGlobalState`
  (a `TOneState`) exposed via `state.use()`, plus a `load()` method. We add `useTrustedPaths()`
  (reactive) + `listPaths()` (sync); **consumers call `boardTrust.load()` when they need the
  list** (the boards tab, on mount). The global state is shared across any number of
  consumers; `load()`/`trust`/`untrust` are race-safe.

## Acceptance criteria

1. The "Tools & Editors" panel shows a **Pinned** region on top (max-height 50%, scrolls when
   taller) and a **SegmentedControl** with two tabs below.
2. Tab 1 **"Editors & Tools"** shows the unpinned editor/tool list (pinning still works).
3. Tab 2 **"Custom Boards & Editors"** lists every trusted board, **grouped by containing
   folder**, each row showing the board's icon + name. Clicking a board opens it.
4. A board row can be **pinned**; pinned boards appear in the Pinned region **and** in the
   header "add new page" dropdown, and open on click from both.
5. A board row's context menu has **Remove**, which un-trusts the board (removed from the list
   and from pinned) **without deleting the folder from disk** (verify folder still exists).
6. Pins (the unified `pinned-editors` array — editors + `board:<root>` entries) persist across
   restart; `trustedBoards.txt` is the only trust source (no manifest writes).
7. `npm run lint` clean; no TypeScript errors.

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/ui/sidebar/pinned-items.ts` | **new** — `PinnedRef` union + `encodePin`/`decodePin` + `usePinnedRefs()` |
| `src/renderer/api/board-trust.ts` | add `listPaths()` + `useTrustedPaths()` |
| `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx` | restructure into Pinned region + tabs; pinned boards |
| `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | **new** — grouped trusted-board list + pin + Remove |
| `src/renderer/ui/tabs/PageTabs.tsx` | add pinned boards to the add-page dropdown |
