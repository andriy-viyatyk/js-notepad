# US-1329 - The toolset editor and the Tools hub

Epic: [EPIC-088 - Boards and tools through call, and the retirement of seven tools](../../epics/EPIC-088.md)

**Status: Planned.** This document is an implementation plan only. No implementation, dashboard
entry, epic edit, test harness, or commit is part of this task-document pass.

## Goal

Give `pages[i].editor` real facades for the `toolset-view` and `tools-hub-view` editors. The
toolset facade will identify one model-resolved toolset, expose its read-only status and existing
folder/log actions, and link agents to the canonical `tools.toolsets[...]` node for manifest and
tool declarations. The hub facade will report its active tab and switch it through the existing
model path. Add the missing `pages.showToolsHubPage()` member; `showMnemeConfigPage()` remains
US-1331's work.

## Background

### Existing editor models and page identity

`ToolsetEditorModel` is a no-content-host, read-only editor with the fixed editor id
`toolset-view` (`src/renderer/editors/toolset/ToolsetEditorModel.ts:35-49`). Its state carries the
one toolset's own absolute root, title, parsed manifest, validation flag, and validation errors
(`ToolsetEditorModel.ts:12-26`). The root is populated by `initFromToolsetRoot()` and the title is
initially the folder basename (`ToolsetEditorModel.ts:79-84`); `matchesNavigationTarget()` decodes
the `persephone-toolset://` link and compares that root, so the root is the correct per-page
identity rather than a selected row or DOM value (`ToolsetEditorModel.ts:66-72`,
`src/renderer/content/persephone-toolset-link.ts:5-31`). `getLogPath()` already derives the
execution-log path from that root and returns `undefined` when no root is resolved
(`ToolsetEditorModel.ts:59-63`).

`reload()` reads the manifest, validates it, chooses the manifest name or folder basename, and
updates `manifest`, `valid`, and `errors` (`ToolsetEditorModel.ts:95-110`). A missing or unreadable
manifest is represented by `valid: false` and `errors: ["Manifest missing or unreadable."]`, not
by a successful empty toolset (`ToolsetEditorModel.ts:100-103`). The facade must report this
model-side branch, but must not copy the manifest and tool list into a second registry projection.

`ToolsHubEditor` is the fixed-id singleton page `tools-hub-page` with editor id
`tools-hub-view` (`src/renderer/editors/tools-hub/ToolsHubEditor.ts:3`, `:14-16`, `:30-34`). Its
persisted tab is one of exactly `"builtin" | "boards" | "search" | "tools"`, defaulting to
`"builtin"` (`ToolsHubEditor.ts:5-21`), and `setTab()` is the existing model mutation path
(`ToolsHubEditor.ts:38-40`). The page opener already deduplicates the fixed page id and applies an
optional tab after the page is live (`src/renderer/api/pages/PagesLifecycleModel.ts:831-838`);
`PagesModel` already re-exports that method (`src/renderer/api/pages/PagesModel.ts:277-281`).

Both editor ids are registered as lazy editor modules, but neither is in the facade map, so
`PageWrapper.editor` falls back to `GenericEditorFacade` (`src/renderer/editors/register-editors.ts:169-180`,
`src/renderer/scripting/api-wrapper/PageWrapper.ts:59-95`, `:173-183`). The board facade is the
landed pattern for adding a model-backed facade, page-scoped elements, the canonical facade union,
and a `FACADE_FOR_EDITOR` entry (`src/renderer/scripting/api-wrapper/BoardEditorFacade.ts:16-23`,
`:80-100`; `PageWrapper.ts:54-71`).

### Reuse the landed `tools` root node

US-1328's `tools` node is already registered on the AiVision root
(`src/renderer/scripting/ai-vision/namespaces/index.ts:27-38`) and is exposed as the root
`tools` property (`src/renderer/scripting/ai-vision/root.ts:44-50`, `:126-133`). It is the
canonical registry projection:

- `tools.toolsets` is an indexable live collection whose children include valid, invalid, and
  shadowed registrations; it accepts an integer index or exact case-insensitive authoritative
  toolset name and rejects unknown keys with the valid choices
  (`src/renderer/scripting/ai-vision/namespaces/tools.ts:135-170`).
