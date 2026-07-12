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

const { ipcRenderer, contextBridge } = require("electron");

// ── window.chrome polyfill (US-813) ──────────────────────────────────
// Google sign-in rejects the browser ("This browser or app may not be
// secure" → /v3/signin/rejected) when window.chrome is an empty {}.
// Electron leaves it bare; real Chrome populates loadTimes/csi/app.
// Google reads it DURING page load, so it must exist in the page's MAIN
// world at document-start. The webview runs with contextIsolation:true,
// so the preload's own `window` is a separate world — a plain assignment
// here would be invisible to the page. contextBridge.executeInMainWorld
// bridges the definition into the page world without weakening isolation.
try {
    contextBridge.executeInMainWorld({
        func: () => {
            const w = window as unknown as { chrome?: Record<string, unknown> };
            // Real Chrome (or an already-applied shim) — leave it alone.
            if (w.chrome && typeof w.chrome.loadTimes === "function") return;
            const chrome: Record<string, unknown> = w.chrome || {};
            const now = () => Date.now() / 1000;
            if (typeof chrome.loadTimes !== "function") {
                chrome.loadTimes = (): Record<string, unknown> => {
                    const t = now();
                    return {
                        requestTime: t, startLoadTime: t, commitLoadTime: t,
                        finishDocumentLoadTime: t, finishLoadTime: t, firstPaintTime: t,
                        firstPaintAfterLoadTime: 0, navigationType: "Other",
                        wasFetchedViaSpdy: true, wasNpnNegotiated: true,
                        npnNegotiatedProtocol: "h2", wasAlternateProtocolAvailable: false,
                        connectionInfo: "h2",
                    };
                };
            }
            if (typeof chrome.csi !== "function") {
                chrome.csi = (): Record<string, unknown> =>
                    ({ startE: Date.now(), onloadT: Date.now(), pageT: 0, tran: 15 });
            }
            if (!chrome.app) {
                chrome.app = {
                    isInstalled: false,
                    InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
                    RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
                    getDetails: (): null => null,
                    getIsInstalled: (): boolean => false,
                };
            }
            w.chrome = chrome;
        },
    });
} catch {
    // Older Electron without executeInMainWorld, or isolation disabled — no-op.
}

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

// ── Keyboard Shortcuts ───────────────────────────────────────────────
// Intercept shortcuts that should be handled by the host renderer (find bar).
// Capture phase ensures we fire before page scripts that may stopPropagation.

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        e.stopImmediatePropagation();
        ipcRenderer.sendToHost("show-find-bar");
    } else if (e.key === "Escape") {
        if (expandedTarget) {
            exitCinema();
        } else {
            ipcRenderer.sendToHost("hide-find-bar");
        }
    }
}, true);

// ── Clicked Image Tracking (Phase 3.1) ──────────────────────────────
// When the user clicks an <a> that contains images (e.g. a video tile),
// send ALL image URLs to the host so they can be offered for bookmark selection.

document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    // Only track clicks that will navigate (inside an <a> with href)
    const link = target.closest("a") as HTMLAnchorElement | null;
    if (!link || !link.href) return;

    // Collect ALL images inside the link (thumbnails, overlays, icons, etc.)
    const imgs = link.querySelectorAll("img");
    const urls: string[] = [];
    const seen = new Set<string>();
    imgs.forEach((img) => {
        if (img.src && !seen.has(img.src)) {
            seen.add(img.src);
            urls.push(img.src);
        }
    });

    if (urls.length > 0) {
        ipcRenderer.sendToHost("clicked-images", urls);
    }
}, true); // Capture phase: fires before page scripts that may stopPropagation

// ── Cinema Mode — Expand <video> to Full Page ───────────────────────
// Detects <video> elements on any page. On hover, shows an
// expand/collapse button in the top-right corner. Clicking expands the
// element to fill the entire webview page, hiding other content.
//
// Design: button is created on mouseenter and removed on mouseleave.
// This avoids sites (e.g. YouTube) that clean up unexpected DOM children,
// and avoids Trusted Types CSP that blocks innerHTML.

type CinemaTarget = HTMLVideoElement;

let expandedTarget: CinemaTarget | null = null;
let expandedOriginalStyle = "";
let expandedOriginalControls = false;
let controlsObserver: MutationObserver | null = null;
let cinemaBtn: HTMLElement | null = null;
let cinemaBackdrop: HTMLElement | null = null;
let cinemaAncestors: { el: HTMLElement; css: string }[] = [];
let hiddenSiblings: { el: HTMLElement; orig: string }[] = [];

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgIcon(pathD: string): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "white");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    return svg;
}

