import React from "react";
import { EditorViewModule } from "../../editors/types";
import type { EditorOrHost } from "../../editors/base";
import type { IContentHost } from "../../editors/base/IContentHost";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { SpinnerView } from "../../uikit/Spinner/SpinnerView";
import { mountReactHandle, type MountedReactRoot } from "../../uikit/shared/mount";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { EditorErrorBoundary } from "./EditorErrorBoundary";

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
    private handle: MountedReactRoot | undefined;
    private module: EditorViewModule | undefined;
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
            this.editorHost.remove();
            this.root.replaceChildren(this.loadingPanel);
            this.load(props);
            return;
        }
        if (this.module) this.renderEditor(this.module, props.model);
    }

    protected onDispose(): void {
        const handle = this.handle;
        this.handle = undefined;
        this.editorHost.remove();
        if (!handle) return;
        const generation = this.generation;
        queueMicrotask(() => {
            if (this.generation === generation) handle.dispose();
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
        void props.getEditorModule().then((module) => {
            if (!this.live || this.generation !== generation) return;
            if (props.cacheKey) moduleCache.set(props.cacheKey, module);
            this.module = module;
            this.renderEditor(module, this.props.model);
        });
    }

    private renderEditor(module: EditorViewModule, model: EditorOrHost | IContentHost): void {
        this.loadingPanel.remove();
        if (!this.editorHost.parentNode) this.root.append(this.editorHost);
        const element = React.createElement(
            EditorErrorBoundary,
            null,
            React.createElement(module.Editor, { model }),
        );
        if (this.handle) this.handle.render(element);
        else this.handle = mountReactHandle(this.editorHost, element);
    }
}
