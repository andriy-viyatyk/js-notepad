# US-1117: Convert the `video` editor to the vanilla View arm

## Goal

Convert the `video` editor from the React `EditorModule.Component` arm to the
framework-free `EditorModule.View` arm. Preserve URL/cURL input, HLS/video.js,
native video, audio playback, visualizer, controls, next-track navigation, VLC
fallback, and restore behavior while making the opened editor contribute zero
live React roots instead of one.

This is an epic task in [EPIC-068](../../epics/EPIC-068.md), E10. Its dashboard
entry already exists and stays unchecked. Do not implement, commit, add tests,
or run `/review`, `/document`, or `/userdoc` for this task.

## Background

### Registration and surface

`src/renderer/editors/video/index.tsx:1-34` imports `VideoView`, defines the
generic `VideoEditorComponent` wrapper at `:8-10`, and registers it as
`Component` at `:12-29`. The replacement is `index.ts` with `View:
VideoEditorView` and no `Component`; preserve the factories and exports.

The React surface is 1,050 JSX lines across five files:

| File | Lines | Responsibility |
|---|---:|---|
| `src/renderer/editors/video/AudioVisualizer.tsx` | 331 | canvas, metadata, effects, `AudioContext`/`AnalyserNode`, rAF |
| `src/renderer/editors/video/VPlayer.tsx` | 259 | HLS/video.js, native video, audio-mode dispatch |
| `src/renderer/editors/video/AudioPlayer.tsx` | 164 | audio element, playback state, overlay, audio children |
| `src/renderer/editors/video/AudioControls.tsx` | 155 | time/mute state, seek slider, playback buttons |
| `src/renderer/editors/video/VideoView.tsx` | 107 | page toolbar, URL input, player area, status/VLC overlays |

`VideoEditor` owns durable state and commands in
`src/renderer/editors/video/VideoEditor.ts:26-434`. The state fields consumed by
the view are `url`, `streamUrl`, `inputText`, `format`, `playerState`,
`pageMuted`, and `parsedRequest` (`:26-46`). `submitUrl()` writes the input and
playback fields in one update (`:114-140`); `restore()` may publish
`streamUrl` after an async stream-session lookup (`:142-153`). A vanilla view
must push these changes to existing children because model-state writes do not
call `VanillaView.onUpdate()`.

`VideoView.tsx:50-103` has one outer `Panel` named `video-player`, with column
direction, full height, dark background, and hidden overflow. It renders a
`PageToolbar` at `:52` named `video-toolbar`, with `noSpacer` and
`borderBottom`; `noSpacer` is load-bearing because its URL/cURL textarea fills
the row (`:53-71`). The player area and its overlays follow at `:72-102`.

### Root and layout decision

The React surface already has one outer Panel, not multiple page-column
siblings. The native editor view must therefore adopt a real Panel root made by
`createPanelElement`/`applyPanelAttributes` from
`src/renderer/uikit/Panel/panel-style.ts:303-357`. Do not use a
`display: contents` root: the editor root is the full-height flex column and
its box owns the player area and overlays. Preserve `data-type="panel"`,
`data-name="video-player"`, `direction="column"`, `height="100%"`,
`data-bg="dark"`, and `overflow="hidden"`.

The constructor creates only this stable root. Child DOM, observers, listeners,
subscriptions, media adapters, and timers are created in `onMount()`. Children
are claimed with `this.child(...)`, mounted once, and updated in place. Every
`<video>` and `<audio>` element is created once and survives source, mute, and
format updates; only attributes, visibility, and adapter state may change.

### Established conversion rules

Follow the completed task documents US-1112 through US-1116 and the native-view
rules in `src/renderer/uikit/CLAUDE.md`:

- `bind(state, selector, apply)` has three arguments and is legal only from
  `onMount()` onward; selectors must enumerate exactly the old reactive fields.
- A subscription source that can change uses an explicit replaceable unsubscribe
  field: unsubscribe, resubscribe, and apply the current value immediately.
- `createComponentModelDriver` is required for a retained component model, but
  it must have no `effect()` registrations. These five files have no
  `useComponentModel`; their local transient state belongs in view fields.
- A repeatedly refilled slot must receive a persistent element, never a
  `DocumentFragment`. `PageToolbarView.onUpdate()` refills both slots at
  `src/renderer/editors/base/PageToolbarView.ts:420-427`.
