# US-1330 - The MCP Inspector surface

Epic: [EPIC-088 - Boards and tools through `call`, and the retirement of seven tools](../../epics/EPIC-088.md)

**Status: Planned.** This task extends the existing `McpInspectorFacade`; it does not replace the
MCP Inspector connection or history behavior and does not implement the change yet.

## Goal

Make `pages[i].editor` describe what the connected MCP Inspector page is showing: the active panel,
its listed tools/resources/templates/prompts, the selected item, and the result/content view. Add a
small, page-scoped `elements` inventory for controls a user actually operates while preserving the
existing connection and history facade contract, except for the explicitly documented stdio
process-execution narrowing.

## Background

### Existing facade and page reachability

`mcp-view` is registered as the MCP Inspector editor at
`src/renderer/editors/register-editors.ts:172`, and `pages.showMcpInspectorPage()` already reaches
that editor through `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:225-226` and
`src/renderer/api/pages/PagesLifecycleModel.ts:808-825`. `PageWrapper` already registers the
existing facade at `src/renderer/scripting/api-wrapper/PageWrapper.ts:59-65,71-96,173-184`; this
task must keep that registration and pass the same `McpInspectorEditorModel` instance through it.

The current facade advertises only connection/server information and troubleshooting history at
`src/renderer/scripting/api-wrapper/McpInspectorFacade.ts:6-27,43-55`. Its getters read the page
model at `:60-90,94-127`, and its methods delegate to the model at `:131-155`. It has no
`elements` descriptor and no getters for the three connected panels. The canonical public interface
is `src/renderer/api/types/mcp-inspector-editor.d.ts:14-92`; generated copies under
`assets/editor-types/` are not source files and must not be edited.

Before:

~~~ts
const MCP_INSPECTOR_HELP = `Access via pages[i].editor after narrowing editor.id to "mcp-view".
MCP Inspector connection management and troubleshooting history facade.`;

// McpInspectorFacade.aiVision currently has only members/help/summary.
return {
    kind: "McpInspector",
    summary: "MCP Inspector connection and troubleshooting facade.",
    members: MCP_INSPECTOR_MEMBERS,
    help: MCP_INSPECTOR_HELP,
};
~~~

After:

~~~ts
const MCP_INSPECTOR_ELEMENTS = [
    { name: "mcp-transport", purpose: "Choose the HTTP or stdio connection transport." },
    { name: "mcp-saved-connections", purpose: "Choose a saved connection to fill the connection bar." },
    { name: "mcp-url", purpose: "Edit the HTTP endpoint before the user connects." },
    { name: "mcp-command", purpose: "Edit the stdio command before the user connects." },
    { name: "mcp-args", purpose: "Edit stdio arguments before the user connects." },
    { name: "mcp-connect", purpose: "Connect or disconnect the configured MCP server." },
    { name: "mcp-panel-switch", purpose: "Switch between Info, Tools, Resources, Prompts, and History." },
    { name: "mcp-call-tool", purpose: "Call the selected MCP tool from the Tools panel." },
    { name: "mcp-read-resource", purpose: "Read the selected resource or expanded resource template." },
    { name: "mcp-get-prompt", purpose: "Get the selected prompt with its entered arguments." },
    { name: "mcp-open-history", purpose: "Open recorded MCP history in a Log View page." },
    { name: "mcp-clear-history", purpose: "Clear recorded MCP request history." },
] as const;

// The descriptor adds page-scoped elements/provide/highlight and model-backed panel members.
~~~

The `after` inventory is deliberately not a census of every `name:` prop. It names stable controls,
not roots, sidebars, splitters, generated argument fields, list rows, result containers, or model
type-shape `name` properties. `createElements()` resolves default selectors as
`[data-name="..."]` and scopes them beneath the page at
`src/renderer/scripting/ai-vision/elements.ts:64-75,99-145`; page-scoped highlighting must use
`pageScopeSelector()` and `activatePageAndWaitForLayout()` from
`src/renderer/scripting/ai-vision/page-elements.ts:5-8,36-40`, with
`highlightOptions: { all: true }` as required by EPIC-088 decision 10.

### Model state for the three panels

The model already exposes the complete panel state without DOM queries:

