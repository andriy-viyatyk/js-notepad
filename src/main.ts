/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { app } from "electron";
import { setupMainProcess } from "./main/main-setup";

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    setupMainProcess();
}

