import { net, session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BoardThemePalette } from "../ipc/board-bridge-channels";

/**
 * `board://` scheme handler (EPIC-034 / US-723) — serves a board's own files
 * in-process (no HTTP server / port).
 *
 * The scheme is declared privileged once at startup (`main-setup.ts`), but the
 * `protocol.handle("board", …)` is registered **per board**, on that board's own
 * ephemeral `board-<uuid>` session partition, closed over the board's root folder
 * (`boardRoots`). Because the handler is partition-scoped, a request carries **no
 * board id in the URL** — clean addressing, nothing to leak or spoof.
 *
 * No path-traversal guard, by design (US-723 C1): a board is trusted local code
 * that can do anything via `execute()` anyway, so restricting webview file reads
 * would protect nothing. The only network boundary is the CSP (below), which
 * forbids remote.
 */

/** Per-board-partition → absolute board root folder. Also the seam US-724 reuses
 *  to resolve an `execute()` `cwd` from the calling webview's session partition. */
const boardRoots = new Map<string, string>();

/** Board session → absolute board root. The board webview's IPC `event.sender.session`
 *  IS the `session.fromPartition(partition)` instance registered here, so US-724's
 *  bridge resolves a board's `execute()` `cwd` from the caller's session — with no
 *  board id in the message. */
const sessionToRoot = new Map<Electron.Session, string>();

/** Board session → its design context (US-725): the initial color palette + the
 *  static metric tokens. Stored at registration so the one `getContext` lookup
 *  returns both. Theme is app-global, but keying per-session is symmetric with
 *  `sessionToRoot` — each board registers with the then-current palette. */
const sessionToDesign = new Map<
    Electron.Session,
    { theme: BoardThemePalette; tokens: Record<string, string> }
>();

/** CSP for board HTML documents: local origin only; inline scripts/styles allowed
 *  (author convenience, US-723 C2); remote forbidden. Set as a response header. */
const BOARD_CSP = [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
].join("; ");

/** Build a `:root{…}` `<style>` defining the board's `--p-*` color palette + static
 *  metric tokens. Injected into served HTML so the variables are defined at PARSE
 *  time — the first paint is themed and a board's light CSS fallbacks (e.g.
 *  `var(--p-bg, #fff)`) never flash before the preload's JS application runs. */
function buildThemeStyle(
    design: { theme: BoardThemePalette; tokens: Record<string, string> } | undefined,
): string {
    if (!design) return "";
    const decls: string[] = [];
    for (const [k, v] of Object.entries(design.theme.vars)) decls.push(`${k}:${v};`);
    for (const [k, v] of Object.entries(design.tokens)) decls.push(`${k}:${v};`);
    if (!decls.length) return "";
    return `<style id="persephone-theme-init">:root{${decls.join("")}}</style>`;
}

/** Insert `styleTag` as early as possible in the document so the `--p-*` vars are
 *  defined before any board stylesheet resolves: right after the opening `<head>`,
 *  else after `<html …>`, else prepended. */
function injectThemeStyle(html: string, styleTag: string): string {
    if (!styleTag) return html;
    const headOpen = html.match(/<head[^>]*>/i);
    if (headOpen && headOpen.index !== undefined) {
        const idx = headOpen.index + headOpen[0].length;
        return html.slice(0, idx) + styleTag + html.slice(idx);
    }
    const htmlOpen = html.match(/<html[^>]*>/i);
    if (htmlOpen && htmlOpen.index !== undefined) {
        const idx = htmlOpen.index + htmlOpen[0].length;
        return html.slice(0, idx) + styleTag + html.slice(idx);
    }
    return styleTag + html;
}

function boardMimeType(file: string): string {
    switch (path.extname(file).toLowerCase()) {
        case ".html":
        case ".htm":
            return "text/html";
        case ".js":
        case ".mjs":
            return "text/javascript";
        case ".css":
            return "text/css";
        case ".json":
        case ".map":
            return "application/json";
        case ".svg":
            return "image/svg+xml";
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".gif":
            return "image/gif";
        case ".webp":
            return "image/webp";
        case ".ico":
            return "image/x-icon";
        case ".woff":
            return "font/woff";
        case ".woff2":
            return "font/woff2";
        case ".ttf":
            return "font/ttf";
        case ".otf":
            return "font/otf";
        case ".wasm":
            return "application/wasm";
        case ".txt":
            return "text/plain";
        default:
            return "application/octet-stream";
    }
}