| Surface | Model source | Listed items | Selection | Result/content view |
| --- | --- | --- | --- | --- |
| Tools | `McpInspectorEditorModel.toolsState`, declared at `McpInspectorEditorModel.ts:51-65` and owned at `:242-245` | `tools`: each item has `name`, `description`, `inputSchema`, and optional annotations (`:24-37`); `loadTools()` maps the server list at `:367-393` | `selectedToolName`; the first tool is selected after loading and `selectTool()` clears prior args/result (`:383-403`) | `toolResult`, including content blocks, `isError`, and `durationMs`; `callTool()` stores it at `:413-475`; `ToolResultView` renders text/image/resource/resource-link variants at `ToolsPanel.ts:123-148` and `ToolResultView.ts:120-156` |
| Resources | `resourcesState`, declared at `McpInspectorEditorModel.ts:92-119` and owned at `:242-245` | `resources` and URI `templates`, populated by `loadResources()` at `:479-517` | `selectedUri` or `selectedTemplateUri`; selection is mutually exclusive and clears the corresponding prior content/error (`:519-549`) | `readContent` or `templateReadContent`, plus read errors; `readResource()` and `readTemplateResource()` project the first returned content at `:558-657`; `ResourceContentView` renders markdown/text, images, binary, or no content at `ResourceContentView.ts:72-133` |
| Prompts | `promptsState`, declared at `McpInspectorEditorModel.ts:148-164` and owned at `:242-245` | `prompts`, each with description and argument metadata; `loadPrompts()` maps them at `:661-691` | `selectedPromptName`; the first prompt is selected after loading and `selectPrompt()` clears prior args/messages (`:680-703`) | `promptMessages` or prompt error; `getPrompt()` normalizes returned messages at `:712-759`; the detail view renders the messages at `PromptsPanel.ts:233-284` |

`McpInspectorView` chooses the connected body from `state.activePanel` at
`src/renderer/editors/mcp-inspector/McpInspectorView.ts:111-149`. The panel selector exposes Info,
Tools, Resources, Prompts when the model capabilities allow them, and History at `:222-228`.
The facade must report `activePanel` and the available panel ids from that state, not infer them from
mounted views. It must not query `ToolsPanelView`, `ResourcesPanelView`, `PromptsPanelView`,
`ToolResultView`, `ResourceContentView`, or any DOM text.

The public projection will add read-only members with copied values:

| New member | Connected value | Disconnected / no-selection value |
| --- | --- | --- |
| `activePanel` | `McpPanelId` from `model.state.activePanel` | `undefined`; the disconnected body has no panel switcher |
| `availablePanels` | `info`, capability-backed `tools`/`resources`/`prompts`, then `history`, matching `McpInspectorView.panelSegments()` | `undefined` |
| `tools` | Fresh array of copied tool metadata; an MCP server with no tools returns genuine `[]` | `undefined` |
| `selectedTool` | Fresh copy found by `selectedToolName` | `undefined` when no selected name or no matching item |
| `toolResult` | Fresh copy of `toolResult`; optional content fields are conditionally copied | `undefined` when no result exists |
| `toolCallLoading` | The model boolean while connected, including genuine `false` | `undefined` |
| `resources` / `resourceTemplates` | Fresh arrays; empty server lists remain genuine `[]` | `undefined` |
| `selectedResource` / `selectedResourceTemplate` | Fresh copy of the matching item | `undefined` when the relevant selection is empty or unmatched |
| `resourceContent` / `templateResourceContent` | Fresh copy of the selected content, including text or blob only when present | `undefined` when no content exists |
| `resourceReadLoading` / `templateReadLoading` | The model boolean while connected | `undefined` |
| `resourceReadError` / `templateReadError` | Non-empty model error, when present | `undefined` when no error exists |
| `prompts` | Fresh array of copied prompt and argument metadata; no prompts returns genuine `[]` | `undefined` |
| `selectedPrompt` | Fresh copy found by `selectedPromptName` | `undefined` when no selected name or no matching item |
| `promptMessages` | Fresh copy of normalized messages and content blocks | `undefined` before a successful get or with no selection |
| `promptLoading` / `promptError` | Model loading boolean / non-empty error while connected | `undefined` when disconnected; empty error is omitted |

