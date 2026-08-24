import * as monaco from "monaco-editor";
import { MONACO_THEME_NAME } from "../../api/setup/configure-monaco";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "./MonacoDiffEditorHostView.css";

export type MonacoModelOwnership = "owned" | "borrowed";

export interface MonacoDiffEditorHostProps {
    options?: monaco.editor.IStandaloneDiffEditorConstructionOptions;
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
    private hostDisposed = false;

    public constructor(props: MonacoDiffEditorHostProps = {}) {
        super(props, createHostRoot());
    }

    protected onMount(): void {
        this.editor = monaco.editor.createDiffEditor(this.root, {
            automaticLayout: true,
            ...this.props.options,
        });
        // setTheme is global and redundant-but-harmless: this is the only theme name the app defines.
        monaco.editor.setTheme(MONACO_THEME_NAME);
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
        if (models && ownership === "owned") {
            this.ownedModels.add(models.original);
            this.ownedModels.add(models.modified);
        }
        editor.setModel(models);
    }

    public listenToModifiedContent(listener: () => void): void {
        const editor = this.assertReady();
        this.modifiedContentSubscription?.dispose();
        if (this.modifiedContentSubscription) {
            this.ownedSubscriptions.delete(this.modifiedContentSubscription);
        }
        const subscription = editor.getModifiedEditor().onDidChangeModelContent(listener);
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
