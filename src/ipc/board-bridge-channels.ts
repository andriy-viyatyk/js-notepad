/**
 * Board bridge wire types — the `persephone` integration tier carried over the
 * per-board `MessagePort` (EPIC-034 / US-724; re-homed onto a `MessageChannelMain`
 * port in EPIC-037 / US-771).
 *
 * A board iframe has no `ipcRenderer` and no preload — its only channel to the
 * privileged side is a `MessagePort` minted per board in main and transferred into
 * the frame by the host renderer (the one-time handshake). The board↔main protocol
 * is the {@link BoardToMain} / {@link MainToBoard} envelope union below; `execute()`
 * rides the same port as `{ kind: "runner", … }` envelopes wrapping the existing
 * `runner-channels.ts` messages.
 *
 * Like `runner-channels.ts`, this module is intentionally dependency-free (no
 * imports from `src/main` or `src/renderer`) so the injected board **shim**
 * (`src/board-shim.ts`, a plain browser script) can import its types. Dialog param
 * types are pulled type-only from the already-dependency-free `api-param-types.ts`;
 * runner message shapes from `runner-channels.ts`.
 */
import type {
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
} from "./api-param-types";
import type {
    RunnerChannel,
    RunnerChunkMsg,
    RunnerErrorMsg,
    RunnerExitMsg,
    RunnerJobMsg,
    RunnerKillMsg,
    RunnerStartMsg,
    RunnerStdinMsg,
} from "./runner-channels";

/** The host color palette pushed into a board: the frozen color `--p-*` contract
 *  resolved to concrete values, plus theme identity. The `vars` keys are `--p-*`
 *  names (e.g. `--p-bg`). Re-pushed on every theme switch (US-725). */
export interface BoardThemePalette {
    /** Active theme id, e.g. "default-dark". */
    id: string;
    /** True for dark themes (lets a board pick asset variants). */
    isDark: boolean;
    /** `--p-*` name → concrete CSS color value. */
    vars: Record<string, string>;
}

/** The board context baked into served HTML by the `board://` handler as
 *  `window.__persephoneBoot` (EPIC-037 / US-771) — read synchronously by the shim
 *  before the first author script, replacing the old synchronous `getContext` IPC.
 *  The board root is NOT included: main fills the default `execute()` cwd + relative
 *  file paths from its own `boardId → root` registry. */
export interface BoardBootContext {
    /** Initial color palette, applied by the shim at first paint (US-725). Live
     *  switches arrive later as a {@link MainToBoard} `theme` envelope over the port. */
    theme: BoardThemePalette;
    /** Static metric vars (`--p-space-*`, `--p-radius-*`, …) — theme-independent. */
    tokens: Record<string, string>;
    /** The host renderer's origin — the shim accepts the port-handshake message only
     *  when `event.origin === hostOrigin` AND `event.source === window.parent` (C2). */
    hostOrigin: string;
}

export type BoardNotifyType = "info" | "success" | "warning" | "error";

export interface BoardNotifyMsg {
    message: string;
    type?: BoardNotifyType;
}

export interface BoardOpenRawLinkMsg {
    href: string;
    /** Optional registered editor id to open the file with (e.g. "md-view").
     *  Falls back to the default editor when omitted or when the editor doesn't
     *  accept the file (US-756 C6). */
    editor?: string;
}

/** Text encoding for the board file bridge (US-756 C4). "utf8" returns/accepts a
 *  plain string; "base64" returns/accepts base64 for binary content. */
export type BoardFileEncoding = "utf8" | "base64";

export interface BoardReadFileMsg {
    /** Absolute, or relative to the board root. */
    path: string;
    encoding?: BoardFileEncoding;
}

export interface BoardWriteFileMsg {
    /** Absolute, or relative to the board root. */
    path: string;
    /** File contents — a plain string ("utf8") or base64 ("base64"). */
    data: string;
    encoding?: BoardFileEncoding;
}

