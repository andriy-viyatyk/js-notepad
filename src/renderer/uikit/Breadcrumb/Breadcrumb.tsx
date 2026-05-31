import React, { useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { fontSize, spacing } from "../tokens";
import { splitWithSeparators } from "../../core/utils/utils";

// --- Types ---

export interface BreadcrumbProps
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onChange"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    rootLabel: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    separators?: string;
    trailingParentSeparator?: boolean;
    separatorContent?: React.ReactNode;
    size?: "sm" | "md";
    /** When true, the breadcrumb shrinks to fit its container and clips the START (root side)
     *  on overflow, keeping the trailing (current) segment visible. Default: false. */
    clipStart?: boolean;
}

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        alignItems: "center",
        color: color.text.light,

        '&[data-size="sm"]': { fontSize: fontSize.sm },
        '&[data-size="md"]': { fontSize: fontSize.base },

        '& [data-part="separator"]': {
            color: color.text.light,
            userSelect: "none",
            margin: `0 ${spacing.sm}px`,
        },
        '& [data-part="root"], & [data-part="segment"]': {
            cursor: "pointer",
            "&:hover": { color: color.text.default },
        },
        "& [data-current]": {
            color: color.misc.blue,
            cursor: "default",
            "&:hover": { color: color.misc.blue },
        },

        // Clip-start mode — shrink within a flex container and clip the root (start) side on
        // overflow, keeping the trailing segment visible. Children are rendered in reversed DOM
        // order (leaf-first) so `row-reverse` restores the visual root → leaf order while the
        // overflow falls on the left edge.
        "&[data-clip-start]": {
            overflow: "hidden",
            minWidth: 0,
            flexDirection: "row-reverse",
            justifyContent: "flex-start",
            whiteSpace: "nowrap",
        },
        "&[data-clip-start] > span": { flexShrink: 0 },
    },
    { label: "Breadcrumb" },
);

// --- Component ---

export function Breadcrumb({
    name,
    rootLabel,
    value,
    onChange,
    separators = "/\\",
    trailingParentSeparator = false,
    separatorContent = ">",
    size = "md",
    clipStart = false,
    ...rest
}: BreadcrumbProps) {
    const joinSeparator = separators[0];

    const segments = useMemo(() => {
        if (!value) return [];
        return splitWithSeparators(value, separators);
    }, [value, separators]);

    const handleClick = useCallback(
        (index: number) => {
            if (index < 0) {
                onChange("");
                return;
            }
            const path = segments.slice(0, index + 1).join(joinSeparator);
            const isLeaf = index === segments.length - 1;
            const finalPath =
                !isLeaf && trailingParentSeparator
                    ? path + joinSeparator
                    : path;
            onChange(finalPath);
        },
        [segments, onChange, joinSeparator, trailingParentSeparator],
    );

    const rootIsCurrent = segments.length === 0;

    // Build a flat node array so clip-start mode can reverse the DOM order (paired with the
    // `row-reverse` style). Each node is a direct `<span>` child of Root — Fragments would
    // break the `& > span` flex-shrink rule.
    const nodes: React.ReactNode[] = [
        <span
            key="root"
            data-part="root"
            data-current={rootIsCurrent || undefined}
            onClick={rootIsCurrent ? undefined : () => handleClick(-1)}
        >
            {rootLabel}
        </span>,
    ];
    segments.forEach((segment, index) => {
        const isLeaf = index === segments.length - 1;
        nodes.push(
            <span key={`sep-${index}`} data-part="separator">{separatorContent}</span>,
        );
        nodes.push(
            <span
                key={`seg-${index}`}
                data-part="segment"
                data-current={isLeaf || undefined}
                onClick={isLeaf ? undefined : () => handleClick(index)}
            >
                {segment}
            </span>,
        );
    });

    return (
        <Root
            data-type="breadcrumb"
            data-name={name}
            data-size={size}
            data-clip-start={clipStart || undefined}
            {...rest}
        >
            {clipStart ? [...nodes].reverse() : nodes}
        </Root>
    );
}