- Each indexed toolset already reports `name`, `root`, `valid`, `shadowed`, `errors`, a projected
  manifest, and projected declared tools (`tools.ts:99-129`). Its tool projection copies only
  descriptive metadata and `env` names; it omits command execution details and never includes
  `.env` values (`tools.ts:57-75`).
- The collection refresh is deliberately whole-registry only; there is no per-toolset refresh
  member (`tools.ts:158-170`). The root help repeats that refresh and secret contract
  (`tools.ts:230-238`).

The new toolset facade therefore reports only the page/editor identity and model-backed display
status (`toolsetRoot`, `toolsetName`, `registered`, `valid`, and `errors`), plus the existing
folder/log/refresh actions. It will not add `manifest`, `tools`, `command`, or another copied
registry record. Its help will direct the agent to `tools.toolsets[toolsetName]` for the canonical
manifest and declared-tool projection; the absolute `toolsetRoot` remains the unambiguous identity
when a registration is absent or a manifest is invalid. The facade may use the existing `tools`
node/registry identity to validate that cross-reference, but it must not recreate
`projectTool()`/`projectManifest()`.

### Existing toolset actions and the trust boundary

The toolset view is read-only apart from its three existing controls: Refresh, Open Folder, and
Open Log (`src/renderer/editors/toolset/ToolsetEditorView.ts:57-106`). Refresh currently rebuilds
the entire registry and then reloads this model (`ToolsetEditorView.ts:231-233`); Open Folder opens
an Explorer-rooted page (`ToolsetEditorView.ts:236-238`); Open Log checks for the existing log,
notifies when none exists, and otherwise opens the file (`ToolsetEditorView.ts:240-248`). The
facade must move/reuse these handlers through model methods, not duplicate view-specific branches.

Registration is a privilege boundary. `toolsTrust` documents that registration is app-side state,
never read from a manifest, and always requires a user action (`src/renderer/api/tools/tools-trust.ts:1-18`);
the `trust()` method itself only writes after its caller has obtained consent
(`tools-trust.ts:73-95`). The existing agent registration flow shows the confirmation dialog,
returns `registered: false` on decline, and calls `toolsTrust.trust()` only after approval
(`src/renderer/api/mcp/tool-commands.ts:141-168`). Its AiVision adapter exposes the existing
`Register this toolset?` dialog through `dialogs[i]`, including exact response buttons, but does
not turn a facade action into registration (`src/renderer/scripting/ai-vision/dialogs/register-toolset.ts:5-33`).
No new facade member may register, trust, untrust, or accept a trust decision. The registration
dialog remains the only agent-mediated registration path.

### Secret audit

The manifest contract defines `ToolDef.env` as names of required environment variables; values
live in the toolset's `.env` and are never part of the manifest/MCP projection
(`src/renderer/api/tools/tools-manifest.ts:29-39`). The canonical `tools` node filters `env` to
strings and returns those names only (`src/renderer/scripting/ai-vision/namespaces/tools.ts:57-75`),
and its help explicitly says `.env` values never appear and credentials do not belong in
`execute()` arguments (`tools.ts:230-234`). The new facades will follow that contract: no member
returns a secret value and no member accepts a secret value, password, `.env` payload, or env
setter. `setTab()` accepts only one of the four fixed tab names; toolset actions accept no secret
argument.

The view does render manifest command text and the absolute root path, as well as tool names,
descriptions, requirements, timeout, and `env` names (`src/renderer/editors/toolset/ToolsetEditorView.ts:341-376`).
It does not read or render `.env` values; the `env` line is `tool.env.join(", ")`, so it is names
only (`ToolsetEditorView.ts:370-374`). A manifest author could put a literal credential in a
command or description, but that is user-authored manifest text, not a `.env` value; the facade
will not scrape that DOM or broaden the canonical `tools` projection to expose command text.

### Hub contents and the tools tree boundary

The hub always mounts a tab selector named `tools-hub-tabs`, and its change handler calls the
model's `setTab()` (`src/renderer/editors/tools-hub/ToolsHubView.ts:90-103`). It swaps one of
`BuiltinEditorsListView`, `TrustedBoardsListView`, `SearchBoardsTabView`, or
`TrustedToolsListView` into the body (`ToolsHubView.ts:104-123`). The search tab owns a query input
and catalog refresh control (`src/renderer/editors/tools-hub/SearchBoardsTab.ts:167-191`), with
query/catalog state and refresh behavior in the same view (`SearchBoardsTab.ts:196-221`). The
facade reports only the active tab and offers the model tab switch; it does not invent a second
catalog/board/tool projection from these views.

