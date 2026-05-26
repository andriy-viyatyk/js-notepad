# US-571 — Video editor migration

> **EPIC-028 Phase C** · walkthrough 30 closure (umbrella note — Video deferred for first-principles investigation) · **Status:** Investigation complete 2026-05-27, ready for implementation.
>
> **Risk profile:** Low-to-moderate. US-568 (PDF) established the no-host migration template AND landed the cross-cutting infrastructure (`V4_NO_HOST_EDITOR_IDS` set + `wrapLegacyForPage` `instanceof V4EditorModel` early-return); US-569 (Image) and US-570 (Archive) proved it scales. US-571 is a textbook follow-on at the lifecycle level — build the three video files (`VideoEditor.ts` + `VideoView.tsx` + `index.tsx`), update `register-editors.ts`, add **one line** (`"video-view"`) to `V4_NO_HOST_EDITOR_IDS`, and patch the single external caller (`PagesLifecycleModel.showVideoPlayerPage`). What makes Video the meatiest no-host editor is the **breadth of preserved behavior**, not new architectural surface: module-scoped `sessionMuted`, a streaming-server session lifecycle (`dispose()` cleanup), VLC integration, and a `playNext`/shuffle feature that duck-types into sibling panels' tree providers. None of these introduce new v4 patterns — they are preserved verbatim. **Scope:** 3 files in `editors/video/` (1 new class, 1 rename, 1 new index) + `register-editors.ts` + 2 single-line edits in `PagesPersistenceModel.ts` and `PagesLifecycleModel.ts` + 1 optional MCP hint.

## Goal

Migrate the Video/Audio Player from a legacy `EditorModel` constructed via the legacy `EditorModule` factories to a native v4 `EditorModel` subclass registered in the v4 `editorRegistry`. Preserve, byte-for-byte: the multi-format playback lifecycle (mp4 / m3u8 / audio), the local streaming-server session lifecycle (`createVideoStreamSession` on submit/open + `deleteVideoStreamSessionsByPage` on dispose), the VLC launcher integration, the URL/cURL input bar, the module-scoped per-window `sessionMuted` state, the PageTab mute button wiring (`pageMuted` + `toggleMuteAll`), and the audio `playNext`/shuffle "next track" feature that reads sibling tree providers from `page.secondaryEditors[]`. Drop the legacy `EditorModule` indirection — Video construction flows through `editorRegistry.createEditor("video-view")` for restore and the direct registry path (resolve → `module.newEditorModel`) for file-open / `showVideoPlayerPage`.

After US-571, Video joins Browser, PDF, Image, and Archive as the fifth member of `V4_NO_HOST_EDITOR_IDS`. `mainEditorV4 instanceof VideoEditor === true` becomes reliable across direct construction, file-open, AND restore.

## Background

### Today's surface

`src/renderer/editors/video/` — files relevant to this migration:

| File | LOC | Role | Migration impact |
|------|-----|------|------------------|
| `VideoPlayerEditor.tsx` | 543 | Legacy `EditorModel` subclass + view component + EditorModule factory bundle | **Split:** class → new `VideoEditor.ts`; view + preserved legacy module → renamed `VideoView.tsx` |
| `video-types.ts` | 30 | `VideoFormat` / `PlayerState` types + `detectVideoFormat` / `isAudioFile` | **No change** — pure helpers, model-agnostic |
| `VPlayer.tsx` | — | `<video>` element host + hls.js wiring | **No change** — props-only (`src`, `format`, `muted`, callbacks); model-agnostic |
| `AudioPlayer.tsx` / `AudioControls.tsx` / `AudioVisualizer.tsx` | — | Audio-mode UI | **No change** — props-only |
| `effects/*.ts` (`BarsEffect`, `CircularEffect`, `types`) | — | Audio-visualizer canvas effects | **No change** |
| `NodeFetchHlsLoader.ts` | — | hls.js custom loader for proxied HLS | **No change** |

