import { Icon } from "../../uikit/Icon/Icon";
import { getBoardIconPathSync, useBoardIcon } from "./board-icon-cache";

interface BoardGlyphProps {
    /** Absolute board folder path. When it holds an `icon.{svg,png,ico}`, that
     *  image is shown; otherwise the default `BoardIcon` glyph is used. */
    boardRoot?: string;
    size?: number;
}

/**
 * A board's icon (EPIC-034 / US-744) — the board's own `icon.{svg,png,ico}` when
 * present, else the default `BoardIcon` glyph. One component drives all three icon
 * surfaces (tab, main-editor tile, sidebar row) so the fallback is uniform.
 */
export function BoardGlyph({ boardRoot, size = 16 }: BoardGlyphProps) {
    useBoardIcon(boardRoot);
    const path = getBoardIconPathSync(boardRoot);
    if (path) {
        return <img src={path} style={{ width: size, height: size, objectFit: "contain" }} />;
    }
    return <Icon name="board" width={size} height={size} />;
}
