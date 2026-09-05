# US-1306: Settings surface — sections, rows, and `highlight(key)`

**Epic:** [EPIC-085](../../epics/EPIC-085.md)  
**Status:** Planned — investigation complete; implementation intentionally not started  
**Created:** 2026-09-05

## Goal

Make the Settings catalog reachable from the always-available `settings` node so an agent can
answer “where do I change X?” without the Settings page already being open. The catalog will list
the real Settings sections and their setting-key rows, while `settings.highlight(key)` opens or
activates the Settings page, waits for its section to mount, and points at the section containing
that key; `settings.get/set` remains the API for reading and changing values.

## Background

### Decision under review: the catalog belongs on `settings`

EPIC-085 decision 6 currently describes `pages[i].asSettings()` as the Settings-page facade and
requires it to cross-reference from `settings.set`, rather than replacing the setter
([EPIC-085](../../epics/EPIC-085.md):88-93). Source inspection changes the placement decision:

- `pages[i].asSettings()` does not exist. `PageWrapper` has editor facades for text, grid,
  notebook, links, Markdown, SVG, HTML, Mermaid, graph, drawing, browser, MCP Inspector, and
  image, but no Settings facade ([`PageWrapper.ts`](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):58-72).
- A page wrapper is only discoverable after an agent has already chosen and reached `pages[i]`.
  The root instead exposes `settings` as a node, and `settings` is registered in the AiVision
  namespace registry ([`root.ts`](../../../src/renderer/scripting/ai-vision/root.ts):34-57;
  [`namespaces/index.ts`](../../../src/renderer/scripting/ai-vision/namespaces/index.ts):21-31).
- The motivating question is about configuration ownership, not page identity. The catalog and
  the key-to-section map therefore belong on `settings`, which is reachable whether the Settings
  page is open or closed. This follows the roadmap’s hand-written-purpose rule: useful purpose
  text cannot be recovered from types ([`agent-transparency-roadmap.md`](../../agent-transparency-roadmap.md):22-32).
- `settings.set` is still the correct answer to “change X.” The S.2 run shows that three attempts
  to redirect an agent away from a correct writable property failed; the successful fix was a
  cross-reference on the node/member where the agent landed ([`shell.md`](../../../qa/surfaces/shell.md):34-56).

**Recommendation:** do not add `pages[i].asSettings()` for this task. Add the catalog and the
key-based highlight operation to the `settings` node; keep `pages.showSettingsPage()` as the
existing page-opening operation, but make `settings.highlight(key)` call the renderer page model
so the agent does not need to discover a page first.

### Existing Settings page and fixed section order

The Settings editor is a no-host singleton with page id `settings-page`, title “Settings,” and
editor id `settings-view` ([`SettingsEditor.ts`](../../../src/renderer/editors/settings/SettingsEditor.ts):5-17).
Its module exports `SettingsView` as the editor view ([`index.ts`](../../../src/renderer/editors/settings/index.ts):1-10).
`SettingsView.onMount()` constructs and mounts the 13 section views in this exact order:

1. Theme — `ThemeSectionView`
2. Window Behavior — `WindowBehaviorSectionView`
3. Browser Profiles — `BrowserProfilesSectionView`
4. Links / link behavior — `LinkBehaviorSectionView`
5. Default Browser — `DefaultBrowserSectionView`
6. File Search — `FileSearchSectionView`
7. MCP Server / Mneme — `McpSectionView`
8. Git Integration — `GitIntegrationSectionView`
9. Board Environment Variables — `BoardVarsSectionView`
10. Script Library — `ScriptLibrarySectionView`
11. Drawing Library — `DrawingLibrarySectionView`
12. Video Player — `VideoPlayerSectionView`
13. Terminal — `TerminalSectionView`

The first three are appended at [`SettingsView.ts`](../../../src/renderer/editors/settings/SettingsView.ts):63-68.
The Links heading and `LinkBehaviorSectionView`, followed by the Default Browser heading and
section, are at :70-79. The remaining eight section mounts are at :80-95. The section view is
mounted immediately by `appendSection()` at :114-118, and dividers are inserted between sections
by `appendDivider()` at :120-126.

