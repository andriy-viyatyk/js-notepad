import { app } from "../../api/app";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import { createLinkData } from "../../../shared/link-data";
import { TreeProviderViewImpl } from "../../components/tree-provider/TreeProviderViewImpl";
import type { TreeProviderViewSavedState } from "../../components/tree-provider/TreeProviderViewModel";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { TagView } from "../../uikit/Tag/TagView";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../ui/secondary-views/SideBarPanelHeaderView";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import type { MnemeRootEditorModel, MnemeRootEditorState } from "./MnemeRootEditorModel";

type MnemeTreeState = Pick<
    MnemeRootEditorState,
    "rootName" | "rootFolder" | "resolving" | "error" | "selectedHref"
>;

/** Native Wiki tree secondary view. */
export default class MnemeTreeSecondaryView extends VanillaView<SecondaryViewProps> {
    private mnemeModel: MnemeRootEditorModel;
    private readonly initialTreeState: TreeProviderViewSavedState | undefined;
    private modelStateBinding: (() => void) | undefined;
    private pageStateBinding: (() => void) | undefined;
    private closeButton: IconButtonView | undefined;
    private header: SideBarPanelHeaderHandle | undefined;
    private rootTag: TagView | undefined;
    private treeView: TreeProviderViewImpl | undefined;
    private fallbackPanel: HTMLDivElement | undefined;
    private fallbackText: HTMLSpanElement | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "mneme-tree-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        }));
        this.mnemeModel = props.model as MnemeRootEditorModel;
        this.initialTreeState = this.mnemeModel.treeState;
    }

    protected onMount(): void {
        this.closeButton = this.child(new IconButtonView({
            name: "mneme-tree-close",
            size: "sm",
            title: "Close",
            icon: "close",
            onClick: (event) => {
                event.stopPropagation();
                void this.mnemeModel.requestClose();
            },
        }));
        this.closeButton.mount();

        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Wiki",
        });
        this.own(() => this.header?.dispose());

        this.bindModelState(this.mnemeModel);
        this.bindPageState(this.mnemeModel);
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const model = props.model as MnemeRootEditorModel;
        if (model !== this.mnemeModel) {
            this.mnemeModel = model;
            this.bindModelState(model);
            this.bindPageState(model);
        }
        this.updateHeader(props);
    }

    protected onDispose(): void {
        this.fallbackPanel?.remove();
        this.fallbackPanel = undefined;
        this.fallbackText = undefined;
        this.closeButton = undefined;
        this.header = undefined;
        this.rootTag = undefined;
        this.treeView = undefined;
    }

    private bindModelState(model: MnemeRootEditorModel): void {
        this.modelStateBinding?.();
        this.modelStateBinding = this.bind(
            model.state,
            (state) => ({
                rootName: state.rootName,
                rootFolder: state.rootFolder,
                resolving: state.resolving,
                error: state.error,
                selectedHref: state.selectedHref,
            }),
            (state) => {
                if (this.mnemeModel !== model) return;
                this.applyModelState(state);
            },
        );
    }

    private bindPageState(model: MnemeRootEditorModel): void {
        this.pageStateBinding?.();
        this.pageStateBinding = undefined;
        if (!model.page?.state) return;
        this.pageStateBinding = this.bind(
            model.page.state,
            () => model.isMain,
            () => {
                if (this.mnemeModel === model) this.updateHeader(this.props);
            },
        );
    }

    private applyModelState(state: MnemeTreeState): void {
        this.syncRootTag(state);
        this.syncBody(state);
        this.updateHeader(this.props);
    }

    private syncRootTag(state: MnemeTreeState): void {
        if (!state.rootName) {
            if (this.rootTag) {
                const tag = this.rootTag;
                this.rootTag = undefined;
                this.releaseChild(tag);
            }
            return;
        }

        if (!this.rootTag) {
            this.rootTag = this.child(new TagView({
                name: "mneme-root-name",
                variant: "outlined",
                size: "sm",
                truncate: true,
                label: state.rootName,
                title: state.rootFolder,
            }));
            this.rootTag.mount();
            return;
        }

        this.rootTag.update({
            name: "mneme-root-name",
            variant: "outlined",
            size: "sm",
            truncate: true,
            label: state.rootName,
            title: state.rootFolder,
        });
    }

    private syncBody(state: MnemeTreeState): void {
        const provider = this.mnemeModel.treeProvider;
        if (provider) {
            this.fallbackPanel?.remove();
            this.fallbackPanel = undefined;
            this.fallbackText = undefined;

            const treeProps = {
                provider,
                rootLabel: state.rootName,
                selectedHref: state.selectedHref,
                onItemClick: this.handleItemClick,
                onItemDoubleClick: this.handleItemClick,
                initialState: this.initialTreeState,
                onStateChange: this.handleStateChange,
            };
            if (!this.treeView) {
                this.treeView = this.child(new TreeProviderViewImpl(treeProps));
                this.root.append(this.treeView.root);
                this.treeView.mount();
            } else {
                this.treeView.update(treeProps);
            }
            return;
        }

        if (this.treeView) {
            const tree = this.treeView;
            this.treeView = undefined;
            this.releaseChild(tree);
        }

        const message = state.error ?? (state.resolving ? "Connecting…" : "No content");
        if (!this.fallbackPanel) {
            this.fallbackText = createTextElement(message, {
                size: "sm",
                color: state.error ? "error" : "light",
            });
            this.fallbackPanel = createPanelElement(
                { direction: "row", padding: "md" },
                [this.fallbackText],
            );
            this.root.append(this.fallbackPanel);
            return;
        }

        this.fallbackText?.setAttribute("data-color", state.error ? "error" : "light");
        if (this.fallbackText) this.fallbackText.textContent = message;
    }

    private updateHeader(props: SecondaryViewProps): void {
        this.header?.update({
            headerRef: props.headerRef,
            icon: props.iconElement,
            badge: this.rootTag?.root,
            title: "Wiki",
            actions: props.expanded === false ? undefined : this.closeButton?.root,
            showMainTitle: "Open Mneme search",
            showMainActive: this.mnemeModel.isMain,
            onShowMain: props.expanded === false ? undefined : this.showMain,
        });
    }

    private readonly handleStateChange = (state: TreeProviderViewSavedState): void => {
        this.mnemeModel.setTreeState(state);
    };

    private readonly handleItemClick = (item: ITreeProviderItem): void => {
        if (item.isDirectory) return;
        const model = this.mnemeModel;
        model.setSelectedHref(item.href);
        const url = model.treeProvider?.getNavigationUrl(item);
        if (!url) return;
        void app.events.openRawLink.sendAsync(
            createLinkData(url, { pageId: model.page?.id, sourceId: model.id }),
        );
    };

    private readonly showMain = (): void => {
        const model = this.mnemeModel;
        if (!model.isMain) void model.page?.promoteSecondaryToMain?.(model);
    };
}
