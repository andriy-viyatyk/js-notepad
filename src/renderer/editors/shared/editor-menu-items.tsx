import type { MenuItem } from "../../uikit";
import {
    CopyIcon,
    FolderOpenIcon,
    KeyOffIcon,
    LockIcon,
    RenameIcon,
    SaveIcon,
    UnlockIcon,
} from "../../theme/icons";
import { api } from "../../../ipc/renderer/api";
import type { TextFileModel } from "../text/TextEditorModel";

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
            icon: <FolderOpenIcon />,
            onClick: () => {
                if (filePath) api.showItemInFolder(filePath);
            },
            disabled: !filePath,
        },
        {
            label: "Copy File Path",
            icon: <CopyIcon />,
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
            icon: <SaveIcon />,
            onClick: () => host.saveFile(false),
        },
        {
            label: "Save As...",
            icon: <SaveIcon />,
            onClick: () => host.saveFile(true),
        },
        {
            label: "Rename",
            icon: <RenameIcon />,
            onClick: () => host.promptRename(),
        },
        ...filePathMenuItems(host.filePath),
        {
            label: "Decrypt",
            icon: <UnlockIcon />,
            onClick: () => host.showEncryptionDialog(),
            disabled: !host.encrypted,
            startGroup: true,
        },
        {
            label: host.withEncryption ? "Change Password" : "Encrypt",
            icon: <LockIcon />,
            onClick: () => host.showEncryptionDialog(),
            disabled: host.encrypted,
        },
        {
            label: "Make Unencrypted",
            icon: <KeyOffIcon />,
            onClick: () => host.makeUnencrypted(),
            disabled: !host.decrypted,
        },
    ];
}
