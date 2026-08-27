# US-1146 — Convert settings to native VanillaViews

## Goal

Convert the `settings` editor from the `EditorModule.Component` arm to the
`EditorModule.View` arm. The completed conversion must preserve the captured
settings-page DOM and settings round-trips while removing the page's React
root. This document records the source investigation and the implementation
breakdown; it does not implement the conversion.

## Background

US-1146 is task 5 of EPIC-071 (De-React E13). The measured cut is 8 JSX-bearing
files, 829 newline-counted lines, and 284 JSX markers. The file list was
verified with `rg --files`, not inferred from the directory name:

| File | JSX markers | Lines |
| --- | ---: | ---: |
| `src/renderer/editors/settings/SettingsView.tsx` | 49 | 99 |
| `src/renderer/editors/settings/sections/SettingsSections.tsx` | 85 | 305 |
| `src/renderer/editors/settings/sections/BrowserProfilesSection.tsx` | 64 | 112 |
| `src/renderer/editors/settings/sections/McpSection.tsx` | 44 | 98 |
| `src/renderer/editors/settings/sections/ThemeSection.tsx` | 19 | 90 |
| `src/renderer/editors/settings/sections/DefaultBrowserSection.tsx` | 12 | 43 |
| `src/renderer/editors/settings/sections/FileSearchSection.tsx` | 10 | 61 |
| `src/renderer/editors/settings/index.tsx` | 1 | 21 |
| **Total** | **284** | **829** |

The same directory also contains the non-JSX editor/model files that must be
preserved or adapted as part of the conversion: `SettingsEditor.ts`,
`sections/BrowserProfilesSectionModel.ts`, `sections/DefaultBrowserSectionModel.ts`,
and `sections/McpSectionModel.ts`.

The baseline in `doc/tasks/US-1151-e13-baseline/README.md` was captured with
`app.pages.showSettingsPage()`: 555 elements, 1 React root, 0 react-slots,
14 SVGs with 0 empty SVGs, 24 buttons, 7 inputs, 5 `LABEL` elements, and 12
`BR` elements. The three required markers are `settings-root`,
`settings-content`, and `settings-view-file`.

The editor currently registers the React arm. `src/renderer/editors/settings/index.tsx:7-15`
defines `SettingsEditorComponent` and assigns `Component: SettingsEditorComponent`.
The target registration is the direct native-view arm:

```tsx
// Before: src/renderer/editors/settings/index.tsx:7-15
function SettingsEditorComponent({ model }: { model: EditorModel }) {
  return <SettingsView model={model as SettingsEditor} />;
}

export const settingsModule: EditorModule = {
  ...,
  Component: SettingsEditorComponent,
};

// After: planned shape
export const settingsModule: EditorModule = {
  ...,
  View: SettingsView,
};
```

`src/renderer/editors/settings/SettingsEditor.ts:21-29` is already the editor
model and `src/renderer/editors/settings/SettingsView.tsx:30-94` is the page
root. `src/renderer/editors/register-editors.ts:167` registers this module;
`src/renderer/api/pages/PagesLifecycleModel.ts:749-752` exposes
`app.pages.showSettingsPage()`, so the standalone editor already has a usable
verification route.

## Import graph and staged conversion order

The import graph, rather than directory containment, determines the safe
order. `SettingsView.tsx` imports all section faces; the six section files are
leaves for this conversion. `index.tsx` is the registration root above
`SettingsView.tsx` (the page root inside the graph is `SettingsView.tsx`). The
four model files are model dependencies of the section leaves, not additional
JSX leaves.

The proposed order is:

1. **`FileSearchSection.tsx` and `ThemeSection.tsx` (leaf pass).** Replace the
   two smallest stateful leaves with `FileSearchSectionView` and
   `ThemeSectionView`. At this intermediate point their parents still render
   the native leaves through the existing bridge, so the page remains one
   React root and no parent is allowed to introduce a second root.
2. **`DefaultBrowserSection.tsx` and `McpSection.tsx` (model-backed leaf pass).**
   Port their views together with the mount/dispose lifecycle of
   `DefaultBrowserSectionModel` and `McpSectionModel`; MCP status and its poll
   must disappear when the section is removed.
3. **`BrowserProfilesSection.tsx` (model-backed dynamic leaf).** Port the
   profile list, menu handle, timer, and `BrowserProfilesSectionModel` as one
   owned subtree so profile changes replace/dispose children rather than leave
   hidden running rows.
