import { BaseEvent } from "./BaseEvent";

/** Menu item definition shared by renderer primitives and application adapters. */
export interface MenuItem {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Epic C owns icon/slot typing.
    icon?: any;
    invisible?: boolean;
    /** When true, a separator line is shown above this item. */
    startGroup?: boolean;
    hotKey?: string;
    /** Initially highlighted item. */
    selected?: boolean;
    id?: string;
    /** Sub-menu items. */
    items?: MenuItem[];
    minor?: boolean;
}

/** Identifies the source/kind of a context menu. */
export type ContextMenuTargetKind =
    | "page-tab"
    | "file-explorer-item"
    | "file-explorer-background"
    | "sidebar-folder"
    | "sidebar-background"
    | "markdown-link"
    | "browser-webview"
    | "browser-url-bar"
    | "browser-tab"
    | "grid-cell"
    | "graph-node"
    | "graph-area"
    | "link-item"
    | "link-pinned"
    | "tree-provider-item"
    | "tree-provider-background"
    | "generic";

/** Generic context-menu event carried through a native mouse-event expando. */
export class ContextMenuEvent<T> extends BaseEvent {
    readonly targetKind: ContextMenuTargetKind;
    target: T;
    items: MenuItem[];

    constructor(targetKind: ContextMenuTargetKind, target: T, items: MenuItem[] = []) {
        super();
        this.targetKind = targetKind;
        this.target = target;
        this.items = items;
    }

    /** Get or create a ContextMenuEvent on the native mouse event. */
    static fromNativeEvent(
        event: MouseEvent,
        targetKind: ContextMenuTargetKind,
    ): ContextMenuEvent<unknown> {
        if (!event.contextMenuEvent) {
            event.contextMenuEvent = new ContextMenuEvent(targetKind, null);
        }
        return event.contextMenuEvent;
    }
}
