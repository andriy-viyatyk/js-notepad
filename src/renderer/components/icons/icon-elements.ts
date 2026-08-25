import type { ReactNode } from "react";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import { createBoardGlyphElement } from "../../editors/board/board-glyph-element";
import { GitIcon, MemoryIcon, BoardIcon, type SvgIconComponent, type SvgIconProps } from "../../theme/icons";
import { DefaultIcon } from "../../theme/language-icons";
import { createIconElement, isIconName, type IconRef } from "../../uikit/shared/slots";
import { MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import { fpExtname, fpBasename } from "../../core/utils/file-path";
import { getHostname, getFaviconPathSync } from "./favicon-cache";
import {
    prepareFileIcon,
    resolveFileIcon,
    subscribeFileIconChanges,
    type FileTypeIconProps,
} from "./LanguageIcon";

/** The result of resolving an editor icon before its remaining React producers migrate. */
export type EditorIconElement =
    | { kind: "element"; element: Element }
    | { kind: "react"; value: ReactNode }
    | null;

function createSvg(icon: SvgIconComponent, props: SvgIconProps = {}): SVGElement {
    const builder = icon.createElement;
    if (!builder) throw new Error("Resolved icon does not expose a DOM builder");
    return builder(props);
}

function createImage(src: string, width: number | string, height: number | string): HTMLImageElement {
    const image = document.createElement("img");
    image.src = src;
    image.style.width = typeof width === "number" ? `${width}px` : width;
    image.style.height = typeof height === "number" ? `${height}px` : height;
    return image;
}

/** Create the actual SVG/IMG element for the existing file-icon precedence chain. */
export function createFileTypeIconElement(
    props: FileTypeIconProps = {},
): Element {
    const { language, fileName, width, height, ...svgProps } = props;
    const resolved = resolveFileIcon(fileName ?? "", language);

    if (resolved.kind === "board") {
        const size = typeof width === "number" ? width : 16;
        return createBoardGlyphElement(resolved.boardRoot, size);
    }

    if (resolved.kind === "component") {
        return createSvg(resolved.Icon, { ...svgProps, width, height });
    }

    if (resolved.kind === "system") {
        return createImage(resolved.url, width ?? 14, height ?? 14);
    }

    const ext = fpExtname(fileName ?? "").toLowerCase();
    if (ext) prepareFileIcon(fileName ?? "");
    return createSvg(DefaultIcon, { ...svgProps, width, height });
}

/** Create a file icon from a path, preserving the basename-only resolution contract. */
export function createFileIconElement(options: {
    path: string;
    width?: number;
    height?: number;
}): Element {
    return createFileTypeIconElement({
        fileName: fpBasename(options.path),
        width: options.width,
        height: options.height,
    });
}

/** Create the legacy folder emoji without introducing a wrapper or an Emotion class. */
export function createFolderIconElement(): HTMLSpanElement {
    const element = document.createElement("span");
    element.style.fontSize = "13px";
    element.style.paddingBottom = "3px";
    element.textContent = "\u{1F4C1}";
    return element;
}

function createFaviconOrFallback(href: string): Element {
    const hostname = getHostname(href);
    const path = getFaviconPathSync(hostname);
    return path
        ? createImage(path, 16, 16)
        : createFileTypeIconElement({ fileName: "page.html", width: 16, height: 16 });
}

function getHttpPathExtension(href: string): string | undefined {
    if (!href.startsWith("http://") && !href.startsWith("https://")) return undefined;
    try {
        return fpExtname(new URL(href).pathname).toLowerCase();
    } catch {
        return undefined;
    }
}

/** Create the direct-DOM equivalent of TreeProviderItemIcon's complete branch order. */
export function createTreeProviderItemIconElement(item: ITreeProviderItem): Element {
    if (item.icon === "git") return createSvg(GitIcon, { width: 16, height: 16 });
    if (item.icon === "mneme") {
        return createSvg(MemoryIcon, { width: 16, height: 16, color: MEMORY_ICON_COLOR });
    }
    if (item.icon === "board") return createSvg(BoardIcon, { width: 16, height: 16 });
    if (item.isDirectory) return createFolderIconElement();

    const httpExt = getHttpPathExtension(item.href);
    if (httpExt !== undefined) {
        return httpExt
            ? createFileTypeIconElement({ fileName: item.title, width: 16, height: 16 })
            : createFaviconOrFallback(item.href);
    }

    return createFileTypeIconElement({ fileName: item.title, width: 16, height: 16 });
}

/**
 * Resolve an editor icon without silently dropping the remaining React-valued producer arm.
 * Registry names and language/file icons are returned as actual DOM elements. Known editor
 * producers that still return React nodes are returned explicitly for a later bridge/consumer
 * migration; no React element internals are inspected here.
 */
export function createEditorIconElement(source: {
    noLanguage?: boolean;
    getIcon?: () => IconRef;
    getIconElement?: () => Element | undefined;
    language?: string;
    title?: string;
}): EditorIconElement {
    const iconElement = source.getIconElement?.();
    if (iconElement) return { kind: "element", element: iconElement };

    if (!source.noLanguage) {
        return {
            kind: "element",
            element: createFileTypeIconElement({ language: source.language ?? "", fileName: source.title }),
        };
    }

    const icon = source.getIcon?.();
    if (!icon) return null;
    if (typeof icon === "string") {
        return isIconName(icon)
            ? { kind: "element", element: createIconElement(icon) }
            : null;
    }
    return { kind: "react", value: icon };
}

/**
 * Subscribe a native owner to file-icon resolution changes. The owner must dispose this handle
 * when the icon is replaced or removed. Favicon readiness remains separately keyed by hostname
 * through `onFaviconReady` in favicon-cache.ts.
 */
export function subscribeFileIconElements(listener: () => void): () => void {
    return subscribeFileIconChanges(listener);
}