`ToolsTreeView` is a reusable view that renders a finite `{ root, name }` list into folders and
toolset leaves (`src/renderer/editors/tools/ToolsTreeView.ts:14-22`, `:58-79`,
`src/renderer/editors/tools/tools-tree-build.ts:1-16`, `:101-140`). It is owned by the sidebar
management views: `TrustedToolsListView` mounts it with `sidebar-trusted-tools-list` and uses
`registeredTools` for the list (`src/renderer/ui/sidebar/TrustedToolsListView.ts:1-40`, `:74-86`),
while the Explorer Boards/Tools secondary view mounts it as `explorer-tools`
(`src/renderer/editors/explorer/BoardsSecondaryView.ts:304-313`). The page-panels node already
owns the Explorer Tools panel's `tools`, `toolsetCount`, `openToolset`, and `explorer-tools`
element contract (`src/renderer/scripting/ai-vision/page-panels.ts:161-163`, `:195-199`,
`:250-263`).

The tree is therefore not part of either new editor facade. In an Explorer context it belongs to
the `page.panels` node. In the full-page hub, the shared `TrustedToolsListView` is still a view-only
listing: the hub facade reports `activeTab`, while `tools.toolsets[...]` is the authoritative data
node. This avoids duplicate row selectors, stale folder compaction, and a second registry
projection.

### Curated elements and name lifetime

The source census is an upper bound, not the public element list. Structural roots and internal
`name` fields are excluded. Every declaration will be created with `createElements`, scoped below
the page's `[data-page-id="..."]`, activated with `activatePageAndWaitForLayout`, and highlighted
with `{ all: true }`, following the landed board facade (`BoardEditorFacade.ts:80-88`) and the
page-scope contract (`src/renderer/scripting/ai-vision/page-elements.ts:5-8`, `:36-40`).

Curate these existing names; add no new names and rename none:

| Facade | Element name | One-line purpose | `data-name` source and re-render check |
| --- | --- | --- | --- |
| Toolset | `toolset-refresh` | Locate the control that refreshes the registry and this toolset's manifest. | Existing `IconButtonView` name at `ToolsetEditorView.ts:79-87`; the view does not update this button later, so it is not stripped. |
| Toolset | `toolset-open-folder` | Locate the control that opens the toolset root in an Explorer page. | Existing `ButtonView` name at `ToolsetEditorView.ts:97-101`; no later update omits it. |
| Toolset | `toolset-open-log` | Locate the control that opens the tool execution log when one exists. | Existing `ButtonView` name at `ToolsetEditorView.ts:103-106`; no later update omits it. |
| Tools hub | `tools-hub-tabs` | Locate the hub's Built-in, Boards, Search, and Tools tab switcher. | Existing `SegmentedControlView` name at `ToolsHubView.ts:90-99`; `applyTab()` passes `tabProps()` including the name on every update (`ToolsHubView.ts:104-106`). |
| Tools hub | `search-boards-filter` | Locate the Search boards query field. | Existing `InputView` name at `SearchBoardsTab.ts:173-181`; `syncSources()` updates with `inputProps()` containing the name (`SearchBoardsTab.ts:216-221`). |
| Tools hub | `search-boards-refresh` | Locate the Search boards catalog refresh control. | Existing `IconButtonView` name at `SearchBoardsTab.ts:185-191`; both refresh update paths use `refreshButtonProps()` containing the name (`SearchBoardsTab.ts:196-210`). |

Exclude `toolset-editor`, `tools-hub`, and `search-boards-tab` because they are structural roots;
exclude the tool list rows, catalog cards, pinned rail, and any menu/overlay controls because they
are repeated data or outside the stable page-editor control contract. UIKit removes `data-name`
when an update omits `name` for buttons and icon buttons (`src/renderer/uikit/Button/ButtonView.ts:81-103`,
`src/renderer/uikit/IconButton/IconButtonView.ts:66-89`), and applies the same lifetime rule to
inputs and segmented controls (`src/renderer/uikit/Input/InputView.ts:126-151`,
`src/renderer/uikit/SegmentedControl/SegmentedControlView.ts:76-80`). The plan must verify every
curated update path above before implementation is considered complete.

