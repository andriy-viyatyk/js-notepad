import type { ITreeProvider, ITreeProviderItem } from "../../api/types/io.tree";
import { ui } from "../../api/ui";
import { errMessage } from "../../../shared/utils";
import { pasteOsClipboardInto } from "./os-clipboard";

export interface ItemCrudContext {
    provider: ITreeProvider;
    /** Converts an item into the path expected by provider.rename/list operations. */
    getItemPath(item: ITreeProviderItem): string;
    refresh(): Promise<void>;
}

/** Paste OS clipboard files into a directory and refresh after a successful operation. */
export async function pasteIntoDir(context: ItemCrudContext, directory: string): Promise<void> {
    if (await pasteOsClipboardInto(context.provider, directory)) {
        await context.refresh();
    }
}

export async function createNewFile(context: ItemCrudContext, directory: string): Promise<void> {
    const { provider } = context;
    if (!provider.addItem) return;

    const inputResult = await ui.input("Enter file name:", {
        title: "New File",
        buttons: ["Create", "Cancel"],
    });
    if (inputResult?.button !== "Create" || !inputResult.value.trim()) return;

    const name = inputResult.value.trim();
    const href = provider.resolveLink(directory ? directory + "/" + name : name);
    try {
        await provider.addItem({
            href,
            title: name,
            category: directory,
            tags: [],
            isDirectory: false,
        });
    } catch (error) {
        ui.notify(errMessage(error, "Failed to create file."), "warning");
        return;
    }
    await context.refresh();
}

export async function createNewFolder(context: ItemCrudContext, directory: string): Promise<void> {
    const { provider } = context;
    if (!provider.mkdir) return;

    const inputResult = await ui.input("Enter folder name:", {
        title: "New Folder",
        buttons: ["Create", "Cancel"],
    });
    if (inputResult?.button !== "Create" || !inputResult.value.trim()) return;

    const name = inputResult.value.trim();
    const folderPath = directory ? directory + "/" + name : name;
    try {
        await provider.mkdir(folderPath);
    } catch (error) {
        ui.notify(errMessage(error, "Failed to create folder."), "warning");
        return;
    }
    await context.refresh();
}

export async function renameItem(context: ItemCrudContext, item: ITreeProviderItem): Promise<void> {
    const { provider } = context;
    if (!provider.rename) return;

    const inputResult = await ui.input("Enter new name:", {
        title: `Rename ${item.isDirectory ? "Folder" : "File"}`,
        value: item.title,
        buttons: ["Rename", "Cancel"],
        selectAll: true,
    });
    if (inputResult?.button !== "Rename" || !inputResult.value.trim()) return;

    const name = inputResult.value.trim();
    const category = item.category;
    const newPath = category ? category + "/" + name : name;
    try {
        await provider.rename(context.getItemPath(item), newPath);
    } catch (error) {
        ui.notify(errMessage(error, "Failed to rename."), "warning");
        return;
    }
    await context.refresh();
}

export async function deleteItemAction(
    context: ItemCrudContext,
    item: ITreeProviderItem,
): Promise<void> {
    const { provider } = context;
    if (!provider.deleteItem) return;

    const button = await ui.confirm(
        `Are you sure you want to delete "${item.title}"?`,
        { title: "Delete Confirmation", buttons: ["Delete", "Cancel"] },
    );
    if (button !== "Delete") return;

    try {
        await provider.deleteItem(item.href);
    } catch (error) {
        ui.notify(errMessage(error, "Failed to delete."), "warning");
        return;
    }
    await context.refresh();
}