The page currently has exactly three `data-name` values: `settings-root`, `settings-content`, and
`settings-view-file` ([`SettingsView.ts`](../../../src/renderer/editors/settings/SettingsView.ts):37-50,97-107).
None of the section roots has a `data-name`; every section currently calls
`createSectionRoot("settings-section")` ([`settings-native.ts`](../../../src/renderer/editors/settings/sections/settings-native.ts):7-11;
[`ThemeSection.ts`](../../../src/renderer/editors/settings/sections/ThemeSection.ts):76-81;
[`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):44-49,74-80,178-186,243-250,310-319,353-363,388-396,477-481;
[`FileSearchSection.ts`](../../../src/renderer/editors/settings/sections/FileSearchSection.ts):8-16;
[`McpSection.ts`](../../../src/renderer/editors/settings/sections/McpSection.ts):93-109;
[`DefaultBrowserSection.ts`](../../../src/renderer/editors/settings/sections/DefaultBrowserSection.ts):53-60;
[`BrowserProfilesSection.ts`](../../../src/renderer/editors/settings/sections/BrowserProfilesSection.ts):346-361).

`createSectionRoot()` accepts only a `type` today and assigns only `dataset.type`
([`settings-native.ts`](../../../src/renderer/editors/settings/sections/settings-native.ts):7-11).
The existing section roots use `display: contents`, so the implementation must leave that helper
and layout contract unchanged. Instead, `SettingsView.appendSection()` should place each section
view inside a new wrapper with a stable `data-name` and a real box; the wrapper can identify and
highlight the section while the existing section root continues to contribute its children to the
parent layout. The public names and selectors are specified in the implementation plan below and
must also be added to the new “Settings page” area of
[`ui-element-contract.md`](../../architecture/ui-element-contract.md), as required by EPIC-085
decision 8 ([EPIC-085](../../epics/EPIC-085.md):103-106).

### Verified key inventory and the hand-written key-to-section map

The runtime declares the complete `AppSettingsKey` union at
[`settings.ts`](../../../src/renderer/api/settings.ts):23-53, writes per-key descriptions at
:93-125, and supplies defaults at :127-159. The public `ISettings` type deliberately accepts a
generic string for `get` and `set`, rather than exposing this union
([`settings.d.ts`](../../../src/renderer/api/types/settings.d.ts):16-27). The catalog is therefore
not generated from typings: its words, rows, section ownership, and exclusions are hand-written.

The following table records the actual keys read or written by each section source. It is the
source of truth for the future catalog. A row’s purpose should use the UI wording and the
per-key comment already written in `settings.ts`; it must not be inferred from the key prefix.

| Fixed-order section | Keys actually read/written | Row purpose to expose in `settings.sections` |
|---|---|---|
| Theme | `theme` | Application color theme; the view offers the available dark and light themes and writes the selected theme ([`ThemeSection.ts`](../../../src/renderer/editors/settings/sections/ThemeSection.ts):83-98,140-143; [`settings.ts`](../../../src/renderer/api/settings.ts):96,130). |
| Window Behavior | `window.close-to-tray` | Whether closing the last window hides Persephone in the tray or quits it; the checkbox and state-dependent explanation are built at [`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):82-117, and the persisted meaning is documented at [`settings.ts`](../../../src/renderer/api/settings.ts):123,157. |
| Browser Profiles | `browser-profiles`; `browser-default-profile`; `browser-default-bookmarks-file`; `browser-incognito-bookmarks-file`; `tor.exe-path`; `tor.socks-port`; `tor.bookmarks-file` | Isolated browser profiles and their default/bookmark files, plus Tor executable, SOCKS port, and bookmark settings. The view reads the seven values and reacts to the same seven keys at [`BrowserProfilesSection.ts`](../../../src/renderer/editors/settings/sections/BrowserProfilesSection.ts):374-385,457-496,499-509; the model writes them at [`BrowserProfilesSectionModel.ts`](../../../src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts):56-75,96-114,123-141. |
| Links | `link-open-behavior` | Whether external links open in the default OS browser or the nearest internal Browser tab; the choices and setter are at [`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):26-29,44-70, and the page’s “Links” heading is at [`SettingsView.ts`](../../../src/renderer/editors/settings/SettingsView.ts):70-75. |
| Default Browser | *(none)* | A status/action section for Windows Default Apps registration. It calls native API methods and does not read or write an application setting ([`DefaultBrowserSection.ts`](../../../src/renderer/editors/settings/sections/DefaultBrowserSection.ts):62-126). It remains in the section catalog with an empty `rows` array, but no key can be highlighted for it. |
| File Search | `search-extensions`; `search-exclude` | Comma-separated file extensions included in content search, and folders/globs skipped by search; the view reads and saves only these two arrays at [`FileSearchSection.ts`](../../../src/renderer/editors/settings/sections/FileSearchSection.ts):18-59,79-103. |
| MCP Server / Mneme | `mcp.enabled`; `mcp.port`; `mcp.browser-tools.enabled`; `main.scripting.enabled`; `mneme.enabled`; `mneme.port` | MCP enablement/port/browser tools, main-process scripting permission, and Mneme enablement/port. The six controls and config/status text are built at [`McpSection.ts`](../../../src/renderer/editors/settings/sections/McpSection.ts):111-218,237-276; the setters and port validation are at [`McpSectionModel.ts`](../../../src/renderer/editors/settings/sections/McpSectionModel.ts):112-125. |
| Git Integration | `git.enabled` | Enable Git Tree and File Diff editors; the UI explicitly says it is off by default and requires Git on PATH ([`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):178-218; [`settings.ts`](../../../src/renderer/api/settings.ts):122,156). |
| Board Environment Variables | `board-vars.file` | The external `.env.json` file holding per-board variables/secrets; browse/create/open/unlink behavior and the setting writes are at [`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):251-298, and the default is at [`settings.ts`](../../../src/renderer/api/settings.ts):124,158. |
| Script Library | `script-library.path` | Folder for saved scripts and reusable modules; the shared path section’s configuration is at [`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):301-355, and the persisted meaning is at [`settings.ts`](../../../src/renderer/api/settings.ts):111,145. |
| Drawing Library | `drawing.library-path` | Folder for Excalidraw reusable shapes, or the automatic default when empty; the shared path configuration is at [`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):301-361, and the persisted meaning is at [`settings.ts`](../../../src/renderer/api/settings.ts):112,146. |
| Video Player | `vlc-path`; `video-stream.port` | VLC executable path and local video streaming server port; the two fields, reads, and writes are at [`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):397-475, with key descriptions/defaults at [`settings.ts`](../../../src/renderer/api/settings.ts):117,119,151,153. |
| Terminal | `terminal.command` | The command used by “Open Terminal here,” with an auto-detect option and explicit `pwsh`, `powershell`, `cmd`, and `wt` choices ([`SettingsSections.ts`](../../../src/renderer/editors/settings/sections/SettingsSections.ts):31-37,477-496; [`settings.ts`](../../../src/renderer/api/settings.ts):118,152). |

