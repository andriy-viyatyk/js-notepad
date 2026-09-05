# US-1299: `menus` root node

**Epic:** [EPIC-084](../../epics/EPIC-084.md)  
**Status:** In Progress
**Depends on:** [US-1297: attention on every call result](../US-1297-call-attention/README.md) and
[US-1298: dialogs root node](../US-1298-dialogs-node/README.md) for the established attention and
root-node patterns

## Implementation progress

- [x] Add the direct `MenusNode` / popup adapter and root registration.
- [x] Define nested label-path addressing and safe item snapshots.
- [x] Route agent clicks through the existing callback-then-close behavior.
- [x] Replace popup attention fallback text with real `menus[0]` paths.
- [ ] Manually verify popup, submenu, disabled, invisible, separator, and prefixed-window cases.

## Goal

Expose the live application popup menu as an indexed `menus` root node, with a safe flattened item
view and `click(label)` / `close()` actions. Replace US-1297's popup fallback text with real
`menus[0]` paths while preserving the exact callback and dismissal behavior used by a user click.

## Background

### Verified popup lifecycle

The application popup is renderer-owned. `src/renderer/ui/dialogs/poppers/showPopupMenu.ts:18-26`
defines its state as `{ x, y, items, skipInspect }`, where `items` is the recursive
`MenuItem[]`; `AppPopupMenuModel` begins at :28. `showAppPopupMenu()` closes any existing app
popup at :226-229, copies the caller's items at :234-239, adds the default Paste/Copy/Inspect
items through `addDefaultMenus()` at :29-132, and publishes one `IPopperViewData` entry with
`showPopper()` at :241-249. The existing `getVisibleAppPopupMenu()` helper at
`showPopupMenu.ts:215-217` already selects that entry by its private `showAppPopupMenuId` without
serializing callbacks.

`src/renderer/ui/dialogs/poppers/PoppersView.ts:6-34` stores the live popper entries and
`showPopper()` removes an entry when its model closes at :121-134; `visiblePoppers()` returns the
current array at :141. Other poppers share this array, so the menus node must continue using
`getVisibleAppPopupMenu()` and must never treat every popper as a menu.

The source item contract is `MenuItem` in
`src/renderer/core/events/context-menu.ts:3-25`: `label`, optional `onClick`, `disabled`,
`invisible`, `startGroup`, `selected`, and recursive `items`, plus presentation fields. There is
no `enabled` or `checked` source field. The node will expose positive, agent-facing names derived
from the user-facing view:

| Exposed field | Verified source mapping |
|---|---|
| `label` | The visible caption, qualified for descendants as `Parent > Child` so it is also the argument accepted by `click(label)`. |
| `enabled` | `!item.disabled`, additionally false for a descendant below a disabled submenu parent because that path cannot be opened by the user. |
| `checked` | `Boolean(item.selected && !item.items?.length)`, matching `MenuView.ts:195-203`, which shows a check mark in the menu for selected leaf items. |
| `hasSubmenu` | `Boolean(item.items?.length)`, matching the submenu branch in `MenuModel.ts:190-199` and `MenuView.ts:204-212`. |
| `indexPath` | Original zero-based array positions at each nesting level, e.g. `[2, 1]`; invisible entries remain gaps so the path identifies the source item exactly. |

`MenuModel.derivePrepared()` omits invisible items and carries their `startGroup` separator marker
to the next visible sibling at `src/renderer/uikit/Menu/MenuModel.ts:143-164`. Therefore the node
will omit invisible items and their entire subtrees, emit no separator records, and retain neither
separator rows nor invisible entries as `items` records. `startGroup` is visual decoration on the
following visible row, not an actionable item. Disabled items remain listed with `enabled: false`.
The `selected` field is dual-purpose: `MenuModel.ts:114` also uses it to choose the initially
highlighted row. A caller that set `selected` only for pre-highlighting a leaf will consequently
be reported as `checked: true`, because that is the same field and the same check-glyph rule the
user sees; there is no separate source toggle-state field to substitute.

### Verified user activation and submenu behavior

The user-facing row click reaches `MenuModel.onRowClick()` and `activate()` at
`src/renderer/uikit/Menu/MenuModel.ts:190-203`. A disabled item is ignored; a submenu parent opens
the submenu instead of invoking a callback; a leaf invokes `item.onClick?.()` and then calls the
menu's `onClose(true)`. The app popup supplies that close callback in
`src/renderer/ui/dialogs/poppers/showPopupMenu.ts:176-186`, where it calls the popup model's
`close()`. Nested `MenuView` instances receive `item.items` and the same close cascade at
`src/renderer/uikit/Menu/MenuView.ts:255-293`.