## Implementation Plan

### 1. Add canonical public facade types

Create `src/renderer/api/types/toolset-editor.d.ts` with `IToolsetEditor` and the fixed editor id
`"toolset-view"`. Keep the public shape deliberately narrow:

- `id` and `name` retain the generic editor identity.
- `toolsetRoot`, `toolsetName`, `registered`, `valid`, and `errors` describe the one model-resolved
  toolset. `toolsetRoot` is the identity used by the `persephone-toolset://` link; the
  `toolsetName` is the authoritative lookup key when a registry record exists.
- Do not add `manifest` or `tools` properties. The help for the facade points to
  `tools.toolsets[toolsetName]`, which already owns the canonical manifest/tool projection.
- Add `refresh(): Promise<void>`, `openFolder(): Promise<void>`, and
  `openLog(): Promise<void>` with cautions for disk/navigation effects where appropriate.

Create `src/renderer/api/types/tools-hub-editor.d.ts` with `IToolsHubEditor`, `id:
"tools-hub-view"`, `name`, `activeTab: HubTab | undefined`, and `setTab(tab: HubTab): void`.
Define or reuse the public `HubTab` union exactly as `"builtin" | "boards" | "search" |
"tools"`; no arbitrary string silently selects a body. Import this public `HubTab` type into
`pages.d.ts` rather than importing the runtime editor module from a declaration file.

Add both interfaces to `IEditorFacade` and both ids to `IFacadeEditorId` in
`src/renderer/api/types/page.d.ts` near the existing board facade union
(`page.d.ts:28-44`). `EditorView` already contains both ids
(`src/renderer/api/types/common.d.ts:25-56`), so it does not need a new editor-id entry. Do not
hand-edit `assets/editor-types/*.d.ts`; the normal generator refreshes those copies.

### 2. Add the two facade implementations and register them

Create `src/renderer/scripting/api-wrapper/ToolsetEditorFacade.ts` and
`ToolsHubEditorFacade.ts`, following `BoardEditorFacade.ts` and `GitTreeEditorFacade.ts` for
static member declarations, `createElements`, page-scoped highlighting, `provide`, `elements`,
`summarize`, and model-only getters.

`ToolsetEditorFacade` must:

- accept the page's existing `ToolsetEditorModel`, never create a second model, and retain
  `id: "toolset-view"`/registry `name`;
- read `toolsetRoot`, `title`, `valid`, and `errors` from model state; derive registration only
  from the existing `toolsTrust` state used by the view (`ToolsetEditorView.ts:190-197`);
- use the canonical `tools` node/registry identity for the `toolsetName` cross-reference, but
  never implement a second `projectManifest` or `projectTool`; leave all manifest/tool details to
  `tools.toolsets[...]`;
- call model-owned methods for `refresh`, `openFolder`, and `openLog`, preserving the existing
  actions and their error/notification behavior;
- expose exactly the three toolset elements in the table, using the page scope and
  `{ all: true }`.

`ToolsHubEditorFacade` must:

- accept the page's existing `ToolsHubEditor`, retain `id: "tools-hub-view"` and the registry
  display name, and expose only the model-backed `activeTab` plus `setTab`;
- validate the four allowed tab values before calling the model, throwing a clear error listing
  valid values for a guessed tab instead of silently mounting the wrong body;
- expose exactly `tools-hub-tabs`, `search-boards-filter`, and `search-boards-refresh`; inactive
  search controls may report `visible: false` through the normal element provider;
- state in help that `tools.toolsets[...]` is the data path for the Tools tab and `page.panels`
  owns Explorer/sidebar tool trees.

Update `src/renderer/scripting/api-wrapper/PageWrapper.ts:59-95` to import both models/facades,
add both classes to `EditorFacade`, and add literal factories for `toolset-view` and
`tools-hub-view` to `FACADE_FOR_EDITOR`. The lookup fallback stays as landed:

Before:

