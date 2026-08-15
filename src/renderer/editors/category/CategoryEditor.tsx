import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CategoryView } from "../../components/tree-provider/CategoryView";
import type { CategoryViewMode } from "../../components/tree-provider/CategoryViewModel";
import { supportsMultiSelect } from "../../components/tree-provider/plural-actions";
import { PageToolbar } from "../base";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Breadcrumb } from "../../uikit/Breadcrumb";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { encodeCategoryLink } from "../../content/tree-providers/tree-provider-link";
import type { ITreeProvider, ITreeProviderItem, ICategorySegment } from "../../api/types/io.tree";
import { useOptionalState, type TOneState } from "../../core/state/state";
import type { NavigationState } from "../base/navigation-state";
import type { EditorModel } from "../base";
import type { CategoryEditorModel } from "./CategoryEditorModel";
import { LinkEditor } from "../link-editor/LinkEditor";
import { ExplorerEditor } from "../explorer";
import { ArchiveEditor } from "../archive";
import { folderViewModeService } from "./FolderViewModeService";


interface ITreeProviderHost {
    treeProvider: ITreeProvider | null;
    selectionState: TOneState<NavigationState>;
}

function isTreeProviderHost(editor: EditorModel): editor is EditorModel & ITreeProviderHost {
    return (
        editor instanceof LinkEditor ||
        editor instanceof ExplorerEditor ||
        editor instanceof ArchiveEditor
    );
}

function findTreeProviderHost(
    secondaryViews: EditorModel[],
    type: string,
    sourceUrl: string,
): ITreeProviderHost | null {
    for (const editor of secondaryViews) {
        if (!isTreeProviderHost(editor)) continue;
        const tp = editor.treeProvider;
        if (tp && tp.type === type && tp.sourceUrl === sourceUrl) {
            return editor;
        }
    }
    return null;
}

// =============================================================================
// Component
// =============================================================================

export function CategoryEditor({ model }: { model: CategoryEditorModel }) {
    const page = model.page;
    const link = model.decodedLink;
    const categoryPath = model.categoryPath;
    const pageId = model.id;

    // N5 — re-scan when sibling editors join/leave page.editors[]. `page` is
    // nullable on early renders, so use `useOptionalState` (the null-safe hook)
    // rather than a conditional `page.state.use()`. `IPageState.version` bumps
    // on attach / detach / onEditorPanelsChanged / expandPanel.
    const pageVersion = useOptionalState(page?.state, (s) => s.version, 0);

    // Find the matching sibling tree-provider host by provider type + sourceUrl.
    const host = useMemo(() => {
        if (!page || !link) return null;
        return findTreeProviderHost(page.panelEditors, link.type, link.url);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- pageVersion bumps on attach/detach/expandPanel to force re-scan of page.panelEditors
    }, [page, link, pageVersion]);

    const provider = host?.treeProvider ?? null;
    const hostId = host ? (host as unknown as EditorModel).id : undefined;

    // Track selection from the host's selectionState (null-safe — host may be
    // null on some renders, which would break a direct `.use()` hook order).
    const selectedHref = useOptionalState(host?.selectionState, (s) => s.selectedHref, null);

    const [searchPortal, setSearchPortal] = useState<HTMLDivElement | null>(null);
    const [viewMode, setViewMode] = useState<CategoryViewMode>("list");

    // Load persisted view mode for this folder (with inheritance)
    useEffect(() => {
        folderViewModeService.getViewMode(categoryPath).then(setViewMode);
    }, [categoryPath]);

    const handleViewModeChange = useCallback((mode: CategoryViewMode) => {
        setViewMode(mode);
        folderViewModeService.setViewMode(categoryPath, mode);
    }, [categoryPath]);

    const handleSelect = useCallback((item: ITreeProviderItem) => {
        host?.selectionState.update((s) => { s.selectedHref = item.href; });
    }, [host]);

    const handleNavigate = useCallback((item: ITreeProviderItem) => {
        host?.selectionState.update((s) => { s.selectedHref = item.href; });
        const url = provider?.getNavigationUrl(item) ?? item.href;
        app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: hostId }));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- host?.selectionState correlates with hostId (already in deps; hostId is derived from host); narrow deps prevent re-creating the callback on host object identity changes that don't change hostId
    }, [provider, pageId, hostId]);

    // Breadcrumb — segments from root → current folder, computed by the provider.
    const segments = useMemo<ICategorySegment[]>(
        () => (provider ? provider.getCategorySegments(categoryPath) : []),
        [provider, categoryPath],
    );
    const breadcrumbValue = useMemo(
        () => segments.map((s) => s.label).join("/"),
        [segments],
    );

    const handleBreadcrumbChange = useCallback((value: string) => {
        if (!provider) return;
        const count = value ? value.split("/").length : 0;
        // count === 0 → root chip → provider.rootPath; else the matching segment.
        const targetCategory = count === 0 ? provider.rootPath : segments[count - 1].category;
        const url = encodeCategoryLink({
            type: provider.type,
            url: provider.sourceUrl,
            category: targetCategory,
        });
        app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: hostId }));
    }, [provider, segments, pageId, hostId]);

    const renderToolbar = (children?: ReactNode) => (
        <PageToolbar
            name="category-toolbar"
            model={model}
            borderBottom
            rightContributions={children}
        >
            {provider && (
                <Breadcrumb
                    name="category-breadcrumb"
                    rootLabel={provider.displayName}
                    value={breadcrumbValue}
                    onChange={handleBreadcrumbChange}
                    separators="/"
                    size="sm"
                    clipStart
                />
            )}
        </PageToolbar>
    );

    if (!provider) {
        return (
            <Panel name="category-editor-root" direction="column" flex={1} overflow="hidden" background="default">
                {renderToolbar()}
                <Panel padding="xl">
                    <Text color="light">Please select a category in the Navigation Panel.</Text>
                </Panel>
            </Panel>
        );
    }

    return (
        <Panel name="category-editor-root" direction="column" flex={1} overflow="hidden" background="default">
            {renderToolbar(
                <Panel name="category-search-portal" direction="row" align="center" gap="xs" ref={setSearchPortal} />,
            )}
            <CategoryView
                provider={provider}
                category={categoryPath}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                selectedHref={selectedHref}
                // `handleSelect` writes the shared (singular) selectionState, and the model
                // only calls it for a plain click — so building a set with Ctrl/Shift leaves
                // the Explorer tree's highlight where it is.
                multiSelect={supportsMultiSelect(provider)}
                onItemClick={handleSelect}
                onItemDoubleClick={handleNavigate}
                onFolderClick={handleNavigate}
                toolbarPortalRef={searchPortal}
            />
        </Panel>
    );
}
