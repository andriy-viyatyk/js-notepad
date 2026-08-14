// Drop-shaped tree-provider actions shared by TreeProviderViewModel (the Explorer tree)
// and CategoryViewModel (the folder-content page): move a set of items into a folder,
// import dropped files, handle an OS-file drop.
//
// Every function here takes a target *descriptor* rather than a tree node — the callers'
// only tree-specific job is resolving "where did this land" into a `DropTarget`. None of
// these functions refresh anything; each returns whether the caller should re-list.
//
// Not moved: `importLinksTo`. It is the fourth drop branch and catalog-provider-only
// (`provider.importLinks`), which the file provider never implements — so the
// folder-content view can never reach it and it stays in TreeProviderViewModel. The drop
// dispatch is therefore split across two places on purpose.

import type { IFileLink, ILink, ITreeProvider } from "../../api/types/io.tree";
import { ui } from "../../api/ui";
import { copyPathsInto } from "../../core/utils/copy-files";
import { fpDirname, fpNormalizeForCompare } from "../../core/utils/file-path";
import { pruneNestedItems } from "./plural-actions";
import { supportsOsClipboard } from "./os-clipboard";

/**
 * Where a drop lands.
 *
 * `path` is what gets passed to `provider.list` and `copyPathsInto`, and its exact flavor
 * differs by action — which is why the two are not unified:
 *   • `moveItemsInto` wants the provider's **list path** (the tree's `getListPath`: the
 *     archive provider's inner path, not its `archive.zip!inner` href).
 *   • `dropOsFilesInto` wants the target folder's **category href**, which for the file
 *     provider — the only provider that reaches it — is the same absolute path.
 *
 * `title` is the folder name shown in the confirm dialogs ("Move 3 items to "src/"?").
 */
export interface DropTarget {
    path: string;
    title: string;
}

/**
 * Move `sourceItems` into `target`. Branch order is load-bearing:
 *   1. `moveToCategory` — link/catalog providers, batch, no confirm.
 *   2. `supportsOsClipboard` — the file provider (hrefs are absolute paths): batch move via
 *      `copyPathsInto`, i.e. the same machinery the clipboard paste and the OS-file drop use,
 *      so N items move with one confirm, one progress overlay and collected per-item failures.
 *   3. `provider.rename` with exactly one item — Mneme's provider-level single-item move.
 *
 * Testing `rename` before `supportsOsClipboard` would be a bug: `MnemeTreeProvider` implements
 * `rename`, but its hrefs are not local absolute paths, so `copyPathsInto` would be handed
 * something it cannot resolve.
 *
 * Returns true when the caller should re-list.
 */
export async function moveItemsInto(
    provider: ITreeProvider,
    sourceItems: ILink[],
    target: DropTarget,
): Promise<boolean> {
    const targetPath = target.path;

    // Separate directory (category) items from regular link items
    const dirItems = sourceItems.filter((i) => i.isDirectory);
    const linkItems = sourceItems.filter((i) => !i.isDirectory);
    const dirsHandled = !!(provider.renameCategoryPath && dirItems.length);

    // Move category sub-trees via renameCategoryPath (link providers)
    if (dirsHandled) {
        for (const dir of dirItems) {
            await provider.renameCategoryPath?.(dir.href, targetPath);
        }
    }

    // Items still needing handling: links always, dirs only if not handled above
    const remaining = dirsHandled ? linkItems : sourceItems;

    if (provider.moveToCategory && remaining.length) {
        await provider.moveToCategory(remaining.map((i) => i.href), targetPath);
    } else if (supportsOsClipboard(provider) && remaining.length) {
        if (!(await moveFilesInto(provider, remaining, target))) return false;
    } else if (provider.rename && remaining.length === 1) {
        const source = remaining[0];
        const newPath = targetPath
            ? targetPath + "/" + source.title
            : source.title;

        const bt = await ui.confirm(
            `Move "${source.title}" to "${target.title}/"?`,
            { title: "Move", buttons: ["Move", "Cancel"] },
        );
        if (bt !== "Move") return false;

        try {
            await provider.rename(source.href, newPath);
        } catch (err) {
            ui.notify(err.message || "Failed to move.", "warning");
            return false;
        }
    } else {
        return false;
    }

    return true;
}

/**
 * Move N absolute-path items into `target` (file providers only). Returns false when the
 * caller should skip its refresh — nothing was attempted (all no-ops, an illegal
 * folder-into-itself move, or a cancelled confirm).
 */
