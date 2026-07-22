import { boardVars } from "./BoardEnvStore";
import { resolveBoardNamespace } from "./namespace";

// =============================================================================
// Agent-facing admin API over the board environment-variables store (EPIC-046 / US-891).
//
// Exposed to scripts as `app.boardVars`. Unlike the board-side `persephone.var.*` bridge
// (BoardWebview resolves and locks the namespace to the calling board), this surface is
// unrestricted — scripts already run with full app trust (same as app.fs / app.settings), so
// the agent may target any namespace. Typical use: provision a board's secrets ahead of time,
// e.g. `app.boardVars.set(await app.boardVars.namespaceFor(boardRoot), "API_KEY", value)`.
// =============================================================================

class BoardVarsAdmin {
    /** Ensures the store is loaded, showing the "Create environment variables storage" dialog
     *  (first use, no file configured) or the decrypt-password prompt (locked file) as needed.
     *  Throws on decline/cancel/error — every admin method awaits this first. */
    private async ensureReady(): Promise<void> {
        let load = await boardVars.ensureLoaded();
        if (load.status === "not-configured") {
            const { showCreateBoardVarsStorageDialog } = await import(
                "../../ui/dialogs/CreateBoardVarsStorageDialog"
            );
            const created = await showCreateBoardVarsStorageDialog();
            if (!created) throw new Error("Board environment variables storage is not configured.");
            load = await boardVars.ensureLoaded();
        }
        if (load.status === "locked") {
            throw new Error("Board environment variables file is locked.");
        }
        if (load.status !== "ok") {
            throw new Error(load.message || "Failed to load the board environment variables.");
        }
    }

    /** Resolves a board's namespace the same way registration/collision-checking does —
     *  `author/name` when both manifest fields are set, else the board's root path. Always use
     *  this rather than guessing the namespace string by hand. */
    namespaceFor = (boardRoot: string): Promise<string> => resolveBoardNamespace(boardRoot);

    get = async (namespace: string, name: string, env?: string): Promise<string | undefined> => {
        await this.ensureReady();
        return boardVars.get(namespace, name, env);
    };

    set = async (namespace: string, name: string, value: string, env?: string): Promise<void> => {
        await this.ensureReady();
        await boardVars.set(namespace, name, value, env);
    };

    list = async (namespace: string, env?: string): Promise<string[]> => {
        await this.ensureReady();
        return boardVars.list(namespace, env);
    };

    listNamespaces = async (): Promise<string[]> => {
        await this.ensureReady();
        return Object.keys(boardVars.getAll());
    };

    /** Opens the built-in `.env.json` editor, focused on `namespace` when given, or unscoped
     *  (whole file) when omitted — an admin-only nicety `persephone.var.show()` doesn't need
     *  (a board always knows its own namespace). */
    show = async (namespace?: string): Promise<void> => {
        await this.ensureReady();
        if (namespace) {
            const { openEnvVarsPage } = await import("../../editors/env-vars/open-env-vars");
            await openEnvVarsPage(namespace);
        } else {
            const { app } = await import("../app");
            await app.openRawLink(boardVars.filePath, { editor: "env-vars-view" });
        }
    };
}

export const boardVarsAdmin = new BoardVarsAdmin();
