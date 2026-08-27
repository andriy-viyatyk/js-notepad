import type React from "react";
import type { IconRef } from "../shared/slots";
import type { SlotContent } from "../shared/fill-slot";
import type { MenuItem } from "../Menu/types";

// --- Types ---

export interface SplitButtonProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onClick" | "title" | "children"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    /** Primary-region icon. */
    icon: IconRef;
    /** Primary-region tooltip (the default action). */
    title?: string;
    /** Primary-region click — the default action, mirrored by the matching dropdown item. */
    onClick: () => void;
    /** Dropdown items revealed by the caret region. */
    items: MenuItem[];
    /** Disables the primary region (the caret stays usable unless `menuDisabled`). */
    disabled?: boolean;
    /** Disables the caret / dropdown. */
    menuDisabled?: boolean;
    /** Control size — matches IconButton. Default "md". */
    size?: "sm" | "md";
    /** Caret tooltip. Default "More actions". */
    menuTitle?: string;
    /** Optional primary-region label. When provided, the primary renders as a text
     *  `Button` (icon + label); when omitted, it's an icon-only `IconButton`. */
    children?: SlotContent;
}
