import type { NativeHTMLAttributes } from "../shared/dom-props";

// --- Types ---

export interface ToolbarProps
    extends Omit<
        NativeHTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onKeyDown" | "onFocusCapture"
    > {
    onKeyDown?: (event: KeyboardEvent) => void;
    onFocusCapture?: (event: FocusEvent) => void;
    orientation?: "horizontal" | "vertical";
    background?: "default" | "light" | "dark";
    borderTop?: boolean;
    borderBottom?: boolean;
    disabled?: boolean;
    "aria-label"?: string;
}

