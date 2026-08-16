import React, { forwardRef, useCallback, useId } from "react";
import styled from "@emotion/styled";
import { useComponentModel } from "../../core/state/model";
import { Input } from "../Input";
import { IconButton } from "../IconButton";
import { Popover } from "../Popover";
import { MultiListBox } from "../MultiListBox";
import { IListBoxItem } from "../ListBox";
import { renderIcon } from "../shared/slots";
import {
    MultiSelectModel,
    MultiSelectProps,
    defaultMultiSelectState,
} from "./MultiSelectModel";

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        width: "100%",
        minWidth: 0,
    },
    { label: "MultiSelect" },
);

// --- Component ---

function MultiSelectInner<T = IListBoxItem>(
    props: MultiSelectProps<T>,
    ref: React.ForwardedRef<HTMLInputElement>,
) {
    const reactId = useId();
    const model = useComponentModel(
        props,
        MultiSelectModel as unknown as MultiSelectModel<T>,
        defaultMultiSelectState,
    );
    model.setReactId(reactId);

    const { open, popoverResized } = model.state.use((s) => ({
        open: s.open,
        popoverResized: s.popoverResized,
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
        items,
        value,
        onChange,
        placeholder,
        disabled,
        readOnly,
        size = "md",
        filterMode,
        rowHeight,
        maxVisibleItems,
        selectAll,
        selectAllLabel,
        emptyMessage,
        resizable,
        matchAnchorWidth = true,
        width,
        minWidth,
        maxWidth,
        "aria-label": ariaLabel,
        "aria-labelledby": ariaLabelledBy,
        // Captured (not forwarded) — model handles via this.props
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        formatSelection: _formatSelection,
        ...rest
    } = props;

    const displayText = model.displayText.value;

    const rootStyle: React.CSSProperties = {};
    if (width !== undefined) rootStyle.width = width;
    if (minWidth !== undefined) rootStyle.minWidth = minWidth;
    if (maxWidth !== undefined) rootStyle.maxWidth = maxWidth;

    return (
        <Root
            ref={model.setRootRef}
            data-type="multiselect"
            data-name={name}
            data-id={model.multiSelectId}
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
                placeholder={placeholder}
                disabled={disabled}
                readOnly
                onFocus={model.onInputFocus}
                onClick={model.onInputClick}
                onKeyDown={model.onInputKeyDown}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={model.popoverId}
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                endSlot={
                    <IconButton
                        icon={renderIcon(open ? "chevron-up" : "chevron-down")}
                        size="sm"
                        tabIndex={-1}
                        disabled={disabled}
                        onMouseDown={model.onChevronMouseDown}
                        onClick={model.onChevronClick}
                    />
                }
            />
            <Popover
                name="multiselect-popover"
                open={open}
                onClose={model.onPopoverClose}
                elementRef={model.rootRef}
                placement="bottom-start"
                offset={[0, 2]}
                matchAnchorWidth={matchAnchorWidth}
                resizable={resizable}
                onResize={model.onPopoverResize}
                scroll={false}
                outsideClickIgnoreSelector={`[data-type="multiselect"][data-id="${model.multiSelectId}"]`}
            >
                <MultiListBox<T>
                    items={items}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    readOnly={readOnly}
                    filterMode={filterMode}
                    rowHeight={rowHeight}
                    maxVisibleItems={popoverResized ? 999 : maxVisibleItems}
                    selectAll={selectAll}
                    selectAllLabel={selectAllLabel}
                    emptyMessage={emptyMessage}
                    height={popoverResized ? "100%" : undefined}
                />
            </Popover>
        </Root>
    );
}

export const MultiSelect = forwardRef(MultiSelectInner) as <T = IListBoxItem>(
    props: MultiSelectProps<T> & { ref?: React.Ref<HTMLInputElement> },
) => React.ReactElement | null;

// Re-export public types from canonical location.
export type { MultiSelectProps } from "./MultiSelectModel";