The public action will use a qualified nested label path, not a flat leaf label. For example,
`menus[0].items` reports `File` with `indexPath: [0]` and `File > Open` with `indexPath: [0, 1]`;
the action is `menus[0].click("File > Open")`. A submenu parent itself is not an actionable leaf:
`click("File")` rejects with an instruction to choose a descendant. Matching is exact and an
ambiguous qualified label is rejected rather than choosing arbitrarily. `indexPath` is discovery
identity and is not a second click API because the requested surface is `click(label)`.

Agent activation must call the same `MenuItem.onClick` callback and the same popup model
`close()` used by the user path. It must not mutate `items`, invoke a different page command, or
only call `close()` (which would dismiss without performing the action). This preserves the
existing callback side effects and any future `canClose`/dismiss behavior on the `TDialogModel`
base. The callback is invoked with the current item and is not awaited, matching
`MenuModel.activate()`; the adapter awaits the model close so the resolver observes completion of
the dismissal. Unknown, invisible, submenu-parent, and disabled labels produce ordinary action
errors through the shared resolver's catch at `src/shared/ai-vision/resolver.ts:124-148`.

There is currently one application popup slot: `showAppPopupMenu()` replaces an existing app
popup before publishing a new one. The root is still indexed (`menus[0]`) to mirror `dialogs` and
to leave the public shape ready if the popup layer later exposes more than one menu. With no app
popup open, `menus.children()` is `[]`; reading `menus` is successful and returns an empty node,
while an explicit stale `menus[0]` action receives the resolver's normal “No item” error.

### Existing AiVision and attention pattern

`src/renderer/scripting/ai-vision/dialogs/index.ts:51-93` is the completed sibling pattern:
the node implements `IAiVisible` directly, reads live state in `children()` / `index()`, and its
per-entry adapters expose real resolver members. The menus implementation will use the same
direct adapter approach with no `registerAiVision()` or `registerAiVisionFor()` call. The shared
contract says descriptors enumerate side-effect-free dynamic children at
`src/shared/ai-vision/types.ts:44-64`, and the resolver reads/invokes real named properties at
`src/shared/ai-vision/resolver.ts:90-161`.

Load the stable node from `src/renderer/scripting/ai-vision/root.ts` alongside the existing
direct `DialogsNode` import at :1-2. The current root member list is at
`:33-55`, the help examples at :57-74, and the stable `dialogsNode`/getter at :82 and :100.
`menus` should be `node: true` because reading it only snapshots `getVisibleAppPopupMenu()` and
the menu items; it must not open, focus, click, or close anything.

US-1297 currently collects the popup at
`src/renderer/scripting/ai-vision/attention.ts:103-110` and formats only labels at :140-153. Its
placeholder explicitly says “The menus node coming in US-1299” at :142. After this task,
`formatPopup()` will consume the menus adapter and report the real qualified actions, for example:

~~~
Attention: a popup menu is open.
Items: File, File > Open, File > Save (disabled)
Resolve it with menus[0].click("File > Open") or menus[0].close().
~~~

The attention collector will still use the existing `getVisibleAppPopupMenu()` boundary and will
not invoke a callback while formatting attention. The existing `prefixAttentionPaths()` function,
defined in `src/main/mcp/tools/call-tools.ts:85` and invoked for forwarded attention at :154, must
rewrite both `dialogs[` and `menus[` from one recognised-root list, so a `windows[i]` prefix makes
every quoted path match the path supplied by the agent and future EPIC-085+ roots require only a
list entry.

## Implementation Plan

1. Add `src/renderer/scripting/ai-vision/menus/index.ts` with a `PopupMenuAdapter` and a
   `MenusNode`. Keep the adapter object implementing `aiVision` directly, as the completed dialog
   adapters do; do not add a shared registry. `MenusNode.children()` returns one `[0]` child only
   when `getVisibleAppPopupMenu()` is present, and `index()` accepts a non-negative numeric
   index, returning `undefined` for every index when no popup is open. The node's members are
   `items`, `click(label: string)`, and `close()`.
2. In the adapter, read the current popup state through `getVisibleAppPopupMenu()` on every
   operation. Flatten visible items depth-first in source order, carrying the original recursive
   array index into `indexPath` and a qualified `label` path. Skip an invisible item and its
   descendants; do not create records for `startGroup` separators. Derive `enabled`, `checked`,
   and `hasSubmenu` exactly from the table above, and never expose `onClick`, icons, or arbitrary
   model fields. `items` is a JSON-safe snapshot, not a live callback-bearing object.
3. Implement exact label resolution in `menus/index.ts`: compare the requested string to the
   qualified visible leaf labels, reject no-match and ambiguous matches, reject disabled leaves,
   and reject submenu parents with a “choose a descendant” error. Re-read the current popup before
   invoking so a closed/replaced menu cannot be acted on through a stale adapter.
