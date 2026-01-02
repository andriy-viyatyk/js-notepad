import { ipcMain } from "electron";
import { EventApi, EventEndpoint, EventObject } from "../api-types";
import { openWindows } from "../../main/open-windows";

class MainEventObject<T> implements EventObject<T> {
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
                this.subscribers = this.subscribers.filter(cb => cb !== callback);
            }
        }
    }

    send(data: T) {
        openWindows.send(this.eventName, data);
    }

    private listen() {
        ipcMain.on(this.eventName, (_event, data: T) => {
            this.subscribers.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error('Event callback error:', e);
                }
            });
        });
    }
}

class MainEvents implements EventApi {
    [EventEndpoint.eWindowMaximized] = new MainEventObject<boolean>(EventEndpoint.eWindowMaximized);
    [EventEndpoint.eBeforeQuit] = new MainEventObject<void>(EventEndpoint.eBeforeQuit);
    [EventEndpoint.eOpenFile] = new MainEventObject<string>(EventEndpoint.eOpenFile);
}

const mainEvents = new MainEvents();

export default mainEvents;