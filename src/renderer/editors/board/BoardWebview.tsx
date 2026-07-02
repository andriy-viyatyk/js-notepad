import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../../uikit/Panel";
import color from "../../theme/color";
import { api } from "../../../ipc/renderer/api";
import { fs } from "../../api/fs";
import { fpJoin } from "../../core/utils/file-path";
import { settings } from "../../api/settings";
import type { BoardPortInitMsg } from "../../../ipc/board-bridge-channels";
import { BOARD_TOKEN_VARS, computeBoardThemePalette } from "./board-theme";
import type { BoardEditorModel } from "./BoardEditorModel";

/**
 * Locked-down host for a single board (EPIC-034 / US-723; iframe in EPIC-037).
 * Renders the board's own files over the `board://` scheme in an in-DOM cross-origin
 * `<iframe src="board://<host>/index.html">`. Isolation comes from the cross-origin
 * `board://<host>` origin + `nodeIntegrationInSubFrames:false` + the served CSP — NOT
 * from a `sandbox` attribute (the bare attribute would force an opaque origin with no
 * stable storage — EPIC-037 C5). The `host` is a stable hash of the board root, minted
 * by `registerBoard` in main; the single host-routed `board://` handler serves it.
 *
 * The privileged `window.persephone` bridge (US-771) is delivered over a per-board
 * `MessagePort`: this component is the one-time broker. On each iframe `load` it asks
 * main for a fresh port (`requestBoardPort`); main delivers `port1` via `onBoardPort`;
 * we transfer it into the frame (`contentWindow.postMessage(init, "board://<host>",
 * [port])`). Requesting on every `load` re-handshakes after a soft reload or in-board
 * navigation (a port is neutered when its frame navigates). On unmount we dispose.
 *
 * Lifecycle is view-driven: the parent keys this component by `selectedBoard__reloadToken`,
 * so switching/reloading a board unmounts (→ unregister + dispose) and remounts.
 */
/** A single `ui.log` line: `[<iso>] [<level>] <message>\n`. */
function logLine(level: string, message: string): string {
    return `[${new Date().toISOString()}] [${level}] ${message}\n`;
}

