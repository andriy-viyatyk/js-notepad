import { useCallback, useEffect, useState } from "react";
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
import { CloseIcon } from "../../theme/icons";
import { mnemeConnection } from "../../api/mneme-connection";
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
    const [refreshKey, setRefreshKey] = useState(0);
    const provider = mnemeModel.treeProvider;

    // Live-refresh the tree on external add/remove/rename (resources/list_changed).
    useEffect(() => {
        const sub = mnemeConnection.onListChanged(() => setRefreshKey((k) => k + 1));
        return () => sub.unsubscribe();
    }, []);

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
                    refreshKey={refreshKey}
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
