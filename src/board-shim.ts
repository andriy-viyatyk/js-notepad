/**
 * Board bridge shim (EPIC-037 / US-771) — the successor to `preload-board.ts`.
 *
 * Unlike a webview preload, this runs in a PLAIN BROWSER context inside the board
 * `<iframe>` (no Node, no Electron, no `ipcRenderer`). The `board://` handler inlines
 * its built output (`board-shim.js`) into served board HTML `<head>`, BEFORE any
 * author script, so `window.persephone` exists synchronously when the board runs.
 *
 * Transport: a `MessageChannelMain` port minted per board in main and transferred
 * into this frame by the host renderer (the one-time handshake). Until the port
 * arrives, port-dependent calls QUEUE; on connect they FLUSH. Thereafter the board
 * talks DIRECTLY to a main-process handler over the duplex port — request/reply
 * (dialogs, readFile/writeFile), fire-and-forget (openRawLink/notify), streaming
 * `execute()` (stdout/stderr/exit/error + stdin/kill), and a main→board theme push.
 *
 * The `window.persephone` surface is byte-for-byte the same as the old preload so
 * board authors see no difference. Build: a standalone browser IIFE (no runtime
 * imports beyond dependency-free values — the `RunnerChannel` string enum and the
 * `errMessage` helper). Built as `format: "iife"` by scripts/build-prod.mjs and
 * scripts/dev.mjs.
 */
import {
    RunnerChannel,
    type IExecuteError,
    type IExecuteHandle,
    type IExecuteOptions,
    type IExitInfo,
    type RunnerChunkMsg,
    type RunnerErrorMsg,
    type RunnerExitMsg,
} from "./ipc/runner-channels";
import type {
    BoardBootContext,
    BoardFireMethod,
    BoardHostContentMsg,
    BoardJobInfo,
    BoardRpcMethod,
    BoardStateSyncMsg,
    BoardThemePalette,
    BoardToMain,
    MainToBoard,
} from "./ipc/board-bridge-channels";
import { errMessage } from "./shared/utils";

// ── Boot context (injected synchronously before this script) ─────────────────

const boot: BoardBootContext =
    (window as unknown as { __persephoneBoot?: BoardBootContext }).__persephoneBoot ?? {
        theme: { id: "", isDark: true, vars: {} },
        tokens: {},
        hostOrigin: "",
    };

// Origin-locking is only reliable for an http(s) dev host. In production the host
// window is loaded from `file://`, and the file origin is serialized inconsistently
// across boundaries: the main process bakes `new URL(file://…).origin` === "null"
// into `boot.hostOrigin`, while the board frame sees the host's `event.origin` as
// "file://" — so a strict `event.origin === boot.hostOrigin` check can never pass,
// and "file://"/"null" are not usable postMessage `targetOrigin`s anyway. So enforce
// origin-locking ONLY for an http(s) host; for a file:// (or unknown) host drop it:
// the load-bearing inbound gate is `event.source === window.parent`, and the
// outbound host-frame pings (non-sensitive, and re-validated by the host on board
// origin + source frame) target `"*"`.
const hostOriginStrict = /^https?:\/\//i.test(boot.hostOrigin);
const hostPostTarget = hostOriginStrict ? boot.hostOrigin : "*";

// ── View role (EPIC-044 / O6) ────────────────────────────────────────────────
// Which view this frame renders: "main" for the board's main iframe, or a declared
// secondary view's id. Delivered synchronously via the iframe src's `view=` query param
// (read here before any author script), so a single HTML file can branch on
// `persephone.view` to render every view. Absent → "main" (a plainly-loaded board).
let viewRole = "main";
try {
    const v = new URLSearchParams(location.search).get("view");
    if (v) viewRole = v;
} catch {
    // location unavailable — keep "main"
}

let currentTheme: BoardThemePalette = boot.theme;
const tokens: Record<string, string> = boot.tokens;
const themeCbs: Array<(t: BoardThemePalette) => void> = [];

// ── Busy flag (US-799) ────────────────────────────────────────────────────────
// `null` until known: the handshake init message carries the host-side value (a
// re-created busy board reads `true`); a local `setBoardBusy` call sets it
// immediately and wins over a later-arriving init. `getBoardBusy()` awaits the
// handshake when called before either happened.

let busyState: boolean | null = null;
const busyResolvers: Array<(b: boolean) => void> = [];

function settleBusy(value: boolean): void {
    busyState = value;
    for (const r of busyResolvers) r(value);
    busyResolvers.length = 0;
}

// ── filePath (EPIC-042) ─────────────────────────────────────────────────────────
// The file a custom-editor board edits, carried at the handshake. `getFilePath()` awaits
// the handshake; a plain board settles to `undefined`. A separate `settled` flag (not a
// null sentinel like busy) because `undefined` is itself a valid settled value.

let filePathSettled = false;
let filePathValue: string | undefined;
const filePathResolvers: Array<(p: string | undefined) => void> = [];

// True when the handshake `filePath` is NOT directly readable — its real source is an archive entry
// or an `http(s)` URL. `getFilePath()` then resolves through a `board:filePath` request, so the
// board always receives a readable LOCAL path (Persephone materializes the source into a cache
// file). The resolved path is memoized below, so repeated calls cost one request.
let filePathNeedsMaterialize = false;
let materializedPath: string | undefined;
let materializedPromise: Promise<string | undefined> | null = null;

function settleFilePath(value: string | undefined): void {
    filePathSettled = true;
    filePathValue = value;
    for (const r of filePathResolvers) r(value);
    filePathResolvers.length = 0;
}

/** Resolves once the host handshake has landed (every handshake settles the file path,
 *  plain boards included) — the point where `hostEnabled` is authoritative. Lets the
 *  `host.*` API be called at ANY time: it awaits this gate internally instead of
 *  rejecting/no-oping when invoked before the handshake. */
function whenHandshake(): Promise<void> {
    if (filePathSettled) return Promise.resolve();
    return new Promise<void>((resolve) => filePathResolvers.push(() => resolve()));
}

// ── Host content (EPIC-043) ──────────────────────────────────────────────────
// Content-host boards read Persephone-owned content pushed as `host:content`. A snapshot lands
// after the frame loads, then on every change. `getContent()` awaits the first snapshot (settle-
// once + await-any-time, like getFilePath); `onContentChange` fires on each subsequent push.
// `hostEnabled` is set from the handshake — false on a plain board, where getContent rejects.

let hostEnabled = false;
let hostContentSettled = false;
let hostContent = "";
let hostLanguage: string | undefined;
const hostContentResolvers: Array<(c: string) => void> = [];
const hostChangeCbs: Array<(content: string, language?: string) => void> = [];

function settleHostContent(content: string, language: string | undefined): void {
    hostContent = content;
    hostLanguage = language;
    if (!hostContentSettled) {
        hostContentSettled = true;
        for (const r of hostContentResolvers) r(content);
        hostContentResolvers.length = 0;
    }
    for (const cb of hostChangeCbs) {
        try {
            cb(content, language);
        } catch (e) {
            console.error("persephone.host.onContentChange callback error:", e);
        }
    }
}

