const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
import { FileStats } from "../shared/types";

export const uuid = () => {
    return crypto.randomUUID();
};

export const nodeUtils = {
    listFiles: (dirPath: string, pattern?: string | RegExp) => {
        const files = fs.readdirSync(dirPath);

        if (!pattern) {
            return files;
        }

        // If it's a string, treat it as extension (backward compatibility)
        if (typeof pattern === "string") {
            return files.filter(
                (file: string) =>
                    path.extname(file).toLowerCase() ===
                    pattern.toLowerCase()
            );
        }

        // If it's a RegExp, use it to test the filename
        return files.filter((file: string) => pattern.test(file));
    },
    loadStringFile: (filePath: string): string => {
        const buffer = fs.readFileSync(filePath);

        if (
            buffer.length >= 2 &&
            buffer[0] === 0xff &&
            buffer[1] === 0xfe
        ) {
            return buffer.toString("utf16le");
        }
        if (
            buffer.length >= 2 &&
            buffer[0] === 0xfe &&
            buffer[1] === 0xff
        ) {
            return buffer.toString("utf16be" as BufferEncoding);
        }

        // Try UTF-8 and check for issues
        const utf8Content = buffer.toString("utf-8");
        const hasNullBytes = buffer.indexOf(0x00) !== -1;

        // If we find null bytes in even positions, likely UTF-16 LE
        if (hasNullBytes && buffer[1] === 0x00) {
            return buffer.toString("utf16le");
        }

        return utf8Content;
    },
    saveStringFile: (filePath: string, content: string): void => {
        fs.writeFileSync(filePath, content, "utf-8");
    },
    fileExists: (filePath: string): boolean => {
        try {
            fs.accessSync(filePath, fs.constants.F_OK);
            return true;
        } catch (err) {
            return false;
        }
    },
    deleteFile: (filePath: string): boolean => {
        if (!nodeUtils.fileExists(filePath)) {
            // File does not exist, resolve without error
            return true;
        }

        try {
            fs.unlinkSync(filePath);
            return true;
        } catch (err) {
            return false;
        }
    },
    preparePath: (dirPath: string): boolean => {
        if (!nodeUtils.fileExists(dirPath)) {
            try {
                fs.mkdirSync(dirPath, { recursive: true });
            } catch (err) {
                return false;
            }
        }
        return true;
    },
    watchFile: (filePath: string, callback: (event: string) => void) => {
        try {
            const watcher = fs.watch(filePath, (eventType: string) => {
                callback(eventType);
            });

            return () => {
                watcher.close();
            };
        } catch (err) {
            console.error("Error watching file:", err);
            return () => {
                /**/
            };
        }
    },
    getFileStats: (filePath: string): FileStats => {
        try {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                mtime: stats.mtime.getTime(),
                exists: true,
            };
        } catch (err) {
            return {
                size: 0,
                mtime: 0,
                exists: false,
            };
        }
    },
};