import type { SvgEditor } from "../../editors/svg";

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
}
