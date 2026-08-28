import type { NativeHTMLAttributes } from "../shared/dom-props";

export interface DividerProps extends NativeHTMLAttributes<HTMLDivElement> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Line direction. Default: "horizontal". */
    orientation?: "horizontal" | "vertical";
}
