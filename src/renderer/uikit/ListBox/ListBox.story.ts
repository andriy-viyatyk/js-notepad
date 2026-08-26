import { IconButtonView } from "../IconButton/IconButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { VanillaView } from "../shared/vanilla-view";
import { ListBoxView } from "./ListBoxView";
import { ListItemView } from "./ListItemView";
import type { IListBoxItem, ListBoxProps, ListItemRenderContext } from "./types";
import { ContextMenuEvent } from "../../api/events/events";
import type { MenuItem } from "../Menu";
import type { Story } from "../../editors/storybook/storyTypes";

const MAX_REGULAR_ITEMS = 10000;
const REGULAR_ITEMS: IListBoxItem[] = Array.from({ length: MAX_REGULAR_ITEMS }, (_, i) => ({
    value: i,
    label: `Suggestion ${i} — apple banana cherry`,
    icon: "globe",
}));

const SECTIONED_ITEMS: IListBoxItem[] = (() => {
    const out: IListBoxItem[] = [];
    for (let group = 0; group < 4; group++) {
        out.push({ value: `section-${group}`, label: `Group ${group + 1}`, section: true });
        for (let i = 0; i < 10; i++) {
            out.push({ value: `g${group}-i${i}`, label: `Item ${group + 1}.${i + 1} — orange grape`, icon: "globe" });
        }
    }
    return out;
})();

interface DemoProps {
    rowCount?: number;
    searchText?: string;
    keyboardNav?: boolean;
    loading?: boolean;
    customRow?: boolean;
    tooltip?: boolean;
    contextMenu?: boolean;
    predicateSelection?: boolean;
    sections?: boolean;
    variant?: "select" | "browse";
    selectionStyle?: "check" | "accent" | "focus";
    dropActive?: boolean;
}

interface CustomRowEntry {
    row: ListItemView;
    removeButton: IconButtonView;
}

class ListBoxDemoView extends VanillaView<DemoProps> {
    private value: IListBoxItem | null = null;
    private active = 0;
    private removed = new Set<IListBoxItem["value"]>();
    private items: IListBoxItem[] = [];
    private itemsKey = "";
    private removedVersion = 0;
    private wasCustomRow = false;
    private list: ListBoxView<IListBoxItem> | undefined;
    private customRows = new Map<IListBoxItem["value"], CustomRowEntry>();

    public constructor(props: DemoProps) {
        super(props, createPanelElement({ direction: "column", width: 360, height: 300 }));
    }

    protected onMount(): void {
        this.syncItems(this.props);
        const list = this.child(new ListBoxView(this.listProps(this.props)));
        this.list = list;
        this.root.append(list.root);
        list.mount();
        this.wasCustomRow = this.props.customRow ?? false;
    }

    protected onUpdate(props: DemoProps): void {
        if (this.wasCustomRow && !props.customRow) this.disposeCustomRows();
        this.syncItems(props);
        this.list?.update(this.listProps(props));
        this.wasCustomRow = props.customRow ?? false;
    }

    private readonly onChange = (item: IListBoxItem): void => {
        this.value = item;
        this.list?.update(this.listProps(this.props));
    };

    private readonly onActiveChange = (index: number): void => {
        this.active = index;
        this.list?.update(this.listProps(this.props));
    };

    private readonly removeItem = (value: IListBoxItem["value"]): void => {
        this.removed = new Set(this.removed).add(value);
        this.removedVersion++;
        this.itemsKey = "";
        this.syncItems(this.props);
        this.list?.update(this.listProps(this.props));
    };

    private syncItems(props: DemoProps): void {
        const key = `${props.sections ?? false}:${props.rowCount ?? 60}:${this.removedVersion}`;
        if (key === this.itemsKey) return;
        this.itemsKey = key;
        if (props.sections) {
            this.items = SECTIONED_ITEMS;
            return;
        }
        const count = Math.max(0, Math.min(props.rowCount ?? 60, MAX_REGULAR_ITEMS));
        const base = REGULAR_ITEMS.slice(0, count);
        this.items = this.removed.size === 0 ? base : base.filter((item) => !this.removed.has(item.value));
    }

