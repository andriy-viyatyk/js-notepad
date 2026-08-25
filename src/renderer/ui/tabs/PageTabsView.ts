import { app } from "../../api/app";
import { pagesModel } from "../../api/pages";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { fpBasename } from "../../core/utils/file-path";
import { createBoardGlyphElement } from "../../editors/board/board-glyph-element";
import { subscribeBoardIconChanges } from "../../editors/board/board-icon-cache";
import { isTextFileModel } from "../../editors/text";
import type { EditorOrHost } from "../../editors/base";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { SplitButtonView } from "../../uikit/SplitButton/SplitButtonView";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { MenuItem } from "../../uikit/Menu/types";
import { getCreatableItems } from "../sidebar/tools-editors-registry";
import { decodePin, getPinnedStrings } from "../sidebar/pinned-items";
import { minTabWidth, pinnedTabEncryptedWidth, pinnedTabWidth } from "./PageTab";
import { PageTabView } from "./PageTabView";
import type { PageModel } from "../../api/pages/PageModel";
import "./PageTabs.css";

interface TabProjection {
    pages: PageModel[];
    activeId: string | undefined;
}

interface PageLayoutSubscription {
    page: PageModel;
    editor: EditorOrHost | null;
    unsubscribe: () => void;
}

export class PageTabsView extends VanillaView<object> {
    private readonly wrapper = document.createElement("div");
    private readonly scrollLeftButton: IconButtonView;
    private readonly scrollRightButton: IconButtonView;
    private readonly addButton: SplitButtonView;
    private readonly tabViews = new WeakMap<HTMLElement, PageTabView>();
    private readonly tabs: KeyedList<PageModel, string, HTMLElement>;
    private readonly pageLayoutSubscriptions = new Map<string, PageLayoutSubscription>();
    private resizeObserver: ResizeObserver | undefined;
    private showScrollButtons = false;
    private currentPages: PageModel[] = [];

    public constructor(props: object) {
        super(props);
        this.wrapper.className = "tabs-wrapper";
        this.wrapper.dataset.name = "page-tabs-wrapper";
        this.scrollLeftButton = new IconButtonView({
            name: "page-tabs-scroll-left",
            size: "sm",
            icon: "arrow-left",
            onClick: () => this.scrollLeft(),
        });
        this.scrollRightButton = new IconButtonView({
            name: "page-tabs-scroll-right",
            size: "sm",
            icon: "arrow-right",
            onClick: () => this.scrollRight(),
        });
        this.addButton = new SplitButtonView({
            name: "page-tabs-add",
            size: "md",
            title: "Add Page (Ctrl+N)",
            icon: "plus",
            onClick: () => pagesModel.addEmptyPage(),
            menuTitle: "New editor page",
            items: [],
        });
        this.tabs = new KeyedList<PageModel, string, HTMLElement>(this.wrapper, {
            keyOf: (page) => page.id,
            create: (page) => this.createTab(page),
            update: (element, page) => this.updateTab(element, page),
            remove: (element) => this.removeTab(element),
        });
    }

