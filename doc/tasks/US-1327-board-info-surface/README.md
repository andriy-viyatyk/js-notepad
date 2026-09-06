# US-1327 - The Board Info surface

Epic: [EPIC-088 - Boards and tools through call, and the retirement of seven tools](../../epics/EPIC-088.md)

**Status: Planned.** This document specifies the facade and its boundaries. No implementation,
dashboard update, epic update, test harness, or commit is part of this task-document request.

## Goal

Give the board-info editor a typed pages[i].editor facade that reports its model-backed install or
properties mode, the catalog/install/version state visible on that screen, and a deliberately small
page-scoped elements list. Expose only Board-Info-specific actions; existing board lifecycle
operations remain on boards.*, and no path trusts a board or returns a secret value.

## Background

### Editor identity, mode, and host behavior

board-info is a registered editor id at src/renderer/editors/register-editors.ts:181-190. It is
marked hasContentHost: true at :184-186, but it is not a content renderer: the model adopts or
yields a shared text host so Text <-> + <-> installed board can transfer the same file without a
reload (src/renderer/editors/board-info/BoardInfoEditorModel.ts:101-118, :159-170, :197-223).
The model is therefore the only authority for facade state; the view must not be queried.

The model's explicit mode getter is state.boardRoot ? "properties" : "install"
(src/renderer/editors/board-info/BoardInfoEditorModel.ts:127-130). openBoardInfo() passes an
optional catalogId or boardRoot, restores the model, and replaces the page's main editor
(src/renderer/editors/board-info/open-board-info.ts:22-43); openBoardInfoPage() creates a new
page and documents the same install/properties split at :45-60. The view independently chooses
the matching branch from props.boardRoot at
src/renderer/editors/board-info/BoardInfoEditorView.ts:179-185; that is a rendering consequence,
not a facade state source.

Today PageWrapper.editor has a concrete factory for the landed board facade and falls back to
GenericEditorFacade for an unregistered id (src/renderer/scripting/api-wrapper/PageWrapper.ts:58-96,
:173-184). The new facade must add the literal board-info factory beside board-view; no dynamic id
predicate is needed for this editor.

### Model state and the screen's actions

BoardInfoEditorState contains the durable mode inputs and the transient/derived screen state:
catalogId, boardRoot, filePath, catalog matches, installDir, per-catalog installUi, properties
props, version history, and versionsState
(src/renderer/editors/board-info/BoardInfoEditorModel.ts:66-89). Defaults contain a real empty
matches array and an empty installUi map, with no selected board root
(src/renderer/editors/board-info/BoardInfoEditorModel.ts:91-99).

Install mode reconciles the install registry and computes compatible catalog matches from the current
file name at BoardInfoEditorModel.ts:257-267, :423-444; a direct catalogId is appended when the
catalog contains it at :433-443. The view renders the location, one tile per match, and the
download lifecycle at BoardInfoEditorView.ts:187-213, :215-310:

- idle means the catalog entry is available and the screen offers Download (:239-248).
- An active download exposes progress and Cancel (:249-269); the model owns the generated install
  id, progress subscription, and cancellation call at BoardInfoEditorModel.ts:492-529.
- A failed download offers Retry (BoardInfoEditorView.ts:270-281).
- A downloaded-but-unregistered board shows Register board and Delete download (:282-307). The
  model's register() is the trust-granting path at BoardInfoEditorModel.ts:531-554;
  deleteDownload() removes the untrusted folder and registry record at :556-576.
- A trusted/registered match is displayed as Installed (BoardInfoEditorView.ts:497-509).

Properties mode loads manifest, install-registry, and trust data into state.props, and starts
version loading only for catalog installs
(src/renderer/editors/board-info/BoardInfoEditorModel.ts:272-318). The view displays metadata, live
trust text, Open board, and either Uninstall or Unregister at
src/renderer/editors/board-info/BoardInfoEditorView.ts:312-394. Version rows expose Update or
Install for a lower version (rollback) and use the same model method for both at :396-475.
installBoardVersion() delegates to the existing safe swap and reloads properties on success
(BoardInfoEditorModel.ts:335-357).

### Action partition: facade versus boards.*

