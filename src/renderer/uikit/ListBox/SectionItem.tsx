import React, { forwardRef } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { spacing } from "../tokens";

// --- Types ---

export interface SectionItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Stable id (forwarded so callers using aria can wire labelling). */
    id?: string;
    /** Section label. */
    label: string;
}

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        width: "100%",
        boxSizing: "border-box",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: spacing.sm,
        paddingRight: spacing.sm,
        color: color.text.light,
        cursor: "default",
        userSelect: "none",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
    },
    { label: "ListBoxSection" },
);

// --- Component ---

export const SectionItem = forwardRef<HTMLDivElement, SectionItemProps>(function SectionItem(
    { name, id, label, ...rest },
    ref,
) {
    return (
        <Root
            ref={ref}
            id={id}
            data-type="list-section"
            data-name={name}
            role="presentation"
            {...rest}
        >
            {label}
        </Root>
    );
});
