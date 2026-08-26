import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { SliderView } from "../../uikit/Slider/SliderView";
import type { SliderProps } from "../../uikit/Slider/Slider";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Slider/Slider.css";
import "./video-editor.css";

function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export interface AudioControlsProps {
    audio: HTMLAudioElement;
    playing: boolean;
    hasNext?: boolean;
    shuffle?: boolean;
    onNext?: () => void;
    onToggleShuffle?: () => void;
}

export class AudioControlsView extends VanillaView<AudioControlsProps> {
    private playButton!: IconButtonView;
    private nextButton!: IconButtonView;
    private muteButton!: IconButtonView;
    private shuffleButton!: IconButtonView;
    private seekSlider!: SliderView;
    private currentLabel!: HTMLSpanElement;
    private durationLabel!: HTMLSpanElement;
    private currentTime = 0;
    private duration = 0;
    private muted = false;
    private isSeeking = false;

    public constructor(props: AudioControlsProps) {
        super(props, createPanelElement({
            name: "audio-controls",
            height: 44,
            shrink: false,
            align: "center",
            gap: "xs",
            paddingX: "sm",
        }));
    }

    protected onMount(): void {
        this.currentLabel = this.createTimeLabel("audio-current-time");
        this.durationLabel = this.createTimeLabel("audio-duration");
        this.playButton = this.child(new IconButtonView(this.playProps()));
        this.nextButton = this.child(new IconButtonView(this.nextProps()));
        this.muteButton = this.child(new IconButtonView(this.muteProps()));
        this.shuffleButton = this.child(new IconButtonView(this.shuffleProps()));
        this.seekSlider = this.child(new SliderView(this.sliderProps()));

        this.root.append(
            this.playButton.root,
            this.nextButton.root,
            this.currentLabel,
            this.seekSlider.root,
            this.durationLabel,
            this.muteButton.root,
            this.shuffleButton.root,
        );
        this.playButton.mount();
        this.nextButton.mount();
        this.seekSlider.mount();
        this.muteButton.mount();
        this.shuffleButton.mount();

        this.listen(this.props.audio, "timeupdate", this.handleTimeUpdate);
        this.listen(this.props.audio, "loadedmetadata", this.handleDurationChange);
        this.listen(this.props.audio, "durationchange", this.handleDurationChange);
        this.listen(this.props.audio, "volumechange", this.handleVolumeChange);
        this.listen(this.props.audio, "seeked", this.handleSeeked);

        this.currentTime = this.props.audio.currentTime;
        this.duration = isFinite(this.props.audio.duration) ? this.props.audio.duration : 0;
        this.muted = this.props.audio.muted;
        this.syncProjection();
    }

    protected onUpdate(props: AudioControlsProps): void {
        this.playButton.update(this.playProps());
        this.nextButton.update(this.nextProps());
        this.muteButton.update(this.muteProps());
        this.shuffleButton.update(this.shuffleProps());
        this.seekSlider.update(this.sliderProps());
        if (props.audio !== this.props.audio) {
            this.currentTime = props.audio.currentTime;
            this.duration = isFinite(props.audio.duration) ? props.audio.duration : 0;
            this.muted = props.audio.muted;
        }
        this.syncProjection();
    }

    private createTimeLabel(part: string): HTMLSpanElement {
        const label = document.createElement("span");
        label.dataset.part = part;
        label.dataset.visibility = "parent-hover";
        return label;
    }

    private playProps(): IconButtonViewProps {
        return {
            name: "audio-play-pause",
            size: "sm",
            icon: this.props.playing ? "pause" : "play",
            title: this.props.playing ? "Pause" : "Play",
            hideUntilParentHover: true,
            onClick: this.togglePlay,
        };
    }

    private nextProps(): IconButtonViewProps {
        return {
            name: "audio-next",
            size: "sm",
            icon: "next-track",
            title: "Next Track",
            hideUntilParentHover: true,
            onClick: this.props.onNext,
        };
    }

    private muteProps(): IconButtonViewProps {
        return {
            name: "audio-mute",
            size: "sm",
            icon: this.muted ? "volume-muted" : "volume",
            title: this.muted ? "Unmute" : "Mute",
            hideUntilParentHover: true,
            onClick: this.toggleMute,
        };
    }

    private shuffleProps(): IconButtonViewProps {
        return {
            name: "audio-shuffle",
            size: "sm",
            icon: "shuffle",
            title: this.props.shuffle ? "Shuffle: On" : "Shuffle: Off",
            active: this.props.shuffle,
            hideUntilParentHover: true,
            onClick: this.props.onToggleShuffle,
        };
    }

    private sliderProps(): SliderProps {
        return {
            name: "audio-seek",
            value: this.currentTime,
            onChange: this.handleSeekChange,
            min: 0,
            max: this.duration || 0,
            step: 0.1,
            size: "sm",
            showProgress: true,
            onMouseDown: () => { this.isSeeking = true; },
            onMouseUp: () => { this.isSeeking = false; },
        };
    }

    private syncProjection(): void {
        this.currentLabel.textContent = formatTime(this.currentTime);
        this.durationLabel.textContent = formatTime(this.duration);
        this.seekSlider.update(this.sliderProps());
        this.nextButton.root.hidden = !this.props.hasNext;
        this.shuffleButton.root.hidden = !this.props.hasNext;
    }

    private readonly handleTimeUpdate = (): void => {
        if (this.isSeeking) return;
        this.currentTime = this.props.audio.currentTime;
        this.syncProjection();
    };

    private readonly handleDurationChange = (): void => {
        this.duration = isFinite(this.props.audio.duration) ? this.props.audio.duration : 0;
        this.syncProjection();
    };

    private readonly handleVolumeChange = (): void => {
        this.muted = this.props.audio.muted;
        this.muteButton.update(this.muteProps());
    };

    private readonly handleSeeked = (): void => {
        this.currentTime = this.props.audio.currentTime;
        this.isSeeking = false;
        this.syncProjection();
    };

    private readonly togglePlay = (): void => {
        if (this.props.audio.paused) this.props.audio.play().catch(() => {});
        else this.props.audio.pause();
    };

    private readonly toggleMute = (): void => {
        this.props.audio.muted = !this.props.audio.muted;
    };

    private readonly handleSeekChange = (value: number): void => {
        this.currentTime = value;
        this.props.audio.currentTime = value;
        this.syncProjection();
    };
}
