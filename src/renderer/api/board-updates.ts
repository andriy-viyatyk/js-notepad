/**
 * Board update detection + safe-swap orchestration (EPIC-045 / US-865).
 *
 * Derives "a newer COMPATIBLE catalog version than what is installed" from the catalog ×
 * the install registry, and runs the update via board-install's `updateBoard` behind the
 * open-pages / busy precondition (close-pages dialog) required by the epic Design. Kept
 * separate from the toast (BoardEditorModel) and the sidebar (TrustedBoardsList) so the two
 * surfaces agree on what "an update" is and how it is applied.
 */
import { useMemo } from "react";
import { compareVersions } from "../../shared/version-utils";
import { fpNormalizeForCompare } from "../core/utils/file-path";
import type { PublishedBoardInfo } from "../../ipc/api-param-types";
import type { PageModel } from "./pages/PageModel";
import { app } from "./app";
import { ui } from "./ui";
import { publishedBoards } from "./published-boards";
import { boardInstallRegistry } from "./board-install-registry";
import { isBoardRootBusy } from "../editors/board/busy-boards";
import { BoardEditorModel } from "../editors/board/BoardEditorModel";
import { updateBoard } from "./board-install";

export interface BoardUpdate {
    /** Installed root (the board folder), original case. */
    root: string;
    /** Catalog board id. */
    id: string;
    installedVersion: string;
    latestVersion: string;
    /** The catalog entry for the latest version (fed to `updateBoard`). */
    entry: PublishedBoardInfo;
}

/**
 * Compute an update for one installed root (sync, non-reactive). Null when: the root is not
 * a catalog install, the catalog has no such id, the latest version is incompatible with the
 * running app, or the installed version is already current-or-newer.
 */
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

/**
 * Reactive map (normalized root → update) over BOTH the catalog and the install registry.
 * Drives the sidebar badge + context menu.
 */
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
                root: inst.root,
                id: inst.id,
                installedVersion: inst.version,
                latestVersion: cat.version,
                entry: cat,
            });
        }
        return map;
    }, [catalog, installed]);
}

/** Open pages whose MAIN editor runs the board at `root` (includes content-host boards —
 *  `BoardContentEditorModel extends BoardEditorModel`). Secondary-view panels ride the same
 *  page, so closing the page covers them. */
function boardPagesForRoot(root: string): PageModel[] {
    const key = fpNormalizeForCompare(root);
    return app.pages.pages.filter((p) => {
        const e = p.mainEditorInstance;
        return e instanceof BoardEditorModel
            && !!e.boardRoot
            && fpNormalizeForCompare(e.boardRoot) === key;
    });
}

/** True when the board at `root` has no running processes AND no open pages. */
export function isBoardIdle(root: string): boolean {
    return !isBoardRootBusy(root) && boardPagesForRoot(root).length === 0;
}

/**
 * Ensure the board is idle, closing its open pages with the user's consent. A busy board is
 * a hard stop — we never auto-kill running processes. Returns true when clear to swap.
 */
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
        // prompt still gets its say; a vetoed close (close() → false) aborts the update.
        for (const p of pages) {
            if (!(await p.close())) return false;
        }
    }
    return true;
}

/**
 * Preconditioned, user-consented update: ensure idle (close-pages dialog if needed) → swap
 * via `updateBoard`, re-checking idleness right before the swap (a page could reopen during
 * the download). Returns whether the swap happened. Never throws — surfaces via toasts.
 */
export async function runBoardUpdate(update: BoardUpdate): Promise<boolean> {
    if (!(await ensureBoardIdle(update.root))) return false;
    try {
        await ui.showProgress(
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