- Observers, listeners, timers, and rAF setup happen in `onMount()` and are
  released through `this.own()`/`this.listen()`. Children are not manually
  disposed in a custom hook merely to duplicate `this.child(...)` ownership.

Native arms are available for `PageToolbarView`
(`src/renderer/editors/base/PageToolbarView.ts:364-464`), `IconButtonView`
(`src/renderer/uikit/IconButton/IconButtonView.tsx:14-16`), `ButtonView`
(`src/renderer/uikit/Button/ButtonView.tsx:11-12,35`), `SliderView`
(`src/renderer/uikit/Slider/SliderView.tsx:8`), and `TextareaView`
(`src/renderer/uikit/Textarea/TextareaView.ts:27`). `Panel` has no
`PanelView` (`src/renderer/uikit/Panel/Panel.tsx:11-15`), so use its style
helpers. `Text` has no native class (`src/renderer/uikit/Text/Text.tsx:18-64`),
so use `createTextElement()` from
`src/renderer/uikit/Text/text-style.ts:100-107`.

## Reactive-read audit

This is the exhaustive audit of all five React files, including `useRef` and
service hooks. Every row must have an explicit native field, event listener,
binding, or lifecycle consequence; no read may disappear during conversion.

| File:line | React read | Field/value | Native replacement |
|---|---|---|---|
| `AudioVisualizer.tsx:187` | `useRef` | canvas element | one canvas field created in `onMount()` |
| `AudioVisualizer.tsx:188` | `useRef` | `AudioContext` | `audioContext` field; close once on dispose |
| `AudioVisualizer.tsx:189` | `useRef` | `AnalyserNode` | `analyser` field; clear after context teardown |
| `AudioVisualizer.tsx:190` | `useRef` | pending frame id | `rafId` field with owned cancellation |
| `AudioVisualizer.tsx:191` | `settings.use("visualizer-effect")` | persisted effect selection | subscribe to `settings.onChanged`, filter this key, and apply current `settings.get()` immediately |
| `AudioVisualizer.tsx:192` | `useRef` | selected effect instance | `effect` field; dispose before replacement and on final teardown |
| `AudioVisualizer.tsx:193` | `useState` | `trackInfo` | fields plus direct overlay text projection |
| `AudioVisualizer.tsx:194` | `useState` | `pageVisible` | field updated by owned `IntersectionObserver` |
| `AudioVisualizer.tsx:197-206` | `useEffect` | canvas intersection observer | construct in `onMount()`, disconnect through `own()` |
| `AudioVisualizer.tsx:209-212` | `useEffect` | selected effect dependency | settings-change handler replaces the effect and synchronizes canvas/loop |
| `AudioVisualizer.tsx:215-235` | `useEffect` | media, `sourceUrl`; loadedmetadata/emptied | listeners on the stable audio element; remove on dispose; metadata reads current media-session data and source URL |
| `AudioVisualizer.tsx:238-254` | `useEffect` | `playing`, media; lazy context/analyser | on active playback create the graph once for the stable audio element |
| `AudioVisualizer.tsx:257-261` | `useEffect` | `playing`, suspended context | resume the existing context; guard late async completion after disposal |
| `AudioVisualizer.tsx:264-294` | `useEffect` | `playing`, effect, visibility, canvas/analyser | centralized start/stop synchronization; draw uses current theme and layout |
| `AudioVisualizer.tsx:297-304` | `useEffect` | unmount cleanup | owned teardown cancels frame, closes context, clears analyser/effect/DOM fields |
| `AudioVisualizer.tsx:289` | `themeState.get()` inside rAF | current `isDark` | read at draw time; do not capture a stale theme |
| `AudioVisualizer.tsx:325` | click callback | selected effect command | native effect-button handler calls `settings.set()` and stops propagation |
| `VPlayer.tsx:60` | `useRef` | HLS video element | one persistent `HTMLVideoElement` |
| `VPlayer.tsx:61` | `useRef` | video.js Player | view field; dispose adapter without replacing the media node |
| `VPlayer.tsx:62` | `useRef` | Hls instance | replaceable field; destroy before a new source and on dispose |
| `VPlayer.tsx:64-97` | `useEffect` | video node, initial mute, player events | initialize video.js once after mount; current callback fields; owned disposal |
| `VPlayer.tsx:99-114` | `useEffect` | `src`, `parsedRequest` | destroy/recreate only HLS instance and load current source on the same video node |
| `VPlayer.tsx:116-120` | `useEffect` | `muted` | update existing video.js player's mute state |
| `VPlayer.tsx:145` | `useRef` | native video element | same persistent video node as HLS/native mode |
| `VPlayer.tsx:147-177` | `useEffect` | native video events and callback refs | install listeners once; call current callback fields; own removal |
| `VPlayer.tsx:179-183` | `useEffect` | native `muted` | set `video.muted` in place |
| `VPlayer.tsx:214` | `useRef` | `onStateChange` | callback field updated in `onUpdate()` |
| `VPlayer.tsx:215` | `useRef` | `onMutedChange` | callback field updated in `onUpdate()` |
| `VPlayer.tsx:216` | `useRef` | `onEnded` | callback field updated in `onUpdate()` |
| `VPlayer.tsx:217-219` | ref assignment | latest callback identities | direct prop-pump assignment; event handlers read fields at fire time |
| `VPlayer.tsx:221-222` | derived render read | HLS/audio/native mode from `format` | `syncMode()` toggles persistent nodes and adapters |
| `AudioPlayer.tsx:96` | `useRef` | audio element | one persistent `HTMLAudioElement` in `AudioPlayerView` |
| `AudioPlayer.tsx:97` | `useState` | `playing` | field updated by media events and pushed to visualizer/controls |
| `AudioPlayer.tsx:99` | `useEffect` | mount-only overlay CSS injection | scoped static CSS imported by the view; no global remove/reinsert race |
| `AudioPlayer.tsx:101-135` | `useEffect` | six audio events and callback refs | listeners on the stable audio node, removed through ownership |
| `AudioPlayer.tsx:137-139` | `useEffect` | `muted` | update `audio.muted` in place |
| `AudioPlayer.tsx:141-144` | click callback | current `audio.paused` | native visualizer-area listener toggles play/pause |
| `AudioControls.tsx:41` | `useState` | `currentTime` | field plus time-label and slider projection |
| `AudioControls.tsx:42` | `useState` | `duration` | field plus duration label and slider max |
| `AudioControls.tsx:43` | `useState` | `muted` | field plus mute button projection |
| `AudioControls.tsx:44` | `useRef` | seeking flag | `isSeeking` field used by timeupdate and pointer/mouse handlers |
| `AudioControls.tsx:46-72` | `useEffect` | `audioRef`; time/duration/volume/seeked events | stable-node listeners; immediately sync initial values |
| `AudioControls.tsx:74-79` | click callback | `audio.paused` | native play/pause button listener |
| `AudioControls.tsx:81-84` | click callback | `audio.muted` | native mute button listener |
| `AudioControls.tsx:86-87` | mouse callbacks | seek gesture state | native slider listeners set `isSeeking` |
| `AudioControls.tsx:88-92` | change callback | slider value and audio node | update field and `audio.currentTime` |
| `VideoView.tsx:38` | `state.use` | `url` | one compound editor-state binding |
| `VideoView.tsx:39` | `state.use` | `streamUrl` | same compound binding; update existing player source |
| `VideoView.tsx:40` | `state.use` | `inputText` | same binding; update existing TextareaView |
| `VideoView.tsx:41` | `state.use` | `format` | same binding; update existing player mode |
| `VideoView.tsx:42` | `state.use` | `pageMuted` | same binding; update existing media mute |
| `VideoView.tsx:43` | `state.use` | `parsedRequest` | same binding; update HLS loader configuration |
| `VideoView.tsx:44` | `state.use` | `playerState` | same binding; update badge/VLC projection |
| `VideoView.tsx:45` | `settings.use("audio-shuffle")` | persisted shuffle flag | one `settings.onChanged` subscription filtered to this key; update existing audio view |
| `VideoView.tsx:46` | derived read | `model.canPlayNext` | recompute in the surface projection |
| `VideoView.tsx:47-48` | derived reads | badge/VLC conditions | update existing nodes' `hidden`/state attributes |
| `VideoView.tsx:60-65` | inline callback | input text and Enter modifiers | native TextareaView key handler prevents default and calls current `submitUrl(inputText)` |
| `VideoView.tsx:82,85-86` | inline callbacks | current model commands | stable handlers call `playNext()` and `toggleShuffle()` |

