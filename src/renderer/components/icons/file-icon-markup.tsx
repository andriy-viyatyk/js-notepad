import { renderToStaticMarkup } from "react-dom/server";
import { BoardGlyph } from "../../editors/board/BoardGlyph";
import { getBoardIconPathSync, resolveBoardIcon } from "../../editors/board/board-icon-cache";
import { DefaultIcon } from "../../theme/language-icons";
import { resolveFileIcon } from "./LanguageIcon";

const cache = new Map<string, string>();

export function fileIconMarkup(fileName: string, size = 16): string {
    const resolved = resolveFileIcon(fileName);
    const boardPath = resolved.kind === "board" ? getBoardIconPathSync(resolved.boardRoot) : undefined;
    const key = resolved.kind === "component"
        ? `${resolved.kind}:${String(resolved.Icon)}:${size}`
        : resolved.kind === "board"
            ? `${resolved.kind}:${resolved.boardRoot}:${boardPath ?? "pending"}:${size}`
            : resolved.kind === "system"
                ? `${resolved.kind}:${resolved.url}:${size}`
                : `${resolved.kind}:${size}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let markup: string;
    switch (resolved.kind) {
        case "component": markup = renderToStaticMarkup(<resolved.Icon width={size} height={size} />); break;
        case "board":
            if (!boardPath) void resolveBoardIcon(resolved.boardRoot);
            markup = renderToStaticMarkup(<BoardGlyph boardRoot={resolved.boardRoot} size={size} />); break;
        case "system": markup = `<img src="${resolved.url}" style="width:${size}px;height:${size}px">`; break;
        default: markup = renderToStaticMarkup(<DefaultIcon width={size} height={size} />); break;
    }
    cache.set(key, markup);
    return markup;
}
