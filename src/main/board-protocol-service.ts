import { net, session } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BoardThemePalette } from "../ipc/board-bridge-channels";

/**
 * `board://` scheme handler (EPIC-034 / US-723; host-routed in EPIC-037 / US-770) —
 * serves a board's own files in-process (no HTTP server / port).
 *
 * The scheme is declared privileged once at startup (`main-setup.ts`), and the
 * `protocol.handle("board", …)` is registered **once** on the host renderer's shared
 * session (`initBoardProtocol`, called at startup with `appPartition`). A board loads
 * a **distinct cross-origin** `board://<host>` where `host` is a stable hash of the
 * board root (`boardRootToHost`); the handler routes each request by its URL host to
 * the matching board root (`hostToRoot`). Per-board isolation comes from the distinct
 * cross-origin origin + `nodeIntegrationInSubFrames:false` + the served CSP — not from
 * a per-board session partition.
 *
 * No path-traversal guard, by design (US-723 C1): a board is trusted local code
 * that can do anything via `execute()` anyway, so restricting board file reads
 * would protect nothing. The only network boundary is the CSP (below), which
 * forbids remote.
 */

/** board:// URL host → absolute board root folder. Populated by `registerBoard` on
 *  board open, dropped by `unregisterBoard` on unmount/close. */
const hostToRoot = new Map<string, string>();

/** board:// URL host → its design + handshake context. The color palette + static
 *  metric tokens are injected as a `:root{--p-*}` `<style>` at serve time (parse-time
 *  theming → no first-paint flash); `hostOrigin` (the host renderer's origin) is baked
 *  into `window.__persephoneBoot` so the shim can validate the port handshake (US-771
 *  C2). Theme is app-global; each host registers with the then-current palette and
 *  `updateAllBoardThemes` refreshes them on a theme switch. */
interface BoardDesign {
    theme: BoardThemePalette;
    tokens: Record<string, string>;
    hostOrigin: string;
}
const hostToDesign = new Map<string, BoardDesign>();

/** Stable, DNS-label-safe `board://` host for a board root: a hash of the normalized
 *  path. Same root → same host → same `board://<host>` origin (so per-board storage
 *  is stable within an app run). The leading letter keeps it an unambiguous DNS label. */
export function boardRootToHost(boardRoot: string): string {
    const norm =
        process.platform === "win32"
            ? path.resolve(boardRoot).toLowerCase()
            : path.resolve(boardRoot);
    const hash = crypto.createHash("sha256").update(norm).digest("hex").slice(0, 20);
    return `b${hash}`;
}

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
 *  `var(--p-bg, #fff)`) never flash before the shim's JS application runs. */
function buildThemeStyle(design: BoardDesign | undefined): string {
    if (!design) return "";
    const decls: string[] = [];
    for (const [k, v] of Object.entries(design.theme.vars)) decls.push(`${k}:${v};`);
    for (const [k, v] of Object.entries(design.tokens)) decls.push(`${k}:${v};`);
    if (!decls.length) return "";
    return `<style id="persephone-theme-init">:root{${decls.join("")}}</style>`;
}

/** Escape a JSON string for safe embedding inside an inline `<script>` (prevent a
 *  value containing `</script>` from terminating the element early). */
