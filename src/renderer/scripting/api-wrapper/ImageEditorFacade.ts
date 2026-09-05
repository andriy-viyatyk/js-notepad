import type { ImageEditor } from "../../editors/image/ImageEditor";
import { writePngToFile } from "../../editors/shared/image-export";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const IMAGE_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "savePngToFile", kind: "method", signature: "savePngToFile(filePath: string): Promise<string>", summary: "Re-encode the displayed image to PNG (1x scale) and write it to filePath. Parent directories are created as needed. Returns the written path.", caution: "writes a PNG and may overwrite the target" },
];

const IMAGE_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to \"image-view\".
Image viewer facade with PNG export.`;

/**
 * Safe facade around ImageEditor for script access.
 * Implements the IImageEditor interface from api/types/image-editor.d.ts.
 *
 * Accessed via `page.editor` after narrowing `page.editor.id` to `image-view`. Lets a script (and, through
 * `execute_script`, an agent) write the displayed image to a file as PNG.
 */
export class ImageEditorFacade implements IAiVisible {
    constructor(private readonly editor: ImageEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "ImageEditor",
            summary: "Image viewer facade.",
            members: IMAGE_EDITOR_MEMBERS,
            help: IMAGE_EDITOR_HELP,
            summarize: () => ({ kind: "ImageEditor", id: this.id, name: this.name }),
        };
    }

    /** Re-encode the image to PNG and write it to `filePath`. Returns the path. */
    savePngToFile(filePath: string): Promise<string> {
        return writePngToFile(this.editor, filePath);
    }
}
