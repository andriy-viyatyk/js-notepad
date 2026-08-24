import { api } from "../../../ipc/renderer/api";
import { createLinkData } from "../../../shared/link-data";
import { createIconElement } from "../../uikit/shared/slots";
import type { MenuItem } from "../../uikit/Menu/types";
import type { TextFileModel } from "../text/TextEditorModel";

/** HTML files that make sense to render in the browser instead of editing. */
const HTML_FILE = /\.(?:x?html?)$/i;

/**
 * "Open in Browser" — for HTML files opened in a text editor. Routes the file
 * through the standard openRawLink pipeline with `target: "browser"`; the
 * internal browser converts the Windows path to a `file://` URL on navigate.
 * Returns an empty array for non-HTML / unsaved files so the item is hidden.
 */
export function openInBrowserMenuItems(filePath: string | undefined): MenuItem[] {
    if (!filePath || !HTML_FILE.test(filePath)) return [];
    return [
        {
            label: "Open in Browser",
            icon: createIconElement("globe"),
            startGroup: true,
            onClick: async () => {
                const { app } = await import("../../api/app");
                await app.events.openRawLink.sendAsync(
                    createLinkData(filePath, { target: "browser", browserMode: "internal" }),
                );
            },
        },
    ];
}

/**
 * "Show in File Explorer" + "Copy File Path" — the file-path menu items.
 * Reusable by any editor with an on-disk path: text-bearing editors (via their
 * content host) and standalone PDF / Image / Archive editors. Items are disabled
 * (not hidden) when `filePath` is absent, matching the page-tab UX.
 */
export function filePathMenuItems(filePath: string | undefined): MenuItem[] {
    return [
        {
            label: "Show in File Explorer",
            icon: createIconElement("folder-open"),
            onClick: () => {
                if (filePath) api.showItemInFolder(filePath);
            },
            disabled: !filePath,
        },
        {
            label: "Copy File Path",
            icon: createIconElement("copy"),
            onClick: () => {
                if (filePath) navigator.clipboard.writeText(filePath);
            },
            disabled: !filePath,
        },
    ];
}

/**
 * The full text-file context menu (Save / Save As / Rename / file-path items /
 * encryption group) contributed by a `TextFileModel` content host. This is the
 * single place the text-file menu lives — every text-bearing editor surfaces it
 * via `EditorModel.onGetMenuItems()` → `contentHost.onGetMenuItems()`.
 *
 * The first item carries no `startGroup`; the page tab stamps the separator onto
 * the first contributed item so it sits below the tab-level options.
 */
export function textFileMenuItems(host: TextFileModel): MenuItem[] {
    return [
        {
            label: "Save",
            icon: createIconElement("save"),
            onClick: () => host.saveFile(false),
        },
        {
            label: "Save As...",
            icon: createIconElement("save"),
            onClick: () => host.saveFile(true),
        },
        {
            label: "Rename",
            icon: createIconElement("rename"),
            onClick: () => host.promptRename(),
        },
        ...filePathMenuItems(host.filePath),
        ...openInBrowserMenuItems(host.filePath),
        {
            label: "Decrypt",
            icon: createIconElement("unlock"),
            onClick: () => host.showEncryptionDialog(),
            disabled: !host.encrypted,
            startGroup: true,
        },
        {
            label: host.withEncryption ? "Change Password" : "Encrypt",
            icon: createIconElement("lock"),
            onClick: () => host.showEncryptionDialog(),
            disabled: host.encrypted,
        },
        {
            label: "Make Unencrypted",
            icon: createIconElement("key-off"),
            onClick: () => host.makeUnencrypted(),
            disabled: !host.decrypted,
        },
    ];
}
