import type { ElementRef, NativeHTMLAttributes } from "../shared/dom-props";

// --- Types ---

export interface SectionItemProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className"> {
    ref?: ElementRef<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Stable id (forwarded so callers using aria can wire labelling). */
    id?: string;
    /** Section label. */
    label: string;
}

