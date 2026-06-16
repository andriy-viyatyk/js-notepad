import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { fontSize } from "../tokens";

// --- Types ---

export type TextVariant = "default" | "uppercased" | "link";
export type TextColor =
    | "inherit"
    | "default"
    | "light"
    | "dark"
    | "error"
    | "warning"
    | "success"
    | "primary";
export type TextSize = "xs" | "sm" | "md" | "base" | "lg" | "xl" | "xxl";

export interface TextStyleProps {
    /** Visual variant. "uppercased" applies uppercase + letter-spacing. Default: "default". */
    variant?: TextVariant;
    /**
     * Text colour. A named token (`"error"`, `"primary"`, …) hits the
     * theme-aware `data-color` style rule. A free-form CSS colour string
     * (a theme reference like `color.misc.blue` or
     * `universalColors.http.method.get`) is applied as inline `style.color`,
     * which then wins over `variant="link"`'s primary colour.
     *
     * Pass theme token references only — never literal hex/rgb values.
     * The "No hardcoded colors" CLAUDE.md rule still applies.
     * Default: `"default"`.
     */
    // eslint-disable-next-line @typescript-eslint/ban-types -- `string & {}` preserves IntelliSense for the named TextColor literals without collapsing the union to plain `string`.
    color?: TextColor | (string & {});
    /** Font size from the fontSize token scale. Default: "base". */
    size?: TextSize;
    /** Render text in italic. */
    italic?: boolean;
    /** Render text in bold (font-weight 600). */
    bold?: boolean;
    /** Prevent text wrapping (white-space: nowrap). */
    nowrap?: boolean;
    /** Preserve newlines and wrap on word boundaries (white-space: pre-wrap). Mutually exclusive with `nowrap`. */
    preWrap?: boolean;
    /**
     * Truncate with an ellipsis. Wrap in a flex parent (e.g. `<Panel flex overflow="hidden">`)
     * so the parent can clip — `min-width: 0` on the truncated Text lets it shrink below content size.
     */
    truncate?: boolean;
    /**
     * Text alignment. Forces `display: block` since Text is a span by default and
     * `text-align` on an inline span does not affect wrapped-content layout. Use this
     * when the Text spans multiple lines and you need the wrapped lines aligned.
     */
    align?: "left" | "center" | "right";
    /**
     * Show a pointer cursor and underline the text on hover, **without** applying the
     * `link` variant's primary colour. Use for subtly-clickable text (e.g. a file path that
     * opens in Explorer) that should keep its own colour and not read as a primary link.
     */
    hoverUnderline?: boolean;
}

export interface TextProps extends
    Omit<React.HTMLAttributes<HTMLSpanElement>, "style" | "className" | "color">,
    TextStyleProps {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
}

// --- Styled ---

const Root = styled.span(
    {
        // --- Size ---
        '&[data-size="xs"]':   { fontSize: fontSize.xs },
        '&[data-size="sm"]':   { fontSize: fontSize.sm },
        '&[data-size="md"]':   { fontSize: fontSize.md },
        '&[data-size="base"]': { fontSize: fontSize.base },
        '&[data-size="lg"]':   { fontSize: fontSize.lg },
        '&[data-size="xl"]':   { fontSize: fontSize.xl },
        '&[data-size="xxl"]':  { fontSize: fontSize.xxl },

        // --- Color ---
        '&[data-color="inherit"]': { color: "inherit" },
        '&[data-color="default"]': { color: color.text.default },
        '&[data-color="light"]':   { color: color.text.light },
        '&[data-color="dark"]':    { color: color.text.dark },
        '&[data-color="error"]':   { color: color.error.text },
        '&[data-color="warning"]': { color: color.warning.text },
        '&[data-color="success"]': { color: color.success.text },
        '&[data-color="primary"]': { color: color.primary.text },

        // --- Variant ---
        '&[data-variant="uppercased"]': {
            textTransform: "uppercase",
            letterSpacing: 0.5,
        },
        '&[data-variant="link"]': {
            color: color.primary.text,
            cursor: "pointer",
            textDecoration: "none",
        },
        '&[data-variant="link"]:hover': {
            textDecoration: "underline",
        },
        "&[data-hover-underline]": {
            cursor: "pointer",
            textDecoration: "none",
        },
        "&[data-hover-underline]:hover": {
            textDecoration: "underline",
        },

        // --- Modifiers ---
        "&[data-bold]":     { fontWeight: 600 },
        "&[data-italic]":   { fontStyle: "italic" },
        "&[data-nowrap]":   { whiteSpace: "nowrap" },
        "&[data-pre-wrap]": { whiteSpace: "pre-wrap" },
        "&[data-truncate]": {
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
        },

        // --- Alignment ---
        '&[data-align="left"]':   { textAlign: "left",   display: "block" },
        '&[data-align="center"]': { textAlign: "center", display: "block" },
        '&[data-align="right"]':  { textAlign: "right",  display: "block" },
    },
    { label: "Text" },
);

const NAMED_COLORS: ReadonlySet<string> = new Set<TextColor>([
    "inherit", "default", "light", "dark",
    "error", "warning", "success", "primary",
]);

function isNamedColor(c: string): c is TextColor {
    return NAMED_COLORS.has(c);
}

// --- Component ---

export function Text({
    name,
    variant = "default",
    color: colorProp = "default",
    size = "base",
    italic,
    bold,
    nowrap,
    preWrap,
    truncate,
    align,
    hoverUnderline,
    children,
    ...rest
}: TextProps) {
    const isNamed = isNamedColor(colorProp);
    const style = isNamed ? undefined : { color: colorProp };
    return (
        <Root
            data-type="text"
            data-name={name}
            data-variant={variant}
            data-color={isNamed ? colorProp : undefined}
            data-size={size}
            data-bold={bold || undefined}
            data-italic={italic || undefined}
            data-nowrap={nowrap || undefined}
            data-pre-wrap={preWrap || undefined}
            data-truncate={truncate || undefined}
            data-align={align || undefined}
            data-hover-underline={hoverUnderline || undefined}
            style={style}
            {...rest}
        >
            {children}
        </Root>
    );
}
