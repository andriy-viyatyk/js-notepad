import React from "react";
import { mountVanilla } from "../shared/mount";
import { TagView } from "./TagView";
import type { IconRef } from "../shared/slots";
import type { SlotContent } from "../shared/fill-slot";

// --- Types ---

export interface TagProps
    extends Omit<
        React.HTMLAttributes<HTMLSpanElement>,
        "style" | "className" | "onClick" | "children"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Tag label — rendered as the primary content. */
    label: string;
    /** Optional leading element (e.g. a colored dot). */
    icon?: IconRef;
    /** When provided, renders an X button after the label that calls this on click. */
    onRemove?: () => void;
    /** When provided, the tag becomes clickable; fires on body click. */
    onClick?: () => void;
    /** Toggle/selected state — visually filled with `background.selection`. */
    selected?: boolean;
    /** Disabled state — opacity 0.5, pointer-events none. */
    disabled?: boolean;
    /** Visual variant. Default: "filled". */
    variant?: "filled" | "outlined";
    /** Semantic color tone. Default: "default". */
    tone?: "default" | "error" | "warning" | "success";
    /** Size variant. Default: "md". */
    size?: "sm" | "md";
    /** Ellipsize the label when the tag is constrained by a flex parent. Sets
     *  `min-width: 0` so the tag can shrink below its content, and truncates the
     *  label span with an ellipsis. Default: false. */
    truncate?: boolean;
    /** Remove-button visibility. Default: "always". */
    removeAffordance?: "always" | "hover";
    /** Accessible label for the remove button. Default: "Remove tag". */
    removeAriaLabel?: string;
    children?: SlotContent;
}

export function Tag(props: TagProps): React.ReactElement {
    return mountVanilla(TagView, props);
}
