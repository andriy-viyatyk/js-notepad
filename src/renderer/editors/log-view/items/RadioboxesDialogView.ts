import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { RadioGroupView } from "../../../uikit/RadioGroup/RadioGroupView";
import type { IRadio, RadioGroupProps } from "../../../uikit/RadioGroup/RadioGroup";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { RadioboxesEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";
import type { EntryUpdater } from "../LogEntryContent";
import { ButtonsPanelView } from "./ButtonsPanel";
import { DialogContainerView } from "./DialogContainer";
import { DialogHeaderView } from "./DialogHeader";

export interface RadioboxesDialogViewProps { entry: RadioboxesEntry; updateEntry: EntryUpdater<RadioboxesEntry>; model: LogViewEditor; }
const DEFAULT_BUTTONS = ["OK"];

export class RadioboxesDialogView extends VanillaView<RadioboxesDialogViewProps> {
    private readonly header: DialogHeaderView;
    private readonly list = createPanelElement({ name: "log-radio-list", paddingX: "md", paddingY: "sm", maxHeight: DIALOG_CONTENT_MAX_HEIGHT, overflowY: "auto" });
    private readonly dialogPanel = createPanelElement({ name: "log-radioboxes-dialog", direction: "column", minWidth: 200 });
    private readonly radios: RadioGroupView;
    private readonly buttons: ButtonsPanelView;
    private readonly container: DialogContainerView;

    public constructor(props: RadioboxesDialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.radios = new RadioGroupView(this.radioProps(props));
        this.buttons = new ButtonsPanelView({ buttons: props.entry.buttons ?? DEFAULT_BUTTONS, onClickButton: this.handleClick });
        this.list.append(this.radios.root);
        this.dialogPanel.append(this.header.root, this.list, this.buttons.root);
        this.container = this.child(new DialogContainerView({ resolved: props.entry.button !== undefined, children: [this.dialogPanel], ownedChildren: [this.header, this.radios, this.buttons] }));
    }

    protected onMount(): void { this.updateChildren(this.props); this.container.mount(); this.root.append(this.container.root); }
    protected onUpdate(props: RadioboxesDialogViewProps): void { this.updateChildren(props); }

    private updateChildren(props: RadioboxesDialogViewProps): void {
        this.header.update({ title: props.entry.title });
        this.radios.update(this.radioProps(props));
        this.buttons.update({ buttons: props.entry.buttons ?? DEFAULT_BUTTONS, button: props.entry.button, requirementNotMet: !props.entry.checked, onClickButton: this.handleClick });
        this.container.update({ resolved: props.entry.button !== undefined, children: [this.dialogPanel], ownedChildren: [this.header, this.radios, this.buttons] });
    }

    private radioProps(props: RadioboxesDialogViewProps): RadioGroupProps {
        const items: IRadio[] = props.entry.items.map((label) => ({ value: label, label }));
        return { name: "log-radio-group", items, value: props.entry.checked ?? "", onChange: this.handleSelect, orientation: props.entry.layout === "flex" ? "horizontal" : "vertical", wrap: props.entry.layout === "flex", gap: "xs", disabled: props.entry.button !== undefined };
    }

    private readonly handleSelect = (label: string): void => { this.props.updateEntry((draft) => { draft.checked = label; }); };
    private readonly handleClick = (label: string): void => { this.props.model.resolveDialog(this.props.entry.id, label); };
}
