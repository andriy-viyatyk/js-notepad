import { TDialogModel } from "../../core/state/model";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/Dialog";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type { ConfirmationDialogProps } from "./ConfirmationDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";

type ConfirmationDialogModel = TDialogModel<ConfirmationDialogProps, string> & {
    handleKeyDown(event: KeyboardEvent): void;
};

export class ConfirmationDialogView extends VanillaView<DialogViewProps> {
    private readonly model: ConfirmationDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly messageElement: HTMLSpanElement;
    private readonly buttonsPanel: HTMLDivElement;
    private readonly buttonViews = new Map<number, ButtonView>();

    public constructor(props: DialogViewProps) {
        const model = props.model as ConfirmationDialogModel;
        const state = model.state.get();
        const messageElement = createTextElement(state.message);
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [],
        );
        const messagePanel = createPanelElement(
            { direction: "column", paddingX: "xxl", paddingY: "xl" },
            [messageElement],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(messagePanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: state.title,
            icon: "confirm",
            onClose: () => model.close(undefined),
            minWidth: 300,
            maxWidth: 800,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "confirmation-dialog",
            onKeyDown: (event) => model.handleKeyDown(event.nativeEvent as KeyboardEvent),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.messageElement = messageElement;
        this.buttonsPanel = buttonsPanel;
    }

    protected onMount(): void {
        this.contentView.mount();
        // Button views are a changing collection; own their active set as one resource so
        // removed buttons do not remain in VanillaView's permanent child list.
        this.own(() => this.disposeButtons());
        this.syncButtons(this.model.state.get().buttons ?? []);
        this.dialogView.mount();
        this.bind(this.model.state, (state) => state.message, (message) => {
            this.messageElement.textContent = message;
        });
        this.bind(this.model.state, (state) => state.title, (title) => {
            this.contentView.setTitle(title);
        });
        this.bind(this.model.state, (state) => state.buttons ?? [], (buttons) => {
            this.syncButtons(buttons);
        });
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
                    onClick: () => this.model.close(this.model.state.get().buttons?.[index]),
                    children: label,
                });
                buttonView.mount();
                this.buttonViews.set(index, buttonView);
            } else {
                buttonView.update({
                    onClick: () => this.model.close(this.model.state.get().buttons?.[index]),
                    children: label,
                });
            }
            const currentChild = this.buttonsPanel.children[index];
            if (currentChild !== buttonView.root) {
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
