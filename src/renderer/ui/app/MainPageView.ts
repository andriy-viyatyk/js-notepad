import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { openMenu, type MenuHandle } from "../../uikit/Menu/attach-menu";
import type { MenuItem } from "../../uikit/Menu/types";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { themeState } from "../../theme/theme-state";
import { app } from "../../api/app";
import { autoloadService } from "../../api/autoload-service";
import { mnemeStatusModel } from "../../api/mneme-status";
import { pagesModel } from "../../api/pages";
import { showMcpRequestLog } from "../../api/mcp-handler";
import { errMessage } from "../../../shared/utils";
import { PageTabsView } from "../tabs/PageTabsView";
import { MenuBarView } from "../sidebar/MenuBarView";
import { PagesView } from "./PagesView";
import "./MainPage.css";

const SNIP_MENU_ITEMS: MenuItem[] = [
    { label: "Snip Screen", icon: createIconElement("snip"), onClick: (): void => { void runSnip(true); } },
    { label: "Snip Persephone", icon: createIconElement("snip"), onClick: (): void => { void runSnip(false); } },
];

async function runSnip(hideWindows: boolean): Promise<void> {
    try {
        const dataUrl = await app.shell.startScreenSnip(hideWindows);
        if (!dataUrl) return;
        const blob = await (await fetch(dataUrl)).blob();
        const blobUrl = URL.createObjectURL(blob);
        await pagesModel.openImageInNewTab(blobUrl, "Snip");
    } catch (error) {
        app.ui.notify(`Snip failed: ${errMessage(error)}`, "error");
    }
}

interface MainPageState {
    isMaximized: boolean;
    zoomLevel: number;
    menuBarOpen: boolean;
    mcpRunning: boolean;
    mcpClientCount: number;
}

export class MainPageView extends VanillaView<object> {
    private readonly header = document.createElement("div");
    private readonly pagesContainer = document.createElement("div");
    private readonly pageTabs: PageTabsView;
    private readonly pages: PagesView;
    private readonly menuBar: MenuBarView;
    private readonly autoloadButton: IconButtonView;
    private readonly autoloadWrap = document.createElement("span");
    private readonly zoomButton = document.createElement("button");
    private readonly toggleWindowButton = document.createElement("button");
    private readonly statusIndicators = document.createElement("div");
    private readonly mnemeIndicator = document.createElement("span");
    private readonly mcpIndicator = document.createElement("span");
    private readonly snipButton = document.createElement("button");
    private readonly toggleMenuBar = (): void => app.window.toggleMenuBar();
    private snipMenu: MenuHandle | undefined;

    public constructor(props: object) {
        super(props);
        this.root.className = "app-root";
        this.pageTabs = this.child(new PageTabsView({}));
        this.pages = this.child(new PagesView({}));
        this.menuBar = this.child(new MenuBarView({ open: false, onClose: this.toggleMenuBar }));
        this.autoloadButton = this.child(new IconButtonView({ name: "autoload-reload", size: "sm", icon: "refresh", title: "Application scripts need to be reloaded. Click to reload.", onClick: () => autoloadService.loadScripts() }));
    }

    protected onMount(): void {
        this.buildHeader();
        const content = document.createElement("div");
        content.className = "app-content";
        content.dataset.name = "app-content";
        this.pagesContainer.className = "pages-container";
        this.pagesContainer.dataset.name = "pages-container";
        this.pagesContainer.append(this.pages.root);
        content.append(this.pagesContainer, this.menuBar.root);
        this.root.append(this.header, content);
        this.pageTabs.mount();
        this.pages.mount();
        this.menuBar.mount();
        this.autoloadWrap.className = "autoload-reload";
        this.autoloadWrap.append(this.autoloadButton.root);
        this.autoloadButton.mount();
        this.bind(app.window.state, (state): MainPageState => state, (state) => this.updateIndicators(state));
        this.bind(autoloadService.state, (state) => state.needsReload, (visible) => { this.autoloadWrap.style.display = visible ? "" : "none"; });
        this.bind(
            mnemeStatusModel.state,
            (state) => ({ enabled: state.enabled, running: state.running, modelReady: state.modelReady }),
            (state) => this.updateMneme(state),
        );
        this.bindMenuGlyphToTheme();
        this.own(() => this.snipMenu?.dispose());
    }

    protected onDispose(): void {
        this.snipMenu?.dispose();
        this.snipMenu = undefined;
    }

    /** Retained so the theme binding can rebuild its glyph — see `bindMenuGlyphToTheme`. */
    private menuButton: HTMLButtonElement | undefined;

