import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { gap, height, spacing } from "../tokens";
import { Traited } from "../../core/traits/traits";
import { highlight } from "../shared/highlight";
import { renderIcon } from "../shared/slots";
import type { SlotText } from "../shared/slots";
import { useComponentModel } from "../../core/state/model";
import { defaultMultiListBoxState, MultiListBoxModel } from "./MultiListBoxModel";
import { Input } from "../Input";
import {
    IListBoxItem,
    ListBox,
    ListItemRenderContext,
} from "../ListBox";

// =============================================================================
// Types
// =============================================================================

export interface MultiListBoxProps<T = IListBoxItem>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Items to display. Plain `T[]` when `T = IListBoxItem`, or `Traited<unknown[]>` to drive a
     *  custom source shape (Rule 3). */
    items: T[] | Traited<unknown[]>;
    /** Currently-selected source items. Empty array when nothing is selected. */
    value: T[];
    /** Called whenever the selection changes -- caller replaces its `value` with the array. */
    onChange: (value: T[]) => void;
    /** Disabled state -- rows do not respond to clicks and the search input is read-only. */
    disabled?: boolean;
    /** Read-only state -- rows do not respond to clicks. The search box stays enabled. */
    readOnly?: boolean;
    /** Show the built-in search input above the list. Default: true. */
    showSearch?: boolean;
    /** Search filter mode. Default: "contains". `"off"` disables filtering entirely. */
    filterMode?: "contains" | "startsWith" | "off";
    /** Placeholder shown inside the built-in search input. Default: "Search...". */
    searchPlaceholder?: string;
    /** Show a tri-state "Select all" row at the top of the list. Default: false. */
    selectAll?: boolean;
    /** Label rendered next to the select-all checkbox. Default: "Select all". */
    selectAllLabel?: string;
    /** Pixel height of each list row. Forwarded to the inner ListBox. Default: 24. */
    rowHeight?: number;
    /**
     * Maximum number of visible list rows before the inner list scrolls. Default: 10.
     * Only consulted when no `height` is set.
     */
    maxVisibleItems?: number;
    /** Renders inside the list area when no rows match the filter. Default: "no rows". */
    emptyMessage?: SlotText;
    /** Fixed width — number becomes px; a string passes through. Default: fills parent (100%). */
    width?: number | string;
    /**
     * Fixed height — number becomes px; a string passes through. When unset, the inner list grows up
     * to `maxVisibleItems x rowHeight` plus the search row and select-all row chrome.
     */
    height?: number | string;
}

// =============================================================================
// Styled
// =============================================================================

const Root = styled.div(
    {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
        width: "100%",
        backgroundColor: color.background.default,

        "&[data-disabled]": {
            opacity: 0.6,
            pointerEvents: "none",
        },
    },
    { label: "MultiListBox" },
);

const SearchRow = styled.div(
    {
        flexShrink: 0,
        padding: spacing.xs,
    },
    { label: "MultiListBoxSearchRow" },
);

const SelectAllRow = styled.div(
    {
        display: "inline-flex",
        alignItems: "center",
        gap: gap.md,
        flexShrink: 0,
        height: 24,
        boxSizing: "border-box",
        paddingLeft: spacing.sm,
        paddingRight: spacing.sm,
        cursor: "pointer",
        color: color.text.default,
        borderBottom: `1px solid ${color.border.light}`,
        userSelect: "none",

        "&:hover": {
            backgroundColor: color.background.message,
        },

        "& [data-part='icon']": {
            display: "inline-flex",
            flexShrink: 0,
            width: height.iconMd,
            height: height.iconMd,
            color: color.text.light,
        },
        "&:hover [data-part='icon']": {
            color: color.text.default,
        },
        "& [data-part='icon'] svg": {
            width: height.iconMd,
            height: height.iconMd,
        },

        "& [data-part='label']": {
            flex: "1 1 auto",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        },
    },
    { label: "MultiListBoxSelectAllRow" },
);

