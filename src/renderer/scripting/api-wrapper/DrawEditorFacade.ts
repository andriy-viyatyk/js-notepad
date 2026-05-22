import type { DrawEditor } from "../../editors/draw";

/**
 * Safe facade around DrawEditor for script access.
 * Implements the IDrawEditor interface from api/types/draw-editor.d.ts.
 *
 * All heavy imports (Excalidraw, drawExport) are dynamic to keep the
 * scripting bundle small — Excalidraw is only loaded when actually needed.
 */
export class DrawEditorFacade {
    constructor(private readonly editor: DrawEditor) {}

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

        const [{ convertToExcalidrawElements }, { getImageDimensions, capDimensions }] =
            await Promise.all([
                import("@excalidraw/excalidraw"),
                import("../../editors/draw/drawExport"),
            ]);

        const dims = await getImageDimensions(dataUrl);
        const fileId = crypto.randomUUID();
        const { width, height } = capDimensions(dims.width, dims.height, options?.maxDimension);

        api.addFiles([{
            id: fileId as any,
            dataURL: dataUrl as any,
            mimeType: "image/png" as any,
            created: Date.now(),
        }]);

        const newElements = convertToExcalidrawElements([{
            type: "image",
            x: options?.x ?? 250,
            y: options?.y ?? 120,
            width,
            height,
            fileId: fileId as any,
            status: "saved",
        } as any]);

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