The existing board namespace already covers the lifecycle actions that look like buttons on this
screen. Its descriptor advertises them at src/renderer/scripting/ai-vision/namespaces/boards.ts:9-24,
and the implementation is registered in src/renderer/api/boards.ts:229-344, :348-385, :387-517.

| Screen action | Existing path to use | Board-Info facade decision | Reason and verified source |
| --- | --- | --- | --- |
| Download | boards.downloadPublished(id, { dir?, version? }) | Do not add download() | Existing API downloads/verifies/extracts/records without trust (src/renderer/api/types/boards.d.ts:207-221; src/renderer/api/board-install.ts:37-88). |
| Register | boards.registerBoard(root) | Do not add register() | Existing API is the user-dialog trust path (src/renderer/api/types/boards.d.ts:144-157; src/renderer/api/boards.ts:248-262). |
| Update | boards.installPublished(id, { version }) after discovering the target | Do not add update() | Existing installed-version swap delegates to the shared update path (src/renderer/api/types/boards.d.ts:223-243; src/renderer/api/boards.ts:431-462). |
| Rollback | boards.installPublished(id, { version }) | Do not add rollback() | Rollback and forward version changes share runBoardVersionInstall() and preserve existing trust (src/renderer/api/board-updates.ts:115-142; src/renderer/api/board-install.ts:107-115). |
| Uninstall | boards.uninstallBoard(id) | Do not add uninstall() | It shares the delete confirmation, idle guard, folder removal, untrust, unpin, and registry removal as the model action (src/renderer/api/types/boards.d.ts:245-254; src/renderer/api/board-install.ts:118-153). |
| Unregister | boards.unregisterBoard(root) | Do not add unregister() | It is the existing privilege-reducing lifecycle operation (src/renderer/api/types/boards.d.ts:159-165; src/renderer/api/boards.ts:265-270). |
| Cancel | No equivalent board-specific boards.* member | Add cancelDownload(catalogId) | The model owns the board archive install id and calls api.cancelBoardDownload() (BoardInfoEditorModel.ts:150-153, :492-529). Generic app.downloads.cancelDownload() is a different service calling api.cancelDownload() (src/renderer/api/downloads.ts:72-92). |

Two additional visible actions are genuinely screen-local: Browse changes the install directory by
opening the OS folder picker (BoardInfoEditorModel.ts:448-454; src/renderer/api/fs.ts:485-494),
so the facade may expose changeInstallDir(): Promise<void>; and Cancel needs the editor's private
in-flight install id, so the facade may expose cancelDownload(catalogId: string): void. Both must
delegate to the existing model handlers. deleteDownload() is not added: for a catalog registry
entry it is the same destructive lifecycle capability already exposed by boards.uninstallBoard()
(src/renderer/api/boards.ts:506-517), even though the page labels the button differently.

The facade's matches projection must give an agent the catalog id, version, and install status it
needs to select the existing boards.* path. It must not accept internal PublishedBoardInfo or
PublishedBoardVersion objects as action arguments, and it must not call the model's duplicate
download(), register(), installBoardVersion(), uninstall(), unregister(), or openBoard() methods.
boards.openBoard(root) is also the existing path for the visible Open board operation
(src/renderer/api/types/boards.d.ts:131-142); the facade does not add an openBoard() alias.

### Public state shape

Create src/renderer/api/types/board-info-editor.d.ts with a copied, MCP-safe projection rather
than exposing the model's PublishedBoardInfo, archive objects, or live state references. The
planned public shape is:

~~~ts
export type BoardInfoMode = "install" | "properties";
export type BoardInfoInstallState =
    | "available" | "downloading" | "error" | "downloaded" | "registered";

export interface IBoardInfoCatalogMatch {
    readonly id: string;
    readonly version: string;
    readonly name: string;
    readonly description?: string;
    readonly fileMasks?: readonly string[];
    readonly folderMasks?: readonly string[];
    readonly editorName?: string;
    readonly editorKind?: "simple" | "content-host";
    readonly standalone?: boolean;
    readonly minAppVersion?: string;
    readonly screenshotUrl?: string;
    readonly size: number;
    readonly installState: BoardInfoInstallState;
    readonly root?: string;
    readonly received?: number;
    readonly total?: number;
    readonly error?: string;
}

