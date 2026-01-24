const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
import jschardet from "jschardet";
import iconv from "iconv-lite";
import { FileStats } from "../../shared/types";
import { FolderItem, LoadedTextFile } from "./types";

export const uuid = () => {
    return crypto.randomUUID();
};

export const nodeUtils = {
    listFiles: (dirPath: string, pattern?: string | RegExp) => {
        if (!nodeUtils.fileExists(dirPath)) {
            return [];
        }

        const files: string[] = fs.readdirSync(dirPath);

        if (!pattern) {
            return files;
        }

        // If it's a string, treat it as extension (backward compatibility)
        if (typeof pattern === "string") {
            return files.filter(
                (file: string) =>
                    path.extname(file).toLowerCase() === pattern.toLowerCase()
            );
        }

        // If it's a RegExp, use it to test the filename
        return files.filter((file: string) => pattern.test(file));
    },

    listFolderContent: (dirPath: string): FolderItem[] => {
        try {
            const entries: string[] = fs.readdirSync(dirPath);

            return entries.map((entry) => {
                const fullPath = path.join(dirPath, entry);
                const stats = fs.statSync(fullPath);

                return {
                    path: fullPath,
                    isFolder: stats.isDirectory(),
                };
            });
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
            return [];
        }
    },

    loadStringFile: (filePath: string, encoding?: string): LoadedTextFile => {
        const buffer = fs.readFileSync(filePath);

        if (
            buffer.length >= 3 &&
            buffer[0] === 0xef &&
            buffer[1] === 0xbb &&
            buffer[2] === 0xbf
        ) {
            return {
                content: buffer.slice(3).toString("utf-8"),
                encoding: "utf-8-bom",
            };
        }

        if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
            return {
                content: iconv.decode(buffer.slice(2), "utf16le"),
                encoding: "utf-16le",
            };
        }

        if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
            return {
                content: iconv.decode(buffer.slice(2), "utf16be"),
                encoding: "utf-16be",
            };
        }

        if (encoding) {
            try {
                return {
                    content: iconv.decode(buffer, encoding),
                    encoding: encoding,
                };
            } catch (error) {
                console.warn(
                    `Failed to decode with provided encoding ${encoding}:`,
                    error
                );
            }
        }

        const detected = jschardet.detect(buffer);

        if (detected && detected.encoding && detected.confidence > 0.7) {
            try {
                let detectedEncoding = detected.encoding.toLowerCase();

                if (detectedEncoding === "ascii") {
                    // ASCII is a subset of UTF-8
                    detectedEncoding = "utf-8";
                }

                return {
                    content: iconv.decode(buffer, detectedEncoding),
                    encoding: detectedEncoding,
                };
            } catch (error) {
                console.warn(
                    `Failed to decode with ${detected.encoding}:`,
                    error
                );
            }
        }

        try {
            const utf8Text = buffer.toString("utf-8");
            if (!utf8Text.includes("�")) {
                return {
                    content: utf8Text,
                    encoding: "utf-8",
                };
            }
        } catch (error) {
            // UTF-8 failed
        }

        return {
            content: iconv.decode(buffer, "windows-1251"),
            encoding: "windows-1251",
        };
    },

    saveStringFile: (
        filePath: string,
        content: string,
        encoding?: string
    ): void => {
        const enc = encoding?.toLowerCase() || "utf-8";

        if (enc === "utf-8" || enc === "utf8") {
            fs.writeFileSync(filePath, content, "utf-8");
        } else if (enc === "utf-8-bom" || enc === "utf8bom") {
            const bom = Buffer.from([0xef, 0xbb, 0xbf]);
            const textBuffer = Buffer.from(content, "utf-8");
            fs.writeFileSync(filePath, Buffer.concat([bom, textBuffer]));
        } else if (enc === "utf-16le" || enc === "utf16le") {
            const bom = Buffer.from([0xff, 0xfe]);
            const textBuffer = iconv.encode(content, "utf16le");
            fs.writeFileSync(filePath, Buffer.concat([bom, textBuffer]));
        } else if (enc === "utf-16be" || enc === "utf16be") {
            const bom = Buffer.from([0xfe, 0xff]);
            const textBuffer = iconv.encode(content, "utf16be");
            fs.writeFileSync(filePath, Buffer.concat([bom, textBuffer]));
        } else {
            try {
                const buffer = iconv.encode(content, enc);
                fs.writeFileSync(filePath, buffer);
            } catch (error) {
                console.error(
                    `Failed to encode with ${enc}, falling back to UTF-8:`,
                    error
                );
                fs.writeFileSync(filePath, content, "utf-8");
            }
        }
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