// ── Shared state (EPIC-044) ────────────────────────────────────────────────────
// A pure replica of the Persephone-side shared state, updated ONLY by seq-stamped
// `state:sync` pushes. `get()` settles on the first snapshot (await any time), `onChange`
// fires on each subsequent one. Writes (init/set/merge) post to the host and come back
// as a push — onChange is the source of truth, like React setState.

let sharedStateSettled = false;
let sharedState: Record<string, unknown> = {};
let sharedStateSeq = -1; // seed arrives at seq 0
const sharedStateResolvers: Array<(s: Record<string, unknown>) => void> = [];
const sharedStateCbs: Array<(s: Record<string, unknown>) => void> = [];

function applyStateSync(state: Record<string, unknown>, seq: number): void {
    if (seq <= sharedStateSeq) return; // stale / out-of-order — ignore
    sharedStateSeq = seq;
    sharedState = state;
    if (!sharedStateSettled) {
        sharedStateSettled = true;
        for (const r of sharedStateResolvers) r(state);
        sharedStateResolvers.length = 0;
    }
    for (const cb of sharedStateCbs) {
        try {
            cb(state);
        } catch (e) {
            console.error("persephone.state.onChange callback error:", e);
        }
    }
}

// ── Port plumbing (queue-then-flush) ─────────────────────────────────────────

let port: MessagePort | null = null;
/** Outgoing messages queued until the port connects, then flushed in order. */
const sendQueue: BoardToMain[] = [];
/** Pending request/reply promises keyed by rpc id. */
const pendingRpc = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let rpcId = 0;
/** Per-job runner routers (an execute handle registers/unregisters its jobId). */
const runnerHandlers = new Map<string, (channel: RunnerChannel, msg: unknown) => void>();

/** Pending var request/reply promises keyed by reqId (host-frame channel, EPIC-046). */
const pendingVar = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let varReqId = 0;

/** Pending content-path request/reply promises keyed by reqId (host-frame channel). */
const pendingFilePath = new Map<
    number,
    { resolve: (v: string | undefined) => void; reject: (e: Error) => void }
>();
let filePathReqId = 0;

/** Ask the renderer for a readable local path for this board's file. Used only when the source is
 *  non-local — the renderer materializes it (which for an `http(s)` source means downloading it),
 *  so this can take a while. */
function filePathRpc(): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve, reject) => {
        const reqId = ++filePathReqId;
        pendingFilePath.set(reqId, { resolve, reject });
        try {
            window.parent.postMessage(
                { __persephone: "board:filePath", reqId },
                hostPostTarget,
            );
        } catch {
            pendingFilePath.delete(reqId);
            reject(new Error("Persephone host is unavailable."));
        }
    });
}

function varRpc(method: "get" | "set" | "list" | "show", args: unknown[]): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
        const reqId = ++varReqId;
        pendingVar.set(reqId, { resolve, reject });
        try {
            window.parent.postMessage(
                { __persephone: "board:var", reqId, varMethod: method, varArgs: args },
                hostPostTarget,
            );
        } catch {
            pendingVar.delete(reqId);
            reject(new Error("Persephone host is unavailable."));
        }
    });
}

function post(msg: BoardToMain): void {
    if (port) port.postMessage(msg);
    else sendQueue.push(msg);
}

function rpc(method: BoardRpcMethod, args: unknown[]): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
        const id = ++rpcId;
        pendingRpc.set(id, { resolve, reject });
        post({ kind: "rpc", id, method, args });
    });
}

function fire(method: BoardFireMethod, args: unknown[]): void {
    post({ kind: "fire", method, args });
}

function applyVars(vars: Record<string, string>): void {
    const root = document?.documentElement;
    if (!root) return;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

function onPortMessage(data: MainToBoard): void {
    if (!data) return;
    if (data.kind === "rpc-result") {
        const p = pendingRpc.get(data.id);
        if (!p) return;
        pendingRpc.delete(data.id);
        if (data.error != null) p.reject(new Error(data.error));
        else p.resolve(data.result);
        return;
    }
    if (data.kind === "runner") {
        const jobId = (data.msg as { jobId: string }).jobId;
        const h = runnerHandlers.get(jobId);
        if (h) h(data.channel, data.msg);
        return;
    }
    if (data.kind === "theme") {
        currentTheme = data.palette;
        applyVars(data.palette.vars);
        for (const cb of themeCbs) {
            try {
                cb(data.palette);
            } catch (e) {
                console.error("persephone.onThemeChange callback error:", e);
            }
        }
    }
}

function attachPort(p: MessagePort): void {
    if (port) return; // already connected (ignore a duplicate handshake)
    port = p;
    p.onmessage = (ev: MessageEvent) => onPortMessage(ev.data as MainToBoard);
    // Flush queued outgoing messages in order.
    for (const msg of sendQueue) p.postMessage(msg);
    sendQueue.length = 0;
    // Mode D (EPIC-037 C11): tell main the bridge is live so its handshake watchdog stands
    // down. A board that paints but never reaches here is reported as "bridge dead".
    p.postMessage({ kind: "connected" } as BoardToMain);
}

// One-time handshake: accept the transferred port only from the host renderer
// parent frame (C2). `event.source === window.parent` is the load-bearing check;
// the origin check is belt-and-suspenders, enforced only for a strict (http[s])
// host — a file:// host's cross-origin `event.origin` is the opaque "null" and
// would never match the baked "file://" (see `hostOriginStrict` above).
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as
        {
            __persephoneInit?: boolean; busy?: boolean; filePath?: string;
            contentHost?: boolean; materialize?: boolean;
        }
        | undefined;
    if (!data || data.__persephoneInit !== true) return;
    if (event.source !== window.parent) return;
    if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
    // Busy flag carried at handshake (US-799). A local setBoardBusy call that
    // already ran wins (busyState !== null) — the init value is then stale.
    if (busyState === null) settleBusy(!!data.busy);
    // filePath carried at handshake (EPIC-042). Every handshake settles it — a plain board
    // carries `undefined`, so `getFilePath()` still resolves (to undefined).
    if (!filePathSettled) {
        // Non-local source flag — read BEFORE settling, since settling releases waiting
        // `getFilePath()` calls and they branch on it.
        filePathNeedsMaterialize = !!data.materialize;
        settleFilePath(data.filePath);
    }
    // Content-host flag (EPIC-043) — gates the persephone.host content API.
    if (data.contentHost) hostEnabled = true;
    const p = event.ports && event.ports[0];
    if (p) attachPort(p);
});

// Host content push (EPIC-043) — renderer → board over window.postMessage. Same trust gate as the
// handshake: source must be the host parent frame; origin enforced only for a strict http(s) host.
// A SEPARATE listener because the handshake listener above early-returns non-`__persephoneInit`.
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as BoardHostContentMsg | undefined;
    if (!data || data.__persephone !== "host:content") return;
    if (event.source !== window.parent) return;
    if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
    settleHostContent(data.content, data.language);
});

// Shared-state push (EPIC-044) — renderer → board. Same trust gate as host:content.
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as BoardStateSyncMsg | undefined;
    if (!data || data.__persephone !== "state:sync") return;
    if (event.source !== window.parent) return;
    if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
    applyStateSync(data.state ?? {}, typeof data.seq === "number" ? data.seq : 0);
});

