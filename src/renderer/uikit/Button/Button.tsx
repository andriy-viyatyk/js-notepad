import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { renderIcon } from "../shared/slots";
import type { IconRef } from "../shared/slots";
import { fontSize, height, spacing, gap, radius } from "../tokens";
import { Tooltip } from "../Tooltip/Tooltip";

// --- Types ---

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /**
     * When set, the button is wrapped in a UIKit `<Tooltip>` displaying this content on
     * hover/focus. When unset, no tooltip is rendered and no event handlers are attached.
     */
    title?: string;
    /** Visual style. Default: "default". */
    variant?: "default" | "primary" | "ghost" | "danger" | "link";
    /** Control height. Default: "md". */
    size?: "sm" | "md";
    /** Icon rendered before children. */
    icon?: IconRef;
    /**
     * Parent container background — adjusts hover/active colors so they stay
     * visible against the parent. Affects "default", "ghost", and "link"
     * variants. Default: "default".
     */
    background?: "default" | "light" | "dark";
    /** Stretch to the full width of the parent. */
    block?: boolean;
    /**
     * Sets `data-visibility="parent-hover"` so an ancestor `Panel` with
     * `revealChildrenOnHover` keeps this button hidden until the panel is hovered or contains
     * keyboard focus. Outside such a panel the prop has no effect.
     */
    hideUntilParentHover?: boolean;
}

// --- Styled ---

const Root = styled.button(
    {
        // Adaptive background tokens — overridden by data-bg below.
        // Default assumes parent uses color.background.default.
        "--btn-rest-bg": color.background.default,
        "--btn-hover-bg": color.background.light,
        "--btn-active-bg": color.background.dark,

        '&[data-bg="light"]': {
            "--btn-rest-bg": color.background.light,
            "--btn-hover-bg": color.background.default,
            "--btn-active-bg": color.background.dark,
        },
        '&[data-bg="dark"]': {
            "--btn-rest-bg": color.background.dark,
            "--btn-hover-bg": color.background.default,
            "--btn-active-bg": color.background.light,
        },

        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: gap.md,
        cursor: "pointer",
        border: "1px solid transparent",
        borderRadius: radius.md,
        outline: "none",
        userSelect: "none",
        textWrap: "nowrap",
        fontSize: fontSize.base,
        color: color.text.default,
        backgroundColor: "var(--btn-rest-bg)",

        "&:hover": {
            backgroundColor: "var(--btn-hover-bg)",
        },
        "&:active": {
            backgroundColor: "var(--btn-active-bg)",
        },

        '&[data-variant="primary"]': {
            backgroundColor: color.background.selection,
            color: color.text.selection,
            "&:hover": {
                filter: "brightness(1.1)",
                backgroundColor: color.background.selection,
            },
            "&:active": {
                filter: "brightness(0.9)",
                backgroundColor: color.background.selection,
            },
        },
        '&[data-variant="ghost"]': {
            backgroundColor: "transparent",
            "&:hover": {
                backgroundColor: "var(--btn-hover-bg)",
            },
            "&:active": {
                backgroundColor: "var(--btn-active-bg)",
            },
        },
        '&[data-variant="danger"]': {
            backgroundColor: "transparent",
            color: color.error.text,
            "&:hover": {
                backgroundColor: color.error.background,
            },
            "&:active": {
                backgroundColor: color.error.background,
            },
        },
        '&[data-variant="link"]': {
            backgroundColor: "transparent",
            color: color.misc.blue,
            borderColor: color.border.default,
            "&:hover": {
                backgroundColor: "var(--btn-hover-bg)",
            },
            "&:active": {
                backgroundColor: "var(--btn-active-bg)",
            },
        },

        '&[data-size="sm"]': {
            height: height.controlSm,
            padding: `0 ${spacing.sm}px`,
            fontSize: fontSize.sm,
        },
        '&[data-size="md"]': {
            height: height.controlMd,
            padding: `0 ${spacing.md}px`,
            fontSize: fontSize.base,
        },

        "&[data-disabled]": {
            opacity: 0.4,
            pointerEvents: "none",
        },

        "&[data-block]": {
            display: "flex",
            width: "100%",
        },

        "& svg": {
            width: height.iconMd,
            height: height.iconMd,
        },
    },
    { label: "Button" },
);

// --- Component ---

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    function Button(
        { name, variant = "default", size = "md", background = "default", block, icon, disabled, title, hideUntilParentHover, children, ...rest },
        ref,
    ) {
        const button = (
            <Root
                ref={ref}
                data-type="button"
                data-name={name}
                data-variant={variant}
                data-size={size}
                data-bg={background}
                data-block={block || undefined}
                data-disabled={disabled || undefined}
                data-visibility={hideUntilParentHover ? "parent-hover" : undefined}
                disabled={disabled}
                type="button"
                {...rest}
            >
                {renderIcon(icon)}
                {children}
            </Root>
        );
        return title ? <Tooltip content={title}>{button}</Tooltip> : button;
    },
);
