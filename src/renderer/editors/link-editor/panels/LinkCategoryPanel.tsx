import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Panel, Tooltip } from "../../../uikit";
import { highlight } from "../../../uikit/shared/highlight";
import { TreeProviderView } from "../../../components/tree-provider/TreeProviderView";
import { app } from "../../../api/app";
import type { ContextMenuEvent } from "../../../api/events/events";
import { createLinkData } from "../../../../shared/link-data";
import type { ILink } from "../../../api/types/io.tree";
import color from "../../../theme/color";
import type { LinkSource } from "../linkTypes";
import { LinkTooltipContent } from "../LinkTooltip";

// =============================================================================
// Component
// =============================================================================

interface LinkCategoryPanelProps {
    vm: LinkSource;
    /** When true, category clicks go through openRawLink pipeline (Context B).
     *  When false, category clicks filter content directly (Context A). */
    useOpenRawLink: boolean;
    /** When true, shows only category folders. When false, shows categories + links. Default: true. */
    categoriesOnly?: boolean;
    /** Page ID to include in openRawLink metadata (navigates within this page). */
    pageId?: string;
}

export function LinkCategoryPanel({ vm, useOpenRawLink, categoriesOnly = true, pageId }: LinkCategoryPanelProps) {
    const selectedCategory = useSyncExternalStore(
        (cb) => vm.state.subscribe(cb),
        () => vm.state.get().selectedCategory,
    );
    // Derive selected item href from LinkViewModel's selectedLinkId (single source of truth)
    const selectedLinkId = useSyncExternalStore(
        (cb) => vm.state.subscribe(cb),
        () => vm.state.get().selectedLinkId,
    );
    const selectedItemHref = useMemo(() => {
        if (!selectedLinkId) return undefined;
        const link = vm.state.get().data.links.find((l) => l.id === selectedLinkId);
        return link?.href;
    }, [selectedLinkId, vm]);

    const handleItemClick = useCallback((item: ILink) => {
        if (useOpenRawLink) {
            if (item.id) vm.selectLink(item.id);
            const navUrl = vm.treeProvider.getNavigationUrl(item);
            app.events.openRawLink.sendAsync(
                createLinkData(navUrl, {
                    target: item.target || undefined,
                    sourceId: "link-category",
                    category: item.category,
                    ...(pageId ? { pageId, fallbackTarget: "monaco", title: item.title } : undefined),
                }),
            );
        } else {
            vm.setSelectedCategory(item.href);
        }
    }, [vm, useOpenRawLink, pageId]);

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
            return (
                <Tooltip content={<LinkTooltipContent link={item} showCopyJson />} delayShow={1200}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                    </span>
                </Tooltip>
            );
        },
        [],
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
                showLinks={!categoriesOnly}
                selectedHref={categoriesOnly ? selectedCategory : selectedItemHref}
                onItemClick={handleItemClick}
                onContextMenu={!categoriesOnly ? handleContextMenu : undefined}
                getLabel={getTreeItemLabel}
                rootLabel="All"
            />
        </Panel>
    );
}
