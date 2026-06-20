import { useCallback, useEffect, useMemo, useRef } from "react";
import { TreeProviderView, TreeProviderViewRef } from "../../components/tree-provider";
import type { TreeProviderViewSavedState } from "../../components/tree-provider";
import { FileTreeProvider } from "../../content/tree-providers/FileTreeProvider";
import { ContextMenuEvent } from "../../api/events/events";
import { createLinkData } from "../../../shared/link-data";
import { app } from "../../api/app";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { encodePersephoneFolderLink } from "../../content/persephone-folder-link";
import { projectTrust } from "../../api/project-trust";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import type { ExplorerEditor } from "./ExplorerEditorModel";
import { IconButton } from "../../uikit/IconButton";
import {
    CollapseAllIcon,
    FolderUpIcon,
    RefreshIcon,
    SearchIcon,
    CloseIcon,
    BoardIcon,
} from "../../theme/icons";
import { fpBasename, fpDirname, fpJoin } from "../../core/utils/file-path";

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

    // Create (or reveal, if it already exists) a `.persephone` Boards project inside
    // the clicked folder, then select its node so the Board editor opens. No dialog.
    const handleCreateProject = useCallback(async (folderHref: string) => {
        const persephonePath = fpJoin(folderHref, ".persephone");
        try {
            if (!(await fs.exists(persephonePath))) {
                await fs.mkdir(persephonePath);
                // A project the user just created here is implicitly trusted — skip
                // the trust gate. Only on create; a pre-existing project keeps its
                // own trust state (never silently auto-trusted).
                await projectTrust.trust(persephonePath);
            }
        } catch (err) {
            ui.notify(err instanceof Error ? err.message : String(err), "error");
            return;
        }
        // Re-list so the freshly-created `.persephone` node exists in the tree
        // (revealItem alone skips already-loaded folders), then reveal + select it.
        await treeProviderRef.current?.refresh();
        model.setSelectedHref(persephonePath);
        model.revealVersion.update((s) => { s.version++; });
        app.events.openRawLink.sendAsync(
            createLinkData(encodePersephoneFolderLink(persephonePath), { pageId, sourceId: "explorer" }),
        );
    }, [model, pageId]);

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
            event.items.push({
                startGroup: true,
                label: "Create .persephone project",
                icon: <BoardIcon width={14} height={14} />,
                onClick: () => void handleCreateProject(item.href),
            });
        }
    }, [provider, rootPath, model, handleCreateProject]);

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
                name="explorer-collapse-all"
                size="sm"
                title="Collapse All"
                icon={<CollapseAllIcon />}
                onClick={(e) => { e.stopPropagation(); treeProviderRef.current?.collapseAll(); }}
            />
            <IconButton
                name="explorer-refresh"
                size="sm"
                title="Refresh"
                icon={<RefreshIcon />}
                onClick={(e) => { e.stopPropagation(); treeProviderRef.current?.refresh(); }}
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
                initialState={initialState}
                onStateChange={handleStateChange}
            />
        </>
    );
}
