import { windowUtils } from "../common/utils";
import { api } from "../ipc/renderer/api";

class FilesModel {
    private _windowIndex: number | null = null;
    private dataPath: string | null = null;
    private cachePath: string | null = null;
    private initPromise: Promise<void> | null = null;

    get windowIndex(): number {
        if (this._windowIndex === null) {
            throw new Error("FilesModel not initialized yet");
        }
        return this._windowIndex;
    }

    init = async () => {
        this.initPromise = this.internalInit();
    };

    wait = async () => {
        if (this.initPromise) {
            await this.initPromise;
        }
    };

    private internalInit = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Allow other init tasks to complete
        const userData = await api.getCommonFolder("userData");
        this._windowIndex = await api.getWindowIndex();
        this.dataPath = windowUtils.path.join(userData, "data");
        this.cachePath = windowUtils.path.join(this.dataPath, "cache");
        console.log("dataPath:", this.dataPath);
    };

    getFile = async (filePath: string): Promise<string | undefined> => {
        await this.wait();
        if (windowUtils.fs.fileExists(filePath)) {
            return windowUtils.fs.loadStringFile(filePath);
        }
        return undefined;
    };

    saveFile = async (filePath: string, content: string): Promise<void> => {
        await this.wait();
        const dirPath = windowUtils.path.dirname(filePath);
        windowUtils.fs.preparePath(dirPath);
        windowUtils.fs.saveStringFile(filePath, content);
    };

    deleteFile = async (filePath: string): Promise<void> => {
        await this.wait();
        windowUtils.fs.deleteFile(filePath);
    };

    private cacheFileName = async (id: string) => {
        await this.wait();
        const cacheFilePath = windowUtils.path.join(this.cachePath, id + ".txt");
        return cacheFilePath;
    }

    getCacheFile = async (id: string): Promise<string | undefined> =>
        await this.getFile(await this.cacheFileName(id));

    saveCacheFile = async (id: string, content: string): Promise<void> =>
        await this.saveFile(await this.cacheFileName(id), content);

    deleteCacheFile = async (id: string): Promise<void> =>
        await this.deleteFile(await this.cacheFileName(id));

    private dataFileName = async (fileName: string) => {
        await this.wait();
        return windowUtils.path.join(this.dataPath, fileName.replace("{windowIndex}", String(this._windowIndex)));
    }

    getDataFile = async (fileName: string): Promise<string | undefined> =>
        await this.getFile(await this.dataFileName(fileName));

    saveDataFile = async (fileName: string, content: string): Promise<void> =>
        await this.saveFile(await this.dataFileName(fileName), content);    

    deleteDataFile = async (fileName: string): Promise<void> =>
        await this.deleteFile(await this.dataFileName(fileName));
}

export const filesModel = new FilesModel();
filesModel.init();
