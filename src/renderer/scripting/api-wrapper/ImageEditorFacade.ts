import type { ImageEditor } from "../../editors/image/ImageEditor";
import { writePngToFile } from "../../editors/shared/image-export";

/**
 * Safe facade around ImageEditor for script access.
 * Implements the IImageEditor interface from api/types/image-editor.d.ts.
 *
 * Obtained via `page.asImage()` for image pages. Lets a script (and, through
 * `execute_script`, an agent) write the displayed image to a file as PNG.
 */
export class ImageEditorFacade {
    constructor(private readonly editor: ImageEditor) {}

    /** Re-encode the image to PNG and write it to `filePath`. Returns the path. */
    savePngToFile(filePath: string): Promise<string> {
        return writePngToFile(this.editor, filePath);
    }
}