The five declared/defaulted keys with no row in any of the 13 Settings section sources are
`tab-recent-languages`, `search-max-file-size`, `pinned-editors`, `visualizer-effect`, and
`audio-shuffle`. Their declarations, comments, and defaults are still real settings at
[`settings.ts`](../../../src/renderer/api/settings.ts):24-28,42,49-50,94-99,113,120-121,129,133,147,154-155;
they must not be fabricated into a Settings section or accepted as highlightable Settings-page
rows. They remain changeable through `settings.get/set`, and their existing owners are outside
this page: the tab language menu reads/writes `tab-recent-languages`
([`PageTabView.ts`](../../../src/renderer/ui/tabs/PageTabView.ts):453-461), file-search behavior
reads `search-max-file-size` ([`FileSearchModel.ts`](../../../src/renderer/components/file-search/FileSearchModel.ts):247),
the “+” editor menu owns `pinned-editors` ([`settings.ts`](../../../src/renderer/api/settings.ts):113),
the audio visualizer owns `visualizer-effect`
([`AudioVisualizer.ts`](../../../src/renderer/editors/video/AudioVisualizer.ts):189-202,235-259),
and the player Shuffle control owns `audio-shuffle`
([`AudioControls.ts`](../../../src/renderer/editors/video/AudioControls.ts):143;
[`VideoEditor.ts`](../../../src/renderer/editors/video/VideoEditor.ts):180-185).
`settings.highlight()` must give these keys a distinct error: name the real key, say that it has
no row on the Settings page, and direct the caller to `settings.get/set` (including the owning UI
where one exists). A genuinely unknown key gets a separate error containing the full list of the
25 valid Settings-page keys. The Settings catalog must report only those 25 represented keys.

### Elements, selectors, and the highlighter

