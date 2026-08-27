# US-1147 — Convert `mcp-inspector` to native views

**Epic:** [EPIC-071](../../epics/EPIC-071.md), task 6 (De-React E13)
**Status:** investigation complete; implementation not started

## Goal

Convert the `mcp-inspector` editor from the `EditorModule.Component` arm to native
`VanillaView` classes while preserving the disconnected and connected inspector
surfaces, removing both React roots, and retaining every live behavior represented
by the editor's 47 memo/callback sites.

## Background

### Governing findings and baseline

`CLAUDE.md` and `.claude/rules/task-docs.md` were read in full before the
investigation. EPIC-071 §E13-12 supersedes §E13-4's face table; all face and
zero-caller decisions below use its corrected matcher: `<Sym` followed by
whitespace, `/`, `>`, or end-of-line, plus `createElement(Sym, …)`, with comments
verified by opening the source.

US-1151's disconnected baseline for `showMcpInspectorPage()` is 58 elements,
2 `[data-react-root]` nodes, 1 `data-part="react-slot"`, 4 buttons, 3 inputs,
3 non-empty SVGs, and these eight markers:

`mcp-inspector-root`, `editor-toolbar`, `mcp-connection-bar`,
`mcp-saved-connections`, `mcp-transport`, `mcp-url`, `mcp-connect`,
`mcp-body`.

The second root is the React body inserted through `fillSlot` inside the native
`EditorToolbar` view; the editor's conversion therefore removes **2 roots**.
The React `EditorToolbar` face must remain because `browser` still calls it.
This baseline was captured disconnected, so it verifies only the connection bar;
the tools, resources, and prompts panels require a live MCP connection.

### Actual source inventory

The directory contains **11 source files**, not the eight JSX-bearing files named
in the epic brief. It contains **8 `.tsx` files with JSX**, totaling **1,650
lines** and **238 JSX markers**, plus three supporting `.ts` files:

| File | Lines | JSX markers | Hook-token occurrences (memo / callback / state / effect / ref) |
|---|---:|---:|---|
| `src/renderer/editors/mcp-inspector/McpInspectorView.tsx` | 434 | 69 | 4 / 9 / 0 / 2 / 0 |
| `src/renderer/editors/mcp-inspector/ResourcesPanel.tsx` | 258 | 53 | 2 / 3 / 2 / 0 / 0 |
| `src/renderer/editors/mcp-inspector/PromptsPanel.tsx` | 212 | 43 | 0 / 2 / 2 / 0 / 0 |
| `src/renderer/editors/mcp-inspector/ToolsPanel.tsx` | 265 | 36 | 3 / 9 / 3 / 0 / 2 |
| `src/renderer/editors/mcp-inspector/ToolArgForm.tsx` | 214 | 15 | 8 / 5 / 0 / 2 / 2 |
| `src/renderer/editors/mcp-inspector/ToolResultView.tsx` | 101 | 11 | 2 / 0 / 0 / 0 / 0 |
| `src/renderer/editors/mcp-inspector/ResourceContentView.tsx` | 139 | 10 | 0 / 0 / 0 / 0 / 0 |
| `src/renderer/editors/mcp-inspector/index.tsx` | 27 | 1 | 0 / 0 / 0 / 0 / 0 |
| **JSX-bearing total** | **1,650** | **238** | **19 / 28 / 7 / 4 / 4** |

The line counts above include the terminal line slot used by the epic's scope
measurement; source line references below use the editor's numbered source
lines. The table's hook column is a textual-token count: **19 `useMemo`, 28 `useCallback`, 7 `useState`, 4
`useEffect`, and 4 `useRef`**. The executable counts are 12 memo calls, 23
callback calls, 4 state calls, 2 effect calls, and 2 ref calls; imports and two
comment-only memo mentions account for the difference. The remaining files are
`McpInspectorEditorModel.ts` (818 lines), `McpConnectionStore.ts` (133), and
`McpConnectionManager.ts` (309); they contain no React hooks or JSX and are
investigation targets, not automatic conversion targets.

The line and marker inventory was verified from every file in the directory. The
remaining sections record the component graph, lifecycle mapping, and the
incremental 47-occurrence consumer audit.

### React component-to-view map

| React source | Native destination | State/effect responsibility |
|---|---|---|
| `McpInspectorView.tsx:43-323` `McpInspectorView` | `McpInspectorEditorView` | Own the root, connection bar, server-info bar, body branch, and bindings to the model/store. Replace `useEffect` at `:50` with mount-time store loading. |
| `McpInspectorView.tsx:327-393` `ServerInfoPanel` | `ServerInfoPanelView` | Bind server fields from the parent state; native anchor click at `:374` retains URL opening. |
| `McpInspectorView.tsx:396-430` `HistoryPanel` | `HistoryPanelView` | Read `historyCount`; call model methods from the two button handlers. |
| `ResourcesPanel.tsx:16-257` `ResourcesPanel` | `ResourcesPanelView` | Own sidebar width and the resource/template list/detail branches; bind `resourcesState`. |
| `PromptsPanel.tsx:14-158` `PromptsPanel` | `PromptsPanelView` | Own sidebar width; bind `promptsState` and explicitly dispose/recreate message children with the panel branch. |
| `PromptsPanel.tsx:166-179` `MessageView` | `MessageView` | Native role tag and owned message-content children. |
| `PromptsPanel.tsx:182-211` `MessageContentBlock` | `MessageContentBlockView` | Native text/image/resource/resource-link branches. |
| `ToolsPanel.tsx:17-264` `ToolsPanel` | `ToolsPanelView` | Own sidebar/result heights and the attached detail element; bind `toolsState`, and measure only from event/update paths after mount. |
| `ToolArgForm.tsx:42-68` `ToolArgForm` | `ToolArgFormView` | Derive schema fields and own keyed argument-field children. |
| `ToolArgForm.tsx:83-213` `ArgField` | `ArgFieldView` | Own editor host reference and branch-specific control; replace the effect with update-time editor synchronization. |
| `ToolResultView.tsx:38-76` `ToolResultView` | `ToolResultView` | Own result-item children keyed by result index. |
| `ToolResultView.tsx:47-76` `ResultItem` | `ResultItemView` | Native result content branches. |
| `ToolResultView.tsx:78-100` `TextResult` | `TextResultView` | Compute language inline or in a view helper; own the read-only Monaco host. |
| `ResourceContentView.tsx:69-138` `ResourceContentView` | `ResourceContentView` | Native markdown/code/image/binary/empty branches; use `MarkdownBlockView` and `MonacoEditorHostView` directly. |
| `index.tsx:9-11` `McpInspectorEditorComponent` | removed; `mcpModule.View` points to `McpInspectorEditorView` | Preserve the existing model factory and public model/type exports. |

