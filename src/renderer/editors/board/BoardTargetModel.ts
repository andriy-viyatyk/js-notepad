import type { IBrowserTarget, ITargetTab } from "../../automation/types";
import { CdpSession } from "../../automation/CdpSession";
import { BOARD_CDP_TAB } from "../../../ipc/api-types";
import { panelKey } from "../../ui/secondary-views/panel-key";
import { boardSecondaryPanelId, parseBoardSecondaryPanelId } from "./board-secondary";
import type { BoardEditorModel } from "./BoardEditorModel";

/**
 * `IBrowserTarget` adapter for a Board (EPIC-034 / US-730; re-homed onto the
 * `<iframe>` in EPIC-037 / US-773), letting the existing `browser_*` MCP automation
 * tools drive a board's frames.
 *
 * A board has no navigation and no agent-creatable tabs, but it DOES have multiple
 * frames — the main view plus each declared secondary (sidebar) view (EPIC-044 /
 * US-858). Those frames are surfaced through the tab abstraction the interface already
 * provides: `tabs` enumerates the main frame + one tab per declared secondary view,
 * `switchTab` selects which frame subsequent commands drive, and `cdp(tabId?)` /
 * `focusWebview` / `insertText` all honor the active (or an explicit) tab. Each frame
 * has its own CDP registration keyed `${model.id}/${tabId}` (main → `main`, secondary →
 * `board-secondary:<viewId>`), resolved to the specific board frame by its `?v=` nonce.
 *
 * The single-target guarantee the old code enforced (v1 drove only the main frame) is
 * replaced by explicit selection: `activeTabId` defaults to `main`, so nothing changes
 * until an agent selects a secondary view. Because a secondary frame is only attachable
 * while its sidebar panel is mounted, selection (and a readiness gate before every
 * command) auto-expands the panel and WAITS until the frame has registered for CDP — the
 * agent never sees an "iframe not mounted" error.
 *
 * Navigation and add/close-tab throw a clear error — the dispatcher turns it into a
 * JSON-RPC error. The whole iframe-vs-webContents difference stays below this seam (the
 * agent only ever passes `pageId` + a tab index).
 */
const NAV_MSG =
    "Navigation is not supported on board pages — a board is a single fixed document. " +
    "Use the board's own scripts (persephone.execute) to change its content.";
const TAB_MSG =
    "Tabs cannot be created or closed on board pages — a board's frames (its main view + " +
    "declared secondary views) are fixed by its manifest. Use browser_tabs 'select' to switch between them.";

export class BoardTargetModel implements IBrowserTarget {
    constructor(private readonly model: BoardEditorModel) {}

    get id(): string {
        return this.model.id;
    }

    cdp(tabId?: string): CdpSession {
        // Route to the active tab's frame unless an explicit tab is given. The key shape
        // `${model.id}/${tab}` matches the per-frame registration in cdp-service.
        return new CdpSession(`${this.model.id}/${tabId ?? this.model.activeTabId}`);
    }

    focusWebview(tabId?: string): void {
        // Focus the iframe element so keyboard / synthetic input is routed to the target
        // board frame (its contentWindow is cross-origin, so we focus the element, not it).
        this.model.getFrame(tabId ?? this.model.activeTabId)?.focus();
    }

    async insertText(text: string, tabId?: string): Promise<void> {
        // The board frame is cross-origin — the host renderer can't reach its DOM (SOP).
        // Insert at the focused element via the board-frame CDP session instead. The
        // caller (input.ts) has already focused the target element via the same session.
        await this.cdp(tabId).evaluate(`document.execCommand('insertText', false, ${JSON.stringify(text)})`);
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
        // Soft reload = remount the board frames (the existing toolbar Reload /
        // board_refresh path). Re-handshakes the bridge + re-registers CDP on load.
        this.model.reloadBoard();
    }

    get tabs(): ReadonlyArray<ITargetTab> {
        const s = this.model.state.get();
        const defs = s.secondaryViewDefs ?? [];
        const mainTab: ITargetTab = {
            id: BOARD_CDP_TAB,
            url: "board:///index.html",
            title: s.selectedBoard ?? "Board",
            loading: false,
            active: this.model.activeTabId === BOARD_CDP_TAB,
        };
        const secondaryTabs = defs.map<ITargetTab>((d) => {
            const id = boardSecondaryPanelId(d.id);
            return {
                id,
                url: `board:///${d.html ?? "index.html"}?view=${encodeURIComponent(d.id)}`,
                title: d.title ?? d.id,
                // `loading:true` means "declared but not attachable yet" — its sidebar panel
                // is closed, or open but its frame hasn't registered for CDP. switchTab /
                // ensureReady open it and wait on demand.
                loading: !this.model.loadedTabs.has(id),
                active: this.model.activeTabId === id,
            };
        });
        return [mainTab, ...secondaryTabs];
    }

    get activeTab(): ITargetTab | undefined {
        return this.tabs.find((t) => t.active) ?? this.tabs[0];
    }

    addTab(): string {
        throw new Error(TAB_MSG);
    }
    closeTab(): void {
        throw new Error(TAB_MSG);
    }

    /**
     * Select which board frame `browser_*` drives. Selecting the main frame is instant;
     * selecting a secondary view auto-expands its sidebar panel and WAITS until the frame
     * is CDP-attachable, so the command that follows always succeeds (US-858).
     */
    async switchTab(tabId: string): Promise<void> {
        if (tabId === BOARD_CDP_TAB) {
            this.model.activeTabId = BOARD_CDP_TAB;
            return;
        }
        const viewId = parseBoardSecondaryPanelId(tabId);
        const known = viewId != null && (this.model.state.get().secondaryViewDefs ?? []).some((d) => d.id === viewId);
        if (!known) throw new Error(`Unknown board view '${tabId}'.`);
        this.model.activeTabId = tabId;
        await this.mountAndWait(tabId);
    }

    /**
     * Readiness gate the dispatcher awaits before EVERY board command. If the active tab is
     * a secondary view whose frame isn't attachable yet — panel closed, or open but still
     * loading — expand + wait here so the command that follows always succeeds. A no-op for
     * the main tab and for an already-ready secondary (resolves immediately).
     */
    async ensureReady(): Promise<void> {
        const tabId = this.model.activeTabId;
        if (tabId === BOARD_CDP_TAB || this.model.loadedTabs.has(tabId)) return;
        await this.mountAndWait(tabId);
    }

    /**
     * Open + activate the secondary panel (so BoardWebview mounts its frame) and resolve
     * once the frame has registered for CDP. Mirrors how getTarget calls showPage to make a
     * page automatable — a visible-but-expected UI side effect.
     */
    private async mountAndWait(tabId: string): Promise<void> {
        const page = this.model.page;
        page?.setSecondaryViewsState({ open: true });
        page?.setActivePanel(panelKey(this.model.id, tabId));
        await this.waitForLoaded(tabId, 5000);
    }

    /**
     * Resolve once the tab's frame has finished loading + registered for CDP
     * (`model.loadedTabs`), or after `timeoutMs`. Never rejects: on the rare timeout the
     * following CDP command still runs and cdp-service's resolve-and-retry surfaces any
     * genuine failure with a real message.
     */
    private waitForLoaded(tabId: string, timeoutMs: number): Promise<void> {
        return new Promise((resolve) => {
            const start = performance.now();
            const tick = () => {
                if (this.model.loadedTabs.has(tabId) || performance.now() - start > timeoutMs) resolve();
                else setTimeout(tick, 50);
            };
            tick();
        });
    }
}