export interface IBoardInfoProperties {
    readonly name: string;
    readonly description?: string;
    readonly author?: string;
    readonly repository?: string;
    readonly manifestVersion?: string;
    readonly fileMasks?: readonly string[];
    readonly folderMasks?: readonly string[];
    readonly editorName?: string;
    readonly editorKind?: "simple" | "content-host";
    readonly root: string;
    readonly trusted: boolean;
    readonly isCatalogInstall: boolean;
    readonly catalogId?: string;
    readonly installedVersion?: string;
    readonly missing?: boolean;
}

export interface IBoardInfoVersion {
    readonly version: string;
    readonly date?: string;
    readonly notes?: string;
    readonly minAppVersion?: string;
    readonly compatible: boolean;
    readonly installed: boolean;
}

export interface IBoardInfoEditor {
    readonly id: "board-info";
    readonly name: string;
    readonly mode: BoardInfoMode;
    readonly matches: readonly IBoardInfoCatalogMatch[];
    readonly installDir: string | undefined;
    readonly properties: IBoardInfoProperties | undefined;
    readonly versions: readonly IBoardInfoVersion[] | undefined;
    readonly versionsState: "idle" | "loading" | "error" | undefined;
    changeInstallDir(): Promise<void>;
    cancelDownload(catalogId: string): void;
}
~~~

The facade copies optional fields with conditional object spreads and copies all arrays. It omits
the catalog archive URL and SHA-256 because the existing boards.* API is the action surface and the
screen only needs the displayed archive size. It also computes trusted from the live boardTrust
registry rather than trusting a stale state.props.trusted snapshot; the view follows the same live
registry check at BoardInfoEditorView.ts:334-338.

### Content-host and secret audits

#### Board Info content

PageModel.mainEditor unwraps any editor whose contentHost has type === "textFile" and returns that
host (src/renderer/api/pages/PageModel.ts:19-29, :165-173). BoardInfoEditorModel.contentHost
returns its adopted text host or null (src/renderer/editors/board-info/BoardInfoEditorModel.ts:172-175).
PageCollectionWrapper passes page.mainEditor into PageWrapper for each page
(src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:119-129), and PageWrapper.content
returns this.model.state.get().content only when its wrapped model is a TextFileModel, otherwise it
returns the empty string (src/renderer/scripting/api-wrapper/PageWrapper.ts:153-165).

Therefore:

- A Board Info page reached from a file/content-host board already returns the held file's text at
  pages[i].content; it is not Board Info metadata and it is not the board's installed files.
- A standalone Board Info page with no adopted host returns "" at pages[i].content.
- This facade must expose neither content, contentHost, nor a second file-text getter. The existing
  pages[i].content path is the path beside the facade that already returns the value. The content
  setter likewise only writes when the wrapper is a TextFileModel (PageWrapper.ts:163-165); the
  facade adds no secret-bearing write path.

#### Board environment variables are a separate audit

Board vars are not inferred from the content-host result. The store schema explicitly contains
connection strings, API keys, and passwords (src/renderer/api/board-vars/types.ts:4-17). Its
get() returns a stored string value or undefined and list() returns names only
(src/renderer/api/board-vars/BoardEnvStore.ts:112-123). The existing unrestricted agent path is
app.boardVars (src/renderer/scripting/api-wrapper/AppWrapper.ts:123-129), whose get() can return a
secret and whose list() returns names (src/renderer/api/board-vars/admin-api.ts:36-59;
src/renderer/api/types/board-vars.d.ts:32-49). Inside a board, the separate
persephone.var.get bridge resolves the caller's namespace and returns the value through the iframe
message (src/renderer/editors/board/BoardWebview.ts:363-384;
src/renderer/api/board-vars/board-vars-bridge.ts:27-38, :60-75).

Thus app.boardVars.get(namespace, name, env) (and the board-side bridge for a board) is already the
path beside this facade that returns a board-variable value. The Board Info facade adds no boardVars
node, environment-value getter, environment-value setter, .env projection, or password argument.
If it ever reports that a board has environment variables, it may report names only through the
existing boardVars.list() path; it must never expose the values stored by getAll()
(BoardEnvStore.ts:125-128).

### Absent-value audit

strictNullChecks is disabled, and an explicit undefined property crosses the MCP boundary as null;
the epic requires omission instead. The facade must construct fresh snapshots and omit every
optional key whose source is unavailable. The following table is the review contract:

