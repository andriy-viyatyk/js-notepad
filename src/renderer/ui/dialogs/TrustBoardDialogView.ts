import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/Dialog";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type { TrustBoardDialogProps } from "./TrustBoardDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";

type TrustBoardDialogModel = TDialogModel<TrustBoardDialogProps, boolean> & {
    handleKeyDown(event: KeyboardEvent): void;
};

export class TrustBoardDialogView extends VanillaView<DialogViewProps> {
    private readonly model: TrustBoardDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly boardPathElement: HTMLSpanElement;
    private readonly cancelButton: ButtonView;
    private readonly trustButton: ButtonView;

    public constructor(props: DialogViewProps) {
        const model = props.model as TrustBoardDialogModel;
        const state = model.state.get();
        const boardPathElement = createTextElement(state.boardPath, { color: "light" });
        const bodyPanel = createPanelElement(
            { direction: "column", gap: "md", paddingX: "xxl", paddingY: "xl" },
            [
                createTextElement(
                    "Trusting this board lets it run programs on your computer with your full user privileges — including reading and changing your files and using any signed-in command-line tools (cloud CLIs, git, etc.).",
                ),
                createTextElement("Only trust boards you created or fully understand."),
                createTextElement(
                    "If you're not sure about a board, ask your AI agent to review its scripts before trusting it.",
                    { color: "warning" },
                ),
                boardPathElement,
            ],
        );
        const cancelButton = new ButtonView({
            onClick: () => model.close(false),
            children: "Cancel",
        });
        const trustButton = new ButtonView({
            variant: "primary",
            onClick: () => model.close(true),
            children: "Trust Board",
        });
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [cancelButton.root, trustButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: "Trust this board?",
            icon: "warning",
            onClose: () => model.close(false),
            minWidth: 420,
            maxWidth: 640,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "trust-board-dialog",
            onKeyDown: (event) => model.handleKeyDown(event.nativeEvent as KeyboardEvent),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.cancelButton = this.child(cancelButton);
        this.trustButton = this.child(trustButton);
        this.boardPathElement = boardPathElement;
    }

    protected onMount(): void {
        this.cancelButton.mount();
        this.trustButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.bind(this.model.state, (next) => next.boardPath, (boardPath) => {
            this.boardPathElement.textContent = boardPath;
        });
    }
}
