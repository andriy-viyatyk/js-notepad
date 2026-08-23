import React from "react";
import { resolvePanelAttributes, type PanelStyleProps } from "./panel-style";

export interface PanelProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className">,
        PanelStyleProps {
    ref?: React.Ref<HTMLDivElement>;
    children?: React.ReactNode;
}

/**
 * Legacy, app-facing React layout shim. New vanilla views should use their own semantic
 * container and stylesheet rather than introducing a vanilla Panel abstraction.
 */
export function Panel({ ref, ...props }: PanelProps) {
    const {
        name,
        direction,
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
        gap,
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

    const attributes = resolvePanelAttributes({
        name,
        direction,
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
        gap,
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
    });

    return (
        <div
            ref={ref}
            data-type="panel"
            data-name={attributes.name}
            data-direction={attributes.direction}
            data-bg={attributes.background || undefined}
            data-border={attributes.border || undefined}
            data-border-top={attributes.borderTop || undefined}
            data-border-bottom={attributes.borderBottom || undefined}
            data-border-left={attributes.borderLeft || undefined}
            data-border-right={attributes.borderRight || undefined}
            data-border-color={attributes.borderColor || undefined}
            data-shadow={attributes.shadow || undefined}
            data-disabled={attributes.disabled || undefined}
            data-dimmed={attributes.dimmed || undefined}
            data-clickable={attributes.clickable || undefined}
            data-hide-when-empty={attributes.hideWhenEmpty || undefined}
            data-reveal-on-hover={attributes.revealOnHover || undefined}
            data-accent={attributes.accent || undefined}
            data-scrollbar={attributes.scrollbar || undefined}
            className={attributes.className}
            {...rest}
            style={attributes.inlineStyle}
        >
            {children}
        </div>
    );
}
