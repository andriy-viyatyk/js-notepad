# US-865 — Board updates: version compare, activation toast, safe re-install, sidebar badges

**Epic:** [EPIC-045 — Published Boards Catalog](../../epics/EPIC-045.md)
**Status:** Active (implementation not started)

## Goal

Close the update loop for catalog-installed boards: silently detect when the catalog
advertises a newer compatible version than what is installed, surface it as an
**"Update available"** badge in the Custom Boards & Editors sidebar, nudge the user with a
one-time toast the next time they actually open the board, and perform the update as a
**safe folder swap** guarded by an open-pages / busy precondition — never losing trust or
pins, never destroying a working board on a failed download.

## Background

The install engine (US-863) already downloads + verifies + swaps; this task wires the
**detection + surfacing + preconditioned action** on top of it. Everything below already
exists and needs no change unless noted.

### What already exists (do NOT rebuild)

| Piece | File | Notes |
|-------|------|-------|
| Catalog (reactive, renderer) | `src/renderer/api/published-boards.ts` | `useCatalog()`, `getCatalog()`, `isCompatible(minAppVersion)`; `compareVersions` already imported from `src/shared/version-utils.ts` |
| Install registry | `src/renderer/api/board-install-registry.ts` | `getByRoot`, `getById`, `useInstalled()`, `record`, `remove`; `InstalledBoardEntry.lastNotifiedVersion?` field is **already declared and reserved for US-865** and is preserved by `parse()` (extra fields pass through) |
| Swap engine | `src/renderer/api/board-install.ts` → `updateBoard(entry)` | temp-extract → staging → rename-swap → rollback on failure → `boardInstallRegistry.record(new version)`. **Performs the swap only** — the precondition is US-865's job (per epic Design). |
| Board root accessor | `src/renderer/editors/board/BoardEditorModel.ts` → `get boardRoot()` | Inherited by `BoardContentEditorModel`, so content-host boards (drawio-viewer) are covered. |
| Main-frame load signal | `BoardEditorModel.markFrameLoaded(tab)` | Called by `BoardWebview` when a frame finishes loading + registers for CDP. `BOARD_CDP_TAB` = the main frame; secondary frames pass their own tab id. Fires on open **and** reload. |
| Busy registry | `src/renderer/editors/board/busy-boards.ts` → `isBoardRootBusy(root)` | Sync check. |
| Clickable toast | `src/renderer/api/ui.ts` → `ui.notify(msg, type)` | Returns a Promise resolving to `"clicked"` when the toast body is clicked, `undefined` on dismiss (precedent: `RendererEventsService.handleUpdateAvailable`). |
| Page scan precedent | `src/renderer/api/boards.ts` → `renameBoard` (lines ~122-136) | Exact pattern: iterate `app.pages.pages`, `page.mainEditorInstance instanceof BoardEditorModel && fpNormalizeForCompare(editor.boardRoot) === key`. |
| Sidebar list | `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | Renders the whole trust registry via `BoardsTree`; `renderTrailing` (currently the pin button) + `getBoardContextMenu` (currently "Remove") are the extension slots. In `src/renderer/ui/` → chrome exception to UIKit Rule 7. |
| Progress helper | `ui.showProgress(promise, label)` | Wraps a promise with a modal progress spinner. |

### Key facts that shape the design

- **`updateBoard` already handles same-root re-install:** `downloadBoard` routes a same-id
  re-download into `updateBoard`. US-865 only calls `updateBoard` directly (with a new
  pre-swap guard) and never touches `downloadBoard`.
- **`markFrameLoaded` fires per frame, on every (re)load.** Gate the update check on
  `tab === BOARD_CDP_TAB` (main frame only). The once-per-`version` dedup is the
  `lastNotifiedVersion` gate — no separate session flag is needed (after an update the
  board reloads, versions now match, so `getBoardUpdate` returns null → no re-toast).
- **US-867 is NOT built yet** (Board Info *properties* mode + version list + "Open board").
  The epic Design says the toast click "opens the Board Info page" — but that page's
  properties mode does not exist in US-865. See Concern 1 for the resolved click target.

## Implementation plan

### Step 1 — New module `src/renderer/api/board-updates.ts` (update derivation + preconditioned action)

Central place for "is there an update for this root, and run it safely". Keeps the
derivation out of both the toast (model) and the sidebar (view) so they agree.

```ts
/**
 * Board update detection + safe-swap orchestration (EPIC-045 / US-865). Derives
 * "a newer COMPATIBLE catalog version than what is installed" from the catalog ×
 * install registry, and runs the update via board-install's `updateBoard` behind the
 * open-pages / busy precondition (close-pages dialog) required by the epic Design.
 */
