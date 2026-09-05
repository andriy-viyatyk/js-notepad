# US-1314 - Media: the image surface, and a new video facade

Status: Implemented

Epic: [EPIC-086](../../epics/EPIC-086.md), task 5 of 8.

## Goal

Complete the curated scripting surface for the `image-view` editor and add the
first dedicated facade for the `video-view` editor. The implementation must make
media controls discoverable through `elements`, expose the useful media state and
actions through facades, preserve page scoping, and keep video explicitly
read-mostly.

The investigation corrects the counts in the epic table. The curated actionable
inventory is 3 image controls and 10 video controls. The table values of 9 and 14
count implementation details that do not belong in an editor facade: structural
roots, status parts, transient menu roots, gestures, or generated native media
controls. The evidence and exclusion rules are recorded below.

## Background

### Applicable decisions and conventions

EPIC-086 decision 1 makes `IEditorFacade` a discriminated union on `id`
([EPIC-086.md:63-71](../../epics/EPIC-086.md:63)); decision 8 assigns editor-owned
element lists to facades and reserves `editorSwitches`, `panels`, and `tab` for
page-level controls ([EPIC-086.md:121-132](../../epics/EPIC-086.md:121)); and
decision 10 requires ordinary file and video facades to be registered in
`FACADE_FOR_EDITOR` ([EPIC-086.md:143-151](../../epics/EPIC-086.md:143)).

Decision 11 makes video read-mostly: playback members that change what is audible
must carry a `caution`, and the surface must not add playback controls unavailable
from the UI ([EPIC-086.md:154-163](../../epics/EPIC-086.md:154)). The acceptance
target is that video can answer what is playing without `execute_script`
([EPIC-086.md:220-227](../../epics/EPIC-086.md:220)).

US-1311 established the page-scoped element contract. `createElements` accepts a
scope selector and a pre-highlight callback
([src/renderer/scripting/ai-vision/elements.ts:1-22](../../../src/renderer/scripting/ai-vision/elements.ts:1)),
and the page helper activates the page and waits for its layout before a highlight
([src/renderer/scripting/ai-vision/page-elements.ts:1-40](../../../src/renderer/scripting/ai-vision/page-elements.ts:1)).
The media facades should use those existing helpers with the editor's page id;
they should not create a second scoping mechanism.

The UI contract says to preserve existing `data-type` values and use `data-name`
for stable, user-visible controls ([doc/architecture/ui-element-contract.md:8-18](../../architecture/ui-element-contract.md:8)).
All component `name` props below become `data-name` attributes: this is true for
buttons ([src/renderer/uikit/Button/ButtonView.ts:10-24](../../../src/renderer/uikit/Button/ButtonView.ts:10)),
icon buttons ([src/renderer/uikit/IconButton/IconButtonView.ts:13-30](../../../src/renderer/uikit/IconButton/IconButtonView.ts:13)),
textareas ([src/renderer/uikit/Textarea/TextareaView.ts:21-28](../../../src/renderer/uikit/Textarea/TextareaView.ts:21)),
and sliders ([src/renderer/uikit/Slider/SliderView.ts:5-21](../../../src/renderer/uikit/Slider/SliderView.ts:5)).

### Image editor: verified inventory

The image model stores an image page with an optional source path and runtime URL
([src/renderer/editors/image/ImageEditor.ts:25-37](../../../src/renderer/editors/image/ImageEditor.ts:25));
the editor id is `image-view` ([src/renderer/editors/image/ImageEditor.ts:53-57](../../../src/renderer/editors/image/ImageEditor.ts:53)).
The view mounts an image toolbar and viewport
([src/renderer/editors/image/ImageView.ts:39-55](../../../src/renderer/editors/image/ImageView.ts:39)),
while the toolbar already declares three actionable controls:

| `data-name` | Purpose | Visibility and evidence |
| --- | --- | --- |
| `image-save` | Open the image save menu. | The control is declared at `ImageToolbarView.ts:35-41`; it is hidden when the runtime URL is absent at `ImageToolbarView.ts:105-114`. |
| `image-open-draw` | Open the current image in the Drawing Editor. | Declared at `ImageToolbarView.ts:42-48` and handled at `ImageToolbarView.ts:163-165`; it remains mounted when there is no source, but the model action returns without work at `ImageEditor.ts:258-284`. |
| `image-copy` | Copy the rendered image to the clipboard as PNG. | Declared at `ImageToolbarView.ts:49-55` and delegated at `ImageToolbarView.ts:167-169`; the viewport action returns when no image is mounted at `ImageViewportView.ts:190-197`. |

