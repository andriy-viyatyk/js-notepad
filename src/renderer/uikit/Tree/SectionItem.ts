import type { NativeHTMLAttributes } from "../shared/dom-props";
import type { SlotContent } from "../shared/fill-slot";

// --- Types ---

export interface SectionItemProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Stable id (forwarded so callers using aria can wire labelling). */
    id?: string;
    /** Depth — used to align the section header with sibling tree-items. */
    level: number;
    /** Section label content. The generic Tree item shape may carry a rich label. */
    label: SlotContent;
    /** Indentation step in pixels per level. Default: 16. */
    indentSize?: number;
}

