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