The save control opens the transient `image-save-menu`, whose two choices are
`Save as .png` and `Save original` ([ImageToolbarView.ts:84-130](../../../src/renderer/editors/image/ImageToolbarView.ts:84)).
The PNG path is implemented by `savePngViaDialog` and the native dialog title is
`Save Image` ([src/renderer/editors/shared/image-export.ts:66-84](../../../src/renderer/editors/shared/image-export.ts:66));
the model also exposes `saveAsPng` and `saveOriginal`
([ImageEditor.ts:209-256](../../../src/renderer/editors/image/ImageEditor.ts:209)).
The current facade exposes only `savePngToFile`
([src/renderer/scripting/api-wrapper/ImageEditorFacade.ts:1-38](../../../src/renderer/scripting/api-wrapper/ImageEditorFacade.ts:1)),
so the dialog actions, Drawing Editor action, clipboard action, and source state
are missing facade members.

The following names are deliberately not image elements:

| Name or UI detail | Reason for exclusion |
| --- | --- |
| `image-toolbar` | Structural toolbar name, declared by `ImageView.ts:39-55`; page/editor structure is not an image action. |
| `image-save-menu` | Transient menu root, created at `ImageToolbarView.ts:116-130`; its menu items are described in `$help`, not returned as persistent elements. |
| `image-view` and `zoom-indicator` | The viewport has `data-type="image-view"` and a `data-part="zoom-indicator"` at `ImageViewportView.ts:41-70`; these identify the surface/status, not named controls. The existing `data-type` must not be renamed. |
| Zoom, pan, fit, and copy keyboard gesture | These are viewport gestures and view-local state. Their implementation is at `ImageViewportView.ts:107-175` and the model state is at `ImageViewportModel.ts:24-48`; there is no app-owned named control to expose. |

Therefore image has 3 curated elements, not 9. No image `data-name` attribute
needs to be added: all three actionable roots already have stable names.

### Video editor: verified model and view surface

The video editor id is `video-view`; it is a no-language, no-save editor
([src/renderer/editors/video/VideoEditor.ts:71-76](../../../src/renderer/editors/video/VideoEditor.ts:71)).
Its persisted/runtime model state contains the raw `url`, entered `inputText`,
`format`, `playerState`, persistent `pageMuted`, parsed request, and transient
resolved `streamUrl` ([VideoEditor.ts:27-48](../../../src/renderer/editors/video/VideoEditor.ts:27)).
The allowed format and player-state values are defined at
[video-types.ts:1-11](../../../src/renderer/editors/video/video-types.ts:1).

| Readable surface | Source and proposed facade meaning |
| --- | --- |
| Source | `source` is the model's raw `state.url`, normalized to `undefined` when the model's initial empty-string sentinel is present; URL/cURL submission trims and parses the input at `VideoEditor.ts:83-141`. `streamUrl` remains an internal resolved transport URL because it is transient and is not persisted at `VideoEditor.ts:431-450`. |
| Format | `format` is `mp4`, `m3u8`, or `audio`, from `VideoEditorState` and `VideoFormat` at `VideoEditor.ts:27-47` and `video-types.ts:1-5`. |
| Model playback state | `playerState` is updated from player callbacks at `VideoEditor.ts:157-167`; values include stopped, loading, playing, paused, unsupported format, and error. |
| Model mute state | `pageMuted` is updated by player callbacks and `toggleMuteAll` at `VideoEditor.ts:157-174`. It is the persistent page/session mute state, not a replacement for live media properties. |
| Live duration/time/paused/volume/muted/rate | These properties are not in `VideoEditorState`. `VPlayerView` creates a real `<video>` at `VPlayer.ts:55-65`; audio mode creates a real `<audio>` at `AudioPlayer.ts:41-78`. The view must hand the active `HTMLMediaElement` to `VideoEditor`; the facade reads the model's handoff synchronously. |
| Tracks/subtitles | No video implementation creates a `<track>` element or reads `textTracks`; repository search found no track surface under `src/renderer/editors/video/`. Do not add a `tracks` or subtitles member in this task. |
| Media lifecycle | The media elements are created in `VPlayerView.onMount` at `VPlayer.ts:55-65`; the active audio/video mode is switched and inactive media is hidden at `VPlayer.ts:117-151`. Before the view mounts, the DOM-derived getters are `undefined`; after mount they return the latest synchronous browser values. `duration` must normalize `NaN`/infinity before metadata to `undefined`. |
| Asynchronous updates | Browser events are wired to player callbacks at `VPlayer.ts:67-92` and `AudioPlayer.ts:80-117`. Reads themselves do not require `await`; metadata and playback values become current asynchronously as those events occur. |