Every copied object must omit absent optional keys. For example, a result content block must not
become `{ mimeType: undefined }`, and a result/message/content getter must not return an object with
an `undefined` `selected`, `result`, `text`, `blob`, or error key. The implementation must use
conditional object spreads (or equivalent construction) so an omitted value remains absent when it
crosses the agent boundary; EPIC-088 decision 9 records that `strictNullChecks` is off and US-1326
found that an object key holding `undefined` reaches the agent as `null`.

### Connection persistence and the secret audit

The connection configuration is not ephemeral:

- `McpConnectionStore.SavedMcpConnection` contains `url`, `command`, and `args` as persisted string
  fields at `src/renderer/editors/mcp-inspector/McpConnectionStore.ts:10-19`.
- `load()` reads `mcp-connections.json` through the app data-file API at `:29-50`; `save()` writes
  the raw connection object with those fields at `:53-103` and the debounced writer serializes the
  full list at `:123-130`. There is no redaction or credential vault in this path.
- A successful connection passes the current state values to that store at
  `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts:329-347`. Page restoration also
  persists the connection config in the editor restore state at `:800-824`.
- HTTP transport constructs `new URL(config.url)` at
  `src/renderer/editors/mcp-inspector/McpConnectionManager.ts:146-161`; stdio passes `command` and
  `args` directly to `StdioClientTransport` at `:162-168`. A URL may contain basic-auth/query
  credentials, and a command or argument may contain a token, password, or secret-bearing flag.

No renderer script/API node beside `McpInspectorFacade` returns `SavedMcpConnection` or the current
raw connection config. `McpInspectorView` consumes the store internally at
`src/renderer/editors/mcp-inspector/McpInspectorView.ts:92-95,106-109`, and
`McpConnectionStore` is only imported by that view and the model. The current facade is therefore
the existing agent boundary that returns `url`, `command`, and `args` at
`src/renderer/scripting/api-wrapper/McpInspectorFacade.ts:101-120`; the public types repeat those
read/write members at `src/renderer/api/types/mcp-inspector-editor.d.ts:43-58`.

The implementation must apply the epic's asymmetry explicitly:

1. Keep the existing getters as a documented read boundary for backward compatibility, with help
   warning that their values can contain credentials. Do not add saved-connection enumeration,
   credential extraction, or a second return path. Returning an existing value through this explicit
   facade boundary is distinct from accepting a new secret.
2. Keep `url` writable. It is an address, not a credential value by itself; HTTP transport creates
   an HTTP client and does not spawn a process. The facade help must say that an agent-supplied URL
   must not contain embedded credentials and that the agent should ask the user when credentials or
   headers are required rather than inventing or supplying them.
3. Remove the setters and `writable: true` metadata only for `command` and `args`. The decisive
   boundary is arbitrary process execution, not merely that a string might contain a secret:
   `transportType` is writable, `connect()` is already public, and the current combination lets an
   agent choose a command line and hand it to `StdioClientTransport`, which spawns a process with
   the user's privileges at `McpConnectionManager.ts:162-168`. There is no dialog on that path. This
   is the same class of privilege escalation that the toolset-registration and board-trust dialogs
   prevent, so epic decision 5 makes removing these setters an abort-level security requirement.
   `transportType` and `connectionName` remain writable; `url`, `command`, and `args` remain readable
   through the existing facade boundary, but only the user can enter a new stdio command or args.
4. Keep `pages.showMcpInspectorPage({ url })` exactly as published at
   `PageCollectionWrapper.ts:34,225-226`, `PagesModel.ts:277-278`,
   `PagesLifecycleModel.ts:808-824`, and `api/types/pages.d.ts:109-110`. A server URL is an
   address, just as a file path or tool argument is an address/input; it is not itself a secret
   argument. The updated `$help` and `mcpHint` must say the URL must be credential-free and that the
   agent should ask the user rather than invent or embed credentials. This task does not delete a
   working published capability from a surface-description task.

The raw values may still be stored locally because the existing user-facing Saved Connections and
page restore behavior requires them; changing storage to redact or vault them is a separate storage
security task. This task must not expose the store as a new agent node.

