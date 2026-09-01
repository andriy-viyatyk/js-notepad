import type { EditorViewModule, FileEditorView } from "../../editors/types";
import type { EditorOrHost } from "../../editors/base";
import type { IContentHost } from "../../editors/base/IContentHost";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { SpinnerView } from "../../uikit/Spinner/SpinnerView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { afterDispatch } from "../../core/state/dispatch";
import { guard } from "../../core/utils/guard";
import { NativeEditorErrorView } from "./NativeEditorErrorView";

const moduleCache = new Map<string, EditorViewModule>();

export interface AsyncEditorViewProps {
    getEditorModule: () => Promise<EditorViewModule>;
    model: EditorOrHost | IContentHost;
    cacheKey?: string;
}

export class AsyncEditorView extends VanillaView<AsyncEditorViewProps> {
    private readonly editorHost = document.createElement("div");
    private readonly spinner = new SpinnerView({ name: "async-editor", size: 16 });
    private readonly loadingPanel = createPanelElement(
        { name: "async-editor-loading", flex: 1, align: "center", justify: "center" },
        [this.spinner.root],
    );
    private vanillaView: VanillaView<{ model: EditorOrHost | IContentHost }> | undefined;
    private vanillaViewCtor: FileEditorView | undefined;
    private module: EditorViewModule | undefined;
    private errorView: NativeEditorErrorView | undefined;
    private activeCacheKey: string | undefined;
    private generation = 0;
    private live = true;

    public constructor(props: AsyncEditorViewProps) {
        super(props);
        this.root.style.display = "contents";
        this.editorHost.style.display = "contents";
        this.activeCacheKey = props.cacheKey;
        this.child(this.spinner);
    }

    protected onMount(): void {
        this.own(() => { this.live = false; this.generation++; });
        this.root.append(this.loadingPanel);
        this.spinner.mount();
        this.load(this.props);
    }

    protected onUpdate(props: AsyncEditorViewProps): void {
        if (props.cacheKey !== this.activeCacheKey) {
            this.generation++;
            this.activeCacheKey = props.cacheKey;
            this.module = undefined;
            this.disposeActiveResource();
            this.clearErrorView();
            this.editorHost.remove();
            this.root.replaceChildren(this.loadingPanel);
            this.load(props);
            return;
        }
        if (this.module) this.renderEditor(this.module, props.model);
    }

    protected onDispose(): void {
        const vanillaView = this.vanillaView;
        this.vanillaView = undefined;
        this.vanillaViewCtor = undefined;
        this.editorHost.remove();
        if (!vanillaView) return;
        afterDispatch(() => {
            void guard("Failed to dispose editor", () => vanillaView.dispose());
        });
    }

    private load(props: AsyncEditorViewProps): void {
        const generation = this.generation;
        const cached = props.cacheKey ? moduleCache.get(props.cacheKey) : undefined;
        if (cached) {
            this.module = cached;
            this.renderEditor(cached, props.model);
            return;
        }
        void props.getEditorModule().then(
            (module) => {
                if (!this.live || this.generation !== generation) return;
                if (props.cacheKey) moduleCache.set(props.cacheKey, module);
                this.module = module;
                this.renderEditor(module, this.props.model);
            },
            (error: unknown) => {
                // An old load may reject after a newer editor is already working.
                if (!this.live || this.generation !== generation) return;
                this.showVanillaError(error);
            },
        );
    }

    private renderEditor(module: EditorViewModule, model: EditorOrHost | IContentHost): void {
        this.loadingPanel.remove();
        if (!this.editorHost.parentNode) this.root.append(this.editorHost);

        if (
            this.vanillaView
            && this.vanillaViewCtor === module.View
            && this.activeCacheKey === this.props.cacheKey
        ) {
            try {
                this.vanillaView.update({ model });
            } catch (error) {
                this.disposeActiveResource();
                this.showVanillaError(error);
            }
            return;
        }

        this.disposeActiveResource();
        let view: VanillaView<{ model: EditorOrHost | IContentHost }> | undefined;
        try {
            view = new module.View({ model });
            this.vanillaView = view;
            this.vanillaViewCtor = module.View;
            this.editorHost.append(view.root);
            view.mount();
        } catch (error) {
            if (view) {
                if (this.vanillaView === view) {
                    this.vanillaView = undefined;
                    this.vanillaViewCtor = undefined;
                }
                void guard("Failed to clean up vanilla editor", () => view?.dispose());
                view.root.remove();
            }
            this.showVanillaError(error);
        }
    }

    private disposeActiveResource(): void {
        const vanillaView = this.vanillaView;
        this.vanillaView = undefined;
        this.vanillaViewCtor = undefined;
        if (vanillaView) {
            void guard("Failed to dispose editor", () => vanillaView.dispose());
            vanillaView.root.remove();
        }
    }

    private showVanillaError(error: unknown): void {
        console.error("Editor crashed:", error);
        this.loadingPanel.remove();
        if (!this.editorHost.parentNode) this.root.append(this.editorHost);
        this.clearErrorView();
        const errorView = this.child(new NativeEditorErrorView({ error }));
        this.errorView = errorView;
        this.editorHost.replaceChildren(errorView.root);
        errorView.mount();
    }

    private clearErrorView(): void {
        const errorView = this.errorView;
        this.errorView = undefined;
        if (!errorView) return;
        void guard("Failed to dispose editor error", () => this.releaseChild(errorView));
    }
}
