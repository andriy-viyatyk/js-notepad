import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { spacing, gap as gapTokens, radius } from "../tokens";

// --- Types ---

type Size = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
type PaddingSize = Size | "xxxl";

type Align = "start" | "center" | "end" | "stretch" | "baseline";
type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";
type Direction = "row" | "column" | "row-reverse" | "column-reverse";
type Overflow = "visible" | "hidden" | "auto" | "scroll";
type Position = "relative" | "absolute" | "fixed";
type WhiteSpace = "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";
type WordBreak = "normal" | "break-all" | "keep-all" | "break-word";

export interface PanelProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;

    /** Flex direction. Default: "row" (CSS default). */
    direction?: Direction;
    /** Allow children to wrap. Default: false. */
    wrap?: boolean;

    /** Flex shorthand on self. `true` → "1 1 auto"; number → "<n> 1 auto"; string passes through. */
    flex?: boolean | number | string;
    /** Set `flex-shrink: 0` when `false`. Use for sidebars that must keep their fixed width. */
    shrink?: boolean;

    /** Uniform padding. Side-specific props win over `paddingX`/`paddingY` win over `padding`. */
    padding?: PaddingSize;
    paddingX?: PaddingSize;
    paddingY?: PaddingSize;
    paddingTop?: PaddingSize;
    paddingBottom?: PaddingSize;
    paddingLeft?: PaddingSize;
    paddingRight?: PaddingSize;

    /** Gap between children. */
    gap?: Size;

    /** align-items. */
    align?: Align;
    /** justify-content. */
    justify?: Justify;
    /** align-self — overrides parent's `align-items` for this item only. Useful when the parent's alignment doesn't propagate as expected. */
    alignSelf?: Align;

    /** Fixed width/height in px (number) or any CSS length (string, e.g. "50%"). */
    width?: number | string;
    height?: number | string;
    /** Max width — number → px, string passes through (e.g. "100%"). */
    maxWidth?: number | string;
    /** Min width — number → px, string passes through. */
    minWidth?: number | string;
    /** Max height — number → px, string passes through. */
    maxHeight?: number | string;
    /** Min height — number → px, string passes through. */
    minHeight?: number | string;

    overflow?: Overflow;
    overflowX?: Overflow;
    overflowY?: Overflow;

    /**
     * Scrollbar visibility for scrollable panels.
     * - `"auto"` (default) — global VSCode-style fade-in scrollbar via the
     *   `.scroll-container` class.
     * - `"hidden"` — no scrollbar at all. Use when another visual indicator
     *   (minimap, custom thumb) replaces it. Emits `data-scrollbar="hidden"`
     *   and suppresses the `.scroll-container` class so the hover-reveal rule
     *   cannot fight the override.
     */
    scrollbar?: "auto" | "hidden";

    /** Controls whitespace handling for descendants. Use "pre-wrap" for log/code panes that contain real `\n` characters. */
    whiteSpace?: WhiteSpace;

    /** Controls how words break to fit the container. Use "break-word" for log/code panes with long unbreakable tokens (URLs, hashes). */
    wordBreak?: WordBreak;

    /** CSS position. Default: undefined (static). Use "relative" on parents of absolutely-positioned children. */
    position?: Position;
    /** CSS `inset` shorthand — number → px, string passes through. Sets all four sides at once. */
    inset?: number | string;
    /** Stack order. Use sparingly — overlays / popovers only. */
    zIndex?: number;
    /** CSS top — number → px, string passes through (e.g. "auto", "50%"). Use with `position` to anchor an edge. */
    top?: number | string;
    /** CSS right — number → px, string passes through. */
    right?: number | string;
    /** CSS bottom — number → px, string passes through. */
    bottom?: number | string;
    /** CSS left — number → px, string passes through. */
    left?: number | string;

    /** All four borders. */
    border?: boolean;
    borderTop?: boolean;
    borderBottom?: boolean;
    borderLeft?: boolean;
    borderRight?: boolean;
    /** Border color. Default: "subtle" (color.border.light). "default" uses color.border.default. "active" uses color.border.active for selection / active-state cues. */
    borderColor?: "subtle" | "default" | "active";

    /** Border radius from radius scale. */
    rounded?: Size;
    /** Drop shadow (Card-style elevation). */
    shadow?: boolean;
    /** Background fill. Maps to color.background.{default,light,dark,overlay}. */
    background?: "default" | "light" | "dark" | "overlay";

    /** Dim + disable pointer events on the whole panel. */
    disabled?: boolean;
    /**
     * Dim the panel visually (opacity only) without disabling pointer events.
     * Use when a row is in a "disabled but still re-enableable" state — the
     * dim is the visual cue, but a child control (typically a checkbox) must
     * remain clickable. Distinct from `disabled`, which also adds
     * `pointer-events: none`. The two props may coexist.
     */
    dimmed?: boolean;

    /**
     * Mark the panel as a single clickable target (selectable cards / tiles /
     * rows): shows a pointer cursor and a subtle hover background highlight.
     * Cosmetic affordance only — wire the actual handler via `onClick`.
     */
    clickable?: boolean;

    /**
     * Collapse to `display: none` when the panel has no DOM children.
     * Mirrors the legacy `:empty { display: none }` toolbar rule and
     * works with conditional children (`{flag && <Btn/>}` rendering nothing).
     */
    hideWhenEmpty?: boolean;

    /**
     * When `true`, descendant elements with `data-visibility="parent-hover"` start hidden
     * (`opacity: 0`, `pointer-events: none`) and fade in when this Panel is hovered or contains
     * keyboard focus. UIKit primitives expose a typed `hideUntilParentHover` prop that emits
     * the data attribute; plain HTML elements set the attribute directly. Layout-stable —
     * children always reserve their space.
     */
    revealChildrenOnHover?: boolean;

    /**
     * Paints a 3 px left stripe in the corresponding accent colour, used to flag
     * status-tinted rows (log levels, alerts, validation severities). The stripe replaces
     * the regular `borderLeft` for the duration the accent is set — combine with `border`
     * only if you also want the other three sides bordered.
     */
    accent?: "info" | "warn" | "error" | "success";

    children?: React.ReactNode;
}

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        boxSizing: "border-box",
        // flex-direction: row is the CSS default — no rule needed.

        '&[data-direction="column"]':         { flexDirection: "column" },
        '&[data-direction="row-reverse"]':    { flexDirection: "row-reverse" },
        '&[data-direction="column-reverse"]': { flexDirection: "column-reverse" },

        '&[data-bg="default"]': { backgroundColor: color.background.default },
        '&[data-bg="light"]':   { backgroundColor: color.background.light },
        '&[data-bg="dark"]':    { backgroundColor: color.background.dark },
        '&[data-bg="overlay"]': { backgroundColor: color.background.overlay },

        // --- Borders (subtle = color.border.light, default = color.border.default) ---
        "&[data-border]":        { border:       `1px solid ${color.border.light}` },
        "&[data-border-top]":    { borderTop:    `1px solid ${color.border.light}` },
        "&[data-border-bottom]": { borderBottom: `1px solid ${color.border.light}` },
        "&[data-border-left]":   { borderLeft:   `1px solid ${color.border.light}` },
        "&[data-border-right]":  { borderRight:  `1px solid ${color.border.light}` },

        '&[data-border-color="default"]':                          { borderColor: color.border.default },
        '&[data-border-color="default"][data-border-top]':         { borderTopColor: color.border.default },
        '&[data-border-color="default"][data-border-bottom]':      { borderBottomColor: color.border.default },
        '&[data-border-color="default"][data-border-left]':        { borderLeftColor: color.border.default },
        '&[data-border-color="default"][data-border-right]':       { borderRightColor: color.border.default },

        '&[data-border-color="active"]':                          { borderColor: color.border.active },
        '&[data-border-color="active"][data-border-top]':         { borderTopColor: color.border.active },
        '&[data-border-color="active"][data-border-bottom]':      { borderBottomColor: color.border.active },
        '&[data-border-color="active"][data-border-left]':        { borderLeftColor: color.border.active },
        '&[data-border-color="active"][data-border-right]':       { borderRightColor: color.border.active },

        "&[data-shadow]": { boxShadow: `0 2px 8px ${color.shadow.default}` },

        // --- Accent stripe (3 px left border) ---
        '&[data-accent="info"]':    { borderLeft: `3px solid ${color.misc.blue}` },
        '&[data-accent="warn"]':    { borderLeft: `3px solid ${color.misc.yellow}` },
        '&[data-accent="error"]':   { borderLeft: `3px solid ${color.misc.red}` },
        '&[data-accent="success"]': { borderLeft: `3px solid ${color.misc.green}` },

        "&[data-disabled]": {
            opacity: 0.6,
            pointerEvents: "none",
        },

        "&[data-dimmed]": {
            opacity: 0.5,
        },

        "&[data-clickable]": { cursor: "pointer" },
        "&[data-clickable]:hover": { backgroundColor: color.background.light },

        "&[data-hide-when-empty]:empty": { display: "none" },

        // Hover-reveal pattern: descendants tagged with data-visibility="parent-hover"
        // are hidden by default and fade in when this Panel is hovered or contains focus.
        '&[data-reveal-on-hover] [data-visibility="parent-hover"]': {
            opacity: 0,
            pointerEvents: "none",
            transition: "opacity 0.15s",
        },
        '&[data-reveal-on-hover]:hover [data-visibility="parent-hover"], &[data-reveal-on-hover]:focus-within [data-visibility="parent-hover"]': {
            opacity: 1,
            pointerEvents: "auto",
        },
    },
    { label: "Panel" },
);

