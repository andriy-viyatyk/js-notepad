/**
 * Main-process host for script worker threads.
 *
 * The renderer cannot use Node.js worker_threads (Electron limitation).
 * Instead, the renderer sends IPC requests here, and we spawn worker_threads
 * in the main process where they are fully supported.
 *
 * Protocol:
 *   Renderer → Main:  WorkerChannel.start   { id, fnString, data, hasProxy }
 *   Renderer → Main:  WorkerChannel.proxyResult  { id, callId, value?, error? }
 *   Main → Renderer:  WorkerChannel.result   { id, value }
 *   Main → Renderer:  WorkerChannel.error    { id, message, stack? }
 *   Main → Renderer:  WorkerChannel.proxyCall { id, callId, path, args }
 *   Main → Renderer:  WorkerChannel.proxySet  { id, path, value }
 */
import { ipcMain, IpcMainEvent } from "electron";
import { Worker } from "worker_threads";
import { WorkerChannel } from "../ipc/worker-channels";

// Worker → Host message discriminator (see protocol comment above).
type WorkerHostMessage =
    | { type: "result"; value: unknown }
    | { type: "error"; message: string; stack?: string }
    | { type: "proxy-call"; id: string; path: string[]; args: unknown[] }
    | { type: "proxy-set"; path: string[]; value: unknown };

/** Inline worker code — runs in a worker_thread with full Node.js access. */
const WORKER_CODE = `
const { parentPort } = require("worker_threads");

// ── Sucrase helpers ──
// Transpiled scripts use these for ?. and ?? operators.

function _optionalChain(ops) {
    let lastAccessLHS = undefined;
    let value = ops[0];
    let i = 1;
    while (i < ops.length) {
        const op = ops[i];
        const fn = ops[i + 1];
        i += 2;
        if ((op === "optionalAccess" || op === "optionalCall") && value == null) return undefined;
        if (op === "access" || op === "optionalAccess") { lastAccessLHS = value; value = fn(value); }
        else if (op === "call" || op === "optionalCall") {
            value = fn((...args) => value.call(lastAccessLHS, ...args));
            lastAccessLHS = undefined;
        }
    }
    return value;
}
async function _asyncOptionalChain(ops) {
    let lastAccessLHS = undefined;
    let value = ops[0];
    let i = 1;
    while (i < ops.length) {
        const op = ops[i];
        const fn = ops[i + 1];
        i += 2;
        if ((op === "optionalAccess" || op === "optionalCall") && value == null) return undefined;
        if (op === "access" || op === "optionalAccess") { lastAccessLHS = value; value = await fn(value); }
        else if (op === "call" || op === "optionalCall") {
            value = await fn((...args) => value.call(lastAccessLHS, ...args));
            lastAccessLHS = undefined;
        }
    }
    return value;
}
function _nullishCoalesce(lhs, rhsFn) { return lhs != null ? lhs : rhsFn(); }
async function _asyncNullishCoalesce(lhs, rhsFn) { return lhs != null ? lhs : await rhsFn(); }
function _optionalChainDelete(ops) { const r = _optionalChain(ops); return r == null ? true : r; }
async function _asyncOptionalChainDelete(ops) { const r = await _asyncOptionalChain(ops); return r == null ? true : r; }

globalThis._optionalChain = _optionalChain;
globalThis._asyncOptionalChain = _asyncOptionalChain;
globalThis._nullishCoalesce = _nullishCoalesce;
globalThis._asyncNullishCoalesce = _asyncNullishCoalesce;
globalThis._optionalChainDelete = _optionalChainDelete;
globalThis._asyncOptionalChainDelete = _asyncOptionalChainDelete;

// ── Proxy factory ──

const pendingCalls = new Map();
let nextCallId = 1;

function createProxy(path) {
    return new Proxy(function(){}, {
        get(_, prop) {
            if (typeof prop === "symbol") return undefined;
            return createProxy([...path, prop]);
        },
        set(_, prop, value) {
            parentPort.postMessage({ type: "proxy-set", path: [...path, prop], value });
            return true;
        },
        apply(_, __, args) {
            const id = nextCallId++;
            parentPort.postMessage({ type: "proxy-call", id, path, args });
            return new Promise((resolve, reject) => {
                pendingCalls.set(id, { resolve, reject });
            });
        },
    });
}

// ── Message handler ──

parentPort.on("message", async (msg) => {
    if (msg.type === "execute") {
        try {
            const fn = new Function("return " + msg.fnString)();
            const proxy = msg.hasProxy ? createProxy([]) : undefined;
            const result = await fn(msg.data, proxy);
            parentPort.postMessage({ type: "result", value: result });
        } catch (e) {
            parentPort.postMessage({
                type: "error",
                message: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined,
            });
        }
    } else if (msg.type === "proxy-result") {
        const pending = pendingCalls.get(msg.id);
        if (pending) {
            pendingCalls.delete(msg.id);
            if (msg.error) pending.reject(new Error(msg.error));
            else pending.resolve(msg.value);
        }
    }
});
`;

/** Active workers keyed by request id. */
const activeWorkers = new Map<string, Worker>();

/**
 * Initialize worker host IPC handlers. Call once during app startup.
 */
export function initWorkerHost(): void {
    ipcMain.on(WorkerChannel.start, (event: IpcMainEvent, msg: {
        id: string;
        fnString: string;
        data: unknown;
        hasProxy: boolean;
    }) => {
        const worker = new Worker(WORKER_CODE, { eval: true });
        activeWorkers.set(msg.id, worker);

        const cleanup = () => {
            activeWorkers.delete(msg.id);
            worker.terminate();
        };

        worker.on("message", (workerMsg: WorkerHostMessage) => {
            try {
                if (workerMsg.type === "result") {
                    cleanup();
                    event.sender.send(WorkerChannel.result, {
                        id: msg.id,
                        value: workerMsg.value,
                    });
                } else if (workerMsg.type === "error") {
                    cleanup();
                    event.sender.send(WorkerChannel.error, {
                        id: msg.id,
                        message: workerMsg.message,
                        stack: workerMsg.stack,
                    });
                } else if (workerMsg.type === "proxy-call") {
                    // Forward proxy call from worker to renderer
                    event.sender.send(WorkerChannel.proxyCall, {
                        id: msg.id,
                        callId: workerMsg.id,
                        path: workerMsg.path,
                        args: workerMsg.args,
                    });
                } else if (workerMsg.type === "proxy-set") {
                    // Forward proxy set from worker to renderer
                    event.sender.send(WorkerChannel.proxySet, {
                        id: msg.id,
                        path: workerMsg.path,
                        value: workerMsg.value,
                    });
                }
            } catch {
                // Sender may have been destroyed (window closed)
                cleanup();
            }
        });

        worker.on("error", (err: Error) => {
            cleanup();
            try {
                event.sender.send(WorkerChannel.error, {
                    id: msg.id,
                    message: err.message,
                    stack: err.stack,
                });
            } catch {
                // Sender may have been destroyed
            }
        });

        // Start execution
        worker.postMessage({
            type: "execute",
            fnString: msg.fnString,
            data: msg.data,
            hasProxy: msg.hasProxy,
        });
    });

    // Renderer sends proxy call results back
    ipcMain.on(WorkerChannel.proxyResult, (_event: IpcMainEvent, msg: {
        id: string;
        callId: number;
        value?: unknown;
        error?: string;
    }) => {
        const worker = activeWorkers.get(msg.id);
        if (worker) {
            worker.postMessage({
                type: "proxy-result",
                id: msg.callId,
                value: msg.value,
                error: msg.error,
            });
        }
    });
}