// Content-path request reply — renderer → board. Same trust gate as host:content/state:sync.
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as
        { __persephone?: string; reqId?: number; path?: string; error?: string }
        | undefined;
    if (!data || data.__persephone !== "filePath:result" || typeof data.reqId !== "number") return;
    if (event.source !== window.parent) return;
    if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
    const p = pendingFilePath.get(data.reqId);
    if (!p) return;
    pendingFilePath.delete(data.reqId);
    if (data.error != null) p.reject(new Error(data.error));
    else p.resolve(data.path);
});

// Var request reply (EPIC-046) — renderer → board. Same trust gate as host:content/state:sync.
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as
        { __persephone?: string; reqId?: number; result?: unknown; error?: string }
        | undefined;
    if (!data || data.__persephone !== "var:result" || typeof data.reqId !== "number") return;
    if (event.source !== window.parent) return;
    if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
    const p = pendingVar.get(data.reqId);
    if (!p) return;
    pendingVar.delete(data.reqId);
    if (data.error != null) p.reject(new Error(data.error));
    else p.resolve(data.result);
});

// Automatic save (EPIC-043 / CH3) — a content-host board saves through Persephone's pipe on
// Ctrl/Cmd+S with zero board code. `window` bubble phase, so a board handler on document/an element
// runs FIRST and can opt out via preventDefault(). Harmless on a plain board (main ignores it).
window.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        if (e.defaultPrevented) return; // the board claimed it — stand down
        e.preventDefault();
        try {
            window.parent.postMessage({ __persephone: "board:save" }, hostPostTarget);
        } catch {
            // parent gone — nothing to save
        }
    }
});

// App theme shortcuts (Ctrl+Alt+[ / Ctrl+Alt+]) — the host's global KeyboardService listens on
// the HOST document, which a cross-origin board frame's keydown never reaches (SOP). Board authors
// switch themes constantly while testing a board, so forward the two theme keys to the host the
// same way Ctrl+S is forwarded: `window` bubble phase, `defaultPrevented` opt-out.
window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!e.ctrlKey || !e.altKey) return;
    if (e.code !== "BracketRight" && e.code !== "BracketLeft") return;
    if (e.defaultPrevented) return; // the board claimed it — stand down
    e.preventDefault();
    try {
        window.parent.postMessage(
            { __persephone: "board:cycleTheme", direction: e.code === "BracketRight" ? 1 : -1 },
            hostPostTarget,
        );
    } catch {
        // parent gone — nothing to theme
    }
});

// External-link routing (US-884) — a board frame lives on a locked-down `board://` origin.
// A plain `<a href="http(s)://…">` (e.g. a hyperlink inside a rendered .docx) would navigate
// the FRAME itself to that URL, which the host renderer's frame-src CSP blocks (ERR_BLOCKED_BY_CSP)
// — leaving the board blank (white screen). The main-process `will-frame-navigate` guard can't
// help here: the renderer's CSP cancels the navigation before it reaches the browser process.
// So intercept anchor activations at the DOM level, BEFORE any navigation starts, and route the
// URL through Persephone's normal openRawLink flow instead — the link opens in a Persephone page /
// the browser. In-board navigation (board://<host>/…, including `#fragment` links, which resolve
// against the board origin) is left untouched. Bubble phase + a `defaultPrevented` check so a
// board that wants to handle its own links can opt out via `preventDefault()`.
function routeExternalLinkClick(e: MouseEvent): void {
    if (e.defaultPrevented) return; // the board claimed it — stand down
    const target = e.target as Element | null;
    const anchor = target && target.closest ? target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    // `anchor.href` is the RESOLVED absolute URL — relative paths and `#fragments` resolve
    // against the board:// document, so they start with `board://` and are left to navigate
    // in-frame as normal. `javascript:` runs script, not a navigation — leave it alone too.
    const href = anchor.href;
    if (!href || href.startsWith("board://") || href.startsWith("javascript:")) return;
    e.preventDefault();
    fire("openRawLink", [href]);
}
window.addEventListener("click", routeExternalLinkClick);
window.addEventListener("auxclick", (e: MouseEvent) => {
    // Middle-click on a link also navigates in a plain browser context — route it too.
    if (e.button === 1) routeExternalLinkClick(e);
});

// Default context menu — a board lives on a locked-down `board://` origin with no access to
// Persephone's native context menu, so right-click gets nothing by default. Provide a minimal
// built-in menu so boards behave like other apps without any board code:
//   • a link (the same external links routeExternalLinkClick opens) → "Open Link" / "Copy Link"
//   • selected text → "Copy"
// A board can render its OWN menu instead by calling preventDefault() on the contextmenu event
// (bubble phase — a board handler on document/an element runs first), exactly like the Ctrl+S
// and link-click opt-outs. The menu is a small themed popover drawn from the injected --p-* vars.
interface CtxItem {
    label: string;
    action: () => void;
    /** Draw a divider line above this item (used to separate groups). */
    separator?: boolean;
}

let ctxMenuEl: HTMLDivElement | null = null;

function copyText(text: string): void {
    try {
        // The board frame is granted clipboard-write (BoardWebview `allow`), and the menu click is
        // a user gesture, so writeText is permitted here. Best-effort — a blocked clipboard no-ops.
        if (navigator.clipboard && navigator.clipboard.writeText) void navigator.clipboard.writeText(text);
    } catch {
        // clipboard unavailable — nothing to do
    }
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Failed to read the image."));
        reader.readAsDataURL(blob);
    });
}

// Open an image in Persephone's Image Viewer in a NEW page (via openRawLink + the "image-view"
// editor target — the same mechanism the built-in viewers use). A `data:`/`http(s)` src opens
// directly; a `board://` or `blob:` src is frame-scoped (Persephone can't read it), so we fetch it
// same-origin and hand over a `data:` URL instead.
async function openImageInNewTab(src: string): Promise<void> {
    try {
        let href = src;
        if (src.startsWith("board://") || src.startsWith("blob:")) {
            const resp = await fetch(src);
            href = await blobToDataUrl(await resp.blob());
        }
        fire("openRawLink", [href, "image-view"]);
    } catch (e) {
        fire("notify", [`Failed to open image: ${errMessage(e)}`, "error"]);
    }
}

const MIME_EXT: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
};

// Draw the already-loaded <img> onto a canvas at natural size. Same-origin (data:/board://) images
// aren't tainted; a cross-origin (http) image taints the canvas and later toBlob/toDataURL throws.
function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("Image not ready.");
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    ctx.drawImage(img, 0, 0);
    return canvas;
}

// Copy an image to the clipboard as PNG — canvas rasterization, no network.
async function copyImage(img: HTMLImageElement): Promise<void> {
    try {
        const canvas = imgToCanvas(img);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Could not encode the image.");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch (e) {
        fire("notify", [`Failed to copy image: ${errMessage(e)}`, "error"]);
    }
}

const BASE64_OF = (dataUrl: string): string => {
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : "";
};

// Decode a data: URL into { base64, ext } WITHOUT fetch — the board CSP's `connect-src 'self'`
// forbids fetching a data: URL (it raises ERR — the bug this fixes). base64 payloads are used
// verbatim; a percent-encoded payload (e.g. inline SVG) is re-encoded to base64.
function dataUrlToParts(src: string): { b64: string; ext: string } | null {
    const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(src);
    if (!m) return null;
    const mime = m[1] || "text/plain";
    const ext = MIME_EXT[mime] || (mime.split("/")[1] || "png").replace(/\+.*$/, "");
    try {
        return { b64: m[2] ? m[3] : btoa(decodeURIComponent(m[3])), ext };
    } catch {
        return null; // non-Latin1 percent-encoded payload — let the caller fall back
    }
}

