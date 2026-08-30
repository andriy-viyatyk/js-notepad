import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { MultiListBoxView } from "./MultiListBoxView";
import type { MultiListBoxProps } from "./MultiListBoxView";
import type { IListBoxItem } from "../ListBox/types";
import type { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    itemCount?: number;
    withIcons?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    showSearch?: boolean;
    filterMode?: "contains" | "startsWith" | "off";
    selectAll?: boolean;
    rowHeight?: number;
    maxVisibleItems?: number;
    height?: number;
}

function buildItems(count: number, withIcons: boolean): IListBoxItem[] {
    const out: IListBoxItem[] = [];
    for (let i = 0; i < count; i++) {
        out.push({
            value: i,
            label: `Option ${i} — apple banana cherry`,
            icon: withIcons ? "globe" : undefined,
            disabled: i % 13 === 0 && i !== 0,
        });
    }
    return out;
}

class MultiListBoxDemoView extends VanillaView<DemoProps> {
    private items: IListBoxItem[] = [];
    private itemsKey = "";
    private value: IListBoxItem[] = [];
    private view: MultiListBoxView<IListBoxItem> | undefined;
    private valueElement: HTMLElement | undefined;

    public constructor(props: DemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: 420 }));
    }

    protected onMount(): void {
        this.syncItems(this.props);
        const view = this.child(new MultiListBoxView(this.childProps(this.props)));
        this.view = view;
        this.valueElement = createTextElement("", { size: "xs", color: "light" });
        this.root.append(view.root, this.valueElement);
        view.mount();
        this.updateValueLabel();
    }

    protected onUpdate(props: DemoProps): void {
        this.syncItems(props);
        this.view?.update(this.childProps(props));
        this.updateValueLabel();
    }

    private readonly onChange = (value: IListBoxItem[]): void => {
        this.value = value;
        this.view?.update(this.childProps(this.props));
        this.updateValueLabel();
    };

    private syncItems(props: DemoProps): void {
        const key = `${props.itemCount ?? 50}:${props.withIcons ?? true}`;
        if (key === this.itemsKey) return;
        this.items = buildItems(props.itemCount ?? 50, props.withIcons ?? true);
        this.itemsKey = key;
    }

    private childProps(props: DemoProps): MultiListBoxProps<IListBoxItem> {
        return {
            items: this.items,
            value: this.value,
            onChange: this.onChange,
            disabled: props.disabled,
            readOnly: props.readOnly,
            showSearch: props.showSearch,
            filterMode: props.filterMode ?? "contains",
            selectAll: props.selectAll,
            rowHeight: props.rowHeight ?? 24,
            maxVisibleItems: props.maxVisibleItems ?? 10,
            height: props.height || undefined,
        };
    }

    private updateValueLabel(): void {
        if (!this.valueElement) return;
        this.valueElement.textContent = `${this.value.length} selected${this.value.length > 0 ? `: ${this.value.map((item) => item.value).join(", ")}` : ""}`;
    }
}

export const multiListBoxStory: Story<DemoProps> = {
    id: "multilistbox",
    name: "MultiListBox",
    section: "Lists",
    view: MultiListBoxDemoView,
    props: [
        { name: "itemCount", type: "number", default: 50, min: 0, max: 1000, step: 50 },
        { name: "withIcons", type: "boolean", default: true },
        { name: "disabled", type: "boolean", default: false },
        { name: "readOnly", type: "boolean", default: false },
        { name: "showSearch", type: "boolean", default: true },
        { name: "filterMode", type: "enum", options: ["contains", "startsWith", "off"], default: "contains", label: "Filter mode" },
        { name: "selectAll", type: "boolean", default: true, label: "Show select-all" },
        { name: "rowHeight", type: "number", default: 24, min: 16, max: 48, step: 2 },
        { name: "maxVisibleItems", type: "number", default: 10, min: 3, max: 30, step: 1, label: "Max visible rows" },
        { name: "height", type: "number", default: 0, min: 0, max: 600, step: 20, label: "Height (0 = unset)" },
    ],
};