There is **no `index.ts` / `index.tsx`** in `editors/video/` today — callers import `./video/VideoPlayerEditor` directly. US-571 creates `index.tsx` fresh (nothing to delete — contrast US-569's `index.ts` → `index.tsx` fold).

### Today's class shape (legacy base, `VideoPlayerEditor.tsx:26–395`)

```typescript
export interface VideoEditorState extends IEditorState {
    url: string;                              // raw video URL / file path
    inputText: string;                        // raw text as typed (may be cURL)
    format: VideoFormat;                      // "mp4" | "m3u8" | "audio"
    playerState: PlayerState;                 // "stopped" | "loading" | "playing" | ...
    pageMuted: boolean;                       // consumed by PageTab mute button
    parsedRequest: ParsedHttpRequest | null;  // parsed cURL (headers), null for plain URLs
    streamUrl: string;                        // TRANSIENT — resolved streaming-server URL
}

// Module-scoped, per-window: remembered across video player instances.
let sessionMuted = false;

const getDefaultVideoEditorState = (): VideoEditorState => ({
    ...getDefaultEditorModelState(),
    type: "videoPage" as const,
    title: "Video Player",
    editor: "video-view",
    url: "", inputText: "", format: "mp4",
    playerState: "stopped", pageMuted: sessionMuted,
    parsedRequest: null, streamUrl: "",
});

class VideoEditorModel extends EditorModel<VideoEditorState, void> {
    noLanguage = true;
    skipSave = true;
    getIcon = () => createElement(PlayerIcon, { color: DEFAULT_BROWSER_COLOR });

    setInputText = (text) => { ... };
    private resolveStreamUrl = async (url, format, parsedRequest) => { ... };  // → api.createVideoStreamSession
    submitUrl = async (text) => { ... };          // parse cURL → set state → resolve streamUrl
    async restore() { ... }                        // resolve streamUrl if playerState === "loading"
    onPlayerStateChange = (playerState) => { ... };
    onMutedChange = (muted) => { sessionMuted = muted; ... };
    toggleMuteAll = () => { ... };                 // called by PageTab mute button

    get shuffle() { return settings.get("audio-shuffle") === true; }
    toggleShuffle = () => { ... };
    get canPlayNext() { ... }                      // sourceLink.sourceId ∈ {explorer, link-category, link-tag}
    private findSourceProvider(): ITreeProvider | null { ... }   // scans page.secondaryEditors[]
    private async getSiblingTracks() { ... }
    async playNext() { ... }
    private navigateToTrack(item) { ... }          // openRawLink + sibling-panel selection sync
    private getShuffleBagNext(items, currentIndex) { ... }   // page.getTransient/setTransient

    async dispose() { await api.deleteVideoStreamSessionsByPage(pageId); ... }
    openInVlc = async () => { ... };               // api.openInVlc
    applyRestoreData(data) { ... }                 // restore persisted fields; reset transient playerState
}
```

State fields and their persistence treatment:

- **`url`, `inputText`, `format`, `pageMuted`, `parsedRequest`** — persisted (in `applyRestoreData`'s field list) and restored.
- **`playerState`** — persisted, but `applyRestoreData` resets `"loading"`/`"playing"` → `"stopped"` (transient playback state doesn't survive a restart).
- **`streamUrl`** — **transient**. Legacy `newEditorModelFromState` resets it to `""` on every load (`VideoPlayerEditor.tsx:534`). It points at an ephemeral local streaming session that no longer exists after a restart, so it must never be replayed.
- **`type: "videoPage"`** — discriminator. `deriveEditorId({ type: "videoPage" })` → `"video-view"` (legacy registry `editorType: "videoPage"` → id `"video-view"`). Pre-US-571 saved descriptors already carry `editorId: "video-view"`. Descriptor shape is stable.
- **`editor: "video-view"`** — legacy `EditorView` field; carried in state but **not functionally read** for Video (Video has no switch widget — `findCompatibleEditors()` returns `[]`). Preserved for descriptor stability.

### Today's view component (`VideoPlayerEditor.tsx:419–505`)

The toolbar is **custom** and unlike PDF/Image: it is dominated by a `flex={1}` URL/cURL `<Textarea>` with a Ctrl+Enter submit handler, preceded by an inline nav-panel `IconButton`. The body is a `<Panel>` hosting `<VPlayer>` plus a centered state badge and an "Open in VLC" button.

```tsx
<Panel name="video-player" direction="column" height="100%" background="dark" overflow="hidden">
    <EditorToolbar borderBottom>
        {(model.page?.canOpenNavigator(null, filePath) || filePath) && (
            <IconButton name="video-nav-panel" size="sm" icon={<NavPanelIcon />} title="File Explorer"
                onClick={() => model.page?.toggleNavigator(null, filePath)} />
        )}
        <Panel direction="column" flex={1} onKeyDown={/* Ctrl+Enter → submitUrl */}>
            <Textarea name="video-url-input" value={inputText} onChange={model.setInputText}
                placeholder="Enter video URL or paste cURL command... (Ctrl+Enter to play)"
                minHeight={28} maxHeight={72} size="sm" />
        </Panel>
    </EditorToolbar>
    <Panel name="video-player-area" direction="column" flex={1} align="center" justify="center" position="relative" overflow="hidden">
        {url && <VPlayer src={streamUrl} format={format} muted={muted} ... onEnded={() => model.playNext()} ... />}
        {!url && <Text size="md" color="light">Enter a video URL above to start playing</Text>}
        {showBadge && <div style={stateBadgeStyle}>{playerState}</div>}
        {showVlcButton && <Button name="video-open-vlc" variant="link" icon={<VlcIcon />} onClick={model.openInVlc}>Open in VLC</Button>}
    </Panel>
</Panel>
```

### Today's registration (`register-editors.ts:653–668`)

```typescript
editorRegistry.register({
    id: "video-view",
    name: "Video Player",
    editorType: "videoPage",
    category: "standalone",
    acceptFile: (fileName) => {
        const videoExtensions = [".mp4", ".webm", ".ogg", ".m3u8", ".m3u", ".mp3", ".wav", ".aac", ".flac", ".m4a", ".wma", ".opus", ".avi", ".mkv", ".mov"];
        if (matchesExtension(fileName, videoExtensions)) return 100;
        return -1;
    },
    loadModule: async () => {
        const module = await import("./video/VideoPlayerEditor");
        return module.default;
    },
});
```

Legacy registry only. The v4 bridge loop (`register-editors.ts:818`) mirrors this entry into the v4 registry with a **throwing `createEditor` stub** (standalone category) — replaced by the real v4 module in US-571.

### Today's construction sites

Video is constructed via four paths:

1. **`PagesLifecycleModel.openFile` / content pipeline → `createEditorFromFile` → `newEditorModelByTarget` / `newEditorModel`** — video file extensions resolve through `editors/registry` (legacy `acceptFile` returns 100) OR through `content/resolvers.ts` (`.mp4` / `.webm` / `.ogg` / `.m3u8` / `.m3u` → `{ editor: "video-view" }`, supplied to `createEditorFromFile` as `target`). Either way: `module.newEditorModel(filePath)` returns a legacy `VideoEditorModel`; `createEditorFromFile` then sets `pipe`, clears `language`, and calls `restore()`; the caller wraps via `wrapLegacyForPage`. **After US-571**, `newEditorModel(filePath)` returns a v4 `VideoEditor` cast as legacy → `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (US-568 PD-IMPL16) skips the adapter. *(Note: Video ignores the assigned `pipe` — it resolves its own streaming URL via `api.createVideoStreamSession`. Preserved.)*
2. **`PagesPersistenceModel.restorePage(desc)` legacy fallback** — **Today** `"video-view"` is NOT in `V4_NO_HOST_EDITOR_IDS` → falls through to the legacy fallback → `newEditorModelFromState` → `LegacyEditorAdapter`. **After US-571**, `"video-view"` is added to the set → the generic v4-native no-host restore branch (US-568 PD-IMPL11) fires → `v4Registry.createEditor("video-view", d.id)` → seed state → `applyRestoreData` → `restore()`. No adapter wrap.
3. **`PagesLifecycleModel.showVideoPlayerPage()`** (`PagesLifecycleModel.ts:1126–1132`) — the "Video Player" tool-launcher entry. `import("../../editors/video/VideoPlayerEditor")` → `videoModule.default.newEmptyEditorModel("videoPage")` → `addPage(wrap(model))`. Builds an empty player (no URL). **After US-571**, the import path becomes `editors/video` and `newEmptyEditorModel` returns a v4 `VideoEditor` cast as legacy; `wrap()` early-returns it.
4. **MCP `create_page` rejection** — `video-view` is `category: "standalone"`, so `mcp-handler.ts:156` already rejects `create_page` for it with the generic standalone message. US-571 optionally adds an explicit hint (VD-IMPL13) mirroring pdf/image/archive.

### Walkthrough 30 closure umbrella note (2026-05-20)

The walkthrough 30 closure table defers Video for first-principles investigation:

> **Video** — Same shape [as Browser] — no-host EditorModel; opens video/audio files.

Video resolves entirely against the standardized NH set + US-568's already-resolved PD-IMPL set with VD-IMPL retrospective additions for the Video specifics (module-scoped `sessionMuted`, streaming-session lifecycle, VLC, `playNext`/shuffle, custom toolbar, PageTab mute wiring).

### Implementation-time context (post-US-570)

- **US-548 (PageModel adapter layer) landed**: `page.attach(editor)`, slice-subscription lifecycle, `restorePage` skeleton with the `V4_NO_HOST_EDITOR_IDS` branch in place. `page.getTransient`/`setTransient`/`canOpenNavigator`/`toggleNavigator`/`secondaryEditors` all exist on the unified v4 `PageModel`.
- **US-558 / US-568 / US-569 / US-570 landed**: Browser → PDF → Image → Archive no-host migrations. `V4_NO_HOST_EDITOR_IDS` currently has 4 members. PDF/Image's `*.ts` / `*View.tsx` / `index.tsx` triple is the reference layout.
- **US-567 / US-570 landed the v4 Explorer / Link / Archive editors** that Video's `playNext` reads from. Video's duck-typed `(editor as any).treeProvider` / `.selectionState` / `.selectByHref` access over `page.secondaryEditors[]` ALREADY runs against those v4 instances today (Video-legacy reading v4 panels). Migrating Video itself does not change what it reads — only verification is required (VD-IMPL6).
- **`deriveEditorId({ type: "videoPage" })` returns `"video-view"`** — confirmed by the legacy registry mapping. Descriptor-shape stable across the migration.

### What does NOT exist in Video today

- **No sub-models** — single class.
- **No embedded editors** — Video does not construct or host another `EditorModel` (contrast Browser/US-558's bookmarks LinkEditor). It only *reads* sibling secondary editors' tree providers via duck-typing for the next-track feature.
- **No `secondaryEditor` contributions** — Video does not own a sidebar panel (contrast Archive/US-570). It is a leaf editor that *consumes* the Explorer/Link panels another editor (or the user via the nav button) attached.
- **No `beforeNavigateAway` / `onMainEditorChanged` overrides** — Video is a leaf; it does not survive navigation as a sidebar panel.
- **No scripting facade** (`page.asVideo()` does not exist).
- **No `CONTENT_HOST_TRAIT`** — no-host editor; owns its state directly.
- **No HS1 host slot** — no `IContentHost` to ride on. UX state is bounded (`pageMuted` mirrors module-scoped `sessionMuted`; the shuffle bag lives in `page` transient state).
- **`getNavigatorTarget()` override** — Video uses `PageToolbar` (VD-IMPL4) and surfaces its "File Explorer" button through the auto-rendered `NavPanelButton` via a `getNavigatorTarget()` override.

The migration is **lifecycle-only**: rewire construction + restoration to flow through the v4 native class, preserving every behavior above byte-for-byte.

---

## Implementation plan

### Step 1 — Create `VideoEditor.ts` (v4 native class)

**File:** `src/renderer/editors/video/VideoEditor.ts` (NEW, ~300 LOC).

Move the legacy class body verbatim onto the v4 base, with the persistence methods rewritten to the v4 `EditorDescriptor` / `RestoreData` contract. The module-scoped `sessionMuted` variable moves into this file (it is referenced by `onMutedChange`, `toggleMuteAll`, and `getDefaultVideoEditorState`).

```typescript
import { createElement, ReactNode } from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
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
 * `CONTENT_HOST_TRAIT`) — Video owns its state directly and resolves its
 * own streaming-server URLs rather than reading content through a `pipe`.
 *
 * Closest siblings: PdfEditor (US-568) / ImageEditor (US-569) — same no-host
 * page-mainEditor shape. Differences:
 *   - Module-scoped `sessionMuted` shared across player instances in the window.
 *   - A local streaming-server session lifecycle (created on submit/open,
 *     deleted in dispose via `api.deleteVideoStreamSessionsByPage`).
 *   - VLC integration (`openInVlc`).
 *   - A `playNext`/shuffle "next track" feature that reads sibling tree
 *     providers from `page.secondaryEditors[]` (duck-typed — these panels are
 *     contributed by the v4 Explorer/Link/Archive editors, US-567/US-570).
 *   - A custom toolbar (flex URL/cURL textarea) — Video keeps `EditorToolbar`
 *     rather than `PageToolbar` (VD-IMPL4).
 *
 * Design rationale: doc/tasks/US-571-video-editor-migration/README.md.
 */

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
    /** Resolved streaming server URL ready for VPlayer. TRANSIENT — stripped
     *  from descriptors (VD-IMPL5); re-resolved on submit/open. */
    streamUrl: string;
}

/** Last mute state within this window session — remembered across video player
 *  instances. Module-scoped (preserved from legacy `VideoPlayerEditor.tsx:48`). */
let sessionMuted = false;

export const getDefaultVideoEditorState = (): VideoEditorState => ({
    id: "",
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

export class VideoEditor extends V4EditorModel<VideoEditorState> {
    /** v4 editor identity. Matches the legacy registry id so v4
     *  EditorDescriptor.editorId and pre-US-571 saved descriptors agree. */
    readonly editorId = "video-view";

    noLanguage = true;
    skipSave = true;

    constructor(state: TComponentState<VideoEditorState>) {
        super(state);
        this.getIcon = () => createElement(PlayerIcon, { color: DEFAULT_BROWSER_COLOR });
    }

    // ── (verbatim from legacy) ──────────────────────────────────────────
    setInputText = (text: string) => { ... };
    private resolveStreamUrl = async (url, format, parsedRequest) => { ... };
    submitUrl = async (text: string) => { ... };
    onPlayerStateChange = (playerState: PlayerState) => { ... };
    onMutedChange = (muted: boolean) => { sessionMuted = muted; ... };
    toggleMuteAll = () => { ... };
    get shuffle(): boolean { ... }
    toggleShuffle = () => { ... };
    get canPlayNext(): boolean { ... }
    private findSourceProvider(): ITreeProvider | null { ... }   // scans this.page.secondaryEditors
    private async getSiblingTracks() { ... }
    async playNext(): Promise<void> { ... }
    private navigateToTrack(item: ILink): void { ... }
    private getShuffleBagNext(items, currentIndex): number { ... }   // this.page.getTransient/setTransient
    openInVlc = async () => { ... };

    /** Surface the "File Explorer" nav button through PageToolbar's
     *  NavPanelButton (VD-IMPL4). Returning `{ pipe: null, filePath }` gates
     *  on `canOpenNavigator(null, filePath)` — equivalent to the legacy
     *  `(canOpenNavigator(...) || filePath)` inline gate. */
    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        return { pipe: null, filePath: this.state.get().filePath ?? null };
    }

    /** Resolve stream URL for immediate playback (file-open path). */
    async restore(): Promise<void> {
        await super.restore();  // no-op base; called for consistency with Image/PDF
        const { url, format, parsedRequest, playerState } = this.state.get();
        if (url && playerState === "loading") {
            const streamUrl = await this.resolveStreamUrl(url, format, parsedRequest);
            this.state.update((s) => { if (s.url === url) s.streamUrl = streamUrl; });
        }
    }

    /** Clean up streaming server sessions when the tab is closed. */
    async dispose(): Promise<void> {
        const pageId = this.page?.id;
        if (pageId) {
            await api.deleteVideoStreamSessionsByPage(pageId);
        }
        await super.dispose();
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
            // Don't restore transient playback states — reset to stopped.
            if (s.playerState === "loading" || s.playerState === "playing") {
                s.playerState = "stopped";
            }
        });
    }

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // streamUrl is transient (ephemeral streaming session) — never persist.
        // Reset transient playback state so the descriptor never carries
        // "loading"/"playing" (mirrors applyRestoreData + legacy
        // newEditorModelFromState's `streamUrl: ""` reset).
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
```

> **Implementation note:** the `...` method bodies above are moved **verbatim** from `VideoPlayerEditor.tsx:74–376`. The only edits are: (a) `private resolveStreamUrl`, `submitUrl`, `findSourceProvider`, `navigateToTrack`, `getShuffleBagNext` read `this.page` exactly as before (the v4 `EditorModel` exposes the same `this.page: PageModel | null`); (b) `dispose()` calls `await super.dispose()` (v4 base) instead of the legacy base. Do not refactor the duck-typed `(editor as any)` access in `findSourceProvider` / `navigateToTrack` — see VD-IMPL6.

### Step 2 — Rename `VideoPlayerEditor.tsx` → `VideoView.tsx` and reduce to view + preserved legacy module

**File:** `src/renderer/editors/video/VideoView.tsx` (RENAMED from `VideoPlayerEditor.tsx`, ~150 LOC).

Strip the legacy class + state interface + `getDefaultVideoEditorState` + module-scoped `sessionMuted` (all moved to `VideoEditor.ts`). Keep ONLY: the inline-style constants, the React view component (re-typed `model: VideoEditor`), and the legacy `EditorModule` export (which now constructs v4 `VideoEditor` for the file-open + tool-launcher + LegacyEditorAdapter safety-net paths, mirroring `PdfView.tsx` / `ImageView.tsx`).

The view is preserved verbatim **except** two changes: the prop type changes from `VideoEditorModel` to `VideoEditor`, and the toolbar moves from the custom `EditorToolbar` to `<PageToolbar model={model} noSpacer borderBottom>` (VD-IMPL4). The inline nav-panel `IconButton` is removed — `PageToolbar`'s auto-rendered `NavPanelButton` replaces it via the `getNavigatorTarget()` override (Step 1). The flex URL/cURL textarea Panel becomes `PageToolbar`'s `children`.

```tsx
import React from "react";
import { IEditorState, EditorType } from "../../../shared/types";
import type { EditorModel } from "../base";
import { EditorModule } from "../types";
import { PageToolbar } from "../base/v4";
import { TComponentState } from "../../core/state/state";
import { Button, Panel, Text, Textarea } from "../../uikit";
import color from "../../theme/color";
import { VlcIcon } from "../../theme/icons";
import { detectVideoFormat } from "./video-types";
import { VPlayer } from "./VPlayer";
import { settings } from "../../api/settings";
import {
    VideoEditor,
    getDefaultVideoEditorState,
    type VideoEditorState,
} from "./VideoEditor";

const stateBadgeStyle: React.CSSProperties = { /* verbatim */ };
const vlcButtonContainerStyle: React.CSSProperties = { /* verbatim */ };

interface VideoViewProps { model: VideoEditor; }

export function VideoView({ model }: VideoViewProps) {
    // body as legacy VideoPlayerEditor() — VideoPlayerEditor.tsx:425–505 — with
    // the toolbar replaced:
    //
    //   <Panel name="video-player" direction="column" height="100%" background="dark" overflow="hidden">
    //       <PageToolbar name="video-toolbar" model={model} noSpacer borderBottom>
    //           <Panel direction="column" flex={1} onKeyDown={/* Ctrl+Enter → submitUrl */}>
    //               <Textarea name="video-url-input" value={inputText} onChange={model.setInputText}
    //                   placeholder="Enter video URL or paste cURL command... (Ctrl+Enter to play)"
    //                   minHeight={28} maxHeight={72} size="sm" />
    //           </Panel>
    //       </PageToolbar>
    //       <Panel name="video-player-area" ...> {/* VPlayer + badge + VLC button — verbatim */} </Panel>
    //   </Panel>
    //
    // The legacy inline nav IconButton is dropped (NavPanelButton renders it).
}

// ============================================================================
// EditorModule  (EPIC-028 / US-571 — preserved legacy shape; constructs v4
// VideoEditor cast as legacy. `wrapLegacyForPage`'s `instanceof V4EditorModel`
// early-return (US-568 PD-IMPL16) detects the v4 instance and skips the
// adapter wrap. US-559 retires this block.)
// ============================================================================

const videoEditorModule: EditorModule = {
    Editor: VideoView as unknown as EditorModule["Editor"],
    newEditorModel: async (filePath?: string) => {
        const initialState = getDefaultVideoEditorState();
        if (filePath) {
            initialState.filePath = filePath;
            initialState.inputText = filePath;
            initialState.url = filePath;
            initialState.format = detectVideoFormat(filePath);
            initialState.playerState = "loading";
        }
        return new VideoEditor(new TComponentState(initialState)) as unknown as EditorModel;
    },
    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "videoPage") return null;
        return new VideoEditor(
            new TComponentState(getDefaultVideoEditorState()),
        ) as unknown as EditorModel;
    },
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const initialState: VideoEditorState = {
            ...getDefaultVideoEditorState(),
            ...(state as Partial<VideoEditorState>),
            streamUrl: "", // always reset — streaming sessions are ephemeral
        };
        return new VideoEditor(new TComponentState(initialState)) as unknown as EditorModel;
    },
};

