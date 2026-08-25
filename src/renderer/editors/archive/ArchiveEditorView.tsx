import { useCallback, useRef } from "react";
import { TreeProviderView } from "../../components/tree-provider";
import type { TreeProviderViewModel } from "../../components/tree-provider/TreeProviderViewModel";
import { PageToolbar } from "../base";
import { TComponentState } from "../../core/state/state";
import { Panel } from "../../uikit/Panel";
import { IconButton } from "../../uikit/IconButton";
import { Text } from "../../uikit/Text";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import {
    ArchiveEditor,
    getDefaultArchiveEditorState,
    type ArchiveEditorState,
} from "./ArchiveEditor";

export function ArchiveEditorView({ model }: { model: ArchiveEditor }) {
    const provider = model.treeProvider;
    const pageId = model.page?.id ?? model.id;
    const treeModel = useRef<TreeProviderViewModel | null>(null);

    const handleItemClick = useCallback((item: ITreeProviderItem) => {
        const url = provider?.getNavigationUrl(item) ?? item.href;
        app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: model.id }));
    }, [provider, pageId, model.id]);

    const handleCollapseAll = useCallback(() => {
        treeModel.current?.collapseAll();
    }, []);

    const handleRefresh = useCallback(() => {
        void treeModel.current?.buildTree();
    }, []);

    if (!provider) {
        return (
            <Panel
                direction="column"
                flex={1}
                overflow="hidden"
                background="default"
                padding="xl"
            >
                <Text color="light">No archive loaded.</Text>
            </Panel>
        );
    }

    return (
        <Panel
            name="archive-root"
            direction="column"
            flex={1}
            overflow="hidden"
            background="default"
        >
            <PageToolbar
                name="archive-toolbar"
                model={model}
                borderBottom
                rightContributions={
                    <>
                        <IconButton
                            name="archive-collapse-all"
                            size="sm"
                            title="Collapse All"
                            icon="collapse-all"
                            onClick={handleCollapseAll}
                        />
                        <IconButton
                            name="archive-refresh"
                            size="sm"
                            title="Refresh"
                            icon="refresh"
                            onClick={handleRefresh}
                        />
                    </>
                }
            />
            <TreeProviderView
                onModel={(value) => { treeModel.current = value; }}
                provider={provider}
                onItemClick={handleItemClick}
                onItemDoubleClick={handleItemClick}
            />
        </Panel>
    );
}


export function makeArchiveEditor(): ArchiveEditor {
    return new ArchiveEditor(new TComponentState(getDefaultArchiveEditorState()));
}

export { ArchiveEditor };
export type { ArchiveEditorState };