There are no `useMemo`, `useCallback`, `useOptionalState`, or
`useComponentModel` calls in these five files, and no service hook besides the
two `settings.use()` calls listed above.

## Implementation plan

### 1. Convert the top-level editor view

Rename `src/renderer/editors/video/VideoView.tsx` to `VideoView.ts` and replace
the React function with a public `VideoEditorView extends
VanillaView<{ model: EditorModel }>` plus an `instanceof VideoEditor` guard.
Use `createPanelElement()` for the stable outer root. In `onMount()` construct,
claim, append, and mount:

- a persistent column Panel for the toolbar's children;
- `TextareaView` with the old name, value, placeholder, single-line mode,
  min/max heights, and size;
- `PageToolbarView` with `name: "video-toolbar"`, `noSpacer: true`,
  `borderBottom: true`, and the persistent toolbar-child Panel as `children`;
- the player-area Panel and the `VPlayerView` child;
- the prompt, status badge, and VLC-button DOM surfaces.

Use `ButtonView` for the VLC action and `createTextElement()` for the prompt
and status text. The toolbar child Panel and every toolbar slot value must be a
persistent `Node`, not a fragment. Keep the player mounted with an empty/hidden
source when `url` is absent so a later URL update does not recreate media.

Install one compound `bind()` from `onMount()`:

