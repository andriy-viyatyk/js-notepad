import { globalKeyDown } from "../../core/state/events";
import { pagesModel } from "../pages";
import { api } from "../../../ipc/renderer/api";
import { cycleAppTheme } from "../cycle-app-theme";

/**
 * Global keyboard service for application-wide shortcuts.
 * Handles: Ctrl+Tab, Ctrl+W, Ctrl+N, Ctrl+O, theme cycling.
 */
export class KeyboardService {
    async init(): Promise<void> {
        document.addEventListener("keydown", this.handleKeyDown);
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        // Broadcast to all subscribers
        globalKeyDown.send(e);

        // Handle specific shortcuts
        switch (e.code) {
            case "Tab":
                if (e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) pagesModel.showPrevious();
                    else pagesModel.showNext();
                }
                break;

            case "F4":
            case "KeyW":
                if (e.ctrlKey) {
                    e.preventDefault();
                    const activePage = pagesModel.activePage;
                    if (activePage) {
                        activePage.close();
                    }
                }
                break;

            case "KeyN":
                if (e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        api.openNewWindow();
                    } else {
                        pagesModel.addEmptyPage();
                    }
                }
                break;

            case "KeyO":
                if (e.ctrlKey) {
                    e.preventDefault();
                    pagesModel.openFileWithDialog();
                }
                break;

            case "BracketRight":
            case "BracketLeft":
                if (e.ctrlKey && e.altKey) {
                    e.preventDefault();
                    cycleAppTheme(e.code === "BracketRight" ? 1 : -1);
                }
                break;
        }
    };
}
