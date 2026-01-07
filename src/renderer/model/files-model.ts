const path = require("path");
import { api } from "../../ipc/renderer/api";
import { nodeUtils } from "../common/node-utils";

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
        this.dataPath = path.join(userData, "data");
        this.cachePath = path.join(this.dataPath, "cache");
        console.log("dataPath:", this.dataPath);
    };

    getFile = async (filePath: string): Promise<string | undefined> => {
        await this.wait();
        if (nodeUtils.fileExists(filePath)) {
            return nodeUtils.loadStringFile(filePath);
        }
        return undefined;
    };

    prepareFile = async (filePath: string, defaultContent: string): Promise<void> => {
        await this.wait();
        if (!nodeUtils.fileExists(filePath)) {
            this.saveFile(filePath, defaultContent);
        }
    }

    saveFile = async (filePath: string, content: string): Promise<void> => {
        await this.wait();
        const dirPath = path.dirname(filePath);
        nodeUtils.preparePath(dirPath);
        nodeUtils.saveStringFile(filePath, content);
    };

    deleteFile = async (filePath: string): Promise<void> => {
        await this.wait();
        nodeUtils.deleteFile(filePath);
    };

    private cacheFileName = async (id: string, name?: string) => {
        await this.wait();
        const cacheFilePath = path.join(
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
        const files = nodeUtils.listFiles(
            this.cachePath,
            new RegExp(`^${id}`, "i")
        );
        for (const file of files) {
            const filePath = path.join(this.cachePath, file);
            await this.deleteFile(filePath);
        }
    };

    dataFileName = async (fileName: string) => {
        await this.wait();
        return path.join(
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

    prepareDataFile = async (fileName: string, defaultContent: string): Promise<void> =>
        await this.prepareFile(
            await this.dataFileName(fileName),
            defaultContent
        );
}

export const filesModel = new FilesModel();
filesModel.init();
