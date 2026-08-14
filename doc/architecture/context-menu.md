# Context Menu Architecture

## Overview

persephone uses a custom context menu system that replaces the native browser context menu. Right-click anywhere in the application shows a styled popup menu with context-specific items. The system uses **DOM event bubbling** — child components attach menu items to the native `contextmenu` event, and a global listener collects and displays them.

> **Boards are the exception.** A board runs in a cross-origin `board://` iframe and cannot reach the renderer's React tree or `showAppPopupMenu`, so it can't participate in the bubbling system described here. Instead, the injected board shim (`src/board-shim.ts`) renders its **own** minimal, vanilla-DOM context menu inside the frame — Open/Copy Link, Open Image in New Tab / Copy Image / Save Image As…, Cut/Copy/Paste, and Copy — themed from the injected `--p-*` variables. A board opts out by calling `preventDefault()` on the `contextmenu` event (bubble phase), the same convention it uses for Ctrl+S and link-click routing.

## Event Flow

```
User right-clicks
    |
    v
React onContextMenu handler (deepest child)
    -> ContextMenuEvent.fromNativeEvent(e, targetKind)
    -> Pushes items to ctxEvent.items
    |
    v  (DOM event bubbles up)
React onContextMenu handler (parent)
    -> Reuses same ContextMenuEvent via fromNativeEvent()
    -> Pushes more items
    -> Optionally fires EventChannel (sendAsync) for script integration
    -> Attaches promise to e.nativeEvent.contextMenuPromise
    |
    v  (DOM event bubbles to document)
GlobalEventService.handleContextMenu()
    -> e.preventDefault() (blocks native menu)
    -> Awaits contextMenuPromise if present
    -> Calls showAppPopupMenu(x, y, event.items)
    |
    v
AppPopupMenuModel
    -> Adds default items (Copy, Paste, Inspect)
    -> Shows Menu component via portal
```

## ContextMenuEvent on the Native Event

All context menu handlers communicate through a shared `ContextMenuEvent` object attached to the native DOM event:

```typescript
// Type augmentation (src/renderer/types/events.d.ts)
declare global {
    interface MouseEvent {
        contextMenuEvent?: ContextMenuEvent<unknown>;
        contextMenuPromise?: Promise<boolean>;
    }
}
```

### Creating or reusing the event

Use the static helper — it creates the event on first call and returns the existing one on subsequent calls:

```typescript
const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "my-target-kind");
ctxEvent.items.push({ label: "My Item", onClick: () => { ... } });
```

The first handler to call `fromNativeEvent()` sets the `targetKind`. Subsequent handlers in the bubbling chain reuse the same event object, so `targetKind` always reflects the deepest (most specific) component.

### ContextMenuEvent properties

```typescript
class ContextMenuEvent<T> extends BaseEvent {
    readonly targetKind: ContextMenuTargetKind;  // Source identifier
    target: T;                                    // Typed target data
    items: MenuItem[];                            // Mutable menu items
    handled: boolean;                             // Short-circuit flag (from BaseEvent)
}
```

- `targetKind` — string literal identifying the source (see Target Kinds below)
- `target` — typed data about what was right-clicked (e.g., `IFileTarget` for files)
- `items` — mutable array; handlers push, splice, or replace items freely
- `handled` — set to `true` by EventChannel subscribers to short-circuit the async pipeline

### Target Kinds

| Kind | Source | Target type |
|------|--------|-------------|
| `"page-tab"` | Tab bar | — |
| `"file-explorer-item"` | File/folder in explorer | `IFileTarget` |
| `"file-explorer-background"` | Empty space in explorer | — |
| `"sidebar-folder"` | Sidebar folder item | — |
| `"sidebar-background"` | Sidebar empty space | — |
| `"markdown-link"` | Link in markdown preview | — |
| `"browser-webview"` | Browser page content | — |
| `"browser-url-bar"` | URL bar | — |
| `"browser-tab"` | Browser tab | — |
| `"grid-cell"` | Grid cell | — |
| `"graph-node"` | Graph node | — |
| `"graph-area"` | Graph empty area | — |
| `"link-item"` | Link editor item | — |
| `"link-pinned"` | Pinned link item | — |
| `"generic"` | Generic list/component | — |

Target types marked with "—" are not yet wired to EventChannels. As new EventChannels are added, each will define its own typed target interface.

## Two Handler Patterns

### Pattern 1: Bubbling handlers (most common)

Handlers push items to `ContextMenuEvent.items` and let the event bubble to `GlobalEventService`:

```typescript
onContextMenu = (e: React.MouseEvent) => {
    const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "my-kind");
    ctxEvent.items.push(
        { label: "Action 1", onClick: () => { ... } },
        { label: "Action 2", onClick: () => { ... }, startGroup: true },
    );
    // No stopPropagation — event bubbles to GlobalEventService
};
```

