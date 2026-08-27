import type React from "react";
import type { SlotContent } from "../shared/fill-slot";

export interface TruncatedTextProps
    extends Omit<React.HTMLAttributes<HTMLSpanElement>, "style" | "className" | "children"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    children?: SlotContent;
}
