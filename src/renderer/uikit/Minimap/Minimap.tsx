import type React from "react";
import { mountVanilla } from "../shared/mount";
import { MinimapView } from "./MinimapView";

export interface MinimapProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;

    /** The scroll container this minimap mirrors and drives. */
    scrollContainer: HTMLElement | null;
}

/** React compatibility face for the framework-free minimap view. */
export function Minimap(props: MinimapProps): React.ReactElement {
    return mountVanilla(MinimapView, props);
}