const ItemRow = styled.div(
    {
        display: "inline-flex",
        width: "100%",
        boxSizing: "border-box",
        alignItems: "center",
        gap: gap.md,
        paddingLeft: spacing.sm,
        paddingRight: spacing.sm,
        cursor: "pointer",
        color: color.text.default,
        overflow: "hidden",

        "&[data-disabled]": { opacity: 0.4, pointerEvents: "none" },
        "&[data-active]": { backgroundColor: color.background.message },

        "& [data-part='check']": {
            display: "inline-flex",
            flexShrink: 0,
            width: height.iconMd,
            height: height.iconMd,
            color: color.text.light,
        },
        "&:hover [data-part='check'], &[data-active] [data-part='check']": {
            color: color.text.default,
        },
        "&[data-checked] [data-part='check']": {
            color: color.text.default,
        },
        "& [data-part='check'] svg": {
            width: height.iconMd,
            height: height.iconMd,
        },

        "& > svg": {
            width: height.iconMd,
            height: height.iconMd,
            flexShrink: 0,
        },

        "& [data-part='label']": {
            flex: "1 1 auto",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        },
    },
    { label: "MultiListBoxItemRow" },
);

const ListWrapper = styled.div(
    {
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        minHeight: 0,
    },
    { label: "MultiListBoxListWrapper" },
);

// =============================================================================
// Helpers
// =============================================================================

const defaultRowHeight = 24;
const defaultMaxVisibleItems = 10;

// =============================================================================
// Component
// =============================================================================

export function MultiListBox<T = IListBoxItem>(props: MultiListBoxProps<T>) {
    const {
        name,
        items: _items,
        value: _value,
        onChange: _onChange,
        filterMode: _filterMode,
        disabled,
        readOnly,
        showSearch = true,
        searchPlaceholder = "Search...",
        selectAll = false,
        selectAllLabel = "Select all",
        rowHeight = defaultRowHeight,
        maxVisibleItems = defaultMaxVisibleItems,
        emptyMessage,
        width,
        height: heightProp,
        ...rest
    } = props;
    const model = useComponentModel(
        props,
        MultiListBoxModel as unknown as MultiListBoxModel<T>,
        defaultMultiListBoxState,
    );
    const { searchText, activeIndex } = model.state.use((state) => ({
        searchText: state.searchText,
        activeIndex: state.activeIndex,
    }));
    const listGrow = heightProp === undefined ? maxVisibleItems * rowHeight : undefined;
    const rootStyle: React.CSSProperties | undefined =
        width === undefined && heightProp === undefined ? undefined : { width, height: heightProp };

    return (
        <Root
            data-type="multilistbox"
            data-name={name}
            data-disabled={disabled || undefined}
            data-readonly={readOnly || undefined}
            style={rootStyle}
            {...rest}
        >
            {showSearch && (
                <SearchRow>
                    <Input
                        name="multilistbox-search"
                        size="sm"
                        value={searchText}
                        onChange={model.setSearchText}
                        placeholder={searchPlaceholder}
                        disabled={disabled}
                        tone={searchText ? "accent" : "default"}
                    />
                </SearchRow>
            )}
            {selectAll && (
                <SelectAllRow
                    data-type="multilistbox-select-all"
                    data-checked={model.allVisibleSelected ? "true" : model.someVisibleSelected ? "mixed" : "false"}
                    role="checkbox"
                    aria-checked={model.allVisibleSelected ? "true" : model.someVisibleSelected ? "mixed" : "false"}
                    onClick={model.toggleSelectAll}
                >
                    <span data-part="icon">
                        {renderIcon(model.allVisibleSelected ? "checked" : model.someVisibleSelected ? "indeterminate" : "unchecked")}
                    </span>
                    <span data-part="label">{selectAllLabel}</span>
                </SelectAllRow>
            )}
            <ListWrapper>
                <ListBox<T>
                    items={model.listBoxItems.value}
                    isSelected={model.isSelected}
                    onChange={model.toggle}
                    activeIndex={activeIndex}
                    onActiveChange={model.setActiveIndex}
                    renderItem={(context: ListItemRenderContext<T>) => {
                        const checked = model.isSelected(context.source);
                        const label = searchText
                            ? highlight(context.item.label, searchText)
                            : context.item.label;
                        return (
                            <ItemRow
                                id={context.id}
                                data-type="multi-list-item"
                                data-checked={checked || undefined}
                                data-active={context.active || undefined}
                                data-disabled={context.item.disabled || undefined}
                                role="option"
                                aria-selected={checked ? "true" : "false"}
                                aria-disabled={context.item.disabled ? "true" : undefined}
                            >
                                <span data-part="check">{renderIcon(checked ? "checked" : "unchecked")}</span>
                                {renderIcon(context.item.icon)}
                                <span data-part="label">{label}</span>
                            </ItemRow>
                        );
                    }}
                    rowHeight={rowHeight}
                    growToHeight={listGrow}
                    searchText={searchText}
                    keyboardNav
                    emptyMessage={emptyMessage ?? "no rows"}
                />
            </ListWrapper>
        </Root>
    );
}