export default videoEditorModule;
export { VideoView };
export type { VideoViewProps };
```

Removed imports vs legacy: `getDefaultEditorModelState` / `EditorModel` (base), `EditorToolbar` (replaced by `PageToolbar`), `IconButton` + `NavPanelIcon` (nav button now auto-rendered), `PlayerIcon`, `DEFAULT_BROWSER_COLOR`, `parseHttpRequest` + `ParsedHttpRequest`, `isAudioFile`, `api`, `ui`, `app`, `createLinkData`, `fpDirname`, `ITreeProvider`/`ILink` — all moved to `VideoEditor.ts` or no longer needed. Keep only what the view + module factories use.

### Step 3 — Create `index.tsx` (v4 EditorModule + re-exports)

**File:** `src/renderer/editors/video/index.tsx` (NEW, ~45 LOC). There is no existing `index.ts` to delete.

```tsx
import { TComponentState } from "../../core/state/state";
import { VideoEditor, getDefaultVideoEditorState } from "./VideoEditor";
import { VideoView } from "./VideoView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-571 — native Video editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native VideoEditor instance.
 *
 * Video is NO-HOST (no `CONTENT_HOST_TRAIT`) — `Component` is the full player
 * (PageToolbar + VPlayer). No `<TextChrome>` wrap.
 */

