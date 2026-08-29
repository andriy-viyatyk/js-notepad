import { TraitTypeId, getTraitDragData, hasTraitDragData, setTraitDragData } from "../../core/traits";
import { ContextMenuEvent } from "../../api/events/events";
import { createIconElement } from "../../uikit/shared/slots";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { PopoverView } from "../../uikit/Popover/PopoverView";
import type { BrowserEditor } from "./BrowserEditor";
import type { BrowserTabData } from "./BrowserEditorModel";
import "./BrowserTabsPanel.css";
import "../../uikit/Panel/Panel.css";

const COMPACT_THRESHOLD = 70;
const CLOSE_BUTTON_THRESHOLD = 100;

interface TabItemProps {
    tab: BrowserTabData; model: BrowserEditor; isActive: boolean; compact: boolean;
    showClose: boolean; isHovered: boolean; groupColorIndex: number;
    onHover?: (anchor: HTMLElement, tabId: string) => void; onLeave?: () => void;
    onContextMenu: (event: MouseEvent, tabId: string) => void;
}

export class TabItemView extends VanillaView<TabItemProps> {
    private readonly favicon = document.createElement("div");
    private readonly title = document.createElement("div");
    private mute: IconButtonView | undefined;
    private close: IconButtonView | undefined;
    private dragEnterCount = 0; private dragging = false; private dropTarget = false;