// A sensible default file name for "Save Image As…": the source's own basename when it has one
// (board:// / http paths), else `image.<ext>` (data: URLs carry no name).
function suggestImageName(src: string, ext: string): string {
    try {
        if (src.startsWith("data:")) return "image." + ext;
        const base = new URL(src).pathname.split("/").pop() || "";
        if (/\.[a-z0-9]+$/i.test(base)) return base;
        return (base || "image") + "." + ext;
    } catch {
        return "image." + ext;
    }
}

// Save an image to disk via the native save dialog, then write the bytes through the bridge as
// base64. Source resolution avoids anything the board CSP blocks: a data: URL is decoded directly;
// board:// is same-origin so fetch is allowed (keeps the original format); anything else (or a
// blocked/failed fetch) falls back to re-encoding the loaded <img> to PNG via canvas (no network).
async function saveImageAs(img: HTMLImageElement, src: string): Promise<void> {
    try {
        let b64 = "";
        let ext = "png";
        const parts = src.startsWith("data:") ? dataUrlToParts(src) : null;
        if (parts) {
            b64 = parts.b64;
            ext = parts.ext;
        } else {
            try {
                const blob = await (await fetch(src)).blob();
                ext = MIME_EXT[blob.type] || "png";
                b64 = BASE64_OF(await blobToDataUrl(blob));
            } catch {
                // fetch blocked (data:/blob:/cross-origin) — re-encode the loaded image to PNG.
                b64 = BASE64_OF(imgToCanvas(img).toDataURL("image/png"));
                ext = "png";
            }
        }
        if (!b64) throw new Error("Could not read the image.");
        const path = (await rpc("saveFileDialog", [
            {
                title: "Save Image",
                defaultPath: suggestImageName(src, ext),
                filters: [
                    { name: "Image", extensions: [ext] },
                    { name: "All Files", extensions: ["*"] },
                ],
            },
        ])) as string | undefined;
        if (!path) return; // cancelled
        await rpc("writeFile", [path, b64, "base64"]);
        fire("notify", ["Image saved.", "success"]);
    } catch (e) {
        fire("notify", [`Failed to save image: ${errMessage(e)}`, "error"]);
    }
}

// ── Editable-field clipboard (Cut / Copy / Paste) ─────────────────────────────
// Right-clicking a focused text field offers the usual clipboard actions. Native Ctrl+C/X/V
// already work in a board input; this just exposes them on the menu. Restricted to text-like
// inputs, textareas, and contenteditable — the types where setRangeText / selection is valid.

const SELECTABLE_INPUT_TYPES = ["text", "search", "url", "tel", "password", ""];

function editableTarget(node: Element | null): HTMLElement | null {
    const el = node && node.closest ? node.closest("input, textarea, [contenteditable]") : null;
    if (el instanceof HTMLInputElement) {
        return SELECTABLE_INPUT_TYPES.includes((el.type || "text").toLowerCase()) ? el : null;
    }
    if (el instanceof HTMLTextAreaElement) return el;
    if (el instanceof HTMLElement && el.isContentEditable) return el;
    return null;
}

function isReadonly(el: HTMLElement): boolean {
    return (
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
        (el.readOnly || el.disabled)
    );
}

/** The currently-selected text within an editable element. */
function editableSelection(el: HTMLElement): string {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    }
    return window.getSelection()?.toString() ?? "";
}

function deleteSelection(el: HTMLElement): void {
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        if (start === end) return;
        el.setRangeText("", start, end, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
        document.execCommand("delete");
    }
}

function insertIntoEditable(el: HTMLElement, text: string): void {
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        el.setRangeText(text, start, end, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
        // contentEditable has no setRangeText equivalent — execCommand is the deliberate fallback
        // (formally deprecated but still the only in-place editing primitive in Chromium/Electron).
        document.execCommand("insertText", false, text);
    }
}

function copyEditable(el: HTMLElement): void {
    const text = editableSelection(el);
    if (text) copyText(text);
}

function cutEditable(el: HTMLElement): void {
    copyEditable(el);
    deleteSelection(el);
}

async function pasteEditable(el: HTMLElement): Promise<void> {
    try {
        const text = await navigator.clipboard.readText();
        if (text) insertIntoEditable(el, text);
    } catch (e) {
        fire("notify", [`Paste failed: ${errMessage(e)}`, "error"]);
    }
}

function ensureCtxMenu(): HTMLDivElement {
    if (ctxMenuEl) return ctxMenuEl;
    const el = document.createElement("div");
    el.setAttribute("data-persephone-menu", "");
    // position:fixed so body overflow can't clip it; z-index maxed so it floats over board content.
    // Themed with the injected --p-* vars (fallbacks match the board default dark chrome).
    el.style.cssText = [
        "position:fixed",
        "z-index:2147483647",
        "display:none",
        "flex-direction:column",
        "min-width:140px",
        "margin:0",
        "padding:4px",
        "background:var(--p-panel, #252526)",
        "border:1px solid var(--p-border, #3c3c3c)",
        "border-radius:var(--p-radius-sm, 3px)",
        "box-shadow:0 4px 12px rgba(0, 0, 0, 0.4)",
        "font-size:var(--p-font-base, 13px)",
        "color:var(--p-text, #ddd)",
        "user-select:none",
    ].join(";");
    (document.body || document.documentElement).appendChild(el);
    ctxMenuEl = el;
    return el;
}

function hideCtxMenu(): void {
    if (ctxMenuEl) ctxMenuEl.style.display = "none";
}

function showCtxMenu(x: number, y: number, items: CtxItem[]): void {
    const menu = ensureCtxMenu();
    menu.innerHTML = "";
    for (const item of items) {
        if (item.separator && menu.children.length > 0) {
            const sep = document.createElement("div");
            sep.style.cssText = "height:1px;margin:4px 6px;background:var(--p-border, #3c3c3c)";
            menu.appendChild(sep);
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = item.label;
        // Explicit reset styles so a board's global `button {}` rules can't distort the menu.
        btn.style.cssText = [
            "display:block",
            "width:100%",
            "margin:0",
            "padding:5px 10px",
            "border:none",
            "border-radius:var(--p-radius-sm, 3px)",
            "background:transparent",
            "color:inherit",
            "font:inherit",
            "line-height:1.4",
            "text-align:left",
            "text-transform:none",
            "letter-spacing:normal",
            "white-space:nowrap",
            "cursor:pointer",
            "outline:none",
        ].join(";");
        // Hover uses the theme accent (= --color-bg-selection, the same blue the app's native
        // menu highlights with) + its on-accent text color, so the menu matches Persephone.
        btn.addEventListener("mouseenter", () => {
            btn.style.background = "var(--p-accent, #094771)";
            btn.style.color = "var(--p-accent-text, #ffffff)";
        });
        btn.addEventListener("mouseleave", () => {
            btn.style.background = "transparent";
            btn.style.color = "inherit";
        });
        btn.addEventListener("click", () => {
            hideCtxMenu();
            try {
                item.action();
            } catch (e) {
                console.error("persephone context menu action error:", e);
            }
        });
        menu.appendChild(btn);
    }
    // Show first (so offsetWidth/Height are measurable), then clamp to the frame viewport.
    menu.style.display = "flex";
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - mw - 4)) + "px";
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - mh - 4)) + "px";
}

