import { TComponentModel } from "../../core/state/model";
import type { ITreeProvider, ITreeProviderItem } from "../../api/types/io.tree";
import type { MenuItem } from "../../uikit/Menu";
import { ContextMenuEvent } from "../../api/events/events";
import { app } from "../../api/app";
import { ui } from "../../api/ui";
import {
    CopyIcon,
    CutIcon,
    DeleteIcon,
    FolderOpenIcon,
    NewFileIcon,
    NewFolderIcon,
    PasteIcon,
    RenameIcon,
} from "../../theme/icons";
import {
    copyPathToOsClipboard,
    pasteOsClipboardInto,
    supportsOsClipboard,
} from "./os-clipboard";
import { isUrlOrCurl } from "../../content/link-utils";

// =============================================================================
// Types
// =============================================================================

/** All modes defined for future use. Only "list" is implemented initially. */
export type CategoryViewMode =
    | "list"
    | "tiles-landscape"
    | "tiles-landscape-big"
    | "tiles-portrait"
    | "tiles-portrait-big";

export interface CategoryViewProps {
    provider: ITreeProvider;
    /** Category path to display items for */
    category: string;
    /** Called when user clicks a non-directory item */
    onItemClick?: (item: ITreeProviderItem) => void;
    /** Called when user double-clicks a non-directory item */
    onItemDoubleClick?: (item: ITreeProviderItem) => void;
    /** Called when user clicks a directory item (navigate into) */
    onFolderClick?: (item: ITreeProviderItem) => void;
    /** Currently selected item href */
    selectedHref?: string;
    /** View mode. Default: "list" */
    viewMode?: CategoryViewMode;
    /** Called when view mode changes */
    onViewModeChange?: (mode: CategoryViewMode) => void;
    /** Portal target for search controls. When set, search renders there instead of own toolbar. */
    toolbarPortalRef?: HTMLElement | null;
}

export interface CategoryViewState {
    items: ITreeProviderItem[];
    filteredItems: ITreeProviderItem[];
    searchText: string;
    loading: boolean;
    error: string | null;
}

export const defaultCategoryViewState: CategoryViewState = {
    items: [],
    filteredItems: [],
    searchText: "",
    loading: false,
    error: null,
};

// =============================================================================
// Model
// =============================================================================

export class CategoryViewModel extends TComponentModel<
    CategoryViewState,
    CategoryViewProps