Design decision: use a view-to-model media-element handoff, not a
`data-part` DOM query. Add `VideoEditor.setMediaElement(element:
HTMLMediaElement | null)` and a nullable model field. This follows the existing
view-to-model patterns `MarkdownEditor.setContainer(el: HTMLDivElement | null)`
([src/renderer/editors/markdown/MarkdownEditor.ts:126-130](../../../src/renderer/editors/markdown/MarkdownEditor.ts:126))
and `TextFileModel.setEditorOverlayRef(ref)`
([src/renderer/editors/text/TextEditorModel.ts:248-252](../../../src/renderer/editors/text/TextEditorModel.ts:248)).

`VPlayerView` hands the video element to the model when it mounts and clears its
handoff on teardown or before a mode switch, using the element creation and mode
switch points at `VPlayer.ts:55-65,117-151`. `AudioPlayer` hands its audio element
to the same model and clears it on teardown or when audio mode is left, using
`AudioPlayer.ts:41-78`. Mode-switch ordering must clear the previous owner before
installing the new active element. `mediaMounted` is then a null check on the
model field, not a query; page scoping is no longer a concern for reads because
the element belongs to the model that owns the page. A torn-down or unmounted
player reports `undefined` for DOM-derived values because the handoff is explicitly
cleared. The video.js adapter still wraps the same video element and supplies
generated controls at `VPlayer.ts:154-177`; those generated controls have no stable
app-owned `data-name` contract and must not be added to `elements`.

Command decision: the facade also does not activate or switch to the owning page
before `play()`, `seek()`, or `playNext()`. Activation remains a highlight-only
operation through `activatePageAndWaitForLayout`; silently switching tabs to make
an off-screen command visible would be a more surprising side effect than allowing
an explicitly cautioned command to affect an open inactive page. The help and
`caution` text for those members must state that playback may affect or start from
such a page.

The video view's app-owned controls are:

| `data-name` | Purpose | Visibility and evidence |
| --- | --- | --- |
| `video-url-input` | Enter a URL, local source, or cURL request and submit it with Enter. | Declared at `VideoView.ts:66-67` and wired at `VideoView.ts:160-176`; mounted with the video page, subject to normal page-slot visibility. |
| `video-open-vlc` | Open the current source in VLC when in-browser playback is unsupported or errored. | Declared at `VideoView.ts:90-96`; its container is shown only when a URL exists and player state is not loading, playing, or stopped at `VideoView.ts:196-205`. |
| `audio-play-pause` | Toggle audio playback. | Declared at `AudioControls.ts:108-116`; the audio player is active only for audio format at `VPlayer.ts:117-149`. |
| `audio-next` | Navigate to the next discovered sibling track. | Declared at `AudioControls.ts:119-127`; hidden when `hasNext` is false at `AudioControls.ts:168-174`, with discovery represented by `VideoEditor.ts:188-275`. |
| `audio-mute` | Toggle audio mute. | Declared at `AudioControls.ts:130-138`; available in audio mode. |
| `audio-shuffle` | Toggle playlist shuffle. | Declared at `AudioControls.ts:141-150`; available with the audio controls and backed by the `audio-shuffle` setting at `VideoEditor.ts:178-186`. |
| `audio-seek` | Seek within the audio track. | Declared at `AudioControls.ts:153-165` and applied to `currentTime` at `AudioControls.ts:176-210`; available in audio mode. |
| `visualizer-bars` | Select the Bars audio visualizer. | The effect is implemented at `AudioVisualizer.ts:100-104`; the named button is created at `AudioVisualizer.ts:192-203`, while the visualizer is part of the audio player. |
| `visualizer-circular` | Select the Circular audio visualizer. | Same effect and button evidence: `AudioVisualizer.ts:100-104,192-203`. |
| `visualizer-none` | Disable the audio visualizer. | Same effect and button evidence: `AudioVisualizer.ts:100-104,192-203`. |

The view has 10 curated actionable elements, not 14. The raw names that are
excluded are `video-player`, `video-player-area`, `video-toolbar`, `vplayer-root`,
`audio-player`, `audio-controls`, and `audio-visualizer`: they are structural roots
at `VideoView.ts:34-57`, `VPlayer.ts:44-65`, `AudioPlayer.ts:21-39`, and
`AudioControls.ts:27-48`. `audio-current-time` and `audio-duration` are status
labels at `AudioControls.ts:51-84`, and `video-media`/`audio-media` are media
`data-part` values at `VPlayer.ts:55-65` and `AudioPlayer.ts:41-78`. None is a
curated element. No `data-name` attribute needs to be added, and the existing
`data-type` values must remain unchanged.

### Current facade and typing gap