// The <img> at a right-click, or null. Prefers the clicked element's own <img> ancestor; falls
// back to searching the hit stack under the cursor — some renderers layer another element on top
// of a picture (e.g. pptx-preview stacks an SVG shape over the <img>), so the event target is that
// overlay and closest("img") — which only walks ancestors — misses the sibling <img>.
function imageAt(target: Element | null, x: number, y: number): HTMLImageElement | null {
    const direct = target && target.closest ? target.closest("img") : null;
    if (direct instanceof HTMLImageElement) return direct;
    if (typeof document.elementsFromPoint === "function") {
        for (const el of document.elementsFromPoint(x, y)) {
            if (el instanceof HTMLImageElement) return el;
        }
    }
    return null;
}

window.addEventListener("contextmenu", (e: MouseEvent) => {
    if (e.defaultPrevented) return; // the board renders its own menu — stand down
    const target = e.target as Element | null;
    // Groups are concatenated with a divider between them (link / image / edit-or-selection).
    const groups: CtxItem[][] = [];

    // Link (same external-link detection as routeExternalLinkClick): in-board / #fragment links
    // resolve to the board:// origin and are skipped, so "Open Link" only appears for links that
    // actually open in Persephone.
    const anchor = target && target.closest ? target.closest("a[href]") : null;
    const href = anchor instanceof HTMLAnchorElement ? anchor.href : "";
    if (href && !href.startsWith("board://") && !href.startsWith("javascript:")) {
        groups.push([
            { label: "Open Link", action: () => fire("openRawLink", [href]) },
            { label: "Copy Link", action: () => copyText(href) },
        ]);
    }

    // Image → open in the Image Viewer (new tab), copy as PNG, or save to disk. `currentSrc`
    // reflects the actually-loaded source (srcset), with `src` as the fallback; skip an empty src.
    const img = imageAt(target, e.clientX, e.clientY);
    const imgSrc = img ? img.currentSrc || img.src : "";
    if (img && imgSrc && !imgSrc.startsWith("data:,")) {
        groups.push([
            { label: "Open Image in New Tab", action: () => void openImageInNewTab(imgSrc) },
            { label: "Copy Image", action: () => void copyImage(img) },
            { label: "Save Image As…", action: () => void saveImageAs(img, imgSrc) },
        ]);
    }

    // Editable field → Cut / Copy / Paste. Otherwise a plain text selection → Copy.
    const editable = editableTarget(target);
    if (editable) {
        const editItems: CtxItem[] = [];
        const hasSelection = !!editableSelection(editable);
        const readonly = isReadonly(editable);
        if (hasSelection && !readonly) editItems.push({ label: "Cut", action: () => cutEditable(editable) });
        if (hasSelection) editItems.push({ label: "Copy", action: () => copyEditable(editable) });
        if (!readonly) editItems.push({ label: "Paste", action: () => void pasteEditable(editable) });
        if (editItems.length) groups.push(editItems);
    } else {
        const selection = (window.getSelection && window.getSelection()?.toString()) || "";
        if (selection.trim()) groups.push([{ label: "Copy", action: () => copyText(selection) }]);
    }

    // Flatten groups → items, marking the first item of each non-first group as a separator.
    const items: CtxItem[] = [];
    groups.forEach((group, gi) => {
        group.forEach((item, ii) => {
            items.push(gi > 0 && ii === 0 ? { ...item, separator: true } : item);
        });
    });

    if (!items.length) return; // nothing useful to offer — leave the default behavior alone
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, items);
});

// Dismiss the menu on an outside press (capture so a board's stopPropagation can't block it), a
// scroll, resize, Escape, or the frame losing focus. A press INSIDE the menu is left alone so the
// item's click still fires.
window.addEventListener(
    "mousedown",
    (e) => {
        if (ctxMenuEl && ctxMenuEl.style.display !== "none" && !ctxMenuEl.contains(e.target as Node)) {
            hideCtxMenu();
        }
    },
    true,
);
window.addEventListener("scroll", hideCtxMenu, true);
window.addEventListener("resize", hideCtxMenu);
window.addEventListener("blur", hideCtxMenu);
window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") hideCtxMenu();
});

// Host-overlay dismissal (EPIC-037 / US-773 C10): a cross-origin board's inner clicks
// don't bubble to the host, so an open Persephone menu/popover/command-palette wouldn't
// close when the user clicks into the board. Post a capture-phase interaction ping to
// the host frame (this is the board→host-frame channel — NOT the board↔main C1 port);
// the host turns it into the same `document` mousedown its own webviews use to tear
// down overlays. Capture phase so it fires even when the board already has focus.
window.addEventListener(
    "pointerdown",
    () => {
        try {
            window.parent.postMessage({ __persephone: "board:interact" }, hostPostTarget);
        } catch {
            // parent gone — nothing to dismiss
        }
    },
    true,
);

// Load-failure reporting over the host-frame channel (EPIC-037 / US-774 C11). These
// detectors catch failures `did-fail-load` (main, mode A) can't see: CSP violations
// (mode B) and uncaught author errors (mode E). They post `board:error` to the host
// frame (the C10 board→host channel — NOT the board↔main C1 port); the host appends to
// the board's ui.log + toasts. Posts to `hostPostTarget` like `board:interact`.
/** Report a board issue to the host — LOG-ONLY (appended to `ui.log`, no toast). CSP
 *  violations (mode B) and uncaught author errors (mode E) are troubleshooting detail for
 *  the author/agent; the board is often still functional. User-facing toasts are reserved
 *  for "board failed to load" (modes A + D, raised from main). */
function postHostError(message: string): void {
    try {
        window.parent.postMessage({ __persephone: "board:error", message }, hostPostTarget);
    } catch {
        // parent gone — nothing to report to
    }
}

