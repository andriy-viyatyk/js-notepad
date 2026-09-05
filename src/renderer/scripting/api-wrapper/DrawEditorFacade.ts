import type { DrawEditor } from "../../editors/draw";
import type { MIME_TYPES } from "@excalidraw/excalidraw";
import type { DataURL } from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/dist/types/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/dist/types/excalidraw/data/transform";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const DRAW_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "addImage", kind: "method", signature: "addImage(dataUrl: string, options?: { x?: number; y?: number; maxDimension?: number }): Promise<void>", summary: "Insert an image onto the live canvas. Requires the drawing editor to be mounted (editorIsMounted === true)." },
    { name: "exportAsSvg", kind: "method", signature: "exportAsSvg(): Promise<string>", summary: "Export the drawing as SVG markup string." },
    { name: "exportAsPng", kind: "method", signature: "exportAsPng(options?: { scale?: number }): Promise<string>", summary: "Export the drawing as PNG data URL." },
    { name: "elementCount", kind: "property", summary: "Number of elements on the canvas." },
    { name: "editorIsMounted", kind: "property", summary: "Whether the Excalidraw editor is currently mounted. When true, addImage() works. When false, addImage() throws. Use app.pages.addDrawPage() to create a new page with an image instead." },
];

const DRAW_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "draw-view".
Drawing (Excalidraw) facade for adding images and exporting the canvas.`;

/**
 * Safe facade around DrawEditor for script access.
 * Implements the IDrawEditor interface from api/types/draw-editor.d.ts.
 *
 * All heavy imports (Excalidraw, drawExport) are dynamic to keep the
 * scripting bundle small — Excalidraw is only loaded when actually needed.
 */
export class DrawEditorFacade implements IAiVisible {
    constructor(private readonly editor: DrawEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "DrawEditor",
            summary: "Drawing (Excalidraw) facade.",
            members: DRAW_EDITOR_MEMBERS,
            help: DRAW_EDITOR_HELP,
            summarize: () => ({
                kind: "DrawEditor", id: this.id, name: this.name,
                elementCount: this.elementCount,
                editorIsMounted: this.editorIsMounted,
            }),
        };
    }

    get elementCount(): number {
        return this.editor.elements.length;
    }

    get editorIsMounted(): boolean {
        return this.editor.excalidrawApi !== null;
    }

    async addImage(
        dataUrl: string,
        options?: { x?: number; y?: number; maxDimension?: number },
    ): Promise<void> {
        const api = this.editor.excalidrawApi;
        if (!api) {
            throw new Error(
                "addImage() requires the drawing editor to be mounted. " +
                "Use app.pages.addDrawPage(dataUrl) to create a new page with an image instead.",
            );
        }

        const [
            { convertToExcalidrawElements, MIME_TYPES: mimeTypes },
            { getImageDimensions, capDimensions },
        ] = await Promise.all([
            import("@excalidraw/excalidraw"),
            import("../../editors/draw/drawExport"),
        ]);

        const dims = await getImageDimensions(dataUrl);
        const fileId = crypto.randomUUID();
        const { width, height } = capDimensions(dims.width, dims.height, options?.maxDimension);

        api.addFiles([{
            id: fileId as FileId,
            dataURL: dataUrl as DataURL,
            mimeType: (mimeTypes as typeof MIME_TYPES).png,
            created: Date.now(),
        }]);

        const newElements = convertToExcalidrawElements([{
            type: "image",
            x: options?.x ?? 250,
            y: options?.y ?? 120,
            width,
            height,
            fileId: fileId as FileId,
            status: "saved",
        } satisfies ExcalidrawElementSkeleton]);

        const existing = api.getSceneElements();
        api.updateScene({
            elements: [...existing, ...newElements],
        });
    }

    async exportAsSvg(): Promise<string> {
        const { exportSceneAsSvgText } = await import("../../editors/draw/drawExport");
        return exportSceneAsSvgText({
            elements: this.editor.elements,
            appState: this.editor.appState,
            files: this.editor.files,
        });
    }

    async exportAsPng(options?: { scale?: number }): Promise<string> {
        const { exportSceneAsPngBlob } = await import("../../editors/draw/drawExport");
        const blob = await exportSceneAsPngBlob(
            {
                elements: this.editor.elements,
                appState: this.editor.appState,
                files: this.editor.files,
            },
            options?.scale,
        );
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to convert PNG to data URL"));
            reader.readAsDataURL(blob);
        });
    }
}
