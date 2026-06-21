# US-749: Explorer "Open Board" row button

**Epic:** [EPIC-035 — Boards Anywhere](../../epics/EPIC-035.md)
**Depends on:** US-745 (`board-manifest.json`), US-748 (`persephone-board://` open scheme)
**Status:** Investigated — doc ready.

## Goal

On a `board-manifest.json` row in the Explorer file tree, add a **right-edge trailing icon button** (`BoardIcon`, "Open Board" tooltip). The row's normal click still opens the JSON in Monaco; the **button** opens the board through the `persephone-board://` link scheme (US-748). This makes US-748 the first link this task *produces*, and gives a teammate who receives a board folder a one-click way to open it.

## Background

### What US-748 already built (the consumer side)

US-748 wired the full open-by-link pipeline for a single board:

- `src/renderer/content/persephone-board-link.ts` — `encodePersephoneBoardLink(boardRoot)` / `decodePersephoneBoardLink(raw)` (base64-of-JSON `{ boardRoot }`, prefix `persephone-board://`).
- `parsers.ts` — a Layer-1 parser that recognizes the prefix, sets `data.url = data.href` + `data.target ??= "board-view"`, and forwards to `openLink`. No Layer-2 resolver (the `://` placeholder-pipe branch in `resolvers.ts` carries it through).
- `editors/board/index.tsx` `newEditorModel` — decodes the link and calls `model.initFromBoardRoot(boardRoot)` (single-board mode).
- `BoardEditorModel.matchesNavigationTarget` — reuses an open single-board instance when the same `boardRoot` is re-opened.
- `BoardEditorView` — single-board mode keys its trust gate on `boardTrust.useIsTrusted(model.boardRootOf(selectedBoard))`, so a **foreign / untrusted** board opened by link automatically renders `UntrustedBoardView` (Trust button), and a missing/non-board path renders `BoardNotFoundView`.

**So nothing in the open pipeline needs touching.** US-749 only needs a *producer*: a UI affordance that fires `openRawLink(encodePersephoneBoardLink(boardRoot))`. Trust, not-found, and instance-reuse are already handled downstream.

### The Explorer render path (where the button goes)