import { useMemo } from "react";
import { compareVersions } from "../../shared/version-utils";
import { fpNormalizeForCompare } from "../core/utils/file-path";
import type { PublishedBoardInfo } from "../../ipc/api-param-types";
import { publishedBoards } from "./published-boards";
import { boardInstallRegistry } from "./board-install-registry";

export interface BoardUpdate {
    root: string;              // installed root (original case)
    id: string;                // catalog id
    installedVersion: string;
    latestVersion: string;
    entry: PublishedBoardInfo; // catalog entry (latest)
}

/** Compute an update for one installed root (sync, non-reactive). Null when: not a
 *  catalog install, catalog has no such id, latest is incompatible, or already current. */
export function getBoardUpdate(root: string): BoardUpdate | null {
    const inst = boardInstallRegistry.getByRoot(root);
    if (!inst) return null;
    const cat = publishedBoards.getCatalog().find((b) => b.id === inst.id);
    if (!cat) return null;
    if (!publishedBoards.isCompatible(cat.minAppVersion)) return null;
    if (compareVersions(cat.version, inst.version) <= 0) return null;
    return {
        root: inst.root,
        id: inst.id,
        installedVersion: inst.version,
        latestVersion: cat.version,
        entry: cat,
    };
}

/** Reactive map (normalized root → update) over BOTH the catalog and the install
 *  registry. For the sidebar badge + context menu. */
export function useBoardUpdates(): Map<string, BoardUpdate> {
    const catalog = publishedBoards.useCatalog();
    const installed = boardInstallRegistry.useInstalled();
    return useMemo(() => {
        const map = new Map<string, BoardUpdate>();
        for (const inst of installed) {
            const cat = catalog.find((b) => b.id === inst.id);
            if (!cat) continue;
            if (!publishedBoards.isCompatible(cat.minAppVersion)) continue;
            if (compareVersions(cat.version, inst.version) <= 0) continue;
            map.set(fpNormalizeForCompare(inst.root), {
                root: inst.root, id: inst.id,
                installedVersion: inst.version, latestVersion: cat.version, entry: cat,
            });
        }
        return map;
    }, [catalog, installed]);
}

/** True when the board at `root` has no running processes AND no open pages. */
export function isBoardIdle(root: string): boolean { /* see below */ }

/** Preconditioned, user-consented update. Returns whether the swap happened. */
export async function runBoardUpdate(update: BoardUpdate): Promise<boolean> { /* see below */ }
```

`isBoardIdle` + page scan (static import of `BoardEditorModel` is safe — the cycle is
one-directional: `BoardEditorModel` dynamically imports `board-updates`, not vice-versa;
but follow the `boards.ts` dynamic-import style for `app`/dialogs to keep the core bundle
lean):

```ts
import { app } from "./app";
import { ui } from "./ui";
import { isBoardRootBusy } from "../editors/board/busy-boards";
import { BoardEditorModel } from "../editors/board/BoardEditorModel";
import { updateBoard } from "./board-install";
import type { PageModel } from "./pages/PageModel";