4. **`SettingsSections.tsx` (section-composition pass).** Port its eight
   settings sections and its two effect-bearing models after the leaf APIs are
   native. The intermediate page can still have a React parent, but its
   section children must now be native views.
5. **`SettingsView.tsx` (page-root pass).** Replace the outer page composition,
   dividers, title, and file button with a native `SettingsView`; this is the
   point at which the settings React root is removed.
6. **`index.tsx` (registration pass).** Remove the adapter component and set
   `View: SettingsView`, retaining the public `SettingsEditor` and
   `SETTINGS_PAGE_ID` exports at `index.tsx:17-20`.

Each intermediate state must keep one ownership chain: the parent owns every
child view and disposes it before its own DOM is discarded. There must be no
temporary `mountReact`/nested root added to compensate for an incomplete
leaf. After the last step the module is `View`-only for this editor.

## Component and lifecycle mapping

The following maps every React component in the eight JSX files to its native
replacement. Existing model classes are included where they own effects or
asynchronous work.

| Current component | Source | Native replacement and lifecycle destination |
| --- | --- | --- |
| `SettingsEditorComponent` | `index.tsx:7-15` | Delete the adapter; `settingsModule.View = SettingsView`. |
| `SettingsView` | `SettingsView.tsx:30-94` | `SettingsView` extends `VanillaView<SettingsEditor>`; construct stable root only, build children in `onMount`, and dispose section views/child handles in `onDispose`. |
| `ThemePreview` | `ThemeSection.tsx:14-31` | `ThemePreviewView`; render a native preview subtree in `onMount`/`onUpdate`, with no React hook. |
| `ThemeSection` | `ThemeSection.tsx:34-89` | `ThemeSectionView`; subscribe to `settings` in `onMount` (or `bind` only while the singleton source remains the lifetime source), update controls in `onUpdate`, dispose the subscription in `onDispose`. `applyTheme` remains the live click caller. |
| `FileSearchSection` | `FileSearchSection.tsx:7-60` | `FileSearchSectionView`; create the two textareas in `onMount`, attach input/blur handlers there, and own the settings subscription and DOM listeners. |
| `BrowserProfilesSection` | `BrowserProfilesSection.tsx:62-110` | `BrowserProfilesSectionView`; own model, profile row views, `WithMenu` replacement, and the replaceable profile-list subscription. Dispose rows, menu, and model before the section. |
| `BookmarksFileLine` | `BrowserProfilesSection.tsx:33-42` | `BookmarksFileLineView`; native path/button row, owned by `BrowserProfilesSectionView` and disposed with it. |
| `TorProfileRow` | `BrowserProfilesSection.tsx:44-60` | `TorProfileRowView`; native row with model-backed port input and status. It is destroyed when its profile branch is removed. |
| `McpSection` | `McpSection.tsx:32-97` | `McpSectionView`; own `McpSectionModel` and its status/poll subscriptions in `onMount`; dispose the model and colorized-code child in `onDispose`. |
| `DefaultBrowserSection` | `DefaultBrowserSection.tsx:7-42` | `DefaultBrowserSectionView`; own `DefaultBrowserSectionModel` from mount through dispose. |
| `LinkBehaviorSection` | `SettingsSections.tsx:86-104` | `LinkBehaviorSectionView`; native `SelectView`, settings subscription/binding, and change listener owned by the view. |
| `WindowBehaviorSection` | `SettingsSections.tsx:106-128` | `WindowBehaviorSectionView`; native checkbox and conditional description subtree. Description is purely visual and may be replaced/hidden, but the view must own its DOM. |
| `GitIntegrationSection` | `SettingsSections.tsx:130-158` | `GitIntegrationSectionView`; own `GitIntegrationModel`, probe subscription/effect, and conditional status subtree. |
| `BoardVarsSection` | `SettingsSections.tsx:160-192` | `BoardVarsSectionView`; native path row and browse/clear handlers; own the dynamic file dialog operation and listener cleanup. |
| `ScriptLibrarySection` | `SettingsSections.tsx:194-213` | `ScriptLibrarySectionView`; native path row and browse/clear handlers owned by the view. |
| `DrawingLibrarySection` | `SettingsSections.tsx:215-234` | `DrawingLibrarySectionView`; native path row and browse/clear handlers owned by the view. |
| `VideoPlayerSection` | `SettingsSections.tsx:236-274` | `VideoPlayerSectionView`; own `VideoPlayerModel`, port input, path branch, and browse action. Dispose the model and its effect. |
| `TerminalSection` | `SettingsSections.tsx:284-304` | `TerminalSectionView`; native `SelectView`, settings change listener, and item updates owned by the view. |

