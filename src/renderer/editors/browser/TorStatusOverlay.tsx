/**
 * Tor status overlay — shown over browser content while Tor is connecting,
 * on error, or when the user clicks the Tor indicator in the URL bar.
 */
import { useEffect, useRef } from "react";
import { Panel, IconButton, Button, Text, Spinner } from "../../uikit";
import { ColorizedCode } from "../shared/ColorizedCode";
import { TorIcon } from "../../theme/language-icons";
import { Icon } from "../../uikit/Icon/Icon";
import { TOR_BROWSER_COLOR } from "../../theme/palette-colors";
import type { BrowserEditorModel } from "./BrowserEditorModel";

interface TorStatusOverlayProps {
    model: BrowserEditorModel;
    torStatus: "disconnected" | "connecting" | "connected" | "error";
    torLog: string;
}

const STATUS_MESSAGE: Record<TorStatusOverlayProps["torStatus"], string> = {
    connecting:   "Connecting to Tor network...",
    connected:    "Connected to Tor",
    error:        "Failed to connect to Tor",
    disconnected: "Tor is not connected",
};

export function TorStatusOverlay({ model, torStatus, torLog }: TorStatusOverlayProps) {
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [torLog]);

    const canClose      = torStatus === "connected";
    const showReconnect = torStatus === "disconnected" || torStatus === "error";
    const showSpinner   = torStatus === "connecting";

    return (
        <Panel
            name="tor-overlay"
            position="absolute"
            top={0}
            right={0}
            bottom={0}
            left={0}
            zIndex={5}
            background="dark"
            direction="column"
            align="center"
            overflow="hidden"
        >
            {canClose && (
                <Panel name="tor-overlay-close-bar" position="absolute" top={8} right={8}>
                    <IconButton
                        name="tor-overlay-close"
                        size="sm"
                        title="Close"
                        onClick={() => model.toggleTorOverlay()}
                        icon="close"
                    />
                </Panel>
            )}

            <Panel
                name="tor-overlay-status"
                direction="column"
                alignSelf="center"
                align="center"
                gap="lg"
                paddingTop="xxxl"
            >
                {showSpinner
                    ? <Spinner size={40} color={TOR_BROWSER_COLOR} />
                    : <Icon icon={TorIcon} width={40} height={40} />}

                <Text size="base" color="light">{STATUS_MESSAGE[torStatus]}</Text>

                {showReconnect && (
                    <Button name="tor-overlay-retry" onClick={() => model.reconnectTor()}>Reconnect</Button>
                )}
            </Panel>

            {torLog && (
                <Panel
                    ref={logRef}
                    alignSelf="center"
                    width="100%"
                    maxWidth={600}
                    flex
                    paddingY="md"
                    paddingX="xl"
                    overflowY="auto"
                    whiteSpace="pre-wrap"
                    wordBreak="break-word"
                >
                    <ColorizedCode code={torLog} language="log" />
                </Panel>
            )}
        </Panel>
    );
}
