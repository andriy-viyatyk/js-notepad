# US-1303: windows parity audit and get_app_info field redistribution

**Epic:** [EPIC-085](../../epics/EPIC-085.md)  
**Status:** Implementation complete — live acceptance pending US-1307  
**Created:** 2026-09-05

## Goal

Replace the discovery and application-facts role of list_windows, open_window, and get_app_info with
verified call paths. This document records the complete field/error audit, the source-backed owner
for each application-info field, and the implementation/acceptance plan. No implementation or tool
deletion is part of this task.

## Background

EPIC-085 decision 1 requires redistribution, not an appInfo bag: version, pageCount, and
activePageId stay at the root summary; browser profile values go by the browser/profile owner;
resource directories go under shell or main according to source ownership; and the two
recommended-components catalog URLs go under boards ([EPIC-085](../../epics/EPIC-085.md):46-53).
Decision 2 makes the windows work a field-by-field proof and says the existing WindowNode/open
behavior should be reused ([EPIC-085](../../epics/EPIC-085.md):55-60). Decision 9 makes the tools
retirable only after the call-only gate, with deletion deferred to EPIC-090
([EPIC-085](../../epics/EPIC-085.md):108-111; [roadmap](../../agent-transparency-roadmap.md):26-30,
149-168).

The dashboard and EPIC-085 task table already contain US-1303. They are intentionally not changed
here, as requested.

### Verified old-tool contracts

The two window tools are main-process handlers. list_windows maps openWindows.windows, reads each
window's persisted windowStates entry, and serializes an array
([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):1-43). Its window fields are:

| Field | Verified behavior |
|---|---|
| windowIndex | w.index ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):16-20). |
| status | open if w.window exists, otherwise closed ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):19-20). |
| pageCount | wState.pages.length, defaulting to 0 ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):17-22). |
| activePageId | wState.activePageId; JSON.stringify omits it when undefined ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):21-22, 42). |
| pages | Persisted page descriptors mapped at window-tools.ts:23-39. |

Each page contains id, title, type, editor, language, filePath, modified, and pinned. Browser pages
add profileName, isIncognito, and isTor only. The handler reads the first matching main editor
state, defaults title to Empty, uses the persisted page flags, and never adds a browser URL
([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):23-39). The shared state contract
confirms that type and editor are distinct fields ([shared/types.ts](../../../src/shared/types.ts):12-25).

open_window looks up the same openWindows.windows collection. An unknown index returns an error
content block; an open entry is focused and returns a success message; a closed entry is recreated,
awaits whenReady, and returns a different success message; create/ready failures are caught and
returned as errors ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):46-78).

### Verified call routing and shaping

routeCallPath resolves windows, windows.$help, windows[i], and main-owned window members in the
main process. For open windows it forwards windows[i].pages and deeper paths to the target renderer;
for closed windows it resolves persisted pages locally ([call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):34-67).
The handler restores the windows[i] prefix on forwarded result paths and hints
([call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):70-83, 174-183).

The shared resolver awaits every hop, validates descriptor members, catches method errors, and
shapes the final value ([resolver.ts](../../../src/shared/ai-vision/resolver.ts):73-163). Descriptor
instances use summarize, and undefined values in plain objects become null
([result-shaper.ts](../../../src/shared/ai-vision/result-shaper.ts):20-69). The call MCP adapter
adds the standard value/error/hint envelope ([call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):205-230).
Therefore old-tool JSON text and call result JSON are not expected to be byte-identical.

### Verified current windows tree

WindowNode reads the same openWindows and windowStates sources as list_windows and advertises
index, status, pageCount, activePageId, pages, open(), and focus()
([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):16-27, 50-107). Its pages getter
currently emits id, title, editor, language, filePath, modified, pinned, and the three browser
identity fields, but not type ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):40-48,
71-88).