The existing `McpInspectorEditorModel` already owns the page state and MCP
commands (`McpInspectorEditorModel.ts:235-774`). The port should not create a
second component model or duplicate those commands. The three support files are
framework-free: `McpConnectionManager.ts`, `McpConnectionStore.ts`, and the
editor model remain shared logic, with lifecycle hardening noted below.

### Hook and state audit

The verified textual count is **19 `useMemo` occurrences and 28 `useCallback`
occurrences = 47**. It includes five import occurrences of each hook and two
comment-only `useMemo` mentions at `ToolArgForm.tsx:43,45`. The executable
count is **12 `useMemo` calls and 23 `useCallback` calls**; these 35 calls are
the behavior sites. There are **7 textual `useState` occurrences**, **4 textual
`useEffect` occurrences**, and **4 textual `useRef` occurrences**; imports are
excluded when counting executable calls. The table below includes
all 47 textual occurrences and labels the 12 non-site occurrences explicitly;
every executable call has a named consumer in the ported destination. In the
consumer column, a bare `:line` is shorthand for the source file named in that
row; all executable consumers are in that same file.

| Hook occurrence | Computes / role | Live consumer(s) | Native destination |
|---|---|---|---|
| `McpInspectorView.tsx:1` `useCallback` | Import only | Not a computational site; definitions at `:52,60,66,72,77,329,399,400` are audited below | Remove React import; class methods |
| `McpInspectorView.tsx:1` `useMemo` | Import only | Not a computational site; definitions at `:82,90,95` are audited below | Remove React import; fields/helpers |
| `McpInspectorView.tsx:52` `useCallback` | Connect/disconnect command | `Button` `onClick` at `:183-190` | `McpInspectorEditorView.handleConnect`, called by native button |
| `McpInspectorView.tsx:60` `useCallback` | Enter-key connect guard | `Input` `onKeyDown` at `:147-156,159-168,170-180` | One native `keydown` listener on each active connection input |
| `McpInspectorView.tsx:66` `useCallback` | Fill selected saved connection | Saved `Select` `onChange` at `:119-126` | `McpInspectorEditorView.selectSaved` |
| `McpInspectorView.tsx:72` `useCallback` | Fill a clicked saved connection | Saved-row `onClick` at `:258-291` (handler at `:269`) | `McpInspectorEditorView.clickConnection` |
| `McpInspectorView.tsx:77` `useCallback` | Stop bubbling then delete saved connection | Row `IconButton` `onClick` at `:283-289` | `McpInspectorEditorView.deleteConnection` |
| `McpInspectorView.tsx:82` `useMemo` | Convert saved connections to `IListBoxItem[]` | Saved `Select.items` at `:121` | Recompute field in `McpInspectorEditorView` when store connections change |
| `McpInspectorView.tsx:90` `useMemo` | Resolve selected transport item | Transport `Select.value` at `:134` | Recompute field in connection-bar sync |
| `McpInspectorView.tsx:95` `useMemo` | Build capability-dependent panel segments | `SegmentedControl.items` at `:218-221` | Recompute field when `hasTools/hasResources/hasPrompts` changes |
| `McpInspectorView.tsx:329` `useCallback` | Prevent default and open server website | Website anchor `:367-374`, `onClick` at `:369` | Native anchor `click` listener in `ServerInfoPanelView` |
| `McpInspectorView.tsx:399` `useCallback` | Open request log | History button at `:422-423` | `HistoryPanelView.showHistory`, native button listener |
| `McpInspectorView.tsx:400` `useCallback` | Clear request history | History button at `:425-426` | `HistoryPanelView.clearHistory`, native button listener |
| `ResourcesPanel.tsx:1` `useCallback` | Import only | Not a computational site; definitions at `:27,31` are audited below | Remove React import; view methods |
| `ResourcesPanel.tsx:1` `useMemo` | Import only | Not a computational site; definition at `:22` is audited below | Remove React import; view field |
| `ResourcesPanel.tsx:22` `useMemo` | Extract `{param}` names for selected template | Template parameter conditional/map at `:200-212` | Recompute when selected template changes; rebuild owned argument rows |
| `ResourcesPanel.tsx:27` `useCallback` | Read selected static resource | Button `onClick` at `:151-160` | `ResourcesPanelView.readResource` |
| `ResourcesPanel.tsx:31` `useCallback` | Read expanded resource template | Button `onClick` at `:218-227` | `ResourcesPanelView.readTemplateResource` |
| `PromptsPanel.tsx:1` `useCallback` | Import only | Not a computational site; definition at `:20` is audited below | Remove React import; view method |
| `PromptsPanel.tsx:20` `useCallback` | Get selected prompt | Button `onClick` at `:116-126` | `PromptsPanelView.getPrompt` |
| `ToolsPanel.tsx:1` `useCallback` | Import only | Not a computational site; definitions at `:34,38,45,54,58,69,73,77` are audited below | Remove React import; view methods |
| `ToolsPanel.tsx:1` `useMemo` | Import only | Not a computational site; definitions at `:25,29` are audited below | Remove React import; view fields |
| `ToolsPanel.tsx:25` `useMemo` | Map tools to list items | `selectedItem` dependency at `:29`; `ListBox.items` at `:110` | Recompute in tools-state update |
| `ToolsPanel.tsx:29` `useMemo` | Resolve selected list item | `ListBox.value` at `:111` | Recompute in tools-state update |
| `ToolsPanel.tsx:34` `useCallback` | Call selected tool | Button `onClick` at `:224-234` | `ToolsPanelView.callTool` |
| `ToolsPanel.tsx:38` `useCallback` | Ctrl+Enter call-tool shortcut | Root panel `onKeyDown` at `:91` | Native bubbling `keydown` listener on tools root |
| `ToolsPanel.tsx:45` `useCallback` | Clamp result height to 10–90% of detail box | `handleResultHeightChange` at `:55-56` | `ToolsPanelView.getClampedHeight`; reads attached DOM only from splitter event |
| `ToolsPanel.tsx:54` `useCallback` | Apply clamped result height | Result splitter `onChange` at `:188-194` | `ToolsPanelView.handleResultHeightChange` |
| `ToolsPanel.tsx:58` `useCallback` | Toggle result pane between expanded/collapsed ratios | Header double-click handlers at `:69-75` | `ToolsPanelView.togglePanelHeight` |
| `ToolsPanel.tsx:69` `useCallback` | Toggle top-header ratio 30% | Top header `onDoubleClick` at `:147` | Native top-header double-click listener |
| `ToolsPanel.tsx:73` `useCallback` | Toggle bottom-header ratio 70% | Bottom header `onDoubleClick` at `:212` | Native bottom-header double-click listener |
| `ToolsPanel.tsx:77` `useCallback` | Calculate initial 30% result height or 200 fallback | `currentResultHeight` at `:84` | Inline view calculation during mounted sync; no hook needed |
| `ToolArgForm.tsx:1` `useCallback` | Import only | Not a computational site; definitions at `:89,94,99,111` are audited below | Remove React import; `ArgFieldView` methods |
| `ToolArgForm.tsx:1` `useMemo` | Import only | Not a computational site; definitions at `:46,47,48,116,123` are audited below | Remove React import; view fields/helpers |
| `ToolArgForm.tsx:43` `useMemo` | Comment-only explanatory mention | Not executable code and has no consumer; retain the rationale as a native recomputation comment or remove it | No destination; not a hook site |
| `ToolArgForm.tsx:45` `useMemo` | Comment-only explanatory mention | Not executable code and has no consumer; it describes `propEntries` at `:48` | No destination; not a hook site |
| `ToolArgForm.tsx:46` `useMemo` | Normalize absent schema properties to one object | `propEntries` at `:48` and ultimately the field map at `:55-65` | `ToolArgFormView.properties`, recomputed before child reconciliation |
| `ToolArgForm.tsx:47` `useMemo` | Build required-field set | `required={requiredFields.has(name)}` at `:60` | `ToolArgFormView.requiredFields`, recomputed with schema |
| `ToolArgForm.tsx:48` `useMemo` | Enumerate schema properties | Empty-state check `:50` and `ArgField` map `:55-65` | `ToolArgFormView` keyed child list |
| `ToolArgForm.tsx:89` `useCallback` | Forward ordinary control text to named argument | Input `onChange` at `:153-160` and Textarea `onChange` at `:190-197` | `ArgFieldView.handleChange` |
| `ToolArgForm.tsx:94` `useCallback` | Forward Monaco text to named argument | Monaco host `onChange` at `:166-184` | `ArgFieldView.handleEditorChange` |
| `ToolArgForm.tsx:99` `useCallback` | Capture mounted Monaco host | Monaco host `onMount` at `:166-184` | `ArgFieldView.hostView` assignment |
| `ToolArgForm.tsx:111` `useCallback` | Convert checkbox boolean to string argument | Checkbox `onChange` at `:132-138` | `ArgFieldView.handleCheckboxChange` |
| `ToolArgForm.tsx:116` `useMemo` | Convert enum strings to list items | `selectedEnumItem` dependency at `:123`; Select `items` at `:143` | Recompute field in `ArgFieldView` |
| `ToolArgForm.tsx:123` `useMemo` | Resolve selected enum item | Select `value` at `:144` | `ArgFieldView` enum-control sync |
| `ToolResultView.tsx:1` `useMemo` | Import only | Not a computational site; definition at `:82` is audited below | Remove React import; inline/helper computation |
| `ToolResultView.tsx:82` `useMemo` | Detect JSON vs plaintext result language | Monaco host `language` at `:91` | `TextResultView` computes during result sync; no cache is needed |

