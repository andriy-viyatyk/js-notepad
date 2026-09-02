import type { ILink } from "../../../api/types/io.tree";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../../ui/secondary-views/SideBarPanelHeaderView";
import type { GridModelCapability } from "../../../uikit/DataGrid";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../../uikit/Panel/panel-style";
import { SplitterView } from "../../../uikit/Splitter/SplitterView";
import type { SplitterProps } from "../../../uikit/Splitter/SplitterView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { LinksListView } from "../LinksListView";
import type { LinksListProps } from "../LinksList";
import { LinkEditor } from "../LinkEditor";
import { LinkTagsPanelView } from "./LinkTagsPanel";
import "../../../uikit/Panel/Panel.css";
import "../../../uikit/Splitter/Splitter.css";

interface NavigationState {
    selectedTag: string;
    links: ILink[];
    selectedLinkId: string;
    allTags: string[];
    tags: string[];
}

export class LinkTagsNavigationPanelView extends VanillaView<LinkEditor> {
    private readonly topPanel: HTMLDivElement;
    private categoryPanel: LinkTagsPanelView | undefined;
    private splitter: SplitterView | undefined;
    private bottomPanel: HTMLDivElement | undefined;
    private linksList: LinksListView | undefined;
    private gridModel: GridModelCapability | undefined;
    private bottomHeight: number | undefined;
    private editorBinding: (() => void) | undefined;
    private boundEditor: LinkEditor | undefined;

    public constructor(editor: LinkEditor) {
        super(editor, createPanelElement({
            name: "link-tags-navigation",
            direction: "column",
            flex: 1,
            overflow: "hidden",
            width: "100%",
        }));
        this.topPanel = createPanelElement({
            name: "link-tags-navigation-top",
            direction: "column",
            flex: 1,
            overflow: "hidden",
            minHeight: 40,
        });
    }

    protected onMount(): void {
        this.categoryPanel = this.child(new LinkTagsPanelView({ vm: this.props }));
        this.topPanel.append(this.categoryPanel.root);
        this.root.append(this.topPanel);
        this.categoryPanel.mount();

        this.bindEditorState(this.props);

        this.seedDefaultSplit();
    }

    protected onUpdate(editor: LinkEditor): void {
        if (editor !== this.boundEditor) this.bindEditorState(editor);
        this.categoryPanel?.update({ vm: editor });
        this.applyState(this.snapshot(editor));
    }

    private bindEditorState(editor: LinkEditor): void {
        this.editorBinding?.();
        this.boundEditor = editor;
        this.editorBinding = this.bind(
            editor.state,
            (state) => ({
                selectedTag: state.selectedTag,
                links: state.data.links,
                selectedLinkId: state.selectedLinkId,
                allTags: state.tags,
                tags: state.tags,
            }),
            (state) => {
                if (this.boundEditor !== editor) return;
                this.applyState(state);
            },
        );
    }

    protected onDispose(): void {
        this.gridModel = undefined;
    }

    private snapshot(editor: LinkEditor): NavigationState {
        const state = editor.state.get();
        return {
            selectedTag: state.selectedTag,
            links: state.data.links,
            selectedLinkId: state.selectedLinkId,
            allTags: state.tags,
            tags: state.tags,
        };
    }

    private readonly applyState = (state: NavigationState): void => {
        const items = state.selectedTag
            ? this.props.treeProvider?.getTagItems(state.selectedTag)?.filter((item) => !item.isDirectory) ?? []
            : state.links.filter((item) => !item.isDirectory);
        this.syncBottom(items, state.selectedLinkId, state.allTags);
        this.scrollSelected(items, state.selectedLinkId);
    };

    private syncBottom(items: ILink[], selectedLinkId: string, allTags: string[]): void {
        if (items.length === 0) {
            this.removeBottom();
            return;
        }

        const height = this.bottomHeight ?? 150;
        if (!this.linksList) {
            this.splitter = this.child(new SplitterView(this.splitterProps(height)));
            this.bottomPanel = createPanelElement({
                name: "link-tags-navigation-bottom",
                direction: "column",
                overflow: "hidden",
                shrink: false,
                height,
            });
            this.linksList = this.child(new LinksListView(this.linksListProps(items, selectedLinkId, allTags)));
            this.root.append(this.splitter.root, this.bottomPanel);
            this.bottomPanel.append(this.linksList.root);
            this.splitter.mount();
            this.linksList.mount();
            return;
        }

        this.applyBottomHeight(height);
        this.splitter?.update(this.splitterProps(height));
        this.linksList.update(this.linksListProps(items, selectedLinkId, allTags));
    }

