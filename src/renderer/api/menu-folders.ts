import { debounce } from "../../shared/utils";
import { TModel } from "../core/state/model";
import { TGlobalState } from "../core/state/state";
import { parseObject } from "../core/utils/parse-utils";
import { fs } from "./fs";
import { FileWatcher } from "../core/utils/file-watcher";
import type { IMenuFolders, IMenuFolder } from "./types/menu-folders";

const menuFoldersFileName = "menuFolders.json";

// Keep MenuFolder as the mutable internal type (matches persisted JSON shape)
export interface MenuFolder {
    id?: string;
    name: string;
    path?: string;
    files?: string[];
}

const defaultMenuFoldersState = {
    folders: [] as MenuFolder[],
};

type MenuFoldersState = typeof defaultMenuFoldersState;

class MenuFoldersModel extends TModel<MenuFoldersState> implements IMenuFolders {
    private fileWatcher: FileWatcher | undefined;

    constructor() {
        super(new TGlobalState(defaultMenuFoldersState));
        this.init();
    }

    private init = async () => {
        await fs.prepareDataFile(menuFoldersFileName, "{}");
        this.fileWatcher = new FileWatcher(
            await fs.dataFileName(menuFoldersFileName),
            this.fileChanged
        );
        await this.loadState();
    };

    private fileChanged = () => {
        this.loadState();
    };

    private isStateValid = (state: unknown): state is MenuFoldersState => {
        if (!state || typeof state !== "object") return false;
        const s = state as { folders?: unknown };
        if (!Array.isArray(s.folders)) return false;
        return s.folders.every((folder: unknown) => {
            if (!folder || typeof folder !== "object") return false;
            const f = folder as { name?: unknown; path?: unknown; files?: unknown };
            return typeof f.name === "string" &&
                (f.path === undefined || typeof f.path === "string") &&
                (f.files === undefined ||
                    (Array.isArray(f.files) &&
                        f.files.every((file: unknown) => typeof file === "string")));
        });
    };

    private loadState = async () => {
        const content = parseObject(await this.fileWatcher?.getTextContent());
        if (this.isStateValid(content)) {
            this.state.update((s) => {
                s.folders = content.folders;
            });
        }
    };

    private saveState = () => {
        const content = JSON.stringify(this.state.get(), null, 4);
        fs.saveDataFile(menuFoldersFileName, content);
    };

    private saveStateDebounced = debounce(this.saveState, 200);

    // ── IMenuFolders ────────────────────────────────────────────────

    get folders(): readonly IMenuFolder[] {
        return this.state.get().folders as IMenuFolder[];
    }

    add = (folder: { name: string; path?: string; files?: string[] }): string => {
        const id = crypto.randomUUID();
        this.state.update((s) => {
            s.folders.push({ id, ...folder });
        });
        this.saveStateDebounced();
        return id;
    };

    remove = (id: string) => {
        this.state.update((s) => {
            s.folders = s.folders.filter((folder) => folder.id !== id);
        });
        this.saveStateDebounced();
    };

    find = (id: string): IMenuFolder | undefined => {
        return this.state.get().folders.find((folder) => folder.id === id) as IMenuFolder | undefined;
    };

    move = (sourceId: string, targetId: string) => {
        this.state.update((s) => {
            const sourceIndex = s.folders.findIndex((folder) => folder.id === sourceId);
            const targetIndex = s.folders.findIndex((folder) => folder.id === targetId);
            if (sourceIndex === -1 || targetIndex === -1) {
                return;
            }
            const [movedFolder] = s.folders.splice(sourceIndex, 1);
            s.folders.splice(targetIndex, 0, movedFolder);
        });
        this.saveStateDebounced();
    };
}

export const menuFolders = new MenuFoldersModel();
