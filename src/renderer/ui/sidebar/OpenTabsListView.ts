import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../api/pages";
import { appWindow } from "../../api/window";
import type { IEditorState, WindowPages } from "../../../shared/types";
import { createFileTypeIconElement } from "../../components/icons/icon-elements";
import { ListBoxView } from "../../uikit/ListBox/ListBoxView";
import type { IListBoxItem, ListBoxProps } from "../../uikit/ListBox/types";
import { VanillaView } from "../../uikit/shared/vanilla-view";

export interface OpenTabsListProps {
    onClose?: () => void;
    open?: boolean;
}

interface OpenTabsListItem extends IListBoxItem {
    windowIndex: number;
    page?: Partial<IEditorState>;
}

export class OpenTabsListView extends VanillaView<OpenTabsListProps> {
    private readonly list: ListBoxView<OpenTabsListItem>;
    private readonly onListChange = (item: OpenTabsListItem): void => this.onClick(item);
    private readonly onListActiveChange = (index: number): void => {
        this.activeIndex = index;
        this.updateList();
    };
    private readonly isListItemSelected = (item: OpenTabsListItem): boolean =>
        item.page?.id === pagesModel.activePage?.id;
    private readonly getListItemTooltip = (item: OpenTabsListItem): string | undefined =>
        item.page?.filePath;
    private readonly listProps: ListBoxProps<OpenTabsListItem> = {
        name: "sidebar-open-tabs",
        items: [],
        rowHeight: 22,
        activeIndex: null,
        onChange: this.onListChange,
        onActiveChange: this.onListActiveChange,
        isSelected: this.isListItemSelected,
        getTooltip: this.getListItemTooltip,
        emptyMessage: "no tabs",
        variant: "browse",
    };
    private allWindowsPages: WindowPages[] = [];
    private activeIndex: number | null = null;
    private loadId = 0;
    private duplicateTimer: number | undefined;
    private previousOpen: boolean | undefined;
    private live = true;

    public constructor(props: OpenTabsListProps) {
        const list = new ListBoxView<OpenTabsListItem>({
            name: "sidebar-open-tabs",
            items: [],
            rowHeight: 22,
            emptyMessage: "no tabs",
            variant: "browse",
        });
        super(props, list.root);
        this.list = list;
        this.list.update(this.listProps);
    }

    protected onMount(): void {
        this.child(this.list).mount();
        this.bind(pagesModel.state, (state) => state.pages, () => this.updateList());
        this.previousOpen = this.props.open;
        void this.loadWindowPages();
        this.updateList();
        this.own(() => {
            this.live = false;
            if (this.duplicateTimer !== undefined) window.clearTimeout(this.duplicateTimer);
        });
    }

    protected onUpdate(props: OpenTabsListProps): void {
        if (props.open !== this.previousOpen) {
            this.previousOpen = props.open;
            void this.loadWindowPages();
        }
        this.updateList();
    }

    private async loadWindowPages(): Promise<void> {
        const loadId = ++this.loadId;
        const windowsPages = await api.getWindowPages();
        if (!this.live || loadId !== this.loadId) return;
        this.allWindowsPages = windowsPages;
        this.updateList();
    }

    private updateList(): void {
        const currentWindowIndex = appWindow.windowIndex;
        const state = pagesModel.state.get();
        const currentPages: OpenTabsListItem[] = state.pages.map((page) => {
            const pageState = page.mainEditor?.state.get() ?? { title: page.title };
            const pageData = { ...pageState, id: page.id } as Partial<IEditorState>;
            return this.item(currentWindowIndex, pageData);
        });

        const items: OpenTabsListItem[] = [this.section(currentWindowIndex), ...currentPages];
        const otherWindowsPages = this.allWindowsPages.filter(
            (windowPages) => windowPages.windowIndex !== currentWindowIndex,
        );
        for (const windowPages of otherWindowsPages) {
            items.push(this.section(windowPages.windowIndex));
            items.push(...windowPages.pages.map((descriptor) => {
                const main = descriptor.editors.find((editor) => editor.id === descriptor.mainEditorId);
                const pageState = (main?.state ?? {}) as Partial<IEditorState>;
                return this.item(windowPages.windowIndex, { ...pageState, id: descriptor.id });
            }));
        }

        const pageIds = items.flatMap((item) => item.page?.id ? [item.page.id] : []);
        if (new Set(pageIds).size !== pageIds.length) {
            if (this.duplicateTimer !== undefined) window.clearTimeout(this.duplicateTimer);
            this.duplicateTimer = window.setTimeout(() => {
                this.duplicateTimer = undefined;
                void this.loadWindowPages();
            }, 50);
        }

        if (this.listProps.items === items && this.listProps.activeIndex === this.activeIndex) return;
        this.listProps.items = items;
        this.listProps.activeIndex = this.activeIndex;
        this.list.update(this.listProps);
    }

    private section(windowIndex: number): OpenTabsListItem {
        return {
            value: `window-${windowIndex}`,
            label: `window-${windowIndex}`,
            windowIndex,
            section: true,
        };
    }

    private item(windowIndex: number, page: Partial<IEditorState>): OpenTabsListItem {
        return {
            value: page.id ?? `window-${windowIndex}`,
            label: page.title ?? "",
            iconElement: createFileTypeIconElement({ language: page.language, width: 16, height: 16 }),
            windowIndex,
            page,
        };
    }

    private onClick(item: OpenTabsListItem): void {
        if (!item.page?.id) return;
        if (item.windowIndex === appWindow.windowIndex) {
            pagesModel.showPage(item.page.id);
            return;
        }
        void api.showWindowPage(item.windowIndex, item.page.id);
        this.props.onClose?.();
    }
}
