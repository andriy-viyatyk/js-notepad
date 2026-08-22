import { BoardIcon } from "../../theme/icons";
import { getBoardIconPathSync, resolveBoardIcon } from "./board-icon-cache";

/** Create the non-React board glyph used by DOM-owned file-icon surfaces. */
export function createBoardGlyphElement(boardRoot?: string, size = 16): Element {
    const path = getBoardIconPathSync(boardRoot);
    if (path) {
        const image = document.createElement("img");
        image.src = path;
        image.style.width = `${size}px`;
        image.style.height = `${size}px`;
        image.style.objectFit = "contain";
        return image;
    }

    if (boardRoot) void resolveBoardIcon(boardRoot);
    const builder = BoardIcon.createElement;
    if (!builder) throw new Error("BoardIcon does not expose a DOM builder");
    return builder({ width: size, height: size });
}
