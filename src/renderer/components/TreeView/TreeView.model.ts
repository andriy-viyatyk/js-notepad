import { TComponentModel } from "../../core/state/model";
import RenderGridModel from "../virtualization/RenderGrid/RenderGridModel";

// Drag & Drop types for TreeView
export type DragType = string;

export interface DragItem {
    type: DragType;
    [key: string]: any;
}

export interface TreeItem<T extends TreeItem<T> = any> {
    items?: T[];
}

export interface TreeViewItem<T extends TreeItem = TreeItem> {
    item: T;
    level: number;
    expanded: boolean;
    parent?: TreeViewItem<T>;
    items?: TreeViewItem<T>[];
}

export interface TreeViewState<T extends TreeItem = TreeItem> {
    root?: T;
    item?: TreeViewItem<T>;
    rows: TreeViewItem<T>[];
}

export const defaultTreeViewState: TreeViewState = {
    rows: [],
};

/** Ref interface exposing TreeView imperative methods */
export interface TreeViewRef {
    /** Get current expansion state as a map of item IDs to expanded booleans */
    getExpandMap(): Record<string, boolean>;
    /** Expand all tree nodes */
    expandAll(): void;
    /** Collapse all tree nodes (except root if rootCollapsible is false) */
    collapseAll(): void;
    /** Toggle expansion of a specific item by its ID */
    toggleItem(id: string): void;
    /** Get current vertical scroll position */
    getScrollTop(): number;
    /** Set vertical scroll position */
    setScrollTop(value: number): void;
}

export interface TreeViewProps<T extends TreeItem = TreeItem> {
    root: T;
    getLabel: (item: T) => React.ReactNode;
    getIcon?: (item: T) => React.ReactNode;
    getId: (item: T) => string;
    getSelected?: (item: T) => boolean;
    onItemClick?: (item: T) => void;
    onItemContextMenu?: (item: T, e: React.MouseEvent) => void;
    dropTypes?: DragType[];
    onDrop?: (dropItem: T, dragItem: DragItem) => void;
    /** Drag type for making tree cells draggable */
    dragType?: DragType;
    /** Get drag item data for a tree node. Return null to prevent dragging. */
    getDragItem?: (item: T) => DragItem | null;
    /** Whether root element can be collapsed. Default: false */
    rootCollapsible?: boolean;
    /** Change this value to trigger a grid refresh (e.g., when external selection state changes) */
    refreshKey?: string | number;
    /** Expand all nodes by default. Default: false (only first 2 levels expanded) */
    defaultExpandAll?: boolean;
    /** Initial expansion state to restore from cache. Keys are item IDs, values are expanded booleans. */
    initialExpandMap?: Record<string, boolean>;
    /** Called when user double-clicks a tree item */
    onItemDoubleClick?: (item: T) => void;
    /** Called when a tree node is expanded or collapsed */
    onExpandChange?: (id: string, expanded: boolean) => void;
    /** Return true if an item should show an expand arrow even when its children aren't loaded yet (lazy loading) */
    getHasChildren?: (item: T) => boolean;
}

export function treeItemForEach<T extends TreeItem = TreeItem>(
    root: T,
    func: (item: T) => void,
    fromChild = false,
) {
    if (!fromChild) func(root);

    if (root.items) {
        root.items.forEach((i) => treeItemForEach(i, func, fromChild));
    }

    if (fromChild) func(root);
}

function buildTreeViewItem<T extends TreeItem = TreeItem>(
    root: T,
    level: number,
    parent?: TreeViewItem<T>,
    getExpanded?: (i: T) => boolean | undefined,
    defaultExpandAll?: boolean,
): TreeViewItem<T> {
    const expandedGet = getExpanded?.(root);
    const expanded = expandedGet === undefined ? (defaultExpandAll || level < 2) : expandedGet;
    const item: TreeViewItem<T> = { item: root, level, expanded, parent };

    if (root.items) {
        item.items = root.items.map((i) =>
            buildTreeViewItem(i, level + 1, item, getExpanded, defaultExpandAll),
        );
    }

    return item;
}

function buildRows<T extends TreeItem = TreeItem>(
    item: TreeViewItem<T>,
    rows: TreeViewItem<T>[] = [],
): TreeViewItem<T>[] {
    rows.push(item);

    if (item.expanded && item.items) {
        item.items.forEach((i) => buildRows(i, rows));
    }

    return rows;
}

export class TreeViewModel<
    T extends TreeItem = TreeItem,