    public constructor(props: TabItemProps) {
        const root = document.createElement("div"); root.draggable = true; root.dataset.tabItem = "";
        super(props, root); this.favicon.dataset.tabFavicon = ""; this.title.dataset.tabTitle = ""; root.append(this.favicon, this.title);
    }
    protected onMount(): void {
        this.listen(this.root, "click", () => this.props.model.tabs.switchTab(this.props.tab.id));
        this.listen(this.root, "contextmenu", (event) => this.props.onContextMenu(event, this.props.tab.id));
        this.listen(this.root, "dragstart", this.onDragStart); this.listen(this.root, "dragend", this.onDragEnd);
        this.listen(this.root, "dragenter", this.onDragEnter); this.listen(this.root, "dragover", this.onDragOver);
        this.listen(this.root, "dragleave", this.onDragLeave); this.listen(this.root, "drop", this.onDrop);
        this.listen(this.root, "mouseenter", () => this.props.onHover?.(this.root, this.props.tab.id)); this.listen(this.root, "mouseleave", () => this.props.onLeave?.());
        this.sync(this.props);
    }
    protected onUpdate(props: TabItemProps): void { this.sync(props); }
    protected onDispose(): void { if (this.mute) this.releaseChild(this.mute); if (this.close) this.releaseChild(this.close); this.mute = undefined; this.close = undefined; }
    private sync(props: TabItemProps): void {
        this.toggle("data-active", props.isActive); this.toggle("data-compact", props.compact); this.toggle("data-dragging", this.dragging); this.toggle("data-drop-target", this.dropTarget); this.toggle("data-hover-extended", props.isHovered); this.root.dataset.groupColor = String(props.groupColorIndex % 2);
        this.renderFavicon(props.tab.favicon); this.title.textContent = props.tab.pageTitle || props.tab.url || "New Tab"; this.title.hidden = props.compact;
        const needMute = !props.compact && (props.tab.audible || props.tab.muted);
        if (needMute && !this.mute) { this.mute = this.child(new IconButtonView({ name: "tab-mute", size: "sm", icon: props.tab.muted ? "volume-muted" : "volume", title: props.tab.muted ? "Unmute Tab" : "Mute Tab", onClick: (event) => { event.stopPropagation(); props.model.tabs.toggleMute(props.tab.id); } })); this.root.append(this.mute.root); this.mute.mount(); }
        else if (!needMute && this.mute) { this.releaseChild(this.mute); this.mute = undefined; }
        this.mute?.update({ name: "tab-mute", size: "sm", icon: props.tab.muted ? "volume-muted" : "volume", title: props.tab.muted ? "Unmute Tab" : "Mute Tab", onClick: (event) => { event.stopPropagation(); props.model.tabs.toggleMute(props.tab.id); } });
        if (props.showClose && !this.close) { this.close = this.child(new IconButtonView({ name: "tab-close", size: "sm", icon: "close", title: "Close Tab", onClick: (event) => { event.stopPropagation(); props.model.tabs.closeTab(props.tab.id); } })); this.close.root.dataset.tabClose = ""; this.root.append(this.close.root); this.close.mount(); }
        else if (!props.showClose && this.close) { this.releaseChild(this.close); this.close = undefined; }
        this.close?.update({ name: "tab-close", size: "sm", icon: "close", title: "Close Tab", onClick: (event) => { event.stopPropagation(); props.model.tabs.closeTab(props.tab.id); } });
    }
    private renderFavicon(url: string): void { this.favicon.replaceChildren(); const icon = createIconElement("globe"); if (url) { icon.dataset.hidden = ""; const image = document.createElement("img"); image.src = url; image.alt = ""; image.referrerPolicy = "no-referrer"; this.listen(image, "error", () => { delete icon.dataset.hidden; image.remove(); }); this.favicon.append(image); } this.favicon.append(icon); }
    private toggle(name: string, value: boolean): void { if (value) this.root.setAttribute(name, ""); else this.root.removeAttribute(name); }
    private readonly onDragStart = (event: DragEvent): void => { event.stopPropagation(); setTraitDragData(event.dataTransfer, TraitTypeId.BrowserTab, { tabId: this.props.tab.id }); this.dragging = true; this.sync(this.props); };
    private readonly onDragEnd = (): void => { this.dragging = false; this.sync(this.props); };
    private readonly onDragEnter = (event: DragEvent): void => { this.dragEnterCount++; if (hasTraitDragData(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; this.dropTarget = true; this.sync(this.props); } };
    private readonly onDragOver = (event: DragEvent): void => { if (hasTraitDragData(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } };
    private readonly onDragLeave = (): void => { this.dragEnterCount--; if (this.dragEnterCount <= 0) { this.dragEnterCount = 0; this.dropTarget = false; this.sync(this.props); } };
    private readonly onDrop = (event: DragEvent): void => { event.preventDefault(); this.dragEnterCount = 0; this.dropTarget = false; this.sync(this.props); const payload = getTraitDragData(event.dataTransfer); if (!payload || payload.typeId !== TraitTypeId.BrowserTab) return; this.props.model.tabs.moveTab((payload.data as { tabId: string }).tabId, this.props.tab.id); };
}

interface TabExtensionProps {
    tab: BrowserTabData;
    active: boolean;
    model: BrowserEditor;
    onClose: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}

class TabExtensionView extends VanillaView<TabExtensionProps> {
    private readonly title = document.createElement("span"); private mute: IconButtonView | undefined; private readonly close: IconButtonView;
    public constructor(props: TabExtensionProps, host: HTMLElement) { super(props, host); host.dataset.tabExtension = ""; this.title.dataset.part = "title"; this.close = this.child(new IconButtonView({ name: "tab-extension-close", size: "sm", icon: "close", title: "Close Tab", onClick: (event) => { event.stopPropagation(); props.onClose(); } })); }
    protected onMount(): void { this.listen(this.root, "click", () => this.props.model.tabs.switchTab(this.props.tab.id)); this.listen(this.root, "mouseenter", () => this.props.onMouseEnter()); this.listen(this.root, "mouseleave", () => this.props.onMouseLeave()); this.root.append(this.title, this.close.root); this.close.mount(); this.sync(this.props); }
    protected onUpdate(props: TabExtensionProps): void { this.props = props; this.sync(props); }
    protected onDispose(): void { if (this.mute) this.releaseChild(this.mute); this.mute = undefined; }
    private sync(props: TabExtensionProps): void { this.toggle("data-active", props.active); this.title.textContent = props.tab.pageTitle || props.tab.url || "New Tab"; const needMute = props.tab.audible || props.tab.muted; if (needMute && !this.mute) { this.mute = this.child(new IconButtonView({ name: "tab-extension-mute", size: "sm", icon: props.tab.muted ? "volume-muted" : "volume", title: props.tab.muted ? "Unmute Tab" : "Mute Tab", onClick: (event) => { event.stopPropagation(); props.model.tabs.toggleMute(props.tab.id); } })); this.root.insertBefore(this.mute.root, this.close.root); this.mute.mount(); } else if (!needMute && this.mute) { this.releaseChild(this.mute); this.mute = undefined; } this.mute?.update({ name: "tab-extension-mute", size: "sm", icon: props.tab.muted ? "volume-muted" : "volume", title: props.tab.muted ? "Unmute Tab" : "Mute Tab", onClick: (event) => { event.stopPropagation(); props.model.tabs.toggleMute(props.tab.id); } }); }
    private toggle(name: string, value: boolean): void { if (value) this.root.setAttribute(name, ""); else this.root.removeAttribute(name); }
}

export class BrowserTabsPanelView extends VanillaView<{ model: BrowserEditor; tabs: BrowserTabData[]; activeTabId: string; width: number }> {
    private readonly listHost = createPanelElement({ name: "browser-tabs-list", direction: "column", flex: true, overflowY: "auto", overflowX: "hidden" });
    private readonly addButton: IconButtonView; private readonly rows = new Map<HTMLElement, TabItemView>(); private list: KeyedList<BrowserTabData, string, HTMLElement> | undefined;
    private compact = false; private showClose = false; private groupColors = new Map<string, number>(); private hoveredTabId: string | undefined; private closeTimer: ReturnType<typeof setTimeout> | undefined; private preview: PopoverView | undefined; private extension: TabExtensionView | undefined; private addRow: HTMLDivElement | undefined;
    public constructor(props: { model: BrowserEditor; tabs: BrowserTabData[]; activeTabId: string; width: number }) { super(props, createPanelElement({ name: "browser-tabs-root", direction: "column", overflow: "hidden", background: "default", width: "100%", height: "100%" })); this.root.classList.add("browser-tabs-root"); this.addButton = this.child(new IconButtonView({ name: "add-tab-button", size: "sm", icon: "plus", title: "New Tab", onClick: () => props.model.tabs.addTab() })); }
    protected onMount(): void { this.list = new KeyedList(this.listHost, { keyOf: (tab) => tab.id, create: (tab) => { const view = new TabItemView(this.rowProps(tab)); view.mount(); this.rows.set(view.root, view); return view.root; }, update: (element, tab) => this.rows.get(element)?.update(this.rowProps(tab)), remove: (element) => { const view = this.rows.get(element); if (view) { view.dispose(); this.rows.delete(element); } } }); this.root.append(this.listHost); this.addRow = createPanelElement({ name: "add-tab-row", direction: "row", align: "center", paddingX: "xs", height: 28, justify: "start" }, [this.addButton.root]); this.listHost.append(this.addRow); this.addButton.mount(); this.sync(this.props); }
    protected onUpdate(props: { model: BrowserEditor; tabs: BrowserTabData[]; activeTabId: string; width: number }): void { this.sync(props); }
    protected onDispose(): void { if (this.closeTimer) clearTimeout(this.closeTimer); this.disposePreview(); this.list?.dispose(); this.list = undefined; this.rows.clear(); }
    private sync(props: { model: BrowserEditor; tabs: BrowserTabData[]; activeTabId: string; width: number }): void { this.compact = props.width < COMPACT_THRESHOLD; this.showClose = !this.compact && props.width >= CLOSE_BUTTON_THRESHOLD; if (this.addRow) this.addRow.style.justifyContent = this.compact ? "center" : "flex-start"; this.groupColors = new Map(); props.tabs.forEach((tab) => { if (!this.groupColors.has(tab.groupId)) this.groupColors.set(tab.groupId, this.groupColors.size); }); this.list?.update(props.tabs); const hovered = this.hoveredTabId ? props.tabs.find((tab) => tab.id === this.hoveredTabId) : undefined; if (!this.compact || !hovered) this.disposePreview(); else this.extension?.update(this.extensionProps(hovered, props.activeTabId)); }
    private rowProps(tab: BrowserTabData): TabItemProps { return { tab, model: this.props.model, isActive: tab.id === this.props.activeTabId, compact: this.compact, showClose: this.showClose, isHovered: tab.id === this.hoveredTabId, groupColorIndex: this.groupColors.get(tab.groupId) ?? 0, onHover: this.compact ? this.showPreview : undefined, onLeave: this.compact ? this.scheduleClose : undefined, onContextMenu: this.onContextMenu }; }
    private readonly showPreview = (anchor: HTMLElement, tabId: string): void => { this.cancelClose(); this.hoveredTabId = tabId; const tab = this.props.tabs.find((item) => item.id === tabId); if (!tab) return; if (!this.preview) { this.preview = this.child(new PopoverView(this.previewProps(anchor, tab))); this.root.append(this.preview.root); this.preview.mount(); } else { this.preview.update(this.previewProps(anchor, tab)); this.extension?.update(this.extensionProps(tab, this.props.activeTabId)); } };
    private readonly cancelClose = (): void => { if (this.closeTimer) clearTimeout(this.closeTimer); this.closeTimer = undefined; };
    private readonly scheduleClose = (): void => { if (this.closeTimer) clearTimeout(this.closeTimer); this.closeTimer = setTimeout(() => { this.hoveredTabId = undefined; this.disposePreview(); }, 100); };
    private disposePreview(): void { if (this.closeTimer) clearTimeout(this.closeTimer); this.closeTimer = undefined; if (this.preview) { this.releaseChild(this.preview); this.preview = undefined; } this.extension = undefined; this.hoveredTabId = undefined; }
    private previewProps(anchor: HTMLElement, tab: BrowserTabData) { return { name: "tab-preview", open: true, elementRef: anchor, placement: "right-start" as const, offset: [0, -1] as [number, number], contentView: (host: HTMLElement) => { const view = new TabExtensionView(this.extensionProps(tab, this.props.activeTabId), host); this.extension = view; return view; } }; }
    private extensionProps(tab: BrowserTabData, activeTabId: string): TabExtensionProps { return { tab, active: tab.id === activeTabId, model: this.props.model, onClose: () => { this.props.model.tabs.closeTab(tab.id); this.disposePreview(); }, onMouseEnter: this.cancelClose, onMouseLeave: this.scheduleClose }; }
    private readonly onContextMenu = (event: MouseEvent, tabId: string): void => { const context = ContextMenuEvent.fromNativeEvent(event, "browser-tab"); const index = this.props.tabs.findIndex((tab) => tab.id === tabId); context.items.push({ label: "Close Tab", onClick: () => this.props.model.tabs.closeTab(tabId), disabled: this.props.tabs.length <= 1 }, { label: "Close Other Tabs", onClick: () => this.props.model.tabs.closeOtherTabs(tabId), disabled: this.props.tabs.length <= 1 }, { label: "Close Tabs Below", onClick: () => this.props.model.tabs.closeTabsBelow(tabId), disabled: index >= this.props.tabs.length - 1 }); };
}
