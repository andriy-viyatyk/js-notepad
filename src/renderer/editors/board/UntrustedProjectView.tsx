import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { WarningIcon } from "../../theme/icons";

/**
 * Untrusted-project placeholder (EPIC-034 / US-722, fulfils US-721 C2).
 *
 * A Web Board's UI is web content and `execute()` is arbitrary RCE, so nothing
 * renders or runs until the project is trusted. Shown in place of the board
 * host region; the "Trust project" button drives the US-721 consent flow.
 */
export function UntrustedProjectView({
    path,
    onTrust,
}: {
    path: string;
    onTrust: () => void | Promise<void>;
}) {
    return (
        <Panel direction="column" flex={1} align="center" justify="center" gap="md" padding="xl">
            <WarningIcon width={32} height={32} />
            <Text size="lg">Boards are not supported in untrusted projects</Text>
            <Text color="light" align="center">
                Trusting this project lets its boards run programs on your computer with your full
                user privileges. Only trust projects you created or fully understand.
            </Text>
            <Text size="sm" color="light">{path}</Text>
            <Button variant="primary" onClick={() => void onTrust()}>
                Trust project
            </Button>
        </Panel>
    );
}
