import React, { useEffect, useRef, useState } from "react";
import { Panel } from "../../uikit";
import { AudioVisualizer } from "./AudioVisualizer";
import { AudioControls } from "./AudioControls";
import type { PlayerState } from "./video-types";
import color from "../../theme/color";

export interface AudioPlayerProps {
    src: string;
    muted?: boolean;
    /** Original file path or URL — used for filename-based metadata fallback in the visualizer. */
    sourceUrl?: string;
    onStateChangeRef: React.RefObject<((state: PlayerState, error?: unknown) => void) | undefined>;
    onMutedChangeRef: React.RefObject<((muted: boolean) => void) | undefined>;
    /** Called when audio playback reaches the end. */
    onEndedRef: React.RefObject<(() => void) | undefined>;
    /** Whether a next track is available (shows Next/Shuffle buttons). */
    hasNext?: boolean;
    /** Whether shuffle mode is on. */
    shuffle?: boolean;
    /** Skip to the next track. */
    onNext?: () => void;
    /** Toggle shuffle mode. */
    onToggleShuffle?: () => void;
}


const overlayCss = `
[data-audio-overlay] [data-visibility="parent-hover"] {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
}
[data-audio-overlay]:hover [data-visibility="parent-hover"],
[data-audio-overlay]:focus-within [data-visibility="parent-hover"] {
    opacity: 1;
    pointer-events: auto;
}
[data-audio-overlay] [data-type="slider"] {
    opacity: 0.4;
    transition: opacity 0.2s ease;
}
[data-audio-overlay]:hover [data-type="slider"],
[data-audio-overlay]:focus-within [data-type="slider"] {
    opacity: 1;
}
[data-audio-overlay] {
    background: transparent;
    transition: background 0.2s ease;
}
[data-audio-overlay]:hover {
    background: ${color.background.dark};
}
`;

const OVERLAY_STYLE_ID = "audio-overlay-styles";
function injectOverlayStyles() {
    const existing = document.getElementById(OVERLAY_STYLE_ID);
    if (existing) existing.remove();
    const el = document.createElement("style");
    el.id = OVERLAY_STYLE_ID;
    el.textContent = overlayCss;
    document.head.appendChild(el);
}

// ── Inline-style constants ───────────────────────────────────────────────────

const visualizerAreaStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    background: color.background.dark,
    cursor: "pointer",
};

const audioElementStyle: React.CSSProperties = { display: "none" };

const overlayStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    width: "33%",
    minWidth: "fit-content",
    borderRadius: 8,
    overflow: "hidden",
    pointerEvents: "auto",
};

// ── Component ────────────────────────────────────────────────────────────────

export function AudioPlayer({ src, muted, sourceUrl, onStateChangeRef, onMutedChangeRef, onEndedRef, hasNext, shuffle, onNext, onToggleShuffle }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);

    useEffect(() => { injectOverlayStyles(); }, []);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onLoadStart = () => onStateChangeRef.current?.("loading");
        const onPlaying = () => { onStateChangeRef.current?.("playing"); setPlaying(true); };
        const onPause = () => { onStateChangeRef.current?.("paused"); setPlaying(false); };
        const onVolumeChange = () => onMutedChangeRef.current?.(audio.muted);
        const onEnded = () => onEndedRef.current?.();
        const onError = () => {
            setPlaying(false);
            const err = audio.error;
            if (err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                onStateChangeRef.current?.("unsupported format", err);
            } else {
                onStateChangeRef.current?.("error", err ?? undefined);
            }
        };

        audio.addEventListener("loadstart", onLoadStart);
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("pause", onPause);
        audio.addEventListener("volumechange", onVolumeChange);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);

        return () => {
            audio.removeEventListener("loadstart", onLoadStart);
            audio.removeEventListener("playing", onPlaying);
            audio.removeEventListener("pause", onPause);
            audio.removeEventListener("volumechange", onVolumeChange);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("error", onError);
        };
    }, [onStateChangeRef, onMutedChangeRef, onEndedRef]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.muted = muted ?? false;
    }, [muted]);

    const togglePlayOnClick = () => {
        const audio = audioRef.current;
        if (audio) audio.paused ? audio.play() : audio.pause();
    };

    return (
        <Panel name="audio-player" position="absolute" top={0} right={0} bottom={0} left={0}>
            <div style={visualizerAreaStyle} onClick={togglePlayOnClick}>
                <AudioVisualizer mediaRef={audioRef} playing={playing} sourceUrl={sourceUrl} />
            </div>
            <audio ref={audioRef} src={src} autoPlay muted={muted} style={audioElementStyle} />
            <div data-audio-overlay="" style={overlayStyle}>
                <AudioControls
                    audioRef={audioRef}
                    playing={playing}
                    hasNext={hasNext}
                    shuffle={shuffle}
                    onNext={onNext}
                    onToggleShuffle={onToggleShuffle}
                />
            </div>
        </Panel>
    );
}