function VideoEditorComponent({ model }: { model: V4EditorModel }) {
    return <VideoView model={model as VideoEditor} />;
}

export const videoModule: EditorModule = {
    createEditor: () =>
        new VideoEditor(new TComponentState(getDefaultVideoEditorState())),
    Component: VideoEditorComponent,
};

export { VideoEditor, getDefaultVideoEditorState };
export type { VideoEditorState } from "./VideoEditor";
// Compatibility aliases — retire under US-559. Keep the legacy
// `VideoEditorModel` name usable from any stale imports (mirrors US-568/569).
export { VideoEditor as VideoEditorModel } from "./VideoEditor";
export type { VideoEditorState as VideoEditorModelState } from "./VideoEditor";
// Legacy EditorModule default-export — consumed by the legacy `editorRegistry`
// `loadModule` callback (file-open + LegacyEditorAdapter safety-net) AND by
// `showVideoPlayerPage`.
export { default as videoEditorModule } from "./VideoView";
```

### Step 4 — Add `noSpacer` prop to `PageToolbar` (shared infra — VD-IMPL4)

**File:** `src/renderer/editors/base/v4/PageToolbar.tsx`

Add an opt-in `noSpacer?: boolean` prop that suppresses the auto-inserted `<Spacer />`. This lets Video (whose `children` is a `flex` URL textarea) adopt `PageToolbar` without the spacer splitting the row. Default `false` → every existing consumer (PDF / Image / Archive / TextChrome) is unchanged.

```typescript
interface PageToolbarProps {
    name?: string;
    model: EditorModel;
    children?: ReactNode;
    rightContributions?: ReactNode;
    /** Suppress the auto-inserted `<Spacer />`. For editors whose children
     *  should fill the row (e.g. Video's flex URL/cURL textarea — US-571).
     *  Default false — the spacer pushes `rightContributions` + the switch
     *  widget to the right edge. */
    noSpacer?: boolean;
    borderTop?: boolean;
    borderBottom?: boolean;
}