`PageWrapper.editor` chooses a factory from `FACADE_FOR_EDITOR` and otherwise
returns `GenericEditorFacade` ([src/renderer/scripting/api-wrapper/PageWrapper.ts:40-64](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts:40)).
Because `video-view` has no factory, it currently receives that generic fallback;
the fallback only carries `id`, `name`, and `summarize()`
([src/renderer/scripting/api-wrapper/GenericEditorFacade.ts:1-24](../../../src/renderer/scripting/api-wrapper/GenericEditorFacade.ts:1)).

The canonical API types currently import/register image and the other existing
facades but not video: `IFacadeEditorId` and `IEditorFacade` are at
[page.d.ts:1-34](../../../src/renderer/api/types/page.d.ts:1). The generated
`assets/editor-types/*.d.ts` files are copies of these source typings; the copy
plugin and its build hook are configured at
[vite.renderer.config.ts:8-47](../../../vite.renderer.config.ts:8). They must be
regenerated with `npm run build-prod` (the script is at
[package.json:7-14](../../../package.json:7)); generated files must never be hand
edited.

## Implementation Plan

### 1. Finish `ImageEditorFacade` and its elements

Extend `ImageEditorFacade.ts` with the following exact public surface:

| Member | Type/behaviour |
| --- | --- |
| `id` | Literal `"image-view"`. |
| `name` | Page-provided editor name. |
| `source` | Optional read-only source string, `state.filePath || state.url || undefined`; it is `undefined` when neither optional state value is meaningful. `filePath` is the original path when available and `url` is the loaded/runtime fallback, as defined at `ImageEditor.ts:25-37`. |
| `savePngToFile(filePath)` | Existing headless PNG export; retain its `caution` because it writes a file. The existing implementation is at `ImageEditorFacade.ts:34-36`. |
| `saveAsPng()` | Invoke the existing dialog-backed PNG save action at `ImageEditor.ts:209-216`. |
| `saveOriginal()` | Invoke the existing original-byte save action at `ImageEditor.ts:218-256`. |
| `openInDrawingEditor()` | Invoke the existing Drawing Editor navigation at `ImageEditor.ts:258-284`. |
| `copyImageToClipboard()` | Copy the loaded/rasterized image as PNG, matching the toolbar's `ImageViewportView.ts:190-197` behaviour. The implementation should share a helper with the viewport so the facade and UI do not diverge. |
| `elements` | Read-only array of `{ name, purpose, selector, visible }` for the three names in the image inventory above, created with page scope. |
| `highlight(name, message?)` | Highlight one of those three controls; activate the owning page and wait for its layout before drawing, using the shared `createElements` helper. |

The facade descriptor and `summarize()` must continue to include both `id` and
`name`, matching the existing image descriptor at `ImageEditorFacade.ts:21-30` and
the EPIC-086 identity decision. The help text must explain the source, three
actions, conditional save visibility, and the transient save menu; it must not
describe zoom gestures as named elements.

The shared clipboard helper belongs with the existing PNG helpers in
`src/renderer/editors/shared/image-export.ts`, and the viewport should delegate
through it from `ImageViewportView.ts:190-197`. This keeps the new facade action
consistent with the established browser clipboard path without exposing the
view-local `Image` object to scripting.

The element factory should follow this shape, with the image list replacing the
placeholder name:

```ts
const elements = createElements(IMAGE_ELEMENTS, ui.highlightElement.bind(ui), {
  scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
  beforeHighlight: pageId
    ? () => activatePageAndWaitForLayout(pageId)
    : undefined,
});
```

The exact helper names and options are already established by
`src/renderer/scripting/ai-vision/page-elements.ts:5-40`; the implementation must
preserve its page-layout timeout diagnostics.

### 2. Add the new `VideoEditorFacade`

Create `src/renderer/scripting/api-wrapper/VideoEditorFacade.ts`. The facade is
the public read-mostly bridge for the model and the media element handed to that
model by its views.
Its exact proposed members are:

