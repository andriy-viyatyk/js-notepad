import { exportToSvg, exportToBlob, convertToExcalidrawElements, FONT_FAMILY } from "@excalidraw/excalidraw";
import type {
    ExcalidrawImperativeAPI,
    AppState,
    BinaryFiles,
} from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import type {
    OrderedExcalidrawElement,
    FileId,
} from "@excalidraw/excalidraw/dist/types/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/dist/types/excalidraw/data/transform";

/**
 * Default position offset for images added to the canvas.
 * Shifts right/down to avoid being covered by Excalidraw's side panel and toolbar.
 */
export const IMAGE_OFFSET_X = 250;
export const IMAGE_OFFSET_Y = 120;

export interface SceneData {
    elements: readonly OrderedExcalidrawElement[];
    appState: Partial<AppState>;
    files: BinaryFiles;
}

function getSceneData(api: ExcalidrawImperativeAPI): SceneData {
    const appState = api.getAppState();
    return {
        elements: api.getSceneElements(),
        appState,
        files: api.getFiles(),
    };
}

function isDarkScene(appState: Partial<AppState>): boolean {
    return appState.theme === "dark";
}

// --- API-based exports (used by DrawView toolbar) ---

export async function exportAsSvgText(api: ExcalidrawImperativeAPI): Promise<string> {
    return exportSceneAsSvgText(getSceneData(api));
}

export async function exportAsPngBlob(api: ExcalidrawImperativeAPI, scale = 2): Promise<Blob> {
    return exportSceneAsPngBlob(getSceneData(api), scale);
}

// --- Scene-data exports (used by facade and API-based wrappers above) ---

export async function exportSceneAsSvgText(scene: SceneData): Promise<string> {
    const dark = isDarkScene(scene.appState);
    const svg = await exportToSvg({
        elements: scene.elements,
        appState: { ...scene.appState, exportBackground: true, exportWithDarkMode: dark },
        files: scene.files,
    });
    return svg.outerHTML;
}

export async function exportSceneAsPngBlob(scene: SceneData, scale = 2): Promise<Blob> {
    const dark = isDarkScene(scene.appState);
    return exportToBlob({
        elements: scene.elements,
        appState: { ...scene.appState, exportBackground: true, exportWithDarkMode: dark, exportScale: scale },
        files: scene.files,
        mimeType: "image/png",
    });
}

// =============================================================================
// Image → Excalidraw JSON (for "Open in Drawing" feature)
// =============================================================================

const MAX_DIMENSION = 1200;

const MIME_MAP: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
};

export function extToMime(ext: string): string {
    return MIME_MAP[ext.toLowerCase()] || "image/png";
}

export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = dataUrl;
    });
}

/** Cap dimensions to maxDim on the longer side, preserving aspect ratio. */
export function capDimensions(width: number, height: number, maxDim = MAX_DIMENSION): { width: number; height: number } {
    const longer = Math.max(width, height);
    if (longer <= maxDim) return { width, height };
    const scale = maxDim / longer;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Build Excalidraw JSON for an image URL: measure it, honor its real MIME
 *  (SVG/JPEG/… embed correctly, not just PNG — a data URL carries it in the
 *  `data:<mime>;…` prefix; fall back to png for a raw non-data URL), embed. */
export async function buildExcalidrawJsonFromDataUrl(dataUrl: string): Promise<string> {
    const dims = await getImageDimensions(dataUrl);
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || "image/png";
    return buildExcalidrawJsonWithImage(dataUrl, mime, dims.width, dims.height);
}

/**
 * Build valid Excalidraw JSON containing a single embedded image.
 * Used by SVG and Image editors to open images in the drawing editor.
 */
export function buildExcalidrawJsonWithImage(
    dataUrl: string,
    mimeType: string,
    naturalWidth: number,
    naturalHeight: number,
): string {
    const fileId = crypto.randomUUID();
    const { width, height } = capDimensions(naturalWidth, naturalHeight);

    const elements = convertToExcalidrawElements([{
        type: "image",
        x: IMAGE_OFFSET_X,
        y: IMAGE_OFFSET_Y,
        width,
        height,
        fileId: fileId as FileId,
        status: "saved",
    } satisfies ExcalidrawElementSkeleton]);

    return JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "persephone",
        elements,
        appState: { currentItemFontFamily: FONT_FAMILY.Helvetica },
        files: {
            [fileId]: {
                id: fileId,
                mimeType,
                dataURL: dataUrl,
                created: Date.now(),
            },
        },
    });
}

// =============================================================================
// Mermaid → Excalidraw JSON (editable elements — "Convert to Excalidraw")
// =============================================================================

/** Minimal view of a mermaid skeleton element for font overriding. */
type MermaidSkeletonFont = {
    type?: string;
    fontFamily?: number;
    label?: { fontFamily?: number };
};

/**
 * Convert Mermaid source into Excalidraw scene JSON containing native,
 * individually-editable elements via `@excalidraw/mermaid-to-excalidraw`.
 *
 * Only flowchart / sequence / class diagrams produce real shapes. For other
 * diagram types the library returns a single rendered image element (no throw)
 * — `imageOnly` flags that so the caller can tell the user it wasn't converted
 * to editable shapes. Throws only when Mermaid fails to parse the source.
 */
export async function buildExcalidrawJsonFromMermaid(
    mermaidSource: string,
): Promise<{ json: string; imageOnly: boolean }> {
    // Dynamic import — keeps `@excalidraw/mermaid-to-excalidraw` (and its
    // bundled mermaid) out of the svg/graph/image editor chunks that also
    // statically import this module; the library loads only on conversion.
    const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
    const { elements: skeleton, files } = await parseMermaidToExcalidraw(mermaidSource, {
        themeVariables: { fontSize: "16px" },
    });

    // The converter applies Excalidraw's hand-drawn font (Excalifont) by
    // default. Override to a clean sans-serif (Helvetica) on the skeleton
    // BEFORE conversion, so `convertToExcalidrawElements` measures text
    // dimensions for the target font and labels don't overflow. Fonts live on
    // standalone text elements (`fontFamily`) and on container / arrow labels
    // (`label.fontFamily`).
    const targetFont = FONT_FAMILY.Helvetica;
    for (const el of skeleton as unknown as MermaidSkeletonFont[]) {
        if (el.type === "text") el.fontFamily = targetFont;
        if (el.label) el.label.fontFamily = targetFont;
    }

    const elements = convertToExcalidrawElements(
        skeleton as unknown as ExcalidrawElementSkeleton[],
    );
    const imageOnly = elements.length > 0 && elements.every((el) => el.type === "image");
    const json = JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "persephone",
        elements,
        appState: { currentItemFontFamily: FONT_FAMILY.Helvetica },
        files: files ?? {},
    });
    return { json, imageOnly };
}
