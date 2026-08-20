import React from "react";
import { mountVanilla } from "../shared/mount";
import { DividerView } from "./DividerView";

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Line direction. Default: "horizontal". */
    orientation?: "horizontal" | "vertical";
}

export function Divider(props: DividerProps): React.ReactElement {
    return mountVanilla(DividerView, props);
}
