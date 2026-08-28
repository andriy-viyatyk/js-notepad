import { ButtonView } from "../Button/ButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { AutocompleteView, type AutocompleteViewProps } from "./AutocompleteView";
import type { IListBoxItem } from "../ListBox/types";
import type { Story } from "../../editors/storybook/storyTypes";

const COMMON_HEADERS = [
    "Accept", "Accept-Charset", "Accept-Encoding", "Accept-Language", "Authorization",
    "Cache-Control", "Content-Encoding", "Content-Language", "Content-Length", "Content-Type",
    "Cookie", "Host", "If-Match", "If-Modified-Since", "If-None-Match", "Origin", "Pragma",
    "Range", "Referer", "User-Agent", "X-Forwarded-For", "X-Requested-With",
];

const HISTORY_SAMPLE = [
    "react hooks tutorial", "react server components", "rust async runtime", "rust borrow checker",
    "typescript narrowing", "typescript template literal types", "vite plugin api", "monaco editor api",
];

interface DemoProps {
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    size?: "sm" | "md";
    filterMode?: "contains" | "startsWith" | "off";
    itemsMode?: "common-headers" | "with-icons" | "history-prefiltered";
    openOnFocus?: boolean;
    withOnSubmit?: boolean;
    withHeader?: boolean;
    withHeaderAction?: boolean;
    withEmptyMessage?: boolean;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
}

function buildIconItems(): IListBoxItem[] {
    return COMMON_HEADERS.map((label) => ({ value: label, label, icon: "globe" }));
}

class AutocompleteDemoView extends VanillaView<DemoProps> {
    private value = "";
    private lastSubmit: string | null = null;
    private lastEscape: string | null = null;
    private items: string[] | IListBoxItem[] = COMMON_HEADERS;
    private itemsKey = "";
    private view: AutocompleteView | undefined;
    private valueElement: HTMLElement | undefined;
    private submitElement: HTMLElement | undefined;
    private escapeElement: HTMLElement | undefined;
    private headerElement: HTMLElement | undefined;
    private headerActionView: ButtonView | undefined;
    private emptyMessageElement: HTMLElement | undefined;

