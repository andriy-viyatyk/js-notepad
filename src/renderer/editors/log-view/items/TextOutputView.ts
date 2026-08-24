import type * as Monaco from "monaco-editor";
import { errMessage } from "../../../../shared/utils";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { pagesModel } from "../../../api/pages";
import type { TextOutputEntry } from "../logTypes";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";
import { DialogHeaderView } from "./DialogHeader";
import "../../shared/MonacoEditorHostView.css";

export interface TextOutputViewProps { entry: TextOutputEntry; }

interface TextEditorHostProps {
    value: string;
    language: string;
    wordWrap: boolean;
    lineNumbers: boolean;
    minimap: boolean;
}

/** Dynamic Monaco host whose subscription and editor share one disposal boundary. */
class TextEditorHostView extends VanillaView<TextEditorHostProps> {
    private editor: Monaco.editor.IStandaloneCodeEditor | undefined;
    private model: Monaco.editor.ITextModel | undefined;
    private sizeSubscription: Monaco.IDisposable | undefined;
    private monaco: typeof import("monaco-editor") | undefined;
    private loadGeneration = 0;

    public constructor(props: TextEditorHostProps) {
        const root = document.createElement("div");
        root.className = "monaco-editor-host-root";
        root.dataset.type = "monaco-host";
        root.style.overflow = "hidden";
        super(props, root);
    }

    protected onMount(): void { void this.loadEditor().catch((error: unknown) => console.error(errMessage(error, "Failed to load text output editor"))); }

    protected onUpdate(props: TextEditorHostProps): void {
        this.applyEditorProps(props);
    }

    protected onDispose(): void {
        this.loadGeneration += 1;
        this.sizeSubscription?.dispose();
        this.sizeSubscription = undefined;
        this.editor?.dispose();
        this.editor = undefined;
        this.model?.dispose();
        this.model = undefined;
        this.monaco = undefined;
    }

    private async loadEditor(): Promise<void> {
        const generation = ++this.loadGeneration;
        const monaco = await import("monaco-editor");
        if (generation !== this.loadGeneration) return;
        this.monaco = monaco;
        const model = monaco.editor.createModel(this.props.value, this.props.language);
        const editor = monaco.editor.create(this.root, {
            model,
            automaticLayout: true,
            readOnly: true,
            domReadOnly: true,
            wordWrap: this.props.wordWrap ? "on" : "off",
            lineNumbers: this.props.lineNumbers ? "on" : "off",
            minimap: { enabled: this.props.minimap },
            scrollBeyondLastLine: false,
            renderLineHighlight: "none",
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            folding: false,
            contextmenu: false,
            scrollbar: { alwaysConsumeMouseWheel: false },
            padding: { top: 4, bottom: 4 },
        });
        if (generation !== this.loadGeneration) { editor.dispose(); model.dispose(); return; }
        this.model = model;
        this.editor = editor;
        this.sizeSubscription = editor.onDidContentSizeChange(() => this.updateHeight());
        this.applyEditorProps(this.props);
        this.updateHeight();
    }

    private applyEditorProps(props: TextEditorHostProps): void {
        const editor = this.editor;
        const model = this.model;
        const monaco = this.monaco;
        if (!editor || !model || !monaco) return;
        if (model.getValue() !== props.value) model.setValue(props.value);
        if (model.getLanguageId() !== props.language) monaco.editor.setModelLanguage(model, props.language);
        editor.updateOptions({ wordWrap: props.wordWrap ? "on" : "off", lineNumbers: props.lineNumbers ? "on" : "off", minimap: { enabled: props.minimap } });
        this.updateHeight();
    }

    private updateHeight(): void {
        const editor = this.editor;
        if (!editor) return;
        this.root.style.height = `${Math.min(editor.getContentHeight(), DIALOG_CONTENT_MAX_HEIGHT)}px`;
        editor.layout();
    }
}

export class TextOutputView extends VanillaView<TextOutputViewProps> {
    private readonly header: DialogHeaderView;
    private readonly host: TextEditorHostView;
    private readonly action: IconButtonView;
    private readonly panel = createPanelElement({ name: "log-text-output", direction: "column", position: "relative", border: true, rounded: "md", overflow: "hidden", width: "100%", revealChildrenOnHover: true });
    private readonly hostPanel = createPanelElement({ overflow: "hidden" });

    public constructor(props: TextOutputViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.host = new TextEditorHostView(this.hostProps(props));
        this.action = new IconButtonView({ name: "log-text-open-in-editor", hideUntilParentHover: true, size: "sm", icon: "open-link", title: "Open in Text editor", onClick: this.handleOpenInEditor });
        this.hostPanel.append(this.host.root);
        const actions = createPanelElement({ name: "log-text-hover-actions", position: "absolute", top: 4, right: 4, zIndex: 1 });
        actions.append(this.action.root);
        this.panel.append(this.header.root, this.hostPanel, actions);
        this.child(this.header);
        this.child(this.host);
        this.child(this.action);
    }

    protected onMount(): void { this.root.append(this.panel); this.header.mount(); this.host.mount(); this.action.mount(); }
    protected onUpdate(props: TextOutputViewProps): void { this.header.update({ title: props.entry.title }); this.host.update(this.hostProps(props)); }

    private hostProps(props: TextOutputViewProps): TextEditorHostProps {
        return { value: props.entry.text, language: props.entry.language || "plaintext", wordWrap: props.entry.wordWrap !== false, lineNumbers: props.entry.lineNumbers === true, minimap: props.entry.minimap === true };
    }

    private readonly handleOpenInEditor = (): void => {
        const title = typeof this.props.entry.title === "string" ? this.props.entry.title : "Text";
        pagesModel.addEditorPage("monaco", this.props.entry.language || "plaintext", title, this.props.entry.text);
    };
}
