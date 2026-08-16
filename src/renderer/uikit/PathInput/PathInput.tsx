import React, { useCallback } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { spacing } from "../tokens";
import { useComponentModel } from "../../core/state/model";
import { Input } from "../Input";
import { Popover } from "../Popover";
import {
    PathInputModel,
    PathInputProps,
    defaultPathInputState,
} from "./PathInputModel";

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        width: "100%",
        minWidth: 0,
        "&[data-disabled]": { opacity: 0.5, pointerEvents: "none" },
    },
    { label: "PathInput" },
);

const SuggestionRow = styled.div(
    {
        display: "flex",
        alignItems: "center",
        gap: 0,
        height: 24,
        flexShrink: 0,
        paddingLeft: spacing.md,
        paddingRight: spacing.md,
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        color: color.text.default,
        "& [data-part='prefix']": { color: color.text.light },
        "& [data-part='separator']": { color: color.text.light },
        "&[data-active]": {
            backgroundColor: color.background.selection,
            color: color.text.selection,
            "& [data-part='prefix'], & [data-part='separator']": {
                color: color.text.strong,
            },
        },
    },
    { label: "PathInputSuggestionRow" },
);

// --- Component ---

export function PathInput({ ref, ...props }: PathInputProps & { ref?: React.Ref<HTMLInputElement> }) {
    const model = useComponentModel(props, PathInputModel, defaultPathInputState);
    const { open, activeIndex } = model.state.use((s) => ({
        open: s.open,
        activeIndex: s.activeIndex,
    }));

    // Merge the model's input ref with the caller's forwarded ref. This is the only
    // useCallback in the View — pure ref-forwarding glue, not component logic.
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
        separator,
        placeholder,
        autoFocus,
        disabled,
        readOnly,
        size = "md",
        "aria-label": ariaLabel,
        "aria-labelledby": ariaLabelledBy,
        // Capture (don't forward) — model handles these via this.props
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onChange: _onChange,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        paths: _paths,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onBlur: _onBlur,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        maxDepth: _maxDepth,
        ...rest
    } = props;

    const suggestions = model.suggestions.value;

    return (
        <Root
            data-type="path-input"
            data-name={name}
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
                onBlur={model.onInputBlur}
                onKeyDown={model.onInputKeyDown}
                autoComplete="off"
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                aria-haspopup="listbox"
                aria-expanded={open && suggestions.length > 0}
            />
            <Popover
                open={open && suggestions.length > 0}
                onClose={model.onPopoverClose}
                elementRef={model.inputRef}
                placement="bottom-start"
                offset={[0, 2]}
                matchAnchorWidth
                maxHeight={240}
                outsideClickIgnoreSelector='[data-type="path-input"]'
                role="listbox"
            >
                {suggestions.map((s, i) => (
                    <SuggestionRow
                        key={s.path}
                        ref={(el) => {
                            model.setRowRef(i, el);
                        }}
                        role="option"
                        data-active={activeIndex === i || undefined}
                        onMouseDown={model.onRowMouseDown}
                        onClick={() => model.onRowClick(s)}
                        onMouseEnter={() => model.onRowMouseEnter(i)}
                    >
                        {s.matchPrefix && <span data-part="prefix">{s.matchPrefix}</span>}
                        <span data-part="segment">{s.label}</span>
                        {s.isFolder && <span data-part="separator">{separator ?? "/"}</span>}
                    </SuggestionRow>
                ))}
            </Popover>
        </Root>
    );
}

// Re-export the public type from its canonical location (the model file).
export type { PathInputProps } from "./PathInputModel";
