import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { MultiSelectView, type MultiSelectViewProps } from "./MultiSelectView";
import type { IListBoxItem } from "../ListBox";
import type { Story } from "../../editors/storybook/storyTypes";

interface DemoProps {
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    size?: "sm" | "md";
    filterMode?: "contains" | "startsWith" | "off";
    itemCount?: number;
    withIcons?: boolean;
    selectAll?: boolean;
    resizable?: boolean;
    matchAnchorWidth?: boolean;
    formatVariant?: "default" | "comma-join";
    width?: number;
    minWidth?: number;
    maxWidth?: number;
}

function buildItems(count: number, withIcons: boolean): IListBoxItem[] {
    const out: IListBoxItem[] = [];
    for (let i = 0; i < count; i++) {
        out.push({ value: i, label: `Option ${i} — apple banana cherry`, icon: withIcons ? "globe" : undefined });
    }
    return out;
}

class MultiSelectDemoView extends VanillaView<DemoProps> {
    private items: IListBoxItem[] = [];
    private itemsKey = "";
    private formatKey = "";
    private formatSelection: ((value: IListBoxItem[]) => string) | undefined;
    private value: IListBoxItem[] = [];
    private view: MultiSelectView<IListBoxItem> | undefined;
    private valueElement: HTMLElement | undefined;

    public constructor(props: DemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: 520 }));
    }

    protected onMount(): void {
        this.syncDerived(this.props);
        const view = this.child(new MultiSelectView(this.childProps(this.props)));
        this.view = view;
        this.valueElement = createTextElement("", { size: "xs", color: "light" });
        this.root.append(view.root, this.valueElement);
        view.mount();
        this.updateValueLabel();
    }

    protected onUpdate(props: DemoProps): void {
        this.syncDerived(props);
        this.view?.update(this.childProps(props));
        this.updateValueLabel();
    }

    private readonly onChange = (value: IListBoxItem[]): void => {
        this.value = value;
        this.view?.update(this.childProps(this.props));
        this.updateValueLabel();
    };

    private syncDerived(props: DemoProps): void {
        const itemCount = props.itemCount ?? 50;
        const withIcons = props.withIcons ?? true;
        const nextKey = `${itemCount}:${withIcons}`;
        if (nextKey !== this.itemsKey) {
            this.items = buildItems(itemCount, withIcons);
            this.itemsKey = nextKey;
        }
        const formatVariant = props.formatVariant ?? "default";
        if (formatVariant === this.formatKey) return;
        this.formatKey = formatVariant;
        if (formatVariant === "comma-join") {
            this.formatSelection = (value) => {
                if (value.length === 0) return "";
                const labels = value
                    .map((item) => typeof item.label === "string" ? item.label.split(" — ")[0] : String(item.value))
                    .slice(0, 3)
                    .join(", ");
                return value.length > 3 ? `${labels}, +${value.length - 3} more` : labels;
            };
        } else {
            this.formatSelection = undefined;
        }
    }

    private childProps(props: DemoProps): MultiSelectViewProps<IListBoxItem> {
        return {
            items: this.items,
            value: this.value,
            onChange: this.onChange,
            placeholder: props.placeholder ?? "Pick options…",
            disabled: props.disabled,
            readOnly: props.readOnly,
            size: props.size ?? "md",
            filterMode: props.filterMode ?? "contains",
            selectAll: props.selectAll,
            resizable: props.resizable,
            matchAnchorWidth: props.matchAnchorWidth,
            formatSelection: this.formatSelection,
            width: props.width || undefined,
            minWidth: props.minWidth || undefined,
            maxWidth: props.maxWidth || undefined,
            "aria-label": "Demo multi-select",
        };
    }

    private updateValueLabel(): void {
        if (!this.valueElement) return;
        this.valueElement.textContent = `${this.value.length} selected${this.value.length > 0 ? `: ${this.value.map((item) => item.value).join(", ")}` : ""}`;
    }
}

export const multiSelectStory: Story<DemoProps> = {
    id: "multiselect",
    name: "MultiSelect",
    section: "Lists",
    view: MultiSelectDemoView,
    props: [
        { name: "placeholder", type: "string", default: "Pick options…" },
        { name: "disabled", type: "boolean", default: false },
        { name: "readOnly", type: "boolean", default: false },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "filterMode", type: "enum", options: ["contains", "startsWith", "off"], default: "contains", label: "Filter mode" },
        { name: "itemCount", type: "number", default: 50, min: 0, max: 1000, step: 50 },
        { name: "withIcons", type: "boolean", default: true },
        { name: "selectAll", type: "boolean", default: true, label: "Show select-all" },
        { name: "resizable", type: "boolean", default: false },
        { name: "matchAnchorWidth", type: "boolean", default: true, label: "Match anchor width" },
        { name: "formatVariant", type: "enum", options: ["default", "comma-join"], default: "default", label: "Format selection" },
        { name: "width", type: "number", default: 0, min: 0, max: 600, step: 20, label: "Width (0 = unset)" },
        { name: "minWidth", type: "number", default: 0, min: 0, max: 400, step: 20, label: "Min width (0 = unset)" },
        { name: "maxWidth", type: "number", default: 0, min: 0, max: 600, step: 20, label: "Max width (0 = unset)" },
    ],
};
