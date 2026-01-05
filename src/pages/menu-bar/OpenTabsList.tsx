import styled from "@emotion/styled";
import { useCallback, useEffect, useMemo, useState } from "react";
import { List } from "../../controls/List";
import { api } from "../../ipc/renderer/api";
import { filesModel } from "../../model/files-model";
import { pagesModel } from "../../model/pages-model";
import { IPage, WindowPages } from "../../shared/types";
import color from "../../theme/color";
import { EmptyIcon } from "../../theme/icons";
import { LanguageIcon } from "../shared/LanguageIcon";

const OpenTabsListRoot = styled(List)({
    "& .list-item": {
        boxSizing: "border-box",
        borderRadius: 4,
        border: `1px solid transparent`,
        "& svg": {
            width: 16,
            height: 16,
        },
        "&:hover": {
            backgroundColor: color.background.dark,
            borderColor: color.border.default,
        },
        "&.selected": {
            backgroundColor: color.background.default,
            borderColor: color.border.default,
        },
        "&.window-item": {
            textAlign: "center",
            cursor: "default",
            "&:hover": {
                borderColor: "transparent",
            }
        },
    },
});

interface ListItem {
    windowIndex: number;
    page?: Partial<IPage>;
}

const getPageLabel = (item: ListItem) =>
    item.page ? item.page.title : `window-${item.windowIndex}`;
const getPageIcon = (item: ListItem) =>
    item.page ? <LanguageIcon language={item.page.language} /> : <EmptyIcon />;
const getTooltip = (item: ListItem) => (item.page as any)?.filePath;

interface OpenTabsListProps {
    onClose?: () => void;
}

export function OpenTabsList(props: OpenTabsListProps) {
    const [allWindowsPages, setAllWindowsPages] = useState<WindowPages[]>([]);
    const state = pagesModel.state.use();

    useEffect(() => {
        api.getWindowPages().then((windowsPages) => {
            setAllWindowsPages(windowsPages);
        });
    }, []);

    const activePageId = useMemo(
        () => pagesModel.activePage?.state.get().id,
        [state]
    );

    const items = useMemo<ListItem[]>(() => {
        const currentWindowIndex = filesModel.windowIndex;
        const currentPages = state.pages.map((page) => ({
            windowIndex: currentWindowIndex,
            page: page.state.get(),
        }));

        const resItems: any[] = [
            { windowIndex: currentWindowIndex }, 
            currentPages,
        ];

        const otherWindowsPages = allWindowsPages.filter(
            (wp) => wp.windowIndex !== currentWindowIndex
        );
        otherWindowsPages.forEach((wp) => {
            resItems.push({ windowIndex: wp.windowIndex });
            const pages = wp.pages.map((page) => ({
                windowIndex: wp.windowIndex,
                page: page,
            }));
            resItems.push(pages);
        });
        
        return resItems.flatMap((x) => x);
    }, [state.pages, allWindowsPages]);

    const onClick = useCallback((item: ListItem) => {
        if (item.page) {
            if (item.windowIndex === filesModel.windowIndex) {
                pagesModel.showPage(item.page?.id);
            } else {
                api.showWindowPage(item.windowIndex, item.page.id);
                props.onClose?.();
            }
        }
    }, [props.onClose]);

    const getSelected = useCallback((item: ListItem) => {
        return item.page?.id === activePageId;
    }, [activePageId]);

    const getOptionClass = useCallback((item: ListItem) => {
        return item.page ? "page-item" : "window-item";
    }, [activePageId]);

    return (
        <OpenTabsListRoot
            options={items}
            getLabel={getPageLabel}
            getIcon={getPageIcon}
            getSelected={getSelected}
            getOptionClass={getOptionClass}
            selectedIcon={<span />}
            rowHeight={28}
            onClick={onClick}
            itemMarginY={1}
            getTooltip={getTooltip}
        />
    );
}
