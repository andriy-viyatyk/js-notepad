import { useCallback, useMemo } from "react";
import { ListBox, LIST_ITEM_KEY } from "../../uikit";
import { TraitSet, traited } from "../../core/traits/traits";
import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../api/pages";
import { appWindow } from "../../api/window";
import { IEditorState, WindowPages } from "../../../shared/types";
import { LanguageIcon } from "../../components/icons/LanguageIcon";
import { TComponentModel, useComponentModel } from "../../core/state/model";

interface ListItem {
    windowIndex: number;
    page?: Partial<IEditorState>;
}

const openTabsListTraits = new TraitSet().add(LIST_ITEM_KEY, {
    value: (item: unknown) => {
        const it = item as ListItem;
        return it.page?.id ?? `window-${it.windowIndex}`;
    },
    label: (item: unknown) => {
        const it = item as ListItem;
        return it.page ? (it.page.title ?? "") : `window-${it.windowIndex}`;
    },
    icon: (item: unknown) => {
        const it = item as ListItem;
        return it.page ? <LanguageIcon language={it.page.language} /> : undefined;
    },
    section: (item: unknown) => !(item as ListItem).page,
});

interface OpenTabsListProps {
    onClose?: () => void;
    open?: boolean;
}

interface OpenTabsListState {
    allWindowsPages: WindowPages[];
    activeIndex: number | null;
}

class OpenTabsListModel extends TComponentModel<OpenTabsListState, OpenTabsListProps> {
    setAllWindowsPages = (allWindowsPages: WindowPages[]) => {
        this.state.update((s) => { s.allWindowsPages = allWindowsPages; });
    };

    setActiveIndex = (activeIndex: number | null) => {
        this.state.update((s) => { s.activeIndex = activeIndex; });
    };

    private loadId = 0;

    loadWindowPages = async () => {
        const loadId = ++this.loadId;
        const windowsPages = await api.getWindowPages();
        if (this.isLive && loadId === this.loadId) {
            this.setAllWindowsPages(windowsPages);
        }
    };

    init() {
        // One dependency-tracked effect covers initial loading and later opens;
        // unlike the two view effects, it does not load twice when initially open.
        this.effect(() => {
            void this.loadWindowPages();
        }, () => [this.props.open]);
    }
}

export function OpenTabsList(props: OpenTabsListProps) {
    const { onClose } = props;
    const model = useComponentModel(props, OpenTabsListModel, { allWindowsPages: [], activeIndex: null });
    const { allWindowsPages, activeIndex } = model.state.use();
    const state = pagesModel.state.use();
    const currentWindowIndex = appWindow.windowIndex;

    // activePage is a getter derived from `state`; re-evaluates on every render of this component (which is itself driven by state.use() above).
    const activePageId = pagesModel.activePage?.id;

    const items = useMemo<ListItem[]>(() => {
        const currentPages = state.pages.map((page) => ({
            windowIndex: currentWindowIndex,
            // mainEditor.state.id is the editor UUID, not the page UUID — override
            // so onClick can resolve the page via pagesModel.showPage(page.id).
            page: {
                ...(page.mainEditor?.state.get() ?? { title: page.title }),
                id: page.id,
            },
        }));

        const resItems: Array<ListItem | ListItem[]> = [
            { windowIndex: currentWindowIndex },
            currentPages,
        ];

        const otherWindowsPages = allWindowsPages.filter(
            (wp) => wp.windowIndex !== currentWindowIndex
        );
        otherWindowsPages.forEach((wp) => {
            resItems.push({ windowIndex: wp.windowIndex });
            const pages = wp.pages.map((desc) => {
                // PageDescriptor: pick the main editor's state slice.
                const main = desc.editors.find(e => e.id === desc.mainEditorId);
                const state = (main?.state ?? {}) as Partial<IEditorState>;
                return {
                    windowIndex: wp.windowIndex,
                    page: { ...state, id: desc.id } as Partial<IEditorState>,
                };
            });
            resItems.push(pages);
        });

        const allItems = resItems.flatMap((x) => x);
        const hasDuplicateId = allItems.some((item, _, arr) => {
            if (!item.page) return false;
            return arr.filter(i => i.page && i.page.id === item.page.id).length > 1;
        });
        if (hasDuplicateId) {
            // happens when moving a tab in the current window
            // it displays then in this window and in the window it was moved from
            setTimeout(model.loadWindowPages, 50);
        }
        return allItems;
    }, [state.pages, allWindowsPages, currentWindowIndex, model]);

    const tItems = useMemo(
        () => traited(items, openTabsListTraits),
        [items],
    );

    const onClick = useCallback((item: ListItem) => {
        if (item.page) {
            if (item.windowIndex === currentWindowIndex) {
                pagesModel.showPage(item.page?.id);
            } else {
                api.showWindowPage(item.windowIndex, item.page.id);
                onClose?.();
            }
        }
    }, [onClose, currentWindowIndex]);

    const isSelected = useCallback(
        (item: ListItem) => item.page?.id === activePageId,
        [activePageId],
    );

    return (
        <ListBox<ListItem>
            name="sidebar-open-tabs"
            items={tItems}
            rowHeight={22}
            activeIndex={activeIndex}
            onActiveChange={model.setActiveIndex}
            onChange={onClick}
            isSelected={isSelected}
            getTooltip={(item) => item.page?.filePath}
            emptyMessage="no tabs"
            variant="browse"
        />
    );
}
