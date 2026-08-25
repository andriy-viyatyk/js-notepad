import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/Dialog";
import { InputView } from "../../uikit/Input/InputView";
import { LabelView } from "../../uikit/Label/LabelView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type { PasswordDialogState } from "./PasswordDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";

type PasswordDialogModel = TDialogModel<PasswordDialogState, string> & {
    setPassword(password: string): void;
    setConfirm(confirm: string): void;
    setError(error: string): void;
    submit(): void;
    handleKeyDown(event: KeyboardEvent): void;
};

export class PasswordDialogView extends VanillaView<DialogViewProps> {
    private readonly model: PasswordDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly passwordInput: InputView;
    private readonly confirmInput: InputView | undefined;
    private readonly passwordLabel: LabelView;
    private readonly confirmLabel: LabelView | undefined;
    private readonly bodyPanel: HTMLDivElement;
    private readonly submitButton: ButtonView;
    private passwordElement: HTMLInputElement | undefined;
    private confirmElement: HTMLInputElement | undefined;
    private errorElement: HTMLSpanElement | undefined;
    private focusTimer: ReturnType<typeof setTimeout> | undefined;
    private viewDisposed = false;

    public constructor(props: DialogViewProps) {
        const model = props.model as PasswordDialogModel;
        const state = model.state.get();
        const isDecrypt = state.mode === "decrypt";
        const passwordInput = new InputView({
            name: "password-dialog-password",
            type: "password",
            value: state.password,
            onChange: model.setPassword,
        });
        const passwordLabel = new LabelView({ children: "Password" });
        const passwordPanel = createPanelElement(
            { direction: "column", gap: "xs" },
            [passwordLabel.root, passwordInput.root],
        );

        let confirmInput: InputView | undefined;
        let confirmLabel: LabelView | undefined;
        let confirmPanel: HTMLDivElement | undefined;
        if (!isDecrypt) {
            confirmInput = new InputView({
                name: "password-dialog-confirm",
                type: "password",
                value: state.confirm,
                onChange: model.setConfirm,
            });
            confirmLabel = new LabelView({ children: "Confirm Password" });
            confirmPanel = createPanelElement(
                { direction: "column", gap: "xs" },
                [confirmLabel.root, confirmInput.root],
            );
        }

        const bodyChildren: Node[] = [];
        if (state.message) bodyChildren.push(createTextElement(state.message, { color: "light" }));
        bodyChildren.push(passwordPanel);
        if (confirmPanel) bodyChildren.push(confirmPanel);
        const errorElement = state.error
            ? createTextElement(state.error, { color: "error", size: "sm" })
            : undefined;
        if (errorElement) bodyChildren.push(errorElement);
        const bodyPanel = createPanelElement(
            { direction: "column", paddingX: "xxl", paddingY: "xl", gap: "md" },
            bodyChildren,
        );
        const submitButton = new ButtonView({
            name: "password-submit",
            variant: "primary",
            onClick: model.submit,
            children: isDecrypt ? "Decrypt" : "Encrypt",
        });
        const cancelButton = new ButtonView({
            name: "password-cancel",
            onClick: () => { void model.close(undefined); },
            children: "Cancel",
        });
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [submitButton.root, cancelButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: isDecrypt ? "Decrypt File" : "Encrypt File",
            icon: "lock",
            onClose: () => { void model.close(undefined); },
            minWidth: 340,
            maxWidth: 500,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "password-dialog",
            autoFocus: false,
            onKeyDown: (event) => model.handleKeyDown(event),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.passwordInput = this.child(passwordInput);
        this.passwordLabel = this.child(passwordLabel);
        this.bodyPanel = bodyPanel;
        this.errorElement = errorElement;
        this.confirmInput = confirmInput ? this.child(confirmInput) : undefined;
        this.confirmLabel = confirmLabel ? this.child(confirmLabel) : undefined;
        this.submitButton = this.child(submitButton);
        this.child(cancelButton);
    }

    protected onMount(): void {
        this.passwordLabel.mount();
        this.passwordInput.mount();
        this.confirmLabel?.mount();
        this.confirmInput?.mount();
        this.submitButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.passwordElement = this.passwordInput.root.querySelector<HTMLInputElement>("input") ?? undefined;
        this.confirmElement = this.confirmInput?.root.querySelector<HTMLInputElement>("input") ?? undefined;
        if (this.passwordElement) this.listen(this.passwordElement, "keydown", this.handleInputKeyDown);
        if (this.confirmElement) this.listen(this.confirmElement, "keydown", this.handleInputKeyDown);
        this.bind(this.model.state, (state) => state.password, (password) => {
            this.passwordInput.update({
                name: "password-dialog-password",
                type: "password",
                value: password,
                onChange: this.model.setPassword,
            });
        });
        this.bind(this.model.state, (state) => state.confirm, (confirm) => {
            this.confirmInput?.update({
                name: "password-dialog-confirm",
                type: "password",
                value: confirm,
                onChange: this.model.setConfirm,
            });
        });
        this.bind(this.model.state, (state) => state.error, (error) => {
            this.syncError(error);
        });
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
            if (this.viewDisposed) return;
            this.passwordElement?.focus();
        }, 0);
    }

    private syncError(error: string): void {
        if (!error) {
            this.errorElement?.remove();
            this.errorElement = undefined;
            return;
        }
        if (!this.errorElement) {
            this.errorElement = createTextElement(error, { color: "error", size: "sm" });
            this.bodyPanel.append(this.errorElement);
        }
        this.errorElement.textContent = error;
    }

    private readonly handleInputKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Enter") this.model.submit();
        else if (event.key === "Escape") void this.model.close(undefined);
    };
}
