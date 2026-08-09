import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export const preparePath = (dirPath: string): boolean => {
    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        } catch (err) {
            return false;
        }
    }
    return true;
};

let appRootPath = undefined as string | undefined;
export const getAppRootPath = (): string => {
    if (appRootPath === undefined) {
        appRootPath = app.isPackaged
            ? process.resourcesPath
            : path.join(__dirname, '../../');
    }

    return appRootPath;
}

let resourcesPath = undefined as string | undefined;
export const getAssetPath = (...paths: string[]): string => {
    if (resourcesPath === undefined) {
        resourcesPath = app.isPackaged
            ? path.join(process.resourcesPath, 'assets')
            : path.join(__dirname, '../../assets');
    }

    return path.join(resourcesPath, ...paths);
};

let dataFolder = undefined as string | undefined;
export const getDataFolder = (): string => {
    if (dataFolder === undefined) {
        const userFolder = app.getPath("userData");
        dataFolder = path.join(userFolder, "data");
    }

    return dataFolder;
};

function pathExists(filePath: string | undefined): boolean {
    if (!filePath) {
        console.warn('No file path provided');
        return false;
    }

    if (typeof filePath !== 'string' || filePath.trim() === '') {
        console.warn('Invalid file path string');
        return false;
    }

    try {
        if (!fs.existsSync(filePath)) {
            console.warn('File does not exist:', filePath);
            return false;
        }
    } catch (error) {
        console.warn('Error checking file path:', error?.message);
        return false;
    }

    return true;
}

export function isValidFilePath(filePath: string | undefined): boolean {
    if (!pathExists(filePath)) {
        return false;
    }

    try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            console.warn('Path is not a file (might be a directory):', filePath);
            return false;
        }
    } catch (error) {
        console.warn('Error reading file stats:', error?.message);
        return false;
    }

    return true;
}

/**
 * Accepts a file **or** a folder — the check for the "open this path" entry
 * points (cold-start argv, launcher pipe, second-instance).
 *
 * A folder is a legitimate thing to open: the renderer's content resolver stats
 * the path and opens a directory as an empty page with the Explorer panel rooted
 * at it, the same page the "Open Folder" tool produces. Everything downstream of
 * these entry points already handles that, so this predicate is the only thing
 * standing between Explorer's folder context menu and a working page.
 *
 * Entry points that need readable *content* (the DIFF pair) keep using
 * isValidFilePath — comparing a directory is meaningless.
 */
export function isValidOpenPath(filePath: string | undefined): boolean {
    return pathExists(filePath);
}