### Hook and model audit

The epic's hook count was verified against source. There is no `useState` or
`useMemo` in the settings tree. There are three textual `useEffect` matches
(the import plus two calls) and three textual `useRef` matches (the import
plus two refs) in `FileSearchSection.tsx:7-18`; there are three textual
`useCallback` matches (the import plus two definitions) at
`FileSearchSection.tsx:20-28`. The two callback definitions are both live:
`handleExtensionsChange` is called by the extensions textarea `onChange` at
`FileSearchSection.tsx:37`, and `handleExcludeChange` is called by the exclude
textarea `onChange` at `FileSearchSection.tsx:51`. Their blur callbacks are
also live at `FileSearchSection.tsx:40` and `:54`. No callback may be ported
without retaining those callers; an unused definition would recreate the
silent-regression class described in EPIC-071 §E13-7.

The effect-bearing model inventory is separate from React hooks:

| Model/effect | Source | Native destination |
| --- | --- | --- |
| Git probe | `SettingsSections.tsx:34-55`, effect `:40-53` | Instantiate in `GitIntegrationSectionView.onMount`; own model and dispose in `onDispose`. |
| Video stream status | `SettingsSections.tsx:61-76`, effect `:67-74` | Instantiate in `VideoPlayerSectionView.onMount`; own model and dispose in `onDispose`. |
| Default-browser status | `DefaultBrowserSectionModel.ts:12-16` | Create in `DefaultBrowserSectionView.onMount`; dispose on branch removal. |
| Browser-profile Tor seed | `BrowserProfilesSectionModel.ts:29-35` | Create/own model in `BrowserProfilesSectionView.onMount`; clear its timer and dispose it in `onDispose`. |
| MCP port/status | `McpSectionModel.ts:25-36` | Create/own model in `McpSectionView.onMount`; clear the `setTimeout` at `:89-93` and dispose all subscriptions when the section leaves the page. |

## JSX parity hazards

### `BR` and `LABEL`

The 12 baseline `BR` elements are not authored as literal `<br>` tags in the
settings JSX. They are emitted by the `ColorizedCode` path used by
`McpSection.tsx:50-57` and `:93`: `src/renderer/editors/shared/ColorizedCode.ts:7-9`
mounts `ColorizedCodeView`, whose `startColorization` path is at
`src/renderer/editors/shared/ColorizedCodeView.ts:80-94` and delegates to
Monaco's colorizer, which emits `<br/>` for each JSON line.
The native MCP view must retain `ColorizedCodeView`/the same colorizer
behavior, so the 12 line breaks remain part of the code block's layout.

The five `LABEL` elements come from the five `Checkbox` usages: three in
`McpSection.tsx:64,67,84` and two in `SettingsSections.tsx:115,144`.
`src/renderer/uikit/Checkbox/CheckboxView.tsx:15` creates a semantic
`<label>` containing the checkbox and its text; there is no `for`/`id`
association in this implementation. The native replacement must use the
UIKit checkbox view or reproduce that wrapping-label contract, including the
visible label text, rather than replacing it with a decorative span.

### Conditional branches and persistent children

| Branch | Source | Disposal decision |
| --- | --- | --- |
| Window close-to-tray description | `SettingsSections.tsx:107-124` | No running work; it may be updated/replaced while the parent remains mounted. |
| Git enabled/probe status | `SettingsSections.tsx:140-155` | The probe-backed child/model must be disposed when disabled or when the section leaves. |
| Board vars path vs unset placeholder | `SettingsSections.tsx:180-188` | No persistent async child; replace the path row/placeholder. |
| Script path vs unset placeholder | `SettingsSections.tsx:203-211` | No persistent async child; replace the path row/placeholder. |
| Drawing path vs unset placeholder | `SettingsSections.tsx:224-232` | No persistent async child; replace the path row/placeholder. |
| Video executable configured | `SettingsSections.tsx:257-269` | Dispose the model-backed status child when the configured branch is removed. |
| Browser profile list/default/Tor rows | `BrowserProfilesSection.tsx:82-105` | Destroy removed rows; the model has a timer/port work and must not remain hidden. |
| MCP server configured/status | `McpSection.tsx:73-81,88-91` | Destroy status branches and the parent model when removed; running checks/polling/subscriptions cannot be hidden. |
| Default-browser status actions | `DefaultBrowserSection.tsx:22-36` | Keep only while the section is mounted; dispose the model on page/branch removal. |

