import type { CellStyle } from "./types";

/** Apply the six geometry properties produced by the virtual-grid renderer. */
export function applyCellStyle(element: HTMLElement, style: CellStyle): void {
    const s = element.style;
    s.display = style.display;
    s.position = style.position;
    s.left = `${style.left}px`;
    s.top = `${style.top}px`;
    s.width = `${style.width}px`;
    s.height = `${style.height}px`;
}
