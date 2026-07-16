/**
 * Board install orchestration (EPIC-045 / US-863). Turns a catalog entry into an
 * installed-but-untrusted board on disk: download (main, streamed + sha256-verified) →
 * extract (single-pass, zip-slip-guarded) → validate it is a real board → record in the
 * install registry. Trusts NOTHING — registration is a separate consent step
 * (US-864 / US-868). `updateBoard` reinstalls an existing board in place via a
 * temp-extract + folder swap so a failed download never destroys a working board.
 */
import { api } from "../../ipc/renderer/api";
import { fs } from "./fs";
import { archiveService } from "./archive-service";
import { fpJoin, fpDirname } from "../core/utils/file-path";
import { readBoardManifest } from "../editors/board/board-manifest";
import { PublishedBoardInfo } from "../../ipc/api-param-types";
import { boardInstallRegistry } from "./board-install-registry";

function newInstallId(): string {
    return crypto.randomUUID();
}

/**
 * Download → verify → extract → validate → record a board into `<targetParentDir>/<id>`.
 * Returns the install root. Trusts NOTHING (registration is a separate step). Throws on
 * checksum/network/extract failure, or if the target folder already holds a DIFFERENT board.
 */
export async function downloadBoard(
    entry: PublishedBoardInfo,
    targetParentDir: string,
): Promise<string> {
    const root = fpJoin(targetParentDir, entry.id);

    if (await fs.exists(root)) {
        const existing = boardInstallRegistry.getByRoot(root);
        if (!existing || existing.id !== entry.id) {
            throw new Error(`Target folder already exists: ${root}`);
        }
        // Same board re-installed into its own root → treat as an update (swap).
        return updateBoard(entry);
    }

    const installId = newInstallId();
    const tempZip = await api.downloadBoardArchive({
        installId,
        url: entry.archive.url,
        sha256: entry.archive.sha256,
        size: entry.archive.size,
    });
    try {
        await archiveService.extractTo(tempZip, root);
        const manifest = await readBoardManifest(root);
        if (!manifest) {
            await fs.delete(root);
            throw new Error("Downloaded archive is not a valid board (no board-manifest.json).");
        }
        await boardInstallRegistry.record({
            id: entry.id,
            root,
            version: entry.version,
            installedAt: Date.now(),
        });
        return root;
    } finally {
        // Remove the downloaded ZIP after extraction (success or failure) — no scratch
        // file lingers in <userData>/data/boards-downloads.
        try { await fs.delete(tempZip); } catch { /* cleanup best-effort */ }
    }
}

/**
 * Update/reinstall an already-installed board in place via a temp-extract + folder swap,
 * so a failed download never destroys the working board. Runs under the board's EXISTING
 * trust (same root). The open-pages / busy precondition + close-pages dialog is US-865's
 * responsibility (wired in the caller); this function performs the swap only.
 */
export async function updateBoard(entry: PublishedBoardInfo): Promise<string> {
    const existing = boardInstallRegistry.getById(entry.id);
    if (!existing) throw new Error(`Board not installed: ${entry.id}`);
    const root = existing.root;
    const parent = fpDirname(root);

    const installId = newInstallId();
    const stagingDir = fpJoin(parent, `.${entry.id}.staging-${installId}`);
    const backupDir = fpJoin(parent, `.${entry.id}.old-${installId}`);

    const tempZip = await api.downloadBoardArchive({
        installId,
        url: entry.archive.url,
        sha256: entry.archive.sha256,
        size: entry.archive.size,
    });
    try {
        await archiveService.extractTo(tempZip, stagingDir);
        const manifest = await readBoardManifest(stagingDir);
        if (!manifest) {
            throw new Error("Downloaded archive is not a valid board (no board-manifest.json).");
        }

        // Swap: move old aside, move staging in; roll back on failure.
        await fs.rename(root, backupDir);
        try {
            await fs.rename(stagingDir, root);
        } catch (swapErr) {
            await fs.rename(backupDir, root); // restore the working board
            throw swapErr;
        }
        await fs.delete(backupDir);

        await boardInstallRegistry.record({
            id: entry.id,
            root,
            version: entry.version,
            installedAt: Date.now(),
        });
        return root;
    } finally {
        try { await fs.delete(stagingDir); } catch { /* best-effort */ }
        try { await fs.delete(tempZip); } catch { /* best-effort */ }
    }
}
