import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/Dialog";
import { InputView } from "../../uikit/Input/InputView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { fpJoin } from "../../core/utils/file-path";
import type { DialogViewProps } from "./dialog-view-registry";
import type { CreateBoardDialogState, CreateBoardResult } from "./CreateBoardDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";

type CreateBoardDialogModel = TDialogModel<CreateBoardDialogState, CreateBoardResult> & {
    handleKeyDown(event: KeyboardEvent): void;
    setFolder(value: string): void;
    setName(value: string): void;
    browse(): Promise<void>;
    submit(): Promise<void>;
    disposeView(): void;
};

export class CreateBoardDialogView extends VanillaView<DialogViewProps> {
    private readonly model: CreateBoardDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly folderInput: InputView;
    private readonly nameInput: InputView;
    private readonly browseButton: ButtonView;
    private readonly cancelButton: ButtonView;
    private readonly createButton: ButtonView;
    private readonly statusElement: HTMLSpanElement;
    private readonly statusPanel: HTMLDivElement;
    private folderElement: HTMLInputElement | undefined;
    private nameElement: HTMLInputElement | undefined;
    private focusTimer: ReturnType<typeof setTimeout> | undefined;
    private viewDisposed = false;

    public constructor(props: DialogViewProps) {
        const model = props.model as CreateBoardDialogModel;
        const state = model.state.get();
        const folderInput = new InputView({
            name: "create-board-folder",
            value: state.folder,
            invalid: !state.folder.trim(),
            placeholder: "Board location",
            onChange: model.setFolder,
        });
        const nameInput = new InputView({
            name: "create-board-name",
            value: state.name,
            invalid: !state.name.trim(),
            placeholder: "Board name (becomes the folder name)",
            onChange: model.setName,
        });
        const browseButton = new ButtonView({
            name: "create-board-browse",
            icon: "folder-open",
            onClick: () => { void model.browse(); },
            children: "Browse…",
        });
        const folderRow = createPanelElement(
            { direction: "row", gap: "sm", align: "center" },
            [
                createTextElement("Folder:", { color: "light", nowrap: true }),
                createPanelElement({ flex: 1 }, [folderInput.root]),
                browseButton.root,
            ],
        );
        const nameRow = createPanelElement(
            { direction: "row", gap: "sm", align: "center" },
            [
                createTextElement("Name:", { color: "light", nowrap: true }),
                createPanelElement({ flex: 1 }, [nameInput.root]),
            ],
        );
        const statusElement = createTextElement("", { color: "light" });
        const statusPanel = createPanelElement(
            { direction: "column", paddingX: "xxl", paddingTop: "xl", paddingBottom: "sm", gap: "md" },
            [folderRow, nameRow],
        );
        if (state.folder.trim() && state.name.trim()) {
            statusElement.textContent = `Will be created at: ${fpJoin(state.folder.trim(), state.name.trim())}`;
            statusPanel.append(statusElement);
        }

        const cancelButton = new ButtonView({
            name: "create-board-cancel",
            onClick: () => { void model.close(undefined); },
            children: "Cancel",
        });
        const createButton = new ButtonView({
            name: "create-board-submit",
            variant: "primary",
            disabled: !state.folder.trim() || !state.name.trim() || state.creating,
            onClick: () => { void model.submit(); },
            children: "Create",
        });
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [cancelButton.root, createButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(statusPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: state.title,
            icon: "board",
            onClose: () => { void model.close(undefined); },
            width: 520,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "create-board-dialog",
            autoFocus: false,
            onKeyDown: (event) => model.handleKeyDown(event),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.folderInput = this.child(folderInput);
        this.nameInput = this.child(nameInput);
        this.browseButton = this.child(browseButton);
        this.cancelButton = this.child(cancelButton);
        this.createButton = this.child(createButton);
        this.statusElement = statusElement;
        this.statusPanel = statusPanel;
        this.own(model.disposeView);
    }

    protected onMount(): void {
        this.folderInput.mount();
        this.nameInput.mount();
        this.browseButton.mount();
        this.cancelButton.mount();
        this.createButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.folderElement = this.folderInput.root.querySelector<HTMLInputElement>("input") ?? undefined;
        this.nameElement = this.nameInput.root.querySelector<HTMLInputElement>("input") ?? undefined;
        this.bind(this.model.state, (state) => state.title, (title) => {
            this.contentView.setTitle(title);
        });
        this.bind(this.model.state, (state) => state.folder, (folder) => {
            this.folderInput.update({
                name: "create-board-folder",
                value: folder,
                invalid: !folder.trim(),
                placeholder: "Board location",
                onChange: this.model.setFolder,
            });
            this.syncStatus();
            this.syncCreateButton();
        });
        this.bind(this.model.state, (state) => state.name, (name) => {
            this.nameInput.update({
                name: "create-board-name",
                value: name,
                invalid: !name.trim(),
                placeholder: "Board name (becomes the folder name)",
                onChange: this.model.setName,
            });
            this.syncStatus();
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
        const hasFolder = !!this.model.state.get().folder.trim();
        this.focusTimer = setTimeout(() => {
            this.focusTimer = undefined;
            if (this.viewDisposed) return;
            (hasFolder ? this.nameElement : this.folderElement)?.focus();
        }, 0);
    }

    private syncStatus(): void {
        const state = this.model.state.get();
        const hasValues = !!state.folder.trim() && !!state.name.trim();
        if (hasValues) {
            this.statusElement.textContent = `Will be created at: ${fpJoin(state.folder.trim(), state.name.trim())}`;
            if (this.statusElement.parentElement !== this.statusPanel) this.statusPanel.append(this.statusElement);
        } else {
            this.statusElement.remove();
        }
    }

    private syncCreateButton(): void {
        const state = this.model.state.get();
        this.createButton.update({
            name: "create-board-submit",
            variant: "primary",
            disabled: !state.folder.trim() || !state.name.trim() || state.creating,
            onClick: () => { void this.model.submit(); },
            children: "Create",
        });
    }
}
