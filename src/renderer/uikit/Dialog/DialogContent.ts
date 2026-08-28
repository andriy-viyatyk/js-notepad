import type { ElementRef, NativeHTMLAttributes } from "../shared/dom-props";
import type { SlotContent } from "../shared/fill-slot";
import type { IconRef } from "../shared/slots";

// --- Types ---

export interface DialogContentProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "title" | "children"> {
    ref?: ElementRef<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Title text. */
    title?: string;
    /** Optional leading icon in the header. */
    icon?: IconRef;
    /** Close-X button click. When unset, the X is hidden. */
    onClose?: () => void;
    /** Inline buttons rendered between the title and the close X. */
    headerButtons?: SlotContent;

    /** Sizing — pass through to the root element. Numbers → px. */
    width?: number | string;
    height?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    minHeight?: number | string;
    maxHeight?: number | string;

    children?: SlotContent;
}

