import React from "react";
import { mountVanilla } from "../shared/mount";
import { LabelView } from "./LabelView";
import type { TextStyleProps } from "../Text/Text";

// --- Types ---

export interface LabelProps extends
    Omit<React.LabelHTMLAttributes<HTMLLabelElement>, "style" | "className" | "color">,
    TextStyleProps {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Shows a red asterisk after the label text. */
    required?: boolean;
    /** Dims the label. */
    disabled?: boolean;
}

export function Label(props: LabelProps): React.ReactElement {
    return mountVanilla(LabelView, props);
}