For an open window, windows[i].pages is forwarded to renderer PageCollectionWrapper. The exact
collection result is its summary, kind Pages plus count and activePageId; indexing it returns a
live PageWrapper ([call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):58-64;
[PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):64-73).
For a closed window, windows[i].pages is the local persisted WindowNode.pages array
([call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):58-62;
[main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):71-88).

The live PageWrapper summary has id, title, editor, language, filePath, modified, pinned, and
active. Browser pages add profileName, isIncognito, isTor, optional openedByAgent, and a URL only
when the privacy rule allows it ([PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):41-70,
206-228, 248-269). It has no type member or summary field, and this is intentional: the live
editor id is the actionable classifier for an open page, while the persisted type is a fallback
classifier for closed pages whose optional editor id was never stored ([PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):23,
46-47, 159-166; [shared/types.ts](../../../src/shared/types.ts):1, 12-21).

### Half A: complete field-by-field parity audit

#### Window-level comparison

| list_windows | windows / windows[i] | Verified finding |
|---|---|---|
| Array of full window objects | windows exact path is WindowsNode.summarize: kind, count, open; live children are [i] summaries | Result shape differs by design. windows is cooperative discovery, not a raw replacement array ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):122-151; [result-shaper.ts](../../../src/shared/ai-vision/result-shaper.ts):44-46). |
| windowIndex | windows[i].index | Same numeric identity, different property name. index is explicitly described as the value other tools call windowIndex ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):19-26). |
| open/closed status | windows[i].status | Open/closed parity holds for every reachable index. WindowNode also has an unreachable missing branch because WindowsNode.index returns no node for an absent index ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):57-61, 134-137). |
| Persisted pageCount | windows[i].pageCount | Parity holds: both read windowStates[index].pages.length with a zero fallback ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):16-22; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):63-65). |
| activePageId omitted when undefined | windows[i] summary and live pages summary use null fallback | Existing id values have parity; undefined-versus-null encoding differs ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):21-22, 42; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):67-69, 117; [PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):71-72). |

#### Page comparison at windows[i].pages[j]

| list_windows.pages[j] | Closed call / open call | Verified finding |
|---|---|---|
| id: p.id | Closed WindowNode uses p.id; open PageWrapper uses its live page id | Parity holds conceptually; closed/old values are persisted and open values are live ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):24-29; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):71-87; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):248-259). |
| title: state.title or Empty | Closed uses the same persisted fallback; open uses live model.title | Closed parity holds. Live provenance/default behavior differs because PageWrapper does not apply the old handler's explicit Empty fallback ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):24-30; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):74-79; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):131-137, 248-253). |
| type: state.type | Closed WindowNode currently omits it; open PageWrapper intentionally omits it | **Persisted-path gap only.** Add type to closed WindowNode.pages. Do not add it to PageWrapper: type is the inert shared legacy EditorType classifier, while open pages already expose the actionable editor id used by addEditorPage. A persisted page may have no editor because IEditorState.editor is optional, so closed pages need type; open pages should use editor ([shared/types.ts](../../../src/shared/types.ts):1, 12-21; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):40-48, 71-88; [PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):23, 46-47, 159-166). |
| editor: state.editor | Closed uses persisted state.editor; open uses currentEditorId live editor id/fallback | Conceptual parity holds, but source/fallback differs: currentEditorId prefers the live editor id, then state.editor, then monaco ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):24-32; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):74-81; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):121-126, 248-255). |
| language: state.language | Closed persisted; open live wrapper model | Parity holds for initialized pages, with persisted-vs-live provenance difference ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):26-34; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):74-82; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):166-168, 248-255). |
| filePath: state.filePath | Closed persisted; open live wrapper model | Parity holds for initialized pages, with persisted-vs-live provenance difference ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):26-34; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):74-82; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):147-149, 248-256). |
| modified: p.modified | Closed persisted; open live PageWrapper | Parity holds conceptually, with persisted-vs-live provenance difference ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):27-35; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):81-83; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):139-141, 256-257). |
| pinned: p.pinned | Closed persisted; open live page pin state | Parity holds conceptually, with persisted-vs-live provenance difference ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):27-35; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):82-83; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):143-145, 256-257). |
| profileName | Closed persisted identity; open live identity | Parity holds for the requested browser field, including empty-string fallback ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):26-37; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):40-48, 74-85; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):98-104, 218-222, 260-266). |
| isIncognito | Closed persisted boolean; open live boolean | Parity holds; both coerce absent state to false ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):26-37; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):74-85; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):260-264). |
| isTor | Closed persisted boolean; open live boolean | Parity holds; both coerce absent state to false ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):26-37; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):74-85; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):260-264). |
| No active | Open PageWrapper adds active | Intentional useful call-only superset ([PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):248-259). |
| No openedByAgent | Open PageWrapper adds it only when true | Intentional call-only browser provenance ([PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):260-266). |
| No url | Open PageWrapper adds URL only when agentMayAccessBrowserPage allows it; closed node has none | Intentional live superset with privacy protection. Do not add URL to WindowNode ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):36-37; [PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):224-228, 260-267). |
| Undefined optional fields omitted by JSON.stringify | Call result shaping turns undefined object fields into null | Encoding difference is part of the standard call protocol ([result-shaper.ts](../../../src/shared/ai-vision/result-shaper.ts):27-65). |

