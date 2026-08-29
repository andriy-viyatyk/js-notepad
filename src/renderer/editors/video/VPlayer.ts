import videojs from "video.js";
// hls.js's default export is also re-exported as a named `Hls`; the default is correct here.
// eslint-disable-next-line import/no-named-as-default
import Hls from "hls.js";
import type { HlsConfig } from "hls.js";
import type Player from "video.js/dist/types/player";
import type { ParsedHttpRequest } from "../../core/utils/curl-parser";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import type { PlayerState, VideoFormat } from "./video-types";
import { createNodeFetchLoaderClass } from "./NodeFetchHlsLoader";
import { AudioPlayerView, type AudioPlayerProps } from "./AudioPlayer";
import "video.js/dist/video-js.css";
import "../../uikit/Panel/Panel.css";
import "./video-editor.css";

export interface VPlayerProps {
    src?: string;
    format?: VideoFormat;
    muted?: boolean;
    parsedRequest?: ParsedHttpRequest | null;
    sourceUrl?: string;
    onStateChange?: (state: PlayerState, error?: unknown) => void;
    onMutedChange?: (muted: boolean) => void;
    onEnded?: () => void;
    hasNext?: boolean;
    shuffle?: boolean;
    onNext?: () => void;
    onToggleShuffle?: () => void;
}

type ActiveMode = "none" | "hls" | "native" | "audio";

export class VPlayerView extends VanillaView<VPlayerProps> {
    private video!: HTMLVideoElement;
    private audioPlayer!: AudioPlayerView;
    private player: Player | null = null;
    private hls: Hls | null = null;
    private activeMode: ActiveMode = "none";
    private hlsSource = "";
    private hlsHeadersKey = "";
    private inert = false;

    public constructor(props: VPlayerProps) {
        super(props, createPanelElement({
            name: "vplayer-root",
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        }));
    }

    protected onMount(): void {
        this.video = document.createElement("video");
        this.video.dataset.part = "video-media";
        this.video.controls = true;
        this.video.autoplay = true;
        this.video.preload = "auto";
        this.video.muted = this.props.muted ?? false;

        this.audioPlayer = this.child(new AudioPlayerView(this.audioProps()));
        this.root.append(this.video, this.audioPlayer.root);
        this.audioPlayer.mount();

        this.listen(this.video, "loadstart", () => {
            if (!this.inert && this.activeMode === "native") this.props.onStateChange?.("loading");
        });
        this.listen(this.video, "playing", () => {
            if (!this.inert && this.activeMode === "native") this.props.onStateChange?.("playing");
        });
        this.listen(this.video, "pause", () => {
            if (!this.inert && this.activeMode === "native") this.props.onStateChange?.("paused");
        });
        this.listen(this.video, "volumechange", () => {
            if (!this.inert && this.activeMode === "native") this.props.onMutedChange?.(this.video.muted);
        });
        this.listen(this.video, "error", () => {
            if (this.inert || this.activeMode !== "native") return;
            const error = this.video.error;
            if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                this.props.onStateChange?.("unsupported format", error);
            } else {
                this.props.onStateChange?.("error", error ?? undefined);
            }
        });

        this.own(() => { this.inert = true; });
        this.own(() => this.disposeVideoAdapter());
        this.syncMode();
    }

    protected onUpdate(props: VPlayerProps): void {
        this.audioPlayer.update(this.audioProps());
        this.video.muted = props.muted ?? false;
        if (this.player) this.player.muted(props.muted ?? false);
        this.syncMode();
    }

    private audioProps(active = this.activeMode === "audio"): AudioPlayerProps {
        return {
            src: this.props.src ?? "",
            active,
            muted: this.props.muted,
            sourceUrl: this.props.sourceUrl,
            onStateChange: this.props.onStateChange,
            onMutedChange: this.props.onMutedChange,
            onEnded: this.props.onEnded,
            hasNext: this.props.hasNext,
            shuffle: this.props.shuffle,
            onNext: this.props.onNext,
            onToggleShuffle: this.props.onToggleShuffle,
        };
    }

    private syncMode(): void {
        const source = this.props.src ?? "";
        const wantsAudio = this.props.format === "audio";
        const wantsHls = this.props.format === "m3u8" && Hls.isSupported();
        const nextMode: ActiveMode = !source
            ? "none"
            : wantsAudio
                ? "audio"
                : wantsHls
                    ? "hls"
                    : "native";

        if (nextMode !== this.activeMode) {
            this.disposeVideoAdapter();
            this.activeMode = nextMode;
            this.hlsSource = "";
            this.hlsHeadersKey = "";
        }

        this.video.hidden = nextMode !== "hls" && nextMode !== "native";
        this.audioPlayer.update(this.audioProps(nextMode === "audio"));
        this.audioPlayer.root.hidden = nextMode !== "audio";

        if (nextMode === "hls") {
            this.ensureVideoJsPlayer();
            this.syncHlsSource(source);
        } else if (nextMode === "native") {
            this.video.className = "native";
            this.video.controls = true;
            this.video.autoplay = true;
            this.video.muted = this.props.muted ?? false;
            if (this.video.getAttribute("src") !== source) this.video.src = source;
        } else {
            this.video.removeAttribute("src");
        }
    }

    private ensureVideoJsPlayer(): void {
        if (this.player) return;
        if (this.video.parentNode !== this.root) this.root.insertBefore(this.video, this.audioPlayer.root);
        this.video.className = "video-js";
        this.player = videojs(this.video, {
            controls: true,
            autoplay: true,
            preload: "auto",
            muted: this.props.muted ?? false,
            fill: true,
        });
        // video.js owns these player callbacks and releases them with the player; they
        // must not be routed through a view store that could outlive/reuse the player.
        this.player.on("loadstart", () => { if (!this.inert) this.props.onStateChange?.("loading"); });
        this.player.on("playing", () => { if (!this.inert) this.props.onStateChange?.("playing"); });
        this.player.on("pause", () => { if (!this.inert) this.props.onStateChange?.("paused"); });
        this.player.on("volumechange", () => { if (!this.inert) this.props.onMutedChange?.(this.player?.muted() ?? false); });
        this.player.on("error", () => {
            if (this.inert) return;
            const error = this.player?.error();
            if (error?.code === 4) this.props.onStateChange?.("unsupported format", error);
            else this.props.onStateChange?.("error", error ?? undefined);
        });
    }

    private syncHlsSource(source: string): void {
        const headers = this.props.parsedRequest?.headers;
        const headersKey = headers ? JSON.stringify(headers) : "";
        if (this.hls && this.hlsSource === source && this.hlsHeadersKey === headersKey) return;

        this.hls?.destroy();
        this.hls = null;
        this.hlsSource = source;
        this.hlsHeadersKey = headersKey;

        const hlsConfig: Partial<HlsConfig> = {};
        if (headers && Object.keys(headers).length > 0) {
            hlsConfig.loader = createNodeFetchLoaderClass(headers);
        }
        const hls = new Hls(hlsConfig);
        this.hls = hls;
        hls.loadSource(source);
        hls.attachMedia(this.video);
    }

    private disposeVideoAdapter(): void {
        this.activeMode = "none";
        this.video?.pause();
        this.hls?.destroy();
        this.hls = null;
        this.hlsSource = "";
        this.hlsHeadersKey = "";
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
        this.video?.removeAttribute("src");
        this.video?.load();
        if (this.video && this.audioPlayer && this.video.parentNode !== this.root) {
            this.root.insertBefore(this.video, this.audioPlayer.root);
        }
    }
}
