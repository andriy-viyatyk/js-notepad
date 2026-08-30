import { createIconElement } from "../shared/slots";
import type { IconName } from "../../theme/icon-registry";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type NativeHTMLAttributes,
    type RestPropsState,
} from "../shared/dom-props";
import { KeyedList } from "../shared/keyed-list";
import { VanillaView } from "../shared/vanilla-view";
import "./CategoryList.css";

export interface CategoryListProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    /** All values shown by the list. */
    items: string[];
    /** Currently selected value ("" selects the root pseudo-item). Controlled. */
    value: string;
    /** Called when the user picks a row. */
    onChange: (value: string) => void;
    /**
     * Per-row count display. Receives the full value, parent-with-separator, or "" for the
     * root pseudo-item. Returning `undefined` suppresses the count for that row.
     */
    getCount?: (value: string) => number | undefined;
    /**
     * Separator that triggers drill-in for parent rows. Pass `"\0"` to disable drill-in
     * entirely (the list then behaves like a flat list). Default: ":".
     */
    separator?: string;
    /** Label for the root pseudo-item. Default: `"All"`. */
    rootLabel?: string;
}

interface CategoryGroup {
    name: string;
    value: string;
    hasChildren: boolean;
}

interface SubCategory {
    name: string;
    value: string;
}

interface RowData {
    key: string;
    value: string;
    name: string;
    selected: boolean;
    open: boolean;
    expandable: boolean;
    icon?: IconName;
    count?: number;
}

interface RowParts {
    data: RowData;
    expand: HTMLSpanElement;
    name: HTMLSpanElement;
    count?: HTMLSpanElement;
    rowRelease: () => void;
    expandRelease: () => void;
}

interface GroupedItems {
    items: string[];
    separator: string;
    groups: CategoryGroup[];
    children: Map<string, SubCategory[]>;
}