#### open_window comparison

Both paths use the same collection lookup, createWindow(index), and whenReady promise
([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):51-71; [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):90-100).

| Scenario | open_window | windows[i].open() / windows[i].focus() | Finding |
|---|---|---|---|
| Missing index | Text Error: Window X does not exist, isError true ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):53-59) | WindowsNode.index returns no child; resolver reports No item X in windows with resolvedUpTo/hint ([resolver.ts](../../../src/shared/ai-vision/resolver.ts):91-95, 189-208) | Capability/error parity, wording/envelope difference. |
| Already open | Focuses and returns windowIndex, status open, plus message Window is already open and focused ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):61-64) | open() and focus() focus and return windowIndex/status only ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):90-106) | Action parity; old success message is intentionally absent. |
| Closed with open intent | Recreates, awaits ready, returns windowIndex/status plus Window reopened successfully ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):66-71) | open() does the same create/ready sequence and returns windowIndex/status ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):97-100) | Reopen parity; success message differs. |
| Closed with focus intent | No separate operation; old tool reopens | focus() throws Window X is not open — call windows[X].open() first ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):102-106) | focus is intentionally stricter; open() is the old-tool replacement. |
| Create/ready failure | Catches and prefixes Error: Failed to open window X ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):66-76) | Resolver catches the thrown error and reports it at resolvedUpTo windows[X] ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):97-100; [resolver.ts](../../../src/shared/ai-vision/resolver.ts):127-149, 189-208) | Same failure, different prefix/envelope. |
| Invocation syntax | Integer windowIndex schema ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):48-50) | Numeric path index; route rejects non-numeric index keys ([call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):49-63) | Syntax differs by design. |

**Half-A conclusion:** parity here means capability, not field-for-field identity: the call tree may
use summaries, live values, standard envelopes, and actionable member descriptions rather than
reproducing old-tool JSON byte-for-byte. On that standard, type is the only missing old page field
and requires a code change only in the persisted closed-window path. Do not add type to the live
PageWrapper: a persisted page may lack optional editor, making type useful for closed discovery,
whereas open pages already expose the actionable editor id. Browser profileName, isIncognito, and
isTor already have parity. open()/focus() have capability parity with the old operation; remaining
differences are intentional shape, provenance, privacy, and error-envelope differences.

### Half B: verified get_app_info trace and ownership

The tool is declared at page-tools.ts:88-93. The generic registrar forwards it to the renderer,
the command registry maps it to handleAppInfo, and that handler builds all nine fields
([command-registry.ts](../../../src/renderer/api/mcp/command-registry.ts):15-48;
[register-tools.ts](../../../src/main/mcp/register-tools.ts):6-18;
[page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):177-192).

