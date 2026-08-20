import React from "react";
import { mountVanilla } from "../shared/mount";
import { InputView } from "./InputView";
import "./Input.css";

// --- Types ---

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "size"> {
    ref?: React.Ref<HTMLInputElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Change handler — receives the string value directly, not the event. */
    onChange?: (value: string) => void;
    /** Control height. Default: "md". */
    size?: "sm" | "md";
    /**
     * Visual variant. `"default"` renders the standard chrome (dark background, gray border).
     * `"ghost"` renders transparent background and border at rest, with a gray border on hover
     * and a blue border on focus — for inline-edit fields embedded in list/grid rows. Default:
     * `"default"`.
     */
    variant?: "default" | "ghost";
    /**
     * Text tone. `"default"` uses the theme text colour. `"accent"` paints the input text in
     * `color.misc.blue` — use for inputs whose value carries "filter is active" semantics
     * (search boxes, etc.). Default: `"default"`.
     */
    tone?: "default" | "accent";
    /** Content rendered inside the input chrome, before the text. */
    startSlot?: React.ReactNode;
    /** Content rendered inside the input chrome, after the text. */
    endSlot?: React.ReactNode;
    /** When true, paints a red border (`color.error.border`) — for required/validated
     *  fields whose current value is rejected. Persists through focus. Default: false. */
    invalid?: boolean;
    /** Fixed width — number → px, string passes through. Default: fills parent (100%). */
    width?: number | string;
    /** Minimum width — number → px, string passes through. */
    minWidth?: number | string;
    /** Maximum width — number → px, string passes through. */
    maxWidth?: number | string;
}

// --- Component ---

export function Input(props: InputProps): React.ReactElement {
    return mountVanilla(InputView, props);
}
