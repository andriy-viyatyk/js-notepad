import type React from "react";

// --- Types ---

export interface ToolbarProps
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
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

