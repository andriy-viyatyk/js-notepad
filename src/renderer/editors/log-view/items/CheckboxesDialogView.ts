import { CheckboxView } from "../../../uikit/Checkbox/CheckboxView";
import type { CheckboxProps } from "../../../uikit/Checkbox/CheckboxView";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { CheckboxesEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";
import type { EntryUpdater } from "../LogEntryContent";
import { ButtonsPanelView } from "./ButtonsPanel";
import { DialogContainerView } from "./DialogContainer";
import { DialogHeaderView } from "./DialogHeader";

export interface CheckboxesDialogViewProps { entry: CheckboxesEntry; updateEntry: EntryUpdater<CheckboxesEntry>; model: LogViewEditor; }
const DEFAULT_BUTTONS = ["OK"];

export class CheckboxesDialogView extends VanillaView<CheckboxesDialogViewProps> {
    private readonly header: DialogHeaderView;
    private readonly list = createPanelElement({ name: "log-checkbox-list", paddingX: "md", paddingY: "sm", maxHeight: DIALOG_CONTENT_MAX_HEIGHT, overflowY: "auto" });
    private readonly dialogPanel = createPanelElement({ name: "log-checkboxes-dialog", direction: "column", minWidth: 200 });
    private readonly checkboxes = new Map<number, CheckboxView>();
    private readonly toggleHandlers = new Map<number, () => void>();
    private readonly buttons: ButtonsPanelView;
    private readonly container: DialogContainerView;

    public constructor(props: CheckboxesDialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.buttons = new ButtonsPanelView({ buttons: props.entry.buttons ?? DEFAULT_BUTTONS, onClickButton: this.handleClick });
        this.dialogPanel.append(this.header.root, this.list, this.buttons.root);
        this.container = this.child(new DialogContainerView({ resolved: props.entry.button !== undefined, children: [this.dialogPanel], ownedChildren: [this.header, this.buttons] }));
    }

    protected onMount(): void { this.updateChildren(this.props); this.container.mount(); this.root.append(this.container.root); }
    protected onUpdate(props: CheckboxesDialogViewProps): void { this.updateChildren(props); }

    private updateChildren(props: CheckboxesDialogViewProps): void {
        this.header.update({ title: props.entry.title });
        this.syncCheckboxes(props);
        const buttons = props.entry.buttons ?? DEFAULT_BUTTONS;
        this.buttons.update({ buttons, button: props.entry.button, requirementNotMet: props.entry.items.every((item) => !item.checked), onClickButton: this.handleClick });
        this.container.update({ resolved: props.entry.button !== undefined, children: [this.dialogPanel], ownedChildren: [this.header, this.buttons] });
    }

    private syncCheckboxes(props: CheckboxesDialogViewProps): void {
        this.list.dataset.direction = props.entry.layout === "flex" ? "row" : "column";
        this.list.style.flexDirection = props.entry.layout === "flex" ? "row" : "column";
        this.list.style.flexWrap = props.entry.layout === "flex" ? "wrap" : "nowrap";
        this.list.style.gap = props.entry.layout === "flex" ? "8px" : "4px";
        for (const [index, view] of this.checkboxes) {
            if (index >= props.entry.items.length) { this.releaseChild(view); this.checkboxes.delete(index); this.toggleHandlers.delete(index); }
        }
        props.entry.items.forEach((item, index) => {
            let view = this.checkboxes.get(index);
            if (!view) {
                view = this.child(new CheckboxView(this.checkboxProps(index, item.label, item.checked ?? false, props.entry.button !== undefined)));
                this.checkboxes.set(index, view);
                view.mount();
            } else view.update(this.checkboxProps(index, item.label, item.checked ?? false, props.entry.button !== undefined));
            const expected = this.list.children[index];
            if (expected !== view.root) this.list.insertBefore(view.root, expected ?? null);
        });
    }

    private checkboxProps(index: number, label: string, checked: boolean, disabled: boolean): CheckboxProps {
        let handler = this.toggleHandlers.get(index);
        if (!handler) { handler = () => this.handleToggle(index); this.toggleHandlers.set(index, handler); }
        return { name: `log-checkbox-${index}`, checked, disabled, onChange: handler, children: label };
    }

    private readonly handleToggle = (index: number): void => {
        this.props.updateEntry((draft) => { draft.items[index].checked = !draft.items[index].checked; });
    };
    private readonly handleClick = (label: string): void => { this.props.model.resolveDialog(this.props.entry.id, label); };
}
