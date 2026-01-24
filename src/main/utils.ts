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

export function isValidFilePath(filePath: string | undefined): boolean {
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
    } catch (error: any) {
        console.warn('Error checking file path:', error?.message);
        return false;
    }
    
    try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            console.warn('Path is not a file (might be a directory):', filePath);
            return false;
        }
    } catch (error: any) {
        console.warn('Error reading file stats:', error?.message);
        return false;
    }
    
    return true;
}