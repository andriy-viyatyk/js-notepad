import type { IBrowserTarget, ITargetTab } from "../../automation/types";
import { CdpSession } from "../../automation/CdpSession";
import { BOARD_CDP_TAB } from "../../../ipc/api-types";
import type { BoardEditorModel } from "./BoardEditorModel";

/**
 * `IBrowserTarget` adapter for a Board (EPIC-034 / US-730), letting the
 * existing `browser_*` MCP automation tools drive a board's webview.
 *
 * A board is a single fixed `board:///index.html` document with no tabs and no
 * navigation, so only the page-interaction surface is real: `cdp()` (snapshot /
 * click / type / evaluate over the board's registered webContents), `focusWebview`
 * / `insertText` (the live `<webview>` element), and `reload`. Navigation and tab
 * methods throw a clear error — the dispatcher turns it into a JSON-RPC error.
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
        this.model.currentWebview?.focus();
    }

    async insertText(text: string): Promise<void> {
        const wv = this.model.currentWebview;
        if (wv) {
            wv.focus();
            await wv.insertText(text);
        }
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
        this.model.currentWebview?.reload();
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
