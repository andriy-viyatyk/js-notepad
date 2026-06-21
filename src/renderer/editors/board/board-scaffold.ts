import { api } from "../../../ipc/renderer/api";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { boardTrust } from "../../api/board-trust";
import { fpJoin } from "../../core/utils/file-path";
import { ensureBoardManifest } from "./board-manifest";

/**
 * Populate a fresh board folder by recursively copying a bundled template into
 * it (EPIC-034 / US-726). `template` selects which `assets/<template>/` folder to
 * copy — `"board-template"` (default) for a blank board, `"demo-board"` for the
 * demo (US-728).
 *
 * Every board also receives the shared `assets/board-base.css` (page background,
 * themed scrollbars, monospace default) — maintained once, copied into each board,
 * and linked by both templates' `index.html`.
 *
 * The caller (`BoardEditorModel.createBoard` / `createDemoBoard`) guarantees the
 * destination is a brand-new, empty folder (it errors on a name collision first),
 * so there is no skip-if-exists guard here — every template file is copied
 * unconditionally. `assets/` ships via `forge.config.ts`'s `extraResource`, so the
 * template + base stylesheet are present beside the app in both dev and packaged builds.
 */
export async function scaffoldBoard(destDir: string, template = "board-template"): Promise<void> {
    const appRoot = await api.getAppRootPath();
    const assetsRoot = fpJoin(appRoot, "assets");
    await copyDirInto(fpJoin(assetsRoot, template), destDir);
    // Every board also gets the shared base stylesheet (page bg, themed scrollbars,
    // monospace default) — maintained once in assets/board-base.css and copied in.
    // Both templates link it via <link href="./board-base.css">.
    await fs.copyFile(fpJoin(assetsRoot, "board-base.css"), fpJoin(destDir, "board-base.css"));
}

/**
 * Create a board named `name` inside the container folder `dir`, scaffolded from
 * `template` (EPIC-035 / US-746). This is the canonical, **editor-independent**
 * board-creation API:
 * - the `.persephone` list editor calls it with its own `boardsDir`;
 * - US-750 exposes it on the `app` object model + an MCP tool so an agent can
 *   create a board at any path, at any time, with no board editor open.
 *
 * Errors on a name collision; on a template-copy failure it still produces a
 * usable (empty) board folder + warns. Always guarantees the board-identity
 * manifest exists. A board Persephone creates is **auto-trusted at creation**
 * (EPIC-035 C5) — by provenance, not a manifest field — so an authored board
 * never hits the trust gate. Returns the created board's absolute root.
 */
export async function createBoardFromTemplate(name: string, dir: string, template: string): Promise<string> {
    const boardRoot = fpJoin(dir, name);
    if (await fs.exists(boardRoot)) {
        throw new Error(`A board named "${name}" already exists in "${dir}".`);
    }
    try {
        await scaffoldBoard(boardRoot, template);
    } catch (err) {
        // Template missing / copy failed — still produce a usable (empty) board.
        await fs.mkdir(boardRoot);
        ui.notify(
            `Board created, but the template could not be copied: ${
                err instanceof Error ? err.message : String(err)
            }`,
            "warning",
        );
    }
    // Guarantee the board-identity manifest exists regardless of which path ran
    // above (template copy or empty fallback) — a board is identified by it.
    await ensureBoardManifest(boardRoot);
    // Auto-trust a Persephone-created board (C5): provenance-based registry write,
    // never a manifest self-declaration. Covers the list editor + the MCP create.
    await boardTrust.trust(boardRoot);
    return boardRoot;
}

async function copyDirInto(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest);
    const entries = await fs.listDirWithTypes(src);
    for (const entry of entries) {
        const from = fpJoin(src, entry.name);
        const to = fpJoin(dest, entry.name);
        if (entry.isDirectory) {
            await copyDirInto(from, to);
        } else {
            await fs.copyFile(from, to);
        }
    }
}