The shared element protocol turns declarations into live `{ name, purpose, selector, visible }`
records and provides `highlight(name, message?)` through a descriptor’s `provide` seam
([`types.ts`](../../../src/shared/ai-vision/types.ts):35-80;
[`elements.ts`](../../../src/renderer/scripting/ai-vision/elements.ts):36-81). If a name is not
declared, `createElements()` already throws an error containing every valid name
([`elements.ts`](../../../src/renderer/scripting/ai-vision/elements.ts):65-73). For Settings, the
input will deliberately be a setting **key**, not a DOM element name: the key is what an agent
already has from `settings.get/set`, and each key declaration will resolve to its owning section
selector. The error must say “unknown setting key” and list the valid Settings-surface keys so an
agent can recover without guessing.

The declarations will use names such as `mcp.enabled` (the setting key) and an explicit selector
such as `[data-name="settings-section-mcp"]`; keys with dots are valid declaration names because
the current declaration validator rejects only empty names, quotes, backslashes, and duplicates
([`elements.ts`](../../../src/renderer/scripting/ai-vision/elements.ts):14-24). Multiple rows in
one section intentionally point at the same section wrapper: the catalog identifies the row and its
purpose, while the highlight points at the containing Settings section rather than pretending that
the existing controls have stable per-row names.

`ui.highlightElement()` itself loads the shared overlay and calls `api.show()`
([`ui.ts`](../../../src/renderer/api/ui.ts):95-128). The overlay returns `found: true` from selector
matches, but places a ring only when the target has a non-zero client rectangle
([`ui-highlight.js`](../../../assets/agent/ui-highlight.js):135-165,255-317). This makes the
current `[data-type="settings-section"] { display: contents; }` rule a real defect for direct
section highlighting ([`settings.css`](../../../src/renderer/editors/settings/settings.css):117-123):
a selector can match the named root while the root has no highlightable box. The plan preserves
that rule and its `data-type="settings-section"` contract, and puts each section root inside a
named wrapper with a non-zero box. The overlay targets the wrapper, so the visual layout semantics
of the existing section roots are not changed.

### Mount timing and closed-page behavior

`PageCollectionWrapper.showSettingsPage()` already delegates to `PagesModel.showSettingsPage()`
([`PageCollectionWrapper.ts`](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):186-194;
[`PagesModel.ts`](../../../src/renderer/api/pages/PagesModel.ts):265-269). Internally,
`PagesLifecycleModel.showSettingsPage()` awaits `showEditorPage()`, which loads/creates the model
and calls `addPage()` ([`PagesLifecycleModel.ts`](../../../src/renderer/api/pages/PagesLifecycleModel.ts):767-786).
`addPage()` updates the page collection synchronously ([`PagesLifecycleModel.ts`](../../../src/renderer/api/pages/PagesLifecycleModel.ts):213-237),
but that does not prove the Settings DOM exists:

1. `PagesView` binds page state and updates `AppPageManagerView` ([`PagesView.ts`](../../../src/renderer/ui/app/PagesView.ts):19-25).
2. The manager renders the native page slot only after the page becomes active
   ([`AppPageManagerView.ts`](../../../src/renderer/components/page-manager/AppPageManagerView.ts):81-82,144-158),
   and `PageSlot.renderNative()` mounts the `PageContentView` ([`PageSlot.ts`](../../../src/renderer/components/page-manager/PageSlot.ts):31-48).
3. `PageContentView` mounts `RenderEditorView`, which mounts `AsyncEditorView`
   ([`PageContentView.ts`](../../../src/renderer/ui/app/PageContentView.ts):148-181;
   [`RenderEditorView.ts`](../../../src/renderer/ui/app/RenderEditorView.ts):22-25).
4. `AsyncEditorView` starts the editor-module promise and only creates/mounts `SettingsView` in
   its continuation ([`AsyncEditorView.ts`](../../../src/renderer/ui/app/AsyncEditorView.ts):75-95,98-123).

Consequently, `settings.highlight(key)` must await `pagesModel.showSettingsPage()`, then wait for
the mapped section wrapper to exist and have a non-zero rectangle before calling
`ui.highlightElement()`. Use exactly 120 `requestAnimationFrame` attempts as the bound. If the
Settings DOM has not mounted by then, throw an error saying “Settings page did not mount in time”;
if the page mounted but the mapped wrapper still has no box/on-screen presence, throw a separate
error saying that “the section for this key is not on screen”. Never call
`ui.highlightElement()` on an unconfirmed selector. If the Settings page is absent/closed, the
method creates it and activates it. If it exists but another page is active, the fixed-id
`addPage()` path activates the existing page. In both cases the method owns the page transition
and the caller does not need a prior `pages.showSettingsPage()` call.

