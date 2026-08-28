import type { ILink } from "../../../api/types/io.tree";
import type { GridModelCapability } from "../../../uikit/VirtualGrid";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../../uikit/Panel/panel-style";
import "../../../uikit/Panel/Panel.css";
import "../../../uikit/Splitter/Splitter.css";
import { SplitterView } from "../../../uikit/Splitter/SplitterView";
import type { SplitterProps } from "../../../uikit/Splitter/SplitterView";
import { CategoryListView } from "../../../uikit/CategoryList/CategoryListView";
import type { CategoryListProps } from "../../../uikit/CategoryList/CategoryList";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { LinksListView } from "../LinksListView";
import type { LinksListProps } from "../LinksList";
import { LinkEditor } from "../LinkEditor";

interface NavigationState {
    selectedHostname: string;
    links: ILink[];
    selectedLinkId: string;
    allTags: string[];
    hostnames: string[];
}

export default class LinkHostnamesNavigationPanelView extends VanillaView<LinkEditor> {
    private readonly topPanel: HTMLDivElement;
    private categoryList: CategoryListView | undefined;
    private splitter: SplitterView | undefined;
    private bottomPanel: HTMLDivElement | undefined;
    private linksList: LinksListView | undefined;
    private gridModel: GridModelCapability | undefined;
    private bottomHeight: number | undefined;
    private resizeObserver: ResizeObserver | undefined;
    private resizeTimer: ReturnType<typeof setTimeout> | undefined;

    public constructor(editor: LinkEditor) {
        super(editor, createPanelElement({
            name: "link-hostnames-navigation",
            direction: "column",
            flex: 1,
            overflow: "hidden",
            width: "100%",
        }));
        this.topPanel = createPanelElement({
            name: "link-hostnames-navigation-top",
            direction: "column",
            flex: 1,
            overflow: "hidden",
            minHeight: 40,
        });
    }

    protected onMount(): void {
        this.categoryList = this.child(new CategoryListView(this.categoryProps()));
        this.topPanel.append(this.categoryList.root);
        this.root.append(this.topPanel);
        this.categoryList.mount();
        this.bind(
            this.props.state,
            (state) => ({
                selectedHostname: state.selectedHostname,
                links: state.data.links,
                selectedLinkId: state.selectedLinkId,
                allTags: state.tags,
                hostnames: state.hostnames,
            }),
            this.applyState,
        );
        this.installResizeObserver();
    }

    protected onUpdate(editor: LinkEditor): void {
        this.categoryList?.update(this.categoryProps());
        this.applyState(this.snapshot(editor));
    }

    protected onDispose(): void {
        if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
        this.resizeObserver?.disconnect();
        this.resizeTimer = undefined;
        this.resizeObserver = undefined;
        this.gridModel = undefined;
    }

    private categoryProps(): CategoryListProps {
        const state = this.props.state.get();
        return {
            name: "link-hostnames",
            items: state.hostnames,
            value: state.selectedHostname,
            onChange: this.props.setSelectedHostname,
            getCount: this.props.getHostnameCount,
            separator: "\0",
            rootLabel: "All",
        };
    }

    private snapshot(editor: LinkEditor): NavigationState {
        const state = editor.state.get();
        return {
            selectedHostname: state.selectedHostname,
            links: state.data.links,
            selectedLinkId: state.selectedLinkId,
            allTags: state.tags,
            hostnames: state.hostnames,
        };
    }

    private readonly applyState = (state: NavigationState): void => {
        const items = state.selectedHostname
            ? this.props.treeProvider?.getHostnameItems(state.selectedHostname)?.filter((item) => !item.isDirectory) ?? []
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
                name: "link-hostnames-navigation-bottom",
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
            name: "link-hostnames-bottom-splitter",
            orientation: "horizontal",
            value,
            onChange: this.handleChangeHeight,
            side: "after",
            border: "before",
        };
    }

    private readonly handleSelect = (item: ILink): void => {
        this.props.openLinkFromPanel(item, "link-hostname");
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
            name: "link-hostnames-navigation-bottom",
            direction: "column",
            overflow: "hidden",
            shrink: false,
            height,
        }));
    }

    private installResizeObserver(): void {
        const element = this.root;
        const observer = new ResizeObserver(() => {
            if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.resizeTimer = undefined;
                const height = element.clientHeight;
                if (height <= 0 || this.bottomHeight !== undefined) return;
                this.bottomHeight = Math.max(40, height * 0.5);
                this.applyBottomHeight(this.bottomHeight);
                this.splitter?.update(this.splitterProps(this.bottomHeight));
                observer.disconnect();
                this.resizeObserver = undefined;
            }, 200);
        });
        observer.observe(element);
        this.resizeObserver = observer;
        this.own(() => {
            if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
            observer.disconnect();
        });
    }

    private scrollSelected(items: ILink[], selectedLinkId: string): void {
        if (!selectedLinkId || !this.gridModel) return;
        const row = items.findIndex((item) => (item.id ?? item.href) === selectedLinkId);
        if (row >= 0) void this.gridModel.scrollToRow(row, "nearest");
    }
}

export { LinkHostnamesNavigationPanelView as LinkHostnamesNavigationPanel };
