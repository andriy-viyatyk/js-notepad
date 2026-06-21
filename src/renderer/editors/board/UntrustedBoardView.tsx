import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { WarningIcon } from "../../theme/icons";

/**
 * Untrusted-board placeholder (EPIC-035). A Web Board's UI is web content and
 * `execute()` is arbitrary RCE, so nothing renders or runs until the board is
 * trusted. Shown in place of the board's webview; the "Trust board" button drives
 * the consent flow. Trust is per board — never sourced from the board's manifest.
 */
export function UntrustedBoardView({
    path,
    onTrust,
}: {
    path: string;
    onTrust: () => void | Promise<void>;
}) {
    return (
        <Panel direction="column" flex={1} align="center" justify="center" gap="md" padding="xl">
            <WarningIcon width={32} height={32} />
            <Text size="lg">This board is not trusted</Text>
            <Text color="light" align="center">
                Trusting this board lets it run programs on your computer with your full user
                privileges. Only trust boards you created or fully understand.
            </Text>
            <Text size="sm" color="light">{path}</Text>
            <Button variant="primary" onClick={() => void onTrust()}>
                Trust board
            </Button>
        </Panel>
    );
}