The non-memo/callback hooks are also fully mapped:

| Hook | Exact sites and native destination |
|---|---|
| `useState` (7 textual / 4 executable) | `ResourcesPanel.tsx:18` sidebar width → `ResourcesPanelView.sidebarWidth`; `PromptsPanel.tsx:16` sidebar width → `PromptsPanelView.sidebarWidth`; `ToolsPanel.tsx:19` sidebar width and `:20` result height → `ToolsPanelView` fields. The remaining three textual `useState` mentions are the imports at `ResourcesPanel.tsx:1`, `PromptsPanel.tsx:1`, and `ToolsPanel.tsx:1`. |
| `useEffect` (4 textual / 2 executable) | `McpInspectorView.tsx:1` and `ToolArgForm.tsx:1` are imports; executable `McpInspectorView.tsx:50` → `McpInspectorEditorView.onMount` store load, and `ToolArgForm.tsx:103` → `ArgFieldView.onUpdate` editor sync. |
| `useRef` (4 textual / 2 executable) | `ToolsPanel.tsx:1` and `ToolArgForm.tsx:1` are imports; executable `ToolsPanel.tsx:21` → `ToolsPanelView.detailElement`, and `ToolArgForm.tsx:87` → `ArgFieldView.hostView`. |

The epic's stated **7 `useState`** is a textual instrument count: four
executable calls plus three imports. Likewise, there are four textual
`useEffect` occurrences but two executable calls, and four textual `useRef`
occurrences but two executable calls. This distinction is recorded so the
implementation does not invent three state values that do not exist.

