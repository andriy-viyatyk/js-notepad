import { debounce } from "../../shared/utils";
import { TModel } from "../core/state/model";
import { TGlobalState } from "../core/state/state";
import { uuid } from "../core/utils/node-utils";
import { parseObject } from "../core/utils/parse-utils";
import { filesModel } from "./files-model";
import { FileWatcher } from "../core/services/file-watcher";

const menuFoldersFileName = "menuFolders.json";

export interface MenuFolder {
    id?: string;
    name: string;
    path?: string;
    files?: string[];
}

const defaultMenuFoldersState = {
    folders: [] as MenuFolder[],
}

type MenuFoldersState = typeof defaultMenuFoldersState;

class MenuFolders extends TModel<MenuFoldersState> {
    private fileWatcher: FileWatcher | undefined;
    
    constructor() {
        super(new TGlobalState(defaultMenuFoldersState));
        this.init();
    }

    private init = async () => {
        await filesModel.prepareDataFile(menuFoldersFileName, "{}");
        this.fileWatcher = new FileWatcher(
            await filesModel.dataFileName(menuFoldersFileName),
            this.fileChanged
        );
        await this.loadState();
    };

    private fileChanged = () => {
        this.loadState();
    };

    private isStateValid = (state: any): state is MenuFoldersState => {
        return (
            state &&
            Array.isArray(state.folders) &&
            state.folders.every(
                (folder: any) => typeof folder.name === "string" &&
                    (folder.path === undefined || typeof folder.path === "string") &&
                    (folder.files === undefined || 
                        (Array.isArray(folder.files) && 
                            folder.files.every((file: any) => typeof file === "string")))
            )
        )
    }

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
        filesModel.saveDataFile(menuFoldersFileName, content);
    }

    private saveStateDebounced = debounce(this.saveState, 200);

    addFolder = (folder: MenuFolder) => {
        const id = uuid();
        this.state.update((s) => {
            s.folders.push({id, ...folder});
        });
        this.saveStateDebounced();
    }

    deleteFolder = (id: string) => {
        this.state.update((s) => {
            s.folders = s.folders.filter((folder) => folder.id !== id);
        });
        this.saveStateDebounced();
    }

    find = (id: string): MenuFolder | undefined => {
        return this.state.get().folders.find((folder) => folder.id === id);
    }

    moveFolder = (sourceId: string, targetId: string) => {
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
    }
}

export const menuFolders = new MenuFolders();