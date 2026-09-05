import type { MenuItem } from "../../../core/events/context-menu";
import type { IAiChild, IAiVisionDescriptor, IAiVisible } from "../../../../shared/ai-vision/types";
import {
    activateAppPopupMenuItem,
    closeAppPopupMenu,
    getVisibleAppPopupMenu,
} from "../../../ui/dialogs/poppers/showPopupMenu";

export interface MenuItemInfo {
    readonly label: string;
    readonly enabled: boolean;
    readonly checked: boolean;
    readonly hasSubmenu: boolean;
    readonly indexPath: readonly number[];
}

const POPUP_MENU_MEMBERS: IAiVisionDescriptor["members"] = [
    { name: "items", kind: "property", summary: "Visible popup items in source order, including nested submenu entries." },
    { name: "click", kind: "method", signature: "click(label: string)", summary: "Activate an enabled leaf item by its exact qualified label." },
    { name: "close", kind: "method", signature: "close()", summary: "Dismiss the popup menu." },
];

const POPUP_MENU_DESCRIPTOR: IAiVisionDescriptor = {
    kind: "PopupMenu",
    summary: "The live application popup menu and its visible actions.",
    members: POPUP_MENU_MEMBERS,
    help: "items is a safe snapshot. Use click(\"Parent > Child\") for an enabled leaf, or close() to dismiss the popup.",
};

const MENUS_MEMBERS: IAiVisionDescriptor["members"] = [];

const MENUS_DESCRIPTOR: IAiVisionDescriptor = {
    kind: "Menus",
    summary: "The open application popup menu, indexed as menus[0].",
    members: MENUS_MEMBERS,
    help: "menus[0] is the live popup menu. Read its items, activate an enabled leaf with click(label), or dismiss it with close().",
};

function popupItems(): MenuItem[] | undefined {
    return getVisibleAppPopupMenu()?.model.state.get().items;
}

function snapshotVisibleItems(
    items: readonly MenuItem[],
    parentLabel = "",
    parentEnabled = true,
    parentPath: readonly number[] = [],
): MenuItemInfo[] {
    const snapshot: MenuItemInfo[] = [];
    items.forEach((item, index) => {
        if (item.invisible) return;

        const label = parentLabel ? `${parentLabel} > ${item.label}` : item.label;
        const indexPath = [...parentPath, index];
        const hasSubmenu = Boolean(item.items?.length);
        const enabled = parentEnabled && !item.disabled;
        snapshot.push({
            label,
            enabled,
            checked: Boolean(item.selected && !hasSubmenu),
            hasSubmenu,
            indexPath,
        });
        if (item.items?.length) {
            snapshot.push(...snapshotVisibleItems(item.items, label, enabled, indexPath));
        }
    });
    return snapshot;
}

function itemAtPath(items: readonly MenuItem[], indexPath: readonly number[]): MenuItem | undefined {
    let currentItems = items;
    let item: MenuItem | undefined;
    for (const index of indexPath) {
        item = currentItems[index];
        if (!item) return undefined;
        currentItems = item.items ?? [];
    }
    return item;
}

function resolveItem(items: readonly MenuItem[], label: string): MenuItemInfo {
    const snapshot = snapshotVisibleItems(items);
    const matches = snapshot.filter((item) => item.label === label);
    if (matches.length === 0) {
        throw new Error(`Unknown popup menu item ${JSON.stringify(label)}.`);
    }
    if (matches.length > 1) {
        throw new Error(`Popup menu label ${JSON.stringify(label)} is ambiguous.`);
    }

    const match = matches[0];
    if (match.hasSubmenu) {
        throw new Error(`Popup menu item ${JSON.stringify(label)} opens a submenu; choose a descendant.`);
    }
    if (!match.enabled) {
        throw new Error(`Popup menu item ${JSON.stringify(label)} is disabled.`);
    }
    return match;
}

function effectiveEnabled(items: readonly MenuItem[], indexPath: readonly number[]): boolean {
    let currentItems = items;
    let enabled = true;
    for (const index of indexPath) {
        const item = currentItems[index];
        if (!item) return false;
        enabled = enabled && !item.disabled && !item.invisible;
        currentItems = item.items ?? [];
    }
    return enabled;
}

/** A live, read-only adapter for the current application popup menu. */
export class PopupMenuAdapter implements IAiVisible {
    get items(): readonly MenuItemInfo[] {
        const items = popupItems();
        return items ? snapshotVisibleItems(items) : [];
    }

    async click(label: string): Promise<undefined> {
        const popup = getVisibleAppPopupMenu();
        if (!popup) throw new Error("No application popup menu is open.");

        const items = popup.model.state.get().items as MenuItem[];
        const match = resolveItem(items, label);
        const currentItem = itemAtPath(items, match.indexPath);
        if (!currentItem || currentItem.invisible || !effectiveEnabled(items, match.indexPath)) {
            throw new Error(`Popup menu item ${JSON.stringify(label)} is no longer available.`);
        }
        await activateAppPopupMenuItem(popup, currentItem, match.indexPath, label);
        return undefined;
    }

    async close(): Promise<undefined> {
        await closeAppPopupMenu();
        return undefined;
    }

    get aiVision(): IAiVisionDescriptor {
        return POPUP_MENU_DESCRIPTOR;
    }
}

/** A live indexed root for the renderer-owned application popup menu. */
export class MenusNode implements IAiVisible {
    private readonly popupMenu = new PopupMenuAdapter();

    get aiVision(): IAiVisionDescriptor {
        return {
            ...MENUS_DESCRIPTOR,
            children: () => this.children(),
            index: (key) => this.index(key),
        };
    }

    children(): readonly IAiChild[] {
        return getVisibleAppPopupMenu()
            ? [{ segment: "[0]", kind: this.popupMenu.aiVision.kind, summary: this.popupMenu.aiVision.summary }]
            : [];
    }

    index(key: string | number): PopupMenuAdapter | undefined {
        const index = typeof key === "number" ? key : Number(key);
        if (!Number.isInteger(index) || index < 0 || index !== 0) return undefined;
        return getVisibleAppPopupMenu() ? this.popupMenu : undefined;
    }
}
