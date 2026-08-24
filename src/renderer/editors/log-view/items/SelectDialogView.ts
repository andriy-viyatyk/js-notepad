import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { SelectView, type SelectViewProps } from "../../../uikit/Select/SelectView";
import type { IListBoxItem } from "../../../uikit/ListBox/types";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { SelectEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import type { EntryUpdater } from "../LogEntryContent";
import { ButtonsPanelView } from "./ButtonsPanel";
import { DialogContainerView } from "./DialogContainer";
import { DialogHeaderView } from "./DialogHeader";

export interface SelectDialogViewProps { entry: SelectEntry; updateEntry: EntryUpdater<SelectEntry>; model: LogViewEditor; }
const DEFAULT_BUTTONS = ["OK"];

export class SelectDialogView extends VanillaView<SelectDialogViewProps> {
    private readonly header: DialogHeaderView;
    private readonly controlPanel = createPanelElement({ name: "log-select-control", paddingX: "md", paddingY: "sm" });
    private readonly dialogPanel = createPanelElement({ name: "log-select-dialog", direction: "column", minWidth: 200 });
    private readonly select: SelectView<IListBoxItem>;
    private readonly buttons: ButtonsPanelView;
    private readonly container: DialogContainerView;

    public constructor(props: SelectDialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.select = new SelectView<IListBoxItem>(this.selectProps(props));
        this.buttons = new ButtonsPanelView({ buttons: props.entry.buttons ?? DEFAULT_BUTTONS, onClickButton: this.handleClick });
        this.controlPanel.append(this.select.root);
        this.dialogPanel.append(this.header.root, this.controlPanel, this.buttons.root);
        this.container = this.child(new DialogContainerView({ resolved: props.entry.button !== undefined, children: [this.dialogPanel], ownedChildren: [this.header, this.select, this.buttons] }));
    }

    protected onMount(): void { this.updateChildren(this.props); this.container.mount(); this.root.append(this.container.root); }
    protected onUpdate(props: SelectDialogViewProps): void { this.updateChildren(props); }

    private updateChildren(props: SelectDialogViewProps): void {
        this.header.update({ title: props.entry.title });
        this.select.update(this.selectProps(props));
        this.buttons.update({ buttons: props.entry.buttons ?? DEFAULT_BUTTONS, button: props.entry.button, requirementNotMet: !props.entry.selected, onClickButton: this.handleClick });
        this.container.update({ resolved: props.entry.button !== undefined, children: [this.dialogPanel], ownedChildren: [this.header, this.select, this.buttons] });
    }

    private selectProps(props: SelectDialogViewProps): SelectViewProps<IListBoxItem> {
        const items = props.entry.items.map((label) => ({ value: label, label }));
        const value = props.entry.selected == null ? null : { value: props.entry.selected, label: props.entry.selected };
        return { name: "log-select", items, value, onChange: this.handleSelect, placeholder: props.entry.placeholder, disabled: props.entry.button !== undefined };
    }

    private readonly handleSelect = (item: IListBoxItem): void => { this.props.updateEntry((draft) => { draft.selected = String(item.value); }); };
    private readonly handleClick = (label: string): void => { this.props.model.resolveDialog(this.props.entry.id, label); };
}
