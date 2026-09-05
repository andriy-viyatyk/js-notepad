import type { ImageEditor } from "../../editors/image/ImageEditor";
import { writePngToFile } from "../../editors/shared/image-export";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const IMAGE_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "savePngToFile", kind: "method", signature: "savePngToFile(filePath: string): Promise<string>", summary: "Re-encode the displayed image to PNG (1x scale) and write it to filePath. Parent directories are created as needed. Returns the written path.", caution: "writes a PNG and may overwrite the target" },
];

const IMAGE_EDITOR_HELP = `Obtain via pages[i].asImage() on an image page (\`image-view\`); this facade has no force argument and cannot switch a page to this editor.
Image viewer facade with PNG export.`;

/**
 * Safe facade around ImageEditor for script access.
 * Implements the IImageEditor interface from api/types/image-editor.d.ts.
 *
 * Obtained via `page.asImage()` for image pages. Lets a script (and, through
 * `execute_script`, an agent) write the displayed image to a file as PNG.
 */
export class ImageEditorFacade implements IAiVisible {
    constructor(private readonly editor: ImageEditor) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "ImageEditor",
            summary: "Image viewer facade.",
            members: IMAGE_EDITOR_MEMBERS,
            help: IMAGE_EDITOR_HELP,
            summarize: () => ({ kind: "ImageEditor" }),
        };
    }

    /** Re-encode the image to PNG and write it to `filePath`. Returns the path. */
    savePngToFile(filePath: string): Promise<string> {
        return writePngToFile(this.editor, filePath);
    }
}
