import { createElement } from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence-v4";
import type { IContentPipe } from "../../api/types/io.pipe";
import { PlayerIcon } from "../../theme/icons";
import { DEFAULT_BROWSER_COLOR } from "../../theme/palette-colors";
import type { ParsedHttpRequest } from "../../core/utils/curl-parser";
import { parseHttpRequest } from "../../core/utils/curl-parser";
import { detectVideoFormat, isAudioFile } from "./video-types";
import type { VideoFormat, PlayerState } from "./video-types";
import { api } from "../../../ipc/renderer/api";
import { settings } from "../../api/settings";
import { ui } from "../../api/ui";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { fpDirname } from "../../core/utils/file-path";
import type { ITreeProvider, ILink } from "../../api/types/io.tree";

/**
 * EPIC-028 / US-571 — native v4 Video/Audio player. NO-HOST editor (no
 * `CONTENT_HOST_TRAIT`) — Video owns its state directly and resolves its own
 * streaming-server URLs rather than reading content through a `pipe`.
 *
 * Closest siblings: PdfEditor (US-568) / ImageEditor (US-569) — same no-host
 * page-mainEditor shape. Differences:
 *   - Module-scoped `sessionMuted` shared across player instances in the window.
 *   - A local streaming-server session lifecycle (created on submit/open,
 *     deleted in dispose via `api.deleteVideoStreamSessionsByPage`).
 *   - VLC integration (`openInVlc`).
 *   - A `playNext`/shuffle "next track" feature that reads sibling tree
 *     providers from `page.panelEditors[]` (duck-typed — those panels are
 *     contributed by the v4 Explorer/Link/Archive editors, US-567/US-570).
 *   - Uses `PageToolbar` with the `noSpacer` prop (VD-IMPL4) — the nav button
 *     is auto-rendered via the `getNavigatorTarget()` override below.
 *
 * Design rationale: doc/tasks/US-571-video-editor-migration/README.md.
 */

// ── State ────────────────────────────────────────────────────────────────────

export interface VideoEditorState extends EditorStateBase {
    /** Discriminator — preserved for `deriveEditorId` and pre-US-571 saved
     *  descriptors (VD-IMPL3). `deriveEditorId({type:"videoPage"})` === "video-view". */
    type: "videoPage";
    /** Raw video URL as entered by user (file path or HTTP URL). */
    url: string;
    /** Raw text as typed by user (may be a cURL command). */
    inputText: string;
    /** Detected video format based on URL. */
    format: VideoFormat;
    /** Current player lifecycle state. */
    playerState: PlayerState;
    /** Whether the player is muted. Consumed by PageTab for the mute button. */
    pageMuted: boolean;
    /** Parsed HTTP request from cURL input. Null for plain URLs. */
    parsedRequest: ParsedHttpRequest | null;
    /**
     * Resolved streaming server URL ready for VPlayer to play.
     * Empty string while being resolved or when no video is loaded.
     * Transient — not persisted across app restarts (VD-IMPL5).
     */
    streamUrl: string;
}

/** Last mute state within this window session — remembered across video player
 *  instances. Module-scoped (preserved from legacy `VideoPlayerEditor.tsx:48`). */
let sessionMuted = false;

export const getDefaultVideoEditorState = (): VideoEditorState => ({
    id: crypto.randomUUID(),
    title: "Video Player",
    modified: false,
    type: "videoPage",
    editor: "video-view",
    url: "",
    inputText: "",
    format: "mp4",
    playerState: "stopped",
    pageMuted: sessionMuted,
    parsedRequest: null,
    streamUrl: "",
});

// ── Model ────────────────────────────────────────────────────────────────────

export class VideoEditor extends EditorModel<VideoEditorState> {
    /** v4 editor identity. Matches the legacy registry id so v4
     *  EditorDescriptor.editorId and pre-US-571 saved descriptors agree. */
    readonly editorId = "video-view";

    noLanguage = true;
    skipSave = true;

    constructor(state: TComponentState<VideoEditorState>) {
        super(state);
        this.getIcon = () => createElement(PlayerIcon, { color: DEFAULT_BROWSER_COLOR });
    }

