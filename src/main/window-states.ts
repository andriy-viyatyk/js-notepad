import fs from "node:fs";
import path from "node:path";
import { openFilesNameTemplate } from "../shared/constants";
import { WindowState } from "../shared/types";
import { getDataFolder } from "./utils";

class WindowStates {
    getState = (windowIndex: number): WindowState | undefined => {
        const filePath = this.windowFileName(windowIndex);
        if (!fs.existsSync(filePath)) {
            return undefined;
        }

        const fileContent = fs.readFileSync(filePath, {encoding: "utf-8"});
        try {
            const pages = JSON.parse(fileContent) as WindowState;
            return pages;
        } catch (e: any) {
            console.error("Failed to parse window files:", e);
            return undefined;
        }
    }

    deleteState = (windowIndex: number): void => {
        const filePath = this.windowFileName(windowIndex);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    changeIndex = (oldIndex: number, newIndex: number): void => {
        const oldFilePath = this.windowFileName(oldIndex);
        const newFilePath = this.windowFileName(newIndex);
        if (fs.existsSync(newFilePath)) {
            fs.unlinkSync(newFilePath);
        }
        if (fs.existsSync(oldFilePath)) {
            fs.renameSync(oldFilePath, newFilePath);
        }
    }

    private windowFileName = (windowIndex: number): string => {
        return path.join(getDataFolder(), openFilesNameTemplate.replace("{windowIndex}", String(windowIndex)));
    }
}

export const windowStates = new WindowStates();