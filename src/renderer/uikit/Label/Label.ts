import type React from "react";
import type { TextStyleProps } from "../Text/Text";
import type { SlotContent } from "../shared/fill-slot";

// --- Types ---

export interface LabelProps extends
    Omit<React.LabelHTMLAttributes<HTMLLabelElement>, "style" | "className" | "color" | "children">,
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

