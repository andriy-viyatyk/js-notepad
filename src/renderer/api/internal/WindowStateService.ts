import rendererEvents from "../../../ipc/renderer/renderer-events";
import { appWindow } from "../window";

/**
 * Window state service for window state IPC subscriptions.
 * Syncs maximize/zoom state from main process to appWindow reactive state.
 */
export class WindowStateService {
    async init(): Promise<void> {
        // App.initEvents() owns these process-lifetime IPC subscriptions; window state is
        // application state, not a resource belonging to a view/model.
        rendererEvents.eWindowMaximized.subscribe((isMaximized) => {
            appWindow.setMaximized(isMaximized);
        });

        rendererEvents.eZoomChanged.subscribe((zoomLevel) => {
            appWindow.setZoomLevel(zoomLevel);
        });
    }
}
