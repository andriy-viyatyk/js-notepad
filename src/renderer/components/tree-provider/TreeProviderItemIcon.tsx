import { useMemo } from "react";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import { FileTypeIcon } from "../icons/LanguageIcon";
import { FolderIcon } from "../icons/FileIcon";
import { GitIcon, MemoryIcon, BoardIcon } from "../../theme/icons";
import { MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import { getFaviconPathSync } from "./favicon-cache";
import { fpExtname } from "../../core/utils/file-path";

/**
 * Resolves the icon for any ITreeProviderItem based on its href and isDirectory.
 *
 * Resolution order:
 * 1. isDirectory → FolderIcon
 * 2. HTTP/HTTPS href with file extension in URL pathname → FileTypeIcon
 * 3. HTTP/HTTPS href without extension → favicon
 * 4. Everything else (local file, archive entry) → FileTypeIcon
 */
export function TreeProviderItemIcon({ item }: { item: ITreeProviderItem }) {
    // Hook must run unconditionally — rules-of-hooks forbids calling it after
    // the `isDirectory` early return.
    const httpExt = useHttpPathExtension(item.href);

    if (item.icon === "git") {
        return <GitIcon width={16} height={16} />;
    }

    if (item.icon === "mneme") {
        return <MemoryIcon width={16} height={16} color={MEMORY_ICON_COLOR} />;
    }

    if (item.icon === "board") {
        return <BoardIcon width={16} height={16} />;
    }

    if (item.isDirectory) {
        return <FolderIcon />;
    }

    if (httpExt !== undefined) {
        // HTTP/HTTPS link
        if (httpExt) {
            // URL has file extension (e.g., /data.json) → file type icon
            return <FileTypeIcon fileName={item.title} width={16} height={16} />;
        }
        // No extension → favicon
        return <FaviconIcon href={item.href} />;
    }

    // Local file or archive entry
    return <FileTypeIcon fileName={item.title} width={16} height={16} />;
}

/**
 * For HTTP/HTTPS URLs, returns the file extension from the pathname.
 * Returns "" if no extension, undefined if not an HTTP URL.
 */
function useHttpPathExtension(href: string): string | undefined {
    return useMemo(() => {
        if (!href.startsWith("http://") && !href.startsWith("https://")) {
            return undefined;
        }
        try {
            return fpExtname(new URL(href).pathname).toLowerCase();
        } catch {
            return undefined;
        }
    }, [href]);
}

/** Renders a cached favicon for an HTTP URL, with DefaultIcon fallback. */
function FaviconIcon({ href }: { href: string }) {
    // No useMemo — getFaviconPathSync is a fast Map lookup, and the result
    // must be re-evaluated on every render so that parent re-renders triggered
    // by useFavicons() version bumps pick up newly cached favicons.
    let src: string | null = null;
    try {
        const hostname = new URL(href).hostname;
        src = getFaviconPathSync(hostname);
    } catch {
        // invalid URL
    }

    if (src) {
        return <img src={src} style={{ width: 16, height: 16 }} />;
    }

    // Fallback for URLs without cached favicon
    return <FileTypeIcon fileName="page.html" width={16} height={16} />;
}