| Field | Handler expression and owner | Existing call path? | Planned call home |
|---|---|---|---|
| version | app.version. App caches the value fetched through api.getAppVersion; main returns versionService.getAppVersion ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):180-183; [app.ts](../../../src/renderer/api/app.ts):23-50, 119-128; [core-handlers.ts](../../../src/ipc/main/core-handlers.ts):154-156). | **Yes:** root empty-path summary and root version member ([root.ts](../../../src/renderer/scripting/ai-vision/root.ts):34-57, 104-105, 120-129). | Keep root version. No appInfo or duplicate shell field. |
| pageCount | pages.length from renderer pagesModel ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):178-183). | **Yes:** root empty-path summary; pages summary also exposes count ([root.ts](../../../src/renderer/scripting/ai-vision/root.ts):128; [PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):64-73). | Keep root summary pageCount. |
| activePageId | pagesModel.activePage id or null ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):181-184). | **Yes:** root empty-path summary and pages summary ([root.ts](../../../src/renderer/scripting/ai-vision/root.ts):128; [PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):71-72). | Keep root summary activePageId. |
| browserProfiles | settings.get(browser-profiles).map(profile => profile.name). BrowserProfile is settings-owned and the Browser Profiles section reads/mutates the same keys ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):184; [settings.ts](../../../src/renderer/api/settings.ts):17-21, 29-32, 93-101, 127-137; [BrowserProfilesSectionModel.ts](../../../src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts):29-30, 56-75, 96-107). | **No exact projection path:** generic settings.get can return profile records, not the names array ([settings.d.ts](../../../src/renderer/api/types/settings.d.ts):16-27; [namespaces/settings.ts](../../../src/renderer/scripting/ai-vision/namespaces/settings.ts):4-19). | settings.browserProfiles, descriptor-provided and read-only. There is no global browser namespace in the root member list ([root.ts](../../../src/renderer/scripting/ai-vision/root.ts):34-57). |
| defaultBrowserProfile | settings.get(browser-default-profile); empty string is built-in default ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):184-185; [settings.ts](../../../src/renderer/api/settings.ts):100-101, 134-136). | **No exact field path:** only generic settings.get exists today ([settings.d.ts](../../../src/renderer/api/types/settings.d.ts):16-27). | settings.defaultBrowserProfile. |
| resourcesDir | await api.getAppRootPath. Renderer IPC reaches core-handlers, which calls main utils getAppRootPath; packaged uses process.resourcesPath and dev uses the calculated app root ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):177-180; [renderer/api.ts](../../../src/ipc/renderer/api.ts):57-60; [core-handlers.ts](../../../src/ipc/main/core-handlers.ts):22-25; [utils.ts](../../../src/main/utils.ts):16-25). | **No exact path:** main.runtime has appPath and selected OS paths, but not resourcesDir ([main-services.ts](../../../src/main/mcp/ai-vision/main-services.ts):64-74, 192-229). | main.runtime.resourcesDir. MainRuntimeNode already owns app/runtime/path diagnostics; IShell has no resource-path member ([main-services.ts](../../../src/main/mcp/ai-vision/main-services.ts):192-229; [shell.d.ts](../../../src/renderer/api/types/shell.d.ts):37-51). |
| demoBoardDir | fpJoin(resourcesDir, assets, demo-board), derived by the handler; board scaffolding also resolves the app root to select the bundled demo-board template ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):186-188; [board-scaffold.ts](../../../src/renderer/editors/board/board-scaffold.ts):12-27). Independently verified against getAssetPath's packaged and dev branches: both preserve this exact value ([utils.ts](../../../src/main/utils.ts):16-35). | **No exact path:** no current descriptor reports the bundled template directory ([main-services.ts](../../../src/main/mcp/ai-vision/main-services.ts):64-74; [namespaces/boards.ts](../../../src/renderer/scripting/ai-vision/namespaces/boards.ts):3-25). | main.runtime.demoBoardDir, next to resourcesDir; boards.createDemoBoard should point agents there when scaffolding the bundled template. |
| boardsAssetsBaseUrl | Module constant for the recommended-components catalog, returned unchanged by the handler ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):13-15, 188-189; [page-tools.ts](../../../src/main/mcp/tools/page-tools.ts):88-90). | **No exact path:** renderer boards has lifecycle methods but no URL members; main.boards is protocol/download state ([namespaces/boards.ts](../../../src/renderer/scripting/ai-vision/namespaces/boards.ts):3-25; [main-services.ts](../../../src/main/mcp/ai-vision/main-services.ts):43-46, 149-159). | boards.assetsBaseUrl, descriptor-provided from the renderer boards API. |
| boardsManifestUrl | Recommended-components base plus manifest.json ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):188-189). This is not the published-board manifest: main published-boards service targets the separate persephone-boards repository ([published-boards-service.ts](../../../src/main/published-boards-service.ts):29-42). | **No exact path.** | boards.manifestUrl, beside boards.assetsBaseUrl. |

