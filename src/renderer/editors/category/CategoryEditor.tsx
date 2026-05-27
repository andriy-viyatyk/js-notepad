import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CategoryView } from "../../components/tree-provider/CategoryView";
import type { CategoryViewMode } from "../../components/tree-provider/CategoryViewModel";
import { PageToolbar } from "../base/v4";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProvider, ITreeProviderItem } from "../../api/types/io.tree";
import { TComponentState, useOptionalState, type TOneState } from "../../core/state/state";
import type { NavigationState } from "../../api/pages/PageModel";
import type { EditorModel } from "../base";
import type { CategoryEditorModel, CategoryEditorModelState } from "./CategoryEditorModel";
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

    // N5 — re-scan when sibling editors join/leave page.editors[]. `page` is
    // nullable on early renders, so use `useOptionalState` (the null-safe hook)
    // rather than a conditional `page.state.use()`. `IPageState.version` bumps
    // on attach / detach / onEditorPanelsChanged / expandPanel.
    const pageVersion = useOptionalState(page?.state, (s) => s.version, 0);

    // Find the matching sibling tree-provider host by provider type + sourceUrl.
    const host = useMemo(() => {
        if (!page || !link) return null;
        return findTreeProviderHost(page.panelEditors, link.type, link.url);
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
    }, [provider, pageId, hostId]);

    // Post-migration `model` IS the v4 CategoryEditorModel — render PageToolbar
    // directly (retires the v4Main strangler lookup; CT-IMPL4).
    const renderToolbar = (children?: ReactNode) => (
        <PageToolbar
            name="category-toolbar"
            model={model}
            borderBottom
            rightContributions={children}
        />
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

// ============================================================================
// Editor Module
// ============================================================================
// EPIC-028 / US-576 — legacy EditorModule shape preserved for the open-file
// flow (`tree-category://` links → target="category-view" →
// `newEditorModelByTarget` → this module's `newEditorModel`). The
// `as unknown as EditorModel` casts bridge the v4 CategoryEditorModel class to
// the legacy EditorModel typing the legacy factories expect; the runtime
// instance is the v4 class either way. `wrapLegacyForPage`'s
// `instanceof V4EditorModel` early-return (US-568 PD-IMPL16) detects the v4
// instance and skips the adapter wrap. US-559 retires this block entirely.

const categoryEditorModule: EditorModule = {
    Editor: CategoryEditor as unknown as EditorModule["Editor"],

    newEditorModel: async (filePath?: string) => {
        const { CategoryEditorModel } = await import("./CategoryEditorModel");
        const { decodeCategoryLink } = await import("../../content/tree-providers/tree-provider-link");
        const model = new CategoryEditorModel();
        if (filePath) {
            const link = decodeCategoryLink(filePath);
            if (link) model.initFromLink(link);
        }
        return model as unknown as EditorModel;
    },

    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "categoryPage") return null;
        const { CategoryEditorModel } = await import("./CategoryEditorModel");
        return new CategoryEditorModel() as unknown as EditorModel;
    },

    // Seed state via the constructor — the v4 base `applyRestoreData` is a no-op
    // (the legacy path used it to set filePath). Dead on the v4 restore path
    // (`category-view` ∈ V4_NO_HOST_EDITOR_IDS → generic Object.assign branch);
    // kept correct for contract completeness.
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const { CategoryEditorModel, getDefaultCategoryEditorModelState } =
            await import("./CategoryEditorModel");
        return new CategoryEditorModel(new TComponentState({
            ...getDefaultCategoryEditorModelState(),
            ...(state as Partial<CategoryEditorModelState>),
        })) as unknown as EditorModel;
    },
};

export default categoryEditorModule;
