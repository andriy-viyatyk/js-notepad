import type React from "react";
import { spacing, gap as gapTokens, radius } from "../tokens";
import "./Panel.css";

export type Size = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
export type PaddingSize = Size | "xxxl";
export type Align = "start" | "center" | "end" | "stretch" | "baseline";
export type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";
export type Direction = "row" | "column" | "row-reverse" | "column-reverse";
export type Overflow = "visible" | "hidden" | "auto" | "scroll";
export type Position = "relative" | "absolute" | "fixed";
export type WhiteSpace = "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";
export type WordBreak = "normal" | "break-all" | "keep-all" | "break-word";

export interface PanelStyleProps {
    name?: string;
    direction?: Direction;
    wrap?: boolean;
    flex?: boolean | number | string;
    shrink?: boolean;
    padding?: PaddingSize;
    paddingX?: PaddingSize;
    paddingY?: PaddingSize;
    paddingTop?: PaddingSize;
    paddingBottom?: PaddingSize;
    paddingLeft?: PaddingSize;
    paddingRight?: PaddingSize;
    gap?: Size;
    align?: Align;
    justify?: Justify;
    alignSelf?: Align;
    width?: number | string;
    height?: number | string;
    maxWidth?: number | string;
    minWidth?: number | string;
    maxHeight?: number | string;
    minHeight?: number | string;
    overflow?: Overflow;
    overflowX?: Overflow;
    overflowY?: Overflow;
    scrollbar?: "auto" | "hidden";
    whiteSpace?: WhiteSpace;
    wordBreak?: WordBreak;
    position?: Position;
    inset?: number | string;
    zIndex?: number;
    top?: number | string;
    right?: number | string;
    bottom?: number | string;
    left?: number | string;
    border?: boolean;
    borderTop?: boolean;
    borderBottom?: boolean;
    borderLeft?: boolean;
    borderRight?: boolean;
    borderColor?: "subtle" | "default" | "active";
    rounded?: Size;
    shadow?: boolean;
    background?: "default" | "light" | "dark" | "overlay";
    disabled?: boolean;
    dimmed?: boolean;
    clickable?: boolean;
    hideWhenEmpty?: boolean;
    revealChildrenOnHover?: boolean;
    accent?: "info" | "warn" | "error" | "success";
}

export interface PanelElementAttributes {
    name?: string;
    direction: Direction;
    background?: PanelStyleProps["background"];
    border?: true;
    borderTop?: true;
    borderBottom?: true;
    borderLeft?: true;
    borderRight?: true;
    borderColor?: PanelStyleProps["borderColor"];
    shadow?: true;
    disabled?: true;
    dimmed?: true;
    clickable?: true;
    hideWhenEmpty?: true;
    revealOnHover?: true;
    accent?: PanelStyleProps["accent"];
    scrollbar?: "hidden";
    className: string;
    inlineStyle: React.CSSProperties;
}

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

function spaceVal(value?: PaddingSize): number | undefined {
    if (value === undefined) return undefined;
    if (value === "none") return 0;
    return spacing[value];
}

function gapVal(value?: Size): number | undefined {
    if (value === undefined) return undefined;
    if (value === "none") return 0;
    return gapTokens[value];
}

function radiusVal(value?: Size): number | string | undefined {
    if (value === undefined) return undefined;
    if (value === "none") return 0;
    return radius[value as keyof typeof radius];
}

function flexVal(value: PanelStyleProps["flex"]): string | undefined {
    if (value === undefined || value === false) return undefined;
    if (value === true) return "1 1 auto";
    if (typeof value === "number") return `${value} 1 auto`;
    return value;
}

function isScrollable(value?: Overflow): boolean {
    return value === "auto" || value === "scroll";
}

function compactStyle(style: React.CSSProperties): React.CSSProperties {
    const out: Record<string, unknown> = {};
    for (const key in style) {
        const value = (style as Record<string, unknown>)[key];
        if (value !== undefined) out[key] = value;
    }
    return out as React.CSSProperties;
}