The descriptor-provided values use the established IAiVisionDescriptor.provide seam for values not
stored as properties on the described object ([types.ts](../../../src/shared/ai-vision/types.ts):57-85;
[namespaces/ui.ts](../../../src/renderer/scripting/ai-vision/namespaces/ui.ts):42-50).

## Implementation Plan

### 1. Add the persisted classifier to closed page paths

- Change main-root.ts:40-88 so the persisted state view includes type and WindowNode.pages returns
  type: state.type alongside its existing fields. Keep browser identity and no-URL behavior.
- Do not change PageWrapper.ts for type. Its live page already exposes editor, which is the
  actionable classifier accepted by pages.addEditorPage; adding the inert EditorType beside it
  would burden the most-visited pages[i] node with overlapping classifiers. The persisted path is
  the exception because IEditorState.editor is optional while type is required
  ([shared/types.ts](../../../src/shared/types.ts):1, 12-21; [PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):23,
  46-47, 159-166).
- Do not alter resolver, result-shaper, or routeCallPath; their current contracts already support
  this change ([resolver.ts](../../../src/shared/ai-vision/resolver.ts):102-146;
  [call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):58-67).

Before → after:

~~~typescript
// Before: WindowNode drops the field that list_windows returns.
return { id: p.id, title: state.title ?? "Empty",
    editor: state.editor, language: state.language, filePath: state.filePath,
    modified: p.modified, pinned: p.pinned };

// After: the persisted closed-window path carries the legacy state discriminator.
return { id: p.id, title: state.title ?? "Empty", type: state.type,
    editor: state.editor, language: state.language, filePath: state.filePath,
    modified: p.modified, pinned: p.pinned };
~~~

### 2. Preserve open_window capability through open/focus

- Keep WindowNode.open(): it focuses an open entry, recreates a closed entry, waits for whenReady,
  and returns windowIndex/status ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):90-100).
- Keep focus() as the open-only action that refuses a closed window
  ([main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):102-107).
- Do not copy old success messages into the node. Test capability, status, and standard call error
  envelope rather than byte-identical tool prose.
- Verify missing index, already-open open(), closed open(), closed focus(), and safe create/ready
  failure behavior. Record the resolver's No item error for an absent child.

### 3. Add browser profile projections under settings

- Extend SETTINGS_MEMBERS and describeSettings in namespaces/settings.ts:4-19 with read-only
  browserProfiles and defaultBrowserProfile.
- Use provide(name) to map the existing browser-profiles records to names and return the existing
  browser-default-profile string. Do not add duplicate mutable state or change ISettings
  ([settings.ts](../../../src/renderer/api/settings.ts):17-21, 93-101, 127-137).