### UIKit face audit

The corrected matcher was applied line-by-line as `<Sym` followed by whitespace,
`/`, `>`, or end-of-line, with the generic JSX forms (`<Select<IListBoxItem>`)
opened and included manually, and with `createElement(Sym, …)` checked. There
are no `createElement` calls for these faces in `mcp-inspector`; `McpIcon` is a
DOM builder at `McpInspectorEditorModel.ts:774`, not the UIKit `Icon` face.

| Face | Value callers in `mcp-inspector` | Last value caller within this editor? | US-1149 consequence |
|---|---|:-:|---|
| `Divider` | `McpInspectorView.tsx:128,215` | Yes | All two callers disappear; global settings callers remain, so do not delete. |
| `Tag` | `McpInspectorView.tsx:282`; `PromptsPanel.tsx:38,169`; `ResourcesPanel.tsx:51,147,193`; `ToolArgForm.tsx:205`; `ToolsPanel.tsx:104,153,156,217` | Yes | Eleven callers disappear; `mneme-config`, `link-editor`, and `ui/sidebar/TrustedBoardsListView.tsx:86` keep the face alive. |
| `Dot` | None | No caller to remove | No collection decision; other callers include `browser`, `board`, and settings (`BrowserProfilesSection.tsx:88,97,109`, `McpSection.tsx:75,89`). |
| `Spacer` | `ToolsPanel.tsx:223` | Yes | One caller disappears; `browser` and `rest-client` callers remain. |
| `Checkbox` | `ToolArgForm.tsx:132` | Yes | One caller disappears; `settings` and `rest-client/KeyValueEditor.tsx:102` remain. |
| `Select` | `McpInspectorView.tsx:119,132`; `ToolArgForm.tsx:142` | Yes | Three callers disappear; `settings`, `mneme-root`, and `graph/GraphExpansionSettings.tsx:129` remain. |
| `Textarea` | `PromptsPanel.tsx:101`; `ResourcesPanel.tsx:206`; `ToolArgForm.tsx:190` | Yes | Three callers disappear; `settings` and `rest-client` remain. |
| `Input` | `McpInspectorView.tsx:147,159,170`; `ToolArgForm.tsx:153` | Yes | Four callers disappear; `browser`, `env-vars`, `graph`, `link-editor`, `settings`, and `rest-client` remain. |
| `IconButton` | `McpInspectorView.tsx:283` | Yes | One caller disappears; `browser`, `board`, `env-vars`, `graph`, `link-editor`, `rest-client`, `settings`, and sidebar callers remain. |
| `SelectableRow` | `ResourcesPanel.tsx:63,99` | Yes | Two callers disappear; `env-vars/EnvVarsBody.tsx` remains. |
| `SegmentedControl` | `McpInspectorView.tsx:216` | Yes | One caller disappears; `env-vars` and `rest-client` remain. |
| `Splitter` | `PromptsPanel.tsx:66`; `ResourcesPanel.tsx:126`; `ToolsPanel.tsx:120,188` | Yes | Four callers disappear; `browser`, `link-editor`, and `rest-client` remain. |
| `Icon` | None | No caller to remove | No collection decision; this editor uses `McpIcon.createElement()` only, not `<Icon>`. |
| `Button` | `McpInspectorView.tsx:183,422,425`; `PromptsPanel.tsx:116`; `ResourcesPanel.tsx:151,218`; `ToolsPanel.tsx:224` | Yes | Seven callers disappear; many callers remain outside the editor. |
| `Text` | All text faces in the eight JSX files; representative sites `McpInspectorView.tsx:198,213,348-380`, `ResourcesPanel.tsx:50,79-80`, `PromptsPanel.tsx:37,56-58`, `ToolsPanel.tsx:103,149,173` | Yes | The editor loses its value callers; `browser`, `board`, `graph`, `link-editor`, `rest-client`, settings, and other files remain. |
| `Panel` | All layout faces in the eight JSX files; root/detail examples `McpInspectorView.tsx:105,227`, `ResourcesPanel.tsx:38,136-167`, `ToolsPanel.tsx:91,130`, `PromptsPanel.tsx:25,76` | Yes | The editor loses its value callers; it remains widely used throughout the renderer. |

No face is deleted by US-1147. `Icon` and `Dot` are explicitly not callers in
this editor, and comments are not callers. The port only removes the editor's
value calls; §E13-12's six-face collection and three-file zero-caller sweep stay
with US-1149/US-1150.

### Non-UIKit `mountVanilla` faces and barrels

The editor imports three non-UIKit React compatibility faces:

