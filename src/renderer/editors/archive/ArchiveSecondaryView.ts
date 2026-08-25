import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { TreeProviderViewImpl } from "../../components/tree-provider/TreeProviderViewImpl";
import type { TreeProviderViewModel } from "../../components/tree-provider/TreeProviderViewModel";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../ui/secondary-views/SideBarPanelHeaderView";
import type { ArchiveEditor } from "./ArchiveEditor";

export default class ArchiveSecondaryView extends VanillaView<SecondaryViewProps> {
    private archiveModel: ArchiveEditor | undefined;
    private tree: TreeProviderViewImpl | undefined;
    private closeButton: IconButtonView | undefined;
    private header: SideBarPanelHeaderHandle | undefined;
    private treeProviderModel: TreeProviderViewModel | undefined;
    private revealFrame: number | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "archive-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        }));
    }

    protected onMount(): void {
        const archiveModel = this.getArchiveModel(this.props);
        const provider = archiveModel?.treeProvider;
        if (!archiveModel || !provider) return;

        this.archiveModel = archiveModel;
        this.tree = this.child(new TreeProviderViewImpl(this.treeProps(archiveModel, provider)));
        this.root.append(this.tree.root);

        this.closeButton = this.child(new IconButtonView({
            name: "archive-secondary-close",
            size: "sm",
            title: "Close",
            icon: "close",
            onClick: this.onCloseClick,
        }));

        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Archive",
            actions: this.shouldShowClose(this.props) ? this.closeButton.root : undefined,
        });

        this.tree.mount();
        this.closeButton.mount();
        this.bind(
            archiveModel.selectionState,
            (state) => state.selectedHref,
            (selectedHref) => this.tree?.update(this.treeProps(archiveModel, provider, selectedHref)),
        );
        this.bind(
            archiveModel.revealVersion,
            (state) => state.version,
            (version) => this.scheduleReveal(version),
        );
        this.own(() => this.cancelReveal());
        this.own(() => this.header?.dispose());
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const archiveModel = this.getArchiveModel(props);
        const provider = archiveModel?.treeProvider;
        if (archiveModel && provider) {
            this.archiveModel = archiveModel;
            this.tree?.update(this.treeProps(
                archiveModel,
                provider,
                archiveModel.selectionState.get().selectedHref,
            ));
        }
        this.updateHeader(props);
    }

    protected onDispose(): void {
        this.cancelReveal();
        this.treeProviderModel = undefined;
        this.tree = undefined;
        this.closeButton = undefined;
        this.header = undefined;
        this.archiveModel = undefined;
    }

    private getArchiveModel(props: SecondaryViewProps): ArchiveEditor | undefined {
        return props.model as ArchiveEditor;
    }

    private treeProps(
        archiveModel: ArchiveEditor,
        provider: NonNullable<ArchiveEditor["treeProvider"]>,
        selectedHref = archiveModel.selectionState.get().selectedHref,
    ) {
        return {
            provider,
            selectedHref: selectedHref ?? undefined,
            onItemClick: this.handleItemClick,
            onItemDoubleClick: this.handleItemClick,
            onModel: (model: TreeProviderViewModel | null) => {
                this.treeProviderModel = model ?? undefined;
            },
        };
    }

    private shouldShowClose(props: SecondaryViewProps): boolean {
        const archiveModel = this.archiveModel ?? this.getArchiveModel(props);
        return !!archiveModel
            && archiveModel !== archiveModel.page?.mainEditor
            && props.expanded !== false;
    }

    private updateHeader(props: SecondaryViewProps): void {
        this.header?.update({
            headerRef: props.headerRef,
            icon: props.iconElement,
            title: "Archive",
            actions: this.shouldShowClose(props) ? this.closeButton?.root : undefined,
        });
    }

    private readonly handleItemClick = (item: ITreeProviderItem): void => {
        const archiveModel = this.archiveModel;
        const provider = archiveModel?.treeProvider;
        if (!archiveModel || !provider) return;
        archiveModel.selectionState.update((state) => { state.selectedHref = item.href; });
        const url = provider.getNavigationUrl(item) ?? item.href;
        const pageId = archiveModel.page?.id;
        void app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId,
            sourceId: archiveModel.id,
        }));
    };

    private readonly onCloseClick = (event: React.MouseEvent): void => {
        event.stopPropagation();
        const archiveModel = this.archiveModel;
        archiveModel?.page?.removeSecondaryView(archiveModel);
    };

    private scheduleReveal(version: number): void {
        this.cancelReveal();
        const selectedHref = this.archiveModel?.selectionState.get().selectedHref;
        if (version <= 0 || !selectedHref) return;
        this.revealFrame = requestAnimationFrame(() => {
            this.revealFrame = undefined;
            void this.treeProviderModel?.revealItem(selectedHref);
        });
    }

    private cancelReveal(): void {
        if (this.revealFrame !== undefined) cancelAnimationFrame(this.revealFrame);
        this.revealFrame = undefined;
    }
}
