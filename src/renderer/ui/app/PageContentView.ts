import React from "react";
import type { EditorModel } from "../../editors/base/EditorModel";
import { CompareEditor } from "../../editors/compare";
import { pagesModel } from "../../api/pages";
import type { PageModel } from "../../api/pages/PageModel";
import { SecondaryViewsView } from "../secondary-views/SecondaryViewsView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { mountReactHandle, type MountedReactRoot } from "../../uikit/shared/mount";
import { createOrnamentElement } from "../../theme/Ornament";
import { RenderEditorView } from "./RenderEditorView";
import "./Pages.css";

export interface PageContentProps { pageId: string; }

export class PageContentView extends VanillaView<PageContentProps> {
    private page: PageModel | undefined;
    private pageSubscription: (() => void) | undefined;
    private navSubscription: (() => void) | undefined;
    private navModel: PageModel["secondaryViewsModel"];
    private secondaryView: SecondaryViewsView | undefined;
    private contentRoot: HTMLElement | undefined;
    private renderEditor: RenderEditorView | undefined;
    private contentIdentity: string | undefined;
    private compareHost: HTMLDivElement | undefined;
    private compareHandle: MountedReactRoot | undefined;
    private generation = 0;
    private live = true;

    public constructor(props: PageContentProps) {
        super(props);
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.own(() => { this.live = false; this.generation++; });
        this.own(pagesModel.state.subscribe(() => this.sync()));
        this.sync();
    }

    protected onDispose(): void {
        this.pageSubscription?.();
        this.navSubscription?.();
        this.pageSubscription = undefined;
        this.navSubscription = undefined;
        this.clearCompare();
        this.clearContent();
        this.clearSecondary();
    }

    private sync(): void {
        if (!this.live) return;
        const page = pagesModel.query.findPage(this.props.pageId) ?? undefined;
        if (page !== this.page) {
            this.pageSubscription?.();
            this.pageSubscription = page?.state.subscribe(() => this.sync());
            this.navSubscription?.();
            this.navSubscription = undefined;
            this.navModel = undefined;
            this.page = page;
        }
        if (!page) {
            this.clearCompare();
            this.clearContent();
            this.clearSecondary();
            return;
        }
        const compareInfo = pagesModel.query.isInCompareMode(page.id);
        if (compareInfo.active) {
            this.clearContent();
            this.clearSecondary();
            if (compareInfo.leftId === page.id && compareInfo.rightId) {
                const leftHost = pagesModel.query.getTextFileHost(compareInfo.leftId);
                const rightHost = pagesModel.query.getTextFileHost(compareInfo.rightId);
                if (leftHost && rightHost) this.updateCompare(leftHost, rightHost, compareInfo.leftId);
                else this.clearCompare();
            } else this.clearCompare();
            return;
        }
        this.clearCompare();
        this.syncSecondary(page);
        this.syncContent(page.mainEditorInstance);
    }

    private syncSecondary(page: PageModel): void {
        if (!page.state.get().hasSidebar) {
            this.navModel = undefined;
            this.navSubscription?.();
            this.navSubscription = undefined;
            this.clearSecondary();
            return;
        }
        const nav = page.ensureSecondaryViewsModel();
        if (this.navModel !== nav) {
            this.navSubscription?.();
            this.navModel = nav;
            this.navSubscription = nav.state.subscribe(() => this.sync());
        }
        const state = nav.state.get();
        if (!state.open) {
            this.clearSecondary();
            return;
        }
        const props = { views: page.panelEditors, state, setState: page.setSecondaryViewsState };
        if (!this.secondaryView) {
            this.secondaryView = this.child(new SecondaryViewsView(props));
            this.root.append(this.secondaryView.root);
            this.secondaryView.mount();
        } else this.secondaryView.update(props);
    }

    private clearSecondary(): void {
        if (!this.secondaryView) return;
        this.secondaryView.dispose();
        this.secondaryView.root.remove();
        this.secondaryView = undefined;
    }

    private syncContent(editor: EditorModel | null): void {
        const identity = editor ? `${editor.id}:${editor.showBackgroundOrnament ? "ornament" : "plain"}` : "empty";
        if (identity === this.contentIdentity) {
            if (editor) this.renderEditor?.update({ model: editor });
            return;
        }
        this.clearContent();
        this.contentIdentity = identity;
        if (!editor) {
            const empty = document.createElement("div");
            empty.className = "empty-page-root";
            empty.dataset.name = "page-empty";
            empty.append(this.ornamentWrapper());
            this.contentRoot = empty;
            this.root.append(empty);
            return;
        }
        const editorContainer = document.createElement("div");
        editorContainer.className = "page-editor-container scroll-container";
        editorContainer.dataset.name = "page-editor";
        this.renderEditor = new RenderEditorView({ model: editor });
        editorContainer.append(this.renderEditor.root);
        if (editor.showBackgroundOrnament) {
            const area = document.createElement("div");
            area.className = "ornament-page-area";
            area.append(this.ornamentWrapper(), editorContainer);
            this.contentRoot = area;
            this.root.append(area);
        } else {
            this.contentRoot = editorContainer;
            this.root.append(editorContainer);
        }
        this.renderEditor.mount();
    }

    private ornamentWrapper(): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.className = "ornament-wrapper";
        wrapper.append(createOrnamentElement());
        return wrapper;
    }

    private clearContent(): void {
        this.renderEditor?.dispose();
        this.renderEditor?.root.remove();
        this.renderEditor = undefined;
        this.contentRoot?.remove();
        this.contentRoot = undefined;
        this.contentIdentity = undefined;
    }

    private updateCompare(model: object, groupedModel: object, leftPageId: string): void {
        if (!this.compareHost) {
            this.compareHost = document.createElement("div");
            this.compareHost.style.display = "contents";
            this.root.append(this.compareHost);
            this.compareHandle = mountReactHandle(this.compareHost, this.compareElement(model, groupedModel, leftPageId));
        } else this.compareHandle?.render(this.compareElement(model, groupedModel, leftPageId));
    }

    private compareElement(model: object, groupedModel: object, leftPageId: string): React.ReactElement {
        return React.createElement(CompareEditor, { model, groupedModel, leftPageId } as never);
    }

    private clearCompare(): void {
        const handle = this.compareHandle;
        const host = this.compareHost;
        if (!handle || !host) return;
        this.compareHandle = undefined;
        this.compareHost = undefined;
        const generation = ++this.generation;
        host.remove();
        queueMicrotask(() => { if (this.generation === generation) handle.dispose(); });
    }
}