export function BoardWebview({ model, boardRoot }: { model: BoardEditorModel; boardRoot: string }) {
    // The stable board:// host for this board, minted by main. The <iframe src> is set
    // only after this resolves, so the host→root mapping always exists before the first
    // board://<host>/index.html request (EPIC-037 C770-5).
    const [host, setHost] = useState<string | null>(null);

    // A per-mount id correlating this board's MessagePort across the request/deliver
    // round-trip and the dispose call.
    const boardId = useMemo(() => `board_${Math.random().toString(36).slice(2)}`, []);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    // A port delivered by main but not yet transferred (frame not ready / between loads).
    const pendingPortRef = useRef<MessagePort | null>(null);

    useEffect(() => {
        let live = true;
        let registeredHost: string | null = null;
        void api
            .registerBoard(boardRoot, computeBoardThemePalette(), BOARD_TOKEN_VARS)
            .then(async (h) => {
                if (!live) {
                    // Unmounted before registration resolved — drop the entry we just made.
                    void api.unregisterBoard(h);
                    return;
                }
                // Start a FRESH ui.log for this board lifetime — overwrite any prior content
                // BEFORE the iframe navigates (host gates the <iframe src>), so the load's own
                // log lines (a missing-document report from main, board:error appends) land in
                // the new file instead of being wiped by a later reset. The log thus tracks only
                // the current lifetime (from this load) and can't grow without bound across
                // switches/reloads. Best-effort; a failure must never raise.
                await fs.write(fpJoin(boardRoot, "ui.log"), logLine("info", "board loaded")).catch(() => {});
                if (!live) {
                    void api.unregisterBoard(h);
                    return;
                }
                registeredHost = h;
                setHost(h);
            });
        return () => {
            live = false;
            if (registeredHost) void api.unregisterBoard(registeredHost);
        };
    }, [boardRoot]);

    // Append a troubleshooting line to the current lifetime's ui.log (mode B/E errors).
    // Best-effort — a logging failure must never raise its own error.
    const appendLog = useCallback((level: string, message: string) => {
        void fs.append(fpJoin(boardRoot, "ui.log"), logLine(level, message)).catch(() => {});
    }, [boardRoot]);

    // Transfer a pending port into the board frame (the one-time handshake), with an
    // explicit board origin so the port can't leak to a frame that navigated away (C2).
    // Carries the model's current busy flag (US-799) so a re-created board can read
    // `persephone.getBoardBusy()` and reinitialize its running state.
    const transferPort = useCallback(() => {
        const win = iframeRef.current?.contentWindow;
        const port = pendingPortRef.current;
        if (!win || !port || !host) return;
        const init: BoardPortInitMsg = { __persephoneInit: true, busy: !!model.state.get().busy };
        win.postMessage(init, `board://${host}`, [port]);
        pendingPortRef.current = null;
    }, [host, model]);

    // Subscribe to per-board port delivery; dispose the port + the board's jobs on unmount.
    useEffect(() => {
        if (!host) return;
        let live = true;
        const off = api.onBoardPort((bId, port) => {
            if (!live || bId !== boardId) return; // another board's port — ignore
            pendingPortRef.current = port;
            transferPort();
        });
        return () => {
            live = false;
            off();
            pendingPortRef.current = null;
            void api.disposeBoardPort(boardId);
        };
    }, [host, boardId, transferPort]);

    // Each frame load (initial, soft reload, in-board navigation) → request a fresh
    // port; the prior one (if any) is disposed by main when it mints the new pair.
    // Also (re)register the board frame for CDP automation (US-773) — a reload recreates
    // the OOPIF, so main must refresh the cached board-frame CDP session. Pass `boardId`
    // (the iframe's ?v= nonce) so CDP pins THIS tab's specific frame, not another tab of
    // the same board (same origin) nor the pre-reload frame after a remount (US-796).
    const handleLoad = useCallback(() => {
        if (!host) return;
        // `model.id` is the ownerId — the stable job-retention key across mounts of
        // this board tab (busy retention, US-799).
        void api.requestBoardPort(boardId, host, model.id);
        void api.registerBoardFrame(model.id, host, boardId);
    }, [host, boardId, model]);

    // Expose the iframe element to the model (automation focus) and dismiss host
    // overlays on a board click (US-773 C10): a cross-origin board's inner clicks don't
    // bubble to the host (SOP), so the shim posts a `board:interact` ping which we turn
    // into the same `document` mousedown the browser uses to close menus/popovers.
    useEffect(() => {
        if (!host) return;
        const el = iframeRef.current;
        if (el) model.setIframe(el);

        const onMessage = (e: MessageEvent) => {
            const d = e.data as { __persephone?: string; message?: string; busy?: boolean } | undefined;
            if (!d || !d.__persephone) return;
            if (e.origin !== `board://${host}`) return;
            if (e.source !== iframeRef.current?.contentWindow) return;
            if (d.__persephone === "board:interact") {
                document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            } else if (d.__persephone === "board:error" && d.message) {
                // Modes B + E (C11): LOG-ONLY. CSP violations and uncaught author errors are
                // troubleshooting detail for the author/agent (the board is often still
                // functional). User-facing toasts are reserved for "board failed to load"
                // (modes A + D, raised from main).
                appendLog("error", d.message);
            } else if (d.__persephone === "board:busy") {
                // Busy retention (US-799): the model is the authoritative renderer-side
                // holder; it mirrors the flag to main (job retention) and drives survival.
                model.setBusy(!!d.busy);
            }
        };
        window.addEventListener("message", onMessage);

        return () => {
            window.removeEventListener("message", onMessage);
            if (el) model.clearIframe(el);
            void api.unregisterBoardFrame(model.id);
        };
    }, [host, model, appendLog]);

    // Refresh the palette stored in main on theme switch. Main fans the new palette out
    // to every live board port (live retint, US-771) and refreshes the stored design so
    // a board that reloads after the switch is served the new theme by the handler.
    useEffect(() => {
        const sub = settings.onChanged.subscribe(({ key }) => {
            if (key !== "theme") return;
            void api.updateBoardTheme(computeBoardThemePalette());
        });
        return () => sub.dispose();
    }, []);

    return (
        // background="default" (= --color-bg-default, the same source as the board's
        // --p-bg) fills the wrapper while the iframe is not yet mounted, so the host area
        // is themed rather than blank. The board's own first paint is themed by the
        // parse-time --p-* injection in board-protocol-service.ts.
        <Panel direction="column" flex={1} width="100%" height={0} background="default">
            {host && (
                <iframe
                    ref={iframeRef}
                    title="board"
                    // `?v=${boardId}` tags this iframe's document URL with the per-mount
                    // boardId (NOT consumed by the handler — it derives the file from the
                    // pathname only). It uniquely identifies THIS tab's board frame so CDP
                    // automation (registerBoardFrame → cdp-service) attaches to the right
                    // frame: multiple tabs of the same board share the `board://${host}`
                    // origin, and a remount briefly coexists with the pre-reload frame —
                    // matching by origin alone is ambiguous, matching by ?v= is exact
                    // (US-796). boardId is regenerated on every remount (key change). The
                    // origin stays `board://${host}` (the query doesn't affect it), so the
                    // port handshake + CSP are unchanged; relative subresources (./app.js,
                    // CSS) resolve against the path and drop the query.
                    src={`board://${host}/index.html?v=${boardId}`}
                    onLoad={handleLoad}
                    // No `sandbox` attribute (EPIC-037 C5) — keeps a stable cross-origin
                    // origin so per-board storage works; no preload, no partition.
                    style={{ flex: 1, width: "100%", border: "none", backgroundColor: color.background.default }}
                />
            )}
        </Panel>
    );
}
