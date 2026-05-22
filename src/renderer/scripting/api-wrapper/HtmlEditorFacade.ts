import type { HtmlEditor } from "../../editors/html";

/**
 * Safe facade around HtmlEditor for script access.
 * Implements the IHtmlEditor interface from api/types/html-editor.d.ts.
 *
 * - Minimal read-only facade — exposes the raw HTML source from the host.
 * - Stays sync; no queue.execute requests.
 */
export class HtmlEditorFacade {
    constructor(private readonly editor: HtmlEditor) {}

    get html(): string {
        return this.editor.host?.state.get().content ?? "";
    }
}
