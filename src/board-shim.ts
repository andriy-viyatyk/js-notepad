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
 * imports beyond dependency-free modules — the `RunnerChannel` string enum, the
 * `errMessage` helper and the shared `execute()` handle). Built as
 * `format: "iife"` by scripts/build-prod.mjs and scripts/dev.mjs.
 */
import {
    RunnerChannel,
    type IExecuteHandle,
    type IExecuteOptions,
    type RunnerInboundChannel,
    type RunnerInboundMsg,
} from "./ipc/runner-channels";
import { createExecuteHandle } from "./shared/execute-handle";
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
import { installBoardDiagnostics } from "./board-console-mirror";
import { installBoardContextMenu } from "./board-context-menu";

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
const runnerHandlers = new Map<
    string,
    (channel: RunnerInboundChannel, msg: RunnerInboundMsg) => void
>();

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
/** Register a message delivered by the Board host frame. `event.source` is the
 * load-bearing boundary; strict HTTP(S) hosts additionally require the boot-time
 * origin. Keep every host-frame protocol behind this gate. */
function onHostMessage(handler: (event: MessageEvent) => void): void {
    window.addEventListener("message", (event: MessageEvent) => {
        if (event.source !== window.parent) return;
        if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
        handler(event);
    });
}

onHostMessage((event) => {
    const data = event.data as
        {
            __persephoneInit?: boolean; busy?: boolean; filePath?: string;
            contentHost?: boolean; materialize?: boolean;
        }
        | undefined;
    if (!data || data.__persephoneInit !== true) return;
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
onHostMessage((event) => {
    const data = event.data as BoardHostContentMsg | undefined;
    if (!data || data.__persephone !== "host:content") return;
    settleHostContent(data.content, data.language);
});

// Shared-state push (EPIC-044) — renderer → board. Same trust gate as host:content.
onHostMessage((event) => {
    const data = event.data as BoardStateSyncMsg | undefined;
    if (!data || data.__persephone !== "state:sync") return;
    applyStateSync(data.state ?? {}, typeof data.seq === "number" ? data.seq : 0);
});

// Content-path request reply — renderer → board. Same trust gate as host:content/state:sync.
onHostMessage((event) => {
    const data = event.data as
        { __persephone?: string; reqId?: number; path?: string; error?: string }
        | undefined;
    if (!data || data.__persephone !== "filePath:result" || typeof data.reqId !== "number") return;
    const p = pendingFilePath.get(data.reqId);
    if (!p) return;
    pendingFilePath.delete(data.reqId);
    if (data.error != null) p.reject(new Error(data.error));
    else p.resolve(data.path);
});

// Var request reply (EPIC-046) — renderer → board. Same trust gate as host:content/state:sync.
onHostMessage((event) => {
    const data = event.data as
        { __persephone?: string; reqId?: number; result?: unknown; error?: string }
        | undefined;
    if (!data || data.__persephone !== "var:result" || typeof data.reqId !== "number") return;
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

installBoardContextMenu({ fire, rpc });

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

installBoardDiagnostics(hostPostTarget);

// ── execute() handle (state machine shared with renderer/api/proc.ts) ────────

let idCounter = 0;

/** Build an execute handle over the board's port: the runner-message router keyed
 *  by jobId (registered synchronously, before start is posted, so output is never
 *  missed) plus the `post` envelope every runner message travels in. */
function createHandle(
    command: string,
    options?: IExecuteOptions,
    extra?: { node?: boolean; args?: string[] },
): IExecuteHandle {
    const jobId = `b_${++idCounter}_${Date.now()}`;
    return createExecuteHandle(
        {
            jobId,
            label: "persephone.execute",
            send: (channel, msg) => post({ kind: "runner", channel, msg }),
            subscribe: (deliver) => {
                runnerHandlers.set(jobId, deliver);
                return () => runnerHandlers.delete(jobId);
            },
        },
        // Default cwd is filled by main from the board registry; an explicit opts.cwd
        // (forwarded here) overrides it there.
        { command, opts: options, ...extra },
    );
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
