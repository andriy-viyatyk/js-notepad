import * as path from "path";
import { app } from "electron";

class FileIconCache {
    private cache = new Map<string, string>();

    getFileIcon = async (filePath: string): Promise<string> => {
        const ext = path.extname(filePath).toLowerCase();
        if (this.cache.has(ext)) {
            return this.cache.get(ext);
        }

        const icon = await app.getFileIcon(filePath, { size: "small" });
        const dataUrl = icon.toDataURL();
        this.cache.set(ext, dataUrl);
        return dataUrl;
    }
}

export const fileIconCache = new FileIconCache();