// --- Token resolvers ---

const ALIGN_MAP: Record<Align, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch",
    baseline: "baseline",
};

const JUSTIFY_MAP: Record<Justify, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    between: "space-between",
    around: "space-around",
    evenly: "space-evenly",
};

function spaceVal(v?: PaddingSize): number | undefined {
    if (v === undefined) return undefined;
    if (v === "none") return 0;
    return spacing[v];
}

function gapVal(v?: Size): number | undefined {
    if (v === undefined) return undefined;
    if (v === "none") return 0;
    return gapTokens[v];
}

function radiusVal(v?: Size): number | string | undefined {
    if (v === undefined) return undefined;
    if (v === "none") return 0;
    return radius[v as keyof typeof radius];
}

function flexVal(v: PanelProps["flex"]): string | undefined {
    if (v === undefined || v === false) return undefined;
    if (v === true) return "1 1 auto";
    if (typeof v === "number") return `${v} 1 auto`;
    return v;
}

function isScrollable(v?: Overflow): boolean {
    return v === "auto" || v === "scroll";
}

// --- Component ---

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(function Panel(
    props,
    ref,
) {
    const {
        name,
        direction = "row",
        wrap,
        flex,
        shrink,
        padding,
        paddingX,
        paddingY,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight,
        gap: gapProp,
        align,
        justify,
        alignSelf,
        width,
        height,
        maxWidth,
        minWidth,
        maxHeight,
        minHeight,
        overflow,
        overflowX,
        overflowY,
        scrollbar,
        whiteSpace,
        wordBreak,
        position,
        inset,
        zIndex,
        top,
        right,
        bottom,
        left,
        border,
        borderTop,
        borderBottom,
        borderLeft,
        borderRight,
        borderColor,
        rounded,
        shadow,
        background,
        disabled,
        dimmed,
        clickable,
        hideWhenEmpty,
        revealChildrenOnHover,
        accent,
        children,
        ...rest
    } = props;

    // Padding specificity: side > axis > all
    const padTop    = paddingTop    ?? paddingY ?? padding;
    const padBottom = paddingBottom ?? paddingY ?? padding;
    const padLeft   = paddingLeft   ?? paddingX ?? padding;
    const padRight  = paddingRight  ?? paddingX ?? padding;

    const inlineStyle: React.CSSProperties = {
        flex: flexVal(flex),
        flexShrink: shrink === false ? 0 : undefined,
        flexWrap: wrap ? "wrap" : undefined,

        paddingTop: spaceVal(padTop),
        paddingBottom: spaceVal(padBottom),
        paddingLeft: spaceVal(padLeft),
        paddingRight: spaceVal(padRight),

        gap: gapVal(gapProp),

        alignItems: align ? ALIGN_MAP[align] : undefined,
        justifyContent: justify ? JUSTIFY_MAP[justify] : undefined,
        alignSelf: alignSelf ? ALIGN_MAP[alignSelf] : undefined,

        width,
        height,
        maxWidth,
        minWidth,
        maxHeight,
        minHeight,
        overflow,
        overflowX,
        overflowY,
        whiteSpace,
        wordBreak,

        position,
        inset,
        zIndex,
        top,
        right,
        bottom,
        left,

        borderRadius: radiusVal(rounded),
    };

    const scrollable =
        isScrollable(overflow) || isScrollable(overflowX) || isScrollable(overflowY);
    const hideScrollbar = scrollbar === "hidden";

    return (
        <Root
            ref={ref}
            data-type="panel"
            data-name={name}
            data-direction={direction}
            data-bg={background || undefined}
            data-border={border || undefined}
            data-border-top={borderTop || undefined}
            data-border-bottom={borderBottom || undefined}
            data-border-left={borderLeft || undefined}
            data-border-right={borderRight || undefined}
            data-border-color={borderColor || undefined}
            data-shadow={shadow || undefined}
            data-disabled={disabled || undefined}
            data-dimmed={dimmed || undefined}
            data-clickable={clickable || undefined}
            data-hide-when-empty={hideWhenEmpty || undefined}
            data-reveal-on-hover={revealChildrenOnHover || undefined}
            data-accent={accent || undefined}
            data-scrollbar={hideScrollbar ? "hidden" : undefined}
            className={scrollable && !hideScrollbar ? "scroll-container" : undefined}
            {...rest}
            style={inlineStyle}
        >
            {children}
        </Root>
    );
});
