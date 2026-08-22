import { createBoardGlyphElement } from "../../editors/board/board-glyph-element";
import { getBoardIconPathSync, resolveBoardIcon } from "../../editors/board/board-icon-cache";
import { SvgIconComponent } from "../../theme/icons";
import { DefaultIcon } from "../../theme/language-icons";
import { resolveFileIcon } from "./LanguageIcon";

const cache = new Map<string, string>();
const componentCache = new WeakMap<SvgIconComponent, Map<number, string>>();

function iconMarkup(icon: SvgIconComponent, size: number): string {
    const builder = icon.createElement;
    if (!builder) throw new Error("Resolved icon does not expose a DOM builder");
    return builder({ width: size, height: size }).outerHTML;
}

export function fileIconMarkup(fileName: string, size = 16): string {
    const resolved = resolveFileIcon(fileName);
    const boardPath = resolved.kind === "board" ? getBoardIconPathSync(resolved.boardRoot) : undefined;
    if (resolved.kind === "component") {
        let sizedCache = componentCache.get(resolved.Icon);
        if (!sizedCache) {
            sizedCache = new Map<number, string>();
            componentCache.set(resolved.Icon, sizedCache);
        }
        const cached = sizedCache.get(size);
        if (cached !== undefined) return cached;
        const markup = iconMarkup(resolved.Icon, size);
        sizedCache.set(size, markup);
        return markup;
    }

    const key = resolved.kind === "board"
            ? `${resolved.kind}:${resolved.boardRoot}:${boardPath ?? "pending"}:${size}`
            : resolved.kind === "system"
                ? `${resolved.kind}:${resolved.url}:${size}`
                : `${resolved.kind}:${size}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let markup: string;
    switch (resolved.kind) {
        case "board": {
            if (!boardPath) void resolveBoardIcon(resolved.boardRoot);
            markup = createBoardGlyphElement(resolved.boardRoot, size).outerHTML;
            break;
        }
        case "system": {
            const image = document.createElement("img");
            image.src = resolved.url;
            image.style.width = `${size}px`;
            image.style.height = `${size}px`;
            markup = image.outerHTML;
            break;
        }
        default:
            markup = iconMarkup(DefaultIcon, size);
            break;
    }
    cache.set(key, markup);
    return markup;
}
