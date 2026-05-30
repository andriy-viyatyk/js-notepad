/**
 * WorkerRunner — renderer side of the async worker system.
 *
 * Sends the function to the main process via IPC, which spawns a worker_thread.
 * Proxy calls from the worker are forwarded back here for execution on the
 * renderer, keeping UI objects accessible while heavy computation runs off-thread.
 */

import { WorkerChannel } from "../../../ipc/worker-channels";

const { ipcRenderer } = window.electron;

let idCounter = 0;

/**
 * Resolve a dotted path on an object.
 * E.g. resolvePath(obj, ["progress", "setLabel"]) → obj.progress.setLabel
 */
function resolvePath(obj: any, path: string[]): any {
    let current = obj;
    for (const key of path) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
}

/**
 * Run a function in a background worker thread (via main process).
 *
 * @param fn - Self-contained function to execute in the worker.
 *   Has full Node.js access via require(). Cannot access outer scope (closures lost).
 * @param data - Plain serializable data cloned into the worker.
 * @param proxyObj - Optional object proxied back to the renderer. Every access
 *   on `proxy` inside the worker transparently round-trips via IPC + postMessage.
 */
export async function runAsync<TData, TProxy, TResult>(
    fn: (data: TData, proxy: TProxy) => Promise<TResult>,
    data: TData,
    proxyObj?: TProxy
): Promise<TResult> {
    const id = `w_${++idCounter}_${Date.now()}`;

    // Wrap proxyObj in a revocable proxy for safe cleanup
    let revoke: (() => void) | undefined;
    let activeProxy = proxyObj;
    if (proxyObj !== undefined && proxyObj !== null) {
        const revocable = Proxy.revocable(proxyObj as object, {
            get: (target, prop, receiver) => Reflect.get(target, prop, receiver),
            set: (target, prop, value, receiver) => Reflect.set(target, prop, value, receiver),
            has: (target, prop) => Reflect.has(target, prop),
        });
        revoke = revocable.revoke;
        activeProxy = revocable.proxy as TProxy;
    }

    return new Promise<TResult>((resolve, reject) => {
        const cleanups: (() => void)[] = [];

        const cleanup = () => {
            revoke?.();
            for (const unsub of cleanups) unsub();
        };

        // Listen for result
        cleanups.push(ipcRenderer.on(WorkerChannel.result, (msg: any) => {
            if (msg.id !== id) return;
            cleanup();
            resolve(msg.value);
        }));

        // Listen for error
        cleanups.push(ipcRenderer.on(WorkerChannel.error, (msg: any) => {
            if (msg.id !== id) return;
            cleanup();
            const err = new Error(`app.runAsync worker error: ${msg.message}`);
            if (msg.stack) err.stack = msg.stack;
            reject(err);
        }));

        // Listen for proxy calls from worker
        cleanups.push(ipcRenderer.on(WorkerChannel.proxyCall, async (msg: any) => {
            if (msg.id !== id) return;
            try {
                const parentPath = msg.path.slice(0, -1);
                const methodName = msg.path[msg.path.length - 1];
                const parent = parentPath.length > 0
                    ? resolvePath(activeProxy, parentPath)
                    : activeProxy;
                const method = parent[methodName];
                const result = typeof method === "function"
                    ? await method.call(parent, ...msg.args)
                    : method;
                ipcRenderer.sendMessage(
                    WorkerChannel.proxyResult as any,
                    { id, callId: msg.callId, value: result }
                );
            } catch (e) {
                ipcRenderer.sendMessage(
                    WorkerChannel.proxyResult as any,
                    { id, callId: msg.callId, error: e?.message ?? String(e) }
                );
            }
        }));

        // Listen for proxy property sets from worker
        cleanups.push(ipcRenderer.on(WorkerChannel.proxySet, (msg: any) => {
            if (msg.id !== id) return;
            try {
                const parentPath = msg.path.slice(0, -1);
                const prop = msg.path[msg.path.length - 1];
                const parent = parentPath.length > 0
                    ? resolvePath(activeProxy, parentPath)
                    : activeProxy;
                parent[prop] = msg.value;
            } catch {
                // Fire-and-forget — set errors are silently ignored
            }
        }));

        // Send start message to main process
        ipcRenderer.sendMessage(
            WorkerChannel.start as any,
            {
                id,
                fnString: fn.toString(),
                data,
                hasProxy: proxyObj !== undefined && proxyObj !== null,
            }
        );
    });
}
