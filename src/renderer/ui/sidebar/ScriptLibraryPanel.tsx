import { useMemo } from "react";
import { settings } from "../../api/settings";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import {
    TreeProviderView,
    type TreeProviderViewRef,
    type TreeProviderViewSavedState,
} from "../../components/tree-provider";
import { FileTreeProvider } from "../../content/tree-providers/FileTreeProvider";
import { FolderOpenIcon } from "../../theme/icons";
import { Panel, Button, Text } from "../../uikit";

interface ScriptLibraryPanelProps {
    onClose?: () => void;
    explorerRef?: (ref: TreeProviderViewRef | null) => void;
    expandState?: TreeProviderViewSavedState;
    onExpandStateChange?: (state: TreeProviderViewSavedState) => void;
}

export function ScriptLibraryPanel(props: ScriptLibraryPanelProps) {
    const libraryPath = settings.use("script-library.path");

    const provider = useMemo(
        () => (libraryPath ? new FileTreeProvider(libraryPath) : null),
        [libraryPath],
    );

    const handleSelectFolder = async () => {
        const { showLibrarySetupDialog } = await import("../dialogs/LibrarySetupDialog");
        showLibrarySetupDialog();
    };

    if (!libraryPath || !provider) {
        return (
            <Panel
                name="sidebar-script-library"
                direction="column"
                height="100%"
                data-type="script-library-panel"
            >
                <Panel
                    name="script-library-setup-pane"
                    direction="column"
                    align="center"
                    justify="center"
                    gap="xl"
                    padding="xl"
                    flex
                >
                    <Button
                        name="script-library-setup"
                        background="dark"
                        icon={<FolderOpenIcon />}
                        onClick={handleSelectFolder}
                    >
                        Select Folder
                    </Button>
                    <Text size="xs" color="light" align="center">
                        Select an existing folder with scripts or create a new one to store your saved scripts and reusable modules
                    </Text>
                </Panel>
            </Panel>
        );
    }

    return (
        <Panel name="sidebar-script-library" direction="column" height="100%" data-type="script-library-panel">
            <TreeProviderView
                ref={props.explorerRef}
                key={libraryPath}
                provider={provider}
                initialState={props.expandState}
                onStateChange={props.onExpandStateChange}
                onItemClick={(item) => {
                    if (!item.isDirectory) {
                        app.events.openRawLink.sendAsync(createLinkData(item.href));
                        props.onClose?.();
                    }
                }}
            />
        </Panel>
    );
}