### Existing absent values

The current facade's empty-string claims are verified against the model rather than assumed:

- Defaults set `serverName`, `serverTitle`, `serverVersion`, `serverDescription`,
  `serverWebsiteUrl`, `instructions`, and `errorMessage` to `""` at
  `McpInspectorEditorModel.ts:202-229`.
- Disconnect/error transitions reset the server fields and capabilities to empty/false at
  `:257-298`; connection-manager disconnect resets its internal server/error state at
  `McpConnectionManager.ts:253-273`.
- The facade returns those exact strings at `McpInspectorFacade.ts:64-90`, so the existing
  descriptions “empty when disconnected,” “empty if not provided,” and “empty when no error” are
  correct today. No existing empty-value member is silently changed to `undefined` in this task.
- `history` is reset on disconnect/error at `McpInspectorEditorModel.ts:293-298` and returns the
  model's current array at `:777-794`; its existing shape and behavior remain unchanged even though
  new panel projections will be copied.

For new getters, disconnected means `undefined` for panel availability, selections, results,
content, loading flags, and errors. A connected server with an empty list returns a genuine `[]`;
an active connected panel with no request in flight returns genuine `false` for its loading flag.
No public panel snapshot may use `null`, `""`, `false`, or `0` as an unavailable sentinel, and no
object key may be assigned `undefined`.

### Curated controls and `data-name` lifetime

The raw 63 `name:` count is an upper bound. `rg` over
`src/renderer/editors/mcp-inspector/` shows names from model/type shapes as well as UI props, and
the UI names include structural roots and splitters:

Unlike most app folders, this folder also contains literal `[data-name="..."]` selectors used by
its own resize handlers at `ToolsPanel.ts:74`, `ResourcesPanel.ts:122-125`, and
`PromptsPanel.ts:117-120`; those selectors verify the runtime attributes emitted by UIKit and are
not additional element declarations. The implementation must verify the corresponding `data-name`
on the actual mounted controls after each update.

- Connection controls are named in `McpInspectorView.ts:68-85,115,121,180-214`: `mcp-transport`,
  `mcp-connect`, `mcp-saved-connections`, `mcp-url`, `mcp-command`, and `mcp-args`. These are
  stable user-operated controls and belong in `elements`.
- The server-bar panel switch is named and re-applied at `McpInspectorView.ts:225-228` as
  `mcp-panel-switch`; it is the control that exposes the three panels and History.
- The Tools panel names its panel/sidebar/splitters and the call button at
  `ToolsPanel.ts:30-44,96-115,148`. Only `mcp-call-tool` is a user action in the curated list;
  panel roots and splitters are layout/structural controls.
- Resources currently names only its panel/sidebar/splitter at
  `ResourcesPanel.ts:32-37,84-86`; the Read Resource button is a real user action at `:185-223`
  but is currently unnamed. Add `name: "mcp-read-resource"` at construction and to both update
  shapes (`:191,210,221`), because the same button serves static resources and templates.
- Prompts names its panel/sidebar/splitter at `PromptsPanel.ts:27-32,69-77`; the Get Prompt button
  is a real user action at `:192-216,233-251` but is currently unnamed. Add and preserve
  `name: "mcp-get-prompt"` at construction and update (`:214,249`).
- History creates two real user actions at `McpInspectorView.ts:259-266` but currently gives them
  no names. Add `mcp-open-history` and `mcp-clear-history` to those buttons; they are recreated on
  render and have no later update path.

The list rows and argument fields are intentionally not individually curated: their identities are
server-provided/dynamic and their state is exposed by the model getters. The panel/sidebar roots
(`mcp-tools-panel`, `mcp-tools-sidebar`, `mcp-resources-panel`, `mcp-resources-sidebar`,
`mcp-prompts-panel`, `mcp-prompts-sidebar`) and splitters are not user-action descriptors. Do not
rename any existing name. The implementation must verify all selected names survive updates:

- `ButtonView` deletes `data-name` when an update omits `name` at
  `src/renderer/uikit/Button/ButtonView.ts:74-102`; therefore `mcp-connect`, `mcp-call-tool`,
  `mcp-read-resource`, and `mcp-get-prompt` must include their names in every update.