```ts
this.bind(
    this.model.state,
    (state) => ({
        url: state.url,
        streamUrl: state.streamUrl,
        inputText: state.inputText,
        format: state.format,
        muted: state.pageMuted,
        parsedRequest: state.parsedRequest,
        playerState: state.playerState,
    }),
    (state) => this.syncSurface(state),
);
```

`syncSurface()` updates the existing Textarea, player, badge, and VLC button;
it derives `model.canPlayNext`, `showBadge`, and `showVlcButton` from the
current values. Subscribe to `settings.onChanged` once for `audio-shuffle`,
initialize from `settings.get("audio-shuffle")`, and update the existing player
child when the setting changes. This is a global stable source, so it needs one
owned final disposer rather than a replaceable-source rebind. The text-entry
handler must use a native `KeyboardEvent`, preserve the exact Enter modifier
guard, prevent default, and call the current model's `submitUrl()`.

### 2. Split the media surface into five native views

Use one `VanillaView` class per existing stateful React file. This is the
smallest auditable split that keeps each resource owner local:

| File after rename | Class | Owned responsibility |
|---|---|---|
| `VideoView.ts` | `VideoEditorView` | outer Panel, toolbar/input, player area, status/VLC surfaces, editor-state binding |
| `VPlayer.ts` | `VPlayerView` | persistent video/audio composition, video.js/HLS adapters, mode/source/mute updates |
| `AudioPlayer.ts` | `AudioPlayerView` | persistent audio element, visualizer/control children, playback state |
| `AudioVisualizer.ts` | `AudioVisualizerView` | canvas, metadata, effect buttons, visibility observer, AudioContext, analyser, rAF |
| `AudioControls.ts` | `AudioControlsView` | time/mute fields, labels, Slider and control buttons, media listeners |

There is no need for `createComponentModelDriver`: none of the five files uses
`useComponentModel`, and durable state belongs to `VideoEditor`. Local state
formerly held by `useState` becomes plain view fields. Every class has a stable
root and updates existing children in `onUpdate()`.

### 3. Keep media DOM nodes stable while changing adapters

`VPlayerView.onMount()` must create one `<video>` and one `AudioPlayerView`;
`AudioPlayerView.onMount()` must create one `<audio>`. Keep both media branches
mounted and toggle visibility/active behavior on format changes. Do not call
`releaseChild()` or recreate a media element merely because `src`, `format`, or
`parsedRequest` changed.

For HLS, preserve `VPlayer.tsx:64-114`: initialize video.js against the stable
video node, preserve `controls`, `autoplay`, `preload: "auto"`, `fill`, and
initial mute, and use `createNodeFetchLoaderClass(parsedRequest.headers)` when
headers are present. Store HLS in a replaceable field; destroy and clear the
old HLS instance before loading a new source, and destroy it during teardown.
Keep the latest `onStateChange`, `onMutedChange`, and `onEnded` callbacks in
view fields so adapter listeners do not capture stale props. Update mute on the
existing video.js/native element.

For non-HLS video, preserve `class="native"`, controls, autoplay, and mute from
`VPlayer.tsx:185-195`; update the existing element's `src` in place. If the
video.js adapter cannot transition between HLS and native mode without an
adapter reset, dispose/reinitialize only the adapter around the same DOM node.
The implementation must verify HLS → native → audio → HLS without a media-node
replacement. Audio mode stays connected to the same audio element so the
visualizer's `createMediaElementSource()` is created once for that element.