export function resolvePanelAttributes({
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
}: PanelStyleProps): PanelElementAttributes {
    // Padding specificity: side > axis > all.
    const padTop = paddingTop ?? paddingY ?? padding;
    const padBottom = paddingBottom ?? paddingY ?? padding;
    const padLeft = paddingLeft ?? paddingX ?? padding;
    const padRight = paddingRight ?? paddingX ?? padding;

    // This object deliberately mixes the flex and overflow shorthands with their longhands.
    const inlineStyle: React.CSSProperties = compactStyle({
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
    });

    const scrollable = isScrollable(overflow) || isScrollable(overflowX) || isScrollable(overflowY);
    const hideScrollbar = scrollbar === "hidden";

    return {
        name,
        direction,
        background,
        border: border || undefined,
        borderTop: borderTop || undefined,
        borderBottom: borderBottom || undefined,
        borderLeft: borderLeft || undefined,
        borderRight: borderRight || undefined,
        borderColor,
        shadow: shadow || undefined,
        disabled: disabled || undefined,
        dimmed: dimmed || undefined,
        clickable: clickable || undefined,
        hideWhenEmpty: hideWhenEmpty || undefined,
        revealOnHover: revealChildrenOnHover || undefined,
        accent,
        scrollbar: hideScrollbar ? "hidden" : undefined,
        className: `panel-root${scrollable && !hideScrollbar ? " scroll-container" : ""}`,
        inlineStyle,
    };
}

const STYLE_PROPERTIES: ReadonlyArray<readonly [keyof React.CSSProperties, string]> = [
    ["flex", "flex"],
    ["flexShrink", "flex-shrink"],
    ["flexWrap", "flex-wrap"],
    ["paddingTop", "padding-top"],
    ["paddingBottom", "padding-bottom"],
    ["paddingLeft", "padding-left"],
    ["paddingRight", "padding-right"],
    ["gap", "gap"],
    ["alignItems", "align-items"],
    ["justifyContent", "justify-content"],
    ["alignSelf", "align-self"],
    ["width", "width"],
    ["height", "height"],
    ["maxWidth", "max-width"],
    ["minWidth", "min-width"],
    ["maxHeight", "max-height"],
    ["minHeight", "min-height"],
    ["overflow", "overflow"],
    ["overflowX", "overflow-x"],
    ["overflowY", "overflow-y"],
    ["whiteSpace", "white-space"],
    ["wordBreak", "word-break"],
    ["position", "position"],
    ["inset", "inset"],
    ["zIndex", "z-index"],
    ["top", "top"],
    ["right", "right"],
    ["bottom", "bottom"],
    ["left", "left"],
    ["borderRadius", "border-radius"],
];

const UNITLESS_PROPERTIES = new Set(["flex-shrink", "z-index"]);

function styleValue(property: string, value: string | number): string {
    if (typeof value === "string" || UNITLESS_PROPERTIES.has(property)) return value.toString();
    return value === 0 ? "0" : `${value}px`;
}

export function applyPanelAttributes(
    element: HTMLElement,
    attributes: PanelElementAttributes,
): void {
    element.dataset.type = "panel";
    const dataValues: Record<string, string | boolean | undefined> = {
        name: attributes.name,
        direction: attributes.direction,
        bg: attributes.background,
        border: attributes.border,
        borderTop: attributes.borderTop,
        borderBottom: attributes.borderBottom,
        borderLeft: attributes.borderLeft,
        borderRight: attributes.borderRight,
        borderColor: attributes.borderColor,
        shadow: attributes.shadow,
        disabled: attributes.disabled,
        dimmed: attributes.dimmed,
        clickable: attributes.clickable,
        hideWhenEmpty: attributes.hideWhenEmpty,
        revealOnHover: attributes.revealOnHover,
        accent: attributes.accent,
        scrollbar: attributes.scrollbar,
    };
    for (const [key, value] of Object.entries(dataValues)) {
        if (value === undefined || value === false) delete element.dataset[key];
        else element.dataset[key] = value === true ? "" : value;
    }

    element.className = attributes.className;
    // Clear in a separate pass BEFORE setting anything. `STYLE_PROPERTIES` deliberately mixes
    // shorthands with their own longhands (`flex` with `flex-shrink`; `overflow` with `overflow-x`
    // and `overflow-y`), so clearing inside the setting loop removed components of a shorthand that
    // an earlier iteration had just written: `overflow` was erased outright by the two `overflow-*`
    // removals that follow it, and `flex: 0 0 auto` silently lost its shrink and behaved as
    // `flex-shrink: 1`. Two passes keep both the reset and the shorthand-then-longhand override
    // order that the list encodes.
    for (const [, property] of STYLE_PROPERTIES) element.style.removeProperty(property);
    for (const [key, property] of STYLE_PROPERTIES) {
        const value = attributes.inlineStyle[key];
        if (typeof value === "string" || typeof value === "number") {
            element.style.setProperty(property, styleValue(property, value));
        }
    }
}

export function createPanelElement(
    props: PanelStyleProps,
    children: Node[] = [],
): HTMLDivElement {
    const element = document.createElement("div");
    applyPanelAttributes(element, resolvePanelAttributes(props));
    element.append(...children);
    return element;
}