- `SegmentedControlView` deletes its root `data-name` when an update omits it at
  `src/renderer/uikit/SegmentedControl/SegmentedControlView.ts:62-80`; the panel switch already
  preserves `mcp-panel-switch` at `McpInspectorView.ts:225,227`.
- `SelectView` does the same at `src/renderer/uikit/Select/SelectView.ts:141-152`; the transport
  and saved-connection selectors already reapply their names at `McpInspectorView.ts:80,115,180-181`.
- `InputView` updates its optional name through `setOptionalDataset()` at
  `src/renderer/uikit/Input/InputView.ts:115-155`; `TransportInputsView.urlProps()`/
  `commandProps()`/`argsProps()` supply names on every update at `McpInspectorView.ts:205-214`.
- Panel names are applied at construction/update by `applyPanelAttributes()`
  (`src/renderer/uikit/Panel/panel-style.ts:303-331`), but the selected panel names are not
  included in `elements` because they are structural roots.

## Implementation Plan

### 1. Define the public model-backed panel projections

Update `src/renderer/api/types/mcp-inspector-editor.d.ts`:

- Add read-only snapshot types for tools, tool result content, resources, resource templates,
  resource content, prompts, prompt arguments, prompt messages, and prompt message content. Keep
  the public union shapes serializable and copyable; optional fields are omitted when absent.
- Extend `IMcpInspectorEditor` with the members in the panel state table: `activePanel`,
  `availablePanels`, the three list families, selected records, result/content projections, and
  loading/error state.
- Change only `command` and `args` from writable to read-only in the canonical interface. Keep
  `url`, `transportType`, and `connectionName` writable, and retain all existing connection/history
  members and signatures otherwise.

Before:

~~~ts
/** Server URL (for HTTP transport). */
url: string;
/** Command to spawn (for stdio transport). */
command: string;
/** Space-separated arguments (for stdio transport). */
args: string;
~~~

After:

~~~ts
/** Current HTTP endpoint/address. Do not supply embedded credentials through the agent API. */
url: string;
/** Current stdio command; may contain credential-bearing flags. */
readonly command: string;
/** Current stdio arguments; may contain credential-bearing flags. */
readonly args: string;
~~~

Do not edit `assets/editor-types/mcp-inspector-editor.d.ts` or any other generated asset.

### 2. Add the facade members and copied projections

Update `src/renderer/scripting/api-wrapper/McpInspectorFacade.ts`:

- Import the MCP Inspector model snapshot types and `createElements`, `pageScopeSelector`,
  `activatePageAndWaitForLayout`, and `ui` following `GitTreeEditorFacade.ts:11-15,74-104`.
- Declare the exact 12 curated element declarations listed in the `after` snippet. Reuse the
  existing names verbatim and use `mcp-read-resource`, `mcp-get-prompt`,
  `mcp-open-history`, and `mcp-clear-history` only after the view changes in steps 3-4 add them.
- In `aiVision`, merge `createElements(...).members` into the existing member list, provide
  `elements` and `highlight`, use `pageScopeSelector(editor.page.id)` as the scope, activate the
  page before highlighting, and pass `{ all: true }`. If the model has no page host, leave the
  scope/before-highlight hooks absent as the existing facade patterns do.
- Implement every new getter from `model.state`, `model.toolsState`, `model.resourcesState`, and
  `model.promptsState` only. Do not acquire a view, call `querySelector`, read `textContent`, or
  inspect `data-type`/`data-name` to produce panel state.
- Gate panel projections on `connectionStatus === "connected"`; return genuine empty arrays for
  connected empty lists and `undefined` for disconnected/unavailable values. Find selections by
  the model's selected name/URI and return `undefined` for an empty or stale selection.
- Return fresh arrays and object copies. Map result/content/message unions with conditional spreads
  so optional `mimeType`, `text`, `blob`, and nested resource fields are omitted rather than set to
  `undefined`. Preserve genuine `false` (`isError` or loading state) and zero durations.
- Keep all current getters/methods, but remove only the `command` and `args` setters and their
  `writable` metadata. Keep the `url` setter and its existing writable contract. Add a caution to
  the existing `connect` member explaining that it contacts the configured MCP server or starts its
  configured stdio process; retain the existing disconnect/history cautions.