~~~ts
const FACADE_FOR_EDITOR = {
    // ...existing literal factories...
    "git-tree": (editor, id, name) => new GitTreeEditorFacade(editor as GitTreeEditorModel, id as "git-tree", name),
    "board-view": BOARD_FACADE_FACTORY,
};
~~~

After:

~~~ts
const FACADE_FOR_EDITOR = {
    // ...existing literal factories...
    "git-tree": (editor, id, name) => new GitTreeEditorFacade(editor as GitTreeEditorModel, id as "git-tree", name),
    "board-view": BOARD_FACADE_FACTORY,
    "toolset-view": (editor, id, name) => new ToolsetEditorFacade(editor as ToolsetEditorModel, id as "toolset-view", name),
    "tools-hub-view": (editor, id, name) => new ToolsHubEditorFacade(editor as ToolsHubEditor, id as "tools-hub-view", name),
};
~~~

The lookup code itself stays unchanged; the required change is the two `FACADE_FOR_EDITOR` map
entries and the union/imports. This preserves Generic fallback for every other editor.

### 3. Move toolset button behavior to model-owned methods

Update `src/renderer/editors/toolset/ToolsetEditorModel.ts` beside `reload()` and
`getLogPath()`:

- Add a model method that performs the existing whole-registry refresh followed by this editor's
  manifest reload. The view's Refresh handler and `ToolsetEditorFacade.refresh()` both call this
  method. Keep the registry's whole-refresh semantics; do not add a fake per-toolset registry
  refresh (`src/renderer/scripting/ai-vision/namespaces/tools.ts:158-170`).
- Add model-owned open-folder and open-log methods that preserve the existing calls from
  `ToolsetEditorView.ts:231-248`. Open Folder must use `pagesModel.addEmptyPageWithNavPanel(root)`
  for the model root; Open Log must use `getLogPath()`, preserve the missing-log notification,
  and open the existing log path only when it exists. No method takes a secret or trust value.

Update `ToolsetEditorView.ts:231-248` so its handlers delegate to those model methods. Do not
change the existing `name` props, rendered text, registration display, or manifest/tool branch
selection. This is the handler-move required for the facade: the facade calls the same model path
the user controls call.

### 4. Validate and expose the hub tab mutation

Update `src/renderer/editors/tools-hub/ToolsHubEditor.ts:38-40` so the model's `setTab()` rejects
an unknown runtime value with the valid tab list before changing state. The view's existing
segmented control already sends one of the four values (`ToolsHubView.ts:90-103`), and
`PagesLifecycleModel.showToolsHubPage()` already applies the optional tab after deduplicating the
singleton (`PagesLifecycleModel.ts:831-838`). The facade and the page-opening wrapper will use
that same validated model method; neither will inspect the tab DOM or manually mount a body.

The hub facade's active-tab getter must normalize an absent or invalid persisted value to
`undefined` for the public absence contract. A normal fresh/restored editor reports the model's
real `"builtin"` default (`ToolsHubEditor.ts:14-21`), not an invented fallback in the facade.

### 5. Add `pages.showToolsHubPage()` to the script-facing wrapper

Update `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` in the same pattern as the
existing MCP Inspector member:

Before:

~~~ts
{ name: "showMcpInspectorPage", kind: "method", signature: "showMcpInspectorPage(options?: { url? })", summary: "Show the MCP inspector page." },
// no showToolsHubPage member

showMcpInspectorPage(options?: { url?: string }): Promise<void> {
    return this.pages.showMcpInspectorPage(options);
}
~~~

After:

~~~ts
{ name: "showMcpInspectorPage", kind: "method", signature: "showMcpInspectorPage(options?: { url? })", summary: "Show the MCP inspector page." },
{ name: "showToolsHubPage", kind: "method", signature: "showToolsHubPage(options?: { tab?: HubTab })", summary: "Show the Tools & Editors hub, optionally selecting a tab." },

showMcpInspectorPage(options?: { url?: string }): Promise<void> {
    return this.pages.showMcpInspectorPage(options);
}

showToolsHubPage(options?: { tab?: HubTab }): Promise<void> {
    return this.pages.showToolsHubPage(options);
}
~~~

