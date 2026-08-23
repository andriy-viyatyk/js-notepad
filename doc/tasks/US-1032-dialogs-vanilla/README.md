# US-1032: `ui/dialogs/` vanilla conversion

**Status:** Active — implementation complete; live smoke routes and Rule 4 measurement outstanding

**Epic:** [EPIC-058: De-React Epic D — Shell and shared components](../../epics/EPIC-058.md)

## Goal

Convert the application dialog and popup hosts and their 13 named dialogs to stable
`VanillaView` implementations, while preserving the existing async helper APIs, dialog model
results, focus/keyboard behavior, and DOM contracts. Keep the four editor-registered views
React-compatible and leave `core/state/view.tsx`'s React `View` arm available for US-1033.

## Background

### Verified surface and unit accounting

The directory currently contains 19 tracked files and 2,233 lines:

| Group | Files | Current role |
|---|---:|---|
| Dialog host | `Dialogs.tsx` | Reads `dialogsState` with React and renders each registered view through `Views.renderView` |
| Named dialogs | 13 `.tsx` files: `CommitDialog`, `ConfirmationDialog`, `CreateBoardDialog`, `CreateBoardVarsStorageDialog`, `InputDialog`, `LibrarySetupDialog`, `NamespaceCollisionDialog`, `OpenUrlDialog`, `PasswordDialog`, `RegisterToolsetDialog`, `TextDialog`, `TorInfoDialog`, `TrustBoardDialog` | Each defines a `TDialogModel`, a React view, a `Views.registerView` call, and a `show*` helper |
| Popper path | `poppers/Poppers.tsx`, `poppers/showPopupMenu.tsx`, `poppers/grid-context-menu.tsx`, `poppers/types.ts` | Popup host, application context menu, av-grid adapter, and popper model types |
| Public barrel | `index.ts` | Re-exports the host and helper APIs |

The 19-file scope decomposes exactly into one host, 13 named dialogs, `index.ts`, and four
popper-path files. The task contains 13 named dialog registrations plus the `AppPopupMenu`
registration; `Poppers` is a host, not a fifteenth dialog, and `grid-context-menu` is an adapter.
The route table below also covers the three retained React poppers.

### Registry boundary and the four out-of-scope React registrations

`src/renderer/core/state/view.tsx` currently stores `viewId → React.FC` in a private `Map`. Its
public operations are:

```tsx
Views.registerView(viewId, ReactComponent);
Views.renderView(viewId, { model, className });
```

`renderView` returns a `ReactElement | null`; `View` uses the same React render arm. A repository
scan finds 18 `Views.registerView` call sites:

| Registration | Treatment in US-1032 |
|---|---|
| The 13 named dialogs under `src/renderer/ui/dialogs/` | Register native constructors and mount them from the vanilla dialog host |
| `src/renderer/ui/dialogs/poppers/showPopupMenu.tsx` | Register the native application popup constructor |
| `src/renderer/editors/browser/BrowserDownloadsPopup.tsx` | Keep React; it remains a `Poppers` compatibility child |
| `src/renderer/editors/grid/components/ColumnsOptions.tsx` | Keep React; it remains a `Poppers` compatibility child |
| `src/renderer/editors/grid/components/CsvOptions.tsx` | Keep React; it remains a `Poppers` compatibility child |
| `src/renderer/editors/link-editor/EditLinkDialog.tsx` | Keep React; it remains a `Dialogs` compatibility child |

The host cannot stop at a React-only registry lookup: the four editor files still call
`Views.registerView` with React components and their models are passed through `showDialog` or
`showPopper`. This task therefore uses a dialogs-local native registry, described in the plan
below: native hosts look there first and fall back to unchanged `Views.renderView(...)`. This
leaves `core/state/view.tsx` byte-identical, preserves the four editor registrations by
construction, and defers the shared registry contract to US-1033, which owns D4. The trade-off is
two registries keyed by the same `viewId` symbols and a documented native-first lookup order.

Across `src/renderer`, the only imported symbols from `core/state/view` are `Views` (20 imports),
`ViewPropsRO` (18), `DefaultView` (18), and `IDialogViewData` (2); `View` itself is imported
nowhere outside its own file. The React render arm must remain intact because EPIC-058 D4 and
US-1033 explicitly reserve that boundary.
`core/state/view.tsx` is also one of the four expected surviving Emotion importers at Epic D close;
it is untouched by this task, including its `styled` `ViewRoot`.

### Host APIs and their consumers

`src/renderer/ui/dialogs/Dialogs.tsx` exposes the following outward contract:

```tsx
export const dialogsState = new TGlobalState<IDialogViewData[]>([]);
export async function showDialog<R>(data: IDialogViewData): Promise<R>;
export const closeDialog = (viewId: symbol) => void;
```

Direct `showDialog` calls are in all 13 named dialog modules and in
`src/renderer/editors/link-editor/EditLinkDialog.tsx`. The latter is the out-of-scope React
compatibility case. `closeDialog` and `dialogsState` have no direct consumers elsewhere in
`src/renderer`; both remain public exports from `src/renderer/ui/dialogs/index.ts` and must retain
their signatures and semantics. `showDialog` must continue assigning `internalId`, installing
`model.onClose`, appending/removing the same data object in `dialogsState`, and returning the
model's result promise. Multiple open dialog objects with the same `viewId` must remain distinct;
the host must key dialog instances by data identity/`internalId`, not by the symbol alone.