// Mode B: CSP violations (a remote resource blocked by the board CSP) — often non-fatal
// or intentional (e.g. a board probing its own CSP).
document.addEventListener("securitypolicyviolation", (e) => {
    postHostError(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || "(inline)"}`);
});
// Mode E: uncaught author errors / rejections — the webview never reported these; a
// useful breadcrumb for the author/agent debugging a board.
window.addEventListener("error", (e) => {
    postHostError(`script error: ${e.message}${e.filename ? ` (${e.filename}:${e.lineno})` : ""}`);
});
window.addEventListener("unhandledrejection", (e) => {
    const r = (e as PromiseRejectionEvent).reason;
    postHostError(`unhandled rejection: ${errMessage(r)}`);
});
// Mode F: console.error/warn — how board code and libraries actually report problems,
// but invisible to the author/agent (nothing captures a board frame's console). Mirror
// them to ui.log via `board:log`; the original console methods still run untouched.
// console.log/info are deliberately NOT mirrored (ui.log noise).
function formatConsoleArg(a: unknown): string {
    if (typeof a === "string") return a;
    if (a instanceof Error) return a.stack || a.message;
    try {
        return JSON.stringify(a);
    } catch {
        return String(a);
    }
}
function mirrorConsole(level: "warn" | "error"): void {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
        original(...args);
        try {
            const message = args.map(formatConsoleArg).join(" ").slice(0, 4000);
            window.parent.postMessage(
                { __persephone: "board:log", level, message: `console.${level}: ${message}` },
                hostPostTarget,
            );
        } catch {
            // parent gone — nothing to report to
        }
    };
}
mirrorConsole("warn");
mirrorConsole("error");

// ── execute() handle (mirrors preload-board.ts, transport = the port) ─────────

let idCounter = 0;

function concat(chunks: Uint8Array[]): Uint8Array {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

/** Return the LAST match of `pattern` in `text` (used by `getJson(pattern)`), or
 *  null if none. Iterates with a forced-global clone so the caller's regex is
 *  untouched. */
function lastMatch(text: string, pattern: RegExp): RegExpExecArray | null {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    let match: RegExpExecArray | null = null;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
        match = m;
        if (m.index === re.lastIndex) re.lastIndex++; // avoid an infinite loop on a zero-width match
    }
    return match;
}

/** Error for `getJson()` failures (custom props folded into the message too). */
function makeRunnerError(message: string, exitCode: number | null, stderr: string): Error {
    const err = new Error(message) as Error & { exitCode: number | null; stderr: string };
    err.exitCode = exitCode;
    err.stderr = stderr;
    return err;
}

type Mode = "idle" | "buffered" | "streaming";

function createHandle(
    command: string,
    options?: IExecuteOptions,
    extra?: { node?: boolean; args?: string[] },
): IExecuteHandle {
    const jobId = `b_${++idCounter}_${Date.now()}`;

    let mode: Mode = "idle";
    let finished = false;
    let exitInfo: IExitInfo | null = null;
    let errorMessage: string | null = null;

    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];

    const stdoutCbs: Array<(chunk: Uint8Array) => void> = [];
    const stderrCbs: Array<(chunk: Uint8Array) => void> = [];
    const exitCbs: Array<(info: IExitInfo) => void> = [];
    const errorCbs: Array<(err: IExecuteError) => void> = [];

    const doneResolvers: Array<() => void> = [];

    const stderrText = () => new TextDecoder().decode(concat(stderrChunks));

    const finish = () => {
        finished = true;
        for (const r of doneResolvers) r();
        doneResolvers.length = 0;
        runnerHandlers.delete(jobId);
    };

    const waitDone = (): Promise<void> =>
        finished ? Promise.resolve() : new Promise<void>((resolve) => doneResolvers.push(resolve));

    const ensureBufferable = () => {
        if (mode === "streaming") {
            throw new Error(
                "ExecuteHandle is in streaming mode; getText/getJson/getBytes are unavailable once a stdout/stderr listener is attached",
            );
        }
        mode = "buffered";
    };

    // Route this job's runner messages (registered synchronously, before start is
    // posted, so output is never missed).
    runnerHandlers.set(jobId, (channel, msg) => {
        if (channel === RunnerChannel.stdout || channel === RunnerChannel.stderr) {
            const chunk = (msg as RunnerChunkMsg).chunk;
            const target = channel === RunnerChannel.stdout ? stdoutChunks : stderrChunks;
            const cbs = channel === RunnerChannel.stdout ? stdoutCbs : stderrCbs;
            if (mode === "streaming") {
                for (const cb of cbs) {
                    try {
                        cb(chunk);
                    } catch (e) {
                        console.error("persephone.execute stream callback error:", e);
                    }
                }
            } else {
                target.push(chunk);
            }
        } else if (channel === RunnerChannel.exit) {
            if (finished) return;
            const m = msg as RunnerExitMsg;
            exitInfo = { code: m.code, signal: m.signal };
            finish();
            for (const cb of exitCbs) {
                try {
                    cb(exitInfo);
                } catch (e) {
                    console.error("persephone.execute exit callback error:", e);
                }
            }
        } else if (channel === RunnerChannel.error) {
            if (finished) return;
            errorMessage = (msg as RunnerErrorMsg).message;
            finish();
            for (const cb of errorCbs) {
                try {
                    cb({ message: errorMessage });
                } catch (e) {
                    console.error("persephone.execute error callback error:", e);
                }
            }
        }
    });

    // Default cwd is filled by main from the board registry; an explicit opts.cwd
    // (forwarded here) overrides it there.
    post({ kind: "runner", channel: RunnerChannel.start, msg: { jobId, command, opts: options, ...extra } });

    const handle: IExecuteHandle = {
        jobId,

        on(event: "stdout" | "stderr" | "exit" | "error", cb: (arg: never) => void): () => void {
            if (event === "stdout" || event === "stderr") {
                if (mode === "buffered") {
                    throw new Error(
                        "ExecuteHandle is in buffered mode; cannot attach a stdout/stderr listener after getText/getJson/getBytes",
                    );
                }
                mode = "streaming";
                const cbs = event === "stdout" ? stdoutCbs : stderrCbs;
                const streamCb = cb as unknown as (chunk: Uint8Array) => void;
                cbs.push(streamCb);
                // Replay chunks buffered before this listener attached, then go live.
                const buffered = event === "stdout" ? stdoutChunks : stderrChunks;
                for (const chunk of buffered) streamCb(chunk);
                buffered.length = 0;
                return () => {
                    const i = cbs.indexOf(streamCb);
                    if (i >= 0) cbs.splice(i, 1);
                };
            }

            if (event === "exit") {
                const exitCb = cb as unknown as (info: IExitInfo) => void;
                if (finished) {
                    if (exitInfo) exitCb(exitInfo);
                    return () => {};
                }
                exitCbs.push(exitCb);
                return () => {
                    const i = exitCbs.indexOf(exitCb);
                    if (i >= 0) exitCbs.splice(i, 1);
                };
            }

            // event === "error"
            const errorCb = cb as unknown as (err: IExecuteError) => void;
            if (finished) {
                if (errorMessage !== null) errorCb({ message: errorMessage });
                return () => {};
            }
            errorCbs.push(errorCb);
            return () => {
                const i = errorCbs.indexOf(errorCb);
                if (i >= 0) errorCbs.splice(i, 1);
            };
        },

        async getBytes(): Promise<Uint8Array> {
            ensureBufferable();
            await waitDone();
            if (errorMessage !== null) throw new Error(errorMessage);
            return concat(stdoutChunks);
        },

        async getText(): Promise<string> {
            const bytes = await handle.getBytes();
            return new TextDecoder().decode(bytes);
        },

        async getJson<T = unknown>(pattern?: RegExp): Promise<T> {
            ensureBufferable();
            await waitDone();
            const code = exitInfo?.code ?? null;
            if (errorMessage !== null) {
                throw makeRunnerError(errorMessage, code, stderrText());
            }
            if (code !== null && code !== 0) {
                throw makeRunnerError(`Command exited with code ${code}`, code, stderrText());
            }
            let text = new TextDecoder().decode(concat(stdoutChunks));
            if (pattern) {
                const match = lastMatch(text, pattern);
                if (!match) {
                    throw makeRunnerError(`Result pattern ${pattern} not found in output`, code, stderrText());
                }
                text = match[1] ?? match[0];
            }
            try {
                return JSON.parse(text) as T;
            } catch (e) {
                throw makeRunnerError(
                    `Failed to parse JSON output: ${errMessage(e)}`,
                    code,
                    stderrText(),
                );
            }
        },

        write(data: string | Uint8Array): void {
            if (finished) return;
            post({ kind: "runner", channel: RunnerChannel.stdin, msg: { jobId, data } });
        },

        endStdin(): void {
            if (finished) return;
            post({ kind: "runner", channel: RunnerChannel.endStdin, msg: { jobId } });
        },

        kill(signal?: string): void {
            if (finished) return;
            post({ kind: "runner", channel: RunnerChannel.kill, msg: { jobId, signal } });
        },
    };

    return handle;
}

// ── The `persephone` bridge (same surface as the old preload) ─────────────────

(window as unknown as { persephone: unknown }).persephone = {
    // Bridge API version — bumped when the `persephone.*` surface gains something.
    // 1.1.0: readFile/writeFile accept `encoding: "binary"` (US-933).
    version: "1.1.0",

    /** This frame's view role (EPIC-044): "main" for the board's main view, or the id of a
     *  declared secondary view. Branch on it to render every view from one HTML file. */
    view: viewRole,

    /** Replace this board's full set of secondary (sidebar) views at runtime (EPIC-044).
     *  Each view: `{ id, html?, title? }` — `html` defaults to the main entry, so one file
     *  can serve every view (branch on `persephone.view`). `[]` removes them all. Available
     *  on every frame (main + secondary); the change is authoritative on the Persephone side. */
    setSecondaryViews(views: Array<{ id: string; html?: string; title?: string }>): void {
        try {
            window.parent.postMessage(
                { __persephone: "board:setSecondaryViews", views: Array.isArray(views) ? views : [] },
                hostPostTarget,
            );
        } catch {
            // parent gone
        }
    },

    /** Set the text shown in the board's footer status area — the same footer that shows the
     *  provider/encoding for content-host boards (e.g. a Todo board's "N items" count). Called
     *  from the board's MAIN view; a visual no-op for plain (non-content-host) boards, which have
     *  no footer. Pass `""` to clear. */
    setStatusText(text: string): void {
        try {
            window.parent.postMessage(
                { __persephone: "board:setStatusText", statusText: typeof text === "string" ? text : String(text ?? "") },
                hostPostTarget,
            );
        } catch {
            // parent gone
        }
    },

    execute(command: string, options?: IExecuteOptions): IExecuteHandle {
        return createHandle(command, options);
    },

    /** Run a Node script on Persephone's bundled runtime — no Node install needed.
     *  `script` is resolved against the board folder when relative. Same handle
     *  contract as execute(); `shell` is ignored (always argv, no shell). */
    executeNode(script: string, args?: string[], options?: IExecuteOptions): IExecuteHandle {
        const { shell: _shell, ...opts } = options ?? {};
        return createHandle(script, opts, { node: true, args });
    },

    openRawLink(href: string, options?: { editor?: string }): void {
        fire("openRawLink", [href, options?.editor]);
    },

    notify(message: string, type?: "info" | "success" | "warning" | "error"): void {
        if (type === "error") console.error("[board]", message);
        fire("notify", [message, type]);
    },

    openFileDialog(params?: unknown): Promise<string[] | undefined> {
        return rpc("openFileDialog", [params ?? {}]) as Promise<string[] | undefined>;
    },

    saveFileDialog(params?: unknown): Promise<string | undefined> {
        return rpc("saveFileDialog", [params ?? {}]) as Promise<string | undefined>;
    },

    openFolderDialog(params?: unknown): Promise<string[] | undefined> {
        return rpc("openFolderDialog", [params ?? {}]) as Promise<string[] | undefined>;
    },

    /** Read a file. `encoding` picks what you get back: "utf8" (default) or "base64" give
     *  a string, "binary" gives a `Uint8Array` of the bytes — no base64 round-trip, which
     *  is both faster and the only way to read a file over ~400 MB (base64 of one exceeds
     *  V8's max string length). "binary" needs bridge API 1.1.0 / app 4.0.21: declare it
     *  with `minAppVersion` in board-manifest.json. */
    readFile(
        path: string,
        options?: { encoding?: "utf8" | "base64" | "binary" },
    ): Promise<string | Uint8Array> {
        return rpc("readFile", [path, options?.encoding]) as Promise<string | Uint8Array>;
    },

    /** Write a file. With `encoding: "binary"`, `data` is a `Uint8Array` (or ArrayBuffer);
     *  otherwise it is a string, interpreted as "utf8" (default) or "base64". */
    writeFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        options?: { encoding?: "utf8" | "base64" | "binary" },
    ): Promise<void> {
        return rpc("writeFile", [path, data, options?.encoding]) as Promise<void>;
    },

    // ── Busy / surviving jobs (US-799) ────────────────────────────────────────

    /** Declare that this board's spawned processes must outlive the board itself.
     *  While busy, navigating the page away (or reloading the board) destroys the
     *  board but KEEPS its processes running; closing the page/tab (or quitting
     *  the app) still kills them. Call with `false` when the processes stopped. */
    setBoardBusy(busy: boolean): void {
        settleBusy(!!busy);
        try {
            window.parent.postMessage({ __persephone: "board:busy", busy: !!busy }, hostPostTarget);
        } catch {
            // parent gone — nothing to inform
        }
    },

    /** The board's current busy flag — carried across reloads. A re-created board
     *  reads `true` when it went busy before unloading: re-enter "running" mode
     *  (see `getJobs()`), or call `setBoardBusy(false)` if nothing lives anymore. */
    getBoardBusy(): Promise<boolean> {
        if (busyState !== null) return Promise.resolve(busyState);
        return new Promise<boolean>((resolve) => busyResolvers.push(resolve));
    },

    /** The absolute path of the file this board edits as a custom editor (EPIC-042), or
     *  `undefined` for a board opened plainly. Resolves when the host handshake lands, so it
     *  is safe to await at any time. Read/write the file with `persephone.readFile`/`writeFile`.
     *
     *  Always a readable LOCAL path. When the file's real source is an archive entry
     *  (`archive.zip!doc.pdf`) or an `http(s)` URL, Persephone materializes it into a temp file and
     *  returns THAT path — so a board never handles non-local sources itself, and this call may take
     *  as long as the download. Requires `"editorSources": "any"` in the board manifest; without it
     *  such files are never routed to the board at all. REJECTS when the source cannot be read
     *  (missing archive entry, HTTP failure), so handle rejection — it is not the same as the
     *  `undefined` a plainly-opened board gets. */
    async getFilePath(): Promise<string | undefined> {
        await whenHandshake();
        if (!filePathNeedsMaterialize) return filePathValue;
        // Non-local source: resolve through the renderer, once. Concurrent callers share the
        // in-flight request; a failure clears it so a later call can retry.
        if (materializedPath) return materializedPath;
        if (!materializedPromise) {
            materializedPromise = filePathRpc().then(
                (p) => { materializedPath = p; return p; },
                (e) => { materializedPromise = null; throw e; },
            );
        }
        return materializedPromise;
    },

    /** Content-host bridge (EPIC-043). Meaningful only when this board is a content-host editor
     *  (manifest `editorKind: "content-host"`); on a plain board `getContent`/`getLanguage` reject.
     *  Safe to call at ANY time — each method awaits the handshake internally before deciding,
     *  so boot ordering never matters (no ready-gate needed by the board). */
    host: {
        /** Current content — resolves to the first pushed snapshot (await any time). */
        async getContent(): Promise<string> {
            await whenHandshake();
            if (!hostEnabled) {
                throw new Error("persephone.host is available only for content-host boards");
            }
            if (hostContentSettled) return hostContent;
            return new Promise<string>((resolve) => hostContentResolvers.push(resolve));
        },

        /** Set content + mark the file modified (schedules the autosave cache). */
        setContent(content: string): void {
            // Keep the local replica in sync with our own write: the renderer echo-guard never
            // pushes it back, so without this a read-after-write would return the stale
            // pre-write value. Does NOT fire onContentChange (a frame never re-renders from
            // its own write); the OTHER frame still receives the change from the renderer.
            hostContent = content;
            if (!hostContentSettled) {
                hostContentSettled = true;
                for (const r of hostContentResolvers) r(content);
                hostContentResolvers.length = 0;
            }
            try {
                window.parent.postMessage(
                    { __persephone: "board:setContent", content },
                    hostPostTarget,
                );
            } catch {
                // parent gone
            }
        },

        /** Fire on each external content change (reload, other-view edit, host transfer). Returns an
         *  unsubscribe. The board's OWN setContent does NOT re-fire this (renderer-side echo-guard).
         *  Registers at any time — before the handshake too; on a plain (non-content-host) board no
         *  push ever arrives, so the callback simply never fires. */
        onContentChange(cb: (content: string, language?: string) => void): () => void {
            hostChangeCbs.push(cb);
            return () => {
                const i = hostChangeCbs.indexOf(cb);
                if (i >= 0) hostChangeCbs.splice(i, 1);
            };
        },

        /** Monaco language id of the current content (e.g. "xml", "json"), or undefined. */
        async getLanguage(): Promise<string | undefined> {
            await whenHandshake();
            if (!hostEnabled) {
                throw new Error("persephone.host is available only for content-host boards");
            }
            if (hostContentSettled) return hostLanguage;
            return new Promise<string | undefined>((resolve) =>
                hostContentResolvers.push(() => resolve(hostLanguage)),
            );
        },

        /** Save through Persephone's pipe (encryption / cache / dirty-clear). Optional — Ctrl+S
         *  already saves automatically (CH3). */
        save(): void {
            try {
                window.parent.postMessage({ __persephone: "board:save" }, hostPostTarget);
            } catch {
                // parent gone
            }
        },
    },

    /** Shared-state channel (EPIC-044) — available on EVERY board frame (main + secondary),
     *  authoritative on the Persephone side. `get()`/`onChange` read the replica; `init`/`set`/
     *  `merge` post to the host and return void (the change arrives via `onChange`). */
    state: {
        /** Declare defaults (fill-missing — restored values win) + which keys persist across
         *  restart/reload (opt-in, D9). Typically called once by the main view at boot. */
        init(defaults: Record<string, unknown>, options?: { restorableKeys?: string[] }): void {
            try {
                window.parent.postMessage(
                    {
                        __persephone: "board:stateInit",
                        defaults: defaults ?? {},
                        restorableKeys: options?.restorableKeys,
                    },
                    hostPostTarget,
                );
            } catch {
                // parent gone
            }
        },

        /** Current shared state — resolves to the first synced snapshot (await any time). */
        get(): Promise<Record<string, unknown>> {
            if (sharedStateSettled) return Promise.resolve(sharedState);
            return new Promise<Record<string, unknown>>((resolve) => sharedStateResolvers.push(resolve));
        },

        /** Replace the whole shared state. */
        set(next: Record<string, unknown>): void {
            try {
                window.parent.postMessage({ __persephone: "board:setState", state: next ?? {} }, hostPostTarget);
            } catch {
                // parent gone
            }
        },

        /** Shallow-merge keys into the shared state. */
        merge(partial: Record<string, unknown>): void {
            try {
                window.parent.postMessage({ __persephone: "board:mergeState", partial: partial ?? {} }, hostPostTarget);
            } catch {
                // parent gone
            }
        },

        /** Fire on every shared-state change (from any frame). Returns an unsubscribe. */
        onChange(cb: (state: Record<string, unknown>) => void): () => void {
            sharedStateCbs.push(cb);
            return () => {
                const i = sharedStateCbs.indexOf(cb);
                if (i >= 0) sharedStateCbs.splice(i, 1);
            };
        },
    },

    /** Board environment variables (EPIC-046). Reads/writes ONLY this board's namespace
     *  (resolved host-side from the board's identity — a board cannot name another's). All
     *  reject when the store is not configured (and the user declines to create it), locked
     *  (encrypted + cancelled/wrong password), or on a store error — handle rejection. */
    var: {
        /** A single value (the `default` profile when `env` is omitted), or undefined if unset. */
        get(name: string, env?: string): Promise<string | undefined> {
            return varRpc("get", [name, env]) as Promise<string | undefined>;
        },
        /** Write a value into this board's namespace (re-encrypts on save if the file is encrypted). */
        set(name: string, value: string, env?: string): Promise<void> {
            return varRpc("set", [name, value, env]) as Promise<void>;
        },
        /** This board's key names in a profile (NOT values). */
        list(env?: string): Promise<string[]> {
            return varRpc("list", [env]) as Promise<string[]>;
        },
        /** Open the Environment Variables editor, scoped to this board's namespace. */
        show(): Promise<void> {
            return varRpc("show", []) as Promise<void>;
        },
    },

    /** List this board's LIVE jobs — including ones that survived a previous
     *  board lifetime (busy retention). Each entry is a control-only handle:
     *  `kill`/`write`/`endStdin` work, but there is no stdout/stderr/exit
     *  streaming for surviving jobs (their output went to the previous board).
     *  Re-associate by `name` (from `execute(cmd, { name })`). */
    async getJobs(): Promise<Array<BoardJobInfo & {
        kill(signal?: string): void;
        write(data: string | Uint8Array): void;
        endStdin(): void;
    }>> {
        const jobs = (await rpc("getJobs", [])) as BoardJobInfo[];
        return (jobs ?? []).map((j) => ({
            ...j,
            kill(signal?: string): void {
                post({ kind: "runner", channel: RunnerChannel.kill, msg: { jobId: j.jobId, signal } });
            },
            write(data: string | Uint8Array): void {
                post({ kind: "runner", channel: RunnerChannel.stdin, msg: { jobId: j.jobId, data } });
            },
            endStdin(): void {
                post({ kind: "runner", channel: RunnerChannel.endStdin, msg: { jobId: j.jobId } });
            },
        }));
    },

    get theme(): BoardThemePalette {
        return currentTheme;
    },

    getTheme(): BoardThemePalette {
        return currentTheme;
    },

    tokens: Object.freeze({ ...tokens }),

    getTokens(): Record<string, string> {
        return tokens;
    },

    onThemeChange(cb: (theme: BoardThemePalette) => void): () => void {
        themeCbs.push(cb);
        try {
            cb(currentTheme);
        } catch (e) {
            console.error("persephone.onThemeChange callback error:", e);
        }
        return () => {
            const i = themeCbs.indexOf(cb);
            if (i >= 0) themeCbs.splice(i, 1);
        };
    },
};
