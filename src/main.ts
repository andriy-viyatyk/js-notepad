/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { app } from "electron";
import started from "electron-squirrel-startup";
import { setupMainProcess } from "./main-setup";

const gotTheLock = app.requestSingleInstanceLock();
if (started || !gotTheLock) {
    app.quit();
} else {
    setupMainProcess();
}

