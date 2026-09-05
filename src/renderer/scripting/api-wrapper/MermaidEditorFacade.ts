import type { MermaidEditor } from "../../editors/mermaid";
import { writePngToFile } from "../../editors/shared/image-export";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import { errMessage } from "../../../shared/utils";

const MERMAID_ELEMENTS = [
    { name: "text-compare-left", purpose: "Compare this page with the left grouped page." },
    { name: "mermaid-theme", purpose: "Toggle the Mermaid preview's light/dark rendering mode." },
    { name: "mermaid-open-draw", purpose: "Open the rendered diagram in the Drawing Editor." },
    { name: "mermaid-convert-excalidraw", purpose: "Convert the Mermaid source to editable Excalidraw shapes." },
    { name: "mermaid-save", purpose: "Save the rendered diagram as a PNG." },
    { name: "mermaid-copy", purpose: "Copy the rendered diagram as a PNG to the clipboard." },
] as const;

const MERMAID_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "svgUrl", kind: "property", summary: "Data URL of the rendered SVG diagram. Empty while loading or on error." },
    { name: "loading", kind: "property", summary: "True while the diagram is being rendered." },
    { name: "error", kind: "property", summary: "Error message if rendering failed. Empty on success." },
    { name: "lightMode", kind: "property", summary: "Whether the Mermaid preview uses light rendering mode." },
    { name: "savePngToFile", kind: "method", signature: "savePngToFile(filePath: string): Promise<string>", summary: "Render the diagram to PNG (1x scale) and write it to filePath. Parent directories are created as needed. Returns the written path. Renders the diagram on demand if it has not been rendered yet.", caution: "writes a PNG and may overwrite the target" },
    { name: "toggleLightMode", kind: "method", signature: "toggleLightMode(): void", summary: "Toggle light rendering mode and schedule a Mermaid re-render.", caution: "changes the rendered preview" },
    { name: "openInDrawingEditor", kind: "method", signature: "openInDrawingEditor(): Promise<void>", summary: "Open the rendered diagram as an image in a new Drawing Editor page.", caution: "opens a new Drawing Editor page" },
    { name: "convertToExcalidraw", kind: "method", signature: "convertToExcalidraw(): Promise<void>", summary: "Convert Mermaid source to an Excalidraw page, falling back to an image when needed.", caution: "opens a new Excalidraw page" },
    { name: "copyImageToClipboard", kind: "method", signature: "copyImageToClipboard(): Promise<void>", summary: "Rasterise the rendered diagram and copy it as a PNG to the clipboard.", caution: "writes rendered image data to the clipboard" },
];

const MERMAID_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "mermaid-view".
Mermaid preview facade with controls text-compare-left, mermaid-theme, mermaid-open-draw,
mermaid-convert-excalidraw, mermaid-save, and mermaid-copy. The Save Image native file dialog is
opened by mermaid-save. mermaid-open-draw opens a Drawing Editor page; conversion opens an
Excalidraw page and can notify when the diagram is image-only or falls back to an image. The
page-tab popup menu exposes Save, Save As..., Rename, Show in File Explorer, Copy File Path,
Decrypt, Encrypt or Change Password, and Make Unencrypted. Rename File, Unsaved Changes, and
password dialogs are transient and are accessed through dialogs. elements.visible reports DOM
presence and layout, not whether a control is enabled; Mermaid export controls remain visible
while disabled during loading or when no SVG exists. Transient menus are accessed through menus.
Reading elements does not activate a page, while highlight activates its page and waits for its
retained slot layout.`;

/**
 * Safe facade around MermaidEditor for script access.
 * Implements the IMermaidEditor interface from api/types/mermaid-editor.d.ts.
 *
 * - svgUrl is the rendered SVG as a data URL (recomputed by the editor's
 *   400 ms debounced render pipeline on host content / lightMode change).
 * - loading/error indicate rendering state.
 * - All reads sync.
 */
export class MermaidEditorFacade implements IAiVisible {
    constructor(private readonly editor: MermaidEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(MERMAID_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "MermaidEditor",
            summary: "Mermaid diagram preview facade.",
            members: [...MERMAID_EDITOR_MEMBERS, ...elements.members],
            help: MERMAID_EDITOR_HELP,
            elements: MERMAID_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "MermaidEditor", id: this.id, name: this.name,
                loading: this.loading,
                error: this.error,
                hasSvg: this.svgUrl.length > 0,
                lightMode: this.lightMode,
            }),
        };
    }

    get svgUrl(): string {
        return this.editor.state.get().svgUrl;
    }

    get loading(): boolean {
        return this.editor.state.get().loading;
    }

    get error(): string {
        return this.editor.state.get().error;
    }

    get lightMode(): boolean {
        return this.editor.state.get().lightMode;
    }

    /** Render the diagram to PNG and write it to `filePath`. Returns the path. */
    async savePngToFile(filePath: string): Promise<string> {
        try {
            return await writePngToFile(this.editor, filePath);
        } catch (error) {
            throw new Error(`Mermaid preview cannot save PNG: ${errMessage(error)}`);
        }
    }

    toggleLightMode(): void {
        this.editor.toggleLightMode();
    }

    openInDrawingEditor(): Promise<void> {
        return this.editor.openInDrawingEditor();
    }

    convertToExcalidraw(): Promise<void> {
        return this.editor.convertToExcalidraw();
    }

    copyImageToClipboard(): Promise<void> {
        return this.editor.copyImageToClipboard();
    }
}