| Face | Current `mcp-inspector` callers | Other renderer callers excluding stories/own file | Result |
|---|---|---|---|
| `MonacoEditorHost` | `ToolArgForm.tsx:166`, `ToolResultView.tsx:93`, `ResourceContentView.tsx:101` | `rest-client/RequestBuilder.tsx:382,567`; `rest-client/ResponseViewer.tsx:369,394` | Not zero-caller. Port to `MonacoEditorHostView` directly; retain `MonacoEditorHost.ts`. |
| `MarkdownBlock` | `McpInspectorView.tsx:388`, `ResourceContentView.tsx:86` | No executable React callers found. `mneme-root`, markdown, and log-view use `MarkdownBlockView` directly (`MnemeRootEditorView.ts:12,220`; `MarkdownBodyView.ts:15,246`; `MarkdownOutputView.ts:5,22`). | Reaches zero callers after this task. Remove the compatibility face file and its `MarkdownBlock`/`MarkdownBlockProps` exports from `editors/markdown/index.ts:208-209`, while retaining `MarkdownBlockView` and `MarkdownBlock.css`. |
| `EditorToolbar` | `McpInspectorView.tsx:107-193` | `browser/BrowserView.tsx:3,421-529` | Must remain. The native replacement uses `EditorToolbarView`; the React face is still required by `browser`. |

`EditorToolbar.ts` itself is already a `mountVanilla(EditorToolbarView, props)`
shim (`EditorToolbar.ts:1-14`). `fillSlot` creates the compatibility React root
only for a React-valued slot (`fill-slot.ts:83-113`), which is why the current
MCP body nested inside `EditorToolbarView` accounts for the second baseline root.

The barrel check is also explicit: `src/renderer/editors/markdown/index.ts:208-209`
re-exports the now-zero-caller `MarkdownBlock` face and its props, so those two
exports must be removed with the shim. `src/renderer/editors/base/index.ts:28-29`
re-exports `EditorToolbar` and remains live; no shared `index.ts` re-exports the
`MonacoEditorHost` shim. No barrel hides another zero-caller imported face.

### Root boundary and script API verification

`index.tsx:9-17` currently creates `McpInspectorEditorComponent` and registers
`Component`; `editorRegistry.ts:36-44` permits either arm, and
`PagesLifecycleModel.ts:776-786` creates the model, adds the page, and optionally
calls `connect`. The native target follows the established `monaco` shape:
`McpInspectorEditorView` becomes the module's public `View` and owns an
`EditorToolbarView` directly. There must be no `fillSlot` or `mountReact` bridge
in an intermediate port.

The internal API signature is verified at `PagesModel.ts:269-270` and
`PagesLifecycleModel.ts:773-786`:

```ts
showMcpInspectorPage(options?: { url?: string; name?: string; autoConnect?: boolean })
```

The script-facing wrapper does **not** expose the full signature: its method at
`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:125-126` accepts
and forwards only `{ url?: string }`, matching the public declaration at
`src/renderer/api/types/pages.d.ts:104`. Therefore a script can point the
inspector at Persephone's own MCP endpoint with
`app.pages.showMcpInspectorPage({ url: "http://127.0.0.1:7865/mcp" })`, but
cannot request `autoConnect` through that wrapper. The internal caller in
`mneme-config/MnemeConfigEditorModel.ts:184-189` proves `autoConnect` is
supported internally. The boot log is emitted by
`src/main/mcp-http-server.ts:231` as `MCP HTTP server started:
http://127.0.0.1:<port>/mcp`; the default port and inspector placeholder are
`7865` at `McpInspectorView.tsx:149`. Use that endpoint for connected manual
verification, then click Connect (or use the internal/UI route) to exercise the
tools/resources/prompts panels.

### Conditional branches and persistent-child hazard

React currently unmounts each conditional subtree. Native conversion must use
explicit child ownership and `releaseChild()`/`SubtreeSwap` for replaced roots;
inactive panel views must not remain mounted merely because they are hidden.

| Source branch | Native ownership/disposal decision |
|---|---|
| Connection bar saved-connections selector (`McpInspectorView.tsx:117-130`) | Replace/remove the selector and divider when connections are empty, connected, or connecting; dispose the selector child and its listeners. |
| HTTP versus stdio inputs (`McpInspectorView.tsx:145-180`) | Replace the input branch when transport changes; remove listeners from the old input. The current HTTP path has one input; stdio has command and args inputs. |
| Error bar (`McpInspectorView.tsx:195-200`) | Replace/remove on status/error changes; no independent async work, but do not leave stale error text visible. |
| Connected server bar and version (`McpInspectorView.tsx:203-225`) | Replace/remove with connection status; dispose the dot, segmented control, and their listeners when disconnected. |
| Connected active panel (`McpInspectorView.tsx:228-241`) | Only one of info/tools/resources/prompts/history is mounted. Release the outgoing panel before inserting the next one; this is the key persistent-child boundary. |
| Disconnected saved list versus empty status (`McpInspectorView.tsx:243-321`) | Replace the list branch with the status branch and release every saved-row view, including its delete button listener. |
| Server info optional fields (`McpInspectorView.tsx:351-390`) | Replace/remove version, description, website, and instruction children as values change. The Markdown child must be disposed when instructions disappear. |
| History empty versus actions (`McpInspectorView.tsx:402-430`) | Release the action buttons when count reaches zero; no polling, but button listeners belong to the branch. |
| Resources static/template/empty (`ResourcesPanel.tsx:135-257`) | Release the old detail branch before inserting the new one. Dispose `ResourceContentView`, Monaco, and every template argument control with the branch. |
| Resource optional description/mime/errors/content (`ResourcesPanel.tsx:142-178,188-245`) | Replace/remove their owned child views; content views must not remain hidden after selection or read state changes. |
| Resource/template rows and template parameters (`ResourcesPanel.tsx:60-124,200-212`) | Reconcile keyed rows and explicitly dispose removed rows/controls; selected resource/template identity changes within the stable `resourcesState` source. |
| Prompts selected/empty and messages (`PromptsPanel.tsx:75-158`) | Release the selected-prompt detail and message list when selection changes or messages clear; dispose message/content children. |
| Prompt optional descriptions/required labels (`PromptsPanel.tsx:57-60,85-110`) | Replace/remove visual children only; `getPrompt` request ownership is handled by the model request guard below. |
| Tools selected/empty, annotations, result/placeholder (`ToolsPanel.tsx:129-264`) | Release the selected-tool detail and result view when selection/result changes; dispose Monaco result and argument-field children. |
| Tool argument control type (`ToolArgForm.tsx:130-198`) | Release the prior boolean/enum/number/code/text control before mounting the new type; code controls own and dispose `MonacoEditorHostView`. |
| Tool and prompt/resource result content types (`ToolResultView.tsx:40-76`, `PromptsPanel.tsx:182-211`, `ResourceContentView.tsx:72-138`) | Reconcile by content index/branch and dispose removed markdown/Monaco children. |

