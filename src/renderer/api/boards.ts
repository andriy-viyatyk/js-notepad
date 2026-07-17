import { app } from "./app";
import { fs } from "./fs";
import type { IBoards } from "./types/boards";

/**
 * `app.boards` — board lifecycle for scripts / agents (EPIC-035 / US-750).
 *
 * `createBoard` / `createDemoBoard` wrap the editor-independent
 * `createBoardFromTemplate` (which scaffolds the template, guarantees
 * `board-manifest.json`, and auto-trusts the board — EPIC-035 C5). `openBoard`
 * opens an existing board by its root path through the generic `app.openRawLink`
 * pipeline (encoding the `persephone-board://` link internally). Editor-adjacent
 * modules are reached via dynamic `import()` so the core `api` bundle stays
 * decoupled (C750-6).
 *
 * `registerBoard` / `unregisterBoard` / `renameBoard` (EPIC-045 / US-868) are the
 * lifecycle triples for agents: register requests trust via the user's dialog (never
 * self-trusts), unregister untrusts + unpins, rename moves a trusted board to a new
 * folder carrying its trust/pin/install registration along with no dialog.
 */
async function create(name: string, dir: string, template: string): Promise<string> {
    // Ensure the container exists (recursive; no-op if present) so creating into a
    // not-yet-existing path works without a separate mkdir (C750-5).
    await fs.mkdir(dir);
    const { createBoardFromTemplate } = await import("../editors/board/board-scaffold");
    return createBoardFromTemplate(name, dir, template);
}

export const boards: IBoards = {
    createBoard: (name, dir) => create(name, dir, "board-template"),
    createDemoBoard: (name, dir) => create(name, dir, "demo-board"),
    openBoard: async (boardRoot: string) => {
        const { isBoardFolder } = await import("../editors/board/board-manifest");
        if (!(await isBoardFolder(boardRoot))) {
            throw new Error(`Not a board: "${boardRoot}" is missing or has no board-manifest.json.`);
        }
        // Encode the persephone-board:// link in one tested place and open it via
        // the generic pipeline (US-748). The agent never builds the link by hand.
        const { encodePersephoneBoardLink } = await import("../content/persephone-board-link");
        await app.openRawLink(encodePersephoneBoardLink(boardRoot));
    },

    // ── Board lifecycle — trust / untrust / rename (EPIC-045 / US-868) ──────────
    // Security invariant: the API requests, the user's trust dialog grants. `boardTrust`
    // is never touched here without either a user dialog (registerBoard) or a same-content
    // path move (renameBoard — no privilege gain) / a privilege reduction (unregisterBoard).

    registerBoard: async (boardRoot: string): Promise<boolean> => {
        const { isBoardFolder } = await import("../editors/board/board-manifest");
        if (!(await isBoardFolder(boardRoot))) {
            throw new Error(`Not a board: "${boardRoot}" is missing or has no board-manifest.json.`);
        }
        const { boardTrust } = await import("./board-trust");
        await boardTrust.load();
        if (boardTrust.isTrusted(boardRoot)) return true; // already trusted (incl. via ancestor)
        const { showTrustBoardDialog } = await import("../ui/dialogs/TrustBoardDialog");
        const ok = await showTrustBoardDialog(boardRoot);
        if (!ok) return false;
        await boardTrust.trust(boardRoot);
        return true;
    },

    unregisterBoard: async (boardRoot: string): Promise<void> => {
        const { boardTrust } = await import("./board-trust");
        await boardTrust.untrust(boardRoot);
        const { removePin } = await import("../ui/sidebar/pinned-items");
        removePin({ kind: "board", root: boardRoot });
    },

    renameBoard: async (boardRoot: string, newName: string): Promise<string> => {
        const { isBoardFolder } = await import("../editors/board/board-manifest");
        if (!(await isBoardFolder(boardRoot))) {
            throw new Error(`Not a board: "${boardRoot}" is missing or has no board-manifest.json.`);
        }
        const { isBoardRootBusy } = await import("../editors/board/busy-boards");
        if (isBoardRootBusy(boardRoot)) {
            throw new Error("Cannot rename a board while it is running (busy). Stop it first.");
        }
        const { fpDirname, fpJoin, fpNormalizeForCompare } = await import("../core/utils/file-path");
        const newRoot = fpJoin(fpDirname(boardRoot), newName);
        if (fpNormalizeForCompare(newRoot) === fpNormalizeForCompare(boardRoot)) return boardRoot; // no-op
        if (await fs.exists(newRoot)) {
            throw new Error(`Cannot rename: "${newRoot}" already exists.`);
        }

        // Capture trust / pin / install state BEFORE the rename — the install registry's
        // load() prunes entries whose root no longer holds a manifest, which the rename
        // would trigger for the old root.
        const { boardTrust } = await import("./board-trust");
        await boardTrust.load();
        const wasTrusted = boardTrust.isTrusted(boardRoot);
        const { isPinned, addPin, removePin } = await import("../ui/sidebar/pinned-items");
        const wasPinned = isPinned({ kind: "board", root: boardRoot });
        const { boardInstallRegistry } = await import("./board-install-registry");
        await boardInstallRegistry.load();
        const installEntry = boardInstallRegistry.getByRoot(boardRoot);

        // Rename the folder on disk.
        await fs.rename(boardRoot, newRoot);

        // Transfer trust with no dialog (same content, new path — no privilege gain).
        // untrust(old) is a no-op for inherited trust; trust(new) is a no-op if still
        // covered by an ancestor — correct in every case.
        if (wasTrusted) {
            await boardTrust.untrust(boardRoot);
            await boardTrust.trust(newRoot);
        }
        // Pins.
        if (wasPinned) {
            removePin({ kind: "board", root: boardRoot });
            addPin({ kind: "board", root: newRoot });
        }
        // Install-registry root (catalog-installed boards). record() replaces by id.
        if (installEntry) {
            await boardInstallRegistry.record({ ...installEntry, root: newRoot });
        }

        // Re-point any open page running the old root to the new root (same tab).
        const { BoardEditorModel } = await import("../editors/board/BoardEditorModel");
        const { encodePersephoneBoardLink } = await import("../content/persephone-board-link");
        const { createLinkData } = await import("../../shared/link-data");
        const oldKey = fpNormalizeForCompare(boardRoot);
        for (const page of app.pages.pages) {
            const editor = page.mainEditorInstance;
            if (editor instanceof BoardEditorModel
                && editor.boardRoot
                && fpNormalizeForCompare(editor.boardRoot) === oldKey) {
                await app.events.openRawLink.sendAsync(
                    createLinkData(encodePersephoneBoardLink(newRoot), {
                        pageId: page.id,
                        sourceId: "app-api",
                        explorerRoot: fpDirname(newRoot),
                    }),
                );
            }
        }

        return newRoot;
    },
};
