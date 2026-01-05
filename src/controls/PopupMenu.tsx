import styled from "@emotion/styled";
import React, { CSSProperties, ReactNode, useEffect } from "react";
import clsx from "clsx";

import { Popper, PopperProps, PopperRoot } from "./Popper";
import color from "../theme/color";
import { ComponentOptions } from "./types";
import { useSelectOptions } from "./utils";
import { TextField } from "./TextField";
import { List, ListRef } from "./List";
import { TComponentModel, useComponentModel } from "../common/classes/model";

const PopupMenuRoot = styled(PopperRoot)<{
    height?: CSSProperties["height"];
    width?: CSSProperties["width"];
}>(
    (props) => ({
        minWidth: 140,
        minHeight: 26,
        maxWidth: 800,
        padding: "4px 0",
        height: props.height,
        width: props.width,
        display: "flex",
        flexDirection: "column",
        "& .popup-menu-item": {
            boxSizing: "border-box",
            "& svg": {
                width: 16,
                height: 16,
            },
            "&.hovered": {
                backgroundColor: color.background.selection,
                color: color.text.selection,
            },
            "&.disabled": {
                color: color.text.light,
                "& svg": {
                    color: color.icon.disabled,
                },
                cursor: "default",
                backgroundColor: color.background.default,
            },
            "&.startGroup": {
                borderTop: `1px solid ${color.border.default}`,
            },
        },
        "& .search-field": {
            margin: "0 4px 4px 4px",
        },
    }),
    { label: "PopupMenuRoot" }
);

export interface MenuItem {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    icon?: ReactNode;
    invisible?: boolean;
    startGroup?: boolean;
    title?: string;
    selected?: boolean; // initially highlighted item
    id?: string;
}

export interface PopupMenuProps extends PopperProps {
    items: ComponentOptions<MenuItem>;
}

const rowHeight = 26;
const maxHeight = 500;
const whiteSpaceY = 0;

const defaultPopupMenuState = {
    search: "",
    items: [] as MenuItem[],
    showSearch: false,
    width: 140,
    height: 0,
    hovered: undefined as MenuItem | undefined,
};

type PopupMenuState = typeof defaultPopupMenuState;

class PopupMenuModel extends TComponentModel<PopupMenuState, PopupMenuProps> {
    list: ListRef | null = null;

    setListRef = (ref: ListRef | null) => {
        this.list = ref;
    };

    setSearch = (search: string) => {
        this.state.update((s) => {
            s.search = search;
        });
    };

    prepareItems = (options: MenuItem[]) => {
        const { filtered, showSearch } = this.filterOptions(options);
        const width = this.calcWidth(options);

        const prepared = [...filtered];
        prepared.forEach((item, i) => {
            if (item.startGroup && item.invisible && i < prepared.length - 1) {
                prepared[i + 1] = { ...prepared[i + 1], startGroup: true };
            }
        });
        const items = prepared.filter((item) => !item.invisible);

        const height = this.calcHeight(items.length, showSearch);
        const hovered = items.find((i) => i.selected);

        this.state.update((s) => {
            s.items = items;
            s.showSearch = showSearch;
            s.width = width;
            s.height = height;
            s.hovered = hovered;
        });

        if (hovered) {
            const hoveredIndex = items.indexOf(hovered);
            setTimeout(() => {
                this.list?.getGrid()?.scrollToRow(hoveredIndex, "center");
            }, 0);
        }
    };

    private filterOptions = (options: MenuItem[]) => {
        const showSearch = options.length > 20;
        const search = this.state.get().search.toLocaleLowerCase();
        if (!search || !showSearch) {
            return { filtered: options, showSearch };
        }
        const filtered = options.filter((item) =>
            item.label.toLocaleLowerCase().includes(search)
        );
        return { filtered, showSearch };
    };

    private calcWidth = (options: MenuItem[]) => {
        let maxLength = 0;
        let withIcon = false;
        options.forEach((item) => {
            maxLength = Math.max(maxLength, item.label.length);
            withIcon = withIcon || Boolean(item.icon);
        });
        return maxLength * 8 + 32 + (withIcon ? 24 : 0);
    };

    private calcHeight = (itemsCount: number, showSearch: boolean) => {
        return Math.min(
            rowHeight * itemsCount + whiteSpaceY + (showSearch ? 34 : 0),
            maxHeight
        );
    };

    onClose = () => {
        this.props.onClose?.();
    };

    getOptionClass = (item: MenuItem, index?: number) =>
        clsx("popup-menu-item", {
            disabled: item.disabled,
            startGroup: item.startGroup && (index === undefined || index > 0),
        });

    onItemClick = (item: MenuItem) => {
        if (!item.disabled) {
            this.onClose();
            item.onClick?.();
        }
    };

    onItemHover = (item?: MenuItem) => {
        this.state.update((s) => {
            s.hovered = item;
        });
    };

    getHovered = (item: MenuItem) => {
        return this.state.get().hovered === item;
    };

    getSelected = (item: MenuItem) => Boolean(item.selected);

    searchKeyDown = (e: React.KeyboardEvent) => {
        const visibleRowCount = this.list?.getGrid()?.visibleRowCount || 5;
        switch (e.key) {
            case "Escape":
                this.onClose();
                break;
            case "ArrowDown":
                this.hoverNext(1);
                break;
            case "ArrowUp":
                this.hoverNext(-1);
                break;
            case "PageDown":
                this.hoverNext(visibleRowCount);
                break;
            case "PageUp":
                this.hoverNext(-visibleRowCount);
                break;
            case "Enter": {
                const { hovered, items } = this.state.get();
                const item =
                    hovered || (items.length === 1 ? items[0] : undefined);
                if (item && !item.disabled) {
                    this.onClose();
                    item.onClick?.();
                }
                break;
            }
        }
    };

    hoverNext = (shift: number) => {
        const { items, hovered } = this.state.get();
        const index = (hovered ? items.indexOf(hovered) : -1) + shift;
        const nextIndex = Math.min(Math.max(index, 0), items.length - 1);
        this.state.update((s) => {
            s.hovered = items[nextIndex];
        });
        this.list?.getGrid()?.update({ all: true });
        this.list?.getGrid()?.scrollToRow(nextIndex);
    };
}

export function PopupMenu(props: PopupMenuProps) {
    const { items, onClose, ...popperProps } = props;
    const model = useComponentModel(
        props,
        PopupMenuModel,
        defaultPopupMenuState
    );
    const state = model.state.use();

    const { options } = useSelectOptions(items, Boolean(props.open));

    useEffect(() => {
        model.setSearch("");
        model.onItemHover(undefined);
    }, [props.open]);

    useEffect(() => {
        model.prepareItems(options);
    }, [options, state.search, props.open]);

    return (
        <Popper onClose={model.onClose} maxHeight={800} {...popperProps}>
            <PopupMenuRoot height={state.height} width={state.width}>
                {state.showSearch && (
                    <TextField
                        value={state.search}
                        onChange={model.setSearch}
                        placeholder="Search..."
                        className="search-field"
                        autoFocus
                        onKeyDown={model.searchKeyDown}
                    />
                )}
                <List
                    ref={model.setListRef}
                    options={state.items}
                    rowHeight={rowHeight}
                    getIcon={(i) => i.icon}
                    getOptionClass={model.getOptionClass}
                    whiteSpaceY={0}
                    onClick={model.onItemClick}
                    onMouseHover={model.onItemHover}
                    getHovered={model.getHovered}
                    getSelected={model.getSelected}
                />
            </PopupMenuRoot>
        </Popper>
    );
}
