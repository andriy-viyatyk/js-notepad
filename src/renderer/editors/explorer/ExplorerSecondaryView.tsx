import { useCallback, useEffect, useMemo, useRef } from "react";
import { TreeProviderView, TreeProviderViewRef } from "../../components/tree-provider";
import type { TreeProviderViewSavedState } from "../../components/tree-provider";
import { FileTreeProvider } from "../../content/tree-providers/FileTreeProvider";
import { ContextMenuEvent } from "../../api/events/events";
import { createLinkData } from "../../../shared/link-data";
import { app } from "../../api/app";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { BOARD_MANIFEST_FILE } from "../board/board-manifest";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import type { ExplorerEditor } from "./ExplorerEditorModel";
import { IconButton } from "../../uikit/IconButton";
import {
    CollapseAllIcon,
    FolderUpIcon,
    SearchIcon,
    CloseIcon,
    BoardIcon,
} from "../../theme/icons";
import { fpBasename, fpDirname } from "../../core/utils/file-path";

export default function ExplorerSecondaryView({ model: rawModel, headerRef, icon }: SecondaryViewProps) {
    const model = rawModel as ExplorerEditor;
    const { rootPath } = model.state.use();
    const treeProviderRef = useRef<TreeProviderViewRef>(null);

    // Create/update FileTreeProvider
    const provider = useMemo(() => {
        if (!rootPath) return null;
        if (model.treeProvider && (model.treeProvider as FileTreeProvider).sourceUrl !== rootPath) {
            model.treeProvider.dispose?.();
            model.treeProvider = null;
        }
        if (!model.treeProvider) {
            model.treeProvider = new FileTreeProvider(rootPath);
        }
        return model.treeProvider;
    }, [rootPath, model]);

    const initialState = useMemo((): TreeProviderViewSavedState | undefined => {
        return model.treeState;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const { selectedHref } = model.selectionState.use();
    const { version: revealVersion } = model.revealVersion.use();

    useEffect(() => {
        if (revealVersion > 0 && selectedHref) {
            treeProviderRef.current?.revealItem(selectedHref);
        }
    }, [revealVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    const pageId = model.page?.id ?? "";

    const handleItemClick = useCallback((item: ITreeProviderItem) => {
        const current = model.selectionState.get().selectedHref;
        if (current?.toLowerCase() === item.href.toLowerCase()) return;
        model.setSelectedHref(item.href);
        const url = model.treeProvider?.getNavigationUrl(item) ?? item.href;
        app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: "explorer" }));
    }, [pageId, model]);

    // Per-row trailing action: on a `board-manifest.json` file row, an always-visible
    // "Open Board" button that opens the board (single-board mode) via persephone-board://.
    // The row's own click still opens the JSON in Monaco — the button stops propagation so
    // the row click never fires. Trust is handled in-view (UntrustedBoardView) for foreign
    // boards; the button only fires the link.
    const renderBoardButton = useCallback((item: ITreeProviderItem) => {
        if (item.isDirectory) return null;
        if (fpBasename(item.href).toLowerCase() !== BOARD_MANIFEST_FILE) return null;
        return (
            <IconButton
                name="explorer-open-board"
                size="sm"
                title="Open Board"
                icon={<BoardIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    const boardRoot = fpDirname(item.href);
                    app.events.openRawLink.sendAsync(
                        createLinkData(encodePersephoneBoardLink(boardRoot), {
                            pageId,
                            sourceId: "explorer",
                            // Scope the opened board's in-board switcher to the Explorer root (US-763).
                            explorerRoot: rootPath,
                        }),
                    );
                }}
            />
        );
    }, [pageId, rootPath]);

    const handleStateChange = useCallback((state: TreeProviderViewSavedState) => {
        model.setTreeState(state);
    }, [model]);

    const handleContextMenu = useCallback((event: ContextMenuEvent<ITreeProviderItem>) => {
        const item = event.target;
        if (item?.isDirectory && provider?.navigable) {
            const rootLower = rootPath.toLowerCase();
            if (item.href.toLowerCase() !== rootLower) {
                event.items.push({
                    startGroup: true,
                    label: "Make Root",
                    onClick: () => model.makeRoot(item.href),
                });
            }
            event.items.push({
                label: "Search in Folder",
                icon: <SearchIcon width={14} height={14} />,
                onClick: () => model.openSearch(item.href),
            });
        }
    }, [provider, rootPath, model]);

    // ── Header action buttons (rendered by SideBarPanelHeader) ───────

    const parentPath = fpDirname(rootPath);
    const canNavigateUp = parentPath !== rootPath && rootPath !== "";

    const actions = (
        <>
            {provider?.navigable && (
                <IconButton
                    name="explorer-up"
                    size="sm"
                    title={canNavigateUp ? `Up to ${fpBasename(parentPath)}` : "Already at root"}
                    disabled={!canNavigateUp}
                    icon={<FolderUpIcon />}
                    onClick={(e) => { e.stopPropagation(); model.navigateUp(); }}
                />
            )}
            <IconButton
                name="explorer-search"
                size="sm"
                title="Search"
                icon={<SearchIcon />}
                onClick={(e) => { e.stopPropagation(); model.openSearch(); }}
            />
            <IconButton
                name="explorer-boards"
                size="sm"
                title="Boards"
                icon={<BoardIcon />}
                onClick={(e) => { e.stopPropagation(); model.openBoards(); }}
            />
            <IconButton
                name="explorer-collapse-all"
                size="sm"
                title="Collapse All"
                icon={<CollapseAllIcon />}
                onClick={(e) => { e.stopPropagation(); treeProviderRef.current?.collapseAll(); }}
            />
            {!model.page?.sidebarMandatory && (
                <IconButton
                    name="explorer-close"
                    size="sm"
                    title="Close Panel"
                    icon={<CloseIcon />}
                    onClick={(e) => { e.stopPropagation(); model.page?.setSecondaryViewsState({ open: false }); }}
                />
            )}
        </>
    );

    if (!provider) return null;

    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Explorer" actions={actions} />
            <TreeProviderView
                ref={treeProviderRef}
                key={rootPath}
                provider={provider}
                selectedHref={selectedHref ?? undefined}
                onItemClick={handleItemClick}
                onItemDoubleClick={handleItemClick}
                onContextMenu={handleContextMenu}
                renderTrailing={renderBoardButton}
                initialState={initialState}
                onStateChange={handleStateChange}
            />
        </>
    );
}
