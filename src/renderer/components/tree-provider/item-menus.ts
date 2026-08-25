import type { ITreeProvider, ITreeProviderItem } from "../../api/types/io.tree";
import type { MenuItem } from "../../uikit/Menu";
import { isUrlOrCurl } from "../../content/link-utils";
import {
    CopyIcon,
    CutIcon,
    DeleteIcon,
    FolderOpenIcon,
    NewFileIcon,
    NewFolderIcon,
    PasteIcon,
    RenameIcon,
    TerminalIcon,
} from "../../theme/icons";
import { copyPathToOsClipboard, supportsOsClipboard } from "./os-clipboard";

export interface ItemMenuActions {
    createFile(directory: string): void;
    createFolder(directory: string): void;
    paste(directory: string): void;
    rename(item: ITreeProviderItem): void;
    deleteItem(item: ITreeProviderItem): void;
}

export function getFileMenuItems(
    provider: ITreeProvider,
    item: ITreeProviderItem,
    actions: Pick<ItemMenuActions, "rename" | "deleteItem">,
): MenuItem[] {
    const items: MenuItem[] = [{
        label: isUrlOrCurl(item.href) ? "Copy Href" : "Copy Path",
        icon: CopyIcon.createElement!(),
        onClick: () => navigator.clipboard.writeText(item.href),
    }];

    if (supportsOsClipboard(provider)) {
        items.push(
            {
                startGroup: true,
                label: "Cut",
                icon: CutIcon.createElement!(),
                onClick: () => copyPathToOsClipboard(item.href, true),
            },
            {
                label: "Copy",
                icon: CopyIcon.createElement!(),
                onClick: () => copyPathToOsClipboard(item.href, false),
            },
        );
    }

    if (provider.writable && provider.rename) {
        items.push({
            startGroup: true,
            label: "Rename...",
            icon: RenameIcon.createElement!(),
            onClick: () => actions.rename(item),
        });
    }
    if (provider.writable && provider.deleteItem) {
        items.push({
            label: "Delete",
            icon: DeleteIcon.createElement!(),
            onClick: () => actions.deleteItem(item),
        });
    }
    return items;
}

export interface FolderMenuOptions {
    provider: ITreeProvider;
    item: ITreeProviderItem;
    /** Provider list/create path for this folder, which differs from href for archive trees. */
    directory: string;
    isRoot?: boolean;
    onOpen?: () => void;
    actions: ItemMenuActions;
}

export function getFolderMenuItems(options: FolderMenuOptions): MenuItem[] {
    const { provider, item, directory, isRoot = false, onOpen, actions } = options;
    const items: MenuItem[] = [];

    if (onOpen) {
        items.push({ label: "Open", icon: FolderOpenIcon.createElement!(), onClick: onOpen });
    }
    if (provider.writable && provider.mkdir) {
        items.push(
            {
                startGroup: !!onOpen,
                label: "New File...",
                icon: NewFileIcon.createElement!(),
                onClick: () => actions.createFile(directory),
            },
            {
                label: "New Folder...",
                icon: NewFolderIcon.createElement!(),
                onClick: () => actions.createFolder(directory),
            },
        );
    }

    items.push({
        startGroup: items.length > 0,
        label: isUrlOrCurl(item.href) ? "Copy Href" : "Copy Path",
        icon: CopyIcon.createElement!(),
        onClick: () => navigator.clipboard.writeText(item.href),
    });

    if (supportsOsClipboard(provider)) {
        if (!isRoot) {
            items.push({
                startGroup: true,
                label: "Cut",
                icon: CutIcon.createElement!(),
                onClick: () => copyPathToOsClipboard(item.href, true),
            });
        }
        items.push(
            {
                startGroup: isRoot,
                label: "Copy",
                icon: CopyIcon.createElement!(),
                onClick: () => copyPathToOsClipboard(item.href, false),
            },
            {
                label: "Paste",
                icon: PasteIcon.createElement!(),
                onClick: () => actions.paste(directory),
            },
            {
                startGroup: true,
                label: "Open Terminal here",
                icon: TerminalIcon.createElement!(),
                onClick: async () => {
                    const { openTerminalAt } = await import("../../api/terminal");
                    openTerminalAt(item.href);
                },
            },
        );
    }

    if (provider.writable && !isRoot && provider.rename) {
        items.push({
            startGroup: true,
            label: "Rename...",
            icon: RenameIcon.createElement!(),
            onClick: () => actions.rename(item),
        });
    }
    if (provider.writable && !isRoot && provider.deleteItem) {
        items.push({
            label: "Delete",
            icon: DeleteIcon.createElement!(),
            onClick: () => actions.deleteItem(item),
        });
    }
    return items;
}

export function getBackgroundMenuItems(
    provider: ITreeProvider,
    directory: string,
    actions: Pick<ItemMenuActions, "createFile" | "createFolder" | "paste">,
): MenuItem[] {
    const items: MenuItem[] = [];
    if (provider.writable && provider.mkdir) {
        items.push(
            {
                label: "New File...",
                icon: NewFileIcon.createElement!(),
                onClick: () => actions.createFile(directory),
            },
            {
                label: "New Folder...",
                icon: NewFolderIcon.createElement!(),
                onClick: () => actions.createFolder(directory),
            },
        );
    }
    if (supportsOsClipboard(provider)) {
        items.push({
            startGroup: items.length > 0,
            label: "Paste",
            icon: PasteIcon.createElement!(),
            onClick: () => actions.paste(directory),
        });
    }
    return items;
}
