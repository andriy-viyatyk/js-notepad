import { TDialogModel } from "../../core/state/model";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/Dialog";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { DialogViewProps } from "./dialog-view-registry";
import type { RegisterToolsetDialogProps } from "./RegisterToolsetDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";

type RegisterToolsetDialogModel = TDialogModel<RegisterToolsetDialogProps, boolean> & {
    handleKeyDown(event: KeyboardEvent): void;
};

export class RegisterToolsetDialogView extends VanillaView<DialogViewProps> {
    private readonly model: RegisterToolsetDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly detailsElement: HTMLSpanElement;
    private readonly toolElements = new Map<string, HTMLSpanElement>();
    private readonly cancelButton: ButtonView;
    private readonly registerButton: ButtonView;

    public constructor(props: DialogViewProps) {
        const model = props.model as RegisterToolsetDialogModel;
        const state = model.state.get();
        const detailsElement = createTextElement(`${state.toolsetName}  —  ${state.toolsetRoot}`, { color: "light" });
        const bodyPanel = createPanelElement(
            { direction: "column", gap: "md", paddingX: "xxl", paddingY: "xl" },
            [
                createTextElement(
                    "An AI agent wants to register a toolset. Once registered, its tools run as programs on your computer with your full user privileges — headlessly, whenever the agent calls them, and after the agent edits them, with no further prompt.",
                ),
                createTextElement("Only register toolsets you created or fully understand."),
                createTextElement(
                    "If you're not sure, ask your AI agent to explain what these tools do before registering.",
                    { color: "warning" },
                ),
                detailsElement,
            ],
        );
        const cancelButton = new ButtonView({
            onClick: () => model.close(false),
            children: "Cancel",
        });
        const registerButton = new ButtonView({
            variant: "primary",
            onClick: () => model.close(true),
            children: "Register toolset",
        });
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [cancelButton.root, registerButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: "Register this toolset?",
            icon: "warning",
            onClose: () => model.close(false),
            minWidth: 440,
            maxWidth: 680,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "register-toolset-dialog",
            onKeyDown: (event) => model.handleKeyDown(event.nativeEvent as KeyboardEvent),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.cancelButton = this.child(cancelButton);
        this.registerButton = this.child(registerButton);
        this.detailsElement = detailsElement;
    }

    protected onMount(): void {
        this.cancelButton.mount();
        this.registerButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.bind(this.model.state, (state) => `${state.toolsetName}  —  ${state.toolsetRoot}`, (value) => {
            this.detailsElement.textContent = value;
        });
        this.bind(this.model.state, (state) => state.tools, (tools) => {
            this.syncTools(tools);
        });
    }

    private syncTools(tools: RegisterToolsetDialogProps["tools"]): void {
        const names = new Set(tools.map((tool) => tool.name));
        for (const [name, element] of this.toolElements) {
            if (names.has(name)) continue;
            element.remove();
            this.toolElements.delete(name);
        }
        tools.forEach((tool) => {
            let element = this.toolElements.get(tool.name);
            if (!element) {
                element = createTextElement("", { color: "light" });
                this.toolElements.set(tool.name, element);
                this.detailsElement.parentElement?.append(element);
            }
            element.textContent = `• ${tool.name} — ${tool.description}`;
            this.detailsElement.parentElement?.append(element);
        });
    }
}