    /** Update raw input text as user types. */
    setInputText = (text: string) => {
        this.state.update((s) => { s.inputText = text; });
    };

    /**
     * Resolve a raw URL/path to a streaming server URL for smooth playback.
     * M3U8 sources are returned as-is (hls.js handles them natively).
     * All other sources (MP4, local files) are proxied through the local
     * streaming server, which provides HTTP range request support.
     */
    private resolveStreamUrl = async (
        url: string,
        format: VideoFormat,
        parsedRequest: ParsedHttpRequest | null,
    ): Promise<string> => {
        if (format === "m3u8") return url;
        try {
            const isHttpUrl = url.startsWith("http://") || url.startsWith("https://");
            const sessionConfig = isHttpUrl
                ? { url, headers: parsedRequest?.headers, pageId: this.page?.id }
                : { filePath: url, pageId: this.page?.id };
            const { streamingUrl } = await api.createVideoStreamSession(
                sessionConfig,
                settings.get("video-stream.port"),
            );
            return streamingUrl;
        } catch {
            return url; // fallback to direct URL if streaming server fails
        }
    };

    /** Submit input text as a video URL. Resolves stream URL before VPlayer loads. */
    submitUrl = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const parsed = parseHttpRequest(trimmed);
        const resolvedUrl = parsed ? parsed.url : trimmed;
        const format = detectVideoFormat(resolvedUrl);

        this.state.update((s) => {
            s.inputText = trimmed;
            s.url = resolvedUrl;
            s.format = format;
            s.parsedRequest = parsed ?? null;
            s.playerState = "loading";
            s.streamUrl = format === "m3u8" ? resolvedUrl : "";
        });

