import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/DialogView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type { NamespaceCollisionDialogProps } from "./NamespaceCollisionDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";

type NamespaceCollisionDialogModel = TDialogModel<NamespaceCollisionDialogProps, boolean>;

export class NamespaceCollisionDialogView extends VanillaView<DialogViewProps> {
    private readonly model: NamespaceCollisionDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly collisionElement: HTMLSpanElement;
    private readonly rootElement: HTMLSpanElement;
    private readonly cancelButton: ButtonView;
    private readonly registerButton: ButtonView;

    public constructor(props: DialogViewProps) {
        const model = props.model as NamespaceCollisionDialogModel;
        const state = model.state.get();
        const collisionElement = createTextElement("");
        const rootElement = createTextElement(state.collidingRoot, { color: "light" });
        const bodyPanel = createPanelElement(
            { direction: "column", gap: "md", paddingX: "xxl", paddingY: "xl" },
            [
                collisionElement,
                rootElement,
                createTextElement(
                    "If that's intentional (e.g. a shared configuration), register anyway. Otherwise, cancel and give this board a distinct author/name in its board-manifest.json, then register again.",
                ),
            ],
        );
        const cancelButton = new ButtonView({
            onClick: () => model.close(false),
            children: "Cancel",
        });
        const registerButton = new ButtonView({
            variant: "primary",
            onClick: () => model.close(true),
            children: "Register Anyway",
        });
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [cancelButton.root, registerButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: "Environment variables namespace already registered",
            icon: "warning",
            onClose: () => model.close(false),
            minWidth: 420,
            maxWidth: 640,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "namespace-collision-dialog",
            onEscape: () => model.close(false),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.cancelButton = this.child(cancelButton);
        this.registerButton = this.child(registerButton);
        this.collisionElement = collisionElement;
        this.rootElement = rootElement;
    }

    protected onMount(): void {
        this.cancelButton.mount();
        this.registerButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.bind(this.model.state, (state) => state.namespace, (namespace) => {
            this.collisionElement.textContent = `Another registered board already uses the namespace "${namespace}" for its environment variables. Registering this board too means they'll share the same stored variables.`;
        });
        this.bind(this.model.state, (state) => state.collidingRoot, (collidingRoot) => {
            this.rootElement.textContent = collidingRoot;
        });
    }
}
