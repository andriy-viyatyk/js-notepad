import type { MarkdownEditor } from "../../editors/markdown";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const MARKDOWN_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "viewMounted", kind: "property", summary: "True if the markdown preview container is mounted in the DOM." },
    { name: "html", kind: "property", summary: "The rendered HTML content from the preview container. Empty if view is not mounted." },
];

const MARKDOWN_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "md-view".
Read-only markdown preview facade.`;

/**
 * Safe facade around MarkdownEditor for script access.
 * Implements the IMarkdownEditor interface from api/types/markdown-editor.d.ts.
 *
 * - `html` reads from the DOM container (rendered by the `hast → DOM` walker)
 * - `viewMounted` indicates whether the container is available
 */
export class MarkdownEditorFacade implements IAiVisible {
    constructor(private readonly editor: MarkdownEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MarkdownEditor",
            summary: "Markdown preview facade.",
            members: MARKDOWN_EDITOR_MEMBERS,
            help: MARKDOWN_EDITOR_HELP,
            summarize: () => ({ kind: "MarkdownEditor", id: this.id, name: this.name, viewMounted: this.viewMounted }),
        };
    }

    get viewMounted(): boolean {
        return this.editor.viewMounted;
    }

    get html(): string {
        return this.editor.containerInnerHtml;
    }
}
