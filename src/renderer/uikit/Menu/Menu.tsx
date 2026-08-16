import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { fontSize, height, spacing } from "../tokens";
import { useComponentModel } from "../../core/state/model";
import { Popover } from "../Popover/Popover";
import { Input } from "../Input/Input";
import { ChevronRightIcon, CheckIcon } from "../../theme/icons";
import {
    MenuModel,
    MenuProps,
    MAX_HEIGHT,
    ROW_HEIGHT,
    defaultMenuState,
} from "./MenuModel";

// Rule 3 (Traited<T[]>) is intentionally NOT applied to Menu. MenuItem is the
// canonical shape — there is no "native item shape" to convert from. All
// consumers (script API via ContextMenuEvent.items, app code, sub-menus) build
// MenuItem[] directly. Adding Traited<MenuItem[]> would be unused complexity.

// --- Styled ---

const ListRoot = styled.div(
    {
        minWidth: 140,
        maxWidth: 800,
        padding: `${spacing.xs}px 0`,
        display: "flex",
        flexDirection: "column",
        outline: "none",
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "auto",
    },
    { label: "MenuList" },
);

const SearchWrap = styled.div(
    {
        padding: `${spacing.xs}px ${spacing.sm}px ${spacing.sm}px ${spacing.sm}px`,
        flexShrink: 0,
    },
    { label: "MenuSearchWrap" },
);

const RowRoot = styled.div(
    {
        height: ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: spacing.md,
        padding: `0 ${spacing.md}px`,
        cursor: "pointer",
        userSelect: "none",
        fontSize: fontSize.base,
        color: color.text.default,
        flexShrink: 0,

        "&[data-hovered]": {
            backgroundColor: color.background.selection,
            color: color.text.selection,
            "& [data-part='hotkey']": { color: "inherit" },
            "& [data-part='submenu-chevron']": { color: "inherit" },
            "& [data-part='selected-check']": { color: "inherit" },
        },
        "&[data-disabled]": {
            color: color.text.light,
            cursor: "default",
            "& svg": { color: color.icon.disabled },
            "&[data-hovered]": {
                backgroundColor: "transparent",
                color: color.text.light,
            },
        },
        "&[data-start-group]": {
            borderTop: `1px solid ${color.border.default}`,
            marginTop: spacing.xs,
        },
        "&[data-minor]:not([data-hovered])": {
            "& [data-part='label']": { color: color.text.light },
            "& [data-part='hotkey']": { opacity: 0.6 },
        },
    },
    { label: "MenuRow" },
);

const IconSlot = styled.span(
    {
        width: height.iconMd,
        height: height.iconMd,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        "& svg": { width: height.iconMd, height: height.iconMd },
    },
    { label: "MenuIconSlot" },
);

const Label = styled.span(
    {
        flex: "1 1 auto",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    { label: "MenuLabel" },
);

const Hotkey = styled.span(
    {
        marginLeft: spacing.xl,
        color: color.text.light,
        fontSize: fontSize.sm,
        flexShrink: 0,
    },
    { label: "MenuHotkey" },
);

const SubMenuChevron = styled.span(
    {
        flexShrink: 0,
        marginLeft: spacing.sm,
        color: color.text.light,
        display: "inline-flex",
        alignItems: "center",
        "& svg": { width: height.iconSm, height: height.iconSm },
    },
    { label: "MenuSubMenuChevron" },
);

const SelectedCheck = styled.span(
    {
        flexShrink: 0,
        marginLeft: spacing.sm,
        color: color.text.light,
        display: "inline-flex",
        alignItems: "center",
        "& svg": { width: height.iconMd, height: height.iconMd },
    },
    { label: "MenuSelectedCheck" },
);

// --- Component ---

export function Menu({ ref, ...props }: MenuProps & { ref?: React.Ref<HTMLDivElement> }) {
    const model = useComponentModel(props, MenuModel, defaultMenuState);
    const { search, hoveredId, subMenuItem, subMenuAnchor } = model.state.use((s) => ({
        search: s.search,
        hoveredId: s.hoveredId,
        subMenuItem: s.subMenuItem,
        subMenuAnchor: s.subMenuAnchor,
    }));

    const { open, ...positionProps } = props;
    // `items` and `onClose` are owned by the model via this.props.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { items: _items, onClose: _onClose, ...rest } = positionProps;

    const showSearch = model.showSearch;
    const hasAnyIcon = model.hasAnyIcon.value;
    const prepared = model.prepared.value;

    return (
        <>
            <Popover
                ref={ref}
                {...rest}
                open={open}
                onClose={model.onPopoverClose}
                onKeyDown={showSearch ? undefined : model.onKeyDown}
                outsideClickIgnoreSelector='[data-type="menu"]'
                maxHeight={MAX_HEIGHT}
                scroll={false}
                data-type="menu"
            >
                {showSearch && (
                    <SearchWrap>
                        <Input
                            ref={model.setSearchInputRef}
                            value={search}
                            onChange={model.onSearchChange}
                            placeholder="Search..."
                            onKeyDown={model.onKeyDown}
                        />
                    </SearchWrap>
                )}
                <ListRoot ref={model.setListRef} tabIndex={-1} className="scroll-container">
                    {prepared.map(({ item, id, startGroup }) => {
                        const isHovered = hoveredId === id;
                        const isSubAnchor = subMenuItem !== null && subMenuItem === item;
                        return (
                            <RowRoot
                                key={id}
                                data-type="menu-row"
                                data-id={id}
                                data-hovered={isHovered || isSubAnchor || undefined}
                                data-disabled={item.disabled || undefined}
                                data-start-group={startGroup || undefined}
                                data-minor={item.minor || undefined}
                                onMouseEnter={(e) => model.onRowMouseEnter(e, id, item)}
                                onMouseLeave={model.onRowMouseLeave}
                                onClick={(e) => model.onRowClick(e, item)}
                            >
                                {hasAnyIcon && <IconSlot data-part="icon">{item.icon ?? null}</IconSlot>}
                                <Label data-part="label">{item.label}</Label>
                                {item.hotKey && <Hotkey data-part="hotkey">{item.hotKey}</Hotkey>}
                                {item.selected && !item.items?.length ? (
                                    <SelectedCheck data-part="selected-check">
                                        <CheckIcon />
                                    </SelectedCheck>
                                ) : null}
                                {item.items?.length ? (
                                    <SubMenuChevron data-part="submenu-chevron">
                                        <ChevronRightIcon />
                                    </SubMenuChevron>
                                ) : null}
                            </RowRoot>
                        );
                    })}
                </ListRoot>
            </Popover>
            {subMenuItem && subMenuAnchor && (
                <Menu
                    items={subMenuItem.items ?? []}
                    open
                    elementRef={subMenuAnchor}
                    placement="right-start"
                    offset={[0, 2]}
                    onClose={model.onSubMenuClose}
                />
            )}
        </>
    );
}

// Re-export public types from canonical locations.
export type { MenuProps } from "./MenuModel";
