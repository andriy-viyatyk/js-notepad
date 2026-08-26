import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { SelectView, type SelectViewProps } from "./SelectView";
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
    itemsMode?: "array" | "lazy-fn" | "lazy-promise";
    resizable?: boolean;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
}

function buildItems(count: number, withIcons: boolean): IListBoxItem[] {
    return Array.from({ length: count }, (_, i) => ({
        value: i,
        label: `Option ${i} — apple banana cherry`,
        icon: withIcons ? "globe" as const : undefined,
    }));
}

class SelectDemoView extends VanillaView<DemoProps> {
    private items: SelectViewProps<IListBoxItem>["items"] = [];
    private itemsKey = "";
    private value: IListBoxItem | null = null;
    private view: SelectView<IListBoxItem> | undefined;
    private valueElement: HTMLElement | undefined;
    private readonly pendingTimers = new Set<number>();

    public constructor(props: DemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: 600 }));
    }

    protected onMount(): void {
        this.syncItems(this.props);
        const view = this.child(new SelectView(this.childProps(this.props)));
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

    private readonly onChange = (value: IListBoxItem): void => {
        this.value = value;
        this.view?.update(this.childProps(this.props));
        this.updateValueLabel();
    };

    private syncItems(props: DemoProps): void {
        const count = props.itemCount ?? 50;
        const withIcons = props.withIcons ?? true;
        const mode = props.itemsMode ?? "array";
        const key = `${mode}:${count}:${withIcons}`;
        if (key === this.itemsKey) return;
        this.itemsKey = key;
        const make = () => buildItems(count, withIcons);
        if (mode === "array") {
            this.items = make();
        } else if (mode === "lazy-fn") {
            this.items = () => make();
        } else {
            this.items = () => new Promise<IListBoxItem[]>((resolve) => {
                const timer = window.setTimeout(() => {
                    this.pendingTimers.delete(timer);
                    resolve(make());
                }, 500);
                this.pendingTimers.add(timer);
            });
        }
    }

    private childProps(props: DemoProps): SelectViewProps<IListBoxItem> {
        return {
            items: this.items,
            value: this.value,
            onChange: this.onChange,
            placeholder: props.placeholder ?? "Pick one…",
            disabled: props.disabled,
            readOnly: props.readOnly,
            size: props.size ?? "md",
            filterMode: props.filterMode ?? "contains",
            resizable: props.resizable,
            width: props.width || undefined,
            minWidth: props.minWidth || undefined,
            maxWidth: props.maxWidth || undefined,
            "aria-label": "Demo select",
        };
    }

    private updateValueLabel(): void {
        if (!this.valueElement) return;
        this.valueElement.textContent = `value: ${this.value ? `{ value: ${JSON.stringify(this.value.value)}, label: ${JSON.stringify(this.value.label)} }` : "null"}`;
    }

    protected onDispose(): void {
        this.pendingTimers.forEach((timer) => window.clearTimeout(timer));
        this.pendingTimers.clear();
        this.view = undefined;
        this.valueElement = undefined;
    }
}

export const selectStory: Story<DemoProps> = {
    id: "select",
    name: "Select",
    section: "Lists",
    view: SelectDemoView,
    props: [
        { name: "placeholder", type: "string", default: "Pick one…" },
        { name: "disabled", type: "boolean", default: false },
        { name: "readOnly", type: "boolean", default: false },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "filterMode", type: "enum", options: ["contains", "startsWith", "off"], default: "contains", label: "Filter mode" },
        { name: "itemCount", type: "number", default: 50, min: 0, max: 1000, step: 50 },
        { name: "withIcons", type: "boolean", default: true },
        { name: "itemsMode", type: "enum", options: ["array", "lazy-fn", "lazy-promise"], default: "array", label: "Items mode" },
        { name: "resizable", type: "boolean", default: false },
        { name: "width", type: "number", default: 0, min: 0, max: 600, step: 20, label: "Width (0 = unset)" },
        { name: "minWidth", type: "number", default: 0, min: 0, max: 400, step: 20, label: "Min width (0 = unset)" },
        { name: "maxWidth", type: "number", default: 0, min: 0, max: 600, step: 20, label: "Max width (0 = unset)" },
    ],
};
