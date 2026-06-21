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
};
