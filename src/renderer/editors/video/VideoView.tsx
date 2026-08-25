import React from "react";
import { PageToolbar } from "../base";
import { Button, Panel, Text, Textarea } from "../../uikit";
import color from "../../theme/color";
import { VPlayer } from "./VPlayer";
import { settings } from "../../api/settings";
import { VideoEditor } from "./VideoEditor";

// ── Inline-style constants ───────────────────────────────────────────────────

const stateBadgeStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "4px 12px",
    borderRadius: 4,
    background: color.background.light,
    color: color.text.light,
    fontSize: 12,
    pointerEvents: "none",
};

const vlcButtonContainerStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 60,
    left: "50%",
    transform: "translateX(-50%)",
};

// ── Component ────────────────────────────────────────────────────────────────

interface VideoViewProps {
    model: VideoEditor;
}

export function VideoView({ model }: VideoViewProps) {
    const url = model.state.use((s) => s.url);
    const streamUrl = model.state.use((s) => s.streamUrl);
    const inputText = model.state.use((s) => s.inputText);
    const format = model.state.use((s) => s.format);
    const muted = model.state.use((s) => s.pageMuted);
    const parsedRequest = model.state.use((s) => s.parsedRequest);
    const playerState = model.state.use((s) => s.playerState);
    const shuffle = settings.use("audio-shuffle") === true;
    const canPlayNext = model.canPlayNext;
    const showBadge = playerState !== "playing" && playerState !== "paused" && playerState !== "stopped";
    const showVlcButton = url && !["loading", "playing", "stopped"].includes(playerState);

    return (
        <Panel name="video-player" direction="column" height="100%" background="dark" overflow="hidden">
            <PageToolbar name="video-toolbar" model={model} noSpacer borderBottom>
                <Panel direction="column" flex={1}>
                    <Textarea
                        name="video-url-input"
                        value={inputText}
                        onChange={model.setInputText}
                        placeholder="Enter video URL or paste cURL command... (Enter to play)"
                        singleLine
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                                e.preventDefault();
                                model.submitUrl(inputText);
                            }
                        }}
                        minHeight={28}
                        maxHeight={72}
                        size="sm"
                    />
                </Panel>
            </PageToolbar>
            <Panel name="video-player-area" direction="column" flex={1} align="center" justify="center" position="relative" overflow="hidden">
                {url && (
                    <VPlayer
                        src={streamUrl}
                        format={format}
                        muted={muted}
                        parsedRequest={parsedRequest}
                        sourceUrl={url}
                        onStateChange={model.onPlayerStateChange}
                        onMutedChange={model.onMutedChange}
                        onEnded={() => model.playNext()}
                        hasNext={canPlayNext}
                        shuffle={shuffle}
                        onNext={() => model.playNext()}
                        onToggleShuffle={model.toggleShuffle}
                    />
                )}
                {!url && (
                    <Text size="md" color="light">Enter a video URL above to start playing</Text>
                )}
                {showBadge && (
                    <div style={stateBadgeStyle}>{playerState}</div>
                )}
                {showVlcButton && (
                    <div style={vlcButtonContainerStyle}>
                        <Button name="video-open-vlc" variant="link" icon="vlc" onClick={model.openInVlc}>
                            Open in VLC
                        </Button>
                    </div>
                )}
            </Panel>
        </Panel>
    );
}

export type { VideoViewProps };