### 4. Convert the audio player and controls

`AudioPlayerView` creates the visualizer area, the hidden persistent `<audio>`,
and the overlay. Claim and mount one `AudioVisualizerView` and one
`AudioControlsView`. Install the six listeners from `AudioPlayer.tsx:101-135`
(`loadstart`, `playing`, `pause`, `volumechange`, `ended`, `error`) on that
audio node, updating the local playing field and invoking current parent
callbacks. Update `audio.src` and `audio.muted` in place. The visualizer-area
click keeps the old paused/play toggle and contained rejected `play()` promise.

`AudioControlsView` uses `IconButtonView` for play, next, mute, and shuffle,
`SliderView` for seeking, and direct spans for the time labels. Preserve every
name, icon, title, hover flag, conditional next/shuffle branch, range bounds,
step, and `formatTime()` behavior from `AudioControls.tsx:94-153`. Install the
five media listeners from `:46-72`, synchronously initialize current time,
duration, and mute, and update the existing child props rather than rebuilding
the controls. Keep `isSeeking` true during the existing mouse-down/up window
so timeupdate does not fight a drag.

Replace `injectOverlayStyles()` at `AudioPlayer.tsx:99` with scoped static CSS
owned by the video editor. Preserve the `data-audio-overlay` hover/focus rules,
dark hover background, slider opacity, and overlay geometry. Import the
existing `video.js/dist/video-js.css` from the native VPlayer module as the
current integration requires it; do not modify the third-party stylesheet.

### 5. Convert the visualizer and make teardown race-safe

`AudioVisualizerView` uses `createPanelElement`/`applyPanelAttributes` to retain
the old relative full-size Panel and creates its canvas, metadata region,
effect-switcher host, and three native `IconButtonView` children in
`onMount()`. The existing fresh SVG builders remain the icon source; do not
cache one DOM icon across buttons or hosts.

The verified current rAF path is `AudioVisualizer.tsx:263-294`:

1. The effect re-runs when `playing`, selected effect, or page visibility
   changes. It returns without a loop for selected effect `none`, hidden page,
   or missing analyser. `playing` itself is **not** an if-gate in the current
   effect, so after the first play the loop continues while visible even when
   paused; playback drives lazy graph creation and effect reruns, not pause
   shutdown. Preserve this observed behavior unless a separate product change
   is authorized.
2. Each callback requests the next frame first, reads `canvas.offsetWidth` and
   `offsetHeight`, updates backing `canvas.width`/`height` when changed, and
   calls `effect.draw(ctx2d, analyser, W, H, themeState.get().isDark)`.
3. The first frame is requested at `:292`; the effect cleanup cancels the
   current frame at `:293`, and unmount cleanup also cancels it and closes the
   context at `:297-304`.

Implement one `syncAnimation()`/`stopAnimation()` pair. It must cancel the
pending id before starting another, use a live/disposed generation guard both
before requesting and inside the callback, and never reschedule or draw after
dispose. Register final cancellation with `this.own()` before the context and
effect cleanup. Start synchronization from `onMount()` and from updates of
playing/effect/visibility/analyser; stop when effect is `none`, page visibility
is false, or analyser is absent. The `none` path clears the canvas and renders
track metadata when available.

Create `AudioContext` lazily after the first active playback, matching
`:237-254`: `fftSize = 256`, `smoothingTimeConstant = 0.8`, and
`createMediaElementSource(audio) → analyser → destination`. Store the context
and analyser, resume a suspended context when playback activates, and close
the context exactly once on dispose. Guard the resume continuation and all
media/observer callbacks against disposal. Dispose the HLS/video adapters and
audio children before the visualizer's final context/effect cleanup, while
ensuring the rAF is stopped before the context is closed.

Observe the actual canvas with `IntersectionObserver({ threshold: 0 })`; update
the plain `pageVisible` field and resynchronize animation. Listen for
`loadedmetadata` and `emptied` on the stable audio node. Metadata prefers
`navigator.mediaSession.metadata.title/artist`, falls back to
`parseFilenameInfo(sourceUrl)`, and clears on `emptied`.

Canvas backing dimensions are layout-derived. After the root is attached,
schedule a post-paint `requestAnimationFrame` measurement, and retry at most a
small fixed number of frames (for example, three) while width/height are zero
or unsettled. Never use a pre-paint microtask. The retry has the same live guard
and owned cancellation as the animation loop, and must not leak a callback
after disposal.

