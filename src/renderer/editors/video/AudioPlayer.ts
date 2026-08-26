import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { PlayerState } from "./video-types";
import { AudioControlsView, type AudioControlsProps } from "./AudioControls";
import { AudioVisualizerView } from "./AudioVisualizer";

export interface AudioPlayerProps {
    src: string;
    active?: boolean;
    muted?: boolean;
    sourceUrl?: string;
    onStateChange?: (state: PlayerState, error?: unknown) => void;
    onMutedChange?: (muted: boolean) => void;
    onEnded?: () => void;
    hasNext?: boolean;
    shuffle?: boolean;
    onNext?: () => void;
    onToggleShuffle?: () => void;
}

export class AudioPlayerView extends VanillaView<AudioPlayerProps> {
    private visualizerArea!: HTMLDivElement;
    private audio!: HTMLAudioElement;
    private overlay!: HTMLDivElement;
    private visualizer!: AudioVisualizerView;
    private controls!: AudioControlsView;
    private playing = false;
    private active = false;

    public constructor(props: AudioPlayerProps) {
        super(props, createPanelElement({
            name: "audio-player",
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        }));
    }

    protected onMount(): void {
        this.visualizerArea = createPanelElement({
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            overflow: "hidden",
            background: "dark",
        });
        this.visualizerArea.dataset.part = "audio-visualizer-area";
        this.audio = document.createElement("audio");
        this.audio.autoplay = true;
        this.audio.muted = this.props.muted ?? false;
        this.audio.dataset.part = "audio-media";
        this.active = this.props.active !== false;

        this.visualizer = this.child(new AudioVisualizerView({
            media: this.audio,
            playing: this.playing,
            sourceUrl: this.props.sourceUrl,
        }));
        this.visualizerArea.append(this.visualizer.root);

        this.overlay = createPanelElement({
            position: "absolute",
            bottom: 20,
            left: "50%",
            width: "33%",
            minWidth: "fit-content",
        });
        this.overlay.dataset.audioOverlay = "";
        this.controls = this.child(new AudioControlsView(this.controlsProps()));
        this.overlay.append(this.controls.root);

        this.root.append(this.visualizerArea, this.audio, this.overlay);
        this.visualizer.mount();
        this.controls.mount();

        this.listen(this.audio, "loadstart", () => {
            if (!this.active) return;
            this.props.onStateChange?.("loading");
        });
        this.listen(this.audio, "playing", () => {
            if (!this.active) return;
            this.playing = true;
            this.props.onStateChange?.("playing");
            this.syncChildren();
        });
        this.listen(this.audio, "pause", () => {
            this.playing = false;
            if (!this.active) return;
            this.props.onStateChange?.("paused");
            this.syncChildren();
        });
        this.listen(this.audio, "volumechange", () => {
            if (!this.active) return;
            this.props.onMutedChange?.(this.audio.muted);
        });
        this.listen(this.audio, "ended", () => {
            if (!this.active) return;
            this.props.onEnded?.();
        });
        this.listen(this.audio, "error", () => {
            this.playing = false;
            if (!this.active) return;
            const error = this.audio.error;
            if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                this.props.onStateChange?.("unsupported format", error);
            } else {
                this.props.onStateChange?.("error", error ?? undefined);
            }
            this.syncChildren();
        });
        this.listen(this.visualizerArea, "click", this.togglePlayOnClick);

        this.syncSourceAndMute();
    }

    protected onUpdate(props: AudioPlayerProps): void {
        const wasActive = this.active;
        this.active = props.active !== false;
        this.syncSourceAndMute();
        this.syncChildren();
        if (this.active && !wasActive && this.audio.src) this.audio.play().catch(() => {});
    }

    protected onDispose(): void {
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
        this.visualizerArea = undefined as never;
        this.audio = undefined as never;
        this.overlay = undefined as never;
        this.visualizer = undefined as never;
        this.controls = undefined as never;
    }

    private syncSourceAndMute(): void {
        this.audio.autoplay = this.active;
        if (!this.active) {
            this.audio.pause();
            this.audio.removeAttribute("src");
            this.audio.load();
            this.audio.muted = this.props.muted ?? false;
            return;
        }
        const source = this.props.src;
        if (this.audio.getAttribute("src") !== source) this.audio.src = source;
        this.audio.muted = this.props.muted ?? false;
    }

    private syncChildren(): void {
        this.visualizer.update({
            media: this.audio,
            playing: this.playing,
            sourceUrl: this.props.sourceUrl,
        });
        this.controls.update(this.controlsProps());
    }

    private controlsProps(): AudioControlsProps {
        return {
            audio: this.audio,
            playing: this.playing,
            hasNext: this.props.hasNext,
            shuffle: this.props.shuffle,
            onNext: this.props.onNext,
            onToggleShuffle: this.props.onToggleShuffle,
        };
    }

    private readonly togglePlayOnClick = (): void => {
        if (this.audio.paused) this.audio.play().catch(() => {});
        else this.audio.pause();
    };
}
