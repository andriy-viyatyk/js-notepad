import React, { useEffect, useRef, useState } from "react";
import { IconButton, Panel, Slider } from "../../uikit";
import color from "../../theme/color";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Inline-style constants ───────────────────────────────────────────────────

const timeLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.text.light,
    minWidth: 34,
    whiteSpace: "nowrap",
    textAlign: "center",
    flexShrink: 0,
};

// ── Component ─────────────────────────────────────────────────────────────────

export interface AudioControlsProps {
    audioRef: React.RefObject<HTMLAudioElement>;
    playing: boolean;
    /** Whether a next track is available. */
    hasNext?: boolean;
    /** Whether shuffle mode is on. */
    shuffle?: boolean;
    /** Skip to the next track. */
    onNext?: () => void;
    /** Toggle shuffle mode. */
    onToggleShuffle?: () => void;
}

export function AudioControls({ audioRef, playing, hasNext, shuffle, onNext, onToggleShuffle }: AudioControlsProps) {
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration]       = useState(0);
    const [muted, setMuted]             = useState(false);
    const isSeekingRef                  = useRef(false);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate    = () => { if (!isSeekingRef.current) setCurrentTime(audio.currentTime); };
        const onDuration      = () => { setDuration(isFinite(audio.duration) ? audio.duration : 0); };
        const onVolumeChange  = () => { setMuted(audio.muted); };
        const onSeeked        = () => { setCurrentTime(audio.currentTime); };

        audio.addEventListener("timeupdate",      onTimeUpdate);
        audio.addEventListener("loadedmetadata",  onDuration);
        audio.addEventListener("durationchange",  onDuration);
        audio.addEventListener("volumechange",    onVolumeChange);
        audio.addEventListener("seeked",          onSeeked);
        // Sync initial state
        setCurrentTime(audio.currentTime);
        setDuration(isFinite(audio.duration) ? audio.duration : 0);
        setMuted(audio.muted);

        return () => {
            audio.removeEventListener("timeupdate",     onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onDuration);
            audio.removeEventListener("durationchange", onDuration);
            audio.removeEventListener("volumechange",   onVolumeChange);
            audio.removeEventListener("seeked",         onSeeked);
        };
    }, [audioRef]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (audio) audio.muted = !audio.muted;
    };

    const onSeekMouseDown = () => { isSeekingRef.current = true; };
    const onSeekMouseUp   = () => { isSeekingRef.current = false; };
    const onSeekChange    = (val: number) => {
        setCurrentTime(val);
        const audio = audioRef.current;
        if (audio) audio.currentTime = val;
    };

    return (
        <Panel name="audio-controls" height={44} shrink={false} align="center" gap="xs" paddingX="sm">
            <IconButton
                name="audio-play-pause"
                size="sm"
                icon={playing ? "pause" : "play"}
                title={playing ? "Pause" : "Play"}
                hideUntilParentHover
                onClick={togglePlay}
            />

            {hasNext && (
                <IconButton
                    name="audio-next"
                    size="sm"
                    icon="next-track"
                    title="Next Track"
                    hideUntilParentHover
                    onClick={onNext}
                />
            )}

            <span style={timeLabelStyle} data-visibility="parent-hover">{formatTime(currentTime)}</span>

            <Slider
                name="audio-seek"
                value={currentTime}
                onChange={onSeekChange}
                min={0}
                max={duration || 0}
                step={0.1}
                size="sm"
                showProgress
                onMouseDown={onSeekMouseDown}
                onMouseUp={onSeekMouseUp}
            />

            <span style={timeLabelStyle} data-visibility="parent-hover">{formatTime(duration)}</span>

            <IconButton
                name="audio-mute"
                size="sm"
                icon={muted ? "volume-muted" : "volume"}
                title={muted ? "Unmute" : "Mute"}
                hideUntilParentHover
                onClick={toggleMute}
            />

            {hasNext && (
                <IconButton
                    name="audio-shuffle"
                    size="sm"
                    icon="shuffle"
                    title={shuffle ? "Shuffle: On" : "Shuffle: Off"}
                    active={shuffle}
                    hideUntilParentHover
                    onClick={onToggleShuffle}
                />
            )}
        </Panel>
    );
}