`SubtreeSwap`/`KeyedList` or an equivalent explicit replace-and-dispose
mechanism should be used for dynamic profile/status children. A CSS-hidden
child is not an acceptable lifecycle substitute for the Browser Profiles or
MCP branches.

## Subscriptions and source identity

The `settings` singleton is defined at `src/renderer/api/settings.ts:193-224`
and is a fixed source for the lifetime of this page. Its settings values may
change, but the source object does not change; `own()` or `bind()` is therefore
valid for those subscriptions if the binding is created during mount and
disposed with the view. This applies to `theme`, `search-extensions`,
`search-exclude`, `link-open-behavior`, `window.close-to-tray`, `git.enabled`,
`board-vars.file`, `script-library.path`, `drawing.library-path`, `vlc-path`,
`video-stream.port`, and `terminal.command`.

The singleton `themeState` is likewise a fixed source for the view lifetime;
Theme's colors can update, but its source identity does not. A normal owned
subscription is sufficient. No settings source in this tree is reassigned by
the existing code, so no source-identity replaceable subscription is required
for `settings` or `themeState`. Replaceable subscriptions are still required
for identity-changing dynamic children: browser profile rows and MCP/status
resources must replace their subscriptions when their key/model changes.

## Settings round-trip inventory

Every control must keep its current read/write path through `app.settings`.
The following names are the acceptance inventory, with reads and writes
verified in the listed source lines:

| Control | Setting round-trip evidence |
| --- | --- |
| Link behavior select | `SettingsSections.tsx:87-101`, `link-open-behavior`; select change writes the setting. |
| Close-to-tray checkbox | `SettingsSections.tsx:107-124`, `window.close-to-tray`; checkbox change writes the setting. |
| Git integration checkbox | `SettingsSections.tsx:132-155`, `git.enabled`; checkbox change writes the setting. |
| Board variables path | `SettingsSections.tsx:161-188`, `board-vars.file`; browse and clear write the setting. |
| Script library path | `SettingsSections.tsx:195-211`, `script-library.path`; browse and clear write the setting. |
| Drawing library path | `SettingsSections.tsx:216-232`, `drawing-library-path`; browse and clear write the setting. |
| VLC executable path | `SettingsSections.tsx:237-269`, `vlc-path`; browse and clear write the setting. |
| Video stream port | `SettingsSections.tsx:237-269`, `video-stream.port`; input/model writes the setting. |
| Terminal command select | `SettingsSections.tsx:276-304`, `terminal.command`; select change writes the setting. |
| Theme select | `ThemeSection.tsx:34-89`, `theme`; theme selection calls `settings.set`. |
| File-search extensions textarea | `FileSearchSection.tsx:7-40`, `search-extensions`; blur writes the setting. |
| File-search exclusions textarea | `FileSearchSection.tsx:7-54`, `search-exclude`; blur writes the setting. |
| Browser-profile controls | `BrowserProfilesSection.tsx:62-110` and `BrowserProfilesSectionModel.ts:29-136`; `browser-profiles`, `browser-default-profile`, `browser-default-bookmarks-file`, `browser-incognito-bookmarks-file`, `tor.socks-port`, `tor.exe-path`, and `tor.bookmarks-file` are read/written through the model/settings methods. |
| MCP controls | `McpSection.tsx:32-97` and `McpSectionModel.ts:25-95`; `mcp.enabled`, `mcp.browser-tools.enabled`, `mcp.port`, `mneme.enabled`, and `mneme.port` are read/written through the model/settings methods. |
| Default-browser status/actions | `DefaultBrowserSection.tsx:7-42` and `DefaultBrowserSectionModel.ts:12-45`; these controls are an API round-trip (`isRegisteredAsDefaultBrowser` → register/unregister → `checkStatus`), not an `app.settings` value. Preserve that API contract rather than inventing a setting. |

The implementation must verify each named control by changing it through the
UI, reopening or reloading the settings view, and confirming the corresponding
`app.settings` value round-trips. This is a manual verification requirement,
not a proposal for a unit test or test harness.

## UIKit face callers and deletion scope

