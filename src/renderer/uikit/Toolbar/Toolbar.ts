import type { NativeHTMLAttributes } from "../shared/dom-props";

// --- Types ---

export interface ToolbarProps
    extends Omit<
        NativeHTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onKeyDown" | "onFocusCapture" | "children"
    > {
    onKeyDown?: (event: KeyboardEvent) => void;
    onFocusCapture?: (event: FocusEvent) => void;
    /**
     * ToolbarView owns the toolbar root's direct children and may replace them during an update.
     * Callers of an updatable toolbar must provide stable native nodes through this slot.
     */
    children?: NativeHTMLAttributes<HTMLDivElement>["children"];
    orientation?: "horizontal" | "vertical";
    background?: "default" | "light" | "dark";
    borderTop?: boolean;
    borderBottom?: boolean;
    disabled?: boolean;
    "aria-label"?: string;
}

