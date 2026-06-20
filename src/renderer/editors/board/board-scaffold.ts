import { api } from "../../../ipc/renderer/api";
import { fs } from "../../api/fs";
import { fpJoin } from "../../core/utils/file-path";

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