4. Extend `src/renderer/ui/dialogs/poppers/showPopupMenu.ts` with a narrow action helper used by
   the adapter. The helper must invoke the selected current item's `onClick` and then await that
   popup's `model.close()`; this is the same callback-then-close sequence as
   `MenuModel.activate()` plus `AppPopupMenuView.menuProps()`. Make `closeAppPopupMenu()` return an
   awaitable completion for the adapter while keeping existing fire-and-forget callers valid.
   Preserve the existing close-on-open behavior and focus restoration in `showAppPopupMenu()`.
5. Import `MenusNode` in `src/renderer/scripting/ai-vision/root.ts`, add the `menus` member and
   a stable `menusNode` getter, and add root help showing `menus[0].items`, a nested
   `menus[0].click("Parent > Child")`, and `menus[0].close()`. Keep the node renderer-local and
   do not alter the script-facing `app` or Board plain-value APIs.
6. Update `src/renderer/scripting/ai-vision/attention.ts:103-153` to construct/use `MenusNode`
   and format the qualified item labels plus real `menus[0].click(...)` and `.close()` paths.
   Remove the US-1299 placeholder text only after the adapter path exists. Preserve attention's
   independent-of-hints behavior, its JSON-safe failure fallback, and the no-callback guarantee.
7. Refactor the exact `prefixAttentionPaths()` function defined in
   `src/main/mcp/tools/call-tools.ts:85` (used at :154) so its recognised renderer-attention roots
   come from one list (currently `dialogs` and `menus`) and the function maps that list, rather
   than adding a second hardcoded `menus[` replacement beside the existing `dialogs[` replacement.
   This keeps later EPIC-085+ attention roots as list entries instead of requiring another rewrite
   edit.
   Preserve main-local routing and existing pending/result rendering.
8. Manually verify: no popup, one popup with invisible/separator/disabled/checked items, nested
   menus, duplicate labels, a disabled submenu, callback execution, popup closure/focus restore,
   and an explicit `windows[i]` attention path. Run the existing typecheck/lint/build checks
   required by the epic after implementation; this task document itself implements nothing.

### Before → after snippets

Current root and attention contracts:

~~~
// root.ts
{ name: "dialogs", kind: "property", node: true, summary: "Open renderer dialogs ..." }

// attention.ts:140-142
function formatPopup(items: readonly MenuItem[]): string {
    const labels = flattenVisibleLabels(items);
    return `... The menus node coming in US-1299; use browser_snapshot/browser_click ...`;
}
~~~

Planned menus node and resolved attention:

~~~
// menus/index.ts
interface MenuItemInfo {
    label: string;
    enabled: boolean;
    checked: boolean;
    hasSubmenu: boolean;
    indexPath: readonly number[];
}

class PopupMenuAdapter implements IAiVisible {
    get items(): readonly MenuItemInfo[] { return snapshotVisibleItems(); }
    async click(label: string): Promise<undefined> { /* current item callback, then model.close() */ }
    async close(): Promise<undefined> { /* current popup model.close() */ }
    get aiVision(): IAiVisionDescriptor { return POPUP_MENU_DESCRIPTOR; }
}

// attention.ts
return `Attention: a popup menu is open. Items: ${...}. Resolve it with
menus[0].click(${JSON.stringify(leafLabel)}) or menus[0].close().`;

// call-tools.ts:85, used at :154
const ATTENTION_PATH_ROOTS = ["dialogs", "menus"];
for (const root of ATTENTION_PATH_ROOTS) {
    text = text.replaceAll(`${root}[`, `${prefix}${root}[`);
}
~~~

## Concerns / Resolved Decisions

- **Nested addressing:** use qualified nested label strings (`Parent > Child`) for `click(label)`.
  The flattened `items` snapshot includes both parents and leaves, while `indexPath` records the
  original array positions. A parent is an opener, not a leaf action; duplicate qualified labels
  are rejected as ambiguous.
- **Invisible items and separators:** invisible items and their subtrees are omitted. `startGroup`
  is a separator marker transferred to the next visible row by `MenuModel`; it never becomes an
  item record or consumes a public visible index. Raw `indexPath` values may still skip invisible
  source positions by design.
- **Enabled and checked semantics:** `enabled` is the effective user reachability of the item,
  derived from `disabled` and disabled ancestors. `checked` mirrors the actual `MenuView` check,
  so a selected submenu parent is not reported checked when the view does not render a check. The
  same `selected` flag also controls the initial highlight at `MenuModel.ts:114`; therefore a
  pre-highlighted leaf can legitimately be reported checked, and this mapping must not be changed
  to imply a distinct toggle state.
- **No menu state:** the root remains readable with empty children. Only an explicitly stale
  indexed child/action fails; no menu-open error is raised merely by reading `menus`.
