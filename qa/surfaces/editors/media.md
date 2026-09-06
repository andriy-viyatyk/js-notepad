# Surface QA: image and video/audio editors

Manual scenarios for the `image-view` and `video-view` facades. Run through `call` only; do not
add or run automated tests or a test harness for this surface. Leave pinned tabs untouched and
close only pages created by the scenario.

## Test M.1: Image inventory and scope

**Preparation:** Open two image pages, one with a loaded source and one with no source, and obtain
both page ids from `pages`. Keep one page inactive.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `pages[firstId].editor.elements` and `pages[secondId].editor.elements`, then call
`pages[inactiveId].editor.highlight("image-open-draw")` on the inactive page.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Each inventory contains exactly `image-save`, `image-open-draw`, and `image-copy`, and
every selector contains its own `[data-page-id="id"]`. `image-save` is visible only on the loaded
image page; the other controls report their literal conditional visibility. The inactive-page
highlight activates its owner, waits for layout, and rings that page's control rather than the
other image page.

## Test M.2: Image facade actions

**Preparation:** Use an image page with a source and a scratch destination for file export. Also
inspect a newly opened image page before a source is loaded.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `editor.id`, `editor.name`, `editor.source`, and `editor.$help`/summary. Exercise
`savePngToFile()`, `saveAsPng()`, `saveOriginal()`, `openInDrawingEditor()`, and
`copyImageToClipboard()`, resolving native save dialogs as needed. Open `image-save` and inspect
the transient menu.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Identity and summary include the concrete id and page-provided name. PNG export,
original-byte export, Drawing Editor navigation, and clipboard copy follow the existing image
actions. The transient `image-save-menu` contains `Save as .png` and `Save original`; it is not
returned as an element. A no-source facade reports `source` as `undefined`, `image-save` is
hidden, and the existing no-op/error behavior is preserved rather than fabricating a source.

## Test M.3: Video identity and model state

**Preparation:** Open MP4, HLS, and audio sources in separate video pages, including an audio page
opened from a discoverable provider when possible. Obtain all page ids without changing pinned tabs.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read each `pages[id].editor` identity, `source`, `format`, `playerState`, `pageMuted`,
`canPlayNext`, `shuffle`, `visualizerEffect`, and `summarize()` without scripting.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The registered facade has `id: "video-view"`, preserves each page's name, reports the
raw source or `undefined`, detects `mp4`/`m3u8`/`audio`, and exposes the current player state and
page mute state. `canPlayNext` reflects the source provider. `shuffle` and `visualizerEffect` are
the same global settings on every open video page, and summaries identify source, format, state,
and whether live media is mounted.

## Test M.4: Video live media state

**Preparation:** Observe a video page before its player mounts if the lifecycle makes that interval
visible; otherwise begin before metadata is available. Repeat with a mounted MP4/HLS page and a
mounted audio page, and keep a second media page open.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `mediaMounted`, `duration`, `currentTime`, `paused`, `volume`, `muted`, and
`playbackRate` before mount, after mount, after metadata, while playing and paused, after seek/mute,
and in audio mode. Read both pages while switching between them.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Getters are synchronous and never activate a page. Before mount and after teardown or
mode switch, `mediaMounted` is false and all live values are `undefined`. After handoff they match
the active HTMLMediaElement; duration is `undefined` for NaN/infinity before finite metadata and
valid zero/one values remain unchanged. Video and audio pages retain independent model handoffs,
and reads from an inactive page do not switch tabs.

## Test M.5: Video elements and read-mostly actions

**Preparation:** Use video pages in video, audio, unsupported/error, and provider-backed audio
states. Open one audio page with more than one sibling track when possible.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `editor.elements`, then exercise `submitUrl()`, `play()`, `pause()`, `seek()`,
`toggleMute()`, `playNext()`, `toggleShuffle()`, `setVisualizerEffect()`, and `openInVlc()` as
appropriate. Highlight a conditional audio, next, or VLC control on a page where it is present and
absent.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The inventory contains exactly the 10 curated names: `video-url-input`,
`video-open-vlc`, `audio-play-pause`, `audio-next`, `audio-mute`, `audio-shuffle`, `audio-seek`,
`visualizer-bars`, `visualizer-circular`, and `visualizer-none`. Conditional controls remain in
the inventory with `visible: false`. Submit replaces the source; reachable playback, next, mute,
shuffle, visualizer, and VLC behavior follows the existing UI. Audible/source/external actions are
marked `caution`; `setVisualizerEffect` has no caution because it changes only visual rendering.
The help says commands do not activate pages, so play/seek/next can affect an off-screen open page,
and no volume/rate/subtitle/track controls are invented. With no handoff, play rejects and pause/
seek throw the documented mounted-media diagnostic.

## Test M.6: Video dialogs and menus

**Preparation:** Use a source that causes VLC launch or stream setup to fail, and inspect the video
page's standard tab context menu.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Call `editor.openInVlc()` and inspect the resulting dialog through `dialogs[i]`. Inspect
`menus[0]` from the page tab and read the facade element inventory while transient UI is open.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The failure opens the read-only text dialog titled `VLC Error`. Standard Pin, Close,
Duplicate, and Open in New Window actions remain owned by the page-tab context menu. No transient
menu, dialog, structural root, native/video.js control, status label, or media `data-part` is
returned as a video facade element. Help identifies the absence of a video-specific
`onGetMenuItems` contribution, and says tracks/subtitles are not currently surfaced.
