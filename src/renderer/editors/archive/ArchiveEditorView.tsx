import { useCallback, useRef } from "react";
import { TreeProviderView, TreeProviderViewRef } from "../../components/tree-provider";
import { PageToolbar } from "../base";
import { TComponentState } from "../../core/state/state";
import { Panel } from "../../uikit/Panel";
import { IconButton } from "../../uikit/IconButton";
import { Text } from "../../uikit/Text";
import {
    CollapseAllIcon,
    RefreshIcon,
} from "../../theme/icons";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import type { EditorModel } from "../base";
import { EditorModule } from "../types";
import type { EditorType, IEditorState } from "../../../shared/types";
import type { RestoreData } from "../base/EditorModel";
import {
    ArchiveEditor,
    getDefaultArchiveEditorState,
    type ArchiveEditorState,
} from "./ArchiveEditor";

export function ArchiveEditorView({ model }: { model: ArchiveEditor }) {
    const provider = model.treeProvider;
    const pageId = model.page?.id ?? model.id;
    const treeRef = useRef<TreeProviderViewRef>(null);

    const handleItemClick = useCallback((item: ITreeProviderItem) => {
        const url = provider?.getNavigationUrl(item) ?? item.href;
        app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: model.id }));
    }, [provider, pageId, model.id]);

    const handleCollapseAll = useCallback(() => {
        treeRef.current?.collapseAll();
    }, []);

    const handleRefresh = useCallback(() => {
        treeRef.current?.refresh();
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
                            icon={<CollapseAllIcon />}
                            onClick={handleCollapseAll}
                        />
                        <IconButton
                            name="archive-refresh"
                            size="sm"
                            title="Refresh"
                            icon={<RefreshIcon />}
                            onClick={handleRefresh}
                        />
                    </>
                }
            />
            <TreeProviderView
                ref={treeRef}
                provider={provider}
                onItemClick={handleItemClick}
                onItemDoubleClick={handleItemClick}
            />
        </Panel>
    );
}

// ============================================================================
// EditorModule
// ============================================================================
// EPIC-028 / US-570 — legacy EditorModule shape preserved for the
// LegacyEditorAdapter safety-net path used by `PagesLifecycleModel.openFile`
// (file-open flow) AND by `PagesLifecycleModel._openZipArchive` (dedicated
// archive-open path). The `as unknown as EditorModel` casts bridge the v4
// ArchiveEditor class to the legacy EditorModel typing the legacy module
// factories expect; the runtime instance is the v4 class either way. Mirrors
// the US-569 Image pattern at `image/ImageView.tsx`. `attachEditorToPage`'s
// `instanceof EditorModel` early-return (US-568 PD-IMPL16) detects the v4
// instance and skips the adapter wrap. US-559 retires this block entirely.

function makeArchiveEditor(): ArchiveEditor {
    return new ArchiveEditor(new TComponentState(getDefaultArchiveEditorState()));
}

const archiveEditorModule: EditorModule = {
    Editor: ArchiveEditorView as unknown as EditorModule["Editor"],
    newEditorModel: async (filePath?: string) => {
        const model = makeArchiveEditor();
        if (filePath) await model.initFromArchive(filePath);
        return model as unknown as EditorModel;
    },
    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "archiveFile") return null;
        return makeArchiveEditor() as unknown as EditorModel;
    },
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const model = new ArchiveEditor(
            new TComponentState({
                ...getDefaultArchiveEditorState(),
                ...(state as Partial<ArchiveEditorState>),
            }),
        );
        model.applyRestoreData(state as RestoreData<ArchiveEditorState>);
        return model as unknown as EditorModel;
    },
};

export default archiveEditorModule;
export { ArchiveEditor };
export type { ArchiveEditorState };
