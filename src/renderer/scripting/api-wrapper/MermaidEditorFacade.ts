import type { MermaidEditor } from "../../editors/mermaid";
import { writePngToFile } from "../../editors/shared/image-export";

/**
 * Safe facade around MermaidEditor for script access.
 * Implements the IMermaidEditor interface from api/types/mermaid-editor.d.ts.
 *
 * - svgUrl is the rendered SVG as a data URL (recomputed by the editor's
 *   400 ms debounced render pipeline on host content / lightMode change).
 * - loading/error indicate rendering state.
 * - All reads sync.
 */
export class MermaidEditorFacade {
    constructor(private readonly editor: MermaidEditor) {}

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
