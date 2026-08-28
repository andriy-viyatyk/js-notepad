import type { NativeHTMLAttributes } from "../shared/dom-props";
import type { SlotContent } from "../shared/fill-slot";

export interface TruncatedTextProps
    extends Omit<NativeHTMLAttributes<HTMLSpanElement>, "style" | "className" | "children"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    children?: SlotContent;
}