| Member | Type/behaviour |
| --- | --- |
| `id`, `name` | Identity; `id` is literal `"video-view"`. |
| `source` | Optional read-only raw `VideoEditorState.url`; the model initializes its internal sentinel as `""` at `VideoEditor.ts:50-66`, but the facade reports `undefined` before a source is submitted. |
| `format` | Read-only `"mp4" | "m3u8" | "audio"`. |
| `playerState` | Read-only `PlayerState`, including loading/error/unsupported states. |
| `pageMuted` | Read-only model/session mute state. |
| `mediaMounted` | Whether the model's handed-off active `<video>` or `<audio>` element is non-null. |
| `duration`, `currentTime`, `paused`, `volume`, `muted`, `playbackRate` | Read-only live `HTMLMediaElement` values. Each is `undefined` before mount or when no media element is available; non-finite `duration` is normalized to `undefined`. These getters read synchronously; browser events update the underlying values asynchronously. |
| `canPlayNext` | Read-only result of `VideoEditor.canPlayNext` at `VideoEditor.ts:188-192`. |
| `shuffle` | Read-only global `audio-shuffle` setting exposed by the model getter at `VideoEditor.ts:178-186`; two open video pages report the same setting. |
| `visualizerEffect` | Read-only global `"bars" | "circular" | "none"` setting, matching the setting and the three named buttons created at `AudioVisualizer.ts:192-203`; it is not per-page state. |
| `submitUrl(text)` | Submit a URL/cURL string through the existing model flow at `VideoEditor.ts:83-141`; mark `caution` because it replaces the current source and starts loading a new one, which can change what is audible. |
| `play()` | Call `HTMLMediaElement.play()` on the handed-off active media element; return its promise and mark `caution` because it changes audible playback and may start playback from a page that is not on screen. The facade does not activate or switch pages. |
| `pause()` | Pause the handed-off active media element; mark `caution` because it changes audible playback. |
| `seek(time)` | Set active media `currentTime`; mark `caution` because it changes audible playback and may affect playback from a page that is not on screen. The facade does not activate or switch pages. |
| `toggleMute()` | Invoke the model's `toggleMuteAll()` at `VideoEditor.ts:169-174`; mark `caution`. |
| `playNext()` | Invoke the existing sibling-track navigation at `VideoEditor.ts:253-275`; mark `caution` because it changes the source and may start playback from a page that is not on screen. The facade does not activate or switch pages. Retain its no-next/no-source behaviour. |
| `toggleShuffle()` | Invoke the existing global shuffle setting action at `VideoEditor.ts:178-186`; mark `caution` because it changes the setting for all video pages, not because it directly changes audio. |
| `setVisualizerEffect(effect)` | Set the existing global visualizer-effect setting used by `AudioVisualizer.ts:220-238`; explicitly do not add `caution`: this is a purely visual setting change, not an audible playback mutation. |
| `openInVlc()` | Invoke the existing VLC fallback at `VideoEditor.ts:377-402`; mark `caution` because it launches an external player. |
| `elements` | Read-only array of `{ name, purpose, selector, visible }` for the 10 curated names in the video inventory above, with page scope. |
| `highlight(name, message?)` | Highlight one of those 10 controls; activate the owning page and wait for its layout before drawing, using the shared `createElements` helper. |

The facade must not add `setVolume`, `setPlaybackRate`, subtitle/track methods,
or invented video playback buttons. The UI exposes native/video.js video controls
through the media element at `VPlayer.ts:55-65,154-177`; audio exposes only the
named play/pause, seek, mute, next, shuffle, and visualizer controls at
`AudioControls.ts:108-165` and `AudioVisualizer.ts:192-203`. Thus the proposed
facade mirrors reachable capabilities and keeps video read-mostly. Any facade
method that changes audible playback carries a visible `caution` in its help and
descriptor metadata.

The `IAiMember` summaries for `shuffle`, `toggleShuffle`, `visualizerEffect`, and
`setVisualizerEffect` must explicitly call these global settings, not page-local
state: `shuffle`/`toggleShuffle` affect every video editor sharing the
`audio-shuffle` setting, while `visualizerEffect`/`setVisualizerEffect` affect the
shared `visualizer-effect` setting. The latter remains without `caution` because
it changes only visual rendering.

The live-media accessor reads the nullable element field populated by
`VideoEditor.setMediaElement`; it has no `document.querySelector`, `data-part`,
page-id, or `format` selector branch. It must return `undefined` before
`VPlayerView.onMount` hands off an element and after the owning view clears the
handoff, and it must not await mounting for a getter. Since `duration` can be
`NaN` or `Infinity` before metadata or for an unbounded stream, normalize only
that value; report valid zero/one values unchanged. Methods that require a media
element have a settled failure contract: `play()` rejects with an error and
synchronous `pause()`/`seek()` throw a clear "requires a mounted media element"
error when the handoff is null. The model-backed actions (`submitUrl`, mute, next,
shuffle, visualizer selection, and VLC) retain their existing model behaviour and
do not require the media element. `$help` must state this distinction.

The descriptor and `summarize()` must include `{ id: "video-view", name }`, not
just a kind label. The summary should identify the current source/format and
state, and should say that live playback properties are available when the media
element is mounted.

### 3. Register the facade and canonical typings

Update `src/renderer/scripting/api-wrapper/PageWrapper.ts` to:

