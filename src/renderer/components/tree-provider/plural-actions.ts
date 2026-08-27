// Set-shaped tree-provider actions shared by TreeProviderViewModel (the Explorer
// tree) and CategoryViewModel (the folder-content page). Everything here operates on
// plain `ILink` items, never on a tree node, so both views can use one implementation
// of the D9 pruning rule, the plural menu labels and the batch delete.
//
// Sibling to `os-clipboard.ts` (which owns the OS clipboard I/O these menu items call).

import type { ILink, ITreeProvider } from "../../api/types/io.tree";
import type { MenuItem } from "../../uikit/Menu";
import { ui } from "../../api/ui";
import { isUrlOrCurl } from "../../content/link-utils";
import { CopyIcon, CutIcon, DeleteIcon } from "../../theme/icons";
import { copyPathsToOsClipboard, supportsOsClipboard } from "./os-clipboard";

/** Ctrl/Shift multi-selection is offered where item hrefs are absolute local paths and
 *  every plural action (OS clipboard, batch move, drag-out) is therefore meaningful.
 *  Archive / Mneme / Link / Boards trees stay single-select. Widening the feature to
 *  another provider is a one-line change here. */
export function supportsMultiSelect(provider: ITreeProvider): boolean {
    return provider.type === "file";
}

/**
 * Drop any selected item that lives inside another selected folder. A folder-level action
 * already affects everything under it, so keeping the descendants would double-process them —
 * a delete would fail on the second pass, a move would look for an already-moved source, and
 * Windows would copy the same file twice.
 *
 * Path-prefix test, case-insensitive, on `href`. Correct for the file provider (hrefs are
 * absolute paths) and for the archive / category providers (hrefs are `/`-joined inner
 * paths). A provider whose hrefs are not path-shaped returns its input unchanged — the
 * prefix test just never matches.
 *
 * EVERY plural action must run its input through this, at the action's entry point.
 */
export function pruneNestedItems<T extends Pick<ILink, "href" | "isDirectory">>(items: T[]): T[] {
    const dirs = items
        .filter((i) => i.isDirectory)
        .map((i) => i.href.replace(/\\/g, "/").toLowerCase().replace(/\/?$/, "/"));
    return items.filter((i) => {
        const href = i.href.replace(/\\/g, "/").toLowerCase();
        // `href !== d.slice(0, -1)` keeps a selected folder from pruning itself.
        return !dirs.some((d) => href !== d.slice(0, -1) && href.startsWith(d));
    });
}

/** Set-shaped actions over N selected items. `items` must already be pruned, so every count
 *  shown here is the pruned count. */
export function buildMultiItemMenuItems(
    provider: ITreeProvider,
    items: ILink[],
    onDelete: () => void,
): MenuItem[] {
    const hrefs = items.map((i) => i.href);
    const hasRoot = hrefs.includes(provider.rootPath);
    const n = items.length;
    const menuItems: MenuItem[] = [];

    menuItems.push({
        label: items.every((x) => isUrlOrCurl(x.href))
            ? `Copy Hrefs (${n})`
            : `Copy Paths (${n})`,
        icon: CopyIcon.createElement(),
        onClick: () => navigator.clipboard.writeText(hrefs.join("\n")),
    });

    // OS file clipboard — Windows Explorer interop, file provider only. No Cut when the
    // tree root is in the set (mirrors the single-row gating). A folder's listed children
    // never include the provider root, so the guard is inert for the folder-content view.
    if (supportsOsClipboard(provider)) {
        if (!hasRoot) {
            menuItems.push({
                startGroup: true,
                label: `Cut (${n})`,
                icon: CutIcon.createElement(),
                onClick: () => copyPathsToOsClipboard(hrefs, true),
            });
        }
        menuItems.push({
            startGroup: hasRoot,
            label: `Copy (${n})`,
            icon: CopyIcon.createElement(),
            onClick: () => copyPathsToOsClipboard(hrefs, false),
        });
    }

    if (provider.writable && provider.deleteItem && !hasRoot) {
        menuItems.push({
            startGroup: true,
            label: `Delete (${n})`,
            icon: DeleteIcon.createElement(),
            onClick: onDelete,
        });
    }

    return menuItems;
}

/**
 * What `deleteItemsBatch` did, so the caller knows what still needs doing. The three cases
 * refresh differently, which is why this isn't a boolean:
 *   • `"none"`  — nothing was attempted (no capability, empty set, cancelled confirm). No refresh.
 *   • `"single"` — one item after pruning; `onSingle` ran and owns its own confirm AND refresh.
 *   • `"batch"` — N items deleted; the caller should clear its selection and refresh.
 */
export type BatchDeleteOutcome = "none" | "single" | "batch";

/**
 * Confirm once, then delete every item. Prunes nested selections first, so a folder plus files
 * inside it deletes the folder only — and the count in the confirm is the pruned count (count
 * only, no name list).
 *
 * `onSingle` handles the one-item case so each view keeps its own singular confirm wording and
 * its own refresh; nothing changes for the common case.
 */
export async function deleteItemsBatch(
    provider: ITreeProvider,
    items: ILink[],
    onSingle: (item: ILink) => Promise<void>,
): Promise<BatchDeleteOutcome> {
    if (!provider.deleteItem || !items.length) return "none";

    const targets = pruneNestedItems(items);
    if (!targets.length) return "none";
    if (targets.length === 1) {
        await onSingle(targets[0]);
        return "single";
    }

    const bt = await ui.confirm(
        `Do you want to delete ${targets.length} items?`,
        { title: "Delete Confirmation", buttons: ["Delete", "Cancel"] },
    );
    if (bt !== "Delete") return "none";

    const errors: string[] = [];
    const progress = await ui.createProgress("Deleting...");
    try {
        await progress.show((async () => {
            let done = 0;
            for (const target of targets) {
                progress.label =
                    `Deleting ${done + 1} of ${targets.length}: ${target.title}`;
                try {
                    await provider.deleteItem?.(target.href);
                } catch (err) {
                    errors.push(`${target.title}: ${err?.message || "failed"}`);
                }
                done++;
            }
        })());
    } catch (err) {
        ui.notify(err?.message || "Failed to delete.", "warning");
    }
    if (errors.length) {
        const shown = errors.slice(0, 5).join("\n");
        const more = errors.length > 5 ? `\n(+${errors.length - 5} more)` : "";
        ui.notify(`Some items could not be deleted:\n${shown}${more}`, "warning");
    }

    return "batch";
}