function safeJson(value: unknown): string {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Build the `window.__persephoneBoot` `<script>` — the board context read
 *  synchronously by the shim before the first author script (replaces the old
 *  `getContext` IPC, US-771): initial theme/tokens + the host renderer origin for
 *  the C2 handshake check. */
function buildBootScript(design: BoardDesign | undefined): string {
    const boot = {
        theme: design?.theme ?? { id: "", isDark: true, vars: {} },
        tokens: design?.tokens ?? {},
        hostOrigin: design?.hostOrigin ?? "",
    };
    return `<script id="persephone-boot">window.__persephoneBoot=${safeJson(boot)};</script>`;
}

/** The bridge shim source (`board-shim.js`, built beside `main.js`), read once and
 *  cached. Inlined into served HTML so `window.persephone` exists synchronously,
 *  before the first author script (US-771). */
let shimSource: string | null = null;
function getShimSource(): string {
    if (shimSource === null) {
        try {
            shimSource = fs.readFileSync(path.join(__dirname, "board-shim.js"), "utf8");
        } catch (e) {
            console.error("board:// failed to load board-shim.js:", e);
            shimSource = "";
        }
    }
    return shimSource;
}

function buildShimScript(): string {
    const src = getShimSource();
    if (!src) return "";
    // Neutralize any `</script` terminator that could appear inside a string/regex
    // literal in the shim, so it can't close the injected element early. NOTE: this
    // is raw JS source, not JSON — a blanket `<` escape (as in safeJson) would
    // corrupt comparison operators (`i < n`); only the closing-tag sequence is escaped.
    const safe = src.replace(/<\/(script)/gi, "<\\/$1");
    return `<script id="persephone-shim">${safe}</script>`;
}

/** Insert `fragment` as early as possible in the document so the `--p-*` vars + the
 *  bridge shim are present before any board stylesheet/script resolves: right after
 *  the opening `<head>`, else after `<html …>`, else prepended. */
function injectHead(html: string, fragment: string): string {
    if (!fragment) return html;
    const headOpen = html.match(/<head[^>]*>/i);
    if (headOpen && headOpen.index !== undefined) {
        const idx = headOpen.index + headOpen[0].length;
        return html.slice(0, idx) + fragment + html.slice(idx);
    }
    const htmlOpen = html.match(/<html[^>]*>/i);
    if (htmlOpen && htmlOpen.index !== undefined) {
        const idx = htmlOpen.index + htmlOpen[0].length;
        return html.slice(0, idx) + fragment + html.slice(idx);
    }
    return fragment + html;
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

/** Log a missing board **document** to the board's `ui.log` (EPIC-037 / US-774 C11,
 *  mode A). A `board://` handler that returns a 404 `Response` is a *completed* load to
 *  Electron, so `did-fail-load` never fires for a renamed/missing `index.html` — log it
 *  here so the failure is reported immediately and precisely (the on-board log indicator
 *  lights; the mode-D watchdog still toasts). Never throws into the handler. */
function logBoardDocMissing(root: string, rel: string, reason: string): void {
    try {
        fs.appendFileSync(
            path.join(root, "ui.log"),
            `[${new Date().toISOString()}] [error] board document not found: ${rel} (${reason})\n`,
        );
    } catch {
        // Logging must never throw into the handler.
    }
}

async function serveBoardFile(url: string): Promise<Response> {
    const { host, pathname } = new URL(url);
    const root = hostToRoot.get(host);
    if (!root) return new Response("No board registered", { status: 404 });

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
        if (mime === "text/html") logBoardDocMissing(root, rel, "not found");
        return new Response("Not found", { status: 404 });
    }
    if (!response.ok) {
        if (mime === "text/html") logBoardDocMissing(root, rel, `status ${response.status}`);
        return new Response("Not found", { status: response.status || 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", mime);
    headers.set("Cache-Control", "no-store"); // boards are local; keeps edit→reload instant
    if (mime === "text/html") {
        headers.set("Content-Security-Policy", BOARD_CSP);
        // Inject, in order, into <head> (before any author script/stylesheet):
        //   1. the `--p-*` palette `<style>` → first paint is themed (no white flash);
        //   2. `window.__persephoneBoot` → initial theme/tokens + host origin (US-771);
        //   3. the bridge shim → defines `window.persephone` synchronously.
        const html = await response.text();
        const design = hostToDesign.get(host);
        const headFragment = buildThemeStyle(design) + buildBootScript(design) + buildShimScript();
        return new Response(injectHead(html, headFragment), {
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

/** Register the single `board://` handler on the host renderer's shared session.
 *  Call once at startup (the main window uses `appPartition`). The handler routes
 *  every request by its URL host → board root (`hostToRoot`); the registry is
 *  populated by `registerBoard`. */
export function initBoardProtocol(partition: string): void {
    const ses = session.fromPartition(partition);
    ses.protocol.handle("board", (request) => serveBoardFile(request.url));
}

/** Map a board into the host-routed registry; returns its stable `board://` host.
 *  Idempotent — re-registering the same root refreshes its design and returns the
 *  same host. The handler itself is already registered (`initBoardProtocol`).
 *  `hostOrigin` is the calling renderer's origin, baked into the shim for the C2
 *  handshake check (US-771). */
export function registerBoard(
    boardRoot: string,
    theme: BoardThemePalette,
    tokens: Record<string, string>,
    hostOrigin: string,
): string {
    const root = path.resolve(boardRoot);
    const host = boardRootToHost(root);
    hostToRoot.set(host, root);
    hostToDesign.set(host, { theme, tokens, hostOrigin });
    return host;
}

/** Drop a board from the registry on unmount/close. No session teardown — the host
 *  session is shared and long-lived (storage handling is US-772 / EPIC-037 C12). */
export function unregisterBoard(host: string): void {
    hostToRoot.delete(host);
    hostToDesign.delete(host);
}

/** Resolve a `board://` host → its absolute board root. Used by the per-board port
 *  bridge (US-771) to default `execute()` cwd + relative file paths. */
export function getBoardRootForHost(host: string): string | undefined {
    return hostToRoot.get(host);
}

/** Refresh the stored palette for every live board on a host theme switch. The theme
 *  is app-global, so all boards get the same palette. Without this, the design stored
 *  at registration goes stale and a board that reloads after a switch paints the old
 *  theme (the serve-time injection would use the registration-time palette). Metrics
 *  are theme-independent, so only the color palette changes. */
export function updateAllBoardThemes(theme: BoardThemePalette): void {
    for (const design of hostToDesign.values()) {
        design.theme = theme;
    }
}
