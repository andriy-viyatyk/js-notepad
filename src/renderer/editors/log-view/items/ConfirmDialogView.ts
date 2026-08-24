import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { createTextElement } from "../../../uikit/Text/text-style";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { ConfirmEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { StyledTextView } from "../StyledTextView";
import { ButtonsPanelView } from "./ButtonsPanel";
import { DialogContainerView } from "./DialogContainer";

export interface ConfirmDialogViewProps { entry: ConfirmEntry; model: LogViewEditor; }
const DEFAULT_BUTTONS = ["No", "Yes"];

export class ConfirmDialogView extends VanillaView<ConfirmDialogViewProps> {
    private readonly messageText = createTextElement("", { size: "base" });
    private readonly styledMessage: StyledTextView;
    private readonly messagePanel = createPanelElement({ name: "log-confirm-message", paddingX: "md", paddingY: "sm" });
    private readonly buttons: ButtonsPanelView;
    private readonly container: DialogContainerView;

    public constructor(props: ConfirmDialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.styledMessage = new StyledTextView({ text: "" });
        this.messagePanel.append(this.messageText, this.styledMessage.root);
        this.buttons = new ButtonsPanelView({ buttons: [], onClickButton: this.handleClick });
        this.container = this.child(new DialogContainerView({
            resolved: props.entry.button !== undefined,
            children: [this.messagePanel, this.buttons.root],
            ownedChildren: [this.styledMessage, this.buttons],
        }));
    }

    protected onMount(): void { this.updateChildren(this.props); this.container.mount(); this.root.append(this.container.root); }
    protected onUpdate(props: ConfirmDialogViewProps): void { this.updateChildren(props); }

    private updateChildren(props: ConfirmDialogViewProps): void {
        this.styledMessage.update({ text: props.entry.message });
        this.buttons.update({ buttons: props.entry.buttons ?? DEFAULT_BUTTONS, button: props.entry.button, onClickButton: this.handleClick });
        this.container.update({ resolved: props.entry.button !== undefined, children: [this.messagePanel, this.buttons.root], ownedChildren: [this.styledMessage, this.buttons] });
    }

    private readonly handleClick = (label: string): void => { this.props.model.resolveDialog(this.props.entry.id, label); };
}