### 6. Move the module registration and preserve exports

Rename `src/renderer/editors/video/index.tsx` to `index.ts`, remove
`VideoEditorComponent` and JSX, and register `View: VideoEditorView`:

```tsx
// Before: src/renderer/editors/video/index.tsx:8-15
function VideoEditorComponent({ model }: { model: EditorModel }) {
    return <VideoView model={model as VideoEditor} />;
}

export const videoModule: EditorModule = {
    createEditor: () => new VideoEditor(new TComponentState(getDefaultVideoEditorState())),
    Component: VideoEditorComponent,
    // newEditorModel remains unchanged
};
```

```ts
// After: src/renderer/editors/video/index.ts
export const videoModule: EditorModule = {
    createEditor: () => new VideoEditor(new TComponentState(getDefaultVideoEditorState())),
    View: VideoEditorView,
    // newEditorModel remains unchanged
};
```

Preserve `VideoEditor`, `getDefaultVideoEditorState`, `VideoEditorState`,
`VideoEditorModel`, and `VideoEditorModelState` exports at
`index.tsx:31-34`. Leave the extensionless dynamic importer at
`src/renderer/editors/register-editors.ts:166` unchanged.

### 7. Verify the real path and scope boundary

Run source checks and the existing project type/lint/build checks appropriate to
the rewritten TypeScript; do not add a unit test or harness. Open the video
editor through the real registry path and verify URL submission, stream URL
resolution/restoration, HLS headers, native video, audio playback, seek/mute,
effect switching, visibility, metadata, next/shuffle navigation, VLC fallback,
and all teardown transitions. Check that each media element's identity remains
stable through source/format changes. Check the editor subtree for zero
`[data-react-root]` and zero `[data-part="react-slot"]` elements.

Do not modify `VideoEditor.ts`, `video-types.ts`, effect implementations,
`NodeFetchHlsLoader.ts`, `PageToolbarView.ts`, parent layout/mounting files, or
the registry importer. The `.tsx` → `.ts` rewrites are expected to appear as
delete-plus-add in Git.

## Importer and uikit-face audit

The whole-source search for `AudioVisualizer`, `AudioControls`, `AudioPlayer`,
`VPlayer`, `VideoView`, their props, and the video editor model found no
out-of-scope importer of the five component faces. The only external edge is
the extensionless dynamic module load at
`src/renderer/editors/register-editors.ts:166`, which consumes `videoModule`.
The child imports are internal: `VPlayer.tsx:13` imports `AudioPlayer`,
`AudioPlayer.tsx:3-4` imports the visualizer and controls, and
`index.tsx:3,8-9` imports `VideoView`. No React face needs to survive as a
`mountVanilla` shim, so 0 roots is achievable in this scope.

The used uikit faces and their native replacements are:

| React face and use | Native arm/replacement | Decision |
|---|---|---|
| `Panel`, `AudioVisualizer.tsx:307`, `VPlayer.tsx:225`, `AudioPlayer.tsx:147`, `AudioControls.tsx:95`, `VideoView.tsx:51,53,72` | No `PanelView`; `createPanelElement`/`applyPanelAttributes` at `uikit/Panel/panel-style.ts:303-357` | Build stable Panel roots/raw Panels directly |
| `IconButton`, visualizer `:317-326`, controls `:96-151` | `IconButtonView` at `uikit/IconButton/IconButtonView.tsx:16-54` | Construct and claim native children |
| `Slider`, controls `:118-129` | `SliderView` at `uikit/Slider/SliderView.tsx:8-67` | Construct and update in place |
| `Textarea`, URL input `VideoView.tsx:54-69` | `TextareaView` at `uikit/Textarea/TextareaView.ts:27-214` | Persistent toolbar child |
| `Button`, VLC action `VideoView.tsx:97-99` | `ButtonView` at `uikit/Button/ButtonView.tsx:35-197` | Construct and claim native action |
| `Text`, prompt `VideoView.tsx:90`, `AudioVisualizer.tsx:311-312` | No `TextView`; `createTextElement` at `uikit/Text/text-style.ts:100-107` | Build direct text Nodes |
| `PageToolbar`, `VideoView.tsx:52-71` | `PageToolbarView` at `editors/base/PageToolbarView.ts:364-464` | Construct directly with persistent children Node |

