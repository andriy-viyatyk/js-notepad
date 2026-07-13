// Native OS file drag-out (US-833). Bridges the renderer to Electron's
// `webContents.startDrag`, the only supported way to originate a Windows
// CF_HDROP drag from a window — the format Windows Explorer and the Microsoft
// Teams desktop app consume as a file drop.
//
// The renderer calls this from a tree row's `dragstart` (after
// `event.preventDefault()`), handing off the HTML5 drag to a native OS drag.
// A drag dropped back inside a Persephone window re-enters as an ordinary OS
// file drop (handled by GlobalEventService.captureDrop), so internal drops keep
// working without any special coordination.

import { app, nativeImage, WebContents } from "electron";
import { existsSync } from "fs";

// 1x1 PNG — an ultimate fallback so `startDrag` never throws on an empty icon
// (it rejects an empty NativeImage). Only used when `app.getFileIcon` fails,
// which effectively never happens for an existing file on Windows.
const FALLBACK_ICON_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Start a native OS drag carrying `paths` as files. Win32-only; a no-op on
 *  other platforms and when no path exists on disk. */
export async function startOsFileDrag(sender: WebContents, paths: string[]): Promise<void> {
    if (process.platform !== "win32") return;

    const files = paths.filter((p) => {
        try {
            return !!p && existsSync(p);
        } catch {
            return false;
        }
    });
    if (!files.length) return;

    let icon = await resolveIcon(files[0]);
    if (!icon || icon.isEmpty()) {
        icon = nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
    }

    // `files` overrides `file` when present; `file` is still required by the type.
    sender.startDrag(
        files.length > 1
            ? { file: files[0], files, icon }
            : { file: files[0], icon },
    );
}

async function resolveIcon(filePath: string): Promise<Electron.NativeImage | null> {
    try {
        return await app.getFileIcon(filePath, { size: "normal" });
    } catch {
        return null;
    }
}