The corrected EPIC-071 §E13-12 matcher was used: a tag is a caller when it is
`<Sym` followed by whitespace, `/`, `>`, or end-of-line; `createElement(Sym,
...)` was also checked. Comments mentioning `<Sym>` were not counted as
callers, and each zero-caller conclusion was checked in the source file.
There are no `createElement(Sym, ...)` calls for the listed UIKit faces in
settings; `BrowserProfilesSection.tsx:25-30` creates a native `span`, not a
UIKit component.

| UIKit face | Settings sites | Last value caller within `settings`? |
| --- | ---: | --- |
| `Divider` | 13, all `SettingsView.tsx:54,56,58,67,71,73,75,77,79,81,83,85,87` | Yes: this conversion removes its last settings value caller, but not necessarily its global callers. |
| `Select` | 2: `SettingsSections.tsx:94-101,300-302` | Yes within settings; global callers remain, so do not delete. |
| `IconButton` | 4: `BrowserProfilesSection.tsx:40,53,102`; `SettingsSections.tsx:261` | Yes within settings; global callers remain. |
| `Input` | 5: `BrowserProfilesSection.tsx:56`; `BrowserProfilesSection.tsx:109`; `McpSection.tsx:71,86`; `SettingsSections.tsx:265` | Yes within settings; global callers remain. |
| `Checkbox` | 5: `McpSection.tsx:64,67,84`; `SettingsSections.tsx:115,144` | Yes within settings; global callers remain. |
| `Dot` | 5: `BrowserProfilesSection.tsx:88,97,109`; `McpSection.tsx:75,89` | Yes within settings; global callers remain. |
| `Textarea` | 2: `FileSearchSection.tsx:36,50` | Yes within settings; global callers remain. |
| `Icon` | 2: `BrowserProfilesSection.tsx:48,106` | Yes within settings; global callers remain. |
| `Button` | settings uses at `SettingsView.tsx:89`, `BrowserProfilesSection.tsx:89,91,99,101,109`, `DefaultBrowserSection.tsx:27,32,36`, `McpSection.tsx:79,90,94`, and `SettingsSections.tsx:183-188,208-209,229-230` | Yes within settings; global callers remain. |
| `Text` | headings, descriptions, labels, paths, status, and code-adjacent text throughout all eight JSX files | Yes within settings; global callers remain. |
| `Panel` | section/page panels throughout all eight JSX files | Yes within settings; global callers remain. |
| `WithMenu` | `BrowserProfilesSection.tsx:97` | Yes within settings; global callers remain. |

No UIKit face is deleted by US-1146. The corrected global table in EPIC-071
§E13-12 records surviving callers such as `McpInspectorView.tsx:128,215`
(`Divider`) and `GraphExpansionSettings.tsx:129` (`Select`), and the wider
callers for the other faces; those call sites remain outside this task.

## Non-UIKit `mountVanilla` faces

The settings JSX imports no non-UIKit component that can be freed by this
conversion. `ColorizedCode` is a non-UIKit React shim at
`src/renderer/editors/shared/ColorizedCode.ts:7-9`, used by `McpSection.tsx:93`; its
other renderer caller is `src/renderer/editors/browser/TorStatusOverlay.tsx:7,97`.
The native code-block implementation is already used by
`src/renderer/editors/markdown/CodeBlock.ts:6,67-74`, but that does not make the
React shim a zero-caller face. There are no other non-UIKit `mountVanilla`
faces imported by settings, and no dead `index.ts` re-export was found for
this set. Therefore there is no non-UIKit face to delete in US-1146.

## Constraint audit

- **Colors:** existing settings styles use `color` tokens and the existing
  named browser-profile palette. `SettingsView.tsx:49` reads `color.text.dark`;
  `BrowserProfilesSection.tsx:18-22` reads `color.text.light`,
  `color.text.dark`, and `color.border.default`; and
  `src/renderer/theme/palette-colors.ts:2-15` defines the existing
  `DEFAULT_BROWSER_COLOR`/`TAG_COLORS` palette. The native port must preserve
  these imports or use semantic UIKit tokens; it must not introduce literal
  colors.
- **Banned requires:** no `require("path")` or `require("fs")` occurs under
  `src/renderer/editors/settings`. The only CommonJS require is
  `BrowserProfilesSectionModel.ts:8`, `require("electron")`. File operations
  in `SettingsSections.tsx:163-168` use a dynamic `import("fs")`; preserve
  that form and do not replace it with a banned require.