- Extend `summarize()` with connection status, active panel, list counts, and selected names using
  conditional spreads for absent selections. It must not call any server operation or DOM API.

### 3. Add missing action names and preserve existing names

Update only the relevant view controls:

- `src/renderer/editors/mcp-inspector/ResourcesPanel.ts:185-223`: add
  `name: "mcp-read-resource"` to the `ButtonView` constructor and both `button.update()` calls.
  The name is shared by the static-resource and template-resource branches; do not create two
  selectors for one reused control.
- `src/renderer/editors/mcp-inspector/PromptsPanel.ts:192-251`: add
  `name: "mcp-get-prompt"` to the constructor and `button.update()`.
- `src/renderer/editors/mcp-inspector/McpInspectorView.ts:259-266`: name the recreated History
  buttons `mcp-open-history` and `mcp-clear-history`.

Do not rename any existing `data-name`/`name` value, add names to dynamic server-provided rows or
argument inputs, or change the event handlers. Verify that every name in the curated list resolves
under `[data-page-id="<page id>"]` after the relevant panel re-renders.

### 4. Preserve URL opening and update the MCP hint

Keep the public script path for opening the Inspector unchanged:

- `PageCollectionWrapper.ts:34,225-226`, `PagesModel.ts:277-278`,
  `PagesLifecycleModel.ts:808-824`, and `api/types/pages.d.ts:109-110` remain unchanged, including
  `showMcpInspectorPage({ url })`.
- Add to the facade `$help` that the optional URL is an address only: it must not contain embedded
  basic-auth/query credentials, tokens, or invented headers. When a server needs credentials, the
  agent asks the user to enter them in the Inspector UI.
- Update `src/renderer/editors/register-editors.ts:172` so `mcpHint` names the real path:

Before:

~~~ts
mcpHint: 'Use execute_script with: await app.pages.showMcpInspectorPage() or await app.pages.showMcpInspectorPage({ url: "http://host:port/mcp" })'
~~~

After:

~~~ts
mcpHint: 'Open with pages.showMcpInspectorPage() or pages.showMcpInspectorPage({ url: "http://host:port/mcp" }) using a credential-free URL, then use pages[i].editor after narrowing editor.id to "mcp-view" to inspect connection and panel state.'
~~~

The existing UI still accepts user-entered URL/command/args and persists them for Saved Connections;
this plan removes only the agent's ability to choose a new stdio process command or args. The
published URL-opening API remains intact and accepts an address, with the credential-free rule
documented at the agent boundary.

### 5. Exclude server-side panel actions from the facade

Do not add facade methods that call `model.callTool()`, `model.readResource()`/
`model.readTemplateResource()`, or `model.getPrompt()`, and do not add facade setters that call
`selectTool`, `selectResource`, `selectTemplate`, `selectPrompt`, or argument setters.

This exclusion is intentional. Calling a selected tool would let an agent execute arbitrary code,
modify data, or trigger destructive behavior on another MCP server through Persephone; reading a
resource could disclose files or private data; getting a prompt could retrieve server-controlled
instructions/content. The blast radius is the configured server's full MCP capability, transported
through its existing HTTP credentials or local stdio process. The new facade is read-only for the
three panel states. The agent reads the currently rendered model-backed result/content and tells the
user which visible control to operate; a future explicit automation surface can add actions with
the appropriate server and user-confirmation policy. Existing `connect()` is retained as an
already-public member and gets an explicit caution; this task adds no new remote operation. The
command/args setter removal is the separate security narrowing that closes the agent-selected
local-process path.

### 6. Verify without tests or harness changes

Review the implementation against the source and this plan:

- All current connection/history members remain available except the `command` and `args` setters;
  `url` remains writable and the published URL-opening option is unchanged.
- Every panel getter is model-only, returns the exact disconnected/no-selection value, preserves
  genuine empty arrays/booleans/zeroes, returns copied snapshots, and omits absent object keys.
- The active panel and available panels match the `McpInspectorView` capability-derived selector;
  no DOM query is used for panel state.
