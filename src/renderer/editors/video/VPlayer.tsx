import videojs from "video.js";
// hls.js's default export is also re-exported as a named `Hls`; the default is correct here.
// eslint-disable-next-line import/no-named-as-default
import Hls from "hls.js";
import "video.js/dist/video-js.css";
import type { HlsConfig } from "hls.js";
import { useEffect, useRef } from "react";
import type Player from "video.js/dist/types/player";
import { Panel } from "../../uikit";
import type { VideoFormat, PlayerState } from "./video-types";
import type { ParsedHttpRequest } from "../../core/utils/curl-parser";
import { createNodeFetchLoaderClass } from "./NodeFetchHlsLoader";
import { AudioPlayer } from "./AudioPlayer";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface VPlayerProps {
    src?: string;
    format?: VideoFormat;
    muted?: boolean;
    /** Parsed HTTP request from cURL input. When headers are present, hls.js
     *  uses NodeFetchHlsLoader to bypass Chromium's forbidden header restrictions. */
    parsedRequest?: ParsedHttpRequest | null;
    /** Original file path or URL before streaming server wrapping — used for filename-based metadata fallback. */
    sourceUrl?: string;
    onStateChange?: (state: PlayerState, error?: unknown) => void;
    onMutedChange?: (muted: boolean) => void;
    /** Called when audio playback reaches the end. */
    onEnded?: () => void;
    /** Whether a next track is available (shows Next/Shuffle buttons). */
    hasNext?: boolean;
    /** Whether shuffle mode is on. */
    shuffle?: boolean;
    /** Skip to the next track. */
    onNext?: () => void;
    /** Toggle shuffle mode. */
    onToggleShuffle?: () => void;
}

// ── Styled root ──────────────────────────────────────────────────────────────

const playerStyle: React.CSSProperties = { width: "100%", height: "100%" };
const nativePlayerStyle: React.CSSProperties = { ...playerStyle, outline: "none" };

// ── HLS sub-component (video.js + hls.js) ────────────────────────────────────

function HlsPlayer({
    src,
    muted,
    parsedRequest,
    onStateChangeRef,
    onMutedChangeRef,
}: {
    src: string;
    muted?: boolean;
    parsedRequest?: ParsedHttpRequest | null;
    onStateChangeRef: React.RefObject<VPlayerProps["onStateChange"]>;
    onMutedChangeRef: React.RefObject<VPlayerProps["onMutedChange"]>;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<Player | null>(null);
    const hlsRef = useRef<Hls | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const player = videojs(video, {
            controls: true,
            autoplay: true,
            preload: "auto",
            muted: muted ?? false,
            fill: true,
        });
        playerRef.current = player;

        player.on("loadstart", () => onStateChangeRef.current?.("loading"));
        player.on("playing", () => onStateChangeRef.current?.("playing"));
        player.on("pause", () => onStateChangeRef.current?.("paused"));
        player.on("volumechange", () => onMutedChangeRef.current?.(player.muted() ?? false));
        player.on("error", () => {
            const error = player.error();
            if (error?.code === 4) {
                onStateChangeRef.current?.("unsupported format", error);
            } else {
                onStateChangeRef.current?.("error", error ?? undefined);
            }
        });

        return () => {
            hlsRef.current?.destroy();
            hlsRef.current = null;
            player.dispose();
            playerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- initialize once on mount: `muted` is the initial value, callback refs (onMutedChangeRef / onStateChangeRef) are by design — updated externally and read at callback fire time so player listeners always see latest handlers without re-init
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        hlsRef.current?.destroy();

        const hlsConfig: Partial<HlsConfig> = {};
        if (parsedRequest?.headers && Object.keys(parsedRequest.headers).length > 0) {
            hlsConfig.loader = createNodeFetchLoaderClass(parsedRequest.headers);
        }

        const hls = new Hls(hlsConfig);
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
    }, [src, parsedRequest]);

    useEffect(() => {
        if (playerRef.current) {
            playerRef.current.muted(muted ?? false);
        }
    }, [muted]);

    return <video ref={videoRef} className="video-js" style={playerStyle} />;
}