- `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` renders a `TreeProviderView` (line ~217) with a `FileTreeProvider`, passing `onItemClick`, `onItemDoubleClick`, `onContextMenu`. Normal file click (`handleItemClick`, line ~62) fires `app.events.openRawLink.sendAsync(createLinkData(provider.getNavigationUrl(item), { pageId, sourceId: "explorer" }))`.
- `src/renderer/components/tree-provider/TreeProviderView.tsx` — generic, reused by multiple providers (file tree, Mneme tree). Its `renderItem` callback (line ~269) renders a UIKit `TreeItem` per row. It already accepts a `getLabel?` prop (threaded from `TreeProviderViewProps`) — the model for adding a sibling `renderTrailing?` render-slot prop.
- `src/renderer/uikit/Tree/TreeItem.tsx` — the row primitive. Root is `display:inline-flex; align-items:center`, the `.label` span is `flex:1 1 auto` (so anything rendered after it is pushed to the right edge, before the Root's `paddingRight: spacing.sm`). **Today it has no trailing slot** — `ListItem.tsx` (sibling primitive) already has the `trailing?: React.ReactNode` pattern to mirror.
- `src/renderer/uikit/Tree/Tree.tsx` — the per-row wrapper `<div>` carries `onClick={() => model.onItemClick(idx)}` and `onDoubleClick` (line ~233). `content` (the `renderItem` output, i.e. `TreeItem`) is its child, so a click on a button *inside* `TreeItem` **bubbles to the row's `onClick`**. The trailing button must call `e.stopPropagation()` to keep the row's "open JSON in Monaco" behavior from also firing. The wrapper uses `onClick` (not `onMouseDown`), so stopping the click event is sufficient.

### Why a trailing button, not click-interception (C7)

`.persephone` / `.git` / `.mneme` folders *replace* their click behavior — `FileTreeProvider.list()` tags those items with a `target` (`"board-view"` / `"git-tree"` / `"mneme-root"`) and `getNavigationUrl()` returns an encoded link, so clicking the row opens the editor instead of expanding the folder. **We must NOT do that for `board-manifest.json`** — clicking the row must keep opening the JSON in Monaco (C7). The "open board" affordance is therefore a *separate* per-row action button, not a `target` on the item. Detection lives in the render slot (filename match), independent of the navigation `target` machinery.

### Board-root derivation

A `board-manifest.json` always sits at the board folder root, so the board root is the manifest's parent directory: `fpDirname(item.href)`. (`isBoardFolder`/`boardManifestPath` in `editors/board/board-manifest.ts` already encode this convention; `BOARD_MANIFEST_FILE = "board-manifest.json"`.)

## Recommended design

A generic render-slot on the tree, board-specific logic in the Explorer:

1. **UIKit `TreeItem`** gains a `trailing?: React.ReactNode` slot (mirrors `ListItem`), rendered right-aligned after the label.
2. **`TreeProviderView`** gains a `renderTrailing?: (item: ITreeProviderItem) => React.ReactNode` prop (mirrors `getLabel`), passed straight into each row's `TreeItem trailing`.
3. **`ExplorerSecondaryView`** supplies `renderTrailing`: for a non-directory row whose basename is `board-manifest.json`, return an `IconButton` (`BoardIcon`, "Open Board") that on click `stopPropagation()`s and fires `openRawLink(encodePersephoneBoardLink(fpDirname(item.href)))` with the same `{ pageId, sourceId: "explorer" }` context the row click uses — so the board opens in the Explorer's associated page, just like clicking a `.persephone` folder does.

Trust is **not** handled here: opening the link routes to single-board mode, whose existing in-view gate (US-747) shows `UntrustedBoardView` for a foreign board. This satisfies C7's "or shows the trust dialog if untrusted" without any Explorer-side trust code.

## Implementation plan

### Step 1 — `TreeItem` trailing slot (UIKit)

File: `src/renderer/uikit/Tree/TreeItem.tsx`

- Add to `TreeItemProps` (after `onChevronClick`):
  ```ts
  /** Optional right-aligned trailing content (e.g. a per-row action IconButton).
   *  Rendered after the label, which is `flex:1 1 auto` and pushes this to the row's
   *  right edge. The trailing content owns its own click handling — to avoid also
   *  triggering the row's onClick, its handlers should `stopPropagation()`. */
  trailing?: React.ReactNode;
  ```
- Destructure `trailing` in the component signature (before `...rest`).
- Render it after the `.label` span:
  ```tsx
  <span className="label">{labelNode}</span>
  {trailing != null && <span className="tree-trailing">{trailing}</span>}
  ```
- Add a style rule inside the `Root` styled block (alongside `"& > .label"`):
  ```ts
  "& > .tree-trailing": {
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
  },
  ```

### Step 2 — `renderTrailing` prop on `TreeProviderView`

File: `src/renderer/components/tree-provider/TreeProviderViewModel.ts`

- Add to `TreeProviderViewProps`:
  ```ts
  /** Optional per-row trailing content (right-aligned action slot). Receives the row's
   *  ITreeProviderItem; return null for rows without an action. */
  renderTrailing?: (item: ITreeProviderItem) => React.ReactNode;
  ```
  (Confirm `ITreeProviderItem` / `React` are imported in that file; add the type-only imports if not.)

File: `src/renderer/components/tree-provider/TreeProviderView.tsx`

- Destructure `renderTrailing` alongside `getLabel` from `viewProps` (line ~75).
- In `renderItem` (line ~269), pass it to `TreeItem`:
  ```tsx
  trailing={renderTrailing?.(node.data)}
  ```
- Add `renderTrailing` to the `renderItem` `useCallback` dependency array (currently `[getLabel, state.searchText, model]`).

### Step 3 — Explorer supplies the board button

File: `src/renderer/editors/explorer/ExplorerSecondaryView.tsx`

- Add import: `import { encodePersephoneBoardLink } from "../../content/persephone-board-link";`
  (`BoardIcon`, `IconButton`, `createLinkData`, `app`, `fpBasename`, `fpDirname`, `ITreeProviderItem`, `BOARD_MANIFEST_FILE`? — note: `BOARD_MANIFEST_FILE` is **not** yet imported; the file imports `isBoardFolder` from `../board/board-manifest`. Add `BOARD_MANIFEST_FILE` to that existing import.)
- Add a memoized render-slot callback (near `handleItemClick`):
  ```tsx
  const renderBoardButton = useCallback((item: ITreeProviderItem) => {
      if (item.isDirectory) return null;
      if (fpBasename(item.href).toLowerCase() !== BOARD_MANIFEST_FILE) return null;
      return (
          <IconButton
              name="explorer-open-board"
              size="sm"
              title="Open Board"
              icon={<BoardIcon />}
              onClick={(e) => {
                  e.stopPropagation();
                  const boardRoot = fpDirname(item.href);
                  app.events.openRawLink.sendAsync(
                      createLinkData(encodePersephoneBoardLink(boardRoot), {
                          pageId,
                          sourceId: "explorer",
                      }),
                  );
              }}
          />
      );
  }, [pageId]);
  ```
- Pass it to the `TreeProviderView`: add `renderTrailing={renderBoardButton}`.

### Step 4 — Verify

- `npm run lint` + `tsc` clean.
- Manual: in a folder tree containing a board, the `board-manifest.json` row shows a right-edge board icon button. Clicking the **row** opens the JSON in Monaco. Clicking the **button** opens the board (trusted → board renders; untrusted/foreign → `UntrustedBoardView`; missing folder can't occur from a live row). Re-clicking the button for an already-open board reuses the instance (`matchesNavigationTarget`).

## Concerns / open questions

- **C749-1 — Button visibility: always-visible vs hover-reveal. ✅ decided (user, 2026-06-21): always-visible.** "Open Board" is the primary affordance for a received board and benefits from being discoverable; manifest rows are rare, so there's no row-noise cost. The `TreeItem` trailing slot is rendered unconditionally — **no** hover-reveal CSS (`hideUntilParentHover` / `revealChildrenOnHover`) is added.
- **C749-2 — Trust handling: rely on the in-view gate vs pre-prompt from the Explorer. ✅ decided (user, 2026-06-21): rely on the single-board-mode in-view gate.** Opening the link shows `UntrustedBoardView` for a foreign board (zero Explorer-side trust code, identical to a `persephone-board://` link fired anywhere) — simpler, consistent with US-748, and satisfies C7. The Explorer button just fires the link; no `showTrustBoardDialog` call from the Explorer.
- **C749-3 — Seam location: generic `renderTrailing` prop vs board-specific code in `TreeProviderView`. ✅ decided (user, 2026-06-21): generic prop.** Keeps `TreeProviderView` (shared by the Mneme tree, etc.) free of board knowledge and puts board detection in the Explorer, mirroring the existing `getLabel` slot. Low-risk, additive UIKit change (`TreeItem.trailing`).
- **C749-4 — Detection by filename. ✅ confirmed (user, 2026-06-21).** Match `fpBasename(item.href).toLowerCase() === "board-manifest.json"`. Case-insensitive guards against a hand-renamed manifest on Windows; the canonical name is lowercase. A nested/misplaced `board-manifest.json` would still show the button, but `BoardNotFoundView` covers a non-board target downstream, so the failure mode is graceful.

## Acceptance criteria

1. A `board-manifest.json` row in the Explorer file tree shows a right-edge `BoardIcon` button with an "Open Board" tooltip.
2. Clicking the **row** opens the JSON in Monaco (unchanged behavior).
3. Clicking the **button** opens the board (single-board mode) and does **not** also open the JSON (propagation stopped).
4. A trusted board renders normally; a foreign/untrusted board shows `UntrustedBoardView` with a working Trust button.
5. Re-opening the same board reuses the open instance rather than creating a duplicate.
6. Non-manifest rows and folders show no trailing button.
7. The `TreeProviderView` change is generic (no board-specific code in it); the Mneme tree and any other consumer render unchanged (no trailing slot when `renderTrailing` is unset).
8. `tsc` and `npm run lint` are clean.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/uikit/Tree/TreeItem.tsx` | Add `trailing?: React.ReactNode` prop + right-aligned `.tree-trailing` slot |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Add `renderTrailing?` to `TreeProviderViewProps` |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | Thread `renderTrailing` into each row's `TreeItem trailing` |
| `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` | `renderBoardButton` slot detecting `board-manifest.json` → `openRawLink(encodePersephoneBoardLink(...))`; add `encodePersephoneBoardLink` + `BOARD_MANIFEST_FILE` imports |

## Files needing NO change (verified)

- `src/renderer/content/persephone-board-link.ts`, `parsers.ts`, `resolvers.ts`, `open-handler.ts` — full open pipeline already built in US-748.
- `src/renderer/editors/board/index.tsx`, `BoardEditorModel.ts`, `BoardEditorView.tsx`, `UntrustedBoardView.tsx`, `BoardNotFoundView.tsx` — single-board mode, trust gate, not-found, and instance reuse already handle the opened link.
- `src/renderer/content/tree-providers/FileTreeProvider.ts` — `board-manifest.json` must keep its default click (open JSON), so it gets **no** `target` enrichment; the button is purely a render-slot affordance.
- `src/renderer/api/board-trust.ts` — trust is consumed downstream, unchanged.
