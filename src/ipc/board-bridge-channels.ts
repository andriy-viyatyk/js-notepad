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
    /** True when this board is a content-host editor (EPIC-043): Persephone owns the content
     *  host and pushes `host:content`. Gates `persephone.host.getContent/getLanguage` in the shim
     *  (a plain board rejects instead of hanging). */
    contentHost?: boolean;
    /** True when `filePath` is NOT directly readable — its real source is an archive entry
     *  (`archive.zip!doc.pdf`) or an `http(s)` URL, which Persephone must materialize into a local
     *  cache file first. `getFilePath()` then resolves through a `board:filePath` request instead of
     *  returning `filePath` verbatim, so the board always receives a readable LOCAL path. Absent
     *  (the common case) keeps the zero-round-trip handshake path. */
    materialize?: boolean;
}

/** Messages the shim posts to the HOST FRAME via `window.parent.postMessage` (the
 *  board→host channel — NOT the board↔main port): overlay-dismiss pings, error
 *  breadcrumbs, and the busy flag (US-799). Handled in `BoardWebview.onMessage`. */
export interface BoardToHostMsg {
    __persephone:
        | "board:interact"
        | "board:error"
        | "board:log"   // mirrored console.warn/error from the board frame → ui.log
        | "board:busy"
        | "board:setContent" // content-host board wrote content (EPIC-043)
        | "board:save"       // content-host board / Ctrl+S requested a save (EPIC-043)
        | "board:setState"   // persephone.state.set — replace shared state (EPIC-044)
        | "board:mergeState" // persephone.state.merge — shallow-merge shared state
        | "board:stateInit"  // persephone.state.init — seed defaults + declare restorable keys
        | "board:setSecondaryViews" // persephone.setSecondaryViews — replace the board's views (EPIC-044)
        | "board:setStatusText" // persephone.setStatusText — content-host footer status (US-892)
        | "board:cycleTheme" // Ctrl+Alt+[ / ] pressed inside the frame — cycle the app theme
        | "board:var" // board requested a var.get/set/list (EPIC-046) — request/reply, needs a reqId
        | "board:filePath"; // board asked for its readable local content path — request/reply, needs a reqId
    /** `board:error` / `board:log` detail. */
    message?: string;
    /** `board:log` severity: `"warn"` or `"error"` (the mirrored console method). */
    level?: string;
    /** `board:busy` value. */
    busy?: boolean;
    /** `board:setContent` payload — the new UTF-8 content. */
    content?: string;
    /** `board:setState` full replacement. */
    state?: Record<string, unknown>;
    /** `board:mergeState` shallow-merge partial. */
    partial?: Record<string, unknown>;
    /** `board:stateInit` defaults (fill-missing). */
    defaults?: Record<string, unknown>;
    /** `board:stateInit` keys to persist (opt-in, D9). */
    restorableKeys?: string[];
    /** `board:setSecondaryViews` payload — the full replacement view set.
     *  Structurally mirrors `SecondaryViewDecl` (this module stays dependency-free,
     *  so it can't import that type); normalized renderer-side by `normalizeSecondaryViews`. */
    views?: Array<{ id: string; html?: string; title?: string }>;
    /** `board:setStatusText` payload — the footer status text (content-host boards). `""` clears. */
    statusText?: string;
    /** `board:cycleTheme` direction: `1` = next theme (Ctrl+Alt+]), `-1` = previous (Ctrl+Alt+[). */
    direction?: 1 | -1;
    /** `board:var` request id — echoed back in the `var:result` push. */
    reqId?: number;
    /** `board:var` method. */
    varMethod?: "get" | "set" | "list" | "show";
    /** `board:var` positional args (get: [name, env?]; set: [name, value, env?]; list: [env?];
     *  show: []). */
    varArgs?: unknown[];
}

/** Host content pushed renderer → board over `iframe.contentWindow.postMessage` (EPIC-043).
 *  Repeated: an initial snapshot after the frame loads, then on every host content/language
 *  change. Echo-guarded renderer-side (a push equal to the board's last `setContent` is skipped),
 *  so the board's `onContentChange` never re-fires for the board's own write. */
export interface BoardHostContentMsg {
    __persephone: "host:content";
    content: string;
    language?: string;
}

/** Shared state pushed renderer → board over `iframe.contentWindow.postMessage` (EPIC-044).
 *  A snapshot after the frame loads (seed), then on every change. `seq` is a monotonic
 *  per-model version: the shim applies a push only when `seq` exceeds the last applied,
 *  so seed-vs-init / set / merge deliveries are order-independent (no echo-guard needed). */
export interface BoardStateSyncMsg {
    __persephone: "state:sync";
    state: Record<string, unknown>;
    seq: number;
}

/** Reply to a board `board:filePath` request pushed renderer → board. Matched to the request by
 *  `reqId`. `path` is a readable LOCAL path holding the board's content (the source path itself for
 *  a plain local file, else a cache file materialized from the content pipe); `error` is set instead
 *  when the source could not be read (missing archive entry, HTTP failure). */
export interface BoardFilePathResultMsg {
    __persephone: "filePath:result";
    reqId: number;
    path?: string;
    error?: string;
}

/** Reply to a board `board:var` request pushed renderer → board (EPIC-046). Matched to the
 *  request by `reqId`. `result` carries the method's return (get: string|undefined; list:
 *  string[]; set: undefined); `error` is set instead when the request rejected (not configured
 *  + user declined, locked, or a store error). */
export interface BoardVarResultMsg {
    __persephone: "var:result";
    reqId: number;
    result?: unknown;
    error?: string;
}

// Re-export the dialog param shapes so the shim + bridge import one place.
export type {
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
};
