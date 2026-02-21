/**
 * Webview preload script.
 *
 * Runs inside each browser tab's guest page. Uses MutationObserver to
 * detect changes to <title> and <link rel="icon"> elements, then
 * notifies the host renderer via ipcRenderer.sendToHost().
 *
 * NOTE: Node globals (require, process, etc.) are available during
 * preload execution but removed from the page context afterwards.
 * Local variables captured in closures remain valid.
 */

const { ipcRenderer } = require("electron");

// ── Helpers ──────────────────────────────────────────────────────────

function getFavicon(): string {
    const links = document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="shortcut icon"], link[rel*="icon"]',
    );
    // Prefer the last matching link (sites often append the best one last)
    for (let i = links.length - 1; i >= 0; i--) {
        if (links[i].href) return links[i].href;
    }
    return "";
}

function getTitle(): string {
    return document.title || "";
}

// ── Reporters ────────────────────────────────────────────────────────

let lastTitle = "";
let lastFavicon = "";

function reportTitle() {
    const title = getTitle();
    if (title !== lastTitle) {
        lastTitle = title;
        ipcRenderer.sendToHost("page-title", title);
    }
}

function reportFavicon() {
    const favicon = getFavicon();
    if (favicon !== lastFavicon) {
        lastFavicon = favicon;
        ipcRenderer.sendToHost("page-favicon", favicon);
    }
}

function reportAll() {
    reportTitle();
    reportFavicon();
}

// ── MutationObserver ─────────────────────────────────────────────────

function observeHead() {
    const head = document.head;
    if (!head) return;

    const observer = new MutationObserver(() => {
        reportAll();
    });

    // Watch <head> for added/removed children (new <link> or <title> tags)
    // and attribute changes on existing elements (href changes on <link>)
    observer.observe(head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "rel"],
        characterData: true,
    });
}

// ── Bootstrap ────────────────────────────────────────────────────────

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        reportAll();
        observeHead();
    });
} else {
    reportAll();
    observeHead();
}

// Some sites set favicon/title via JS after the load event.
// Retry shortly after load to catch those.
window.addEventListener("load", () => {
    setTimeout(reportAll, 200);
    setTimeout(reportAll, 1000);
});