    public constructor(props: DemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: 600 }));
    }

    protected onMount(): void {
        this.headerElement = createTextElement("Search History", { size: "xs", color: "light" });
        this.headerActionView = this.child(new ButtonView({
            size: "sm",
            variant: "ghost",
            children: "Clear",
            onClick: this.clearValue,
        }));
        this.headerActionView.mount();
        this.emptyMessageElement = createTextElement("No matching entries", { size: "xs", color: "light" });
        this.syncItems(this.props);

        const view = this.child(new AutocompleteView(this.childProps(this.props)));
        this.view = view;
        this.valueElement = createTextElement("", { size: "xs", color: "light" });
        this.submitElement = createTextElement("", { size: "xs", color: "light" });
        this.escapeElement = createTextElement("", { size: "xs", color: "light" });
        this.root.append(view.root, this.valueElement);
        if (this.props.withOnSubmit) this.root.append(this.submitElement);
        this.root.append(this.escapeElement);
        view.mount();
        this.updateLabels();
    }

    protected onUpdate(props: DemoProps): void {
        this.syncItems(props);
        this.view?.update(this.childProps(props));
        this.syncSubmitElement(props);
        this.updateLabels();
    }

    private readonly onChange = (value: string): void => {
        this.value = value;
        this.syncItems(this.props);
        this.view?.update(this.childProps(this.props));
        this.updateLabels();
    };

    private readonly clearValue = (): void => {
        this.value = "";
        this.syncItems(this.props);
        this.view?.update(this.childProps(this.props));
        this.updateLabels();
    };

    private readonly onSubmit = (value: string): void => {
        this.lastSubmit = value;
        this.updateLabels();
    };

    private readonly onEscape = (value: string): void => {
        this.lastEscape = value;
        this.updateLabels();
    };

    private syncItems(props: DemoProps): void {
        const mode = props.itemsMode ?? "common-headers";
        const key = `${mode}:${this.value}`;
        if (key === this.itemsKey) return;
        this.itemsKey = key;
        if (mode === "with-icons") {
            this.items = buildIconItems();
        } else if (mode === "history-prefiltered") {
            const words = this.value.toLowerCase().split(/\s+/).filter(Boolean);
            this.items = words.length === 0
                ? HISTORY_SAMPLE
                : HISTORY_SAMPLE.filter((entry) => words.every((word) => entry.toLowerCase().includes(word)));
        } else {
            this.items = COMMON_HEADERS;
        }
    }

    private childProps(props: DemoProps): AutocompleteViewProps {
        return {
            name: "demo-autocomplete",
            items: this.items,
            value: this.value,
            onChange: this.onChange,
            placeholder: props.placeholder ?? "Type a header name…",
            disabled: props.disabled,
            readOnly: props.readOnly,
            size: props.size ?? "md",
            filterMode: props.itemsMode === "history-prefiltered" ? "off" : (props.filterMode ?? "contains"),
            openOnFocus: props.openOnFocus,
            onSubmit: props.withOnSubmit ? this.onSubmit : undefined,
            onEscape: this.onEscape,
            header: props.withHeader ? this.headerElement : undefined,
            headerAction: props.withHeader && props.withHeaderAction ? this.headerActionView?.root : undefined,
            emptyMessage: props.withEmptyMessage ? this.emptyMessageElement : undefined,
            width: props.width || undefined,
            minWidth: props.minWidth || undefined,
            maxWidth: props.maxWidth || undefined,
            "aria-label": "Demo autocomplete",
        };
    }

    private updateLabels(): void {
        if (this.valueElement) this.valueElement.textContent = `value: ${JSON.stringify(this.value)}`;
        if (this.submitElement) this.submitElement.textContent = `last onSubmit: ${this.lastSubmit == null ? "—" : JSON.stringify(this.lastSubmit)}`;
        if (this.escapeElement) this.escapeElement.textContent = `last onEscape: ${this.lastEscape == null ? "—" : JSON.stringify(this.lastEscape)}`;
    }

    private syncSubmitElement(props: DemoProps): void {
        if (!this.submitElement) return;
        if (props.withOnSubmit && !this.submitElement.isConnected) this.root.insertBefore(this.submitElement, this.escapeElement ?? null);
        else if (!props.withOnSubmit && this.submitElement.isConnected) this.submitElement.remove();
    }
}

export const autocompleteStory: Story<DemoProps> = {
    id: "autocomplete",
    name: "Autocomplete",
    section: "Lists",
    view: AutocompleteDemoView,
    props: [
        { name: "placeholder", type: "string", default: "Type a header name…" },
        { name: "disabled", type: "boolean", default: false },
        { name: "readOnly", type: "boolean", default: false },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "filterMode", type: "enum", options: ["contains", "startsWith", "off"], default: "contains", label: "Filter mode" },
        { name: "itemsMode", type: "enum", options: ["common-headers", "with-icons", "history-prefiltered"], default: "common-headers", label: "Items mode" },
        { name: "openOnFocus", type: "boolean", default: false, label: "Open on focus" },
        { name: "withOnSubmit", type: "boolean", default: false, label: "Enable onSubmit (Browser URL bar style)" },
        { name: "withHeader", type: "boolean", default: false, label: "Show dropdown header" },
        { name: "withHeaderAction", type: "boolean", default: false, label: "Show 'Clear' header action" },
        { name: "withEmptyMessage", type: "boolean", default: false, label: "Show empty-message when no match" },
        { name: "width", type: "number", default: 0, min: 0, max: 600, step: 20, label: "Width (0 = unset)" },
        { name: "minWidth", type: "number", default: 0, min: 0, max: 400, step: 20, label: "Min width (0 = unset)" },
        { name: "maxWidth", type: "number", default: 0, min: 0, max: 600, step: 20, label: "Max width (0 = unset)" },
    ],
};