async function moveFilesInto(
    provider: ITreeProvider,
    items: ILink[],
    target: DropTarget,
): Promise<boolean> {
    const targetPath = target.path;

    // Prune again rather than trusting the sender: a drag from a tree arrives pruned
    // (dragItemsFor), but a cross-window drop is a raw payload.
    const targets = pruneNestedItems(items);
    const targetCmp = fpNormalizeForCompare(targetPath);

    // Sources already sitting in the target folder are pure no-ops — skip them silently
    // (copyPathsInto does the same, but filtering here keeps them out of the confirm count).
    const moving = targets.filter(
        (i) => fpNormalizeForCompare(fpDirname(i.href)) !== targetCmp,
    );
    if (!moving.length) return false;

    // A folder can't move into itself or one of its own descendants — copyPathsInto throws
    // on this, but catching it after the confirm would be a worse experience.
    const illegal = moving.find((i) => {
        if (!i.isDirectory) return false;
        const srcCmp = fpNormalizeForCompare(i.href);
        return targetCmp === srcCmp || targetCmp.startsWith(srcCmp + "/");
    });
    if (illegal) {
        ui.notify(`Cannot move folder "${illegal.title}" into itself.`, "warning");
        return false;
    }

    const label = moving.length === 1
        ? `"${moving[0].title}"`
        : `${moving.length} items`;
    const bt = await ui.confirm(
        `Move ${label} to "${target.title}/"?`,
        { title: "Move", buttons: ["Move", "Cancel"] },
    );
    if (bt !== "Move") return false;

    // Overwrite-collision confirm (same wording/pattern as importFilesInto / dropOsFilesInto).
    const existing = new Set(
        (await provider.list(targetPath)).map((l) => l.title.toLowerCase()),
    );
    const clashing = moving
        .filter((i) => existing.has(i.title.toLowerCase()))
        .map((i) => i.title);
    if (clashing.length) {
        const ob = await ui.confirm(
            `${clashing.length} item(s) already exist here and will be overwritten:\n${clashing.join(", ")}`,
            { title: "Overwrite?", buttons: ["Overwrite", "Cancel"] },
        );
        if (ob !== "Overwrite") return false;
    }

    const progress = await ui.createProgress("Moving...");
    try {
        const result = await progress.show(
            copyPathsInto(moving.map((i) => i.href), targetPath, {
                move: true,
                onProgress: (done, total, name) => {
                    progress.label = `Moving ${done} of ${total}: ${name}`;
                },
            }),
        );
        if (result.errors.length) {
            const shown = result.errors.slice(0, 5).join("\n");
            const more = result.errors.length > 5
                ? `\n(+${result.errors.length - 5} more)`
                : "";
            ui.notify(`Some items could not be moved:\n${shown}${more}`, "warning");
        }
    } catch (err) {
        ui.notify(err?.message || "Failed to move.", "warning");
    }
    return true;
}

/** Import dropped file-like items (IFileLink) into `targetCategory`. Confirms before
 *  overwriting same-named files. Returns true when the caller should re-list. */
export async function importFilesInto(
    provider: ITreeProvider,
    items: IFileLink[],
    targetCategory: string,
): Promise<boolean> {
    if (!provider.importFiles || !items.length) return false;

    // Collision check via the provider's existing list(); confirm overwrite.
    // Only meaningful for file-backed providers (those with fs rename) where a
    // same-named file would be overwritten. Catalog providers (link collections)
    // dedupe by href inside importFiles, so skip the title-based overwrite prompt.
    if (provider.rename) {
        const existing = new Set((await provider.list(targetCategory)).map((l) => l.title));
        const clashing = items.filter((i) => existing.has(i.name)).map((i) => i.name);
        if (clashing.length) {
            const bt = await ui.confirm(
                `${clashing.length} file(s) already exist here and will be overwritten:\n${clashing.join(", ")}`,
                { title: "Overwrite files?", buttons: ["Overwrite", "Cancel"] },
            );
            if (bt !== "Overwrite") return false;
        }
    }

    try {
        await provider.importFiles(items, targetCategory);
    } catch (err) {
        ui.notify(err.message || "Failed to import files.", "warning");
        return false;
    }
    return true;
}

/** OS-file drop into a file-backed folder. Real files (with a path) get a Move / Copy /
 *  Cancel choice; byte-only items (e.g. a Mneme doc dragged in) can't be "moved", so they
 *  fall back to the plain byte import. File providers only — non-file providers route
 *  straight to `importFilesInto`. Returns true when the caller should re-list. */
export async function dropOsFilesInto(
    provider: ITreeProvider,
    items: IFileLink[],
    target: DropTarget,
): Promise<boolean> {
    if (!items.length) return false;

    const targetDir = target.path;
    const paths = items.map((i) => i.filePath).filter((p): p is string => !!p);
    const allRealFiles = paths.length > 0 && paths.length === items.length;

    // Byte-only content can't be relocated — keep the existing import (copy/write).
    if (!allRealFiles) {
        return importFilesInto(provider, items, targetDir);
    }

    const label = items.length === 1 ? `"${items[0].name}"` : `${items.length} items`;
    const bt = await ui.confirm(`Move or copy ${label} into "${target.title}"?`, {
        title: "Move or Copy",
        buttons: ["Move", "Copy", "Cancel"],
    });
    if (bt !== "Move" && bt !== "Copy") return false;
    const move = bt === "Move";

    // Overwrite-collision confirm (same wording/pattern as importFilesInto).
    const existing = new Set(
        (await provider.list(targetDir)).map((l) => l.title.toLowerCase()),
    );
    const clashing = items
        .filter((i) => existing.has(i.name.toLowerCase()))
        .map((i) => i.name);
    if (clashing.length) {
        const ob = await ui.confirm(
            `${clashing.length} file(s) already exist here and will be overwritten:\n${clashing.join(", ")}`,
            { title: "Overwrite files?", buttons: ["Overwrite", "Cancel"] },
        );
        if (ob !== "Overwrite") return false;
    }

    const verb = move ? "Moving" : "Copying";
    const progress = await ui.createProgress(`${verb}...`);
    try {
        const result = await progress.show(
            copyPathsInto(paths, targetDir, {
                move,
                onProgress: (done, total, name) => {
                    progress.label = `${verb} ${done} of ${total}: ${name}`;
                },
            }),
        );
        if (result.errors.length) {
            const shown = result.errors.slice(0, 5).join("\n");
            const more = result.errors.length > 5
                ? `\n(+${result.errors.length - 5} more)`
                : "";
            ui.notify(
                `Some items could not be ${move ? "moved" : "copied"}:\n${shown}${more}`,
                "warning",
            );
        }
    } catch (err) {
        ui.notify(err?.message || `Failed to ${move ? "move" : "copy"}.`, "warning");
    }
    return true;
}
