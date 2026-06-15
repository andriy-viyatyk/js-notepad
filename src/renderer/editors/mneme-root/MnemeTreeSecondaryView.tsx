import { useCallback, useState } from "react";
import { TreeProviderView } from "../../components/tree-provider";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import { IconButton } from "../../uikit/IconButton";
import { Tag } from "../../uikit/Tag";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { CloseIcon, ChevronRightIcon } from "../../theme/icons";
import { useOptionalState } from "../../core/state/state";
import type { MnemeRootEditorModel } from "./MnemeRootEditorModel";

export default function MnemeTreeSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    const mnemeModel = model as MnemeRootEditorModel;
    const { rootName, rootFolder, resolving, error } = mnemeModel.state.use((s) => ({
        rootName: s.rootName,
        rootFolder: s.rootFolder,
        resolving: s.resolving,
        error: s.error,
    }));
    const [selectedHref, setSelectedHref] = useState<string | undefined>(undefined);
    const provider = mnemeModel.treeProvider;

    // Subscribe to page.state so the chevron hides/shows when this editor is
    // promoted to / demoted from the page's main view (mirrors the Collections
    // panel's show-main control — see LinkCategorySecondaryView).
    const isMainEditor = useOptionalState(mnemeModel.page?.state, () => mnemeModel.isMain, false);

    // The tree live-refreshes on add/remove/rename via the provider's `watch()`
    // (resources/list_changed), wired automatically by TreeProviderViewModel.

    const handleItemClick = useCallback((item: ITreeProviderItem) => {
        // Folders expand in place (handled by the tree); only files open.
        if (item.isDirectory) return;
        setSelectedHref(item.href);
        const url = provider?.getNavigationUrl(item);
        if (!url) return;
        app.events.openRawLink.sendAsync(
            createLinkData(url, { pageId: mnemeModel.page?.id, sourceId: mnemeModel.id }),
        );
    }, [provider, mnemeModel]);

    const actions = (
        <>
            {!isMainEditor && (
                <IconButton
                    name="mneme-tree-show-main"
                    size="sm"
                    title="Open Mneme search"
                    icon={<ChevronRightIcon width={14} height={14} />}
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        void mnemeModel.page?.promoteSecondaryToMain?.(mnemeModel);
                    }}
                />
            )}
            <IconButton
                name="mneme-tree-close"
                size="sm"
                title="Close"
                icon={<CloseIcon />}
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    void mnemeModel.requestClose();
                }}
            />
        </>
    );

    return (
        <>
            <SideBarPanelHeader
                headerRef={headerRef}
                icon={icon}
                badge={rootName ? (
                    <Tag
                        name="mneme-root-name"
                        variant="outlined"
                        size="sm"
                        truncate
                        label={rootName}
                        title={rootFolder}
                    />
                ) : undefined}
                title="Wiki"
                actions={actions}
            />
            {provider ? (
                <TreeProviderView
                    provider={provider}
                    rootLabel={rootName}
                    selectedHref={selectedHref}
                    onItemClick={handleItemClick}
                    onItemDoubleClick={handleItemClick}
                />
            ) : (
                <Panel padding="md">
                    <Text size="sm" color={error ? "error" : "light"}>
                        {error ?? (resolving ? "Connecting…" : "No content")}
                    </Text>
                </Panel>
            )}
        </>
    );
}
