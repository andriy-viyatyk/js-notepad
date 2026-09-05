import type { HtmlEditor } from "../../editors/html";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const HTML_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "html", kind: "property", summary: "The HTML source content." },
];

const HTML_EDITOR_HELP = `Obtain via pages[i].asHtml() on an HTML preview page (\`html-view\`); pass true — \`asHtml(true)\` — to switch a compatible page to this editor first.
Read-only HTML preview facade.`;

/**
 * Safe facade around HtmlEditor for script access.
 * Implements the IHtmlEditor interface from api/types/html-editor.d.ts.
 *
 * - Minimal read-only facade — exposes the raw HTML source from the host.
 * - Stays sync; no queue.execute requests.
 */
export class HtmlEditorFacade implements IAiVisible {
    constructor(private readonly editor: HtmlEditor) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "HtmlEditor",
            summary: "HTML preview facade.",
            members: HTML_EDITOR_MEMBERS,
            help: HTML_EDITOR_HELP,
            summarize: () => ({ kind: "HtmlEditor", htmlLength: this.html.length }),
        };
    }

    get html(): string {
        return this.editor.host?.state.get().content ?? "";
    }
}
