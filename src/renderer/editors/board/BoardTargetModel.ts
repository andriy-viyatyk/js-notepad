import type { IBrowserTarget, ITargetTab } from "../../automation/types";
import { CdpSession } from "../../automation/CdpSession";
import { BOARD_CDP_TAB } from "../../../ipc/api-types";
import type { BoardEditorModel } from "./BoardEditorModel";

/**
 * `IBrowserTarget` adapter for a Board (EPIC-034 / US-730; re-homed onto the
 * `<iframe>` in EPIC-037 / US-773), letting the existing `browser_*` MCP automation
 * tools drive a board's frame.
 *
 * A board is a single fixed `board://<host>/index.html` document with no tabs and no
 * navigation, so only the page-interaction surface is real:
 *  • `cdp()` — a session keyed `${id}/${BOARD_CDP_TAB}` that main routes to the board
 *    FRAME (not the host's own renderer) — snapshot / click / type / evaluate;
 *  • `focusWebview()` — focus the `<iframe>` element so keyboard/input reaches it;
 *  • `insertText()` — insert at the focused element via the board-frame CDP session
 *    (`document.execCommand`), since the cross-origin frame can't be touched directly;
 *  • `reload()` — remount via `reloadBoard()` (the toolbar Reload / `board_refresh` path).
 * Navigation and tab methods throw a clear error — the dispatcher turns it into a
 * JSON-RPC error. The whole iframe-vs-webContents difference stays below this seam
 * (the agent only ever passes `pageId`).
 */
const NAV_MSG =
    "Navigation is not supported on board pages — a board is a single fixed document. " +
    "Use the board's own scripts (persephone.execute) to change its content.";
const TAB_MSG = "Tabs are not supported on board pages.";

export class BoardTargetModel implements IBrowserTarget {
    constructor(private readonly model: BoardEditorModel) {}

    get id(): string {
        return this.model.id;
    }

    cdp(): CdpSession {
        return new CdpSession(`${this.model.id}/${BOARD_CDP_TAB}`);
    }

    focusWebview(): void {
        // Focus the iframe element so keyboard / synthetic input is routed to the board
        // frame (its contentWindow is cross-origin, so we focus the element, not it).
        this.model.currentIframe?.focus();
    }

    async insertText(text: string): Promise<void> {
        // The board frame is cross-origin — the host renderer can't reach its DOM (SOP).
        // Insert at the focused element via the board-frame CDP session instead. The
        // caller (input.ts) has already focused the target element via the same session.
        await this.cdp().evaluate(`document.execCommand('insertText', false, ${JSON.stringify(text)})`);
    }

    navigate(): void {
        throw new Error(NAV_MSG);
    }
    back(): void {
        throw new Error(NAV_MSG);
    }
    forward(): void {
        throw new Error(NAV_MSG);
    }
    reload(): void {
        // Soft reload = remount the board frame (the existing toolbar Reload /
        // board_refresh path). Re-handshakes the bridge + re-registers CDP on load.
        this.model.reloadBoard();
    }

    get tabs(): ReadonlyArray<ITargetTab> {
        return [
            {
                id: BOARD_CDP_TAB,
                url: "board:///index.html",
                title: this.model.state.get().selectedBoard ?? "Board",
                loading: false,
                active: true,
            },
        ];
    }

    get activeTab(): ITargetTab | undefined {
        return this.tabs[0];
    }

    addTab(): string {
        throw new Error(TAB_MSG);
    }
    closeTab(): void {
        throw new Error(TAB_MSG);
    }
    switchTab(): void {
        throw new Error(TAB_MSG);
    }
}