## Implementation Plan

- [ ] Extend `src/renderer/scripting/ai-vision/namespaces/settings.ts` with a hand-written catalog
  constant containing the 13 fixed-order sections and 25 supported rows. Each section record must
  contain a stable section id, display title/description, the public section element name, and
  `rows: { key, label, purpose }[]`. Preserve the existing `browserProfiles` and
  `defaultBrowserProfile` descriptor-provided projections added by US-1303 at the current file’s
  lines 1-31.

  - Add descriptor members for `sections`, `elements`, and
    `highlight(key: string, message?: string)`. `sections` is the catalog an agent reads; its row
    keys are the exact 25-key map above. `elements` is the live protocol projection, with one
    declaration per catalog row and each declaration’s selector set to its named section wrapper.
  - Implement `highlight(key)` as a provided method backed by `createElements()`. The callback
    must first call the renderer’s `pagesModel.showSettingsPage()`, await the mapped wrapper’s
    mount and non-zero box for at most 120 animation frames, call
    `ui.highlightElement(selector, message)` only after that check, and reject if the result is
    not found. The validation path must distinguish a genuinely unknown key from each of the five
    real settings that has no Settings-page row: the latter names the real key, says there is no
    row, and points to `settings.get/set` and its owner where applicable; the former lists every
    valid Settings-surface key. Both errors must be self-correcting.
  - Update the `settings.set` member summary at the existing descriptor member list to say that
    assigning changes the value, while “where do I change it?” should use
    `settings.highlight(key)`. This is the S.2 cross-reference placement: on the setter the agent
    reaches, not only in the root summary.
  - Keep `settings.get/set` as the only generic read/write path. Do not add a second setting
    mutation API or make `highlight()` mutate configuration.

- [ ] Make `src/renderer/scripting/ai-vision/elements.ts` support the Settings-specific error
  vocabulary without changing existing callers. Add an optional validation/error callback plus
  labels/options with defaults that preserve the current “AiVision element / Valid element names”
  wording; the Settings descriptor passes “setting key / Valid setting keys” and intercepts the
  five declared-but-unrepresented keys before the generic unknown-key error. Continue using the
  existing declaration validation, explicit selectors, live visibility calculation, and highlight
  callback.

- [ ] Keep `createSectionRoot(type)` and every existing section root unchanged, including
  `data-type="settings-section"` and its `display: contents` behavior. Modify
  `SettingsView.appendSection()` to create a box-bearing wrapper around each mounted section view,
  assign the wrapper these exact names, and leave the section sources untouched:

  | `SettingsView.onMount()` section call | New wrapper `data-name` |
  |---|---|
  | Theme section call | `settings-section-theme` |
  | Window Behavior section call | `settings-section-window-behavior` |
  | Browser Profiles section call | `settings-section-browser-profiles` |
  | Links section call | `settings-section-link-behavior` |
  | Default Browser section call | `settings-section-default-browser` |
  | File Search section call | `settings-section-file-search` |
  | MCP/Mneme section call | `settings-section-mcp` |
  | Git Integration section call | `settings-section-git-integration` |
  | Board Environment Variables section call | `settings-section-board-vars` |
  | Script Library section call | `settings-section-script-library` |
  | Drawing Library section call | `settings-section-drawing-library` |
  | Video Player section call | `settings-section-video-player` |
  | Terminal section call | `settings-section-terminal` |

  The wrapper must contain the existing section view so its `display: contents` children and the
  existing divider/parent layout participate exactly as before. Do not add per-profile or
  per-control names: the catalog rows intentionally map to the stable section wrapper.

- [ ] Add a dedicated box-bearing `.settings-section-wrapper` rule in
  `src/renderer/editors/settings/settings.css` without changing
  `[data-type="settings-section"] { display: contents; }` or its hidden-state rule. Check the
  mounted page visually so the wrapper does not alter the fixed section order or spacing. The
  wrapper, not the contents root, must have a non-zero rectangle because the overlay’s `place()`
  path drops targets with zero width and height.

- [ ] Add a “Settings page” section to
  `doc/architecture/ui-element-contract.md` between the Menu Bar and Page area sections. Record
  the existing `settings-root`, `settings-content`, and `settings-view-file` selectors plus all
  13 new section-wrapper selectors from the table above. Explain that section names are stable
  containers and that catalog rows/key purposes are supplied by `settings.sections`; keep all
  existing `data-type` values unchanged.