        if (format !== "m3u8") {
            const streamUrl = await this.resolveStreamUrl(resolvedUrl, format, parsed ?? null);
            // Only update if URL hasn't changed while resolving
            this.state.update((s) => {
                if (s.url === resolvedUrl) {
                    s.streamUrl = streamUrl;
                }
            });
        }
    };

    /** Called after model creation when opening a file — resolves stream URL for immediate playback. */
    async restore(): Promise<void> {
        await super.restore();
        const { url, format, parsedRequest, playerState } = this.state.get();
        if (url && playerState === "loading") {
            const streamUrl = await this.resolveStreamUrl(url, format, parsedRequest);
            this.state.update((s) => {
                if (s.url === url) {
                    s.streamUrl = streamUrl;
                }
            });
        }
    }

    /** Called by VPlayer (US-413) when player state changes. (VPlayer's
     *  `onStateChange` may pass an error arg; it's unused here.) */
    onPlayerStateChange = (playerState: PlayerState) => {
        this.state.update((s) => { s.playerState = playerState; });
    };

    /** Called by VPlayer (US-413) when muted state changes. */
    onMutedChange = (muted: boolean) => {
        sessionMuted = muted;
        this.state.update((s) => { s.pageMuted = muted; });
    };

    /** Toggle mute — called by PageTab mute button. */
    toggleMuteAll = () => {
        const newMuted = !this.state.get().pageMuted;
        sessionMuted = newMuted;
        this.state.update((s) => { s.pageMuted = newMuted; });
    };

    // ── Next track / shuffle ──────────────────────────────────────

    /** Whether shuffle mode is enabled (persisted in app.settings). */
    get shuffle(): boolean {
        return settings.get("audio-shuffle") === true;
    }

    /** Toggle shuffle mode. */
    toggleShuffle = () => {
        settings.set("audio-shuffle", !this.shuffle);
    };

    /** Whether the player can potentially play a next track (has a source provider). */
    get canPlayNext(): boolean {
        const sourceId = this.state.get().sourceLink?.sourceId;
        return sourceId === "explorer" || sourceId === "link-category" || sourceId === "link-tag";
    }

    /**
     * Find the ITreeProvider that provided the currently playing track.
     * Scans page.panelEditors[] matching sourceLink.sourceId.
     */
    private findSourceProvider(): ITreeProvider | null {
        const page = this.page;
        if (!page) return null;
        const sourceId = this.state.get().sourceLink?.sourceId;
        if (!sourceId) return null;

        for (const editor of page.panelEditors) {
            if (!("treeProvider" in editor)) continue;
            const tp = (editor as any).treeProvider as ITreeProvider | null; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (sourceId === "explorer" && tp?.type === "file") return tp;
            if ((sourceId === "link-category" || sourceId === "link-tag") && tp?.type === "link") return tp;
        }
        return null;
    }

    /**
     * List audio files in the same directory/category as the current track.
     * Returns the list and the index of the current track within it.
     */
    private async getSiblingTracks(): Promise<{ items: ILink[]; currentIndex: number } | null> {
        const provider = this.findSourceProvider();
        if (!provider) return null;

        const { sourceLink, url } = this.state.get();
        const sourceId = sourceLink?.sourceId;

        // Tag-based listing: getTagItems handles both specific tag and "All" (empty = no filter)
        if (sourceId === "link-tag" && provider.getTagItems) {
            const tag = sourceLink?.selectedTag ?? "";
            const allItems = provider.getTagItems(tag);
            const audioItems = allItems.filter((item) => !item.isDirectory && isAudioFile(item.href));
            if (audioItems.length === 0) return null;
            const currentHref = (url || sourceLink?.href || "").toLowerCase();
            const currentIndex = audioItems.findIndex((item) => item.href.toLowerCase() === currentHref);
            return { items: audioItems, currentIndex };
        }

        let parentPath: string;
        if (provider.type === "file") {
            parentPath = fpDirname(url || sourceLink?.href || "");
            if (!parentPath) return null;
        } else {
            parentPath = sourceLink?.category ?? provider.rootPath;
        }

        const allItems = await provider.list(parentPath);
        const audioItems = allItems.filter((item) => !item.isDirectory && isAudioFile(item.href));
        if (audioItems.length === 0) return null;

        const currentHref = (url || sourceLink?.href || "").toLowerCase();
        const currentIndex = audioItems.findIndex((item) => item.href.toLowerCase() === currentHref);

        return { items: audioItems, currentIndex };
    }

    /** Play the next (or random) track from the source provider. */
    async playNext(): Promise<void> {
        const result = await this.getSiblingTracks();
        if (!result || result.items.length <= 1) return;

        const { items, currentIndex } = result;
        let nextIndex: number;

        if (this.shuffle) {
            nextIndex = this.getShuffleBagNext(items, currentIndex);
        } else {
            nextIndex = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0;
        }

        const nextItem = items[nextIndex];
        this.navigateToTrack(nextItem);
    }

    /** Navigate to a new track via the openRawLink pipeline. */
    private navigateToTrack(item: ILink): void {
        const provider = this.findSourceProvider();
        if (!provider) return;

        const sourceId = this.state.get().sourceLink?.sourceId;
        const pageId = this.page?.id;
        const navUrl = provider.getNavigationUrl(item);

        // Update the source panel's selection highlight.
        // Explorer uses synchronous selectionState (works before navigation).
        // Link panels use selectByHref → vm.selectLink which must run AFTER navigation
        // completes, otherwise the openRawLink pipeline's synchronous state changes
        // cause React to batch-render with a stale selectedLinkId snapshot.
        if (this.page) {
            for (const editor of this.page.panelEditors) {
                if (!("treeProvider" in editor)) continue;
                const tp = (editor as any).treeProvider; // eslint-disable-line @typescript-eslint/no-explicit-any
                if (sourceId === "explorer" && tp?.type === "file" && "selectionState" in editor) {
                    (editor as any).selectionState.set({ selectedHref: item.href }); // eslint-disable-line @typescript-eslint/no-explicit-any
                }
            }
        }

        const page = this.page;
        const itemHref = item.href;
        app.events.openRawLink.sendAsync(
            createLinkData(navUrl, {
                pageId,
                sourceId,
                category: item.category,
                selectedTag: sourceId === "link-tag"
                    ? this.state.get().sourceLink?.selectedTag
                    : undefined,
                target: item.target || undefined,
                title: item.title,
            }),
        ).then(() => {
            // Update link panel selection AFTER navigation completes.
            // Use requestAnimationFrame to ensure React has flushed the navigation
            // render before we trigger another state update for selection.
            requestAnimationFrame(() => {
                if (!page) return;
                for (const editor of page.panelEditors) {
                    if (!("treeProvider" in editor) || !("selectByHref" in editor)) continue;
                    const tp = (editor as any).treeProvider; // eslint-disable-line @typescript-eslint/no-explicit-any
                    if ((sourceId === "link-category" || sourceId === "link-tag") && tp?.type === "link") {
                        (editor as any).selectByHref(itemHref); // eslint-disable-line @typescript-eslint/no-explicit-any
                    }
                }
            });
        });
    }

    /**
     * Pick the next index from a shuffle bag stored in page transient state.
     * The bag is a shuffled array of indices. When exhausted, it reshuffles.
     */
    private getShuffleBagNext(items: ILink[], currentIndex: number): number {
        const page = this.page;
        if (!page) return 0;

        const key = "audio-shuffle-bag";
        let bag = page.getTransient<number[]>(key);

        // Invalidate bag if track count changed
        if (bag && bag.length > items.length) bag = null;

        if (!bag || bag.length === 0) {
            bag = Array.from({ length: items.length }, (_, i) => i)
                .filter((i) => i !== currentIndex);
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
        }

        const nextIndex = bag.shift() ?? 0;
        page.setTransient(key, bag);
        return nextIndex;
    }

    /** Clean up streaming server sessions when the editor tab is closed. */
    async dispose(): Promise<void> {
        const pageId = this.page?.id;
        if (pageId) {
            await api.deleteVideoStreamSessionsByPage(pageId);
        }
        await super.dispose();
    }

    /** Open the current video in VLC. Uses the local streaming server for HTTP sources. */
    openInVlc = async () => {
        const { url, format, parsedRequest } = this.state.get();
        if (!url) return;

        try {
            let vlcUrl = url;

            if (format !== "m3u8") {
                const isHttpUrl = url.startsWith("http://") || url.startsWith("https://");
                const sessionConfig = isHttpUrl
                    ? { url, headers: parsedRequest?.headers, pageId: this.page?.id }
                    : { filePath: url, pageId: this.page?.id };
                const { streamingUrl } = await api.createVideoStreamSession(
                    sessionConfig,
                    settings.get("video-stream.port"),
                );
                vlcUrl = streamingUrl;
            }

            await api.openInVlc(vlcUrl, settings.get("vlc-path"));
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            ui.textDialog({ title: "VLC Error", text: message, readOnly: true });
        }
    };

    /** Surface the "File Explorer" nav button through PageToolbar's
     *  NavPanelButton (VD-IMPL4). Returning `{ pipe: null, filePath }` gates on
     *  `canOpenNavigator(null, filePath)` — equivalent to the legacy
     *  `(canOpenNavigator(...) || filePath)` inline gate. */
    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        return { pipe: null, filePath: this.state.get().filePath ?? null };
    }

    applyRestoreData(data: RestoreData<VideoEditorState>): void {
        super.applyRestoreData(data);
        const fields: (keyof VideoEditorState)[] = [
            "url", "inputText", "format", "playerState", "pageMuted", "parsedRequest",
        ];
        this.state.update((s) => {
            for (const key of fields) {
                if (key in data) {
                    (s as unknown as Record<string, unknown>)[key] =
                        (data as unknown as Record<string, unknown>)[key as string];
                }
            }
            // Don't restore transient states — reset to stopped
            if (s.playerState === "loading" || s.playerState === "playing") {
                s.playerState = "stopped";
            }
        });
    }

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // streamUrl is transient (ephemeral streaming session) — never persist.
        // Reset transient playback state so the descriptor never carries
        // "loading"/"playing" (mirrors applyRestoreData + the legacy
        // newEditorModelFromState `streamUrl: ""` reset).
        const playerState =
            s.playerState === "loading" || s.playerState === "playing"
                ? "stopped"
                : s.playerState;
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                playerState,
                streamUrl: "",
            } as unknown as Record<string, unknown>,
        };
    }
}
