import { useEffect } from "react";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { IconButton } from "../../uikit/IconButton";
import { Dot, DotColor } from "../../uikit/Dot";
import { EditorToolbar } from "../base/EditorToolbar";
import { RefreshIcon } from "../../theme/icons";
import { pagesModel } from "../../api/pages";
import type { EditorModel } from "../base";
import { MnemeConfigEditorModel } from "./MnemeConfigEditorModel";
import { isModelReady } from "./mnemeTypes";
import { RootsPanel } from "./RootsPanel";
import { ModelPanel } from "./ModelPanel";

function connectionDotColor(status: string): DotColor {
    switch (status) {
        case "connected": return "success";
        case "connecting": return "warning";
        case "error": return "error";
        default: return "neutral";
    }
}

interface MnemeConfigViewProps {
    model: MnemeConfigEditorModel;
}

function MnemeConfigView({ model }: MnemeConfigViewProps) {
    const s = model.state.use();
    const connected = s.connectionStatus === "connected";
    const modelReady = isModelReady(s.status);

    useEffect(() => {
        if (connected) void model.loadIndexInventory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);

    if (!s.running) {
        return (
            <Panel name="mneme-config-root" direction="column" flex={1} align="center" justify="center" gap="md">
                <Dot size="md" color="neutral" />
                <Text size="lg" color="light">Mneme is not running</Text>
                <Text size="md" color="light">Mneme is disabled or not started.</Text>
                <Panel direction="row" gap="sm">
                    <Button name="mneme-start" variant="primary" onClick={() => model.restartMneme()}>
                        Start Mneme
                    </Button>
                    <Button name="mneme-open-settings" variant="default" onClick={() => pagesModel.showSettingsPage()}>
                        Open Settings
                    </Button>
                </Panel>
            </Panel>
        );
    }

    return (
        <Panel name="mneme-config-root" direction="column" flex={1} overflow="hidden" tabIndex={-1}>
            {/* Status header */}
            <EditorToolbar borderBottom>
                <Panel
                    name="mneme-status-bar"
                    direction="row"
                    align="center"
                    gap="sm"
                    paddingLeft="lg"
                    paddingY="sm"
                    flex={1}
                >
                    <Dot size="xs" color={connectionDotColor(s.connectionStatus)} />
                    <Text size="md" color="default">
                        {connected ? "Connected" : s.connectionStatus === "connecting" ? "Connecting…" : "Disconnected"}
                    </Text>
                    {!connected && (
                        <IconButton
                            name="mneme-restart"
                            size="sm"
                            warning
                            icon={<RefreshIcon />}
                            title="Restart Mneme"
                            onClick={() => model.restartMneme()}
                        />
                    )}
                    {s.url && <Text size="md" color="light">{s.url}</Text>}
                    <Panel flex={1} />
                </Panel>
            </EditorToolbar>

            {/* Connection error */}
            {s.connectionStatus === "error" && s.errorMessage && (
                <Panel paddingX="lg" paddingY="xs" background="light" borderBottom>
                    <Text size="md" color="error">{s.errorMessage}</Text>
                </Panel>
            )}

            {/* Model-health warning */}
            {connected && !modelReady && (
                <Panel direction="row" align="center" gap="sm" paddingX="lg" paddingY="xs" background="light" borderBottom>
                    <Dot size="xs" color="warning" />
                    <Text size="md" color="warning">
                        No embedding model — semantic search is disabled; results fall back to text.
                        Update the model in the Model tab.
                    </Text>
                </Panel>
            )}

            {/* Body — single scrollable page: Model section on top, Roots below. */}
            <Panel name="mneme-body" direction="column" flex={1} overflow="auto" height={0}>
                <ModelPanel model={model} />
                <RootsPanel model={model} />
            </Panel>
        </Panel>
    );
}

function MnemeConfigEditorComponent({ model }: { model: EditorModel }) {
    return <MnemeConfigView model={model as MnemeConfigEditorModel} />;
}

export { MnemeConfigView, MnemeConfigEditorComponent };