function boardPagesForRoot(root: string): PageModel[] {
    const key = fpNormalizeForCompare(root);
    return app.pages.pages.filter((p) => {
        const e = p.mainEditorInstance;
        return e instanceof BoardEditorModel
            && !!e.boardRoot
            && fpNormalizeForCompare(e.boardRoot) === key;
    });
}

export function isBoardIdle(root: string): boolean {
    return !isBoardRootBusy(root) && boardPagesForRoot(root).length === 0;
}

/** Ensure the board is idle, closing its open pages with the user's consent. A busy board
 *  is a hard stop (we never auto-kill running processes). Returns true when clear to swap. */
async function ensureBoardIdle(root: string): Promise<boolean> {
    if (isBoardRootBusy(root)) {
        void ui.notify("This board is currently running. Stop it before updating.", "warning");
        return false;
    }
    const pages = boardPagesForRoot(root);
    if (pages.length) {
        const { showConfirmationDialog } = await import("../ui/dialogs/ConfirmationDialog");
        const choice = await showConfirmationDialog({
            title: "Board is open",
            message:
                `This board is open in ${pages.length} page(s) and must be closed before ` +
                `updating. Close them and continue?`,
            buttons: ["Close pages & continue", "Cancel"],
        });
        if (choice !== "Close pages & continue") return false;
        // Close via the normal page-close flow so a content-host board's unsaved-changes
        // prompt still gets its say; a vetoed close aborts the whole update.
        for (const p of pages) {
            const closed = await p.close();      // ⚠ verify close() return contract (Step 1a)
            if (closed === false) return false;
        }
    }
    return true;
}

export async function runBoardUpdate(update: BoardUpdate): Promise<boolean> {
    if (!(await ensureBoardIdle(update.root))) return false;
    try {
        await ui.showProgress(
            // Re-check idleness right before the swap (a page could reopen during download).
            updateBoard(update.entry, { preSwap: async () => isBoardIdle(update.root) }),
            `Updating ${update.entry.name}…`,
        );
        void ui.notify(`Updated ${update.entry.name} to v${update.latestVersion}.`, "success");
        return true;
    } catch (err) {
        void ui.notify(`Update failed: ${(err as Error).message}`, "error");
        return false;
    }
}
```

**Step 1a — verify `PageModel.close()`'s return/veto contract** before wiring
`ensureBoardIdle`. Read `src/renderer/api/pages/PageModel.ts` `close`: if it returns
`Promise<void>` (fire-and-forget with an internal `confirmRelease`), adapt — either await
a boolean it exposes or call `mainEditorInstance.confirmRelease(true)` explicitly before
`close()` and abort on `false`. Do NOT assume the boolean shape above without checking.

### Step 2 — `board-install.ts`: add the pre-swap guard to `updateBoard`

The Design requires the precondition be **re-checked before the swap** (a page may reopen
mid-download). Thread an optional guard in; keep the download/staging/rollback logic intact.

```ts
export async function updateBoard(
    entry: PublishedBoardInfo,
    opts?: { preSwap?: () => Promise<boolean> },
): Promise<string> {
    // …unchanged: resolve existing root, download to tempZip, extract to stagingDir,
    //   readBoardManifest(stagingDir) validation…

    // NEW — right before "Swap: move old aside…", after manifest validation:
    if (opts?.preSwap && !(await opts.preSwap())) {
        throw new Error("Board was reopened during the update — aborted (nothing changed).");
    }

    // …unchanged swap + rollback + registry.record + finally cleanup…
}
```

The `finally` already deletes `stagingDir` + `tempZip`, so an aborted pre-swap leaves the
working board untouched and no scratch behind.

### Step 3 — `board-install-registry.ts`: `setLastNotified`

The per-board+version toast gate lives in `installedBoards.json` (renderer-side — same
place the trigger runs, no IPC round-trip, per the epic Design).

```ts
/** Record the version we last toasted an update for (US-865 toast dedup). No-op if the
 *  id is not installed. */
