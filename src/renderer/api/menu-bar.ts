import { TOneState } from "../core/state/state";
import { menuFolders, type MenuFolder } from "./menu-folders";
import type { IMenuBar, IMenuBarFolder } from "./types/window";

export const openTabsId = "open-tabs";
export const recentFilesId = "recent-files";
export const toolsEditorsId = "tools-editors";
export const scriptLibraryId = "script-library";

interface MenuBarBuiltinFolder extends MenuFolder {
    id: string;
}

export const MENU_BAR_BUILTIN_FOLDERS: readonly MenuBarBuiltinFolder[] = [
    { id: openTabsId, name: "Open Tabs" },
    { id: recentFilesId, name: "Recent Files" },
    { id: toolsEditorsId, name: "Tools & Editors" },
    { id: scriptLibraryId, name: "Script Library" },
];

export interface MenuBarState {
    isOpen: boolean;
    selectedId: string;
}

export function getMenuBarSourceFolders(): MenuFolder[] {
    return [...MENU_BAR_BUILTIN_FOLDERS, ...menuFolders.state.get().folders];
}

export class MenuBarModel implements IMenuBar {
    readonly state = new TOneState<MenuBarState>({
        isOpen: false,
        selectedId: openTabsId,
    });

    constructor() {
        menuFolders.state.subscribe(() => this.scheduleSelectionFallback());
    }

    get isOpen(): boolean {
        return this.state.get().isOpen;
    }

    get folders(): readonly IMenuBarFolder[] {
        return getMenuBarSourceFolders().map((folder) => this.toFolderRecord(folder));
    }

    get selected(): IMenuBarFolder {
        const selected = getMenuBarSourceFolders().find(
            (folder) => folder.id === this.state.get().selectedId && !!folder.id,
        );
        return this.toFolderRecord(selected ?? MENU_BAR_BUILTIN_FOLDERS[0]);
    }

    open = (folderId?: string): void => {
        if (folderId !== undefined) {
            const folder = this.findFolder(folderId);
            if (!folder) {
                // Ids and labels only: a user folder's `path` is their disk layout and has no
                // business in an error string. `folders` is there for an agent that wants more.
                const valid = this.folders
                    .filter((candidate) => !!candidate.id)
                    .map((candidate) => `${candidate.id} (${candidate.label}, ${candidate.kind})`)
                    .join(", ");
                throw new Error(
                    `Unknown Menu Bar folder id ${JSON.stringify(folderId)}. Valid ids: ${valid}.`,
                );
            }
            this.state.update((state) => {
                state.isOpen = true;
                state.selectedId = folder.id;
            });
            return;
        }
        this.setOpen(true);
    };

    close = (): void => {
        this.setOpen(false);
    };

    toggle = (): void => {
        this.setOpen(!this.isOpen);
    };

    openLegacy = (panelId?: string): void => {
        const folder = panelId ? this.findFolder(panelId) : undefined;
        this.state.update((state) => {
            state.isOpen = true;
            if (folder?.id) state.selectedId = folder.id;
        });
    };

    private setOpen(isOpen: boolean): void {
        if (this.isOpen === isOpen) return;
        this.state.update((state) => { state.isOpen = isOpen; });
    }

    private findFolder(folderId: string): (MenuFolder & { id: string }) | undefined {
        if (!folderId) return undefined;
        return getMenuBarSourceFolders().find(
            (folder): folder is MenuFolder & { id: string } => folder.id === folderId && !!folder.id,
        );
    }

    private scheduleSelectionFallback(): void {
        const selectedId = this.state.get().selectedId;
        if (getMenuBarSourceFolders().some((folder) => folder.id === selectedId)) return;
        queueMicrotask(() => {
            if (!getMenuBarSourceFolders().some((folder) => folder.id === this.state.get().selectedId)) {
                this.selectFolder(MENU_BAR_BUILTIN_FOLDERS[0]);
            }
        });
    }

    private selectFolder(folder: MenuFolder): void {
        if (!folder.id || folder.id === this.state.get().selectedId) return;
        this.state.update((state) => { state.selectedId = folder.id; });
    }

    private toFolderRecord(folder: MenuFolder): IMenuBarFolder {
        const kind: IMenuBarFolder["kind"] = isBuiltinFolder(folder) ? "builtin" : "user";
        const record = {
            id: folder.id ?? "",
            label: folder.name,
            kind,
        };
        return folder.path === undefined ? record : { ...record, path: folder.path };
    }
}

export function isBuiltinFolder(folder: MenuFolder): boolean {
    return MENU_BAR_BUILTIN_FOLDERS.some((candidate) => candidate.id === folder.id);
}
