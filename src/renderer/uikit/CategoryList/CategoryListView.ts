import { createIconElement } from "../shared/slots";
import type { IconName } from "../../theme/icon-registry";
import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { KeyedList } from "../shared/keyed-list";
import { VanillaView } from "../shared/vanilla-view";
import type { CategoryListProps } from "./CategoryList";
import "./CategoryList.css";

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

    public constructor(props: CategoryListProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("category-list-root", "scroll-container");
        this.expandedCategory = this.expandedFromProps(props);
        this.lastSyncedValue = props.value;
        this.lastSyncedSeparator = props.separator ?? ":";
    }

    protected onMount(): void {
        this.applyRootProps(this.props);
        this.rows.update(this.buildRows(this.props));
        this.own(() => this.rows.dispose());
    }

    protected onUpdate(props: CategoryListProps): void {
        const separator = props.separator ?? ":";
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
        const { groups, children } = this.groupItems(props.items, separator);

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
                if (!children.has(parentName)) children.set(parentName, []);
                children.get(parentName)!.push({ name: childPart, value: item });
                parentGroups.get(parentName)!.hasChildren = true;
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
        const parts = { data, expand, name };
        this.rowParts.set(row, parts);
        row.addEventListener("click", this.onRowClick);
        expand.addEventListener("click", this.onExpandClick);
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
        row.removeEventListener("click", this.onRowClick);
        parts?.expand.removeEventListener("click", this.onExpandClick);
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
            ...rest
        } = props;

        this.root.dataset.type = "category-list";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.tabIndex = 0;
        this.root.dataset.focusSelection = "";
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
        this.root.classList.add("category-list-root", "scroll-container");
    }
}