// ── Port RPC envelopes (EPIC-037 / US-771) ───────────────────────────────────
// board ↔ main over the per-board MessagePort. Request/reply uses an `id`; fire-
// and-forget effects carry no id; `execute()` wraps runner-channels messages in a
// `runner` envelope (board→main: start/stdin/end-stdin/kill; main→board: stdout/
// stderr/exit/error). Theme is pushed main→board for live retint.

/** Request/reply methods (board → main, awaited by the shim). */
export type BoardRpcMethod =
    | "openFileDialog"
    | "saveFileDialog"
    | "openFolderDialog"
    | "readFile"
    | "writeFile"
    | "getJobs";

/** A live job owned by this board (US-799) — the `getJobs` RPC result element.
 *  Plain data over the port; the shim wraps each in a control handle
 *  (`kill`/`write`/`endStdin` posting the usual runner messages by `jobId`). */
export interface BoardJobInfo {
    jobId: string;
    command: string;
    /** The caller-chosen name from `execute(cmd, { name })`, if any. */
    name?: string;
}

/** Fire-and-forget methods (board → main, no reply). */
export type BoardFireMethod = "openRawLink" | "notify";

/** A runner envelope sent board → main (the caller→runner half of `RunnerChannel`). */
export interface BoardRunnerOutMsg {
    kind: "runner";
    channel:
        | RunnerChannel.start
        | RunnerChannel.stdin
        | RunnerChannel.endStdin
        | RunnerChannel.kill;
    msg: RunnerStartMsg | RunnerStdinMsg | RunnerJobMsg | RunnerKillMsg;
}

/** A runner envelope sent main → board (the runner→caller half of `RunnerChannel`). */
export interface BoardRunnerInMsg {
    kind: "runner";
    channel:
        | RunnerChannel.stdout
        | RunnerChannel.stderr
        | RunnerChannel.exit
        | RunnerChannel.error;
    msg: RunnerChunkMsg | RunnerExitMsg | RunnerErrorMsg;
}

/** Everything the board posts to main over the port. */
export type BoardToMain =
    | { kind: "rpc"; id: number; method: BoardRpcMethod; args: unknown[] }
    | { kind: "fire"; method: BoardFireMethod; args: unknown[] }
    | { kind: "connected" } // shim → main: handshake liveness (mode D, EPIC-037 C11)
    | BoardRunnerOutMsg;

/** Everything main posts to the board over the port. */
export type MainToBoard =
    | { kind: "rpc-result"; id: number; result?: unknown; error?: string }
    | { kind: "theme"; palette: BoardThemePalette }
    | BoardRunnerInMsg;

/** The init message the host renderer posts into the board frame to transfer the
 *  port (the single `window.postMessage` survivor — C2). The transferred port is on
 *  `event.ports[0]`; the shim validates `event.origin`/`event.source` before use. */
export interface BoardPortInitMsg {
    __persephoneInit: true;
    /** The board's current busy flag (US-799) — carried at handshake so a re-created
     *  board can read `persephone.getBoardBusy()` and reinitialize its running state. */
    busy?: boolean;
    /** The file a custom-editor board edits (EPIC-042) — carried at handshake so the board
     *  can read `persephone.getFilePath()`. Undefined for a board opened plainly. */
    filePath?: string;
}

/** Messages the shim posts to the HOST FRAME via `window.parent.postMessage` (the
 *  board→host channel — NOT the board↔main port): overlay-dismiss pings, error
 *  breadcrumbs, and the busy flag (US-799). Handled in `BoardWebview.onMessage`. */
export interface BoardToHostMsg {
    __persephone: "board:interact" | "board:error" | "board:busy";
    /** `board:error` detail. */
    message?: string;
    /** `board:busy` value. */
    busy?: boolean;
}

// Re-export the dialog param shapes so the shim + bridge import one place.
export type {
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
};