> {
    setProps = () => {
        if (
            this.isFirstUse
            || this.oldProps?.category !== this.props.category
            || this.oldProps?.provider !== this.props.provider
        ) {
            // Defer to avoid setState during render
            Promise.resolve().then(() => this.loadItems());
        }
    };

    // ── Data loading ─────────────────────────────────────────────────────

    loadItems = async () => {
        this.state.update((s) => { s.loading = true; s.error = null; });

        try {
            const items = await this.props.provider.list(this.props.category);
            const { searchText } = this.state.get();
            const filteredItems = filterItems(items, searchText);

            this.state.update((s) => {
                s.items = items;
                s.filteredItems = filteredItems;
                s.loading = false;
                s.error = null;
            });
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            this.state.update((s) => {
                s.items = [];
                s.filteredItems = [];
                s.loading = false;
                s.error = err.message || "Failed to load items";
            });
        }
    };

    // ── Search ───────────────────────────────────────────────────────────

    setSearchText = (text: string) => {
        const { items } = this.state.get();
        const filteredItems = filterItems(items, text);
        this.state.update((s) => {
            s.searchText = text;
            s.filteredItems = filteredItems;
        });
    };

    // ── Click handlers ───────────────────────────────────────────────────

    onItemClick = (item: ITreeProviderItem) => {
        this.props.onItemClick?.(item);
    };

    onItemDoubleClick = (item: ITreeProviderItem) => {
        if (item.isDirectory) {
            this.props.onFolderClick?.(item);
        } else {
            this.props.onItemDoubleClick?.(item);
        }
    };

    // ── Context menus ────────────────────────────────────────────────────

    onItemContextMenu = (item: ITreeProviderItem, e: React.MouseEvent) => {
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "tree-provider-item");
        ctxEvent.target = item;

        // Layer 1: Generic items (Open, Copy Path, Rename, Delete)
        const menuItems = item.isDirectory
            ? this.getFolderMenuItems(item)
            : this.getFileMenuItems(item);
        ctxEvent.items.push(...menuItems);

        // Layer 2: Event channel — type-specific items (Open in New Tab/Window,
        // Show in File Explorer, Open in Browser, …) added by the handlers registered
        // in tree-context-menus.tsx, based solely on the item's href/isDirectory. This
        // is the same flow the Explorer tree (TreeProviderViewModel) uses, so the
        // folder-content view gets identical link items from one central place.
        // Set contextMenuPromise so GlobalEventService waits for the async handlers
        // before showing the popup menu.
        e.nativeEvent.contextMenuPromise = app.events.linkContextMenu.sendAsync(
            ctxEvent as ContextMenuEvent<ITreeProviderItem>,
        );
    };

    // Right-click on empty space (or a file) → New File / New Folder in the currently
    // viewed directory (this.props.category). Skipped when a folder was the target —
    // that folder's own menu already carries its New File / New Folder items. Mirrors
    // TreeProviderViewModel.onBackgroundContextMenu, but rooted at the open category
    // rather than the provider root.
    onBackgroundContextMenu = (e: React.MouseEvent) => {
        const ctxEvent = e.nativeEvent.contextMenuEvent;
        const isFolder = ctxEvent?.target && (ctxEvent.target as ITreeProviderItem).isDirectory;
        const { provider } = this.props;

        if (isFolder) return;

        const items: MenuItem[] = [];
        if (provider.writable && provider.mkdir) {
            items.push(
                {
                    label: "New File...",
                    icon: <NewFileIcon />,
                    onClick: () => this.createNewFile(this.props.category),
                },
                {
                    label: "New Folder...",
                    icon: <NewFolderIcon />,
                    onClick: () => this.createNewFolder(this.props.category),
                },
            );
        }
        // Paste into the open folder (US-807) — file provider only.
        if (supportsOsClipboard(provider)) {
            items.push({
                startGroup: items.length > 0,
                label: "Paste",
                icon: <PasteIcon />,
                onClick: () => this.pasteIntoDir(this.props.category),
            });
        }
        if (!items.length) return;

        const bgEvent = ContextMenuEvent.fromNativeEvent(e, "tree-provider-background");
        bgEvent.items.push(...items);
    };

    /** Paste the OS clipboard's files into `targetDir` and refresh (US-807). */
    private pasteIntoDir = async (targetDir: string) => {
        if (await pasteOsClipboardInto(this.props.provider, targetDir)) {
            await this.loadItems();
        }
    };

    /** Path to pass to provider create/list calls for a folder item: parent category +
     *  the folder's own name (same convention as TreeProviderViewModel.getListPath). */
    private getItemListPath = (item: ITreeProviderItem): string => {
        return item.category ? item.category + "/" + item.title : item.title;
    };

    private getFileMenuItems = (item: ITreeProviderItem): MenuItem[] => {
        const { provider } = this.props;
        const items: MenuItem[] = [];

        items.push({
            label: isUrlOrCurl(item.href) ? "Copy Href" : "Copy Path",
            icon: <CopyIcon />,
            onClick: () => navigator.clipboard.writeText(item.href),
        });

        // OS file clipboard (US-807) — Windows Explorer interop, file provider only.
        if (supportsOsClipboard(provider)) {
            items.push(
                {
                    startGroup: true,
                    label: "Cut",
                    icon: <CutIcon />,
                    onClick: () => copyPathToOsClipboard(item.href, true),
                },
                {
                    label: "Copy",
                    icon: <CopyIcon />,
                    onClick: () => copyPathToOsClipboard(item.href, false),
                },
            );
        }

        if (provider.writable) {
            if (provider.rename) {
                items.push({
                    startGroup: true,
                    label: "Rename...",
                    icon: <RenameIcon />,
                    onClick: () => this.renameItem(item),
                });
            }
            if (provider.deleteItem) {
                items.push({
                    label: "Delete",
                    icon: <DeleteIcon />,
                    onClick: () => this.deleteItemAction(item),
                });
            }
        }

        return items;
    };

    private getFolderMenuItems = (item: ITreeProviderItem): MenuItem[] => {
        const { provider } = this.props;
        const items: MenuItem[] = [];

        items.push({
            label: "Open",
            icon: <FolderOpenIcon />,
            onClick: () => this.props.onFolderClick?.(item),
        });

        // New File / New Folder inside this folder (mirrors the Explorer tree).
        if (provider.writable && provider.mkdir) {
            items.push(
                {
                    startGroup: true,
                    label: "New File...",
                    icon: <NewFileIcon />,
                    onClick: () => this.createNewFile(this.getItemListPath(item)),
                },
                {
                    label: "New Folder...",
                    icon: <NewFolderIcon />,
                    onClick: () => this.createNewFolder(this.getItemListPath(item)),
                },
            );
        }

        items.push({
            startGroup: true,
            label: isUrlOrCurl(item.href) ? "Copy Href" : "Copy Path",
            icon: <CopyIcon />,
            onClick: () => navigator.clipboard.writeText(item.href),
        });

        // OS file clipboard (US-807) — Windows Explorer interop, file provider only.
        if (supportsOsClipboard(provider)) {
            items.push(
                {
                    startGroup: true,
                    label: "Cut",
                    icon: <CutIcon />,
                    onClick: () => copyPathToOsClipboard(item.href, true),
                },
                {
                    label: "Copy",
                    icon: <CopyIcon />,
                    onClick: () => copyPathToOsClipboard(item.href, false),
                },
                {
                    label: "Paste",
                    icon: <PasteIcon />,
                    onClick: () => this.pasteIntoDir(this.getItemListPath(item)),
                },
            );
        }

        if (provider.writable) {
            if (provider.rename) {
                items.push({
                    startGroup: true,
                    label: "Rename...",
                    icon: <RenameIcon />,
                    onClick: () => this.renameItem(item),
                });
            }
            if (provider.deleteItem) {
                items.push({
                    label: "Delete",
                    icon: <DeleteIcon />,
                    onClick: () => this.deleteItemAction(item),
                });
            }
        }

        return items;
    };

    // ── File operations ──────────────────────────────────────────────────

    private createNewFile = async (dirPath: string) => {
        const { provider } = this.props;
        if (!provider.addItem) return;

        const inputResult = await ui.input("Enter file name:", {
            title: "New File",
            buttons: ["Create", "Cancel"],
        });
        if (inputResult?.button !== "Create" || !inputResult.value.trim()) return;

        const name = inputResult.value.trim();
        const href = provider.resolveLink(dirPath ? dirPath + "/" + name : name);

        try {
            await provider.addItem({ href, title: name, category: dirPath, tags: [], isDirectory: false });
        } catch (err) {
            ui.notify(err.message || "Failed to create file.", "warning");
            return;
        }
        await this.loadItems();
    };

    private createNewFolder = async (dirPath: string) => {
        const { provider } = this.props;
        if (!provider.mkdir) return;

        const inputResult = await ui.input("Enter folder name:", {
            title: "New Folder",
            buttons: ["Create", "Cancel"],
        });
        if (inputResult?.button !== "Create" || !inputResult.value.trim()) return;

        const name = inputResult.value.trim();
        const folderPath = dirPath ? dirPath + "/" + name : name;

        try {
            await provider.mkdir(folderPath);
        } catch (err) {
            ui.notify(err.message || "Failed to create folder.", "warning");
            return;
        }
        await this.loadItems();
    };

    renameItem = async (item: ITreeProviderItem) => {
        const { provider } = this.props;
        if (!provider.rename) return;

        const inputResult = await ui.input("Enter new name:", {
            title: `Rename ${item.isDirectory ? "Folder" : "File"}`,
            value: item.title,
            buttons: ["Rename", "Cancel"],
            selectAll: true,
        });
        if (inputResult?.button !== "Rename" || !inputResult.value.trim()) return;

        const newName = inputResult.value.trim();
        const category = item.category;
        const oldPath = category ? category + "/" + item.title : item.title;
        const newPath = category ? category + "/" + newName : newName;

        try {
            await provider.rename(oldPath, newPath);
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            ui.notify(err.message || "Failed to rename.", "warning");
            return;
        }
        await this.loadItems();
    };

    deleteItemAction = async (item: ITreeProviderItem) => {
        const { provider } = this.props;
        if (!provider.deleteItem) return;

        const bt = await ui.confirm(
            `Are you sure you want to delete "${item.title}"?`,
            { title: "Delete Confirmation", buttons: ["Delete", "Cancel"] },
        );
        if (bt !== "Delete") return;

        try {
            await provider.deleteItem(item.href);
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            ui.notify(err.message || "Failed to delete.", "warning");
            return;
        }
        await this.loadItems();
    };
}

// =============================================================================
// Pure utility functions
// =============================================================================

function filterItems(items: ITreeProviderItem[], searchText: string): ITreeProviderItem[] {
    if (!searchText) return items;
    const words = searchText.toLowerCase().split(" ").filter(Boolean);
    if (words.length === 0) return items;
    return items.filter((item) => {
        const nameLower = item.title.toLowerCase();
        return words.every((w) => nameLower.includes(w));
    });
}
