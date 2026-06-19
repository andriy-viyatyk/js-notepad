import { api } from "../../../ipc/renderer/api";
import { fs } from "../../api/fs";
import { fpJoin } from "../../core/utils/file-path";

/**
 * Populate a fresh board folder by recursively copying the bundled template
 * (`assets/board-template/`) into it (EPIC-034 / US-726).
 *
 * The caller (`BoardEditorModel.createBoard`) guarantees the destination is a
 * brand-new, empty folder (it errors on a name collision first), so there is no
 * skip-if-exists guard here — every template file is copied unconditionally.
 * `assets/` ships via `forge.config.ts`'s `extraResource`, so the template is
 * present beside the app in both dev and packaged builds.
 */
export async function scaffoldBoard(destDir: string): Promise<void> {
    const appRoot = await api.getAppRootPath();
    const templateRoot = fpJoin(appRoot, "assets", "board-template");
    await copyDirInto(templateRoot, destDir);
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
