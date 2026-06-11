/**
 * Capability implemented by editors that can export their rendered content as an
 * image (Mermaid preview, SVG preview, Image viewer).
 *
 * Consumed by the editor's "Save as PNG" toolbar action and by its script facade
 * (`savePngToFile`). The implementation is host-independent and headless — it does
 * not require a mounted view, so export works even when the page is not the active
 * tab. The shared helpers in `editors/shared/image-export.ts` do the canvas work.
 */
export interface IImageExport {
    /** Export the rendered content as a PNG blob (natural size, 1× scale). */
    exportPng(): Promise<Blob>;

    /** Suggested file basename, without extension (e.g. "diagram" or the source filename). */
    suggestedImageName(): string;
}
