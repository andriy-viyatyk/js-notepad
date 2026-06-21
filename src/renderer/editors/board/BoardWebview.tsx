import { useEffect, useRef, useState } from "react";
import { Panel } from "../../uikit/Panel";
import { api } from "../../../ipc/renderer/api";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { settings } from "../../api/settings";
import { fpJoin } from "../../core/utils/file-path";
import { BoardBridgeChannel } from "../../../ipc/board-bridge-channels";
import { BOARD_TOKEN_VARS, computeBoardThemePalette } from "./board-theme";
import type { BoardEditorModel } from "./BoardEditorModel";

// Exposed by the main preload (src/preload.ts) — file:// URL to the built board preload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BOARD_PRELOAD_URL = (window as any).boardPreloadUrl as string;

/**
 * Locked-down host for a single board (EPIC-034 / US-723). Serves the board's own
 * files over the `board://` scheme from a dedicated ephemeral `board-<uuid>` session
 * partition, with the webview sandboxed (no Node) + `contextIsolation` and a CSP that
 * forbids remote. The `persephone` bridge (US-724) is injected via the board preload.
 *
 * Lifecycle is view-driven: the parent keys this component by board name, so switching
 * boards unmounts (→ unregister the protocol + clear the ephemeral session) and remounts
 * with a fresh partition. (US-720 process reaping + US-726 `ui.log` hook the same teardown.)
 */
export function BoardWebview({ model, boardRoot }: { model: BoardEditorModel; boardRoot: string }) {
    const partition = useRef(`board-${crypto.randomUUID()}`).current;
    const webviewRef = useRef<Electron.WebviewTag | null>(null);
    // The board:// handler must exist on the partition before the webview navigates,
    // so render the <webview src> only after registration resolves.
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let live = true;
        // Pass the current theme palette + static metric tokens (US-725) into
        // registration; the preload reads them back synchronously via getContext and
        // applies `--p-*` before first paint. Gated before navigation by `ready`.
        void api
            .registerBoardProtocol(partition, boardRoot, computeBoardThemePalette(), BOARD_TOKEN_VARS)
            .then(() => {
                if (live) setReady(true);
            });
        return () => {
            live = false;
            void api.unregisterBoardProtocol(partition);
        };
    }, [partition, boardRoot]);

    // Log board load failures to the per-board ui.log (+ toast) so an author/agent
    // can review why a board won't render (EPIC-034 / US-726).
    useEffect(() => {
        if (!ready) return;
        const wv = webviewRef.current;
        if (!wv) return;
        const onFail = (e: Electron.DidFailLoadEvent) => {
            if (e.errorCode === -3) return; // ERR_ABORTED — superseded navigation, not a real failure
            void fs.append(
                fpJoin(boardRoot, "ui.log"),
                `[${new Date().toISOString()}] [error] board load failed: ${e.errorCode} ${e.errorDescription} ${e.validatedURL}\n`,
            );
            ui.notify(`Board failed to load: ${e.errorDescription || e.errorCode}`, "error");
        };
        wv.addEventListener("did-fail-load", onFail);
        return () => {
            wv.removeEventListener("did-fail-load", onFail);
        };
    }, [ready, boardRoot]);

    // Register the board's webContents for CDP so the browser_* MCP automation
    // tools can drive it (EPIC-034 / US-730). Keyed by the editor id in main;
    // re-keying on board switch/reload unmounts (unregister + clear) then remounts
    // (re-register the fresh webContents under the same key).
    useEffect(() => {
        if (!ready) return;
        const wv = webviewRef.current;
        if (!wv) return;
        const onReady = () => {
            model.setWebview(wv);
            void api.registerBoardWebContents(model.id, wv.getWebContentsId());
        };
        wv.addEventListener("dom-ready", onReady);
        return () => {
            wv.removeEventListener("dom-ready", onReady);
            model.clearWebview(wv);
            void api.unregisterBoardWebContents(model.id);
        };
    }, [ready, model]);

    // Dismiss any open Persephone overlay (context menu, popup) when focus moves
    // into the board guest — clicking inside the webview doesn't bubble a DOM
    // event to the host, so the host's outside-click dismissal never fires.
    // Mirror the Browser editor: on webview focus, dispatch a synthetic mousedown
    // on document.body to drive the overlay outside-click teardown.
    useEffect(() => {
        if (!ready) return;
        const wv = webviewRef.current;
        if (!wv) return;
        const handleFocus = () => {
            document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        };
        wv.addEventListener("focus", handleFocus);
        return () => wv.removeEventListener("focus", handleFocus);
    }, [ready]);

    // Push live color updates to the guest on theme switch (metrics never change).
    useEffect(() => {
        const sub = settings.onChanged.subscribe(({ key }) => {
            if (key !== "theme") return;
            const palette = computeBoardThemePalette();
            // Refresh the palette stored in main FIRST, so a guest that reloads after
            // this switch reads the new theme from getContext (otherwise it paints the
            // registration-time theme). Then push the live update to the running guest.
            void api.updateBoardTheme(palette);
            try {
                webviewRef.current?.send(BoardBridgeChannel.themeChanged, palette);
            } catch {
                // Webview not ready yet — the initial theme is delivered via getContext.
            }
        });
        return () => sub.dispose();
    }, []);

    return (
        <Panel direction="column" flex={1} width="100%" height={0}>
            {ready && (
                <webview
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ref={webviewRef as any}
                    src="board:///index.html"
                    partition={partition}
                    preload={BOARD_PRELOAD_URL}
                    // Lockdown: contextIsolation + sandbox ON. Node integration is OFF —
                    // the `nodeintegration` attribute is deliberately absent (default off);
                    // `allowpopups` is absent too.
                    webpreferences="contextIsolation=yes,sandbox=yes"
                    style={{ flex: 1, width: "100%", border: "none" }}
                />
            )}
        </Panel>
    );
}