| Getter | No board selected / install mode | No catalog entry | No install record | Genuinely empty value |
| --- | --- | --- | --- | --- |
| id, name, mode | Identity remains; mode is install from model state | Same | Same | N/A |
| matches | [] when no compatible catalog match | [] when an explicit id is absent from the loaded catalog | Each matching catalog item is available unless it has download UI state | [] is the real no-match collection |
| installDir | A loaded default/selected path; undefined before the model has established one | Same | Same | No sentinel empty string |
| properties | undefined | N/A | A properties object is present for a real board and has isCatalogInstall: false; catalogId is omitted; installedVersion may fall back to manifest version | N/A |
| properties for a deleted root | N/A | N/A | Object is present with missing: true, trusted: false, isCatalogInstall: false; optional catalog/version fields are omitted | N/A |
| versions | undefined | undefined for no catalog install/history | undefined for a non-catalog board | [] only after a successful catalog history fetch with no published versions |
| versionsState | undefined in install mode | undefined when no catalog install was selected | idle after properties loading explicitly clears versions for a local board | idle with versions: [] is distinct from error |
| matches[*].root | Omitted for available, downloading, and error | Same | Omitted when no registry entry; present only for downloaded/registered | N/A |
| matches[*].received, total, error | Omitted unless supplied by the corresponding installUi record | Same | Same | No 0, empty string, or null substitutes for absence |
| properties optional metadata | Omitted when the manifest/association has no value | N/A | Omitted field-by-field; never copied from an undefined-valued internal object | Empty arrays are copied only when genuinely present |

The implementation must not use || "", || false, || 0, null, or object literals that set optional
keys to undefined. It must preserve real false values (trusted, isCatalogInstall, compatible,
installed) and real empty arrays (matches, successful empty versions, and metadata arrays when the
source genuinely contains one).

### Curated elements and data-name lifetime

The 15 name: prop occurrences in BoardInfoEditorView.ts are an upper-bound census, not the facade
list: root and toolbar labels are structural, progress/loading/mask names are not useful agent
controls, and the conditional Uninstall/Unregister expression represents two possible names from
one prop (BoardInfoEditorView.ts:77-122, :187-213, :239-307, :312-394, :396-495).
BoardScreenshotView has no name: prop; it only sets data-type="board-screenshot"
(src/renderer/editors/board-info/BoardScreenshotView.ts:37-46, :66-73).

The curated list is 11 existing control names. It keeps the main install/properties actions and the
repeated version/download controls, while leaving structural or low-value status hooks out:

| Element name / data-name | One-line purpose | Source and lifetime decision |
| --- | --- | --- |
| board-info-browse | Locate the install-location folder picker. | Existing ButtonView name at BoardInfoEditorView.ts:194-200; preserve. |
| board-info-download | Locate all matching catalog Download controls. | Existing repeated name at :240-248; preserve and highlight all matches. |
| board-info-cancel | Locate the active archive download's Cancel control. | Existing name at :261-267; preserve. |
| board-info-retry | Locate a failed catalog download's Retry control. | Existing name at :270-279; preserve. |
| board-info-register | Locate the downloaded board Register board control. | Existing name at :290-296; preserve; trust remains the user action. |
| board-info-delete | Locate Delete download for an unregistered archive. | Existing name at :297-302; preserve; the facade does not duplicate its boards.* action. |
| board-info-open | Locate Open board in properties mode. | Existing name at :375-381; preserve; use boards.openBoard(root) for the API action. |
| board-info-uninstall | Locate the catalog-install Uninstall control. | Existing conditional name at :382-391; preserve; action is boards.uninstallBoard(id). |
| board-info-unregister | Locate the local-board Unregister control. | The alternate value of the same existing conditional prop at :382-391; preserve; action is boards.unregisterBoard(root). |
| board-info-versions-retry | Locate Retry when published version history failed. | Existing name at :404-415; preserve; version reads remain boards.getPublishedVersions(id). |
| board-info-version-install | Locate repeated Update/Install version controls for update or rollback. | Existing repeated name at :464-472; preserve and highlight all matches. |

