import { useCallback, useEffect, useRef } from "react";
import { TreeProviderView } from "../../components/tree-provider";
import type { TreeProviderViewModel } from "../../components/tree-provider/TreeProviderViewModel";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import type { ArchiveEditor } from "./ArchiveEditor";
import { IconButton } from "../../uikit/IconButton";
import { CloseIcon } from "../../theme/icons";

export default function ArchiveSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    const archiveModel = model as ArchiveEditor;
    const provider = archiveModel.treeProvider;
    const treeProviderModel = useRef<TreeProviderViewModel | null>(null);

    const { selectedHref } = archiveModel.selectionState.use();
    const { version: revealVersion } = archiveModel.revealVersion.use();

    useEffect(() => {
        if (revealVersion > 0 && selectedHref) {
            requestAnimationFrame(() => {
                void treeProviderModel.current?.revealItem(selectedHref);
            });
        }
    }, [revealVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleItemClick = useCallback((item: ITreeProviderItem) => {
        archiveModel.selectionState.update((s) => { s.selectedHref = item.href; });
        const url = provider?.getNavigationUrl(item) ?? item.href;
        const pageId = archiveModel.page?.id;
        app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: archiveModel.id }));
    }, [provider, archiveModel]);

    const isActivePagePanel = archiveModel === archiveModel.page?.mainEditor;

    const actions = !isActivePagePanel && (
        <IconButton
            name="archive-secondary-close"
            size="sm"
            title="Close"
            icon={<CloseIcon />}
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                archiveModel.page?.removeSecondaryView(archiveModel);
            }}
        />
    );

    if (!provider) return null;

    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Archive" actions={actions} />
            <TreeProviderView
                onModel={(value) => { treeProviderModel.current = value; }}
                provider={provider}
                selectedHref={selectedHref ?? undefined}
                onItemClick={handleItemClick}
                onItemDoubleClick={handleItemClick}
            />
        </>
    );
}
