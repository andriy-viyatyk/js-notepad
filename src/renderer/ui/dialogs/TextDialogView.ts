import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/DialogView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { MonacoEditorHostView } from "../../editors/shared/MonacoEditorHostView";
import type { MonacoEditorHostProps } from "../../editors/shared/MonacoEditorHostView";
import type { DialogViewProps } from "./dialog-view-registry";
import type {
    TextDialogModel,
} from "./TextDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";

type TextModel = TextDialogModel;

export class TextDialogView extends VanillaView<DialogViewProps> {
    private readonly model: TextModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly editorHost: HTMLDivElement;
    private editorView: MonacoEditorHostView | undefined;
    private readonly buttonsPanel: HTMLDivElement;
    private readonly buttonViews = new Map<number, ButtonView>();

    public constructor(props: DialogViewProps) {
        const model = props.model as TextModel;
        const state = model.state.get();
        const editorHost = document.createElement("div");
        editorHost.dataset.part = "editor";
        editorHost.style.width = "100%";
        editorHost.style.height = "100%";
        editorHost.style.minHeight = "0";
        const editorPanel = createPanelElement({ flex: true, overflow: "hidden" }, [editorHost]);
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(editorPanel, buttonsPanel);
        const contentView = new DialogContentView({
            title: state.title || "",
            icon: "confirm",
            onClose: () => { void model.close(undefined); },
            width: state.width || 600,
            height: state.height || 400,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "text-dialog",
            autoFocus: false,
            onKeyDown: (event) => model.handleKeyDown(event),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.buttonsPanel = buttonsPanel;
        this.editorHost = editorHost;
        this.own(() => this.disposeButtons());
    }

    protected onMount(): void {
        this.contentView.mount();
        const editorView = this.child(new MonacoEditorHostView(this.editorProps()));
        this.editorView = editorView;
        this.editorHost.append(editorView.root);
        editorView.mount();
        this.syncButtons();
        this.dialogView.mount();
        this.bind(this.model.state, (state) => state.title ?? "", (title) => {
            this.contentView.setTitle(title);
        });
        this.bind(this.model.state, (state) => JSON.stringify({
            text: state.text ?? "",
            readOnly: state.readOnly ?? true,
            options: state.options,
        }), () => this.syncEditor());
        this.bind(this.model.state, (state) => state.buttons ?? [], () => this.syncButtons());
    }

    private editorProps(): MonacoEditorHostProps {
        const state = this.model.state.get();
        const options = state.options;
        return {
            initialValue: state.text || "",
            language: options?.language || "plaintext",
            onChange: state.readOnly ? undefined : this.model.handleEditorChange,
            options: {
                automaticLayout: true,
                readOnly: state.readOnly ?? true,
                wordWrap: options?.wordWrap || "on",
                minimap: { enabled: options?.minimap ?? false },
                lineNumbers: options?.lineNumbers || "off",
                scrollBeyondLastLine: false,
                renderLineHighlight: state.readOnly ? "none" : "line",
                domReadOnly: state.readOnly ?? true,
            },
            onMount: (host) => host.getEditor().focus(),
        };
    }

    private syncEditor(): void {
        this.editorView?.update(this.editorProps());
        this.editorView?.setValue(this.model.state.get().text || "");
    }

    private syncButtons(): void {
        const buttons = this.model.state.get().buttons ?? ["OK"];
        for (const [index, buttonView] of this.buttonViews) {
            if (index < buttons.length) continue;
            buttonView.dispose();
            buttonView.root.remove();
            this.buttonViews.delete(index);
        }
        buttons.forEach((button, index) => {
            const nextProps = {
                onClick: () => {
                    void this.model.close({ text: this.model.editorText, button });
                },
                children: button,
            };
            let buttonView = this.buttonViews.get(index);
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