Excluded names are board-info-editor (structural root), the dynamic PageToolbarView label
(BoardInfoEditorView.ts:118-123), board-info-progress, board-info-versions-loading, and
board-info-mask (status/loading/repeated metadata hooks at :249-255, :396-402, :483-494).
BoardScreenshotView contributes no named control. There is no data-name to add and no existing
data-name or data-type may be renamed.

Every selected name is supplied on the ButtonView constructor in the render branch that creates it.
BoardInfoBodyView.sync() releases dynamic children, clears the body, and rebuilds the active branch
on every surface update (BoardInfoEditorView.ts:167-185), so the selected buttons receive their
names again rather than relying on mount-only state. The UIKit still deletes a name whenever a
later update omits it (src/renderer/uikit/Button/ButtonView.ts:74-102); implementation review must
confirm that no selected button is updated with a partial props object before it is released.
Repeated Download and version controls require highlightOptions: { all: true }, and every selector
must be resolved below pageScopeSelector(pageId) after activatePageAndWaitForLayout(pageId), as the
existing element helper supports (src/renderer/scripting/ai-vision/elements.ts:99-145;
src/renderer/scripting/ai-vision/page-elements.ts:5-8, :36-40).

The folder picker is an OS dialog, and confirmations/trust dialogs are global dialog surfaces, not
descendants of the Board Info page. Dialogs are maintained as a global stack
(src/renderer/ui/dialogs/DialogsView.ts:10-29, :132-140) and the shared overlay layer is attached
to document.body (src/renderer/uikit/shared/overlayLayer.ts:1-35). None belongs in this page-scoped
elements list.

### Dialogs and help contract

$help must say that all dialog answers are made through the live dialogs[0] adapter; the node index
resolves the current stack entry at src/renderer/scripting/ai-vision/dialogs/index.ts:80-95. It
must name these Board Info flows:

- Trust this board?, implemented by src/renderer/ui/dialogs/TrustBoardDialog.ts:7-20 and answered
  by src/renderer/scripting/ai-vision/dialogs/trust-board.ts:15-33.
- The environment-variable namespace collision dialog, raised by
  confirmNamespaceNotColliding() at src/renderer/api/board-vars/namespace.ts:51-63, with its
  NamespaceCollisionDialog adapter at src/renderer/scripting/ai-vision/dialogs/namespace-collision.ts:16-35.
- The generic confirmation dialogs titled Folder already exists (BoardInfoEditorModel.ts:461-479),
  Remove board (:375-388), Delete board (src/renderer/api/board-install.ts:125-140), and Board is
  open (src/renderer/api/board-updates.ts:95-105). They use the generic confirmation adapter
  (src/renderer/scripting/ai-vision/dialogs/confirmation.ts:14-28).

The OS folder picker from fs.showFolderDialog() is not a renderer dialogs[0] entry
(src/renderer/api/fs.ts:485-494). Progress displays are also not trust decisions. Help must state
that no facade method accepts a trust boolean, calls boardTrust.trust(), or bypasses the trust and
namespace-collision dialogs. The facade reports trusted/registered state only; the user click
remains the grant.

## Implementation Plan

### 1. Add the canonical Board Info types and facade

Create src/renderer/api/types/board-info-editor.d.ts with the public declarations above. Keep
optional fields genuinely optional and document that matches, properties, versions, and
versionsState have the audited absent/empty meanings. Add IBoardInfoEditor to the canonical
IEditorFacade union and import it in src/renderer/api/types/page.d.ts:1-47.

Create src/renderer/scripting/api-wrapper/BoardInfoEditorFacade.ts, following the descriptor
construction used by ArchiveEditorFacade (src/renderer/scripting/api-wrapper/ArchiveEditorFacade.ts:8-71)
and the board facade's page scoping/highlight setup
(src/renderer/scripting/api-wrapper/BoardEditorFacade.ts:15-89). The facade must:

- Hold the BoardInfoEditorModel instance passed by PageWrapper; never create a model and never
  inspect BoardInfoEditorView, text, or DOM to answer state.
- Report mode by forwarding the model getter at BoardInfoEditorModel.ts:127-130.
- Project fresh matches records from state.matches, boardInstallRegistry.listInstalled(),
  boardTrust.isTrusted(), and state.installUi, matching the view's status precedence at
  BoardInfoEditorView.ts:497-509. Copy visible catalog metadata and map archive.size to size; omit
  the archive URL/hash and omit unavailable optional keys.