1. import `VideoEditor` and `VideoEditorFacade`;
2. add `VideoEditorFacade` to the `EditorFacade` union; and
3. add a `"video-view"` factory to `FACADE_FOR_EDITOR`.

The factory must pass the actual editor model, id, and page-provided name in the
same way as the image factory. Once registered, `PageWrapper.editor` will no longer
fall through to `new GenericEditorFacade` for `video-view` at
`PageWrapper.ts:141-149`.

Add canonical `src/renderer/api/types/video-editor.d.ts` and update
`src/renderer/api/types/page.d.ts` so that:

```ts
// Before:
type IFacadeEditorId = /* existing ids */ | "image-view";
type IEditorFacade = /* existing facades */ | IImageEditor | IGenericEditor;

// After:
type IFacadeEditorId = /* existing ids */ | "image-view" | "video-view";
type IEditorFacade = /* existing facades */ | IImageEditor | IVideoEditor | IGenericEditor;
```

The actual patch must retain the repository's existing union formatting and all
other members. `IVideoEditor` must be discriminated by `id: "video-view"`, and
its declaration must match the facade members above, including the literal format,
player-state, visualizer-effect, optional live-media values, methods, `elements`,
and `highlight`.

Update `src/renderer/api/types/image-editor.d.ts` at the same time: declare
`readonly source?: string` and the completed image actions, `elements` value
shape, and `highlight(name, message?)` listed in step 1. The optional type is
intentional: `ImageEditorState.url` is optional at
`src/renderer/editors/image/ImageEditor.ts:25-37`, so no-source state must remain
`undefined` in the facade and its canonical declaration.

Run `npm run build-prod` to regenerate `assets/editor-types/*.d.ts` through the
configured Vite copy step. Verify the generated video type and page union; do not
hand-edit anything under `assets/editor-types/`.

### 4. Document help, menus, and dialogs

Image `$help` must name the `image-save-menu` and its `Save as .png` / `Save
original` choices, explain that `image-save` is hidden without a loaded URL, and
describe the Drawing Editor and clipboard actions. The source evidence is
`ImageToolbarView.ts:84-130`, `ImageEditor.ts:209-284`, and
`ImageViewportView.ts:190-197`.

Video `$help` must name:

- the `video-url-input`, VLC fallback, audio controls, and visualizer controls;
- the page-tab context menu as the owner of standard Pin/Close/Duplicate/Open in
  New Window actions (`src/renderer/editors/base/PageTabView.ts:481-530`), not the
  video facade;
- the `VLC Error` read-only text dialog opened after an external-player failure
  (`VideoEditor.ts:377-402`, with the dialog adapter at
  `src/renderer/scripting/dialogs/text.ts:5-38`); and
- the fact that no video-specific `onGetMenuItems` contribution exists because the
  base model returns the normal content-host result and `VideoEditor` does not
  override it (`src/renderer/editors/base/EditorModel.ts:246-256`).

The help must also state that `tracks`/subtitles are not currently surfaced and
that live media values can be unavailable before mount. It must say that
`shuffle` and `visualizerEffect` are global settings: two open video pages read
the same values, and changing either affects the other video pages
(`VideoEditor.ts:178-186`, `AudioVisualizer.ts:220-238`). It must also state that
the facade never activates or switches pages for a command: `play()`, `seek()`,
and `playNext()` can therefore affect or start audible playback on an open page
that is not on screen, and the corresponding `caution` text makes that risk
explicit. A missing handed-off media element makes `play()` reject and
`pause()`/`seek()` throw the documented mounted-media error. `setVisualizerEffect`
has no `caution` because it changes only visual rendering. Transient menus and the
error dialog belong in help, not in `elements`.

### 5. Propose media QA coverage

Create `qa/surfaces/editors/media.md` using the same call-oriented format as
`qa/surfaces/page.md:1-20`: each scenario has `Test`, `Preparation`, `Call`, and
`Verify`; no unit tests or test harnesses are introduced.

The proposed scenarios are:

