/**
 * Renderer client for the main-process streaming command runner.
 *
 * `proc.execute(command, opts)` returns an {@link IExecuteHandle} — the
 * renderer side of the protocol in `src/ipc/runner-channels.ts`. The handle's
 * state machine lives in `src/shared/execute-handle.ts` (shared with the board
 * shim); this file supplies only the transport: per-job `ipcRenderer.on`
 * subscriptions filtered by `jobId`, with the start / stdin / kill messages
 * sent back on the same channels — mirroring `WorkerRunner.ts`. The runner
 * channels are ad-hoc strings (not in the typed `Endpoint` enum), hence the
 * `as unknown as never` casts — same as the worker system.
 */
import { RunnerChannel } from "../../ipc/runner-channels";
import type {
    IExecuteError,
    IExecuteHandle,
    IExecuteOptions,
    IExitInfo,
    RunnerInboundMsg,
} from "../../ipc/runner-channels";
import type {
    IProc,
    IExecuteOptions as ScriptExecuteOptions,
    IExitInfo as ScriptExitInfo,
    IExecuteError as ScriptExecuteError,
    IExecuteHandle as ScriptExecuteHandle,
} from "./types/proc";
import { createExecuteHandle, RunnerError } from "../../shared/execute-handle";

export { RunnerError };

// ---------------------------------------------------------------------------
// Compile-time drift guard. The handle contract lives in two places by design:
// the canonical `runner-channels.ts` (shared by both clients) and the
// self-contained script-facing surface `./types/proc.d.ts` (it must not import
// across dirs — the editor-types flat-copy in vite.renderer.config.ts can't
// follow). Assert the two definitions stay MUTUALLY assignable, so changing a
// field in one without the other becomes a compile error here (not a silent
// drift). Type-only — erased at build, zero runtime cost.
// ---------------------------------------------------------------------------
type AssertExtends<A extends B, B> = A;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ProcContractInSync = [
    AssertExtends<IExecuteOptions, ScriptExecuteOptions>,
    AssertExtends<ScriptExecuteOptions, IExecuteOptions>,
    AssertExtends<IExitInfo, ScriptExitInfo>,
    AssertExtends<ScriptExitInfo, IExitInfo>,
    AssertExtends<IExecuteError, ScriptExecuteError>,
    AssertExtends<ScriptExecuteError, IExecuteError>,
    AssertExtends<IExecuteHandle, ScriptExecuteHandle>,
    AssertExtends<ScriptExecuteHandle, IExecuteHandle>,
];

const { ipcRenderer } = window.electron;

let idCounter = 0;

/** The four runner→caller channels, each carrying a `jobId` we filter on. */
const INBOUND = [
    RunnerChannel.stdout,
    RunnerChannel.stderr,
    RunnerChannel.exit,
    RunnerChannel.error,
] as const;

export const proc: IProc = {
    execute(command: string, options?: IExecuteOptions): IExecuteHandle {
        const jobId = `p_${++idCounter}_${Date.now()}`;
        return createExecuteHandle(
            {
                jobId,
                label: "proc.execute",
                send: (channel, msg) =>
                    ipcRenderer.sendMessage(channel as unknown as never, msg as never),
                subscribe: (deliver) => {
                    const offs = INBOUND.map((channel) =>
                        ipcRenderer.on(channel as unknown as never, (msg: RunnerInboundMsg) => {
                            if (msg.jobId === jobId) deliver(channel, msg);
                        }),
                    );
                    return () => {
                        for (const off of offs) off();
                    };
                },
            },
            { command, opts: options },
        );
    },
};