- [ ] Do not add an `asSettings()` member to `PageWrapper` or a Settings facade to
  `PageCollectionWrapper`. Keep the existing `pages.showSettingsPage()` member unchanged; it is
  an implementation dependency of `settings.highlight`, not the discovery entry point for the
  catalog. Do not expand `ui.elements`: Settings elements belong to `settings`, consistent with
  EPIC-085 decision 7 ([EPIC-085](../../epics/EPIC-085.md):95-101).

- [ ] Verify the protocol directly through `call` after implementation:

  - With Settings closed, `settings.sections` returns all 13 sections in `SettingsView.onMount`
    order, and every supported row has exactly one key, label, purpose, and owning section.
  - `settings.elements` returns the 25 key declarations with the section selectors and reports
    false visibility while Settings is closed and true visibility for the active section after the
    page is opened.
  - `settings.highlight("mcp.enabled", ...)` opens/activates Settings, waits through the async
    editor mount, returns `found: true, count: 1`, and visibly rings
    `[data-name="settings-section-mcp"]`. Repeat for a key in a page that was already open but
    inactive.
  - `settings.highlight("not-a-setting", ...)` fails once with “unknown setting key” and the full
    valid key list; recovery with a listed key succeeds. Each of the five declared-but-unrepresented
    keys fails through the separate “real setting, no Settings-page row” error, names the key, and
    directs the caller to `settings.get/set` and its owner where applicable.
  - `settings.set("mcp.enabled", ...)` remains the change operation, and the setter’s returned
    hint/summary cross-references `settings.highlight("mcp.enabled")` for a “where” request.

- [ ] Leave shell QA-file extension and the Haiku acceptance run to US-1307, whose epic task owns
  the application-shell acceptance pass. This task supplies the direct call checks above but does
  not add a dashboard entry, modify the existing US-1306 dashboard row, or remove any old tool.

### Before → after snippets

Current Settings descriptor shape in
`src/renderer/scripting/ai-vision/namespaces/settings.ts:5-30`:

```ts
const SETTINGS_MEMBERS = [
    { name: "get", kind: "method", signature: "get<T = any>(key: string)", summary: "Read a setting; unknown keys return undefined." },
    { name: "set", kind: "method", signature: "set<T = any>(key: string, value: T)", summary: "Persist a setting automatically after a debounce." },
    // browserProfiles and defaultBrowserProfile are provided projections today
];

return {
    kind: "Settings",
    members: SETTINGS_MEMBERS,
    provide: (name) => { /* only the two US-1303 projections */ },
};
```

Planned shape, retaining those projections and adding the surface contract:

```ts
const SETTINGS_ELEMENTS = SETTINGS_CATALOG.flatMap((section) =>
    section.rows.map((row) => ({
        name: row.key,
        purpose: `${row.label}: ${row.purpose}`,
        selector: `[data-name="${section.elementName}"]`,
    })),
);

const elements = createElements(SETTINGS_ELEMENTS, highlightSettingsElement, {
    itemLabel: "setting key",
    validNamesLabel: "Valid setting keys",
});

// In SETTINGS_MEMBERS:
{ name: "set", kind: "method", signature: "set<T = any>(key: string, value: T)",
  summary: "Persist a setting automatically after a debounce. To show where a Settings key is changed, use settings.highlight(key)." },
{ name: "sections", kind: "property", summary: "The Settings page’s sections and hand-written setting-key rows." },
{ name: "highlight", kind: "method", signature: "highlight(key: string, message?: string)",
  summary: "Open or activate Settings and highlight the section for a supported setting key." },
```

Current section-root helper and CSS:

```ts
export function createSectionRoot(type: string): HTMLDivElement {
    const root = document.createElement("div");
    root.dataset.type = type;
    return root;
}
```

```css
[data-type="settings-section"] {
    display: contents;
}
```

Planned target:

```ts
export function appendSection(view: View, parent: HTMLElement, name: string): void {
    const wrapper = document.createElement("div");
    wrapper.dataset.name = name;
    wrapper.className = "settings-section-wrapper";
    wrapper.append(view.element); // the existing section root remains display: contents
    parent.append(wrapper);
}
```

```css
[data-type="settings-section"] {
    display: contents;
}

.settings-section-wrapper {
    display: block;
    width: 100%;
}
```

The wrapper must remain a stable, visible box while inactive page slots remain hidden; the existing
section-root CSS semantics must remain unchanged.

