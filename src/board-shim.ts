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
 * free). See `vite.board-shim.config.ts`.
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
    BoardRpcMethod,
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

let currentTheme: BoardThemePalette = boot.theme;
const tokens: Record<string, string> = boot.tokens;
const themeCbs: Array<(t: BoardThemePalette) => void> = [];

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
// the origin check is belt-and-suspenders when the host origin is known.
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { __persephoneInit?: boolean } | undefined;
    if (!data || data.__persephoneInit !== true) return;
    if (event.source !== window.parent) return;
    if (boot.hostOrigin && event.origin !== boot.hostOrigin) return;
    const p = event.ports && event.ports[0];
    if (p) attachPort(p);
});

// Host-overlay dismissal (EPIC-037 / US-773 C10): a cross-origin board's inner clicks
// don't bubble to the host, so an open Persephone menu/popover/command-palette wouldn't
// close when the user clicks into the board. Post a capture-phase interaction ping to
// the host frame (this is the board→host-frame channel — NOT the board↔main C1 port);
// the host turns it into the same `document` mousedown its own webviews use to tear
// down overlays. Capture phase so it fires even when the board already has focus.
if (boot.hostOrigin) {
    window.addEventListener(
        "pointerdown",
        () => {
            try {
                window.parent.postMessage({ __persephone: "board:interact" }, boot.hostOrigin);
            } catch {
                // parent gone / origin mismatch — nothing to dismiss
            }
        },
        true,
    );
}

// Load-failure reporting over the host-frame channel (EPIC-037 / US-774 C11). These
// detectors catch failures `did-fail-load` (main, mode A) can't see: CSP violations
// (mode B) and uncaught author errors (mode E). They post `board:error` to the host
// frame (the C10 board→host channel — NOT the board↔main C1 port); the host appends to
// the board's ui.log + toasts. Guarded by `boot.hostOrigin` like `board:interact`.
/** Report a board issue to the host — LOG-ONLY (appended to `ui.log`, no toast). CSP
 *  violations (mode B) and uncaught author errors (mode E) are troubleshooting detail for
 *  the author/agent; the board is often still functional. User-facing toasts are reserved
 *  for "board failed to load" (modes A + D, raised from main). */
function postHostError(message: string): void {
    if (!boot.hostOrigin) return;
    try {
        window.parent.postMessage({ __persephone: "board:error", message }, boot.hostOrigin);
    } catch {
        // parent gone / origin mismatch — nothing to report to
    }
}

if (boot.hostOrigin) {
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
}

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
