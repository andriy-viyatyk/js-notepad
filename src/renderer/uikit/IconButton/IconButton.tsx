import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { height, radius, spacing } from "../tokens";
import { Tooltip } from "../Tooltip/Tooltip";
import { renderIcon } from "../shared/slots";
import type { IconRef } from "../shared/slots";

// --- Types ---

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling.
     *  Recommended on every IconButton — the `<svg>` child gives no clue about the action. */
    name?: string;
    /**
     * When set, the IconButton is wrapped in a UIKit `<Tooltip>` displaying this content on
     * hover/focus. Especially valuable for IconButtons since they have no visible label to
     * clarify their purpose. When unset, no tooltip is rendered.
     */
    title?: string;
    /** The icon to render. */
    icon: IconRef;
    /** Control size. Default: "md". */
    size?: "sm" | "md";
    /**
     * Visual variant. `"default"` (default) renders a transparent control whose only
     * visible chrome is the icon itself; `active` tints the icon. `"chip"` renders a
     * bordered + backgrounded chip: hover changes the border to active blue and the
     * icon to yellow; the `active` state additionally fills the background with
     * `color.background.light`. Use `"chip"` for toggle groups where the selected
     * member should read as a distinct surface (e.g. effect / mode pickers).
     */
    variant?: "default" | "chip";
    /**
     * Highlighted/toggled state. When true, the icon color is `color.icon.active` and that
     * color overrides the hover/press feedback. Use for toolbar toggles and indicator buttons.
     */
    active?: boolean;
    /**
     * Warning/attention state. When true, the icon is tinted with `color.warning.text` and that
     * color overrides the hover/press feedback. Overrides `active` when both are set. Use for
     * recovery/restart affordances that should draw attention (e.g. a "Restart" control shown
     * only while disconnected).
     */
    warning?: boolean;
    /**
     * Sets `data-visibility="parent-hover"` so an ancestor `Panel` with
     * `revealChildrenOnHover` keeps this button hidden until the panel is hovered or contains
     * keyboard focus. Outside such a panel the prop has no effect.
     */
    hideUntilParentHover?: boolean;
    /**
     * Render a 45° diagonal line over the icon to indicate a toggled-off or
     * disabled-feature state. The line uses `currentColor` so it follows the
     * icon color through default / hover / active / disabled states. Visible
     * regardless of those states; does not block clicks.
     */
    strikethrough?: boolean;
}

// --- Styled ---

const Root = styled.button(
    {
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        border: "none",
        background: "transparent",
        borderRadius: radius.sm,
        outline: "none",
        padding: spacing.xs,
        color: color.icon.light,
        flexShrink: 0,

        "&[data-strikethrough]::after": {
            content: '""',
            position: "absolute",
            top: "50%",
            left: spacing.xs,
            right: spacing.xs,
            height: 1,
            background: "currentColor",
            transform: "rotate(-45deg)",
            pointerEvents: "none",
        },

        "& [data-part='icon']": {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
        },

        "&:hover": {
            color: color.icon.default,
        },
        "&:active": {
            color: color.icon.dark,
        },

        '&[data-size="sm"]': {
            width: height.controlSm,
            height: height.controlSm,
            "& svg": {
                width: height.iconMd,
                height: height.iconMd,
            },
        },
        '&[data-size="md"]': {
            width: height.controlMd,
            height: height.controlMd,
            "& svg": {
                width: height.iconLg,
                height: height.iconLg,
            },
        },

        "&[data-active]": {
            color: color.icon.active,
        },

        // Placed after [data-active] so warning wins on rule order; the component
        // also suppresses data-active when warning is set as a belt-and-braces override.
        "&[data-warning]": {
            color: color.warning.text,
        },

        // Chip variant — bordered + backgrounded toggle chip.
        '&[data-variant="chip"]': {
            border: `1px solid ${color.border.default}`,
            backgroundColor: color.background.dark,
        },
        '&[data-variant="chip"]:hover': {
            borderColor: color.border.active,
            color: color.misc.yellow,
        },
        '&[data-variant="chip"][data-active]': {
            borderColor: color.border.active,
            backgroundColor: color.background.light,
            color: color.misc.yellow,
        },

        "&[data-disabled]": {
            color: color.icon.disabled,
            pointerEvents: "none",
        },
    },
    { label: "IconButton" },
);

// --- Component ---

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton({ name, icon, size = "md", variant = "default", active, warning, disabled, title, hideUntilParentHover, strikethrough, ...rest }, ref) {
        const button = (
            <Root
                ref={ref}
                data-type="icon-button"
                data-name={name}
                data-size={size}
                data-variant={variant}
                data-active={(active && !warning) || undefined}
                data-warning={warning || undefined}
                data-disabled={disabled || undefined}
                data-strikethrough={strikethrough || undefined}
                data-visibility={hideUntilParentHover ? "parent-hover" : undefined}
                disabled={disabled}
                type="button"
                {...rest}
            >
                <span data-part="icon">{renderIcon(icon)}</span>
            </Root>
        );
        return title ? <Tooltip content={title}>{button}</Tooltip> : button;
    },
);
