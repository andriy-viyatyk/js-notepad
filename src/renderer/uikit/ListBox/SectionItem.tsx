import React from "react";
import { mountVanilla } from "../shared/mount";
import { SectionItemView } from "./SectionItemView";

// --- Types ---

export interface SectionItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    ref?: React.Ref<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Stable id (forwarded so callers using aria can wire labelling). */
    id?: string;
    /** Section label. */
    label: string;
}

// --- Component ---

export function SectionItem(props: SectionItemProps): React.ReactElement {
    return mountVanilla(SectionItemView, props);
}
