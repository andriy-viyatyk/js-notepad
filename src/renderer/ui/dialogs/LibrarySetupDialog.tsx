import { useState } from "react";

import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button, Input, Checkbox, Label } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { FolderOpenIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";
import { api } from "../../../ipc/renderer/api";
import { settings } from "../../api/settings";
import { copyExampleScripts } from "../../api/library-service";

const nodefs = require("fs") as typeof import("fs");

const librarySetupDialogId = Symbol("librarySetupDialog");

interface LibrarySetupDialogProps {
    title?: string;
}

const defaultProps: LibrarySetupDialogProps = {
    title: "Link Script Library",
};

class LibrarySetupDialogModel extends TDialogModel<LibrarySetupDialogProps, string | undefined> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }
    };
}

function LibrarySetupDialog({ model }: ViewPropsRO<LibrarySetupDialogModel>) {
    const state = model.state.use();
    const [folderPath, setFolderPath] = useState("");
    const [copyExamples, setCopyExamples] = useState(true);
    const [linking, setLinking] = useState(false);

    const handleBrowse = async () => {
        const result = await api.showOpenFolderDialog({
            title: "Select Script Library Folder",
        });
        if (result && result.length > 0) {
            setFolderPath(result[0]);
        }
    };

    const handleLink = async () => {
        const trimmed = folderPath.trim();
        if (!trimmed) return;

        setLinking(true);
        try {
            if (!nodefs.existsSync(trimmed)) {
                nodefs.mkdirSync(trimmed, { recursive: true });
            }

            if (copyExamples) {
                await copyExampleScripts(trimmed);
            }

            settings.set("script-library.path", trimmed);
            model.close(trimmed);
        } catch (err) {
            const { ui } = await import("../../api/ui");
            ui.notify(`Failed to link library: ${err.message}`, "error");
            setLinking(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && folderPath.trim()) {
            e.preventDefault();
            handleLink();
        }
    };

    return (
        <Dialog name="library-setup-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title={state.title}
                icon={<FolderOpenIcon />}
                onClose={() => model.close(undefined)}
                minWidth={400}
                maxWidth={600}
            >
                <Panel
                    direction="column"
                    paddingX="xxl"
                    paddingY="xl"
                    gap="lg"
                    onKeyDown={handleKeyDown}
                >
                    <Panel direction="column" gap="xs">
                        <Label>Folder:</Label>
                        <Panel direction="row" gap="sm" align="center">
                            <Panel flex>
                                <Input
                                    name="library-setup-folder"
                                    value={folderPath}
                                    onChange={setFolderPath}
                                    placeholder="Select or type a folder path..."
                                    autoFocus
                                />
                            </Panel>
                            <Button name="library-setup-browse" onClick={handleBrowse}>Browse...</Button>
                        </Panel>
                    </Panel>
                    <Panel direction="column" gap="xs">
                        <Checkbox name="library-setup-copy-examples" checked={copyExamples} onChange={setCopyExamples}>
                            Copy example scripts
                        </Checkbox>
                        <Panel paddingLeft="xxl">
                            <Text size="xs" color="light">Won't overwrite existing files</Text>
                        </Panel>
                    </Panel>
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button name="library-setup-link" onClick={handleLink} disabled={!folderPath.trim() || linking}>
                        {linking ? "Linking..." : "Link"}
                    </Button>
                    <Button name="library-setup-cancel" onClick={() => model.close(undefined)}>
                        Cancel
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(librarySetupDialogId, LibrarySetupDialog as DefaultView);

export function showLibrarySetupDialog(props?: LibrarySetupDialogProps): Promise<string | undefined> {
    const modelState = {
        ...defaultProps,
        ...props,
    };

    const model = new LibrarySetupDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: librarySetupDialogId,
        model,
    }) as Promise<string | undefined>;
}
