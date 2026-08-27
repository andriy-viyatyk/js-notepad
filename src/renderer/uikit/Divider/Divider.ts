import React from "react";

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Line direction. Default: "horizontal". */
    orientation?: "horizontal" | "vertical";
}