export class CategoryListView extends VanillaView<CategoryListProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private readonly rowParts = new WeakMap<HTMLDivElement, RowParts>();
    private readonly rows = new KeyedList<RowData, string, HTMLDivElement>(
        this.root,
        {
            keyOf: (row) => row.key,
            create: (row) => this.createRow(row),
            update: (element, row) => this.updateRow(element, row),
            remove: (element) => this.removeRow(element),
        },
    );
    private expandedCategory: string | null;
    private lastSyncedValue: string;
    private lastSyncedSeparator: string;
    private groupedItems: GroupedItems | undefined;

    public constructor(props: CategoryListProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("category-list-root", "scroll-container");
        this.expandedCategory = this.expandedFromProps(props);
        this.lastSyncedValue = props.value;
        this.lastSyncedSeparator = props.separator ?? ":";
    }

    protected onMount(): void {
        this.applyRootProps(this.props);
        this.applyConstructionRestProps(this.props);
        this.rows.update(this.buildRows(this.props));
        this.own(() => this.rows.dispose());
    }

    protected onUpdate(props: CategoryListProps): void {
        const separator = props.separator ?? ":";
        if (this.groupedItems
            && (this.groupedItems.items !== props.items || this.groupedItems.separator !== separator)) {
            this.groupedItems = undefined;
        }
        if (props.value !== this.lastSyncedValue || separator !== this.lastSyncedSeparator) {
            this.expandedCategory = this.expandedFromProps(props);
            this.lastSyncedValue = props.value;
            this.lastSyncedSeparator = separator;
        }
        this.applyRootProps(props);
        this.rows.update(this.buildRows(props));
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    private expandedFromProps(props: CategoryListProps): string | null {
        const value = props.value;
        const separator = props.separator ?? ":";
        if (value === "") return null;
        if (!value.includes(separator)) return null;
        return value.slice(0, value.indexOf(separator));
    }

    private buildRows(props: CategoryListProps): RowData[] {
        const separator = props.separator ?? ":";
        const grouped = this.groupedItems;
        const { groups, children } = grouped
            && grouped.items === props.items
            && grouped.separator === separator
            ? grouped
            : this.cacheGroupedItems(props.items, separator);

        if (this.expandedCategory !== null) {
            const parentValue = this.expandedCategory + separator;
            const rows: RowData[] = [{
                key: `parent:${parentValue}`,
                value: parentValue,
                name: this.expandedCategory,
                selected: this.isSelected(parentValue, props.value, separator),
                open: true,
                expandable: true,
                icon: "chevron-left",
                count: props.getCount?.(parentValue),
            }];
            for (const child of children.get(this.expandedCategory) ?? []) {
                rows.push({
                    key: `child:${child.value}`,
                    value: child.value,
                    name: child.name,
                    selected: props.value === child.value,
                    open: false,
                    expandable: false,
                    count: props.getCount?.(child.value),
                });
            }
            return rows;
        }

        const rows: RowData[] = [{
            key: "root",
            value: "",
            name: props.rootLabel ?? "All",
            selected: props.value === "",
            open: false,
            expandable: false,
            count: props.getCount?.(""),
        }];
        for (const group of groups) {
            rows.push({
                key: `group:${group.value}`,
                value: group.value,
                name: group.name,
                selected: this.isSelected(group.value, props.value, separator),
                open: false,
                expandable: group.hasChildren,
                icon: group.hasChildren ? "chevron-right" : undefined,
                count: props.getCount?.(group.value),
            });
        }
        return rows;
    }

    private cacheGroupedItems(items: string[], separator: string): GroupedItems {
        // The caller contract supplies a new items array when its contents change; an in-place
        // mutation would require a separate version signal before identity caching is safe.
        this.groupedItems = {
            items,
            separator,
            ...this.groupItems(items, separator),
        };
        return this.groupedItems;
    }

    private groupItems(items: string[], separator: string): {
        groups: CategoryGroup[];
        children: Map<string, SubCategory[]>;
    } {
        const simpleGroups: CategoryGroup[] = [];
        const parentGroups = new Map<string, CategoryGroup>();
        const children = new Map<string, SubCategory[]>();

        for (const item of items) {
            const separatorIndex = item.indexOf(separator);
            if (separatorIndex === -1) {
                simpleGroups.push({ name: item, value: item, hasChildren: false });
                continue;
            }

            const parentName = item.slice(0, separatorIndex);
            const childPart = item.slice(separatorIndex + 1);
            const parentValue = parentName + separator;
            if (!parentGroups.has(parentName)) {
                parentGroups.set(parentName, { name: parentName, value: parentValue, hasChildren: false });
            }
            if (childPart) {
                let groupChildren = children.get(parentName);
                if (!groupChildren) {
                    groupChildren = [];
                    children.set(parentName, groupChildren);
                }
                groupChildren.push({ name: childPart, value: item });
                const parentGroup = parentGroups.get(parentName);
                if (parentGroup) parentGroup.hasChildren = true;
            }
        }

        const groups = [...simpleGroups, ...parentGroups.values()].sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return a.hasChildren ? 1 : -1;
        });
        for (const groupChildren of children.values()) {
            groupChildren.sort((a, b) => a.name.localeCompare(b.name));
        }
        return { groups, children };
    }

    private isSelected(rowValue: string, selectedValue: string, separator: string): boolean {
        if (selectedValue === rowValue) return true;
        return rowValue.endsWith(separator) && selectedValue.startsWith(rowValue);
    }

    private createRow(data: RowData): HTMLDivElement {
        const row = document.createElement("div");
        const expand = document.createElement("span");
        const name = document.createElement("span");
        expand.dataset.part = "expand";
        name.dataset.part = "name";
        row.dataset.part = "row";
        row.append(expand, name);
        const rowRelease = this.listen(row, "click", this.onRowClick);
        const expandRelease = this.listen(expand, "click", this.onExpandClick);
        this.rowParts.set(row, { data, expand, name, rowRelease, expandRelease });
        return row;
    }

    private updateRow(row: HTMLDivElement, data: RowData): void {
        const parts = this.rowParts.get(row);
        if (!parts) throw new Error("CategoryList lost a row.");
        parts.data = data;
        if (data.selected) row.dataset.selected = "";
        else delete row.dataset.selected;
        if (data.open) row.dataset.state = "open";
        else delete row.dataset.state;
        parts.name.textContent = data.name;

        if (data.icon) parts.expand.replaceChildren(createIconElement(data.icon));
        else parts.expand.replaceChildren();

        if (data.count === undefined) {
            parts.count?.remove();
            parts.count = undefined;
        } else {
            if (!parts.count) {
                parts.count = document.createElement("span");
                parts.count.dataset.part = "count";
            }
            parts.count.textContent = String(data.count);
        }

        const children = [parts.expand, parts.name, parts.count].filter(
            (element): element is HTMLElement => element !== undefined,
        );
        let cursor = row.firstChild;
        for (const child of children) {
            if (cursor !== child) row.insertBefore(child, cursor);
            cursor = child.nextSibling;
        }
    }

    private removeRow(row: HTMLDivElement): void {
        const parts = this.rowParts.get(row);
        parts?.rowRelease();
        parts?.expandRelease();
        this.rowParts.delete(row);
    }

    private readonly onRowClick = (event: Event): void => {
        const row = event.currentTarget as HTMLDivElement;
        const data = this.rowParts.get(row)?.data;
        if (data) this.props.onChange(data.value);
    };

    private readonly onExpandClick = (event: Event): void => {
        const expand = event.currentTarget as HTMLSpanElement;
        const row = expand.parentElement as HTMLDivElement | null;
        const data = row ? this.rowParts.get(row)?.data : undefined;
        if (!data?.expandable) return;

        event.stopPropagation();
        if (data.open) {
            this.expandedCategory = null;
            this.rows.update(this.buildRows(this.props));
            return;
        }

        this.expandedCategory = data.name;
        this.rows.update(this.buildRows(this.props));
        this.props.onChange(data.name + (this.props.separator ?? ":"));
    };

    private applyRootProps(props: CategoryListProps): void {
        const {
            name,
            items: _items,
            value: _value,
            onChange: _onChange,
            getCount: _getCount,
            separator: _separator,
            rootLabel: _rootLabel,
            ..._rest
        } = props;

        this.root.dataset.type = "category-list";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.tabIndex = 0;
        this.root.dataset.focusSelection = "";
        this.root.classList.add("category-list-root", "scroll-container");
    }

    private applyConstructionRestProps(props: CategoryListProps): void {
        const {
            name: _name,
            items: _items,
            value: _value,
            onChange: _onChange,
            getCount: _getCount,
            separator: _separator,
            rootLabel: _rootLabel,
            ...rest
        } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }
}