async function serveBoardFile(partition: string, url: string): Promise<Response> {
    const root = boardRoots.get(partition);
    if (!root) return new Response("No board registered", { status: 404 });

    const { pathname } = new URL(url);
    // Empty path → the board's entry point. No traversal guard (US-723 C1).
    const rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
    const resolved = path.resolve(root, rel);
    const mime = boardMimeType(resolved);

    let response: Response;
    try {
        response = await net.fetch(pathToFileURL(resolved).toString(), {
            bypassCustomProtocolHandlers: true,
        });
    } catch {
        return new Response("Not found", { status: 404 });
    }
    if (!response.ok) {
        return new Response("Not found", { status: response.status || 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", mime);
    headers.set("Cache-Control", "no-store"); // boards are local; keeps edit→reload instant
    if (mime === "text/html") {
        headers.set("Content-Security-Policy", BOARD_CSP);
        // Inject the resolved `--p-*` palette + tokens as a `:root{…}` <style> in the
        // document head so the first paint is already themed — boards with light CSS
        // fallbacks no longer flash white before the preload's JS sets the vars. The
        // preload still applies them (JS mirror + live theme switches); the inline
        // values it later sets win over this stylesheet rule, so there's no conflict.
        const html = await response.text();
        const design = sessionToDesign.get(session.fromPartition(partition));
        return new Response(injectThemeStyle(html, buildThemeStyle(design)), {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/** Register the `board://` handler on a board's dedicated session partition,
 *  closed over its root folder. Must be called before the webview navigates. */
export function registerBoardProtocol(
    partition: string,
    boardRoot: string,
    theme: BoardThemePalette,
    tokens: Record<string, string>,
): void {
    const root = path.resolve(boardRoot);
    boardRoots.set(partition, root);
    const ses = session.fromPartition(partition);
    sessionToRoot.set(ses, root);
    sessionToDesign.set(ses, { theme, tokens });
    ses.protocol.handle("board", (request) => serveBoardFile(partition, request.url));
}

/** Tear down a board's handler + clear its ephemeral session (on board switch/close). */
export async function unregisterBoardProtocol(partition: string): Promise<void> {
    const ses = session.fromPartition(partition);
    try {
        ses.protocol.unhandle("board");
    } catch {
        // Handler already gone — fine.
    }
    sessionToRoot.delete(ses);
    sessionToDesign.delete(ses);
    boardRoots.delete(partition);
    try {
        await ses.clearStorageData();
    } catch {
        // Best-effort cleanup of the ephemeral session.
    }
}

/** The absolute board root for a partition, or undefined. Used by US-724 to
 *  resolve an `execute()` `cwd` from the calling webview's session. */
export function getBoardRoot(partition: string): string | undefined {
    return boardRoots.get(partition);
}

/** The absolute board root for a board webview's session — resolved by US-724's
 *  bridge from `event.sender.session` (no board id in the IPC message). */
export function getBoardRootForSession(ses: Electron.Session): string | undefined {
    return sessionToRoot.get(ses);
}

/** The design context (color palette + metric tokens) for a board webview's session,
 *  or undefined. Used by US-725's bridge to answer `getContext`. */
export function getBoardDesignForSession(
    ses: Electron.Session,
): { theme: BoardThemePalette; tokens: Record<string, string> } | undefined {
    return sessionToDesign.get(ses);
}

/** Refresh the stored palette for every live board session on a host theme switch.
 *  The theme is app-global, so all sessions get the same palette. Without this, the
 *  design stored at registration goes stale and a guest that reloads after a switch
 *  paints the old theme (getContext returns the registration-time palette). Metrics
 *  are theme-independent, so only the color palette changes. */
export function updateAllBoardThemes(theme: BoardThemePalette): void {
    for (const design of sessionToDesign.values()) {
        design.theme = theme;
    }
}
