import React, { useCallback, useId } from "react";
import styled from "@emotion/styled";
import { useComponentModel } from "../../core/state/model";
import { Input } from "../Input";
import { IconButton } from "../IconButton";
import { Popover } from "../Popover";
import { ListBox, IListBoxItem } from "../ListBox";
import { renderIcon } from "../shared/slots";
import {
    SelectModel,
    SelectProps,
    defaultSelectState,
} from "./SelectModel";

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        width: "100%",
        minWidth: 0,
    },
    { label: "Select" },
);

// --- Component ---

export function Select<T = IListBoxItem>(
    { ref, ...props }: SelectProps<T> & { ref?: React.Ref<HTMLInputElement> },
) {
    const reactId = useId();
    const model = useComponentModel(
        props,
        SelectModel as unknown as SelectModel<T>,
        defaultSelectState,
    );
    model.setReactId(reactId);

    const { open, activeIndex, popoverResized, searchText, itemsLoading } = model.state.use((s) => ({
        open: s.open,
        activeIndex: s.activeIndex,
        popoverResized: s.popoverResized,
        searchText: s.searchText,
        itemsLoading: s.itemsLoading,
    }));

    // Merge model.setInputRef with the caller's forwarded ref. Pure ref-forwarding glue.
    const setInputRef = useCallback(
        (el: HTMLInputElement | null) => {
            model.setInputRef(el);
            if (typeof ref === "function") ref(el);
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
        },
        [model, ref],
    );

    const {
        name,
        placeholder,
        disabled,
        readOnly,
        size = "md",
        emptyMessage,
        resizable,
        width,
        minWidth,
        maxWidth,
        "aria-label": ariaLabel,
        "aria-labelledby": ariaLabelledBy,
        // Captured (not forwarded) — model handles via this.props
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        items: _items,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        value: _value,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onChange: _onChange,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onItemsLoadError: _onItemsLoadError,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        filterMode: _filterMode,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        filter: _filter,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        maxVisibleItems: _maxVisibleItems,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        rowHeight: _rowHeight,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onEscape: _onEscape,
        ...rest
    } = props;

    const { filteredItems } = model.filtered.value;
    const selectedResolved = model.selectedResolved.value;
    const displayText = model.displayText.value;
    const rowHeight = model.rowHeight;
    const maxVisibleItems = model.maxVisibleItems;

    const rootStyle: React.CSSProperties = {};
    if (width !== undefined)    rootStyle.width = width;
    if (minWidth !== undefined) rootStyle.minWidth = minWidth;
    if (maxWidth !== undefined) rootStyle.maxWidth = maxWidth;

    return (
        <Root
            ref={model.setRootRef}
            data-type="select"
            data-name={name}
            data-id={model.selectId}
            data-state={open ? "open" : "closed"}
            data-disabled={disabled || undefined}
            data-readonly={readOnly || undefined}
            style={Object.keys(rootStyle).length > 0 ? rootStyle : undefined}
            {...rest}
        >
            <Input
                ref={setInputRef}
                size={size}
                value={displayText}
                onChange={model.onInputChange}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                onFocus={model.onInputFocus}
                onClick={model.onInputClick}
                onKeyDown={model.onInputKeyDown}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={model.listboxId}
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                endSlot={
                    <IconButton
                        icon={renderIcon(open ? "chevron-up" : "chevron-down")}
                        size="sm"
                        tabIndex={-1}
                        disabled={disabled || readOnly}
                        onMouseDown={model.onChevronMouseDown}
                        onClick={model.onChevronClick}
                    />
                }
            />
            <Popover
                open={open}
                onClose={model.onPopoverClose}
                elementRef={model.rootRef}
                placement="bottom-start"
                offset={[0, 2]}
                matchAnchorWidth
                resizable={resizable}
                onResize={model.onPopoverResize}
                outsideClickIgnoreSelector={`[data-type="select"][data-id="${model.selectId}"]`}
            >
                <ListBox<IListBoxItem>
                    id={model.listboxId}
                    items={filteredItems}
                    value={selectedResolved ?? null}
                    activeIndex={activeIndex}
                    onActiveChange={model.onActiveIndexChange}
                    onChange={model.onListChange}
                    searchText={searchText}
                    rowHeight={rowHeight}
                    growToHeight={popoverResized ? undefined : maxVisibleItems * rowHeight}
                    loading={itemsLoading}
                    emptyMessage={emptyMessage ?? "no results"}
                />
            </Popover>
        </Root>
    );
}

// Re-export public types from canonical location.
export type { SelectProps, ItemsSource, SelectItemsResult } from "./SelectModel";
