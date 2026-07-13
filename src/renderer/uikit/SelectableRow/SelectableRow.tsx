import React, { forwardRef } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { rowSelectionBase, rowFocusSelectionOverride } from "../shared/selection-style";

// --- Types ---

export interface SelectableRowProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Never used for styling. */
    name?: string;
    /** True when this row is the current selection. */
    selected?: boolean;
    /** True when this row is the keyboard-active / highlighted row. */
    active?: boolean;
    children: React.ReactNode;
}

// --- Styled ---

// Layout-neutral selectable row: paints the shared focus-aware selection (the Explorer look)
// and nothing else. A single child provides the actual layout (a Panel or plain <div>) and defines
// the row's height; give it flex={1}/minWidth={0} where it must stretch. The row is content-height
// (no percentage height — that would blow up inside a plain flex-column list); a virtualized
// consumer sizes its inner content to the grid rowHeight. The blurred base lives on the row; the
// focused blue override matches whenever the row sits inside any focused-within
// [data-focus-selection] ancestor, so the container only needs data-focus-selection + tabIndex=0
// (no Emotion — Rule 7 clean).
const Root = styled.div(
    {
        display: "flex",
        width: "100%",
        boxSizing: "border-box",
        cursor: "pointer",
        color: color.text.default,
        ...rowSelectionBase,
        "&:hover:not([data-selected]):not([data-active])": {
            backgroundColor: color.background.message,
        },
        ...rowFocusSelectionOverride(""),
    },
    { label: "SelectableRow" },
);

// --- Component ---

export const SelectableRow = forwardRef<HTMLDivElement, SelectableRowProps>(
    function SelectableRow({ name, selected, active, children, ...rest }, ref) {
        return (
            <Root
                ref={ref}
                data-type="selectable-row"
                data-name={name}
                data-selected={selected || undefined}
                data-active={active || undefined}
                {...rest}
            >
                {children}
            </Root>
        );
    },
);
