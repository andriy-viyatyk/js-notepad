import rendererEvents from "../../../ipc/renderer/renderer-events";
import { pagesModel } from "../pages";
import { app } from "../app";
import { createLinkData } from "../../../shared/link-data";
import { signalReadyToQuit } from "../window";
import { ui } from "../ui";
import { guard } from "../../core/utils/guard";
import { UpdateCheckResult } from "../../../ipc/api-param-types";
import { EventEndpoint } from "../../../ipc/api-types";
import type { PageDescriptor } from "../../../shared/types";

/**
 * Renderer IPC events service.
 * Subscribes to IPC events and delegates to pagesModel methods.
 * Will be updated in to delegate to app.pages instead.
 */
export class RendererEventsService {
    async init(): Promise<void> {
        // Page operations (currently delegates to pagesModel)
        rendererEvents.eOpenFile.subscribe(this.handleOpenFile);
        rendererEvents.eOpenDiff.subscribe(this.handleOpenDiff);
        rendererEvents.eShowPage.subscribe(this.handleShowPage);
        rendererEvents.eMovePageIn.subscribe(this.handleMovePageIn);
        rendererEvents.eMovePageOut.subscribe(this.handleMovePageOut);

        // URL opening
        rendererEvents.eOpenUrl.subscribe(this.handleOpenUrl);
        rendererEvents.eOpenExternalUrl.subscribe(this.handleExternalUrl);

        // Quit handler
        rendererEvents.eBeforeQuit.subscribe(this.handleBeforeQuit);

        // Update check notification
        rendererEvents[EventEndpoint.eUpdateAvailable].subscribe(this.handleUpdateAvailable);

        // Board `persephone.notify()` toast (US-724)
        rendererEvents[EventEndpoint.eBoardNotify].subscribe(this.handleBoardNotify);

        // Board `persephone.openRawLink(href, { editor })` (US-756 C6)
        rendererEvents[EventEndpoint.eBoardOpenRawLink].subscribe(this.handleBoardOpenRawLink);
    }

    private handleBoardOpenRawLink = async (msg: { href: string; editor?: string }) => {
        if (!msg?.href) return;
        await guard("Failed to open link", () =>
            app.events.openRawLink.sendAsync(
                createLinkData(msg.href, { sourceId: "board", target: msg.editor }),
            ),
        );
    };

    private handleOpenFile = async (filePath: string) => {
        await guard("Failed to open file", () =>
            app.events.openRawLink.sendAsync(createLinkData(filePath)),
        );
    };

    private handleOpenDiff = async (params: { firstPath: string; secondPath: string }) => {
        await guard("Failed to open diff", () => pagesModel.openDiff(params));
    };

    private handleShowPage = async (pageId: string) => {
        await guard("Failed to show page", () => pagesModel.showPage(pageId));
    };

    private handleMovePageIn = async (data: { page: PageDescriptor; targetPageId: string | undefined } | undefined) => {
        await guard("Failed to move page", () => pagesModel.movePageIn(data));
    };

    private handleMovePageOut = async (pageId: string) => {
        await guard("Failed to move page", () => pagesModel.movePageOut(pageId));
    };

    private handleOpenUrl = async (url: string) => {
        await guard("Failed to open URL", () =>
            app.events.openRawLink.sendAsync(createLinkData(url)),
        );
    };

    private handleExternalUrl = async (url: string) => {
        // Route through pipeline — HTTP resolver decides content vs browser based on extension.
        // `browserMode: "internal"` prevents shell.openExternal fallback, which would loop
        // back to us when Persephone is the OS default browser.
        await guard("Failed to open URL", () =>
            app.events.openRawLink.sendAsync(
                createLinkData(url, { browserMode: "internal" }),
            ),
        );
    };

    private handleBeforeQuit = async () => {
        try {
            await Promise.all(
                pagesModel.state.get().pages.map((model) => model.saveState())
            );
            await pagesModel.saveState();
        } catch (err) {
            console.error("Failed to save pages on quit:", err);
        }
        signalReadyToQuit();
    };

    private handleBoardNotify = (data: { message: string; type?: "info" | "success" | "warning" | "error" }) => {
        void ui.notify(data.message, data.type ?? "info");
    };

    private handleUpdateAvailable = async (result: UpdateCheckResult) => {
        if (result.updateAvailable && result.releaseInfo) {
            const closeResult = await ui.notify(
                `New version ${result.releaseInfo.version} is available! Click to open About page.`,
                "info",
            );
            if (closeResult === "clicked") {
                pagesModel.showAboutPage();
            }
        }
    };
}