export function PageToolbar({ name, model, children, rightContributions, noSpacer, borderTop, borderBottom }: PageToolbarProps) {
    return (
        <EditorToolbar name={name} borderTop={borderTop} borderBottom={borderBottom}>
            <NavPanelButton model={model} />
            {children}
            {!noSpacer && <Spacer />}
            {rightContributions}
            <SwitchWidget model={model} />
        </EditorToolbar>
    );
}
```

### Step 5 — Update `register-editors.ts` — change legacy loadModule path + add v4 block

**File:** `src/renderer/editors/register-editors.ts`

**Edit 1 (legacy registration, line 664–667):** Change the `loadModule` callback to load from `./video/VideoView` (renamed file path) instead of `./video/VideoPlayerEditor`.

```typescript
    loadModule: async () => {
        // EPIC-028 / US-571 — Video migrated to native v4 module
        // (`videoModule` in `./video/index.tsx`). Legacy `videoEditorModule`
        // is PRESERVED in `VideoView.tsx` for the LegacyEditorAdapter
        // safety-net path; `wrapLegacyForPage`'s `instanceof V4EditorModel`
        // early-return (US-568 PD-IMPL16) detects the returned v4 VideoEditor
        // and skips the adapter wrap. US-559 retires this loadModule entirely.
        const module = await import("./video/VideoView");
        return module.default;
    },
