import type { HtmlEditor } from "../../editors/html";
import { writePngToFile } from "../../editors/shared/image-export";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import { errMessage } from "../../../shared/utils";

const HTML_ELEMENTS = [
    { name: "text-compare-left", purpose: "Compare this page with the left grouped page." },
    { name: "text-show-resources", purpose: "Show extracted HTML resources associated with the text host." },
    { name: "html-copy", purpose: "Copy the captured HTML preview image to the clipboard." },
    { name: "html-more", purpose: "Open the HTML preview's additional image actions." },
] as const;

const HTML_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "html", kind: "property", summary: "The HTML source content." },
    { name: "capturing", kind: "property", summary: "Whether an HTML preview image capture is in progress." },
    { name: "savePngToFile", kind: "method", signature: "savePngToFile(filePath: string): Promise<string>", summary: "Capture the rendered HTML preview and write it as a PNG to filePath.", caution: "writes a PNG and may overwrite the target" },
    { name: "copyImageToClipboard", kind: "method", signature: "copyImageToClipboard(): Promise<void>", summary: "Capture the rendered HTML preview and copy it as a PNG.", caution: "writes rendered image data to the clipboard" },
    { name: "openInImageView", kind: "method", signature: "openInImageView(): Promise<void>", summary: "Capture the rendered HTML preview and open it in a new Image View page.", caution: "opens a new page" },
    { name: "editImage", kind: "method", signature: "editImage(): Promise<void>", summary: "Capture the rendered HTML preview and open it in a new Drawing Editor page.", caution: "opens a new Drawing Editor page" },
];

const HTML_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "html-view".
HTML preview facade with host-chrome controls text-compare-left, text-show-resources, html-copy,
and html-more. The html-image-menu is transient and is opened by html-more; it contains Save as
PNG, Open in Image View, and Edit Image. Save as PNG opens the native Save Image file dialog.
The page-tab popup menu exposes Save, Save As..., Rename, Show in File Explorer, Copy File Path,
Open in Browser, Decrypt, Encrypt or Change Password, and Make Unencrypted. Rename File, Unsaved
Changes, and password dialogs are transient and are accessed through dialogs. elements.visible
reports DOM presence and layout, not whether a capture control is enabled; capture controls remain
visible while capturing is true. Drawing/Excalidraw page actions are opened by the image actions.

HTML preview content is rendered in a sandboxed srcdoc iframe. page.editor.elements reports host-chrome controls only; its selectors stop at the renderer document and do not cross into the iframe. Use the browser automation surface that EPIC-089 will attach to this same page node for DOM inside the preview document. The html property is the source content, not the iframe DOM.`;

/**
 * Safe facade around HtmlEditor for script access.
 * Implements the IHtmlEditor interface from api/types/html-editor.d.ts.
 *
 * - Minimal read-only facade — exposes the raw HTML source from the host.
 * - Stays sync; no queue.execute requests.
 */
export class HtmlEditorFacade implements IAiVisible {
    constructor(private readonly editor: HtmlEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(HTML_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "HtmlEditor",
            summary: "HTML preview facade.",
            members: [...HTML_EDITOR_MEMBERS, ...elements.members],
            help: HTML_EDITOR_HELP,
            elements: HTML_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "HtmlEditor", id: this.id, name: this.name,
                htmlLength: this.html.length,
                capturing: this.capturing,
            }),
        };
    }

    get html(): string {
        return this.editor.host?.state.get().content ?? "";
    }

    get capturing(): boolean {
        return this.editor.state.get().capturing ?? false;
    }

    async savePngToFile(filePath: string): Promise<string> {
        this.requireCaptureIdle();
        try {
            return await writePngToFile(this.editor, filePath);
        } catch (error) {
            throw new Error(`HTML preview cannot save PNG: ${errMessage(error)}`);
        }
    }

    async copyImageToClipboard(): Promise<void> {
        this.requireCaptureIdle();
        await this.editor.copyImageToClipboard();
    }

    async openInImageView(): Promise<void> {
        this.requireCaptureIdle();
        await this.editor.openInImageView();
    }

    async editImage(): Promise<void> {
        this.requireCaptureIdle();
        await this.editor.editImage();
    }

    private requireCaptureIdle(): void {
        if (this.capturing) {
            throw new Error("HTML preview image action is already in progress; wait for capturing to finish.");
        }
    }
}