- Add the valid-name pointer to both pages member summaries: pages.showBrowserPage and
  pages.openUrlInBrowserTab should say to use settings.browserProfiles, and that an empty
  profileName selects the built-in default ([PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):23-31,
  200-219). Explain in settings descriptor help that these are convenient profile projections
  while get/set remains the generic configuration API. This cross-reference belongs at the
  methods where an agent chooses a profile, following the S.2 finding that pointers work at the
  member where the agent lands ([shell.md](../../../qa/surfaces/shell.md):26-47).

Before → after:

~~~typescript
// Before: only generic settings and theme metadata.
const SETTINGS_MEMBERS = [theme, get, set, onChanged];

// After: direct read-only paths next to the settings-owned Browser Profiles surface.
const SETTINGS_MEMBERS = [theme, get, set, onChanged,
    browserProfiles, defaultBrowserProfile];
provide: name === "browserProfiles"
    ? { value: settings.get<BrowserProfile[]>("browser-profiles").map(p => p.name) }
    : name === "defaultBrowserProfile"
        ? { value: settings.get<string>("browser-default-profile") }
        : undefined;
~~~

### 4. Add resource roots under main.runtime

- Add resourcesDir and demoBoardDir to RUNTIME_MEMBERS and MainRuntimeNode.snapshot in
  main-services.ts:64-74, 192-229.
- Use main utils getAppRootPath for resourcesDir and the existing getAssetPath("demo-board") helper
  for demoBoardDir; getAssetPath resolves the same packaged/dev assets root and therefore preserves
  the old resourcesDir/assets/demo-board value. This exact equivalence was independently confirmed
  against both branches in utils.ts, so the implementation must reuse getAssetPath rather than
  re-derive the path
  ([utils.ts](../../../src/main/utils.ts):16-35).
- Keep handleAppInfo and its legacy values operational until EPIC-090; this task adds the call
  path without deleting the old handler.

Before → after:

~~~typescript
// Before: bounded runtime snapshot has appPath and selected paths.
appPath: app.getAppPath(),
paths: { /* selected Electron paths */ },

// After: main-owned resource roots sit with the existing runtime diagnostics.
appPath: app.getAppPath(),
resourcesDir: getAppRootPath(),
demoBoardDir: getAssetPath("demo-board"),
paths: { /* selected Electron paths */ },
~~~

### 5. Put recommended-components URLs under boards

- Move the recommended-components base URL literal from page-commands.ts into the renderer
  boards API module and export a derived manifest URL. Update handleAppInfo to reuse the constants
  so legacy output remains unchanged.
- Add descriptor-only read-only assetsBaseUrl and manifestUrl to namespaces/boards.ts, provided
  from those API constants. Update the boards.createDemoBoard member summary to point agents to
  main.runtime.demoBoardDir for the bundled template directory. Do not confuse these URLs with the separate published-board service
  ([published-boards-service.ts](../../../src/main/published-boards-service.ts):29-42).

Before → after:

~~~typescript
// Before: MCP command layer owns the literal.
const BOARDS_ASSETS_BASE_URL = ".../boards-assets/";
boardsAssetsBaseUrl: BOARDS_ASSETS_BASE_URL;
boardsManifestUrl: BOARDS_ASSETS_BASE_URL + "manifest.json";

// After: Boards API owns one source, legacy MCP and AiVision reuse it.
export const BOARDS_ASSETS_BASE_URL = ".../boards-assets/";
export const BOARDS_MANIFEST_URL = BOARDS_ASSETS_BASE_URL + "manifest.json";
// boards descriptor: assetsBaseUrl and manifestUrl provide these constants.
~~~

The resulting paths are:

