import { TModel } from "../common/classes/model";
import { TGlobalState } from "../common/classes/state";
import { filesModel } from "./files-model";

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
}

export const recentFiles = new RecentFiles();