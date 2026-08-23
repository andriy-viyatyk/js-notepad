/**
 * Show av-grid's context menu through Persephone's own popup menu.
 *
 * This is the file [EPIC-057 C4-5](../../../../../doc/epics/EPIC-057.md) moves the
 * `showAppPopupMenu` call *into*. The old React grid performed this handoff in UIKit; the current
 * exemption until US-1023 deletes it with the rest of the React grid — nothing here changes that
 * file.
 *
 * It lives app-side because that is the whole point: `uikit/` may not reach into `ui/`, and a grid
 * that wants the application's menu therefore hands the event outward through
 * `onGridContextMenu` instead of calling the app shell itself.
 *
 * ## What actually needs adapting
 *
 * Not the item shape. av-grid's `MenuItem` and Persephone's (`core/events/context-menu.ts`) are
 * field-for-field identical — `label`, `onClick`, `disabled`, `invisible`, `startGroup`, `hotKey`,
 * `selected`, `minor`, `id`, `items` — and Persephone's `icon` is typed `any`, so av-grid's items
 * are already structurally assignable. There is no mapping to write.
 *
 * Only the icons. av-grid's built-in items carry **SVG source strings**, and the menu's icon slot
 * goes through `fillSlot`, which writes a string as `textContent` — so an unadapted item renders
 * its own `<svg …>` markup as visible text in the menu. That is what the stable `avg-` ids exist
 * for: match on the id, swap in the Persephone icon element, and the menu is indistinguishable
 * from the one the React grid drew.
 */

import { CopyIcon, DeleteIcon, PasteIcon, PlusIcon } from "../../../theme/icons";
import type { MenuItem } from "../../../uikit/Menu";
import type { GridContextMenuEvent } from "../../../uikit/DataGrid";
import { showAppPopupMenu } from "./showPopupMenu";

/**
 * The fourteen ids av-grid 2.2.0 ships, and the icon each takes.
 *
 * Read from the av-grid built-in item contract, so the menu looks the same before and after
 * the migration. Match on the id and never on the label — the row labels carry a count and a
 * pluralised `rowNoun` (`Insert 3 links`), which is exactly why the ids were added upstream.
 *
 * The three `avg-copy-as-*` submenu children are deliberately absent: they carry no icon today.
 */
const ICONS: Record<string, () => Node> = {
    "avg-copy": () => CopyIcon.createElement!({}),
    "avg-copy-as": () => CopyIcon.createElement!({}),
    "avg-paste": () => PasteIcon.createElement!({}),
    "avg-insert-rows": () => PlusIcon.createElement!({}),
    "avg-add-rows": () => PlusIcon.createElement!({}),
    "avg-delete-rows": () => DeleteIcon.createElement!({}),
    "avg-insert-columns": () => PlusIcon.createElement!({}),
    "avg-add-columns": () => PlusIcon.createElement!({}),
    "avg-insert-column": () => PlusIcon.createElement!({}),
    "avg-delete-columns": () => DeleteIcon.createElement!({}),
    "avg-delete-column": () => DeleteIcon.createElement!({}),
};

/**
 * Replace the library's string icons with Persephone icon elements, recursively.
 *
 * Two rules, both about not breaking a host's own items:
 *
 *  • Only ids starting `avg-` are touched. Items a host contributed through
 *    `getContextMenuItems` share this array, and their icons are already React elements.
 *  • An unrecognised `avg-` id **drops** the icon rather than throwing. `showAppPopupMenu`
 *    substitutes `EmptyIcon` when any sibling has one, so a future built-in this table does not
 *    know degrades to alignment padding instead of raw SVG text.
 */
function adaptIcons(items: readonly MenuItem[]): MenuItem[] {
    return items.map((item) => {
        const isLibraryItem = item.id?.startsWith("avg-") ?? false;
        const nested = item.items ? adaptIcons(item.items) : undefined;

        if (!isLibraryItem) {
            return nested ? { ...item, items: nested } : item;
        }

        const icon = ICONS[item.id as string]?.();
        return { ...item, icon, ...(nested ? { items: nested } : {}) };
    });
}

/**
 * Draw the grid's context menu with the application's popup menu.
 *
 * Wire it straight into a grid:
 *
 * ```tsx
 * <DataGrid rows={rows} onGridContextMenu={showGridContextMenu} />
 * ```
 *
 * `extra` goes above the grid's own items, for a host action that belongs to the page rather than
 * to the grid. Prefer av-grid's `getContextMenuItems` when the action belongs to the *selection* —
 * those items arrive inside `items` already, with the grid's own grouping applied.
 */
export function showGridContextMenu<R>(
    e: GridContextMenuEvent<R>,
    items: readonly MenuItem[],
    extra?: readonly MenuItem[],
): void {
    const menu = [...(extra ?? []), ...adaptIcons(items)];
    if (!menu.length) return;

    // Stop the event, or this menu is replaced by the generic one.
    //
    // `GlobalEventService.handleContextMenu` is a `document`-level listener that shows the app
    // menu for whatever items the event carries — and it does not check `defaultPrevented`, so
    // av-grid's own `preventDefault()` does not spare us. `showAppPopupMenu` closes any open menu
    // as its first statement, so letting the event through means the grid's menu opens and is
    // immediately replaced by a bare Copy / Inspect one. The React grid stopped the event here
    // too (the former React grid did the same), which is the convention rather than a
    // workaround. Found in US-1020; the story panel that would have caught it was never run.
    e.event.stopPropagation();

    void showAppPopupMenu(e.x, e.y, menu);
}
