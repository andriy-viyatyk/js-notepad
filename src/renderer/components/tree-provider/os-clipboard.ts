// OS file-clipboard actions shared by TreeProviderViewModel and
// CategoryViewModel (US-807). Windows-Explorer-compatible copy/cut/paste of
// files — CF_HDROP interop via the clip-service IPC endpoints.
//
// Only meaningful for the local-filesystem provider (`provider.type === "file"`,
// where item hrefs are absolute paths) — callers gate menu items on
// `supportsOsClipboard`.

import type { ITreeProvider } from "../../api/types/io.tree";
import { api } from "../../../ipc/renderer/api";
import { ui } from "../../api/ui";
import { copyPathsInto } from "../../core/utils/copy-files";
import { fpBasename } from "../../core/utils/file-path";

/** OS clipboard copy/paste applies only where item hrefs are absolute local
 *  paths. Mneme / Link / Archive providers are excluded. */
export function supportsOsClipboard(provider: ITreeProvider): boolean {
    return provider.type === "file";
}

/** Put one file/folder on the OS clipboard (Windows Explorer can paste it).
 *  `cut: true` marks it for move — pasting (here or in Explorer) relocates it. */
export async function copyPathToOsClipboard(path: string, cut: boolean): Promise<void> {
    const ok = await api.clipboardWriteFilePaths([path], cut);
    if (!ok) {
        ui.notify("Failed to put the file on the clipboard.", "warning");
    }
}

/** Paste the OS clipboard's file list into `targetDir`. Confirms overwrites,
 *  shows progress, honors cut (move) semantics, and empties a fully-consumed
 *  "cut" clipboard the way Windows Explorer does.
 *  Returns true when anything might have changed (caller should refresh). */
export async function pasteOsClipboardInto(
    provider: ITreeProvider,
    targetDir: string,
): Promise<boolean> {
    const clip = await api.clipboardReadFilePaths();
    if (!clip.paths.length) {
        ui.notify("The clipboard contains no files.", "info");
        return false;
    }
    const move = clip.dropEffect === "cut";

    // Collision confirm BEFORE the progress overlay (same wording as the
    // drag-drop import in TreeProviderViewModel.importFiles).
    const existing = new Set(
        (await provider.list(targetDir)).map((l) => l.title.toLowerCase()),
    );
    const clashing = clip.paths
        .map((p) => fpBasename(p))
        .filter((name) => existing.has(name.toLowerCase()));
    if (clashing.length) {
        const bt = await ui.confirm(
            `${clashing.length} item(s) already exist here and will be overwritten:\n${clashing.join(", ")}`,
            { title: "Overwrite?", buttons: ["Overwrite", "Cancel"] },
        );
        if (bt !== "Overwrite") return false;
    }

    const verb = move ? "Moving" : "Copying";
    const progress = await ui.createProgress(`${verb}...`);
    try {
        const result = await progress.show(
            copyPathsInto(clip.paths, targetDir, {
                move,
                onProgress: (done, total, name) => {
                    progress.label = `${verb} ${done} of ${total}: ${name}`;
                },
            }),
        );
        if (result.errors.length) {
            const shown = result.errors.slice(0, 5).join("\n");
            const more = result.errors.length > 5 ? `\n(+${result.errors.length - 5} more)` : "";
            ui.notify(`Some items could not be pasted:\n${shown}${more}`, "warning");
        } else if (move) {
            // Cut clipboard fully consumed — clear it so a second paste
            // doesn't fail on the now-moved sources (Explorer behavior).
            await api.clipboardWriteFilePaths([], false);
        }
    } catch (err) {
        ui.notify(err?.message || "Failed to paste.", "warning");
    }
    return true;
}
