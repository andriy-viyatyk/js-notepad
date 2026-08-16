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
    /** Depth — used to align the section header with sibling tree-items. */
    level: number;
    /** Section label. Tree source items may carry editor-owned rich labels. */
    label: React.ReactNode;
    /** Indentation step in pixels per level. Default: 16. */
    indentSize?: number;
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
    { label: "TreeSection" },
);

const Indent = styled.div<{ size: number; first: boolean }>(
    ({ size, first }) => ({
        width: size,
        height: "100%",
        flexShrink: 0,
        borderLeft: first ? "none" : `1px solid ${color.border.light}`,
    }),
    { label: "TreeSectionIndent" },
);

// --- Component ---

const defaultIndentSize = 16;

export const SectionItem = forwardRef<HTMLDivElement, SectionItemProps>(function SectionItem(
    { name, id, level, label, indentSize = defaultIndentSize, ...rest },
    ref,
) {
    return (
        <Root
            ref={ref}
            id={id}
            data-type="tree-section"
            data-name={name}
            role="presentation"
            {...rest}
        >
            {Array.from({ length: level }).map((_, i) => (
                <Indent key={i} size={indentSize} first={i === 0} />
            ))}
            {label}
        </Root>
    );
});
