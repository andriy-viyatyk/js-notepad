import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";

// --- Types ---

export type DotColor =
    | "success"
    | "warning"
    | "error"
    | "info"
    | "neutral"
    | "active";

export interface DotProps
    extends Omit<
        React.HTMLAttributes<HTMLSpanElement>,
        "style" | "className" | "color" | "children"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /**
     * Diameter. Named sizes map to common dot sizes used across the app:
     * xs = 6, sm = 8, md = 12, lg = 18. Pass a number for an exact pixel
     * diameter (e.g. 7, 10, 14). Default: "sm".
     */
    size?: "xs" | "sm" | "md" | "lg" | number;
    /**
     * Fill color. Accepts either a semantic token name resolved against the
     * active theme, or a raw color string (hex, rgb, css var) for user-chosen
     * palette colors.
     */
    color: DotColor | string;
    /**
     * Render a thin border using `color.border.default`. Use to keep an
     * arbitrary fill color visible on dark / light backgrounds. Independent
     * from `selected` — both can be applied.
     */
    bordered?: boolean;
    /**
     * Selection ring. When `true`, draws a 2px `color.text.default` ring
     * around the dot via `box-shadow` (outside the box — no layout shift).
     * Used by color-palette pickers. Independent from `bordered` — both can
     * be applied.
     */
    selected?: boolean;
    /**
     * Sets `data-visibility="parent-hover"` so an ancestor `Panel` with
     * `revealChildrenOnHover` keeps this dot hidden until the panel is hovered or contains
     * keyboard focus. Outside such a panel the prop has no effect.
     */
    hideUntilParentHover?: boolean;
}

// --- Helpers ---

const SIZE_MAP = {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 18,
} as const;

function diameter(size: DotProps["size"]): number {
    if (typeof size === "number") return size;
    return SIZE_MAP[size ?? "sm"];
}

function resolveFill(c: DotColor | string): string {
    switch (c) {
        case "success": return color.success.text;
        case "warning": return color.warning.text;
        case "error":   return color.error.text;
        case "info":    return color.misc.blue;
        case "neutral": return color.text.light;
        case "active":  return color.border.active;
        default:        return c;
    }
}

// --- Styled ---

const Root = styled.span(
    {
        display: "inline-block",
        flexShrink: 0,
        borderRadius: "50%",
        boxSizing: "border-box",
        transition: "box-shadow 0.15s",

        "&[data-clickable]": {
            cursor: "pointer",
        },
        "&[data-clickable]:not([data-selected]):hover": {
            boxShadow: `0 0 0 2px ${color.text.light}`,
        },
    },
    { label: "Dot" },
);

// --- Component ---

export function Dot(props: DotProps) {
    const { name, size = "sm", color: colorProp, bordered, selected, hideUntilParentHover, onClick, ...rest } = props;
    const d = diameter(size);
    const fill = resolveFill(colorProp);
    const clickable = onClick !== undefined;

    const style: React.CSSProperties = {
        width: d,
        height: d,
        backgroundColor: fill,
    };

    if (bordered) {
        style.border = `1px solid ${color.border.default}`;
    }

    if (selected) {
        style.boxShadow = `0 0 0 2px ${color.text.default}`;
    }

    return (
        <Root
            {...rest}
            data-type="dot"
            data-name={name}
            data-clickable={clickable || undefined}
            data-selected={selected || undefined}
            data-bordered={bordered || undefined}
            data-visibility={hideUntilParentHover ? "parent-hover" : undefined}
            onClick={onClick}
            style={style}
        />
    );
}