There is **no `setInterval` poll** in this directory. The live network work is
the SDK transport/client (`McpConnectionManager.ts:126-246`), its SSE/stdio
transport callbacks (`:174-203`), and optional reconnect timer
(`:282-301`). The manager also maintains resource subscriptions and notification
handlers (`:81-89,103-123,174-180,223-230`), although this editor currently has
no caller of `subscribeResource` beyond the manager itself. The native owning
view must dispose the model on page destruction: `McpInspectorEditorModel.dispose`
calls `connection.dispose()` at `McpInspectorEditorModel.ts:769-771`, which
disconnects, cancels reconnect, clears subscriptions, and clears callbacks
(`McpConnectionManager.ts:248-274,297-301`).

The following in-flight operations must be tracked and guarded against late
publication after view/model disposal or replacement of the connected client:

| Request/work | Evidence | Disposal/identity rule |
|---|---|---|
| Saved-connection load | `McpConnectionStore.ts:36-51`; started by `McpInspectorView.tsx:50` | The singleton store outlives the view, so its load may finish after the view; the native view must only stop its subscription, not destroy the global store. |
| Connect and disconnect | `McpInspectorEditorModel.ts:293-310`; manager `:126-246,248-266` | Destroying the editor must await/issue manager disposal. A replaced client/transport is a new identity; late callbacks from the old one must not update current state. |
| Tools list | `McpInspectorEditorModel.ts:352-391` | Started after connected status (`:278-283`); guard result/error against model disposal and connection generation. |
| Resources and templates lists | `McpInspectorEditorModel.ts:451-519` | Same connection-generation guard; dispose the resources panel child on tab switch, and do not let a late list recreate hidden DOM. |
| Static resource read | `McpInspectorEditorModel.ts:565-603` | The selected URI can change while `:575` awaits. Guard against disposal and stale selected-resource generation before publishing content. |
| Template resource read | `McpInspectorEditorModel.ts:521-563` | The selected template/arguments can change while `:536` awaits. Guard against disposal and stale template generation. |
| Tool call | `McpInspectorEditorModel.ts:393-448` | The selected tool can change while `:423` awaits. Guard result/loading writes against disposal, client generation, and selected-tool generation. |
| Prompt list | `McpInspectorEditorModel.ts:606-650` | Guard late list results before writing `promptsState`. |
| Prompt get | `McpInspectorEditorModel.ts:652-690` | Guard late messages/errors against disposal, connection generation, and selected-prompt generation. |
| Auto-save and delete | `McpInspectorEditorModel.ts:318-346`; store debounce `McpConnectionStore.ts:123-130` | This is global persisted data work, not panel-owned DOM work; let it finish. Do not cancel the singleton store's debounced write merely because the panel is replaced. |

The current model has no `AbortController`, request-generation check, or
disposed flag around these awaits. `connection.dispose()` closes the SDK client
but does not cancel already-awaited promises, so the implementation must add a
model-level cancellation/generation guard (or equivalent cancellable request
ownership) before claiming teardown is safe. This is the highest-risk hazard:
an inactive retained panel would otherwise keep accepting live MCP results, and
the absence of a result or stale panel is not detectable by typecheck or root
counts.

### Subscription source identity and `bind()` decisions

`bind()` registers cleanup through `own()` and has no early-release operation.
Use it only for stable sources; use a replaceable subscription when the source
object itself changes.

| Subscription/source | Identity during this view | Decision |
|---|---|---|
| `mcpConnectionStore.state` | Fixed module singleton (`McpConnectionStore.ts:133`) | `bind()` is valid in `McpInspectorEditorView.onMount`; dispose only the view's subscription. Its `connections` array changes, but the source object does not. |
| `model.state` | Fixed if the page's editor model remains the view's model; `AsyncEditorView` updates the same page model | Bindable under that invariant. If `onUpdate` can receive a different model identity, replace the subscription rather than calling `bind()` again. |
| `model.toolsState` / selected tool | `toolsState` object is fixed on the model (`McpInspectorEditorModel.ts:243-245`); selected tool identity/value changes | Bind the fixed state source, not the selected tool object. Release/recreate the selected-tool child on `selectedToolName` changes. |
| `model.resourcesState` / selected resource | `resourcesState` object is fixed (`:244`); selected URI/template and selected content change | Bind the fixed source. Do not bind to a selected resource object; reconcile the detail view with a replaceable generation/child. |
| `model.promptsState` / selected prompt | `promptsState` object is fixed (`:245`); selected prompt changes | Bind the fixed source and release/recreate selected-prompt/message children as needed. |
| `model.connection` | Manager object is fixed readonly (`:242`), but its client and transport are replaced by `connect`/`disconnect` (`McpConnectionManager.ts:126-203,248-266`) | Do not bind directly to client/transport identity. Keep the model's one status callback and use connection-generation guards for request results. |
| `themeState` inside direct `MarkdownBlockView` children | Fixed singleton; Markdown's command queue may change | The existing native Markdown view uses an owned fixed-theme subscription and a replaceable queue registration (`MarkdownBlockView.ts:174-190,194-200`); preserve that pattern. |