**Used by:** PageTab, TreeProviderView, CategoryView, FolderItem, MenuBar, MarkdownBlock, BrowserTabs, BrowserUrlBar, LinkEditor, List component.

### Pattern 2: Non-bubbling handlers (direct display)

Some editors manage their own menus entirely, bypassing the bubbling system:

```typescript
// Build items manually, call showAppPopupMenu directly
const items: MenuItem[] = [ ... ];
showAppPopupMenu(clientX, clientY, items);
```

**Used by:** BrowserWebviewModel (IPC from webview), GraphViewModel (canvas events), AVGrid/ContextMenuModel (internal subscription). These handlers call `e.stopPropagation()` to prevent `GlobalEventService` from showing a duplicate menu.

## EventChannel Integration (Script Extension)

The EventChannel system allows scripts to subscribe to context menu events and modify items. Currently wired for file explorer items.

### How it works

1. **Item handler** sets the typed `target` on the event
2. **Container handler** (parent in the DOM tree) fires `sendAsync()` after all built-in items are collected
3. The promise is attached to `e.nativeEvent.contextMenuPromise`
4. `GlobalEventService` awaits the promise before showing the menu
5. Scripts see all items and can push, remove, or replace them

### Example: TreeProviderView

```
Tree cell onContextMenu
    -> onItemContextMenu: sets target, pushes file/folder items (Layer 1)
    -> Fires linkContextMenu.sendAsync (Layer 2)
       -> tree-context-menus handler adds "Open in New Tab", etc.
       -> Re-fires on fileExplorer.itemContextMenu (compat bridge, same items array)
          -> Scripts add/modify items
    -> Calls onContextMenu prop (Layer 3, parent additions)
    -> Attaches promise to contextMenuPromise
    |
    v  (bubbles)
GlobalEventService
    -> Awaits contextMenuPromise
    -> showAppPopupMenu with final items (copies array to avoid Immer freeze)
```

**Multi-selection.** In a multi-select tree or folder page (the Explorer panel and, for local-file
providers, the folder-content view), Layer 1 builds a plural menu
(`Copy Paths (N)` / `Cut (N)` / `Copy (N)` / `Delete (N)`) when the right-clicked row is part of a
selection of more than one; a right-click outside the selection moves the selection to that row and
builds the ordinary single-row menu. Layer 2 subscribers still receive one `event.target` — the
right-clicked row — so a handler that adds a singular action to a plural menu is possible in
principle; none does today. Layer 3 gets the selection explicitly: the `onContextMenu` prop is
called as `(event, selection)`, where `selection` is the pruned set the menu acts on (`[target]` for
a single row). A parent adding singular actions returns early when `selection.length > 1` — the
Explorer does this for *Make Root* and *Search in Folder*. The plural set is deliberately **not** a
field on the shared `ContextMenuEvent`: only this one consumer would ever set it.

The folder-content view (`CategoryView`, shown on a page when a folder is opened from
the Explorer) fires the **same** `linkContextMenu` channel for its file/folder items. So
the href-based items ("Open in New Tab", "Open in New Window", "Open with Default App",
"Show in File Explorer", "Open in Browser", …) are defined once in `tree-context-menus.tsx`
and appear identically in the Explorer tree and the folder page. The Categories list/tiles (`LinkItemList` /
`LinkItemTiles`) fire it too. A right-click on empty space in `CategoryView` adds "New
File" / "New Folder" scoped to the open category (gated on a writable provider), mirroring
the tree's `onBackgroundContextMenu`.

Where the folder page is multi-selectable it builds the same plural menu from the same
`buildMultiItemMenuItems` helper as the tree, with one difference: it **skips Layer 2** rather than
awaiting `contextMenuPromise`. The reason is the one above — a `linkContextMenu` subscriber receives
a single `event.target`, so letting a plural menu through would invite singular items onto a menu
that acts on N. The per-row hover action buttons stay singular for the same reason, and always
confirm.

"Open with Default App" (`shell.openPath` via `Endpoint.openPath`) is offered on **files
only**. A folder's "Show in File Explorer" is already that same `shell.openPath` call — on a
directory it opens an Explorer window there — so a second entry would duplicate it. On a file
"Show in File Explorer" is `shell.showItemInFolder`, which reveals rather than opens, hence
the separate item. `shell.openPath` does not throw on failure; it resolves with an error
string (typically "no application is registered for this extension"), which is why
`Endpoint.openPath` returns that string instead of discarding it as the older `showFolder`
endpoint does — otherwise an unopenable file looks like a menu item that does nothing.

Double-clicking a file in the Explorer tree runs the same action, giving the panel
Windows-Explorer behavior for formats Persephone has no editor for. The first of the two
clicks has already opened the file in a Persephone tab, so it opens in both places: the
alternative is debouncing every single click, and single-click navigation is the tree's hot
path. Directories are routed to a separate `onFolderDoubleClick` hook and keep
expand/collapse.

### Markdown links

