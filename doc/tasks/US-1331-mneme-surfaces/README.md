# US-1331 - Mneme config and Mneme root

Epic: [EPIC-088 - Boards/tools through call, retirement seven tools](../../epics/EPIC-088.md)

Status: Planned. This document defines the implementation; no production code, tests, harnesses, dashboard entry, or epic edit is part of this task.

## Goal

Add dedicated pages[i].editor facades for the mneme-config and mneme-root editors. The facades must expose the current configuration and browsing state from their editor models, provide a deliberately small set of model-backed operations, and expose only curated, page-scoped controls through elements.

Also add the missing pages.showMnemeConfigPage() member to the scripting page collection. PagesModel already has the opener; the wrapper and canonical public declaration do not.

The facade boundary is configuration and browsing, not a second document API. The Mneme MCP server already owns document operations; the new $help text must direct document work there instead of exposing document contents, a tree provider, or a parallel document command surface.

## Background

### Existing registration and page-opening path

Both editors are registered but currently fall through to GenericEditorFacade:

- src/renderer/editors/register-editors.ts:169-180 registers mneme-config at :173 and mneme-root at :178.
- src/renderer/scripting/api-wrapper/PageWrapper.ts:58-65 defines the EditorFacade union, and :71-96 defines FACADE_FOR_EDITOR; neither contains a Mneme factory. :173-184 therefore uses the generic fallback for these ids.
- src/renderer/api/pages/PagesLifecycleModel.ts:789-791 already implements showMnemeConfigPage() by opening the mneme-config editor.
- src/renderer/api/PagesModel.ts:268-281 re-exports that member at :279.
- src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:13-45 declares scripting page members and has showMcpInspectorPage at :34; :225-227 implements that wrapper method. There is no showMnemeConfigPage declaration or method.
- src/renderer/api/types/pages.d.ts:1-6,104-114 is the canonical page collection type and likewise has the MCP opener but not the Mneme opener.

The public editor type contract is also incomplete:

