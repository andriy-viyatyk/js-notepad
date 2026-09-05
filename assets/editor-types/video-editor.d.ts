import type { IHighlightResult } from "./ui";

/** IVideoEditor — read-mostly script interface for the Video Player. */
export interface IVideoEditor {
    readonly id: "video-view";
    readonly name: string;
    /** The raw submitted URL or path, or undefined before a source is submitted. */
    readonly source?: string;
    /** Detected source format. */
    readonly format: "mp4" | "m3u8" | "audio";
    /** Current player lifecycle state. */
    readonly playerState: "stopped" | "loading" | "playing" | "paused" | "unsupported format" | "error";
    /** Persistent page/session mute state. */
    readonly pageMuted: boolean;
    /** Whether the active video or audio element has been handed off by the mounted view. */
    readonly mediaMounted: boolean;
    /** Live media duration in seconds, or undefined before finite metadata is available. */
    readonly duration: number | undefined;
    /** Live media current time in seconds, or undefined before a media element is mounted. */
    readonly currentTime: number | undefined;
    /** Whether the live media element is paused, or undefined before it is mounted. */
    readonly paused: boolean | undefined;
    /** Live media volume from 0 to 1, or undefined before a media element is mounted. */
    readonly volume: number | undefined;
    /** Whether the live media element is muted, or undefined before it is mounted. */
    readonly muted: boolean | undefined;
    /** Live media playback rate, or undefined before a media element is mounted. */
    readonly playbackRate: number | undefined;
    /** Whether a discoverable sibling track exists for the current source. */
    readonly canPlayNext: boolean;
    /** Global audio-shuffle setting shared by every video editor page. */
    readonly shuffle: boolean;
    /** Global visualizer-effect setting shared by every video editor page. */
    readonly visualizerEffect: "bars" | "circular" | "none";
    /** Submit a URL, local source, or cURL request and load it as the new source. */
    submitUrl(text: string): Promise<void>;
    /** Start playback on the mounted active media element. */
    play(): Promise<void>;
    /** Pause playback on the mounted active media element. */
    pause(): void;
    /** Set the current time on the mounted active media element. */
    seek(time: number): void;
    /** Toggle the page/session mute state. */
    toggleMute(): void;
    /** Navigate to the next discovered sibling track. */
    playNext(): Promise<void>;
    /** Toggle the global audio-shuffle setting for all video editor pages. */
    toggleShuffle(): void;
    /** Set the global visualizer-effect setting. */
    setVisualizerEffect(effect: "bars" | "circular" | "none"): void;
    /** Open the current source in VLC. */
    openInVlc(): Promise<void>;
    /** Curated persistent controls owned by this video surface, with live visibility. */
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    /** Highlight one curated video control by name. */
    highlight(name: string, message?: string): Promise<IHighlightResult>;
}
