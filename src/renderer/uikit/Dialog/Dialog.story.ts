import { ButtonView } from "../Button/ButtonView";
import { IconButtonView } from "../IconButton/IconButtonView";
import { InputView } from "../Input/InputView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { SubtreeSwap } from "../shared/subtree-swap";
import { VanillaView } from "../shared/vanilla-view";
import { DialogView } from "./DialogView";
import { DialogContentView } from "./DialogContentView";
import type { DialogContentProps } from "./DialogContent";
import type { DialogPosition } from "./Dialog";
import type { Story } from "../../editors/storybook/storyTypes";

interface DialogDemoProps {
    position?: DialogPosition;
    showIcon?: boolean;
    showHeaderButtons?: boolean;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
    height?: number;
    autoFocus?: boolean;
}

interface DialogBodyProps {
    first: string;
    second: string;
    onFirstChange: (value: string) => void;
    onSecondChange: (value: string) => void;
    onClose: () => void;
}

class DialogBodyView extends VanillaView<DialogBodyProps> {
    private firstInput: InputView | undefined;
    private secondInput: InputView | undefined;

    public constructor(props: DialogBodyProps) {
        super(props, createPanelElement({ direction: "column", padding: "md", gap: "md" }));
    }

    protected onMount(): void {
        const firstInput = this.child(new InputView({
            value: this.props.first,
            onChange: this.props.onFirstChange,
            placeholder: "Type a name…",
        }));
        const secondInput = this.child(new InputView({
            value: this.props.second,
            onChange: this.props.onSecondChange,
            placeholder: "Type a description…",
        }));
        const cancelButton = this.child(new ButtonView({
            children: "Cancel",
            onClick: this.props.onClose,
        }));
        const saveButton = this.child(new ButtonView({
            children: "Save",
            variant: "primary",
            onClick: this.props.onClose,
        }));
        this.firstInput = firstInput;
        this.secondInput = secondInput;

        const namePanel = createPanelElement({ direction: "column", gap: "xs" }, [
            createTextElement("Name", { size: "sm" }),
            firstInput.root,
        ]);
        const descriptionPanel = createPanelElement({ direction: "column", gap: "xs" }, [
            createTextElement("Description", { size: "sm" }),
            secondInput.root,
        ]);
        const actions = createPanelElement({ direction: "row", gap: "sm", justify: "end" }, [
            cancelButton.root,
            saveButton.root,
        ]);
        this.root.append(namePanel, descriptionPanel, actions);
        firstInput.mount();
        secondInput.mount();
        cancelButton.mount();
        saveButton.mount();
    }

    protected onUpdate(props: DialogBodyProps): void {
        this.firstInput?.update({
            value: props.first,
            onChange: props.onFirstChange,
            placeholder: "Type a name…",
        });
        this.secondInput?.update({
            value: props.second,
            onChange: props.onSecondChange,
            placeholder: "Type a description…",
        });
    }
}

interface DialogBranchProps extends DialogDemoProps {
    first: string;
    second: string;
    onFirstChange: (value: string) => void;
    onSecondChange: (value: string) => void;
    onClose: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
}

class DialogBranchView extends VanillaView<DialogBranchProps> {
    private dialogView: DialogView | undefined;
    private contentView: DialogContentView | undefined;
    private bodyView: DialogBodyView | undefined;
    private headerButton: IconButtonView | undefined;

    public constructor(props: DialogBranchProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        const body = new DialogBodyView(this.bodyProps(this.props));
        const headerButton = this.props.showHeaderButtons
            ? new IconButtonView({
                size: "sm",
                icon: "settings",
                "aria-label": "More",
            })
            : undefined;
        const contentProps: DialogContentProps = {
            title: "Edit settings",
            icon: this.props.showIcon ? "rename" : undefined,
            onClose: this.props.onClose,
            headerButtons: headerButton?.root,
            width: this.props.width || undefined,
            height: this.props.height || undefined,
            minWidth: this.props.minWidth || undefined,
            maxWidth: this.props.maxWidth || undefined,
            children: body.root,
        };
        const content = new DialogContentView(contentProps);
        const dialog = new DialogView({
            position: this.props.position ?? "center",
            autoFocus: this.props.autoFocus ?? true,
            onBackdropClick: this.props.onClose,
            onKeyDown: this.props.onKeyDown,
            children: content.root,
        });

        // Claim in disposal order (dialog removes its content slot before the content and body
        // views release their roots), then mount in dependency order below.
        this.dialogView = this.child(dialog);
        this.contentView = this.child(content);
        this.bodyView = this.child(body);
        this.headerButton = headerButton ? this.child(headerButton) : undefined;

        this.root.append(dialog.root);
        body.mount();
        headerButton?.mount();
        content.mount();
        dialog.mount();
    }

    protected onUpdate(props: DialogBranchProps): void {
        this.bodyView?.update(this.bodyProps(props));
        this.contentView?.update({
            title: "Edit settings",
            icon: props.showIcon ? "rename" : undefined,
            onClose: props.onClose,
            headerButtons: this.headerButton?.root,
            width: props.width || undefined,
            height: props.height || undefined,
            minWidth: props.minWidth || undefined,
            maxWidth: props.maxWidth || undefined,
            children: this.bodyView?.root,
        });
        this.dialogView?.update({
            position: props.position ?? "center",
            autoFocus: props.autoFocus ?? true,
            onBackdropClick: props.onClose,
            onKeyDown: props.onKeyDown,
            children: this.contentView?.root,
        });
    }

