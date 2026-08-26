import { app } from "../../api/app";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import { createLinkData } from "../../../shared/link-data";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import {
    applyPanelAttributes,
    createPanelElement,
    resolvePanelAttributes,
} from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { TreeProviderViewImpl } from "../../components/tree-provider/TreeProviderViewImpl";
import type { TreeProviderViewModel } from "../../components/tree-provider/TreeProviderViewModel";
import { PageToolbarView, type PageToolbarViewProps } from "../base/PageToolbarView";
import type { EditorModel } from "../base/EditorModel";
import {
    ArchiveEditor,
    getDefaultArchiveEditorState,
    type ArchiveEditorState,
} from "./ArchiveEditor";
import { TComponentState } from "../../core/state/state";

export class ArchiveEditorView extends VanillaView<{ model: EditorModel }> {
    private model: ArchiveEditor;
    private pageToolbar!: PageToolbarView;
    private collapseButton!: IconButtonView;
    private refreshButton!: IconButtonView;
    private tree!: TreeProviderViewImpl;
    private buttonHost!: HTMLSpanElement;
    private treeModel: TreeProviderViewModel | null = null;

    public constructor(props: { model: EditorModel }) {
        super(props, createPanelElement({ direction: "column" }));
        this.model = requireArchiveModel(props.model);
    }

    protected onMount(): void {
        const provider = this.model.treeProvider;
        if (!provider) {
            this.applyEmptyRoot();
            this.root.append(createTextElement("No archive loaded.", { color: "light" }));
            return;
        }

        this.applyLoadedRoot();

        this.buttonHost = document.createElement("span");
        this.buttonHost.style.display = "contents";
        this.collapseButton = this.child(new IconButtonView({
            name: "archive-collapse-all",
            size: "sm",
            title: "Collapse All",
            icon: "collapse-all",
            onClick: this.handleCollapseAll,
        }));
        this.refreshButton = this.child(new IconButtonView({
            name: "archive-refresh",
            size: "sm",
            title: "Refresh",
            icon: "refresh",
            onClick: this.handleRefresh,
        }));
        this.buttonHost.append(this.collapseButton.root, this.refreshButton.root);

        this.pageToolbar = this.child(new PageToolbarView(this.pageToolbarProps()));
        this.tree = this.child(new TreeProviderViewImpl(this.treeProps(provider)));
        this.root.append(this.pageToolbar.root, this.tree.root);

        this.pageToolbar.mount();
        this.collapseButton.mount();
        this.refreshButton.mount();
        this.tree.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        this.model = requireArchiveModel(props.model);
        if (!this.model.treeProvider) {
            this.applyEmptyRoot();
            return;
        }

        this.applyLoadedRoot();
        // onMount() returns early when the model had no provider, so the toolbar
        // and tree were never built. The provider is set before mount on every
        // path (see US-1113), so this is unreachable today — but the fields are
        // definite-assignment asserted, which would make it a TypeError rather
        // than a no-op if a future path ever loaded a provider after mount.
        if (!this.pageToolbar) return;
        this.pageToolbar.update(this.pageToolbarProps());
        this.tree.update(this.treeProps(this.model.treeProvider));
    }

    private pageToolbarProps(): PageToolbarViewProps {
        return {
            name: "archive-toolbar",
            model: this.model,
            borderBottom: true,
            rightContributions: this.buttonHost,
        };
    }

    private treeProps(provider: NonNullable<ArchiveEditor["treeProvider"]>) {
        return {
            provider,
            onModel: this.handleTreeModel,
            onItemClick: this.handleItemClick,
            onItemDoubleClick: this.handleItemClick,
        };
    }

    private applyLoadedRoot(): void {
        applyPanelAttributes(this.root, resolvePanelAttributes({
            name: "archive-root",
            direction: "column",
            flex: 1,
            overflow: "hidden",
            background: "default",
        }));
    }

    private applyEmptyRoot(): void {
        applyPanelAttributes(this.root, resolvePanelAttributes({
            direction: "column",
            flex: 1,
            overflow: "hidden",
            background: "default",
            padding: "xl",
        }));
    }

    private readonly handleTreeModel = (model: TreeProviderViewModel | null): void => {
        this.treeModel = model;
    };

    private readonly handleItemClick = (item: ITreeProviderItem): void => {
        const provider = this.model.treeProvider;
        const url = provider?.getNavigationUrl(item) ?? item.href;
        const pageId = this.model.page?.id ?? this.model.id;
        void app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId,
            sourceId: this.model.id,
        }));
    };

    private readonly handleCollapseAll = (): void => {
        this.treeModel?.collapseAll();
    };

    private readonly handleRefresh = (): void => {
        void this.treeModel?.buildTree();
    };
}

function requireArchiveModel(model: EditorModel): ArchiveEditor {
    if (!(model instanceof ArchiveEditor)) throw new Error("Archive view received an invalid model.");
    return model;
}

export function makeArchiveEditor(): ArchiveEditor {
    return new ArchiveEditor(new TComponentState(getDefaultArchiveEditorState()));
}

export { ArchiveEditor };
export type { ArchiveEditorState };
