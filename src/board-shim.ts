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
 * imports — only type-only + the `RunnerChannel` string enum, which is dependency-
 * free). Built as `format: "iife"` by scripts/build-prod.mjs and scripts/dev.mjs.
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
        { __persephoneInit?: boolean; busy?: boolean; filePath?: string; contentHost?: boolean }
        | undefined;
    if (!data || data.__persephoneInit !== true) return;
    if (event.source !== window.parent) return;
    if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
    // Busy flag carried at handshake (US-799). A local setBoardBusy call that
    // already ran wins (busyState !== null) — the init value is then stale.
    if (busyState === null) settleBusy(!!data.busy);
    // filePath carried at handshake (EPIC-042). Every handshake settles it — a plain board
    // carries `undefined`, so `getFilePath()` still resolves (to undefined).
    if (!filePathSettled) settleFilePath(data.filePath);
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
    postHostError(`unhandled rejection: ${r instanceof Error ? r.message : String(r)}`);
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

function createHandle(command: string, options?: IExecuteOptions): IExecuteHandle {
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
    post({ kind: "runner", channel: RunnerChannel.start, msg: { jobId, command, opts: options } });

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
                    `Failed to parse JSON output: ${e instanceof Error ? e.message : String(e)}`,
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
    version: "1.0.0",

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

    execute(command: string, options?: IExecuteOptions): IExecuteHandle {
        return createHandle(command, options);
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

    readFile(path: string, options?: { encoding?: "utf8" | "base64" }): Promise<string> {
        return rpc("readFile", [path, options?.encoding]) as Promise<string>;
    },

    writeFile(path: string, data: string, options?: { encoding?: "utf8" | "base64" }): Promise<void> {
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
     *  is safe to await at any time. Read/write the file with `persephone.readFile`/`writeFile`. */
    getFilePath(): Promise<string | undefined> {
        if (filePathSettled) return Promise.resolve(filePathValue);
        return new Promise<string | undefined>((resolve) => filePathResolvers.push(resolve));
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
