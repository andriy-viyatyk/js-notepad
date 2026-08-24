import type { CellStyle } from "./types";

/** Apply geometry and the current coordinate produced by the virtual-grid renderer. */
export function applyCellStyle(
    element: HTMLElement,
    style: CellStyle,
    row?: number,
    col?: number,
    columnCount?: number,
): void {
    const s = element.style;
    s.display = style.display;
    s.position = style.position;
    s.left = `${style.left}px`;
    s.top = `${style.top}px`;
    s.width = `${style.width}px`;
    s.height = `${style.height}px`;
    if (row === undefined) element.removeAttribute("data-row");
    else element.setAttribute("data-row", String(row));
    if (col === undefined || columnCount === undefined || columnCount <= 1) {
        element.removeAttribute("data-col");
    } else {
        element.setAttribute("data-col", String(col));
    }
}
