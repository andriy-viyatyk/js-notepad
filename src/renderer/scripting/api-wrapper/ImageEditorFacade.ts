import type { ImageEditor } from "../../editors/image/ImageEditor";
import { copyImageToClipboard, writePngToFile } from "../../editors/shared/image-export";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";

const IMAGE_ELEMENTS = [
    { name: "image-save", purpose: "Open the image save menu." },
    { name: "image-open-draw", purpose: "Open the current image in the Drawing Editor." },
    { name: "image-copy", purpose: "Copy the rendered image to the clipboard as PNG." },
] as const;

const IMAGE_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "source", kind: "property", summary: "The original image path when available, otherwise its loaded runtime URL; undefined when no image is loaded." },
    { name: "savePngToFile", kind: "method", signature: "savePngToFile(filePath: string): Promise<string>", summary: "Re-encode the displayed image to PNG (1x scale) and write it to filePath. Parent directories are created as needed. Returns the written path.", caution: "writes a PNG and may overwrite the target" },
    { name: "saveAsPng", kind: "method", signature: "saveAsPng(): Promise<void>", summary: "Open the Save Image dialog and save the displayed image as PNG.", caution: "opens a save dialog and writes a PNG" },
    { name: "saveOriginal", kind: "method", signature: "saveOriginal(): Promise<void>", summary: "Open the Save Image dialog and save the original image bytes in their source format.", caution: "opens a save dialog and writes the original image bytes" },
    { name: "openInDrawingEditor", kind: "method", signature: "openInDrawingEditor(): Promise<void>", summary: "Open the current image in a new Drawing Editor page.", caution: "opens a new Drawing Editor page" },
    { name: "copyImageToClipboard", kind: "method", signature: "copyImageToClipboard(): Promise<void>", summary: "Copy the loaded or rasterised image as a PNG to the clipboard.", caution: "writes rendered image data to the clipboard" },
];

const IMAGE_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "image-view".
Image viewer facade with source state, PNG/original export, Drawing Editor, and clipboard actions.
elements is the page-scoped curated inventory of image-save, image-open-draw, and image-copy.
image-save is hidden until an image URL is loaded; when opened, its transient image-save-menu
contains Save as .png and Save original. The save actions use the native Save Image dialog.
image-open-draw opens the current image in the Drawing Editor, and image-copy copies a PNG to the
clipboard. The viewport's zoom, pan, fit, and keyboard gestures are not named facade elements.
Reading elements does not activate a page; highlight activates the owning page and waits for its
layout before drawing.`;

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
        const pageId = this.editor.page?.id;
        const elements = createElements(IMAGE_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "ImageEditor",
            summary: "Image viewer facade.",
            members: [...IMAGE_EDITOR_MEMBERS, ...elements.members],
            help: IMAGE_EDITOR_HELP,
            elements: IMAGE_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({ kind: "ImageEditor", id: this.id, name: this.name }),
        };
    }

    get source(): string | undefined {
        const state = this.editor.state.get();
        return state.filePath || state.url || undefined;
    }

    /** Re-encode the image to PNG and write it to `filePath`. Returns the path. */
    savePngToFile(filePath: string): Promise<string> {
        return writePngToFile(this.editor, filePath);
    }

    saveAsPng(): Promise<void> {
        return this.editor.saveAsPng();
    }

    saveOriginal(): Promise<void> {
        return this.editor.saveOriginal();
    }

    openInDrawingEditor(): Promise<void> {
        return this.editor.openInDrawingEditor();
    }

    copyImageToClipboard(): Promise<void> {
        return copyImageToClipboard(this.editor);
    }
}