- Project properties from state.props, but recalculate trusted from boardTrust and build the object
  field-by-field so internal manifest?.field values are omitted rather than serialized as undefined
  (BoardInfoEditorModel.ts:296-310). Return undefined when state.props is absent; retain missing:
  true for a missing root.
- Project versions from state.versions into copied records with compatible from
  publishedBoards.isCompatible() and installed by comparing version with the model's installed
  version. Preserve [] for a successful empty history and undefined for not-loaded or failed
  history.
- Expose changeInstallDir() and cancelDownload(catalogId). Both delegate to the model. The cancel
  wrapper must validate the exact id against current matches and throw a correction-friendly error
  listing valid ids instead of silently accepting a guessed id; a valid id with no active download
  may remain idempotent because the model's existing handler is idempotent.
- Add only the 11 element declarations above. Use pageScopeSelector(pageId),
  activatePageAndWaitForLayout(pageId), and highlightOptions: { all: true }.
- Include elements, provide, help, and a summary with id, name, mode, match count, install
  directory, properties presence, and version state. The summary must omit optional values rather
  than placing undefined values in its object.

Before:

~~~ts
// PageWrapper.ts: the board-info id is not in the factory map.
const factory = editor
    ? FACADE_FOR_EDITOR[id]
        ?? (isBoardEditorId(id) ? BOARD_FACADE_FACTORY : undefined)
    : undefined;
return factory ? factory(editor, id, name) : new GenericEditorFacade(id, name);
~~~

After:

~~~ts
const factory = editor
    ? FACADE_FOR_EDITOR[id]
        ?? (isBoardEditorId(id) ? BOARD_FACADE_FACTORY : undefined)
    : undefined;
return factory ? factory(editor, id, name) : new GenericEditorFacade(id, name);

// FACADE_FOR_EDITOR gains:
"board-info": (editor, id, name) =>
    new BoardInfoEditorFacade(editor as BoardInfoEditorModel, id as "board-info", name),
~~~

The implementation must not add a restricted() result for Board Info content: the facade does not
render or expose the adopted file text, and pages[i].content remains the existing host path.

### 2. Register the facade and canonical union

Update src/renderer/scripting/api-wrapper/PageWrapper.ts:1-96 to import the model type and new
facade, add BoardInfoEditorFacade to EditorFacade, and add the board-info factory. Keep the
existing dynamic board fallback and every other factory unchanged.

Update src/renderer/api/types/page.d.ts:1-47 to include IBoardInfoEditor and the literal board-info
in IFacadeEditorId. The generated assets/editor-types/*.d.ts output is refreshed by the normal
generator and is never hand-edited, as required by the facade registration pattern
(doc/tasks/US-1325-board-page-surface/README.md, Facade and descriptor patterns).

Before:

~~~ts
export type IFacadeEditorId = /* existing ids, including board-view and board-editor:<root> */;
export type IEditorFacade = /* existing facade union */ | IBoardEditor;
~~~

After:

~~~ts
export type IFacadeEditorId = /* existing ids */ | "board-info";
export type IEditorFacade = /* existing facade union */ | IBoardEditor | IBoardInfoEditor;
~~~

Do not modify register-editors.ts: the editor is already registered as board-info with
hasContentHost: true at :181-190.

### 3. Keep lifecycle actions on the existing board namespace

The facade help and member summaries must point agents to the exact existing paths instead of
creating aliases:

- boards.downloadPublished(match.id, { dir: installDir }) for download.
- boards.registerBoard(properties.root) for registration, with the user trust dialog intact.
- boards.getPublishedVersions(properties.catalogId) for a read-only version refresh.
- boards.checkPublishedUpdates() to discover catalog-latest updates, then
  boards.installPublished(properties.catalogId, { version }) for update or rollback.
- boards.uninstallBoard(properties.catalogId) for catalog uninstall/delete.
- boards.unregisterBoard(properties.root) for local unregister.
- boards.openBoard(properties.root) for open.

The help must distinguish board-info-version-install's visible Update/Install buttons from the
facade API: the elements locate the user control, but no second update, rollback, or
installBoardVersion method is advertised. changeInstallDir and cancelDownload are the only action
members because they have no equivalent Board namespace member and must move the existing model
handlers rather than reimplement them.

