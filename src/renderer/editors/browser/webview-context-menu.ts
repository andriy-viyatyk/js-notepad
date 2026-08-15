const { ipcRenderer } = require("electron");
import { BrowserChannel } from "../../../ipc/browser-ipc";
import { pagesModel } from "../../api/pages";
import { showAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import type { MenuItem } from "../../uikit/Menu";
import { withTimeout } from "../../core/utils/utils";
import type { BrowserEditorModel } from "./BrowserEditorModel";

const SVG_PROBE_TIMEOUT = 250;
const LINK_PROBE_TIMEOUT = 1000;

export interface BrowserContextMenuInput {
    model: BrowserEditorModel;
    webview: Electron.WebviewTag;
    internalTabId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    showResources: (regKey: string, pageUrl: string, title: string) => void;
}

export async function showBrowserContextMenu({
    model,
    webview,
    internalTabId,
    data,
    showResources,
}: BrowserContextMenuInput): Promise<void> {
        const menuX = data.x || 0;
        const menuY = data.y || 0;

        const wvRect = webview.getBoundingClientRect();
        const probeX = menuX - wvRect.left;
        const probeY = menuY - wvRect.top;
        // SVG probe only used to decide whether to include the "Open SVG in Editor" item.
        // `webview.executeJavaScript` queues on the page renderer's main thread; if the page
        // is mid-load and the renderer is busy, awaiting it can block the menu for many
        // seconds. Race against a short budget on idle pages the probe returns near-
        // instantly; on busy pages we drop the SVG item and open the menu immediately.
        const svgProbe: Promise<string | null> = webview.executeJavaScript(`
            (() => {
                const el = document.elementFromPoint(${probeX}, ${probeY});
                const svg = el?.closest('svg');
                if (!svg) return null;

                const clone = svg.cloneNode(true);

                if (!clone.getAttribute('xmlns')) {
                    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                }

                if (!clone.getAttribute('viewBox')) {
                    try {
                        const bb = svg.getBBox();
                        if (bb.width > 0 && bb.height > 0) {
                            clone.setAttribute('viewBox',
                                bb.x + ' ' + bb.y + ' ' + bb.width + ' ' + bb.height);
                        }
                    } catch (e) {}
                }

                if (!clone.getAttribute('width') && !clone.getAttribute('height')) {
                    const vb = clone.getAttribute('viewBox');
                    if (vb) {
                        const parts = vb.split(/[\\s,]+/);
                        if (parts.length === 4) {
                            clone.setAttribute('width', parts[2]);
                            clone.setAttribute('height', parts[3]);
                        }
                    }
                }

                let html = clone.outerHTML;
                html = html.replace(/<!--[\\s\\S]*?-->/g, '');
                return html;
            })()
        `);
        const svgSource = await withTimeout<string | null>(svgProbe, SVG_PROBE_TIMEOUT, null);

        const items: MenuItem[] = [];

        // Link items
        if (data.linkURL) {
            const linkURL = data.linkURL;
            items.push({
                label: "Open Link in New Tab",
                onClick: () => {
                    const parentTab = model.state.get().tabs.find((t) => t.id === internalTabId);
                    model.addTab(linkURL, parentTab?.groupId);
                },
            });
            items.push({
                label: "Copy Link Address",
                onClick: () => navigator.clipboard.writeText(linkURL),
            });
            items.push({
                label: "Add to Bookmarks",
                onClick: async () => {
                    const bm = await model.bookmarksUI.ensureBookmarks();
                    if (!bm) return;
                    // Same busy-page hazard as the SVG probe above: the title/image are
                    // suggestions only, so open the dialog without them rather than wait.
                    const linkProbe: Promise<{ title: string; imgSrc: string }> = webview.executeJavaScript(`
                        (() => {
                            const el = document.elementFromPoint(${probeX}, ${probeY});
                            const link = el?.closest('a');
                            const img = link?.querySelector('img') || el?.querySelector('img');
                            return {
                                title: link?.textContent?.trim()?.substring(0, 200) || '',
                                imgSrc: img?.src || '',
                            };
                        })()
                    `);
                    // `linkURL` not `linkInfo` is what guarantees the dialog always has
                    // a URL; it comes from the context-menu params, never from the page.
                    const linkInfo = await withTimeout(linkProbe, LINK_PROBE_TIMEOUT, {
                        title: "",
                        imgSrc: "",
                    });
                    const existingLink = bm.findByUrl(linkURL);
                    await model.bookmarksUI.showBookmarkDialog({
                        title: linkInfo.title,
                        href: linkURL,
                        discoveredImages: linkInfo.imgSrc ? [linkInfo.imgSrc] : [],
                        imgSrc: linkInfo.imgSrc || undefined,
                        existingLink,
                    });
                },
            });
        }

        // Image items
        if (data.srcURL && data.mediaType === "image") {
            const srcURL = data.srcURL;
            items.push({
                label: "Open Image in New Tab",
                startGroup: items.length > 0,
                onClick: async () => {
                    pagesModel.openImageInNewTab(srcURL);
                },
            });
            items.push({
                label: "Copy Image Address",
                onClick: () => navigator.clipboard.writeText(srcURL),
            });
            items.push({
                label: "Use Image for Bookmark",
                onClick: () => {
                    model.bookmarksUI.trackClickedImages(internalTabId, [srcURL]);
                },
            });
        }

        // Selection items
        if (data.selectionText) {
            const selectionText = data.selectionText;
            items.push({
                label: "Copy",
                startGroup: items.length > 0,
                onClick: () => {
                    navigator.clipboard.writeText(selectionText);
                    webview.focus();
                },
            });
        }

        // Editable field items
        if (data.isEditable) {
            if (data.editFlags?.canCut) {
                items.push({
                    label: "Cut",
                    startGroup: !data.selectionText && items.length > 0,
                    onClick: () => {
                        webview.focus();
                        webview.cut();
                    },
                });
            }
            if (!data.selectionText && data.editFlags?.canCopy) {
                items.push({
                    label: "Copy",
                    onClick: () => {
                        webview.focus();
                        webview.copy();
                    },
                });
            }
            if (data.editFlags?.canPaste) {
                items.push({
                    label: "Paste",
                    onClick: () => {
                        webview.focus();
                        webview.paste();
                    },
                });
            }
        }

        // Navigation items
        const state = model.state.get();
        const tab = state.tabs.find((t) => t.id === internalTabId);
        items.push({
            label: "Back",
            startGroup: true,
            disabled: !tab?.canGoBack,
            onClick: () => webview.goBack(),
        });
        items.push({
            label: "Forward",
            disabled: !tab?.canGoForward,
            onClick: () => webview.goForward(),
        });
        items.push({
            label: "Reload",
            onClick: () => webview.reload(),
        });

        // View Source
        const pageUrl = tab?.url || "";
        items.push({
            label: "View Source",
            startGroup: true,
            disabled: !pageUrl || pageUrl === "about:blank",
            onClick: async () => {
                const resp = await webview.executeJavaScript(
                    `fetch(location.href).then(r => r.text())`,
                );
                pagesModel.addEditorPage("monaco", "html", "Source: " + (tab?.pageTitle || pageUrl), resp);
            },
        });

        // View actual DOM (includes iframe content via main process)
        const regKey = `${model.id}/${internalTabId}`;
        items.push({
            label: "View Actual DOM",
            onClick: async () => {
                const html = await ipcRenderer.invoke(
                    BrowserChannel.collectDom,
                    regKey,
                );
                pagesModel.addEditorPage("monaco", "html", "DOM: " + (tab?.pageTitle || pageUrl), html);
            },
        });

        // Show resources extracted from the page DOM + network log
        items.push({
            label: "Show Resources",
            onClick: () => showResources(regKey, pageUrl, tab?.pageTitle || pageUrl),
        });

        // SVG item
        if (svgSource) {
            items.push({
                label: "Open SVG in Editor",
                onClick: () => {
                    pagesModel.addEditorPage("monaco", "xml", "untitled.svg", svgSource);
                },
            });
        }

        // Inspect Element
        items.push({
            label: "Inspect Element",
            onClick: () => webview.inspectElement(probeX, probeY),
        });

        model.state.update((s) => { s.popupOpen = true; });
        showAppPopupMenu(menuX, menuY, items, {
            skipInspect: true,
        }).then(() => {
            model.state.update((s) => { s.popupOpen = false; });
        });

}