Import `HubTab` as a type in `PageCollectionWrapper.ts` and in the canonical `pages.d.ts` type
file. Add the matching `showToolsHubPage(options?: { tab?: HubTab }):
Promise<void>` declaration to `src/renderer/api/types/pages.d.ts` beside
`showMcpInspectorPage()` (`pages.d.ts:104-112`). This is the canonical script type; generated
`assets/editor-types/pages.d.ts` remains untouched. Do not add `showMnemeConfigPage()` here:
`PagesLifecycleModel` and `PagesModel` already expose it (`PagesLifecycleModel.ts:808-810`,
`PagesModel.ts:277-281`), and US-1331 owns its PageCollectionWrapper/type addition.

### 6. Implement the absent-value audit explicitly

Keep `strictNullChecks` behavior in mind: unavailable values must be `undefined`, and an object
property whose value is `undefined` must be omitted from returned objects because the resolver
serializes such a key as `null`. The implementation must construct conditional object spreads,
never `{ key: undefined }`.

The getter contract to implement and review is:

| Getter/member | No toolset / no host | Invalid or missing manifest | Valid manifest with genuinely empty data | No hub tab set |
| --- | --- | --- | --- | --- |
| `toolsetRoot` | `undefined` | Requested root remains present; `reload()` does not clear it (`ToolsetEditorModel.ts:97-110`). | Requested root | Not applicable |
| `toolsetName` | `undefined` | Folder/manifest-derived title remains available; it identifies the same root, but full data is referenced through `tools.toolsets[...]`. | Authoritative name | Not applicable |
| `registered` | `undefined` | `true` or `false` from `toolsTrust.isTrusted(root)`; invalidity does not become absence. | `true` or `false` | Not applicable |
| `valid` | `undefined` before a resolved toolset/manifest state exists | `false` | `true` | Not applicable |
| `errors` | `undefined` | Non-empty validation errors, including the missing-manifest error | `[]` when validation produced no errors | Not applicable |
| `refresh/openFolder/openLog` | Throw a clear no-root/no-page error or no-op only where the existing handler is a no-op; never accept a secret | Same action contract; no trust side effect | Same action contract | Not applicable |
| `activeTab` | Not applicable | Not applicable | Not applicable | `undefined`, never `null`, `"builtin"`, or an invalid string |
| `setTab(tab)` | Not applicable | Not applicable | Not applicable | Accept only the four known values; reject guesses with valid choices |

For the canonical `tools.toolsets[...]` cross-reference, preserve its own distinction: absent
registry record is `undefined`, while a registered manifest with an actual empty `tools` array is
`[]` (`tools.ts:108-121`). Do not manufacture a toolset node for an unresolved root, and do not
place absent `html`, `title`, or other optional fields into snapshots as `undefined`.

### 7. Build help, trust/secret boundaries, and elements

Each facade's `$help` must state:

- the exact editor id and how to reach it through `pages[i].editor`;
- for `toolset-view`, that `toolsetRoot` identifies one toolset and that manifest/tool details
  live at `tools.toolsets[toolsetName]`, including invalid/shadowed records;
- for `tools-hub-view`, the four tab values, `activeTab`, `setTab()`, and the fact that the Tools
  tab's canonical data is `tools.toolsets[...]`;
- `.env` values never appear, `env` is names only, and no facade member accepts/returns a secret;
- no facade action registers, trusts, or untrusts a toolset; the existing registration dialog
  (`dialogs[i]`, `RegisterToolsetDialog`) remains the consent path;
- `elements` is curated and page-scoped, repeated matches use `{ all: true }`, inactive search
  controls may be invisible, and sidebar/overlay/tree controls are not part of the editor list;
- the tools tree is owned by `page.panels` in Explorer contexts, while the hub reports only its
  active tab and the canonical root node supplies tool data.

### 8. Verify without adding tests

Review the implementation source, without creating unit tests or a harness, for:

- both facade factories and both canonical public type unions;
- the exact `PageCollectionWrapper` descriptor/method and canonical `pages.d.ts` declaration;
- no Mneme page member, dashboard change, epic change, generated asset edit, or implementation of
  a second `tools` registry projection;
- the model-only toolset root/status and hub-tab state, with invalid guessed tabs rejected;
- the refresh/open-folder/open-log handlers still matching the existing UI actions;
- the absent-value table, conditional object spreads, and genuine `[]` preservation;
- no registration/trust setter and no secret argument/value;
- the six curated elements, page scope, `{ all: true }`, and every name-preserving update path;
- no `ToolsTreeView` facade projection and no selectors for portalled/overlay controls.