## Concerns

- **Epic shape correction:** A page-only facade cannot answer a catalog question before a page is
  open. The `settings` node is always reachable and is the correct owner of the hand-written
  key-to-section data. A page facade would duplicate the catalog and still need to reach back to
  `settings` for the cross-reference.
- **Closed Settings page:** `settings.highlight(key)` creates the fixed-id Settings page when it
  is absent, or activates the existing page when it is inactive. This is an intentional visible
  side effect and must be stated in the method caution/help. `settings.sections` and the catalog
  remain readable without opening the page; only `highlight` opens it.
- **Async mount race:** Awaiting `showSettingsPage()` alone is insufficient because
  `AsyncEditorView` mounts the actual editor in a later promise continuation. The bounded frame
  wait must run before `ui.highlightElement()`, and timeout must reject rather than produce a
  `found: false`/floating-or-missing highlight that an agent could mistake for success.
- **`display: contents`:** The current section roots are selector-less and box-less. Merely adding
  `data-name` would make `elements.visible` unreliable (`offsetParent` is checked by
  `createElements`) and would let the overlay return selector-match success while `place()` drops
  the ring. The wrapper supplies the real box while preserving the current rule, so the page’s
  layout semantics are not changed; the before/after screenshot is still required to prove that.
- **Key versus element name:** `highlight` accepts setting keys. This keeps the call aligned with
  `settings.set` and makes `settings.highlight("mcp.enabled")` self-evident. The `elements` list
  also uses keys as names, but its explicit selector points at the containing section; the error
  wording must identify them as setting keys.
- **Rows without stable DOM handles:** The existing Settings view does not give individual rows
  stable names, and Browser Profiles has dynamically created profile rows
  ([`BrowserProfilesSection.ts`](../../../src/renderer/editors/settings/sections/BrowserProfilesSection.ts):205-245,346-465).
  This task highlights the owning section, not a particular profile or control. Adding row-level
  names would be a separate contract decision and must not be smuggled into this map.
- **Settings not represented by the page:** The five excluded keys remain valid generic settings,
  but have no row in these sources. They must not be mislabeled as unknown: the no-row error names
  the real key, explains the page limitation, points to `settings.get/set`, and identifies the
  owning UI where source evidence provides one. A separate genuinely-unknown error lists the 25
  supported keys.
- **Mount timeout semantics:** The 120-frame bound is an implementation defect signal, not a
  silent best-effort timeout. “Settings page did not mount in time” means the page DOM was not
  available after the bound; “the section for this key is not on screen” means the page mounted
  but the mapped wrapper never acquired an on-screen box. Neither path may call the highlighter.
- **Catalog duplication risk:** The catalog is intentionally duplicated from the view’s actual
  sources because purpose words are not type information. Acceptance must compare the 13 section
  order and 25 key map against the table in this document whenever a section changes.
- **Scope:** `settings.get/set`, `PageCollectionWrapper.showSettingsPage()`, the existing three
  Settings `data-name`s, and all existing `data-type` values remain. No dashboard update, tool
  removal, or user-facing guide change belongs to this task.

No implementation questions remain. The chosen result is a settings-owned catalog and key-based
highlight, a single lifecycle-aware opener/waiter, 13 named section wrappers, one documented
Settings page contract area, and no Settings page facade.

## Acceptance Criteria

- [ ] `settings.sections` is reachable with the Settings page closed and returns the 13 sections in
  the exact `SettingsView.onMount()` order, including the empty-row Default Browser section.
- [ ] The catalog contains exactly the 25 keys actually read or written by the 13 section sources,
  with a hand-written purpose and exactly one owning section for each key.
- [ ] `tab-recent-languages`, `search-max-file-size`, `pinned-editors`, `visualizer-effect`, and
  `audio-shuffle` are not presented as Settings-page rows and each produces the distinct
  real-setting/no-row error naming the key, pointing to `settings.get/set`, and naming its owner
  where applicable; they remain available to generic `settings.get/set` as declared settings.
- [ ] `settings.elements` exposes one declaration per supported setting key, with a purpose,
  `[data-name="settings-section-…"]` selector, and live visibility; it does not add these names to
  `ui.elements`.
- [ ] The current US-1303 `settings.browserProfiles` and `settings.defaultBrowserProfile`
  projections remain present and unchanged in behavior.
