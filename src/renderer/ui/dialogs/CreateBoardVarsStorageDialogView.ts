import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/Dialog";
import { InputView } from "../../uikit/Input/InputView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type {
    CreateBoardVarsStorageDialogState,
    CreateBoardVarsStorageResult,
} from "./CreateBoardVarsStorageDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";

type CreateBoardVarsStorageDialogModel = TDialogModel<
    CreateBoardVarsStorageDialogState,
    CreateBoardVarsStorageResult
> & {
    handleKeyDown(event: KeyboardEvent): void;
    setPath(value: string): void;
    browse(): Promise<void>;
    submit(): Promise<void>;
    disposeView(): void;
};

export class CreateBoardVarsStorageDialogView extends VanillaView<DialogViewProps> {
    private readonly model: CreateBoardVarsStorageDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly pathInput: InputView;
    private readonly browseButton: ButtonView;
    private readonly cancelButton: ButtonView;
    private readonly createButton: ButtonView;
    private pathElement: HTMLInputElement | undefined;
    private focusTimer: ReturnType<typeof setTimeout> | undefined;
    private viewDisposed = false;

    public constructor(props: DialogViewProps) {
        const model = props.model as CreateBoardVarsStorageDialogModel;
        const state = model.state.get();
        const pathInput = new InputView({
            name: "create-board-vars-storage-path",
            value: state.path,
            invalid: !state.path.trim(),
            placeholder: "Environment variables file path",
            onChange: model.setPath,
        });
        const browseButton = new ButtonView({
            name: "create-board-vars-storage-browse",
            icon: "folder-open",
            onClick: () => { void model.browse(); },
            children: "Browse…",
        });
        const bodyPanel = createPanelElement(
            { direction: "column", paddingX: "xxl", paddingTop: "xl", paddingBottom: "sm", gap: "md" },
            [
                createTextElement(
                    "Boards read/write their variables (connection strings, keys, passwords) from this file — kept outside board folders, so copying or sharing a board never leaks them.",
                    { color: "light" },
                ),
                createPanelElement(
                    { direction: "row", gap: "sm", align: "center" },
                    [
                        createTextElement("Path:", { color: "light", nowrap: true }),
                        createPanelElement({ flex: 1 }, [pathInput.root]),
                        browseButton.root,
                    ],
                ),
            ],
        );
        const cancelButton = new ButtonView({
            name: "create-board-vars-storage-cancel",
            onClick: () => { void model.close(undefined); },
            children: "Cancel",
        });
        const createButton = new ButtonView({
            name: "create-board-vars-storage-submit",
            variant: "primary",
            disabled: !state.path.trim() || state.creating,
            onClick: () => { void model.submit(); },
            children: "Create",
        });
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [cancelButton.root, createButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: "Create environment variables storage",
            icon: "lock",
            onClose: () => { void model.close(undefined); },
            width: 520,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "create-board-vars-storage-dialog",
            autoFocus: false,
            onKeyDown: (event) => model.handleKeyDown(event.nativeEvent as KeyboardEvent),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.pathInput = this.child(pathInput);
        this.browseButton = this.child(browseButton);
        this.cancelButton = this.child(cancelButton);
        this.createButton = this.child(createButton);
        this.own(model.disposeView);
    }

    protected onMount(): void {
        this.pathInput.mount();
        this.browseButton.mount();
        this.cancelButton.mount();
        this.createButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.pathElement = this.pathInput.root.querySelector<HTMLInputElement>("input") ?? undefined;
        this.bind(this.model.state, (state) => state.path, (path) => {
            this.pathInput.update({
                name: "create-board-vars-storage-path",
                value: path,
                invalid: !path.trim(),
                placeholder: "Environment variables file path",
                onChange: this.model.setPath,
            });
            this.syncCreateButton();
        });
        this.bind(this.model.state, (state) => state.creating, () => {
            this.syncCreateButton();
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
            this.pathElement?.focus();
        }, 0);
    }

    private syncCreateButton(): void {
        const state = this.model.state.get();
        this.createButton.update({
            name: "create-board-vars-storage-submit",
            variant: "primary",
            disabled: !state.path.trim() || state.creating,
            onClick: () => { void this.model.submit(); },
            children: "Create",
        });
    }
}