| Old field | Call path |
|---|---|
| version | version and root empty-path summary |
| pageCount | root empty-path summary; pages summary count |
| activePageId | root empty-path summary; pages summary |
| browserProfiles | settings.browserProfiles |
| defaultBrowserProfile | settings.defaultBrowserProfile |
| resourcesDir | main.runtime.resourcesDir |
| demoBoardDir | main.runtime.demoBoardDir |
| boardsAssetsBaseUrl | boards.assetsBaseUrl |
| boardsManifestUrl | boards.manifestUrl |

No appInfo node is created.

### 6. Verification and retirable handoff

- Do not add a QA surface file in US-1303. US-1307 owns the windows.md surface, shell acceptance
  run, and final roadmap markings ([EPIC-085](../../epics/EPIC-085.md):117-125).
- After implementation, run direct call checks for window discovery, both open/closed page variants,
  all page fields and browser identity fields, open/focus error cases, all nine app-info paths, and
  path/value equivalence with the old handlers.
- Run typecheck, lint, and production build using the existing package scripts
  ([package.json](../../../package.json):7-17). No implementation or build is performed in this
  plan-only pass.

## Concerns

1. **Type semantics:** resolved. Add shared state type only to persisted WindowNode.pages. It is
   absent there because a persisted page can lack optional editor; do not add it to live PageWrapper,
   where editor is the actionable classifier and type would be an overlapping inert member
   ([shared/types.ts](../../../src/shared/types.ts):1, 12-21; [PageCollectionWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts):23,
   46-47, 159-166).
2. **Live call additions:** resolved. active, permitted URL, and openedByAgent are intentional
   call-only context; do not remove them ([PageWrapper.ts](../../../src/renderer/scripting/api-wrapper/PageWrapper.ts):224-228,
   248-267).
3. **Open-window messages:** resolved. Capability parity is sufficient; the old messages and call
   envelope differ by protocol ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):61-76;
   [main-root.ts](../../../src/main/mcp/ai-vision/main-root.ts):90-106).
4. **Profile owner:** resolved to settings because root has no global browser namespace and the
   Browser Profiles UI reads those settings keys ([root.ts](../../../src/renderer/scripting/ai-vision/root.ts):34-57;
   [BrowserProfilesSection.ts](../../../src/renderer/editors/settings/sections/BrowserProfilesSection.ts):480-499).
5. **Resource owner:** resolved to main.runtime because getAppRootPath is main-owned and runtime
   already owns app/path diagnostics ([utils.ts](../../../src/main/utils.ts):16-35;
   [main-services.ts](../../../src/main/mcp/ai-vision/main-services.ts):192-229).
6. **Catalog identity:** resolved to recommended-components boards-assets, not the separate
   published-board catalog ([page-commands.ts](../../../src/renderer/api/mcp/page-commands.ts):13-14;
   [published-boards-service.ts](../../../src/main/published-boards-service.ts):29-42).
7. **Retirable status:** all three tools are intended to become retirable: list_windows after type
   parity and window QA, open_window after open/focus checks, and get_app_info after all nine paths
   exist. None is marked by US-1303; US-1307 must pass the roadmap call-only acceptance gate first.
   No tool is permanently excluded ([roadmap](../../agent-transparency-roadmap.md):26-30,
   149-168; [EPIC-085](../../epics/EPIC-085.md):108-125).

### Files that need NO changes