> extends TComponentModel<TreeViewState<T>, TreeViewProps<T>> {
    gridRef: RenderGridModel | null = null;
    private expandMap: { [key: string]: boolean | undefined } = {};
    private lastRefreshKey: string | number | undefined;

    setProps = () => {
        if (this.state.get().root !== this.props.root) {
            setTimeout(() => {
                this.rebuildTreeView(this.props.root);
            }, 0);
        }
        // Refresh grid when refreshKey changes (e.g., external selection change)
        if (this.props.refreshKey !== this.lastRefreshKey) {
            this.lastRefreshKey = this.props.refreshKey;
            this.gridRef?.update({ all: true });
        }
    };

    private buildExpandMap = () => {
        const map: { [key: string]: boolean | undefined } = {};
        const stateItem = this.state.get().item;
        if (stateItem) {
            this.forEach(stateItem, (i) => {
                map[this.props.getId(i.item)] = i.expanded;
            });
        }
        return map;
    };

    rebuildTreeView = (root: T) => {
        // Preserve existing expand state, or use stored expandMap, or use initialExpandMap from props
        const currentMap = this.buildExpandMap();
        const isRebuild = Object.keys(currentMap).length > 0;
        const map = isRebuild
            ? currentMap
            : Object.keys(this.expandMap).length > 0
                ? this.expandMap
                : this.props.initialExpandMap ?? {};

        // During rebuild, items not in the map (e.g. newly created folders) should
        // default to collapsed instead of using the level < 2 auto-expand fallback.
        const getExpanded = (i: T) => {
            const id = this.props.getId(i);
            if (id in map) return map[id];
            return isRebuild ? false : undefined;
        };
        const item = buildTreeViewItem(root, 0, undefined, getExpanded, this.props.defaultExpandAll);

        this.state.set((s) => ({
            ...s,
            root: this.props.root,
            item,
            rows: buildRows(item),
        }));

        // Save expand state
        this.expandMap = this.buildExpandMap();
        this.gridRef?.update({ all: true });
    };

    mapItem = (
        root: TreeViewItem<T>,
        mapFunc: (item: TreeViewItem<T>) => TreeViewItem<T>,
    ) => {
        const item = mapFunc({ ...root });

        if (item.items) {
            item.items = item.items.map((i) => this.mapItem(i, mapFunc));
        }

        return item;
    };

    forEach = (
        root: TreeViewItem<T>,
        func: (item: TreeViewItem<T>) => void,
    ) => {
        func(root);

        if (root.items) {
            root.items.forEach((i) => this.forEach(i, func));
        }
    };

    /** Toggle expansion of a specific item found by its ID */
    toggleItemById = (id: string) => {
        const root = this.state.get().item;
        if (!root) return;
        let target: TreeViewItem<T> | undefined;
        this.forEach(root, (i) => {
            if (this.props.getId(i.item) === id) target = i;
        });
        if (target) this.toggleExpanded(target);
    };

    toggleExpanded = (item: TreeViewItem<T>) => {
        const root = this.state.get().item;
        if (root) {
            const newExpanded = !item.expanded;
            const newItem = this.mapItem(root, (i) => {
                return this.props.getId(i.item) === this.props.getId(item.item)
                    ? { ...i, expanded: newExpanded }
                    : i;
            });

            this.state.set((s) => ({
                ...s,
                item: newItem,
                rows: buildRows(newItem),
            }));

            this.gridRef?.update({ all: true });

            // Save expand state
            this.expandMap = this.buildExpandMap();

            // Notify parent of expansion change
            this.props.onExpandChange?.(this.props.getId(item.item), newExpanded);
        }
    };

    /** Get current expansion state as a map of item IDs to expanded booleans */
    getExpandMap = (): Record<string, boolean> => {
        const map: Record<string, boolean> = {};
        const stateItem = this.state.get().item;
        if (stateItem) {
            this.forEach(stateItem, (i) => {
                const expanded = i.expanded;
                if (expanded !== undefined) {
                    map[this.props.getId(i.item)] = expanded;
                }
            });
        }
        return map;
    };

    /** Expand all tree nodes */
    expandAll = () => {
        const root = this.state.get().item;
        if (root) {
            const newItem = this.mapItem(root, (i) => ({ ...i, expanded: true }));
            this.state.set((s) => ({ ...s, item: newItem, rows: buildRows(newItem) }));
            this.gridRef?.update({ all: true });
            this.expandMap = this.buildExpandMap();
        }
    };

    /** Collapse all tree nodes (except root if rootCollapsible is false) */
    collapseAll = () => {
        const root = this.state.get().item;
        if (root) {
            const newItem = this.mapItem(root, (i) => ({
                ...i,
                expanded: i.level === 0 && !this.props.rootCollapsible ? true : false,
            }));
            this.state.set((s) => ({ ...s, item: newItem, rows: buildRows(newItem) }));
            this.gridRef?.update({ all: true });
            this.expandMap = this.buildExpandMap();
        }
    };

    setGridRef = (ref: RenderGridModel) => {
        this.gridRef = ref;
    };
}