The old `Panel` and `Text` faces are compatibility React functions, not
missing functionality. No React-valued slot is needed in the converted video
surface. The native uikit views import their own styles where required; the
editor-owned native views must import any borrowed stylesheet explicitly.

There are no `setInterval` or `setTimeout` calls in the five React files. The
only timer-like resources are `requestAnimationFrame` in
`AudioVisualizer.tsx:284,292-293` and the separate model navigation callback in
`VideoEditor.ts:307-320`, which is outside this conversion. The former is owned
by `AudioVisualizerView`; the latter remains in the unchanged model.

## Concerns / Open questions

### Resolved: 0 React roots is achievable

Yes. The only current root is the editor's React `Component` arm. All five
faces are internal, the toolbar has a native arm, Panel/Text have direct DOM
builders, and Button/IconButton/Slider/Textarea have native arms. The importer
audit found no out-of-scope React caller that requires a shim. The native
registration can therefore reach 0 `[data-react-root]` and 0
`[data-part="react-slot"]` for the opened video editor.

### Resolved: real Panel root, not `display: contents`

`VideoView.tsx:50-103` wraps the entire surface in one outer Panel. The root
must be a real Panel created by `createPanelElement`; a contents root would
remove the editor's layout box and alter its full-height flex/overflow
contract. This is distinct from fragment-based editor surfaces such as the
image pilot.

### Resolved: five native classes

The chosen split is `VideoEditorView`, `VPlayerView`, `AudioPlayerView`,
`AudioVisualizerView`, and `AudioControlsView`, one per current stateful React
file. The parent owns the editor-state projection; the player owns media and
adapter identity; audio owns the audio node and child views; visualizer owns
the canvas graph and rAF; controls own media-derived fields and control
events. This avoids a monolithic view and makes every cleanup owner explicit.

### Resolved: rAF and AudioContext lifecycle

The rAF loop starts after `onMount()` has a canvas and an analyser, when the
selected effect is not `none` and the canvas is intersecting. It stops when the
effect becomes `none`, the page is no longer intersecting, or the analyser is
absent. It also stops on disposal. `playing` drives lazy AudioContext creation,
resume, and loop-effect re-evaluation, but is not a current loop gate; the
native plan preserves this exact post-first-play pause behavior.

Use one cancellation/generation guard before scheduling and inside each frame;
cancel the current frame before any restart and register final cancellation
with `this.own()`. Teardown order is: invalidate generation, cancel the frame
and bounded sizing retry, remove media/observer listeners, close the
AudioContext exactly once, clear analyser/context fields, then dispose the
effect. A late callback or `resume()` continuation must return without touching
DOM or fields after disposal.

The graph is `createMediaElementSource(stableAudio) → analyser → destination`,
with `fftSize = 256` and smoothing `0.8`. The audio element remains stable for
the life of `AudioPlayerView`, so the source node is created once and the
context is closed once.

### Resolved: post-paint canvas sizing

The canvas backing store is based on layout `offsetWidth`/`offsetHeight`, as
shown at `AudioVisualizer.tsx:285-288`. The native view schedules the first
measurement through rAF after mount, retries for a fixed maximum number of
frames while layout is zero/unsettled, and then uses the settled size in the
draw loop. The retry is cancellable through the same live guard. No microtask
scheduled before first paint is allowed to perform the sizing read.

### Resolved: replaceable resources and subscriptions

`settings.onChanged` is a stable global event source; each view registers one
filtered subscription and owns its final disposer. The audio element and
canvas are created once, so their media/observer listeners do not need source
replacement. HLS instances and the video.js adapter are the source-changing
resources: keep explicit replaceable fields, destroy the old instance before
loading/configuring a new source, and dispose them on final teardown. If the
parent ever changes the `VideoEditor` object itself, rebind the editor-state
subscription manually rather than stacking `bind()` calls; normal
`AsyncEditorView` reuse keeps the same model for the same editor identity
(`src/renderer/ui/app/AsyncEditorView.ts:102-124`).

The initial settings read is safe on the real startup path: `renderer.tsx:10-20`
awaits `app.initEvents()`, and `src/renderer/api/app.ts:267-269` awaits
`settings.wait()` before the renderer mount returned by bootstrap is called.
Later disk reloads emit filtered `onChanged` notifications from
`src/renderer/api/settings.ts:265-287`.

### Resolved: persistent media through mode changes

