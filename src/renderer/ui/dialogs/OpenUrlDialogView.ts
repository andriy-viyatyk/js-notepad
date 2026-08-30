import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/DialogView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type { OpenUrlDialogResult, OpenUrlDialogState } from "./OpenUrlDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";
import "../../uikit/Textarea/Textarea.css";

type OpenUrlDialogModel = TDialogModel<OpenUrlDialogState, OpenUrlDialogResult> & {
    handleKeyDown(event: KeyboardEvent): void;
    setValue(value: string): void;
    submit(): void;
    openFile(): void;
};

export class OpenUrlDialogView extends VanillaView<DialogViewProps> {
    private readonly model: OpenUrlDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly textareaView: TextareaView;
    private readonly fileButton: ButtonView;
    private readonly cancelButton: ButtonView;
    private readonly submitButton: ButtonView;

    public constructor(props: DialogViewProps) {
        const model = props.model as OpenUrlDialogModel;
        const state = model.state.get();
        const textareaView = new TextareaView({
            name: "open-url-input",
            autoFocus: true,
            value: state.value,
            onChange: model.setValue,
            placeholder: "Paste file path, URL, or cURL command",
            minHeight: 80,
            maxHeight: 300,
            size: "sm",
        });
        const inputPanel = createPanelElement(
            { direction: "column", paddingX: "xxl", paddingTop: "xl", paddingBottom: "sm" },
            [textareaView.root],
        );
        const fileButton = new ButtonView({
            name: "open-url-file",
            icon: "open-file",
            onClick: model.openFile,
            children: "Open File",
        });
        const cancelButton = new ButtonView({
            name: "open-url-cancel",
            onClick: () => model.close(undefined),
            children: "Cancel",
        });
        const submitButton = new ButtonView({
            name: "open-url-submit",
            onClick: model.submit,
            disabled: !state.value.trim(),
            children: "Open",
        });
        const rightButtonsPanel = createPanelElement(
            { direction: "row", gap: "sm" },
            [cancelButton.root, submitButton.root],
        );
        const buttonsPanel = createPanelElement(
            { direction: "row", align: "center", justify: "between", padding: "md" },
            [fileButton.root, rightButtonsPanel],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(inputPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: "Open",
            icon: "open-file",
            onClose: () => model.close(undefined),
            minWidth: 500,
            maxWidth: 800,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "open-url-dialog",
            autoFocus: false,
            onKeyDown: (event) => model.handleKeyDown(event),
            onEscape: () => { void model.close(undefined); },
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.textareaView = this.child(textareaView);
        this.fileButton = this.child(fileButton);
        this.cancelButton = this.child(cancelButton);
        this.submitButton = this.child(submitButton);
    }

    protected onMount(): void {
        this.textareaView.mount();
        this.fileButton.mount();
        this.cancelButton.mount();
        this.submitButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.bind(this.model.state, (state) => state.value, (value) => {
            this.textareaView.update({
                name: "open-url-input",
                autoFocus: true,
                value,
                onChange: this.model.setValue,
                placeholder: "Paste file path, URL, or cURL command",
                minHeight: 80,
                maxHeight: 300,
                size: "sm",
            });
            this.submitButton.update({
                name: "open-url-submit",
                onClick: this.model.submit,
                disabled: !value.trim(),
                children: "Open",
            });
        });
    }
}