| Test | Coverage |
| --- | --- |
| M.1 Image inventory and scope | Open image pages with and without a source; verify exactly `image-save`, `image-open-draw`, and `image-copy`; verify save visibility and page-scoped discovery/highlighting. |
| M.2 Image facade actions | Verify source/identity and `summarize()` include id/name; exercise PNG save, original save, Drawing Editor, clipboard, and the transient save menu; verify no-source no-op/error behaviour is documented. |
| M.3 Video identity and model state | Open MP4, HLS, and audio sources; verify `id`, `name`, source, format, player state, page mute, `canPlayNext`, shuffle, and summary without `execute_script`. |
| M.4 Video live media state | Check getters before mount, after mount, after metadata, while playing/paused, after seek/mute, and in audio mode; verify synchronous reads, undefined pre-mount values, finite-duration normalization, and independent model handoffs when multiple media pages are open. |
| M.5 Video elements and read-mostly actions | Verify exactly the 10 curated names and their conditional visibility; exercise URL submission, reachable playback actions, next/shuffle, visualizer selection, and VLC fallback; verify audible/external actions are marked `caution` and no rate/subtitle controls are invented. |
| M.6 Video dialogs and menus | Trigger VLC failure and verify the named `VLC Error` dialog; verify standard tab context-menu actions remain page-owned and no media transient menu is incorrectly returned as an element. |

Each call should use the scripting surface and UI interactions available in the
existing surface-QA workflow. The scenarios should record expected conditional
visibility rather than treating a hidden audio/VLC control as a missing element.

### 6. Apply mandatory project constraints during implementation

The implementation plan is subject to these repository constraints from
`doc/agents-common.md`:

- no unit tests or test harnesses for this task;
- no hardcoded colours; use `theme`/`color` tokens only if UI styling changes;
- use `errMessage` when catching unknown values, as already done by image export
  (`src/renderer/editors/shared/image-export.ts:66-84`) and VLC handling
  (`VideoEditor.ts:377-402`);
- use `file-path` for path operations instead of `require("path")`;
- use dynamic `import()` for editor code, including any new facade-to-editor
  runtime imports, following the existing scripting API pattern; and
- edit only the scoped implementation files and the new QA document. Do not edit
  `doc/active-work.md` or `doc/epics/EPIC-086.md`; the orchestrator owns both.

## Concerns

1. **Epic counts are not element counts.** The source has 3 named image actions
   and 10 named video actions. Counting roots, status labels, `data-part` media,
   transient menus, or generated native controls would make `elements` unstable
   and violate the curated actionable-control rule. The epic table should be
   corrected by the orchestrator, not by this task document's implementation.

2. **Media state has two owners.** Source/format/player state/mute live in the
   `VideoEditor` model, while duration/time/paused/volume/muted/rate live on the
   mounted browser media element. The facade must label the latter as optional and
   read it through a page-scoped DOM bridge; it must not pretend the model contains
   those values.

3. **Mounting is asynchronous, reads are not.** The facade getters should never
   await a mount or silently activate another page. They return `undefined` for an
   absent media element and read synchronous browser properties when present;
   callers can observe updated values after media events.

4. **Video is intentionally read-mostly.** `play`, `pause`, `seek`, mute, next,
   shuffle, and external VLC launch are included only because corresponding UI
   capabilities exist. Every action changing audible playback or launching VLC
   must carry `caution`. Volume-rate setters and subtitles/tracks remain out of
   scope because the current UI and model do not offer them.

5. **Image clipboard code is view-local today.** The toolbar calls the viewport,
   and the viewport owns the mounted `Image` at `ImageViewportView.ts:18-24`.
   A shared image-export helper is needed so a facade action does not duplicate a
   subtly different conversion path. Zoom/pan/fit remain view-local and are not
   facade members.

6. **Conditional elements are expected.** `createElements` reports visibility
   from the page-scoped DOM, so hidden image save, VLC, audio, and next/shuffle
   controls should remain in the inventory with `visible: false` when their
   conditions are not met. The QA document must verify both visible and hidden
   states.

7. **Generated typings are a build artifact.** The canonical declarations are
   under `src/renderer/api/types/`; `assets/editor-types/` is regenerated by
   `npm run build-prod`. A manually edited generated file would be overwritten.

8. **The epic table is stale.** The verified curated counts are image 3 and video
   10, while EPIC-086 still records image 9 and video 14 in its editor-family
   table ([EPIC-086.md:38-46](../../epics/EPIC-086.md:38)). The orchestrator must
   correct that table; this task document does not edit `doc/epics/EPIC-086.md`.

## Acceptance Criteria

- [x] `ImageEditorFacade` exposes the complete agreed image state/actions,
  retains file export, includes the three curated elements, and has help for the
  save menu and conditional visibility.
- [x] A new `VideoEditorFacade.ts` is implemented and is the registered facade for
  `video-view`; `video-view` no longer falls back to `GenericEditorFacade`.
- [x] The video facade exposes model state and live media state through the
  model-owned view handoff,
  documents synchronous getters and undefined-before-mount behaviour, and does
  not claim subtitles/tracks that the editor does not implement. Live media state
  is obtained from the model's nullable view handoff, never from a `data-part`
  DOM query.
- [x] `source` is optional in both media facades and canonical declarations:
  neither facade fabricates `""` when no source exists.
