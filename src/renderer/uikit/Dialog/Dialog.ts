import type React from "react";
import type { SlotContent } from "../shared/fill-slot";

// --- Types ---

export type DialogPosition = "center" | "right";

export interface DialogProps
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
        "style" | "className" | "children" | "onKeyDown" | "onClick"
    > {
    onKeyDown?: (event: KeyboardEvent) => void;
    onClick?: (event: MouseEvent) => void;
    ref?: React.Ref<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Where to anchor the dialog body. Default: "center". */
    position?: DialogPosition;
    /** Click on the backdrop (outside the dialog body). */
    onBackdropClick?: () => void;
    /** Auto-focus the first focusable child on mount. Default: true. */
    autoFocus?: boolean;
    children?: SlotContent;
}

