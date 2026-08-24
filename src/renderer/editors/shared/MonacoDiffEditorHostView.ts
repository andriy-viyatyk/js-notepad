import * as monaco from "monaco-editor";
import { MONACO_THEME_NAME } from "../../api/setup/configure-monaco";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "./MonacoDiffEditorHostView.css";

export type MonacoModelOwnership = "owned" | "borrowed";

export interface MonacoDiffEditorHostProps {
    initialOriginal?: string;
    initialModified?: string;
    language?: string;
    options?: monaco.editor.IStandaloneDiffEditorConstructionOptions;
    onMount?: (host: MonacoDiffEditorHostView) => void;
}

function createHostRoot(): HTMLDivElement {
    const root = document.createElement("div");
    root.className = "monaco-host-root";
    root.dataset.type = "monaco-host";
    return root;
}

export class MonacoDiffEditorHostView extends VanillaView<MonacoDiffEditorHostProps> {
    public editor: monaco.editor.IStandaloneDiffEditor | undefined;

    private readonly ownedModels = new Set<monaco.editor.ITextModel>();
    private readonly ownedSubscriptions = new Set<monaco.IDisposable>();
    private modifiedContentSubscription: monaco.IDisposable | undefined;
    private ownedOriginal: monaco.editor.ITextModel | undefined;
    private ownedModified: monaco.editor.ITextModel | undefined;
    private currentLanguage: string | undefined;
    private suppressOnChange = false;
    private hostDisposed = false;

    public constructor(props: MonacoDiffEditorHostProps = {}) {
        super(props, createHostRoot());
    }

    protected onMount(): void {
        this.editor = monaco.editor.createDiffEditor(this.root, {
            automaticLayout: true,
            ...this.props.options,
        });
        if (this.props.initialOriginal !== undefined || this.props.initialModified !== undefined) {
            const language = this.props.language ?? "plaintext";
            const original = this.createModel(this.props.initialOriginal ?? "", language);
            const modified = this.createModel(this.props.initialModified ?? "", language);
            this.setModel({ original, modified }, "owned");
            this.ownedOriginal = original;
            this.ownedModified = modified;
            this.currentLanguage = language;
        }
        // setTheme is global and redundant-but-harmless: this is the only theme name the app defines.
        monaco.editor.setTheme(MONACO_THEME_NAME);
        this.props.onMount?.(this);
    }

    protected onUpdate(props: MonacoDiffEditorHostProps): void {
        const editor = this.assertReady();
        editor.updateOptions(props.options ?? {});
    }

    public setDiffValues(original: string, modified: string): void {
        const editor = this.assertReady();
        const originalModel = this.ownedOriginal;
        const modifiedModel = this.ownedModified;
        if (!originalModel || !modifiedModel) return;

        if (originalModel.getValue() === original && modifiedModel.getValue() === modified) return;
        const previousSuppression = this.suppressOnChange;
        this.suppressOnChange = true;
        try {
            if (originalModel.getValue() !== original) originalModel.setValue(original);
            if (modifiedModel.getValue() === modified) return;
            const modifiedEditor = editor.getModifiedEditor();
            if (modifiedEditor.getOption(monaco.editor.EditorOption.readOnly)) {
                modifiedEditor.setValue(modified);
            } else {
                modifiedEditor.executeEdits("external-sync", [{
                    range: modifiedModel.getFullModelRange(),
                    text: modified,
                    forceMoveMarkers: true,
                }]);
                modifiedEditor.pushUndoStop();
            }
        } finally {
            this.suppressOnChange = previousSuppression;
        }
    }

    public setLanguage(language?: string): void {
        this.assertReady();
        const nextLanguage = language ?? "plaintext";
        if (nextLanguage === this.currentLanguage) return;
        if (this.ownedOriginal) monaco.editor.setModelLanguage(this.ownedOriginal, nextLanguage);
        if (this.ownedModified) monaco.editor.setModelLanguage(this.ownedModified, nextLanguage);
        this.currentLanguage = nextLanguage;
    }

    public createModel(value: string, language?: string, uri?: monaco.Uri): monaco.editor.ITextModel {
        this.assertReady();
        const model = monaco.editor.createModel(value, language, uri);
        this.ownedModels.add(model);
        return model;
    }

    /** Release models created by this host after the diff widget no longer references them. */
    public releaseOwnedModels(models: readonly monaco.editor.ITextModel[]): void {
        const released = models.filter((model) => this.ownedModels.delete(model));
        if (released.length === 0) return;
        this.scheduleModelDisposal(released);
    }

    public setModel(
        models: monaco.editor.IDiffEditorModel | null,
        ownership: MonacoModelOwnership = "borrowed",
    ): void {
        const editor = this.assertReady();
        const current = editor.getModel();
        const samePair = current && models
            && current.original === models.original
            && current.modified === models.modified;

        if (!samePair && current) {
            editor.setModel(null);
            this.releaseOwnedModels([current.original, current.modified]);
            if (current.original === this.ownedOriginal) this.ownedOriginal = undefined;
            if (current.modified === this.ownedModified) this.ownedModified = undefined;
        }
        if (models && ownership === "owned") {
            this.ownedModels.add(models.original);
            this.ownedModels.add(models.modified);
        }
        if (!samePair) editor.setModel(models);
    }

    public getEditor(): monaco.editor.IStandaloneDiffEditor {
        return this.assertReady();
    }

    public listenToModifiedContent(listener: () => void): void {
        const editor = this.assertReady();
        this.modifiedContentSubscription?.dispose();
        if (this.modifiedContentSubscription) {
            this.ownedSubscriptions.delete(this.modifiedContentSubscription);
        }
        const subscription = editor.getModifiedEditor().onDidChangeModelContent(() => {
            if (this.suppressOnChange) return;
            listener();
        });
        this.modifiedContentSubscription = subscription;
        this.ownedSubscriptions.add(subscription);
    }

    protected onDispose(): void {
        if (this.hostDisposed) return;
        this.hostDisposed = true;

        for (const subscription of this.ownedSubscriptions) subscription.dispose();
        this.ownedSubscriptions.clear();
        this.modifiedContentSubscription = undefined;

        const editor = this.editor;
        const ownedModels = Array.from(this.ownedModels);
        this.ownedModels.clear();
        if (editor) {
            editor.setModel(null);
            editor.dispose();
        }
        this.editor = undefined;
        this.ownedOriginal = undefined;
        this.ownedModified = undefined;
        this.scheduleModelDisposal(ownedModels);
    }

    private scheduleModelDisposal(models: readonly monaco.editor.ITextModel[]): void {
        setTimeout(() => {
            models.forEach((model) => model.dispose());
        }, 0);
    }

    private assertReady(): monaco.editor.IStandaloneDiffEditor {
        if (this.hostDisposed || !this.editor) {
            throw new Error("MonacoDiffEditorHostView is not mounted.");
        }
        return this.editor;
    }
}