- [x] Video actions mirror existing reachable UI capabilities only; playback and
  external-player actions carry `caution`, and no volume-rate or invented playback
  controls are added.
- [x] `submitUrl` carries `caution`; `setVisualizerEffect` explicitly has no
  `caution` because it is purely visual. Help and member summaries identify
  `shuffle` and `visualizerEffect` as global settings and explain inactive-page
  playback risk for `play`, `seek`, and `playNext`.
- [x] `elements` contains exactly 3 image names and 10 video names, with the
  conditional visibility described in this document. No existing `data-type` is
  renamed; no unnecessary `data-name` is added.
- [x] `PageWrapper.ts` imports/registers the video facade and includes it in the
  `EditorFacade` union and `FACADE_FOR_EDITOR` map.
- [x] Canonical API declarations add `IVideoEditor`, include the
  `"video-view"` discriminant in `IFacadeEditorId`, and include `IVideoEditor` in
  `IEditorFacade`; `npm run build-prod` regenerates matching assets.
- [x] `$help` names the image save menu, page-tab context menu ownership, VLC
  error dialog, conditional media controls, and absent track/subtitle surface.
- [x] `qa/surfaces/editors/media.md` contains the M.1-M.6 call-oriented scenarios
  and introduces no unit tests or test harnesses.
- [x] Implementation follows the required `theme`/`color`, `errMessage`,
  `file-path`, and dynamic `import()` constraints.

## Files that need NO changes

These files already provide the required contract or UI names and should remain
unchanged unless implementation verification discovers a direct defect:

- `src/renderer/scripting/ai-vision/elements.ts` - generic scoped element
  discovery/highlighting already exists at `elements.ts:1-151`.
- `src/renderer/scripting/ai-vision/page-elements.ts` - page activation and layout
  wait already exist at `page-elements.ts:1-40`.
- `src/renderer/editors/video/VideoView.ts` - all app-owned video names already
  exist at `VideoView.ts:66-96,160-193`; the facade can query existing media parts.
- `src/renderer/editors/video/AudioControls.ts` and `AudioVisualizer.ts` - the
  named audio/visualizer controls already exist at `AudioControls.ts:108-165` and
  `AudioVisualizer.ts:192-203`.
- `src/renderer/editors/base/PageToolbarView.ts` - page `panels` and
  `editorSwitches` ownership already exists at `PageToolbarView.ts:76-217,219-330`.
- `src/renderer/editors/base/EditorModel.ts` and `PageTabView.ts` - generic menu
  ownership and standard tab menu actions already exist at `EditorModel.ts:246-256`
  and `PageTabView.ts:481-530`.
- `doc/architecture/ui-element-contract.md` - the existing `data-name`,
  `data-type`, and page identity rules already cover this work.
- `doc/active-work.md` and `doc/epics/EPIC-086.md` - explicitly orchestrator-owned;
  this task document does not modify them.
- `assets/editor-types/` - generated output is regenerated by the build command;
  no generated declaration is hand-edited.

## Files Changed summary

| File | Planned change |
| --- | --- |
| `src/renderer/scripting/api-wrapper/ImageEditorFacade.ts` | Add image source/actions/help/elements while preserving identity and PNG export. |
| `src/renderer/scripting/api-wrapper/VideoEditorFacade.ts` | New read-mostly video facade, model-handoff media getters, actions, help, summary, and elements. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Import, union, and register `VideoEditorFacade` for `video-view`. |
| `src/renderer/editors/video/VideoEditor.ts` | Store the nullable active media element and expose the view-to-model handoff setter. |
| `src/renderer/editors/video/VPlayer.ts` | Hand the video element to `VideoEditor` on mount/mode activation and clear it on teardown/mode change. |
| `src/renderer/editors/video/AudioPlayer.ts` | Hand the audio element to `VideoEditor` on audio activation and clear it on teardown/mode change. |
| `src/renderer/editors/shared/image-export.ts` | Add a shared clipboard path for facade and viewport PNG copying. |
| `src/renderer/uikit/ImageViewport/ImageViewportView.ts` | Delegate existing viewport clipboard work to the shared image-export helper. |
| `src/renderer/api/types/image-editor.d.ts` | Add the completed image facade members. |
| `src/renderer/api/types/video-editor.d.ts` | New canonical `IVideoEditor` declaration. |
| `src/renderer/api/types/page.d.ts` | Add the `video-view` discriminant and `IVideoEditor` union member. |
| `assets/editor-types/*.d.ts` | Regenerated by `npm run build-prod`; never hand-edited. |
| `qa/surfaces/editors/media.md` | New call-oriented media surface QA scenarios. |
