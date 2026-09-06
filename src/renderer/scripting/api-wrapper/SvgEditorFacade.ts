import type { SvgEditor } from "../../editors/svg";
import { writePngToFile } from "../../editors/shared/image-export";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import { errMessage } from "../../../shared/utils";

const SVG_ELEMENTS = [
    { name: "text-compare-left", purpose: "Compare this page with the left grouped page." },
    { name: "svg-open-draw", purpose: "Open the SVG as an image in the Drawing Editor." },
    { name: "svg-save", purpose: "Save a rasterised PNG of the SVG." },
    { name: "svg-copy", purpose: "Copy a rasterised PNG of the SVG to the clipboard." },
] as const;

const SVG_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "viewMounted", kind: "property", summary: "True if the SVG preview content host is attached." },
    { name: "svg", kind: "property", summary: "The SVG source content, or undefined when the rendered view is not mounted." },
    { name: "savePngToFile", kind: "method", signature: "savePngToFile(filePath: string): Promise<string>", summary: "Rasterise the SVG to PNG (1x scale) and write it to filePath. Parent directories are created as needed. Returns the written path.", caution: "writes a PNG and may overwrite the target" },
    { name: "openInDrawingEditor", kind: "method", signature: "openInDrawingEditor(): Promise<void>", summary: "Open the SVG as an image in a new Drawing Editor page.", caution: "opens a new Drawing Editor page" },
    { name: "copyImageToClipboard", kind: "method", signature: "copyImageToClipboard(): Promise<void>", summary: "Rasterise the SVG and copy it as a PNG to the clipboard.", caution: "writes rendered image data to the clipboard" },
];

const SVG_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "svg-view".
SVG preview facade with controls text-compare-left, svg-open-draw, svg-save, and svg-copy. The
Save Image native file dialog is opened by svg-save. The Drawing Editor page is opened by
svg-open-draw. The page-tab popup menu exposes Save, Save As..., Rename, Show in File Explorer,
Copy File Path, Decrypt, Encrypt or Change Password, and Make Unencrypted. Rename File, Unsaved
Changes, and password dialogs are transient and are accessed through dialogs. elements.visible
reports DOM presence and layout, not whether a control is enabled. Mermaid conversion and other
Excalidraw page actions are exposed by the Mermaid editor surface; transient menus and dialogs are
discovered through menus and dialogs. Reading elements does not activate a page, while highlight
activates its page and waits for its retained slot layout.`;

/**
 * Safe facade around SvgEditor for script access.
 * Implements the ISvgEditor interface from api/types/svg-editor.d.ts.
 *
 * - Minimal read-only facade — exposes the raw SVG source from the host.
 * - Stays sync; no queue.execute requests.
 */
export class SvgEditorFacade implements IAiVisible {
    constructor(private readonly editor: SvgEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(SVG_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "SvgEditor",
            summary: "SVG preview facade.",
            members: [...SVG_EDITOR_MEMBERS, ...elements.members],
            help: SVG_EDITOR_HELP,
            elements: SVG_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({ kind: "SvgEditor", id: this.id, name: this.name, svgLength: this.svg?.length }),
        };
    }

    get viewMounted(): boolean {
        return this.editor.host !== null;
    }

    get svg(): string | undefined {
        return this.editor.host?.state.get().content;
    }

    /** Render the SVG to PNG and write it to `filePath`. Returns the path. */
    async savePngToFile(filePath: string): Promise<string> {
        try {
            return await writePngToFile(this.editor, filePath);
        } catch (error) {
            throw new Error(`SVG preview cannot save PNG: ${errMessage(error)}`);
        }
    }

    openInDrawingEditor(): Promise<void> {
        return this.editor.openInDrawingEditor();
    }

    copyImageToClipboard(): Promise<void> {
        return this.editor.copyImageToClipboard();
    }
}
