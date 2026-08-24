import * as monaco from "monaco-editor";
import { MONACO_THEME_NAME } from "../../api/setup/configure-monaco";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "./MonacoEditorHostView.css";

export type MonacoModelOwnership = "owned" | "borrowed";

export interface MonacoEditorHostProps {
    initialValue?: string;
    language?: string;
    options?: monaco.editor.IStandaloneEditorConstructionOptions;
    onMount?: (host: MonacoEditorHostView) => void;
    onChange?: (value: string) => void;
}

function createHostRoot(): HTMLDivElement {
    const root = document.createElement("div");
    root.className = "monaco-editor-host-root";
    root.dataset.type = "monaco-host";
    return root;
}

export class MonacoEditorHostView extends VanillaView<MonacoEditorHostProps> {
    public editor: monaco.editor.IStandaloneCodeEditor | undefined;

    private readonly ownedModels = new Set<monaco.editor.ITextModel>();
    private readonly ownedSubscriptions = new Set<monaco.IDisposable>();
    private modelContentSubscription: monaco.IDisposable | undefined;
    private currentLanguage: string | undefined;
    private suppressOnChange = false;
    private hostDisposed = false;

    public constructor(props: MonacoEditorHostProps = {}) {
        super(props, createHostRoot());
    }

    protected onMount(): void {
        const language = this.props.language ?? "plaintext";
        const model = monaco.editor.createModel(
            this.props.initialValue ?? "",
            language,
        );
        this.ownedModels.add(model);
        this.currentLanguage = language;
        this.editor = monaco.editor.create(this.root, {
            model,
            automaticLayout: true,
            ...this.props.options,
        });
        this.listenToModelContent();
        monaco.editor.setTheme(MONACO_THEME_NAME);
        this.props.onMount?.(this);
    }

    protected onUpdate(props: MonacoEditorHostProps): void {
        const editor = this.assertReady();
        editor.updateOptions(props.options ?? {});

        const language = props.language ?? "plaintext";
        if (language !== this.currentLanguage) {
            this.currentLanguage = language;
            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, language);
            }
        }
    }

    public createModel(value: string, language?: string, uri?: monaco.Uri): monaco.editor.ITextModel {
        this.assertReady();
        return this.createOwnedModel(value, language, uri);
    }

    public setModel(
        model: monaco.editor.ITextModel | null,
        ownership: MonacoModelOwnership = "borrowed",
    ): void {
        const editor = this.assertReady();
        const currentModel = editor.getModel();

        if (currentModel === model) {
            if (model && ownership === "owned") {
                this.ownedModels.add(model);
            }
            return;
        }

        this.disposeModelContentSubscription();
        editor.setModel(null);
        this.releaseOwnedModel(currentModel);

        if (model && ownership === "owned") {
            this.ownedModels.add(model);
        }

        editor.setModel(model);
        if (model) this.listenToModelContent();
    }

    public setValue(value: string): void {
        const editor = this.assertReady();
        const model = editor.getModel();
        if (!model || model.getValue() === value) return;

        const previousSuppression = this.suppressOnChange;
        this.suppressOnChange = true;
        try {
            if (editor.getOption(monaco.editor.EditorOption.readOnly)) {
                editor.setValue(value);
            } else {
                const range = model.getFullModelRange();
                editor.executeEdits("external-sync", [{
                    range,
                    text: value,
                    forceMoveMarkers: true,
                }]);
                editor.pushUndoStop();
            }
        } finally {
            this.suppressOnChange = previousSuppression;
        }
    }

    public getEditor(): monaco.editor.IStandaloneCodeEditor {
        return this.assertReady();
    }

    protected onDispose(): void {
        if (this.hostDisposed) return;
        this.hostDisposed = true;

        for (const subscription of this.ownedSubscriptions) subscription.dispose();
        this.ownedSubscriptions.clear();
        this.modelContentSubscription = undefined;

        const editor = this.editor;
        const ownedModels = Array.from(this.ownedModels);
        this.ownedModels.clear();
        if (editor) {
            editor.setModel(null);
            editor.dispose();
        }
        this.editor = undefined;
        this.scheduleModelDisposal(ownedModels);
    }

    private createOwnedModel(
        value: string,
        language?: string,
        uri?: monaco.Uri,
    ): monaco.editor.ITextModel {
        const model = monaco.editor.createModel(value, language, uri);
        this.ownedModels.add(model);
        return model;
    }

    private listenToModelContent(): void {
        const editor = this.assertReady();
        this.disposeModelContentSubscription();
        const subscription = editor.onDidChangeModelContent(() => {
            if (this.suppressOnChange) return;
            this.props.onChange?.(editor.getValue());
        });
        this.modelContentSubscription = subscription;
        this.ownedSubscriptions.add(subscription);
    }

    private disposeModelContentSubscription(): void {
        this.modelContentSubscription?.dispose();
        if (this.modelContentSubscription) {
            this.ownedSubscriptions.delete(this.modelContentSubscription);
        }
        this.modelContentSubscription = undefined;
    }

    private releaseOwnedModel(model: monaco.editor.ITextModel | null): void {
        if (!model || !this.ownedModels.delete(model)) return;
        this.scheduleModelDisposal([model]);
    }

    private scheduleModelDisposal(models: readonly monaco.editor.ITextModel[]): void {
        setTimeout(() => {
            models.forEach((model) => model.dispose());
        }, 0);
    }

    private assertReady(): monaco.editor.IStandaloneCodeEditor {
        if (this.hostDisposed || !this.editor) {
            throw new Error("MonacoEditorHostView is not mounted.");
        }
        return this.editor;
    }
}
