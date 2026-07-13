import React, { forwardRef, useId, useImperativeHandle } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { spacing } from "../tokens";
import { useComponentModel } from "../../core/state/model";
import { RenderGrid } from "../RenderGrid";
import type {
    ElementLength,
    Percent,
    RenderCellFunc,
} from "../RenderGrid";
import { Spinner } from "../Spinner/Spinner";
import { focusSelectionOverride } from "../shared/selection-style";
import { ListItem } from "./ListItem";
import { SectionItem } from "./SectionItem";
import { ListBoxModel, defaultListBoxState } from "./ListBoxModel";
import { IListBoxItem, ListBoxProps, ListBoxRef } from "./types";

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        outline: "none",
        "&[data-disabled]": { opacity: 0.6, pointerEvents: "none" },
        // Focused-list selection override for selectionStyle="focus" rows (the Explorer
        // look). Inert unless the root carries data-focus-selection.
        ...focusSelectionOverride('[data-type="list-item"]'),
    },
    { label: "ListBox" },
);

const EmptyRoot = styled.div(
    {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        flex: "1 1 auto",
        color: color.text.light,
    },
    { label: "ListBoxEmpty" },
);

// --- Constants ---

const columnWidth: ElementLength = (() => "100%" as Percent) as ElementLength;
const defaultRowHeight = 24;

// --- Component ---

function ListBoxView<T = IListBoxItem>(
    props: ListBoxProps<T>,
    ref: React.ForwardedRef<ListBoxRef>,
) {
    const reactId = useId();
    const model = useComponentModel(
        props,
        ListBoxModel as unknown as ListBoxModel<T>,
        defaultListBoxState,
    );
    model.setReactId(reactId);

    useImperativeHandle(
        ref,
        () => ({ scrollToIndex: model.scrollToIndex }),
        [model],
    );

    const {
        name,
        loading,
        emptyMessage,
        searchText,
        renderItem,
        keyboardNav = false,
        rowHeight = defaultRowHeight,
        growToHeight,
        whiteSpaceY,
        activeIndex,
        getTooltip,
        variant,
        selectionStyle,
        // Capture (don't forward) — model handles these via this.props
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        items: _items,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        value: _value,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onChange: _onChange,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        isSelected: _isSelected,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onActiveChange: _onActiveChange,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onContextMenu: _onContextMenu,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getContextMenu: _getContextMenu,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        id: _idProp,
        ...rest
    } = props;

    const rootId = model.rootId;
    const { resolved, sources } = model.resolved.value;

    const renderCell: RenderCellFunc = ({ row: idx, key, style }) => {
        const item = resolved[idx];
        if (!item) return null;

        if (item.section) {
            return (
                <div key={key} style={style}>
                    <SectionItem id={model.itemId(idx)} label={item.label} />
                </div>
            );
        }

        const selected = model.isSelectedAt(idx);
        const active = idx === activeIndex;
        const id = model.itemId(idx);
        const tooltip = getTooltip?.(sources[idx], idx);

        const content = renderItem
            ? renderItem({ item, source: sources[idx], index: idx, selected, active, id })
            : (
                <ListItem
                    id={id}
                    icon={item.icon}
                    label={item.label}
                    trailing={item.trailing}
                    searchText={searchText}
                    selected={selected}
                    active={active}
                    disabled={item.disabled}
                    tooltip={tooltip}
                    variant={variant}
                    selectionStyle={selectionStyle}
                />
            );

        return (
            <div
                key={key}
                style={style}
                onClick={() => model.onItemClick(idx)}
                onMouseEnter={() => model.onItemMouseEnter(idx)}
                onContextMenu={(e) => model.onItemContextMenu(e, idx)}
            >
                {content}
            </div>
        );
    };

    if (loading) {
        return (
            <Root
                id={rootId}
                data-type="list-box"
                data-name={name}
                data-loading=""
                onContextMenu={model.onRootContextMenu}
                {...rest}
            >
                <EmptyRoot>
                    <Spinner size={16} /> loading…
                </EmptyRoot>
            </Root>
        );
    }

    if (resolved.length === 0) {
        return (
            <Root
                id={rootId}
                data-type="list-box"
                data-name={name}
                data-empty=""
                onContextMenu={model.onRootContextMenu}
                {...rest}
            >
                <EmptyRoot>{emptyMessage ?? "no rows"}</EmptyRoot>
            </Root>
        );
    }

    const activeId =
        activeIndex != null && activeIndex >= 0 && activeIndex < resolved.length
            ? model.itemId(activeIndex)
            : undefined;

    const focusAware = keyboardNav || selectionStyle === "focus";

    return (
        <Root
            id={rootId}
            data-type="list-box"
            data-name={name}
            role="listbox"
            data-focus-selection={selectionStyle === "focus" || undefined}
            tabIndex={focusAware ? 0 : -1}
            aria-activedescendant={activeId}
            onKeyDown={model.onKeyDown}
            onContextMenu={model.onRootContextMenu}
            {...rest}
        >
            <RenderGrid
                ref={model.setGridRef}
                columnCount={1}
                rowCount={resolved.length}
                columnWidth={columnWidth}
                rowHeight={rowHeight}
                renderCell={renderCell}
                overscanRow={2}
                fitToWidth
                growToHeight={growToHeight}
                whiteSpaceY={whiteSpaceY}
            />
        </Root>
    );
}

export const ListBox = forwardRef(ListBoxView) as <T = IListBoxItem>(
    props: ListBoxProps<T> & { ref?: React.Ref<ListBoxRef> },
) => React.ReactElement | null;

// Re-export public types and the trait key from the canonical location, so consumers
// can `import { LIST_ITEM_KEY, ListBoxProps } from "./ListBox"`.
export {
    LIST_ITEM_KEY,
} from "./types";
export type {
    IListBoxItem,
    ListBoxProps,
    ListBoxRef,
    ListItemRenderContext,
} from "./types";