- src/renderer/api/types/page.d.ts:29-47 defines IFacadeEditorId and IEditorFacade; add both Mneme ids and their canonical interfaces there.
- assets/editor-types/*.d.ts is generated output and must not be edited by hand.

US-1329 owns showToolsHubPage() and will touch the same PageCollectionWrapper.ts member/method area and pages.d.ts declaration area. Implement US-1329 first, then add showMnemeConfigPage adjacent to showMcpInspectorPage and before showToolsHubPage, preserving both additions. If the tasks land in the opposite order, rebase the second change and retain both methods rather than replacing either line.

### Mneme configuration model and view

src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts:27-46 is the authoritative state shape. Its defaults at :48-63 are disconnected, not running, an empty URL, status: null, empty progress/config/index maps, and refreshing: false.

The relevant state is:

| Public concern | Model state and verified source |
| --- | --- |
| Connection/index service status | connectionStatus, errorMessage, running, url, refreshing, and status at MnemeConfigEditorModel.ts:27-45. refreshStatus() calls the Mneme status tool and stores the parsed result at :208-224. |
| Roots | WikiStatus.roots is stored in status (MnemeConfigEditorModel.ts:39; mnemeTypes.ts:54-58). Each WikiRootStatus contains name, folder, document count, model, precision, schema/index metadata, and optional reindex progress (mnemeTypes.ts:11-21). |
| Root configuration | rootConfigs is a lazily populated map at MnemeConfigEditorModel.ts:40; getRootConfig() reads it through :389-401, and setRootConfig() updates include/ignore configuration and refreshes at :403-424. |
| Embedding-model state | WikiStatus.model is optional (mnemeTypes.ts:54-58) and WikiModelStatus reports name, precision, version, cache directory, completion, files, and optional download progress (:44-52). modelReady at MnemeConfigEditorModel.ts:527-529 delegates to isModelReady() (mnemeTypes.ts:96-100). |
| Reindex progress | reindexProgress is a map at MnemeConfigEditorModel.ts:41; reindex() drives it through :324-374. Root status also has optional progress. |

MnemeConfigView.ts:32-44 has a stopped branch with mneme-start and mneme-open-settings. The running branch at :54-88 contains the connection/status bar, MCP Inspector and log actions, restart affordance, and the model/roots panels. RootsPanel.ts:41-120 owns the roots list, add-root, and reindex-all controls. ModelPanel.ts:76-114 owns model status and mneme-update-model.

The model already contains the usable action paths. restartMneme() is at MnemeConfigEditorModel.ts:153-172; log/Inspector/root navigation is at :174-205; root removal is at :306-322; model update is at :376-387; and root configuration writing is at :403-424. The facade should delegate to these model-owned methods, preserving their existing confirmation, IPC, notification, and refresh behavior.

### Mneme root model and view

src/renderer/editors/mneme-root/MnemeRootEditorModel.ts:33-81 is the authoritative browsing/search state. Defaults are at :93-115; the model is identified as mneme-root at :128-136.

| Public concern | Model state and verified source |
| --- | --- |
| Current root | rootFolder, rootName, resolving, and optional error at MnemeRootEditorModel.ts:34-42; resolution is model/API-backed in :241-276. |
| Search query/mode | searchQuery and searchMode at :44-47; modes are exactly text, vector, and hybrid at :12-14. |
| Search activity/result state | searching, results, optional searchNote/searchError, and hasSearched at :48-54; runSearch() populates them from the Mneme search tool at :340-388. |
| Tag/date filters | filterTags, filterExcludeTags, dateFrom, and dateTo at :56-63; setters and clearFilters() are at :279-317. |
| Selected document | selectedHref at :42 and setSelectedHref() at :211-214; the tree secondary view is the code that updates it when a document is selected (MnemeTreeSecondaryView.ts:232-246). |
| Tag vocabulary | tagVocab and tagVocabLoaded at :64-67; loading is model-backed at :319-338. This is optional supporting state for the filter UI, not a document API. |

MnemeRootEditorView.ts:296-357 projects the main search shell from model state. Its stable controls are named at :386-415. The filter controls are named at :123-162. Results are rendered as Markdown by results-to-markdown.ts:3-10,39-41; the result view does not provide a stable named row/control API.

The facade must read these model fields directly. It must not query the DOM, scrape rendered Markdown, inspect MnemeTreeSecondaryView, or expose MnemeTreeProvider internals.

### Connection, service, and secret audit

The renderer uses one shared connection service: src/renderer/api/mneme-connection.ts:11-23 describes the shared manager/client, :40-65 initializes it from settings and sidecar status, and :68-84 exposes client/status/error/server information. A missing client is represented by getClient(): null at :68-70.

The renderer-side status projection is intentionally smaller: src/renderer/api/mneme-status.ts:25-40 defines enabled, running, url, and modelReady, with defaults of false/false/empty/false. src/ipc/api-types.ts:143-148 exposes only running, URL, and an optional error through the sidecar IPC status. src/renderer/api/settings.ts:23-53,109-110,143-144 exposes only mneme.enabled and mneme.port as Mneme settings.

The Mneme crate does have one credential-shaped field: mneme/src/config.rs:19-27,55-66 defines transport.token: Option<String>. The same source comments that local loopback transport has no authentication requirement; the renderer service starts the local sidecar and obtains its URL through src/main/mneme-service.ts:41-67,83-108. The embedding-model configuration at mneme/src/config.rs:47-53 is name/path/precision, not a credential. Renderer WikiModelStatus exposes model/cache metadata only (src/renderer/editors/mneme-config/mnemeTypes.ts:44-52).

Audit result:

- No new member accepts a token, API key, password, credential, arbitrary environment map, or transport configuration.
- transport.token must not be copied into either facade. It is not in WikiStatus, MnemeStatus, the renderer settings surface, or the existing renderer API.
- No existing path beside either facade returns that token. app.settings returns the two Mneme settings, api.getMnemeStatus() returns sidecar status, and the Mneme status tool returns roots/model state rather than transport secrets.
- $help must say that transport credentials are intentionally unavailable and that document operations belong to the Mneme MCP server. This is an honest limitation, not a claim that Mneme has no token-capable configuration.

### Facade and element conventions

src/renderer/scripting/api-wrapper/ArchiveEditorFacade.ts:8-71 is the closest existing pattern: static IAiElementDeclaration/IAiMember descriptors, createElements(), page scoping, activation before highlighting, highlightOptions: { all: true }, copied model snapshots, and explicit absence/help text. The union/factory integration point is PageWrapper.ts:58-96,173-184.

Element lookup defaults to [data-name="name"] in src/renderer/scripting/ai-vision/elements.ts:64-75; the facade must pass the current page scope and use highlightOptions: { all: true }. UIKit removes a name when a later update omits it: ButtonView.ts:74-112 deletes data-name at :101 when name is absent; the equivalent optional-name behavior is present in InputView.ts:126-155, TextareaView.ts:114-159, SelectView.ts:131-150, and TagsInputView.ts:200-218.

The curation below deliberately excludes structural nodes, repeated per-root names, result content, secondary-view controls, and portalled dialog/overlay controls. It also excludes any name whose owning view does not preserve the name across all relevant updates.

The source-audit counts of 44 and 18 name occurrences for these surfaces are upper bounds, not target element counts; they include repeated/dynamic UI names and type-shape names. In particular, the five name properties in mnemeTypes.ts are TYPE shapes, not DOM elements. The final facade declarations below are intentionally much smaller.

#### mneme-config elements: 8 curated existing names

| Existing data-name | Why it belongs | Source/lifetime check |
| --- | --- | --- |
| mneme-start | Start the stopped Mneme service through the visible control. | MnemeConfigView.ts:32-44; mounted only in the stopped branch. |
| mneme-open-settings | Open the user-facing Mneme settings location. | MnemeConfigView.ts:32-44; stopped-branch control. |
| mneme-open-mcp-inspector | Open the existing MCP inspection surface. | MnemeConfigView.ts:61-67; created once in the running view. |
| mneme-open-log | Open the Mneme sidecar log. | MnemeConfigView.ts:61-67; created once in the running view. |
| mneme-restart | Restart the sidecar when the running view needs it. | Created/removed by the running view at MnemeConfigView.ts:74-83; its button props retain the name while mounted. |
| mneme-add-root | Locate the user-only add-root workflow. | RootsPanel.ts:57-67,91-97; header props include the name on initial and update projections. |
| mneme-reindex-all | Locate the expensive all-roots reindex action. | RootsPanel.ts:57-67,91-97; header props include the name on updates. |
| mneme-update-model | Locate embedding-model provisioning/update. | ModelPanel.ts:86-114; buttonProps() always supplies the name. |

No existing data-name needs renaming or restoration. mneme-config-root, mneme-status-bar, and mneme-body are structural (MnemeConfigView.ts:96-109,61-71). Per-root names such as mneme-filters-$\{root\}, mneme-reindex-$\{root\}, mneme-remove-$\{root\}, and stale-index/delete/filter-row names are repeated or dynamic (RootsPanel.ts:157-163,190-245,249-315), so they are not part of the static facade contract. Native input/confirmation dialogs are portalled/user-only and are excluded.

The facade’s $help must label mneme-start, mneme-open-settings, add-root, log, Inspector, and Explorer-style UI handoffs as element locations rather than facade methods where applicable. In particular, addRoot() is not a facade method: MnemeConfigEditorModel.ts:266-304 requires a native folder picker followed by an InputDialog, and the user must supply the folder/name through that workflow. showRootInExplorer() at :203-205 is likewise an OS-shell handoff. Existing model-backed root removal, reindex, configuration update, model update, and service restart are eligible facade actions with cautions.

#### mneme-root elements: 9 curated existing names

| Existing data-name | Why it belongs | Source/lifetime check |
| --- | --- | --- |
| mneme-search-input | Locate the current search query input. | MnemeRootEditorView.ts:386-391; shell sync at :331-357 retains its name. |
| mneme-search-mode | Locate the text/vector/hybrid mode selector. | MnemeRootEditorView.ts:394-399; shell sync retains its name. |
| mneme-filters-toggle | Locate the filter panel toggle. | MnemeRootEditorView.ts:402-408; shell sync retains its name. |
| mneme-search-run | Locate the search submit control. | MnemeRootEditorView.ts:411-415; shell sync retains its name. |
| mneme-filter-tags | Locate included-tag filtering. | MnemeRootEditorView.ts:137-143; filter sync supplies the name. |
| mneme-filter-exclude-tags | Locate excluded-tag filtering. | MnemeRootEditorView.ts:146-152; filter sync supplies the name. |
| mneme-filter-date-from | Locate the lower date bound. | MnemeRootEditorView.ts:155-158; DateInputView.ts:8-47 carries the name to the inner input. |
| mneme-filter-date-to | Locate the upper date bound. | MnemeRootEditorView.ts:159-162; DateInputView.ts:8-47 carries the name to the inner input. |
| mneme-filters-clear | Locate the visible clear-filters action when filters are active. | MnemeRootEditorView.ts:123-133; conditional mount is acceptable and the created button has a name. |

No existing data-name needs renaming or adding. mneme-search-toolbar is structural (MnemeRootEditorView.ts:297-300). mneme-search-results must not be curated: RootResultView supplies name only in the results branch at :219-230, while the non-results branch at :233-239 omits it; UIKit therefore deletes the attribute on a later update. There are no stable named result rows. mneme-tree-secondary-view, mneme-tree-close, and mneme-root-name belong to the secondary panel (MnemeTreeSecondaryView.ts:25-60,132-162), not this main-editor list. Portalled filter/autocomplete overlays are excluded.

### State and absent-value contract

strictNullChecks is off, so the implementation must make absence explicit in each getter and must not rely on a public null convention. Optional values below must return undefined; genuinely empty collections must return []. Any copied object/snapshot must omit optional keys rather than creating { key: undefined }, because the live resolver serializes an object key holding undefined as null (the behavior recorded during US-1326).

#### Configuration facade

| Getter | No status/service | Connected status with a genuine empty value |
| --- | --- | --- |
| running | false | Sidecar running state from model, normally true. |
| url | undefined when the model URL is empty | The current URL string. |
| connectionStatus | disconnected from the model default | The current connection enum: connecting, connected, error, or disconnected. |
| errorMessage | undefined when the model error string is empty | The error string only when present. |
| roots | undefined while status is null | [] when a fetched status contains no roots; otherwise copied root records. |
| model | undefined while status is null or when fetched status has no model | A copied model status object; optional download is omitted when absent. |
| modelReady | undefined while no status has been fetched | false for a fetched incomplete/no-ready model, true only per isModelReady(). |
| reindexProgress | undefined while no status has been fetched | A copied map, {} when the connected status has no active progress. |
| rootConfigs | undefined while no status has been fetched | A copied map of configurations already loaded by the model; {} if that map is empty. |
| refreshing | false from the model default | The model’s current refresh flag. |

The facade must copy arrays, records, and nested records so callers cannot mutate model state. It must not expose status: null publicly and must not return optional object fields with undefined values.

#### Root facade

| Getter | No root configured | Service not running / no search run yet |
| --- | --- | --- |
| rootFolder | undefined for the model’s empty string | A supplied root folder remains available even if resolution cannot reach Mneme. |
| rootName | undefined for the model’s empty name | undefined until resolution succeeds; error reports the connection/registration failure. |
| resolving | false | false after the no-client path; true only during an active resolution. |
| error | undefined | Mneme is not connected. for the explicit no-client resolution path, or the model’s other error. |
| query | empty string | The current query string. |
| mode | hybrid | The current validated mode. |
| filterTags, filterExcludeTags | [] | Current copied arrays; empty means no filter. |
| dateFrom, dateTo | undefined for the model’s empty strings | A non-empty ISO/date string; empty remains undefined. |
| tagVocab | undefined until a root/service-backed vocabulary load is meaningful | [] after a successful load with no tags; otherwise copied tags. |
| selectedDocumentHref | undefined | undefined until the tree selects a document; otherwise the model’s selected mneme:// href. |
| hasSearched | false | false before any search; true after runSearch() attempts one. |
| searching | false | Current search activity. |
| results | undefined before a search has run | [] after a completed no-hit search or failed/no-client attempt; otherwise copied hits. |
| searchNote, searchError | undefined | Only the present model message is returned; absent keys are omitted from snapshots. |

This distinguishes “no search yet” (results: undefined, hasSearched: false) from “search ran and found nothing” (results: [], hasSearched: true). runSearch() currently returns early for an empty query at MnemeRootEditorModel.ts:340-344; the facade should document that no-search behavior rather than manufacture an empty search result.

### mneme-tree secondary-view decision

MnemeRootEditorModel.ts:117-126,148-155 explicitly identifies mneme-tree as the file-tree secondary view and attaches it through secondaryView. MnemeTreeSecondaryView.ts:25-60,215-246 owns the panel root, close action, main-page handoff, selection update, and document-opening interaction.

Therefore mneme-tree belongs to the existing page.panels node, not either editor facade. src/renderer/scripting/ai-vision/page-panels.ts:292-325 projects registered secondary views into page.panels.items, and its exact child lookup is page.panels["mneme-tree"] at :320-322. The generic panel descriptor already handles this id (:138-176) and does not need a Mneme-specific alias or document projection. src/renderer/api/types/page-panels.d.ts:15-62 has generic panel items/nodes and no need for a new named property.

The new facades must not duplicate the tree’s document operations or tree state. The panel remains the place to discover the secondary view and its existing controls; document reading/writing/deletion remains the Mneme MCP boundary. This task does not change page-panels.ts, page-panels.d.ts, or MnemeTreeSecondaryView.ts.

## Implementation Plan

1. **Add canonical public Mneme editor types.**

   Add src/renderer/api/types/mneme-config-editor.d.ts with readonly copied root/model/progress/config shapes and IMnemeConfigEditor. Add src/renderer/api/types/mneme-root-editor.d.ts with the search mode/hit shapes and IMnemeRootEditor. Keep the public types limited to configuration/status, search/filter state, selected href, and the approved actions. Do not include the Mneme client, transport config/token, tree provider, filesystem handles, or document CRUD.

   The planned configuration members are:

       readonly id: "mneme-config";
       readonly name: string;
       readonly running: boolean;
       readonly url?: string;
       readonly connectionStatus: MnemeConnectionStatus;
       readonly errorMessage?: string;
       readonly roots?: readonly IMnemeRootStatus[];
       readonly model?: IMnemeModelStatus;
       readonly modelReady?: boolean;
       readonly reindexProgress?: Readonly<Record<string, IMnemeReindexProgress>>;
       readonly rootConfigs?: Readonly<Record<string, IMnemeRootConfig>>;
       readonly refreshing: boolean;
       refresh(): Promise<void>;
       restart(): Promise<void>;
       removeRoot(root: string): Promise<void>;
       reindex(root?: string): Promise<void>;
       getRootConfig(root: string): Promise<void>;
       setRootConfig(root: string, include: string[], ignore: string[]): Promise<void>;
       updateModel(): Promise<void>;

   openLog, openInMcpInspector, openRoot, showRootInExplorer, and addRoot remain element/user-workflow concerns. If a navigation method is retained during implementation for parity with an existing facade convention, it must be explicitly cautioned and must not expand the document surface.

   The planned root members are:

       readonly id: "mneme-root";
       readonly name: string;
       readonly rootFolder?: string;
       readonly rootName?: string;
       readonly resolving: boolean;
       readonly error?: string;
       readonly query: string;
       readonly mode: MnemeSearchMode;
       readonly filterTags: readonly string[];
       readonly filterExcludeTags: readonly string[];
       readonly dateFrom?: string;
       readonly dateTo?: string;
       readonly tagVocab?: readonly string[];
       readonly selectedDocumentHref?: string;
       readonly hasSearched: boolean;
       readonly searching: boolean;
       readonly results?: readonly IMnemeSearchHit[];
       readonly searchNote?: string;
       readonly searchError?: string;
       setQuery(query: string): void;
       setMode(mode: MnemeSearchMode): void;
       setFilterTags(tags: string[]): void;
       setExcludeTags(tags: string[]): void;
       setDateFrom(date: string): void;
       setDateTo(date: string): void;
       clearFilters(): void;
       runSearch(): Promise<void>;

   selectedDocumentHref is read-only facade state. Selection remains owned by the tree panel, so there is no facade selectDocument() method. If the public naming is instead kept as selectedHref, document that it is the selected document href and preserve the model’s canonical mneme:// value.

2. **Implement MnemeConfigEditorFacade.**

   Add src/renderer/scripting/api-wrapper/MnemeConfigEditorFacade.ts following ArchiveEditorFacade.ts:8-71:

   - implement IAiVisible and IMnemeConfigEditor;
   - project every getter from MnemeConfigEditorModel.state (the model is the only state source);
   - map empty URL/error strings to undefined, status === null to absent roots/model/progress/configs, and preserve genuine empty arrays/maps;
   - return fresh copies of root/model/progress/config records, with conditional spreads for optional nested fields such as model download;
   - delegate refresh, restart, removeRoot, reindex, getRootConfig, setRootConfig, and updateModel to the existing model methods;
   - add caution metadata to restart, remove-root, reindex, root-config update, and model-update members. In particular: removal deletes the registered root’s derived .mneme index after the existing confirmation (MnemeConfigEditorModel.ts:306-322; mneme/README.md:68-70), reindex is expensive, root-config update writes include/ignore state and triggers indexing (:403-424), and model update downloads/writes local model cache (ModelPanel.ts:86-114; mneme/README.md:77-105);
   - keep the add-root folder/name dialog, settings, log, Inspector, and Explorer workflows out of callable facade methods where they require user/native UI; expose their existing names only as element locations;
   - use pageScopeSelector, activatePageAndWaitForLayout, and highlightOptions: { all: true } for elements;
   - make $help state the configuration/browsing boundary, absence contract, secret omission, action cautions, and Mneme MCP document boundary.

3. **Implement MnemeRootEditorFacade.**

   Add src/renderer/scripting/api-wrapper/MnemeRootEditorFacade.ts with the same descriptor/element pattern:

   - project rootFolder, root resolution, query/mode, filters, dates, selection, tag vocabulary, search flags, messages, and results from MnemeRootEditorModel.state and not the DOM;
   - map empty root/date/message values to undefined, preserve [] for filter arrays, vocabulary after a real empty vocabulary load, and completed no-hit/error result arrays;
   - return copied hit records and copied tag arrays; do not return rendered Markdown, treeProvider, tree nodes, document contents, or document mutation operations;
   - delegate filter/query/mode setters and runSearch() to existing model methods;
   - use only the nine stable main-editor/filter element names listed above, with page scope and highlightOptions: { all: true };
   - make $help state that results is absent before a search but [] after an actual empty/failed attempt, that selected href comes from model/tree state, and that documents remain an Mneme MCP responsibility.

   Add runtime validation to MnemeRootEditorModel.setMode() at src/renderer/editors/mneme-root/MnemeRootEditorModel.ts:285 (or a shared helper used by the facade) so a guessed mode outside text | vector | hybrid throws a clear error instead of silently storing an invalid value. The public TypeScript union alone is insufficient because scripting inputs are runtime values.

4. **Register both concrete facades.**

   Update src/renderer/scripting/api-wrapper/PageWrapper.ts:58-96,173-184:

       // before
       type EditorFacade = BoardEditorFacade | GenericEditorFacade | ...;
       const FACADE_FOR_EDITOR = {
           ...,
           "mcp-view": (editor, id, name) => new McpInspectorEditorFacade(editor, id, name),
           "board-view": (editor, id, name) => new BoardEditorFacade(editor, id, name),
       };

       // after (shape; retain all existing entries)
       type EditorFacade = MnemeConfigEditorFacade | MnemeRootEditorFacade | BoardEditorFacade | GenericEditorFacade | ...;
       const FACADE_FOR_EDITOR = {
           ...,
           "mcp-view": (editor, id, name) => new McpInspectorEditorFacade(editor, id, name),
           "mneme-config": (editor, id, name) => new MnemeConfigEditorFacade(editor, id, name),
           "mneme-root": (editor, id, name) => new MnemeRootEditorFacade(editor, id, name),
           "board-view": (editor, id, name) => new BoardEditorFacade(editor, id, name),
       };

   Use the registered editor/model types already used by PageWrapper; do not alter the generic fallback behavior for unrelated editors. Add mcpHint on the two Mneme registry entries at register-editors.ts:173,178 so the agent is told to use the facade for configuration/search state and the Mneme MCP server for documents. The hint must not imply that either facade exposes a credential or document API.

5. **Complete the page collection opener.**

   Update src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts by adding the member descriptor beside showMcpInspectorPage and the delegating method beside its implementation:

       // before
       { name: "showMcpInspectorPage", kind: "method", signature: "showMcpInspectorPage(options?: ...): Promise<void>", ... },

       // after
       { name: "showMcpInspectorPage", kind: "method", signature: "showMcpInspectorPage(options?: ...): Promise<void>", ... },
       { name: "showMnemeConfigPage", kind: "method", signature: "showMnemeConfigPage(): Promise<void>", summary: "Open the Mneme configuration page." },

       // before
       async showMcpInspectorPage(options?: ...): Promise<void> {
           await this.pages.showMcpInspectorPage(options);
       }

       // after
       async showMcpInspectorPage(options?: ...): Promise<void> {
           await this.pages.showMcpInspectorPage(options);
       }

       async showMnemeConfigPage(): Promise<void> {
           await this.pages.showMnemeConfigPage();
       }

   Add the matching showMnemeConfigPage(): Promise<void>; declaration to src/renderer/api/types/pages.d.ts:104-114, next to the existing MCP opener. PagesLifecycleModel.ts:789-791, PagesModel.ts:279, and the editor registration already provide the runtime path; do not duplicate or rename them. Apply this after US-1329’s showToolsHubPage() change, retaining the final order MCP → Mneme config → Tools Hub in both wrapper/type surfaces.

6. **Keep the secondary view in page panels.**

   Do not add mneme-tree to either facade’s elements or public editor type. Verify that page.panels.items includes it and that page.panels["mneme-tree"] is the documented access path. No page-panels.ts, page-panels.d.ts, or secondary-view implementation change is expected.

7. **Verify statically.**

   Check imports/types, the facade union/factory, both canonical declarations, wrapper member/method parity, and registry hints. Inspect every curated name through at least one re-render branch; specifically confirm no selected name is omitted by a later update. Confirm no undefined keys are constructed in nested snapshots. No unit tests or harness are requested for this task.

## Concerns

- **Document API duplication:** The Mneme MCP server already exposes document management/search operations (mneme/README.md:57-75; mneme/assets/wiki-guide.md:70-90). The facades stop at configuration/status and the search result list. They do not expose document bodies, tree-provider methods, document CRUD, or a second filesystem API. $help must say this plainly.
- **Destructive/expensive operations:** removeRoot, reindex, setRootConfig, and updateModel have cautions. Remove-root retains the model’s confirmation. Reindex and model update remain asynchronous and report errors through the existing model path. Restart is cautioned as a service-disrupting operation.
- **Add-root is user-only:** Adding a root requires a native folder picker and an input dialog (MnemeConfigEditorModel.ts:266-304), so it is an element location, not an agent-callable method accepting guessed paths or names. This deliberately means the facade can manage known roots but cannot create one programmatically in this task.
- **Secret exposure:** mneme/src/config.rs:55-66 contains transport.token, but no existing renderer path returns it and no new member may accept or return it. Model/cache directory metadata is not a credential and should be exposed only where needed for status.
- **Absent values with loose null checking:** Do not leak internal null or empty-string sentinels as public nulls. Do not construct object keys whose value is undefined; omit those keys so the resolver does not turn them into null.
- **Element lifetime:** Do not add mneme-search-results; its name is removed when the result view updates to a non-results state (MnemeRootEditorView.ts:219-239). Do not make dynamic repeated root/filter names static facade declarations.
- **Panel ownership:** The tree is a page-scoped secondary panel, not the main root editor surface. Its selection can be reported by selectedDocumentHref, but its controls and open-document action stay under page.panels["mneme-tree"].
- **Task overlap:** US-1329 owns showToolsHubPage() in the same wrapper/type neighborhoods. Preserve both methods and coordinate ordering as described above.
- **Privacy/trust:** No separate Mneme trust bypass or credential-registration path was found in the inspected renderer/API surface. The facade must not invent one; it should preserve the existing shared-connection and Mneme MCP authorization boundary.

## Acceptance Criteria

- doc/tasks/US-1331-mneme-surfaces/README.md is the only file added by this documentation task; no implementation is made and no commit is created.
- The implementation planned here will add concrete mneme-config and mneme-root facades and route both ids through PageWrapper instead of GenericEditorFacade.
- Canonical public types include both ids and describe only the approved model-backed state/actions; generated editor declaration assets remain untouched.
- The configuration facade reports connection/running/URL/error, roots, root configs, index/reindex state, embedding-model state, and refreshing state with the documented undefined versus [] behavior.
- The root facade reports current root/resolution, query/mode, tag/date filters, selected document href, tag vocabulary, search state/messages, and copied result hits from model state rather than DOM state.
- Public snapshots and nested records omit absent optional keys instead of assigning undefined.
- Root mode inputs are runtime-validated against exactly text, vector, and hybrid.
- removeRoot, reindex, root-config writes, model updates, and restart carry explicit caution metadata; add-root remains a user/native-dialog workflow.
- Both facades expose exactly the curated existing element names: 8 for mneme-config and 9 for mneme-root; no names are renamed or added, and structural, repeated, unstable, portalled, overlay, result-row, and secondary-view controls are excluded.
- elements uses the current page scope, activates/waits for layout before highlighting, and highlights all matches.
- $help explicitly states the configuration/browsing boundary, secret omission including transport.token, absent-value semantics, panel ownership, and that Mneme MCP remains the document API.
- pages.showMnemeConfigPage() is present in PageCollectionWrapper and pages.d.ts, delegates to the existing PagesModel member, and coexists with US-1329’s showToolsHubPage().
- mneme-tree remains available through page.panels["mneme-tree"]; no Mneme tree facade alias or duplicate document API is introduced.

## Files Changed

| File | Planned change |
| --- | --- |
| src/renderer/api/types/mneme-config-editor.d.ts | Add canonical Mneme configuration facade types. |
| src/renderer/api/types/mneme-root-editor.d.ts | Add canonical Mneme root/search facade types. |
| src/renderer/scripting/api-wrapper/MnemeConfigEditorFacade.ts | Add model-backed configuration facade, help, cautions, and 8 curated elements. |
| src/renderer/scripting/api-wrapper/MnemeRootEditorFacade.ts | Add model-backed root/search facade, help, and 9 curated elements. |
| src/renderer/scripting/api-wrapper/PageWrapper.ts | Add both facade imports, union members, and editor factories. |
| src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts | Add showMnemeConfigPage member metadata and delegation; preserve US-1329’s opener. |
| src/renderer/api/types/page.d.ts | Add mneme-config/mneme-root ids and facade interfaces to the canonical editor contract. |
| src/renderer/api/types/pages.d.ts | Declare showMnemeConfigPage(): Promise<void>. |
| src/renderer/editors/register-editors.ts | Add honest Mneme MCP/facade hints to the two Mneme editor registrations. |
| src/renderer/editors/mneme-root/MnemeRootEditorModel.ts | Runtime-validate search mode values in setMode(). |

Intentionally no changes to: src/renderer/api/pages/PagesLifecycleModel.ts, src/renderer/api/PagesModel.ts, src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts, MnemeConfigView.ts, RootsPanel.ts, ModelPanel.ts, mnemeTypes.ts, src/renderer/editors/mneme-root/MnemeRootEditorView.ts, MnemeTreeSecondaryView.ts, results-to-markdown.ts, src/renderer/api/mneme-connection.ts, src/renderer/api/mneme-status.ts, src/main/mneme-service.ts, src/ipc/api-types.ts, src/renderer/scripting/ai-vision/page-panels.ts, src/renderer/api/types/page-panels.d.ts, assets/editor-types/*.d.ts, src/renderer/content/tree-providers/MnemeTreeProvider.ts, doc/active-work.md, doc/epics/EPIC-088.md, docs/**, tests, and harnesses.