- Exactly the 12 curated element declarations exist; every selector is page-scoped and highlighting
  passes `{ all: true }`.
- Existing names are unchanged, new Read/Get/History names are present, and all named UIKit controls
  reapply `name` on every update where the primitive can delete `data-name`.
- The MCP hint points to `pages[i].editor` and no new facade method invokes an MCP server action.
- No unit tests or harness are added. Do not touch `doc/active-work.md`, `doc/epics/EPIC-088.md`,
  the dashboard entry, generated assets, or make a commit.

## Concerns

- **Credential-bearing existing API.** The connection store persists raw URL/command/args in a
  plaintext app data JSON file, and the current facade returns and accepts them. The plan retains
  the established read boundary, keeps the HTTP `url` setter and URL-opening API, and removes only
  the `command`/`args` setters because they enable agent-selected local process execution. The
  `$help`/hint must prohibit embedded URL credentials and direct the agent to the user. A later
  storage-security task should decide whether saved credentials require encryption, redaction, or a
  user-mediated vault.
- **Published security narrowing.** Removing `command` and `args` setters takes capability away
  from the already-published US-1291 facade. It is a security narrowing decided during EPIC-088,
  not a user-requested feature change, so the implementation must add it to
  `docs/whats-new.md` under `## Version 5.0.0 (Upcoming)`. An agent that previously configured a
  stdio connection must now open the Inspector page and ask the user to enter the command and
  arguments; it cannot choose a new process through the facade.
- **The connected panel is read-only by design.** Existing model methods can call tools, read
  resources, and get prompts, but exposing them to the agent would route arbitrary MCP-server
  privileges through Persephone. The facade reports the state and names the controls; it does not
  drive them.
- **Disconnected state is not an empty connected server.** Internal panel stores reset to `[]`,
  `null`, `""`, and `false` on disconnect/error at `McpInspectorEditorModel.ts:293-298`; the public
  contract maps unavailable panels to `undefined` while preserving connected genuine empties.
- **Optional object keys cross the agent boundary.** All copy helpers and summaries require a manual
  review for omitted keys. A property with value `undefined` must not be serialized into the
  agent-visible object.
- **Dynamic controls are intentionally not enumerable.** Tool/resource/prompt rows and argument
  fields are server-defined and can be replaced through keyed-list rerenders. Their model state is
  the stable surface; the curated element list contains only stable controls with verified names.
- **Generated declarations.** The canonical type is under `src/renderer/api/types/`; generated
  `assets/editor-types/*.d.ts` output is refreshed by the normal generator and must not be edited.
- **Existing history behavior.** `history` currently returns the model's live array rather than a
  copied snapshot. Preserve it for backward compatibility; only the new panel projections need
  defensive copies.

## Acceptance Criteria

- [ ] `McpInspectorFacade` remains registered for `mcp-view` through the existing
      `PageWrapper.ts` factory and all current connection/history members still resolve.
- [ ] The facade exposes model-backed `activePanel` and `availablePanels`, with the same
      capability-dependent Tools/Resources/Prompts selector behavior as `McpInspectorView`.
- [ ] The facade exposes copied tool list, selected tool, tool result, resource/template lists,
      selected resource/template, resource/template content, prompt list, selected prompt, and
      prompt messages; it also reports connected loading/error state without querying a view or DOM.
- [ ] Connected empty lists are genuine `[]`; disconnected/unavailable values and no-selection
      values are `undefined`; genuine `false` and `0` remain values; no returned object contains a
      key whose value is `undefined`, `null` is not used as an absence sentinel.
- [ ] The existing server-info and error members are verified to return their current `""` values
      when disconnected/no-error; no unrelated existing member changes its empty-string contract.
- [ ] Exactly these 12 controls are curated: `mcp-transport`, `mcp-saved-connections`, `mcp-url`,
      `mcp-command`, `mcp-args`, `mcp-connect`, `mcp-panel-switch`, `mcp-call-tool`,
      `mcp-read-resource`, `mcp-get-prompt`, `mcp-open-history`, and `mcp-clear-history`.
- [ ] Existing names are not renamed; Read Resource, Get Prompt, and History controls receive
      stable names, and every named Button/SegmentedControl/Select/Input re-applies its name across
      later updates. Elements use page-scoped selectors and `highlightOptions: { all: true }`.
