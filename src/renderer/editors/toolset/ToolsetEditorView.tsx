import { pagesModel } from "../../api/pages";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { toolsTrust } from "../../api/tools/tools-trust";
import { registeredTools } from "../../api/tools/registered-tools";
import { Panel, Text, Button, IconButton, Spacer } from "../../uikit";
import { ToolsIcon, RefreshIcon, FolderOpenIcon, LogIcon } from "../../theme/icons";
import type { ToolsetEditorModel } from "./ToolsetEditorModel";

// Read-only view of a single registered toolset (EPIC-038 / US-805): manifest info + tool list,
// with Open-Folder / Open-Log actions. Pure UIKit composition (no Emotion — editors are app code,
// outside the `ui/` chrome exception).
export function ToolsetEditorView({ model }: { model: ToolsetEditorModel }) {
    const s = model.state.use((st) => ({
        toolsetRoot: st.toolsetRoot,
        manifest: st.manifest,
        valid: st.valid,
        errors: st.errors,
        title: st.title,
    }));
    const root = s.toolsetRoot ?? "";
    const registered = toolsTrust.useIsTrusted(root);

    const handleRefresh = async () => {
        await registeredTools.refresh();
        await model.reload();
    };

    const handleOpenFolder = () => {
        if (root) void pagesModel.addEmptyPageWithNavPanel(root);
    };

    const handleOpenLog = async () => {
        const logPath = model.getLogPath();
        if (!logPath) return;
        if (!(await fs.exists(logPath))) {
            ui.notify("No execution log yet — run a tool first.", "info");
            return;
        }
        void pagesModel.openFile(logPath);
    };

    const tools = s.manifest?.tools ?? [];

    return (
        <Panel data-type="toolset-editor" direction="column" width="100%" height="100%" minHeight={0}>
            <Panel
                direction="column"
                flex={1}
                minHeight={0}
                overflowY="auto"
                align="stretch"
                gap="lg"
                paddingX="xl"
                paddingY="lg"
            >
                {/* Header */}
                <Panel direction="row" align="center" gap="sm">
                    <ToolsIcon width={20} height={20} />
                    <Text size="lg" bold>{s.title}</Text>
                    <Text size="sm" color={registered ? "success" : "light"}>
                        {registered ? "Registered" : "Not registered"}
                    </Text>
                    <Spacer />
                    <IconButton
                        name="toolset-refresh"
                        size="sm"
                        title="Refresh"
                        icon={<RefreshIcon />}
                        onClick={() => void handleRefresh()}
                    />
                </Panel>

                <Text size="sm" color="light">{root}</Text>

                {s.manifest?.description && <Text>{s.manifest.description}</Text>}
                {s.manifest?.author && (
                    <Text size="sm" color="light">{`Author: ${s.manifest.author}`}</Text>
                )}

                {/* Actions */}
                <Panel direction="row" gap="sm">
                    <Button name="toolset-open-folder" icon={<FolderOpenIcon />} onClick={handleOpenFolder}>
                        Open Folder
                    </Button>
                    <Button name="toolset-open-log" icon={<LogIcon />} onClick={() => void handleOpenLog()}>
                        Open Log
                    </Button>
                </Panel>

                {/* Validation errors, or the tool list */}
                {!s.valid && (s.errors?.length ?? 0) > 0 ? (
                    <Panel direction="column" gap="sm" align="stretch">
                        <Text color="warning" bold>This toolset's manifest has problems:</Text>
                        {s.errors?.map((e, i) => (
                            <Text key={i} size="sm" color="warning">{`• ${e}`}</Text>
                        ))}
                    </Panel>
                ) : (
                    <Panel direction="column" gap="sm" align="stretch">
                        <Text bold>{`Tools (${tools.length})`}</Text>
                        {tools.length === 0 ? (
                            <Text size="sm" color="light">This toolset declares no tools yet.</Text>
                        ) : (
                            tools.map((t) => (
                                <Panel
                                    key={t.name}
                                    direction="column"
                                    gap="xs"
                                    align="stretch"
                                    border
                                    borderColor="default"
                                    rounded="sm"
                                    padding="md"
                                >
                                    <Text bold>{t.name}</Text>
                                    <Text size="sm">{t.description}</Text>
                                    <Text size="sm" color="light">{`Command: ${t.command}`}</Text>
                                    {t.requirements && (
                                        <Text size="sm" color="light">{`Requires: ${t.requirements}`}</Text>
                                    )}
                                    {(t.env?.length ?? 0) > 0 && (
                                        <Text size="sm" color="light">{`Env: ${t.env?.join(", ")}`}</Text>
                                    )}
                                    {t.timeoutMs != null && (
                                        <Text size="sm" color="light">{`Timeout: ${t.timeoutMs} ms`}</Text>
                                    )}
                                </Panel>
                            ))
                        )}
                    </Panel>
                )}
            </Panel>
        </Panel>
    );
}
