import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { fontSize, height, spacing, radius } from "../tokens";

// --- Types ---

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "size"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Change handler — receives the string value directly, not the event. */
    onChange?: (value: string) => void;
    /** Control height. Default: "md". */
    size?: "sm" | "md";
    /**
     * Visual variant. `"default"` renders the standard chrome (dark background, gray border).
     * `"ghost"` renders transparent background and border at rest, with a gray border on hover
     * and a blue border on focus — for inline-edit fields embedded in list/grid rows. Default:
     * `"default"`.
     */
    variant?: "default" | "ghost";
    /**
     * Text tone. `"default"` uses the theme text colour. `"accent"` paints the input text in
     * `color.misc.blue` — use for inputs whose value carries "filter is active" semantics
     * (search boxes, etc.). Default: `"default"`.
     */
    tone?: "default" | "accent";
    /** Content rendered inside the input chrome, before the text. */
    startSlot?: React.ReactNode;
    /** Content rendered inside the input chrome, after the text. */
    endSlot?: React.ReactNode;
    /** When true, paints a red border (`color.error.border`) — for required/validated
     *  fields whose current value is rejected. Persists through focus. Default: false. */
    invalid?: boolean;
    /** Fixed width — number → px, string passes through. Default: fills parent (100%). */
    width?: number | string;
    /** Minimum width — number → px, string passes through. */
    minWidth?: number | string;
    /** Maximum width — number → px, string passes through. */
    maxWidth?: number | string;
}

// --- Styled ---

const Wrapper = styled.div(
    {
        display: "flex",
        alignItems: "stretch",
        backgroundColor: color.background.dark,
        border: `1px solid ${color.border.light}`,
        borderRadius: radius.md,
        boxSizing: "border-box",
        width: "100%",

        "&:focus-within": {
            borderColor: color.border.active,
        },
        "&[data-readonly]:focus-within": {
            borderColor: color.border.light,
        },

        // Invalid state — red border, kept even on focus (overrides active).
        "&[data-invalid]":              { borderColor: color.error.border },
        "&[data-invalid]:focus-within": { borderColor: color.error.border },

        '&[data-size="sm"]': {
            height: height.controlSm,
        },
        '&[data-size="md"]': {
            height: height.controlMd,
        },

        "&[data-disabled]": {
            opacity: 0.5,
            pointerEvents: "none",
        },

        // Ghost variant — transparent at rest, hover/focus borders only.
        '&[data-variant="ghost"]': {
            backgroundColor: "transparent",
            borderColor: "transparent",
        },
        '&[data-variant="ghost"]:hover':                          { borderColor: color.border.default },
        '&[data-variant="ghost"]:focus-within':                   { borderColor: color.border.active  },
        '&[data-variant="ghost"][data-readonly]:focus-within':    { borderColor: "transparent" },
    },
    { label: "Input" },
);

const Field = styled.input(
    {
        flex: "1 1 auto",
        minWidth: 0,
        backgroundColor: "transparent",
        color: color.text.dark,
        border: "none",
        outline: "none",
        margin: 0,
        height: "100%",
        boxSizing: "border-box",
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: spacing.md,
        paddingRight: spacing.md,

        '&[data-size="sm"]': {
            fontSize: fontSize.sm,
        },
        '&[data-size="md"]': {
            fontSize: fontSize.base,
        },

        '&[data-tone="accent"]': {
            color: color.misc.blue,
        },

        "&[data-has-start]": {
            paddingLeft: 0,
        },
        "&[data-has-end]": {
            paddingRight: 0,
        },

        "&[type='number']:not([data-has-end])": {
            paddingRight: spacing.xs,
        },
        "&[type='number']": {
            "&::-webkit-inner-spin-button": {
                cursor: "pointer",
                background: "transparent",
                opacity: 0.5,
                transition: "opacity 0.15s",
                marginRight: -spacing.xs,
            },
            "&:hover::-webkit-inner-spin-button, &:focus::-webkit-inner-spin-button": {
                opacity: 1,
            },
        },
    },
    { label: "InputField" },
);

const Slot = styled.div(
    {
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        paddingLeft: spacing.sm,
        paddingRight: spacing.sm,
    },
    { label: "InputSlot" },
);

// --- Component ---

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    function Input(
        {
            name, onChange, size = "md", variant = "default", tone = "default",
            disabled, readOnly, startSlot, endSlot, invalid,
            width, minWidth, maxWidth,
            ...rest
        },
        ref,
    ) {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange?.(e.target.value);
        };

        const hasStart = startSlot !== undefined && startSlot !== null && startSlot !== false;
        const hasEnd = endSlot !== undefined && endSlot !== null && endSlot !== false;

        const wrapperStyle: React.CSSProperties = {};
        if (width !== undefined)    wrapperStyle.width = width;
        if (minWidth !== undefined) wrapperStyle.minWidth = minWidth;
        if (maxWidth !== undefined) wrapperStyle.maxWidth = maxWidth;

        return (
            <Wrapper
                data-type="input"
                data-name={name}
                data-size={size}
                data-variant={variant}
                data-tone={tone}
                data-disabled={disabled || undefined}
                data-readonly={readOnly || undefined}
                data-invalid={invalid || undefined}
                style={wrapperStyle}
            >
                {hasStart && <Slot data-part="start-slot">{startSlot}</Slot>}
                <Field
                    ref={ref}
                    data-size={size}
                    data-tone={tone}
                    data-has-start={hasStart || undefined}
                    data-has-end={hasEnd || undefined}
                    disabled={disabled}
                    readOnly={readOnly}
                    onChange={handleChange}
                    {...rest}
                />
                {hasEnd && <Slot data-part="end-slot">{endSlot}</Slot>}
            </Wrapper>
        );
    },
);