- [ ] `url` remains readable and writable as the existing HTTP address member; `command` and `args`
      remain readable but are no longer writable from the agent because their combination with
      writable `transportType` and `connect()` would spawn an agent-chosen process with user
      privileges. `connectionName` and `transportType` remain writable.
- [ ] `pages.showMcpInspectorPage({ url })` remains exactly available and typed as published;
      `$help` and `register-editors.ts:172` state that the URL must be credential-free and that the
      agent asks the user for credentials rather than inventing them.
- [ ] `docs/whats-new.md` receives an entry in `## Version 5.0.0 (Upcoming)` describing the
      security narrowing: `command` and `args` setters were removed from the MCP Inspector facade;
      an agent that previously configured stdio must now open the page and ask the user to enter the
      command and arguments.
- [ ] No facade method invokes `callTool`, `readResource`, `readTemplateResource`, or `getPrompt`;
      the help states the full blast radius and tells the agent to inspect state/use the user's
      visible controls instead.
- [ ] No tests or harness are added; `doc/active-work.md`, `doc/epics/EPIC-088.md`, generated
      assets, the dashboard, and commits remain untouched.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1330-mcp-inspector-surface/README.md` | This verified plan, panel state contract, element curation, secret/absent-value audits, action boundary, and acceptance criteria. |
| `src/renderer/scripting/api-wrapper/McpInspectorFacade.ts` | Add model-backed panel getters, copied/omitted-value projections, curated page-scoped elements, updated help/summary, and remove the `command`/`args` setters while retaining writable `url`. |
| `src/renderer/api/types/mcp-inspector-editor.d.ts` | Add public panel snapshot types and members; make only `command` and `args` read-only. |
| `src/renderer/editors/mcp-inspector/ResourcesPanel.ts` | Add and preserve `mcp-read-resource`. |
| `src/renderer/editors/mcp-inspector/PromptsPanel.ts` | Add and preserve `mcp-get-prompt`. |
| `src/renderer/editors/mcp-inspector/McpInspectorView.ts` | Add stable names to the two History buttons. |
| `src/renderer/editors/register-editors.ts` | Replace the stale `execute_script` MCP hint with the `pages[i].editor` path. |
| `docs/whats-new.md` | Add the 5.0.0 Upcoming release-note entry for the `command`/`args` setter narrowing and its user migration path. |

Files intentionally needing **no changes**:

- `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts` - its existing three
  `TOneState` panel stores and server-operation methods already provide all required model state;
  the facade must project them without adding a second state path.
- `src/renderer/editors/mcp-inspector/McpConnectionManager.ts` - existing transport behavior and
  user-facing connection setup remain unchanged; no facade action is added around its client.
- `src/renderer/editors/mcp-inspector/McpConnectionStore.ts` - persistence is documented but not
  exposed or redesigned in this surface task; storage hardening is a separate concern.
- `src/renderer/editors/mcp-inspector/ToolArgForm.ts`, `ToolResultView.ts`,
  `ResourceContentView.ts`, and `mcp-inspector.css` - they remain rendering implementations; panel
  state comes from the model and no DOM selector is used for it.
- `src/renderer/editors/mcp-inspector/ToolsPanel.ts` - retain its existing call handler and
  `mcp-call-tool` name; only the facade and existing model state describe it.
- `src/renderer/scripting/api-wrapper/PageWrapper.ts` - the `mcp-view` factory is already present
  and must continue to instantiate `McpInspectorFacade`.
- `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts`, `src/renderer/api/types/pages.d.ts`,
  `src/renderer/api/pages/PagesModel.ts`, and `src/renderer/api/pages/PagesLifecycleModel.ts` -
  keep the published `showMcpInspectorPage({ url })` capability and signatures unchanged; the URL
  is an address and `$help`/`mcpHint` carry the credential-free rule.
- `assets/editor-types/*.d.ts` - generated output only; never hand-edit.
- `doc/active-work.md`, `doc/epics/EPIC-088.md`, `docs/**`, unit tests, test harnesses, and commits -
  explicitly out of scope for this task document and requested turn.
