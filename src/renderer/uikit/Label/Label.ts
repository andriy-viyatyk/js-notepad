import type { NativeLabelHTMLAttributes } from "../shared/dom-props";
import type { TextStyleProps } from "../Text/text-style";
import type { SlotContent } from "../shared/fill-slot";

// --- Types ---

export interface LabelProps extends
    Omit<NativeLabelHTMLAttributes<HTMLLabelElement>, "style" | "className" | "color" | "children">,
    TextStyleProps {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Shows a red asterisk after the label text. */
    required?: boolean;
    /** Dims the label. */
    disabled?: boolean;
    children?: SlotContent;
}