## Concerns

- **Canonical toolset node versus editor status:** The editor must identify its one root and
  validation branch without copying the manifest/tool projection already provided by
  `tools.toolsets[...]`. If a helper is needed to resolve the canonical node, keep it in the
  existing namespace boundary and fail closed when the registry is not initialized; do not expose
  a second `projectManifest()` implementation.
- **Unregistered or stale roots:** `ToolsetEditorModel` can retain a requested root while its
  manifest is absent or invalid (`ToolsetEditorModel.ts:97-110`). `registered` and the
  `tools.toolsets[...]` cross-reference must not turn that state into a false successful empty
  toolset. Root identity remains available; absent registry data remains `undefined`.
- **Registration is not a facade action:** `toolsTrust.trust()` is a privileged write. The
  facade may report the same registration status the view displays, but it must not expose a
  trust/register/untrust method or silently invoke the registration dialog.
- **Manifest command text in the view:** The view displays `tool.command`, but the canonical
  AiVision projection deliberately omits command execution details. The facade must not read the
  view DOM or widen the secret surface merely to mirror that line.
- **Hub invalid state:** The persisted state is typed as `HubTab`, but runtime persisted data can
  be absent or invalid because `strictNullChecks` and runtime validation do not guarantee it. The
  facade must return `undefined` for absent active tab and the model must reject invalid writes.
- **Element lifetime:** UIKit deletes omitted `data-name` attributes during updates. The plan
  relies on the existing names and requires checking every update site; a declaration is not
  accepted merely because the name exists during first mount.
- **Sidebar/tree ownership:** The same `ToolsTreeView` appears in Explorer/sidebar and the hub's
  shared list view. The facade boundary is model/data versus repeated visual rows: `page.panels`
  owns the Explorer panel, and the root `tools` node owns registry data.
- **Generated declarations:** `assets/editor-types/*.d.ts` are generated output and must not be
  edited by hand.
- **Scope boundary:** No tests, harness, dashboard entry, epic edit, user documentation, or
  commit is included in this task-document request.

## Acceptance Criteria

- [ ] `pages[i].editor` returns a dedicated `ToolsetEditorFacade` for `toolset-view` and a
      dedicated `ToolsHubEditorFacade` for `tools-hub-view`; other editors retain their existing
      factories or Generic fallback.
- [ ] The canonical `IEditorFacade`/`IFacadeEditorId` unions contain both new facade types and
      both public type files exist; generated `assets/editor-types/*.d.ts` files are not hand-edited.
- [ ] The toolset facade identifies exactly one toolset by the model's absolute
      `toolsetRoot`, reports its name/registration/validation/errors, and cross-references
      `tools.toolsets[...]` instead of re-projecting `manifest` or `tools`.
- [ ] Toolset `refresh()`, `openFolder()`, and `openLog()` reuse model-owned equivalents of the
      existing view handlers, preserving whole-registry refresh, missing-log notification, and
      navigation behavior.
- [ ] The hub facade reports the model-backed active tab and offers a validated `setTab()` for
      exactly `builtin`, `boards`, `search`, and `tools`.
- [ ] `PageCollectionWrapper` advertises and delegates `showToolsHubPage(options?: { tab?: HubTab })`
      in the same position/pattern as `showMcpInspectorPage`; `src/renderer/api/types/pages.d.ts`
      declares it, while Mneme's page member remains US-1331's.
- [ ] No facade member registers, trusts, or untrusts a toolset, bypasses the
      `Register this toolset?` consent dialog, accepts a trust decision, or accepts/returns a
      secret value. `.env` values never appear; `env` is names only. The toolset view's command
      display is not scraped or widened into the facade.
- [ ] The absent-value audit is exact: unavailable values are `undefined`, valid empty collections
      are `[]`, genuine booleans remain booleans, and no returned object contains a key assigned
      `undefined`.
