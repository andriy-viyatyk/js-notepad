import type { NativeHTMLAttributes } from "../shared/dom-props";

export interface MinimapProps
    extends Omit<
        NativeHTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onClick" | "onMouseEnter"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;

    /** The scroll container this minimap mirrors and drives. */
    scrollContainer: HTMLElement | null;
    onClick?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
}
