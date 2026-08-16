import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { renderIcon } from "../shared/slots";
import type { IconRef } from "../shared/slots";
import { fontSize, radius, spacing } from "../tokens";

// --- Types ---

export interface TagProps
    extends Omit<
        React.HTMLAttributes<HTMLSpanElement>,
        "style" | "className" | "onClick"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Tag label — rendered as the primary content. */
    label: string;
    /** Optional leading element (e.g. a colored dot). */
    icon?: IconRef;
    /** When provided, renders an X button after the label that calls this on click. */
    onRemove?: () => void;
    /** When provided, the tag becomes clickable; fires on body click. */
    onClick?: () => void;
    /** Toggle/selected state — visually filled with `background.selection`. */
    selected?: boolean;
    /** Disabled state — opacity 0.5, pointer-events none. */
    disabled?: boolean;
    /** Visual variant. Default: "filled". */
    variant?: "filled" | "outlined";
    /** Semantic color tone. Default: "default". */
    tone?: "default" | "error" | "warning" | "success";
    /** Size variant. Default: "md". */
    size?: "sm" | "md";
    /** Ellipsize the label when the tag is constrained by a flex parent. Sets
     *  `min-width: 0` so the tag can shrink below its content, and truncates the
     *  label span with an ellipsis. Default: false. */
    truncate?: boolean;
    /** Remove-button visibility. Default: "always". */
    removeAffordance?: "always" | "hover";
    /** Accessible label for the remove button. Default: "Remove tag". */
    removeAriaLabel?: string;
}

// --- Styled ---

const Root = styled.span(
    {
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.xs,
        whiteSpace: "nowrap",
        userSelect: "none",
        borderRadius: radius.sm,
        border: "1px solid transparent",
        color: color.text.default,
        backgroundColor: "transparent",

        '&[data-variant="filled"]': {
            backgroundColor: color.background.light,
            borderColor: color.border.default,
        },
        '&[data-variant="outlined"]': {
            backgroundColor: "transparent",
            borderColor: color.border.default,
        },

        '&[data-tone="error"]': { color: color.error.text },
        '&[data-tone="warning"]': { color: color.warning.text },
        '&[data-tone="success"]': { color: color.success.text },

        '&[data-size="sm"]': {
            fontSize: fontSize.xs,
            padding: "1px 7px",
            minHeight: 18,
        },
        '&[data-size="md"]': {
            fontSize: fontSize.sm,
            padding: "2px 6px",
            minHeight: 22,
        },

        "&[data-selected]": {
            backgroundColor: color.background.selection,
            color: color.text.selection,
            borderColor: color.border.active,
        },

        "&[data-clickable]": {
            cursor: "pointer",
            "&:hover": {
                borderColor: color.border.active,
            },
        },

        "&[data-disabled]": {
            opacity: 0.5,
            pointerEvents: "none",
        },

        "&[data-truncate]": { minWidth: 0 },
        "&[data-truncate] > span": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
        },
    },
    { label: "Tag" },
);

const RemoveButton = styled.button(
    {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        padding: 0,
        marginLeft: spacing.xs,
        marginRight: -1,
        cursor: "pointer",
        color: "inherit",
        opacity: 0.6,
        "& svg": { width: 12, height: 12 },
        "&:hover": { opacity: 1 },
        "&:focus-visible": {
            outline: `1px solid ${color.border.active}`,
            outlineOffset: 1,
        },

        '[data-remove-affordance="hover"] &': {
            opacity: 0,
        },
        '[data-remove-affordance="hover"]:hover &, [data-remove-affordance="hover"]:focus-within &': {
            opacity: 0.6,
            "&:hover": { opacity: 1 },
        },
    },
    { label: "TagRemoveButton" },
);

// --- Component ---

export function Tag({
    name,
    label,
    icon,
    onRemove,
    onClick,
    selected,
    disabled,
    variant = "filled",
    tone = "default",
    size = "md",
    truncate,
    removeAffordance = "always",
    removeAriaLabel = "Remove tag",
    children,
    ...rest
}: TagProps) {
    const handleRemoveClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (!disabled) onRemove?.();
    };

    const handleRootClick = () => {
        if (!disabled) onClick?.();
    };

    return (
        <Root
            data-type="tag"
            data-name={name}
            data-variant={variant}
            data-tone={tone}
            data-size={size}
            data-truncate={truncate || undefined}
            data-disabled={disabled || undefined}
            data-selected={selected || undefined}
            data-clickable={onClick && !disabled ? "" : undefined}
            data-removable={onRemove ? "" : undefined}
            data-remove-affordance={onRemove ? removeAffordance : undefined}
            onClick={onClick ? handleRootClick : undefined}
            {...rest}
        >
            {renderIcon(icon)}
            {label && <span>{label}</span>}
            {children}
            {onRemove && (
                <RemoveButton
                    type="button"
                    aria-label={removeAriaLabel}
                    onClick={handleRemoveClick}
                    disabled={disabled}
                >
                    {renderIcon("close")}
                </RemoveButton>
            )}
        </Root>
    );
}
