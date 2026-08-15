import { useCallback, useMemo } from "react";
import { Panel, Tooltip } from "../../../uikit";
import { highlight } from "../../../uikit/shared/highlight";
import { TreeProviderView } from "../../../components/tree-provider";
import type { ContextMenuEvent } from "../../../api/events/events";
import type { ILink } from "../../../api/types/io.tree";
import color from "../../../theme/color";
import type { LinkSource } from "../linkTypes";
import { LinkTooltipContent } from "../LinkTooltip";

// =============================================================================
// Component
// =============================================================================

interface LinkCategoryPanelProps {
    vm: LinkSource;
}

export function LinkCategoryPanel({ vm }: LinkCategoryPanelProps) {
    // Tree selection highlight: a selected link's href wins (the user navigated to a
    // specific link); otherwise the selected category folder is highlighted. Selecting
    // a category clears `selectedLinkId` (see LinkEditor.setSelectedCategory), so the
    // two stay mutually exclusive — last click wins.
    const { selectedLinkId, selectedCategory } = vm.state.use((s) => ({
        selectedLinkId: s.selectedLinkId,
        selectedCategory: s.selectedCategory,
    }));
    const selectedItemHref = useMemo(() => {
        if (selectedLinkId) {
            const link = vm.state.get().data.links.find((l) => l.id === selectedLinkId);
            if (link?.href) return link.href;
        }
        return selectedCategory || undefined;
    }, [selectedLinkId, selectedCategory, vm]);

    // Unified click: a category folder filters the Link main view (promoting
    // the Link editor back to main if a file is currently shown); a link opens
    // its file in the main view via the openRawLink pipeline.
    const handleItemClick = useCallback((item: ILink) => {
        if (item.isDirectory) {
            vm.setSelectedCategory(item.href);
            if (!vm.isMain) vm.page?.promoteSecondaryToMain?.(vm);
        } else {
            vm.openLinkFromPanel(item, "link-category");
        }
    }, [vm]);

    const handleContextMenu = useCallback((event: ContextMenuEvent<ILink>) => {
        const item = event.target;
        if (!item || item.isDirectory) return;
        // Add "Edit Link" at the beginning of the menu
        event.items.unshift({
            label: "Edit Link",
            onClick: () => vm.showLinkDialog(item.id),
        });
    }, [vm]);

    const getTreeItemLabel = useCallback(
        (item: ILink, searchText: string) => {
            const labelText = item.title || "All";
            const label = searchText ? highlight(item.title, searchText) : labelText;
            if (item.isDirectory) {
                // TreeItem renders this inside <span className="label"> with `flex: 1 1 auto`
                // but plain content laid out as inline. Wrap in a flex row so the count
                // sits flush against the right edge of the row.
                return (
                    <span style={{ display: "flex", alignItems: "center", width: "100%", minWidth: 0 }}>
                        <span
                            style={{
                                flex: "1 1 auto",
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {label}
                        </span>
                        {item.size !== undefined && (
                            <span
                                style={{
                                    marginLeft: 8,
                                    fontSize: 12,
                                    flexShrink: 0,
                                    color: color.text.light,
                                }}
                            >
                                {item.size}
                            </span>
                        )}
                    </span>
                );
            }
            // The tree row itself carries a path tooltip (TreeItem `tooltip` prop). This
            // richer tooltip lives on the nested label span — the tooltip singleton's
            // "innermost wins" rule lets it beat the row's path tooltip, so only this one
            // shows. Match the row tooltip's default delay so the swap is flash-free.
            return (
                <Tooltip content={<LinkTooltipContent link={item} showCopyJson imageProxy={vm.imageProxy} />}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                    </span>
                </Tooltip>
            );
        },
        [vm],
    );

    return (
        <Panel
            name="link-category-panel"
            direction="column"
            flex={1}
            height={0}
            overflow="hidden"
        >
            <TreeProviderView
                provider={vm.treeProvider}
                showLinks={true}
                selectedHref={selectedItemHref}
                onItemClick={handleItemClick}
                onContextMenu={handleContextMenu}
                getLabel={getTreeItemLabel}
                rootLabel="All"
            />
        </Panel>
    );
}
