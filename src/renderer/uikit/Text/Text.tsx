import React from "react";
import {
    resolveTextAttributes,
    type TextElementAttributes,
    type TextStyleProps,
} from "./text-style";
import "./Text.css";

export type { TextColor, TextElementAttributes, TextSize, TextStyleProps, TextVariant } from "./text-style";

export interface TextProps extends
    Omit<React.HTMLAttributes<HTMLSpanElement>, "style" | "className" | "color">,
    TextStyleProps {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
}

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
    const textAttributes: TextElementAttributes = resolveTextAttributes({
        variant,
        color: colorProp,
        size,
        italic,
        bold,
        nowrap,
        preWrap,
        truncate,
        align,
        hoverUnderline,
    });
    return (
        <span
            data-type="text"
            data-name={name}
            data-variant={textAttributes.variant}
            data-color={textAttributes.color}
            data-size={textAttributes.size}
            data-bold={textAttributes.bold || undefined}
            data-italic={textAttributes.italic || undefined}
            data-nowrap={textAttributes.nowrap || undefined}
            data-pre-wrap={textAttributes.preWrap || undefined}
            data-truncate={textAttributes.truncate || undefined}
            data-align={textAttributes.align || undefined}
            data-hover-underline={textAttributes.hoverUnderline || undefined}
            style={textAttributes.freeformColor ? { color: textAttributes.freeformColor } : undefined}
            {...rest}
        >
            {children}
        </span>
    );
}
