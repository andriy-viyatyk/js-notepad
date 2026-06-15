import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { Dot } from "../../uikit/Dot";
import { ProgressBar } from "../../uikit/ProgressBar";
import { MnemeConfigEditorModel } from "./MnemeConfigEditorModel";
import { isModelReady, formatBytes, isDownloadActive } from "./mnemeTypes";

interface ModelPanelProps {
    model: MnemeConfigEditorModel;
}

export function ModelPanel({ model }: ModelPanelProps) {
    const s = model.state.use();
    const m = s.status?.model;
    const ready = isModelReady(s.status);
    const download = m?.download;
    const downloading = isDownloadActive(download);

    return (
        <Panel direction="column">
            <Panel
                background="dark"
                borderBottom
                direction="row"
                align="center"
                gap="sm"
                paddingX="lg"
                paddingY="sm"
            >
                <Text size="base" bold>Embedding model</Text>
                <Panel flex={1} />
                <Button
                    name="mneme-update-model"
                    size="sm"
                    variant="default"
                    disabled={downloading}
                    onClick={() => model.updateModel()}
                >
                    {downloading ? "Downloading…" : "Update model"}
                </Button>
            </Panel>

            <Panel direction="column" gap="md" padding="lg">
                {download && (downloading || download.phase === "error") && (
                <Panel direction="column" gap="xs">
                    <Panel direction="row" align="center" gap="sm">
                        <Panel flex={1}>
                            <ProgressBar
                                value={download.bytesTotal > 0 ? download.bytesDone : undefined}
                                max={download.bytesTotal > 0 ? download.bytesTotal : undefined}
                            />
                        </Panel>
                        <Text size="xs" color={download.phase === "error" ? "error" : "light"}>
                            {download.phase === "verifying"
                                ? "verifying…"
                                : download.phase === "error"
                                  ? "download failed"
                                  : `${formatBytes(download.bytesDone)} / ${formatBytes(download.bytesTotal)}`}
                        </Text>
                    </Panel>
                </Panel>
            )}

            {!m && (
                <Panel direction="row" align="center" gap="sm">
                    <Dot size="xs" color="warning" />
                    <Text size="md" color="warning">No model resolved — semantic search is unavailable.</Text>
                </Panel>
            )}

            {m && (
                <Panel direction="column" gap="sm">
                    <Panel direction="row" align="center" gap="md">
                        <Text size="md">{m.name} · {m.precision} · v{m.version}</Text>
                        <Dot size="xs" color={ready ? "success" : "warning"} />
                        <Text size="md" color={ready ? "success" : "warning"}>{ready ? "ready" : "not loaded"}</Text>
                    </Panel>
                    <Text size="xs" color="light" truncate>Cache: {m.dir}</Text>

                    <Panel direction="column" gap="xs" border rounded="md" padding="md">
                        {m.files.map((f) => (
                            <Panel key={f.filename} direction="row" align="center" gap="md">
                                <Panel width={180}><Text size="md" truncate>{f.filename}</Text></Panel>
                                <Text size="xs" color={f.present ? "success" : "error"}>
                                    {f.present ? "present ✓" : "missing"}
                                </Text>
                                {f.present && (
                                    <Text size="xs" color={f.verified ? "success" : "error"}>
                                        {f.verified ? "verified ✓" : "verified ✗"}
                                    </Text>
                                )}
                                <Panel flex={1} />
                                <Text size="xs" color="light">{formatBytes(f.bytes)}</Text>
                            </Panel>
                        ))}
                    </Panel>
                </Panel>
            )}
            </Panel>
        </Panel>
    );
}