- [ ] Exactly six editor elements are curated: `toolset-refresh`, `toolset-open-folder`,
      `toolset-open-log`, `tools-hub-tabs`, `search-boards-filter`, and `search-boards-refresh`.
      Each has a one-line purpose, resolves page-scoped, uses `{ all: true }`, preserves its
      existing `data-name`, and survives all later updates. Structural roots, repeated rows,
      overlays, menus, pinned rail controls, and tree rows are excluded.
- [ ] `ToolsTreeView` is not projected by either editor facade. Explorer's tree remains owned by
      the `page.panels` node; the hub reports its active tab and `tools.toolsets[...]` remains the
      canonical tool data path.
- [ ] No unit tests or harness are added, `doc/active-work.md` and `doc/epics/EPIC-088.md` remain
      unchanged, no user documentation is changed, and no commit is created.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1329-toolset-and-tools-hub/README.md` | This verified implementation plan, including page opening, facade state, reuse, trust/secret/absence audits, element curation, tree ownership, concerns, and acceptance criteria. |
| `src/renderer/api/types/toolset-editor.d.ts` | New public `IToolsetEditor` contract with identity, status, and model-backed actions; no manifest/tool duplicate. |
| `src/renderer/api/types/tools-hub-editor.d.ts` | New public `IToolsHubEditor` contract and `HubTab`-based tab operation. |
| `src/renderer/api/types/page.d.ts` | Add both facade types and editor ids to the canonical facade unions. |
| `src/renderer/api/types/pages.d.ts` | Add the script-facing `showToolsHubPage({ tab? })` declaration. |
| `src/renderer/scripting/api-wrapper/ToolsetEditorFacade.ts` | New model-backed toolset facade, three curated controls, canonical `tools.toolsets[...]` cross-reference help, and trust/secret/absence behavior. |
| `src/renderer/scripting/api-wrapper/ToolsHubEditorFacade.ts` | New model-backed active-tab facade, validated tab switch, and three curated controls. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Import, union, and factory registration for the two new facades. |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | Advertise and delegate `showToolsHubPage()` with the existing page-wrapper pattern. |
| `src/renderer/editors/toolset/ToolsetEditorModel.ts` | Add model-owned refresh/folder/log action paths used by both the view and facade. |
| `src/renderer/editors/toolset/ToolsetEditorView.ts` | Delegate existing button handlers to the model-owned action paths; preserve names and rendering. |
| `src/renderer/editors/tools-hub/ToolsHubEditor.ts` | Validate runtime tab writes before changing the persisted hub state. |

Files intentionally needing **no changes**:

- `src/renderer/api/pages/PagesLifecycleModel.ts` and `src/renderer/api/pages/PagesModel.ts` -
  `showToolsHubPage()` already exists and already applies the optional tab; `showMnemeConfigPage()`
  remains US-1331's wrapper/type work.
- `src/renderer/scripting/ai-vision/namespaces/tools.ts` and
  `src/renderer/scripting/ai-vision/root.ts` - US-1328's `tools` root and canonical toolset
  projection are reused, not edited or duplicated.
- `src/renderer/editors/tools-hub/ToolsHubView.ts` and
  `src/renderer/editors/tools-hub/SearchBoardsTab.ts` - existing named controls and update paths
  are retained; the facade only describes them.
- `src/renderer/editors/tools/ToolsTreeView.ts`, `tools-tree-build.ts`,
  `src/renderer/ui/sidebar/TrustedToolsListView.ts`, and `src/renderer/editors/explorer/BoardsSecondaryView.ts` -
  the tree remains view/panel-owned and is not reprojected by an editor facade.
- `src/renderer/api/tools/tools-trust.ts`, `registered-tools.ts`, `tools-manifest.ts`,
  `tool-scaffold.ts`, and `src/renderer/api/mcp/tool-commands.ts` - existing registry,
  manifest, secret, scaffold, dialog, and trust authorities remain unchanged.
- `src/renderer/editors/register-editors.ts` - both editor ids are already registered; only the
  scripting facade map changes.
- `src/renderer/api/types/common.d.ts`, `src/renderer/api/types/index.d.ts`, and
  `assets/editor-types/*.d.ts` - ids already exist, the type barrel needs no change, and generated
  assets are not hand-edited.
- `doc/active-work.md`, `doc/epics/EPIC-088.md`, `docs/**`, tests, harnesses, and git history -
  explicitly outside this request.
