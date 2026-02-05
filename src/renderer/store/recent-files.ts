import { TModel } from "../core/state/model";
import { TGlobalState } from "../core/state/state";
import { filesModel } from "./files-store";

const recentFileName = 'recentFiles.txt';

const defaultRecentFilesState = {
    files: [] as string[],
}

type RecentFilesState = typeof defaultRecentFilesState;

class RecentFiles extends TModel<RecentFilesState> {
    constructor() {
        super(new TGlobalState(defaultRecentFilesState));
    }

    add = async (filePath: string): Promise<void> => {
        filePath = filePath.trim();
        if (!filePath) {
            return;
        }
        const files = await this.load();
        let newFiles = [
            filePath,
            ...files.filter(f => f !== filePath)
        ];
        if (newFiles.length > 100) {
            newFiles = newFiles.slice(0, 100);
        }
        this.state.update(s => {
            s.files = newFiles;
        });
        await filesModel.saveDataFile(recentFileName, newFiles.join('\n'));
    }

    load = async () => {
        const data = await filesModel.getDataFile(recentFileName);
        const files = (data ?? "").split("\n").map(f => f.trim()).filter(f => f);
        this.state.update(s => {
            s.files = files;
        });
        return files;
    }

    remove = async (filePath: string): Promise<void> => {
        const files = await this.load();
        const newFiles = files.filter(f => f !== filePath);
        this.state.update(s => {
            s.files = newFiles;
        });
        await filesModel.saveDataFile(recentFileName, newFiles.join('\n'));
    }

    clear = async (): Promise<void> => {
        this.state.update(s => {
            s.files = [];
        });
        await filesModel.saveDataFile(recentFileName, "");
    }
}

export const recentFiles = new RecentFiles();
