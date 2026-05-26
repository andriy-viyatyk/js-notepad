import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CategoryView } from "../../components/tree-provider/CategoryView";
import type { CategoryViewMode } from "../../components/tree-provider/CategoryViewModel";
import { PageToolbar } from "../base/v4";
import { EditorToolbar } from "../base/EditorToolbar";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { app } from "../../api/app";
import { pagesModel } from "../../api/pages";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProvider, ITreeProviderItem } from "../../api/types/io.tree";
import type { TOneState } from "../../core/state/state";
import type { NavigationState } from "../../api/pages/PageModel";
import type { EditorModel } from "../base";
import type { CategoryEditorModel } from "./CategoryEditorModel";
import type { EditorModule } from "../types";
import type { EditorType, IEditorState } from "../../../shared/types";
import { LinkEditor } from "../link-editor/LinkEditor";
import { ExplorerEditor } from "../explorer";
import { ArchiveEditor } from "../archive";
import { folderViewModeService } from "./FolderViewModeService";

// =============================================================================
// ITreeProviderHost — typed accessor for secondary editors that expose a tree
// provider. EPIC-028 / US-570 — EX8 `instanceof` chain COMPLETE. All three
// tree-provider hosts (LinkEditor + ExplorerEditor + ArchiveEditor) match by
// `instanceof`; no duck-typing remains. US-567 EX-IMPL2 left Archive on the
// duck-type fallback until this migration landed.
// =============================================================================

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
    secondaryEditors: EditorModel[],
    type: string,
    sourceUrl: string,
): ITreeProviderHost | null {
    for (const editor of secondaryEditors) {
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

    // Subscribe to model state to detect providerVersion changes
    model.state.use();

    // Find the matching secondary editor by provider type + sourceUrl
    const host = useMemo(() => {
        if (!page || !link) return null;
        return findTreeProviderHost(page.secondaryEditors, link.type, link.url);
    }, [page, link, model.providerVersion]);

    const provider = host?.treeProvider ?? null;
    const hostId = host ? (host as unknown as EditorModel).id : undefined;

    // Track selection from the host's selectionState via manual subscription
    // (can't use .use() directly — host may be null on some renders, violating hook call order)
    const [selectedHref, setSelectedHref] = useState<string | null>(null);
    useEffect(() => {
        if (!host) { setSelectedHref(null); return; }
        const sel = host.selectionState;
        setSelectedHref(sel.get().selectedHref);
        return sel.subscribe(() => setSelectedHref(sel.get().selectedHref));
    }, [host]);

    const [searchPortal, setSearchPortal] = useState<HTMLDivElement | null>(null);
    const [viewMode, setViewMode] = useState<CategoryViewMode>("list");

    // Load persisted view mode for this folder (with inheritance)
    useEffect(() => {
        folderViewModeService.getViewMode(categoryPath).then(setViewMode);
    }, [categoryPath]);

    // Retry provider resolution after mount (secondary editors may restore asynchronously)
    useEffect(() => {
        if (!provider && link) {
            const timer = setTimeout(() => model.onSecondaryEditorsChanged(), 50);
            return () => clearTimeout(timer);
        }
    }, [provider, link, model]);

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
    }, [provider, pageId, hostId]);

    const v4Main = pagesModel.findPage(model.id)?.mainEditorV4 ?? null;
    const renderToolbar = (children?: ReactNode) =>
        v4Main ? (
            <PageToolbar
                name="category-toolbar"
                model={v4Main}
                borderBottom
                rightContributions={children}
            />
        ) : (
            <EditorToolbar borderBottom>{children}</EditorToolbar>
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
                onItemClick={handleSelect}
                onItemDoubleClick={handleNavigate}
                onFolderClick={handleNavigate}
                toolbarPortalRef={searchPortal}
            />
        </Panel>
    );
}

const categoryEditorModule: EditorModule = {
    Editor: CategoryEditor,
    newEditorModel: async (filePath?: string) => {
        const { CategoryEditorModel } = await import("./CategoryEditorModel");
        const { decodeCategoryLink } = await import("../../content/tree-providers/tree-provider-link");
        const model = new CategoryEditorModel();
        if (filePath) {
            const link = decodeCategoryLink(filePath);
            if (link) model.initFromLink(link);
        }
        return model;
    },
    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "categoryPage") return null;
        const { CategoryEditorModel } = await import("./CategoryEditorModel");
        return new CategoryEditorModel();
    },
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const { CategoryEditorModel } = await import("./CategoryEditorModel");
        const model = new CategoryEditorModel();
        model.applyRestoreData(state as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        return model;
    },
};

export default categoryEditorModule;