`src/renderer/ui/dialogs/poppers/Poppers.tsx` has the parallel public contract
`showPopper`, `closePopper`, `visiblePoppers`, and `IPopperViewData`. Its current consumers are
the three out-of-scope React registrations (`BrowserDownloadsPopup`, `ColumnsOptions`, and
`CsvOptions`) plus the native `showAppPopupMenu` path. The native popper host must therefore mount
both native and React registrations without changing those APIs.

Before:

```tsx
return (
    <>
        {dialogs.map((dialogView) => (
            <React.Fragment key={dialogView.internalId}>
                {Views.renderView(dialogView.viewId, { model: dialogView.model, className: "dialog" })}
            </React.Fragment>
        ))}
    </>
);
```

After:

```tsx
export function Dialogs(): React.ReactElement {
    return mountVanilla(DialogsView, undefined);
}

// DialogsView subscribes to dialogsState, creates one native view or one retained
// React compatibility slot per data object, and disposes/removes only that slot.
```

The React-facing `Dialogs` and `Poppers` exports stay as thin `mountVanilla` faces because
`src/renderer/index.tsx` still renders `<Dialogs />` and `<Poppers />` inside `AppContent`.

### Existing vanilla infrastructure and relevant patterns

The implementation must use the existing infrastructure rather than create a dialog-specific
mount system:

- `src/renderer/uikit/shared/vanilla-view.ts` creates a stable root, supports `onMount`,
  `onUpdate`, `onDispose`, `bind`, `listen`, owned children, and idempotent disposal.
- `src/renderer/uikit/shared/mount.tsx` provides `mountVanilla` for the remaining React host and
  `mountReactHandle` for the deliberate React islands. `VanillaHost` attaches the native root
  before `mount()` and its `display: contents` wrapper must not become a visible layout item.
- `src/renderer/uikit/shared/fill-slot.ts` already supports text, Nodes, and React content. Its
  `releaseReactSlot` removes the React container first and defers `root.unmount()` with
  `queueMicrotask()` so a later commit cannot clear replacement content. Use this pattern for
  compatibility slots and for the Monaco child; do not synchronously unmount a nested React root
  while its parent is reconciling.
- `src/renderer/uikit/Dialog/DialogView.tsx` and `DialogContentView.tsx` are already vanilla
  lifecycle classes behind their React faces. Compose these classes directly, along with the
  existing `InputView`, `TextareaView`, `ButtonView`, `CheckboxView`, `RadioGroupView`,
  `LabelView`, `SpinnerView`, and `MenuView` classes. Do not introduce a `PanelView`; the existing
  `Panel` component is still a React shim.
- A repository scan verified that no vanilla view currently consumes `DialogView` or
  `DialogContentView` as classes. The only `*DialogView` hits outside `uikit/Dialog/` are unrelated
  React components under `editors/log-view/items/`. US-1032 is therefore the first native
  consumer of both paths; plan the native-children and first-open-focus behavior as unexercised
  infrastructure.
- `src/renderer/components/page-manager/PageManagerView.ts`, `AppPageManagerView.ts`, and
  `PageSlot.ts` establish the most relevant host-of-many-children pattern: stable child slots,
  explicit DOM ownership, retained nested React roots where needed, and detach-before-deferred-
  unmount disposal. `US-1031` is the direct precedent for this host.
- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` and
  `src/renderer/components/tree-provider/CategoryViewImpl.ts` demonstrate direct DOM arms,
  native UIKit children, state subscriptions, static CSS delivery, and stable root updates.

The model/view rules in `doc/standards/model-view-pattern.md` and `doc/de-react.md` require
state-driven updates, stable element identity, `document.createElement` for structure, no new
React outside a documented boundary, and preserved React-facing signatures during the migration.

### Dialog-specific source findings

- There are no `@emotion`, `react-dom/server`, or `createPortal` imports anywhere under
  `src/renderer/ui/dialogs/`.
- React hooks are used only by `CreateBoardDialog`, `CreateBoardVarsStorageDialog`, `InputDialog`,
  `PasswordDialog`, and `poppers/showPopupMenu.tsx`; they are local focus/callback/menu logic and
  can move to native lifecycle fields and event handlers. The remaining React references are
  event types/JSX or the Monaco editor package.
- `TextDialog.tsx` uses `@monaco-editor/react` and therefore needs one retained React child unless
  this task replaces that package with direct Monaco construction. The shell, dialog content,
  controls, and state bindings can still be vanilla.
- `poppers/showPopupMenu.tsx` imports `VirtualElement` from `@floating-ui/dom` as a type only.
  `src/renderer/uikit/Popover/PopoverView.tsx` and the rest of UIKit use the DOM package. Change
  this import to `@floating-ui/dom`; leave `@floating-ui/react` installed because
  `editors/browser/BrowserTabsPanel.tsx` calls `useFloating` and belongs to Epic E.
- `poppers/grid-context-menu.tsx` currently manufactures React icon elements for av-grid menu
  items. The native menu path must provide direct icon Nodes from the existing icon DOM builders;
  a string SVG source must not reach `fillSlot` as text. `theme/icons.tsx`'s
  `createIconWithViewBox` attaches `.createElement` (`SvgIconDomBuilder`) to every icon it
  produces, so the `ICONS` table should use calls such as `CopyIcon.createElement({...})` for its
  DOM arm.
- `uikit/Panel/Panel.tsx` is 382 lines and has no `PanelView`; `Panel.css` supplies only the
  data-attribute CSS half. The dialogs contain 50 of the 63 remaining non-story `<Panel>` sites,
  using 14 distinct props: `direction` (38), `gap` (35), `padding` (13), `justify` (13), `paddingX`
  (12), `align` (9), `paddingY` (7), `flex` (6), `paddingTop` (5), `paddingBottom` (5), and
  `width`, `shrink`, `paddingLeft`, and `overflow` (one each). Extract the shared resolution
  logic before transcribing these sites; the helper will also pay off for US-1033, US-1034, and
  US-1035.
- `LibrarySetupDialog.tsx` directly requires Node `fs` for `existsSync`/`mkdirSync`, and its catch
  reads `err.message`. The conversion must use `src/renderer/api/fs.ts` (`fs.exists`/`fs.mkdir`)
  and `errMessage` from `src/shared/utils.ts`, as required by the project coding rules.

## Verified route to every dialog and popup path

The following routes were found by tracing each `show*` helper or registered `viewId` to a caller.
They cover all 13 named dialogs and `AppPopupMenu`; the Poppers row also names the three retained
React poppers. They are the required smoke-test entry points; the three error-path units are deliberately
explicit.

| Unit | Helper / registration | Concrete route or script/API call | Verified source |
|---|---|---|---|
| Commit dialog | `showCommitDialog` / `commitDialogId` | Open the Git editor's Changes secondary panel, stage a change, and click the staged Commit action; `GitChangesView.doCommit` supplies the branch/identity and optional push action. | `src/renderer/editors/git-tree/GitChangesView.tsx` |
| Confirmation dialog | `showConfirmationDialog` / `confirmationDialogId` | Call the application UI API `ui.confirm(message, options)`; direct UI routes also cover board deletion, graph group actions, Git reset, and script overwrite. | `src/renderer/api/ui.ts`, `src/renderer/editors/explorer/BoardsSecondaryView.tsx`, `src/renderer/editors/graph/GraphGroupActionsModel.ts` |
| Create board dialog | `showCreateBoardDialog` / `createBoardDialogId` | In the Explorer Boards secondary view, click `+ New board` or choose the Demo-board action; `BoardsSecondaryView.handleCreate` and `handleCreateDemo` open it. | `src/renderer/editors/explorer/BoardsSecondaryView.tsx` |
| Create board-vars storage | `showCreateBoardVarsStorageDialog` / `createBoardVarsStorageDialogId` | Settings → Board Environment Variables → Create, or trigger a board `persephone.var.*` request while storage is not configured; both call the helper. | `src/renderer/editors/settings/sections/SettingsSections.tsx`, `src/renderer/api/board-vars/board-vars-bridge.ts` |
| Input dialog | `showInputDialog` / `inputDialogId` | Call `ui.input(message, options)`; the Script panel's Save Script flow and Graph/Mneme input actions are additional UI routes. | `src/renderer/api/ui.ts`, `src/renderer/editors/text/ScriptPanel.tsx` |
| Library setup dialog | `showLibrarySetupDialog` / `librarySetupDialogId` | Open the Script Library sidebar panel and choose setup, use Settings → Script Library → Browse when unlinked, or save a script with no configured library. | `src/renderer/ui/sidebar/ScriptLibraryPanel.tsx`, `src/renderer/editors/settings/sections/SettingsSections.tsx`, `src/renderer/editors/text/ScriptPanel.tsx` |
| Namespace collision dialog | `showNamespaceCollisionDialog` / `namespaceCollisionDialogId` | Register/trust a board whose explicit `author/name` namespace matches another trusted board; `confirmNamespaceNotColliding` is called by board registration and the board editor trust action. | `src/renderer/api/board-vars/namespace.ts`, `src/renderer/api/boards.ts`, `src/renderer/editors/board/BoardEditorView.tsx` |
| Open URL dialog | `showOpenUrlDialog` / `openUrlDialogId` | Use File → Open/Open URL from `MenuBar`, the tools-editor entry, or the keyboard open-file command; `PagesLifecycleModel.openFileWithDialog` opens it. | `src/renderer/api/pages/PagesLifecycleModel.ts`, `src/renderer/ui/sidebar/MenuBar.tsx`, `src/renderer/api/internal/KeyboardService.ts` |
| Password dialog | `showPasswordDialog` / `passwordDialogId` | Call `ui.password(options)` / `app.ui.password(...)` from a script or API consumer; this is the error/security path to smoke with encrypt and decrypt modes. | `src/renderer/api/ui.ts`, `src/renderer/api/types/ui.d.ts` |
| Register toolset dialog | `showRegisterToolsetDialog` / `registerToolsetDialogId` | Call MCP `create_toolset`, or open an untrusted `tools-manifest.json` in Explorer and activate its toolset action; both ask before trusting. | `src/renderer/api/mcp/tool-commands.ts`, `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` |
| Text dialog | `showTextDialog` / `textDialogId` | Call `ui.textDialog(options)` / `app.ui.textDialog(...)`; also run a script whose result is an error while output is suppressed, which `ScriptRunner.runWithResult` routes to “Script Error”. | `src/renderer/api/ui.ts`, `src/renderer/scripting/ScriptRunner.ts`, `src/renderer/editors/video/VideoEditor.ts` |
| Tor info dialog | `showTorInfoDialog` / `torInfoDialogId` | Open a Tor browser page and click the Tor connection/info action in the browser toolbar; `BrowserTorModel.showInfoDialog` supplies the page partition. | `src/renderer/editors/browser/BrowserView.tsx`, `src/renderer/editors/browser/BrowserTorModel.ts` |
| Trust board dialog | `showTrustBoardDialog` / `trustBoardDialogId` | Open an untrusted board and click Trust Board in `UntrustedBoardView`; board API and Board Info trust flows use the same helper. | `src/renderer/editors/board/BoardEditorView.tsx`, `src/renderer/api/boards.ts`, `src/renderer/editors/board-info/BoardInfoEditorModel.ts` |
| Poppers host | `Poppers` / private `popperState` | The host is mounted by `src/renderer/index.tsx`; exercise it through the application popup and through the three retained React poppers: browser Downloads, grid Columns options, and grid CSV options. | `src/renderer/index.tsx`, `src/renderer/editors/browser/BrowserDownloadsPopup.tsx`, `src/renderer/editors/grid/components/ColumnsOptions.tsx`, `src/renderer/editors/grid/components/CsvOptions.tsx` |
| Application popup menu | `showAppPopupMenu` / `showAppPopupMenuId` | Right-click anywhere handled by `GlobalEventService`, use a grid context menu through `showGridContextMenu`, and exercise direct Graph, Link, Rest, Browser, and Category callers. | `src/renderer/api/internal/GlobalEventService.ts`, `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx`, `src/renderer/editors/graph/GraphEditor.ts`, `src/renderer/editors/browser/webview-context-menu.ts` |

## Implementation plan

### Phase A progress

Phase A is complete for the infrastructure scope. The 13 named dialogs and the application
popup menu are still React registrations served by the host's `Views.renderView(...)` fallback
arm; their native conversions remain for later phases.

- [x] Added the native-children `DialogView` arm and shared Panel style helpers.
- [x] Added the dialogs-local native-first registry without changing `core/state/view.tsx`.
- [x] Converted the dialog and popper hosts to vanilla-backed compatibility hosts.
- [ ] Convert the 13 named dialogs and application popup menu in later phases.

### Phase B, Batch 1 progress

- [x] Converted `ConfirmationDialog`, `TrustBoardDialog`, `NamespaceCollisionDialog`,
      `RegisterToolsetDialog`, and `OpenUrlDialog` to native views.
- [ ] `CommitDialog`, `LibrarySetupDialog`, `TextDialog`, and `TorInfoDialog` remain on the React
      fallback arm.
- [ ] The application popup menu remains on the React fallback arm.

Batch 1 pattern decisions: native dialog children use `SlotContent` directly (with a
`DocumentFragment` for multiple DOM siblings); `createPanelElement` and `createTextElement` are
shared by the UIKit style modules, title updates target the existing title element, and dynamic
native controls own their active set through one cleanup rather than accumulating child records.

### Phase B, Batch 2a progress

- [x] Converted `CreateBoardDialog`, `CreateBoardVarsStorageDialog`, `InputDialog`, and
      `PasswordDialog` to native views, preserving their model APIs, keyboard behavior, async
      actions, validation, radio selection, and focus timing.
- [ ] `CommitDialog`, `LibrarySetupDialog`, `TextDialog`, and `TorInfoDialog` remain for a later
      batch.

### Phase B, Batch 2b progress

- [x] Converted `CommitDialog`, `LibrarySetupDialog`, `TextDialog`, and `TorInfoDialog` to native
      views, preserving their model APIs, keyboard behavior, dynamic controls, async actions,
      IPC state projection, and the approved single Monaco compatibility island.
- [ ] The application popup menu remains on the React fallback arm.

### Phase C progress

- [x] Converted `AppPopupMenu` to a native `MenuView` path and registered it through the
      dialogs-local native registry, preserving popup lifecycle, positioning, focus restoration,
      default actions, and overlay suppression.
- [x] Converted application and av-grid menu icons to direct DOM-node factories, preserving
      recursive item identity, grouping, and event propagation behavior.
- [x] Changed the `VirtualElement` type import to `@floating-ui/dom`; the single remaining
      `@floating-ui/react` importer is `editors/browser/BrowserTabsPanel.tsx`.
- [x] US-1032 implementation is complete.
- [ ] Live smoke routes, including the three retained React poppers, remain outstanding.
- [ ] Epic D Rule 4 before/after measurement remains outstanding.

### 1. Freeze the boundary and record the baseline

- Measure the Epic D Rule 4 dialog interaction before removing the React host. Use one settled
  normal dialog flow (open, type, close) and one application popup flow, recording the exact
  observation roots, observer options, raw records, and settled state. Record the before value in
  `doc/epics/EPIC-058.md`; repeat the identical actions after implementation. If live MCP is
  unavailable, record that measurement as pending with the reason rather than inventing a number.
- Reconfirm the two top-level mounts in `src/renderer/index.tsx`, all helper call sites in the
  route table, and the direct external `showDialog` caller in `EditLinkDialog.tsx`. No caller may
  change its helper signature or manually manage a dialog DOM node.
- Inspect the current dialog and popper DOM contracts before editing: `data-type`/`data-name`
  values, dialog focus restoration, `DialogContent` direct-child order, button/input names,
  overlay registration, and `display: contents` slot hosts. Check styles for direct-child,
  `:empty`, sibling, and positional selectors before adding any shared native helper.

### 2. Add the dialogs-local native view registry

- Add `src/renderer/ui/dialogs/dialog-view-registry.ts` with a `viewId → VanillaViewCtor`
  registry and explicit register/lookup operations for the 13 dialogs and `AppPopupMenu`.
- Have `DialogsView` and `PoppersView` look up the dialogs-local native constructor first. If no
  constructor is registered, fall back to unchanged `Views.renderView(...)` in a retained React
  compatibility slot. Native constructors return stable `VanillaView`-compatible instances with
  `root`, `mount`, `update`, and `dispose`.
- Leave `src/renderer/core/state/view.tsx` byte-identical: `Views.registerView`,
  `Views.renderView`, `DefaultView`, `ViewProps`, `IViewData`, `IDialogViewData`, and the `View`
  component remain the existing React contract. The four editor registrations therefore remain
  unchanged by construction, and US-1033 still owns the shared secondary-view registry contract.
- Do not modify `src/renderer/ui/secondary-views/secondary-view-registry.ts` or any editor
  registration file. Record the cost of two registries keyed by the same symbols and enforce the
  native-first lookup order rather than designing a shared registry without US-1033's requirements.

### 3. Convert the two hosts and reconcile native/React slots

- Add `src/renderer/ui/dialogs/DialogsView.ts` and keep `Dialogs.tsx` as the thin public
  `mountVanilla(DialogsView, undefined)` face. Move ownership of the module-level `dialogsState`
  and the existing `showDialog`/`closeDialog` implementation to `DialogsView.ts`, then re-export
  them from `Dialogs.tsx` and `index.ts`; the view imports its singleton directly, with no state
  props. Subscribe to that singleton in `onMount`, reconcile by `internalId`, and
  create exactly one owned slot for each data object. Native slots instantiate the registered
  constructor with `{ model, className: "dialog" }`; React slots use a view-owned
  `display: contents` container and `mountReactHandle` around `Views.renderView(...)`.
- On dialog data removal, detach the slot/root immediately, then defer disposal of a nested React
  root with the `fill-slot.ts` detach-then-microtask rule. Dispose native view resources before
  removing their root. Preserve `DialogView`'s previous-focus restoration and ensure a rejected
  or asynchronous close cannot leave a stale state entry or listener.
- Add `src/renderer/ui/dialogs/poppers/PoppersView.ts` and keep `Poppers.tsx` as its thin
  `mountVanilla(PoppersView, undefined)` face. Move ownership of the module-level `popperState`
  and helper implementation to `PoppersView.ts`; have `Poppers.tsx` re-export the unchanged
  public helpers and types. Reconcile the singleton directly by data identity, retain native popup instances,
  and mount the three editor React poppers through the compatibility arm.
- Reconcile poppers by object identity because `showPopper` never assigns `internalId`, unlike
  `showDialog`, which assigns `crypto.randomUUID()`. The current React host keys by
  `popper.viewId.toString()`, so two poppers sharing a `viewId` collide; identity-based slots fix
  that incidentally. Preserve `closePopper`'s current first-match `viewId` lookup semantics.
  Preserve `closePopper`, `visiblePoppers`, and the current `viewId`-based close lookup.
- Keep `src/renderer/ui/dialogs/Dialogs.tsx`, `poppers/Poppers.tsx`, and
  `src/renderer/index.tsx` at the same public import paths. The React `AppContent` remains a host
  for the two vanilla faces until US-1036 flips the root.

### 4. Move the 13 named dialog views to native classes

- Add one native view module beside each public dialog module: `CommitDialogView.ts`,
  `ConfirmationDialogView.ts`, `CreateBoardDialogView.ts`, `CreateBoardVarsStorageDialogView.ts`,
  `InputDialogView.ts`, `LibrarySetupDialogView.ts`, `NamespaceCollisionDialogView.ts`,
  `OpenUrlDialogView.ts`, `PasswordDialogView.ts`, `RegisterToolsetDialogView.ts`,
  `TextDialogView.ts`, `TorInfoDialogView.ts`, and `TrustBoardDialogView.ts`.
- Retain each existing `show*` export, result type, exported props, `viewId` symbol identity,
  model state shape, close/cancel result, and async action semantics in the existing `.tsx`
  module. The `.tsx` module becomes a thin public helper/registration face; the native module
  owns the model-to-DOM projection and registers its constructor with the dialogs-local native registry.
- First extend `src/renderer/uikit/Dialog/DialogView.tsx` with a native-children arm. When
  `children` is a `Node` or `Node[]`, pass it directly to `fillSlot(this.childrenHost, ...)` and
  call `runFocusPass()` after the append; retain the existing JSX wrapper and
  `DialogCommitSignal` layout-effect arm for React children. This is required because the current
  wrapper makes a DOM Node an invalid React child and because the layout effect is currently the
  only focus-pass caller. Add a focused acceptance check for first-open focus with native
  children. `DialogContentView.onMount` already passes its children directly to `fillSlot`.
- Use the existing `DialogView` and `DialogContentView` directly. Build Panel elements with
  `document.createElement`, the `panel-root` class, and shared
  `src/renderer/uikit/Panel/panel-style.ts` helpers: extract the existing resolution logic as
  `resolvePanelAttributes` / `applyPanelAttributes`, mirroring `uikit/Text/text-style.ts`, and
  make `Panel.tsx` consume the same helpers so side-specific props win over `paddingX`/`paddingY`,
  which win over `padding`. The existing `Panel.story.tsx` remains the regression check for the shared resolution behavior.
  Build Text as a `<span data-type="text">` with `applyTextAttributes` from
  `src/renderer/uikit/Text/text-style.ts`; Text has eleven data attributes and no class, while
  `panel-root` belongs only to Panel. Do not render `<Panel>` or `<Text>` React elements from the
  dialog path. Use native `InputView`, `TextareaView`, `ButtonView`, `CheckboxView`,
  `RadioGroupView`, `LabelView`, and `SpinnerView` children and retain stable fields for controls
  that are updated by state.
- Replace every `React.KeyboardEvent` handler with a native `KeyboardEvent` handler while
  retaining Escape, Enter, Ctrl/Cmd+Enter, validation, default-button, and async `canClose`
  behavior. Use `VanillaView.bind` with selectors for each model state projection; unsubscribe
  before child disposal and guard late async callbacks against a disposed view.
- Move focus effects from `useEffect`/refs into `onMount` and named `InputView` refs/fields:
  `CreateBoardDialog` chooses name versus folder, `CreateBoardVarsStorageDialog` focuses its
  path, and `InputDialog` focuses/selects its input. Preserve the current zero-delay behavior
  where it is needed for the attached native control.
- Preserve special behavior: `CreateBoardDialog` browse/scaffold retry, board-vars file creation,
  library browse/link/copy-examples, password validation, radio selection, Tor IPC loading and
  reconnect status, and all current `data-name` hooks used by automation and smoke tests.
- In `LibrarySetupDialogView.ts`, replace the direct Node `fs` calls with `fs.exists`/`fs.mkdir`
  from `src/renderer/api/fs.ts` and stringify failures through `errMessage`. This is a required
  coding-standard correction within the touched path, not a behavior change.

### 5. Handle TextDialog's deliberate Monaco React island

- Keep the dialog shell, content layout, buttons, `TextDialogModel`, editor text tracking, and
  close behavior native in `TextDialogView.ts`.
- Allocate one view-owned editor host and mount the existing `@monaco-editor/react` `Editor` into
  it with `mountReactHandle`. Re-render the retained handle when text/options/read-only state
  changes; never create a React root per state field or per button. Use the existing `onMount`
  focus callback and detach the host before deferred React disposal.
- Record this as a deliberate, approved compatibility island: converting the shell does not
  convert Monaco or invent a second Monaco integration. `@monaco-editor/react` has 19 importers,
  18 under `editors/`; US-1025's Planned work covers only the 54 language-icon bodies,
  `BoardGlyph`, and `react-dom/server`, so it does not block this task. The Epic D close
  conditions are satisfied by `mountReactHandle`: no React root at startup and `createRoot` only
  in `uikit/shared/mount.tsx`.

### 6. Convert the popper path and application popup

- Move `AppPopupMenu` from React hooks to a native class in
  `src/renderer/ui/dialogs/poppers/showPopupMenu.tsx` (or its thin native companion while
  retaining this import path). Create one stable `MenuView`, use its `Popover` positioning
  contract with the `VirtualElement` type imported from `@floating-ui/dom`, and register/unregister
  the menu root with `overlayRegistry` for the exact lifetime of the open popup.
- Keep `showAppPopupMenu`'s close-before-open behavior, default Copy/Paste/Inspect items, saved
  selection/range handling, focus restoration, `skipInspect`, `showPopper` result promise, and
  `closeAppPopupMenu` semantics. Convert icon values to direct DOM elements from the icon builders.
- Convert `poppers/grid-context-menu.tsx`'s `ICONS` table from React element factories to direct
  DOM-node factories, recursively preserve av-grid item identity and grouping, and retain its
  event propagation stop before calling `showAppPopupMenu`. Remove the file's React-only type or
  JSX dependency without changing the public `showGridContextMenu` signature.
- Keep `poppers/types.ts` and `index.ts`'s public type/value exports stable. `PoppersView` must
  remain able to host React `BrowserDownloadsPopup`, `ColumnsOptions`, and `CsvOptions` without
  converting or editing those editor files.

### 7. Verify consumers, styling, and lifecycle boundaries

- Confirm no dialog source imports `@emotion`, `react-dom/server`, `createPortal`, or
  `@floating-ui/react`; the only allowed React child in the converted unit is the explicitly
  documented Monaco bridge plus the four editor compatibility views mounted by the hosts.
- Confirm no `<Panel>`/`<Text>` JSX remains in `src/renderer/ui/dialogs/`, no dialog creates a
  React root for ordinary controls, and no native view replaces its stable root on a state update.
- Exercise all 13 dialog and `AppPopupMenu` routes in the table, including the three
  error/security paths, and all three editor popper compatibility registrations. Check first-open
  focus, Escape/backdrop/X close,
  Tab trapping, default buttons, validation errors, async retry paths, popup outside-click and
  Escape dismissal, context-menu icons, Tor reconnect, Monaco editing, and focus restoration.
- Run `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check`. Repeat the
  exact Rule 4 interaction and record the after measurement in `EPIC-058.md` (or an explicit
  pending reason). The global `@floating-ui/react` count must remain one because
  `BrowserTabsPanel.tsx` is Epic E; do not uninstall the package here.


## Concerns / Open questions

### 1. Resolved decisions

The scope is one host plus 13 named dialogs, `index.ts`, and four popper-path files; the route
table covers those 13 dialogs, `AppPopupMenu`, and the three retained React poppers. The approved
Monaco island remains one `mountReactHandle` child, and the native registry is dialogs-local with
native-first lookup and an unchanged React fallback. These are recorded decisions, not blockers.

### 2. Rule 4 live measurement

The required dialog and popup interaction-cost measurement needs the running app and the same
observation roots before and after conversion. If the live MCP is unavailable, the task can still
be typechecked, linted, built, and route-smoked manually, but the epic record must say “pending”
with the concrete availability reason rather than claim a number.

## Acceptance criteria

- [x] `Dialogs` and `Poppers` keep their existing public React-facing mounts and are backed by
      native host views with explicit state subscriptions and idempotent disposal.
- [x] The dialogs-local registry uses native-first lookup and a `Views.renderView(...)` fallback;
      `core/state/view.tsx` remains byte-identical. It retains a working React arm for
      `EditLinkDialog`, `BrowserDownloadsPopup`, `ColumnsOptions`, and `CsvOptions`, while the 13
      named dialogs and `AppPopupMenu` use native constructors.
- [x] `showDialog`, `closeDialog`, `dialogsState`, `showPopper`, `closePopper`, and
      `visiblePoppers` signatures and result/close semantics are unchanged.
- [ ] All 13 named dialogs and `AppPopupMenu` have been opened through their concrete UI/API/error
      paths, with the three retained React poppers, first-open focus, close behavior, and async
      paths verified.
- [x] `DialogView` accepts native `Node`/`Node[]` children without JSX wrapping, appends them via
      `fillSlot`, and runs the focus pass directly; native first-open focus is verified. The
      existing direct-child path in `DialogContentView` remains valid.
- [x] The 13 dialog shells preserve their names, sizing, icons, buttons, state projections,
      keyboard handling, validation, model results, and focus restoration; no `<Panel>` JSX or
      dialog-specific React render loop remains.
- [x] `Panel.tsx` and the native dialog Panel arms share `resolvePanelAttributes` and
      `applyPanelAttributes`, preserving the documented side-specific/padding precedence; Text
      arms use `applyTextAttributes` and never receive `panel-root`.
- [x] `TextDialog` retains editable/read-only Monaco behavior through one documented nested React
      bridge, with detach-before-deferred-unmount disposal and no per-control React roots.
- [x] `showPopupMenu.tsx` imports `VirtualElement` from `@floating-ui/dom`; no value import from
      `@floating-ui/react` remains under `ui/dialogs/poppers/`, and the package remains installed
      for `editors/browser/BrowserTabsPanel.tsx`.
- [x] `LibrarySetupDialog` uses `api/fs` and `errMessage`; no direct `require("fs")` or unsafe
      caught-error message access remains in the touched dialog path.
- [x] No `@emotion`, `react-dom/server`, or `createPortal` import remains under
      `src/renderer/ui/dialogs/`; `core/state/view.tsx` remains the documented Epic D Emotion
      survivor.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass,
      and the Rule 4 before/after record is added to `EPIC-058.md` or explicitly marked pending.

## Files that need no changes

These files were verified as consumers or compatibility boundaries and must remain unchanged in
this task unless compilation exposes a concrete contract defect:

- `src/renderer/index.tsx` — its `<Dialogs />` and `<Poppers />` mounts remain valid through
  the public faces.
- `src/renderer/editors/browser/BrowserDownloadsPopup.tsx`
- `src/renderer/editors/grid/components/ColumnsOptions.tsx`
- `src/renderer/editors/grid/components/CsvOptions.tsx`
- `src/renderer/editors/link-editor/EditLinkDialog.tsx`
- All helper consumers listed in the route table, including `src/renderer/api/ui.ts`,
  `src/renderer/api/pages/PagesLifecycleModel.ts`, board trust/vars APIs, editor callers, and
  `src/renderer/scripting/ScriptRunner.ts`.
- `src/renderer/ui/secondary-views/secondary-view-registry.ts` and
  `src/renderer/core/state/view.tsx`; the latter is byte-identical and retains its React/Emotion
  implementation for US-1033 and D6.
- `src/renderer/uikit/Input/`, `Textarea/`, `Button/`, `Checkbox/`,
  `RadioGroup/`, `Label/`, `Spinner/`, `Menu/`, `Popover/`, `fill-slot.ts`,
  `mount.tsx`, and `vanilla-view.ts`; consume their existing native infrastructure rather
  than modify it.

## Related work

- [EPIC-058](../../epics/EPIC-058.md) — D4 registry/compatibility decision, D6 Emotion survivors,
  D7 Floating UI boundary, and the explicit 13-dialog route concern.
- [US-1031](../US-1031-page-manager-append-child/README.md) — host-of-many-children and deferred
  React-slot disposal precedent.
- [US-1037](../US-1037-tree-provider-view/README.md), [US-1038](../US-1038-category-view/README.md),
  and [US-1030](../US-1030-git-tree-vanilla/README.md) — recent native view and compatibility
  patterns.
- [Model/View pattern](../../standards/model-view-pattern.md) and
  [De-React roadmap](../../de-react.md).

## Files Changed summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1032-dialogs-vanilla/README.md` | This investigation and implementation plan |
| `doc/active-work.md` | Move US-1032 from an unlinked Planned task entry to a linked Active entry |
| `src/renderer/ui/dialogs/dialog-view-registry.ts` | Dialogs-local `viewId → VanillaViewCtor` registry with native-first host lookup |
| `src/renderer/ui/dialogs/Dialogs.tsx` | Thin `mountVanilla(DialogsView, ...)` public face; preserve helper exports |
| `src/renderer/ui/dialogs/DialogsView.ts` | New state-driven host and native/React slot reconciliation |
| `src/renderer/uikit/Dialog/DialogView.tsx` | Native `Node`/`Node[]` children arm and direct first-open focus pass |
| `src/renderer/uikit/Panel/Panel.tsx` | Consume the shared Panel attribute-resolution helpers |
| `src/renderer/uikit/Panel/panel-style.ts` | Shared `resolvePanelAttributes` / `applyPanelAttributes` helpers |
| `src/renderer/ui/dialogs/CommitDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/ConfirmationDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/CreateBoardDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/CreateBoardVarsStorageDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/InputDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/LibrarySetupDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/NamespaceCollisionDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/OpenUrlDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/PasswordDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/TextDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/TorInfoDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/TrustBoardDialog.tsx` | Preserve the public helper/types and register the native constructor |
| `src/renderer/ui/dialogs/CommitDialogView.ts` | Native Commit model/view, controls, bindings, async action, and disposal |
| `src/renderer/ui/dialogs/ConfirmationDialogView.ts` | Native Confirmation model/view, controls, bindings, and disposal |
| `src/renderer/ui/dialogs/CreateBoardDialogView.ts` | Native Create Board model/view, controls, focus, async action, and disposal |
| `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts` | Native board-vars storage model/view, controls, focus, async action, and disposal |
| `src/renderer/ui/dialogs/InputDialogView.ts` | Native Input model/view, controls, radio selection, focus, and disposal |
| `src/renderer/ui/dialogs/LibrarySetupDialogView.ts` | Native library setup model/view, controls, filesystem action, and disposal |
| `src/renderer/ui/dialogs/NamespaceCollisionDialogView.ts` | Native collision model/view, controls, and disposal |
| `src/renderer/ui/dialogs/OpenUrlDialogView.ts` | Native Open URL model/view, textarea, buttons, and disposal |
| `src/renderer/ui/dialogs/PasswordDialogView.ts` | Native password model/view, validation, controls, and disposal |
| `src/renderer/ui/dialogs/RegisterToolsetDialogView.ts` | Native toolset confirmation model/view, controls, and disposal |
| `src/renderer/ui/dialogs/TextDialogView.ts` | Native text-dialog shell and one retained Monaco React bridge |
| `src/renderer/ui/dialogs/TorInfoDialogView.ts` | Native Tor model/view, IPC state projection, controls, and disposal |
| `src/renderer/ui/dialogs/TrustBoardDialogView.ts` | Native trust model/view, controls, and disposal |
| `src/renderer/ui/dialogs/poppers/Poppers.tsx` | Thin `mountVanilla(PoppersView, ...)` public face; preserve popper API |
| `src/renderer/ui/dialogs/poppers/PoppersView.ts` | New native popper host with React compatibility slots |
| `src/renderer/ui/dialogs/poppers/showPopupMenu.tsx` | Native application popup view, DOM Floating UI type, direct menu icons, and preserved helper |
| `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx` | Replace React icon factories with direct icon Nodes; preserve av-grid menu adapter API |
| `src/renderer/ui/dialogs/poppers/types.ts` | Type-only adjustments only if the native/React compatibility host requires them; preserve public types |
| `src/renderer/ui/dialogs/index.ts` | Preserve exports; change only if native type re-exports require an exact compatibility update |
