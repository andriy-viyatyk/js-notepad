# US-1304 — `window.menuBar`: folders, selection, open/close, and Menu Bar elements

**Status:** Planned · **Epic:** [EPIC-085 — The application shell through `call`](../../epics/EPIC-085.md)

This document is an investigation and implementation plan only. It does not authorize
implementation.

## Goal

Expose the Persephone glyph's sidebar as the `window.menuBar` AiVision node. The node must report
the live open state, the live built-in and user-folder categories, the selected category, and its
own curated `elements`/`highlight(name, message?)` surface without moving Menu Bar controls into
`ui.elements`.

## Background

### Epic and roadmap constraints

EPIC-085 design decision 3 puts the Menu Bar on `window`, because the existing window object already
owns `menuBarOpen`, `toggleMenuBar()`, and `openMenuBar(panelId?)`; decision 4 requires the open
state to come from the model rather than DOM presence; decision 7 gives Menu Bar controls to this
node rather than growing `ui.elements`; and decision 8 makes
[`doc/architecture/ui-element-contract.md`](../../architecture/ui-element-contract.md) the selector
contract that must stay in agreement with source ([`doc/epics/EPIC-085.md:62-104`](../../epics/EPIC-085.md#L62-L104)).
The roadmap repeats the same surface rule: a node's `elements` belong to the node whose state
explains why those controls are present ([`doc/agent-transparency-roadmap.md:36-45`](../../agent-transparency-roadmap.md#L36-L45),
[`doc/agent-transparency-roadmap.md:90-97`](../../agent-transparency-roadmap.md#L90-L97)).

US-1304 is independent of US-1303 and US-1305; the epic explicitly lists it as the Menu Bar task
and requires the acceptance answer to list the folders actually present, not a hardcoded four
([`doc/epics/EPIC-085.md:116-131`](../../epics/EPIC-085.md#L116-L131)).

### Verified current ownership and state

The application shell mounts one `MenuBarView` beside the page container. `MainPageView` creates it
with `open: false`, appends its root to the content area, mounts it, and updates its `open` prop
from window state ([`src/renderer/ui/app/MainPageView.ts:44-86`](../../../src/renderer/ui/app/MainPageView.ts#L44-L86),
[`src/renderer/ui/app/MainPageView.ts:169-175`](../../../src/renderer/ui/app/MainPageView.ts#L169-L175)).

The current authoritative open state is `Window`'s `TOneState<WindowState>.menuBarOpen`, not the
view DOM. `Window.menuBarOpen` reads that state; `toggleMenuBar()` flips it; and
`openMenuBar(panelId?)` sets it to `true` and stores a truthy `panelId`
([`src/renderer/api/window.ts:25-43`](../../../src/renderer/api/window.ts#L25-L43),
[`src/renderer/api/window.ts:115-143`](../../../src/renderer/api/window.ts#L115-L143)). The
script-facing declaration currently exposes exactly those three members as
`menuBarOpen: boolean`, `toggleMenuBar()`, and `openMenuBar(panelId?: string)`
([`src/renderer/api/types/window.d.ts:36-45`](../../../src/renderer/api/types/window.d.ts#L36-L45)); the
actual type file is `window.d.ts`, not a `.ts` file.

The current selected category is not in `WindowState`. `MenuBarView` keeps it in the private
`leftItemId`, initially `open-tabs`; selection changes update that field and rebuild the right-hand
view ([`src/renderer/ui/sidebar/MenuBarView.ts:140-149`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L140-L149),
[`src/renderer/ui/sidebar/MenuBarView.ts:266-314`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L266-L314)).
The window's `menuBarPanelId` is only a pending command: the view looks up the ID in the current
static-plus-user list, selects it if found, and then consumes/clears the pending value
([`src/renderer/ui/sidebar/MenuBarView.ts:464-470`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L464-L470)).
It is therefore not safe to expose `menuBarPanelId` as the current selection.

The Menu Bar's source list is four built-in records — IDs `open-tabs`, `recent-files`,
`tools-editors`, and `script-library` — followed by `menuFolders.state.get().folders`
([`src/renderer/ui/sidebar/MenuBarView.ts:46-55`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L46-L55),
[`src/renderer/ui/sidebar/MenuBarView.ts:247-264`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L247-L264)).
`app.menuFolders.folders` is the public live list of configured folders; each declared folder has an
`id`, `name`, optional `path`, and optional `files`, and the model's `add()` generates an ID
([`src/renderer/api/types/menu-folders.d.ts:4-12`](../../../src/renderer/api/types/menu-folders.d.ts#L4-L12),
[`src/renderer/api/types/menu-folders.d.ts:27-41`](../../../src/renderer/api/types/menu-folders.d.ts#L27-L41),
[`src/renderer/api/menu-folders.ts:79-100`](../../../src/renderer/api/menu-folders.ts#L79-L100)).
The node will map built-ins to `{ kind: "builtin" }` and configured records to
`{ kind: "user" }`, with `id`, display `label` (`MenuFolder.name`), and the configured folder's
optional `path`. Built-ins have no `path`; virtual user folders backed only by `files` also have no
`path`. The projection must not filter the live source list.

There is one pre-existing malformed-data edge: `MenuFoldersModel.isStateValid()` validates the
folder name/path/files shapes but does not require an ID, while the public `IMenuFolder` requires
one ([`src/renderer/api/menu-folders.ts:46-59`](../../../src/renderer/api/menu-folders.ts#L46-L59),
[`src/renderer/api/types/menu-folders.d.ts:4-12`](../../../src/renderer/api/types/menu-folders.d.ts#L4-L12)).
The implementation should preserve the Menu Bar's current `folder.id ?? ""` treatment rather than
silently dropping a record ([`src/renderer/ui/sidebar/MenuBarView.ts:286-305`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L286-L305)).
Normal, API-created folders always have IDs; an empty ID from malformed persisted data is listed
but is not an actionable selector.

### `openMenuBar(panelId?)`: actual accepted values

The existing method is typed as `panelId?: string` and accepts any optional string at the `Window`
boundary. It only stores the value when it is truthy ([`src/renderer/api/window.ts:125-129`](../../../src/renderer/api/window.ts#L125-L129)).
The view applies a stored value only when it exactly matches an ID in the current four built-ins or
the current configured-folder list ([`src/renderer/ui/sidebar/MenuBarView.ts:464-469`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L464-L469)).
Thus the effective selectable values are the live folder IDs — `open-tabs`, `recent-files`,
`tools-editors`, `script-library`, and the IDs currently returned by `app.menuFolders.folders` —
not labels or paths. The legacy `window.openMenuBar(panelId?)` still accepts an unknown truthy
string, opens the sidebar, and leaves the existing selection unchanged; omitting its argument also
opens without changing selection. The new `window.menuBar.open(folderId?)` is stricter: an unknown
ID, label, path, or stale ID must throw an error that names the bad value and lists every current
valid ID with its label and kind. The two descriptors must state this difference in one clause each.

### Closed DOM trap

`MenuBarView.onMount()` always creates and mounts the backdrop, assigning it
`data-name="menu-bar"`, and always creates the sliding content element with
`data-name="menu-bar-content"` ([`src/renderer/ui/sidebar/MenuBarView.ts:175-183`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L175-L183)).
The view toggles the `doDisplay` class from the `open` prop; when closed it removes `doDisplay`
and `open` but does not remove the root ([`src/renderer/ui/sidebar/MenuBarView.ts:224-245`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L224-L245)).
The co-located CSS sets `.menu-bar-backdrop { display: none; }` and only restores display for
`.menu-bar-backdrop.doDisplay` ([`src/renderer/ui/sidebar/MenuBar.css:2-11`](../../../src/renderer/ui/sidebar/MenuBar.css#L2-L11)).
Consequently, `[data-name="menu-bar"]` is present while closed but hidden. `isOpen` must read the
model boolean. `elements` may use the shared visibility behavior because `createElements()` checks
`offsetParent !== null` for matching elements ([`src/renderer/scripting/ai-vision/elements.ts:27-34`](../../../src/renderer/scripting/ai-vision/elements.ts#L27-L34)); closed Menu Bar elements will correctly report `visible: false`.

### AiVision and resolver pattern

The shared resolver first validates a named member against the descriptor, then calls the
descriptor's `provide(name)` before reading the real target member
([`src/shared/ai-vision/resolver.ts:90-146`](../../../src/shared/ai-vision/resolver.ts#L90-L146)).
`IAiVisionDescriptor` explicitly supports synthesized members through `provide()` and keeps
`elements` as static declaration metadata for help-search ([`src/shared/ai-vision/types.ts:57-85`](../../../src/shared/ai-vision/types.ts#L57-L85)).
The existing `ui` descriptor is the exact consumer pattern: declare `HEADER_ELEMENTS`, call
`createElements(HEADER_ELEMENTS, ui.highlightElement.bind(ui))`, append its generated members,
return `provide: elements.provide`, and retain the declarations as `elements`
([`src/renderer/scripting/ai-vision/namespaces/ui.ts:5-18`](../../../src/renderer/scripting/ai-vision/namespaces/ui.ts#L5-L18),
[`src/renderer/scripting/ai-vision/namespaces/ui.ts:42-50`](../../../src/renderer/scripting/ai-vision/namespaces/ui.ts#L42-L50)).

This plan chooses a real nested `menuBar` object on `IWindow`/`Window`, backed by the same model
state consumed by `MenuBarView`. That keeps selection and openness in the Object Model, follows the
architecture rule that UI and scripts share `app.*` state, and lets the resolver read
`window.menuBar` as a real member. `provide()` remains limited to `elements` and `highlight`, whose
values are synthesized from the live DOM and the existing highlight API. It avoids a descriptor-only
singleton that would have to reach into `MenuBarView.leftItemId` or infer selection from markup.

### Selector audit against the contract

The Menu Bar table currently defines ten curated selectors
([`doc/architecture/ui-element-contract.md:114-124`](../../architecture/ui-element-contract.md#L114-L124)).
All ten are already assigned by source; no missing `data-name` was found:

| Contract entry | Verified source assignment | Result for this task |
|---|---|---|
| Backdrop, `menu-bar` | `MenuBarView.root.dataset.name` ([`MenuBarView.ts:175-179`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L175-L179)) | Declare `menu-bar`; model visibility, not presence, is `isOpen`. |
| Sliding panel, `menu-bar-content` | `MenuBarView.content.dataset.name` ([`MenuBarView.ts:178-183`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L178-L183)) | Declare `menu-bar-content`. |
| Open File / New Window / About / Settings | `IconButtonView` names in `MenuBarView` ([`MenuBarView.ts:92-120`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L92-L120)); `IconButtonView` writes `data-name` ([`IconButtonView.ts:66-89`](../../../src/renderer/uikit/IconButton/IconButtonView.ts#L66-L89)) | Declare the four names exactly. |
| Category list, `menubar-folders` | `ListBoxView` name in `MenuBarView` ([`MenuBarView.ts:152-169`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L152-L169), [`MenuBarView.ts:266-283`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L266-L283)); `ListBoxView` writes `data-name` ([`ListBoxView.ts:284-302`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L284-L302)) | Declare the live category-list root. |
| Right-hand pane, `menubar-content` | `createPanelElement({ name: "menubar-content" })` ([`MenuBarView.ts:85-91`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L85-L91)); panel attributes copy `name` to `dataset` ([`panel-style.ts:303-331`](../../../src/renderer/uikit/Panel/panel-style.ts#L303-L331)) | Declare the pane. |
| Add Folder button, `menubar-add-folder-button` | `ButtonView` name ([`MenuBarView.ts:121-128`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L121-L128)); `ButtonView` writes `data-name` ([`ButtonView.ts:81-103`](../../../src/renderer/uikit/Button/ButtonView.ts#L81-L103)) | Declare the button. |
| Width splitter, `menubar-splitter` | `SplitterView` name ([`MenuBarView.ts:129-138`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L129-L138)); `SplitterView` writes `data-name` ([`SplitterView.ts:52-70`](../../../src/renderer/uikit/Splitter/SplitterView.ts#L52-L70)) | Declare the splitter. |

The adjacent views do not assign additional `menubar-*` contract names. Their names are owned by
their own future surfaces: for example, Open Tabs uses `sidebar-open-tabs`
([`src/renderer/ui/sidebar/OpenTabsListView.ts:31-57`](../../../src/renderer/ui/sidebar/OpenTabsListView.ts#L31-L57)),
Tools & Editors uses `tools-editors-tabs` and `tools-editors-open-in-tab`
([`src/renderer/ui/sidebar/ToolsEditorsPanelView.ts:36-65`](../../../src/renderer/ui/sidebar/ToolsEditorsPanelView.ts#L36-L65)),
and Script Library uses `sidebar-script-library` and `script-library-setup`
([`src/renderer/ui/sidebar/ScriptLibraryPanelView.ts:38-62`](../../../src/renderer/ui/sidebar/ScriptLibraryPanelView.ts#L38-L62)).
`RecentFileListView`, `FolderItemView`, `BuiltinEditorsListView`, `TrustedBoardsListView`,
`TrustedToolsListView`, and `PinnedRailView` likewise expose no missing control needed by the ten
Menu Bar contract rows; their existing `sidebar-*`, `tools-*`, or `data-type` markers must not be
renamed or folded into this node. No selector-contract or adjacent-view `data-name` change is
planned.

## Implementation Plan

### 1. Give the Object Model one Menu Bar state owner

1. Add `src/renderer/api/menu-bar.ts` as the renderer API model for Menu Bar state. Move the
   built-in folder ID/label records currently local to `MenuBarView` into one exported source list,
   and expose a live folder projection that concatenates those records with the current
   `menuFolders.folders`. The public projection is `{ id, label, kind, path? }`, where `kind` is
   `"builtin"` or `"user"`; `path` is present only for a user folder that has one. Do not cache the
   user list.
2. Give the model reactive `isOpen` and selected-ID state, initially closed and selected on
   `open-tabs`. Implement `open(folderId?)`, `close()`, and the internal toggle/delegation needed by
   the existing `Window` methods. `open()` must preserve the selection when called without an ID.
   The node-level `open(folderId)` must reject any ID not in the current live list by throwing an
   error that includes the bad ID and every valid `{ id, label, kind }` (and `path` where present);
   labels, paths, and stale IDs must not be silently accepted. Keep the legacy
   `window.openMenuBar(panelId?)` lenient and unchanged: implement a separate internal
   `openLegacy(panelId?)` delegation for it rather than routing it through strict node `open()`;
   its descriptor summary must say that unknown strings still open without changing selection,
   while this node's `open` summary says it rejects them. Move the existing
   `MenuBarView.refreshFolders()` fallback — its microtask
   re-check and reset to `staticFolders[0]` after a selected user folder disappears — into the model
   with the same microtask deferral and semantics, rather than presenting it as new behavior
   ([`src/renderer/ui/sidebar/MenuBarView.ts:247-264`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L247-L264)).
3. In `src/renderer/api/types/window.d.ts`, add `IMenuBarFolder` and `IMenuBar`, then add
   `readonly menuBar: IMenuBar` to `IWindow`. `IMenuBar` should declare readonly `isOpen`, live
   `folders`, and `selected`, plus `open(folderId?: string)` and `close()`. Document that the
   argument is a folder ID, not a display label/path, and list the four built-in IDs plus live user
   IDs in the JSDoc. Mirror this public declaration in `assets/editor-types/window.d.ts`, which is
   the editor-facing copy of the renderer API types (the source/asset pair is established by
   [`doc/architecture/overview.md:75-79`](../../architecture/overview.md#L75-L79)).
4. In `src/renderer/api/window.ts`, instantiate the model as the `Window`'s real `menuBar`
   member. Keep `menuBarOpen`, `toggleMenuBar()`, and `openMenuBar(panelId?)` as compatibility
   delegations to that model, so existing callers retain their paths. Remove the now-redundant
   `menuBarPanelId` pending field and `consumeMenuBarPanelId()` once the view consumes model state
   directly. `WindowState` is an in-memory `TOneState` created from a literal default and is not a
   persisted restore record ([`src/renderer/api/window.ts:25-44`](../../../src/renderer/api/window.ts#L25-L44));
   a repository search found the only two field consumers at the view subscription and the
   `consumePanelId()` call ([`src/renderer/ui/sidebar/MenuBarView.ts:207-209`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L207-L209),
   [`src/renderer/ui/sidebar/MenuBarView.ts:464-470`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L464-L470)).
   Dropping the field and method therefore cannot affect window restore and is safe once the view
   reads the model directly.

Current versus planned ownership:

```ts
// src/renderer/api/window.ts — current
interface WindowState {
    menuBarOpen: boolean;
    menuBarPanelId: string;
}

get menuBarOpen(): boolean { return this._state.get().menuBarOpen; }
openMenuBar(panelId?: string): void {
    this._state.update(s => {
        s.menuBarOpen = true;
        if (panelId) s.menuBarPanelId = panelId;
    });
}
```

```ts
// src/renderer/api/window.ts — planned shape
readonly menuBar = new MenuBarModel();

get menuBarOpen(): boolean { return this.menuBar.isOpen; }
toggleMenuBar(): void { this.menuBar.toggle(); }
openMenuBar(panelId?: string): void { this.menuBar.openLegacy(panelId); }
```

### 2. Make the native view consume the model instead of owning selection

1. Update `src/renderer/ui/sidebar/MenuBarView.ts` to consume the shared built-in/source-folder
   helper and `app.window.menuBar`. Delete the private `leftItemId` selection field and the
   `menuBarPanelId` subscription/`consumePanelId()` path.
2. Bind the view to the Menu Bar model's open/selected state and to `menuFolders.state` for list
   refresh. `folderListProps()`, `folderRecord()`, and `updateRightView()` must read the model's
   selected ID, so UI clicks, `window.menuBar.open(id)`, folder removal, and AiVision all observe
   one value. Keep the existing right-view dispatch to `OpenTabsListView`, `RecentFileListView`,
   `ToolsEditorsPanelView`, `ScriptLibraryPanelView`, and the user-folder `TreeProviderViewImpl`;
   this task changes ownership of selection, not those views' content behavior.
3. Change the backdrop close callback to call the idempotent model `close()` rather than toggling.
   Keep the Persephone header glyph's existing `toggleMenuBar()` action. Preserve the current
   `doDisplay`/`open` class and width behavior; no CSS change is needed.
4. Update `src/renderer/ui/app/MainPageView.ts` so the shell observes `app.window.menuBar.state`
   (or an equivalent model subscription) for the `MenuBarView` `open` prop, while the existing
   window state binding continues to drive maximize/zoom/MCP indicators. Do not reintroduce a
   second `menuBarOpen` copy in `MainPageState`.

Current versus planned selection path:

```ts
// src/renderer/ui/sidebar/MenuBarView.ts — current
private leftItemId = openTabsId;

private setLeftItem(folder: MenuFolder): void {
    const nextId = folder.id ?? "";
    if (nextId === this.leftItemId) return;
    this.leftItemId = nextId;
    this.refreshFolders();
    this.updateRightView();
}
```

```ts
// src/renderer/ui/sidebar/MenuBarView.ts — planned shape
private setLeftItem(folder: MenuFolder): void {
    const nextId = folder.id ?? "";
    if (nextId === this.props.menuBar.selected.id) return;
    this.props.menuBar.open(nextId);
    // The model subscription refreshes the list and right-hand view.
}
```

The exact prop plumbing may use the existing `app.window` singleton rather than adding a view
prop; the invariant is that `MenuBarView` no longer has an independent selected-ID authority.

### 3. Register `window.menuBar` and its descriptor

1. Add `src/renderer/scripting/ai-vision/namespaces/menu-bar.ts` beside the existing namespace
   descriptors. Describe the real `IMenuBar` object with members:

   | Member | Exact contract |
   |---|---|
   | `isOpen` | readonly boolean from the model; the backdrop remains in the DOM while closed and is CSS-hidden, so use this property and never element presence |
   | `folders` | live plain records `{ id: string, label: string, kind: "builtin" \| "user", path?: string }[]`; `path` is absent for built-ins and files-only virtual folders |
   | `selected` | the currently selected live folder record with the same shape |
   | `open` | `open(folderId?: string)`; no argument opens without changing selection, while an unknown ID/label/path throws with the complete valid ID/label/kind list |
   | `close` | `close()`; idempotently closes the Menu Bar |

   Add explanatory help that names the effective built-in IDs, says user IDs come from
   `folders`, and distinguishes `open(folderId)` from selecting by label or path.
2. Define `MENU_BAR_ELEMENTS` in contract order with these ten names and purposes: `menu-bar`,
   `menu-bar-content`, `menubar-open-file`, `menubar-new-window`, `menubar-about`,
   `menubar-settings`, `menubar-folders`, `menubar-content`, `menubar-add-folder-button`, and
   `menubar-splitter`. Omit `selector` so `createElements()` resolves each to
   `[data-name="<name>"]`, matching the contract. The `menu-bar` declaration's purpose must
   explicitly say: “The Menu Bar backdrop; it remains in the DOM while the Menu Bar is closed and
   is hidden with `display: none`, so `visible` is false then. Use `window.menuBar.isOpen` to learn
   whether it is open; never infer openness from element presence.” This warning belongs in the
   purpose string because it is the agent-facing explanation returned with `elements`, not only in
   this task's concerns.
3. Build the element behavior exactly as `ui.ts` does:

   ```ts
   const elements = createElements(MENU_BAR_ELEMENTS, ui.highlightElement.bind(ui));

   return {
       kind: "MenuBar",
       members: [...MENU_BAR_MEMBERS, ...elements.members],
       provide: elements.provide,
       elements: MENU_BAR_ELEMENTS,
       // summarize/help...
   };
   ```

   `elements` must stay on this descriptor; do not append the declarations or generated members to
   `src/renderer/scripting/ai-vision/namespaces/ui.ts`.
4. In `src/renderer/scripting/ai-vision/namespaces/window.ts`, add `menuBar` as a node member of
   the existing `Window` descriptor. Because `Window.menuBar` is a real property, the resolver will
   read it from the target; no `provide("menuBar")` shim is needed. Keep `menuBarOpen` in the
   existing window summary for compatibility, and let `window.menuBar` carry the detailed state.
   Update the `openMenuBar` member summary to say it is the legacy lenient method: unknown strings
   still open without changing selection. The `MenuBar` descriptor's `open` member summary must
   state the opposite: it rejects unknown IDs, labels, paths, and stale IDs with the complete valid
   folder list. The descriptor text should carry the distinction directly, for example:

   ```ts
   // Window descriptor
   summary: "Legacy sidebar opener; unknown strings still open it without changing selection."

   // MenuBar descriptor
   summary: "Open and select by a current folder ID; unknown IDs, labels, paths, and stale IDs are rejected with the valid folder list."
   ```
5. In `src/renderer/scripting/ai-vision/namespaces/index.ts`, import `describeMenuBar` and register
   `appWindow.menuBar` with `registerAiVisionFor()`, alongside the existing `appWindow` window
   descriptor registration. `src/renderer/scripting/api-wrapper/AppWrapper.ts` needs no change:
   it already returns `app.window` directly ([`AppWrapper.ts:99-101`](../../../src/renderer/scripting/api-wrapper/AppWrapper.ts#L99-L101)).

### 4. Add the shell QA scenarios and verification gates

1. Extend `qa/surfaces/shell.md` with Menu Bar scenarios, keeping the existing `call`-only/Haiku
   format:
   - discover `window.menuBar.folders` and report all four built-ins plus a temporary configured
     folder, including `kind`, ID, and label;
   - call `window.menuBar.open("recent-files")`, verify `isOpen === true` and `selected.id`;
   - call `window.menuBar.close()`, verify `isOpen === false` while the backdrop still exists and
     every Menu Bar element reports `visible: false`, then reopen and highlight
     `menubar-settings` or another visible declared control;
   - call `window.menuBar.open("Recent Files")` (and an unknown/stale ID), verify the call rejects
     with the bad value plus every valid ID, label, and kind, then recover in the same scenario by
     reading `folders` and calling `open("recent-files")` successfully;
   - verify the legacy `window.openMenuBar("Recent Files")` remains lenient and does not claim to
     select that label, while discovery points to the live ID list.
2. Add a regression check that `window.menuBar.elements` has the ten contract entries in table
   order and each resolved selector exactly matches `ui-element-contract.md`. The test must not
   use `[data-name="menu-bar"]` presence as the open assertion.
3. After implementation, run the repository gates from `package.json`: `npm run typecheck`,
   `npm run lint`, and `npm run build-prod`. No automated test runner is declared in the current
   package scripts; the surface QA file is the manual/agent acceptance artifact.

## Concerns

### Resolved: model state versus DOM state

`[data-name="menu-bar"]` remains mounted when closed and CSS hides it with `display: none`.
The implementation must therefore use `MenuBarModel.isOpen` for `window.menuBar.isOpen`; the
shared `offsetParent` measurement is only for element `visible` values. The same warning is part of
the `menu-bar` element purpose and the `isOpen` member summary so an agent sees it at decision time.

### Resolved: pending panel ID versus selected category

The existing `menuBarPanelId` is a transient hand-off from `openMenuBar()` to the view. The plan
replaces that duplicate channel with a reactive selected ID in the API model, so programmatic opens,
native clicks, user-folder removal, and AiVision reads converge on the same state. It is safe to
remove because the field is only in the in-memory `WindowState` default and its only two references
are the view subscription and the view's consume call; it is not part of persisted window restore.

### Resolved: strict node action versus legacy action

`window.menuBar.open(folderId?)` rejects unknown IDs, labels, paths, and stale IDs with a
self-correcting error containing the bad value and every current valid record's ID, label, and kind.
The legacy `window.openMenuBar(panelId?)` keeps its source-compatible lenient behavior: any truthy
string opens the sidebar, but only a current folder ID changes selection. The two descriptor
summaries must make this distinction explicit.

### Resolved: selector coverage and ownership

All ten contract selectors already have real assignments. The plan adds no selector aliases, does
not rename any `data-type`, and does not add child-view selectors to `window.menuBar.elements`.
Controls inside the selected content view remain future surface owners; decision 7 requires this
node's list to describe the Menu Bar chrome itself.

### Resolved: dynamic and malformed configured folders

The model computes its folder projection from the current `menuFolders.folders` on every read. It
does not hardcode the current four or cache user folders, and carries optional `path` through for
user folders while omitting it for built-ins and files-only virtual folders. It preserves the UI's
existing empty-ID behavior for malformed persisted records instead of inventing IDs that are not in
the source; normal `menuFolders.add()` records are actionable because that method generates IDs.

### Resolved: selected-folder removal timing

The fallback to Open Tabs already exists in `MenuBarView.refreshFolders()`: after the live list
changes, it re-checks the selected ID in a microtask and calls `setLeftItem(staticFolders[0])`.
The model will move that exact fallback, including microtask deferral, so the refactor preserves
notification timing and avoids changing list-refresh reentrancy; it does not introduce a new
fallback policy.

### Compatibility and scope boundary

`menuBarOpen`, `toggleMenuBar()`, and `openMenuBar(panelId?)` remain available. Their existing
unknown-string behavior is documented rather than silently changed. The new `menuBar.close()` is
idempotent and is the preferred close path for the Menu Bar node. No main-process code, automation
ref store, `ui.elements`, or old MCP tool is removed by this task.

## Acceptance Criteria

- `window.menuBar` resolves as a real nested node under the renderer `window` object, with a
  registered descriptor and no descriptor-only selection cache.
- `window.menuBar.isOpen` reads the model and remains correct when the backdrop is still present in
  the DOM but CSS-hidden.
- `window.menuBar.open()` opens without changing the current selection; `open(folderId)` uses the
  live folder ID set and rejects labels, paths, and unknown/stale IDs with a complete valid-record
  error; `close()` closes idempotently; the legacy window methods still work with their existing
  lenient behavior.
- `window.menuBar.folders` always contains the four built-ins plus every current
  `app.menuFolders.folders` record, represented by `id`, display `label`, `kind`, and optional
  `path` for path-backed user folders.
- `window.menuBar.selected` is the currently selected record and falls back to the first built-in
  when a selected user folder disappears.
- `window.menuBar.elements` and `window.menuBar.highlight(name, message?)` are supplied through
  `createElements`, contain exactly the ten contract entries in order, use the contract selectors,
  and are not present on `ui.elements`.
- Every contract selector is backed by the existing view assignment; no missing `data-name` remains,
  and no adjacent view's existing selector or `data-type` is renamed.
- `qa/surfaces/shell.md` covers dynamic folder discovery, selection/open/close, hidden-backdrop
  semantics, live element visibility, and highlight; typecheck, lint, and production build pass.
- Manual verification in the running app after implementation confirms: the Persephone glyph opens
  the Menu Bar; all four built-in categories switch the right-hand pane; a newly added folder can be
  selected; removing the selected folder falls back to Open Tabs; both backdrop and glyph close the
  Menu Bar; and `window.menuBarOpen`, `toggleMenuBar()`, and `openMenuBar("recent-files")` retain
  their prior behavior.
- The implementation scope is limited to selection ownership and the new node: no CSS, right-view
  content behavior, or existing `data-type` is changed.
- No implementation is performed as part of authoring this task document, and no dashboard entry is
  added or changed.

## Files Changed Summary

| File | Planned action | Reason |
|---|---|---|
| `src/renderer/api/menu-bar.ts` | **Add** | Shared Menu Bar model, built-in folder source, live folder projection, open/close/selection state. |
| `src/renderer/api/window.ts` | **Change** | Own the real `menuBar` model and delegate existing window methods; remove pending selection duplication. |
| `src/renderer/api/types/window.d.ts` | **Change** | Declare `IMenuBarFolder`, `IMenuBar`, and `IWindow.menuBar`. |
| `assets/editor-types/window.d.ts` | **Change** | Mirror the public window declarations for Monaco/script IntelliSense. |
| `src/renderer/ui/app/MainPageView.ts` | **Change** | Subscribe to the Menu Bar model's open state instead of duplicating it in `MainPageState`. |
| `src/renderer/ui/sidebar/MenuBarView.ts` | **Change** | Consume shared folder/state model, remove private selection and pending-ID handling, use idempotent close. |
| `src/renderer/scripting/ai-vision/namespaces/menu-bar.ts` | **Add** | `MenuBar` descriptor, dynamic state members, ten element declarations, `createElements` adapter. |
| `src/renderer/scripting/ai-vision/namespaces/window.ts` | **Change** | Advertise the real `menuBar` node member. |
| `src/renderer/scripting/ai-vision/namespaces/index.ts` | **Change** | Register the `MenuBar` model descriptor. |
| `qa/surfaces/shell.md` | **Change** | Add Menu Bar discovery, action, visibility, closed-backdrop, and highlight scenarios. |
| `doc/architecture/ui-element-contract.md` | **No change** | The contract's ten Menu Bar selectors already match source assignments. |
| `src/renderer/ui/sidebar/MenuBar.css` | **No change** | Existing `display: none`/`doDisplay` behavior is correct and is part of the acceptance test. |
| `src/renderer/ui/sidebar/OpenTabsListView.ts` | **No change** | Its `sidebar-open-tabs` selector belongs to selected content, not Menu Bar chrome. |
| `src/renderer/ui/sidebar/RecentFileListView.ts` | **No change** | No missing Menu Bar contract control is defined there. |
| `src/renderer/ui/sidebar/ToolsEditorsPanelView.ts` | **No change** | Its `tools-*` selectors belong to the selected Tools & Editors content. |
| `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts` | **No change** | Its `sidebar-*`/`script-library-*` selectors belong to selected content. |
| `src/renderer/ui/sidebar/FolderItemView.ts` | **No change** | Category rows use the existing `menubar-folders` list and generic list-item contract. |
| `src/renderer/ui/sidebar/BuiltinEditorsListView.ts` | **No change** | Selected-content selector, not a Menu Bar chrome selector. |
| `src/renderer/ui/sidebar/TrustedBoardsListView.ts` | **No change** | Selected-content selector, not a Menu Bar chrome selector. |
| `src/renderer/ui/sidebar/TrustedToolsListView.ts` | **No change** | Selected-content selector, not a Menu Bar chrome selector. |
| `src/renderer/ui/sidebar/PinnedRailView.ts` | **No change** | Selected-content rail has no missing Menu Bar contract control. |
| `src/renderer/scripting/ai-vision/elements.ts` | **No change** | Shared `createElements` already supplies live visibility and highlight. |
| `src/shared/ai-vision/types.ts` | **No change** | `provide` and `elements` descriptor fields already express this node. |
| `src/shared/ai-vision/resolver.ts` | **No change** | Resolver already reads real members and consults descriptor-owned `provide()`. |
| `src/renderer/scripting/api-wrapper/AppWrapper.ts` | **No change** | It already returns the live `app.window` object directly. |