| File/group | Reason |
|---|---|
| shared AiVision resolver, result-shaper, and types | Existing descriptor/provide, error, hint, and shaping contracts are sufficient ([resolver.ts](../../../src/shared/ai-vision/resolver.ts):53-163; [types.ts](../../../src/shared/ai-vision/types.ts):57-85). |
| src/main/mcp/tools/window-tools.ts | Old tools remain intact until EPIC-090 ([window-tools.ts](../../../src/main/mcp/tools/window-tools.ts):9-81). |
| call-tools.ts, renderer-bridge.ts, open-windows.ts, window-states.ts | Existing routing, bridge, lifecycle, and persisted-state ownership are reused ([call-tools.ts](../../../src/main/mcp/tools/call-tools.ts):34-67; [renderer-bridge.ts](../../../src/main/mcp/renderer-bridge.ts):29-49; [open-windows.ts](../../../src/main/open-windows.ts):19-53; [window-states.ts](../../../src/main/window-states.ts):7-22). |
| settings.d.ts, shell.d.ts, boards.d.ts | New values are call descriptor projections, not new script-facing API properties ([settings.d.ts](../../../src/renderer/api/types/settings.d.ts):16-27; [shell.d.ts](../../../src/renderer/api/types/shell.d.ts):37-51; [boards.d.ts](../../../src/renderer/api/types/boards.d.ts):84-120). |
| renderer api/shell, main published-boards-service.ts, renderer published-boards.ts | They own shell update services or a different published-board catalog, not these fields ([shell/index.ts](../../../src/renderer/api/shell/index.ts):1-19; [published-boards-service.ts](../../../src/main/published-boards-service.ts):29-42; [published-boards.ts](../../../src/renderer/api/published-boards.ts):39-67). |
| doc/active-work.md, doc/epics/EPIC-085.md, doc/agent-transparency-roadmap.md | Existing entries/maps are not changed in this plan-only pass; US-1307 owns eventual retirable marking ([active-work.md](../../active-work.md):8-17; [EPIC-085](../../epics/EPIC-085.md):113-125; [roadmap](../../agent-transparency-roadmap.md):106-113). |
| qa/surfaces/shell.md and qa/surfaces/README.md | Existing files cover current shell/header QA; US-1307 owns new windows QA ([shell.md](../../../qa/surfaces/shell.md):1-13; [EPIC-085](../../epics/EPIC-085.md):117-125). |

## Acceptance Criteria

- [ ] This task-document pass changes no implementation file and deletes no MCP tool.
- [x] Closed persisted windows[i].pages[j] exposes type with the old state meaning; live open pages
  retain their actionable editor member without adding the inert type duplicate. Every old
  list_windows field is present or explicitly documented as a call-only superset.
- [ ] profileName, isIncognito, and isTor remain parity fields; WindowNode never exposes browser URL.
- [ ] windows[i].open() replaces open_window's reopen/focus capability; focus() remains open-only;
  missing-index, closed-focus, already-open, reopen, and failure behavior are verified.
- [x] Root version, pageCount, and activePageId remain discoverable without an appInfo node.
- [x] settings.browserProfiles and settings.defaultBrowserProfile return the exact projections from
  the existing settings keys.
- [x] main.runtime.resourcesDir and demoBoardDir match get_app_info's packaged/dev and derived paths.
- [x] boards.assetsBaseUrl and boards.manifestUrl identify the recommended-components catalog and
  are not confused with the published-board catalog.
- [ ] After US-1307's call-only acceptance gate, list_windows, open_window, and get_app_info can all
  be marked retirable in the roadmap; none is marked by US-1303 alone.
- [ ] Typecheck, lint, production build, and EPIC-085 live acceptance checks pass after implementation.

## Files Changed Summary

| File | Planned change |
|---|---|
| doc/tasks/US-1303-windows-and-app-info/README.md | This verified investigation and implementation plan. |
| src/main/mcp/ai-vision/main-root.ts | Add persisted type to WindowNode.pages. |
| src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts | Add profile-name/default cross-references to browser-page member summaries. |
| src/renderer/scripting/ai-vision/namespaces/settings.ts | Provide browser profile names and default profile. |
| src/main/mcp/ai-vision/main-services.ts | Add resource roots to main.runtime. |
| src/renderer/api/boards.ts | Own recommended-components base and manifest URL constants. |
| src/renderer/scripting/ai-vision/namespaces/boards.ts | Provide assetsBaseUrl and manifestUrl. |
| src/renderer/api/mcp/page-commands.ts | Reuse URL constants while retaining get_app_info during transition. |

Files intentionally needing NO changes are listed above.
