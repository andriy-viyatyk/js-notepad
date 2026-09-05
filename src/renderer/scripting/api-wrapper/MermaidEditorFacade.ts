import type { MermaidEditor } from "../../editors/mermaid";
import { writePngToFile } from "../../editors/shared/image-export";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const MERMAID_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "svgUrl", kind: "property", summary: "Data URL of the rendered SVG diagram. Empty while loading or on error." },
    { name: "loading", kind: "property", summary: "True while the diagram is being rendered." },
    { name: "error", kind: "property", summary: "Error message if rendering failed. Empty on success." },
    { name: "savePngToFile", kind: "method", signature: "savePngToFile(filePath: string): Promise<string>", summary: "Render the diagram to PNG (1x scale) and write it to filePath. Parent directories are created as needed. Returns the written path. Renders the diagram on demand if it has not been rendered yet.", caution: "writes a PNG and may overwrite the target" },
];

const MERMAID_EDITOR_HELP = `Obtain via pages[i].asMermaid() on a Mermaid preview page (\`mermaid-view\`); pass true — \`asMermaid(true)\` — to switch a compatible page to this editor first.
Read-only Mermaid diagram preview facade with PNG export.`;

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
    constructor(private readonly editor: MermaidEditor) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MermaidEditor",
            summary: "Mermaid diagram preview facade.",
            members: MERMAID_EDITOR_MEMBERS,
            help: MERMAID_EDITOR_HELP,
            summarize: () => ({
                kind: "MermaidEditor",
                loading: this.loading,
                error: this.error,
                hasSvg: this.svgUrl.length > 0,
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

    /** Render the diagram to PNG and write it to `filePath`. Returns the path. */
    savePngToFile(filePath: string): Promise<string> {
        return writePngToFile(this.editor, filePath);
    }
}