### 4. Write the trust, secret, content, and dialog help

The facade help must state that:

- mode is model-backed and is install until state.boardRoot exists, then properties.
- Download is inert/untrusted, registration is the only trust-granting step, and trust remains a
  user click through Trust this board?; this facade never accepts or returns a trust decision.
- The namespace-collision confirmation is a separate safety prompt after the trust prompt.
- All renderer dialog responses are answered through dialogs[0], with the named adapters above; the
  install-location folder picker is native and is not in dialogs[0].
- pages[i].content already returns the adopted file host's text when there is one and "" when there
  is not; the facade exposes no content or host value.
- Board vars are a separate credential surface: app.boardVars.get() and the board-side
  persephone.var.get path already return values, list() returns names, and this facade adds neither
  values nor a setter/password path.
- Existing boards.* members are the lifecycle action paths; this facade only owns the folder picker
  and board-download cancellation.

### 5. Verify source-level contracts without tests or harness

Before implementation is considered complete, inspect the changed source for the exact mode/state
projection, fresh copies, optional-key omission, no DOM reads, action delegation, unknown-id
validation, 11-element inventory, page scope, { all: true }, generated-type hygiene, and the
dialog/help text. Confirm that no selected data-name is later removed by a partial UIKit update; the
body rebuild behavior is not a reason to omit the lifetime check.

No unit tests or harness are requested. Live call acceptance and any boards-surface QA file remain
the later EPIC-088 acceptance work in US-1332; this task does not retire or alter any legacy MCP
tool.

## Concerns

- **Mode must remain model-only.** BoardInfoEditorView has the same two branches, but the facade
  must read BoardInfoEditorModel.mode/state.boardRoot, never the view, text, or data-type.
- **The facade must not recreate boards.*.** Download, register, update, rollback, uninstall,
  unregister, and open already have public paths. Duplicate methods would make two action contracts
  drift and would obscure the existing trust/idle/confirmation behavior.
- **Cancellation is a real exception to the de-duplication rule.** The board installer has a private
  model-generated install id and api.cancelBoardDownload() path, while the global downloads node
  cancels a different id type. Validate catalog ids at the facade boundary and delegate the actual
  cancel operation to the model.
- **Trust is never automated.** Neither facade construction nor any state getter may call
  boardTrust.trust(). The help must direct agents to boards.registerBoard(root) and the existing
  trust/namespace dialogs; a user click remains mandatory.
- **Content-host pages already have a content path.** pages[i].content may return the adopted file
  text, including potentially sensitive text. The facade must not duplicate or summarize it. A
  standalone page's "" is a genuine no-host result, not missing metadata.
- **Board vars are independent.** app.boardVars.get() and the board-side bridge can return stored
  credential values, but that fact does not authorize a Board Info getter. Only names are suitable
  for any optional diagnostic projection.
- **Absent values need manual review.** With strictNullChecks off, all optional properties must be
  omitted when absent. Do not use undefined object keys, falsy stand-ins, or null; preserve real []
  and false values.
- **Repeated selectors and updates.** Download and version controls repeat, so highlighting must
  pass { all: true }. UIKit deletes data-name when an update omits it; verify each selected
  control's full props path and the body rebuild path.
- **Global overlays are not page elements.** Trust, namespace, confirmation, and native folder
  dialogs are answered through their existing paths and cannot be honestly resolved by a selector
  scoped to the Board Info page.