    private removeBottom(): void {
        if (this.linksList) {
            this.releaseChild(this.linksList);
            this.linksList = undefined;
        }
        if (this.splitter) {
            this.releaseChild(this.splitter);
            this.splitter = undefined;
        }
        this.bottomPanel?.remove();
        this.bottomPanel = undefined;
        this.gridModel = undefined;
    }

    private linksListProps(items: ILink[], selectedLinkId: string, allTags: string[]): LinksListProps {
        return {
            links: items,
            selectedId: selectedLinkId || undefined,
            onSelect: this.handleSelect,
            onDoubleClick: this.handleSelect,
            allTags,
            onToggleTag: this.handleToggleTag,
            onGridModel: (grid) => {
                this.gridModel = grid ?? undefined;
                this.scrollSelected(items, selectedLinkId);
            },
        };
    }

    private splitterProps(value: number): SplitterProps {
        return {
            name: "link-tags-bottom-splitter",
            orientation: "horizontal",
            value,
            onChange: this.handleChangeHeight,
            side: "after",
            border: "before",
        };
    }

    private readonly handleSelect = (item: ILink): void => {
        this.props.openLinkFromPanel(item, "link-tag");
    };

    private readonly handleToggleTag = (item: ILink, tag: string): void => {
        if (!item.id) return;
        const current = item.tags ?? [];
        const tags = current.includes(tag)
            ? current.filter((value) => value !== tag)
            : [...current, tag];
        this.props.updateLink(item.id, { tags });
    };

    private readonly handleChangeHeight = (height: number): void => {
        const maxHeight = this.root.clientHeight * 0.8;
        this.bottomHeight = Math.max(40, Math.min(height, maxHeight));
        this.applyBottomHeight(this.bottomHeight);
        this.splitter?.update(this.splitterProps(this.bottomHeight));
    };

    private applyBottomHeight(height: number): void {
        if (!this.bottomPanel) return;
        applyPanelAttributes(this.bottomPanel, resolvePanelAttributes({
            name: "link-tags-navigation-bottom",
            direction: "column",
            overflow: "hidden",
            shrink: false,
            height,
        }));
    }

    /** Seed the bottom-panel default from the settled panel height, once. */
    private seedDefaultSplit(): void {
        this.schedule.settledLayout(this.root, () => {
            const height = this.root.clientHeight;
            if (height <= 0 || this.bottomHeight !== undefined) return;
            this.bottomHeight = Math.max(40, height * 0.5);
            this.applyBottomHeight(this.bottomHeight);
            this.splitter?.update(this.splitterProps(this.bottomHeight));
        });
    }

    private scrollSelected(items: ILink[], selectedLinkId: string): void {
        if (!selectedLinkId || !this.gridModel) return;
        const row = items.findIndex((item) => (item.id ?? item.href) === selectedLinkId);
        if (row >= 0) void this.gridModel.scrollToRow(row, "nearest");
    }
}

export default class LinkTagsSecondaryView extends VanillaView<SecondaryViewProps> {
    private editor: LinkEditor | undefined;
    private navigation: LinkTagsNavigationPanelView | undefined;
    private header: SideBarPanelHeaderHandle | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "link-tags-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        }));
    }

    protected onMount(): void {
        if (!(this.props.model instanceof LinkEditor)) return;
        this.editor = this.props.model;
        this.navigation = this.child(new LinkTagsNavigationPanelView(this.editor));
        this.root.append(this.navigation.root);
        this.navigation.mount();
        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Tags",
        });
        this.own(() => this.header?.dispose());
        this.updateHeader();
    }

    protected onUpdate(props: SecondaryViewProps): void {
        if (props.model instanceof LinkEditor) {
            this.editor = props.model;
            this.navigation?.update(props.model);
        }
        this.updateHeader();
    }

    protected onDispose(): void {
        this.navigation = undefined;
        this.header = undefined;
        this.editor = undefined;
    }

    private updateHeader(): void {
        this.header?.update({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Tags",
        });
    }
}
