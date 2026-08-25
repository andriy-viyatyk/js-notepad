import { mountVanilla } from "../shared/mount";
import { PopoverView, type PopoverViewProps } from "./PopoverView";

/** Public React face for the vanilla Popover implementation. */
export function Popover({ ref, ...props }: PopoverViewProps) {
    return mountVanilla(PopoverView, { ...props, ref });
}

// Re-export public types from canonical location.
export type { PopoverProps, PopoverPosition } from "./PopoverModel";
