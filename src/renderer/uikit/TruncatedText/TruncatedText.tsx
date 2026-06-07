import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

import { Tooltip } from "../Tooltip/Tooltip";

export interface TruncatedTextProps
    extends Omit<React.HTMLAttributes<HTMLSpanElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Content to render — typically a string, but any React node is supported. When the
     *  rendered width exceeds the visible width, hovering shows the full text in a UIKit
     *  `Tooltip` whose body is selectable and copyable (not the browser's native title). */
    children?: React.ReactNode;
}

const Root = styled.span(
    {
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: "inline-block",
        whiteSpace: "nowrap",
    },
    { label: "TruncatedText" },
);

function getTextFromReactChildren(children: React.ReactNode): string {
    if (typeof children === "string" || typeof children === "number") {
        return String(children);
    }
    if (Array.isArray(children)) {
        return children.map(getTextFromReactChildren).join("");
    }
    if (React.isValidElement(children)) {
        const inner = (children.props as { children?: React.ReactNode }).children;
        if (inner) return getTextFromReactChildren(inner);
    }
    return "";
}

export function TruncatedText({ name, children, ...rest }: TruncatedTextProps) {
    const rootRef = useRef<HTMLSpanElement>(null);
    const [overflow, setOverflow] = useState(false);

    // The UIKit Tooltip decides whether to open synchronously inside its own
    // pointer-enter handler (it reads a `suppressed` flag captured at render
    // time), so — unlike the old native-title approach — overflow must be known
    // *before* the hover. Measure eagerly instead of lazily on mouse-over, but
    // without a per-cell ResizeObserver (this primitive fills every grid cell).
    const measure = useCallback(() => {
        const el = rootRef.current;
        if (!el) return;
        setOverflow(el.scrollWidth > el.offsetWidth);
    }, []);

    // Pre-measure on mount and whenever the content changes — the dominant grid
    // case, since a virtualized cell reused for another row gets new `children`.
    // Fresh cells are therefore correct on the very first hover.
    useLayoutEffect(measure, [measure, children]);

    const text = getTextFromReactChildren(children);

    return (
        <Tooltip name={name} content={overflow && text ? text : null}>
            <Root
                data-type="truncated-text"
                data-name={name}
                ref={rootRef}
                // Re-measure on hover (cheap, hovered cell only) so a column
                // resized without a content change self-heals: the tooltip is
                // correct from the next hover on. Chained by Tooltip's clone.
                onMouseEnter={measure}
                {...rest}
            >
                {children}
            </Root>
        </Tooltip>
    );
}
