import { PopoverView } from "../../uikit/Popover/PopoverView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { ListBoxView } from "../../uikit/ListBox/ListBoxView";
import type { IListBoxItem } from "../../uikit/ListBox/types";
import type { ListBoxModel } from "../../uikit/ListBox/ListBoxModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";

export type SuggestionsMode = "search" | "navigation";
export interface UrlSuggestionsDropdownProps { anchorEl: Element | null; open: boolean; items: string[]; mode: SuggestionsMode; searchText?: string; hoveredIndex: number; onHoveredIndexChange: (index: number) => void; onSelect: (value: string) => void; onClearVisible?: () => void; }

class SuggestionsContentView extends VanillaView<UrlSuggestionsDropdownProps> {
    private readonly header: HTMLDivElement;
    private readonly headerLabel: HTMLSpanElement;
    private readonly headerSpacer: HTMLDivElement;
    private readonly list: ListBoxView<IListBoxItem>;
    private clear: ButtonView | undefined;
    private listModel: ListBoxModel<IListBoxItem> | null = null;
    public constructor(props: UrlSuggestionsDropdownProps, host: HTMLElement) {
        super(props, host); this.root.dataset.type = "url-suggestions-content";
        this.header = createPanelElement({ name: "url-suggestions-header", direction: "row", align: "center", paddingY: "sm", paddingX: "md" });
        this.headerLabel = createTextElement("", { size: "xs", color: "light" });
        this.headerSpacer = createPanelElement({ flex: true });
        this.header.append(this.headerLabel, this.headerSpacer);
        this.list = this.child(new ListBoxView<IListBoxItem>(this.listProps(props)));
    }
    protected onMount(): void { this.root.append(this.header, this.list.root); this.list.mount(); this.sync(this.props); }
    protected onUpdate(props: UrlSuggestionsDropdownProps): void { this.sync(props); this.list.update(this.listProps(props)); if (props.hoveredIndex >= 0) this.listModel?.scrollToIndex(props.hoveredIndex); }
    protected onDispose(): void { this.listModel = null; if (this.clear) this.releaseChild(this.clear); this.clear = undefined; }
    private sync(props: UrlSuggestionsDropdownProps): void {
        this.headerLabel.textContent = props.mode === "search" ? "Search History" : "Navigation History";
        if (props.mode === "search" && props.onClearVisible) { if (!this.clear) { this.clear = this.child(new ButtonView({ name: "url-suggestions-clear", size: "sm", variant: "ghost", children: "Clear", onClick: props.onClearVisible })); this.header.append(this.clear.root); this.clear.mount(); } else this.clear.update({ name: "url-suggestions-clear", size: "sm", variant: "ghost", children: "Clear", onClick: props.onClearVisible }); } else if (this.clear) { this.releaseChild(this.clear); this.clear = undefined; }
    }
    private listProps(props: UrlSuggestionsDropdownProps) { return { name: "url-suggestions-list", onModel: (model: ListBoxModel<IListBoxItem> | null) => { this.listModel = model; }, items: props.items.map((value) => ({ value, label: value })), activeIndex: props.hoveredIndex, onActiveChange: props.onHoveredIndexChange, onChange: (item: IListBoxItem) => props.onSelect(item.value as string), searchText: props.mode === "search" ? props.searchText : undefined, keyboardNav: false, growToHeight: 400 }; }
}

export class UrlSuggestionsDropdownView extends VanillaView<UrlSuggestionsDropdownProps> {
    private readonly popover: PopoverView;
    private content: SuggestionsContentView | undefined;
    public constructor(props: UrlSuggestionsDropdownProps) { super(props, document.createElement("span")); this.root.dataset.type = "url-suggestions"; this.root.style.display = "contents"; this.popover = this.child(new PopoverView(this.popoverProps(props))); }
    protected onMount(): void { this.root.append(this.popover.root); this.popover.mount(); }
    protected onUpdate(props: UrlSuggestionsDropdownProps): void { this.popover.update(this.popoverProps(props)); this.content?.update(props); }
    protected onDispose(): void { this.content = undefined; }
    private popoverProps(props: UrlSuggestionsDropdownProps) { return { name: "url-suggestions", open: props.open && props.anchorEl !== null && props.items.length > 0, elementRef: props.anchorEl, placement: "bottom-start" as const, offset: [0, 2] as [number, number], matchAnchorWidth: true, onMouseDown: (event: MouseEvent) => event.preventDefault(), contentView: (host: HTMLElement) => { const content = new SuggestionsContentView(props, host); this.content = content; return content; } }; }
}