    private bodyProps(props: DialogBranchProps): DialogBodyProps {
        return {
            first: props.first,
            second: props.second,
            onFirstChange: props.onFirstChange,
            onSecondChange: props.onSecondChange,
            onClose: props.onClose,
        };
    }
}

class DialogDemoView extends VanillaView<DialogDemoProps> {
    private open = false;
    private first = "";
    private second = "";
    private triggerView: ButtonView | undefined;
    private backgroundInput: InputView | undefined;
    private dialogBranch: DialogBranchView | undefined;
    private dialogSwap: SubtreeSwap<"open"> | undefined;
    private previousProps: DialogDemoProps;

    public constructor(props: DialogDemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: "100%", height: 520 }));
        this.previousProps = props;
    }

    protected onMount(): void {
        this.dialogSwap = new SubtreeSwap(this.root);
        this.own(() => this.dialogSwap?.dispose());

        const trigger = this.child(new ButtonView({
            children: "Open dialog",
            onClick: this.openDialog,
        }));
        this.triggerView = trigger;
        const controlRow = createPanelElement({ direction: "row", gap: "md", align: "center" }, [
            trigger.root,
            createTextElement(
                "Tab cycles inside the dialog. Esc or backdrop click closes. Focus returns to the trigger button on close.",
                { size: "xs", color: "light" },
            ),
        ]);

        const backgroundInput = this.child(new InputView({
            value: "",
            onChange: () => undefined,
            placeholder: "Background input (should NOT receive Tab while dialog open)",
        }));
        this.backgroundInput = backgroundInput;
        const backgroundContent = createPanelElement({ direction: "column", padding: "md", gap: "sm" }, [
            createTextElement(
                "Background area — clicks here are blocked while the dialog is open.",
                { size: "sm", color: "light" },
            ),
            backgroundInput.root,
        ]);
        const background = createPanelElement({
            direction: "column",
            flex: true,
            position: "relative",
            border: true,
            background: "dark",
            overflow: "hidden",
        }, [backgroundContent]);

        this.root.append(controlRow, background);
        trigger.mount();
        backgroundInput.mount();
        this.previousProps = this.props;
    }

    protected onUpdate(props: DialogDemoProps): void {
        const structuralChange = props.showIcon !== this.previousProps.showIcon
            || props.showHeaderButtons !== this.previousProps.showHeaderButtons;
        this.previousProps = props;

        if (this.open && structuralChange) {
            this.dialogBranch = undefined;
            this.dialogSwap?.clear();
            this.mountDialogBranch();
        } else if (this.open) {
            this.dialogBranch?.update(this.branchProps(props));
        }
    }

    private readonly openDialog = (): void => {
        this.open = true;
        this.mountDialogBranch();
    };

    private readonly closeDialog = (): void => {
        this.open = false;
        this.dialogBranch = undefined;
        this.dialogSwap?.clear();
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            this.closeDialog();
        }
    };

    private readonly onFirstChange = (value: string): void => {
        this.first = value;
        this.dialogBranch?.update(this.branchProps(this.props));
    };

    private readonly onSecondChange = (value: string): void => {
        this.second = value;
        this.dialogBranch?.update(this.branchProps(this.props));
    };

    private mountDialogBranch(): void {
        if (!this.dialogSwap || !this.open) return;
        let created: DialogBranchView | undefined;
        this.dialogSwap.set("open", () => {
            created = new DialogBranchView(this.branchProps(this.props));
            this.dialogBranch = created;
            return created;
        });
        if (created) {
            try {
                created.mount();
            } catch (error) {
                this.dialogBranch = undefined;
                try {
                    this.dialogSwap.clear();
                } catch {
                    // Preserve the original mount failure after attempting cleanup.
                }
                throw error;
            }
        }
    }

    private branchProps(props: DialogDemoProps): DialogBranchProps {
        return {
            ...props,
            first: this.first,
            second: this.second,
            onFirstChange: this.onFirstChange,
            onSecondChange: this.onSecondChange,
            onClose: this.closeDialog,
            onKeyDown: this.onKeyDown,
        };
    }

    protected onDispose(): void {
        this.triggerView = undefined;
        this.backgroundInput = undefined;
        this.dialogBranch = undefined;
        this.dialogSwap = undefined;
    }
}

export const dialogStory: Story<DialogDemoProps> = {
    id: "dialog",
    name: "Dialog",
    section: "Overlay",
    view: DialogDemoView,
    props: [
        { name: "position", type: "enum", options: ["center", "right"], default: "center" },
        { name: "showIcon", type: "boolean", default: false, label: "Show icon" },
        { name: "showHeaderButtons", type: "boolean", default: false, label: "Show header buttons" },
        { name: "width", type: "number", default: 0, min: 0, max: 1200, step: 20, label: "Width (0 = auto)" },
        { name: "minWidth", type: "number", default: 360, min: 0, max: 1200, step: 20, label: "Min width" },
        { name: "maxWidth", type: "number", default: 600, min: 0, max: 1200, step: 20, label: "Max width" },
        { name: "height", type: "number", default: 0, min: 0, max: 800, step: 20, label: "Height (0 = auto)" },
        { name: "autoFocus", type: "boolean", default: true, label: "Auto-focus on open" },
    ],
};
