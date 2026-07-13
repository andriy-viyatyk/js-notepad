import type { CSSObject } from "@emotion/react";
import color from "../../theme/color";

/**
 * Blurred-state row backgrounds for a focus-aware selectable list (the Explorer look
 * when its list is NOT focused). Applied on the ROW element's own styled block via a
 * self-selector spread. The row must carry `data-selected` / `data-active`.
 *
 * Pairs with `focusSelectionOverride`, which adds the focused (`:focus-within`) blue
 * override on the container.
 */
export const rowSelectionBase: CSSObject = {
    "&[data-active]:not([data-selected])": {
        backgroundColor: color.background.message,
    },
    "&[data-selected]": {
        backgroundColor: color.background.light,
    },
};

/**
 * Focused-state override for a focus-aware selectable list (the Explorer look when its
 * list IS focused): selected row → blue background + blue outline; active row → blue
 * outline. Applied on the focusable CONTAINER's styled block.
 *
 * Gated on `data-focus-selection` so it is inert unless the container opts in, and scoped
 * to `rowSelector` (the descendant row element carrying `data-selected` / `data-active`).
 * The container must be focusable (`tabIndex=0`) for `:focus-within` to trigger on click.
 *
 * VS Code mapping: treeSelection = list.activeSelectionBackground,
 * text.selection = list.activeSelectionForeground, border.active = focusBorder.
 */
export function focusSelectionOverride(rowSelector: string): CSSObject {
    return {
        [`&[data-focus-selection]:focus-within ${rowSelector}[data-selected]`]: {
            backgroundColor: color.background.treeSelection,
            color: color.text.selection,
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },
        [`&[data-focus-selection]:focus-within ${rowSelector}[data-active]`]: {
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },
    };
}
