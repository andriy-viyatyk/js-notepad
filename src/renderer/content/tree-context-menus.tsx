import { app } from "../api/app";
import { createLinkData } from "../../shared/link-data";
import { openWithDefaultApp } from "./open-with-default-app";

/**
 * Register default context menu handlers for ILink items.
 *
 * Handlers add type-specific menu items based on the item's href.
 * Call during app bootstrap (same pattern as registerRawLinkParsers).
 *
 * Registration order matters (LIFO): last registered runs first.
 */
export function registerTreeContextMenuHandlers(): void {
    // HTTP link handler — adds "Open in Browser" items for URLs
    app.events.linkContextMenu.subscribe(async (event) => {
        const item = event.target;
        if (!item) return;
        if (!item.href.startsWith("http://") && !item.href.startsWith("https://")) return;

        const { appendLinkOpenMenuItems } = await import("../editors/shared/link-open-menu");
        appendLinkOpenMenuItems(event.items, item.href, { startGroup: true });
    });

    // "Open in RestClient" — for HTTP URLs and cURL links
    app.events.linkContextMenu.subscribe(async (event) => {
        const item = event.target;
        if (!item) return;
        const href = item.href.trim();
        if (
            !href.startsWith("http://") &&
            !href.startsWith("https://") &&
            !/^curl\s/i.test(href)
        ) return;

        event.items.push({
            label: "Open in Rest Client",
            onClick: () =>
                app.events.openRawLink.sendAsync(
                    createLinkData(href, { target: "rest-client" }),
                ),
        });
    });

    // File handler — for local file paths (not HTTP)
    app.events.linkContextMenu.subscribe(async (event) => {
        const item = event.target;
        if (!item) return;
        if (item.href.startsWith("http://") || item.href.startsWith("https://")) return;
        if (item.isDirectory) {
            event.items.push(
                {
                    startGroup: true,
                    label: "Open in New Tab",
                    icon: "open-file",
                    onClick: async () => {
                        const { pagesModel } = await import("../api/pages");
                        pagesModel.addEmptyPageWithNavPanel(item.href);
                    },
                },
            );
            // Show in File Explorer (folders)
            event.items.push({
                label: "Show in File Explorer",
                icon: "folder-open",
                onClick: async () => {
                    const { api } = await import("../../ipc/renderer/api");
                    api.showFolder(item.href);
                },
            });
        } else {
            event.items.push(
                {
                    startGroup: true,
                    label: "Open in New Tab",
                    icon: "open-file",
                    onClick: () => app.events.openRawLink.sendAsync(createLinkData(item.href)),
                },
                {
                    label: "Open in New Window",
                    icon: "new-window",
                    onClick: async () => {
                        const { pagesModel } = await import("../api/pages");
                        pagesModel.openPathInNewWindow(item.href);
                    },
                },
                {
                    // Files only. A folder's "Show in File Explorer" below is ALREADY this
                    // same `shell.openPath` call (it opens an Explorer window on the folder),
                    // so a second entry there would just duplicate it.
                    label: "Open with Default App",
                    icon: "open-link",
                    onClick: () => openWithDefaultApp(item.href),
                },
                {
                    label: "Show in File Explorer",
                    icon: "folder-open",
                    onClick: async () => {
                        const { api } = await import("../../ipc/renderer/api");
                        api.showItemInFolder(item.href);
                    },
                },
            );

            // Re-fire on fileExplorer.itemContextMenu for script compatibility.
            // Scripts work directly with event.items — same array instance.
            const { ContextMenuEvent: CtxMenuEvent } = await import("../api/events/events");
            const fileTarget = {
                path: item.href,
                name: item.title,
                isDirectory: item.isDirectory,
            };
            const compatEvent = new CtxMenuEvent("file-explorer-item", fileTarget, event.items);
            await app.events.fileExplorer.itemContextMenu.sendAsync(compatEvent);
        }
    });
}