### Constraint audit

- **Colors:** no hex, `rgb()`, or `rgba()` literals occur under
  `src/renderer/editors/mcp-inspector`. Existing JSX uses semantic UIKit color
  values (`light`, `dark`, `default`, `primary`, `error`, `active`, `subtle`),
  for example `McpInspectorView.tsx:197-215` and `ResourcesPanel.tsx:137-162`.
  Native code must keep semantic UIKit tokens or import `theme/color`; it must
  not introduce literal colors. Existing image `style={{ maxWidth: "100%" }}`
  at `PromptsPanel.tsx:191-197` and `ToolResultView.tsx:54-60` is layout, not a
  color, but should become scoped native CSS rather than an app inline-style
  escape hatch.
- **Banned requires:** no `require("path")` or `require("fs")` occurs. The
  four `require()` calls in `McpConnectionManager.ts:57-60` load the MCP SDK,
  not path/fs, and are intentional lazy SDK loading. Keep them unless the SDK
  loading strategy is separately changed.
- **Errors:** MCP request catches already use `errMessage(err)` throughout
  `McpInspectorEditorModel.ts:371-372,434-447,482-483,555-560,594-598,629-630,
  682-686`, and the manager's connect catch uses `errMessage(err)` at
  `McpConnectionManager.ts:237-245`. The transport error callback still writes
  typed `err.message` at `McpConnectionManager.ts:198-199`; change that path to
  `errMessage(err)` in the implementation so the error contract is uniform.
  `String()` calls in `normalizePromptContent` (`McpInspectorEditorModel.ts:800-816`)
  normalize MCP data, not caught errors, and are not hand-rolled error display.

## Implementation Plan

The sequence follows the import graph and mirrors US-1146's leaves-first staged
conversion. During stages 1–5, a still-React parent may host a converted child
with `mountVanilla`, which does not create a `[data-react-root]`; no stage may
use `mountReact`, `fillSlot` for a React value, or introduce a new `createRoot`.
`index.tsx` is deliberately last so the old module remains loadable while its
children are ported.

1. **Port the independent leaves.** Convert
   `src/renderer/editors/mcp-inspector/ResourceContentView.tsx` and
   `ToolResultView.tsx` to native classes, using
   `MarkdownBlockView`/`MonacoEditorHostView` directly. Port `ResultItem`/
   `TextResult` and all content-type branches; use keyed owned child views and
   scoped CSS for image sizing.
2. **Port argument controls.** Convert `ToolArgForm.tsx` and its `ArgField`
   into `ToolArgFormView`/`ArgFieldView`. Recompute schema properties, required
   sets, entries, enum items, and selected enum synchronously during model/view
   updates. Replace `useRef` with a view field and `useEffect` with an
   update-time `MonacoEditorHostView.setValue` sync after the host is mounted.
3. **Port prompt and resource panels.** Convert `PromptsPanel.tsx` and its
   `MessageView`/`MessageContentBlock`, then `ResourcesPanel.tsx` after its
   `ResourceContentView` dependency. Use `KeyedList` or equivalent owned
   reconciliation for rows and `SubtreeSwap` for selected detail branches;
   release inactive branches and all nested Monaco/Markdown views.
4. **Port the tools panel.** Convert `ToolsPanel.tsx` after
   `ToolArgFormView` and `ToolResultView`. Preserve the two splitters, attached
   detail element, 10–90% clamping, initial 30%/200px result height, keyboard
   Ctrl+Enter, and both header double-click ratios. Layout reads occur only from
   mounted event/update paths.
5. **Port the main view and local helper views.** Convert
   `McpInspectorView.tsx` to `McpInspectorEditorView`, `ServerInfoPanelView`,
   and `HistoryPanelView`. Build `EditorToolbarView` directly around the native
   connection bar, bind the fixed model/store state sources, and reconcile the
   connected/disconnected, transport, error, info, and active-panel branches.
   Add the model request-generation/disposal guard identified above and replace
   `McpConnectionManager.ts:198-199`'s direct error-message access with
   `errMessage`.
6. **Switch the registry arm last.** Rename `index.tsx` to `index.ts`, remove
   `McpInspectorEditorComponent`, and set `mcpModule.View` to the public native
   constructor while preserving `createEditor` and all model/type exports. Update
   dynamic import resolution with a cold renderer restart if needed, per the
   epic's HMR finding.
7. **Remove only the freed non-UIKit shim.** After all mcp callers are gone,
   remove the now-zero-caller `MarkdownBlock.ts` compatibility face and its
   `editors/markdown/index.ts:208-209` re-exports. Do not remove
   `MarkdownBlockView`, `MonacoEditorHost`, `EditorToolbar`, or any UIKit face;
   each still has the callers listed above.
8. **Manual verification.** Reproduce the disconnected baseline and then point
   the inspector at `http://127.0.0.1:7865/mcp` to exercise connected panels,
   model actions, selection replacement, panel switching, transport switching,
   teardown, and late-request behavior. Inspect visibility separately from
   `textContent`. Do not add unit tests or a test harness, and do not run
   `npm run build-prod`.

### Before → after shape snippets

Registry arm (`src/renderer/editors/mcp-inspector/index.tsx` → `index.ts`):

```tsx
function McpInspectorEditorComponent({ model }: { model: EditorModel }) {
    return <McpInspectorView model={model as McpInspectorEditorModel} />;
}
// mcpModule: { createEditor, Component: McpInspectorEditorComponent }
```

