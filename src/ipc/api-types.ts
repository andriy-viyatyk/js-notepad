import { IPage, PageDragData, WindowPages } from "../shared/types";
import {
    CommonFolder,
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
} from "./api-param-types";

export enum Endpoint {
    getAppRootPath = "getAppRootPath",
    getAssetsPath = "getAssetsPath",
    maximizeWindow = "maximizeWindow",
    minimizeWindow = "minimizeWindow",
    restoreWindow = "restoreWindow",
    closeWindow = "closeWindow",
    setCanQuit = "setCanQuit",
    showOpenFileDialog = "showOpenFileDialog",
    showSaveFileDialog = "showSaveFileDialog",
    showOpenFolderDialog = "showOpenFolderDialog",
    inspectElement = "inspectElement",
    getCommonFolder = "getCommonFolder",
    zoom = "zoom",
    showItemInFolder = "showItemInFolder",
    showFolder = "showFolder",
    windowReady = "windowReady",
    getFileToOpen = "getFileToOpen",
    getWindowIndex = "getWindowIndex",
    openNewWindow = "openNewWindow",
    getWindowPages = "getWindowPages",
    showWindowPage = "showWindowPage",
    addDragEvent = "addDragEvent",
    getFileIcon = "getFileIcon",
    resetZoom = "resetZoom",
}

export type Api = {
    [Endpoint.getAppRootPath]: () => Promise<string>;
    [Endpoint.getAssetsPath]: (fileName: string) => Promise<string>;
    [Endpoint.maximizeWindow]: () => Promise<void>;
    [Endpoint.minimizeWindow]: () => Promise<void>;
    [Endpoint.restoreWindow]: () => Promise<void>;
    [Endpoint.closeWindow]: () => Promise<void>;
    [Endpoint.setCanQuit]: (canQuit: boolean) => Promise<void>;
    [Endpoint.showOpenFileDialog]: (
        params: OpenFileDialogParams
    ) => Promise<string[] | undefined>;
    [Endpoint.showSaveFileDialog]: (
        params: SaveFileDialogParams
    ) => Promise<string | undefined>;
    [Endpoint.showOpenFolderDialog]: (
        params: OpenFolderDialogParams
    ) => Promise<string[] | undefined>;
    [Endpoint.inspectElement]: (x: number, y: number) => Promise<void>;
    [Endpoint.getCommonFolder]: (folder: CommonFolder) => Promise<string>;
    [Endpoint.zoom]: (delta: number) => Promise<void>;
    [Endpoint.showItemInFolder]: (path: string) => Promise<void>;
    [Endpoint.showFolder]: (path: string) => Promise<void>;
    [Endpoint.windowReady]: () => Promise<void>;
    [Endpoint.getFileToOpen]: () => Promise<string | undefined>;
    [Endpoint.getWindowIndex]: () => Promise<number>;
    [Endpoint.openNewWindow]: (filePath?: string) => Promise<number>;
    [Endpoint.getWindowPages]: () => Promise<WindowPages[]>;
    [Endpoint.showWindowPage]: (windowIndex: number, pageId: string) => Promise<void>;
    [Endpoint.addDragEvent]: (event: PageDragData) => Promise<void>;
    [Endpoint.getFileIcon]: (filePath: string) => Promise<string>;
    [Endpoint.resetZoom]: () => Promise<void>;
};

export enum EventEndpoint {
    eWindowMaximized = "eWindowMaximized",
    eBeforeQuit = "eBeforeQuit",
    eOpenFile = "eOpenFile",
    eOpenDiff = "eOpenDiff",
    eShowPage = "eShowPage",
    eMovePageIn = "eMovePageIn",
    eMovePageOut = "eMovePageOut",
    eZoomChanged = "eZoomChanged",
}

export interface EventSubscription {
    unsubscribe: () => void;
}

export interface EventObject<T> {
    subscribe: (callback: (data: T) => void) => EventSubscription;
    send: (data: T) => void;
}

export type EventApi = {
    [EventEndpoint.eWindowMaximized]: EventObject<boolean>;
    [EventEndpoint.eBeforeQuit]: EventObject<void>;
    [EventEndpoint.eOpenFile]: EventObject<string>;
    [EventEndpoint.eOpenDiff]: EventObject<{ firstPath: string; secondPath: string }>;
    [EventEndpoint.eShowPage]: EventObject<string>;
    [EventEndpoint.eMovePageIn]: EventObject<{ page: Partial<IPage>; targetPageId: string | undefined }>;
    [EventEndpoint.eMovePageOut]: EventObject<string>;
    [EventEndpoint.eZoomChanged]: EventObject<number>;
};

export enum RendererEvent {
    fileDropped = "file-dropped",
}