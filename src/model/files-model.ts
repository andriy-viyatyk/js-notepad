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

    private cacheFileName = async (id: string, name?: string) => {
        await this.wait();
        const cacheFilePath = windowUtils.path.join(
            this.cachePath,
            id + (name ? "_" + name : "") + ".txt"
        );
        return cacheFilePath;
    };

    getCacheFile = async (
        id: string,
        name?: string
    ): Promise<string | undefined> =>
        await this.getFile(await this.cacheFileName(id, name));

    saveCacheFile = async (
        id: string,
        content: string,
        name?: string
    ): Promise<void> =>
        await this.saveFile(await this.cacheFileName(id, name), content);

    deleteCacheFile = async (id: string, name?: string): Promise<void> =>
        await this.deleteFile(await this.cacheFileName(id, name));

    deleteCacheFiles = async (id: string): Promise<void> => {
        await this.wait();
        const files = windowUtils.fs.listFiles(
            this.cachePath,
            new RegExp(`^${id}`, "i")
        );
        for (const file of files) {
            const filePath = windowUtils.path.join(this.cachePath, file);
            await this.deleteFile(filePath);
        }
    };

    private dataFileName = async (fileName: string) => {
        await this.wait();
        return windowUtils.path.join(
            this.dataPath,
            fileName.replace("{windowIndex}", String(this._windowIndex))
        );
    };

    getDataFile = async (fileName: string): Promise<string | undefined> =>
        await this.getFile(await this.dataFileName(fileName));

    saveDataFile = async (fileName: string, content: string): Promise<void> =>
        await this.saveFile(await this.dataFileName(fileName), content);

    deleteDataFile = async (fileName: string): Promise<void> =>
        await this.deleteFile(await this.dataFileName(fileName));
}

export const filesModel = new FilesModel();
filesModel.init();
