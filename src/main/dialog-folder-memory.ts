import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { CommonFolder } from "../ipc/api-param-types";
import { electronStore } from "./e-store";

/**
 * Last-used directory per native dialog kind, remembered globally for the app.
 *
 * Without this, a dialog's starting folder depends on what its call site happened to pass:
 * a `defaultPath` carrying a directory pins that folder, while a bare file name leaves the
 * choice to the OS shell's own per-application history. Saving several files into one folder
 * then meant re-navigating there every time.
 *
 * Lives apart from `ipc/main/dialog-handlers` because the download path cannot use those:
 * Electron's `will-download` requires `setSavePath` before the handler returns, so it calls
 * `dialog.showSaveDialogSync` and needs the same logic synchronously.
 */

export type DialogKind = "open" | "save" | "folder";

const storeKey = (kind: DialogKind) => `dialog.lastDir.${kind}`;

/**
 * The remembered directory for `kind`, or undefined when there is none — or when it has since
 * been deleted or moved to a drive that is no longer attached. A `defaultPath` pointing at a
 * directory that does not exist leaves the dialog's opening location up to the OS, so a stale
 * memory is worse than none.
 */
export function getRememberedDir(kind: DialogKind): string | undefined {
    const dir = electronStore.get<string>(storeKey(kind));
    if (!dir) return undefined;
    try {
        if (!fs.statSync(dir).isDirectory()) return undefined;
    } catch {
        return undefined;
    }
    return dir;
}

/**
 * Record where a completed pick landed. Call only for a pick the user actually made — a
 * cancelled dialog must leave the memory alone.
 *
 * For "folder" the picked path *is* the directory; for the other two it is a file inside it.
 */
export function rememberDirFromPick(kind: DialogKind, pickedPath: string): void {
    if (!pickedPath) return;
    const dir = kind === "folder" ? pickedPath : path.dirname(pickedPath);
    if (!dir || dir === ".") return;
    electronStore.set(storeKey(kind), dir);
}

/** Does this path name a directory to start in, or only a file name to suggest? */
function hasDirectory(p: string | undefined): boolean {
    if (!p) return false;
    const dir = path.dirname(p);
    return dir !== "." && dir !== "";
}

/** Place `defaultPath` inside `dir` — keeping it as the suggested name when it is only a name. */
function placeIn(dir: string, defaultPath: string | undefined): string {
    return defaultPath ? path.join(dir, defaultPath) : dir;
}

export interface ResolveDefaultPathOptions {
    kind: DialogKind;
    /**
     * What the call site asked for. A path carrying a directory is an explicit choice and
     * always wins — Save As opens beside the original file, a settings picker opens at the
     * value being edited. A bare file name is only a suggested name, and is placed into
     * whichever directory wins below.
     */
    defaultPath?: string;
    /**
     * A standard user folder to fall back on before anything has been remembered — e.g.
     * `"downloads"` for a browser download. Unlike `defaultPath` it is a weak preference:
     * once the user has picked a folder for this dialog kind, that memory wins.
     */
    location?: CommonFolder;
}

/**
 * The starting `defaultPath` for a dialog, in precedence order: an explicit caller directory,
 * then the remembered directory, then `location`, then whatever the caller passed as-is.
 */
export function resolveDefaultPath({
    kind,
    defaultPath,
    location,
}: ResolveDefaultPathOptions): string | undefined {
    if (hasDirectory(defaultPath)) return defaultPath;

    const remembered = getRememberedDir(kind);
    if (remembered) return placeIn(remembered, defaultPath);

    if (location) {
        try {
            return placeIn(app.getPath(location), defaultPath);
        } catch {
            // A platform may not define every standard folder — fall through to the caller's value.
        }
    }

    return defaultPath;
}