- **Errors:** no hand-rolled error stringification was found: no
  `String(error)`, caught `.message` formatting, or `instanceof Error` error
  display in the settings tree. Existing catches use fallback state or
  `console.error`; any new error display must use `errMessage` from
  `src/shared/utils.ts`.
- **View lifecycle:** the port must obey `src/renderer/uikit/CLAUDE.md`:
  constructors only establish stable state, mount builds children and
  subscriptions, children are disposed first, and `bind()` is only used for
  sources that outlive the view.

## Implementation Plan

1. Add native view classes for the six leaf section files, preserving their
   DOM semantics and explicit UIKit styling. Port File Search and Theme first.
2. Port Default Browser and MCP with owned models, status subscriptions, and
   timer cleanup; then port Browser Profiles with keyed row disposal and a
   replaceable menu handle.
3. Port the eight sections and the Git/Video effect-bearing models in
   `SettingsSections.tsx`, retaining every settings read/write callback.
4. Replace `SettingsView.tsx` with native composition and preserve the outer
   `settings-root`, inner `settings-content`, title, divider count, and
   `settings-view-file` marker.
5. Change `settingsModule` in `index.tsx` from `Component` to `View` and
   preserve its public exports.
6. Verify the standalone route and all baseline counters manually, including
   every settings control in the round-trip inventory. Do not add unit tests,
   test harnesses, or a second route.

## Concerns

- The page has the highest marker count in this epic's cut. A partial parent
  conversion must not mount a React root inside a native child.
- MCP colorized JSON is responsible for the baseline `BR` elements; replacing
  it with plain text would silently alter layout.
- Checkbox labels are semantic wrapping labels, not decorative text; preserve
  their accessibility behavior.
- Browser Profiles, MCP, Default Browser, Git, and Video contain model-backed
  work. Conditional removal must dispose the work instead of hiding it.
- The existing model classes register `effect()` callbacks. The native view
  must own and dispose these models rather than passing them to a driver that
  rejects effect-bearing models.
- The `settings` singleton has fixed identity, while dynamic profile/status
  children do not; use ordinary owned bindings for the former and replaceable
  subscriptions for the latter.

## Acceptance Criteria

- The settings module is registered on `View`, not `Component`, and
  `app.pages.showSettingsPage()` opens the native editor.
- React roots go from **1 to 0** and react-slots remain 0.
- The settings baseline remains **555 elements**, **24 buttons**, **7 inputs**,
  **14 SVGs with 0 empty SVGs**, **5 `LABEL`**, and **12 `BR`**.
- All three markers remain present: `settings-root`, `settings-content`, and
  `settings-view-file`.
- Every named persisted settings control round-trips to `app.settings`: theme;
  file-search extensions and exclusions; link behavior; close-to-tray; Git
  integration; board variables path; script library path; drawing library
  path; VLC executable; video stream port; terminal command; browser-profile
  bookmark/Tor/profile/color controls; and MCP enable/configuration/port
  controls. The default-browser status/register actions round-trip through
  the documented API status/register contract because they have no
  `app.settings` value.
- All React components and hooks in the eight JSX-bearing files are replaced;
  both `FileSearchSection` callbacks retain their live `onChange` callers.
- Browser Profiles, MCP, Default Browser, Git, and Video model work is
  disposed when its conditional branch or owning view is removed; no hidden
  timer, poll, download, check, or subscription survives.
- No listed UIKit face is deleted in this task, and no non-UIKit zero-caller
  `mountVanilla` face is deleted because `ColorizedCode` still has its browser
  caller.
- No unit tests or test harnesses are added. No protected files, baseline
  documents, dashboard entries, or unrelated editor implementations are
  changed.

## No changes

- `src/renderer/components/page-manager/PageSlot.ts`
- `src/renderer/uikit/shared/vanilla-view.ts`
- `src/renderer/editors/monaco/`
- `src/renderer/editors/about/`
- `src/renderer/editors/tools-hub/`
- `src/renderer/editors/mneme-config/`
- `src/renderer/editors/mneme-root/`
- `src/renderer/ui/sidebar/`
- `eslint.config.mjs`
- `doc/active-work.md`
- `doc/de-react.md`
- `doc/epics/EPIC-071.md`
- `doc/tasks/US-1151-e13-baseline/README.md`
- `doc/tasks/US-1144-about-tools-hub/README.md`

## Files Changed

Only this investigation document is written by US-1146:

- `doc/tasks/US-1146-settings/README.md`

The source files named throughout this document are investigation targets and
planned implementation targets; they are intentionally unchanged in this
task.
