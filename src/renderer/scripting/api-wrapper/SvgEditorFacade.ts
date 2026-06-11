import type { SvgEditor } from "../../editors/svg";
import { writePngToFile } from "../../editors/shared/image-export";

/**
 * Safe facade around SvgEditor for script access.
 * Implements the ISvgEditor interface from api/types/svg-editor.d.ts.
 *
 * - Minimal read-only facade — exposes the raw SVG source from the host.
 * - Stays sync; no queue.execute requests.
 */
export class SvgEditorFacade {
    constructor(private readonly editor: SvgEditor) {}

    get svg(): string {
        return this.editor.host?.state.get().content ?? "";
    }

    /** Render the SVG to PNG and write it to `filePath`. Returns the path. */
    savePngToFile(filePath: string): Promise<string> {
        return writePngToFile(this.editor, filePath);
    }
}
