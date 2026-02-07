import { IPage } from "../../shared/types";
import { UpdateCheckResult } from "../api-param-types";
import { EventApi, EventEndpoint, EventObject } from "../api-types";

class RendererEventObject<T> implements EventObject<T> {
    private subscribers: Array<(data: T) => void> = [];
    private eventName: EventEndpoint;

    constructor(eventName: EventEndpoint) {
        this.eventName = eventName;
        this.listen();
    }

    subscribe(callback: (data: T) => void) {
        this.subscribers.push(callback);

        return {
            unsubscribe: () => {
                this.subscribers = this.subscribers.filter(
                    (cb) => cb !== callback
                );
            },
        };
    }

    send(data: T) {
        if (!window.electron || !window.electron.ipcRenderer) {
            return;
        }
        window.electron.ipcRenderer.sendMessage(this.eventName, data);
    }

    private listen() {
        if (!window.electron || !window.electron.ipcRenderer) {
            console.error("Event Listener: IPC Renderer is not available");
            return;
        }
        window.electron.ipcRenderer.on(this.eventName, (data: T) => {
            this.subscribers.forEach((cb) => {
                try {
                    cb(data);
                } catch (e) {
                    console.error("Event callback error:", e);
                }
            });
        });
    }
}

class RendererEvents implements EventApi {
    [EventEndpoint.eWindowMaximized] = new RendererEventObject<boolean>(
        EventEndpoint.eWindowMaximized
    );
    [EventEndpoint.eBeforeQuit] = new RendererEventObject<void>(
        EventEndpoint.eBeforeQuit
    );

    [EventEndpoint.eOpenFile] = new RendererEventObject<string>(
        EventEndpoint.eOpenFile
    );

    [EventEndpoint.eOpenDiff] = new RendererEventObject<{ firstPath: string; secondPath: string }>(
        EventEndpoint.eOpenDiff
    );

    [EventEndpoint.eShowPage] = new RendererEventObject<string>(
        EventEndpoint.eShowPage
    );

    [EventEndpoint.eMovePageIn] = new RendererEventObject<{ page: Partial<IPage>; targetPageId: string | undefined }>(
        EventEndpoint.eMovePageIn
    );

    [EventEndpoint.eMovePageOut] = new RendererEventObject<string>(
        EventEndpoint.eMovePageOut
    );

    [EventEndpoint.eZoomChanged] = new RendererEventObject<number>(
        EventEndpoint.eZoomChanged
    );

    [EventEndpoint.eUpdateAvailable] = new RendererEventObject<UpdateCheckResult>(
        EventEndpoint.eUpdateAvailable
    );
}

const rendererEvents = new RendererEvents();

export default rendererEvents;
