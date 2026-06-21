import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { WarningIcon } from "../../theme/icons";

/**
 * Shown in single-board mode (US-748) when the linked board can't be resolved —
 * the folder is missing, or it carries no `board-manifest.json`. Replaces the
 * project-style "No boards yet" list, which would be confusing for a standalone
 * board link.
 */
export function BoardNotFoundView({ path }: { path: string }) {
    return (
        <Panel direction="column" flex={1} align="center" justify="center" gap="md" padding="xl">
            <WarningIcon width={32} height={32} />
            <Text size="lg">Board not found</Text>
            <Text color="light" align="center">
                This board could not be opened — its folder is missing or is not a board
                (no <code>board-manifest.json</code>).
            </Text>
            <Text size="sm" color="light">{path}</Text>
        </Panel>
    );
}
