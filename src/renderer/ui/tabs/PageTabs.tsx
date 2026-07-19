import styled from "@emotion/styled";

import { pagesModel } from "../../api/pages";
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    PlusIcon,
} from "../../theme/icons";
import { IconButton, SplitButton } from "../../uikit";
import type { MenuItem } from "../../uikit";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { useMemo } from "react";
import { settings } from "../../api/settings";
import { app } from "../../api/app";
import { getCreatableItems } from "../sidebar/tools-editors-registry";
import { usePinnedRefs } from "../sidebar/pinned-items";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { createLinkData } from "../../../shared/link-data";
import { BoardGlyph } from "../../editors/board/BoardGlyph";
import { fpBasename } from "../../core/utils/file-path";
import { minTabWidth, PageTab, pinnedTabWidth, pinnedTabEncryptedWidth } from "./PageTab";
import { isTextFileModel } from "../../editors/text";

const PageTabsRoot = styled.div(
    {
        display: "flex",
        alignItems: "center",
        alignSelf: "flex-end",
        columnGap: 2,
        paddingTop: 6,
        overflow: "hidden",
        marginLeft: 4,
        "& .tabs-wrapper": {
            display: "flex",
            alignItems: "center",
            columnGap: 2,
            overflowX: "auto",
            overflowY: "hidden",
            scrollBehavior: "smooth",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": {
                display: "none",
            },
        },
    },
    { label: "PageTabsRoot" },
);

const defaultTabsState = {
    showScrollButtons: false,
};

type TabsState = typeof defaultTabsState;

class TabsModel extends TComponentModel<TabsState, object> {
    scrollingDiv: HTMLDivElement | null = null;
    resizeObserver: ResizeObserver | null = null;

    init() {
        this.effect(() => {
            this.checkScrollButtons();
            this.scrollToActive();
        }, () => [pagesModel.state.get().pages.length]);
    }

    dispose() {
        this.scrollingDiv?.removeEventListener('wheel', this.handleWheel);
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
    }

    setScrollingDiv = (el: HTMLDivElement | null) => {
        this.scrollingDiv = el;
        if (el) {
            el.addEventListener('wheel', this.handleWheel, { passive: false });
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
            }
            this.resizeObserver = new ResizeObserver(this.checkScrollButtons);
            this.resizeObserver.observe(el);
        }
    };

    handleWheel = (event: WheelEvent) => {
        if (!this.scrollingDiv) return;

        if (this.scrollingDiv.scrollWidth > this.scrollingDiv.clientWidth) {
            event.preventDefault();
            this.scrollingDiv.scrollLeft += event.deltaY;
        }
    };

    checkScrollButtons = () => {
        if (!this.scrollingDiv) return;
        const hasOverflow =
            this.scrollingDiv.scrollWidth > this.scrollingDiv.clientWidth;
        this.state.update((s) => {
            s.showScrollButtons = hasOverflow;
        });
    };

    scrollLeft = () => {
        if (!this.scrollingDiv) return;
        this.scrollingDiv.scrollBy({
            left: -minTabWidth,
            behavior: "smooth",
        });
    };

    scrollRight = () => {
        if (!this.scrollingDiv) return;
        this.scrollingDiv.scrollBy({
            left: minTabWidth,
            behavior: "smooth",
        });
    };

    scrollToActive = () => {
        if (!this.scrollingDiv) return;

        const activeTab = this.scrollingDiv.querySelector('[data-type="page-tab"][data-active]');
        if (!activeTab) return;

        activeTab.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
        });
    };
}

export function PageTabs(props: object) {
    const model = useComponentModel(props, TabsModel, defaultTabsState);
    const tabsState = model.state.use();
    const state = pagesModel.state.use();

    const browserProfiles = settings.use("browser-profiles");
    const pinnedRefs = usePinnedRefs();

    const addPageMenuItems = useMemo((): MenuItem[] => {
        const allItems = getCreatableItems(browserProfiles);
        const items: MenuItem[] = [];
        for (const ref of pinnedRefs) {
            if (ref.kind === "editor") {
                const item = allItems.find((i) => i.id === ref.id);
                if (item) items.push({ label: item.label, icon: item.icon, onClick: item.create });
            } else {
                const root = ref.root;
                items.push({
                    label: fpBasename(root),
                    icon: <BoardGlyph boardRoot={root} />,
                    onClick: () => {
                        void app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root)));
                    },
                });
            }
        }
        items.push({
            label: "Show All…",
            startGroup: true,
            onClick: () => void pagesModel.showToolsHubPage(),
        });
        return items;
    }, [browserProfiles, pinnedRefs]);

    return (
        <PageTabsRoot data-type="page-tabs" className="page-tabs">
            {tabsState.showScrollButtons && (
                <IconButton
                    name="page-tabs-scroll-left"
                    size="sm"
                    onClick={model.scrollLeft}
                    icon={<ArrowLeftIcon />}
                />
            )}
            <div
                className="tabs-wrapper"
                ref={model.setScrollingDiv}
            >
                {state.pages?.map((page) => {
                    let pinnedLeft: number | undefined;
                    if (page.pinned) {
                        pinnedLeft = 0;
                        for (const p of state.pages) {
                            if (p === page) break;
                            if (p.pinned) {
                                const editor = p.mainEditor;
                                const isEnc = editor && isTextFileModel(editor) && (editor.encrypted || editor.decrypted);
                                pinnedLeft += (isEnc ? pinnedTabEncryptedWidth : pinnedTabWidth) + 2; // 2 = column gap
                            }
                        }
                    }
                    return <PageTab key={page.id} model={page} pinnedLeft={pinnedLeft} />;
                })}
            </div>
            {tabsState.showScrollButtons && (
                <IconButton
                    name="page-tabs-scroll-right"
                    size="sm"
                    onClick={model.scrollRight}
                    icon={<ArrowRightIcon />}
                />
            )}
            <SplitButton
                name="page-tabs-add"
                size="md"
                title="Add Page (Ctrl+N)"
                icon={<PlusIcon />}
                onClick={() => pagesModel.addEmptyPage()}
                menuTitle="New editor page"
                items={addPageMenuItems}
            />
        </PageTabsRoot>
    );
}
