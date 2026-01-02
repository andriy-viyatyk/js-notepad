import styled from "@emotion/styled";

import { pagesModel } from "../model/pages-model";
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    PlusIcon,
} from "../theme/icons";
import { Button } from "../controls/Button";
import { TComponentModel, useComponentModel } from "../common/classes/model";
import { useEffect } from "react";
import { minTabWidth, PageTab } from "./PageTab";

const PageTabsRoot = styled.div({
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
    "& button.add-page-button": {
        padding: "0 2px",
        flexShrink: 0,
        height: 26,
        marginLeft: 2,
    },
});

const defaultTabsState = {
    showScrollButtons: false,
};

type TabsState = typeof defaultTabsState;

class TabsModel extends TComponentModel<TabsState, object> {
    scrollingDiv: HTMLDivElement | null = null;
    resizeObserver: ResizeObserver | null = null;

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

        const activeTab = this.scrollingDiv.querySelector(".page-tab.isActive");
        if (!activeTab) return;

        activeTab.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
        });
    };

    destroy = () => {
        this.scrollingDiv?.removeEventListener('wheel', this.handleWheel);
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
    };
}

export function PageTabs(props: object) {
    const model = useComponentModel(props, TabsModel, defaultTabsState);
    const tabsState = model.state.use();
    const state = pagesModel.state.use();

    useEffect(() => {
        return model.destroy;
    }, []);

    useEffect(() => {
        model.checkScrollButtons();
        model.scrollToActive();
    }, [state.pages.length]);

    return (
        <PageTabsRoot className="page-tabs">
            {tabsState.showScrollButtons && (
                <Button
                    onClick={model.scrollLeft}
                    size="small"
                    background="dark"
                >
                    <ArrowLeftIcon />
                </Button>
            )}
            <div
                className="tabs-wrapper"
                ref={model.setScrollingDiv}
            >
                {state.pages?.map((page) => (
                    <PageTab key={page.state.get().id} model={page} />
                ))}
            </div>
            {tabsState.showScrollButtons && (
                <Button
                    onClick={model.scrollRight}
                    size="small"
                    background="dark"
                >
                    <ArrowRightIcon />
                </Button>
            )}
            <Button
                size="medium"
                onClick={() => pagesModel.addEmptyPage()}
                title="Add Page"
                className="add-page-button"
                background="dark"
            >
                <PlusIcon />
            </Button>
        </PageTabsRoot>
    );
}