// ── Native sub-component (plain <video> for MP4/WebM/etc.) ───────────────────

/**
 * Simple native video player for non-HLS sources.
 *
 * Note: some H.264 files may stutter in Chromium due to decoder limitations
 * (e.g. non-standard resolutions, complex encoding profiles). These files
 * play fine in VLC — use the "Open in VLC" button as a fallback.
 */
function NativePlayer({
    src,
    muted,
    onStateChangeRef,
    onMutedChangeRef,
}: {
    src: string;
    muted?: boolean;
    onStateChangeRef: React.RefObject<VPlayerProps["onStateChange"]>;
    onMutedChangeRef: React.RefObject<VPlayerProps["onMutedChange"]>;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onLoadStart = () => onStateChangeRef.current?.("loading");
        const onPlaying = () => onStateChangeRef.current?.("playing");
        const onPause = () => onStateChangeRef.current?.("paused");
        const onVolumeChange = () => onMutedChangeRef.current?.(video.muted);
        const onError = () => {
            const err = video.error;
            if (err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                onStateChangeRef.current?.("unsupported format", err);
            } else {
                onStateChangeRef.current?.("error", err ?? undefined);
            }
        };

        video.addEventListener("loadstart", onLoadStart);
        video.addEventListener("playing", onPlaying);
        video.addEventListener("pause", onPause);
        video.addEventListener("volumechange", onVolumeChange);
        video.addEventListener("error", onError);

        return () => {
            video.removeEventListener("loadstart", onLoadStart);
            video.removeEventListener("playing", onPlaying);
            video.removeEventListener("pause", onPause);
            video.removeEventListener("volumechange", onVolumeChange);
            video.removeEventListener("error", onError);
        };
    }, [onStateChangeRef, onMutedChangeRef]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = muted ?? false;
        }
    }, [muted]);

    return (
        <video
            ref={videoRef}
            className="native"
            style={nativePlayerStyle}
            src={src}
            controls
            autoPlay
            muted={muted}
        />
    );
}

// ── Main component ───────────────────────────────────────────────────────────

export function VPlayer({
    src,
    format,
    muted,
    parsedRequest,
    sourceUrl,
    onStateChange,
    onMutedChange,
    onEnded,
    hasNext,
    shuffle,
    onNext,
    onToggleShuffle,
}: VPlayerProps) {
    const onStateChangeRef = useRef(onStateChange);
    const onMutedChangeRef = useRef(onMutedChange);
    const onEndedRef = useRef(onEnded);
    onStateChangeRef.current = onStateChange;
    onMutedChangeRef.current = onMutedChange;
    onEndedRef.current = onEnded;

    const isHls = format === "m3u8" && Hls.isSupported();
    const isAudio = format === "audio";

    return (
        <Panel name="vplayer-root" position="absolute" top={0} right={0} bottom={0} left={0}>
            {src && isHls && (
                <HlsPlayer
                    src={src}
                    muted={muted}
                    parsedRequest={parsedRequest}
                    onStateChangeRef={onStateChangeRef}
                    onMutedChangeRef={onMutedChangeRef}
                />
            )}
            {src && !isHls && !isAudio && (
                <NativePlayer
                    src={src}
                    muted={muted}
                    onStateChangeRef={onStateChangeRef}
                    onMutedChangeRef={onMutedChangeRef}
                />
            )}
            {src && isAudio && (
                <AudioPlayer
                    src={src}
                    muted={muted}
                    sourceUrl={sourceUrl}
                    onStateChangeRef={onStateChangeRef}
                    onMutedChangeRef={onMutedChangeRef}
                    onEndedRef={onEndedRef}
                    hasNext={hasNext}
                    shuffle={shuffle}
                    onNext={onNext}
                    onToggleShuffle={onToggleShuffle}
                />
            )}
        </Panel>
    );
}