const EXPAND_PATH =
    "M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm18 0v7h-7v-2h5v-5h2z";
const COLLAPSE_PATH =
    "M10 3v4H5v2h7V3h-2zm4 0v6h7V7h-5V3h-2zM5 15h5v6h-2v-4H5v-2zm14 0h-5v6h2v-4h5v-2z";

function isDecorativeElement(el: CinemaTarget): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 50) return true;
    if (el instanceof HTMLVideoElement) {
        if (el.autoplay && el.muted && el.loop) return true;
    }
    return false;
}

function createCinemaBtn(target: CinemaTarget): HTMLElement {
    const btn = document.createElement("div");
    btn.style.cssText = [
        "position:fixed",
        "width:32px",
        "height:32px",
        "background:rgba(0,0,0,0.6)",
        "border:none",
        "border-radius:4px",
        "cursor:pointer",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "z-index:2147483647",
        "pointer-events:auto",
    ].join(";") + ";";

    const isExpanded = expandedTarget === target;
    btn.appendChild(createSvgIcon(isExpanded ? COLLAPSE_PATH : EXPAND_PATH));
    btn.title = isExpanded ? "Exit Cinema Mode" : "Cinema Mode";

    if (isExpanded) {
        btn.style.top = "8px";
        btn.style.right = "8px";
    } else {
        const rect = target.getBoundingClientRect();
        // Clamp to viewport so the button doesn't go off-screen
        // when the element or its container is wider than the viewport
        const right = Math.min(rect.right, window.innerWidth);
        btn.style.top = (rect.top + 8) + "px";
        btn.style.left = (right - 40) + "px";
    }

    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (expandedTarget === target) {
            exitCinema();
        } else {
            enterCinema(target);
        }
    });

    return btn;
}

let cinemaBtnScrollHandler: (() => void) | null = null;

function showCinemaBtn(target: CinemaTarget) {
    if (cinemaBtn) return;
    cinemaBtn = createCinemaBtn(target);
    document.body.appendChild(cinemaBtn);

    cinemaBtn.addEventListener("mouseenter", () => {
        target.dataset.cinemaHover = "1";
    });
    cinemaBtn.addEventListener("mouseleave", () => {
        delete target.dataset.cinemaHover;
        removeCinemaBtn();
    });

    // Reposition on scroll so the button follows the target
    cinemaBtnScrollHandler = () => {
        if (!cinemaBtn || expandedTarget) return;
        const rect = target.getBoundingClientRect();
        const right = Math.min(rect.right, window.innerWidth);
        cinemaBtn.style.top = (rect.top + 8) + "px";
        cinemaBtn.style.left = (right - 40) + "px";
    };
    window.addEventListener("scroll", cinemaBtnScrollHandler, true);
}

function removeCinemaBtn() {
    if (!cinemaBtn) return;
    if (cinemaBtn.matches(":hover")) return;
    if (expandedTarget) return;
    if (cinemaBtnScrollHandler) {
        window.removeEventListener("scroll", cinemaBtnScrollHandler, true);
        cinemaBtnScrollHandler = null;
    }
    cinemaBtn.remove();
    cinemaBtn = null;
}

function attachCinemaListeners(target: CinemaTarget) {
    if (target.dataset.cinemaReady) return;
    target.dataset.cinemaReady = "1";

    const tryAttach = () => {
        if (target.dataset.cinemaAttached) return;
        if (isDecorativeElement(target)) return;
        target.dataset.cinemaAttached = "1";

        // Listen on the parent container too — overlay divs (e.g. click handlers)
        // often sit on top of the video and intercept mouse events.
        const hoverTarget = target.parentElement || target;
        hoverTarget.addEventListener("mouseenter", () => {
            showCinemaBtn(target);
        });
        hoverTarget.addEventListener("mouseleave", () => {
            setTimeout(() => {
                if (!target.dataset.cinemaHover) removeCinemaBtn();
            }, 100);
        });
    };

    // Defer for elements that may not have dimensions yet
    if (target instanceof HTMLVideoElement && target.readyState < 1) {
        target.addEventListener("loadedmetadata", tryAttach, { once: true });
        setTimeout(tryAttach, 1000);
        setTimeout(tryAttach, 3000);
    } else {
        const rect = target.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            tryAttach();
        } else {
            setTimeout(tryAttach, 1000);
            setTimeout(tryAttach, 3000);
        }
    }
}

