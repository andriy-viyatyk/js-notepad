import { initBoardHandlers } from "./board-handlers";
import { initCoreHandlers } from "./core-handlers";
import { initGitHandlers } from "./git-handlers";
import { initRendererEvents } from "./renderer-events";

/** Main IPC composition root. Service registrars own their endpoint implementations. */
const init = (): void => {
    initCoreHandlers();
    initGitHandlers();
    initBoardHandlers();
    initRendererEvents();
};

export const controller = { init };