- **Generated declarations and scope.** Only source .d.ts files are edited. Do not hand-edit
  assets/editor-types/*.d.ts, the dashboard, the epic, user guides, or MCP tool declarations.

## Acceptance Criteria

- [ ] pages[i].editor returns BoardInfoEditorFacade for the literal board-info editor and retains
      the existing id/name identity.
- [ ] IBoardInfoEditor and its state/result types are added to the canonical page facade union;
      generated assets/editor-types/*.d.ts files are not hand-edited.
- [ ] mode is exactly install | properties and is derived from BoardInfoEditorModel.mode /
      state.boardRoot, never from the view or DOM.
- [ ] The facade exposes copied matches, installDir, properties, versions, and versionsState,
      including install/download/trust status and catalog version state without returning archive
      objects or live model references.
- [ ] changeInstallDir() and cancelDownload(catalogId) delegate to the existing model handlers;
      cancel validates unknown ids instead of silently succeeding.
- [ ] No facade download, register, update, rollback, installBoardVersion, uninstall, unregister,
      deleteDownload, or openBoard alias is added. Help points to the exact boards.* paths.
- [ ] No path trusts or registers a board without the existing user trust click. Help names Trust
      this board?, the namespace-collision dialog, and the generic folder/delete/open confirmations,
      and directs every renderer answer to dialogs[0].
- [ ] The content-host audit is documented and preserved: pages[i].content returns adopted host
      text or "" without a host, and the facade adds no content/host getter or setter.
- [ ] The board-vars audit is separate and preserved: existing app.boardVars.get() and
      persephone.var.get remain the value-returning paths, list() remains name-only, and the facade
      adds no secret value or password path.
- [ ] Every getter follows the absent-value table: unavailable values are undefined by omission,
      never null, false, 0, or ""; genuine empty arrays and booleans remain present.
- [ ] Exactly the 11 curated existing data-name values are advertised, with one-line purposes; no
      existing name/type is renamed and no new name is required. Repeated controls use { all: true },
      page-scoped selectors, and every selected name survives re-render.
- [ ] Structural roots, status/loading/mask hooks, screenshots, native dialogs, and global overlay
      content are excluded from the page-scoped list.
- [ ] No unit tests or harness are added, no dashboard or epic file is touched, no legacy MCP tool
      is changed or retired, and no commit is created by this task.

## Files Changed

| File | Planned change |
| --- | --- |
| doc/tasks/US-1327-board-info-surface/README.md | This verified implementation plan, action partition, content/secret audits, absent-value contract, dialog help contract, and element curation. |
| src/renderer/scripting/api-wrapper/BoardInfoEditorFacade.ts | New model-backed Board Info facade, copied state projections, two unique action delegates, help, summary, and 11 page-scoped elements. |
| src/renderer/api/types/board-info-editor.d.ts | Canonical Board Info mode, catalog-match, properties, version, install-state, and facade declarations. |
| src/renderer/scripting/api-wrapper/PageWrapper.ts | Register the board-info facade factory and add it to the implementation union. |
| src/renderer/api/types/page.d.ts | Add board-info and IBoardInfoEditor to the canonical facade unions. |

Files intentionally needing **no changes**:

- src/renderer/editors/board-info/BoardInfoEditorModel.ts, BoardInfoEditorView.ts,
  BoardScreenshotView.ts, board-info-id.ts, and open-board-info.ts - existing model state, mode,
  handlers, view branches, screenshot behavior, editor id, and openers are the sources the facade
  projects; no model or view implementation change is required.
- src/renderer/editors/register-editors.ts - board-info is already registered with hasContentHost:
  true at :181-190.
- src/renderer/api/boards.ts, src/renderer/scripting/ai-vision/namespaces/boards.ts,
  src/renderer/api/board-install.ts, board-install-registry.ts, published-boards.ts, and
  board-updates.ts - existing lifecycle, catalog, registry, and safe version-swap behavior is
  reused; no duplicate member or altered trust path is added.
- src/renderer/api/board-vars/, src/renderer/api/types/board-vars.d.ts,
  src/renderer/scripting/ai-vision/namespaces/board-vars.ts, and BoardWebview.ts - existing
  separate board-vars value/name paths remain authoritative; no secret projection is added.
- src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts, PageModel.ts, and PageWrapper.ts
  content behavior outside the factory change - existing host unwrap and pages[i].content behavior
  remains unchanged.
- src/renderer/ui/dialogs/, src/renderer/scripting/ai-vision/dialogs/, and
  src/renderer/uikit/shared/overlayLayer.ts - existing dialog adapters and global overlay ownership
  are named in help, not reimplemented or added to page elements.
- src/renderer/uikit/Button/ButtonView.ts, ProgressBarView.ts, and Panel/panel-style.ts - existing
  name deletion and panel attribute behavior is verified, not changed.
- assets/editor-types/*.d.ts - generated output only; refresh through the normal generator and never
  hand-edit.
- doc/active-work.md, doc/epics/EPIC-088.md, docs/**, assets/mcp-res-*.md,
  src/main/mcp/tools/**, tests, harness files, and commits - explicitly out of scope for this task
  document and for the requested implementation.
