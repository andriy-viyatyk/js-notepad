/**
 * Board preload (EPIC-034 / US-724) — runs inside the locked-down board webview
 * (`contextIsolation: true` + `sandbox: true`, set via the `<webview>` attributes
 * in `BoardWebview.tsx`). It is the ONLY bridge between a board page and Persephone:
 * the page sees `window.persephone` and nothing else — no `require`, no `process`,
 * no `ipcRenderer`.
 *
 * Two tiers:
 *  • `execute(commandLine, opts?)` → a process handle (stream / buffer / write-stdin
 *    / kill), a thin client over the main-process command runner (`command-runner.ts`)
 *    on the shared `RunnerChannel` protocol. Re-expresses the renderer client
 *    `src/renderer/api/proc.ts` against RAW `ipcRenderer` (the board webview has no
 *    `window.electron`); the handle TS contract is shared via `ipc/runner-channels.ts`
 *    (EPIC-034 C-E) so the two implementations cannot drift.
 *  • Integration tier — the in-app effects `execute()` cannot express: `openRawLink`,
 *    `notify`, and the native file dialogs (over `ipc/board-bridge-channels.ts`).
 *  • Theme contract (US-725) — applies the host's `--p-*` CSS variables (color +
 *    metric tokens) to the guest `<html>` and mirrors them to JS (`theme`/`tokens`/
 *    `onThemeChange`); colors update live on a theme switch, metrics are static.
 *
 * The dev-shim, `config.json`, `ui.log`, per-board `CLAUDE.md` and the `boardScript`
 * userland helper arrive in US-726.
 */
import { contextBridge, ipcRenderer } from "electron";
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
import {
    BoardBridgeChannel,
    type BoardContext,
    type BoardNotifyType,
    type BoardThemePalette,
    type OpenFileDialogParams,
    type OpenFolderDialogParams,
    type SaveFileDialogParams,
} from "./ipc/board-bridge-channels";

let idCounter = 0;

/** Resolved once, synchronously, before the page runs (see EPIC-034 C-B) — the
 *  board's root folder, the default `cwd` for `execute()`. */
let boardRoot = "";
/** Live color palette (re-applied on theme switch) + static metric tokens, both
 *  resolved once at init from the synchronous board context (see EPIC-034 US-725). */
let currentTheme: BoardThemePalette = { id: "", isDark: true, vars: {} };
let tokens: Record<string, string> = {};
try {
    const ctx = ipcRenderer.sendSync(BoardBridgeChannel.getContext) as BoardContext | undefined;
    boardRoot = ctx?.boardRoot ?? "";
    if (ctx?.theme) currentTheme = ctx.theme;
    if (ctx?.tokens) tokens = ctx.tokens;
} catch {
    // Keep the safe defaults above.
}

// ── Theme contract (US-725) ──────────────────────────────────────────────────
// The host renderer owns the palette; the preload only applies `--p-*` to the
// guest `<html>` and mirrors it to JS. Colors update live; metrics never change.

const themeCbs: Array<(t: BoardThemePalette) => void> = [];

function applyVars(vars: Record<string, string>): void {
    const root = document?.documentElement;
    if (!root) return;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

// Apply initial colors + metrics before the page paints. documentElement exists
// at preload time; guard + retry on DOMContentLoaded for safety.
const applyInitial = () => {
    applyVars(currentTheme.vars);
    applyVars(tokens);
};
if (document?.documentElement) applyInitial();
else document?.addEventListener("DOMContentLoaded", applyInitial, { once: true });

// Live COLOR updates pushed by the host (BoardWebview) on theme switch.
ipcRenderer.on(BoardBridgeChannel.themeChanged, (_event, palette: BoardThemePalette) => {
    currentTheme = palette;
    applyVars(palette.vars);
    for (const cb of themeCbs) {
        try {
            cb(palette);
        } catch (e) {
            console.error("persephone.onThemeChange callback error:", e);
        }
    }
});

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

/** Return the LAST match of `pattern` in `text` (used by `getJson(pattern)` to
 *  pull a marked result out of noisy stdout), or null if none. Iterates with a
 *  forced-global clone so the caller's regex (and its lastIndex) is untouched. */
function lastMatch(text: string, pattern: RegExp): RegExpExecArray | null {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    let match: RegExpExecArray | null = null;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
        match = m;
        if (m.index === re.lastIndex) re.lastIndex++; // avoid an infinite loop on a zero-width match
    }
    return match;
}

type Mode = "idle" | "buffered" | "streaming";