```

**Edit 2 (add v4 registration after the archive-view v4 block, ~line 1379):** Mirror the image/archive v4 registration.

```typescript
// US-571 — replace the legacy bare-adapter mirror for video-view with a
// native v4 module. Video is NO-HOST (no `CONTENT_HOST_TRAIT`). The `accepts`
// predicate delegates to the legacy registry's `acceptFile` (returns 100 for
// video/audio extensions). `hasContentHost: false` keeps Video out of the
// switch widget. Today's `showVideoPlayerPage` / `openFile` still construct via
// the LEGACY registry's `module.newEditorModel` (which now returns a v4
// VideoEditor cast as legacy via `VideoView`'s preserved module);
// `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (US-568
// PD-IMPL16) skips the adapter wrap.
v4EditorRegistry.register({
    id: "video-view",
    name: "Video Player",
    hasContentHost: false,
    accepts: (input) => {
        const legacy = editorRegistry.getById("video-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { videoModule } = await import("./video");
        return videoModule;
    },
});
```

### Step 6 — Add `"video-view"` to `V4_NO_HOST_EDITOR_IDS`

**File:** `src/renderer/api/pages/PagesPersistenceModel.ts:54–59`

```typescript
const V4_NO_HOST_EDITOR_IDS = new Set([
    "browser-view", // US-558 (retroactive — see US-568 PD-IMPL11)
    "pdf-view",     // US-568
    "image-view",   // US-569
    "archive-view", // US-570 (first no-host sidebar-owning editor)
    "video-view",   // US-571 (this PR)
]);
```

Also remove the `- US-571 Video → "video-view"` line from the JSDoc comment block above the set (line 44), since the item is now in the set itself.

**No other changes to this file** — the generic restore branch (PD-IMPL11) handles `"video-view"` automatically. State seeding (`Object.assign(s, d.state)`), `applyRestoreData`, and `restore()` invocation follow the established no-host pattern. The `Object.assign` seeds `streamUrl: ""` (stripped by `getRestoreData`) and `applyRestoreData` resets `playerState` — so a restored video shows its URL but starts stopped, matching legacy.

### Step 7 — Patch `showVideoPlayerPage` caller (single external consumer)

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts:1126–1132`

```typescript
showVideoPlayerPage = async (): Promise<void> => {
    // EPIC-028 / US-571 — Video migrated to native v4 module. Import path
    // resolves to `editors/video/index.tsx`. `videoModule.default` is the
    // preserved legacy `videoEditorModule` (constructs v4 VideoEditor cast as
    // legacy). `wrap(model)` early-returns the v4 instance (US-568 PD-IMPL16).
    const videoModule = await import("../../editors/video");
    const model = await videoModule.default.newEmptyEditorModel("videoPage");
    if (model) {
        this.addPage(wrap(model));
    }
};
```

Single surface change: import path `../../editors/video/VideoPlayerEditor` → `../../editors/video`. Runtime semantics identical — `newEmptyEditorModel("videoPage")` now returns a v4 `VideoEditor` cast as legacy; `wrap()` early-returns it unwrapped.

### Step 8 — (Optional polish) Add MCP `create_page` hint for `video-view`

**File:** `src/renderer/api/mcp-handler.ts:158–162`

Mirror the pdf/image/archive hints (Video is already rejected by the generic standalone path; this just makes the error message actionable):

```typescript
            "pdf-view": 'Use execute_script with: await app.pages.openFile("/path/to/file.pdf")',
            "image-view": 'Use execute_script with: await app.pages.openFile("/path/to/image.png")',
            "archive-view": 'Use execute_script with: await app.pages.openFile("/path/to/archive.zip")',
            "video-view": 'Use execute_script with: await app.pages.openFile("/path/to/video.mp4")',
```

### Step 9 — Dashboard update

**File:** `doc/active-work.md`

Promote the US-571 entry (line 43) from the unlinked placeholder form to the linked form with a verified note (see "Dashboard entry" below). Per the epic-task deferred-review model, leave it `[ ]` (implemented-but-unreviewed).

### Step 10 — Verify no external consumers of the `VideoEditorModel` class name

Grep results at investigation time (excluding `editors/video/`):
- `VideoEditorModel` class name — **no external consumers** (only inside `VideoPlayerEditor.tsx` itself).
- `VideoPlayerEditor` component export — **no external consumers**.
- `videoEditorModule` — only `register-editors.ts` (via `loadModule` import) + `showVideoPlayerPage` (patched in Step 6).
- `video-view` string — `types.ts` (EditorView union — no change), `resolvers.ts` (extension map — no change), `tools-editors-registry.ts` (tool-launcher id — no change), `register-editors.ts` (Steps 4), `mcp-handler.ts` (Step 7), `settings.ts` (`video-stream.port` — unrelated).

The compatibility aliases in `index.tsx` cover any stale `VideoEditorModel` / `VideoEditorModelState` imports that surface during implementation.

---

## Concerns / resolved design decisions

Walkthrough 30's NH-set concerns (no-host shape, `V4_NO_HOST_EDITOR_IDS` opt-in, `wrapLegacyForPage` early-return) are pre-resolved by US-558/US-568. The following VD-IMPL items capture Video-specific decisions resolved during this investigation.

- **VD-IMPL1 — Module-scoped `sessionMuted` preserved.** The `let sessionMuted = false` lives at module scope in `VideoEditor.ts` (moved from `VideoPlayerEditor.tsx:48`). It is read by `getDefaultVideoEditorState()` (seeds new players' `pageMuted`) and written by `onMutedChange` / `toggleMuteAll`. Because every `VideoEditor` instance imports the same module, the per-window "remember mute" behavior is preserved without any cross-instance plumbing. **Resolved: keep verbatim.**

- **VD-IMPL2 — `skipSave = true` preserved.** The v4 base `EditorModel` declares `skipSave = false` (`EditorModel.ts:100`); `VideoEditor` overrides it to `true`. Video has no document content to save.

- **VD-IMPL3 — Discriminator + descriptor stability.** State keeps `type: "videoPage"` and `editor: "video-view"`. `deriveEditorId({ type: "videoPage" })` → `"video-view"` via the legacy registry `editorType` mapping (`LegacyEditorAdapter.ts:343–346`). Pre-US-571 saved descriptors already carry `editorId: "video-view"`, so the restore branch in Step 5 picks them up with **no migration shim**. `EditorStateBase extends Omit<Partial<IEditorState>, ...>`, so the `editor` / `filePath` / `sourceLink` fields remain valid on the v4 state type.

- **VD-IMPL4 — Video uses `PageToolbar` with a new `noSpacer` prop (consolidation; NO custom `EditorToolbar`).** PDF/Image/Archive moved to `PageToolbar`, and Video should too — keeping a bespoke `EditorToolbar` for one editor is not worth the divergence. The only obstacle is that Video's toolbar is dominated by a `flex={1}` URL/cURL `<Textarea>`, and `PageToolbar` *always* inserts a `<Spacer />` (also `flex`) before its right slot (`PageToolbar.tsx:43`); a flex textarea competing with a flex spacer would split the row and shrink the input. **Resolution:** add an opt-in `noSpacer?: boolean` prop to `PageToolbar` (Step 2) that suppresses the `<Spacer />`. Default `false` → every existing `PageToolbar` consumer is byte-for-byte unchanged. Video passes `noSpacer`, puts the flex textarea Panel in `children`, and contributes nothing on the right (no `rightContributions`; `SwitchWidget` already renders `null` because `findCompatibleEditors()` → `[]`). Net layout: `NavButton + [flex textarea]` — identical to the legacy toolbar. **Nav button:** Video overrides `getNavigatorTarget()` to return `{ pipe: null, filePath }`, which `NavPanelButton` treats as non-empty (`pipe` is `null`, not `undefined`) and gates on `page.canOpenNavigator(null, filePath)` — **exactly equivalent** to the legacy gate `(canOpenNavigator(null, filePath) || filePath)`, because `canOpenNavigator` already returns `true` whenever `filePath` is truthy (`PageModel.ts:559`) and the `|| filePath` adds nothing when `filePath` is falsy. The click handler `toggleNavigator(target.pipe, target.filePath)` = `toggleNavigator(null, filePath)`, matching legacy. **Resolved: add `noSpacer` to `PageToolbar`; Video adopts `PageToolbar` + `getNavigatorTarget()` override; drop the custom `EditorToolbar`.**

- **VD-IMPL5 — `streamUrl` is transient; `getRestoreData()` strips it.** `streamUrl` points at an ephemeral local streaming-server session keyed by page id — it cannot survive a restart. `getRestoreData()` serializes `streamUrl: ""` and resets transient `playerState` (`loading`/`playing` → `stopped`), mirroring the legacy `newEditorModelFromState`'s `streamUrl: ""` reset + `applyRestoreData`'s playerState reset. On restore, the generic branch's `Object.assign(s, d.state)` seeds the persisted fields, `applyRestoreData` re-asserts the playerState reset, and `restore()` skips streamUrl resolution (it only resolves when `playerState === "loading"`, which is never true post-reset). Net: a restored video shows its URL/inputText but starts stopped — **identical to legacy**.

- **VD-IMPL6 — `playNext`/shuffle duck-typing into `page.secondaryEditors[]` preserved verbatim.** `findSourceProvider` and `navigateToTrack` read `(editor as any).treeProvider` / `.selectionState` / `.selectByHref` from `page.secondaryEditors` (the `panelEditors` compat shim, `PageModel.ts:200–204`). Those panels are contributed by the v4 Explorer (`ExplorerEditor`, public `treeProvider` + `selectionState` — EX-IMPL5) and Link (`LinkEditor`, public `treeProvider` + `selectByHref`) editors, which already landed in US-567/US-570. Because Video is currently legacy and *already* reads these v4 instances at runtime today, migrating Video does not change the contract — the duck-typed access continues to resolve against the same objects. `page.getTransient`/`setTransient` (shuffle bag) exist on the v4 `PageModel` (`PageModel.ts:128–135`). **Resolved: preserve verbatim; verify the next-track + shuffle flow during user testing (acceptance criteria below).** Do not attempt to replace the `(editor as any)` casts with an `instanceof` chain — that is US-559 cleanup scope, and the providers' interfaces are not uniform.

- **VD-IMPL7 — Streaming-session cleanup in `dispose()` preserved.** `dispose()` calls `api.deleteVideoStreamSessionsByPage(this.page?.id)` before `super.dispose()`. The v4 base `dispose()` is awaited last (same ordering as legacy).

- **VD-IMPL8 — VLC integration preserved.** `openInVlc` resolves a streaming URL (for non-m3u8) then calls `api.openInVlc(vlcUrl, settings.get("vlc-path"))`, surfacing errors via `ui.textDialog`. Moved verbatim.

- **VD-IMPL9 — PageTab mute button wiring preserved (no PageTab change).** `PageTab.tsx:582` shows the sound button when `(editor as any)?.toggleMuteAll` is truthy; `PageTab.tsx:541` reads `s.pageMuted`; the click calls `(editor as any)?.toggleMuteAll?.()` (`PageTab.tsx:669`). The v4 `VideoEditor` exposes `toggleMuteAll` as a public arrow function and `pageMuted` in its state — both duck-typed reads resolve. **Resolved: no change to `PageTab.tsx`.**

- **VD-IMPL10 — Tool-launcher import path.** `showVideoPlayerPage`'s dynamic import changes from `editors/video/VideoPlayerEditor` to `editors/video` (Step 7). `tools-editors-registry.ts` references only the string id `"video-view"` and calls `pagesModel.showVideoPlayerPage()` — no change.

- **VD-IMPL11 — `pipe` assignment on file-open is harmless.** `createEditorFromFile` assigns `editor.pipe = pipe` for resolved video files (`PagesLifecycleModel.ts:379–381`). Video ignores `pipe` (it resolves its own streaming URL). The v4 base `EditorModel` carries `pipe: IContentPipe | null` as an instance field, so the assignment succeeds and is ignored — identical to legacy.

- **VD-IMPL12 — `restore()` calls `super.restore()`.** The v4 base `restore()` is a no-op override point (`EditorModel.ts:142–144`). Legacy Video's `restore()` did not call super (legacy base differed), but calling the v4 no-op is harmless and matches the Image/PDF convention. No behavior change.

- **VD-IMPL13 — MCP hint is optional polish.** `video-view` is `category: "standalone"`, already rejected by `mcp-handler.ts`. Step 8 only makes the error actionable; skippable without functional impact.

- **VD-IMPL14 — View components are model-agnostic.** `VPlayer`, `AudioPlayer`, `AudioControls`, `AudioVisualizer`, `effects/*`, `NodeFetchHlsLoader`, and `video-types.ts` take only primitives/callbacks (no `VideoEditorModel` coupling). **No changes to any of these files.**

## Acceptance criteria

1. **File-open (local).** Double-click / open a local `.mp4`, `.mkv`, `.mp3`, `.flac` → opens in the v4 Video player, resolves a streaming URL, and plays. `mainEditorV4 instanceof VideoEditor === true`.
2. **File-open (HLS / HTTP / cURL).** Paste an `.m3u8` URL or a cURL command into the input bar + Ctrl+Enter → plays (m3u8 direct; others via streaming server with parsed headers).
3. **Tool launcher.** Sidebar "Video Player" tool → opens an empty player; entering a URL plays.
4. **Restore.** Open a video, restart the app → the tab restores with its URL/inputText visible, `playerState` stopped (no auto-resume), no adapter wrap (`instanceof VideoEditor`), no stale streaming session replay.
5. **Mute memory.** Mute one player → open a second player → it starts muted (module-scoped `sessionMuted`). The PageTab mute button toggles and reflects state.
6. **Next track + shuffle.** Open an audio file from the Explorer panel and from a Link/Tag panel → `playNext` advances to the next sibling audio track on track-end and on the Next button; shuffle mode (persisted `audio-shuffle`) picks from a non-repeating bag; the source panel's selection highlight follows.
7. **VLC.** "Open in VLC" launches VLC against the streaming URL (or shows the VLC error dialog if `vlc-path` is unset/invalid).
8. **Dispose.** Closing a video tab deletes its streaming-server sessions (`deleteVideoStreamSessionsByPage`).
9. **Nav button.** The "File Explorer" toolbar button appears for file-backed videos and toggles the navigator, exactly as before.
10. **Typecheck + lint clean** on all touched files (modulo the pre-existing repo-wide `react-hooks/exhaustive-deps` "rule not found" artifact, if any view uses hooks).

## Files changed

| File | Change | Notes |
|------|--------|-------|
| `src/renderer/editors/video/VideoEditor.ts` | **NEW** (~300 LOC) | v4 native class + `VideoEditorState` + module-scoped `sessionMuted` + `getDefaultVideoEditorState`. Class body moved verbatim from legacy; persistence methods rewritten to the v4 `EditorDescriptor`/`RestoreData` contract. |
| `src/renderer/editors/video/VideoView.tsx` | **RENAME** from `VideoPlayerEditor.tsx` (~150 LOC) | View component (prop re-typed `VideoEditor`) + inline-style constants + preserved legacy `EditorModule`. Toolbar moves to `<PageToolbar noSpacer>`; nav button auto-rendered (VD-IMPL4). |
| `src/renderer/editors/video/index.tsx` | **NEW** (~45 LOC) | v4 `videoModule` (`createEditor` + `Component`) + re-exports + compatibility aliases + legacy default re-export. |
| `src/renderer/editors/base/v4/PageToolbar.tsx` | **MODIFY** (shared) | Add opt-in `noSpacer?: boolean` prop suppressing the auto `<Spacer />` (VD-IMPL4). Default `false` — all existing consumers unchanged. |
| `src/renderer/editors/register-editors.ts` | **MODIFY** | Edit 1: legacy `loadModule` path → `./video/VideoView`. Edit 2: add `video-view` v4 registration (mirror image/archive). |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | **MODIFY** (1 line + JSDoc) | Add `"video-view"` to `V4_NO_HOST_EDITOR_IDS` (5th member); remove the `- US-571 …` JSDoc line. |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | **MODIFY** (1 line) | `showVideoPlayerPage` import path → `../../editors/video`. |
| `src/renderer/api/mcp-handler.ts` | **MODIFY** (1 line, optional) | Add `video-view` create_page hint. |
| `doc/active-work.md` | **MODIFY** | Promote US-571 entry to linked + verified-note form. |

### Files that need NO changes (verified)

- `src/renderer/editors/video/video-types.ts`, `VPlayer.tsx`, `AudioPlayer.tsx`, `AudioControls.tsx`, `AudioVisualizer.tsx`, `effects/*`, `NodeFetchHlsLoader.ts` — model-agnostic (VD-IMPL14).
- `src/renderer/ui/tabs/PageTab.tsx` — mute button is duck-typed; `toggleMuteAll` + `pageMuted` preserved (VD-IMPL9).
- `src/renderer/content/resolvers.ts` — already maps video extensions to `video-view`.
- `src/renderer/ui/sidebar/tools-editors-registry.ts` — references string id `"video-view"` + `showVideoPlayerPage()`.
- `src/shared/types.ts` — `videoPage` / `video-view` unions unchanged.

## Dashboard entry

Replace `doc/active-work.md` line 43 with:

```
  - [ ] [US-571: Video editor migration](tasks/US-571-video-editor-migration/README.md) — *(investigation complete 2026-05-27, ready for implementation)* walkthrough 30 closure (Video deferred for first-principles investigation; resolves against the standardized NH set + US-568's already-resolved PD-IMPL set with VD-IMPL1–VD-IMPL14 retrospective). **Fifth no-host page-mainEditor v4-native migration after Browser/PDF/Image/Archive — the meatiest by preserved-behavior breadth, not architectural surface.** **Video specifics:** module-scoped per-window `sessionMuted` moves into `VideoEditor.ts` (VD-IMPL1); `skipSave = true` (VD-IMPL2); streaming-server session lifecycle (`createVideoStreamSession` on submit/open + `deleteVideoStreamSessionsByPage` in `dispose` — VD-IMPL7); VLC integration (VD-IMPL8); `playNext`/shuffle next-track feature reads sibling tree providers from `page.secondaryEditors[]` via duck-typing — already runs against the v4 Explorer/Link panels (US-567/US-570), preserved verbatim (VD-IMPL6); PageTab mute button stays duck-typed, no PageTab change (VD-IMPL9). **VD-IMPL4** — Video adopts `PageToolbar` (no bespoke `EditorToolbar`) via a new opt-in **`noSpacer`** prop that suppresses the mandatory `<Spacer />` (which would otherwise collide with the `flex` URL/cURL textarea); the nav button is auto-rendered through a `getNavigatorTarget()` override returning `{ pipe: null, filePath }` (≡ legacy `canOpenNavigator(null, filePath) || filePath` gate). VD-IMPL5 — `getRestoreData()` strips transient `streamUrl` + resets transient `playerState`. **Single-line infra opt-in:** add `"video-view"` to `V4_NO_HOST_EDITOR_IDS` (5th member). **Single caller patch:** `showVideoPlayerPage` import path → `editors/video`. Two new files (`VideoEditor.ts` ~300 LOC + `index.tsx` ~45 LOC); one rename (`VideoPlayerEditor.tsx` → `VideoView.tsx`); one shared prop add (`PageToolbar.noSpacer`); two single-line cross-cutting edits + one optional MCP hint. No `index.ts` to delete (none exists today).
```