    private listProps(props: DemoProps): ListBoxProps<IListBoxItem> {
        return {
            items: this.items,
            value: props.predicateSelection ? null : this.value,
            onChange: this.onChange,
            isSelected: props.predicateSelection ? this.isPredicateSelected : undefined,
            activeIndex: this.active,
            onActiveChange: this.onActiveChange,
            searchText: props.searchText,
            renderItem: props.customRow ? this.renderCustomRow : undefined,
            keyboardNav: props.keyboardNav,
            loading: props.loading,
            emptyMessage: "no rows",
            getTooltip: props.tooltip ? this.getTooltip : undefined,
            getContextMenu: props.contextMenu ? this.getContextMenu : undefined,
            onContextMenu: props.contextMenu ? this.onContextMenu : undefined,
            variant: props.variant,
            selectionStyle: props.selectionStyle,
        };
    }

    private readonly isPredicateSelected = (item: IListBoxItem): boolean =>
        typeof item.value === "number" && item.value % 5 === 0;

    private readonly getTooltip = (item: IListBoxItem): string | null =>
        typeof item.label === "string" ? `Tooltip: ${item.label}` : null;

    private readonly getContextMenu = (item: IListBoxItem): MenuItem[] => [
        { label: typeof item.label === "string" ? `Copy "${item.label}"` : "Copy", icon: "copy", onClick: () => undefined },
        { label: "Remove", icon: "remove", onClick: () => undefined },
    ];

    private readonly onContextMenu = (event: MouseEvent): void => {
        const context = ContextMenuEvent.fromNativeEvent(event, "generic");
        context.items.push({ label: "List background action", onClick: () => undefined });
    };

    private readonly renderCustomRow = (context: ListItemRenderContext<IListBoxItem>): Node => {
        let entry = this.customRows.get(context.item.value);
        if (!entry) {
            const removeButton = this.child(new IconButtonView({
                icon: "close",
                size: "sm",
                "aria-label": "Remove",
                onClick: () => this.removeItem(context.item.value),
            }));
            const row = this.child(new ListItemView({
                id: context.id,
                icon: context.item.icon,
                label: context.item.label,
                searchText: this.props.searchText,
                selected: context.selected,
                active: context.active,
                dropActive: this.props.dropActive && context.index === 2,
                tooltip: this.props.tooltip ? `Tooltip: ${context.item.label}` : undefined,
                trailingElement: removeButton.root,
            }));
            removeButton.mount();
            row.mount();
            entry = { row, removeButton };
            this.customRows.set(context.item.value, entry);
        }
        entry.row.update({
            id: context.id,
            icon: context.item.icon,
            label: context.item.label,
            searchText: this.props.searchText,
            selected: context.selected,
            active: context.active,
            dropActive: this.props.dropActive && context.index === 2,
            tooltip: this.props.tooltip ? `Tooltip: ${context.item.label}` : undefined,
            trailingElement: entry.removeButton.root,
        });
        return entry.row.root;
    };

    private disposeCustomRows(): void {
        for (const entry of this.customRows.values()) {
            entry.row.dispose();
            entry.removeButton.dispose();
        }
        this.customRows.clear();
    }

    protected onDispose(): void {
        this.disposeCustomRows();
        this.list = undefined;
    }
}

export const listBoxStory: Story<DemoProps> = {
    id: "list-box",
    name: "ListBox",
    section: "Lists",
    view: ListBoxDemoView,
    props: [
        { name: "rowCount", type: "number", default: 60, min: 0, max: 10000, step: 100 },
        { name: "searchText", type: "string", default: "apple" },
        { name: "keyboardNav", type: "boolean", default: true },
        { name: "loading", type: "boolean", default: false },
        { name: "customRow", type: "boolean", default: false },
        { name: "tooltip", type: "boolean", default: false },
        { name: "contextMenu", type: "boolean", default: false },
        { name: "predicateSelection", type: "boolean", default: false },
        { name: "sections", type: "boolean", default: false },
        { name: "variant", type: "enum", options: ["select", "browse"], default: "select" },
        { name: "selectionStyle", type: "enum", options: ["check", "accent", "focus"], default: "check" },
        { name: "dropActive", type: "boolean", default: false },
    ],
};
