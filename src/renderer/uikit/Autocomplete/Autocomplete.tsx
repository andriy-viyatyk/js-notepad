import React, { useCallback, useId } from "react";
import styled from "@emotion/styled";
import { useComponentModel } from "../../core/state/model";
import { Input } from "../Input";
import { Popover } from "../Popover";
import { Panel } from "../Panel";
import { Spacer } from "../Spacer";
import { ListBox } from "../ListBox";
import {
    AutocompleteModel,
    AutocompleteProps,
    defaultAutocompleteState,
} from "./AutocompleteModel";

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        width: "100%",
        minWidth: 0,
    },
    { label: "Autocomplete" },
);

// --- Component ---

export function Autocomplete({ ref, ...props }: AutocompleteProps & { ref?: React.Ref<HTMLInputElement> }) {
        const reactId = useId();
        const model = useComponentModel(props, AutocompleteModel, defaultAutocompleteState);
        model.setReactId(reactId);

        const { open, activeIndex } = model.state.use((s) => ({
            open: s.open,
            activeIndex: s.activeIndex,
        }));

        // Merge model.setInputRef with the caller's forwarded ref.
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
            value,
            placeholder,
            disabled,
            readOnly,
            size = "md",
            autoFocus,
            startSlot,
            endSlot,
            width,
            minWidth,
            maxWidth,
            header,
            headerAction,
            emptyMessage,
            "aria-label": ariaLabel,
            "aria-labelledby": ariaLabelledBy,
            // Captured (not forwarded) — model handles via this.props
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            items: _items,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onChange: _onChange,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onSubmit: _onSubmit,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onEscape: _onEscape,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            openOnFocus: _openOnFocus,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            filterMode: _filterMode,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            filter: _filter,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            rowHeight: _rowHeight,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            maxVisibleItems: _maxVisibleItems,
            ...rest
        } = props;

        const { filteredItems } = model.filtered.value;
        const rowHeight = model.rowHeight;
        const maxVisibleItems = model.maxVisibleItems;
        const popoverOpen = open && (filteredItems.length > 0 || emptyMessage != null);

        return (
            <Root
                ref={model.setRootRef}
                data-type="autocomplete"
                data-name={name}
                data-id={model.autocompleteId}
                data-state={open ? "open" : "closed"}
                data-disabled={disabled || undefined}
                data-readonly={readOnly || undefined}
                {...rest}
            >
                <Input
                    ref={setInputRef}
                    size={size}
                    value={value}
                    onChange={model.onInputChange}
                    placeholder={placeholder}
                    disabled={disabled}
                    readOnly={readOnly}
                    autoFocus={autoFocus}
                    onFocus={model.onInputFocus}
                    onClick={model.onInputClick}
                    onKeyDown={model.onInputKeyDown}
                    startSlot={startSlot}
                    endSlot={endSlot}
                    width={width}
                    minWidth={minWidth}
                    maxWidth={maxWidth}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-autocomplete="list"
                    aria-controls={model.listboxId}
                    aria-label={ariaLabel}
                    aria-labelledby={ariaLabelledBy}
                />
                <Popover
                    open={popoverOpen}
                    onClose={model.onPopoverClose}
                    elementRef={model.rootRef}
                    placement="bottom-start"
                    offset={[0, 2]}
                    matchAnchorWidth
                    scroll={false}
                    outsideClickIgnoreSelector={`[data-type="autocomplete"][data-id="${model.autocompleteId}"]`}
                >
                    {header && (
                        <Panel direction="row" align="center" paddingY="sm" paddingX="md">
                            {header}
                            <Spacer />
                            {headerAction}
                        </Panel>
                    )}
                    <ListBox
                        id={model.listboxId}
                        items={filteredItems}
                        activeIndex={activeIndex}
                        onActiveChange={model.onActiveIndexChange}
                        onChange={model.onListChange}
                        rowHeight={rowHeight}
                        growToHeight={maxVisibleItems * rowHeight}
                        emptyMessage={emptyMessage}
                        keyboardNav={false}
                    />
                </Popover>
            </Root>
        );
}

// Re-export public types from canonical location.
export type { AutocompleteProps } from "./AutocompleteModel";
