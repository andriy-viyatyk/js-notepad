import { focusAfterPaint } from "../../core/utils/scheduling";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { CheckboxView } from "../../uikit/Checkbox/CheckboxView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import { InputView } from "../../uikit/Input/InputView";
import { LabelView } from "../../uikit/Label/LabelView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type {
    LibrarySetupDialogModel,
    LibrarySetupDialogState,
} from "./LibrarySetupDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Checkbox/Checkbox.css";
import "../../uikit/Dialog/Dialog.css";
import "../../uikit/Input/Input.css";
import "../../uikit/Label/Label.css";

export class LibrarySetupDialogView extends VanillaView<DialogViewProps> {
    private readonly model: LibrarySetupDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly folderInput: InputView;
    private readonly folderLabel: LabelView;
    private readonly browseButton: ButtonView;
    private readonly copyExamplesCheckbox: CheckboxView;
    private readonly linkButton: ButtonView;
    private readonly cancelButton: ButtonView;
    private folderElement: HTMLInputElement | undefined;

    public constructor(props: DialogViewProps) {
        const model = props.model as LibrarySetupDialogModel;
        const state = model.state.get();
        const folderInput = new InputView({
            name: "library-setup-folder",
            value: state.folderPath,
            onChange: model.setFolderPath,
            placeholder: "Select or type a folder path...",
        });
        const browseButton = new ButtonView({
            name: "library-setup-browse",
            onClick: () => { void model.browse(); },
            children: "Browse...",
        });
        const copyExamplesCheckbox = new CheckboxView({
            name: "library-setup-copy-examples",
            checked: state.copyExamples,
            onChange: model.setCopyExamples,
            children: "Copy example scripts",
        });
        const folderLabel = new LabelView({ children: "Folder:" });
        const bodyPanel = createPanelElement(
            { direction: "column", paddingX: "xxl", paddingY: "xl", gap: "lg" },
            [
                createPanelElement(
                    { direction: "column", gap: "xs" },
                    [
                        folderLabel.root,
                        createPanelElement(
                            { direction: "row", gap: "sm", align: "center" },
                            [createPanelElement({ flex: 1 }, [folderInput.root]), browseButton.root],
                        ),
                    ],
                ),
                createPanelElement(
                    { direction: "column", gap: "xs" },
                    [
                        copyExamplesCheckbox.root,
                        createPanelElement(
                            { paddingLeft: "xxl" },
                            [createTextElement("Won't overwrite existing files", { size: "xs", color: "light" })],
                        ),
                    ],
                ),
            ],
        );
        const linkButton = new ButtonView({
            name: "library-setup-link",
            onClick: () => { void model.link(); },
            disabled: !state.folderPath.trim() || state.linking,
            children: state.linking ? "Linking..." : "Link",
        });
        const cancelButton = new ButtonView({
            name: "library-setup-cancel",
            onClick: () => { void model.close(undefined); },
            children: "Cancel",
        });
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [linkButton.root, cancelButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: state.title,
            icon: "folder-open",
            onClose: () => { void model.close(undefined); },
            minWidth: 400,
            maxWidth: 600,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            name: "library-setup-dialog",
            autoFocus: false,
            onKeyDown: (event) => model.handleKeyDown(event),
            onEscape: () => { void model.close(undefined); },
            children: contentView.root,
        });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.folderInput = this.child(folderInput);
        this.folderLabel = this.child(folderLabel);
        this.browseButton = this.child(browseButton);
        this.copyExamplesCheckbox = this.child(copyExamplesCheckbox);
        this.linkButton = this.child(linkButton);
        this.cancelButton = this.child(cancelButton);
        this.own(model.disposeView);
    }

    protected onMount(): void {
        this.folderInput.mount();
        this.folderLabel.mount();
        this.browseButton.mount();
        this.copyExamplesCheckbox.mount();
        this.linkButton.mount();
        this.cancelButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.folderElement = this.folderInput.root.querySelector<HTMLInputElement>("input") ?? undefined;
        this.bind(this.model.state, (state) => state.title, (title) => {
            this.contentView.setTitle(title);
        });
        this.bind(this.model.state, (state) => state.folderPath, (folderPath) => {
            this.folderInput.update({
                name: "library-setup-folder",
                value: folderPath,
                onChange: this.model.setFolderPath,
                placeholder: "Select or type a folder path...",
            });
            this.syncLinkButton();
        });
        this.bind(this.model.state, (state) => state.copyExamples, (copyExamples) => {
            this.copyExamplesCheckbox.update({
                name: "library-setup-copy-examples",
                checked: copyExamples,
                onChange: this.model.setCopyExamples,
                children: "Copy example scripts",
            });
        });
        this.bind(this.model.state, (state) => state.linking, () => this.syncLinkButton());
        this.own(focusAfterPaint(this.folderElement));
    }

    private syncLinkButton(): void {
        const state: LibrarySetupDialogState = this.model.state.get();
        this.linkButton.update({
            name: "library-setup-link",
            onClick: () => { void this.model.link(); },
            disabled: !state.folderPath.trim() || state.linking,
            children: state.linking ? "Linking..." : "Link",
        });
    }
}