- **User-equivalent activation:** the adapter must invoke the existing callback and then the same
  popup model close path. It must not call a page command by label, mutate the menu state, or use a
  browser click as a substitute. This retains callback side effects and future dismissal gates.
- **Popup multiplicity:** the current app popup helper exposes at most one app popup because
  `showAppPopupMenu()` closes the same view ID before opening another. The indexed root preserves
  the dialogs-shaped contract without claiming multiple live entries today.
- **No registry:** a direct adapter is justified because there is one app-popup model shape and
  `getVisibleAppPopupMenu()` is already the stable ownership boundary; no constructor/view-id
  adapter dispatch is needed.
- **No native dialog work:** native OS dialog tracking is US-1301. This task reports and drives
  renderer popup menus only.

## Acceptance Criteria

1. `menus` is discoverable from the AiVision root and help text; `menus.children()` is empty when
   no application popup is open and contains the live `[0]` popup otherwise.
2. `menus[0].items` is JSON-safe, source-ordered, depth-first, and contains visible items with
   `label`, `enabled`, `checked`, `hasSubmenu`, and original `indexPath`; invisible entries and
   separator records are absent.
3. Nested items are addressed by exact qualified label path, e.g.
   `menus[0].click("File > Open")`; unknown, ambiguous, disabled, invisible, and submenu-parent
   labels fail without invoking a callback.
4. A successful click invokes the selected item's existing `onClick` and closes through the same
   popup model path as a user leaf click; `close()` dismisses through that same model path and
   awaits completion.
5. `attention.ts:140` no longer emits the US-1299 placeholder. Open-popup attention includes real
   `menus[0].click(...)` and `menus[0].close()` paths and never invokes menu callbacks.
6. `prefixAttentionPaths()` in `src/main/mcp/tools/call-tools.ts` rewrites both `dialogs[...]` and
   `menus[...]` from one recognised-root list to the agent's prefixed spelling; `main.*` and other
   main-local routes remain unchanged.
7. No dialog adapter, native OS dialog driver, script/Board return envelope, browser-tool removal,
   or unrelated popup implementation is added by this task.

## Files Changed Summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1299-menus-node/README.md` | This verified investigation and implementation plan. |
| `doc/active-work.md` | Link US-1299 under EPIC-084 and keep it unchecked. |
| `doc/epics/EPIC-084.md` | Link US-1299 in the epic task table. |
| `src/renderer/scripting/ai-vision/menus/index.ts` | New direct `PopupMenuAdapter` and live indexed `MenusNode`. |
| `src/renderer/scripting/ai-vision/root.ts` | Import/register `menus`, add its root member, getter, and help examples. |
| `src/renderer/scripting/ai-vision/attention.ts` | Replace popup fallback formatting with resolved menus paths. |
| `src/renderer/ui/dialogs/poppers/showPopupMenu.ts` | Expose awaitable callback-then-close helpers for menu actions. |
| `src/main/mcp/tools/call-tools.ts` | Prefix `menus[...]` paths for forwarded-window attention. |

Files intentionally needing NO changes for US-1299:

| File/group | Reason |
|---|---|
| `src/renderer/core/events/context-menu.ts` | `MenuItem` is the verified source contract; the node adapts it without changing callers. |
| `src/renderer/ui/dialogs/poppers/Poppers.ts`, `PoppersView.ts`, `types.ts` | Existing live popper storage and `visiblePoppers()` are reused through `getVisibleAppPopupMenu()`. |
| `src/renderer/uikit/Menu/MenuModel.ts`, `MenuView.ts`, `Menu/index.ts` | Existing user activation, filtering, submenu, separator, and check rendering are the behavior to mirror. |
| `src/shared/ai-vision/types.ts`, `resolver.ts`, `hint.ts`, `help-search.ts`, `result-shaper.ts` | The existing direct-descriptor, dynamic-child, resolver, help, and shaping contracts are sufficient. |
| `src/renderer/scripting/ai-vision/dialogs/**` | US-1298's completed dialog adapters are a pattern only; menus need no dialog registry or changes. |
| `src/renderer/api/mcp/command-registry.ts`, `call-command.ts`, `board-call-command.ts`, `src/board-shim.ts`, `src/main/board-bridge.ts` | Existing dispatch and plain-value script/Board contracts remain unchanged. |
| `src/main/mcp/renderer-bridge.ts`, `src/main/mcp/ai-vision/**` | Main transport and main-owned roots do not own renderer popup state. |
| `src/renderer/api/internal/GlobalEventService.ts`, `src/renderer/ui/dialogs/poppers/grid-context-menu.ts`, and popup callers | They already publish `MenuItem[]` through `showAppPopupMenu()`; no caller-specific edits are needed. |
| `src/ipc/**`, `src/main/**` native-dialog files | Native OS dialog reporting belongs to US-1301, not the renderer menus node. |