The plan uses one stable video DOM node and one stable audio DOM node for the
whole `VPlayerView` lifetime. HLS/video.js and native-video configuration are
replaceable adapters around the video node, not conditional DOM children. On
HLS ↔ native transitions, dispose the active adapter, clear its owned classes/
listeners as required by the library, then configure the same node. Audio mode
is shown/hidden without disposing `AudioPlayerView`, so the analyser remains
attached to the same audio element. Verify node identity and buffered-data
retention across HLS → native → audio → HLS.

### Protected scope

Do not modify `src/renderer/editors/video/VideoEditor.ts`,
`video-types.ts`, `NodeFetchHlsLoader.ts`, any file under `effects/`,
`src/renderer/editors/base/PageToolbarView.ts`, or any parent layout/mounting
file. Do not modify `register-editors.ts`; its dynamic import remains valid.
Do not add tests or a harness, duplicate the dashboard entry, or commit.

## Acceptance criteria

- `src/renderer/editors/video/index.ts` exists, registers
  `View: VideoEditorView`, has no `Component` or JSX wrapper, and preserves the
  model factories and all four existing model exports.
- `VideoView.ts`, `VPlayer.ts`, `AudioPlayer.ts`, `AudioVisualizer.ts`, and
  `AudioControls.ts` contain the five public native view classes and no React
  JSX or hooks.
- The editor uses one stable real Panel root with the old name, direction,
  height, background, overflow, toolbar name, `noSpacer`, and border behavior.
- The URL input, player area, status/VLC surfaces, audio controls, next/shuffle
  actions, and metadata preserve the old props, labels, icons, and behavior.
- The editor state binding explicitly covers exactly `url`, `streamUrl`,
  `inputText`, `format`, `pageMuted`, `parsedRequest`, and `playerState`; the
  shuffle setting has an explicit filtered service subscription.
- The video and audio elements are each created once and are not recreated for
  updates or format changes. HLS/video.js resources are replaced/destroyed
  without replacing the video node.
- The visualizer loop follows the verified `playing` interaction, effect and
  visibility gates, measures after paint with a bounded retry, and cannot
  schedule or draw a frame after disposal.
- The `AudioContext`, analyser, HLS instance, video.js player, listeners,
  observer, settings subscriptions, effects, and all frame/retry resources are
  disposed exactly once; late async/media callbacks are inert.
- The real editor path has zero `[data-react-root]` and zero
  `[data-part="react-slot"]` elements in the video editor subtree, and no
  out-of-scope React shim is retained.
- No protected files, tests/harnesses, dashboard entries, parent mounting code,
  or commits are changed.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/video/VideoView.tsx` → `VideoView.ts` | Replace the React editor surface with `VideoEditorView`, real Panel composition, toolbar/input, overlays, and explicit editor-state binding. |
| `src/renderer/editors/video/VPlayer.tsx` → `VPlayer.ts` | Replace HLS/native/audio React branches with `VPlayerView`, one persistent video node, one persistent audio child, and replaceable adapters. |
| `src/renderer/editors/video/AudioPlayer.tsx` → `AudioPlayer.ts` | Replace the audio React component with `AudioPlayerView`, stable audio node, overlay, playback listeners, and native children. |
| `src/renderer/editors/video/AudioVisualizer.tsx` → `AudioVisualizer.ts` | Replace visualizer hooks/JSX with `AudioVisualizerView`, canvas, effects, post-paint sizing, rAF, and AudioContext teardown. |
| `src/renderer/editors/video/AudioControls.tsx` → `AudioControls.ts` | Replace controls hooks/JSX with `AudioControlsView`, native buttons/slider, media listeners, and direct labels. |
| `src/renderer/editors/video/video-editor.css` | Add scoped editor-layer CSS for visualizer, audio overlay, status/VLC surfaces, and native media layout; replace runtime global overlay injection. |
| `src/renderer/editors/video/index.tsx` → `index.ts` | Remove the React component arm and register `View: VideoEditorView`, retaining factories and exports. |

Files that need no changes: `src/renderer/editors/video/VideoEditor.ts`,
`src/renderer/editors/video/video-types.ts`,
`src/renderer/editors/video/NodeFetchHlsLoader.ts`, all files under
`src/renderer/editors/video/effects/`,
`src/renderer/editors/base/PageToolbarView.ts`,
`src/renderer/editors/register-editors.ts`, all parent layout/mounting files,
the existing uikit native arms and style helpers, and `doc/active-work.md`.