    private buildHeader(): void {
        this.header.className = "app-header";
        this.header.dataset.name = "app-header";
        this.menuButton = this.createButton("persephone-menu", "app-button", "Menu", createIconElement("persephone"), () => app.window.toggleMenuBar());
        this.header.append(this.menuButton, this.pageTabs.root);
        this.header.append(createPanelElement({ name: "app-header-spacer", flex: 1, minWidth: 40 }));
        this.autoloadWrap.className = "autoload-reload";
        this.header.append(this.autoloadWrap, this.buildZoomButton(), this.createSystemButton("window-minimize", createIconElement("window-minimize"), "Minimize", () => app.window.minimize()), this.toggleWindowButton, this.createSystemButton("window-close", createIconElement("close"), "Close", () => app.window.close()));
        this.toggleWindowButton.className = "system-button darkBackground";
        this.toggleWindowButton.type = "button";
        this.toggleWindowButton.dataset.name = "window-toggle";
        this.listen(this.toggleWindowButton, "click", () => app.window.toggleWindow());
        this.statusIndicators.className = "status-indicators";
        this.statusIndicators.dataset.name = "status-indicators";
        this.snipButton.type = "button";
        this.snipButton.dataset.name = "header-snip-button";
        this.snipButton.className = "snip-indicator";
        this.snipButton.title = "Snip screen or Persephone window";
        this.snipButton.append(createIconElement("more-horiz", { width: 28, height: 28 }));
        this.listen(this.snipButton, "click", () => this.toggleSnipMenu());
        this.statusIndicators.append(this.snipButton, this.mnemeIndicator, this.mcpIndicator);
        this.header.append(this.statusIndicators);
    }

    /**
     * `PersephoneIcon` is the one icon whose glyph depends on the theme: its DOM builder bakes the
     * light/dark background in at build time (`themeState.get()`), whereas the previous component read
     * `themeState.use()` and refreshed on a flip. A builder that returns a detached element cannot own a
     * subscription without leaking it, so keeping the glyph current is the owner's job —
     * this view rebuilds it. Without this, switching theme left the app-menu glyph on the previous
     * background until something else rebuilt the header (EPIC-064 E6-6 concern 1).
     */
    private bindMenuGlyphToTheme(): void {
        this.bind(themeState, (state) => state.isDark, () => {
            const button = this.menuButton;
            if (!button) return;
            button.replaceChildren(createIconElement("persephone"));
        });
    }

    private createButton(name: string, className: string, title: string, icon: SVGElement, onClick: () => void): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.name = name;
        button.className = className;
        button.title = title;
        button.append(icon);
        this.listen(button, "click", onClick);
        return button;
    }

    private createSystemButton(name: string, icon: SVGElement, title: string, onClick: () => void): HTMLButtonElement {
        return this.createButton(name, `system-button darkBackground${name === "window-close" ? " close-button" : ""}`, title, icon, onClick);
    }

    private buildZoomButton(): HTMLButtonElement {
        this.zoomButton.type = "button";
        this.zoomButton.dataset.name = "zoom-indicator";
        this.zoomButton.className = "zoom-indicator";
        this.zoomButton.title = "Reset Zoom";
        this.listen(this.zoomButton, "click", () => app.window.resetZoom());
        return this.zoomButton;
    }

    private updateIndicators(state: MainPageState): void {
        this.zoomButton.classList.toggle("visible", state.zoomLevel !== 0);
        this.zoomButton.textContent = `${Math.round(Math.pow(1.2, state.zoomLevel) * 100)}%`;
        this.toggleWindowButton.replaceChildren(createIconElement(state.isMaximized ? "window-restore" : "window-maximize"));
        this.toggleWindowButton.title = state.isMaximized ? "Restore" : "Maximize";
        this.menuBar.update({ open: state.menuBarOpen, onClose: this.toggleMenuBar });
        this.mcpIndicator.style.display = state.mcpRunning ? "" : "none";
        this.mcpIndicator.dataset.name = "mcp-indicator";
        this.mcpIndicator.className = "mcp-indicator";
        this.mcpIndicator.title = state.mcpClientCount > 0 ? `MCP is active, ${state.mcpClientCount} active connection${state.mcpClientCount !== 1 ? "s" : ""} — click to view request log` : "MCP server is running — click to view request log";
        this.mcpIndicator.onclick = () => showMcpRequestLog();
        if (state.mcpClientCount > 0) {
            const count = document.createElement("span");
            count.className = "mcp-count";
            count.textContent = String(state.mcpClientCount);
            this.mcpIndicator.replaceChildren(count, document.createTextNode(" MCP"));
        } else {
            const dot = document.createElement("span");
            dot.className = "mcp-dot";
            this.mcpIndicator.replaceChildren(dot, document.createTextNode(" MCP"));
        }
    }

    private updateMneme(state: { enabled: boolean; running: boolean; modelReady: boolean }): void {
        this.mnemeIndicator.style.display = state.enabled ? "" : "none";
        this.mnemeIndicator.dataset.name = "mneme-indicator";
        this.mnemeIndicator.className = "mneme-indicator";
        const dotClass = state.running ? (state.modelReady ? "success" : "warning") : "neutral";
        this.mnemeIndicator.title = state.running ? (state.modelReady ? "Mneme active — vector memory ready. Click to manage." : "Mneme is running without an embedding model — semantic search unavailable (text/grep fallback only). Click to fix in Mneme settings.") : "Mneme is enabled but not running. Click to manage.";
        this.mnemeIndicator.onclick = () => pagesModel.showMnemeConfigPage();
        const dot = document.createElement("span");
        dot.className = `mneme-dot ${dotClass}`;
        this.mnemeIndicator.replaceChildren(dot, document.createTextNode(" Mneme"));
    }

    private toggleSnipMenu(): void {
        if (this.snipMenu) {
            this.snipMenu.dispose();
            this.snipMenu = undefined;
            return;
        }
        this.snipMenu = openMenu(this.snipButton, { name: "header-snip", items: SNIP_MENU_ITEMS, placement: "bottom-end", onClose: () => { this.snipMenu = undefined; } });
    }
}