```ts
// Native target: McpInspectorEditorView has a public constructor and owns the
// child views; the module has { createEditor, View: McpInspectorEditorView }.
```

Toolbar boundary (`McpInspectorView.tsx:107-193`):

```tsx
<EditorToolbar borderBottom>
    <Panel name="mcp-connection-bar">…</Panel>
</EditorToolbar>
```

```ts
const toolbar = this.child(new EditorToolbarView({
    borderBottom: true,
    children: connectionBar,
}));
// connectionBar is a native Panel root, never a React-valued fillSlot.
```

Monaco leaf (`ToolArgForm.tsx:165-184` and analogous result/resource sites):

```tsx
<MonacoEditorHost initialValue={value} language={lang} onMount={handleEditorMount} … />
```

```ts
const host = this.child(new MonacoEditorHostView({
    initialValue: value, language: lang, onMount: this.handleEditorMount,
}));
panel.append(host.root);
host.mount();
```

## Concerns

- **The 47-site acceptance trap:** the instrument counts 47 textual hook
  occurrences, but 12 are imports/comments. The 35 executable calls have zero
  dead sites today and are all mapped to live consumers above. The implementation
  must keep this distinction visible; a count-only check can pass while a
  callback is never wired.
- **Late MCP results:** manager disposal closes the current client but existing
  SDK promises can still settle. Without a generation/disposed guard, a response
  from a replaced connection or destroyed panel can repopulate state silently.
- **Panel retention:** active-panel switching must dispose outgoing child views.
  Keeping tools/resources/prompts mounted would retain Monaco listeners and
  accept network results in an invisible branch. There is no poll today, but the
  reconnect timer and resource subscription mechanism are real future/live work.
- **State identity:** selected tool/resource/prompt values change identity inside
  fixed state objects; they are not safe `bind()` sources. The connection manager's
  client and transport are replaced identities and must not be bound as if fixed.
- **Boundary regression:** the current second root is caused by React children
  passed to `EditorToolbar`'s `fillSlot`. The native toolbar must receive a DOM
  `Node`, and no transitional stage may add another React root.
- **Unverified connected surface:** the baseline has no live MCP server, so it
  cannot verify tools, resources, prompts, server info, history, read/call/get
  actions, or resource subscriptions. The app's own endpoint supplies the
  verification target; the script wrapper can pass `url` but not `autoConnect`.
- **Error/style constraints:** preserve semantic color tokens, use
  `errMessage` for unknown failures, and keep the SDK's lazy `require()` limited
  to SDK modules. Do not use path/fs requires or hardcoded colors.

## Acceptance Criteria

- `mcpModule` is registered on `View`, not `Component`; the eight JSX-bearing
  files are native (`.ts` or otherwise contain no React JSX/hooks), and no
  React body or `fillSlot` React subtree remains under this editor.
- React roots go **2 → 0** for `mcp-inspector`, including the root inside the
  `editor-toolbar` fill slot; no intermediate conversion stage adds a root.
- The eight baseline markers remain present:
  `mcp-inspector-root`, `editor-toolbar`, `mcp-connection-bar`,
  `mcp-saved-connections`, `mcp-transport`, `mcp-url`, `mcp-connect`, and
  `mcp-body`.
- In the disconnected state the surface retains **4 buttons and 3 inputs**;
  `emptySvgs` remains **0**. The toolbar remains native in this editor while
  the React `EditorToolbar` face remains available for `browser`.
- The complete 47-occurrence audit is preserved: all **35 executable** memo /
  callback calls have live consumers in the native port, and the five import
  plus two comment memo markers and five callback imports are explicitly removed
  as non-sites. No executable memo/callback site is dead code.
- The native port preserves every executable hook behavior: four state values,
  two effects, and two refs. The remaining three `useState`, two `useEffect`,
  and two `useRef` occurrences are imports; store load, widths, result-height/
  ref synchronization, and editor-host sync all remain accounted for.
- Connected verification through Persephone's MCP endpoint exercises info,
  tools, resources, prompts, history, tool calls, resource/template reads,
  prompt retrieval, all result/content branches, transport switching, and
  selection changes. Connected work is not accepted based on the disconnected
  baseline alone.
- Outgoing panel/detail/row children are destroyed and their Monaco/Markdown
  descendants disposed. `connection.dispose()` cancels reconnect and clears
  subscriptions; request-generation/disposed guards prevent late async writes
  after connection replacement or view destruction.
- No `require("path")`/`require("fs")`, hardcoded colors, hand-rolled caught
  error stringification, unit tests, or test harnesses are introduced. The
  existing `err.message` transport callback is changed to `errMessage`.
- `MarkdownBlock` reaches zero non-story renderer callers and its dead barrel
  exports are removed only after inspection; `MonacoEditorHost` and
  `EditorToolbar` remain because their external callers remain. No UIKit face is
  deleted by this task.
- Verification does not run `npm run build-prod` and does not modify protected
  files, the baseline, dashboard, or unrelated editor directories.

## No changes

The investigation does not modify implementation files, tests, harnesses,
`eslint.config.mjs`, `src/renderer/uikit/shared/vanilla-view.ts`,
`src/renderer/components/page-manager/PageSlot.ts`, anything under
`src/renderer/editors/monaco/`, `about/`, `tools-hub/`, `mneme-config/`,
`mneme-root/`, `settings/`, or `src/renderer/ui/sidebar/`. It does not run
`npm run build-prod` and does not add a dashboard entry.

## Files Changed

| File | Purpose |
|---|---|
| `doc/tasks/US-1147-mcp-inspector/README.md` | This investigation and implementation plan; the sole file written by US-1147 |
