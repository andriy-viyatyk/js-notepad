import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/Dialog";
import { InputView } from "../../uikit/Input/InputView";
import { RadioGroupView } from "../../uikit/RadioGroup/RadioGroupView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type { InputDialogProps, InputResult } from "./InputDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";
import "../../uikit/RadioGroup/RadioGroup.css";

type InputDialogModel = TDialogModel<InputDialogProps, InputResult | undefined> & {
    handleKeyDown(event: KeyboardEvent): void;
    setValue(value: string): void;
    setSelectedOption(option: string): void;
};

export class InputDialogView extends VanillaView<DialogViewProps> {
    private readonly model: InputDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly inputView: InputView;
    private inputElement: HTMLInputElement | undefined;
    private readonly messageElement: HTMLSpanElement;
    private readonly buttonsPanel: HTMLDivElement;
    private readonly radioGroupView: RadioGroupView | undefined;
    private readonly buttonViews = new Map<number, ButtonView>();
    private focusTimer: ReturnType<typeof setTimeout> | undefined;
    private viewDisposed = false;

    public constructor(props: DialogViewProps) {
        const model = props.model as InputDialogModel;
        const state = model.state.get();
        const inputView = new InputView({
            name: "input-dialog-input",
            value: state.value ?? "",
            onChange: model.setValue,
        });
        const messageElement = createTextElement(state.message);
        const inputPanel = createPanelElement(
            { direction: "column", paddingX: "xxl", paddingTop: "xl", paddingBottom: "sm", gap: "md" },
            [messageElement, inputView.root],
        );

        let radioGroupView: RadioGroupView | undefined;
        let radioPanel: HTMLDivElement | undefined;
        if (state.options && state.options.length > 0) {
            radioGroupView = new RadioGroupView({
                name: "input-dialog-radio",
                orientation: "horizontal",
                wrap: true,
                items: state.options.map((value) => ({ value })),
                value: state.selectedOption ?? "",
                onChange: model.setSelectedOption,
            });
            radioPanel = createPanelElement(
                { paddingX: "xxl", paddingY: "sm" },
                [radioGroupView.root],
            );
        }

        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(inputPanel);
        if (radioPanel) contentChildren.append(radioPanel);
        contentChildren.append(buttonsPanel);
        const contentView = new DialogContentView({
            title: state.title,
            icon: "confirm",
            onClose: () => { void model.close(undefined); },
            minWidth: 340,
            maxWidth: 800,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "input-dialog",
            autoFocus: false,
            onKeyDown: (event) => model.handleKeyDown(event),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.inputView = this.child(inputView);
        this.messageElement = messageElement;
        this.buttonsPanel = buttonsPanel;
        this.radioGroupView = radioGroupView ? this.child(radioGroupView) : undefined;
    }

    protected onMount(): void {
        this.inputView.mount();
        this.inputElement = this.inputView.root.querySelector<HTMLInputElement>("input") ?? undefined;
        this.radioGroupView?.mount();
        this.contentView.mount();
        this.own(() => this.disposeButtons());
        this.syncButtons(this.model.state.get().buttons ?? []);
        this.dialogView.mount();
        this.bind(this.model.state, (state) => state.message, (message) => {
            this.messageElement.textContent = message;
        });
        this.bind(this.model.state, (state) => state.title, (title) => {
            this.contentView.setTitle(title);
        });
        this.bind(this.model.state, (state) => state.value ?? "", (value) => {
            this.inputView.update({
                name: "input-dialog-input",
                value,
                onChange: this.model.setValue,
            });
        });
        this.bind(this.model.state, (state) => state.buttons ?? [], (buttons) => {
            this.syncButtons(buttons);
        });
        if (this.radioGroupView) {
            this.bind(this.model.state, (state) => state.selectedOption ?? "", (value) => {
                const current = this.model.state.get();
                this.radioGroupView?.update({
                    name: "input-dialog-radio",
                    orientation: "horizontal",
                    wrap: true,
                    items: (current.options ?? []).map((option) => ({ value: option })),
                    value,
                    onChange: this.model.setSelectedOption,
                });
            });
        }
        this.scheduleFocus();
    }

    protected onDispose(): void {
        this.viewDisposed = true;
        if (this.focusTimer !== undefined) clearTimeout(this.focusTimer);
        this.focusTimer = undefined;
    }

    private scheduleFocus(): void {
        this.focusTimer = setTimeout(() => {
            this.focusTimer = undefined;
            if (this.viewDisposed || !this.inputElement) return;
            if (this.model.state.get().selectAll) this.inputElement.select();
            else this.inputElement.focus();
        }, 0);
    }

    private syncButtons(buttons: string[]): void {
        for (const [index, buttonView] of this.buttonViews) {
            if (index < buttons.length) continue;
            buttonView.dispose();
            buttonView.root.remove();
            this.buttonViews.delete(index);
        }

        buttons.forEach((label, index) => {
            let buttonView = this.buttonViews.get(index);
            if (!buttonView) {
                buttonView = new ButtonView({
                    onClick: () => {
                        const state = this.model.state.get();
                        void this.model.close({
                            value: state.value ?? "",
                            button: this.model.state.get().buttons?.[index] ?? label,
                            selectedOption: state.selectedOption,
                        });
                    },
                    children: label,
                });
                buttonView.mount();
                this.buttonViews.set(index, buttonView);
            } else {
                buttonView.update({
                    onClick: () => {
                        const state = this.model.state.get();
                        void this.model.close({
                            value: state.value ?? "",
                            button: this.model.state.get().buttons?.[index] ?? label,
                            selectedOption: state.selectedOption,
                        });
                    },
                    children: label,
                });
            }
            const currentChild = this.buttonsPanel.children[index];
            if (currentChild !== buttonView.root) this.buttonsPanel.append(buttonView.root);
        });
    }

    private disposeButtons(): void {
        for (const buttonView of this.buttonViews.values()) {
            buttonView.dispose();
            buttonView.root.remove();
        }
        this.buttonViews.clear();
    }
}