/**
 * Build a process handle over raw `ipcRenderer`. Mirrors `proc.ts`'s
 * `ExecuteHandle`, but raw `ipcRenderer.on` passes `(event, ...args)` and does
 * NOT return an unsubscribe fn — so listeners are tracked and torn down with
 * `removeListener`. Returned as a plain object so contextBridge can proxy its
 * methods to the page.
 */
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
    const registered: Array<[string, (...args: unknown[]) => void]> = [];

    const stderrText = () => new TextDecoder().decode(concat(stderrChunks));

    const teardown = () => {
        for (const [channel, listener] of registered) {
            ipcRenderer.removeListener(channel, listener);
        }
        registered.length = 0;
    };

    const finish = () => {
        finished = true;
        for (const r of doneResolvers) r();
        doneResolvers.length = 0;
        teardown();
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

    const on = (channel: string, listener: (...args: unknown[]) => void) => {
        ipcRenderer.on(channel, listener);
        registered.push([channel, listener]);
    };

    const onChunk = (target: Uint8Array[], cbs: Array<(c: Uint8Array) => void>) =>
        (_event: unknown, msg: RunnerChunkMsg) => {
            if (msg.jobId !== jobId) return;
            if (mode === "streaming") {
                for (const cb of cbs) {
                    try {
                        cb(msg.chunk);
                    } catch (e) {
                        console.error("persephone.execute stream callback error:", e);
                    }
                }
            } else {
                target.push(msg.chunk);
            }
        };

    on(RunnerChannel.stdout, onChunk(stdoutChunks, stdoutCbs) as (...a: unknown[]) => void);
    on(RunnerChannel.stderr, onChunk(stderrChunks, stderrCbs) as (...a: unknown[]) => void);
    on(RunnerChannel.exit, ((_event: unknown, msg: RunnerExitMsg) => {
        if (msg.jobId !== jobId || finished) return;
        exitInfo = { code: msg.code, signal: msg.signal };
        finish();
        for (const cb of exitCbs) {
            try {
                cb(exitInfo);
            } catch (e) {
                console.error("persephone.execute exit callback error:", e);
            }
        }
    }) as (...a: unknown[]) => void);
    on(RunnerChannel.error, ((_event: unknown, msg: RunnerErrorMsg) => {
        if (msg.jobId !== jobId || finished) return;
        errorMessage = msg.message;
        finish();
        for (const cb of errorCbs) {
            try {
                cb({ message: msg.message });
            } catch (e) {
                console.error("persephone.execute error callback error:", e);
            }
        }
    }) as (...a: unknown[]) => void);

    // Default cwd = the board folder; an explicit opts.cwd overrides.
    const opts: IExecuteOptions = { ...(boardRoot ? { cwd: boardRoot } : {}), ...options };
    ipcRenderer.send(RunnerChannel.start, { jobId, command, opts });

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
            ipcRenderer.send(RunnerChannel.stdin, { jobId, data });
        },

        endStdin(): void {
            if (finished) return;
            ipcRenderer.send(RunnerChannel.endStdin, { jobId });
        },

        kill(signal?: string): void {
            if (finished) return;
            ipcRenderer.send(RunnerChannel.kill, { jobId, signal });
        },
    };

    return handle;
}

/** Error for `getJson()` failures. Custom props may not survive the contextBridge
 *  clone, so the exit code is also folded into the message. */
function makeRunnerError(message: string, exitCode: number | null, stderr: string): Error {
    const err = new Error(message) as Error & {
        exitCode: number | null;
        stderr: string;
    };
    err.exitCode = exitCode;
    err.stderr = stderr;
    return err;
}

// ── The `persephone` bridge ──────────────────────────────────────────────────

contextBridge.exposeInMainWorld("persephone", {
    /** Bridge version. US-725/726 extend this same object (theme, etc.). */
    version: "1.0.0",

    /** Spawn a command line; returns a process handle. Default cwd = board folder. */
    execute(command: string, options?: IExecuteOptions): IExecuteHandle {
        return createHandle(command, options);
    },

    /** Open a link (file path or URL) in a new Persephone page. */
    openRawLink(href: string): void {
        ipcRenderer.send(BoardBridgeChannel.openRawLink, { href });
    },

    /** Show a Persephone toast. */
    notify(message: string, type?: BoardNotifyType): void {
        // Mirror errors to the board's dev-tools console (US-726); main also
        // appends them to ui.log.
        if (type === "error") {
            console.error("[board]", message);
        }
        ipcRenderer.send(BoardBridgeChannel.notify, { message, type });
    },

    /** Native open-file dialog → selected path(s), or undefined if cancelled. */
    openFileDialog(params?: OpenFileDialogParams): Promise<string[] | undefined> {
        return ipcRenderer.invoke(BoardBridgeChannel.openFileDialog, params ?? {});
    },

    /** Native save-file dialog → chosen path, or undefined if cancelled. */
    saveFileDialog(params?: SaveFileDialogParams): Promise<string | undefined> {
        return ipcRenderer.invoke(BoardBridgeChannel.saveFileDialog, params ?? {});
    },

    /** Native pick-folder dialog → selected folder(s), or undefined if cancelled. */
    openFolderDialog(params?: OpenFolderDialogParams): Promise<string[] | undefined> {
        return ipcRenderer.invoke(BoardBridgeChannel.openFolderDialog, params ?? {});
    },

    /** Host color palette (`--p-*` names → values) as of page load — correct on every
     *  (re)load. NOTE: this is a snapshot; `contextBridge` copies it once across the
     *  isolated world, so it does NOT update on an in-session theme switch. For a live
     *  value, call `getTheme()` or read the palette delivered to `onThemeChange`. */
    get theme(): BoardThemePalette {
        return currentTheme;
    },

    /** Live host color palette — always the current theme, including after an in-session
     *  switch (a function call crosses the bridge fresh each time, unlike the `theme`
     *  snapshot). Prefer this (or the `onThemeChange` argument) when re-theming. */
    getTheme(): BoardThemePalette {
        return currentTheme;
    },

    /** Static metric tokens (`--p-space-*`, `--p-radius-*`, …). Theme-independent. */
    tokens: Object.freeze({ ...tokens }),

    /** Same static metric tokens, as a live accessor (symmetric with `getTheme()`). */
    getTokens(): Record<string, string> {
        return tokens;
    },

    /** Subscribe to theme changes. Fires once immediately with the current palette,
     *  then on every switch. Returns an unsubscribe fn. */
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
});