async setLastNotified(id: string, version: string): Promise<void> {
    await this.load();
    const entries = this.state.get().entries.map((e) =>
        e.id === id ? { ...e, lastNotifiedVersion: version } : e,
    );
    this.state.update((s) => { s.entries = entries; });
    await this.persist(entries);
}
```

(`parse()` already carries `lastNotifiedVersion` through untouched — it filters on
id/root/version only and returns the raw objects.)

### Step 4 — `BoardEditorModel.ts`: the activation toast

Fire the check when the **main** frame finishes loading (covers open + reload). Content-host
boards inherit this via `BoardContentEditorModel`.

```ts
markFrameLoaded(tab: string): void {
    this.loadedTabs.add(tab);
    this.frameLoadWaiters = this.frameLoadWaiters.filter((w) => {
        if (w.tab !== tab) return true;
        w.resolve(true);
        return false;
    });
    // US-865: nudge once per board+version when the board is actually opened/reloaded.
    if (tab === BOARD_CDP_TAB) void this.maybeNotifyUpdate();
}

/** One-time (per board+version) "update available" toast. Best-effort — never throws into
 *  the load path. Click → runs the update (Concern 1). */
private async maybeNotifyUpdate(): Promise<void> {
    const root = this.state.get().boardRoot;
    if (!root) return;
    try {
        const { publishedBoards } = await import("../../api/published-boards");
        const { boardInstallRegistry } = await import("../../api/board-install-registry");
        const { getBoardUpdate, runBoardUpdate } = await import("../../api/board-updates");
        const { ui } = await import("../../api/ui");

        await publishedBoards.load();          // idempotent; serves cached catalog offline
        await boardInstallRegistry.load();
        const update = getBoardUpdate(root);
        if (!update) return;

        const entry = boardInstallRegistry.getByRoot(root);
        if (entry?.lastNotifiedVersion === update.latestVersion) return;  // already toasted
        await boardInstallRegistry.setLastNotified(update.id, update.latestVersion);

        const clicked = await ui.notify(
            `An update for "${update.entry.name}" is available (v${update.latestVersion}). ` +
            `Click to update.`,
            "info",
        );
        if (clicked === "clicked") await runBoardUpdate(update);
    } catch { /* best-effort: a catalog/registry hiccup must not break board load */ }
}
```

Use dynamic imports (not top-level) to avoid an import cycle (`board-updates` statically
imports `BoardEditorModel`).

### Step 5 — `TrustedBoardsList.tsx`: update badge + "Update" context-menu item

Add `useBoardUpdates()`; surface the update in the tree's trailing slot (alongside the pin)
and the context menu. Keep everything else (open, pin, Remove) unchanged.

- `const updates = useBoardUpdates();` then `const update = updates.get(fpNormalizeForCompare(root));`
- **Trailing:** when `update` exists, render a small clickable **`Tag`** ("Update") before
  the pin `IconButton`, `onClick` → `void runBoardUpdate(update)` (stopPropagation). Wrap
  the Tag + pin in a `Panel direction="row" gap="xs"`. `trailingVisible(root)` must return
  `true` when an update exists (so the badge stays visible even when unpinned).
- **Context menu:** prepend `{ label: "Update", onClick: () => void runBoardUpdate(update) }`
  when `update` exists (keep "Remove").
- Import `fpNormalizeForCompare` from `../../core/utils/file-path`, `runBoardUpdate` +
  `useBoardUpdates` from `../../api/board-updates`, `Tag` + `Panel` from `../../uikit`.
- Ensure the catalog + registry are loaded on mount so the badge shows without opening a
  board: add `void publishedBoards.load(); void boardInstallRegistry.load();` to the
  existing mount `useEffect` (both idempotent).

No catalog/"available" content is added to the sidebar — it stays installed/registered-only
(epic Concern 7).

## Concerns / open questions

1. **Toast/badge click target — RESOLVED: run the update directly.** The epic Design's
   final target is the Board Info **properties** page (US-867), which does not exist yet.
   For US-865 the toast click and the sidebar Tag/menu both invoke `runBoardUpdate`
   directly — self-contained, testable now, and the natural intent ("Click to update").
   When US-867 lands it may repoint the toast click (and add a Properties action) to open
   the version-history page instead; the `runBoardUpdate` action itself stays. Documented
   so the follow-up is a deliberate re-point, not a surprise.
2. **Busy board — RESOLVED: hard stop, no auto-kill.** A board with running processes is
   refused with a warning toast (the user must stop it). Only open (non-busy) pages get the
   "Close pages & continue" flow. Auto-killing a running board's processes to update it is
   too destructive and not requested by the Design ("must not be busy … and must have no
   open pages" — two distinct conditions).
3. **`PageModel.close()` veto contract — VERIFY in Step 1a.** The close-and-continue path
   must honor a content-host board's unsaved-changes prompt and abort the update if the
   user cancels the close. Confirm the exact return/veto shape before wiring; do not assume.
4. **Toast timing.** Fires on main-frame load (open + reload), not on bare tab
   re-activation. Acceptable: the `lastNotifiedVersion` gate means at most one toast per
   board+version regardless, and a board the user never opens never toasts (the Design's
   explicit requirement).

## Acceptance criteria

- Re-publishing drawio-viewer as a newer version (already live: **v1.0.1**) makes the
  **"Update available"** badge appear on that board in the Custom Boards & Editors sidebar
  within one catalog cycle (or immediately on force-refresh via About → Check for Updates),
  **only if** the newer version is compatible with the running app (`minAppVersion`).
- The update **toast** appears the next time the board is opened/activated — exactly once
  per board+version — and never for boards the user does not open.
- Clicking the toast, the sidebar **Update** context item, or the sidebar **Tag** performs
  the update: a folder swap that preserves trust and pins and updates the install registry
  to the new version; a failed download leaves the working board intact.
- If the board is **busy**, the update is refused with a clear message; if it is **open in
  any page**, a dialog offers **Close pages & continue** (honoring unsaved-content prompts)
  and a veto aborts with nothing changed. The idle precondition is re-checked before the
  swap.
- An incompatible newer version never shows a badge, never toasts, and never counts as an
  available update (while an older compatible version stays installable via US-867).
- `npx tsc --noEmit` and `npx eslint` pass on all changed files.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/api/board-updates.ts` | **New** — `getBoardUpdate`, `useBoardUpdates`, `isBoardIdle`, `runBoardUpdate` (+ private `ensureBoardIdle`, `boardPagesForRoot`) |
| `src/renderer/api/board-install.ts` | `updateBoard` gains optional `{ preSwap }` guard, checked before the swap |
| `src/renderer/api/board-install-registry.ts` | Add `setLastNotified(id, version)` |
| `src/renderer/editors/board/BoardEditorModel.ts` | `markFrameLoaded` (main tab) → new `maybeNotifyUpdate()` |
| `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | Update badge (Tag) in trailing + "Update" context item; load catalog/registry on mount |

## Files that need NO changes (do not investigate)

- `src/renderer/api/published-boards.ts` — `useCatalog`/`getCatalog`/`isCompatible` are sufficient.
- `src/main/published-boards-service.ts` — catalog fetch/cache already done (US-862).
- `src/renderer/editors/board/busy-boards.ts` — `isBoardRootBusy` is sufficient.
- `src/renderer/editors/board/BoardContentEditorModel.ts` — inherits `boardRoot` + `markFrameLoaded`.
- `src/renderer/editors/board/BoardsTree.tsx` — `renderTrailing`/`getBoardContextMenu`/`trailingVisible` slots are already sufficient.
- `src/renderer/api/ui.ts` — `notify` (clicked contract) + `showProgress` already exist.
- Any `board-info` / hub / Board Info properties files — those are US-864 (done) / US-867 / US-870.
