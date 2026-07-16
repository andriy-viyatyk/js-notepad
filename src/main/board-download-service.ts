import { net } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openWindows } from "./open-windows";
import { getDataFolder, preparePath } from "./utils";
import { EventEndpoint } from "../ipc/api-types";
import { BoardArchiveDownloadRequest } from "../ipc/api-param-types";

/**
 * Board-archive download service (EPIC-045 / US-863). Streams a published board's
 * release ZIP via `net.fetch`, verifying its sha256 incrementally, into a dedicated
 * scratch folder under the app's data folder (NOT the OS temp dir). Broadcasts throttled
 * progress and supports cancel. Trusts nothing — the renderer (`board-install.ts`)
 * extracts, validates, and records the result; registration (trust) is a separate step.
 */

const PROGRESS_THROTTLE_MS = 500;
const inFlight = new Map<string, AbortController>();

/** Dedicated download scratch folder — a sibling of the default install root
 *  (`<userData>/data/boards`), NOT the OS temp dir, so leftovers stay inside the app's
 *  own data folder and are swept at startup. */
function downloadsDir(): string {
    const dir = path.join(getDataFolder(), "boards-downloads");
    preparePath(dir);
    return dir;
}

/**
 * Stream a board release ZIP to a scratch file, verifying its sha256 incrementally.
 * Returns the ZIP path. Throws (and deletes the file) on network error, abort, or
 * checksum mismatch. Trusts nothing — the renderer extracts + validates.
 */
export async function downloadBoardArchive(req: BoardArchiveDownloadRequest): Promise<string> {
    const { installId, url, sha256, size } = req;
    const controller = new AbortController();
    inFlight.set(installId, controller);

    const tempPath = path.join(downloadsDir(), `${installId}.zip`);
    // Delete a same-id leftover before we start (defensive — installId is unique per call).
    try { fs.rmSync(tempPath, { force: true }); } catch { /* best-effort */ }
    const hash = createHash("sha256");
    const out = fs.createWriteStream(tempPath);
    let received = 0;
    let lastSent = 0;

    const sendProgress = (totalBytes: number) =>
        openWindows.send(EventEndpoint.eBoardInstallProgress, {
            installId,
            receivedBytes: received,
            totalBytes,
        });

    try {
        const response = await net.fetch(url, {
            headers: { "User-Agent": "persephone" },
            signal: controller.signal,
        });
        if (!response.ok || !response.body) {
            throw new Error(`Download failed: HTTP ${response.status}`);
        }
        const total = size || Number(response.headers.get("content-length")) || 0;

        const reader = response.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            hash.update(chunk);
            received += chunk.length;
            await new Promise<void>((res, rej) =>
                out.write(chunk, (err) => (err ? rej(err) : res())),
            );
            const now = Date.now();
            if (now - lastSent >= PROGRESS_THROTTLE_MS) {
                lastSent = now;
                sendProgress(total);
            }
        }
        await new Promise<void>((res, rej) => out.end((err?: Error) => (err ? rej(err) : res())));

        const digest = hash.digest("hex").toLowerCase();
        if (digest !== sha256.toLowerCase()) {
            fs.rmSync(tempPath, { force: true });
            throw new Error(`Checksum mismatch: expected ${sha256}, got ${digest}`);
        }
        sendProgress(total || received); // final 100% frame
        return tempPath;
    } catch (err) {
        out.destroy();
        try { fs.rmSync(tempPath, { force: true }); } catch { /* best-effort */ }
        throw err;
    } finally {
        inFlight.delete(installId);
    }
}

/** Abort an in-flight download by its installId (mid-download cancel → nothing installed). */
export function cancelBoardDownload(installId: string): void {
    inFlight.get(installId)?.abort();
}

/**
 * Remove leftover ZIPs in the downloads folder at startup — covers the one case
 * delete-before/delete-after can't: a hard crash mid-download (unique installId → the
 * file would otherwise linger forever). Skips any file whose id is currently in-flight.
 */
export function cleanDownloadsFolder(): void {
    try {
        const dir = downloadsDir();
        for (const name of fs.readdirSync(dir)) {
            if (!name.toLowerCase().endsWith(".zip")) continue;
            const id = name.slice(0, -4);
            if (inFlight.has(id)) continue; // don't delete an active download
            try { fs.rmSync(path.join(dir, name), { force: true }); } catch { /* best-effort */ }
        }
    } catch { /* best-effort */ }
}

export const boardDownloadService = { downloadBoardArchive, cancelBoardDownload, cleanDownloadsFolder };