`MarkdownBlock`'s `onContextMenu` builds its own items rather than firing `linkContextMenu` —
its target is an anchor in rendered HTML, not an `ILink` tree item. It offers "Open in New Tab"
first, then "Copy Link", then the browser items for `http(s)` links.

"Open in New Tab" is the pointer-only equivalent of Ctrl+click, which the view already
supports: a plain click navigates the current page in place (pushing the document onto the
page back-stack), and a modified click falls through to the anchor's default navigation, which
the main process routes into a new tab. Both are offered because a link can be followed with
one hand on the mouse. It is shown for every href except `http(s)` — already served by the
"Open in …Browser" items — and `#` anchors, which scroll in place and have no document to open.

The item omits `ILinkData.target`, unlike the in-place navigation in `MarkdownBody`, which
forces `"md-view"`. An existing page keeps its current editor unless told otherwise, so
navigating in place must name the editor; a new page has none to keep and picks from the file
name via `EDITOR_MATCHERS`. Passing `"md-view"` here would render a linked `.ts` file as
markdown. Omitting `pageId` is what makes the open handler call `openFile` (new tab) instead
of `navigatePageTo`.

### Script subscription example

```typescript
app.events.fileExplorer.itemContextMenu.subscribe((event) => {
    if (event.target.name === "package.json") {
        event.items.push({
            label: "Generate Deps Graph",
            onClick: () => { /* run script */ },
        });
    }
});
```

## Default Menu Items

`showAppPopupMenu()` calls `AppPopupMenuModel.addDefaultMenus()` which appends:

1. **Paste** — if clipboard has text and a text input/editable element is focused
2. **Copy** — if text is selected (via `window.getSelection()`)
3. **Inspect** — opens DevTools at click position (unless `skipInspect: true`)

These are added **after** all handler items, so custom items always appear first.

## MenuItem Interface

```typescript
interface MenuItem {
    label: string;              // Display text
    onClick?: () => void;       // Click handler
    icon?: any;                 // ReactNode icon (left side)
    disabled?: boolean;         // Greyed out, not clickable
    invisible?: boolean;        // Hidden from menu
    startGroup?: boolean;       // Separator line above this item
    hotKey?: string;            // Display shortcut text (right side)
    selected?: boolean;         // Initially highlighted
    id?: string;                // Identifier
    items?: MenuItem[];         // Submenu items (renders arrow icon)
    minor?: boolean;            // Lighter text styling
}
```

## Menu Component

`Menu` (`/src/renderer/uikit/Menu/Menu.tsx`) renders the actual menu:

- **Portal-based** — renders to `document.body` via React portal
- **Virtualized** — uses the `ListBox` primitive for performance with many items
- **Search filtering** — shows search field when items > 20
- **Submenu support** — items with `items[]` property render a submenu on hover
- **Keyboard navigation** — arrow keys, Enter, Escape, Page Up/Down
- **Dynamic sizing** — calculates width/height based on content

## Adding a New Context Menu

### For a new bubbling handler

1. Import `ContextMenuEvent` from `api/events/events`
2. In your `onContextMenu` handler:
   ```typescript
   const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "your-target-kind");
   ctxEvent.items.push(...yourItems);
   ```
3. Add your target kind to `ContextMenuTargetKind` union in `api/events/events.ts` and `api/types/events.d.ts`
4. Do NOT call `stopPropagation` — let the event bubble to `GlobalEventService`

### For a non-bubbling handler (canvas, IPC, etc.)

1. Build your `MenuItem[]` array
2. Call `showAppPopupMenu(x, y, items)` directly
3. Call `e.stopPropagation()` and `e.preventDefault()` to prevent duplicate menus

### For EventChannel integration (scriptable context menu)

1. Define a target interface (e.g., `IMyTarget`) in `api/types/events.d.ts`
2. Add an EventChannel to `AppEvents` (in `api/events/AppEvents.ts`)
3. In the deepest handler: set `ctxEvent.target` with typed data
4. In a parent handler (after all items collected): fire `sendAsync()` and attach promise to `contextMenuPromise`
5. Add the interface to `IAppEvents` in `api/types/events.d.ts`
6. Update `IApp` or event types for IntelliSense

## Key Files

| Purpose | File |
|---------|------|
| ContextMenuEvent class | `/src/renderer/api/events/events.ts` |
| EventChannel class | `/src/renderer/api/events/EventChannel.ts` |
| AppEvents namespace | `/src/renderer/api/events/AppEvents.ts` |
| Event type definitions | `/src/renderer/api/types/events.d.ts` |
| Native event augmentation | `/src/renderer/types/events.d.ts` |
| Global event handler | `/src/renderer/api/internal/GlobalEventService.ts` |
| Menu component | `/src/renderer/uikit/Menu/Menu.tsx` |
| showAppPopupMenu | `/src/renderer/ui/dialogs/poppers/showPopupMenu.tsx` |
| MenuItem type | `/src/renderer/api/types/events.d.ts` |
