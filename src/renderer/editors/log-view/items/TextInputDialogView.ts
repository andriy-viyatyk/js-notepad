import { InputView } from "../../../uikit/Input/InputView";
import type { InputProps } from "../../../uikit/Input/Input";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { TextInputEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { ButtonsPanelView } from "./ButtonsPanel";
import { DialogContainerView } from "./DialogContainer";
import { DialogHeaderView } from "./DialogHeader";
import type { EntryUpdater } from "../LogEntryContent";

export interface TextInputDialogViewProps {
    entry: TextInputEntry;
    updateEntry: EntryUpdater<TextInputEntry>;
    model: LogViewEditor;
}
const DEFAULT_BUTTONS = ["OK"];

export class TextInputDialogView extends VanillaView<TextInputDialogViewProps> {
    private readonly field: InputView;
    private readonly fieldPanel = createPanelElement({ name: "log-text-input-field", paddingX: "md", paddingY: "sm" });
    private readonly dialogPanel = createPanelElement({ name: "log-text-input-dialog", direction: "column", minWidth: 300 });
    private readonly header: DialogHeaderView;
    private readonly buttons: ButtonsPanelView;
    private readonly container: DialogContainerView;

    public constructor(props: TextInputDialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.field = new InputView(this.inputProps(props));
        this.buttons = new ButtonsPanelView({ buttons: props.entry.buttons ?? DEFAULT_BUTTONS, onClickButton: this.handleClick });
        this.fieldPanel.append(this.field.root);
        this.dialogPanel.append(this.header.root, this.fieldPanel, this.buttons.root);
        this.container = this.child(new DialogContainerView({
            resolved: props.entry.button !== undefined,
            children: [this.dialogPanel],
            ownedChildren: [this.header, this.field, this.buttons],
        }));
    }

    protected onMount(): void { this.updateChildren(this.props); this.container.mount(); this.root.append(this.container.root); }
    protected onUpdate(props: TextInputDialogViewProps): void { this.updateChildren(props); }

    private updateChildren(props: TextInputDialogViewProps): void {
        this.header.update({ title: props.entry.title });
        this.field.update(this.inputProps(props));
        const buttons = props.entry.buttons ?? DEFAULT_BUTTONS;
        const value = props.entry.text ?? props.entry.defaultValue ?? "";
        this.buttons.update({ buttons, button: props.entry.button, requirementNotMet: !value.trim(), onClickButton: this.handleClick });
        this.container.update({ resolved: props.entry.button !== undefined, children: [this.dialogPanel], ownedChildren: [this.header, this.field, this.buttons] });
    }

    private inputProps(props: TextInputDialogViewProps): InputProps {
        const value = props.entry.text ?? props.entry.defaultValue ?? "";
        return { name: "log-text-input", value, onChange: this.handleTextChange, placeholder: props.entry.placeholder, disabled: props.entry.button !== undefined, onKeyDown: this.handleKeyDown };
    }

    private readonly handleTextChange = (text: string): void => {
        this.props.updateEntry((draft) => { draft.text = text; });
    };

    private readonly handleClick = (label: string): void => { this.props.model.resolveDialog(this.props.entry.id, label); };

    private readonly handleKeyDown = (event: { key: string }): void => {
        const entry = this.props.entry;
        const buttons = entry.buttons ?? DEFAULT_BUTTONS;
        const value = entry.text ?? entry.defaultValue ?? "";
        if (event.key !== "Enter" || entry.button !== undefined) return;
        const defaultButton = buttons[buttons.length - 1];
        const label = defaultButton.startsWith("!") ? defaultButton.slice(1) : defaultButton;
        const hasRequired = buttons.some((button) => button.startsWith("!"));
        if (!hasRequired || value.trim()) this.props.model.resolveDialog(entry.id, label);
    };
}
