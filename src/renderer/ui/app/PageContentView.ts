import type { EditorModel } from "../../editors/base/EditorModel";
import { CompareEditor } from "../../editors/compare/CompareEditor";
import type { TextFileModel } from "../../editors/text/TextEditorModel";
import { pagesModel } from "../../api/pages";
import type { PageModel } from "../../api/pages/PageModel";
import { SecondaryViewsView } from "../secondary-views/SecondaryViewsView";
import { afterDispatch } from "../../core/state/dispatch";
import { guard } from "../../core/utils/guard";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createOrnamentElement } from "../../theme/Ornament";
import { RenderEditorView } from "./RenderEditorView";
import "./Pages.css";
import { sameItems } from "../../core/utils/utils";

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
    private compareView: CompareEditor | undefined;
    private live = true;
    private lastViews: EditorModel[] | undefined;
    private lastSecondaryNav: PageModel["secondaryViewsModel"];

    public constructor(props: PageContentProps) {
        super(props);
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.own(() => { this.live = false; });
        this.own(pagesModel.state.subscribe(
            () => this.sync(),
            (state) => ({
                pages: state.pages,
                leftRight: state.leftRight,
                rightLeft: state.rightLeft,
                compareGroups: state.compareGroups,
            }),
        ));
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
            this.pageSubscription = page ? this.ownSubscription(page.state.subscribe(() => this.sync())) : undefined;
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
            this.navSubscription = this.ownSubscription(nav.state.subscribe(() => this.sync()));
        }
        const state = nav.state.get();
        if (!state.open) {
            this.clearSecondary();
            return;
        }
        const views = page.panelEditors;
        const props = {
            views,
            nav,
            onActivatePanel: this.activatePanel,
            onResizeWidth: this.resizeWidth,
        };
        const viewsChanged = !sameItems(this.lastViews, views);
        const navChanged = this.lastSecondaryNav !== nav;
        if (!this.secondaryView) {
            this.secondaryView = this.child(new SecondaryViewsView(props));
            this.root.append(this.secondaryView.root);
            this.secondaryView.mount();
        } else if (viewsChanged || navChanged) this.secondaryView.update(props);
        this.lastViews = views;
        this.lastSecondaryNav = nav;
    }

    private clearSecondary(): void {
        const view = this.secondaryView;
        if (!view) return;
        this.secondaryView = undefined;
        this.lastViews = undefined;
        this.lastSecondaryNav = undefined;
        void guard("Failed to dispose secondary views", () => this.releaseChild(view));
    }

    private readonly activatePanel = (panelId: string): void => {
        this.page?.setSecondaryViewsState({ activePanel: panelId });
    };

    private readonly resizeWidth = (width: number): void => {
        this.page?.setSecondaryViewsState({ width });
    };

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
        const view = this.renderEditor;
        this.renderEditor = undefined;
        if (view) {
            void guard("Failed to dispose editor", () => {
                try {
                    view.dispose();
                } finally {
                    view.root.remove();
                }
            });
        }
        this.contentRoot?.remove();
        this.contentRoot = undefined;
        this.contentIdentity = undefined;
    }

    private updateCompare(model: TextFileModel, groupedModel: TextFileModel, leftPageId: string): void {
        if (!this.compareView) {
            // clearCompare owns retired compare views; child() would retain every old view.
            this.compareView = new CompareEditor({ model, groupedModel, leftPageId });
            this.root.append(this.compareView.root);
            this.compareView.mount();
        } else {
            this.compareView.update({ model, groupedModel, leftPageId });
        }
    }

    private clearCompare(): void {
        const view = this.compareView;
        if (!view) return;
        this.compareView = undefined;
        view.root.remove();
        afterDispatch(() => {
            void guard("Failed to dispose compare editor", () => view.dispose());
        });
    }
}
