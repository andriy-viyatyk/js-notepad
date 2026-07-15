import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../../uikit/Panel";
import color from "../../theme/color";
import { api } from "../../../ipc/renderer/api";
import { fs } from "../../api/fs";
import { fpJoin } from "../../core/utils/file-path";
import { settings } from "../../api/settings";
import { pagesModel } from "../../api/pages";
import { isFocusInSidebar } from "../../core/utils/focus-utils";
import type { BoardHostContentMsg, BoardPortInitMsg, BoardStateSyncMsg } from "../../../ipc/board-bridge-channels";
import { BOARD_CDP_TAB } from "../../../ipc/api-types";
import { BOARD_TOKEN_VARS, computeBoardThemePalette } from "./board-theme";
import { boardSecondaryPanelId } from "./board-secondary";
import type { BoardEditorModel } from "./BoardEditorModel";
import type { BoardContentEditorModel } from "./BoardContentEditorModel";

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

export function BoardWebview({
    model,
    boardRoot,
    entry = "index.html",
    view = "main",
    isMain = true,
}: {
    model: BoardEditorModel;
    boardRoot: string;
    /** Board-relative HTML entry file for this frame (EPIC-044). Defaults to the main
     *  entry; a secondary view points at its declared `html` (or the same entry). */
    entry?: string;
    /** This frame's view role (EPIC-044 / O6) — `"main"` for the board's main view, or a
     *  secondary view's id. Delivered to the shim as `persephone.view` via the `view=` URL param. */
    view?: string;
    /** Whether this is the board's MAIN frame (EPIC-044). Every frame registers for CDP
     *  automation + tracks its iframe under its OWN tab key (US-858) — `main` for the main
     *  frame, `board-secondary:<viewId>` for a secondary — so those are no longer main-only.
     *  What stays main-only: resetting `ui.log` and autofocusing on load/activation, which a
     *  secondary sidebar frame must not do. Defaults `true` so the single-frame board is unchanged. */
    isMain?: boolean;
}) {
    // The stable board:// host for this board, minted by main. The <iframe src> is set
    // only after this resolves, so the host→root mapping always exists before the first
    // board://<host>/index.html request (EPIC-037 C770-5).
    const [host, setHost] = useState<string | null>(null);

    // A per-mount id correlating this board's MessagePort across the request/deliver
    // round-trip and the dispose call.
    const boardId = useMemo(() => `board_${Math.random().toString(36).slice(2)}`, []);

    // This frame's automation tab id (EPIC-044 / US-858): the main frame keys `main`, each
    // secondary frame keys `board-secondary:<viewId>` (its `view` role). Used for the per-frame
    // CDP registration + the model's per-tab `frames`/`loadedTabs` tracking. A primitive string
    // derived from stable props → safe as a hook dependency.
    const tabId = isMain ? BOARD_CDP_TAB : boardSecondaryPanelId(view);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    // A port delivered by main but not yet transferred (frame not ready / between loads).
    const pendingPortRef = useRef<MessagePort | null>(null);
    // Echo-guard (EPIC-043): the board's own setContent value, so the host→board push of that same
    // value (the host emits it back) is skipped and the board's onContentChange doesn't re-fire
    // (mirrors GridEditor._changedContent). Per-mount — a reload re-reads via getContent().
    const lastBoardContentRef = useRef<string | undefined>(undefined);

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
                // switches/reloads. Best-effort; a failure must never raise. MAIN frame only
                // (EPIC-044): a secondary frame resetting the log would race with / wipe the
                // main frame's lines — secondary frames only APPEND their own `board:error`s.
                if (isMain) {
                    await fs.write(fpJoin(boardRoot, "ui.log"), logLine("info", "board loaded")).catch(() => {});
                }
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
    }, [boardRoot, isMain]);

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
        const init: BoardPortInitMsg = {
            __persephoneInit: true,
            busy: !!model.state.get().busy,
            filePath: model.currentFilePath(),
            contentHost: !!model.contentHost,
        };
        win.postMessage(init, `board://${host}`, [port]);
        pendingPortRef.current = null;
    }, [host, model]);

    // Give the board frame keyboard focus (like Monaco autofocuses on switch), so shortcuts
    // handled INSIDE the frame work immediately without a click — most importantly the shim's
    // Ctrl+S save (EPIC-043), whose keydown listener lives on the frame's own `window`. Gated by
    // the sidebar guard (US-808): sidebar-driven navigation must not pull focus out of the sidebar.
    // Cross-origin `contentWindow.focus()` is permitted (focus/blur are allowed cross-origin).
    const focusFrame = useCallback(() => {
        if (isFocusInSidebar()) return;
        iframeRef.current?.contentWindow?.focus();
    }, []);

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
        // this board tab (busy retention, US-799). BOTH frames request their own port
        // (each needs execute/readFile/etc. + its own content-host + shared-state seed).
        void api.requestBoardPort(boardId, host, model.id);
        // Register THIS frame for CDP automation under its own tab key (EPIC-044 / US-858):
        // the main frame keys `main`, each secondary keys `board-secondary:<viewId>`, so a
        // secondary no longer clobbers the main frame's registration. Mark the tab ready ONLY
        // after the registration IPC resolves — automation's readiness wait (switchTab /
        // ensureReady) releases the agent exactly when cdp-service can attach, never a tick
        // before (which would let a command hit an unregistered frame and throw).
        void api.registerBoardFrame(model.id, host, boardId, tabId).then(() => model.markFrameLoaded(tabId));
        // EPIC-043: seed the content-host board with the current host content. Subsequent changes
        // ride the host.state subscription below. The shim awaits this (getContent settle-once), so
        // a not-yet-restored host just means the subscription delivers the first snapshot instead.
        const chost = model.contentHost;
        const win = iframeRef.current?.contentWindow;
        if (chost && win) {
            const { content, language } = chost.state.get();
            lastBoardContentRef.current = undefined;
            const msg: BoardHostContentMsg = { __persephone: "host:content", content, language };
            win.postMessage(msg, `board://${host}`);
        }
        // EPIC-044: seed shared state into the freshly-loaded frame (settles persephone.state.get).
        // Current seq — a snapshot, not a mutation, so it does NOT bump.
        if (win) {
            const stateMsg: BoardStateSyncMsg = {
                __persephone: "state:sync",
                state: model.state.get().sharedState ?? {},
                seq: model.sharedStateSeq,
            };
            win.postMessage(stateMsg, `board://${host}`);
        }
        // Autofocus the freshly-loaded frame (covers the editor-switch case, where the board
        // mounts + loads). Tab switches to an already-loaded board are handled by the onFocus
        // subscription below. MAIN frame only (EPIC-044): a secondary sidebar frame must not
        // pull focus off the main view (frame-level shortcuts like Ctrl+S target the main view).
        if (isMain) focusFrame();
    }, [host, boardId, model, focusFrame, isMain, tabId]);

    // Expose the iframe element to the model (automation focus) and dismiss host
    // overlays on a board click (US-773 C10): a cross-origin board's inner clicks don't
    // bubble to the host (SOP), so the shim posts a `board:interact` ping which we turn
    // into the same `document` mousedown the browser uses to close menus/popovers.
    useEffect(() => {
        if (!host) return;
        const el = iframeRef.current;
        // Track EVERY frame under its own tab id (EPIC-044 / US-858): the model's per-tab
        // `frames` map means a secondary no longer overwrites the main frame's entry, so
        // `browser_*` can target either the main or a chosen secondary frame.
        if (el) model.setIframe(el, tabId);

        const onMessage = (e: MessageEvent) => {
            const d = e.data as
                {
                    __persephone?: string; message?: string; busy?: boolean; content?: string;
                    state?: Record<string, unknown>; partial?: Record<string, unknown>;
                    defaults?: Record<string, unknown>; restorableKeys?: string[];
                    views?: unknown;
                }
                | undefined;
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
            } else if (d.__persephone === "board:setContent") {
                // Content-host board wrote content (EPIC-043). Stash for the echo-guard BEFORE
                // applying, so the host.state push of this same value is skipped.
                const content = typeof d.content === "string" ? d.content : "";
                lastBoardContentRef.current = content;
                (model as BoardContentEditorModel).hostChangeContent?.(content);
            } else if (d.__persephone === "board:save") {
                (model as BoardContentEditorModel).hostSave?.();
            } else if (d.__persephone === "board:setState") {
                model.setSharedState(d.state ?? {});
            } else if (d.__persephone === "board:mergeState") {
                model.mergeSharedState(d.partial ?? {});
            } else if (d.__persephone === "board:stateInit") {
                model.initSharedState(d.defaults ?? {}, d.restorableKeys);
            } else if (d.__persephone === "board:setSecondaryViews") {
                model.setSecondaryViews(d.views);
            }
        };
        window.addEventListener("message", onMessage);

        return () => {
            window.removeEventListener("message", onMessage);
            if (el) model.clearIframe(el, tabId);
            void api.unregisterBoardFrame(model.id, tabId);
        };
    }, [host, model, appendLog, tabId]);

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

    // Focus the board frame when THIS page becomes active (tab / editor switch), mirroring the
    // text editors' focus-on-activation (TextChrome). The 200ms delay matches TextChrome — it lets
    // the page-switch DOM settle before we move focus. Without this, a switched-to board needs a
    // click before frame-level shortcuts (Ctrl+S save) work.
    useEffect(() => {
        if (!isMain) return; // secondary sidebar frames don't grab focus on page activation
        const sub = pagesModel.onFocus.subscribe((pageModel) => {
            if (pageModel !== model.page) return;
            setTimeout(() => focusFrame(), 200);
        });
        return () => sub.unsubscribe();
    }, [model, focusFrame, isMain]);

    // EPIC-043: push host content/language into a content-host board on every change (external
    // reload, other-view edit, host transfer), echo-guarded against the board's own setContent.
    useEffect(() => {
        const chost = model.contentHost;
        if (!host || !chost) return;
        const unsub = chost.state.subscribe(
            (content) => {
                const c = content as string;
                if (c === lastBoardContentRef.current) return; // board's own write — don't echo
                const win = iframeRef.current?.contentWindow;
                if (!win) return;
                const msg: BoardHostContentMsg = {
                    __persephone: "host:content",
                    content: c,
                    language: chost.state.get().language,
                };
                win.postMessage(msg, `board://${host}`);
            },
            (s) => s.content,
        );
        return () => unsub();
    }, [host, model]);

    // EPIC-044: push shared state into this frame on every change (any frame's set/merge/init).
    // No echo-guard — the shim ignores a state:sync whose seq it has already applied.
    useEffect(() => {
        if (!host) return;
        const unsub = model.state.subscribe(
            (sharedState) => {
                const win = iframeRef.current?.contentWindow;
                if (!win) return;
                const msg: BoardStateSyncMsg = {
                    __persephone: "state:sync",
                    state: (sharedState as Record<string, unknown>) ?? {},
                    seq: model.sharedStateSeq,
                };
                win.postMessage(msg, `board://${host}`);
            },
            (s) => s.sharedState,
        );
        return () => unsub();
    }, [host, model]);

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
                    // Delegate clipboard access to the cross-origin board frame. A board is a
                    // trusted local app — it already has filesystem + process access through the
                    // bridge — so blocking the clipboard buys no security; only remote network is
                    // restricted (by the board CSP's `connect-src 'self'`). Without this, Chromium's
                    // Permissions Policy blocks `navigator.clipboard.*` in the (cross-origin) frame.
                    allow="clipboard-read; clipboard-write"
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
                    // `&view=<role>` carries this frame's view role (EPIC-044 / O6) — the shim
                    // reads it from location.search → `persephone.view`. It does NOT affect the
                    // origin/routing, and does NOT collide with the CDP `v=` nonce matcher
                    // (`view=…` contains no `v=` token). `entry` selects the frame's HTML file
                    // (main → index.html; a secondary view → its declared html).
                    src={`board://${host}/${entry}?v=${boardId}&view=${encodeURIComponent(view)}`}
                    onLoad={handleLoad}
                    // No `sandbox` attribute (EPIC-037 C5) — keeps a stable cross-origin
                    // origin so per-board storage works; no preload, no partition.
                    style={{ flex: 1, width: "100%", border: "none", backgroundColor: color.background.default }}
                />
            )}
        </Panel>
    );
}
