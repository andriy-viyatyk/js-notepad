import type { IMenuFolders } from "../../../api/types/menu-folders";
import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const MENU_FOLDERS_MEMBERS: readonly IAiMember[] = [
    { name: "folders", kind: "property", summary: "Current configured sidebar folders as plain data." },
    { name: "add", kind: "method", signature: "add(folder: { name: string; path?: string; files?: string[] })", summary: "Add a configured folder and return its generated id.", caution: "persists and changes the sidebar" },
    { name: "remove", kind: "method", signature: "remove(id: string)", summary: "Remove a configured folder.", caution: "persists a sidebar change" },
    { name: "find", kind: "method", signature: "find(id: string)", summary: "Find a configured folder by id." },
    { name: "move", kind: "method", signature: "move(sourceId: string, targetId: string)", summary: "Reorder configured folders.", caution: "persists a sidebar change" },
];

export function describeMenuFolders(instance: unknown): IAiVisionDescriptor {
    const menuFolders = instance as IMenuFolders;
    return {
        kind: "MenuFolders",
        summary: "Configured folders shown in the sidebar.",
        members: MENU_FOLDERS_MEMBERS,
        help: "Use folders and find to inspect configured sidebar entries; add, remove, and move persist sidebar changes.",
        summarize: () => ({ kind: "MenuFolders", count: menuFolders.folders.length }),
    };
}