function enterCinema(target: CinemaTarget) {
    if (expandedTarget) exitCinema();

    expandedTarget = target;
    expandedOriginalStyle = target.style.cssText;

    // For <video>: show native controls and keep them on
    if (target instanceof HTMLVideoElement) {
        expandedOriginalControls = target.controls;
        target.controls = true;
        controlsObserver = new MutationObserver(() => {
            if (expandedTarget instanceof HTMLVideoElement && !expandedTarget.controls) {
                expandedTarget.controls = true;
            }
        });
        controlsObserver.observe(target, { attributes: true, attributeFilter: ["controls"] });
    }

    // Expand the entire ancestor chain to fill the viewport.
    // Don't touch the target element itself — sites continuously overwrite
    // its inline styles. Instead, resize the containers and let the site's
    // own JS resize the content to fit.
    cinemaAncestors = [];
    let el: HTMLElement | null = target.parentElement;
    while (el && el !== document.documentElement) {
        cinemaAncestors.push({ el, css: el.style.cssText });
        el.style.cssText += [
            ";position:fixed !important",
            "top:0 !important",
            "left:0 !important",
            "width:100vw !important",
            "height:100vh !important",
            "max-width:none !important",
            "max-height:none !important",
            "margin:0 !important",
            "padding:0 !important",
            "z-index:2147483646 !important",
            "overflow:visible !important",
        ].join(";") + ";";
        el = el.parentElement;
    }

    // Hide siblings of every ancestor to remove sidebar, header, etc.
    hiddenSiblings = [];
    let current: HTMLElement | null = target;
    while (current && current !== document.documentElement) {
        const par: HTMLElement | null = current.parentElement;
        if (par) {
            for (const child of par.children) {
                if (child === current || !(child instanceof HTMLElement)) continue;
                hiddenSiblings.push({ el: child, orig: child.style.visibility });
                child.style.visibility = "hidden";
            }
        }
        current = par;
    }

    // Black backdrop
    cinemaBackdrop = document.createElement("div");
    cinemaBackdrop.style.cssText = [
        "position:fixed",
        "top:0",
        "left:0",
        "width:100vw",
        "height:100vh",
        "background:black",
        "z-index:2147483645",
    ].join(";") + ";";
    document.body.appendChild(cinemaBackdrop);

    // Recreate button in expanded position
    if (cinemaBtn) { cinemaBtn.remove(); cinemaBtn = null; }
    cinemaBtn = createCinemaBtn(target);
    document.body.appendChild(cinemaBtn);

    document.documentElement.dataset.cinemaActive = "1";
    document.documentElement.style.overflow = "hidden";

    // Trigger site's resize handlers so the content fills the new container size
    window.dispatchEvent(new Event("resize"));
}

function exitCinema() {
    if (!expandedTarget) return;

    // Restore video controls
    if (controlsObserver) { controlsObserver.disconnect(); controlsObserver = null; }
    if (expandedTarget instanceof HTMLVideoElement) {
        expandedTarget.controls = expandedOriginalControls;
    }
    expandedTarget.style.cssText = expandedOriginalStyle;
    expandedTarget = null;
    expandedOriginalStyle = "";

    // Restore ancestor styles (reverse order for clean teardown)
    for (let i = cinemaAncestors.length - 1; i >= 0; i--) {
        cinemaAncestors[i].el.style.cssText = cinemaAncestors[i].css;
    }
    cinemaAncestors = [];

    // Restore hidden siblings
    for (const saved of hiddenSiblings) {
        saved.el.style.visibility = saved.orig;
    }
    hiddenSiblings = [];

    if (cinemaBackdrop) { cinemaBackdrop.remove(); cinemaBackdrop = null; }
    if (cinemaBtn) { cinemaBtn.remove(); cinemaBtn = null; }

    delete document.documentElement.dataset.cinemaActive;
    document.documentElement.style.overflow = "";

    // Trigger site's resize handlers to recalculate back to original size
    window.dispatchEvent(new Event("resize"));
}

function initCinemaMode() {
    const processTarget = (target: CinemaTarget) => attachCinemaListeners(target);

    document.querySelectorAll<HTMLVideoElement>("video").forEach(processTarget);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLVideoElement) {
                    processTarget(node);
                } else if (node instanceof HTMLElement) {
                    node.querySelectorAll<HTMLVideoElement>("video").forEach(processTarget);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// ── Bootstrap ────────────────────────────────────────────────────────

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        reportAll();
        observeHead();
        initCinemaMode();
    });
} else {
    reportAll();
    observeHead();
    initCinemaMode();
}

// Some sites set favicon/title via JS after the load event.
// Retry shortly after load to catch those.
window.addEventListener("load", () => {
    setTimeout(reportAll, 200);
    setTimeout(reportAll, 1000);
});
