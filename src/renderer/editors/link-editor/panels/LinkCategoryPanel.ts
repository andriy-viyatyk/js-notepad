import type { ITreeProviderItem } from "../../../api/types/io.tree";
import type { ContextMenuEvent } from "../../../api/events/events";
import type { SlotText } from "../../../uikit/shared/slots";
import { TreeProviderViewImpl } from "../../../components/tree-provider/TreeProviderViewImpl";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import "../../../uikit/Panel/Panel.css";
import { createTextElement } from "../../../uikit/Text/text-style";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { LinkEditor } from "../LinkEditor";
import { createLinkTooltipContent } from "../LinkTooltipView";

export interface LinkCategoryPanelProps {
    vm: LinkEditor;
}

function selectedHref(editor: LinkEditor): string | undefined {
    const state = editor.state.get();
    if (state.selectedLinkId) {
        const link = state.data.links.find((item) => item.id === state.selectedLinkId);
        if (link?.href) return link.href;
    }
    return state.selectedCategory || undefined;
}

export class LinkCategoryPanelView extends VanillaView<LinkCategoryPanelProps> {
    private treeProviderView: TreeProviderViewImpl | undefined;

    public constructor(props: LinkCategoryPanelProps) {
        super(props, createPanelElement({
            name: "link-category-panel",
            direction: "column",
            flex: 1,
            height: 0,
            overflow: "hidden",
        }));
    }

    protected onMount(): void {
        const provider = this.props.vm.treeProvider;
        if (!provider) return;

        const treeProviderView = this.child(new TreeProviderViewImpl(this.treeProps(provider)));
        this.treeProviderView = treeProviderView;
        this.root.append(treeProviderView.root);
        treeProviderView.mount();

        this.bind(
            this.props.vm.state,
            (state) => ({
                selectedLinkId: state.selectedLinkId,
                selectedCategory: state.selectedCategory,
                links: state.data.links,
            }),
            this.updateTreeSelection,
        );
    }

    protected onUpdate(props: LinkCategoryPanelProps): void {
        const provider = props.vm.treeProvider;
        if (provider) this.treeProviderView?.update(this.treeProps(provider));
    }

    private treeProps(provider: LinkEditor["treeProvider"]): ConstructorParameters<typeof TreeProviderViewImpl>[0] {
        if (!provider) throw new Error("Link category tree provider is unavailable.");

        const editor = this.props.vm;
        return {
            provider,
            showLinks: true,
            selectedHref: selectedHref(editor),
            onItemClick: this.onItemClick,
            onContextMenu: this.onContextMenu,
            // `createLinkTooltipContent` returns a DOM node, but this whole chain is typed
            // `SlotText` (`string | React.ReactNode`) — TreeProviderViewModel.getTooltip, Tree's
            // own getTooltip, and TreeItemView all declare it — while `fillSlot` underneath has
            // accepted `Node` since Epic B. Widening it is a 15-declaration change across `uikit/`
            // and two unconverted editors, deliberately out of EPIC-071's scope and recorded in
            // its §E13-11 for a later epic. The cast is the documented symptom of that gap, not a
            // silenced disagreement: the sibling `renderTrailing` one line above this type already
            // carries the `| Node` arm that this member is missing.
            getTooltip: (item: ITreeProviderItem) => (item.isDirectory
                ? item.href
                : createLinkTooltipContent({
                    link: item,
                    showCopyJson: true,
                    imageProxy: editor.imageProxy,
                })) as unknown as SlotText,
            renderTrailing: (item: ITreeProviderItem) => item.isDirectory && item.size !== undefined
                ? createTextElement(String(item.size), { color: "light", size: "sm" })
                : null,
            rootLabel: "All",
        };
    }

    private readonly onItemClick = (item: ITreeProviderItem): void => {
        const editor = this.props.vm;
        if (item.isDirectory) {
            editor.setSelectedCategory(item.href);
            if (!editor.isMain) editor.page?.promoteSecondaryToMain?.(editor);
        } else {
            editor.openLinkFromPanel(item, "link-category");
        }
    };

    private readonly onContextMenu = (
        event: ContextMenuEvent<ITreeProviderItem>,
        _selection: ITreeProviderItem[],
    ): void => {
        const item = event.target;
        if (!item || item.isDirectory) return;
        event.items.unshift({
            label: "Edit Link",
            onClick: () => this.props.vm.showLinkDialog(item.id),
        });
    };

    private readonly updateTreeSelection = (): void => {
        const tree = this.treeProviderView;
        const provider = this.props.vm.treeProvider;
        if (!tree || !provider) return;
        tree.update({
            ...this.treeProps(provider),
            selectedHref: selectedHref(this.props.vm),
        });
    };
}

export const LinkCategoryPanel = LinkCategoryPanelView;