- [ ] `settings.highlight(key)` accepts a supported setting key, opens/activates Settings even
  when it was closed or inactive, waits until the named section wrapper is mounted and box-bearing,
  then returns `found: true` and draws the overlay over that section.
- [ ] The highlighter never runs against a missing/unmounted Settings selector. A mount timeout or
  a non-found result rejects with a descriptive error rather than silently succeeding.
- [ ] A genuinely unknown key produces a separate self-correcting error naming the bad key and
  every valid Settings-surface key. Existing non-Settings callers of `createElements()` retain
  their current error vocabulary and behavior.
- [ ] Every box-bearing section wrapper has its exact stable `data-name` from the implementation
  table; its child section root retains `data-type="settings-section"` and
  `display: contents`, and the page remains in the fixed visual order.
- [ ] The `ui-element-contract.md` Settings page area records `settings-root`,
  `settings-content`, `settings-view-file`, and all 13 new section selectors.
- [ ] `settings.set` remains the only generic setting-change operation and its member summary
  cross-references `settings.highlight(key)` for “where” questions, following the S.2 finding.
- [ ] No `pages[i].asSettings()` member is added; `PageCollectionWrapper.showSettingsPage()` and
  the existing `pages` API remain compatible.
- [ ] Direct call checks cover closed-page opening, inactive-page activation, async mount waiting,
  visible overlay placement, unknown-key recovery, the excluded-key rejection, and
  `settings.set` behavior. `ui.clearHighlights()` removes the resulting overlay.
- [ ] Failure-path checks exercise both a Settings-page mount that exceeds 120 animation frames
  and a mounted page whose mapped wrapper never acquires an on-screen box; they assert the distinct
  “Settings page did not mount in time” and “the section for this key is not on screen” messages
  and confirm that `ui.highlightElement()` was not called.
- [ ] App-window screenshots taken before and after the change show identical section spacing,
  dividers, max-width, and alignment.
- [ ] Typecheck, lint, and production build pass after implementation; no old MCP tool is removed
  and no existing `data-type` is renamed.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/scripting/ai-vision/namespaces/settings.ts` | Add the hand-written 13-section/25-row catalog, key-named element declarations, lifecycle-aware `highlight(key)`, closed/inactive-page behavior, and the `settings.set` cross-reference; preserve US-1303 projections. |
| `src/renderer/scripting/ai-vision/elements.ts` | Add optional error labels and a validation/error hook so Settings can distinguish a real key with no page row from an unknown key while existing element consumers keep their current wording. |
| `src/renderer/editors/settings/SettingsView.ts` | Wrap each mounted section view in a stable, box-bearing named wrapper without changing the section roots. |
| `src/renderer/editors/settings/settings.css` | Add the wrapper’s full-width box rule; preserve the section-root `display: contents` rule and data-type contract. |
| `doc/architecture/ui-element-contract.md` | Add the Settings page selector contract for the existing page names and 13 new section names. |
| `doc/tasks/US-1306-settings-surface/README.md` | This investigation and implementation plan. |

Files explicitly needing no changes: `src/renderer/scripting/api-wrapper/PageWrapper.ts`;
`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` (including its existing
`showSettingsPage()`); `src/renderer/scripting/ai-vision/root.ts`;
`src/renderer/scripting/ai-vision/namespaces/index.ts`;
`src/renderer/api/settings.ts`; `src/renderer/api/types/settings.d.ts`;
`src/renderer/editors/settings/SettingsEditor.ts`; `src/renderer/editors/settings/index.ts`;
`src/renderer/editors/settings/sections/settings-native.ts`; the six section view source files
(`ThemeSection.ts`, `SettingsSections.ts`, `BrowserProfilesSection.ts`,
`DefaultBrowserSection.ts`, `FileSearchSection.ts`, and `McpSection.ts`);
`src/renderer/editors/settings/sections/McpSectionModel.ts`;
`src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts`;
`src/renderer/api/ui.ts`; `assets/agent/ui-highlight.js`; `src/shared/ai-vision/types.ts`;
`src/renderer/scripting/ai-vision/namespaces/ui.ts`; `qa/surfaces/shell.md` (US-1307 owns its
acceptance extension); `doc/active-work.md` and `doc/epics/EPIC-085.md` (the existing dashboard and
epic row are not changed); `src/main/mcp/tools/window-tools.ts`;
`src/main/mcp/tools/page-tools.ts`; all files under `src/renderer/uikit/`; and every other file
not listed in the planned-change table above.
