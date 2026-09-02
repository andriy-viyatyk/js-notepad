import color from "../../theme/color";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import { LinkActionView, LinkBreadcrumbView, LinkFooterView } from "../link-editor";
import { LinkBodyView } from "../link-editor/LinkBody";
import { BrowserBookmarks } from "./BrowserBookmarks";
import { BrowserSecondaryViewsView } from "./BrowserSecondaryViews";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Splitter/Splitter.css";

export interface BookmarksDrawerProps {
    open: boolean;
    bookmarks: BrowserBookmarks;
    width: number;
    onChangeWidth: (width: number) => void;
    onClose: () => void;
}

export class BookmarksDrawerView extends VanillaView<BookmarksDrawerProps> {
    private readonly panel: HTMLDivElement;
    private readonly panelWrap: HTMLDivElement;
    private readonly splitter: SplitterView;
    private readonly breadcrumb: LinkBreadcrumbView;
    private readonly actions: LinkActionView;
    private readonly secondary: BrowserSecondaryViewsView;
    private readonly body: LinkBodyView;
    private readonly footer: LinkFooterView;
    private readonly backdrop: HTMLDivElement;
    private hasFocusedOpen = false;

    public constructor(props: BookmarksDrawerProps) {
        const root = createPanelElement({ name: "bookmarks-drawer-root", position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 6, direction: "row" });
        super(props, root);
        const backdrop = document.createElement("div"); backdrop.dataset.bookmarksBackdrop = ""; backdrop.style.flex = "1 1 auto"; backdrop.style.backgroundColor = color.background.backdrop; this.backdrop = backdrop;
        this.splitter = this.child(new SplitterView({ name: "bookmarks-splitter", orientation: "vertical", value: props.width, onChange: props.onChangeWidth, side: "after", background: "default", hoverBackground: "light", border: "none" }));
        this.panelWrap = document.createElement("div"); this.panelWrap.dataset.bookmarksPanelWrap = ""; this.panelWrap.style.maxWidth = "90%"; this.panelWrap.style.height = "100%"; this.panelWrap.style.transition = "transform 80ms ease-in-out";
        this.panel = createPanelElement({ name: "bookmarks-panel", direction: "column", background: "default", borderLeft: true, height: "100%", overflow: "hidden" });
        const toolbar = createPanelElement({ name: "bookmarks-toolbar", direction: "row", align: "center", gap: "xs", paddingX: "md", paddingY: "xs", background: "dark", borderBottom: true, shrink: false, minHeight: 32 });
        const editorHost = createPanelElement({ name: "bookmarks-editor-host", direction: "row", flex: true, overflow: "hidden" });
        const content = createPanelElement({ flex: true, overflow: "hidden" });
        const footer = createPanelElement({ name: "bookmarks-footer", direction: "row", align: "center", gap: "xs", paddingX: "md", paddingY: "xs", background: "dark", borderTop: true, shrink: false, minHeight: 22 });
        this.breadcrumb = this.child(new LinkBreadcrumbView({ model: props.bookmarks.linkEditor })); this.actions = this.child(new LinkActionView({ model: props.bookmarks.linkEditor })); this.secondary = this.child(new BrowserSecondaryViewsView({ host: props.bookmarks.panelHost })); this.body = this.child(new LinkBodyView({ model: props.bookmarks.linkEditor })); this.footer = this.child(new LinkFooterView({ model: props.bookmarks.linkEditor }));
        toolbar.append(this.breadcrumb.root, createPanelElement({ flex: true }), this.actions.root); content.append(this.body.root); editorHost.append(this.secondary.root, content); footer.append(this.footer.root); this.panel.append(toolbar, editorHost, footer); this.panelWrap.append(this.panel); root.append(backdrop, this.splitter.root, this.panelWrap);
    }
    protected onMount(): void { this.listen(this.root, "keydown", (event) => { if (event.key === "Escape") this.props.onClose(); }); this.listen(this.backdrop, "click", this.props.onClose); this.splitter.mount(); this.breadcrumb.mount(); this.actions.mount(); this.secondary.mount(); this.body.mount(); this.footer.mount(); this.sync(this.props); }
    protected onUpdate(props: BookmarksDrawerProps): void { this.sync(props); }
    private sync(props: BookmarksDrawerProps): void { this.splitter.update({ name: "bookmarks-splitter", orientation: "vertical", value: props.width, onChange: props.onChangeWidth, side: "after", background: "default", hoverBackground: "light", border: "none" }); this.panelWrap.style.width = `${props.width}px`; this.panelWrap.style.transform = props.open ? "translateX(0)" : "translateX(100%)"; const shouldFocus = props.open && !this.hasFocusedOpen; if (props.open) this.hasFocusedOpen = true; if (!props.open) this.hasFocusedOpen = false; if (props.open && props.width === 0) props.onChangeWidth(Math.round(this.root.offsetWidth * 0.6)); if (shouldFocus) this.panel.focus(); }
}
