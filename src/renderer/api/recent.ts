import { TGlobalState } from "../core/state/state";
import { fs } from "./fs";
import type { IRecentFiles } from "./types/recent";

const recentFileName = "recentFiles.txt";

interface RecentFilesState {
    files: string[];
}

const defaultRecentFilesState: RecentFilesState = {
    files: [],
};

class RecentFiles implements IRecentFiles {
    private readonly state = new TGlobalState(defaultRecentFilesState);

    get files(): string[] {
        return this.state.get().files;
    }

    async load(): Promise<void> {
        const data = await fs.getDataFile(recentFileName);
        const files = (data ?? "").split("\n").map((f) => f.trim()).filter((f) => f);
        this.state.update((s) => {
            s.files = files;
        });
    }

    async add(filePath: string): Promise<void> {
        filePath = filePath.trim();
        if (!filePath) {
            return;
        }
        await this.load();
        const files = this.state.get().files;
        let newFiles = [filePath, ...files.filter((f) => f !== filePath)];
        if (newFiles.length > 100) {
            newFiles = newFiles.slice(0, 100);
        }
        this.state.update((s) => {
            s.files = newFiles;
        });
        await fs.saveDataFile(recentFileName, newFiles.join("\n"));
    }

    async remove(filePath: string): Promise<void> {
        await this.load();
        const files = this.state.get().files;
        const newFiles = files.filter((f) => f !== filePath);
        this.state.update((s) => {
            s.files = newFiles;
        });
        await fs.saveDataFile(recentFileName, newFiles.join("\n"));
    }

    async clear(): Promise<void> {
        this.state.update((s) => {
            s.files = [];
        });
        await fs.saveDataFile(recentFileName, "");
    }
}

export const recent = new RecentFiles();