    protected onMount(): void {
        this.root.dataset.type = "page-tabs";
        this.root.dataset.name = "page-tabs";
        this.root.className = "page-tabs";
        this.root.append(this.wrapper, this.addButton.root);

        this.child(this.scrollLeftButton).mount();
        this.child(this.scrollRightButton).mount();
        this.child(this.addButton).mount();
        this.listen(this.wrapper, "wheel", (event) => this.handleWheel(event), { passive: false });
        this.resizeObserver = new ResizeObserver(() => this.checkScrollButtons());
        this.resizeObserver.observe(this.wrapper);
        this.own(() => this.resizeObserver?.disconnect());
        this.own(() => this.tabs.dispose());
        this.own(() => {
            for (const subscription of this.pageLayoutSubscriptions.values()) subscription.unsubscribe();
            this.pageLayoutSubscriptions.clear();
        });
        const settingsSubscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "browser-profiles" || key === "pinned-editors") this.updateAddMenu();
        });
        this.own(() => settingsSubscription.dispose());
        this.own(subscribeBoardIconChanges(() => this.updateAddMenu()));
        this.bind(
            pagesModel.state,
            (state): TabProjection => ({
                pages: state.pages,
                activeId: state.ordered[state.ordered.length - 1]?.id,
            }),
            (projection) => this.updateTabs(projection),
        );
        this.updateAddMenu();
        this.checkScrollButtons();
    }

    protected onUpdate(): void {
        this.updateAddMenu();
    }

    private createTab(page: PageModel): HTMLElement {
        const view = new PageTabView({ model: page, pinnedLeft: this.pinnedLeft(page, this.currentPages) });
        this.tabViews.set(view.root, view);
        this.child(view).mount();
        return view.root;
    }

    private updateTab(element: HTMLElement, page: PageModel): void {
        this.tabViews.get(element)?.update({
            model: page,
            pinnedLeft: this.pinnedLeft(page, this.currentPages),
        });
    }

    private removeTab(element: HTMLElement): void {
        const view = this.tabViews.get(element);
        if (!view) return;
        view.dispose();
        this.tabViews.delete(element);
    }

    private updateTabs(projection: TabProjection): void {
        this.currentPages = projection.pages;
        this.syncPageLayoutSubscriptions(projection.pages);
        this.tabs.update(projection.pages);
        this.checkScrollButtons();
        this.scrollToActive(projection.activeId);
    }

    private refreshTabLayout(): void {
        const state = pagesModel.state.get();
        this.currentPages = state.pages;
        this.syncPageLayoutSubscriptions(state.pages);
        this.tabs.update(state.pages);
        this.checkScrollButtons();
    }

    private syncPageLayoutSubscriptions(pages: readonly PageModel[]): void {
        const presentIds = new Set(pages.map((page) => page.id));
        for (const [pageId, subscription] of this.pageLayoutSubscriptions) {
            if (presentIds.has(pageId)) continue;
            subscription.unsubscribe();
            this.pageLayoutSubscriptions.delete(pageId);
        }
        for (const page of pages) {
            const editor = page.mainEditor;
            const previous = this.pageLayoutSubscriptions.get(page.id);
            if (previous?.page === page && previous.editor === editor) continue;
            previous?.unsubscribe();
            const pageUnsubscribe = page.state.subscribe(() => this.refreshTabLayout());
            const editorUnsubscribe = editor?.state.subscribe(() => this.refreshTabLayout());
            this.pageLayoutSubscriptions.set(page.id, {
                page,
                editor,
                unsubscribe: () => {
                    pageUnsubscribe();
                    editorUnsubscribe?.();
                },
            });
        }
    }

    private pinnedLeft(page: PageModel, pages: readonly PageModel[]): number | undefined {
        if (!page.pinned) return undefined;
        let left = 0;
        for (const candidate of pages) {
            if (candidate === page) break;
            if (!candidate.pinned) continue;
            const editor = candidate.mainEditor;
            const encrypted = Boolean(
                editor && isTextFileModel(editor) && (editor.encrypted || editor.decrypted),
            );
            left += (encrypted ? pinnedTabEncryptedWidth : pinnedTabWidth) + 2;
        }
        return left;
    }

    private handleWheel(event: WheelEvent): void {
        if (this.wrapper.scrollWidth <= this.wrapper.clientWidth) return;
        event.preventDefault();
        this.wrapper.scrollLeft += event.deltaY;
    }

    private checkScrollButtons(): void {
        const next = this.wrapper.scrollWidth > this.wrapper.clientWidth;
        if (next === this.showScrollButtons) return;
        this.showScrollButtons = next;
        if (next) {
            this.root.insertBefore(this.scrollLeftButton.root, this.wrapper);
            this.root.insertBefore(this.scrollRightButton.root, this.addButton.root);
        } else {
            this.scrollLeftButton.root.remove();
            this.scrollRightButton.root.remove();
        }
    }

    private scrollLeft(): void {
        this.wrapper.scrollBy({ left: -minTabWidth, behavior: "smooth" });
    }

    private scrollRight(): void {
        this.wrapper.scrollBy({ left: minTabWidth, behavior: "smooth" });
    }

    private scrollToActive(activeId: string | undefined): void {
        // Resolve by page id, NOT by querying `[data-active]`. Each `PageTabView` writes its own
        // `data-active` from its own binding, so at this point the DOM can still carry the
        // OUTGOING tab's attribute — querying it scrolled the strip to the previously active tab.
        if (!activeId) return;
        const activeTab = this.tabs.get(activeId);
        if (!activeTab) return;
        // A pinned tab is `position: sticky`, so it is never scrolled out of view.
        if (activeTab.hasAttribute("data-pinned")) return;

        // `scrollIntoView` cannot express this. The pinned tabs are sticky at the strip's left
        // edge, so the leftmost `pinnedInset` pixels of the scrollport are permanently covered by
        // them. `inline: "nearest"` aligns the target's left edge to the scrollport's left edge,
        // which parks it BEHIND the pinned tabs — the tab is technically scrolled in but still
        // invisible, and the user has to nudge the strip further. `inline: "center"` happened to
        // clear the pinned block, which is why this was latent until the options changed.
        const wrapper = this.wrapper;
        const inset = this.pinnedInset();

        // Measure against the wrapper's own box, NOT `offsetLeft`. Neither the strip nor the
        // wrapper is positioned, so `offsetParent` resolves to `.app-header` and `offsetLeft`
        // includes everything to the left of the tab strip in the header — which inflates the
        // target and leaves the tab's left edge cut off. Client rects are relative to the
        // viewport, so the difference is exactly the tab's position within the scrollport.
        const wrapperLeft = wrapper.getBoundingClientRect().left;
        const tabRect = activeTab.getBoundingClientRect();
        const leftInPort = tabRect.left - wrapperLeft;
        const rightInPort = tabRect.right - wrapperLeft;

        let delta = 0;
        if (leftInPort < inset) delta = leftInPort - inset;
        else if (rightInPort > wrapper.clientWidth) delta = rightInPort - wrapper.clientWidth;
        else return;

        const maxScroll = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
        const target = Math.min(maxScroll, Math.max(0, wrapper.scrollLeft + delta));
        if (target === wrapper.scrollLeft) return;
        wrapper.scrollTo({ left: target, behavior: "smooth" });
    }

    /**
     * Width of the sticky pinned block — the permanently obscured left inset of the scrollport.
     *
     * Measured from the last pinned tab's right edge rather than summed from
     * `pinnedTabWidth`/`pinnedTabEncryptedWidth`. Those constants describe the layout `width`, not
     * the rendered outer width: each tab adds 1px borders and 2px horizontal padding, so the
     * arithmetic under-reported the real inset by ~4px per tab and left the target tab clipped
     * behind the pinned block. Reading the last stuck tab's right edge is exact and needs no
     * knowledge of the column gap.
     */
    private pinnedInset(): number {
        const pinnedTabs = this.wrapper.querySelectorAll<HTMLElement>(
            '[data-type="page-tab"][data-pinned]',
        );
        const last = pinnedTabs[pinnedTabs.length - 1];
        if (!last) return 0;
        return Math.max(0, last.getBoundingClientRect().right - this.wrapper.getBoundingClientRect().left);
    }

    private updateAddMenu(): void {
        const allItems = getCreatableItems(settings.get("browser-profiles"));
        const items: MenuItem[] = [];
        for (const stored of getPinnedStrings()) {
            const ref = decodePin(stored);
            if (ref.kind === "editor") {
                const item = allItems.find((candidate) => candidate.id === ref.id);
                if (item) {
                    // Pinned items are also displayed in the sidebar rail. Clone native icons so
                    // opening this menu cannot move the rail's single-use DOM node to the menu.
                    const icon = item.icon instanceof Node ? item.icon.cloneNode(true) : item.icon;
                    items.push({ label: item.label, icon, onClick: item.create });
                }
            } else {
                const root = ref.root;
                items.push({
                    label: fpBasename(root),
                    icon: createBoardGlyphElement(root),
                    onClick: () => {
                        void app.events.openRawLink.sendAsync(
                            createLinkData(encodePersephoneBoardLink(root)),
                        );
                    },
                });
            }
        }
        items.push({
            label: "Show All…",
            startGroup: true,
            onClick: () => void pagesModel.showToolsHubPage(),
        });
        this.addButton.update({
            name: "page-tabs-add",
            size: "md",
            title: "Add Page (Ctrl+N)",
            icon: "plus",
            onClick: () => pagesModel.addEmptyPage(),
            menuTitle: "New editor page",
            items,
        });
    }
}
