import React from "react";
import { mountVanilla } from "../shared/mount";
import { SelectableRowView } from "./SelectableRowView";

export interface SelectableRowProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    ref?: React.Ref<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Never used for styling. */
    name?: string;
    /** True when this row is the current selection. */
    selected?: boolean;
    /** True when this row is the keyboard-active / highlighted row. */
    active?: boolean;
    children: React.ReactNode;
}

export function SelectableRow(props: SelectableRowProps): React.ReactElement {
    return mountVanilla(SelectableRowView, props);
}
