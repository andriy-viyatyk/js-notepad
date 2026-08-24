import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { ButtonsEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { ButtonsPanelView } from "./ButtonsPanel";
import { DialogContainerView } from "./DialogContainer";
import { DialogHeaderView } from "./DialogHeader";

export interface ButtonsDialogViewProps { entry: ButtonsEntry; model: LogViewEditor; }

export class ButtonsDialogView extends VanillaView<ButtonsDialogViewProps> {
    private readonly header: DialogHeaderView;
    private readonly buttons: ButtonsPanelView;
    private readonly container: DialogContainerView;

    public constructor(props: ButtonsDialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.buttons = new ButtonsPanelView({ buttons: props.entry.buttons, button: props.entry.button, onClickButton: this.handleClick });
        this.container = this.child(new DialogContainerView({
            resolved: props.entry.button !== undefined,
            children: [this.header.root, this.buttons.root],
            ownedChildren: [this.header, this.buttons],
        }));
    }

    protected onMount(): void { this.updateChildren(this.props); this.container.mount(); this.root.append(this.container.root); }
    protected onUpdate(props: ButtonsDialogViewProps): void { this.updateChildren(props); }

    private updateChildren(props: ButtonsDialogViewProps): void {
        this.header.update({ title: props.entry.title });
        this.buttons.update({ buttons: props.entry.buttons, button: props.entry.button, onClickButton: this.handleClick });
        this.container.update({ resolved: props.entry.button !== undefined, children: [this.header.root, this.buttons.root], ownedChildren: [this.header, this.buttons] });
    }

    private readonly handleClick = (label: string): void => { this.props.model.resolveDialog(this.props.entry.id, label); };
}
