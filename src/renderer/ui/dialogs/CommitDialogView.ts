import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import { InputView } from "../../uikit/Input/InputView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import {
    actionButtonLabel,
    type CommitDialogModel,
    type CommitDialogProps,
    type CommitResult,
} from "./CommitDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";
import "../../uikit/Textarea/Textarea.css";

type CommitModel = TDialogModel<CommitDialogProps, CommitResult | undefined> & CommitDialogModel;

export class CommitDialogView extends VanillaView<DialogViewProps> {
    private readonly model: CommitModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly branchInput: InputView;
    private readonly nameInput: InputView;
    private readonly emailInput: InputView;
    private readonly messageInput: TextareaView;
    private readonly buttonsPanel: HTMLDivElement;
    private readonly buttonViews = new Map<number, ButtonView>();

    public constructor(props: DialogViewProps) {
        const model = props.model as CommitModel;
        const state = model.state.get();
        const branchInput = new InputView({
            name: "commit-branch",
            value: state.branch ?? "",
            onChange: model.setBranch,
            invalid: !state.branch?.trim(),
            placeholder: "Branch name",
        });
        const nameInput = new InputView({
            name: "commit-author-name",
            value: state.name ?? "",
            onChange: model.setName,
            placeholder: "Name",
        });
        const emailInput = new InputView({
            name: "commit-author-email",
            value: state.email ?? "",
            onChange: model.setEmail,
            placeholder: "Email",
        });
        const messageInput = new TextareaView({
            name: "commit-message",
            value: state.message ?? "",
            onChange: model.setMessage,
            placeholder: "Commit message",
            minHeight: 120,
            maxHeight: 300,
            autoFocus: true,
        });
        const bodyPanel = createPanelElement(
            { direction: "column", paddingX: "xxl", paddingTop: "xl", paddingBottom: "sm", gap: "md" },
            [
                createPanelElement(
                    { direction: "row", gap: "sm", align: "center" },
                    [
                        createTextElement("Branch:", { color: "light", nowrap: true }),
                        createPanelElement({ flex: 1 }, [branchInput.root]),
                    ],
                ),
                createPanelElement(
                    { direction: "row", gap: "sm", align: "center" },
                    [
                        createTextElement("Author:", { color: "light", nowrap: true }),
                        createPanelElement({ flex: 1 }, [nameInput.root]),
                        createPanelElement({ flex: 1 }, [emailInput.root]),
                    ],
                ),
                messageInput.root,
            ],
        );
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: state.title ?? "Commit",
            icon: "git",
            onClose: () => { void model.close(undefined); },
            width: 520,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            name: "commit-dialog",
            autoFocus: false,
            onKeyDown: (event) => model.handleKeyDown(event),
            onEscape: () => { void model.close(undefined); },
            children: contentView.root,
        });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.branchInput = this.child(branchInput);
        this.nameInput = this.child(nameInput);
        this.emailInput = this.child(emailInput);
        this.messageInput = this.child(messageInput);
        this.buttonsPanel = buttonsPanel;
        this.own(() => this.disposeButtons());
        this.own(model.disposeView);
    }

    protected onMount(): void {
        this.branchInput.mount();
        this.nameInput.mount();
        this.emailInput.mount();
        this.messageInput.mount();
        this.contentView.mount();
        this.syncButtons();
        this.dialogView.mount();
        this.bind(this.model.state, (state) => state.title, (title) => {
            this.contentView.setTitle(title);
        });
        this.bind(this.model.state, (state) => state.branch ?? "", (branch) => {
            this.branchInput.update({
                name: "commit-branch",
                value: branch,
                onChange: this.model.setBranch,
                invalid: !branch.trim(),
                placeholder: "Branch name",
            });
            this.syncButtons();
        });
        this.bind(this.model.state, (state) => state.name ?? "", (name) => {
            this.nameInput.update({
                name: "commit-author-name",
                value: name,
                onChange: this.model.setName,
                placeholder: "Name",
            });
        });
        this.bind(this.model.state, (state) => state.email ?? "", (email) => {
            this.emailInput.update({
                name: "commit-author-email",
                value: email,
                onChange: this.model.setEmail,
                placeholder: "Email",
            });
        });
        this.bind(this.model.state, (state) => state.message ?? "", (message) => {
            this.messageInput.update({
                name: "commit-message",
                value: message,
                onChange: this.model.setMessage,
                placeholder: "Commit message",
                minHeight: 120,
                maxHeight: 300,
                autoFocus: true,
            });
            this.syncButtons();
        });
        this.bind(this.model.state, (state) => state.buttons ?? [], () => this.syncButtons());
        this.bind(this.model.state, (state) => state.committing ?? false, () => this.syncButtons());
    }

    private syncButtons(): void {
        const state = this.model.state.get();
        const buttons = state.buttons ?? ["Commit", "Cancel"];
        const canCommit = !!state.message?.trim() && !!state.branch?.trim();
        const branchChanged = !!state.branch?.trim()
            && state.branch.trim() !== (state.originalBranch ?? "");

        for (const [index, buttonView] of this.buttonViews) {
            if (index < buttons.length) continue;
            buttonView.dispose();
            buttonView.root.remove();
            this.buttonViews.delete(index);
        }

        buttons.forEach((button, index) => {
            const disabled = button !== "Cancel" && (!canCommit || !!state.committing);
            let buttonView = this.buttonViews.get(index);
            const nextProps = {
                onClick: button === "Cancel"
                    ? () => { void this.model.close(undefined); }
                    : () => { void this.model.submit(button); },
                disabled,
                children: button === "Cancel" ? button : actionButtonLabel(button, branchChanged),
            };
            if (!buttonView) {
                buttonView = new ButtonView(nextProps);
                buttonView.mount();
                this.buttonViews.set(index, buttonView);
            } else {
                buttonView.update(nextProps);
            }
            if (this.buttonsPanel.children[index] !== buttonView.root) {
                this.buttonsPanel.append(buttonView.root);
            }
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
