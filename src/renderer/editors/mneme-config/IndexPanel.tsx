import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { Dot } from "../../uikit/Dot";
import { MnemeConfigEditorModel } from "./MnemeConfigEditorModel";
import { formatBytes } from "./mnemeTypes";

interface IndexPanelProps {
    model: MnemeConfigEditorModel;
}

export function IndexPanel({ model }: IndexPanelProps) {
    const s = model.state.use();
    const roots = s.status?.roots ?? [];

    return (
        <Panel direction="column" gap="md" padding="lg">
            <Text size="base" bold>Index inventory</Text>
            {roots.length === 0 && <Text size="md" color="light">No roots configured.</Text>}

            {roots.map((root) => {
                const entries = s.staleIndexes[root.name] ?? [];
                return (
                    <Panel key={root.name} direction="column" gap="xs" border rounded="md" padding="md">
                        <Panel direction="row" align="center" gap="md">
                            <Text size="md" bold>{root.name}</Text>
                            <Text size="xs" color="light" truncate>{root.folder}\.mneme</Text>
                        </Panel>
                        {entries.length === 0 && (
                            <Text size="xs" color="light">No index databases found.</Text>
                        )}
                        {entries.map((e) => (
                            <Panel key={e.path} direction="row" align="center" gap="sm">
                                {e.active ? <Dot size="xs" color="success" /> : <Panel width={9} />}
                                <Text size="md" color={e.active ? "default" : "light"}>
                                    {e.modelId} / v{e.schemaVer}
                                </Text>
                                <Text size="xs" color="light">{formatBytes(e.bytes)}</Text>
                                <Panel flex={1} />
                                {e.active ? (
                                    <Text size="xs" color="success">active</Text>
                                ) : (
                                    <Button
                                        name={`mneme-delidx-${root.name}-${e.modelId}-${e.schemaVer}`}
                                        size="sm"
                                        variant="danger"
                                        onClick={() => model.deleteIndex(root.name, e.modelId, e.schemaVer)}
                                    >
                                        Delete
                                    </Button>
                                )}
                            </Panel>
                        ))}
                    </Panel>
                );
            })}
        </Panel>
    );
}
